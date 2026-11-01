const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const root = process.env.BON_VOYAGE_TEST_URL || 'http://127.0.0.1:8001';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
 try {
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  const errors=[];page.on('pageerror', (e)=>errors.push(e.message));
  await page.goto(root);await page.getByRole('button',{name:'Save this passage',exact:true}).waitFor();
  await page.locator('.cargo-editor > summary').click();
  const search=page.getByRole('combobox',{name:'Cargo manifest',exact:true});
  await search.fill('Apples');await page.getByRole('option').filter({has:page.getByText('Apples',{exact:true})}).click();
  assert.equal(await page.locator('.cargo-dropdown').count(),0,'Dropdown must not cover selected cargo');
  const apples=page.locator('.manifest-item').filter({hasText:'Apples'});
  await apples.locator('summary').focus();await apples.locator('summary').press('Enter');
  const weight=page.getByLabel('Apples weight (tonnes)',{exact:true});
  await weight.fill('0.125');await weight.press('Tab');
  assert.equal(await weight.inputValue(),'0.125');
  const life=page.getByLabel('Apples shelf life (days)',{exact:true});
  await life.fill('0.1234567');assert.equal(await life.inputValue(),'0.1234567');await life.press('Tab');
  assert(Math.abs(Number(await life.inputValue())-.1234567)<1e-12);
  // Restore a viable shelf life and compare displayed values to server calculations.
  await life.fill('30');await life.press('Tab');
  await page.locator('.deadline-editor > summary').click();
  const response=page.waitForResponse((r)=>r.url().endsWith('/api/plan')&&r.request().postDataJSON().arrival_window===168&&r.status()===200);
  await page.getByRole('spinbutton',{name:'Deadline from departure (hours)',exact:true}).fill('168');
  const data=await (await response).json(), route=data.routes.find((r)=>r.id===data.recommended);
  await page.waitForFunction(()=>document.querySelector('.dashboard-status')?.textContent==='Simulation');
  assert(route.hours<168);assert.equal(data.deadline_hours,168);
  assert((await page.locator('.deadline-editor').innerText()).includes('Sailing:'));
  assert(Math.abs(route.segments.reduce((sum,s)=>sum+s.fuel,0)-route.fuel)<.0001);
  const slider=page.getByRole('slider',{name:'Voyage progress',exact:true});await slider.focus();await slider.press('End');
  await page.getByText('Arrived at destination',{exact:true}).waitFor();
  assert.equal(await page.locator('.voyage-dashboard .stat-number').nth(1).innerText(),'0.0hrs');
  assert.equal(parseFloat(await page.locator('.voyage-dashboard .stat-number').nth(2).innerText()),Number(route.segments.reduce((sum,s)=>sum+s.fuel,0).toFixed(2)));
  // Editing must not leave the previous route's numbers presented as current.
  let release;const gate=new Promise((r)=>{release=r;});
  await page.route('**/api/plan',async(r)=>{await gate;await r.continue();});
  await weight.fill('12.5');
  await page.waitForFunction(()=>document.querySelectorAll('.voyage-dashboard .stat-number')[2]?.textContent.includes('—'));
  release();await page.waitForFunction(()=>document.querySelector('.dashboard-status')?.textContent==='Simulation');
  await page.unroute('**/api/plan');
  for (const width of [320,390,1440]) {
   await page.setViewportSize({width,height:900});
   await weight.scrollIntoViewIfNeeded();
   assert(await weight.isVisible());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const bounds=await weight.boundingBox();assert(bounds.width>=130,`Usable weight field at ${width}px`);
   await apples.locator('summary').click();assert.equal(await weight.isVisible(),false);
   await apples.locator('summary').click();assert(await weight.isVisible());
   if(width===390)await page.screenshot({path:'/tmp/bon-manifest-mobile.png'});
  }
  await page.getByRole('button',{name:'Remove Apples',exact:true}).click();assert.equal(await apples.count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: cargo rows open by mouse/keyboard, decimal fields stay editable, allowance is a ceiling, fuel matches segments, stale values clear, and mobile layout fits.');
 } finally {await browser.close();}
})().catch((e)=>{console.error(e);process.exitCode=1;});
