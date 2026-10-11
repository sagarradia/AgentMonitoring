/* CSV export of the tree grid, in the same row order and columns as the original page. */
import { buildTree, fullName, nextDue, shortName, statusLabel } from './model';
import type { Agent, Repo } from './types';

export const CSV_HEADER = ['Project', 'Agent', 'Level', 'Kind', 'Item', 'Status', 'Due', 'Target', 'Current', 'Detail', 'Reports to'];
const TODO_LABEL: Record<string, string> = { todo: 'To do', doing: 'In progress', done: 'Done' };

export function csvCell(v: unknown): string {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function csvRows(list: Agent[], repos: Repo[]): (string | number)[][] {
  const T = buildTree(list);
  const rows: (string | number)[][] = [CSV_HEADER.slice()];
  function add(a: Agent) {
    const proj = fullName(repos, a.projectId), lv = a.level || '';
    rows.push([proj, a.name, lv, 'Agent', a.role || '', statusLabel(a.status), nextDue(a), '', '', a.purpose || '', a.reportsTo || '']);
    (a.goals || []).forEach((g) => rows.push([proj, a.name, lv, 'Goal', g.text, g.done ? 'Met' : 'Open', g.due || '', '', '', [g.horizon, g.note].filter(Boolean).join(' · '), '']));
    (a.kras || []).forEach((k) => rows.push([proj, a.name, lv, 'KRA', k.area, k.weight + '%', '', '', '', k.outcome, '']));
    (a.kpis || []).forEach((k) => rows.push([proj, a.name, lv, 'KPI', k.name, '', k.due || '', k.target == null ? '' : k.target, k.current == null ? '' : k.current, [k.unit, k.cadence, k.note].filter(Boolean).join(' · '), '']));
    (a.todos || []).forEach((t) => rows.push([proj, a.name, lv, 'Todo', t.text, TODO_LABEL[t.status || 'todo'], t.due || '', '', '', t.note || '', '']));
    (a.routines || []).forEach((r) => rows.push([proj, a.name, lv, 'Routine', r.name, r.state || 'planned', r.next || '', '', '', [r.cadence, r.note].filter(Boolean).join(' · '), '']));
    (a.memory || []).forEach((m) => rows.push([proj, a.name, lv, 'Memory', m.text, '', m.at || '', '', '', '', '']));
    (a.docs || []).forEach((x) => rows.push([proj, a.name, lv, 'Doc', x.title, '', '', '', '', [x.path, x.note].filter(Boolean).join(' · '), '']));
    (a.skills || []).forEach((x) => rows.push([proj, a.name, lv, 'Skill', x.name, '', '', '', '', x.note || '', '']));
    (T.kids[a.id] || []).forEach(add);
  }
  T.roots.forEach(add);
  return rows;
}

/** UTF-8 BOM so Excel opens accented text correctly, CRLF line ends. */
export function buildCsv(list: Agent[], repos: Repo[]): string {
  return '﻿' + csvRows(list, repos).map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function csvFilename(scope: string, repos: Repo[]): string {
  return 'agent-desk-' + (scope === 'all' ? 'all-projects' : shortName(repos, scope)) + '.csv';
}
