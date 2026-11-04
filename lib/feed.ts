/* Turn GitHub issue state into the todos the page shows. Pure: the server fetches issues and saves the result.
   A todo is matched to an issue by its `issue` number or a leading "#123". GitHub wins on status for matched
   todos; progress percentages, due dates and other fields a person recorded are kept. */
import type { Agent, Todo } from './types';

export interface Issue { n: number; state: 'open' | 'closed'; closed_at?: string | null; labels: string[]; pr?: boolean }
export interface FeedResult {
  changed: Record<string, Agent>;
  matched: number; updated: number; closedNow: number; unmatchedIssues: number; openPRs: number;
  needsHuman: number[];
}

const MANAGED = /^(Closed \d{4}-\d{2}-\d{2}|Blocked|Ready|Needs the founder)(\s·\s|$)/;
const has = (ls: string[], re: RegExp) => ls.some((l) => re.test(l));

export function issueOf(t: Todo): number | null {
  const n = Number((t as { issue?: unknown }).issue);
  if (Number.isInteger(n) && n > 0) return n;
  const m = /^#(\d+)\b/.exec(t.text || '');
  return m ? Number(m[1]) : null;
}

/** Add or remove the word "blocked" inside the trailing [tags] of a ticket title. */
export function retag(text: string, blocked: boolean): string {
  const m = /\s*\[([^\]]*)\]\s*$/.exec(text);
  const tags = m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  const rest = m ? text.slice(0, m.index) : text;
  const has = tags.some((x) => x.toLowerCase() === 'blocked');
  if (blocked === has) return text;
  const next = blocked ? tags.concat('blocked') : tags.filter((x) => x.toLowerCase() !== 'blocked');
  return next.length ? rest + ' [' + next.join(', ') + ']' : rest;
}

function nextNote(old: string | undefined, managed: string): string {
  const o = (old || '').trim();
  if (!o || MANAGED.test(o)) return managed;
  return managed + ' · ' + o;
}

export function applyIssues(agents: Agent[], issues: Issue[], today: string): FeedResult {
  const byN = new Map<number, Issue>();
  for (const i of issues) if (!i.pr) byN.set(i.n, i);
  const res: FeedResult = { changed: {}, matched: 0, updated: 0, closedNow: 0, unmatchedIssues: 0, openPRs: issues.filter((i) => i.pr && i.state === 'open').length, needsHuman: [] };
  const seen = new Set<number>();
  for (const a of agents) {
    const src = (a.todos || []) as Todo[];
    let dirty = false;
    const todos = src.map((t) => {
      const n = issueOf(t), is = n == null ? undefined : byN.get(n);
      if (!is) return t;
      seen.add(is.n); res.matched++;
      const labels = is.labels, blocked = is.state === 'open' && has(labels, /^status:blocked$/);
      let status: Todo['status'], note: string | undefined;
      if (is.state === 'closed') { status = 'done'; note = nextNote(t.note, 'Closed ' + String(is.closed_at || today).slice(0, 10)) }
      else if (has(labels, /^status:(in-progress|in-review)$/)) { status = 'doing'; note = MANAGED.test(t.note || '') ? undefined : t.note }
      else if (has(labels, /^status:needs-human$/)) { status = 'todo'; note = nextNote(t.note, 'Needs the founder'); res.needsHuman.push(is.n) }
      else if (blocked) { status = 'todo'; note = nextNote(t.note, 'Blocked') }
      else { status = 'todo'; note = nextNote(t.note, 'Ready') }
      const text = retag(t.text || '', blocked);
      const next: Todo & { issue?: number } = { ...t, status, text, issue: is.n };
      if (note === undefined) delete next.note; else next.note = note;
      if (JSON.stringify(next) === JSON.stringify(t)) return t;
      if (t.status !== 'done' && status === 'done') res.closedNow++;
      next.updatedAt = Date.now();
      dirty = true; res.updated++;
      return next;
    });
    if (!dirty) continue;
    const linked = todos.filter((t) => issueOf(t) != null);
    const done = linked.filter((t) => t.status === 'done');
    const dates = done.map((t) => /Closed (\d{4}-\d{2}-\d{2})/.exec(t.note || '')?.[1] || '').filter(Boolean).sort();
    const last = dates[dates.length - 1] || '';
    const prev = (a.progress || {}) as Record<string, unknown>;
    const idle = last ? Math.max(0, Math.round((Date.parse(today) - Date.parse(last)) / 864e5)) : prev.idleDays ?? null;
    res.changed[a.id] = {
      ...a, todos,
      progress: { ...prev, assigned: linked.length, done: done.length, open: linked.length - done.length, pct: linked.length ? Math.round(100 * done.length / linked.length) : null, lastActive: last || prev.lastActive || '', idleDays: idle, asOf: today },
    } as Agent;
  }
  const open = [...byN.values()].filter((i) => i.state === 'open');
  res.unmatchedIssues = open.filter((i) => !seen.has(i.n)).length;
  return res;
}
