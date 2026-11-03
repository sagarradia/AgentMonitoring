/* Shared items: a todo, KPI, goal, memory note or document that applies to a scope.
   Todos, KPIs and goals are copied onto each agent (each agent tracks its own progress);
   memory and documents are looked up when needed. Pure functions; the page persists the result. */
import type { Agent } from './types';
import { applies, type Scope, type TeamOf } from './scope';

export type SharedKind = 'todo' | 'kpi' | 'goal' | 'memory' | 'doc';
export interface Shared {
  id: string; kind: SharedKind; scope: Scope;
  text?: string; name?: string; target?: number | null; unit?: string; cadence?: string; dir?: 'up' | 'down';
  due?: string; horizon?: string; title?: string; path?: string;
}
export const SHARED_KINDS: Array<[SharedKind, string]> = [['todo', 'Todo'], ['kpi', 'KPI'], ['goal', 'Goal'], ['memory', 'Memory note'], ['doc', 'Document']];
export const NOTE = 'Shared item';
const KEY = { todo: 'todos', kpi: 'kpis', goal: 'goals' } as const;
type Mat = keyof typeof KEY;
export function materialises(k: SharedKind): k is Mat { return k === 'todo' || k === 'kpi' || k === 'goal' }

type Row = Record<string, unknown> & { sharedId?: string };
function fresh(s: Shared): Row {
  if (s.kind === 'todo') return { text: s.text || '', status: 'todo', ...(s.due ? { due: s.due } : {}), note: NOTE, sharedId: s.id };
  if (s.kind === 'kpi') return { name: s.name || '', target: s.target ?? null, unit: s.unit || '', cadence: s.cadence || '', dir: s.dir || 'up', current: null, note: NOTE, sharedId: s.id };
  return { text: s.text || '', horizon: s.horizon || '', done: false, ...(s.due ? { due: s.due } : {}), note: NOTE, sharedId: s.id };
}
function untouched(kind: Mat, r: Row): boolean {
  if (kind === 'todo') return (r.status || 'todo') === 'todo' && r.pct == null;
  if (kind === 'kpi') return r.current == null || r.current === '';
  return !r.done;
}
function refresh(s: Shared, r: Row): Row {
  const n = fresh(s), out: Row = { ...r };
  if (s.kind === 'kpi') { out.name = n.name; out.target = n.target; out.unit = n.unit; out.cadence = n.cadence; out.dir = n.dir }
  else { out.text = n.text; if (untouched(s.kind as Mat, r)) { if (n.due) out.due = n.due; else delete out.due } if (s.kind === 'goal') out.horizon = n.horizon }
  return out;
}
export interface SyncResult { changed: boolean; added: number; removed: number; kept: number }
/** Bring one agent's copied rows in line with the shared list. Mutates the agent. */
export function syncAgent(shared: Shared[], a: Agent, teamOf: TeamOf): SyncResult {
  const res: SyncResult = { changed: false, added: 0, removed: 0, kept: 0 };
  (Object.keys(KEY) as Mat[]).forEach((kind) => {
    const key = KEY[kind], src = ((a[key] as Row[] | undefined) || []).slice();
    const mine = shared.filter((s) => s.kind === kind), ids = new Set(mine.map((s) => s.id));
    const out: Row[] = [];
    for (const r of src) {
      if (!r.sharedId) { out.push(r); continue }
      const s = mine.find((x) => x.id === r.sharedId);
      if (s && applies(s.scope, a, teamOf)) { const u = refresh(s, r); if (JSON.stringify(u) !== JSON.stringify(r)) res.changed = true; out.push(u); continue }
      if (untouched(kind, r)) { res.removed++; res.changed = true; continue }
      const { sharedId: _drop, ...rest } = r; void _drop;
      out.push({ ...rest, note: 'Was shared; kept because it has progress' }); res.kept++; res.changed = true;
    }
    for (const s of mine) {
      if (!ids.has(s.id) || !applies(s.scope, a, teamOf)) continue;
      if (out.some((r) => r.sharedId === s.id)) continue;
      out.push(fresh(s)); res.added++; res.changed = true;
    }
    if (res.changed) (a as Record<string, unknown>)[key] = out;
  });
  return res;
}
export function syncAll(shared: Shared[], agents: Agent[], teamOf: TeamOf): { ids: string[]; added: number; removed: number; kept: number } {
  const t = { ids: [] as string[], added: 0, removed: 0, kept: 0 };
  for (const a of agents) {
    const r = syncAgent(shared, a, teamOf);
    if (r.changed) { t.ids.push(a.id); t.added += r.added; t.removed += r.removed; t.kept += r.kept }
  }
  return t;
}
export function sharedFor(shared: Shared[], a: Agent, teamOf: TeamOf, kinds: SharedKind[]): Shared[] {
  return shared.filter((s) => kinds.includes(s.kind) && applies(s.scope, a, teamOf));
}
export function sharedLabel(s: Shared): string {
  return s.kind === 'kpi' ? s.name || '' : s.kind === 'doc' ? s.title || '' : s.text || '';
}
