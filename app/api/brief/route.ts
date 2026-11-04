import { fail, guard, json, logError, readJson } from '@/lib/server/http';
import { GhError, isRepo } from '@/lib/server/github';
import { buildBrief } from '@/lib/server/brief';
import { isPlainObject } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* POST {repo:"owner/name"} → a draft company brief collected from that repo's README, CLAUDE.md and docs/.
   Nothing is saved or logged here: the page shows the draft and the owner decides what to keep. */
export async function POST(req: Request) {
  const blocked = await guard(req, 'brief');
  if (blocked) return blocked;
  const token = process.env.GITHUB_TOKEN;
  if (!token) return fail(503, 'server_not_connected');
  const body = await readJson(req, 1024);
  if (!isPlainObject(body) || typeof body.repo !== 'string' || !isRepo(body.repo)) return fail(400, 'bad_repo');
  try { return json(await buildBrief(body.repo, token)) }
  catch (e) {
    if (e instanceof GhError) return json({ error: e.code === 'nothing_found' ? 'nothing_found' : e.code }, e.status === 404 ? 404 : 502);
    logError('brief', e); return fail(502, 'upstream_error');
  }
}
