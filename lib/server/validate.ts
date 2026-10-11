import { COLLECTIONS, type Collection } from '../types';

export function isCollection(c: string): c is Collection { return (COLLECTIONS as readonly string[]).includes(c) }
/** Document ids: agent ids like "a_xyz" or "fv_role", repo ids like "owner__repo", "repos" for meta. */
export function isDocId(id: string): boolean { return /^[A-Za-z0-9._-]{1,200}$/.test(id) }
export function isPlainObject(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v) }
export const MAX_DOC_BYTES = 512 * 1024;
