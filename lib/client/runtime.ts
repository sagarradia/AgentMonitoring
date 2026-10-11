/* Browser-side replacements for the artifact runtime's window.claude capabilities.
   They keep the call shapes the page already uses, so the view code stays as it was:
     db        → /api/db (fetch on load, then a poll every 15 s instead of onSnapshot)
     sample    → /api/chat (streamed) and /api/extract (JSON)
     mcp       → /api/repos (GitHub REST, server side)
     downloads → a normal Blob download
   No request bodies or chat text are logged here. */
import type { Repo, Turn } from '../types';

export const POLL_MS = 15_000;

export interface CodedError { code: string; text?: string }
function coded(code: string, text?: string): CodedError { return text == null ? { code } : { code, text } }

function toLogin() { if (typeof window !== 'undefined') window.location.assign('/login') }

async function errorFrom(r: Response): Promise<CodedError> {
  if (r.status === 401) { toLogin(); return coded('unauthorized') }
  let code = 'http_' + r.status;
  try { const j = await r.json(); if (j && typeof j.error === 'string') code = j.error } catch { /* not JSON */ }
  return coded(code);
}

async function api(path: string, init?: RequestInit): Promise<unknown> {
  let r: Response;
  try { r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init }) }
  catch (e) { throw (e as Error)?.name === 'AbortError' ? coded('cancelled') : coded('network_error') }
  if (!r.ok) throw await errorFrom(r);
  return r.json();
}

/* ---------- db ---------- */
interface RawDoc { id: string; data: Record<string, unknown> }
export interface Snap { id: string; exists: boolean; data(): any }
export interface QuerySnap { docs: Snap[] }
type Unsub = () => void;

export interface DB {
  doc(path: string): {
    set(data: unknown): Promise<void>;
    delete(): Promise<void>;
    onSnapshot(cb: (d: Snap) => void, err?: (e: unknown) => void): Unsub;
  };
  collection(name: string): { onSnapshot(cb: (s: QuerySnap) => void, err?: (e: unknown) => void): Unsub };
}

function splitPath(p: string): [string, string] {
  const i = p.indexOf('/');
  return [p.slice(0, i), p.slice(i + 1)];
}
const enc = encodeURIComponent;

export function createDb(pollMs = POLL_MS): DB {
  /* A poll that started before, or overlaps, a local write could hand back the old document and
     undo the user's edit on screen. Such poll results are dropped; the next poll picks things up. */
  let pending = 0, writes = 0;
  const pollers = new Set<() => void>();

  async function write(path: string, init: RequestInit) {
    const [c, id] = splitPath(path);
    pending++; writes++;
    try { await api('/api/db/' + enc(c) + '/' + enc(id), init) }
    finally { pending--; writes++ }
  }

  function poll<T>(load: () => Promise<T>, deliver: (v: T) => void, err?: (e: unknown) => void): Unsub {
    let stopped = false, last = '', first = true, busy = false;
    const tick = async () => {
      if (stopped || busy) return;
      if (!first && typeof document !== 'undefined' && document.hidden) return;
      busy = true;
      const startedAt = writes;
      try {
        const v = await load();
        if (stopped || pending > 0 || writes !== startedAt) return;
        const sig = JSON.stringify(v);
        if (sig === last && !first) return;
        last = sig; first = false;
        deliver(v);
      } catch (e) {
        if (first && err) err(e);
      } finally { busy = false }
    };
    tick();
    const h = setInterval(tick, pollMs);
    pollers.add(tick);
    return () => { stopped = true; clearInterval(h); pollers.delete(tick) };
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollers.forEach((t) => t()) });
  }

  const snapOf = (d: RawDoc): Snap => ({ id: d.id, exists: true, data: () => d.data });

  return {
    doc(path) {
      const [c, id] = splitPath(path);
      return {
        set: (data) => write(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
        delete: () => write(path, { method: 'DELETE' }),
        onSnapshot(cb, err) {
          return poll(async () => {
            try { return (await api('/api/db/' + enc(c) + '/' + enc(id))) as RawDoc }
            catch (e) { if ((e as CodedError).code === 'not_found') return null; throw e }
          }, (d) => cb(d ? snapOf(d) : { id, exists: false, data: () => undefined }), err);
        },
      };
    },
    collection(name) {
      return {
        onSnapshot(cb, err) {
          return poll(async () => ((await api('/api/db/' + enc(name))) as { docs: RawDoc[] }).docs,
            (docs) => cb({ docs: docs.map(snapOf) }), err);
        },
      };
    },
  };
}

/* ---------- sample ---------- */
export interface SampleOpts { signal?: AbortSignal; cache?: boolean; onText?: (u: { text: string }) => void }
export interface Sample {
  (turns: Turn[], opts?: SampleOpts): Promise<{ text: string; truncated: boolean }>;
  json(prompt: string, opts?: SampleOpts): Promise<unknown>;
}

export function createSample(): Sample {
  const run = async (turns: Turn[], opts: SampleOpts = {}) => {
    let text = '';
    let r: Response;
    try {
      r = await fetch('/api/chat', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ turns }), signal: opts.signal });
    } catch (e) { throw (e as Error)?.name === 'AbortError' ? coded('cancelled', text) : coded('network_error', text) }
    if (!r.ok || !r.body) throw await errorFrom(r);
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '', truncated = false, done = false;
    try {
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const m = JSON.parse(line) as { t?: string; done?: boolean; truncated?: boolean; error?: string };
          if (typeof m.t === 'string') { text += m.t; opts.onText?.({ text }) }
          else if (m.error) throw coded(m.error, text);
          else if (m.done) { done = true; truncated = !!m.truncated }
        }
      }
    } catch (e) {
      if ((e as CodedError)?.code) throw e;
      throw (e as Error)?.name === 'AbortError' ? coded('cancelled', text) : coded('network_error', text);
    }
    if (!done) throw coded('network_error', text);
    return { text, truncated };
  };
  const sample = run as Sample;
  sample.json = async (prompt: string, opts: SampleOpts = {}) => {
    const r = (await api('/api/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }), signal: opts.signal })) as { json: unknown };
    return r.json;
  };
  return sample;
}

/* ---------- GitHub repos (was mcp list_repos) ---------- */
export async function listRepos(): Promise<Repo[]> {
  return ((await api('/api/repos')) as { repos: Repo[] }).repos;
}

/* ---------- downloads ---------- */
export interface Downloads { save(f: { filename: string; data: string; mime?: string }): Promise<void> }
export function createDownloads(): Downloads {
  return {
    async save({ filename, data, mime }) {
      const blob = new Blob([data], { type: mime || 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}

export async function loadConfig(): Promise<{ chat: boolean; github: boolean }> {
  try { return (await api('/api/config')) as { chat: boolean; github: boolean } }
  catch { return { chat: false, github: false } }
}
