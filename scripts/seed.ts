/* Loads seed.json into the store: every agent into "agents" (keyed by agent id) and every
   project into "projects" (keyed by project id).
   Usage:  npm run seed [-- path/to/seed.json] [-- --force]
   Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or DB_DRIVER=file for local development.
   Existing documents are left alone unless --force is given, so re-running is safe. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { storeFromEnv } from '../lib/server/store';
import { seedDocs } from '../lib/seed';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const file = path.resolve(args.find((a) => !a.startsWith('--')) || 'seed.json');
  const seed = JSON.parse(readFileSync(file, 'utf8'));
  const { agents, projects } = seedDocs(seed);
  const store = storeFromEnv();
  let wrote = 0, kept = 0;
  for (const [c, docs] of [['agents', agents], ['projects', projects]] as const) {
    const existing = new Set((await store.list(c)).map((d) => d.id));
    for (const [id, data] of Object.entries(docs)) {
      if (existing.has(id) && !force) { kept++; continue }
      await store.put(c, id, data);
      wrote++;
    }
  }
  console.log(`Seeded ${Object.keys(agents).length} agents and ${Object.keys(projects).length} projects: ${wrote} written, ${kept} already present (use --force to overwrite).`);
}

main().catch((e) => { console.error('Seed failed: ' + (e instanceof Error ? e.message : String(e))); process.exit(1) });
