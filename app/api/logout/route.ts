import { COOKIE } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  return new Response(null, { status: 303, headers: { location: '/login', 'set-cookie': COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0', 'cache-control': 'no-store' } });
}
