/* Document shapes stored in the agents, projects, chats and meta collections.
   They match the shapes the original single-page app wrote; extra fields are kept as-is. */

export type Collection = 'agents' | 'projects' | 'chats' | 'meta';
export const COLLECTIONS: readonly Collection[] = ['agents', 'projects', 'chats', 'meta'];

export interface Repo { full_name: string; url: string; pushed_at: string; visibility: string }

export interface Goal { text: string; horizon?: string; done?: boolean; due?: string; note?: string }
export interface Kra { area: string; outcome: string; weight: number }
export interface Kpi { name: string; target: number | null; unit?: string; cadence?: string; dir?: 'up' | 'down'; current?: number | null; due?: string; note?: string }
export type TodoStatus = 'todo' | 'doing' | 'done';
export interface Todo { text: string; status?: TodoStatus; due?: string; note?: string }
export interface Routine { name: string; cadence?: string; state?: 'planned' | 'on' | 'paused'; next?: string; note?: string }
export interface MemoryNote { text: string; at?: string; src?: string }
export interface DocRef { title: string; path?: string; note?: string }
export interface Skill { name: string; note?: string }

export interface Agent {
  id: string;
  projectId: string;
  name: string;
  role: string;
  reportsTo?: string;
  status?: 'active' | 'paused' | 'draft';
  level?: string;
  purpose?: string;
  task?: string;
  autonomy?: string;
  responsibilities?: string[];
  requirements?: string[];
  tools?: string[];
  may?: string[];
  mustNot?: string[];
  handsOff?: string;
  reads?: string;
  goals?: Goal[];
  kras?: Kra[];
  kpis?: Kpi[];
  todos?: Todo[];
  routines?: Routine[];
  memory?: MemoryNote[];
  docs?: DocRef[];
  skills?: Skill[];
  source?: string;
  sourceFile?: string;
  example?: boolean;
  createdAt?: number;
  [extra: string]: unknown;
}

export interface Project { brief?: string; [extra: string]: unknown }
export interface ChatMessage { role: 'founder' | 'agent'; text: string; ts?: number }
export interface Chat { messages: ChatMessage[]; agentId?: string; updatedAt?: number }
export interface ReposMeta { items: Repo[]; syncedAt: number | null }

export interface Turn { role: 'user' | 'assistant'; content: string }
