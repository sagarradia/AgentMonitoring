import { describe, expect, it } from 'vitest';
import { memoryStore, postgresStore, seedIfNew, upgradeSeed } from '@/lib/server/store';

const docs = { agents: { a1: { id: 'a1', name: 'One' }, a2: { id: 'a2', name: 'Two' } }, projects: { o__r: { brief: 'B' } } };

describe('seedIfNew', () => {
  it('loads the seed once, keeps existing documents, and never re-adds deleted ones', async () => {
    const s = memoryStore({ agents: { a1: { id: 'a1', name: 'Edited' } } });
    expect(await seedIfNew(s, docs)).toBe(true);
    expect((await s.get('agents', 'a1'))!.data.name).toBe('Edited');
    expect((await s.get('agents', 'a2'))!.data.name).toBe('Two');
    expect((await s.get('projects', 'o__r'))!.data).toEqual({ brief: 'B' });
    await s.remove('agents', 'a2');
    expect(await seedIfNew(s, docs)).toBe(false);
    expect(await s.get('agents', 'a2')).toBeNull();
  });
});

describe('upgradeSeed', () => {
  const fresh = {
    agents: { a1: { id: 'a1', name: 'One', progress: { done: 1 }, todos: [{ text: 'new', status: 'todo' }], memory: [{ text: 'm' }] }, a2: { id: 'a2', name: 'Two', todos: [{ text: 'seeded', status: 'todo' }] } },
    projects: {}, meta: { report: { headline: 'H' }, models: { today: 'Opus 5.5' } },
  };
  it('adds progress and the report without overwriting what the owner changed', async () => {
    const s = memoryStore({
      agents: { a1: { id: 'a1', name: 'Mine', todos: [{ text: 'old', status: 'todo' }], memory: [{ text: 'kept' }] }, a2: { id: 'a2', name: 'Two', todos: [{ text: 'edited', status: 'done' }] } },
      meta: { seeded: { at: 1 }, models: { today: 'Custom' } },
    });
    expect(await upgradeSeed(s, fresh)).toBe(true);
    const a1 = (await s.get('agents', 'a1'))!.data, a2 = (await s.get('agents', 'a2'))!.data;
    expect(a1.name).toBe('Mine');
    expect(a1.progress).toEqual({ done: 1 });
    expect(a1.todos).toEqual([{ text: 'new', status: 'todo' }]);
    expect(a1.memory).toEqual([{ text: 'kept' }]);
    expect(a2.todos).toEqual([{ text: 'edited', status: 'done' }]);
    expect((await s.get('meta', 'report'))!.data).toEqual({ headline: 'H' });
    expect((await s.get('meta', 'models'))!.data).toEqual({ today: 'Custom' });
    expect(await upgradeSeed(s, fresh)).toBe(false);
  });
});

/* Runs against a real Postgres when TEST_DATABASE_URL is set (CI or local); skipped otherwise. */
describe.skipIf(!process.env.TEST_DATABASE_URL)('postgresStore', () => {
  it('creates its tables and round-trips documents', async () => {
    const s = postgresStore(process.env.TEST_DATABASE_URL!);
    const id = 't_' + Date.now();
    await s.put('agents', id, { id, todos: [{ text: 'x', due: '2026-12-24' }], n: null, ok: true });
    expect((await s.get('agents', id))!.data).toEqual({ id, todos: [{ text: 'x', due: '2026-12-24' }], n: null, ok: true });
    await s.put('agents', id, { id, v: 2 });
    expect((await s.get('agents', id))!.data).toEqual({ id, v: 2 });
    expect((await s.list('agents')).some((d) => d.id === id)).toBe(true);
    expect(typeof (await s.get('agents', id))!.updated_at).toBe('string');
    await s.remove('agents', id);
    expect(await s.get('agents', id)).toBeNull();
    expect(await s.get('meta', 'missing')).toBeNull();
  });
});
