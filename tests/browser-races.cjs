/* Run against the isolated local test server documented in README.md. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const root = process.env.BON_VOYAGE_TEST_URL || 'http://127.0.0.1:8001';
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const nextFrame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: true, args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const email = `regression-${Date.now()}@example.com`;
    const password = 'regression-password-123';
    const signup = await page.request.post(root + '/api/auth/signup', {
      data: { name: 'Regression Operator', email, password },
    });
    assert.equal(signup.status(), 201);
    await page.goto(root);

    // The server completes the original save, but its response is held while
    // the operator closes the dialog and creates a different draft.
    const saveArrived = deferred(), releaseSave = deferred();
    let originalId;
    await page.route('**/api/voyages', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      if (!originalId) {
        originalId = (await response.json()).id;
        saveArrived.resolve();
        await releaseSave.promise;
      }
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Save this passage', exact: true }).click();
    await page.getByLabel('Voyage name', { exact: true }).fill('Original passage');
    await page.getByRole('button', { name: 'Save voyage', exact: true }).click();
    await saveArrived.promise;
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'My voyages', exact: true }).click();
    await page.getByRole('button', { name: 'New voyage', exact: true }).click();
    const completedSave = page.waitForResponse((r) => r.url().endsWith('/api/voyages') && r.request().method() === 'POST');
    releaseSave.resolve();
    await completedSave;
    await nextFrame(page);
    assert.equal(await page.getByRole('button', { name: 'Update saved voyage', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Save this passage', exact: true }).click();
    await page.getByLabel('Voyage name', { exact: true }).fill('New draft passage');
    const newSave = page.waitForResponse((r) => r.url().endsWith('/api/voyages') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save voyage', exact: true }).click();
    assert.notEqual((await (await newSave).json()).id, originalId);
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    const original = await (await page.request.get(root + '/api/voyages/' + originalId)).json();
    assert.equal(original.name, 'Original passage');
    assert.equal((await (await page.request.get(root + '/api/voyages')).json()).total, 2);
    console.log('PASS: a delayed save cannot attach its ID to, or overwrite, a new draft.');

    // Fail an old request only after a successful new login for the same user.
    const errorArrived = deferred(), releaseError = deferred();
    let held = false;
    await page.route('**/api/voyages?**', async (route) => {
      if (held) return route.continue();
      held = true; errorArrived.resolve();
      await releaseError.promise;
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Expired old session"}' });
    });
    await page.getByRole('button', { name: 'My voyages', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh voyages', exact: true }).click();
    await errorArrived.promise;
    await page.getByRole('button', { name: 'Open profile', exact: true }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.locator('dialog form').getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('button', { name: 'Open profile', exact: true }).waitFor();
    const oldError = page.waitForResponse((r) => r.status() === 401 && r.url().includes('/api/voyages?'));
    releaseError.resolve();
    await oldError;
    await nextFrame(page);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal((await page.request.get(root + '/api/auth/me')).status(), 200);
    console.log('PASS: an old 401 cannot expire the renewed login.');

    // Genuine expiry still opens login and keeps the draft.
    await page.context().clearCookies();
    await page.getByRole('button', { name: 'My voyages', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh voyages', exact: true }).click();
    await page.getByRole('heading', { name: 'Good to have you back.', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    console.log('PASS: current-session expiry still prompts login.');

    // Fastest route has a rounded duration above the sum of its segment times.
    const fastest = page.locator('.route-card').filter({ has: page.getByRole('heading', { name: 'Fastest feasible arrival', exact: true }) });
    await fastest.click();
    const slider = page.getByRole('slider', { name: 'Voyage progress', exact: true });
    await slider.focus(); await slider.press('Home'); await nextFrame(page);
    const start = await page.locator('.ship-marker').getAttribute('style');
    await slider.press('End');
    await page.getByText('Arrived at destination', { exact: true }).waitFor();
    await nextFrame(page);
    assert.notEqual(await page.locator('.ship-marker').getAttribute('style'), start);
    await slider.press('Home'); await nextFrame(page);
    assert.equal(await page.locator('.ship-marker').getAttribute('style'), start);
    assert.deepEqual(pageErrors, []);
    console.log('PASS: jumping to arrival moves the ship, rewinding returns to departure, and no page errors occurred.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
