import { claudeConfigured } from '@/lib/server/claude';
import { guard, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Which optional features are configured, so the page can show or hide them as before. */
export async function GET(req: Request) {
  const blocked = await guard(req, 'db');
  if (blocked) return blocked;
  return json({ chat: claudeConfigured(), github: !!process.env.GITHUB_TOKEN });
}
