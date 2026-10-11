import { getStore } from '@/lib/server/store';
import { fail, guard, json, storeFailure } from '@/lib/server/http';
import { isCollection } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

/** GET /api/db/:collection → { docs: [{ id, data, updated_at }] } */
export async function GET(req: Request, ctx: { params: Promise<{ collection: string }> }) {
  const blocked = await guard(req, 'db');
  if (blocked) return blocked;
  const { collection } = await ctx.params;
  if (!isCollection(collection)) return fail(404, 'unknown_collection');
  try {
    return json({ docs: await getStore().list(collection) });
  } catch (e) {
    return storeFailure('db.list', e);
  }
}
