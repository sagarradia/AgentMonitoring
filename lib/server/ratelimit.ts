/* Fixed-window per-IP rate limit, in memory. On Vercel each function instance keeps its own
   counters, so the limit is per instance: good enough to stop a runaway client or a password
   guesser on a private tool, not a distributed quota. */

type Bucket = { limit: number; windowMs: number };
export const BUCKETS = {
  db: { limit: 240, windowMs: 60_000 },
  claude: { limit: 20, windowMs: 60_000 },
  repos: { limit: 10, windowMs: 60_000 },
  login: { limit: 10, windowMs: 15 * 60_000 },
} satisfies Record<string, Bucket>;
export type BucketName = keyof typeof BUCKETS;

const hits = new Map<string, { n: number; reset: number }>();

export function clientIp(h: Headers): string {
  const xf = h.get('x-forwarded-for');
  return (xf ? xf.split(',')[0] : h.get('x-real-ip') || 'local').trim() || 'local';
}

export function rateLimit(name: BucketName, ip: string, now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
  const b = BUCKETS[name], key = name + ':' + ip;
  let e = hits.get(key);
  if (!e || e.reset <= now) { e = { n: 0, reset: now + b.windowMs }; hits.set(key, e) }
  e.n++;
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  return e.n > b.limit ? { ok: false, retryAfter: Math.ceil((e.reset - now) / 1000) } : { ok: true };
}
export function resetRateLimits() { hits.clear() }
