import { fail, guard, json, logError, readJson } from '@/lib/server/http';
import { GhError, controlCfg, getControl, isAgentKey, setAgentPaused, setPaused } from '@/lib/server/github';
import { isPlainObject } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

/* The real pause switch. FamilyVault's rules say agents are paused while the label `agents-paused` is on the
   "Agent control" issue (#96), checked at the start of every run. GET reads it; POST {paused:boolean} sets it.
   Needs GITHUB_TOKEN with Issues read (GET) and Issues write (POST) on that repo. */
export async function GET(req: Request) {
  const blocked = await guard(req, 'control');
  if (blocked) return blocked;
  const token = process.env.GITHUB_TOKEN, cfg = controlCfg();
  if (!token) return json({ configured: false, ...cfg });
  try { return json({ configured: true, ...(await getControl(cfg, token)), ...cfg }) }
  catch (e) { if (e instanceof GhError) return json({ configured: true, error: e.code, ...cfg }); logError('control.get', e); return fail(502, 'upstream_error') }
}

export async function POST(req: Request) {
  const blocked = await guard(req, 'control');
  if (blocked) return blocked;
  const token = process.env.GITHUB_TOKEN, cfg = controlCfg();
  if (!token) return fail(503, 'server_not_connected');
  const body = await readJson(req, 1024);
  if (!isPlainObject(body) || typeof body.paused !== 'boolean') return fail(400, 'bad_body');
  if (body.agent !== undefined && !isAgentKey(body.agent)) return fail(400, 'bad_agent');
  try {
    if (typeof body.agent === 'string') return json({ configured: true, ...(await setAgentPaused(cfg, token, body.agent, body.paused)), ...cfg });
    await setPaused(cfg, token, body.paused);
    return json({ configured: true, ...(await getControl(cfg, token)), ...cfg });
  }
  catch (e) { if (e instanceof GhError) return json({ configured: true, error: e.code === 'no_access' ? 'needs_write' : e.code, ...cfg }, 502); logError('control.post', e); return fail(502, 'upstream_error') }
}
