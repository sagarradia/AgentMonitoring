import { timingSafeEqual } from 'node:crypto';
import { getStore } from '@/lib/server/store';
import { fail, json, logError } from '@/lib/server/http';
import { syncFeed } from '@/lib/server/github';
import { expireRests } from '@/lib/server/rest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* GET /api/feed/cron: the daily refresh Vercel Cron calls. It is open to the login wall but needs the shared
   CRON_SECRET (Vercel sends it as a bearer token). Without CRON_SECRET the route does not exist. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, token = process.env.GITHUB_TOKEN;
  if (!secret) return fail(404, 'not_found');
  const got = Buffer.from(req.headers.get('authorization') || ''), want = Buffer.from('Bearer ' + secret);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return fail(401, 'unauthorized');
  try {
    const rested = await expireRests(getStore(), token || null);
    if (!token) return json({ ok: true, rested: rested.ended.length, feed: false });
    const f = await syncFeed(getStore(), token);
    return json({ ok: true, rested: rested.ended.length, feed: true, repos: Object.keys(f.repos).length });
  }
  catch (e) { logError('feed.cron', e); return fail(502, 'upstream_error') }
}
