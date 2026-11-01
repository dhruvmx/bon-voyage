"""Exhaustive finite search over candidate paths and open-water and protected transit speeds."""
import math
from .cargo_model import prepared_objective, score_candidate

OPTIMIZER_VERSION = 'deadline-speed-quality-v4'
SPEED_RESOLUTION = .01
PROTECTED_SPEED_RESOLUTION = .1
MIN_PROTECTED_SPEED = 5
HABITAT_REFERENCE_NM = 50
HABITAT_MODEL_VERSION = "absolute-exposure-v1"


def habitat_protection(whale_distance, speed, activity):
    """Fixed exposure baseline prevents open-water detours diluting habitat risk."""
    exposure = whale_distance*(speed/10)**2*activity
    return 100*HABITAT_REFERENCE_NM/(HABITAT_REFERENCE_NM+exposure)


def search_passages(paths, p, outcomes, habitat_assessed):
    objective = prepared_objective(outcomes,habitat_assessed)
    remaining = objective['remaining_hours']
    quality_budgets = [(item['departure_remaining_hours'] - .7*item['effective_shelf_life_hours'], item['effective_shelf_life_hours']) for item in outcomes if item['perishable']]
    expiry_budgets = objective['expiry_budgets']
    weights = objective['weights']
    min_tick = math.ceil(p.min_speed*100-1e-9)
    max_tick = math.floor(p.max_speed*100+1e-9)
    if min_tick>max_tick:
        raise ValueError('Operating speed range must include a speed at 0.01-knot resolution.')
    reference_distance = min(path['distance'] for path in paths)
    reference_fuel = reference_distance/18*p.fuel_per_day/24
    fuel_factor = p.fuel_per_day/(24*18**3)
    best = fastest = cheapest = earliest = unconstrained = None
    best_key = fastest_key = cheapest_key = earliest_key = unconstrained_key = None
    evaluated = feasible_count = 0
    for path in paths:
        open_options = [(tick/100,path['open_distance']/(tick/100),
                         fuel_factor*path['open_distance']*(tick/100)**2)
                        for tick in range(min_tick,max_tick+1)]
        zone_max = min(10,p.max_speed)
        # No-zone paths need only one protected-speed value. Include the exact
        # cap when the vessel limit falls between protected-grid ticks.
        zone_speeds = sorted({MIN_PROTECTED_SPEED + tick/10
            for tick in range(math.floor((zone_max-MIN_PROTECTED_SPEED)*10+1e-9)+1)} | {zone_max}) if path['protected_distance'] else [zone_max]
        for zone_speed in zone_speeds:
            zone_hours = path['protected_distance']/zone_speed
            protection = habitat_protection(path['whale_distance'],zone_speed,p.whale_activity) if habitat_assessed else None
            zone_fuel = fuel_factor*path['protected_distance']*zone_speed**2
            habitat_cost = weights['habitat']*((100-protection)/100) if protection is not None else 0
            for speed,open_hours,open_fuel in open_options:
                hours = zone_hours+open_hours
                fuel = open_fuel+zone_fuel
                # Same bounded objective as score_candidate; materialize its
                # diagnostic dictionaries only for retained candidates.
                freshness = min(1,hours/remaining) if remaining is not None else 0
                score = weights['freshness']*freshness + weights['fuel']*fuel/(fuel+reference_fuel) + habitat_cost
                expired = 0
                for budget,weight in expiry_budgets:
                    if hours>=budget: expired += weight
                quality_shortfall = max((max(0,(hours-budget)/life) for budget,life in quality_budgets),default=0)
                quality_key = (expired,quality_shortfall,score,hours,fuel,path['id'],speed,zone_speed)
                time_key = (hours,fuel,expired,score,path['id'],speed,zone_speed)
                fuel_key = (fuel,expired,score,hours,path['id'],speed,zone_speed)
                evaluated += 1
                feasible = hours<=p.arrival_window+1e-9
                feasible_count += feasible
                improve_unconstrained = unconstrained_key is None or quality_key<unconstrained_key
                improve_earliest = earliest_key is None or time_key<earliest_key
                improve_best = feasible and (best_key is None or quality_key<best_key)
                improve_fastest = feasible and (fastest_key is None or time_key<fastest_key)
                improve_cheapest = feasible and (cheapest_key is None or fuel_key<cheapest_key)
                if not any((improve_unconstrained,improve_earliest,improve_best,improve_fastest,improve_cheapest)): continue
                _,_,breakdown = score_candidate(hours,fuel,protection,reference_fuel,objective)
                candidate = {'path':path,'speed':speed,'hours':hours,'fuel':fuel,
                             'protection':protection,'score':score,'newly_expired_tonnes':expired,
                             'score_breakdown':breakdown,'zone_speed':zone_speed}
                if improve_unconstrained: unconstrained,unconstrained_key=candidate,quality_key
                if improve_earliest: earliest,earliest_key=candidate,time_key
                if improve_best: best,best_key=candidate,quality_key
                if improve_fastest: fastest,fastest_key=candidate,time_key
                if improve_cheapest: cheapest,cheapest_key=candidate,fuel_key
    feasible = best is not None
    choices = {
        'balanced': best if feasible else earliest,
        'direct': fastest if feasible else earliest,
        'eco': cheapest if feasible else earliest,
    }
    return choices, {
        'version':OPTIMIZER_VERSION,'habitat_model_version':HABITAT_MODEL_VERSION,
        'habitat_reference_nm':HABITAT_REFERENCE_NM,'status':'feasible' if feasible else 'infeasible',
        'protected_speed_resolution_knots':PROTECTED_SPEED_RESOLUTION,
        'min_protected_speed':MIN_PROTECTED_SPEED,'max_protected_speed':min(10,p.max_speed),
        'speed_resolution_knots':SPEED_RESOLUTION,'min_speed':min_tick/100,'max_speed':max_tick/100,
        'candidate_paths':len(paths),'evaluated_combinations':evaluated,
        'feasible_combinations':feasible_count,'reference_fuel_tonnes':reference_fuel,
        'earliest_possible_hours':earliest['hours'],
        'deadline_binding':feasible and (best['path']['id'],best['speed'],best['zone_speed'])!=(unconstrained['path']['id'],unconstrained['speed'],unconstrained['zone_speed']),
        'arrival_quality_target_percent':70,
        'scope':'Recommended balance prioritizes avoiding expiry and minimizing worst-item shortfall below 70% modeled quality, then cost. Best among the supplied sea paths at 0.01-knot open-water and 0.1-knot protected-speed resolution (including the exact protected cap).',
    }
