-- Agent Desk schema. Run once in the Supabase SQL editor (or psql) before seeding.
-- Each collection is a table of JSON documents keyed by the page's own ids.
-- Row Level Security is on with no policies, so the anon and authenticated keys can read or
-- write nothing. Only the server, using the service role key, reaches these tables.

create table if not exists public.agents (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.chats (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.meta (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.agents   enable row level security;
alter table public.projects enable row level security;
alter table public.chats    enable row level security;
alter table public.meta     enable row level security;

-- Supabase roles. Guarded so the file also runs on a plain Postgres for local checks.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.agents, public.projects, public.chats, public.meta from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.agents, public.projects, public.chats, public.meta to service_role;
  end if;
end $$;
