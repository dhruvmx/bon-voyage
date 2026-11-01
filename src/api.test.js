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

test('Google exchange renews sessions while invalid Google credentials do not expire them', async () => {
  globalThis.window = new EventTarget();
  let events = 0; window.addEventListener('bon-voyage-session-expired', () => events++);
  const before = getSessionVersion();
  globalThis.fetch = async () => response(401);
  await assert.rejects(api('/auth/google', {method:'POST'}), error => error.status === 401);
  assert.equal(events, 0); assert.equal(getSessionVersion(), before);
  globalThis.fetch = async () => ({ok:false,status:409,json:async()=>({detail:{code:'account_link_required',message:'Connect your existing account'}})});
  await assert.rejects(api('/auth/google', {method:'POST'}), error => error.code === 'account_link_required' && error.message === 'Connect your existing account');
  globalThis.fetch = async () => response(200);
  await api('/auth/google', {method:'POST'});
  assert.equal(getSessionVersion(), before + 1);
  await api('/auth/google/mfa/enable', {method:'POST'});
  assert.equal(getSessionVersion(), before + 2);
});

test('HTML and empty successful responses report an error instead of entering app state', async () => {
  for (const json of [async()=>{throw new SyntaxError('HTML');},async()=>null,async()=>'unexpected text']) {
    globalThis.fetch=async()=>({ok:true,status:200,json});
    await assert.rejects(api('/catalog'),/invalid response/);
  }
});
test('stalled reads and stalled response bodies time out', async () => {
  const aborted=(signal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  globalThis.fetch=async(_,options)=>aborted(options.signal);
  await assert.rejects(api('/catalog',{timeoutMs:10}),/timed out/);
  globalThis.fetch=async(_,options)=>({ok:true,status:200,json:()=>aborted(options.signal)});
  await assert.rejects(api('/plan',{method:'POST',body:{},timeoutMs:10}),/timed out/);
});
test('caller cancellation stops a request without expiring a session', async () => {
  globalThis.window=new EventTarget();
  let events=0; window.addEventListener('bon-voyage-session-expired',()=>events++);
  globalThis.fetch=async(_,options)=>new Promise((_,reject)=>{
    options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  });
  const controller=new AbortController(), request=api('/plan',{method:'POST',signal:controller.signal});
  controller.abort(); await assert.rejects(request,/cancelled/); assert.equal(events,0);
});
