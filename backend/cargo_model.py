"""Transparent, bounded quality-budget model; not a food-safety assessment."""
MODEL_VERSION = "quality-budget-v2"


def routing_weights(perishable, remaining_hours, preference="auto"):
    """Priorities sum to one. Shorter remaining life raises freshness priority."""
    if preference == "auto":
        freshness = min(.85, max(.10, .9 / (1 + max(0, remaining_hours) / 168))) if perishable else 0
        weights = {"freshness": freshness, "fuel": (1-freshness)*.6, "habitat": (1-freshness)*.4}
    else:
        values = {"freshness": (.85,.10,.05), "fuel": (.15,.75,.10), "habitat": (.15,.20,.65)}[preference]
        weights = dict(zip(("freshness","fuel","habitat"),values))
        if not perishable:
            weights["freshness"] = 0
    total = sum(weights.values())
    return {key: value/total for key,value in weights.items()}


def product_model(perishable, shelf_hours, reference_temperature, frozen=False):
    return {
        "version": MODEL_VERSION,
        "perishable": perishable,
        "reference_temperature": reference_temperature,
        "temperature_q10": 2 if perishable else 1,
        "decay_percent_per_day": 2400/shelf_hours if perishable else 0,
        "routing_weights": routing_weights(perishable,shelf_hours),
        "frozen": frozen,
        "thaw_temperature": 0 if frozen else None,
        "thawed_quality_hours": 72 if frozen else None,
        "basis": "Editable scenario quality estimates; priorities are application policy, not measured trade statistics.",
    }


def evaluate_cargo(item, model, hours):
    perishable = model["perishable"]
    effective_life = None
    if perishable:
        # Colder-than-reference settings do not create unlimited shelf life.
        thermal = max(1, model["temperature_q10"] ** ((item.temperature-model["reference_temperature"])/10))
        effective_life = item.shelf_life / thermal
        if model["frozen"] and item.temperature >= model["thaw_temperature"]:
            effective_life = min(effective_life, model["thawed_quality_hours"])
        departure_remaining = max(0,effective_life-item.cargo_age)
        remaining = max(0,departure_remaining-hours)
        freshness = 100*remaining/effective_life
    else:
        departure_remaining = remaining = None
        freshness = 100
    preference = getattr(item,"routing_priority","auto")
    weights = routing_weights(perishable,departure_remaining or 0,preference)
    return {
        "product_id": item.product_id, "name": item.name, "profile": item.profile,
        "weight": item.weight, "freshness": round(freshness,2),
        "shelf_remaining": round(remaining,2) if remaining is not None else None,
        "departure_remaining_hours": departure_remaining,
        "effective_shelf_life_hours": effective_life,
        "expired_at_departure": perishable and departure_remaining <= 0,
        "expired_on_arrival": perishable and remaining <= 0,
        "perishable": perishable,
        "model": {**model,"decay_percent_per_day":2400/item.shelf_life if perishable else 0,
                  "routing_weights":weights,"routing_priority":preference},
    }


def manifest_weights(outcomes, habitat_assessed):
    # A small urgent item must not be averaged away by a heavy durable load.
    actionable = [item for item in outcomes if item["perishable"] and not item["expired_at_departure"]]
    freshness = max((item["model"]["routing_weights"]["freshness"] for item in actionable),default=0)
    fuel = sum(item["weight"]*item["model"]["routing_weights"]["fuel"] for item in outcomes)
    habitat = sum(item["weight"]*item["model"]["routing_weights"]["habitat"] for item in outcomes)
    rest = fuel+habitat
    weights = {"freshness":freshness,"fuel":(1-freshness)*fuel/rest,
               "habitat":(1-freshness)*habitat/rest if habitat_assessed else 0}
    total = sum(weights.values())
    return {key:value/total for key,value in weights.items()}


def score_route(route, reference_fuel, habitat_assessed):
    return score_candidate(route['hours'],route['fuel'],route['protection'],reference_fuel,
                           prepared_objective(route['cargo_results'],habitat_assessed))


def prepared_objective(outcomes, habitat_assessed):
    """Cargo state/weights at departure are independent of path, speed and deadline."""
    active = [item for item in outcomes if item['perishable'] and not item['expired_at_departure']]
    return {
        'weights': manifest_weights(outcomes,habitat_assessed),
        'remaining_hours': min((item['departure_remaining_hours'] for item in active),default=None),
        'expiry_budgets': [(item['departure_remaining_hours'],item['weight']) for item in active],
    }


def score_candidate(hours, fuel, protection, reference_fuel, objective):
    remaining = objective['remaining_hours']
    components = {
        'freshness': min(1,hours/remaining) if remaining is not None else 0,
        'fuel': fuel/(fuel+reference_fuel),
        'habitat': (100-protection)/100 if protection is not None else None,
    }
    weights = objective['weights']
    score = sum(weights[key]*(value or 0) for key,value in components.items())
    expired = sum(weight for budget,weight in objective['expiry_budgets'] if hours>=budget)
    return score, expired, {'weights':weights,'components':components,'score':score}
