/* Read skills, plugins and connectors out of files downloaded from a portal (a .zip, a .skill package,
   a SKILL.md, a plugin.json, a marketplace.json or an .mcp.json). Text is read, never run, and nothing is written
   to disk. Connector settings are reduced to a name: commands, arguments and environment values are dropped,
   because they can hold keys. */

export interface Cand {
  kind: 'skill' | 'plugin' | 'mcp';
  name: string; what: string; path: string; source: string;
  body?: string; contains?: string[]; version?: string;
}
export interface Upload { files: Array<{ path: string; text: string }>; paths: string[]; skipped: number; error?: string }

export const LIMITS = { zipBytes: 25_000_000, entries: 4000, textBytes: 300_000, bodyChars: 8000, files: 20 };

const WANT = /(^|\/)(SKILL\.md|plugin\.json|marketplace\.json|\.?mcp\.json)$/i;
const clean = (v: unknown, n: number): string => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

async function inflateCapped(comp: Uint8Array, cap: number): Promise<Uint8Array | null> {
  const stream = new Blob([comp as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader(), parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > cap) { await reader.cancel(); return null }
    parts.push(value);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length }
  return out;
}

export async function readZip(buf: ArrayBuffer): Promise<Upload> {
  const u = new Uint8Array(buf), dv = new DataView(buf), res: Upload = { files: [], paths: [], skipped: 0 };
  if (buf.byteLength > LIMITS.zipBytes) return { ...res, error: 'That file is larger than 25 MB.' };
  let e = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 22 - 65536); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break }
  if (e < 0) return { ...res, error: 'This does not look like a zip file.' };
  const total = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  if (total === 0xffff || p === 0xffffffff) return { ...res, error: 'Very large (zip64) archives are not supported.' };
  if (total > LIMITS.entries) return { ...res, error: 'That archive has too many files (limit ' + LIMITS.entries + ').' };
  const dec = new TextDecoder('utf-8', { fatal: false });
  for (let k = 0; k < total; k++) {
    if (p + 46 > u.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u.subarray(p + 46, p + 46 + nl)).replace(/\\/g, '/');
    p += 46 + nl + xl + cl;
    if (name.endsWith('/') || name.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/.test(name)) continue;
    res.paths.push(name);
    if (!WANT.test(name)) { res.skipped++; continue }
    if (size > LIMITS.textBytes || off + 30 > u.length || dv.getUint32(off, true) !== 0x04034b50) { res.skipped++; continue }
    const ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = u.subarray(ds, ds + comp);
    const data = method === 0 ? raw : method === 8 ? await inflateCapped(raw, LIMITS.textBytes) : null;
    if (!data) { res.skipped++; continue }
    res.files.push({ path: name, text: dec.decode(data) });
  }
  return res;
}

export async function readUpload(name: string, buf: ArrayBuffer): Promise<Upload> {
  const u = new Uint8Array(buf);
  if (u.length > 3 && u[0] === 0x50 && u[1] === 0x4b && u[2] === 3 && u[3] === 4) return readZip(buf);
  if (u.length > LIMITS.textBytes) return { files: [], paths: [], skipped: 1, error: name + ' is too large to be a skill or plugin file.' };
  const text = new TextDecoder('utf-8', { fatal: false }).decode(u);
  const base = name.replace(/\\/g, '/').split('/').pop() || name;
  return { files: [{ path: base, text }], paths: [base], skipped: 0 };
}

export function frontmatter(md: string): { data: Record<string, string>; body: string } {
  const text = md.replace(/^﻿/, ''), m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {}, ls = m[1].split(/\r?\n/);
  for (let i = 0; i < ls.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(ls[i]);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^[>|][+-]?$/.test(v)) { const parts: string[] = []; while (i + 1 < ls.length && /^\s+\S/.test(ls[i + 1])) parts.push(ls[++i].trim()); v = parts.join(' ') }
    data[kv[1].toLowerCase()] = v.replace(/^(["'])([\s\S]*)\1$/, '$2');
  }
  return { data, body: text.slice(m[0].length) };
}

const dirOf = (p: string): string => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i) };
const lastDir = (p: string): string => dirOf(p).split('/').pop() || '';

export function scan(up: Upload, source: string): Cand[] {
  const out: Cand[] = [], src = clean(source, 120);
  const jsonOf = (t: string): any => { try { return JSON.parse(t) } catch { return null } };
  // plugin roots: the folder holding .claude-plugin/plugin.json, or a plugin.json by itself
  const roots: string[] = [];
  for (const f of up.files) if (/(^|\/)plugin\.json$/i.test(f.path)) { const d = dirOf(f.path); roots.push(/(^|\/)\.claude-plugin$/.test(d) ? dirOf(d) : d) }
  const inRoot = (p: string, r: string) => (r === '' ? true : p.startsWith(r + '/'));
  for (const f of up.files) {
    const p = f.path;
    if (/(^|\/)plugin\.json$/i.test(p)) {
      const j = jsonOf(f.text); if (!j || typeof j !== 'object') continue;
      const d = dirOf(p), root = /(^|\/)\.claude-plugin$/.test(d) ? dirOf(d) : d;
      const skills = up.paths.filter((x) => /(^|\/)SKILL\.md$/i.test(x) && inRoot(x, root)).map(lastDir).filter(Boolean);
      const cmds = up.paths.filter((x) => inRoot(x, root) && /(^|\/)commands\/[^/]+\.md$/i.test(x)).length;
      const ags = up.paths.filter((x) => inRoot(x, root) && /(^|\/)agents\/[^/]+\.md$/i.test(x)).length;
      const contains: string[] = [];
      if (skills.length) contains.push(skills.length + ' skill' + (skills.length > 1 ? 's' : '') + ': ' + skills.slice(0, 6).join(', ') + (skills.length > 6 ? '…' : ''));
      if (cmds) contains.push(cmds + ' command' + (cmds > 1 ? 's' : ''));
      if (ags) contains.push(ags + ' agent file' + (ags > 1 ? 's' : ''));
      out.push({ kind: 'plugin', name: clean(j.name || lastDir(root) || 'Plugin', 80), what: clean(j.description, 400), path: p, source: src, contains, version: clean(j.version, 20) });
    } else if (/(^|\/)marketplace\.json$/i.test(p)) {
      const j = jsonOf(f.text); const list = j && Array.isArray(j.plugins) ? j.plugins : [];
      for (const x of list.slice(0, 200)) if (x && typeof x === 'object' && x.name) out.push({ kind: 'plugin', name: clean(x.name, 80), what: clean(x.description, 400), path: p, source: src, version: clean(x.version, 20) });
    } else if (/(^|\/)\.?mcp\.json$/i.test(p)) {
      const j = jsonOf(f.text); const s = j && typeof j === 'object' ? j.mcpServers || j : null;
      if (s && typeof s === 'object') for (const k of Object.keys(s).slice(0, 50)) {
        const v = s[k]; if (!v || typeof v !== 'object') continue;
        out.push({ kind: 'mcp', name: clean(k, 80), what: v.url ? 'Connector to a remote service.' : 'Connector that runs a local program.', path: p, source: src });
      }
    } else if (/(^|\/)SKILL\.md$/i.test(p)) {
      if (roots.some((r) => inRoot(p, r))) continue;
      const { data, body } = frontmatter(f.text);
      const first = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#')) || '';
      out.push({ kind: 'skill', name: clean(data.name || lastDir(p) || 'Skill', 80), what: clean(data.description || first, 400), path: p, source: src, body: f.text.slice(0, LIMITS.bodyChars) });
    }
  }
  // a plugin listed in a marketplace and found as a folder is one plugin; keep the one with contents
  const seen = new Map<string, Cand>();
  for (const c of out) { const k = c.kind + ':' + c.name.toLowerCase(), o = seen.get(k); if (!o || (c.contains?.length && !o.contains?.length)) seen.set(k, c) }
  return [...seen.values()];
}
