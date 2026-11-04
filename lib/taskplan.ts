/* Planning helpers for "Add task" and the agent brain: which model is the cheapest one that is still accurate
   enough, which helper agents (subagents) a task may use, and what memory an agent keeps.
   Cost and accuracy figures are relative estimates set by the owner of this app, not measured prices. The
   plan's tokens are the only budget (no pay-per-use), so "cost" means how much of the plan a run uses. */

export interface ModelInfo { id: string; name: string; connected?: boolean }
export interface AgentLite { id: string; name: string; role?: string; level?: string; reportsTo?: string; status?: string }

export const PROFILES: Record<string, { cost: number; accuracy: number; note: string }> = {
  haiku55: { cost: 1, accuracy: 3, note: 'lightest and cheapest, good for simple, well-defined jobs' },
  sonnet55: { cost: 2, accuracy: 4, note: 'strong all-rounder at about half the cost of Opus' },
  opus55: { cost: 4, accuracy: 5, note: 'most accurate, keep it for hard or risky work' },
};
const UNKNOWN = { cost: 3, accuracy: 3, note: 'not rated here' };
export const profileOf = (id: string) => PROFILES[id] || UNKNOWN;

const HIGH = /\b(secur\w*|crypto\w*|encrypt\w*|keys?|legal|law|consent|payments?|billing|money|architect\w*|migrat\w*|production|audit\w*|privacy|recovery|compliance|incident|delete|permissions?)\b/i;
const LOW = /\b(summar\w*|format\w*|list|label\w*|triage|rename|copy|translate|tidy|sort|collect|lookup|look up|fetch|remind\w*|notes?)\b/i;

export type Need = { level: 'low' | 'medium' | 'high'; accuracy: number; why: string };
export function needOf(text: string, leader = false): Need {
  if (leader) return { level: 'high', accuracy: 5, why: 'a lead role that needs its own brain, so it gets the most accurate model' };
  if (HIGH.test(text)) return { level: 'high', accuracy: 5, why: 'the task touches ' + (text.match(HIGH) || [''])[0].toLowerCase() + ', where mistakes are costly' };
  if (LOW.test(text) && text.length < 160) return { level: 'low', accuracy: 3, why: 'a simple, well-defined job' };
  return { level: 'medium', accuracy: 4, why: 'ordinary build or analysis work' };
}

/** Cheapest connected model whose accuracy meets the need; ties go to the more accurate one. */
export function recommendModel(text: string, models: ModelInfo[], leader = false): { id: string; why: string } {
  const need = needOf(text, leader);
  const pool = models.filter((m) => m.connected !== false && PROFILES[m.id]);
  if (!pool.length) return { id: '', why: 'No connected model with a known rating. Pick one yourself.' };
  const ok = pool.filter((m) => profileOf(m.id).accuracy >= need.accuracy)
    .sort((a, b) => profileOf(a.id).cost - profileOf(b.id).cost || profileOf(b.id).accuracy - profileOf(a.id).accuracy);
  const pick = ok[0] || pool.slice().sort((a, b) => profileOf(b.id).accuracy - profileOf(a.id).accuracy)[0];
  const p = profileOf(pick.id);
  return { id: pick.id, why: pick.name + ': ' + (ok[0] ? 'cheapest connected model that is accurate enough for ' + need.why + '. ' : 'the most accurate connected one, though the task wants more. ') + p.note + '.' };
}

export const isLeader = (a: { level?: string; role?: string; name?: string }) =>
  a.level === 'Head' || /\b(cto|cpo|ceo|coo|chief|head of|director|orchestrator)\b/i.test((a.role || '') + ' ' + (a.name || ''));

export const MEMORY_OPTIONS = [
  'Role memory (notes it always keeps in mind)',
  'Project brief',
  'Shared organisation notes',
  'Team notes (read on demand)',
  'Decision log',
  'Past task history',
  'Daily working notes (cleared weekly)',
] as const;

export interface Brain { own: boolean; memory: string[]; note?: string }
export function defaultBrain(a: { level?: string; role?: string; name?: string }): Brain {
  return isLeader(a)
    ? { own: true, memory: [MEMORY_OPTIONS[0], MEMORY_OPTIONS[1], MEMORY_OPTIONS[2], MEMORY_OPTIONS[3], MEMORY_OPTIONS[4], MEMORY_OPTIONS[5]] }
    : { own: false, memory: [MEMORY_OPTIONS[0], MEMORY_OPTIONS[1], MEMORY_OPTIONS[6]] };
}
export const brainOf = (a: { brain?: Brain; level?: string; role?: string; name?: string }): Brain => a.brain || defaultBrain(a);

export interface Sub { key: string; name: string; agentId?: string; model: string; why: string; task: string }
const HELPERS: Array<{ key: string; name: string; test: RegExp; task: string; force?: boolean; text: string }> = [
  { key: 'h-research', name: 'Researcher', test: /\b(research|find|compare|investigate|survey|look up|scan)\b/i, task: 'Gathers facts and sources', text: 'collect and list facts, sources and links' },
  { key: 'h-tests', name: 'Test writer', test: /\b(build|implement|code|feature|fix|api|screen|component|test)\b/i, task: 'Writes and runs the checks', text: 'write test cases and list results' },
  { key: 'h-review', name: 'Reviewer', test: /\b(review|build|implement|code|feature|release|publish|draft)\b/i, task: 'Second pair of eyes before handing back', text: 'review the work against the acceptance checks' },
  { key: 'h-docs', name: 'Summariser', test: /\b(report|document|docs?|summar\w*|notes|update|status)\b/i, task: 'Writes the plain-language summary', text: 'summarise the result and format the notes' },
  { key: 'h-sec', name: 'Security checker', test: HIGH, task: 'Checks keys, logs, permissions and data handling', text: 'check security and privacy rules, review permissions and logging' },
];
/** Helpers for a task, each on the cheapest model that is accurate enough for its own job. */
export function suggestSubs(text: string, models: ModelInfo[], agents: AgentLite[], parent?: AgentLite): Sub[] {
  const out: Sub[] = [];
  if (parent) {
    const stem = (w: string) => w.slice(0, 5);
    const words = new Set(text.toLowerCase().split(/\W+/).filter((w) => w.length > 3).map(stem));
    agents.filter((a) => a.id !== parent.id && a.reportsTo && a.reportsTo === parent.name && (a.status || 'active') === 'active')
      .map((a) => ({ a, hits: ((a.role || '') + ' ' + a.name).toLowerCase()  .split(/\W+/).filter((w) => w.length > 3 && words.has(stem(w))).length }))
      .filter((x) => x.hits > 0).sort((x, y) => y.hits - x.hits).slice(0, 2)
      .forEach(({ a }) => { const r = recommendModel(text, models); out.push({ key: 'a-' + a.id, name: a.name, agentId: a.id, model: r.id, why: 'Already reports to ' + parent.name + ' and its role matches. ' + r.why, task: a.role || 'Teammate' }) });
  }
  HELPERS.filter((h) => h.test.test(text)).slice(0, 3).forEach((h) => {
    const r = recommendModel(h.text + (h.key === 'h-sec' ? ' security privacy' : ''), models);
    out.push({ key: h.key, name: h.name, model: r.id, why: r.why, task: h.task });
  });
  return out;
}
export function allHelpers(models: ModelInfo[]): Sub[] {
  return HELPERS.map((h) => { const r = recommendModel(h.text + (h.key === 'h-sec' ? ' security privacy' : ''), models); return { key: h.key, name: h.name, model: r.id, why: r.why, task: h.task } });
}
