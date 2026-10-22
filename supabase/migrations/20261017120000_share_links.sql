-- View-only share links (collaboration stage 1).
--
-- The owner turns a link on for one debate; anyone holding it can watch the
-- map without an account, and nobody but the owner can change it. Turning the
-- link off (share_token = null) kills it, and turning it on again makes a NEW
-- token, so a link once leaked stays dead.
--
-- Why a function and not a policy: an anon viewer has no auth.uid() to match,
-- and a "select where share_token is not null" policy would let anon list
-- every shared debate. The function answers only for the exact token asked
-- about, and returns only what the viewer page draws — never user_id.
--
-- The owner sets and clears share_token through the existing "Users own their
-- debates" policy. The client generates the token (crypto.randomUUID, 122
-- random bits); an owner choosing a weak one could only expose their own map.

alter table argument_mapper.debates
  add column if not exists share_token uuid unique;

create or replace function argument_mapper.get_shared_debate(p_token uuid)
returns table (
  title      text,
  map_data   jsonb,
  theme_key  text,
  speaker_a  text,
  speaker_b  text
)
language sql
stable
security definer
set search_path = argument_mapper, pg_temp
as $$
  select d.title, d.map_data, d.theme_key, d.speaker_a, d.speaker_b
  from argument_mapper.debates d
  where p_token is not null and d.share_token = p_token;
$$;

-- 20260926120000 stopped new functions being granted by default, so this one
-- is granted on purpose: viewers are signed out, so anon needs it.
revoke execute on function argument_mapper.get_shared_debate(uuid) from public;
grant  execute on function argument_mapper.get_shared_debate(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
