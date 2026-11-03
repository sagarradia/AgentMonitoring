import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

/* Parity check: the original agent-desk.html (with a stub window.claude holding the same data)
   and the ported app must render the same markup for the same clicks.
   One intended difference: the port lists every agent even when its manager is collapsed (the
   original only showed heads until expanded), so the roster spreadsheet is compared after Expand all,
   where both pages show every agent. The grid's hint line was reworded to match.
   The wizard was extended (tools, approvals, cadence), so it is covered by wizard.spec.ts instead. */
const NEW_HINT = 'Every agent has a row, indented under its manager. Click a name to expand its goals, KRAs, KPIs and todos.';
const OLD_HINT = 'Click a name to expand its goals, KRAs, KPIs, todos and reports.';

const PASSWORD = 'e2e-password-not-real';
const ORIGINAL = 'file://' + path.resolve('agent-desk.html');

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await expect(page.locator('.tabs')).toBeVisible();
}

async function openOriginal(page: Page, data: { agents: unknown[]; projects: Record<string, unknown>; meta: Record<string, unknown> }) {
  await page.addInitScript((d) => {
    const snap = (id: string, v: unknown) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(v)) });
    const db = {
      collection: (name: string) => ({
        onSnapshot(cb: (s: unknown) => void) {
          const docs = name === 'agents' ? d.agents.map((a: any) => snap(a.id, a)) : name === 'projects' ? Object.entries(d.projects).map(([k, v]) => snap(k, v)) : [];
          setTimeout(() => cb({ docs }), 0);
          return () => {};
        },
      }),
      doc: (k: string) => ({ set: async () => {}, delete: async () => {}, onSnapshot(cb: (s: unknown) => void) { const v = d.meta[k.replace('meta/', '')]; setTimeout(() => cb(v ? snap(k, v) : { exists: false }), 0); return () => {} } }),
    };
    const sample = Object.assign(async () => ({ text: '' }), { json: async () => ({}) });
    (window as any).claude = { use: async (n: string) => ({ db, sample, mcp: { callTool: async () => ({}) }, downloads: { save: async () => {} } } as any)[n] };
  }, data);
  await page.goto(ORIGINAL);
  await expect(page.locator('.tabs')).toBeVisible();
}

const dom = (page: Page) => page.evaluate(() => ({
  app: document.getElementById('app')!.innerHTML,
  overlay: document.getElementById('overlay')!.innerHTML,
}));

const steps: [string, (p: Page) => Promise<void>][] = [
  ['overview', async () => {}],
  ['directory (people)', async (p) => { await p.click('.tab[data-tab="people"]') }],
  ['directory (spreadsheet)', async (p) => { await p.click('[data-act="dirview"][data-view="sheet"]') }],
  ['status report', async (p) => { await p.click('.tab[data-tab="report"]') }],
  ['capabilities', async (p) => { await p.click('.tab[data-tab="caps"]') }],
  ['connections', async (p) => { await p.click('.tab[data-tab="connect"]') }],
  ['roster (teams)', async (p) => { await p.click('.tab[data-tab="agents"]') }],
  ['roster (spreadsheet), expanded', async (p) => { await p.click('[data-act="vw"][data-tab="agents"][data-view="sheet"]'); await p.click('[data-act="expand-all"]') }],
  ['todos tab', async (p) => { await p.click('[data-tab="tasks"]') }],
  ['goals & KPIs tab', async (p) => { await p.click('[data-tab="score"]') }],
  ['library tab', async (p) => { await p.click('[data-tab="lib"]') }],
  ['project scope with brief', async (p) => { await p.click('[data-act="scope"][data-id="Skybirds-Empyrean-Avenue__familyvault"]'); await p.click('[data-tab="agents"]') }],
  ['search filter', async (p) => { await p.fill('#q', 'security') }],
  ['attention filter', async (p) => { await p.fill('#q', ''); await p.selectOption('#flt', 'attention') }],
  ['profile panel', async (p) => { await p.selectOption('#flt', 'all'); await p.click('[data-act="open-agent"][data-id="fv_cto"]') }],
  ['chat panel', async (p) => { await p.click('.panel [data-act="chat-open"]') }],
];

test('the port renders the same markup as the original page', async ({ browser }) => {
  const port = await browser.newPage();
  await login(port);
  const agents = (await (await port.request.get('/api/db/agents')).json()).docs.map((d: any) => ({ ...d.data, id: d.id }));
  const projects = Object.fromEntries((await (await port.request.get('/api/db/projects')).json()).docs.map((d: any) => [d.id, d.data]));
  const meta = Object.fromEntries((await (await port.request.get('/api/db/meta')).json()).docs.map((d: any) => [d.id, d.data]));
  const orig = await browser.newPage();
  await openOriginal(orig, { agents, projects, meta });

  for (const [name, act] of steps) {
    await act(orig);
    await act(port);
    const [a, b] = [await dom(orig), await dom(port)];
    b.app = b.app.replace(NEW_HINT, OLD_HINT).replace(/<!--import-->[\s\S]*?<!--\/import-->/, '');
    expect(a.app.length, name + ' rendered something').toBeGreaterThan(500);
    expect.soft(b.app, name + ' (#app)').toBe(a.app);
    expect.soft(b.overlay, name + ' (#overlay)').toBe(a.overlay);
  }
});
