import { describe, expect, it } from 'vitest';
import { ONBOARDING, activeLoan, addReview, companyStats, diffChanges, endLoan, expireLoan, lend, orgNeeds, reviewState, safeUrl, setBench, setOnboarding, transfer, workCompany, type OrgAgent } from '@/lib/org';

const T = Date.parse('2026-11-04T10:00:00Z');
const mk = (o: Partial<OrgAgent> = {}): OrgAgent => ({ id: 'a', projectId: 'o__fv', name: 'A', status: 'active', ...o });

describe('loans, transfers and the bench', () => {
  it('lends for a period, works for the borrower, and returns by itself', () => {
    const a = mk();
    expect(lend(a, 'o__fv', '2026-11-10', 'x', T)).toMatch(/different company/);
    expect(lend(a, 'o__web', '2026-11-01', 'x', T)).toMatch(/today or later/);
    expect(lend(a, 'o__web', '2026-11-10', '  ', T)).toMatch(/what the agent/);
    expect(lend(a, 'o__web', '2028-01-01', 'x', T)).toMatch(/at most a year/);
    expect(lend(a, 'o__web', '2026-11-10', 'Security review', T)).toBeNull();
    expect(workCompany(a, T)).toBe('o__web');
    expect(a.changeLog?.[0].text).toMatch(/Lent to o\/web until 2026-11-10/);
    expect(expireLoan(a, T)).toBe(false);
    expect(expireLoan(a, T + 8 * 86_400_000)).toBe(true);
    expect(a.loan).toBeUndefined(); expect(workCompany(a, T + 9 * 86_400_000)).toBe('o__fv');
  });
  it('refuses to lend revoked agents; a transfer clears manager and loan', () => {
    expect(lend(mk({ status: 'revoked' }), 'o__web', '2026-11-10', 'x', T)).toMatch(/revoked/);
    const a = mk({ reportsTo: 'CTO', loan: { to: 'o__web', until: '2026-11-30', reason: 'r', at: T } });
    expect(transfer(a, 'o__web', T)).toBeNull();
    expect(a.projectId).toBe('o__web'); expect(a.reportsTo).toBe(''); expect(a.loan).toBeUndefined();
    expect(endLoan(a, 'x')).toBe(false);
  });
  it('bench toggles and logs once', () => { const a = mk(); setBench(a, true, T); setBench(a, true, T); expect(a.changeLog).toHaveLength(1); setBench(a, false, T); expect(a.bench).toBe(false) });
});
describe('HR file', () => {
  it('reviews fall due after 90 days and are flagged late after 14 more', () => {
    expect(reviewState(mk(), T).state).toBe('never');
    expect(reviewState(mk({ createdAt: T - 10 * 86_400_000 }), T).state).toBe('ok');
    expect(reviewState(mk({ hr: { lastReview: '2026-08-01' } }), T).state).toBe('due');
    expect(reviewState(mk({ hr: { lastReview: '2026-06-01' } }), T).state).toBe('overdue');
    expect(reviewState(mk({ hr: { lastReview: '2026-06-01', reviewEvery: 365 } }), T).state).toBe('ok');
  });
  it('records reviews and onboarding, keeps a change log', () => {
    const a = mk();
    expect(addReview(a, 9, '', T)).toMatch(/1 to 5/);
    expect(addReview(a, 4, 'Solid', T)).toBeNull();
    expect(a.hr?.lastReview).toBe('2026-11-04');
    setOnboarding(a, ONBOARDING[0], true, T); setOnboarding(a, 'made up', true, T);
    expect(a.hr?.onboarding).toEqual({ [ONBOARDING[0]]: true });
    expect(diffChanges({ role: 'A', tools: ['x'] }, { role: 'B', tools: ['y'], brain: { own: true } })).toEqual(['Role: A to B', 'Tools changed', 'Given its own brain']);
  });
});
describe('company view', () => {
  it('counts people by state, loans and progress', () => {
    const l = { to: 'o__web', until: '2026-11-30', reason: 'r', at: T };
    const ag = [mk({ id: '1', progress: { done: 2, assigned: 4 } }), mk({ id: '2', status: 'resting', loan: l }), mk({ id: '3', projectId: 'o__web' })];
    const [fv, web] = companyStats(ag, ['o__fv', 'o__web'], T);
    expect(fv).toMatchObject({ total: 2, active: 1, resting: 1, loanedOut: 1, done: 2, assigned: 4 });
    expect(web).toMatchObject({ total: 1, loanedIn: 1 });
    expect(activeLoan(ag[1], T)).toBeTruthy();
    expect(orgNeeds(ag, T).map((x) => x.title)).toContain('Agents never reviewed');
  });
  it('only lets web addresses through', () => { expect(safeUrl('https://x.vercel.app')).toMatch(/^https:/); expect(safeUrl('javascript:alert(1)')).toBe(''); expect(safeUrl(5)).toBe('') });
});

import { DEPARTMENTS, deptOf, groupBy, techOf } from '@/lib/org';
describe('departments and technologies', () => {
  it('infers a department from the role and lets the owner override it', () => {
    expect(deptOf({ role: 'Security Junior: Code Review' })).toBe('Security');
    expect(deptOf({ role: 'QA Junior: Test Automation' })).toBe('Quality');
    expect(deptOf({ role: 'CTO (Head of Engineering)' })).toBe('Engineering');
    expect(deptOf({ role: 'Chief of Staff (Orchestrator)' })).toBe('Leadership');
    expect(deptOf({ role: 'Content Junior: Legal Assistant' })).toBe('Legal and compliance');
    expect(deptOf({ role: 'Cook' })).toBe('Other');
    expect(deptOf({ role: 'Cook', dept: 'Operations' })).toBe('Operations');
    expect(DEPARTMENTS).toContain('Finance');
  });
  it('reads technologies from tools and duties unless set, and groups people', () => {
    expect(techOf({ tools: ['GitHub', 'Slack'], requirements: ['TypeScript and Postgres'] })).toEqual(['TypeScript', 'Postgres', 'GitHub', 'Slack']);
    expect(techOf({ tech: ['Rust'], tools: ['GitHub'] })).toEqual(['Rust']);
    const g = groupBy([{ n: 1, d: ['A'] }, { n: 2, d: ['A', 'B'] }], (x) => x.d);
    expect(g.map(([k, v]) => [k, v.length])).toEqual([['A', 2], ['B', 1]]);
  });
});
