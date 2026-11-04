/* Hiring limits at four levels: company, department, role and individual. Capacity is counted in units, a rough
   measure of how much of the Claude plan an agent uses (the plan's tokens are the real budget; nothing here is
   pay-per-use). Rupees appear only where the owner sets a rupee value per unit for that company.
   These are estimates for planning and for tight hiring, not measured bills. */
import { PROFILES } from './taskplan';
import { deptOf, workCompany, type OrgAgent } from './org';

export type Level = 'company' | 'department' | 'role' | 'person';
export const LEVELS: Array<[Level, string]> = [['company', 'Whole company'], ['department', 'Department'], ['role', 'Role'], ['person', 'Individual']];
export interface Limit { id: string; level: Level; company: string; target: string; maxAgents?: number; maxUnits?: number; maxRupees?: number }
export type Rates = Record<string, number>;

export const COUNTED = ['active', 'resting'];           // paused, draft, revoked and withdrawn agents use no capacity
const OFF_BOOKS = ['revoked', 'withdrawn'];             // these do not count toward headcount either

export function agentUnits(a: { model?: unknown; modelPlanned?: unknown; brain?: { own?: boolean } }): number {
  const id = String(a.model || a.modelPlanned || 'opus55');
  return (PROFILES[id]?.cost ?? 3) + (a.brain?.own ? 1 : 0);
}
export const modelUnits = (modelId: string, ownBrain = false) => agentUnits({ model: modelId, brain: { own: ownBrain } });
export const rupees = (units: number, rate?: number) => (rate && rate > 0 ? Math.round(units * rate) : null);

/** The unit ceiling of a limit: the lower of its units cap and its rupee cap converted at the company's rate. */
export function unitCap(l: Limit, rates: Rates): number | undefined {
  const caps = [l.maxUnits, l.maxRupees && rates[l.company] > 0 ? Math.floor(l.maxRupees / rates[l.company]) : undefined].filter((x): x is number => !!x);
  return caps.length ? Math.min(...caps) : undefined;
}

export interface Who { id?: string; company: string; dept: string; role: string }
const low = (s: string) => s.toLowerCase();
export function matches(l: Limit, w: Who): boolean {
  if (l.company !== w.company) return false;
  switch (l.level) {
    case 'company': return true;
    case 'department': return low(w.dept) === low(l.target);
    case 'role': return !!l.target && low(w.role).includes(low(l.target));
    case 'person': return !!w.id && w.id === l.target;
  }
}
export const whoOf = (a: OrgAgent, now = Date.now()): Who => ({ id: a.id, company: workCompany(a, now), dept: deptOf(a as never), role: String(a.role || a.name || '') });

export interface Usage { heads: number; units: number }
export function usageOf(agents: OrgAgent[], l: Limit, skipId: string | undefined, now = Date.now()): Usage {
  let heads = 0, units = 0;
  for (const a of agents) {
    if (a.id === skipId || !matches(l, whoOf(a, now))) continue;
    const st = a.status || 'active';
    if (!OFF_BOOKS.includes(st)) heads++;
    if (COUNTED.includes(st)) units += agentUnits(a as never);
  }
  return { heads, units };
}
/** Whole-company usage, for the summary bars. */
export const companyUsage = (agents: OrgAgent[], company: string, now = Date.now()): Usage => usageOf(agents, { id: '', level: 'company', company, target: '' }, undefined, now);

export const labelOf = (l: Limit, nameOf: (id: string) => string = (x) => x): string =>
  l.level === 'company' ? 'Whole company' : l.level === 'department' ? 'Department ' + l.target : l.level === 'role' ? 'Role containing "' + l.target + '"' : 'Individual ' + nameOf(l.target);

export interface Check { ok: boolean; reasons: string[] }
/** Would taking on this agent (or this change to it) keep every limit that applies to it satisfied? */
export function hireCheck(limits: Limit[], rates: Rates, agents: OrgAgent[], who: Who, units: number, nameOf?: (id: string) => string, now = Date.now()): Check {
  const reasons: string[] = [];
  for (const l of limits) {
    if (!matches(l, who)) continue;
    const u = usageOf(agents, l, who.id, now), after = { heads: u.heads + 1, units: u.units + units }, cap = unitCap(l, rates);
    if (l.level !== 'person' && l.maxAgents && after.heads > l.maxAgents) reasons.push(labelOf(l, nameOf) + ': ' + after.heads + ' agents against a limit of ' + l.maxAgents);
    if (cap && after.units > cap) reasons.push(labelOf(l, nameOf) + ': ' + after.units + ' units against a limit of ' + cap);
  }
  return { ok: !reasons.length, reasons };
}
/** Limits already broken today, for the Overview. */
export function overLimits(limits: Limit[], rates: Rates, agents: OrgAgent[], nameOf?: (id: string) => string, now = Date.now()): string[] {
  const out: string[] = [];
  for (const l of limits) {
    const u = usageOf(agents, l, undefined, now), cap = unitCap(l, rates);
    if (l.level !== 'person' && l.maxAgents && u.heads > l.maxAgents) out.push(labelOf(l, nameOf) + ' (' + l.company.replace('__', '/') + '): ' + u.heads + ' agents, limit ' + l.maxAgents);
    if (cap && u.units > cap) out.push(labelOf(l, nameOf) + ' (' + l.company.replace('__', '/') + '): ' + u.units + ' units, limit ' + cap);
  }
  return out;
}
const num = (v: unknown, whole: boolean, max: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.min(max, whole ? Math.floor(x) : Math.round(x * 100) / 100) : undefined };
/** Cleans a limit the owner typed. Returns an error message when it cannot be used. */
export function cleanLimit(raw: Record<string, unknown>, id: string): Limit | string {
  const level = LEVELS.map((x) => x[0]).find((x) => x === raw.level);
  if (!level) return 'Choose a level';
  const company = typeof raw.company === 'string' ? raw.company : '';
  if (!company) return 'Choose a company';
  const target = level === 'company' ? '' : String(raw.target || '').trim().slice(0, 80);
  if (level !== 'company' && !target) return level === 'person' ? 'Choose a person' : level === 'role' ? 'Type a word from the role' : 'Choose a department';
  const l: Limit = { id, level, company, target };
  const a = num(raw.maxAgents, true, 1000), u = num(raw.maxUnits, true, 100000), r = num(raw.maxRupees, false, 1e9);
  if (a && level !== 'person') l.maxAgents = a; if (u) l.maxUnits = u; if (r) l.maxRupees = r;
  if (!l.maxAgents && !l.maxUnits && !l.maxRupees) return level === 'person' ? 'Set a capacity or rupee limit' : 'Set at least one limit';
  return l;
}
export const cleanRate = (v: unknown): number | undefined => num(v, false, 1e7);
