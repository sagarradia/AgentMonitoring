import { describe, expect, it } from 'vitest';
import { cancel, decide, fill, newReq, type Req } from '@/lib/reqs';

const ok = (o: Record<string, unknown> = {}) => newReq({ company: 'o__a', dept: 'Marketing', seniority: 'junior', reason: 'We need content for launch', ...o }, 'r1', 1000) as Req;
describe('requisitions', () => {
  it('needs a company, a department and a reason, and names the role', () => {
    expect(newReq({ dept: 'Marketing', reason: 'long enough reason' }, 'x')).toMatch(/company/);
    expect(newReq({ company: 'c', dept: 'Nope', reason: 'long enough reason' }, 'x')).toMatch(/department/);
    expect(newReq({ company: 'c', dept: 'Finance', reason: 'short' }, 'x')).toMatch(/why/);
    const r = ok(); expect(r.title).toBe('Junior Content Writer'); expect(r.status).toBe('requested'); expect(r.by).toBe('owner');
  });
  it('only the owner step changes it: approve, then fill; declining needs a reason', () => {
    const r = ok();
    expect(decide(r, 'declined', '  ')).toMatch(/why/);
    expect(decide(r, 'approved', '', 2000)).toBeNull(); expect(r.status).toBe('approved');
    expect(decide(r, 'approved', '')).toMatch(/waiting/);
    fill(r, 'ag1', 3000); expect(r).toMatchObject({ status: 'filled', agentId: 'ag1' });
    expect(r.history.map((h) => h.text)).toEqual(['Requested by You', 'Approved', 'Agent created']);
    expect(cancel(r)).toBe(false);
  });
  it('fill ignores a request that was never approved; cancel works on open ones', () => {
    const r = ok(); fill(r, 'ag1'); expect(r.status).toBe('requested');
    expect(cancel(r)).toBe(true); expect(r.status).toBe('cancelled');
  });
});
