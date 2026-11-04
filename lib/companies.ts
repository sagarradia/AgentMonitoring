/* A company recorded in this app (no GitHub repo is created). Stored in meta/org under companies[id]. */
import { cleanRate } from './budget';
import { safeUrl } from './org';

export interface CompanyRec { name: string; site?: string; purpose?: string; custom: true; createdAt: number }

export function slug(name: string): string {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

/** Returns the new id, record and optional rupee rate, or a plain-language problem. */
export function newCompany(raw: Record<string, unknown>, taken: string[], now = Date.now()): { id: string; rec: CompanyRec; rate?: number } | string {
  const name = String(raw.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) return 'Give the company a name';
  if (name.length > 40) return 'Keep the name under 40 characters';
  const s = slug(name);
  if (!s) return 'Use letters or numbers in the name';
  const id = 'co_' + s;
  if (taken.some((t) => t.toLowerCase() === id || t.toLowerCase().endsWith('/' + s) || t.toLowerCase().endsWith('__' + s))) return 'A company with that name already exists';
  const siteIn = String(raw.site || '').trim();
  const site = safeUrl(siteIn);
  if (siteIn && !site) return 'Use a web address that starts with https://';
  const purpose = String(raw.purpose || '').trim().slice(0, 200);
  const rate = cleanRate(raw.rate);
  const rec: CompanyRec = { name, custom: true, createdAt: now };
  if (site) rec.site = site;
  if (purpose) rec.purpose = purpose;
  return { id, rec, rate };
}
