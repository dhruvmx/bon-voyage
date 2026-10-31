"""Deterministic coastal route planner with segment-level zone constraints."""
import math
from datetime import datetime, timedelta, timezone

PORTS = [
    {"id":"la","name":"Los Angeles","code":"USLAX","lat":33.705,"lon":-118.265,"gate":[33.61,-118.40]},
    {"id":"oakland","name":"Oakland","code":"USOAK","lat":37.795,"lon":-122.32,"gate":[37.70,-122.65]},
    {"id":"sandiego","name":"San Diego","code":"USSAN","lat":32.69,"lon":-117.16,"gate":[32.60,-117.32]},
    {"id":"humboldt","name":"Humboldt Bay","code":"USHUB","lat":40.77,"lon":-124.20,"gate":[40.75,-124.45]},
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
}

def distance(a,b):
    lat1,lat2=math.radians(a[0]),math.radians(b[0])
    dl=math.radians(b[0]-a[0]); dn=math.radians(b[1]-a[1])
    return 3440.065*2*math.asin(min(1,math.sqrt(math.sin(dl/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dn/2)**2)))

def zone_at(point):
    return next((z for z in ZONES if distance(point,[z['lat'],z['lon']])<=z['radius_nm']),None)

def dense(points):
    result=[points[0]]
    for a,b in zip(points,points[1:]):
        count=max(1,math.ceil(distance(a,b)/2))
        result.extend([[a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count] for i in range(1,count+1)])
    return result

def plan(p):
    ports={x['id']:x for x in PORTS}; origin=ports[p.origin]; dest=ports[p.destination]
    lo,hi=sorted([origin,dest],key=lambda x:x['lat']); reverse=origin['lat']>dest['lat']
    # Coastal sea waypoints keep all candidate passages west of the California coast.
    corridor=[[32.60,-117.65],[33.05,-118.8],[33.65,-119.0],[33.68,-120.45],[34.5,-120.85],[35.3,-121.45],[36.3,-122.2],[37.3,-123.0],[38.1,-123.5],[39.0,-124.1],[40.0,-124.7],[40.75,-124.9]]
    rows=[]
    for route_id,name,offset,cruise in [('direct','Freshness first',0,18.5),('balanced','Balanced passage',.25,16),('eco','Ocean first',.65,13.5)]:
        mids=[[lat,lon-offset] for lat,lon in corridor if lo['gate'][0]+.005<lat<hi['gate'][0]-.005]
        harbor=lambda port: ([[37.795,-122.32],[37.82,-122.40],[37.81,-122.49],[37.78,-122.53],port['gate']] if port['id']=='oakland' else [[port['lat'],port['lon']],port['gate']])
        points=harbor(lo)+mids+list(reversed(harbor(hi)))
        if reverse: points.reverse()
        coords=dense(points); segments=[]
        for a,b in zip(coords,coords[1:]):
            midpoint=[(a[0]+b[0])/2,(a[1]+b[1])/2]; zone=zone_at(midpoint)
            segments.append({'from':a,'to':b,'distance':distance(a,b),'zone':zone['name'] if zone else None,'kind':zone['kind'] if zone else 'open'})
        total=sum(x['distance'] for x in segments); protected=sum(x['distance'] for x in segments if x['zone']); open_nm=total-protected
        max_speed=p.max_speed; zone_speed=min(10,max_speed); zone_hours=protected/zone_speed
        required=open_nm/max(.01,p.arrival_window-zone_hours)
        speed=min(max_speed,max(min(cruise,max_speed),required))
        hours=zone_hours+open_nm/speed
        cargo=CARGOS[p.cargo_type]; thermal=2**((p.temperature-cargo['temperature'])/10)
        remaining=max(0,p.shelf_life/thermal-p.cargo_age-hours)
        if p.cargo_type=='electronics': freshness=100
        else: freshness=max(0,min(100,100-(p.cargo_age+hours)*cargo['decay']*thermal,100*remaining/max(1,p.shelf_life/thermal)))
        # Vessel fuel/day is the reference at 18 knots; power follows speed cubed.
        fuel=0; exposure=0
        for s in segments:
            s['speed']=zone_speed if s['zone'] else speed
            s['hours']=s['distance']/s['speed']; fuel+=p.fuel_per_day/24*(s['speed']/18)**3*s['hours']
            if s['kind']=='whale': exposure+=s['distance']*(s['speed']/10)**2
        protection=max(0,100-exposure/max(1,total)*100*p.whale_activity)
        eta=(datetime.fromisoformat(p.departure.replace('Z','+00:00'))+timedelta(hours=hours)).astimezone(timezone.utc).isoformat()
        feasible=hours<=p.arrival_window+.001
        w=cargo['weights']; score=w[0]*((100-freshness)+max(0,hours-p.arrival_window)*3)+w[1]*(fuel/20)+w[2]*(100-protection)/10
        rows.append(dict(id=route_id,name=name,distance=round(total,1),protected_distance=round(protected,1),open_distance=round(open_nm,1),speed=round(speed,2),hours=round(hours,2),freshness=round(freshness,2),fuel=round(fuel,2),co2=round(fuel*3.114,2),protection=round(protection,1),eta=eta,feasible=feasible,shelf_remaining=round(remaining,1),score=score,coordinates=coords,segments=segments))
    baseline=rows[0]['distance']/18*p.fuel_per_day/24
    for r in rows: r['fuel_delta']=round((r['fuel']/max(.01,baseline)-1)*100,1)
    best=min(rows,key=lambda r:(not r['feasible'],r['score']))
    return {'routes':rows,'recommended':best['id'],'zones':ZONES,'data_mode':'California coastal planning scenario'}


