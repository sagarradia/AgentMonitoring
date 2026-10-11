/* Turns seed.json into documents. Projects may be keyed by project id ({ "<owner>__<repo>":
   { brief } }); a bare { brief } (as in the shipped seed.json) is assigned to the project most
   of the seed's agents belong to. */
import type { Agent, Project } from './types';

export function seedDocs(seed: { agents?: Agent[]; projects?: Record<string, unknown> }) {
  const agents: Record<string, Agent> = {};
  for (const a of seed.agents || []) {
    if (!a || typeof a.id !== 'string' || !a.id) throw new Error('every seed agent needs an id');
    agents[a.id] = a;
  }
  const projects: Record<string, Project> = {};
  const p = seed.projects || {};
  if (typeof p.brief === 'string') {
    const tally: Record<string, number> = {};
    for (const a of Object.values(agents)) tally[a.projectId] = (tally[a.projectId] || 0) + 1;
    const main = Object.entries(tally).sort((x, y) => y[1] - x[1])[0]?.[0];
    if (main) projects[main] = { brief: p.brief };
  } else {
    for (const [id, v] of Object.entries(p)) if (v && typeof v === 'object') projects[id] = v as Project;
  }
  return { agents, projects };
}
