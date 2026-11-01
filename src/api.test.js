import test from 'node:test';
import assert from 'node:assert/strict';
import { api, getSessionVersion } from './api.js';
const response = (status) => ({ok:status<400,status,json:async()=>status===401?{detail:'Expired'}:{id:'same-user'}});

test('a previous session 401 cannot expire a renewed login for the same user', async () => {
  globalThis.window = new EventTarget();
  let events=0; window.addEventListener('bon-voyage-session-expired',()=>events++);
  let finishOld;
  globalThis.fetch = async (path) => path==='/api/voyages' ? new Promise(resolve=>finishOld=resolve) : response(200);
  const old = api('/voyages');
  const before = getSessionVersion();
  await api('/auth/logout',{method:'POST'});
  await api('/auth/login',{method:'POST'});
  assert(getSessionVersion()>before);
  finishOld(response(401));
  await assert.rejects(old,e=>e.status===401&&e.staleSession);
  assert.equal(events,0);
});
test('current-session expiry fires once for multiple pending failed requests', async () => {
  globalThis.window = new EventTarget();
  let events=0; window.addEventListener('bon-voyage-session-expired',()=>events++);
  const finish=[];
  globalThis.fetch = async () => new Promise(resolve=>finish.push(resolve));
  const first=api('/voyages'), second=api('/vessels');
  finish[0](response(401)); await assert.rejects(first,e=>e.status===401);
  finish[1](response(401)); await assert.rejects(second,e=>e.staleSession);
  assert.equal(events,1);
});
test('incorrect passwords do not expire the session or renew its version', async () => {
  globalThis.window = new EventTarget();
  let events=0; window.addEventListener('bon-voyage-session-expired',()=>events++);
  globalThis.fetch = async () => response(401);
  const before=getSessionVersion();
  await assert.rejects(api('/auth/login',{method:'POST'}),e=>e.status===401);
  assert.equal(events,0); assert.equal(getSessionVersion(),before);
});
