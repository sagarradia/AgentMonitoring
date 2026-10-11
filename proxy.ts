/* Login wall in front of the whole app. Everything except the login page, the login endpoint
   and static build assets needs a valid session cookie. API routes check again themselves. */
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, verifySession } from './lib/server/auth';

const OPEN = new Set(['/login', '/api/login', '/robots.txt']);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OPEN.has(pathname)) return NextResponse.next();
  const ok = await verifySession(process.env.APP_PASSWORD, req.cookies.get(COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: process.env.APP_PASSWORD ? 'unauthorized' : 'not_configured' }, { status: process.env.APP_PASSWORD ? 401 : 503 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
