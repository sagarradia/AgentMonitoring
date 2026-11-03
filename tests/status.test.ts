import { describe, expect, it } from 'vitest';
import { coverFor, effState, restExpired, restUntilFor, roll, suggestBackup, taskPct, taskState } from '../lib/status';
import type { Agent } from '../lib/types';

const A = (id: string, over: Partial<Agent> = {}): Agent => ({ id, projectId: 'p', name: id, role: '', ...over });
const NOW = 1_000_000;

describe('agent state', () => {
  it('a rest ends by itself', () => {
    const a = A('a', { status: 'resting', restUntil: NOW + 5000 });
    expect(effState(a, NOW)).toBe('resting');
    expect(effState(a, NOW + 6000)).toBe('active');
    expect(restExpired(a, NOW + 6000)).toBe(true);
  });
  it('limits the rest length', () => { expect(restUntilFor(9999, NOW)).toBe(NOW + 14 * 24 * 3600000); expect(restUntilFor(-3, NOW)).toBe(NOW + 3600000) });
});

describe('tasks', () => {
  it('shows running work as paused when the agent is not active', () => {
    const a = A('a', { status: 'paused' });
    expect(taskState({ text: 't', status: 'doing' }, a, NOW)).toBe('paused');
    expect(taskState({ text: 't', status: 'todo' }, a, NOW)).toBe('queued');
  });
  it('waiting comes from a blocked note', () => expect(taskState({ text: 't', status: 'todo', note: 'Blocked by #3' }, A('a'), NOW)).toBe('waiting'));
  it('does not invent a percentage', () => {
    expect(taskPct({ text: 't', status: 'doing' }, 'running')).toBeNull();
    expect(taskPct({ text: 't', status: 'doing', pct: 40 }, 'running')).toBe(40);
    expect(taskPct({ text: 't', status: 'done' }, 'done')).toBe(100);
  });
  it('rolls up and ignores withdrawn agents', () => {
    const a = A('a'), w = A('w', { status: 'withdrawn' });
    const r = roll([{ a, t: { text: '1', status: 'done' } }, { a, t: { text: '2', status: 'doing', pct: 50 } }, { a, t: { text: '3', status: 'todo' } }, { a: w, t: { text: '4', status: 'todo' } }], NOW);
    expect(r).toMatchObject({ n: 3, done: 1, running: 1, queued: 1, pct: 50 });
  });
});

describe('cover', () => {
  const cos = A('cos', { name: 'Chief of Staff', status: 'resting', restUntil: NOW + 1000, backupId: 'cto' });
  it('finds the first available backup', () => {
    expect(coverFor(cos, [cos, A('cto')], NOW).by?.id).toBe('cto');
  });
  it('goes down the chain and stops on a loop', () => {
    const cto = A('cto', { status: 'paused', backupId: 'hop' }), hop = A('hop');
    expect(coverFor(cos, [cos, cto, hop], NOW).by?.id).toBe('hop');
    const loop = A('cto', { status: 'paused', backupId: 'cos' });
    expect(coverFor(cos, [cos, loop], NOW).by).toBeNull();
  });
  it('suggests the CTO', () => expect(suggestBackup(cos, [cos, A('x', { role: 'CTO' })], NOW)?.id).toBe('x'));
});
