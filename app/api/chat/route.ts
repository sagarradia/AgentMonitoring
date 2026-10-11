import { claudeConfigured, errorCode, FALLBACK, getClaude, MAX_CHARS, MODEL, parseTurns } from '@/lib/server/claude';
import { fail, guard, logError, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* POST /api/chat { turns: [{ role, content }] }
   Streams newline-delimited JSON: {"t":"<text delta>"} ... then {"done":true,"truncated":bool}
   or {"error":"<code>"} if the stream fails part way. */
export async function POST(req: Request) {
  const blocked = await guard(req, 'claude');
  if (blocked) return blocked;
  if (!claudeConfigured()) return fail(503, 'sampling_disabled');
  const body = await readJson(req, MAX_CHARS * 2);
  const turns = parseTurns((body as { turns?: unknown } | undefined)?.turns);
  if (!turns) return fail(400, 'bad_body');

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        const s = getClaude().beta.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          output_config: { effort: 'low' },
          ...FALLBACK,
          messages: turns,
        }, { signal: req.signal });
        for await (const ev of s) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send({ t: ev.delta.text });
        }
        const msg = await s.finalMessage();
        if (msg.stop_reason === 'refusal') send({ error: 'refused' });
        else send({ done: true, truncated: msg.stop_reason === 'max_tokens' });
      } catch (e) {
        const { code } = errorCode(e);
        if (code !== 'cancelled') logError('chat', e);
        try { send({ error: code }) } catch { /* client went away */ }
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
