import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

/* Parity check: the original agent-desk.html (with a stub window.claude holding the same data)
   and the ported app must render the same markup for the same clicks. */

const PASSWORD = 'e2e-password-not-real';
const ORIGINAL = 'file://' + path.resolve('agent-desk.html');

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await expect(page.locator('table.sheet')).toBeVisible();
}

async function openOriginal(page: Page, data: { agents: unknown[]; projects: Record<string, unknown> }) {
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
      doc: () => ({ set: async () => {}, delete: async () => {}, onSnapshot(cb: (s: unknown) => void) { setTimeout(() => cb({ exists: false }), 0); return () => {} } }),
    };
    const sample = Object.assign(async () => ({ text: '' }), { json: async () => ({}) });
    (window as any).claude = { use: async (n: string) => ({ db, sample, mcp: { callTool: async () => ({}) }, downloads: { save: async () => {} } } as any)[n] };
  }, data);
  await page.goto(ORIGINAL);
  await expect(page.locator('table.sheet')).toBeVisible();
}

const dom = (page: Page) => page.evaluate(() => ({
  app: document.getElementById('app')!.innerHTML,
  overlay: document.getElementById('overlay')!.innerHTML,
}));

const steps: [string, (p: Page) => Promise<void>][] = [
  ['roster', async () => {}],
  ['expand all', async (p) => { await p.click('[data-act="expand-all"]') }],
  ['todos tab', async (p) => { await p.click('[data-tab="tasks"]') }],
  ['goals & KPIs tab', async (p) => { await p.click('[data-tab="score"]') }],
  ['library tab', async (p) => { await p.click('[data-tab="lib"]') }],
  ['project scope with brief', async (p) => { await p.click('[data-act="scope"][data-id="Skybirds-Empyrean-Avenue__familyvault"]'); await p.click('[data-tab="agents"]') }],
  ['search filter', async (p) => { await p.fill('#q', 'security') }],
  ['attention filter', async (p) => { await p.fill('#q', ''); await p.selectOption('#flt', 'attention') }],
  ['profile panel', async (p) => { await p.selectOption('#flt', 'all'); await p.click('[data-act="open-agent"][data-id="fv_cto"]') }],
  ['chat panel', async (p) => { await p.click('.panel [data-act="chat-open"]') }],
  ['wizard step 1', async (p) => { await p.keyboard.press('Escape'); await p.click('header [data-act="wizard-open"]') }],
  ['wizard step 2 (template)', async (p) => { await p.fill('#w-task', 'answer customer emails and keep the FAQ current'); await p.click('[data-act="wiz-template"]') }],
];

test('the port renders the same markup as the original page', async ({ browser }) => {
  const port = await browser.newPage();
  await login(port);
  const agents = (await (await port.request.get('/api/db/agents')).json()).docs.map((d: any) => ({ ...d.data, id: d.id }));
  const projects = Object.fromEntries((await (await port.request.get('/api/db/projects')).json()).docs.map((d: any) => [d.id, d.data]));
  const orig = await browser.newPage();
  await openOriginal(orig, { agents, projects });

  for (const [name, act] of steps) {
    await act(orig);
    await act(port);
    const [a, b] = [await dom(orig), await dom(port)];
    expect(a.app.length, name + ' rendered something').toBeGreaterThan(500);
    expect.soft(b.app, name + ' (#app)').toBe(a.app);
    expect.soft(b.overlay, name + ' (#overlay)').toBe(a.overlay);
  }
});
