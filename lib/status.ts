/* Agent availability (activate, pause, rest, revoke, withdraw), task states and cover for a resting lead.
   Pure functions: the page decides when to call them. These record what the founder decided on this page;
   they do not start or stop anything running elsewhere. */
import type { Agent, Todo } from './types';

export type AgentState = 'active' | 'paused' | 'resting' | 'revoked' | 'withdrawn' | 'draft';
export type TaskState = 'running' | 'queued' | 'paused' | 'waiting' | 'done';

export const STATE_LABEL: Record<AgentState, string> = {
  active: 'Active', paused: 'Paused', resting: 'Resting', revoked: 'Revoked', withdrawn: 'Withdrawn', draft: 'Draft',
};
export const STATE_HELP: Record<AgentState, string> = {
  active: 'Working normally.',
  paused: 'Stopped until you activate it again. Its work stays queued.',
  resting: 'A break. It resumes by itself when the rest time ends.',
  revoked: 'Access and permissions taken away. It stays on the team but does nothing until you activate it again.',
  withdrawn: 'Taken off the team and retired. The record is kept; its work is not counted as pending.',
  draft: 'Not set up yet.',
};
export const REST_CHOICES: Array<[number, string]> = [[0.5, '30 minutes'], [1, '1 hour'], [2, '2 hours'], [4, '4 hours'], [8, '8 hours'], [24, '1 day']];

export function effState(a: Agent, now = Date.now()): AgentState {
  const s = (a.status || 'active') as AgentState;
  if (s === 'resting') { const u = Number(a.restUntil); return isFinite(u) && u > now ? 'resting' : 'active' }
  return STATE_LABEL[s] ? s : 'active';
}
export function isAvailable(a: Agent, now = Date.now()): boolean { return effState(a, now) === 'active' }
export function restExpired(a: Agent, now = Date.now()): boolean {
  return a.status === 'resting' && !(Number(a.restUntil) > now);
}
export function restLeft(a: Agent, now = Date.now()): string {
  const m = Math.max(0, Math.round((Number(a.restUntil) - now) / 60000));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' h' + (r ? ' ' + r + ' min' : '');
}
export function restUntilFor(hours: number, now = Date.now()): number {
  const h = isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 14) : 1;
  return now + Math.round(h * 3600000);
}
export function logStatus(a: Agent, status: AgentState, note: string, now = Date.now()): void {
  const log = ((a.statusLog as Array<{ at: number; status: string; note?: string }>) || []).slice();
  log.push({ at: now, status, note: note || '' });
  a.statusLog = log.slice(-30);
}

const BLOCKED = /^(blocked|waiting)/i;
export function taskState(t: Todo, a: Agent, now = Date.now()): TaskState {
  if (t.status === 'done') return 'done';
  const up = isAvailable(a, now) || (a.status || 'active') === 'draft' ? true : false;
  if (t.status === 'doing') return up ? 'running' : 'paused';
  if (BLOCKED.test(t.note || '') || t.state === 'waiting') return 'waiting';
  return 'queued';
}
/** 100 when done, the saved percentage when someone recorded one, null when running with no measure. */
export function taskPct(t: Todo, state: TaskState): number | null {
  if (state === 'done') return 100;
  const p = Number(t.pct);
  if (t.pct != null && (t.pct as unknown) !== '' && isFinite(p)) return Math.max(0, Math.min(99, Math.round(p)));
  return state === 'running' || state === 'paused' ? null : 0;
}
export interface Roll { n: number; done: number; running: number; queued: number; paused: number; waiting: number; pct: number; unmeasured: number }
export function roll(items: Array<{ t: Todo; a: Agent }>, now = Date.now()): Roll {
  const r: Roll = { n: 0, done: 0, running: 0, queued: 0, paused: 0, waiting: 0, pct: 0, unmeasured: 0 };
  let sum = 0;
  for (const { t, a } of items) {
    if (effState(a, now) === 'withdrawn') continue;
    const s = taskState(t, a, now);
    r.n++; r[s]++;
    const p = taskPct(t, s);
    if (p == null) r.unmeasured++; else sum += p;
  }
  r.pct = r.n ? Math.round(sum / r.n) : 0;
  return r;
}

export function isLead(a: Agent): boolean { return /chief of staff|orchestrator|\bcos\b/i.test((a.name || '') + ' ' + (a.role || '')) }
export interface Cover { by: Agent | null; chain: Agent[] }
/** The first available agent in the backup chain of an agent that is not available. */
export function coverFor(a: Agent, all: Agent[], now = Date.now()): Cover {
  const chain: Agent[] = [], seen: Record<string, 1> = { [a.id]: 1 };
  let cur: Agent | undefined = a;
  for (let i = 0; i < 6 && cur; i++) {
    const nx: Agent | undefined = cur.backupId ? all.find((x) => x.id === cur!.backupId) : undefined;
    if (!nx || seen[nx.id]) break;
    seen[nx.id] = 1; chain.push(nx);
    if (isAvailable(nx, now)) return { by: nx, chain };
    cur = nx;
  }
  return { by: null, chain };
}
/** A sensible default to offer, never saved without a click: the CTO, then the Head of Product, in the same project. */
export function suggestBackup(a: Agent, all: Agent[], now = Date.now()): Agent | null {
  const pool = all.filter((x) => x.id !== a.id && x.projectId === a.projectId && effState(x, now) !== 'withdrawn' && effState(x, now) !== 'revoked');
  for (const re of [/\bcto\b|head of engineering/i, /head of product|\bcpo\b/i]) {
    const m = pool.find((x) => re.test((x.name || '') + ' ' + (x.role || '')));
    if (m) return m;
  }
  return null;
}
