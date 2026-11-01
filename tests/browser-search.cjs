const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const root = process.env.BON_VOYAGE_TEST_URL || 'http://127.0.0.1:8001';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.goto(root);
    await page.getByRole('button', { name: 'Save this passage', exact: true }).waitFor();
    const search = page.getByRole('combobox', { name: 'Search features, ports, cargo and saved records', exact: true });
    const open = async (term) => { await page.getByRole('button', { name: 'Search workspace', exact: true }).click(); await search.fill(term); };
    await open('arrive shanghai');
    await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Arrive at Shanghai' }).waitFor();
    await search.press('Enter');
    await page.waitForFunction(() => document.querySelector('.port-pickers label:nth-of-type(2) select')?.selectedOptions[0].textContent.includes('Shanghai'));
    assert.notEqual(await page.getByLabel('Departure port', { exact: true }).inputValue(), await page.getByLabel('Destination port', { exact: true }).inputValue());
    await open('apples');
    await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: /^Add Apples/ }).click();
    await page.locator('.manifest-item').filter({ hasText: 'Apples' }).waitFor();
    assert.equal(await page.locator('.manifest-item').count(), 2);
    await open('apples'); await search.press('Enter');
    assert.equal(await page.locator('.manifest-item').count(), 2);
    const catalog = await (await page.request.get(root + '/api/catalog')).json();
    for (const product of catalog.cargo_products.filter((p) => !['Avocados', 'Apples'].includes(p.name)).slice(0, 8)) {
      await open(product.name);
      await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ has: page.getByText(`Add ${product.name}`, { exact: true }) }).click();
      await page.waitForFunction((name) => Array.from(document.querySelectorAll('.manifest-item')).some((item) => item.textContent.includes(name)), product.name);
    }
    assert.equal(await page.locator('.manifest-item').count(), 10);
    await open('coffee'); await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Add Coffee' }).first().click();
    assert.equal(await page.locator('.manifest-item').count(), 10);
    await open('compare routes'); await search.press('Enter');
    await page.waitForFunction(() => document.querySelector('.compare-disclosure')?.open);
    await open('map layers'); await search.press('Enter'); await page.locator('.layer-menu').waitFor();
    await open('dark mode'); await search.press('Enter');
    await page.waitForFunction(() => document.documentElement.dataset.mode === 'dark');
    await open('zzzz-nothing-matches'); await page.getByText('No matches. Try a port, cargo name, or feature like “compare”.').waitFor();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await search.press('ArrowDown'); assert(await search.getAttribute('aria-activedescendant'));
    await search.press('Escape');
    await search.waitFor({ state: 'hidden' });
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Control+k'); await search.waitFor({ state: 'visible' });
      await search.fill('compare');
      await search.press('Escape'); await search.waitFor({ state: 'hidden' });
    }
    console.log('PASS: live suggestions set ports, add cargo without duplicates, open controls, change themes and support keyboard navigation.');

    const signup = await page.request.post(root + '/api/auth/signup', { data: { name: 'Search Operator', email: `search-${Date.now()}@example.com`, password: 'search-test-password' } });
    assert.equal(signup.status(), 201);
    for (let i = 0; i < 22; i++) {
      const response = await page.request.post(root + '/api/vessels', { data: { name: `Searchable vessel ${String(i).padStart(2, '0')}`, max_speed: 18, min_speed: 9 } });
      assert.equal(response.status(), 201);
    }
    const voyage = await page.request.post(root + '/api/voyages', { data: { name: 'Hidden archive passage', inputs: { departure: '2026-11-02T06:00:00Z' } } });
    assert.equal(voyage.status(), 201);
    await page.reload(); await page.getByRole('button', { name: 'Open profile', exact: true }).waitFor();
    await open('searchable');
    await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Searchable vessel' }).first().waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Searchable vessel' }).count(), 10);
    await page.getByRole('button', { name: 'More matching vessels', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.workspace-search-option').length === 20);
    await page.getByRole('button', { name: 'More matching vessels', exact: true }).click();
    await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Searchable vessel 00' }).waitFor();
    await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Searchable vessel 00' }).click();
    await page.waitForFunction(() => document.querySelector('details.advanced')?.open);
    assert.equal(await page.getByLabel('Assigned vessel', { exact: true }).locator('option:checked').textContent(), 'Searchable vessel 00');
    const allShips = await (await page.request.get(root + '/api/vessels?limit=100')).json();
    const firstShip = allShips.items.find((ship) => ship.name === 'Searchable vessel 01');
    let releaseAssignment, reachedAssignment;
    const assignmentGate = new Promise((resolve) => { releaseAssignment = resolve; });
    const assignmentStarted = new Promise((resolve) => { reachedAssignment = resolve; });
    await page.route('**/api/vessels/' + firstShip.id, async (route) => {
      const response = await route.fetch(); reachedAssignment(); await assignmentGate; await route.fulfill({ response });
    });
    await open('Searchable vessel 01');
    await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Searchable vessel 01' }).click();
    await assignmentStarted;
    await page.getByLabel('Assigned vessel', { exact: true }).selectOption({ label: 'Searchable vessel 02' });
    const completedAssignment = page.waitForResponse((response) => response.url().endsWith('/api/vessels/' + firstShip.id));
    releaseAssignment(); await completedAssignment;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByLabel('Assigned vessel', { exact: true }).locator('option:checked').textContent(), 'Searchable vessel 02');
    await page.unroute('**/api/vessels/' + firstShip.id);
    await open('hidden archive');
    await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Hidden archive passage' }).click();
    await page.getByRole('button', { name: 'Update saved voyage', exact: true }).waitFor();
    console.log('PASS: authenticated search finds and opens saved voyages and vessels across all pages.');

    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let arrived;
    const started = new Promise((resolve) => { arrived = resolve; });
    await page.route('**/api/vessels?*', async (route) => {
      if (new URL(route.request().url()).searchParams.get('q') !== 'searchable') return route.continue();
      const response = await route.fetch(); arrived(); await held; await route.fulfill({ response });
    });
    await open('searchable'); await started;
    await search.fill('compare routes'); release();
    await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Compare routes' }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Searchable vessel' }).count(), 0);
    await search.press('Escape'); await page.unroute('**/api/vessels?*');
    await page.getByRole('button', { name: 'Open profile', exact: true }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await open('searchable'); assert.equal(await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Searchable vessel' }).count(), 0);
    await search.press('Escape');
    console.log('PASS: late query responses and signed-out sessions cannot display private stale search results.');

    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await open('cargo');
      assert(await search.isVisible());
      assert(await page.getByRole('dialog', { name: 'Search workspace', exact: true }).getByRole('option').filter({ hasText: 'Cargo manifest' }).isVisible());
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `No horizontal overflow at ${width}px`);
      if (width === 390) await page.screenshot({ path: '/tmp/bon-search-mobile.png' });
      if (width === 1440) await page.screenshot({ path: '/tmp/bon-search-desktop.png' });
      await search.press('Escape');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: search works at phone, tablet and laptop sizes without horizontal overflow or runtime errors.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
