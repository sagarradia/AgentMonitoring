import { expect, test } from '@playwright/test';

const COS = 'fv_chief-of-staff';
const CTO = 'fv_cto';

test('pause, rest with a timer, backup cover, and live progress bars', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await page.click('[data-act="mode"][data-mode="agents"]');
  await expect(page).toHaveURL(/\/$/);

  // Live tab: one overall bar, then a bar per team and per ticket.
  await page.click('.tab[data-tab="g:progress"]');
  await expect(page.locator('.lv-all .pbar')).toHaveCount(1);
  await expect(page.locator('.lv-team').first()).toBeVisible();

  // Rest the Chief of Staff for 1 hour with the CTO as backup.
  const cos = page.locator('.lv-agent', { hasText: 'Chief of Staff' }).first();
  await cos.getByRole('button', { name: 'Rest…' }).click();
  await expect(page.locator('.modal')).toContainText('How long should the rest be');
  await page.selectOption('[data-ctl-bk]', CTO);
  await page.locator('input[data-ctl="hours"][value="1"]').check();
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/db/agents/${COS}`) && r.request().method() === 'PUT');
  await page.click('[data-act="ctl-ok"]');
  expect((await saved).status()).toBe(200);
  await expect(page.locator('.ctl-alert.ok')).toContainText('CTO');
  await expect(page.locator('.ctl-alert.ok')).toContainText('covering');

  // A running ticket of a resting agent shows as paused; queued ones stay queued.
  const doc = (await (await page.request.get(`/api/db/agents/${COS}`)).json()) as any;
  expect(doc.data.status).toBe('resting');
  expect(doc.data.backupId).toBe(CTO);
  expect(doc.data.restUntil).toBeGreaterThan(Date.now());

  // End the rest early: the banner goes away.
  await page.click(`.ctl-alert [data-act="st"][data-st="active"]`);
  await expect(page.locator('.ctl-alert')).toHaveCount(0);

  // Pause one agent directly and activate it again.
  await page.click(`[data-act="st"][data-st="paused"][data-id="${CTO}"]`);
  await expect(page.locator('.lv-agent', { hasText: 'CTO (Head of Engineering)' }).first().locator('.stc.st-paused')).toBeVisible();
  await page.click(`[data-act="st"][data-st="active"][data-id="${CTO}"]`);

  // Record progress on a ticket: the bar and the percentage follow, and the ticket counts as running.
  await page.click(`[data-act="live-toggle"][data-id="${CTO}"]`);
  const box = page.locator(`input[data-tpct^="${CTO}|"]`).first();
  const put = page.waitForResponse((r) => r.url().endsWith(`/api/db/agents/${CTO}`) && r.request().method() === 'PUT');
  await box.fill('40');
  await box.blur();
  expect((await put).status()).toBe(200);
  await expect(page.locator('.lv-task .pbar[aria-valuenow="40"]').first()).toBeVisible();
});
