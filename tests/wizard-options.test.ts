import { describe, expect, it } from 'vitest';
import { allTools, applyExtras, defaultExtras, extrasPrompt, refreshDefaults } from '@/lib/wizard-options';

describe('wizard extras', () => {
  it('pre-selects tools and approvals from the kind of task', () => {
    const eng = defaultExtras('fix bugs and review pull requests');
    expect(eng.tools).toContain('GitHub');
    expect(eng.approvals).toContain('Merging or deploying code');
    const sales = defaultExtras('book meetings with prospects');
    expect(sales.tools).toEqual(expect.arrayContaining(['Gmail', 'Google Calendar']));
    expect(defaultExtras('').cadence).toBe('Weekly');
  });

  it('follows the task until the owner changes a list, then keeps their choice', () => {
    let x = defaultExtras('');
    x = refreshDefaults(x, 'answer customer support tickets');
    expect(x.tools).toContain('Zendesk');
    x = { ...x, tools: ['Slack'], touched: { ...x.touched, tools: true } };
    x = refreshDefaults(x, 'write blog posts');
    expect(x.tools).toEqual(['Slack']);
    expect(x.approvals).toContain('Publishing content');
  });

  it('applies the choices to a drafted spec', () => {
    const x = { ...defaultExtras('deploy releases'), otherTools: 'Sentry, GitHub', reportsTo: 'CTO', notes: 'Prefer small PRs' };
    expect(allTools(x).filter((t) => t === 'GitHub')).toHaveLength(1);
    const spec = applyExtras({ name: 'A', tools: ['x'], reportsTo: 'Founder' }, x) as Record<string, any>;
    expect(spec.tools).toEqual(allTools(x));
    expect(spec.tools).toContain('Sentry');
    expect(spec.reportsTo).toBe('CTO');
    expect(spec.mustNot).toContain("Merging or deploying code without the owner's approval");
    const p = extrasPrompt(x);
    expect(p).toContain('Tools and access: ');
    expect(p).toContain('Reports to: CTO');
    expect(p).toContain('Prefer small PRs');
  });

  it('keeps the drafted reporting line when left blank', () => {
    const spec = applyExtras({ reportsTo: 'Founder' }, defaultExtras('x')) as Record<string, any>;
    expect(spec.reportsTo).toBe('Founder');
  });
});
