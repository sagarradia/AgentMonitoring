import { getStore } from '@/lib/server/store';
import { fail, guard, json, logError } from '@/lib/server/http';
import { syncFeed } from '@/lib/server/github';
import { expireRests } from '@/lib/server/rest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* POST /api/feed → pulls issue state from GitHub for every repo that has ticket-linked todos, saves the changes,
   and returns the outcome (also kept in meta/feed). Needs GITHUB_TOKEN with read access to those repos. */
export async function POST(req: Request) {
  const blocked = await guard(req, 'feed');
  if (blocked) return blocked;
  const token = process.env.GITHUB_TOKEN;
  if (!token) return fail(503, 'server_not_connected');
  try { await expireRests(getStore(), token); return json(await syncFeed(getStore(), token)) }
  catch (e) { logError('feed', e); return fail(502, 'upstream_error') }
}
