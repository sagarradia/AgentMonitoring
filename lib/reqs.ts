/* Requisitions: requests to hire an agent. Anyone can ask (the owner, or an agent head in the app's record);
   only the owner decides. The HR desk prepares the hire and checks it against the limits. Records only. */
import { DEPARTMENTS } from './org';
import { resolveRole, seniorityOf, titlesFor } from './roles';

export type ReqStatus = 'requested' | 'approved' | 'declined' | 'filled' | 'cancelled';
export interface Req {
  id: string; company: string; by: string; byName: string; dept: string; seniority: string; jobTitle: string; title: string; reason: string;
  status: ReqStatus; createdAt: number; decidedAt?: number; note?: string; agentId?: string; history: Array<{ at: number; text: string }>;
}
export const OPEN: ReqStatus[] = ['requested', 'approved'];

export function newReq(raw: Record<string, unknown>, id: string, now = Date.now()): Req | string {
  const company = typeof raw.company === 'string' ? raw.company : '';
  if (!company) return 'Choose a company';
  const dept = (DEPARTMENTS as readonly string[]).includes(String(raw.dept)) ? String(raw.dept) : '';
  if (!dept) return 'Choose a department';
  const reason = String(raw.reason || '').trim().slice(0, 500);
  if (reason.length < 8) return 'Say why this role is needed (a sentence)';
  const seniority = seniorityOf(String(raw.seniority)).id, jobIn = String(raw.jobTitle || ''), jobTitle = titlesFor(dept, seniority).includes(jobIn) ? jobIn : '', title = resolveRole(dept, seniority, jobTitle).title;
  const by = typeof raw.by === 'string' && raw.by ? raw.by : 'owner';
  return { id, company, by, byName: String(raw.byName || (by === 'owner' ? 'You' : by)).slice(0, 80), dept, seniority, jobTitle, title, reason, status: 'requested', createdAt: now, history: [{ at: now, text: 'Requested by ' + String(raw.byName || 'You') }] };
}
export function decide(r: Req, to: 'approved' | 'declined', note: string, now = Date.now()): string | null {
  if (r.status !== 'requested') return 'Only a waiting request can be decided';
  if (to === 'declined' && !note.trim()) return 'Say why it is declined, so the requester can learn from it';
  r.status = to; r.decidedAt = now; r.note = note.trim().slice(0, 300) || undefined;
  r.history.push({ at: now, text: (to === 'approved' ? 'Approved' : 'Declined') + (r.note ? ': ' + r.note : '') });
  return null;
}
export function fill(r: Req, agentId: string, now = Date.now()): void {
  if (r.status !== 'approved') return;
  r.status = 'filled'; r.agentId = agentId; r.history.push({ at: now, text: 'Agent created' });
}
export function cancel(r: Req, now = Date.now()): boolean {
  if (!OPEN.includes(r.status)) return false;
  r.status = 'cancelled'; r.history.push({ at: now, text: 'Cancelled' }); return true;
}

/** A hiring request an agent made in chat, as read by Claude. Returns null if it is not usable. */
export function cleanHire(p: Record<string, unknown>): { dept: string; seniority: string; jobTitle: string; note: string } | null {
  const dept = (DEPARTMENTS as readonly string[]).includes(String(p.dept)) ? String(p.dept) : '';
  const note = String(p.note || '').trim().slice(0, 200);
  if (!dept || note.length < 8) return null;
  const seniority = seniorityOf(String(p.seniority ?? p.designation)).id, jobIn = String(p.jobTitle || ''), jobTitle = titlesFor(dept, seniority).includes(jobIn) ? jobIn : '';
  return { dept, seniority, jobTitle, note };
}
