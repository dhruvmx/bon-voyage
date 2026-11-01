const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const root = process.env.BON_VOYAGE_TEST_URL || 'http://127.0.0.1:8001';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    // A deterministic three-leg route catches a permanently rotated marker.
    await page.route('**/api/plan', async (request) => {
      const response = await request.fetch(), data = await response.json();
      const coordinates = [[0, 0], [0, 1], [1, 1], [1, 0]];
      for (const route of data.routes) {
        route.coordinates = coordinates; route.hours = 3;
        route.segments = coordinates.slice(1).map((to, index) => ({ from: coordinates[index], to, hours: 1, distance: 10, speed: 10, kind: 'open', zone: null }));
      }
      await request.fulfill({ response, json: data });
    });
    await page.goto(root); await page.locator('.ship-navigation-arrow').waitFor();
    const slider = page.getByRole('slider', { name: 'Voyage progress', exact: true });
    const seek = async (value) => slider.evaluate((input, next) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, String(value));
    const heading = () => page.locator('.ship-navigation-arrow').evaluate((arrow) => Number(arrow.style.transform.match(/rotate\(([-\d.]+)deg\)/)[1]));
    const expectHeading = async (expected) => { await page.waitForFunction((angle) => {
      const transform = document.querySelector('.ship-navigation-arrow')?.style.transform || '';
      const value = Number(transform.match(/rotate\(([-\d.]+)deg\)/)?.[1]);
      return Math.abs(((value % 360) + 360) % 360 - angle) < .01;
    }, expected); };
    await expectHeading(90);
    await seek(40); await expectHeading(0);
    await seek(75); await expectHeading(270);
    const before = await page.locator('.ship-marker').getAttribute('style');
    await page.getByRole('button', { name: 'Map layers', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Alternative routes', exact: true }).uncheck();
    await expectHeading(270);
    assert.equal(await page.locator('.ship-marker').getAttribute('style'), before, 'Redraw retains position');
    await seek(32); await expectHeading(90);
    await page.getByRole('button', { name: 'Play voyage', exact: true }).click();
    await expectHeading(0);
    await page.getByRole('button', { name: 'Pause voyage', exact: true }).click();
    await seek(100); await expectHeading(270);
    await seek(0); await expectHeading(90);
    assert.equal(((await heading() % 360) + 360) % 360, 90);
    await page.screenshot({ path: '/tmp/bon-heading-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await seek(75); await expectHeading(270);
    await page.locator('.map-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/bon-heading-mobile.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: navigation arrow turns east/north/west during seeking and playback, survives layer redraw, and works on mobile.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
