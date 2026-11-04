import { describe, expect, it } from 'vitest';
import { applyIssues, retag, type Issue } from '../lib/feed';
import type { Agent } from '../lib/types';

const ag = (id: string, todos: any[], over: Partial<Agent> = {}): Agent => ({ id, projectId: 'o__r', name: id, role: '', todos, ...over });
const I = (n: number, state: 'open' | 'closed', labels: string[] = [], closed_at?: string): Issue => ({ n, state, labels, closed_at });

describe('retag', () => {
  it('adds and removes blocked in the trailing tags', () => {
    expect(retag('#1 Thing [p1, blocked]', false)).toBe('#1 Thing [p1]');
    expect(retag('#1 Thing [p1]', true)).toBe('#1 Thing [p1, blocked]');
    expect(retag('#1 Thing', true)).toBe('#1 Thing [blocked]');
    expect(retag('#1 Thing [blocked]', false)).toBe('#1 Thing');
    expect(retag('#1 Thing [p1]', false)).toBe('#1 Thing [p1]');
  });
});

describe('applyIssues', () => {
  it('closes, unblocks, starts and readies tickets from labels', () => {
    const a = ag('a', [
      { text: '#1 A [p1, blocked]', status: 'todo', issue: 1 },
      { text: '#2 B [p0]', status: 'todo', issue: 2 },
      { text: '#3 C', status: 'todo' },
      { text: '#4 D', status: 'doing', issue: 4 },
      { text: 'own task', status: 'todo' },
    ]);
    const r = applyIssues([a], [I(1, 'closed', [], '2026-11-02T10:00:00Z'), I(2, 'open', ['status:in-progress']), I(3, 'open', ['status:blocked']), I(4, 'open', ['status:ready'])], '2026-11-04');
    const t = r.changed.a.todos as any[];
    expect(t[0]).toMatchObject({ status: 'done', text: '#1 A [p1]', note: 'Closed 2026-11-02' });
    expect(t[1]).toMatchObject({ status: 'doing' });
    expect(t[2]).toMatchObject({ status: 'todo', text: '#3 C [blocked]', note: 'Blocked', issue: 3 });
    expect(t[3]).toMatchObject({ status: 'todo', note: 'Ready' });
    expect(t[4]).toEqual({ text: 'own task', status: 'todo' });
    expect(r).toMatchObject({ matched: 4, closedNow: 1 });
    expect((r.changed.a.progress as any)).toMatchObject({ assigned: 4, done: 1, open: 3, pct: 25, lastActive: '2026-11-02', idleDays: 2, asOf: '2026-11-04' });
  });
  it('keeps what a person recorded and a hand-written note', () => {
    const a = ag('a', [{ text: '#1 A', status: 'doing', issue: 1, pct: 40, due: '2026-12-01', note: 'call Raj first' }]);
    const r = applyIssues([a], [I(1, 'open', ['status:ready'])], '2026-11-04');
    expect((r.changed.a.todos as any[])[0]).toMatchObject({ status: 'todo', pct: 40, due: '2026-12-01', note: 'Ready · call Raj first' });
  });
  it('does not touch agents whose tickets did not change, and is repeatable', () => {
    const a = ag('a', [{ text: '#1 A', status: 'todo', issue: 1, note: 'Ready' }]);
    expect(Object.keys(applyIssues([a], [I(1, 'open')], '2026-11-04').changed)).toEqual([]);
    const r1 = applyIssues([a], [I(1, 'closed', [], '2026-11-03T00:00:00Z')], '2026-11-04');
    const again = applyIssues([r1.changed.a], [I(1, 'closed', [], '2026-11-03T00:00:00Z')], '2026-11-04');
    expect(Object.keys(again.changed)).toEqual([]);
  });
  it('reopens a ticket and counts open pull requests and unmatched issues', () => {
    const a = ag('a', [{ text: '#1 A', status: 'done', issue: 1, note: 'Closed 2026-10-01' }]);
    const r = applyIssues([a], [I(1, 'open', ['status:needs-human']), I(9, 'open'), { n: 50, state: 'open', labels: [], pr: true }, { n: 51, state: 'open', labels: [], pr: true }], '2026-11-04');
    expect((r.changed.a.todos as any[])[0]).toMatchObject({ status: 'todo', note: 'Needs the founder' });
    expect(r).toMatchObject({ openPRs: 2, unmatchedIssues: 1, needsHuman: [1] });
  });
});
