-- profiles table: per-user credit balance
create table if not exists public.profiles (
  id            uuid        references auth.users(id) on delete cascade primary key,
  credits_cents numeric(12, 6) not null default 50.0,  -- $0.50 starter credits
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create profile with starter credits on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Deduct credits (called by claude-proxy after successful Anthropic call)
create or replace function public.deduct_credits(p_user_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
as $$
declare
  new_balance numeric;
begin
  update public.profiles
  set credits_cents = credits_cents - p_amount
  where id = p_user_id
  returning credits_cents into new_balance;
  return coalesce(new_balance, 0);
end;
$$;

-- Add credits (called by stripe-webhook after payment)
create or replace function public.add_credits(p_user_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
as $$
declare
  new_balance numeric;
begin
  update public.profiles
  set credits_cents = credits_cents + p_amount
  where id = p_user_id
  returning credits_cents into new_balance;

  if not found then
    insert into public.profiles (id, credits_cents)
    values (p_user_id, p_amount)
    returning credits_cents into new_balance;
  end if;

  return coalesce(new_balance, 0);
end;
$$;
