import { describe, expect, it } from 'vitest';
import { agentUnits, cleanLimit, cleanRate, companyUsage, hireCheck, labelOf, modelUnits, overLimits, rupees, unitCap, type Limit } from '@/lib/budget';
import type { OrgAgent } from '@/lib/org';

let n = 0;
const mk = (o: Partial<OrgAgent>): OrgAgent => ({ id: 'a' + ++n, projectId: 'o__a', name: 'x', role: 'Engineer', status: 'active', ...o });
const L = (o: Partial<Limit>): Limit => ({ id: 'l' + ++n, level: 'company', company: 'o__a', target: '', ...o });

describe('unit prices', () => {
  it('prices by model, plus one for its own brain', () => {
    expect(agentUnits({ model: 'haiku55' })).toBe(1); expect(agentUnits({ model: 'sonnet55' })).toBe(2); expect(agentUnits({ modelPlanned: 'opus55' })).toBe(4);
    expect(agentUnits({})).toBe(4); expect(agentUnits({ model: 'sonnet55', brain: { own: true } })).toBe(3); expect(modelUnits('mystery')).toBe(3);
  });
  it('rupees only with a rate; rupee caps convert to units', () => {
    expect(rupees(10)).toBeNull(); expect(rupees(10, 250.5)).toBe(2505);
    expect(unitCap(L({ maxUnits: 20, maxRupees: 3000 }), { o__a: 250 })).toBe(12);
    expect(unitCap(L({ maxRupees: 3000 }), {})).toBeUndefined();
  });
});
describe('limits at four levels', () => {
  const T = Date.parse('2026-11-04T00:00:00Z');
  const ag = [mk({ model: 'sonnet55' }), mk({ model: 'opus55', status: 'paused' }), mk({ model: 'haiku55', status: 'revoked' }), mk({ model: 'sonnet55', role: 'Security Junior', loan: { to: 'o__b', until: '2026-12-01', reason: 'r', at: 1 } })];
  it('counts what a company really uses: paused agents are free, loans move the cost', () => {
    expect(companyUsage(ag, 'o__a', T)).toEqual({ heads: 2, units: 2 });
    expect(companyUsage(ag, 'o__b', T)).toEqual({ heads: 1, units: 2 });
  });
  it('company level', () => {
    const w = { company: 'o__a', dept: 'Engineering', role: 'Engineer' };
    expect(hireCheck([L({ maxAgents: 2 })], {}, ag, w, 1, undefined, T).reasons[0]).toMatch(/Whole company: 3 agents against a limit of 2/);
    expect(hireCheck([L({ maxAgents: 3 })], {}, ag, w, 1, undefined, T).ok).toBe(true);
  });
  it('department and role levels only bite on matching hires', () => {
    const lim = [L({ level: 'department', target: 'Engineering', maxAgents: 1 }), L({ level: 'role', target: 'security', maxAgents: 1 })];
    expect(hireCheck(lim, {}, ag, { company: 'o__a', dept: 'Engineering', role: 'Engineer' }, 1, undefined, T).ok).toBe(false);
    expect(hireCheck(lim, {}, ag, { company: 'o__a', dept: 'Marketing', role: 'Writer' }, 1, undefined, T).ok).toBe(true);
    const b = [L({ level: 'role', company: 'o__b', target: 'security', maxAgents: 1 })];
    expect(hireCheck(b, {}, ag, { company: 'o__b', dept: 'Security', role: 'Security Lead' }, 1, undefined, T).ok).toBe(false);   // the borrowed security agent already fills b's role slot
  });
  it('individual level caps what one agent may cost, so an upgrade is refused', () => {
    const me = mk({ model: 'haiku55' });
    const lim = [L({ level: 'person', target: me.id, maxUnits: 2 })];
    const w = { id: me.id, company: 'o__a', dept: 'Engineering', role: 'Engineer' };
    expect(hireCheck(lim, {}, [me], w, modelUnits('sonnet55'), undefined, T).ok).toBe(true);
    expect(hireCheck(lim, {}, [me], w, modelUnits('opus55'), (id) => (id === me.id ? 'Mia' : id), T).reasons[0]).toMatch(/Individual Mia: 1 units against|Individual Mia: 5 units against|Individual Mia: 4 units against a limit of 2/);
  });
  it('reports limits already broken', () => {
    const out = overLimits([L({ maxUnits: 1 }), L({ maxAgents: 9 })], {}, ag, undefined, T);
    expect(out).toHaveLength(1); expect(out[0]).toMatch(/2 units, limit 1/);
    expect(labelOf(L({ level: 'role', target: 'dev' }))).toBe('Role containing "dev"');
  });
});
describe('typed limits', () => {
  it('cleans and refuses unusable ones', () => {
    expect(cleanLimit({ level: 'company', company: 'o__a', maxAgents: '7.9', maxUnits: '-3' }, 'x')).toEqual({ id: 'x', level: 'company', company: 'o__a', target: '', maxAgents: 7 });
    expect(cleanLimit({ level: 'role', company: 'o__a', maxAgents: 2 }, 'x')).toMatch(/word from the role/);
    expect(cleanLimit({ level: 'company', company: 'o__a' }, 'x')).toMatch(/at least one/);
    expect(cleanLimit({ level: 'person', company: 'o__a', target: 'p', maxAgents: 2 }, 'x')).toMatch(/capacity or rupee/);
    expect(cleanLimit({ level: 'nope', company: 'o__a' }, 'x')).toMatch(/level/);
    expect(cleanRate('abc')).toBeUndefined(); expect(cleanRate('12.345')).toBe(12.35);
  });
});
