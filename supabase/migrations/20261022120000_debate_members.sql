-- Two-person debates, step 1: who belongs to a debate (stage 2 plan in
-- maintenance_todo.txt, 2026-10-22).
--
-- A debate's members are its owners, equally; debates.user_id is only who
-- created it. This step adds the table and lets members SEE a debate. It
-- changes nothing anyone can do yet: every existing debate is backfilled with
-- its creator as side 'a', and nothing can add a second member until the
-- invite step. Writes still go by user_id, unchanged, until submit_turn
-- (step 2) and leaving (step 5) replace them.
--
-- One transaction, and it checks itself at the end: if any debate is left
-- without its creator as a member, or debates carries a policy this file
-- doesn't know about, the whole thing rolls back and nothing has changed.

begin;

create table if not exists argument_mapper.debate_members (
  debate_id  uuid not null references argument_mapper.debates(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  side       text not null check (side in ('a', 'b')),
  joined_at  timestamptz not null default now(),
  primary key (debate_id, user_id),
  unique (debate_id, side)
);

create index if not exists debate_members_user_id_idx
  on argument_mapper.debate_members (user_id);

-- Security definer so policies can ask "is this a member?" without the
-- debate_members policy below recursing into itself.
create or replace function argument_mapper.is_debate_member(p_debate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = argument_mapper, pg_temp
as $$
  select exists (
    select 1 from argument_mapper.debate_members m
    where m.debate_id = p_debate_id and m.user_id = auth.uid()
  );
$$;

revoke execute on function argument_mapper.is_debate_member(uuid) from public;
grant  execute on function argument_mapper.is_debate_member(uuid) to authenticated, service_role;

-- Members see their own row and their partner's (History will name the
-- partner). Clients never write here directly: the trigger below and the
-- later invite/leave functions are the only writers.
alter table argument_mapper.debate_members enable row level security;

drop policy if exists "Members see a debate's members" on argument_mapper.debate_members;
create policy "Members see a debate's members"
  on argument_mapper.debate_members for select
  using (argument_mapper.is_debate_member(debate_id));

-- The schema's default privileges hand new tables to anon; take that back.
revoke all on argument_mapper.debate_members from anon, authenticated;
grant select on argument_mapper.debate_members to authenticated;
grant all    on argument_mapper.debate_members to service_role;

-- Every new debate starts with its creator as side 'a'.
create or replace function argument_mapper.add_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = argument_mapper, pg_temp
as $$
begin
  insert into argument_mapper.debate_members (debate_id, user_id, side)
  values (new.id, new.user_id, 'a')
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function argument_mapper.add_creator_as_member() from public;

drop trigger if exists debates_add_creator_as_member on argument_mapper.debates;
create trigger debates_add_creator_as_member
  after insert on argument_mapper.debates
  for each row execute function argument_mapper.add_creator_as_member();

-- Backfill: every existing debate, its creator as side 'a'.
insert into argument_mapper.debate_members (debate_id, user_id, side, joined_at)
select d.id, d.user_id, 'a', d.created_at
from argument_mapper.debates d
on conflict do nothing;

-- The old single "for all" policy becomes four. SELECT also admits members;
-- the creator clause stays so INSERT ... RETURNING sees the new row before
-- the trigger's member row is visible to the policy check. INSERT, UPDATE
-- and DELETE are exactly what they were.
drop policy if exists "Users own their debates" on argument_mapper.debates;
drop policy if exists "Members read their debates" on argument_mapper.debates;
drop policy if exists "Creators insert debates" on argument_mapper.debates;
drop policy if exists "Creators update debates" on argument_mapper.debates;
drop policy if exists "Creators delete debates" on argument_mapper.debates;

create policy "Members read their debates"
  on argument_mapper.debates for select
  using (auth.uid() = user_id or argument_mapper.is_debate_member(id));

create policy "Creators insert debates"
  on argument_mapper.debates for insert
  with check (auth.uid() = user_id);

create policy "Creators update debates"
  on argument_mapper.debates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Creators delete debates"
  on argument_mapper.debates for delete
  using (auth.uid() = user_id);

-- Self-check. Raising here rolls back everything above.
do $$
declare
  missing    int;
  debates_n  int;
  members_n  int;
  unknown    text;
begin
  select count(*) into missing
  from argument_mapper.debates d
  where not exists (
    select 1 from argument_mapper.debate_members m
    where m.debate_id = d.id and m.user_id = d.user_id and m.side = 'a'
  );
  if missing > 0 then
    raise exception 'ROLLED BACK: % debate(s) have no creator membership', missing;
  end if;

  select string_agg(policyname, ', ') into unknown
  from pg_policies
  where schemaname = 'argument_mapper' and tablename = 'debates'
    and policyname not in ('Members read their debates', 'Creators insert debates',
                           'Creators update debates', 'Creators delete debates');
  if unknown is not null then
    raise exception 'ROLLED BACK: debates has policies this migration did not expect: %', unknown;
  end if;

  select count(*) into debates_n from argument_mapper.debates;
  select count(*) into members_n from argument_mapper.debate_members;
  raise notice 'OK: % debates, % memberships', debates_n, members_n;
end;
$$;

commit;

notify pgrst, 'reload schema';
