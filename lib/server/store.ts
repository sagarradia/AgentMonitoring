/* Document store behind /api/db. Production uses Supabase Postgres (tables agents, projects,
   chats, meta: id text primary key, data jsonb, updated_at timestamptz).
   DB_DRIVER=file keeps documents in a local JSON file for development and the browser test;
   it is refused on Vercel. Tests inject an in-memory store with setStore(). */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new StoreConfigError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set');
  return supabaseStore(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
}

let current: Store | null = null;
export function getStore(): Store { return current || (current = storeFromEnv()) }
export function setStore(s: Store | null) { current = s }
