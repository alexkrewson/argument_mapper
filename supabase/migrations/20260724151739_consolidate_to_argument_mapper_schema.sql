-- ============================================================================
-- Supabase project consolidation (2026-07-24): argument_mapper moved from its
-- own dedicated project (rctaosokjpwdkuewmvyc) into a schema
-- (`argument_mapper`) inside a shared keeper project (ycuuxnscbxiibsnefgef,
-- "trolleysolution"), alongside comment_cluster_claude and packing_lists.
-- Merging 3 projects into 1 dropped Supabase billing from ~$43/mo to ~$25/mo.
--
-- This migration was already applied by hand against the keeper project (SQL
-- editor + a follow-up grants fix) during the consolidation. It's written
-- here, idempotently, so `supabase/migrations` reflects reality and a fresh
-- `supabase db push` against the keeper project is a safe no-op rather than
-- erroring on objects that already exist.
--
-- The previous migration (20260605000000_credits.sql) created these same
-- objects under `public` in the old, now-retired project — it's left as-is
-- for history; this migration supersedes it going forward.
-- ============================================================================

create schema if not exists argument_mapper;

create table if not exists argument_mapper.debates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  map_data   jsonb not null,
  theme_key  text,
  speaker_a  text,
  speaker_b  text
);

alter table argument_mapper.debates enable row level security;

drop policy if exists "Users own their debates" on argument_mapper.debates;
create policy "Users own their debates"
  on argument_mapper.debates for all
  using (auth.uid() = user_id);

create table if not exists argument_mapper.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  credits_cents numeric(12, 6) not null default 50.0,
  created_at    timestamptz not null default now()
);

alter table argument_mapper.profiles enable row level security;

drop policy if exists "Users can view own profile" on argument_mapper.profiles;
create policy "Users can view own profile"
  on argument_mapper.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on argument_mapper.profiles;
create policy "Users can update own profile"
  on argument_mapper.profiles for update
  using (auth.uid() = id);

create or replace function argument_mapper.deduct_credits(p_user_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
as $$
declare
  new_balance numeric;
begin
  update argument_mapper.profiles
  set credits_cents = credits_cents - p_amount
  where id = p_user_id
  returning credits_cents into new_balance;
  return coalesce(new_balance, 0);
end;
$$;

create or replace function argument_mapper.add_credits(p_user_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
as $$
declare
  new_balance numeric;
begin
  update argument_mapper.profiles
  set credits_cents = credits_cents + p_amount
  where id = p_user_id
  returning credits_cents into new_balance;

  if not found then
    insert into argument_mapper.profiles (id, credits_cents)
    values (p_user_id, p_amount)
    returning credits_cents into new_balance;
  end if;

  return coalesce(new_balance, 0);
end;
$$;

-- ----------------------------------------------------------------------------
-- Shared signup trigger. Auth is per-project, not per-schema, so this project
-- now backs multiple apps' logins with one auth.users table. This function
-- grants starter credits in argument_mapper.profiles (and, in the keeper
-- project's actual deployed version, comment_cluster.profiles too) for every
-- new signup regardless of which app the person signed up through. That
-- cross-app grant is defined in comment_cluster_claude's own migrations, not
-- here — this repo only owns the argument_mapper.profiles insert below.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into argument_mapper.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- PostgREST grants. Exposing a schema via Dashboard > Settings > Data API >
-- Exposed schemas does NOT grant the anon/authenticated/service_role roles
-- any privileges on it -- that's this separate step. Without it, every
-- request 403s with "permission denied for schema argument_mapper".
-- ----------------------------------------------------------------------------
grant usage on schema argument_mapper to anon, authenticated, service_role;
grant all on all tables in schema argument_mapper to anon, authenticated, service_role;
grant all on all routines in schema argument_mapper to anon, authenticated, service_role;
grant all on all sequences in schema argument_mapper to anon, authenticated, service_role;
alter default privileges in schema argument_mapper grant all on tables to anon, authenticated, service_role;
alter default privileges in schema argument_mapper grant all on routines to anon, authenticated, service_role;
alter default privileges in schema argument_mapper grant all on sequences to anon, authenticated, service_role;

-- Note: the `argument_mapper` schema must also be added to
-- Dashboard > Settings > Data API > Exposed schemas by hand -- that toggle
-- has no SQL equivalent. (Already done for the keeper project as of
-- 2026-07-24.)
