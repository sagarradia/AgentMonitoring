import { expect, test } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const AGENT = 'fv_cto';
const NEW_DUE = '2026-12-24';

test('seeded roster loads, an agent expands, an edited due date survives a reload', async ({ page }) => {
  // Everything sits behind the login.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);

  // Seeded roster: all 39 agents have their own row, without expanding anything.
  await expect(page.locator('.strip .v').first()).toContainText('39');
  await expect(page.locator('table.sheet tr.r-agent')).toHaveCount(39);
  await expect(page.locator('.rail .scope').first()).toContainText('39 agents');

  // Expand the CTO row: its goals, KPIs and todos appear as sub-rows.
  const caret = page.locator(`button.caret[data-id="${AGENT}"]`);
  await expect(caret).toHaveAttribute('aria-expanded', 'false');
  await caret.click();
  await expect(page.locator(`button.caret[data-id="${AGENT}"]`)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('table.sheet tr.r-agent')).toHaveCount(39);
  const due = page.locator(`#d-todo-${AGENT}-0`);
  await expect(due).toBeVisible();

  // Edit the first todo's due date; wait for the save to reach the server.
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/db/agents/${AGENT}`) && r.request().method() === 'PUT');
  await due.fill(NEW_DUE);
  expect((await saved).status()).toBe(200);
  await expect(page.locator(`#d-todo-${AGENT}-0`)).toHaveValue(NEW_DUE);

  // Reload: expand again (expansion is view state, as before) and the date is still there.
  await page.reload();
  await expect(page.locator('table.sheet tr.r-agent')).toHaveCount(39);
  await page.locator(`button.caret[data-id="${AGENT}"]`).click();
  await expect(page.locator(`#d-todo-${AGENT}-0`)).toHaveValue(NEW_DUE);

  // And it is in the store, not only in the page.
  const doc = await (await page.request.get(`/api/db/agents/${AGENT}`)).json();
  expect(doc.data.todos[0].due).toBe(NEW_DUE);
});
