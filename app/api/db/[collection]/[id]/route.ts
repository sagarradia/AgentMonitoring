import { getStore } from '@/lib/server/store';
import { fail, guard, json, storeFailure, readJson } from '@/lib/server/http';
import type { Collection } from '@/lib/types';
import { isCollection, isDocId, isPlainObject, MAX_DOC_BYTES } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ collection: string; id: string }> };

type Target = { error: Response } | { error?: undefined; collection: Collection; id: string };

async function target(ctx: Ctx): Promise<Target> {
  const { collection, id } = await ctx.params;
  if (!isCollection(collection)) return { error: fail(404, 'unknown_collection') };
  if (!isDocId(id)) return { error: fail(400, 'bad_id') };
  return { collection, id };
}

/** GET /api/db/:collection/:id → { id, data, updated_at } or 404 */
export async function GET(req: Request, ctx: Ctx) {
  const blocked = await guard(req, 'db');
  if (blocked) return blocked;
  const t = await target(ctx);
  if (t.error) return t.error;
  try {
    const doc = await getStore().get(t.collection, t.id);
    return doc ? json(doc) : fail(404, 'not_found');
  } catch (e) {
    return storeFailure('db.get', e);
  }
}

/** PUT /api/db/:collection/:id with the document as the JSON body. Replaces the whole document. */
export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await guard(req, 'db');
  if (blocked) return blocked;
  const t = await target(ctx);
  if (t.error) return t.error;
  const body = await readJson(req, MAX_DOC_BYTES);
  if (!isPlainObject(body)) return fail(400, 'bad_body');
  try {
    const doc = await getStore().put(t.collection, t.id, body);
    return json({ id: doc.id, updated_at: doc.updated_at });
  } catch (e) {
    return storeFailure('db.put', e);
  }
}

/** DELETE /api/db/:collection/:id (the page deletes agents). */
export async function DELETE(req: Request, ctx: Ctx) {
  const blocked = await guard(req, 'db');
  if (blocked) return blocked;
  const t = await target(ctx);
  if (t.error) return t.error;
  try {
    await getStore().remove(t.collection, t.id);
    return json({ ok: true });
  } catch (e) {
    return storeFailure('db.delete', e);
  }
}
