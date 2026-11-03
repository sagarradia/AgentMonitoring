import { getStore, upgradeSeed } from '@/lib/server/store';
import { fail, guard, json, storeFailure, readJson } from '@/lib/server/http';
import { isDocId, isPlainObject } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

/** POST /api/import with { agents: { <id>: doc }, meta?: { report?, models? } }.
    Merges a data file into the store with the same rules as the one-time upgrade: it adds the repo
    progress record and the report snapshot, fills memory, docs, skills and routines only where
    empty, and replaces todos only if nothing was changed. Needs the login like every other route. */
export async function POST(req: Request) {
  const blocked = await guard(req, 'db');
  if (blocked) return blocked;
  const body = await readJson(req, 8 * 1024 * 1024);
  if (!isPlainObject(body) || !isPlainObject(body.agents)) return fail(400, 'bad_body');
  const agents: Record<string, unknown> = {};
  for (const [id, doc] of Object.entries(body.agents)) {
    if (!isDocId(id) || !isPlainObject(doc)) return fail(400, 'bad_body');
    agents[id] = doc;
  }
  const meta = isPlainObject(body.meta) ? (body.meta as Record<string, unknown>) : undefined;
  try {
    await upgradeSeed(getStore(), { agents, projects: {}, meta }, { force: true });
    return json({ ok: true, agents: Object.keys(agents).length });
  } catch (e) {
    return storeFailure('db.import', e);
  }
}
