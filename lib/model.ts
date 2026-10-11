/* Pure helpers ported from the original page: names, dates, flags, scoring and the org tree.
   Functions that need the repository list take it as an argument so they stay testable. */
import type { Agent, Goal, Kpi, Repo, Routine, Todo } from './types';

export function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
export function clone<T>(o: T): T { return JSON.parse(JSON.stringify(o)) }
export function rid(r: Repo): string { return r.full_name.replace('/', '__') }
export function repoById(repos: Repo[], id: string): Repo | null {
  for (const r of repos) if (rid(r) === id) return r;
  return null;
}
export function shortName(repos: Repo[], id: string): string {
  const r = repoById(repos, id);
  return r ? r.full_name.split('/')[1] : String(id).split('__').pop() as string;
}
export function fullName(repos: Repo[], id: string): string {
  const r = repoById(repos, id);
  return r ? r.full_name : String(id).replace('__', '/');
}
export function newId(): string { return 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
export function ago(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (!(d >= 0)) return '';
  if (d < 1) return 'today';
  if (d < 2) return 'yesterday';
  if (d < 30) return Math.floor(d) + ' days ago';
  if (d < 365) return Math.floor(d / 30) + ' months ago';
  return Math.floor(d / 365) + ' years ago';
}
export function fmtDate(ms: number | null | undefined): string {
  return ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}
export function count<T>(a: Agent, key: 'goals' | 'todos' | 'kpis', pred: (x: T) => boolean): number {
  return ((a[key] as T[] | undefined) || []).filter(pred).length;
}
export function statusLabel(s: string | undefined): string {
  return ({ active: 'Active', paused: 'Paused', draft: 'Draft' } as Record<string, string>)[s || ''] || 'Active';
}
export function fmtNum(n: unknown): string { return n == null || n === '' ? '' : Number(n).toLocaleString() }
export function kpiPct(k: Kpi): number | null {
  if (k.current == null || (k.current as unknown) === '' || !((k.target as number) > 0)) return null;
  const c = Number(k.current);
  if (!isFinite(c)) return null;
  const t = k.target as number;
  if (k.dir === 'down') return c <= t ? 100 : Math.round(t / c * 100);
  return Math.min(100, Math.round(c / t * 100));
}
export function agentPct(a: Agent): number | null {
  const v = (a.kpis || []).map(kpiPct).filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
}
export function tone(p: number | null): string { return p == null ? '' : p >= 90 ? 't-ok' : p >= 60 ? 't-warn' : 't-bad' }

/* ---------- dates and flags ---------- */
export function today(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function isLate(kind: 'todo' | 'goal' | 'kpi', it: Todo | Goal | Kpi | undefined): boolean {
  if (!it || !it.due || it.due >= today()) return false;
  if (kind === 'todo') return (it as Todo).status !== 'done';
  if (kind === 'goal') return !(it as Goal).done;
  const p = kpiPct(it as Kpi);
  return p == null || p < 100;
}
export function isBlocked(t: Todo): boolean { return t.status !== 'done' && /\[[^\]]*(blocked|needs founder)/i.test(t.text || '') }
export function routineLate(r: Routine | undefined): boolean { return !!r && r.state === 'on' && !!r.next && r.next < today() }
export function lateCount(a: Agent): number {
  let n = 0;
  (a.todos || []).forEach((t) => { if (isLate('todo', t)) n++ });
  (a.goals || []).forEach((g) => { if (isLate('goal', g)) n++ });
  (a.kpis || []).forEach((k) => { if (isLate('kpi', k)) n++ });
  (a.routines || []).forEach((r) => { if (routineLate(r)) n++ });
  return n;
}
export function libCount(a: Agent): number { return (a.memory || []).length + (a.docs || []).length + (a.skills || []).length + (a.routines || []).length }
export function attention(a: Agent): boolean { return lateCount(a) > 0 || (a.todos || []).some(isBlocked) }
export function nextDue(a: Agent): string {
  const ds: string[] = [];
  (a.todos || []).forEach((t) => { if (t.due && t.status !== 'done') ds.push(t.due) });
  (a.goals || []).forEach((g) => { if (g.due && !g.done) ds.push(g.due) });
  (a.kpis || []).forEach((k) => { if (k.due) ds.push(k.due) });
  (a.routines || []).forEach((r) => { if (r.next && r.state === 'on') ds.push(r.next) });
  ds.sort();
  return ds[0] || '';
}

/* ---------- tree ---------- */
export function nrm(s: unknown): string {
  return String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function repKey(s: unknown): string {
  let t = String(s || '');
  const v = t.toLowerCase().indexOf(' via ');
  if (v >= 0) t = t.slice(v + 5);
  return nrm(t);
}
export function sortAg(x: Agent, y: Agent): number {
  const rx = x.level === 'Head' ? 0 : 1, ry = y.level === 'Head' ? 0 : 1;
  return rx - ry || String(x.name).localeCompare(String(y.name));
}
export interface Tree { roots: Agent[]; kids: Record<string, Agent[]> }
export function buildTree(list: Agent[]): Tree {
  const kids: Record<string, Agent[]> = {}, roots: Agent[] = [];
  const names = list.map((a) => { const n = nrm(a.name); return { a, n, w: n.split(' ') } });
  list.forEach((a) => {
    const rk = repKey(a.reportsTo);
    let parent: string | null = null;
    if (rk && rk !== 'founder') {
      const same = names.filter((x) => x.a.id !== a.id && x.a.projectId === a.projectId);
      let ex = same.filter((x) => x.n === rk)[0];
      if (!ex) {
        const rw = rk.split(' ');
        const c = same.filter((x) => rw.every((w) => x.w.indexOf(w) >= 0));
        c.sort((p, q) => p.w.length - q.w.length);
        ex = c[0];
      }
      if (ex) parent = ex.a.id;
    }
    if (parent) (kids[parent] = kids[parent] || []).push(a); else roots.push(a);
  });
  const seen: Record<string, 1> = {};
  function mark(a: Agent) { if (seen[a.id]) return; seen[a.id] = 1; (kids[a.id] || []).forEach(mark) }
  roots.forEach(mark);
  list.forEach((a) => { if (!seen[a.id]) { roots.push(a); mark(a) } });
  roots.sort(sortAg);
  Object.keys(kids).forEach((k) => { kids[k].sort(sortAg) });
  return { roots, kids };
}
