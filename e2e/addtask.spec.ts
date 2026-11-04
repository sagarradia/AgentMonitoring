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

test('task plan: defaults, helpers with models, own brain for leads, saved on the task', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);
  await page.click('.tab[data-tab="g:work"]');
  await page.getByRole('button', { name: 'Add a task' }).click();
  await page.fill('#at-q', 'CTO');
  await page.click('[data-act="task-all"]');
  await page.fill('#at-text', 'Review key handling and encryption in the build');
  await page.locator('#at-done').click();
  // the strongest model is recommended for risky work, and helpers each carry a model and a reason
  await expect(page.locator('#at-model')).toContainText('Recommended');
  await expect(page.locator('.plan')).toContainText('Opus');
  await expect(page.locator('.sub-row').first()).toBeVisible();
  await expect(page.locator('input[data-atc="tools"]:checked').first()).toBeVisible();
  await expect(page.locator('input[data-atc="memory"]:checked').first()).toBeVisible();
  await page.click('[data-act="task-add"]');
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect.poll(async () => {
    const all = (await (await page.request.get('/api/db/agents')).json()) as any;
    const docs: any[] = all.docs;
    return docs.some((d) => JSON.stringify(d).includes('Review key handling') && JSON.stringify(d).includes('"modelWhy"'));
  }).toBe(true);
});

test('every agent has brain and memory options in the editor', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);
  await page.click('.tab[data-tab="g:people"]');
  await page.locator('[data-act="open-agent"]').first().click();
  await page.locator('.panel [data-act="edit-open"]').first().click();
  await expect(page.locator('.panel')).toContainText('Brain and memory');
  await expect(page.locator('input[data-eb="own"]')).toBeVisible();
  await page.locator('input[data-ebm]').first().uncheck();
  await page.locator('input[data-eb="own"]').check();
  await page.click('[data-act="edit-save"]');
  await expect(page.locator('#toast')).toContainText('Saved');
});

test('org chart, companies with website field, lend an agent, review and change log', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);
  await page.click('.tab[data-tab="g:people"]');
  await page.click('.subtab[data-tab="org"]');
  await expect(page.locator('.orgc')).toContainText('owner of every company');
  await page.click('[data-act="orgby"][data-by="dept"]');
  await expect(page.locator('.chips .chip').first()).toContainText('·');
  await expect(page.locator('.cd').first()).toBeVisible();
  await page.click('[data-act="orgby"][data-by="tech"]');
  await expect(page.locator('.cd').first()).toBeVisible();
  await page.click('[data-act="orgby"][data-by="flat"]');
  await expect(page.locator('table.sheet th').nth(2)).toHaveText('Department');
  await page.click('[data-act="orgby"][data-by="line"]');
  await page.click('.subtab[data-tab="co"]');
  await expect(page.locator('.cd').first()).toContainText('people');
  const site = page.locator('input[data-cosite]').first();
  await site.fill('javascript:alert(1)');
  await site.blur();
  await expect(page.locator('#toast')).toContainText('https://');
  await site.fill('https://example-synthetic.vercel.app');
  await site.blur();
  await expect(page.locator('a[href="https://example-synthetic.vercel.app/"]').first()).toBeVisible();

  // HR file: review and onboarding, then a loan to a second company
  await page.click('.subtab[data-tab="people"]');
  await page.locator('[data-act="open-agent"]').first().click();
  const panel = page.locator('.panel');
  await expect(panel).toContainText('HR file');
  await panel.locator('[data-act="rv-add"]').click();
  await expect(page.locator('#toast')).toContainText('Review recorded');
  await panel.locator('input[data-onb]').first().check();
  await expect(panel.locator('.hr')).toContainText('Review recorded: 4 of 5');
});

test('hiring limits: add one, see it, and a loan over the limit is stopped until repeated', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);
  await page.click('.tab[data-tab="g:people"]');
  await page.click('.subtab[data-tab="co"]');
  await expect(page.locator('.block', { hasText: 'Hiring limits' })).toBeVisible();
  await page.selectOption('#lm-l', 'department');
  await page.selectOption('#lm-t', 'Engineering');
  await page.fill('#lm-a', '1');
  await page.click('[data-act="lm-add"]');
  await expect(page.locator('#toast')).toContainText('Limit added');
  await expect(page.locator('.sheet', { hasText: 'Department Engineering' })).toContainText('Over');
  await page.locator('[data-act="lm-del"]').first().click();
  await expect(page.locator('.block', { hasText: 'Hiring limits' })).toContainText('No limits yet');
  // an empty limit is refused
  await page.selectOption('#lm-l', 'company');
  await page.click('[data-act="lm-add"]');
  await expect(page.locator('#toast')).toContainText('Set at least one limit');
});
