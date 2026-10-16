-- Credit purchases from two sources (Stripe on web, Google Play on Android),
-- one ledger, and one way in. Also closes the client's write access to the
-- credit balance, which the consolidation migration had left wide open.

-- ─── 1. Lockdown ─────────────────────────────────────────────────────────────
-- 20260724151739 ran `grant all on all routines/tables in schema
-- argument_mapper to anon, authenticated`, and add_credits / deduct_credits are
-- SECURITY DEFINER. Together that let anyone holding the public anon key call
--     supabase.rpc("add_credits", { p_user_id: <any id>, p_amount: 1e6 })
-- and the "Users can update own profile" policy let a signed-in user simply
-- UPDATE their own credits_cents. Nothing in the client writes profiles — every
-- write is an Edge Function using the service role — so taking both away
-- changes nothing a real user does.
revoke execute on function argument_mapper.add_credits(uuid, numeric)    from public, anon, authenticated;
revoke execute on function argument_mapper.deduct_credits(uuid, numeric) from public, anon, authenticated;
grant  execute on function argument_mapper.add_credits(uuid, numeric)    to service_role;
grant  execute on function argument_mapper.deduct_credits(uuid, numeric) to service_role;

drop policy if exists "Users can update own profile" on argument_mapper.profiles;
revoke insert, update, delete, truncate on argument_mapper.profiles from anon, authenticated;

-- The schema's default privileges would hand every FUTURE function to anon and
-- authenticated as well. Stop that, so the next SECURITY DEFINER function has
-- to be granted on purpose rather than exposed by accident.
alter default privileges in schema argument_mapper revoke execute on functions from public, anon, authenticated;

-- ─── 2. Ledger ───────────────────────────────────────────────────────────────
-- One row per money event that granted credits. The unique (source, reference)
-- is the whole point: Stripe retries webhooks and a Play purchase token can be
-- submitted again after a crash, and either must credit exactly once.
--   stripe: reference = Checkout Session id (cs_...)
--   play:   reference = purchaseToken
create table if not exists argument_mapper.credit_purchases (
  id             bigint generated always as identity primary key,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  source         text        not null check (source in ('stripe', 'play')),
  reference      text        not null,
  order_id       text,
  product_id     text,
  credits_cents  numeric(12, 6) not null check (credits_cents > 0),
  is_test        boolean     not null default false,
  created_at     timestamptz not null default now(),
  unique (source, reference)
);

alter table argument_mapper.credit_purchases enable row level security;

drop policy if exists "Users can view own purchases" on argument_mapper.credit_purchases;
create policy "Users can view own purchases"
  on argument_mapper.credit_purchases for select
  using (auth.uid() = user_id);

revoke all on argument_mapper.credit_purchases from anon, authenticated;
grant select on argument_mapper.credit_purchases to authenticated;
grant all    on argument_mapper.credit_purchases to service_role;

-- ─── 3. The one way in ───────────────────────────────────────────────────────
-- Records the purchase and credits it in one transaction, or does neither.
-- A repeat of a reference already recorded is a no-op that still returns the
-- balance, so callers can retry freely.
create or replace function argument_mapper.grant_purchase(
  p_user_id       uuid,
  p_source        text,
  p_reference     text,
  p_credits_cents numeric,
  p_order_id      text    default null,
  p_product_id    text    default null,
  p_is_test       boolean default false
)
returns table (granted boolean, balance numeric)
language plpgsql
security definer
set search_path = argument_mapper, pg_temp
as $$
declare
  v_id bigint;
begin
  insert into argument_mapper.credit_purchases
    (user_id, source, reference, order_id, product_id, credits_cents, is_test)
  values
    (p_user_id, p_source, p_reference, p_order_id, p_product_id, p_credits_cents, p_is_test)
  on conflict (source, reference) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into argument_mapper.profiles (id, credits_cents)
    values (p_user_id, p_credits_cents)
    on conflict (id) do update
      set credits_cents = argument_mapper.profiles.credits_cents + excluded.credits_cents;
  end if;

  return query
    select v_id is not null,
           coalesce((select credits_cents from argument_mapper.profiles where id = p_user_id), 0);
end;
$$;

revoke execute on function argument_mapper.grant_purchase(uuid, text, text, numeric, text, text, boolean)
  from public, anon, authenticated;
grant  execute on function argument_mapper.grant_purchase(uuid, text, text, numeric, text, text, boolean)
  to service_role;
