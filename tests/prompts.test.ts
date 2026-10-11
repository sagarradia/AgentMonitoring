import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { agentBrief, chatTurns } from '@/lib/prompts';
import { seedDocs } from '@/lib/seed';
import type { Agent } from '@/lib/types';

const seed = JSON.parse(readFileSync('seed.json', 'utf8'));
const original = readFileSync('agent-desk.html', 'utf8');

describe('agentBrief', () => {
  const a = seed.agents[0] as Agent;
  const text = agentBrief([], a, 'Brief text');

  it('keeps every honesty rule from the original page word for word', () => {
    const block = original.slice(original.indexOf("+'Rules:\\n'"), original.indexOf("+'Today is '"));
    const rules = [...block.matchAll(/\+'(- [^'\\]*)\\n/g)].map((m) => m[1]);
    expect(rules.length).toBe(6);
    expect(rules[0]).toBe('- You have no run logs and no memory of past work beyond the records below. Never claim work is done unless the records say so.');
    for (const r of rules) expect(text).toContain(r);
  });

  it('puts the brief first and the chat after it', () => {
    const t = chatTurns([], a, undefined, [{ role: 'founder', text: 'Why late?' }, { role: 'agent', text: 'Because' }, { role: 'founder', text: 'When?' }]);
    expect(t.map((x) => x.role)).toEqual(['user', 'user', 'assistant', 'user']);
    expect(t[0].content).toContain('You are playing the AI agent "' + a.name + '"');
  });
});

describe('seedDocs', () => {
  it('keys agents by id and attaches a bare brief to the main project', () => {
    const { agents, projects } = seedDocs(seed);
    expect(Object.keys(agents)).toHaveLength(seed.agents.length);
    expect(Object.keys(projects)).toEqual(['Skybirds-Empyrean-Avenue__familyvault']);
    expect(projects['Skybirds-Empyrean-Avenue__familyvault'].brief).toBe(seed.projects.brief);
  });
  it('keeps projects already keyed by id', () => {
    const { projects } = seedDocs({ agents: [], projects: { a__b: { brief: 'x' } } });
    expect(projects).toEqual({ a__b: { brief: 'x' } });
  });
});
