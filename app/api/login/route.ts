import { COOKIE, makeSession, safeEqual, SESSION_MS } from '@/lib/server/auth';
import { clientIp, rateLimit } from '@/lib/server/ratelimit';

export const dynamic = 'force-dynamic';

function back(_req: Request, path: string, cookie?: string): Response {
  const h = new Headers({ location: path, 'cache-control': 'no-store' });
  if (cookie) h.append('set-cookie', cookie);
  return new Response(null, { status: 303, headers: h });
}

/* POST /api/login (form field "password"). Rate limited per IP. */
export async function POST(req: Request) {
  const secret = process.env.APP_PASSWORD;
  if (!secret) return back(req, '/login?e=config');
  if (!rateLimit('login', clientIp(req.headers)).ok) return back(req, '/login?e=wait');
  let pw = '';
  try { const f = await req.formData(); pw = String(f.get('password') || '') } catch { /* empty */ }
  if (!pw || !(await safeEqual(pw, secret))) return back(req, '/login?e=bad');
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  const cookie = COOKIE + '=' + encodeURIComponent(await makeSession(secret)) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(SESSION_MS / 1000) + secure;
  return back(req, '/', cookie);
}
