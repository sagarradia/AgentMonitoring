import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { frontmatter, readUpload, readZip, scan } from '../lib/pkg';

function zip(files: Record<string, string>, deflate = true): ArrayBuffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const nm = Buffer.from(name), raw = Buffer.from(text), data = deflate ? deflateRawSync(raw) : raw, method = deflate ? 8 : 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  const all = Buffer.concat([...parts, cd, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length) as ArrayBuffer;
}

const SKILL = '---\nname: pdf-reader\ndescription: >\n  Reads PDF files\n  and extracts text.\n---\n# PDF\nBody text';

describe('frontmatter', () => {
  it('reads plain and folded values', () => {
    expect(frontmatter(SKILL).data).toEqual({ name: 'pdf-reader', description: 'Reads PDF files and extracts text.' });
  });
  it('copes with no frontmatter', () => expect(frontmatter('# Hi').data).toEqual({}));
});

describe('zip and scan', () => {
  it('finds a skill in a deflated zip and ignores everything else', async () => {
    const up = await readZip(zip({ 'repo/skills/pdf/SKILL.md': SKILL, 'repo/README.md': 'x', 'repo/src/a.js': 'evil()' }));
    expect(up.error).toBeUndefined();
    const c = scan(up, 'repo.zip');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'skill', name: 'pdf-reader', what: 'Reads PDF files and extracts text.', source: 'repo.zip' });
    expect(c[0].body).toContain('Body text');
  });
  it('reads a stored (uncompressed) entry', async () => {
    const up = await readUpload('x.skill', zip({ 'SKILL.md': SKILL }, false));
    expect(scan(up, 'x.skill')[0].name).toBe('pdf-reader');
  });
  it('lists a plugin with what it holds, and does not list its skills twice', async () => {
    const up = await readZip(zip({
      'p/.claude-plugin/plugin.json': JSON.stringify({ name: 'toolbox', description: 'Handy', version: '1.2.0' }),
      'p/skills/a/SKILL.md': SKILL, 'p/skills/b/SKILL.md': SKILL, 'p/commands/go.md': '# go',
    }));
    const c = scan(up, 'p.zip');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'plugin', name: 'toolbox', version: '1.2.0' });
    expect(c[0].contains?.join(' ')).toMatch(/2 skills/);
    expect(c[0].contains?.join(' ')).toMatch(/1 command/);
  });
  it('keeps only the name of a connector, never its command or keys', async () => {
    const t = JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', 'srv'], env: { TOKEN: 'ghp_secret' } } } });
    const c = scan(await readUpload('.mcp.json', new TextEncoder().encode(t).buffer as ArrayBuffer), 'f');
    expect(c).toHaveLength(1);
    expect(JSON.stringify(c)).not.toMatch(/ghp_secret|npx/);
  });
  it('lists marketplace entries', () => {
    const c = scan({ files: [{ path: '.claude-plugin/marketplace.json', text: JSON.stringify({ plugins: [{ name: 'one' }, { name: 'two', description: 'd' }] }) }], paths: [], skipped: 0 }, 'm');
    expect(c.map((x) => x.name)).toEqual(['one', 'two']);
  });
  it('rejects a file that is not a zip', async () => {
    expect((await readZip(new TextEncoder().encode('hello world, not a zip file at all').buffer as ArrayBuffer)).error).toBeTruthy();
  });
});
