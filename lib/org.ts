/* Organisation and HR rules for agents: companies (one per repo), loans, the shared bench, transfers, reviews,
   onboarding and the change log. Pure functions on plain agent objects so the page and the server share them.
   Everything here is a record. It does not change the real role files or start any run. */

export interface Loan { to: string; until: string; reason: string; at: number }
export interface Review { at: string; rating: number; note: string }
export interface Hr { owner?: string; onboarding?: Record<string, boolean>; reviewEvery?: number; lastReview?: string; reviews?: Review[] }
export interface OrgAgent {
  id: string; projectId: string; name: string; status?: string; reportsTo?: string; createdAt?: number;
  loan?: Loan | null; bench?: boolean; hr?: Hr; changeLog?: Array<{ at: number; text: string }>;
  [k: string]: unknown;
}

export const ONBOARDING = [
  'Role and limits agreed',
  'Manager and backup named',
  'Tools and access set',
  'Skills, plugins and memory assigned',
  'Guardrails read',
  'First task given',
  'First review booked',
] as const;

export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const validDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const DAY = 86_400_000;

/** Only web addresses the owner typed or GitHub reported; anything else is dropped. */
export function safeUrl(u: unknown): string {
  if (typeof u !== 'string') return '';
  try { const x = new URL(u.trim()); return x.protocol === 'https:' || x.protocol === 'http:' ? x.toString() : '' } catch { return '' }
}

export function logChange(a: OrgAgent, text: string, now = Date.now()): void {
  a.changeLog = ((a.changeLog || []).concat([{ at: now, text }])).slice(-40);
}

export function activeLoan(a: OrgAgent, now = Date.now()): Loan | null {
  return a.loan && validDay(a.loan.until) && a.loan.until >= isoDay(now) ? a.loan : null;
}
/** The company an agent works for today. */
export const workCompany = (a: OrgAgent, now = Date.now()): string => activeLoan(a, now)?.to || a.projectId;

export function lend(a: OrgAgent, to: string, until: string, reason: string, now = Date.now()): string | null {
  if (!to || to === a.projectId) return 'Choose a different company';
  if (!validDay(until) || until < isoDay(now)) return 'Choose an end date that is today or later';
  if (until > isoDay(now + 366 * DAY)) return 'A loan can last at most a year. Use Transfer for a permanent move';
  if (!reason.trim()) return 'Say what the agent will work on';
  if (a.status === 'revoked' || a.status === 'withdrawn') return 'This agent is revoked or withdrawn';
  a.loan = { to, until, reason: reason.trim().slice(0, 300), at: now };
  logChange(a, 'Lent to ' + to.replace('__', '/') + ' until ' + until + ': ' + a.loan.reason, now);
  return null;
}
export function endLoan(a: OrgAgent, why: string, now = Date.now()): boolean {
  if (!a.loan) return false;
  logChange(a, 'Loan to ' + a.loan.to.replace('__', '/') + ' ended: ' + why, now);
  delete a.loan; return true;
}
/** Ends a loan whose last day has passed. Returns true when something changed. */
export const expireLoan = (a: OrgAgent, now = Date.now()): boolean => !!a.loan && !activeLoan(a, now) && endLoan(a, 'time is up (automatic)', now);

export function transfer(a: OrgAgent, to: string, now = Date.now()): string | null {
  if (!to || to === a.projectId) return 'Choose a different company';
  logChange(a, 'Moved for good from ' + a.projectId.replace('__', '/') + ' to ' + to.replace('__', '/') + '. Manager cleared: name a new one.', now);
  a.projectId = to; a.reportsTo = ''; delete a.loan; delete a.backupId;
  return null;
}
export function setBench(a: OrgAgent, on: boolean, now = Date.now()): void {
  if (!!a.bench === on) return;
  a.bench = on; logChange(a, on ? 'Put on the shared bench' : 'Taken off the shared bench', now);
}

export type ReviewState = { state: 'never' | 'ok' | 'due' | 'overdue'; next: string; every: number };
export function reviewState(a: OrgAgent, now = Date.now()): ReviewState {
  const every = a.hr?.reviewEvery || 90, last = a.hr?.lastReview;
  const base = last && validDay(last) ? Date.parse(last) : a.createdAt || 0;
  if (!base) return { state: 'never', next: '', every };
  const next = isoDay(base + every * DAY), today = isoDay(now);
  const late = Math.floor((Date.parse(today) - Date.parse(next)) / DAY);
  return { state: late > 14 ? 'overdue' : late >= 0 ? 'due' : 'ok', next, every };
}
export function addReview(a: OrgAgent, rating: number, note: string, now = Date.now()): string | null {
  if (!(rating >= 1 && rating <= 5)) return 'Choose a rating from 1 to 5';
  const hr = a.hr || (a.hr = {});
  hr.reviews = ((hr.reviews || []).concat([{ at: isoDay(now), rating, note: note.trim().slice(0, 400) }])).slice(-20);
  hr.lastReview = isoDay(now);
  logChange(a, 'Review recorded: ' + rating + ' of 5', now);
  return null;
}
export function setOnboarding(a: OrgAgent, item: string, on: boolean, now = Date.now()): void {
  if (!(ONBOARDING as readonly string[]).includes(item)) return;
  const hr = a.hr || (a.hr = {}); hr.onboarding = { ...(hr.onboarding || {}), [item]: on };
  logChange(a, (on ? 'Onboarding done: ' : 'Onboarding reopened: ') + item, now);
}
export const onboardingProgress = (a: OrgAgent) => ({ done: ONBOARDING.filter((i) => a.hr?.onboarding?.[i]).length, total: ONBOARDING.length });

const TRACKED: Array<[string, string]> = [['role', 'Role'], ['level', 'Level'], ['reportsTo', 'Reports to'], ['status', 'Status'], ['model', 'Model now'], ['modelPlanned', 'Model planned']];
/** Plain-language list of what changed between two versions of an agent, for the change log. */
export function diffChanges(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, label] of TRACKED) if (String(before[k] ?? '') !== String(after[k] ?? '')) out.push(label + ': ' + (String(before[k] ?? '') || 'none') + ' to ' + (String(after[k] ?? '') || 'none'));
  for (const k of ['tools', 'mustNot', 'may'] as const) if (JSON.stringify(before[k] || []) !== JSON.stringify(after[k] || [])) out.push(({ tools: 'Tools', mustNot: 'Must-not list', may: 'May list' })[k] + ' changed');
  const bo = (before.brain as { own?: boolean } | undefined)?.own, ao = (after.brain as { own?: boolean } | undefined)?.own;
  if (ao !== undefined && !!bo !== !!ao) out.push(ao ? 'Given its own brain' : 'Moved to shared team memory');
  return out;
}

export interface CompanyStats { id: string; total: number; active: number; resting: number; paused: number; other: number; loanedOut: number; loanedIn: number; bench: number; done: number; assigned: number }
export function companyStats(agents: OrgAgent[], ids: string[], now = Date.now()): CompanyStats[] {
  return ids.map((id) => {
    const home = agents.filter((a) => a.projectId === id);
    const s: CompanyStats = { id, total: home.length, active: 0, resting: 0, paused: 0, other: 0, loanedOut: 0, loanedIn: agents.filter((a) => a.projectId !== id && activeLoan(a, now)?.to === id).length, bench: home.filter((a) => a.bench).length, done: 0, assigned: 0 };
    home.forEach((a) => {
      const st = a.status || 'active';
      if (st === 'active') s.active++; else if (st === 'resting') s.resting++; else if (st === 'paused') s.paused++; else s.other++;
      if (activeLoan(a, now)) s.loanedOut++;
      const g = a.progress as { done?: number; assigned?: number } | undefined;
      if (g) { s.done += g.done || 0; s.assigned += g.assigned || 0 }
    });
    return s;
  });
}
/** Items for the Overview "What needs you" list. */
export function orgNeeds(agents: OrgAgent[], now = Date.now()): Array<{ title: string; why: string }> {
  const out: Array<{ title: string; why: string }> = [];
  const rs = agents.map((a) => ({ a, r: reviewState(a, now) }));
  const overdue = rs.filter((x) => x.r.state === 'overdue').length, never = rs.filter((x) => x.r.state === 'never').length;
  if (overdue) out.push({ title: 'Reviews overdue', why: ' ' + overdue + ' agent' + (overdue === 1 ? ' has' : 's have') + ' had no review in over ' + (rs[0]?.r.every || 90) + ' days. Open People, Directory, then HR file.' });
  if (never) out.push({ title: 'Agents never reviewed', why: ' ' + never + ' agent' + (never === 1 ? ' has' : 's have') + ' no review on file.' });
  const soon = agents.filter((a) => { const l = activeLoan(a, now); return l && Date.parse(l.until) - now < 3 * DAY });
  if (soon.length) out.push({ title: 'Loans ending soon', why: ' ' + soon.map((a) => a.name).slice(0, 4).join(', ') + ' return within 3 days.' });
  return out;
}
