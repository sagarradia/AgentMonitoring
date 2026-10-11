/* Chat prompts. The text, and in particular the honesty rules in agentBrief ("no run logs"),
   are copied verbatim from the original page. Do not edit them without a reason. */
import { fullName, isLate, routineLate, today } from './model';
import type { Agent, ChatMessage, Repo, Turn } from './types';

export const ROUTINES = 'Go through each of your routines. For each one say whether the records show a next-run date, whether it is overdue, what it depends on, and the date you will commit to. Tell me if a routine has no cadence or no date.';
export const HOLD = 'Accountability review. Go through your todos, goals and KPIs one by one. For every item that is not done or not on track, tell me: (1) why it is not progressing, (2) what you need from me or another agent, and (3) a specific finish date. Finish with the three things you will do first.';
export const TIMELINES = 'Give me a dated timeline. For every open todo and every goal that is not met, a realistic finish date and what it depends on. Say which ones you cannot finish when I would expect, and why.';

export function recordsText(a: Agent): string {
  const L2: string[] = [];
  L2.push('Mission: ' + (a.purpose || '(none)'));
  if (a.reportsTo) L2.push('Reports to: ' + a.reportsTo);
  if (a.handsOff) L2.push('Hands off to: ' + a.handsOff);
  if (a.reads) L2.push('Reads at the start of a run: ' + a.reads);
  if ((a.responsibilities || []).length) L2.push('Responsibilities: ' + a.responsibilities!.join('; '));
  if ((a.may || []).length) L2.push('You may: ' + a.may!.join('; '));
  if ((a.mustNot || []).length) L2.push('You must not: ' + a.mustNot!.join('; '));
  L2.push('Goals:');
  (a.goals || []).forEach((g, i) => { L2.push((i + 1) + '. ' + g.text + ' | ' + (g.done ? 'met' : 'not met') + (g.horizon ? ' | horizon ' + g.horizon : '') + (g.due ? ' | due ' + g.due + (isLate('goal', g) ? ' (overdue)' : '') : ' | no due date') + (g.note ? ' | note: ' + g.note : '')) });
  if (!(a.goals || []).length) L2.push('(none)');
  L2.push('Key result areas:');
  (a.kras || []).forEach((k, i) => { L2.push((i + 1) + '. ' + k.area + ' (' + k.weight + '%): ' + k.outcome) });
  if (!(a.kras || []).length) L2.push('(none defined)');
  L2.push('KPIs:');
  (a.kpis || []).forEach((k, i) => { L2.push((i + 1) + '. ' + k.name + ' | target ' + (k.target == null || (k.target as unknown) === '' ? 'not set' : k.target + ' ' + (k.unit || '')) + ' | ' + (k.dir === 'down' ? 'lower is better' : 'higher is better') + ' | ' + (k.cadence || '') + ' | current ' + (k.current == null ? 'no reading' : k.current) + (k.due ? ' | due ' + k.due : ' | no due date')) });
  if (!(a.kpis || []).length) L2.push('(none)');
  L2.push('Todos:');
  (a.todos || []).forEach((t, i) => { L2.push((i + 1) + '. ' + t.text + ' | ' + (t.status || 'todo') + (t.due ? ' | due ' + t.due + (isLate('todo', t) ? ' (overdue)' : '') : ' | no due date') + (t.note ? ' | note: ' + t.note : '')) });
  if (!(a.todos || []).length) L2.push('(none)');
  L2.push('Routines (planned cadence and next-run date as recorded here; "planned" means not confirmed as scheduled):');
  (a.routines || []).forEach((r, i) => { L2.push((i + 1) + '. ' + r.name + ' | ' + (r.cadence || 'no cadence') + ' | ' + (r.state || 'planned') + (r.next ? ' | next run ' + r.next + (routineLate(r) ? ' (overdue)' : '') : ' | no next-run date') + (r.note ? ' | note: ' + r.note : '')) });
  if (!(a.routines || []).length) L2.push('(none)');
  if ((a.memory || []).length) { L2.push('Memory notes the founder wants you to keep in mind:'); (a.memory || []).forEach((m) => { L2.push('- ' + m.text + (m.at ? ' (' + m.at + ')' : '')) }) }
  if ((a.docs || []).length) { L2.push('Docs you work from (you only know titles and paths, not contents):'); (a.docs || []).forEach((x) => { L2.push('- ' + x.title + (x.path ? ' [' + x.path + ']' : '') + (x.note ? ': ' + x.note : '')) }) }
  if ((a.skills || []).length) { L2.push('Skills you have:'); (a.skills || []).forEach((x) => { L2.push('- ' + x.name + (x.note ? ': ' + x.note : '')) }) }
  return L2.join('\n');
}

export function agentBrief(repos: Repo[], a: Agent, projectBrief: string | undefined): string {
  const td = today(), pr = projectBrief;
  return 'You are playing the AI agent "' + a.name + '" (' + a.role + ') on the project ' + fullName(repos, a.projectId) + '. The person talking to you is the founder who runs the project and is holding you accountable. Stay in role, in the first person, in plain direct language.\n\n'
    + 'Rules:\n'
    + '- You have no run logs and no memory of past work beyond the records below. Never claim work is done unless the records say so.\n'
    + '- When asked why something is stalled, ground the answer in the records (status, blocked or needs-founder tags in the todo text, priority, missing due dates, missing KPI targets or readings) and in your role limits (what you must not do, who you hand off to, approvals you need). If you do not know, say so and say what you need.\n'
    + '- When asked for timelines, give specific dates (YYYY-MM-DD) after today, say what each depends on, and be honest about what cannot be done in time.\n'
    + '- Routines show only a planned cadence and a recorded next-run date, not proof that a run happened. Docs are known by title and path only; do not describe their contents.\n'
    + '- Do not invent tickets, numbers, people or events. Take complaints without defensiveness: say what you will change and by when.\n'
    + '- Keep replies under about 200 words unless asked for more. Use a short list only when covering several items.\n\n'
    + 'Today is ' + td + '.\n' + (pr ? 'Project brief: ' + pr + '\n' : '') + '\nYour records:\n' + recordsText(a);
}

export function chatTurns(repos: Repo[], a: Agent, projectBrief: string | undefined, messages: ChatMessage[]): Turn[] {
  const msgs = (messages || []).slice(-24);
  const turns: Turn[] = [{ role: 'user', content: agentBrief(repos, a, projectBrief) }];
  msgs.forEach((m) => { turns.push({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.text }) });
  return turns;
}

export function capturePrompt(a: Agent, messages: ChatMessage[]): string {
  const msgs = (messages || []).slice(-16);
  const tr = msgs.map((m) => (m.role === 'agent' ? 'AGENT: ' : 'FOUNDER: ') + m.text).join('\n\n');
  return 'Below are an agent\'s records (items are numbered from 1) and a conversation between the founder and the agent. Today is ' + today() + '.\n\nRECORDS\n' + recordsText(a) + '\n\nCONVERSATION\n' + tr + '\n\n'
    + 'List what the AGENT clearly committed to in this conversation. Reply with only a JSON array. Each element: {"kind":"todo" or "goal" or "kpi" or "routine" (routine: due is its next-run date) or "memory" (a lasting instruction the FOUNDER gave that the agent accepted; index null, due null, note = the instruction in under 160 characters),"index":<number from the records>,"due":"YYYY-MM-DD" or null,"status":"todo" or "doing" or "done" or null (todos only; only if the agent said it is in that state),"note":"under 140 characters: the reason or dependency, in the agent\'s words"}. Do not include anything the agent did not commit to. Use [] if there is nothing.';
}
