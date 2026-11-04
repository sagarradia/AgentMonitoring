import { expect, test } from '@playwright/test';

test('grouped tabs and adding a task to two agents', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);

  // six top tabs, sub-tabs appear for a group
  await expect(page.locator('.tabs .tab')).toHaveCount(6);
  await page.click('.tab[data-tab="g:work"]');
  await expect(page.locator('.subtab')).toHaveCount(2);

  await page.getByRole('button', { name: 'Add a task' }).click();
  await page.fill('#at-text', 'Synthetic check task');
  await page.click('[data-act="task-add"]');
  await expect(page.locator('#toast')).toContainText('Choose who');

  await page.fill('#at-q', 'Chief');
  await page.click('[data-act="task-all"]');
  await page.click('[data-act="task-add"]');
  await expect(page.locator('.modal')).toHaveCount(0);

  await expect.poll(async () => {
    const r = await page.request.get('/api/db/agents/fv_chief-of-staff');
    return JSON.stringify(await r.json()).includes('Synthetic check task');
  }).toBe(true);
});
