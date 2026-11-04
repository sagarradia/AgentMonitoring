/* GitHub reads and one write, for the ticket feed and the real pause switch. The token comes from the
   environment and never reaches the browser or a log. Every function takes `f` so tests can pass a fake fetch. */
import type { Store } from './store';
import { applyIssues, issueOf, type Issue } from '../feed';
import type { Agent } from '../types';

type F = typeof fetch;
import { safeUrl } from '../org';
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

export interface RepoFeed { site?: string; ok: boolean; error?: string; issues?: number; matched?: number; updated?: number; openPRs?: number; unmatched?: number; needsHuman?: number[] }
export interface FeedDoc { fetchedAt: number; repos: Record<string, RepoFeed> }

/** The live website of a repo: the homepage set on GitHub, else the address of its latest deployment (Vercel reports there). */
export async function discoverSite(repo: string, token: string, f: F = fetch): Promise<string> {
  try {
    const r = await (await gh('/repos/' + repo, token, f)).json() as { homepage?: string };
    const home = safeUrl(r.homepage);
    if (home) return home;
    const dep = await (await gh('/repos/' + repo + '/deployments?per_page=1', token, f)).json() as Array<{ id?: number }>;
    if (!Array.isArray(dep) || !dep[0]?.id) return '';
    const st = await (await gh('/repos/' + repo + '/deployments/' + dep[0].id + '/statuses?per_page=1', token, f)).json() as Array<{ environment_url?: string; target_url?: string }>;
    return (Array.isArray(st) && st[0] && (safeUrl(st[0].environment_url) || safeUrl(st[0].target_url))) || '';
  } catch { return '' }
}

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
      feed.repos[repo] = { site: await discoverSite(repo, token, f), ok: true, issues: issues.filter((i) => !i.pr).length, matched: res.matched, updated: res.updated, openPRs: res.openPRs, unmatched: res.unmatchedIssues, needsHuman: res.needsHuman };
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

/* Per-agent pause: one label per agent on the same Agent control issue, named `agent-paused:<key>`.
   This puts each decision where the agents already look. Whether a given agent obeys it depends on its role file. */
export const AGENT_PREFIX = 'agent-paused:';
export const isAgentKey = (k: unknown): k is string => typeof k === 'string' && /^[a-z0-9][a-z0-9_-]{0,59}$/i.test(k);
export async function getControl(cfg: ControlCfg, token: string, f: F = fetch): Promise<{ paused: boolean; agents: string[] }> {
  if (!isRepo(cfg.repo)) throw new GhError(400, 'bad_repo');
  const r = await gh('/repos/' + cfg.repo + '/issues/' + cfg.issue, token, f);
  const j = (await r.json()) as { labels?: Array<{ name?: string } | string> };
  const names = (j.labels || []).map((l) => (typeof l === 'string' ? l : l.name) || '');
  return { paused: names.includes(cfg.label), agents: names.filter((n) => n.startsWith(AGENT_PREFIX)).map((n) => n.slice(AGENT_PREFIX.length)) };
}
export async function setAgentPaused(cfg: ControlCfg, token: string, key: string, paused: boolean, f: F = fetch) {
  if (!isRepo(cfg.repo)) throw new GhError(400, 'bad_repo');
  if (!isAgentKey(key)) throw new GhError(400, 'bad_agent');
  const base = '/repos/' + cfg.repo + '/issues/' + cfg.issue + '/labels';
  if (paused) await gh(base, token, f, { method: 'POST', body: JSON.stringify({ labels: [AGENT_PREFIX + key] }) });
  else {
    try { await gh(base + '/' + encodeURIComponent(AGENT_PREFIX + key), token, f, { method: 'DELETE' }) }
    catch (e) { if (!(e instanceof GhError) || e.code !== 'no_access') throw e }
  }
  return getControl(cfg, token, f);
}
