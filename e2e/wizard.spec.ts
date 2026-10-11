import { expect, test } from '@playwright/test';

test('wizard pre-selects options from the task and saves the choices on the new agent', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await page.locator('table.sheet').waitFor();

  await page.click('header [data-act="wizard-open"]');
  await page.fill('#w-task', 'review pull requests and fix bugs');
  const box = (kind: string, label: string) => page.locator(`input[data-wcheck="${kind}"][value="${label}"]`);
  await expect(box('tools', 'GitHub')).toBeChecked();
  await expect(box('tools', 'Gmail')).not.toBeChecked();
  await expect(box('approvals', 'Merging or deploying code')).toBeChecked();

  await box('tools', 'Slack').uncheck();
  await box('tools', 'Google Calendar').check();
  await page.fill('#wx-other', 'Sentry');
  await page.selectOption('#wx-cadence', 'Daily');
  await page.fill('#wx-notes', 'Keep pull requests small');

  await page.click('[data-act="wiz-template"]');
  const tools = await page.locator('#wf-tools').inputValue();
  expect(tools).toContain('GitHub');
  expect(tools).toContain('Google Calendar');
  expect(tools).toContain('Sentry');
  expect(tools).not.toContain('Slack');
  await expect(page.locator('#wf-mustNot')).toHaveValue(/Merging or deploying code without the owner's approval/);

  const saved = page.waitForResponse((r) => r.url().includes('/api/db/agents/') && r.request().method() === 'PUT');
  await page.click('[data-act="wiz-create"]');
  const id = decodeURIComponent((await saved).url().split('/').pop()!);
  const doc = (await (await page.request.get(`/api/db/agents/${id}`)).json()).data;
  expect(doc.tools).toEqual(expect.arrayContaining(['GitHub', 'Google Calendar', 'Sentry']));
  expect(doc.mustNot).toContain("Merging or deploying code without the owner's approval");
  expect(doc.routines[0]).toMatchObject({ cadence: 'Daily', state: 'planned' });
  expect(doc.memory[0].text).toBe('Keep pull requests small');
  await expect(page.locator('.panel')).toContainText('Must not');

  // Clean up so other tests see the seeded roster.
  await page.request.delete(`/api/db/agents/${id}`);
});
