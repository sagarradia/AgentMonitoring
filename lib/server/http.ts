/* Shared checks for every API route: signed-in session (defence in depth behind proxy.ts),
   per-IP rate limit, and small JSON helpers. Nothing here logs request bodies. */
import { COOKIE, verifySession } from './auth';
import { clientIp, rateLimit, type BucketName } from './ratelimit';
import { StoreConfigError } from './store';

const NO_STORE = { 'cache-control': 'no-store' };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...NO_STORE, ...headers } });
}
export function fail(status: number, code: string, headers: Record<string, string> = {}): Response {
  return json({ error: code }, status, headers);
}

function cookieValue(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** Returns an error Response to send, or null when the request may proceed. */
export async function guard(req: Request, bucket: BucketName): Promise<Response | null> {
  if (!process.env.APP_PASSWORD) return fail(503, 'not_configured');
  if (!(await verifySession(process.env.APP_PASSWORD, cookieValue(req, COOKIE)))) return fail(401, 'unauthorized');
  const r = rateLimit(bucket, clientIp(req.headers));
  if (!r.ok) return fail(429, 'rate_limited', { 'retry-after': String(r.retryAfter) });
  return null;
}

/** Reads a JSON body with a size cap. Returns undefined when it is missing, too big or malformed. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > maxBytes) return undefined;
  const text = await req.text();
  if (text.length > maxBytes) return undefined;
  try { return JSON.parse(text) } catch { return undefined }
}

/** Logs an error without request data: only the route, a short code and the error class. */
export function logError(route: string, e: unknown) {
  const name = e instanceof Error ? e.constructor.name : typeof e;
  const status = (e as { status?: number })?.status;
  console.error('[agent-desk] ' + route + ' failed: ' + name + (status ? ' ' + status : ''));
}

export function storeFailure(route: string, e: unknown): Response {
  if (e instanceof StoreConfigError) return fail(503, 'db_not_configured');
  logError(route, e);
  return fail(500, 'store_error');
}
