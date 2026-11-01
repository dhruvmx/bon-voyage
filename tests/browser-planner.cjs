const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const root = process.env.BON_VOYAGE_TEST_URL || 'http://127.0.0.1:8001';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(root);
    await page.getByRole('button', { name: 'Save this passage', exact: true }).waitFor();
    await page.locator('.route-overview').waitFor();
    assert(await page.locator('.route-overview').isVisible());
    assert(await page.locator('.stats').first().isVisible());
    assert.equal(await page.locator('.planner-report .stats').count(), 0);
    assert.equal(await page.locator('.cargo-picker').isVisible(), false);
    assert.equal(await page.locator('.route-card').first().isVisible(), false);
    assert((await page.locator('.map-panel').boundingBox()).y < 700);
    assert(await page.getByLabel('Departure port', { exact: true }).isVisible());
    assert(await page.getByLabel('Destination port', { exact: true }).isVisible());
    assert(await page.getByRole('button', { name: 'Export voyage', exact: true }).isVisible());
    await page.screenshot({ path: '/tmp/planner-clean-desktop.png' });

    // Cargo discovery, custom cargo and handling controls remain available.
    await page.locator('.cargo-editor > summary').click();
    const search = page.getByRole('combobox', { name: 'Cargo manifest', exact: true });
    await search.fill('Apples');
    await page.getByRole('option').filter({ has: page.getByText('Apples', { exact: true }) }).click();
    await search.press('Escape');
    await page.getByRole('button', { name: 'Custom cargo', exact: true }).click();
    await page.getByLabel('Cargo name', { exact: true }).fill('Demo crates');
    await page.getByRole('button', { name: 'Add cargo', exact: true }).click();
    assert.equal(await page.locator('.manifest-item').count(), 3);
    await page.locator('.manifest-item').filter({ hasText: 'Apples' }).locator('summary').click();
    assert(await page.getByRole('spinbutton', { name: 'Apples weight (tonnes)', exact: true }).isVisible());
    await page.locator('.cargo-editor > summary').click();

    await page.locator('.deadline-editor > summary').click();
    const planned = page.waitForResponse((r) => r.url().endsWith('/api/plan') && r.request().postDataJSON().arrival_window === 168);
    await page.getByRole('spinbutton', { name: 'Deadline from departure (hours)', exact: true }).fill('168');
    await planned;
    assert(await page.getByRole('slider', { name: /Latest acceptable arrival/ }).isVisible());
    await page.locator('.deadline-editor > summary').click();
    await page.locator('details.advanced > summary').click();
    assert(await page.getByLabel('Assigned vessel', { exact: true }).isVisible());
    assert(await page.getByLabel('Departure (your local time)', { exact: true }).isVisible());
    assert(await page.getByLabel('Whale activity', { exact: true }).isVisible());
    await page.locator('details.advanced > summary').click();

    await page.locator('.compare-disclosure > summary').click();
    const fastest = page.locator('.route-card').filter({ has: page.getByRole('heading', { name: 'Fastest feasible arrival', exact: true }) });
    await fastest.click();
    assert.equal(await fastest.getAttribute('aria-pressed'), 'true');
    assert((await page.locator('.route-overview').innerText()).includes('Fastest feasible arrival'));
    assert(await page.locator('.route-highlight').count() > 0);
    await page.locator('.planner-report > summary').click();
    assert(await page.getByText('Fuel used', { exact: true }).isVisible());
    assert(await page.getByRole('heading', { name: 'Cargo on arrival', exact: true }).isVisible());
    assert((await page.locator('.cargo-arrival table').innerText()).includes('Demo crates'));
    assert(await page.getByLabel('Deadline and arrival estimate', { exact: true }).isVisible());
    const slider = page.getByRole('slider', { name: 'Voyage progress', exact: true });
    await slider.focus(); await slider.press('End');
    await page.getByText('Arrived at destination', { exact: true }).waitFor();
    // Export must work even when deployment changes make lazy JS chunks unavailable.
    await page.route('**/assets/*.js', (route) => route.abort());
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export voyage', exact: true }).click();
    const download = await downloading;
    const fs = require('node:fs');
    const exported = fs.readFileSync(await download.path());
    assert(download.suggestedFilename().endsWith('.pdf'));
    assert.equal(exported.subarray(0, 5).toString(), '%PDF-');
    const report = exported.toString('latin1');
    assert(report.includes('Fastest feasible arrival'));
    assert(report.includes('Demo crates'));
    assert(report.includes('VOYAGE BRIEF'));
    await page.unroute('**/assets/*.js');
    await page.locator('.planner-report > summary').click();
    await page.locator('.compare-disclosure > summary').click();

    await page.locator('.coverage-note > summary').click();
    assert(await page.getByRole('link', { name: 'About worldwide habitat coverage ↗' }).isVisible());
    await page.locator('.coverage-note > summary').click();
    // Critical warnings remain visible outside collapsed editors and reports.
    await page.locator('.deadline-editor > summary').click();
    await page.getByRole('spinbutton', { name: 'Deadline from departure (hours)', exact: true }).fill('1');
    await page.locator('.deadline-editor > summary').click();
    await page.getByText(/Deadline cannot be met\. Earliest arrival:/).waitFor();
    assert(await page.locator('.stats').first().isVisible());
    assert.equal(await page.locator('.planner-report .stats').count(), 0);
    await page.locator('.cargo-editor > summary').click();
    await page.getByRole('spinbutton', { name: 'Apples shelf life (days)', exact: true }).fill('0.01');
    await page.locator('.cargo-editor > summary').click();
    await page.getByText(/One or more cargo items have low freshness/).waitFor();
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    await page.getByLabel('Dark', { exact: true }).check();
    await page.getByRole('button', { name: 'Close appearance' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/planner-clean-dark.png' });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => scrollTo(0, 0));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert((await page.locator('.config').boundingBox()).y < (await page.locator('.map-panel').boundingBox()).y);
    await page.screenshot({ path: '/tmp/planner-clean-mobile.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: compact initial view; cargo/custom handling, deadlines, vessel settings, comparison/highlight, report/playback, export, coverage, dark mode and mobile remain available.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
