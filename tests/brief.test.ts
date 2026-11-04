import { describe, expect, it } from 'vitest';
import { buildBrief, digest, scrub } from '@/lib/server/brief';
import { GhError } from '@/lib/server/github';

const b64 = (s: string) => Buffer.from(s).toString('base64');
const README = '# Synthetic App\n\nA savings app for families.\n\n## Goals\nHelp families keep documents ready.\n\n## Changelog\nnoise noise\n\n## Principles\n1. Privacy first.\ntoken = abcdefghijkl1234\n';
function fake(map: Record<string, unknown>) {
  return (async (url: string) => {
    const k = String(url).replace('https://api.github.com/repos/o/r/contents', '').replace(/^\//, '');
    if (!(k in map)) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(map[k]), { status: 200 });
  }) as unknown as typeof fetch;
}
describe('draft brief from a repo', () => {
  it('keeps purpose, goals and rules, drops the rest, removes secret-looking lines', () => {
    const d = digest('README.md', README);
    expect(d).toContain('Synthetic App'); expect(d).toContain('Help families keep documents ready');
    expect(d).toContain('Privacy first'); expect(d).not.toContain('noise');
    expect(d).not.toContain('abcdefghijkl1234'); expect(scrub('ghp_' + 'a'.repeat(30))).toMatch(/removed/);
  });
  it('collects the right files in order and lists its sources', async () => {
    const f = fake({
      '': [{ type: 'file', path: 'README.md' }, { type: 'file', path: 'CLAUDE.md' }, { type: 'file', path: 'package.json' }, { type: 'dir', path: 'docs' }],
      docs: [{ type: 'file', path: 'docs/README.md' }, { type: 'file', path: 'docs/notes.md' }],
      'README.md': { content: b64(README), encoding: 'base64', size: 100 },
      'CLAUDE.md': { content: b64('# Rules\n\n## Non-negotiable principles\nNo secrets.'), encoding: 'base64', size: 50 },
      'docs/README.md': { content: b64('# Docs\n\nIndex of the documents.'), encoding: 'base64', size: 40 },
    });
    const r = await buildBrief('o/r', 't', f, 1);
    expect(r.sources.map((s) => s.path)).toEqual(['README.md', 'CLAUDE.md', 'docs/README.md']);
    expect(r.brief).toContain('Draft brief for o/r'); expect(r.brief).toContain('No secrets');
  });
  it('says so when the token cannot see the repo or nothing useful is there', async () => {
    await expect(buildBrief('o/r', 't', fake({}))).rejects.toBeInstanceOf(GhError);
    await expect(buildBrief('o/r', 't', fake({ '': [{ type: 'file', path: 'package.json' }] }))).rejects.toMatchObject({ code: 'nothing_found' });
    await expect(buildBrief('../x', 't', fake({}))).rejects.toBeInstanceOf(GhError);
  });
});
