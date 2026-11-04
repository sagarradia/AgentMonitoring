import { describe, expect, it } from 'vitest';
import { DEPARTMENTS } from '@/lib/org';
import { DEPT_PROFILES, DESIGNATIONS, designationOf, matchPlugins, resolveRole } from '@/lib/roles';
import { APPROVAL_OPTIONS, TOOL_OPTIONS } from '@/lib/wizard-options';
import { MEMORY_OPTIONS } from '@/lib/taskplan';

describe('role catalogue', () => {
  it('covers every department, using only tools, approvals and memory the app knows', () => {
    for (const d of DEPARTMENTS) {
      const p = DEPT_PROFILES[d]; expect(p, d).toBeTruthy();
      expect(p.duties.length, d).toBeGreaterThan(0);
      p.tools.forEach((t) => expect(TOOL_OPTIONS as readonly string[], d + ' ' + t).toContain(t));
      p.approvals.forEach((t) => expect(APPROVAL_OPTIONS as readonly string[], d + ' ' + t).toContain(t));
      p.memory.forEach((t) => expect(MEMORY_OPTIONS as readonly string[], d + ' ' + t).toContain(t));
    }
  });
  it('a head gets its own brain, the head title and extra duties; a junior gets fewer memories and more approvals', () => {
    const h = resolveRole('Engineering', 'head'), j = resolveRole('Engineering', 'junior');
    expect(h.title).toBe('Head of Engineering'); expect(h.level).toBe('Head'); expect(h.brainOwn).toBe(true); expect(h.leader).toBe(true);
    expect(h.duties[0]).toMatch(/Own the department/); expect(h.duties).toContain('Build one ticket at a time, with tests');
    expect(j.title).toBe('Engineering Junior'); expect(j.level).toBe('Junior'); expect(j.brainOwn).toBe(false); expect(j.memory.length).toBeLessThanOrEqual(3);
    expect(j.approvals).toContain('Deleting data');
    expect(resolveRole('Leadership', 'head').title).toBe('Chief of Staff');
  });
  it('falls back safely and matches plugins by keyword', () => {
    expect(resolveRole('Nonsense', 'nope').dept).toBe('Other'); expect(designationOf('nope').id).toBe('agent'); expect(DESIGNATIONS).toHaveLength(4);
    expect(matchPlugins(['routing', 'memory'], ['Model routing', 'Context compaction', 'Memory manager'])).toEqual(['Model routing', 'Memory manager']);
  });
});
