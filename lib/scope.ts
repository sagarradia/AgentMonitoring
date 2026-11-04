/* Who an item applies to. A scope is a union of levels (organisation, projects, teams, individuals)
   minus a list of individuals who are left out. The older single-mode shape still reads correctly. */
export interface Scope {
  mode?: string;
  all?: boolean;
  projects?: string[];
  teams?: string[];
  people?: string[];
  except?: string[];
}
export interface Norm { all: boolean; projects: string[]; teams: string[]; people: string[]; except: string[] }
export type TeamOf = Record<string, string>;
interface Who { id: string; projectId: string; loan?: { to: string; until: string } | null }

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

export function norm(sc?: Scope | null): Norm {
  const s = sc || { mode: 'all' };
  const except = arr(s.except);
  switch (s.mode) {
    case 'all': case undefined: return { all: true, projects: [], teams: [], people: [], except };
    case 'project': return { all: false, projects: arr(s.projects), teams: [], people: [], except };
    case 'team': return { all: false, projects: [], teams: arr(s.teams), people: [], except };
    case 'people': return { all: false, projects: [], teams: [], people: arr(s.people), except };
    case 'mix': return { all: !!s.all, projects: arr(s.projects), teams: arr(s.teams), people: arr(s.people), except };
    default: return { all: false, projects: [], teams: [], people: [], except };
  }
}
export function toMix(n: Norm): Scope { return { mode: 'mix', all: n.all, projects: n.projects.slice(), teams: n.teams.slice(), people: n.people.slice(), except: n.except.slice() } }
export function applies(sc: Scope | null | undefined, a: Who, teamOf: TeamOf): boolean {
  const n = norm(sc);
  if (n.except.includes(a.id)) return false;
  const lent = a.loan && a.loan.until >= new Date().toISOString().slice(0, 10) ? a.loan.to : '';   // a loaned agent also follows the borrowing company's rules
  return n.all || n.projects.includes(a.projectId) || (!!lent && n.projects.includes(lent)) || n.teams.includes(teamOf[a.id]) || n.people.includes(a.id);
}
export function isEmpty(sc: Scope | null | undefined): boolean {
  const n = norm(sc);
  return !n.all && !n.projects.length && !n.teams.length && !n.people.length;
}
/** Add one person: put them in the individuals list, or lift an exception. */
export function giveTo(sc: Scope | null | undefined, a: Who, teamOf: TeamOf): Scope {
  const n = norm(sc);
  if (n.except.includes(a.id)) n.except = n.except.filter((x) => x !== a.id);
  if (!applies(toMix(n), a, teamOf) && !n.people.includes(a.id)) n.people.push(a.id);
  return toMix(n);
}
/** Take one person out: drop them from the individuals list and, if a wider level still covers them, add an exception. */
export function removeFor(sc: Scope | null | undefined, a: Who, teamOf: TeamOf): Scope {
  const n = norm(sc);
  n.people = n.people.filter((x) => x !== a.id);
  if (applies(toMix(n), a, teamOf) && !n.except.includes(a.id)) n.except.push(a.id);
  return toMix(n);
}
export function toggle(list: string[], v: string, on: boolean): string[] {
  const has = list.includes(v);
  return on && !has ? list.concat(v) : !on && has ? list.filter((x) => x !== v) : list;
}
