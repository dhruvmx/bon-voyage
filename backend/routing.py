"""Route planner: California coastal scenario plus worldwide sea-lane routing.

California port pairs keep the original hand-built corridor. Any other pair is
routed over the global shipping-lane network provided by the `searoute` package.
"""
import math
from functools import lru_cache
from threading import Lock
from types import SimpleNamespace
from .cargo_catalog import PRODUCT_BY_ID
from .cargo_model import MODEL_VERSION, evaluate_cargo, product_model
from .optimizer import search_passages, OPTIMIZER_VERSION
from datetime import datetime, timedelta, timezone

try:
    import searoute as _searoute
except ImportError:  # California routes still work without it
    _searoute = None

CA_IDS = {"la", "oakland", "sandiego", "humboldt"}

PORTS = [
    # California (original scenario; "gate" is the harbour approach point)
    {"id":"la","name":"Los Angeles","code":"USLAX","lat":33.705,"lon":-118.265,"gate":[33.61,-118.40]},
    {"id":"oakland","name":"Oakland","code":"USOAK","lat":37.795,"lon":-122.32,"gate":[37.70,-122.65]},
    {"id":"sandiego","name":"San Diego","code":"USSAN","lat":32.69,"lon":-117.16,"gate":[32.60,-117.32]},
    {"id":"humboldt","name":"Humboldt Bay","code":"USHUB","lat":40.77,"lon":-124.20,"gate":[40.75,-124.45]},
    # World ports (approximate coordinates; verify against the NGA World Port Index)
    {"id":"shanghai","name":"Shanghai","code":"CNSHA","lat":31.35,"lon":121.60},
    {"id":"singapore","name":"Singapore","code":"SGSIN","lat":1.26,"lon":103.84},
    {"id":"rotterdam","name":"Rotterdam","code":"NLRTM","lat":51.95,"lon":4.14},
    {"id":"hamburg","name":"Hamburg","code":"DEHAM","lat":53.54,"lon":9.97},
    {"id":"busan","name":"Busan","code":"KRPUS","lat":35.10,"lon":129.04},
    {"id":"hongkong","name":"Hong Kong","code":"HKHKG","lat":22.30,"lon":114.17},
    {"id":"yokohama","name":"Yokohama","code":"JPYOK","lat":35.45,"lon":139.65},
    {"id":"mumbai","name":"Nhava Sheva (Mumbai)","code":"INNSA","lat":18.95,"lon":72.95},
    {"id":"jebelali","name":"Jebel Ali (Dubai)","code":"AEJEA","lat":25.01,"lon":55.06},
    {"id":"piraeus","name":"Piraeus","code":"GRPIR","lat":37.94,"lon":23.63},
    {"id":"valencia","name":"Valencia","code":"ESVLC","lat":39.44,"lon":-0.32},
    {"id":"newyork","name":"New York / New Jersey","code":"USNYC","lat":40.67,"lon":-74.04},
    {"id":"vancouver","name":"Vancouver","code":"CAVAN","lat":49.29,"lon":-123.11},
    {"id":"santos","name":"Santos","code":"BRSSZ","lat":-23.98,"lon":-46.30},
    {"id":"callao","name":"Callao","code":"PECLL","lat":-12.05,"lon":-77.15},
    {"id":"durban","name":"Durban","code":"ZADUR","lat":-29.87,"lon":31.03},
    {"id":"capetown","name":"Cape Town","code":"ZACPT","lat":-33.91,"lon":18.43},
    {"id":"lagos","name":"Lagos (Apapa)","code":"NGLOS","lat":6.43,"lon":3.39},
    {"id":"mombasa","name":"Mombasa","code":"KEMBA","lat":-4.06,"lon":39.67},
    {"id":"sydney","name":"Sydney","code":"AUSYD","lat":-33.97,"lon":151.22},
    {"id":"auckland","name":"Auckland","code":"NZAKL","lat":-36.84,"lon":174.77},
]
ZONES = [
    {"id":"sb","name":"Santa Barbara Channel","lat":34.15,"lon":-119.8,"radius_nm":30,"kind":"whale"},
    {"id":"monterey","name":"Monterey migration corridor","lat":36.55,"lon":-122.25,"radius_nm":36,"kind":"whale"},
    {"id":"sf","name":"San Francisco approach VSR","lat":37.70,"lon":-122.65,"radius_nm":14,"kind":"vsr"},
    {"id":"lax","name":"Los Angeles approach VSR","lat":33.65,"lon":-118.38,"radius_nm":13,"kind":"vsr"},
]
CARGOS = {
    "berries":{"name":"Fresh berries","level":"Ultra-perishable","temperature":2,"shelf":84,"decay":.23,"weights":[.62,.12,.26],"color":"#b95b3d"},
    "avocados":{"name":"Avocados / bananas","level":"Managed atmosphere","temperature":5,"shelf":336,"decay":.075,"weights":[.30,.35,.35],"color":"#617348"},
    "grain":{"name":"Bulk grain","level":"Bulk commodity","temperature":18,"shelf":6000,"decay":.001,"weights":[.02,.43,.55],"color":"#a3832e"},
    "electronics":{"name":"Electronics","level":"Non-perishable","temperature":18,"shelf":99999,"decay":0,"weights":[0,.4,.6],"color":"#72758a"},
    "frozen":{"name":"Frozen goods","level":"Frozen quality model","temperature":-18,"shelf":4320,"color":"#64899c"},
}

# Legacy profile fields remain available, now derived from the same model as products.
for profile_id,profile in CARGOS.items():
    profile['model']=product_model(profile_id!='electronics',profile['shelf'],profile['temperature'],profile_id=='frozen')
    profile['decay']=profile['model']['decay_percent_per_day']/24
    profile['weights']=list(profile['model']['routing_weights'].values())

PATH_LABELS = {"direct":"Coastal corridor","balanced":"Offshore corridor","eco":"Outer offshore corridor"}
# Canal / strait restrictions tried to get genuinely different world passages
RESTRICTION_SETS = [[], ["suez"], ["panama"], ["malacca"]]
# searoute mutates restrictions on its shared in-memory graph.
_NETWORK_LOCK = Lock()
DATA_COVERAGE = {
    "whale": {
        "scope": "California scenario only",
        "source": "Bundled illustrative California habitat and approach zones",
        "live": False,
        "global_reference": "https://www.marinemammalhabitat.org/imma-eatlas/",
        "note": "Areas without habitat data are unassessed, not whale-free. The 10-knot zones are planning assumptions, not a global regulatory database.",
    },
    "routing": {"source": "searoute 1.6.0 maritime network", "navigation_ready": False},
}

class RoutePlanningError(Exception):
    def __init__(self, message, status_code=422):
        super().__init__(message)
        self.status_code=status_code



def distance(a,b):
    lat1,lat2=math.radians(a[0]),math.radians(b[0])
    dl=math.radians(b[0]-a[0]); dn=math.radians(b[1]-a[1])
    return 3440.065*2*math.asin(min(1,math.sqrt(math.sin(dl/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dn/2)**2)))

def zone_at(point):
    return next((z for z in ZONES if distance(point,[z['lat'],z['lon']])<=z['radius_nm']),None)

def dense(points,step=2.0,digits=None):
    result=[points[0]]
    for a,b in zip(points,points[1:]):
        count=max(1,math.ceil(distance(a,b)/step))
        result.extend([[a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count] for i in range(1,count+1)])
    if digits is not None: result=[[round(a,digits),round(b,digits)] for a,b in result]
    return result

def unwrap(points):
    """Make longitudes continuous so routes crossing 180° do not jump across the map."""
    out=[list(points[0])]
    for lat,lon in points[1:]:
        prev=out[-1][1]
        while lon-prev>180: lon-=360
        while lon-prev<-180: lon+=360
        out.append([lat,lon])
    return out

def path_length(points):
    return sum(distance(a,b) for a,b in zip(points,points[1:]))

def california_paths(origin,dest):
    lo,hi=sorted([origin,dest],key=lambda x:x['lat']); reverse=origin['lat']>dest['lat']
    corridor=[[32.60,-117.65],[33.05,-118.8],[33.65,-119.0],[33.68,-120.45],[34.5,-120.85],[35.3,-121.45],[36.3,-122.2],[37.3,-123.0],[38.1,-123.5],[39.0,-124.1],[40.0,-124.7],[40.75,-124.9]]
    offsets={'direct':0,'balanced':.25,'eco':.65}
    harbor=lambda port: ([[37.795,-122.32],[37.82,-122.40],[37.81,-122.49],[37.78,-122.53],port['gate']] if port['id']=='oakland' else [[port['lat'],port['lon']],port['gate']])
    paths={}
    for route_id in PATH_LABELS:
        mids=[[lat,lon-offsets[route_id]] for lat,lon in corridor if lo['gate'][0]+.005<lat<hi['gate'][0]-.005]
        points=harbor(lo)+mids+list(reversed(harbor(hi)))
        if reverse: points.reverse()
        paths[route_id]=dense(points)
    return paths

def world_paths(origin,dest):
    if _searoute is None:
        raise RoutePlanningError("Global routing is unavailable. Install the project's Python requirements and restart the server.",503)
    with _NETWORK_LOCK:
        return _cached_world_paths(origin['id'],dest['id'])

@lru_cache(maxsize=128)
def _cached_world_paths(origin_id,dest_id):
    ports={port['id']:port for port in PORTS}
    origin,dest=ports[origin_id],ports[dest_id]
    found=[]; signatures=set()
    for restrictions in RESTRICTION_SETS:
        try:
            feature=_searoute.searoute(
                [origin['lon'],origin['lat']],[dest['lon'],dest['lat']],
                units='naut',restrictions=['northwest',*restrictions],append_orig_dest=True)
            geometry=feature['geometry']['coordinates']
            if len(geometry)<2 or not math.isfinite(feature['properties']['length']): continue
            pts=unwrap([[lat,lon] for lon,lat in geometry])
            length=path_length(pts)
            if length<=0: continue
            signature=[]
            for lat,lon in pts:
                point=(round(lat,6),round(lon,6))
                if not signature or signature[-1]!=point: signature.append(point)
            signature=tuple(signature)
            if signature not in signatures:
                signatures.add(signature); found.append((length,pts))
        except Exception:
            continue
    if not found: raise RoutePlanningError('No sea passage could be calculated between these ports. Try a different port pair.')
    found.sort(key=lambda x:x[0])
    chosen=[pts for _,pts in found[:3]]
    while len(chosen)<3: chosen.append(chosen[0])
    step=max(2.0,min(12.0,max(path_length(c) for c in chosen)/800))
    return {rid:dense(pts,step,4) for rid,pts in zip(PATH_LABELS,chosen)}

def cargo_outcomes(p,hours):
    items=p.cargo_items if getattr(p,'cargo_items',None) else [SimpleNamespace(
        product_id=None,name=p.cargo_name,profile=p.cargo_type,weight=p.weight,
        temperature=p.temperature,shelf_life=p.shelf_life,cargo_age=p.cargo_age)]
    outcomes=[]
    for item in items:
        product=PRODUCT_BY_ID.get(item.product_id,{})
        model=product.get('model',CARGOS[item.profile]['model'])
        outcomes.append(evaluate_cargo(item,model,hours))
    return outcomes

def prepare_paths(paths,california):
    unique=[]; seen=set()
    for path_id,coords in paths.items():
        signature=tuple(map(tuple,coords))
        if signature in seen: continue
        seen.add(signature)
        segments=[]
        for a,b in zip(coords,coords[1:]):
            zone=zone_at([(a[0]+b[0])/2,(a[1]+b[1])/2])
            segments.append({'from':a,'to':b,'distance':distance(a,b),
                'zone':zone['name'] if zone else None,'kind':zone['kind'] if zone else 'open'})
        total=sum(segment['distance'] for segment in segments)
        protected=sum(segment['distance'] for segment in segments if segment['zone'])
        unique.append({'id':path_id,'name':PATH_LABELS.get(path_id,path_id) if california else f"Sea path {len(unique)+1}",
            'coordinates':coords,'segments':segments,'distance':total,'protected_distance':protected,
            'open_distance':total-protected,'whale_distance':sum(segment['distance'] for segment in segments if segment['kind']=='whale')})
    if not unique: raise RoutePlanningError('No candidate sea paths are available.')
    return unique


def materialize_route(candidate,mode,p,california,reference_fuel):
    path=candidate['path']; hours=candidate['hours']; speed=candidate['speed']
    outcomes=cargo_outcomes(p,hours)
    total_weight=sum(item['weight'] for item in outcomes)
    remaining=min((item['shelf_remaining'] for item in outcomes if item['perishable']),default=None)
    feasible=hours<=p.arrival_window+1e-9
    names={'balanced':'Recommended balance','direct':'Fastest feasible arrival','eco':'Lowest fuel within deadline'}
    if not feasible: names={'balanced':'Earliest available passage','direct':'Earliest available passage','eco':'Earliest available passage'}
    departure=datetime.fromisoformat(p.departure.replace('Z','+00:00'))
    segments=[]
    for segment in path['segments']:
        segment_speed=candidate['zone_speed'] if segment['zone'] else speed
        segments.append({**segment,'speed':segment_speed,'hours':segment['distance']/segment_speed})
    return {
        'id':mode,'name':names[mode],'path_id':path['id'],'path_name':path['name'],
        'distance':round(path['distance'],2),'protected_distance':round(path['protected_distance'],2),
        'open_distance':round(path['open_distance'],2),'speed':speed,'protected_speed':candidate['zone_speed'],'hours':round(hours,4),
        'freshness':round(sum(item['freshness']*item['weight'] for item in outcomes)/total_weight,2),
        'fuel':round(candidate['fuel'],4),'co2':round(candidate['fuel']*3.114,4),
        'fuel_delta':round((candidate['fuel']/reference_fuel-1)*100,1),
        'protection':round(candidate['protection'],1) if california else None,'whale_assessed':california,
        'cargo_results':outcomes,'worst_cargo_freshness':min(item['freshness'] for item in outcomes),
        'eta':(departure+timedelta(hours=hours)).astimezone(timezone.utc).isoformat(),
        'feasible':feasible,'slack_hours':round(p.arrival_window-hours,4),
        'shelf_remaining':remaining,'score':candidate['score'],'score_breakdown':candidate['score_breakdown'],
        'newly_expired_tonnes':candidate['newly_expired_tonnes'],
        'cargo_model_version':MODEL_VERSION,'optimizer_version':OPTIMIZER_VERSION,
        'coordinates':path['coordinates'],'segments':segments,
    }


def plan(p):
    ports={port['id']:port for port in PORTS}; origin=ports[p.origin]; dest=ports[p.destination]
    california=origin['id'] in CA_IDS and dest['id'] in CA_IDS
    geometry=california_paths(origin,dest) if california else world_paths(origin,dest)
    paths=prepare_paths(geometry,california)
    try:
        choices,optimization=search_passages(paths,p,cargo_outcomes(p,0),california)
    except ValueError as error:
        raise RoutePlanningError(str(error)) from error
    rows=[materialize_route(choices[mode],mode,p,california,optimization['reference_fuel_tonnes'])
          for mode in ['balanced','direct','eco']]
    for index,row in enumerate(rows):
        row['same_as']=next((prior['id'] for prior in rows[:index]
            if (prior['path_id'],prior['speed'],prior['protected_speed'])==(row['path_id'],row['speed'],row['protected_speed'])),None)
    departure=datetime.fromisoformat(p.departure.replace('Z','+00:00'))
    coverage={**DATA_COVERAGE,'whale':{**DATA_COVERAGE['whale'],'score_available':california,
        'status':'scenario' if california else 'unassessed',
        'summary':'California scenario estimate; not a live safety or compliance assessment.' if california else 'Whale habitat coverage is incomplete for this passage. No global safety score is available.'}}
    return {
        'routes':rows,'recommended':'balanced','status':optimization['status'],
        'zones':ZONES,'data_mode':'California coastal planning scenario' if california else 'Global sea-lane planning (searoute network)',
        'data_coverage':coverage,'distinct_paths':len(paths),'cargo_model_version':MODEL_VERSION,
        'optimization':optimization,'deadline_hours':p.arrival_window,
        'deadline_at':(departure+timedelta(hours=p.arrival_window)).astimezone(timezone.utc).isoformat(),
        'earliest_eta':(departure+timedelta(hours=optimization['earliest_possible_hours'])).astimezone(timezone.utc).isoformat(),
    }
