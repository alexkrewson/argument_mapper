-- Two-person debates, step 2: whose turn it is, held by the server.
--
-- debates.turn_side is null for a solo debate and 'a'|'b' once a second
-- member joins (the invite step sets it). debates.version goes up on every
-- save through submit_turn, so a tab holding an old copy of the map is told
-- so instead of overwriting the other person's turn.
--
-- submit_turn is the only way to write a shared debate: the "Creators update
-- debates" policy now admits solo debates only. Solo debates keep their
-- direct UPDATE path, unchanged, so one person with two tabs open sees no
-- difference. submit_turn also accepts a solo debate (no turn check there),
-- which is how its version check is tested with a single account.
--
-- Title, theme and speaker names are only changed on your turn (Alex,
-- 2026-10-22), so they travel with the map here rather than on a side path.
-- A null p_map_data keeps every field and only passes the turn: Skip Turn.

begin;

alter table argument_mapper.debates
  add column if not exists turn_side text check (turn_side in ('a', 'b')),
  add column if not exists version   integer not null default 0;

create or replace function argument_mapper.submit_turn(
  p_debate_id        uuid,
  p_expected_version integer,
  p_map_data         jsonb,
  p_title            text,
  p_theme_key        text,
  p_speaker_a        text,
  p_speaker_b        text,
  p_pass_turn        boolean
)
returns table (version integer, turn_side text)
language plpgsql
security definer
set search_path = argument_mapper, pg_temp
as $$
declare
  my_side text;
  d       argument_mapper.debates%rowtype;
begin
  select m.side into my_side
  from argument_mapper.debate_members m
  where m.debate_id = p_debate_id and m.user_id = auth.uid();
  if my_side is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  select * into d from argument_mapper.debates where id = p_debate_id for update;

  if d.turn_side is not null and d.turn_side <> my_side then
    raise exception 'not_your_turn';
  end if;
  if d.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  return query
  update argument_mapper.debates t set
    map_data   = coalesce(p_map_data, t.map_data),
    title      = case when p_map_data is null then t.title     else coalesce(p_title, t.title) end,
    theme_key  = case when p_map_data is null then t.theme_key else p_theme_key end,
    speaker_a  = case when p_map_data is null then t.speaker_a else p_speaker_a end,
    speaker_b  = case when p_map_data is null then t.speaker_b else p_speaker_b end,
    version    = t.version + 1,
    updated_at = now(),
    turn_side  = case
                   when p_pass_turn and t.turn_side = 'a' then 'b'
                   when p_pass_turn and t.turn_side = 'b' then 'a'
                   else t.turn_side
                 end
  where t.id = p_debate_id
  returning t.version, t.turn_side;
end;
$$;

revoke execute on function argument_mapper.submit_turn(uuid, integer, jsonb, text, text, text, text, boolean) from public;
grant  execute on function argument_mapper.submit_turn(uuid, integer, jsonb, text, text, text, text, boolean) to authenticated, service_role;

drop policy if exists "Creators update debates" on argument_mapper.debates;
create policy "Creators update debates"
  on argument_mapper.debates for update
  using (auth.uid() = user_id and turn_side is null)
  with check (auth.uid() = user_id and turn_side is null);

-- Self-check: no debate is shared yet, so every one must still be solo, and
-- the update policy must be the new one. Raising rolls back everything.
do $$
declare
  shared_n int;
  qual     text;
begin
  select count(*) into shared_n from argument_mapper.debates where turn_side is not null;
  if shared_n > 0 then
    raise exception 'ROLLED BACK: % debate(s) already have a turn_side', shared_n;
  end if;

  select p.qual into qual from pg_policies p
  where p.schemaname = 'argument_mapper' and p.tablename = 'debates'
    and p.policyname = 'Creators update debates';
  if qual is null or qual not like '%turn_side IS NULL%' then
    raise exception 'ROLLED BACK: update policy is not the solo-only one: %', qual;
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';
