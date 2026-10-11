/* Built-in agent spec templates and the spec <-> editable-text conversions used by the wizard.
   Template text is copied verbatim from the original page. */
import { fullName, repoById, shortName, ago } from './model';
import type { Agent, Repo } from './types';

/* eslint-disable */
interface ArchSpec { role: string; reportsTo: string; purpose: string; responsibilities: string[]; requirements: string[]; tools: string[];
  goals: { text: string; horizon: string }[]; kras: { area: string; outcome: string; weight: number }[];
  kpis: { name: string; target: number; unit: string; cadence: string; dir: string }[]; todos: string[] }
export const ARCH: Record<string, { re: RegExp; spec: ArchSpec }> = {
 support:{re:/support|customer|ticket|helpdesk|faq|inbox|chat/i,spec:{
  role:'Customer Support Agent',reportsTo:'Founder / head of support',
  purpose:'Answers customers of {P} quickly and accurately, and turns repeated questions into documentation. Focus: {T}.',
  responsibilities:['Reply to incoming questions within the agreed response time','Tag and route tickets that need a human','Maintain a help centre and FAQ for {P}','Log recurring problems for the product team','Follow the escalation policy for refunds, safety and legal issues','Send a weekly summary of question themes'],
  requirements:['Clear, friendly writing','Working knowledge of {P}','Follows escalation rules without exceptions','Records what was decided on each ticket'],
  tools:['Helpdesk or shared inbox','Knowledge base','Product admin (read-only)','Team chat'],
  goals:[{text:'Write the first 15 FAQ answers for {P}',horizon:'30 days'},{text:'Handle {T} with human review on every reply',horizon:'90 days'},{text:'Cut repeat questions with better docs',horizon:'90 days'}],
  kras:[{area:'Responsiveness',outcome:'Customers get timely replies',weight:40},{area:'Accuracy',outcome:'Answers are correct and consistent',weight:35},{area:'Knowledge base',outcome:'Docs grow from real questions',weight:25}],
  kpis:[{name:'First response time',target:4,unit:'hours',cadence:'daily',dir:'down'},{name:'Customer satisfaction',target:90,unit:'%',cadence:'weekly',dir:'up'},{name:'Tickets resolved without escalation',target:80,unit:'%',cadence:'weekly',dir:'up'},{name:'FAQ articles published',target:15,unit:'articles',cadence:'monthly',dir:'up'}],
  todos:['Collect the 20 most likely customer questions about {P}','Draft answers and send them for approval','Set up ticket tags and routing rules','Write the escalation policy','Handle the first 10 live tickets with review','Send the first weekly themes summary']}},
 marketing:{re:/market|content|seo|blog|social|brand|campaign|copy|newsletter|landing/i,spec:{
  role:'Content & Growth Agent',reportsTo:'Founder / marketing lead',
  purpose:'Plans and publishes content that brings the right people to {P}. Focus: {T}.',
  responsibilities:['Maintain a content calendar tied to {P} goals','Draft blog posts, landing page copy and social posts for approval','Research keywords and competitor pages','Track visits and sign-ups from each piece','Keep the brand voice consistent','Report what worked each month'],
  requirements:['Strong writing and editing','Basic SEO knowledge','Reads analytics and draws plain conclusions','Does not publish without sign-off'],
  tools:['CMS or site repository','Web analytics','Keyword research tool','Social scheduler'],
  goals:[{text:'Write a one-page audience and positioning brief for {P}',horizon:'30 days'},{text:'Publish a steady content cadence for {T}',horizon:'90 days'},{text:'Grow organic visits month over month',horizon:'6 months'}],
  kras:[{area:'Content output',outcome:'Planned pieces published on time',weight:35},{area:'Audience growth',outcome:'More qualified visitors and sign-ups',weight:40},{area:'Brand consistency',outcome:'Voice and message stay aligned',weight:25}],
  kpis:[{name:'Posts published',target:8,unit:'per month',cadence:'monthly',dir:'up'},{name:'Organic visits',target:2000,unit:'per month',cadence:'monthly',dir:'up'},{name:'Sign-up conversion',target:3,unit:'%',cadence:'monthly',dir:'up'},{name:'Drafts approved on first review',target:70,unit:'%',cadence:'monthly',dir:'up'}],
  todos:['Write the audience and positioning brief for {P}','Audit the current site and list quick wins','Build a 30-day content calendar','Draft the first two pieces for approval','Set up tracking for visits and sign-ups','Review results and adjust the calendar']}},
 sales:{re:/sales|lead|outreach|prospect|pipeline|crm|deal|investor|pitch/i,spec:{
  role:'Sales Development Agent',reportsTo:'Founder / sales lead',
  purpose:'Finds and qualifies prospects for {P} and books conversations for the team. Focus: {T}.',
  responsibilities:['Build and maintain a target prospect list','Draft outreach messages for approval','Follow up on a fixed cadence','Record every interaction in the CRM','Qualify leads against agreed criteria','Hand over qualified leads with context'],
  requirements:['Understands who {P} is for','Concise, respectful outreach writing','Keeps accurate records','Respects opt-outs and privacy rules'],
  tools:['CRM','Email and LinkedIn (draft mode)','Lead research sources','Calendar'],
  goals:[{text:'Define the ideal customer profile for {P}',horizon:'30 days'},{text:'Run a first outreach campaign for {T}',horizon:'90 days'},{text:'Build a repeatable qualification process',horizon:'90 days'}],
  kras:[{area:'Pipeline',outcome:'Enough qualified leads each month',weight:45},{area:'Outreach quality',outcome:'Relevant, compliant messages',weight:30},{area:'Data hygiene',outcome:'CRM stays complete and current',weight:25}],
  kpis:[{name:'Qualified leads handed over',target:20,unit:'per month',cadence:'monthly',dir:'up'},{name:'Reply rate',target:12,unit:'%',cadence:'weekly',dir:'up'},{name:'Meetings booked',target:8,unit:'per month',cadence:'monthly',dir:'up'},{name:'CRM records complete',target:95,unit:'%',cadence:'weekly',dir:'up'}],
  todos:['Write the ideal customer profile for {P}','Build a first list of 50 prospects','Draft three outreach templates for approval','Set up the CRM stages and fields','Send the first 20 approved messages','Review replies and refine the templates']}},
 engineering:{re:/code|dev|feature|build|engineer|pull request|\bpr\b|review|refactor|deploy|bug|api|backend|frontend|test|release/i,spec:{
  role:'Software Engineer Agent',reportsTo:'Founder / tech lead',
  purpose:'Owns day-to-day engineering work on {P}: {T}. Ships small, reviewed changes and keeps the repository healthy.',
  responsibilities:['Break {T} into small pull requests with clear descriptions','Write and update tests for every change','Review incoming pull requests and flag risks','Triage open issues and label them by priority','Keep the README and setup steps accurate','Report blockers in a weekly update'],
  requirements:['Reads and writes the languages used in the {P} repository','Comfortable with Git, pull requests and CI','Writes clear commit messages and PR descriptions','Asks before changing shared behaviour'],
  tools:['GitHub (issues, pull requests)','CI pipeline','Code editor or sandbox','Error and log monitoring'],
  goals:[{text:'Understand the {P} codebase and list its main modules',horizon:'30 days'},{text:'Complete {T} in reviewed, tested increments',horizon:'90 days'},{text:'Bring the open issue backlog under control',horizon:'90 days'}],
  kras:[{area:'Delivery',outcome:'Planned work ships on schedule',weight:40},{area:'Quality',outcome:'Changes land with tests and few regressions',weight:35},{area:'Repository health',outcome:'Issues triaged, docs current',weight:25}],
  kpis:[{name:'Pull requests merged',target:8,unit:'per month',cadence:'monthly',dir:'up'},{name:'Test coverage on changed files',target:80,unit:'%',cadence:'monthly',dir:'up'},{name:'Median PR review time',target:24,unit:'hours',cadence:'weekly',dir:'down'},{name:'Open issues older than 30 days',target:5,unit:'issues',cadence:'weekly',dir:'down'}],
  todos:['Read the {P} README and map the folder structure','Run the project locally and note setup problems','List open issues and tag them by priority','Pick the first small change for {T} and open a draft PR','Add a test for the first change','Post a first weekly update']}},
 general:{re:/./,spec:{
  role:'Operations Agent',reportsTo:'Project owner',
  purpose:'Keeps work on {P} moving: {T}. Plans tasks, follows up, and reports progress.',
  responsibilities:['Turn {T} into a task list with owners and dates','Track progress and flag blockers','Prepare a weekly status update','Keep project documents organised','Escalate decisions that need the owner','Review results against the goals'],
  requirements:['Clear written communication','Structured planning','Reliable follow-through','Knows when to stop and ask'],
  tools:['Task tracker','Shared documents','Team chat','Calendar'],
  goals:[{text:'Agree the scope and success measures for {T}',horizon:'30 days'},{text:'Deliver {T} against the agreed plan',horizon:'90 days'},{text:'Run a steady weekly review rhythm',horizon:'90 days'}],
  kras:[{area:'Delivery',outcome:'Work finishes on the agreed dates',weight:45},{area:'Visibility',outcome:'Status is always current and clear',weight:30},{area:'Process',outcome:'Reviews and handovers run smoothly',weight:25}],
  kpis:[{name:'Tasks completed on time',target:85,unit:'%',cadence:'weekly',dir:'up'},{name:'Weekly updates sent',target:4,unit:'per month',cadence:'monthly',dir:'up'},{name:'Open blockers older than 7 days',target:2,unit:'blockers',cadence:'weekly',dir:'down'}],
  todos:['Write the scope and success measures for {T}','Break {T} into tasks with owners and dates','Set up the weekly review','Send the first status update','Collect open questions for the owner','Review progress against the goals']}}
};

export interface WizardInput { projectId: string; brief: string; task: string; autonomy: string }
export interface Spec {
  name: string; role: string; reportsTo: string; purpose: string;
  responsibilities: string[]; requirements: string[]; tools: string[];
  goals: { text: string; horizon: string }[];
  kras: { area: string; outcome: string; weight: number }[];
  kpis: { name: string; target: number; unit: string; cadence: string; dir: 'up' | 'down' }[];
  todos: { text: string }[];
}
export type SpecFields = Record<'name' | 'role' | 'reportsTo' | 'purpose' | 'responsibilities' | 'requirements' | 'tools' | 'goals' | 'kras' | 'kpis' | 'todos', string>;

export function templateSpec(repos: Repo[], w: WizardInput): Record<string, unknown> {
  const P = fullName(repos, w.projectId), T = (w.task || 'the agreed work').trim();
  let key = 'general';
  ['support', 'marketing', 'sales', 'engineering'].some((k) => { if (ARCH[k].re.test(T)) { key = k; return true } return false });
  const enc = (v: string) => JSON.stringify(v).slice(1, -1);
  const spec = JSON.parse(JSON.stringify(ARCH[key].spec).replace(/\{P\}/g, enc(P)).replace(/\{T\}/g, enc(T)));
  spec.name = shortName(repos, w.projectId) + ' ' + spec.role.replace(/ Agent$/, '');
  return spec;
}

/* ---------- spec <-> editable text ---------- */
const L = (a: string[] | undefined) => (a || []).join('\n');
export function lines(t: unknown): string[] { return String(t || '').split('\n').map((x) => x.trim()).filter(Boolean) }

export function normalizeSpec(input: unknown): Spec {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const arr = (v: unknown): any[] => Array.isArray(v) ? v : [];
  const str = (v: unknown): string => typeof v === 'string' ? v : (v == null ? '' : String(v));
  return {
    name: str(s.name), role: str(s.role), reportsTo: str(s.reportsTo), purpose: str(s.purpose),
    responsibilities: arr(s.responsibilities).map(str), requirements: arr(s.requirements).map(str), tools: arr(s.tools).map(str),
    goals: arr(s.goals).map((g) => typeof g === 'string' ? { text: g, horizon: '' } : { text: str(g.text), horizon: str(g.horizon) }),
    kras: arr(s.kras).map((k) => ({ area: str(k.area), outcome: str(k.outcome), weight: Number(k.weight) || 0 })),
    kpis: arr(s.kpis).map((k) => ({ name: str(k.name), target: Number(k.target) || 0, unit: str(k.unit), cadence: str(k.cadence) || 'monthly', dir: k.dir === 'down' ? 'down' as const : 'up' as const })),
    todos: arr(s.todos).map((t) => ({ text: typeof t === 'string' ? t : str(t && t.text) })),
  };
}

export function toFields(s: Spec): SpecFields {
  return {
    name: s.name, role: s.role, reportsTo: s.reportsTo, purpose: s.purpose,
    responsibilities: L(s.responsibilities), requirements: L(s.requirements), tools: L(s.tools),
    goals: s.goals.map((g) => g.text + ' | ' + (g.horizon || '')).join('\n'),
    kras: s.kras.map((k) => k.area + ' | ' + k.outcome + ' | ' + k.weight).join('\n'),
    kpis: s.kpis.map((k) => k.name + ' | ' + k.target + ' | ' + (k.unit || '') + ' | ' + (k.cadence || '') + ' | ' + (k.dir === 'down' ? 'lower is better' : 'higher is better')).join('\n'),
    todos: s.todos.map((t) => t.text).join('\n'),
  };
}

export function fromFields(f: SpecFields) {
  const parts = (l: string) => l.split('|').map((x) => x.trim());
  return {
    name: f.name.trim(), role: f.role.trim(), reportsTo: f.reportsTo.trim(), purpose: f.purpose.trim(),
    responsibilities: lines(f.responsibilities), requirements: lines(f.requirements), tools: lines(f.tools),
    goals: lines(f.goals).map((l) => { const p = parts(l); return { text: p[0], horizon: p[1] || '', done: false, due: '' } }),
    kras: lines(f.kras).map((l) => { const p = parts(l); return { area: p[0], outcome: p[1] || '', weight: parseFloat(p[2]) || 0 } }),
    kpis: lines(f.kpis).map((l) => { const p = parts(l); return { name: p[0], target: parseFloat(p[1]) || 0, unit: p[2] || '', cadence: p[3] || 'monthly', dir: /lower|down/i.test(p[4] || '') ? 'down' as const : 'up' as const, current: null, due: '' } }),
    todos: lines(f.todos).map((t) => ({ text: t, status: 'todo' as const, due: '' })),
  };
}

export function buildPrompt(repos: Repo[], w: WizardInput): string {
  const r = repoById(repos, w.projectId);
  const auto = ({ review: 'Drafts only; a human approves every action.', guardrails: 'Acts on its own inside written guardrails and escalates anything outside them.', full: 'Runs the work end to end and reports afterwards.' } as Record<string, string>)[w.autonomy] || '';
  return 'You are helping an owner who runs a portfolio of software projects staffed by AI agent employees. Write the role specification for one new agent.\n\n'
    + 'Project: ' + fullName(repos, w.projectId) + (r ? ' (GitHub repository, ' + r.visibility + ', last push ' + ago(r.pushed_at) + ')' : '') + '\n'
    + 'Project brief from the owner: ' + (w.brief.trim() || '(none given; only the repository name is known)') + '\n'
    + 'Task for the agent: ' + w.task.trim() + '\n'
    + 'Autonomy: ' + auto + '\n\n'
    + 'Rules: ground everything in the project name, brief and task. Do not invent product facts, customers, tools the owner did not mention, or numbers about the project. Where something is unknown, make the first todos about finding it out. Todos are concrete first-week actions in order. KPI targets are realistic starting targets the owner can edit. KRA weights add up to 100.\n\n'
    + 'Reply with only one JSON object of this shape:\n'
    + '{"name":"short agent name","role":"job title","reportsTo":"who it reports to","purpose":"2-3 sentence job description summary",'
    + '"responsibilities":["5-7 items"],"requirements":["4-6 skills or knowledge items"],"tools":["3-6 tools or systems"],'
    + '"goals":[{"text":"...","horizon":"30 days|90 days|6 months"}],'
    + '"kras":[{"area":"...","outcome":"...","weight":40}],'
    + '"kpis":[{"name":"...","target":10,"unit":"...","cadence":"daily|weekly|monthly","dir":"up|down"}],'
    + '"todos":[{"text":"..."}]}\n'
    + 'Give 3-4 goals, 3-4 KRAs, 3-5 KPIs and 6-8 todos.';
}

export function jdText(repos: Repo[], a: Agent): string {
  const out = [a.name + ' - ' + a.role, 'Project: ' + fullName(repos, a.projectId), a.reportsTo ? 'Reports to: ' + a.reportsTo : '', '', 'Purpose', a.purpose || '', '', 'Responsibilities'];
  (a.responsibilities || []).forEach((x) => out.push('- ' + x));
  out.push('', 'Requirements'); (a.requirements || []).forEach((x) => out.push('- ' + x));
  out.push('', 'Tools'); (a.tools || []).forEach((x) => out.push('- ' + x));
  out.push('', 'Goals'); (a.goals || []).forEach((g) => out.push('- ' + g.text + (g.horizon ? ' (' + g.horizon + ')' : '') + (g.due ? ' due ' + g.due : '')));
  out.push('', 'Key result areas'); (a.kras || []).forEach((k) => out.push('- ' + k.area + ' (' + k.weight + '%): ' + k.outcome));
  out.push('', 'KPIs'); (a.kpis || []).forEach((k) => out.push('- ' + k.name + ': ' + (k.target == null ? 'target not set' : k.target + ' ' + (k.unit || '')) + ' ' + (k.cadence || '')));
  return out.filter((x, i, arr) => !(x === '' && arr[i - 1] === '')).join('\n');
}
