import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GhError, controlCfg, fetchIssues, getControl, getPaused, isAgentKey, setAgentPaused, setPaused, syncFeed } from '@/lib/server/github';
import { memoryStore, setStore } from '@/lib/server/store';
import * as Cron from '@/app/api/feed/cron/route';
import * as Control from '@/app/api/control/route';
import { authed, PASSWORD } from './helpers';
import { resetRateLimits } from '@/lib/server/ratelimit';

type Call = { url: string; method: string; body?: string; auth: string | null };
function fake(handler: (c: Call) => { status?: number; body?: unknown }) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const c = { url: String(url).replace('https://api.github.com', ''), method: init.method || 'GET', body: init.body as string | undefined, auth: new Headers(init.headers).get('authorization') };
    calls.push(c);
    const r = handler(c);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const issue = (n: number, state: string, labels: string[] = [], extra: object = {}) => ({ number: n, state, labels: labels.map((name) => ({ name })), closed_at: state === 'closed' ? '2026-11-02T08:00:00Z' : null, ...extra });

describe('fetchIssues', () => {
  it('pages through results and marks pull requests', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => issue(i + 1, 'open'));
    const { f, calls } = fake((c) => ({ body: /page=1$/.test(c.url) ? page1 : [issue(101, 'open', [], { pull_request: {} })] }));
    const out = await fetchIssues('o/r', 'tok', f);
    expect(out).toHaveLength(101);
    expect(out[100].pr).toBe(true);
    expect(calls.every((c) => c.auth === 'Bearer tok')).toBe(true);
  });
  it('refuses a malformed repo name and maps access errors', async () => {
    await expect(fetchIssues('../etc', 't', fake(() => ({})).f)).rejects.toMatchObject({ code: 'bad_repo' });
    await expect(fetchIssues('o/r', 't', fake(() => ({ status: 404 })).f)).rejects.toMatchObject({ code: 'no_access' });
    await expect(fetchIssues('o/r', 't', fake(() => ({ status: 401 })).f)).rejects.toMatchObject({ code: 'needs_reauth' });
  });
});

describe('syncFeed', () => {
  it('updates agents, records the outcome per repo, and survives one repo failing', async () => {
    const s = memoryStore({ agents: {
      a: { projectId: 'o__r', name: 'A', todos: [{ text: '#1 Thing [blocked]', status: 'todo', issue: 1 }] },
      b: { projectId: 'x__nope', name: 'B', todos: [{ text: '#2 Other', status: 'todo', issue: 2 }] },
      c: { projectId: 'o__r', name: 'C', todos: [{ text: 'own', status: 'todo' }] },
    } });
    const { f } = fake((c) => (c.url.startsWith('/repos/o/r') ? { body: [issue(1, 'closed')] } : { status: 404 }));
    const feed = await syncFeed(s, 'tok', f, new Date('2026-11-04T05:00:00Z'));
    expect(feed.repos['o/r']).toMatchObject({ ok: true, matched: 1, updated: 1 });
    expect(feed.repos['x/nope']).toEqual({ ok: false, error: 'no_access' });
    expect(((await s.get('agents', 'a'))!.data.todos as any[])[0]).toMatchObject({ status: 'done', text: '#1 Thing', note: 'Closed 2026-11-02' });
    expect((await s.get('agents', 'c'))!.data.todos).toEqual([{ text: 'own', status: 'todo' }]);
    expect((await s.get('meta', 'feed'))!.data.fetchedAt).toBe(Date.parse('2026-11-04T05:00:00Z'));
  });
});

describe('the pause switch', () => {
  const cfg = controlCfg({} as NodeJS.ProcessEnv);
  it('defaults to the Agent control issue and label from the project rules', () => {
    expect(cfg).toEqual({ repo: 'Skybirds-Empyrean-Avenue/familyvault', issue: 96, label: 'agents-paused' });
    expect(controlCfg({ CONTROL_ISSUE: 'x' } as unknown as NodeJS.ProcessEnv).issue).toBe(96);
  });
  it('reads, adds and removes the label', async () => {
    let labels: string[] = [];
    const { f, calls } = fake((c) => {
      if (c.method === 'POST') { labels = ['agents-paused']; return { body: [] } }
      if (c.method === 'DELETE') { if (!labels.length) return { status: 404 }; labels = []; return { body: [] } }
      return { body: { labels: labels.map((name) => ({ name })) } };
    });
    expect(await getPaused(cfg, 't', f)).toBe(false);
    expect(await setPaused(cfg, 't', true, f)).toBe(true);
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/repos/Skybirds-Empyrean-Avenue/familyvault/issues/96/labels', body: JSON.stringify({ labels: ['agents-paused'] }) });
    expect(await setPaused(cfg, 't', false, f)).toBe(false);
    expect(await setPaused(cfg, 't', false, f)).toBe(false);   // already gone: not an error
  });
  it('pauses one agent with its own label, leaving the all-agents switch alone', async () => {
    let labels: string[] = [];
    const { f, calls } = fake((c) => {
      if (c.method === 'POST') { labels.push(JSON.parse(c.body as string).labels[0]); return { body: [] } }
      if (c.method === 'DELETE') { labels = labels.filter((l) => c.url.indexOf(encodeURIComponent(l)) < 0); return { body: [] } }
      return { body: { labels: labels.map((name) => ({ name })) } };
    });
    expect(await setAgentPaused(cfg, 't', 'cto', true, f)).toEqual({ paused: false, agents: ['cto'] });
    expect(calls.find((c) => c.method === 'POST')?.body).toBe(JSON.stringify({ labels: ['agent-paused:cto'] }));
    expect(await setAgentPaused(cfg, 't', 'cto', false, f)).toEqual({ paused: false, agents: [] });
    expect((await getControl(cfg, 't', f)).agents).toEqual([]);
    await expect(setAgentPaused(cfg, 't', '../x', true, f)).rejects.toBeInstanceOf(GhError);
    expect(isAgentKey('chief-of-staff')).toBe(true); expect(isAgentKey('a b')).toBe(false);
  });
  it('says the token needs write access when GitHub refuses', async () => {
    await expect(setPaused(cfg, 't', true, fake(() => ({ status: 403 })).f)).rejects.toBeInstanceOf(GhError);
  });
});

describe('routes', () => {
  beforeEach(() => { process.env.APP_PASSWORD = PASSWORD; setStore(memoryStore()); resetRateLimits(); delete process.env.CRON_SECRET; delete process.env.GITHUB_TOKEN });
  afterEach(() => setStore(null));
  it('the cron route does not exist without a secret and rejects a wrong one', async () => {
    expect((await Cron.GET(new Request('http://x/api/feed/cron'))).status).toBe(404);
    process.env.CRON_SECRET = 's3cret-not-real';
    expect((await Cron.GET(new Request('http://x/api/feed/cron', { headers: { authorization: 'Bearer nope' } }))).status).toBe(401);
    expect((await Cron.GET(new Request('http://x/api/feed/cron', { headers: { authorization: 'Bearer s3cret-not-real' } }))).status).toBe(200);   // no GitHub token: still ends rests
  });
  it('control needs the login and reports when GitHub is not connected', async () => {
    expect((await Control.GET(new Request('http://x/api/control'))).status).toBe(401);
    const r = await Control.GET(await authed('/api/control'));
    expect(await r.json()).toMatchObject({ configured: false, issue: 96 });
    expect((await Control.POST(await authed('/api/control', { method: 'POST', body: JSON.stringify({ paused: true }) }))).status).toBe(503);
  });
});
