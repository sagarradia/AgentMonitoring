/* Extra details for the "Build an agent" wizard: tools and access, approvals, check-in cadence,
   reporting line and notes. Every option has a default that is pre-selected from the kind of
   task, so the owner can accept them as they are or untick what does not apply.
   These are recorded on the role; this app does not connect to the services themselves. */
import { archetypeOf } from './templates';
import { deptOf } from './org';
import { matchPlugins, resolveRole } from './roles';

export const TOOL_OPTIONS = [
  'GitHub', 'Slack', 'Gmail', 'Google Calendar', 'Google Drive', 'Google Docs', 'Notion',
  'Linear', 'Jira', 'Figma', 'HubSpot', 'Stripe', 'Zendesk', 'Intercom', 'Web search', 'Analytics',
] as const;

const DEFAULT_TOOLS: Record<string, string[]> = {
  engineering: ['GitHub', 'Slack', 'Linear', 'Web search'],
  support: ['Gmail', 'Slack', 'Zendesk', 'Google Docs'],
  marketing: ['Google Docs', 'Google Drive', 'Analytics', 'Web search', 'Slack'],
  sales: ['Gmail', 'Google Calendar', 'HubSpot', 'Slack'],
  general: ['Slack', 'Google Calendar', 'Google Drive', 'Notion'],
};

export const APPROVAL_OPTIONS = [
  'Sending messages outside the team',
  'Spending money or changing billing',
  'Merging or deploying code',
  'Deleting data',
  'Publishing content',
  'Changing access or permissions',
] as const;

const DEFAULT_APPROVALS: Record<string, string[]> = {
  engineering: ['Merging or deploying code', 'Deleting data', 'Changing access or permissions'],
  support: ['Sending messages outside the team', 'Spending money or changing billing', 'Deleting data'],
  marketing: ['Publishing content', 'Spending money or changing billing', 'Sending messages outside the team'],
  sales: ['Sending messages outside the team', 'Spending money or changing billing'],
  general: ['Sending messages outside the team', 'Spending money or changing billing', 'Deleting data'],
};

export const CADENCES = ['Daily', 'Weekly', 'Every two weeks', 'Monthly'] as const;

export interface WizardExtras {
  tools: string[];          // ticked tools
  otherTools: string;       // comma separated extras
  approvals: string[];      // ticked approval rules
  cadence: string;          // status update cadence
  reportsTo: string;        // '' = use the drafted value
  notes: string;            // anything else the owner wants the role to follow
  dept: string;             // '' = worked out from the task
  designation: string;      // head | lead | agent | junior
  skills: string[];         // ticked skills
  plugins: string[];        // ticked registered plugins and skills (by name)
  touched: { tools: boolean; approvals: boolean; skills?: boolean; plugins?: boolean };
}

export function defaultExtras(task: string): WizardExtras {
  const k = archetypeOf(task);
  return { tools: DEFAULT_TOOLS[k].slice(), otherTools: '', approvals: DEFAULT_APPROVALS[k].slice(), cadence: 'Weekly', reportsTo: '', notes: '', dept: '', designation: 'agent', skills: resolveRole(deptOf({ role: task }), 'agent').skills.map((x) => x[0]), plugins: [], touched: { tools: false, approvals: false } };
}

/** Re-derives the defaults from the task text, keeping anything the owner already changed. */
export const roleChosen = (x: WizardExtras) => !!x.dept || x.designation !== 'agent';
export const effectiveDept = (x: WizardExtras, task: string) => x.dept || deptOf({ role: task });
export function refreshDefaults(x: WizardExtras, task: string, pluginNames: string[] = []): WizardExtras {
  const d = defaultExtras(task), r = resolveRole(effectiveDept(x, task), x.designation), chosen = roleChosen(x);
  return {
    ...x,
    tools: x.touched.tools ? x.tools : chosen ? r.tools.slice() : d.tools,
    approvals: x.touched.approvals ? x.approvals : chosen ? r.approvals.slice() : d.approvals,
    skills: x.touched.skills ? x.skills : r.skills.map((k) => k[0]),
    plugins: x.touched.plugins ? x.plugins : matchPlugins(r.plugins, pluginNames),
  };
}

export function allTools(x: WizardExtras): string[] {
  const extra = x.otherTools.split(',').map((s) => s.trim()).filter(Boolean);
  return [...x.tools, ...extra.filter((e) => !x.tools.includes(e))];
}

export function mustNotLines(x: WizardExtras, task = ''): string[] {
  const own = x.approvals.map((a) => a + ' without the owner\'s approval');
  return roleChosen(x) ? [...new Set([...own, ...resolveRole(effectiveDept(x, task), x.designation).mustNot])] : own;
}

/** Text appended to the Claude drafting prompt so the draft uses the owner's choices. */
export function extrasPrompt(x: WizardExtras): string {
  const t = allTools(x);
  return '\n\nOwner\'s choices (use them as given):\n'
    + 'Tools and access: ' + (t.length ? t.join(', ') + '. List only these in "tools".' : 'none chosen; keep "tools" to what the task strictly needs.') + '\n'
    + 'Needs approval before: ' + (x.approvals.length ? x.approvals.join('; ') : 'nothing specified') + '\n'
    + (roleChosen(x) ? 'Department: ' + effectiveDept(x, '') + '. Designation: ' + resolveRole(effectiveDept(x, ''), x.designation).title + '. Keep these typical duties in mind: ' + resolveRole(effectiveDept(x, ''), x.designation).duties.slice(0, 5).join('; ') + '\n' : '')
    + (x.skills.length ? 'Skills it should have: ' + x.skills.join(', ') + '\n' : '')
    + 'Status update cadence: ' + x.cadence + '\n'
    + (x.reportsTo.trim() ? 'Reports to: ' + x.reportsTo.trim() + '\n' : '')
    + (x.notes.trim() ? 'Other notes from the owner: ' + x.notes.trim() + '\n' : '');
}

/** Applies the choices to a drafted spec (template or Claude) before the review step. */
export function applyExtras<T extends Record<string, unknown>>(spec: T, x: WizardExtras, task = ''): T {
  const out: Record<string, unknown> = { ...spec };
  if (roleChosen(x)) {
    const r = resolveRole(effectiveDept(x, task), x.designation);
    const merge = (cur: unknown, add: string[]) => { const base = Array.isArray(cur) ? (cur as unknown[]).map(String) : []; const seen = new Set(base.map((z) => z.toLowerCase())); return [...base, ...add.filter((z) => !seen.has(z.toLowerCase()))] };
    out.responsibilities = merge(out.responsibilities, r.duties.slice(0, 5));
    out.requirements = merge(out.requirements, r.requirements);
    out.role = r.title;
  }
  const t = allTools(x);
  if (t.length) out.tools = t;
  if (x.reportsTo.trim()) out.reportsTo = x.reportsTo.trim();
  out.mustNot = mustNotLines(x, task);
  out.cadence = x.cadence;
  if (x.notes.trim()) out.notes = x.notes.trim();
  return out as T;
}
