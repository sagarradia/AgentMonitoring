/* Shared-password login. The session cookie is "<expiry ms>.<HMAC-SHA256(expiry)>" keyed by
   APP_PASSWORD, so changing the password signs everyone out. Web Crypto only, so the same code
   runs in the proxy and in route handlers. With APP_PASSWORD unset, nothing is reachable. */

export const COOKIE = 'ad_session';
export const SESSION_MS = 1000 * 60 * 60 * 24 * 14;

const enc = new TextEncoder();
function hex(buf: ArrayBuffer): string { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('') }
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode('agent-desk:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
/** Constant-time comparison of two strings (compares fixed-length digests). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < p.length; i++) d |= p[i] ^ q[i];
  return d === 0;
}

export async function makeSession(secret: string, now = Date.now()): Promise<string> {
  const exp = String(now + SESSION_MS);
  return exp + '.' + await hmac(secret, exp);
}
export async function verifySession(secret: string | undefined, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!secret || !token) return false;
  const i = token.indexOf('.');
  if (i <= 0) return false;
  const exp = token.slice(0, i), sig = token.slice(i + 1);
  if (!/^\d{10,16}$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(sig, await hmac(secret, exp));
}
