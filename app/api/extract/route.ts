import { claudeConfigured, errorCode, FALLBACK, getClaude, MAX_CHARS, MODEL, parseJsonReply } from '@/lib/server/claude';
import { fail, guard, json, logError, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* POST /api/extract { prompt } → { json: <parsed value> }
   Used for the wizard's role draft (an object) and "Capture commitments" (an array). */
export async function POST(req: Request) {
  const blocked = await guard(req, 'claude');
  if (blocked) return blocked;
  if (!claudeConfigured()) return fail(503, 'sampling_disabled');
  const body = await readJson(req, MAX_CHARS * 2);
  const prompt = (body as { prompt?: unknown } | undefined)?.prompt;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_CHARS) return fail(400, 'bad_body');
  try {
    const msg = await getClaude().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      ...FALLBACK,
      messages: [{ role: 'user', content: prompt }],
    }, { signal: req.signal });
    if (msg.stop_reason === 'refusal') return fail(422, 'refused');
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    try {
      return json({ json: parseJsonReply(text) });
    } catch {
      return fail(422, 'invalid_json');
    }
  } catch (e) {
    const { status, code } = errorCode(e);
    if (code !== 'cancelled') logError('extract', e);
    return fail(status, code);
  }
}
