import { expect, test } from '@playwright/test';

test('grouped tabs and adding a task to two agents', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await page.click('[data-act="mode"][data-mode="agents"]');
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
  await page.click('[data-act="mode"][data-mode="agents"]');
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
  await page.click('[data-act="mode"][data-mode="agents"]');
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
  await page.click('[data-act="mode"][data-mode="agents"]');
  await expect(page).toHaveURL(/\/$/);
  await page.click('[data-act="mode"][data-mode="companies"]');
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
  await expect(page.locator('.gc .cd').first()).toContainText('people');
  const site = page.locator('input[data-cosite]').first();
  await site.fill('javascript:alert(1)');
  await site.blur();
  await expect(page.locator('#toast')).toContainText('https://');
  await site.fill('https://example-synthetic.vercel.app');
  await site.blur();
  await expect(page.locator('a[href="https://example-synthetic.vercel.app/"]').first()).toBeVisible();

  // HR file: review and onboarding, then a loan to a second company
  await page.click('[data-act="mode"][data-mode="agents"]');
  await page.click('.tab[data-tab="g:people"]');
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
  await page.click('[data-act="mode"][data-mode="agents"]');
  await expect(page).toHaveURL(/\/$/);
  await page.click('[data-act="mode"][data-mode="companies"]');
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

test('HR desk: raise a requisition, approve, and the build form opens pre-filled', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await page.click('[data-act="mode"][data-mode="agents"]');
  await expect(page).toHaveURL(/\/$/);
  await page.click('[data-act="mode"][data-mode="companies"]');
  await page.click('.subtab[data-tab="hr"]');
  await page.click('[data-act="rq-add"]');
  await expect(page.locator('#toast')).toContainText(/department|reason|Choose/i);
  await page.selectOption('#rq-d', 'Marketing');
  await page.selectOption('#rq-g', 'agent');
  await page.fill('#rq-r', 'Launch content is behind schedule');
  await page.click('[data-act="rq-add"]');
  await expect(page.locator('#toast')).toContainText('Requisition raised');
  await expect(page.locator('.cd', { hasText: 'Launch content is behind' })).toContainText('Skills');
  await page.locator('[data-act="rq-approve"]').first().click();
  await expect(page.locator('.modal')).toBeVisible();
  await expect(page.locator('#wx-dept')).toHaveValue('Marketing');
});

test('company names show as names, never [object Object]', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await page.click('[data-act="mode"][data-mode="agents"]');
  await expect(page).toHaveURL(/\/$/);
  await page.click('[data-act="mode"][data-mode="companies"]');
  for (const t of ['co', 'hr', 'org']) {
    await page.click('.subtab[data-tab="' + t + '"]');
    await expect(page.locator('body')).not.toContainText('[object Object]');
  }
  await page.click('.subtab[data-tab="co"]');
  await expect(page.locator('#lm-c')).not.toContainText('object');
});

test('start a new company, then add its first agent as a Leadership head', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await page.click('[data-act="mode"][data-mode="agents"]');
  await expect(page).toHaveURL(/\/$/);
  await page.click('[data-act="mode"][data-mode="companies"]');
  await page.click('.subtab[data-tab="co"]');
  await page.click('[data-act="nc-add"]');
  await expect(page.locator('#toast')).toContainText('Give the company a name');
  await page.fill('#nc-n', 'Acme Foods');
  await page.fill('#nc-p', 'Healthy snacks');
  await page.click('[data-act="nc-add"]');
  await expect(page.locator('#toast')).toContainText('Company created');
  const card = page.locator('.gc .cd', { hasText: 'Acme Foods' });
  await expect(card).toContainText('Healthy snacks');
  await card.locator('[data-act="co-first"]').click();
  await expect(page.locator('#wx-dept')).toHaveValue('Leadership');
  await expect(page.locator('#wx-sen')).toHaveValue('head');
  await expect(page.locator('body')).not.toContainText('[object Object]');
  // it can be picked on the HR desk too
  await page.keyboard.press('Escape');
});

test('main views: Companies, Projects, Agents; every repo is a company; one company per repo click', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await expect(page.locator('.modes .mode')).toHaveText([/Companies/, /Projects/, /Agents/]);
  // opens on Companies, with the master company and every repo as a company
  await expect(page.locator('.mode[aria-selected="true"]')).toContainText('Companies');
  await expect(page.locator('.cd', { hasText: 'Master company' })).toContainText('Budget allocation');
  const all = await page.locator('.gc .cd').count();
  expect(all).toBeGreaterThanOrEqual(9);
  // picking one repo shows only that company, with the master details still there
  await page.locator('.scope', { hasText: 'trvo' }).click();
  await expect(page.locator('.gc .cd')).toHaveCount(1);
  await expect(page.locator('.gc .cd')).toContainText('trvo');
  await expect(page.locator('.cd', { hasText: 'Master company' })).toBeVisible();
  // projects view lists repos
  await page.click('[data-act="mode"][data-mode="projects"]');
  await expect(page.locator('.gc .cd')).toHaveCount(1);
  await expect(page.locator('.gc .cd')).toContainText('GitHub ↗');
  await page.locator('.scope', { hasText: 'All projects' }).click();
  expect(await page.locator('.gc .cd').count()).toBeGreaterThanOrEqual(9);
  await expect(page.locator('body')).not.toContainText('[object Object]');
});

test('designation list follows department and seniority', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await page.click('.subtab[data-tab="hr"]');
  await page.selectOption('#rq-d', 'Engineering');
  await page.selectOption('#rq-g', 'agent');
  await expect(page.locator('#rq-j')).toContainText('Developer');
  await page.selectOption('#rq-d', 'Marketing');
  await expect(page.locator('#rq-j')).toContainText('Content Writer');
  await expect(page.locator('#rq-j')).not.toContainText('Developer');
  await page.selectOption('#rq-g', 'head');
  await expect(page.locator('#rq-j')).toContainText('Chief Marketing Officer');
});

test('group repos under one company: choose the repos, they leave the list as their own company', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await expect(page.locator('.mode[aria-selected="true"]')).toContainText('Companies');
  await expect(page.locator('.gc .cd').first()).toBeVisible();
  await page.waitForTimeout(500);
  const before = await page.locator('.gc .cd').count();
  expect(before).toBeGreaterThanOrEqual(9);
  await page.fill('#nc-n', 'Money Group');
  const form = page.locator('.cd', { hasText: 'Start a new company' });
  await form.locator('label.chk', { hasText: 'trvo' }).locator('input').check();
  await form.locator('label.chk', { hasText: 'pocketfund' }).locator('input').check();
  await page.click('[data-act="nc-add"]');
  await expect(page.locator('#toast')).toContainText('Company created');
  // two repos left the list and one company joined: one fewer card
  await expect(page.locator('.gc .cd')).toHaveCount(before - 1);
  const card = page.locator('.gc .cd', { has: page.locator('.cd-h b', { hasText: /^Money Group$/ }) });
  await expect(card.locator('input[data-corepo]:checked')).toHaveCount(2);
  // clicking a member repo shows its company only
  await page.locator('.scope', { hasText: 'trvo' }).click();
  await expect(page.locator('.gc .cd')).toHaveCount(1);
  await expect(page.locator('.gc .cd')).toContainText('Money Group');
  await expect(page.locator('h1')).toContainText('Money Group');
  // take one back out: it becomes its own company again
  await page.locator('.scope', { hasText: 'All projects' }).click();
  await page.locator('.gc .cd', { has: page.locator('.cd-h b', { hasText: /^Money Group$/ }) }).locator('label.chk', { hasText: 'trvo' }).locator('input').uncheck();
  await expect(page.locator('.gc .cd')).toHaveCount(before);
  await expect(page.locator('body')).not.toContainText('[object Object]');
});
