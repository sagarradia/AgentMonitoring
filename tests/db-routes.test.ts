import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Coll from '@/app/api/db/[collection]/route';
import * as Doc from '@/app/api/db/[collection]/[id]/route';
import { memoryStore, setStore, type Store } from '@/lib/server/store';
import { resetRateLimits } from '@/lib/server/ratelimit';
import { authed, ctx, PASSWORD } from './helpers';

const agent = { id: 'fv_test', projectId: 'example__repo', name: 'Test Agent', role: 'Tester', todos: [{ text: 'Write tests', status: 'todo', due: '2026-11-01' }] };

beforeEach(() => {
  process.env.APP_PASSWORD = PASSWORD;
  delete process.env.DB_DRIVER;
  setStore(memoryStore());
  resetRateLimits();
});
afterEach(() => { vi.restoreAllMocks(); setStore(null) });

async function put(c: string, id: string, body: unknown, ip?: string) {
  return Doc.PUT(await authed(`/api/db/${c}/${id}`, { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' }, ip }), ctx({ collection: c, id }));
}

describe('PUT then GET /api/db/:collection/:id', () => {
  it('stores the document unchanged and returns it', async () => {
    const r = await put('agents', agent.id, agent);
    expect(r.status).toBe(200);
    expect((await r.json()).id).toBe(agent.id);
    const g = await Doc.GET(await authed('/api/db/agents/fv_test'), ctx({ collection: 'agents', id: 'fv_test' }));
    expect(g.status).toBe(200);
    const doc = await g.json();
    expect(doc.data).toEqual(agent);
    expect(typeof doc.updated_at).toBe('string');
    expect(g.headers.get('cache-control')).toBe('no-store');
  });

  it('replaces the whole document on a second PUT (an edited due date persists)', async () => {
    await put('agents', agent.id, agent);
    const edited = { ...agent, todos: [{ ...agent.todos[0], due: '2026-12-24' }] };
    await put('agents', agent.id, edited);
    const doc = await (await Doc.GET(await authed('/api/db/agents/fv_test'), ctx({ collection: 'agents', id: 'fv_test' }))).json();
    expect(doc.data.todos[0].due).toBe('2026-12-24');
  });

  it('returns 404 for a missing document', async () => {
    const g = await Doc.GET(await authed('/api/db/agents/nope'), ctx({ collection: 'agents', id: 'nope' }));
    expect(g.status).toBe(404);
    expect(await g.json()).toEqual({ error: 'not_found' });
  });

  it('accepts the meta/repos document', async () => {
    const r = await put('meta', 'repos', { items: [{ full_name: 'example/repo', url: 'https://github.com/example/repo', pushed_at: '', visibility: 'private' }], syncedAt: 1 });
    expect(r.status).toBe(200);
  });
});

describe('GET /api/db/:collection', () => {
  it('lists every document in the collection', async () => {
    await put('projects', 'example__repo', { brief: 'A' });
    await put('projects', 'example__other', { brief: 'B' });
    const r = await Coll.GET(await authed('/api/db/projects'), ctx({ collection: 'projects' }));
    expect(r.status).toBe(200);
    const { docs } = await r.json();
    expect(docs.map((d: { id: string }) => d.id).sort()).toEqual(['example__other', 'example__repo']);
    expect(docs.find((d: { id: string }) => d.id === 'example__repo').data).toEqual({ brief: 'A' });
  });

  it('returns an empty list for an empty collection', async () => {
    const r = await Coll.GET(await authed('/api/db/chats'), ctx({ collection: 'chats' }));
    expect(await r.json()).toEqual({ docs: [] });
  });
});

describe('DELETE /api/db/:collection/:id', () => {
  it('removes the document', async () => {
    await put('agents', agent.id, agent);
    const d = await Doc.DELETE(await authed('/api/db/agents/fv_test', { method: 'DELETE' }), ctx({ collection: 'agents', id: 'fv_test' }));
    expect(d.status).toBe(200);
    const g = await Doc.GET(await authed('/api/db/agents/fv_test'), ctx({ collection: 'agents', id: 'fv_test' }));
    expect(g.status).toBe(404);
  });
});

describe('validation', () => {
  it('rejects unknown collections', async () => {
    expect((await Coll.GET(await authed('/api/db/users'), ctx({ collection: 'users' }))).status).toBe(404);
    expect((await put('users', 'x', {})).status).toBe(404);
  });
  it('rejects bad ids', async () => {
    expect((await put('agents', '../etc', agent)).status).toBe(400);
    expect((await put('agents', 'a b', agent)).status).toBe(400);
  });
  it('rejects bodies that are not a JSON object', async () => {
    expect((await put('agents', 'x', '[1,2]')).status).toBe(400);
    expect((await put('agents', 'x', 'not json')).status).toBe(400);
    expect((await put('agents', 'x', 'null')).status).toBe(400);
  });
  it('rejects oversized documents', async () => {
    expect((await put('agents', 'x', { blob: 'x'.repeat(600 * 1024) })).status).toBe(400);
  });
});

describe('auth and limits', () => {
  it('refuses requests without a session', async () => {
    const r = await Coll.GET(new Request('http://localhost/api/db/agents'), ctx({ collection: 'agents' }));
    expect(r.status).toBe(401);
  });
  it('refuses a forged session cookie', async () => {
    const exp = String(Date.now() + 60_000);
    const r = await Coll.GET(new Request('http://localhost/api/db/agents', { headers: { cookie: 'ad_session=' + exp + '.' + 'ab'.repeat(32) } }), ctx({ collection: 'agents' }));
    expect(r.status).toBe(401);
  });
  it('refuses everything when APP_PASSWORD is not set', async () => {
    const req = await authed('/api/db/agents');
    delete process.env.APP_PASSWORD;
    expect((await Coll.GET(req, ctx({ collection: 'agents' }))).status).toBe(503);
  });
  it('rate limits per IP', async () => {
    let last = 0;
    for (let i = 0; i < 241; i++) last = (await Coll.GET(await authed('/api/db/agents', { ip: '10.9.9.9' }), ctx({ collection: 'agents' }))).status;
    expect(last).toBe(429);
    expect((await Coll.GET(await authed('/api/db/agents', { ip: '10.9.9.10' }), ctx({ collection: 'agents' }))).status).toBe(200);
  });
});

describe('store failures', () => {
  it('returns 503 when Supabase is not configured', async () => {
    setStore(null);
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await Coll.GET(await authed('/api/db/agents'), ctx({ collection: 'agents' }));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'db_not_configured' });
  });
  it('returns 500 and never logs the request body', async () => {
    const broken: Store = { ...memoryStore(), put: async () => { throw new Error('boom: secret-body-marker') } };
    setStore(broken);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await put('agents', 'x', { text: 'secret-body-marker' });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'store_error' });
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('secret-body-marker');
  });
});
