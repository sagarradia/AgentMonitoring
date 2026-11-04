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

async function safeJson<T>(repo: string, path: string, token: string, f: F): Promise<T | null> {
  try { return (await (await gh('/repos/' + repo + path, token, f)).json()) as T } catch { return null }
}

/** Facts about the repo itself: what GitHub says it is, its languages, folders, package and recent work. No file bodies. */
export async function aboutRepo(repo: string, root: string[], token: string, f: F): Promise<string> {
  const meta = await safeJson<{ description?: string; homepage?: string; topics?: string[]; license?: { name?: string }; created_at?: string; pushed_at?: string; open_issues_count?: number; visibility?: string; archived?: boolean }>(repo, '', token, f);
  const langs = await safeJson<Record<string, number>>(repo, '/languages', token, f);
  const commits = await safeJson<Array<{ commit?: { message?: string } }>>(repo, '/commits?per_page=8', token, f);
  const lines: string[] = [];
  if (meta) {
    if (meta.description) lines.push('GitHub description: ' + String(meta.description).slice(0, 300));
    if (meta.homepage) lines.push('Website: ' + String(meta.homepage).slice(0, 200));
    if (Array.isArray(meta.topics) && meta.topics.length) lines.push('Topics: ' + meta.topics.slice(0, 15).join(', '));
    const bits = [meta.visibility, meta.license?.name && 'licence ' + meta.license.name, meta.created_at && 'created ' + meta.created_at.slice(0, 10), meta.pushed_at && 'last push ' + meta.pushed_at.slice(0, 10), typeof meta.open_issues_count === 'number' && meta.open_issues_count + ' open issues/PRs', meta.archived && 'archived'].filter(Boolean);
    if (bits.length) lines.push(bits.join(' · '));
  }
  if (langs && typeof langs === 'object') {
    const tot = Object.values(langs).reduce((x, y) => x + (Number(y) || 0), 0) || 1;
    const top = Object.entries(langs).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => k + ' ' + Math.round((100 * v) / tot) + '%');
    if (top.length) lines.push('Languages: ' + top.join(', '));
  }
  try {
    const pkg = JSON.parse(await readFile(repo, 'package.json', token, f)) as { name?: string; description?: string; dependencies?: Record<string, string>; scripts?: Record<string, string> };
    if (pkg.description) lines.push('Package description: ' + String(pkg.description).slice(0, 300));
    const deps = Object.keys(pkg.dependencies || {}).slice(0, 12);
    if (deps.length) lines.push('Main packages: ' + deps.join(', '));
  } catch { /* no package.json */ }
  const dirs = root.filter((p) => !p.includes('/')).slice(0, 25);
  if (lines.length && dirs.length) lines.push('Top-level files: ' + dirs.join(', '));
  if (Array.isArray(commits)) {
    const msgs = commits.map((c) => scrub(String(c.commit?.message || '').split('\n')[0]).slice(0, 100)).filter(Boolean).slice(0, 8);
    if (msgs.length) lines.push('Recent work (latest commit titles):\n- ' + msgs.join('\n- '));
  }
  return lines.length ? '### About this repo (from GitHub)\n' + lines.join('\n') : '';
}

export async function buildBrief(repo: string, token: string, f: F = fetch, now = Date.now()): Promise<BriefDraft> {
  if (!isRepo(repo)) throw new GhError(400, 'bad_repo');
  const root = await listDir(repo, '', token, f);
  if (!root.length) throw new GhError(502, 'no_access');
  const all = [...root, ...(await listDir(repo, 'docs', token, f)), ...(await listDir(repo, 'docs/product', token, f))];
  const files = [...new Set(all)].filter((p) => PICK.some((r) => r.test(p))).sort((a, b) => PICK.findIndex((r) => r.test(a)) - PICK.findIndex((r) => r.test(b))).slice(0, 12);
  const parts: string[] = [], sources: BriefSource[] = [];
  for (const p of files) {
    let t = '';
    try { t = await readFile(repo, p, token, f) } catch { continue }
    if (!t.trim()) continue;
    const d = digest(p, t, 1400);
    parts.push(d); sources.push({ path: p, chars: d.length });
  }
  const about = await aboutRepo(repo, root, token, f);
  if (!parts.length && !about) throw new GhError(404, 'nothing_found');
  const brief = ('Draft brief for ' + repo + ', collected from the repo and its own documents. Review it, trim it and save.\n\n' + [about, ...parts].filter(Boolean).join('\n\n')).slice(0, 16_000);
  if (about) sources.unshift({ path: 'GitHub repo details', chars: about.length });
  return { brief, sources, fetchedAt: now };
}
