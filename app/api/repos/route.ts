import { fail, guard, json, logError } from '@/lib/server/http';
import type { Repo } from '@/lib/types';

export const dynamic = 'force-dynamic';

/* GET /api/repos → { repos: [{ full_name, url, pushed_at, visibility }] }
   Replaces the artifact's MCP list_repos call. Uses GITHUB_TOKEN (read-only) server side. */
export async function GET(req: Request) {
  const blocked = await guard(req, 'repos');
  if (blocked) return blocked;
  const token = process.env.GITHUB_TOKEN;
  if (!token) return fail(503, 'server_not_connected');
  try {
    const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=pushed&direction=desc', {
      headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'agent-desk' },
      cache: 'no-store',
    });
    if (r.status === 401 || r.status === 403) return fail(502, 'needs_reauth');
    if (!r.ok) { logError('repos', { status: r.status }); return fail(502, 'upstream_error') }
    const list = (await r.json()) as Array<Record<string, unknown>>;
    const repos: Repo[] = (Array.isArray(list) ? list : [])
      .filter((x) => typeof x.full_name === 'string' && (x.full_name as string).indexOf('/') > 0)
      .map((x) => ({
        full_name: x.full_name as string,
        url: (x.html_url as string) || 'https://github.com/' + x.full_name,
        pushed_at: (x.pushed_at as string) || '',
        visibility: (x.visibility as string) || (x.private ? 'private' : 'public'),
      }));
    return json({ repos });
  } catch (e) {
    logError('repos', e);
    return fail(502, 'upstream_error');
  }
}
