import { describe, expect, it } from 'vitest';
import { applies, giveTo, norm, removeFor } from '../lib/scope';
import { sharedFor, syncAgent, syncAll, type Shared } from '../lib/shared';
import type { Agent } from '../lib/types';

const A = (id: string, projectId = 'p1', over: Partial<Agent> = {}): Agent => ({ id, projectId, name: id, role: '', ...over });
const TEAM = { a: 'Eng', b: 'Eng', c: 'Ops' };
const a = A('a'), b = A('b'), c = A('c', 'p2');

describe('scope', () => {
  it('reads the older single-mode shapes', () => {
    expect(applies({ mode: 'all' }, a, TEAM)).toBe(true);
    expect(applies({ mode: 'project', projects: ['p2'], teams: ['Eng'] }, a, TEAM)).toBe(false);
    expect(applies({ mode: 'team', teams: ['Eng'] }, b, TEAM)).toBe(true);
    expect(applies({ mode: 'people', people: ['c'] }, c, TEAM)).toBe(true);
  });
  it('unions levels and honours exceptions', () => {
    const sc = { mode: 'mix', projects: ['p2'], teams: ['Eng'], except: ['b'] };
    expect([a, b, c].map((x) => applies(sc, x, TEAM))).toEqual([true, false, true]);
  });
  it('gives and removes one person', () => {
    const org = { mode: 'all' };
    const no_b = removeFor(org, b, TEAM);
    expect(applies(no_b, b, TEAM)).toBe(false);
    expect(applies(no_b, a, TEAM)).toBe(true);
    expect(applies(giveTo(no_b, b, TEAM), b, TEAM)).toBe(true);
    const only = giveTo({ mode: 'people', people: [] }, c, TEAM);
    expect(norm(only).people).toEqual(['c']);
    expect(norm(removeFor(only, c, TEAM)).people).toEqual([]);
  });
});

describe('shared items', () => {
  const todo: Shared = { id: 's1', kind: 'todo', text: 'Weekly review', scope: { mode: 'team', teams: ['Eng'] } };
  const kpi: Shared = { id: 's2', kind: 'kpi', name: 'Cycle time', target: 3, unit: 'days', scope: { mode: 'all' } };
  it('copies to everyone in scope and is repeatable', () => {
    const ags = [A('a'), A('b'), A('c', 'p2')];
    const r = syncAll([todo, kpi], ags, TEAM);
    expect(r.added).toBe(5);
    expect(ags[0].todos?.[0]).toMatchObject({ text: 'Weekly review', status: 'todo', sharedId: 's1' });
    expect(ags[2].todos).toBeUndefined();
    expect(syncAll([todo, kpi], ags, TEAM).added).toBe(0);
  });
  it('widening adds, narrowing removes untouched copies and keeps the ones with progress', () => {
    const ags = [A('a'), A('b')];
    syncAll([todo], ags, TEAM);
    ags[1].todos![0].status = 'doing';
    const none = { ...todo, scope: { mode: 'people', people: [] } };
    const r = syncAll([none], ags, TEAM);
    expect(r).toMatchObject({ removed: 1, kept: 1 });
    expect(ags[0].todos).toEqual([]);
    expect((ags[1].todos?.[0] as any).sharedId).toBeUndefined();
    expect(ags[1].todos?.[0].note).toMatch(/kept/);
  });
  it('a deleted shared item cleans up its copies', () => {
    const ags = [A('a')];
    syncAll([todo], ags, TEAM);
    expect(syncAll([], ags, TEAM).removed).toBe(1);
  });
  it('keeps the agent\'s own rows and its KPI reading when the target changes', () => {
    const ag = A('a', 'p1', { todos: [{ text: 'mine', status: 'todo' }] });
    syncAgent([kpi], ag, TEAM);
    ag.kpis![0].current = 2;
    syncAgent([{ ...kpi, target: 5 }], ag, TEAM);
    expect(ag.kpis![0]).toMatchObject({ target: 5, current: 2 });
    expect(ag.todos).toHaveLength(1);
  });
  it('memory and documents are looked up, not copied', () => {
    const mem: Shared = { id: 's3', kind: 'memory', text: 'Be brief', scope: { mode: 'all' } };
    expect(sharedFor([mem, todo], a, TEAM, ['memory', 'doc'])).toHaveLength(1);
  });
});
