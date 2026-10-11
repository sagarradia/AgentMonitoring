import 'server-only';
/* Server-side Claude access. ANTHROPIC_API_KEY is read here and nowhere else; it never reaches
   the browser. Prompts and replies are never logged. */
import Anthropic from '@anthropic-ai/sdk';
import type { Turn } from '../types';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
/* Server-side refusal fallback: a declined request is re-run on Anthropic's recommended model. */
export const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

let client: Anthropic | null = null;
export function claudeConfigured(): boolean { return !!process.env.ANTHROPIC_API_KEY }
export function getClaude(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
  return client;
}

export const MAX_TURNS = 60;
export const MAX_CHARS = 300_000;

/** Validates chat turns from the browser. Returns null if the shape is wrong. */
export function parseTurns(v: unknown): Turn[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_TURNS) return null;
  let total = 0;
  const out: Turn[] = [];
  for (const t of v) {
    if (!t || typeof t !== 'object') return null;
    const { role, content } = t as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) return null;
    total += content.length;
    out.push({ role, content });
  }
  if (total > MAX_CHARS || out[0].role !== 'user' || out[out.length - 1].role !== 'user') return null;
  return out;
}

/** Maps an SDK error to the error codes the page already understands. */
export function errorCode(e: unknown): { status: number; code: string } {
  if (e instanceof Anthropic.APIUserAbortError) return { status: 499, code: 'cancelled' };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, code: 'rate_limited' };
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { status: 503, code: 'sampling_disabled' };
  if (e instanceof Anthropic.APIError) return { status: 502, code: 'upstream_error' };
  return { status: 500, code: 'error' };
}

/** Pulls one JSON value out of a model reply: plain JSON, a fenced block, or the outermost {...}/[...]. */
export function parseJsonReply(text: string): unknown {
  const t = String(text || '').trim();
  const tries: string[] = [t];
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1].trim());
  for (const [o, c] of [['{', '}'], ['[', ']']]) {
    const i = t.indexOf(o), j = t.lastIndexOf(c);
    if (i >= 0 && j > i) tries.push(t.slice(i, j + 1));
  }
  for (const s of tries) { try { return JSON.parse(s) } catch { /* next */ } }
  throw new SyntaxError('no JSON in reply');
}
