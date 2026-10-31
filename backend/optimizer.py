"""Exhaustive finite search over candidate paths and 0.01-knot cruise speeds."""
import math
from .cargo_model import prepared_objective, score_candidate

OPTIMIZER_VERSION = 'deadline-speed-v1'
SPEED_RESOLUTION = .01


def search_passages(paths, p, outcomes, habitat_assessed):
    objective = prepared_objective(outcomes,habitat_assessed)
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
        zone_speed = min(10,p.max_speed)
        zone_hours = path['protected_distance']/zone_speed
        protection = max(0,100-path['whale_distance']*(zone_speed/10)**2/max(1,path['distance'])*100*p.whale_activity) if habitat_assessed else None
        for tick in range(min_tick,max_tick+1):
            speed = tick/100
            hours = zone_hours+path['open_distance']/speed
            fuel = fuel_factor*(path['open_distance']*speed**2+path['protected_distance']*zone_speed**2)
            score, expired, breakdown = score_candidate(hours,fuel,protection,reference_fuel,objective)
            candidate = {'path':path,'speed':speed,'hours':hours,'fuel':fuel,
                         'protection':protection,'score':score,'newly_expired_tonnes':expired,
                         'score_breakdown':breakdown,'zone_speed':zone_speed}
            quality_key = (expired,score,hours,fuel,path['id'])
            time_key = (hours,fuel,expired,score,path['id'])
            fuel_key = (fuel,expired,score,hours,path['id'])
            evaluated += 1
            if unconstrained_key is None or quality_key<unconstrained_key:
                unconstrained,unconstrained_key = candidate,quality_key
            if earliest_key is None or time_key<earliest_key:
                earliest,earliest_key = candidate,time_key
            if hours>p.arrival_window+1e-9: continue
            feasible_count += 1
            if best_key is None or quality_key<best_key: best,best_key=candidate,quality_key
            if fastest_key is None or time_key<fastest_key: fastest,fastest_key=candidate,time_key
            if cheapest_key is None or fuel_key<cheapest_key: cheapest,cheapest_key=candidate,fuel_key
    feasible = best is not None
    choices = {
        'balanced': best if feasible else earliest,
        'direct': fastest if feasible else earliest,
        'eco': cheapest if feasible else earliest,
    }
    return choices, {
        'version':OPTIMIZER_VERSION,'status':'feasible' if feasible else 'infeasible',
        'speed_resolution_knots':SPEED_RESOLUTION,'min_speed':min_tick/100,'max_speed':max_tick/100,
        'candidate_paths':len(paths),'evaluated_combinations':evaluated,
        'feasible_combinations':feasible_count,'reference_fuel_tonnes':reference_fuel,
        'earliest_possible_hours':earliest['hours'],
        'deadline_binding':feasible and (best['path']['id'],best['speed'])!=(unconstrained['path']['id'],unconstrained['speed']),
        'scope':'Best among the supplied sea paths at 0.01-knot open-water speed resolution.',
    }
