/* GitHub reads and one write, for the ticket feed and the real pause switch. The token comes from the
   environment and never reaches the browser or a log. Every function takes `f` so tests can pass a fake fetch. */
import type { Store } from './store';
import { applyIssues, issueOf, type Issue } from '../feed';
import type { Agent } from '../types';

type F = typeof fetch;
export class GhError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
export const isRepo = (s: string) => REPO.test(s) && !s.split('/').some((p) => /^\.+$/.test(p));

async function gh(path: string, token: string, f: F, init: RequestInit = {}): Promise<Response> {
  const r = await f('https://api.github.com' + path, {
    ...init, cache: 'no-store',
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'agent-desk', ...(init.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (r.status === 401) throw new GhError(502, 'needs_reauth');
  if (r.status === 403 || r.status === 404) throw new GhError(502, 'no_access');
  if (!r.ok && r.status !== 204) throw new GhError(502, 'upstream_error');
  return r;
}

export async function fetchIssues(repo: string, token: string, f: F = fetch): Promise<Issue[]> {
  if (!isRepo(repo)) throw new GhError(400, 'bad_repo');
  const out: Issue[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await gh('/repos/' + repo + '/issues?state=all&per_page=100&page=' + page, token, f);
    const list = (await r.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(list)) throw new GhError(502, 'upstream_error');
    for (const x of list) {
      if (typeof x.number !== 'number') continue;
      out.push({
        n: x.number, state: x.state === 'closed' ? 'closed' : 'open', closed_at: (x.closed_at as string) || null, pr: !!x.pull_request,
        labels: Array.isArray(x.labels) ? (x.labels as Array<{ name?: unknown } | string>).map((l) => (typeof l === 'string' ? l : String(l.name || ''))).filter(Boolean) : [],
      });
    }
    if (list.length < 100) break;
  }
  return out;
}

export interface RepoFeed { ok: boolean; error?: string; issues?: number; matched?: number; updated?: number; openPRs?: number; unmatched?: number; needsHuman?: number[] }
export interface FeedDoc { fetchedAt: number; repos: Record<string, RepoFeed> }

const repoOf = (projectId: string) => projectId.replace('__', '/');

/** Pull issue state for every repo that has agents with ticket-linked todos, save changed agents, record the outcome. */
export async function syncFeed(store: Store, token: string, f: F = fetch, now = new Date()): Promise<FeedDoc> {
  const docs = await store.list('agents');
  const byRepo = new Map<string, Array<{ id: string; a: Agent }>>();
  for (const d of docs) {
    const a = { ...(d.data as unknown as Agent), id: d.id };
    if (!(a.todos || []).some((t) => issueOf(t) != null)) continue;
    const r = repoOf(a.projectId || '');
    if (!isRepo(r)) continue;
    byRepo.set(r, (byRepo.get(r) || []).concat({ id: d.id, a }));
  }
  const today = now.toISOString().slice(0, 10), feed: FeedDoc = { fetchedAt: now.getTime(), repos: {} };
  for (const [repo, list] of byRepo) {
    try {
      const issues = await fetchIssues(repo, token, f);
      const res = applyIssues(list.map((x) => x.a), issues, today);
      for (const [id, a] of Object.entries(res.changed)) { const { id: _id, ...data } = a; void _id; await store.put('agents', id, data as unknown as Record<string, unknown>) }
      feed.repos[repo] = { ok: true, issues: issues.filter((i) => !i.pr).length, matched: res.matched, updated: res.updated, openPRs: res.openPRs, unmatched: res.unmatchedIssues, needsHuman: res.needsHuman };
    } catch (e) {
      feed.repos[repo] = { ok: false, error: e instanceof GhError ? e.code : 'upstream_error' };
    }
  }
  await store.put('meta', 'feed', feed as unknown as Record<string, unknown>);
  return feed;
}

/* ---- the real pause switch: the label the FamilyVault agents check at the start of every run ---- */
export interface ControlCfg { repo: string; issue: number; label: string }
export function controlCfg(env: NodeJS.ProcessEnv = process.env): ControlCfg {
  const issue = Number(env.CONTROL_ISSUE || 96);
  return { repo: env.CONTROL_REPO || 'Skybirds-Empyrean-Avenue/familyvault', issue: Number.isInteger(issue) && issue > 0 ? issue : 96, label: env.CONTROL_LABEL || 'agents-paused' };
}
export async function getPaused(cfg: ControlCfg, token: string, f: F = fetch): Promise<boolean> {
  if (!isRepo(cfg.repo)) throw new GhError(400, 'bad_repo');
  const r = await gh('/repos/' + cfg.repo + '/issues/' + cfg.issue, token, f);
  const j = (await r.json()) as { labels?: Array<{ name?: string } | string> };
  return (j.labels || []).some((l) => (typeof l === 'string' ? l : l.name) === cfg.label);
}
export async function setPaused(cfg: ControlCfg, token: string, paused: boolean, f: F = fetch): Promise<boolean> {
  if (!isRepo(cfg.repo)) throw new GhError(400, 'bad_repo');
  const base = '/repos/' + cfg.repo + '/issues/' + cfg.issue + '/labels';
  if (paused) await gh(base, token, f, { method: 'POST', body: JSON.stringify({ labels: [cfg.label] }) });
  else {
    try { await gh(base + '/' + encodeURIComponent(cfg.label), token, f, { method: 'DELETE' }) }
    catch (e) { if (!(e instanceof GhError) || e.code !== 'no_access') throw e }   // already absent: GitHub answers 404
  }
  return getPaused(cfg, token, f);
}
