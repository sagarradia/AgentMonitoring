/* Document store behind /api/db. Tables agents, projects, chats, meta: id text primary key,
   data jsonb, updated_at timestamptz. Drivers, picked from the environment:
     DATABASE_URL (or POSTGRES_URL)  → Postgres directly, e.g. Neon added from Vercel
     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → Supabase
   DB_DRIVER=file keeps documents in a local JSON file for development and the browser test;
   it is refused on Vercel. Tests inject an in-memory store with setStore(). */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Collection } from '../types';

export interface Doc { id: string; data: Record<string, unknown>; updated_at: string }
export interface Store {
  list(c: Collection): Promise<Doc[]>;
  get(c: Collection, id: string): Promise<Doc | null>;
  put(c: Collection, id: string, data: Record<string, unknown>): Promise<Doc>;
  remove(c: Collection, id: string): Promise<void>;
}

export class StoreConfigError extends Error {}

export function supabaseStore(client: SupabaseClient): Store {
  const fail = (op: string, e: { code?: string } | null) => new Error('supabase ' + op + ' failed' + (e && e.code ? ' (' + e.code + ')' : ''));
  return {
    async list(c) {
      const { data, error } = await client.from(c).select('id,data,updated_at').order('id');
      if (error) throw fail('list', error);
      return (data || []) as Doc[];
    },
    async get(c, id) {
      const { data, error } = await client.from(c).select('id,data,updated_at').eq('id', id).maybeSingle();
      if (error) throw fail('get', error);
      return (data as Doc) || null;
    },
    async put(c, id, body) {
      const row = { id, data: body, updated_at: new Date().toISOString() };
      const { error } = await client.from(c).upsert(row, { onConflict: 'id' });
      if (error) throw fail('put', error);
      return row;
    },
    async remove(c, id) {
      const { error } = await client.from(c).delete().eq('id', id);
      if (error) throw fail('delete', error);
    },
  };
}

/* Same table layout as supabase/schema.sql. Run on first use, so a fresh Neon database needs no
   manual setup. RLS is not needed here: only this server holds the connection string. */
export const SCHEMA_SQL = ['agents', 'projects', 'chats', 'meta'].map((t) =>
  `create table if not exists public.${t} (id text primary key, data jsonb not null, updated_at timestamptz not null default now())`);

const TABLES: Record<Collection, string> = { agents: 'agents', projects: 'projects', chats: 'chats', meta: 'meta' };

export function postgresStore(url: string): Store {
  // prepare:false keeps it compatible with pooled (PgBouncer) connection strings such as Neon's.
  const sql = postgres(url, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} });
  let ready: Promise<void> | null = null;
  const init = () => (ready ||= (async () => { for (const q of SCHEMA_SQL) await sql.unsafe(q) })().catch((e) => { ready = null; throw e }));
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  const row = (r: Record<string, unknown>): Doc => ({ id: r.id as string, data: r.data as Record<string, unknown>, updated_at: iso(r.updated_at) });
  return {
    async list(c) { await init(); return (await sql`select id, data, updated_at from ${sql(TABLES[c])} order by id`).map(row) },
    async get(c, id) { await init(); const r = await sql`select id, data, updated_at from ${sql(TABLES[c])} where id = ${id}`; return r[0] ? row(r[0]) : null },
    async put(c, id, data) {
      await init();
      const r = await sql`insert into ${sql(TABLES[c])} (id, data, updated_at) values (${id}, ${sql.json(data as postgres.JSONValue)}, now())
        on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at returning id, data, updated_at`;
      return row(r[0]);
    },
    async remove(c, id) { await init(); await sql`delete from ${sql(TABLES[c])} where id = ${id}` },
  };
}

export function memoryStore(seed?: Partial<Record<Collection, Record<string, Record<string, unknown>>>>): Store {
  const m = new Map<string, Map<string, Doc>>();
  const col = (c: Collection) => { let x = m.get(c); if (!x) { x = new Map(); m.set(c, x) } return x };
  const now = () => new Date().toISOString();
  for (const [c, docs] of Object.entries(seed || {})) for (const [id, data] of Object.entries(docs || {})) col(c as Collection).set(id, { id, data, updated_at: now() });
  return {
    async list(c) { return [...col(c).values()].sort((a, b) => a.id.localeCompare(b.id)).map((d) => structuredClone(d)) },
    async get(c, id) { const d = col(c).get(id); return d ? structuredClone(d) : null },
    async put(c, id, data) { const d = { id, data: structuredClone(data), updated_at: now() }; col(c).set(id, d); return structuredClone(d) },
    async remove(c, id) { col(c).delete(id) },
  };
}

type FileShape = Partial<Record<Collection, Record<string, Doc>>>;
export function fileStore(file: string): Store {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<FileShape> => { try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return {} } };
  const write = async (d: FileShape) => { await fs.mkdir(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; await fs.writeFile(tmp, JSON.stringify(d)); await fs.rename(tmp, file) };
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = queue.then(fn, fn); queue = p.catch(() => undefined); return p };
  return {
    async list(c) { const d = await read(); return Object.values(d[c] || {}).sort((a, b) => a.id.localeCompare(b.id)) },
    async get(c, id) { const d = await read(); return (d[c] || {})[id] || null },
    put: (c, id, data) => serial(async () => { const d = await read(); const doc = { id, data, updated_at: new Date().toISOString() }; (d[c] = d[c] || {})[id] = doc; await write(d); return doc }),
    remove: (c, id) => serial(async () => { const d = await read(); if (d[c]) delete d[c]![id]; await write(d) }),
  };
}

export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): Store {
  if (env.DB_DRIVER === 'file') {
    if (env.VERCEL) throw new StoreConfigError('DB_DRIVER=file is for local development only');
    return fileStore(path.resolve(/*turbopackIgnore: true*/ env.DB_FILE || '.data/db.json'));
  }
  const pgUrl = env.DATABASE_URL || env.POSTGRES_URL;
  if (pgUrl) return postgresStore(pgUrl);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new StoreConfigError('no database configured: set DATABASE_URL (Neon) or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return supabaseStore(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
}

/* First use of an empty database loads seed.json: every seed document that is not there yet is
   written, then meta/seeded is set so it never runs again (deleted agents stay deleted).
   Set AUTO_SEED=off to skip. */
export async function seedIfNew(store: Store, docs: { agents: Record<string, unknown>; projects: Record<string, unknown> }): Promise<boolean> {
  if (await store.get('meta', 'seeded')) return false;
  for (const c of ['agents', 'projects'] as const) {
    const have = new Set((await store.list(c)).map((d) => d.id));
    for (const [id, data] of Object.entries(docs[c])) if (!have.has(id)) await store.put(c, id, data as Record<string, unknown>);
  }
  await store.put('meta', 'seeded', { at: Date.now() });
  return true;
}

function withAutoSeed(store: Store, env: NodeJS.ProcessEnv): Store {
  if (env.AUTO_SEED === 'off') return store;
  let ready: Promise<unknown> | null = null;
  const go = () => (ready ||= (async () => {
    const { seedDocs } = await import('../seed');
    const seed = (await import('../../seed.json')).default as Parameters<typeof seedDocs>[0];
    await seedIfNew(store, seedDocs(seed) as { agents: Record<string, unknown>; projects: Record<string, unknown> });
  })().catch((e) => { ready = null; throw e }));
  return {
    list: async (c) => { await go(); return store.list(c) },
    get: async (c, id) => { await go(); return store.get(c, id) },
    put: async (c, id, d) => { await go(); return store.put(c, id, d) },
    remove: async (c, id) => { await go(); return store.remove(c, id) },
  };
}

let current: Store | null = null;
export function getStore(): Store { return current || (current = withAutoSeed(storeFromEnv(), process.env)) }
export function setStore(s: Store | null) { current = s }
