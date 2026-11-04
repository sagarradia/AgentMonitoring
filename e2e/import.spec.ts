import { expect, test } from '@playwright/test';

/* The import card on the Connections tab merges a data file into the store (synthetic data here). */
test('importing a data file adds the progress record and keeps edits', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await page.click('[data-act="mode"][data-mode="agents"]');
  await page.locator('.tabs').waitFor();
  await page.click('.tab[data-tab="connect"]');
  const file = { agents: { fv_cto: { id: 'fv_cto', name: 'Renamed in file', progress: { asOf: '2026-11-02', assigned: 4, done: 1, open: 3, pct: 25, reasons: ['synthetic reason'] } } }, meta: { report: { headline: 'Synthetic headline', sub: '', facts: [], needsYou: [] } } };
  const done = page.waitForResponse((r) => r.url().endsWith('/api/import') && r.request().method() === 'POST');
  await page.setInputFiles('#imp-file', { name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  expect((await done).status()).toBe(200);
  const doc = await (await page.request.get('/api/db/agents/fv_cto')).json();
  expect(doc.data.progress.pct).toBe(25);
  expect(doc.data.name).not.toBe('Renamed in file');
  const rep = await (await page.request.get('/api/db/meta/report')).json();
  expect(rep.data.headline).toBe('Synthetic headline');
  expect((await page.request.post('/api/import', { data: { nope: 1 } })).status()).toBe(400);
});
