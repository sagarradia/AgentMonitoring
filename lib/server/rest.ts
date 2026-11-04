/* Ends rests on the server. The page also does this, but only while someone has it open. This runs from the
   scheduled call, from the feed refresh and from the control check, so a rest ends on time with no page open. */
import type { Store } from './store';
import type { Agent } from '../types';
import { restExpired, logStatus } from '../status';
import { expireLoan, type OrgAgent } from '../org';
import { controlCfg, isAgentKey, setAgentPaused, type ControlCfg } from './github';

type F = typeof fetch;

export async function expireRests(store: Store, token: string | null, cfg: ControlCfg = controlCfg(), f: F = fetch, now = Date.now()): Promise<{ ended: string[]; labelFailed: string[] }> {
  const ended: string[] = [], labelFailed: string[] = [];
  for (const d of await store.list('agents')) {
    const a = { ...(d.data as unknown as Agent), id: d.id } as Agent & Record<string, unknown>;
    const rested = restExpired(a, now), loanEnded = expireLoan(a as unknown as OrgAgent, now);
    if (!rested && !loanEnded) continue;
    if (rested) { a.status = 'active'; delete a.restUntil; delete a.statusNote; logStatus(a, 'active', 'Rest ended (automatic)', now) }
    const { id, ...data } = a; void id;
    await store.put('agents', d.id, data as unknown as Record<string, unknown>);
    if (!rested) continue;
    ended.push(d.id);
    const key = d.id.replace(/^fv_/, '');
    if (token && isAgentKey(key) && String(a.projectId || '').toLowerCase() === cfg.repo.replace('/', '__').toLowerCase()) {
      try { await setAgentPaused(cfg, token, key, false, f) } catch { labelFailed.push(d.id) }
    }
  }
  return { ended, labelFailed };
}
