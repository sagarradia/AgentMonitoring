import { describe, expect, it } from 'vitest';
import { memoryStore, postgresStore, seedIfNew } from '@/lib/server/store';

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
