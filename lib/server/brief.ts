/* Builds a draft company brief from a repo's own documents (README, CLAUDE.md, docs/). Nothing is sent to an
   AI service: it reads headings and opening text and keeps the parts about purpose, scope, rules and timeline.
   The owner reviews and saves the draft. The text is never stored by the server and never logged. */
import { GhError, gh, isRepo } from './github';

type F = typeof fetch;
export interface BriefSource { path: string; chars: number }
export interface BriefDraft { brief: string; sources: BriefSource[]; fetchedAt: number }

const PICK = [/^readme(\.md)?$/i, /^claude\.md$/i, /^docs\/readme\.md$/i, /^docs\/(product|vision|strategy)[^/]*\.md$/i, /^docs\/product\/[^/]+\.md$/i, /^docs\/(versions|roadmap|org)[^/]*\.md$/i];
const KEEP = /(objective|goal|mission|vision|purpose|what we are building|what we are|scope|principle|non-negotiable|rule|timeline|version|roadmap|audience|users?|customers?|problem|stack|locale|decision|summary|overview|about)/i;
const SECRET = /(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{6,})/i;

export const scrub = (t: string) => t.split('\n').map((l) => (SECRET.test(l) ? '[line removed: looked like a secret]' : l)).join('\n');

/** Keeps the title, the opening paragraph and sections whose heading is about purpose, scope, rules or timeline. */
export function digest(path: string, md: string, perSection = 900): string {
  const lines = scrub(md.replace(/\r/g, '')).split('\n');
  const secs: Array<{ h: string; level: number; body: string[] }> = [{ h: '', level: 0, body: [] }];
  let fence = false;
  for (const l of lines) {
    if (/^```/.test(l)) { fence = !fence; continue }
    if (fence) continue;
    const m = /^(#{1,4})\s+(.*)$/.exec(l);
    if (m) secs.push({ h: m[2].replace(/[*_`]/g, '').trim(), level: m[1].length, body: [] });
    else secs[secs.length - 1].body.push(l);
  }
  const clip = (b: string[]) => b.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, perSection);
  const title = secs.find((s) => s.level === 1)?.h || path;
  const out = ['### ' + title + '  (from ' + path + ')'];
  const intro = clip(secs[0].body) || clip(secs.find((s) => s.level === 1)?.body || []);
  if (intro) out.push(intro);
  for (const s of secs.slice(1)) {
    if (s.level === 1 || !KEEP.test(s.h)) continue;
    const body = clip(s.body);
    if (body) out.push('**' + s.h + '**\n' + body);
  }
  return out.join('\n\n');
}

async function listDir(repo: string, dir: string, token: string, f: F): Promise<string[]> {
  try {
    const j = await (await gh('/repos/' + repo + '/contents/' + dir, token, f)).json() as Array<{ type?: string; path?: string }>;
    return Array.isArray(j) ? j.filter((x) => x.type === 'file' && typeof x.path === 'string').map((x) => x.path as string) : [];
  } catch (e) { if (e instanceof GhError && e.code === 'no_access') return []; throw e }
}
async function readFile(repo: string, path: string, token: string, f: F): Promise<string> {
  const j = await (await gh('/repos/' + repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/'), token, f)).json() as { content?: string; encoding?: string; size?: number };
  if (!j.content || j.encoding !== 'base64' || (j.size || 0) > 200_000) return '';
  return Buffer.from(j.content, 'base64').toString('utf8');
}

export async function buildBrief(repo: string, token: string, f: F = fetch, now = Date.now()): Promise<BriefDraft> {
  if (!isRepo(repo)) throw new GhError(400, 'bad_repo');
  const root = await listDir(repo, '', token, f);
  if (!root.length) throw new GhError(502, 'no_access');
  const all = [...root, ...(await listDir(repo, 'docs', token, f)), ...(await listDir(repo, 'docs/product', token, f))];
  const files = [...new Set(all)].filter((p) => PICK.some((r) => r.test(p))).sort((a, b) => PICK.findIndex((r) => r.test(a)) - PICK.findIndex((r) => r.test(b))).slice(0, 8);
  const parts: string[] = [], sources: BriefSource[] = [];
  for (const p of files) {
    const t = await readFile(repo, p, token, f);
    if (!t.trim()) continue;
    const d = digest(p, t);
    parts.push(d); sources.push({ path: p, chars: d.length });
  }
  if (!parts.length) throw new GhError(404, 'nothing_found');
  const brief = ('Draft brief for ' + repo + ', collected from the repo\'s own documents. Review it, trim it and save.\n\n' + parts.join('\n\n')).slice(0, 12_000);
  return { brief, sources, fetchedAt: now };
}
