import math, hashlib, hmac, json, os, re, secrets, sqlite3, time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Request, Response, HTTPException, Depends, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal
from .routing import PORTS, CARGOS, ZONES, plan, RoutePlanningError, DATA_COVERAGE
from .cargo_catalog import PRODUCTS, PRODUCT_BY_ID
from .database import connect, database_url, INTEGRITY_ERRORS

ROOT=Path(__file__).resolve().parents[1]
DB=Path(os.environ.get('BON_VOYAGE_DB',os.environ.get('TIDEWAY_DB',str(ROOT/'data'/'tideway.sqlite3'))))
if not database_url() and not os.environ.get('VERCEL'):
    DB.parent.mkdir(parents=True,exist_ok=True)
SECURE=os.environ.get('COOKIE_SECURE','true' if os.environ.get('VERCEL') else 'false').lower()=='true'
app=FastAPI(title='Bon Voyage API',version='2.0.0')

@contextmanager
def db():
    connection=connect(DB)
    try:
        yield connection
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally: connection.close()

def init_db():
    with db() as c:
        if database_url():
            c.execute('SELECT pg_advisory_xact_lock(754982013)')
        c.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,company TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT 'Fleet operator',salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS vessels(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,created_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS voyages(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,created_at REAL NOT NULL,updated_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS login_attempts(key TEXT NOT NULL,at REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires);
        CREATE INDEX IF NOT EXISTS attempts_key_idx ON login_attempts(key,at);
        CREATE INDEX IF NOT EXISTS vessels_user_idx ON vessels(user_id);
        CREATE INDEX IF NOT EXISTS voyages_user_idx ON voyages(user_id);
        CREATE INDEX IF NOT EXISTS voyages_page_idx ON voyages(user_id,created_at DESC,id DESC);
        CREATE INDEX IF NOT EXISTS vessels_page_idx ON vessels(user_id,created_at DESC,id DESC);
        ''')
init_db()

@app.middleware('http')
async def security(request,call_next):
    if request.method not in ('GET','HEAD','OPTIONS'):
        origin=request.headers.get('origin')
        if origin and origin.split('://',1)[-1]!=request.headers.get('host'):
            return Response('Cross-origin write rejected',status_code=403)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='same-origin'
    response.headers['X-Frame-Options']='DENY'
    if request.url.path.startswith('/api/'): response.headers['Cache-Control']='no-store'
    return response

def hash_password(password,salt):
    return hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),310000).hex()
def public_user(row): return {k:row[k] for k in ('id','email','name','company','role')}
def current_user(request:Request):
    token=request.cookies.get('tideway_session',''); digest=hashlib.sha256(token.encode()).hexdigest()
    with db() as c: row=c.execute('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',(digest,time.time())).fetchone()
    if not row: raise HTTPException(401,'Please log in to your workspace.')
    return public_user(row)
def session(response,user_id):
    token=secrets.token_urlsafe(32)
    with db() as c:
        c.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
        c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),user_id,time.time()+7*86400))
    response.set_cookie('tideway_session',token,httponly=True,secure=SECURE,samesite='lax',max_age=7*86400,path='/')

class Credentials(BaseModel):
    email:str=Field(min_length=3,max_length=254)
    password:str=Field(min_length=1,max_length=128)
    @field_validator('email')
    @classmethod
    def email_format(cls,v):
        v=v.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',v): raise ValueError('Enter a valid email address.')
        return v
class Signup(Credentials):
    name:str=Field(min_length=2,max_length=80)
    company:str=Field(default='',max_length=120)
class Profile(BaseModel):
    name:str=Field(min_length=2,max_length=80)
    company:str=Field(default='',max_length=120)
    role:str=Field(default='Fleet operator',min_length=2,max_length=80)
class PasswordChange(BaseModel):
    current_password:str=Field(min_length=1,max_length=128)
    new_password:str=Field(min_length=8,max_length=128)

@app.get('/api/health')
def health():
    with db() as c: c.execute('SELECT 1')
    return {'status':'ok','version':'2.0.0','storage':'postgresql' if database_url() else 'sqlite'}
@app.post('/api/auth/signup',status_code=201)
def signup(p:Signup,response:Response):
    if len(p.password)<8: raise HTTPException(422,'Use a password of at least 8 characters.')
    if not p.name.strip(): raise HTTPException(422,'Enter your name.')
    uid=secrets.token_hex(12); salt=secrets.token_hex(16)
    try:
        with db() as c: c.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)',(uid,p.email,p.name.strip(),p.company.strip(),'Fleet operator',salt,hash_password(p.password,salt),time.time()))
    except INTEGRITY_ERRORS: raise HTTPException(409,'An account with this email already exists. Log in instead.')
    session(response,uid)
    return {'id':uid,'email':p.email,'name':p.name.strip(),'company':p.company.strip(),'role':'Fleet operator'}
@app.post('/api/auth/login')
def login(p:Credentials,request:Request,response:Response):
    key=hashlib.sha256((p.email+'|'+(request.client.host if request.client else '')).encode()).hexdigest()
    with db() as c:
        c.execute('DELETE FROM login_attempts WHERE at<?',(time.time()-900,))
        if c.execute('SELECT COUNT(*) AS attempts FROM login_attempts WHERE key=?',(key,)).fetchone()['attempts']>=10: raise HTTPException(429,'Too many attempts. Try again in 15 minutes.')
        row=c.execute('SELECT * FROM users WHERE email=?',(p.email,)).fetchone()
    actual=hash_password(p.password,row['salt'] if row else '00'*16)
    if not row or not hmac.compare_digest(actual,row['password_hash']):
        with db() as c: c.execute('INSERT INTO login_attempts VALUES(?,?)',(key,time.time()))
        raise HTTPException(401,'Email or password is incorrect.')
    with db() as c: c.execute('DELETE FROM login_attempts WHERE key=?',(key,))
    session(response,row['id']); return public_user(row)
@app.post('/api/auth/logout')
def logout(request:Request,response:Response):
    with db() as c: c.execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(request.cookies.get('tideway_session','').encode()).hexdigest(),))
    response.delete_cookie('tideway_session',path='/'); return {'ok':True}
@app.get('/api/auth/me')
def me(user=Depends(current_user)): return user
@app.put('/api/profile')
def profile(p:Profile,user=Depends(current_user)):
    if not p.name.strip(): raise HTTPException(422,'Enter your name.')
    with db() as c: c.execute('UPDATE users SET name=?,company=?,role=? WHERE id=?',(p.name.strip(),p.company.strip(),p.role.strip(),user['id']))
    return {**user,**p.model_dump()}
@app.put('/api/auth/password')
def password(p:PasswordChange,response:Response,user=Depends(current_user)):
    with db() as c:
        row=c.execute('SELECT * FROM users WHERE id=?',(user['id'],)).fetchone()
        if not hmac.compare_digest(hash_password(p.current_password,row['salt']),row['password_hash']): raise HTTPException(400,'Current password is incorrect.')
        salt=secrets.token_hex(16)
        c.execute('UPDATE users SET salt=?,password_hash=? WHERE id=?',(salt,hash_password(p.new_password,salt),user['id']))
        c.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
    session(response,user['id']); return {'ok':True}

class CargoItem(BaseModel):
    product_id:str|None=Field(default=None,max_length=100)
    name:str=Field(default='',max_length=100)
    profile:str='electronics'
    weight:float=Field(default=1,ge=.001,le=100000)
    temperature:float|None=Field(default=None,ge=-30,le=40)
    shelf_life:float|None=Field(default=None,ge=.001,le=100000)
    cargo_age:float=Field(default=0,ge=0,le=100000)
    routing_priority:Literal['auto','freshness','fuel','habitat']='auto'

    @model_validator(mode='after')
    def resolve_product(self):
        product=PRODUCT_BY_ID.get(self.product_id) if self.product_id else None
        if self.product_id and not product: raise ValueError('Choose a supported cargo product or add a custom item.')
        if product:
            self.name=product['name']; self.profile=product['profile']
        self.name=self.name.strip()
        if not self.name: raise ValueError('Custom cargo needs a name.')
        if self.profile not in CARGOS: raise ValueError('Choose a supported perishability profile.')
        defaults=product or {'temperature':CARGOS[self.profile]['temperature'],'shelf_life':CARGOS[self.profile]['shelf']}
        if self.temperature is None: self.temperature=defaults['temperature']
        if self.shelf_life is None: self.shelf_life=defaults['shelf_life']
        return self

class PlanInput(BaseModel):
    origin:str='la'
    destination:str='oakland'
    cargo_type:str='avocados'
    cargo_name:str=Field(default='Avocados',min_length=1,max_length=100)
    weight:float=Field(default=240,ge=.001,le=100000)
    temperature:float=Field(default=5,ge=-30,le=40)
    shelf_life:float=Field(default=336,ge=.001,le=100000)
    cargo_age:float=Field(default=0,ge=0,le=100000)
    arrival_window:float=Field(default=36,ge=1,le=2160)
    cargo_items:list[CargoItem]|None=Field(default=None,min_length=1,max_length=10)
    max_speed:float=Field(default=24,ge=5,le=35)
    min_speed:float|None=Field(default=None,ge=5,le=35)
    fuel_per_day:float=Field(default=35,ge=.001,le=500)
    whale_activity:float=Field(default=1,ge=.25,le=3)
    departure:str=Field(min_length=10,max_length=40)
    @model_validator(mode='after')
    def valid(self):
        if self.min_speed is None: self.min_speed=min(8,self.max_speed)
        if self.min_speed>self.max_speed: raise ValueError('Minimum open-water speed cannot exceed maximum speed.')
        ids={x['id'] for x in PORTS}
        if self.origin not in ids or self.destination not in ids or self.origin==self.destination: raise ValueError('Choose two different supported ports.')
        if self.cargo_type not in CARGOS: raise ValueError('Choose a supported cargo category.')
        if self.cargo_items is not None:
            keys=[item.name.casefold() for item in self.cargo_items]
            if len(set(keys))!=len(keys): raise ValueError('Each cargo item must be unique; combine its weight into one entry.')
            total=sum(item.weight for item in self.cargo_items)
            if total>100000: raise ValueError('Total cargo weight cannot exceed 100,000 tonnes.')
            self.weight=round(total,6)
            self.cargo_name=', '.join(item.name for item in self.cargo_items)[:100]
            first=self.cargo_items[0]
            self.cargo_type=first.profile; self.temperature=first.temperature
            self.shelf_life=first.shelf_life; self.cargo_age=first.cargo_age
        dt=datetime.fromisoformat(self.departure.replace('Z','+00:00'))
        if not dt.tzinfo: raise ValueError('Departure needs a timezone.')
        try: utc=dt.astimezone(timezone.utc)
        except (OverflowError,ValueError): raise ValueError('Departure must be between 1900 and 2100.')
        if not 1900<=utc.year<=2100: raise ValueError('Departure must be between 1900 and 2100.')
        return self
@app.get('/api/catalog')
def catalog(): return {'ports':PORTS,'cargo_types':CARGOS,'cargo_products':PRODUCTS,'zones':ZONES,'data_coverage':DATA_COVERAGE,'max_cargo_items':10,'max_arrival_hours':2160}

def safe_plan(p):
    try: return plan(p)
    except RoutePlanningError as error: raise HTTPException(error.status_code,str(error)) from error

@app.post('/api/plan')
def calculate(p:PlanInput): return safe_plan(p)

class Vessel(BaseModel):
    name:str=Field(min_length=2,max_length=100)
    imo:str=Field(default='',max_length=7)
    max_speed:float=Field(default=24,ge=5,le=35)
    min_speed:float|None=Field(default=None,ge=5,le=35)
    fuel_per_day:float=Field(default=35,ge=.001,le=500)
    capacity:float=Field(default=12000,gt=0,le=500000)
    @model_validator(mode='after')
    def operating_range(self):
        if self.min_speed is None: self.min_speed=min(8,self.max_speed)
        if self.min_speed>self.max_speed: raise ValueError('Minimum open-water speed cannot exceed maximum speed.')
        return self
    @field_validator('imo')
    @classmethod
    def check_imo(cls,v):
        if v and not re.fullmatch(r'\d{7}',v): raise ValueError('IMO must be seven digits or blank.')
        return v
class Voyage(BaseModel):
    name:str=Field(min_length=2,max_length=120)
    vessel_id:str|None=None
    notes:str=Field(default='',max_length=3000)
    status:str='Planned'
    route_id:str='balanced'
    inputs:PlanInput
    @field_validator('status')
    @classmethod
    def valid_status(cls,v):
        if v not in ['Planned','In transit','Arrived']: raise ValueError('Invalid voyage status.')
        return v

def json_field(path):
    # Paths are application constants, never request input. Extract only summary
    # fields in SQL so list responses don't fetch large stored route geometries.
    if database_url():
        return "data::jsonb #>> '{"+path.replace('.',',')+"}'"
    return "json_extract(data, '$."+path+"')"

SUMMARY_FIELDS = {
    'name':'name','status':'status','notes':'notes',
    'origin':'inputs.origin','destination':'inputs.destination',
    'cargo_name':'inputs.cargo_name','weight':'inputs.weight',
    'distance':'result.distance','hours':'result.hours','freshness':'result.freshness',
    'fuel':'result.fuel','protection':'result.protection','whale_assessed':'result.whale_assessed',
}

def voyage_summary(row):
    assessed=row['whale_assessed']
    if assessed is None:
        assessed=row['protection'] is not None and row['origin'] in ('la','oakland','sandiego','humboldt') and row['destination'] in ('la','oakland','sandiego','humboldt')
    else: assessed=str(assessed).lower() in ('true','1')
    return {'id':row['id'],'name':row['name'],'status':row['status'],'notes':row['notes'] or '',
            'created_at':row['created_at'],
            'inputs':{key:float(row[key]) if key=='weight' else row[key] for key in ('origin','destination','cargo_name','weight')},
            'result':{**{key:float(row[key]) if row[key] is not None else None for key in ('distance','hours','freshness','fuel','protection')},'whale_assessed':assessed}}

def record_filter(table,user,q):
    where='user_id=?'; params=[user['id']]
    if q:
        paths=['name','inputs.cargo_name','inputs.cargo_items'] if table=='voyages' else ['name','imo']
        where+=' AND ('+' OR '.join("LOWER(COALESCE("+json_field(path)+",'')) LIKE ? ESCAPE '!'" for path in paths)+')'
        pattern='%'+q.lower().replace('!','!!').replace('%','!%').replace('_','!_')+'%'
        params.extend([pattern]*len(paths))
    return where,params

def list_records(table,user,limit,offset,q):
    where,params=record_filter(table,user,q)
    fields='id,data,created_at' if table=='vessels' else 'id,created_at,'+','.join(
        ('substr('+json_field(path)+',1,200)' if key=='notes' else json_field(path))+' AS '+key for key,path in SUMMARY_FIELDS.items())
    with db() as c:
        total=c.execute(f'SELECT COUNT(*) AS total FROM {table} WHERE {where}',params).fetchone()['total']
        rows=c.execute(f'SELECT {fields} FROM {table} WHERE {where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',[*params,limit,offset]).fetchall()
    items=[{'id':r['id'],**json.loads(r['data']),'created_at':r['created_at']} for r in rows] if table=='vessels' else [voyage_summary(row) for row in rows]
    return {'items':items,'total':total,'limit':limit,'offset':offset,'has_more':offset+len(items)<total}

def owned_record(c,table,record_id,user):
    row=c.execute(f'SELECT * FROM {table} WHERE id=? AND user_id=?',(record_id,user['id'])).fetchone()
    if not row: raise HTTPException(404,'Record not found.')
    return row
@app.get('/api/vessels')
def vessels(limit:int=Query(20,ge=1,le=100),offset:int=Query(0,ge=0,le=1000000000),q:str=Query('',max_length=100),user=Depends(current_user)):
    return list_records('vessels',user,limit,offset,q.strip())
@app.get('/api/vessels/{vid}')
def vessel_detail(vid:str,user=Depends(current_user)):
    with db() as c: row=owned_record(c,'vessels',vid,user)
    return {'id':row['id'],**json.loads(row['data']),'created_at':row['created_at']}
@app.post('/api/vessels',status_code=201)
def add_vessel(p:Vessel,user=Depends(current_user)):
    vid=secrets.token_hex(12)
    with db() as c: c.execute('INSERT INTO vessels VALUES(?,?,?,?)',(vid,user['id'],p.model_dump_json(),time.time()))
    return {'id':vid,**p.model_dump()}
@app.put('/api/vessels/{vid}')
def edit_vessel(vid:str,p:Vessel,user=Depends(current_user)):
    with db() as c:
        owned_record(c,'vessels',vid,user)
        c.execute('UPDATE vessels SET data=? WHERE id=?',(p.model_dump_json(),vid))
    return {'id':vid,**p.model_dump()}
@app.delete('/api/vessels/{vid}')
def delete_vessel(vid:str,user=Depends(current_user)):
    with db() as c:
        owned_record(c,'vessels',vid,user)
        c.execute('DELETE FROM vessels WHERE id=?',(vid,))
    return {'ok':True}
def voyage_data(p,user):
    if p.vessel_id:
        with db() as c: vessel=json.loads(owned_record(c,'vessels',p.vessel_id,user)['data'])
        if p.inputs.weight>vessel['capacity']: raise HTTPException(422,'Cargo weight exceeds vessel capacity.')
        if p.inputs.max_speed>vessel['max_speed']: raise HTTPException(422,'Planning speed exceeds vessel maximum speed.')
        if p.inputs.min_speed<(vessel.get('min_speed') or min(8,vessel['max_speed'])): raise HTTPException(422,'Planning speed is below the vessel minimum open-water speed.')
        if not math.isclose(p.inputs.fuel_per_day,vessel['fuel_per_day'],rel_tol=1e-9): raise HTTPException(422,'Planning fuel consumption must match the assigned vessel. Reapply the vessel specifications.')
    result=safe_plan(p.inputs)
    chosen=next((r for r in result['routes'] if r['id']==p.route_id),None)
    if not chosen: raise HTTPException(422,'Choose a valid route.')
    return {**p.model_dump(),'result':chosen,'data_coverage':result['data_coverage'],'data_mode':result['data_mode'],'optimization':result['optimization'],'deadline_at':result['deadline_at']}
@app.get('/api/voyages')
def voyages(limit:int=Query(20,ge=1,le=100),offset:int=Query(0,ge=0,le=1000000000),q:str=Query('',max_length=100),user=Depends(current_user)):
    return list_records('voyages',user,limit,offset,q.strip())

@app.get('/api/voyages/stats')
def voyage_stats(user=Depends(current_user)):
    weight='CAST('+json_field('inputs.weight')+' AS DOUBLE PRECISION)'
    fuel='CAST('+json_field('result.fuel')+' AS DOUBLE PRECISION)'
    protection='CAST('+json_field('result.protection')+' AS DOUBLE PRECISION)'
    assessed="LOWER(CAST("+json_field('result.whale_assessed')+" AS TEXT)) IN ('true','1')"
    ca="('la','oakland','sandiego','humboldt')"
    assessed+=' OR ('+json_field('result.whale_assessed')+' IS NULL AND '+json_field('inputs.origin')+' IN '+ca+' AND '+json_field('inputs.destination')+' IN '+ca+')'
    assessed='('+assessed+') AND '+protection+' IS NOT NULL'
    with db() as c:
        row=c.execute('SELECT COUNT(*) AS total, COALESCE(SUM('+weight+'),0) AS cargo, COALESCE(SUM('+fuel+'),0) AS fuel, COUNT(CASE WHEN '+assessed+' THEN 1 END) AS assessed, AVG(CASE WHEN '+assessed+' THEN '+protection+' END) AS protection FROM voyages WHERE user_id=?',(user['id'],)).fetchone()
    return dict(row)

@app.get('/api/voyages/{vid}')
def voyage_detail(vid:str,user=Depends(current_user)):
    with db() as c: row=owned_record(c,'voyages',vid,user)
    return {'id':row['id'],**json.loads(row['data']),'created_at':row['created_at']}
@app.post('/api/voyages',status_code=201)
def add_voyage(p:Voyage,user=Depends(current_user)):
    data=voyage_data(p,user); vid=secrets.token_hex(12); now=time.time()
    with db() as c: c.execute('INSERT INTO voyages VALUES(?,?,?,?,?)',(vid,user['id'],json.dumps(data),now,now))
    return {'id':vid,**data}
@app.put('/api/voyages/{vid}')
def edit_voyage(vid:str,p:Voyage,user=Depends(current_user)):
    with db() as c: owned_record(c,'voyages',vid,user)
    data=voyage_data(p,user)
    with db() as c: c.execute('UPDATE voyages SET data=?,updated_at=? WHERE id=?',(json.dumps(data),time.time(),vid))
    return {'id':vid,**data}
@app.delete('/api/voyages/{vid}')
def delete_voyage(vid:str,user=Depends(current_user)):
    with db() as c:
        owned_record(c,'voyages',vid,user)
        c.execute('DELETE FROM voyages WHERE id=?',(vid,))
    return {'ok':True}

if (ROOT/'dist'/'assets').exists(): app.mount('/assets',StaticFiles(directory=ROOT/'dist'/'assets'),name='assets')
@app.get('/coastline.geojson',include_in_schema=False)
def coastline(): return FileResponse(ROOT/'public'/'coastline.geojson',media_type='application/geo+json')
@app.get('/favicon.svg',include_in_schema=False)
def favicon(): return FileResponse(ROOT/'public'/'favicon.svg',media_type='image/svg+xml')
@app.get('/{path:path}',include_in_schema=False)
def frontend(path:str):
    if path.startswith('api/'): raise HTTPException(404,'API endpoint not found.')
    if (ROOT/'dist'/'index.html').exists(): return FileResponse(ROOT/'dist'/'index.html', headers={'Cache-Control': 'no-store'})
    raise HTTPException(503,'Build the frontend with npm run build, or run the Vite dev server on port 5173.')



