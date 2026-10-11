import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseJsonReply, parseTurns } from '@/lib/server/claude';
import { resetRateLimits } from '@/lib/server/ratelimit';
import { authed, PASSWORD } from './helpers';

describe('parseJsonReply', () => {
  it('reads plain, fenced and embedded JSON', () => {
    expect(parseJsonReply('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonReply('```json\n[1,2]\n```')).toEqual([1, 2]);
    expect(parseJsonReply('Here you go: {"name":"x"} hope that helps')).toEqual({ name: 'x' });
    expect(parseJsonReply('[]')).toEqual([]);
    expect(() => parseJsonReply('no json here')).toThrow();
  });
});

describe('parseTurns', () => {
  it('accepts user-first, user-last turns and rejects anything else', () => {
    expect(parseTurns([{ role: 'user', content: 'brief' }, { role: 'assistant', content: 'hi' }, { role: 'user', content: 'why late?' }])).toHaveLength(3);
    expect(parseTurns([])).toBeNull();
    expect(parseTurns([{ role: 'system', content: 'x' }])).toBeNull();
    expect(parseTurns([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }])).toBeNull();
    expect(parseTurns([{ role: 'user', content: 'x'.repeat(300_001) }])).toBeNull();
    expect(parseTurns('nope')).toBeNull();
  });
});

/* The SDK is mocked: these tests check the route contract, not the model. */
const stream = vi.fn();
const create = vi.fn();
vi.mock('@anthropic-ai/sdk', async (orig) => {
  const real = (await orig()) as { default: Record<string, unknown> };
  class Fake { beta = { messages: { stream, create } } }
  Object.assign(Fake, real.default);
  return { default: Fake };
});

describe('POST /api/chat and /api/extract', () => {
  beforeEach(() => { process.env.APP_PASSWORD = PASSWORD; process.env.ANTHROPIC_API_KEY = 'sk-test-placeholder'; resetRateLimits() });
  afterEach(() => { vi.restoreAllMocks(); stream.mockReset(); create.mockReset(); delete process.env.ANTHROPIC_API_KEY });

  it('streams text deltas as NDJSON and passes the turns through unchanged', async () => {
    stream.mockImplementation(() => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'founder' } };
      },
      finalMessage: async () => ({ stop_reason: 'end_turn' }),
    }));
    const { POST } = await import('@/app/api/chat/route');
    const turns = [{ role: 'user', content: 'Rules: - You have no run logs' }];
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await POST(await authed('/api/chat', { method: 'POST', body: JSON.stringify({ turns }) }));
    expect(r.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toEqual([{ t: 'Hello ' }, { t: 'founder' }, { done: true, truncated: false }]);
    const params = stream.mock.calls[0][0];
    expect(params.messages).toEqual(turns);
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.fallbacks).toBe('default');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns 503 sampling_disabled without an API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { POST } = await import('@/app/api/chat/route');
    const r = await POST(await authed('/api/chat', { method: 'POST', body: JSON.stringify({ turns: [{ role: 'user', content: 'x' }] }) }));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'sampling_disabled' });
  });

  it('extracts JSON from the reply', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '```json\n[{"kind":"todo","index":1}]\n```' }] });
    const { POST } = await import('@/app/api/extract/route');
    const r = await POST(await authed('/api/extract', { method: 'POST', body: JSON.stringify({ prompt: 'List commitments' }) }));
    expect(await r.json()).toEqual({ json: [{ kind: 'todo', index: 1 }] });
  });

  it('reports invalid_json when the reply has no JSON', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sorry, no.' }] });
    const { POST } = await import('@/app/api/extract/route');
    const r = await POST(await authed('/api/extract', { method: 'POST', body: JSON.stringify({ prompt: 'x' }) }));
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: 'invalid_json' });
  });

  it('requires a session', async () => {
    const { POST } = await import('@/app/api/extract/route');
    const r = await POST(new Request('http://localhost/api/extract', { method: 'POST', body: '{"prompt":"x"}' }));
    expect(r.status).toBe(401);
  });
});
