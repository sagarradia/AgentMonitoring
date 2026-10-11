import { COOKIE, makeSession } from '@/lib/server/auth';

export const PASSWORD = 'test-password-not-real';

export async function authed(url: string, init: RequestInit & { ip?: string } = {}): Promise<Request> {
  const h = new Headers(init.headers);
  h.set('cookie', COOKIE + '=' + encodeURIComponent(await makeSession(PASSWORD)));
  h.set('x-forwarded-for', init.ip || '10.0.0.1');
  return new Request('http://localhost' + url, { ...init, headers: h });
}
export function ctx<T extends Record<string, string>>(params: T) { return { params: Promise.resolve(params) } }
