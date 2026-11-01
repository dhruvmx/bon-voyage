const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const root = process.env.BON_VOYAGE_TEST_URL || 'http://127.0.0.1:8001';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(root);
    await page.locator('.intro').waitFor();
    // Compare both halves before and after the staff has reached its raised pose.
    const at = (time) => page.evaluate((ms) => {
      document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; });
      const x = (selector) => new DOMMatrix(getComputedStyle(document.querySelector(selector)).transform).m41;
      return { left: x('.intro-sea-left'), right: x('.intro-sea-right'), arm: getComputedStyle(document.querySelector('.intro-staff-arm')).transform };
    }, time);
    const before = await at(1000), after = await at(3300);
    assert.equal(before.left, 0); assert.equal(before.right, 0);
    assert(after.left < 0 && after.right > 0);
    assert.notEqual(before.arm, after.arm);
    assert(await page.locator('main').evaluate((e) => e.inert));
    await page.getByRole('button', { name: 'Skip intro' }).press('Escape');
    assert.equal(await page.locator('.intro').count(), 0);
    assert.equal(await page.locator('main').evaluate((e) => e.inert), false);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('intro-active')), false);

    // Every refresh still replays; the normal sequence releases the workspace.
    await page.reload();
    await page.locator('.intro').waitFor();
    await page.locator('.intro').waitFor({ state: 'detached', timeout: 7000 });
    assert.equal(await page.locator('main').evaluate((e) => e.inert), false);

    for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
      await page.setViewportSize(viewport); await page.reload();
      await page.locator('.intro').waitFor(); await at(3300);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const figure = await page.locator('.intro-moses').boundingBox();
      assert(figure.x >= 0 && figure.x + figure.width <= viewport.width);
      await page.getByRole('button', { name: 'Skip intro' }).click();
      assert.equal(await page.locator('.intro').count(), 0);
    }
    await page.reload(); await page.locator('.intro').waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.intro').waitFor({ state: 'detached' });
    await page.reload();
    assert.equal(await page.locator('.intro').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: staff/sea timing, opposite sea motion, Escape/Skip, replay, completion, interaction restoration, portrait/landscape, and reduced motion.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
