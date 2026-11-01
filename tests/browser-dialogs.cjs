const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const root = process.env.BON_VOYAGE_TEST_URL || 'http://127.0.0.1:8001';
const deferred = () => { let resolve; const promise=new Promise((r)=>{resolve=r;}); return {promise,resolve}; };
async function holdMutation(page, path, method) {
  const arrived=deferred(), release=deferred();
  const handler=async (route) => {
    if (route.request().method()!==method) return route.continue();
    const response=await route.fetch(); arrived.resolve(); await release.promise;
    await route.fulfill({response});
  };
  await page.route('**/api/'+path,handler);
  return {arrived:arrived.promise,release:async()=>{
    const completed=page.waitForResponse((r)=>r.url().endsWith('/api/'+path)&&r.request().method()===method);
    const refreshed=page.waitForResponse((r)=>r.url().includes('/api/vessels?'));
    release.resolve(); await Promise.all([completed,refreshed]);
    await page.evaluate(()=>new Promise((r)=>requestAnimationFrame(r)));
    await page.unroute('**/api/'+path,handler);
  }};
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
  try {
    const context=await browser.newContext({reducedMotion:'reduce'}), page=await context.newPage();
    const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
    const signup=await page.request.post(root+'/api/auth/signup',{data:{name:'Dialog Operator',email:`dialogs-${Date.now()}@example.com`,password:'dialog-test-password'}});
    assert.equal(signup.status(),201);
    const ship=await (await page.request.post(root+'/api/vessels',{data:{name:'Original ship'}})).json();
    await page.goto(root);await page.getByRole('button',{name:'My fleet',exact:true}).click();
    const save=await holdMutation(page,'vessels/'+ship.id,'PUT');
    await page.getByRole('button',{name:'Edit Original ship',exact:true}).click();
    await page.getByLabel('Vessel name',{exact:true}).fill('Edited ship');
    await page.getByRole('button',{name:'Save vessel',exact:true}).click();await save.arrived;
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    await page.getByRole('button',{name:'Add vessel',exact:true}).click();
    await page.getByLabel('Vessel name',{exact:true}).fill('New vessel draft');await save.release();
    assert.equal(await page.getByLabel('Vessel name',{exact:true}).inputValue(),'New vessel draft');
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    const deletion=await holdMutation(page,'vessels/'+ship.id,'DELETE');
    await page.getByRole('button',{name:'Remove Edited ship',exact:true}).click();
    await page.getByRole('button',{name:'Remove',exact:true}).click();await deletion.arrived;
    assert(await page.getByRole('button',{name:'Removing…',exact:true}).isDisabled());
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    await page.getByRole('button',{name:'Add vessel',exact:true}).click();
    await page.getByLabel('Vessel name',{exact:true}).fill('Another unsaved vessel');await deletion.release();
    assert.equal(await page.getByLabel('Vessel name',{exact:true}).inputValue(),'Another unsaved vessel');
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    console.log('PASS: delayed vessel saves/deletions preserve newer dialogs; pending deletion disables duplicate submission.');

    const voyages=[];
    for(const name of ['First passage','Second passage']) {
      const response=await page.request.post(root+'/api/voyages',{data:{name,inputs:{departure:'2026-11-01T00:00:00Z'}}});
      assert.equal(response.status(),201);voyages.push(await response.json());
    }
    await page.getByRole('button',{name:'My voyages',exact:true}).click();
    await page.getByRole('button',{name:'Refresh voyages',exact:true}).click();
    const first=page.locator('.saved-card').filter({has:page.getByRole('heading',{name:'First passage',exact:true})});
    await first.getByRole('button',{name:'Open & edit',exact:true}).click();
    await page.getByRole('button',{name:'Update saved voyage',exact:true}).waitFor();
    await page.getByRole('button',{name:'My voyages',exact:true}).click();
    const removeVoyage=await holdMutation(page,'voyages/'+voyages[0].id,'DELETE');
    await page.getByRole('button',{name:'Delete First passage',exact:true}).click();
    await page.getByRole('button',{name:'Remove',exact:true}).click();await removeVoyage.arrived;
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    await page.locator('.saved-card').filter({has:page.getByRole('heading',{name:'Second passage',exact:true})}).getByRole('button',{name:'Open & edit',exact:true}).click();
    await page.getByRole('button',{name:'Update saved voyage',exact:true}).waitFor();await removeVoyage.release();
    await page.getByRole('button',{name:'Update saved voyage',exact:true}).click();
    assert.equal(await page.getByLabel('Voyage name',{exact:true}).inputValue(),'Second passage');
    const updated=page.waitForResponse((r)=>r.url().endsWith('/api/voyages/'+voyages[1].id)&&r.request().method()==='PUT');
    await page.getByRole('button',{name:'Update voyage',exact:true}).click();assert.equal((await updated).status(),200);
    await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    assert.equal((await (await page.request.get(root+'/api/voyages')).json()).total,1);
    console.log('PASS: deleting a previous voyage cannot clear the newly opened voyage’s edit target.');

    const broken=await context.newPage();broken.on('pageerror',(e)=>errors.push(e.message));
    await broken.route('**/api/catalog',(r)=>r.fulfill({status:200,contentType:'text/html',body:'<html>Proxy error</html>'}));
    await broken.goto(root);await broken.getByText(/The server returned an invalid response/).waitFor();
    assert(await broken.getByRole('button',{name:'Reconnect',exact:true}).isVisible());
    assert.deepEqual(errors,[]);
    console.log('PASS: malformed successful responses show recovery instead of crashing the app.');
  } finally {await browser.close();}
})().catch((error)=>{console.error(error);process.exitCode=1;});
