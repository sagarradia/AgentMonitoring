import { describe, expect, it } from 'vitest';
import { allHelpers, brainOf, defaultBrain, isLeader, needOf, recommendModel, suggestSubs } from '@/lib/taskplan';

const M = [{ id: 'opus55', name: 'Opus', connected: true }, { id: 'sonnet55', name: 'Sonnet', connected: true }, { id: 'haiku55', name: 'Haiku', connected: true }, { id: 'codex', name: 'Codex', connected: false }];

describe('model choice', () => {
  it('uses the cheapest model that is accurate enough', () => {
    expect(recommendModel('Summarise the notes', M).id).toBe('haiku55');
    expect(recommendModel('Build the upload screen', M).id).toBe('sonnet55');
    expect(recommendModel('Review key handling and encryption', M).id).toBe('opus55');
  });
  it('gives leads the most accurate model, and never a model that is not connected', () => {
    expect(recommendModel('Summarise the notes', M, true).id).toBe('opus55');
    expect(recommendModel('anything', [{ id: 'codex', name: 'Codex', connected: false }]).id).toBe('');
  });
  it('falls back to the best connected model when none is accurate enough', () => {
    const r = recommendModel('encryption', [{ id: 'haiku55', name: 'Haiku', connected: true }]);
    expect(r.id).toBe('haiku55'); expect(r.why).toMatch(/though the task wants more/);
  });
  it('rates need by words', () => { expect(needOf('delete production data').level).toBe('high'); expect(needOf('Build a screen').level).toBe('medium') });
});
describe('helpers and brain', () => {
  const agents = [{ id: 'cto', name: 'CTO', level: 'Head' }, { id: 'w', name: 'Web dev', role: 'Builds web screens', reportsTo: 'CTO', status: 'active' }, { id: 'x', name: 'Cook', role: 'Cooks', reportsTo: 'CTO' }];
  it('suggests matching reports and helpers with a model each', () => {
    const s = suggestSubs('Build the web screen', M, agents, agents[0]);
    expect(s.some((x) => x.agentId === 'w')).toBe(true);
    expect(s.some((x) => x.agentId === 'x')).toBe(false);
    expect(s.every((x) => x.model && x.why)).toBe(true);
    expect(allHelpers(M)).toHaveLength(5);
  });
  it('leads get their own brain, others share', () => {
    expect(isLeader({ name: 'Chief of Staff' })).toBe(true);
    expect(defaultBrain({ name: 'CTO', role: 'CTO' }).own).toBe(true);
    expect(defaultBrain({ name: 'Dev', level: 'Junior' }).own).toBe(false);
    expect(brainOf({ brain: { own: false, memory: [] }, level: 'Head' }).own).toBe(false);
  });
});
