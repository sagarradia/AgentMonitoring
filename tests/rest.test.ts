import { describe, expect, it } from 'vitest';
import { memoryStore } from '@/lib/server/store';
import { expireRests } from '@/lib/server/rest';
import { controlCfg } from '@/lib/server/github';

const cfg = controlCfg({} as NodeJS.ProcessEnv);
const proj = 'Skybirds-Empyrean-Avenue__familyvault';

describe('automatic end of rest', () => {
  it('ends only rests that have run out, logs it, and clears the agent label on GitHub', async () => {
    const store = memoryStore();
    await store.put('agents', 'fv_cto', { name: 'CTO', projectId: proj, status: 'resting', restUntil: 1000, statusNote: 'tired' });
    await store.put('agents', 'fv_dev', { name: 'Dev', projectId: proj, status: 'resting', restUntil: 9_999_999 });
    await store.put('agents', 'fv_ops', { name: 'Ops', projectId: proj, status: 'paused' });
    const calls: string[] = [];
    const f = (async (u: string, i?: RequestInit) => { calls.push((i?.method || 'GET') + ' ' + u); return new Response(JSON.stringify({ labels: [] }), { status: 200 }) }) as unknown as typeof fetch;
    const r = await expireRests(store, 't', cfg, f, 5000);
    expect(r.ended).toEqual(['fv_cto']);
    const cto = (await store.get('agents', 'fv_cto'))!.data as Record<string, unknown>;
    expect(cto.status).toBe('active'); expect(cto.restUntil).toBeUndefined(); expect(cto.statusNote).toBeUndefined();
    expect(JSON.stringify(cto.statusLog)).toContain('Rest ended (automatic)');
    expect(((await store.get('agents', 'fv_dev'))!.data as Record<string, unknown>).status).toBe('resting');
    expect(((await store.get('agents', 'fv_ops'))!.data as Record<string, unknown>).status).toBe('paused');
    expect(calls.some((c) => c.startsWith('DELETE') && c.includes(encodeURIComponent('agent-paused:cto')))).toBe(true);
  });
  it('also ends a loan whose last day has passed', async () => {
    const store = memoryStore();
    await store.put('agents', 'l1', { name: 'L', projectId: 'x__y', status: 'active', loan: { to: 'x__z', until: '2026-01-01', reason: 'r', at: 1 } });
    const r = await expireRests(store, null, cfg, fetch, Date.parse('2026-06-01'));
    expect(r.ended).toEqual([]);
    const d = (await store.get('agents', 'l1'))!.data as Record<string, unknown>;
    expect(d.loan).toBeUndefined(); expect(JSON.stringify(d.changeLog)).toContain('ended');
  });
  it('works without a GitHub token', async () => {
    const store = memoryStore();
    await store.put('agents', 'a1', { name: 'A', projectId: 'x__y', status: 'resting', restUntil: 1 });
    expect((await expireRests(store, null, cfg, fetch, 5000)).ended).toEqual(['a1']);
  });
});
