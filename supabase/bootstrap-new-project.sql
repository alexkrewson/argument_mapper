-- ============================================================================
-- iDisagree — bootstrap the NEW dedicated Supabase project (2026-08-01)
--
-- RUN THIS IN THE NEW PROJECT ONLY. Not the keeper (ycuuxnscbxiibsnefgef).
--
-- Derived from supabase/migrations/20260724151739_consolidate_to_argument_mapper_schema.sql
-- plus 20260724160038_raise_starter_credits.sql, combined so the ordering
-- cannot go wrong. 20260605000000_credits.sql is deliberately NOT included --
-- it creates objects in `public` for the retired project.
--
-- The starter-credit default is 200.0 ($2.00) HERE, not 50.0. The consolidation
-- migration creates the column at 50.0 and a later migration raises it; running
-- only the first would silently give every new signup $0.50 and undo the
-- headroom the closed-testing cohort depends on.
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

-- credits_cents default is 200.0 ($2.00) -- see header.
create table if not exists argument_mapper.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  credits_cents numeric(12, 6) not null default 200.0,
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

-- Belt and braces: if the table already existed from a partial run, make sure
-- the default is the raised one rather than the original 50.0.
alter table argument_mapper.profiles alter column credits_cents set default 200.0;

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
-- Signup trigger. In THIS project auth.users backs one app only, so the
-- function inserts one row and that is the whole story.
--
-- (The keeper project's version was long documented as also inserting into
-- comment_cluster.profiles. It never did -- verified 2026-08-01 by dumping the
-- live definition. Analyzer creates its own rows lazily in
-- getOrCreateProfile(). Noted here so the false claim doesn't get copied
-- forward a third time.)
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
-- Exposed schemas does NOT grant anon/authenticated/service_role any
-- privileges on it -- that's this separate step. Without it every request 403s
-- with "permission denied for schema argument_mapper". This is the step the
-- 2026-07-24 consolidation had to fix by hand after the fact.
-- ----------------------------------------------------------------------------
grant usage on schema argument_mapper to anon, authenticated, service_role;
grant all on all tables in schema argument_mapper to anon, authenticated, service_role;
grant all on all routines in schema argument_mapper to anon, authenticated, service_role;
grant all on all sequences in schema argument_mapper to anon, authenticated, service_role;
alter default privileges in schema argument_mapper grant all on tables to anon, authenticated, service_role;
alter default privileges in schema argument_mapper grant all on routines to anon, authenticated, service_role;
alter default privileges in schema argument_mapper grant all on sequences to anon, authenticated, service_role;

-- ============================================================================
-- STILL TO DO BY HAND after this runs -- no SQL equivalent:
--   Dashboard > Settings > Data API > Exposed schemas  ->  add `argument_mapper`
-- Nothing works without it.
-- ============================================================================
