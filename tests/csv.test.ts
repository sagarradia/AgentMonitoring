import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCsv, csvCell, csvFilename, csvRows, CSV_HEADER } from '@/lib/csv';
import type { Agent, Repo } from '@/lib/types';

const repos: Repo[] = [{ full_name: 'example/widgets', url: 'https://github.com/example/widgets', pushed_at: '', visibility: 'private' }];
const head: Agent = {
  id: 'h', projectId: 'example__widgets', name: 'Eng Lead', role: 'Head of Engineering', level: 'Head', reportsTo: 'Founder', status: 'active', purpose: 'Leads, plans',
  goals: [{ text: 'Ship "beta"', horizon: '30 days', done: false, due: '2026-11-01' }],
  kras: [{ area: 'Delivery', outcome: 'On time', weight: 40 }],
  kpis: [{ name: 'PRs merged', target: 8, unit: 'per month', cadence: 'monthly', dir: 'up', current: 3, due: '' }],
  todos: [{ text: 'Line one\nline two', status: 'doing', due: '2026-10-20' }],
  routines: [{ name: 'Weekly review', cadence: 'weekly', state: 'on', next: '2026-10-13' }],
  memory: [{ text: 'Ask before merging', at: '2026-10-11', src: 'you' }],
  docs: [{ title: 'Readme', path: 'README.md' }],
  skills: [{ name: 'Triage', note: 'Labels issues' }],
};
const junior: Agent = { id: 'j', projectId: 'example__widgets', name: 'Eng Junior', role: 'Engineer', reportsTo: 'Eng Lead', status: 'paused', todos: [{ text: 'Fix bug' }] };

describe('csvCell', () => {
  it('quotes only when needed and doubles quotes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(0)).toBe('0');
  });
});

describe('buildCsv', () => {
  const csv = buildCsv([junior, head], repos);
  const lines = csv.slice(1).split('\r\n');

  it('starts with a UTF-8 BOM and the header row, CRLF separated', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe(CSV_HEADER.join(','));
  });

  it('writes one row per agent and item, parents before their reports', () => {
    const rows = csvRows([junior, head], repos);
    expect(rows.map((r) => r[3])).toEqual(['Kind', 'Agent', 'Goal', 'KRA', 'KPI', 'Todo', 'Routine', 'Memory', 'Doc', 'Skill', 'Agent', 'Todo']);
    expect(rows[1][1]).toBe('Eng Lead');
    expect(rows[10][1]).toBe('Eng Junior');
  });

  it('fills the columns the way the original export did', () => {
    const rows = csvRows([head], repos);
    expect(rows[1]).toEqual(['example/widgets', 'Eng Lead', 'Head', 'Agent', 'Head of Engineering', 'Active', '2026-10-13', '', '', 'Leads, plans', 'Founder']);
    expect(rows[3]).toEqual(['example/widgets', 'Eng Lead', 'Head', 'KRA', 'Delivery', '40%', '', '', '', 'On time', '']);
    expect(rows[4]).toEqual(['example/widgets', 'Eng Lead', 'Head', 'KPI', 'PRs merged', '', '', 8, 3, 'per month · monthly', '']);
    expect(rows[5][5]).toBe('In progress');
    expect(rows[6]).toEqual(['example/widgets', 'Eng Lead', 'Head', 'Routine', 'Weekly review', 'on', '2026-10-13', '', '', 'weekly', '']);
  });

  it('escapes quotes, commas and newlines', () => {
    expect(csv).toContain('"Ship ""beta"""');
    expect(csv).toContain('"Leads, plans"');
    expect(csv).toContain('"Line one\nline two"');
  });

  it('labels a todo without a status as To do', () => {
    expect(csvRows([junior], repos)[2][5]).toBe('To do');
  });

  it('exports the whole seed', () => {
    const seed = JSON.parse(readFileSync('seed.json', 'utf8')) as { agents: Agent[] };
    const rows = csvRows(seed.agents, repos);
    const expected = 1 + seed.agents.reduce((n, a) => n + 1 + ['goals', 'kras', 'kpis', 'todos', 'routines', 'memory', 'docs', 'skills'].reduce((m, k) => m + ((a[k] as unknown[]) || []).length, 0), 0);
    expect(rows.length).toBe(expected);
  });
});

describe('csvFilename', () => {
  it('names the file after the scope', () => {
    expect(csvFilename('all', repos)).toBe('agent-desk-all-projects.csv');
    expect(csvFilename('example__widgets', repos)).toBe('agent-desk-widgets.csv');
  });
});
