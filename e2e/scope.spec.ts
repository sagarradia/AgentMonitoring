import { expect, test } from '@playwright/test';
import { deflateRawSync } from 'node:zlib';

const FV = 'Skybirds-Empyrean-Avenue__familyvault';
const CTO = 'fv_cto';
const COS = 'fv_chief-of-staff';

function zip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const nm = Buffer.from(name), raw = Buffer.from(text), data = deflateRawSync(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

test('shared todo: widen, leave one out, narrow; give and remove on a person; add skills from a zip', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);
  const agents = async () => ((await (await page.request.get('/api/db/agents')).json()) as any).docs.map((d: any) => ({ id: d.id, ...d.data }));
  const withShared = async () => (await agents()).filter((a: any) => (a.todos || []).some((t: any) => t.sharedId));

  // Add a shared todo for the whole FamilyVault project, leaving the CTO out.
  await page.click('.tab[data-tab="caps"]');
  await page.click('[data-act="cap-tab"][data-sub="shared"]');
  await page.click('[data-act="x-new"][data-skind="todo"]');
  await page.fill('#xf-text', 'Check your open pull requests');
  await page.check(`input[data-xs="projects"][value="${FV}"]`);
  await page.check(`input[data-xs="except"][value="${CTO}"]`);
  await expect(page.locator('.panel .hint[aria-live]')).toContainText('37 of 39');
  await page.click('[data-act="x-save"]');
  await expect(page.locator('#toast')).toContainText('added 37');
  await expect.poll(async () => (await withShared()).length).toBe(37);
  expect((await withShared()).some((a: any) => a.id === CTO)).toBe(false);

  // Widen: lift the exception. The CTO gets a copy.
  await page.click('[data-act="x-edit"][data-kind="shared"]');
  await page.uncheck(`input[data-xs="except"][value="${CTO}"]`);
  await page.click('[data-act="x-save"]');
  await expect(page.locator('#toast')).toContainText('added 1');
  await expect.poll(async () => (await withShared()).length).toBe(38);

  // The Chief of Staff starts the work, then the scope is narrowed to nobody in the project but the CTO.
  const cos = (await agents()).find((a: any) => a.id === COS);
  await page.request.put(`/api/db/agents/${COS}`, { data: { ...cos, id: undefined, todos: cos.todos.map((t: any) => (t.sharedId ? { ...t, status: 'doing' } : t)) } });
  await page.reload();
  await page.click('.tab[data-tab="caps"]');
  await page.click('[data-act="cap-tab"][data-sub="shared"]');
  await page.click('[data-act="x-edit"][data-kind="shared"]');
  await page.uncheck(`input[data-xs="projects"][value="${FV}"]`);
  await page.check(`input[data-xs="people"][value="${CTO}"]`);
  await page.click('[data-act="x-save"]');
  await expect(page.locator('#toast')).toContainText('removed 36');
  await expect(page.locator('#toast')).toContainText('1 kept');
  await expect.poll(async () => (await withShared()).map((a: any) => a.id)).toEqual([CTO]);
  const kept = (await agents()).find((a: any) => a.id === COS).todos.find((t: any) => t.status === 'doing' && /kept/.test(t.note || ''));
  expect(kept).toBeTruthy();

  // On a person's card: remove a guardrail for one person, then give it back.
  await page.click('.tab[data-tab="g:people"]');
  await page.click(`[data-act="dirsel"][data-id="${CTO}"]`);
  const ap = page.locator('.ap');
  await expect(ap).toContainText('Never log content');
  await ap.locator('li', { hasText: 'Never log content' }).getByRole('button').click();
  await expect(ap.locator('li', { hasText: 'Never log content' })).toHaveCount(0);
  const ext = async () => ((await (await page.request.get('/api/db/meta/ext')).json()) as any).data;
  await expect.poll(async () => (await ext()).rules.find((r: any) => /Never log content/.test(r.text)).scope.except).toContain(CTO);
  const v = await page.locator(`#gv-${CTO} option`, { hasText: 'Never log content' }).getAttribute('value');
  await page.selectOption(`#gv-${CTO}`, v!);
  await expect(ap.locator('li', { hasText: 'Never log content' })).toHaveCount(1);

  // Add skills from a downloaded zip: one skill, one plugin whose skills are not listed twice.
  await page.click('.tab[data-tab="caps"]');
  await page.click('[data-act="cap-tab"][data-sub="catalog"]');
  await page.click('[data-act="pkg-open"]');
  await page.setInputFiles('#pkg-file', {
    name: 'portal.zip', mimeType: 'application/zip',
    buffer: zip({
      'r/skills/pdf/SKILL.md': '---\nname: pdf-reader\ndescription: Reads PDF files\n---\nHello',
      'r/plug/.claude-plugin/plugin.json': JSON.stringify({ name: 'toolbox', description: 'Handy things', version: '2.0.0' }),
      'r/plug/skills/inner/SKILL.md': '---\nname: inner\ndescription: inside the plugin\n---\n',
      'r/.mcp.json': JSON.stringify({ mcpServers: { github: { command: 'npx', env: { TOKEN: 'ghp_not_a_real_token' } } } }),
    }),
  });
  await expect(page.locator('.pkgc')).toHaveCount(3);
  await expect(page.locator('.panel')).toContainText('pdf-reader');
  await expect(page.locator('.panel')).toContainText('Contains: 1 skill');
  await page.check('input[data-xs="all"][data-own="imp"]');
  await page.click('[data-act="pkg-add"]');
  await expect(page.locator('#toast')).toContainText('Added 3');
  await expect(page.locator('.cd', { hasText: 'toolbox' })).toContainText('version 2.0.0');
  await expect.poll(async () => (await ext()).items.length).toBe(6);
  const items = (await ext()).items;
  expect(JSON.stringify(items)).not.toMatch(/ghp_not_a_real_token|npx/);
});

test('starter plugins show as loaded by default on every agent', async ({ page }) => {
  await page.goto('/');
  await page.fill('#password', 'e2e-password-not-real');
  await page.click('button[type=submit]');
  await page.click('.tab[data-tab="g:people"]');
  await page.click(`[data-act="dirsel"][data-id="${CTO}"]`);
  const ap = page.locator('.ap');
  await expect(ap).toContainText('Loaded by default');
  await expect(ap).toContainText('Model routing');
  await expect(ap).toContainText('Context compaction');
  await expect(ap).toContainText('Memory manager');
});
