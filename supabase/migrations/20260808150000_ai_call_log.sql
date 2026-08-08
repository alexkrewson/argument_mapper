-- Diagnostics for AI calls, so the next stall is readable instead of inferred.
--
-- On 2026-08-08 twenty-two costly tests died with no response, nothing charged
-- and nothing logged. The function's own logs show only worker boot/shutdown, so
-- there was no way to tell a rate limit from a hung connection from a slow
-- generation -- and I guessed wrong once already. This records what actually
-- happened on each call.
--
-- METADATA ONLY, NEVER CONTENT. People paste real arguments into this app; the
-- same rule the Sentry setup follows (no console, dom or ui breadcrumbs, see
-- public/privacy.html) applies here. Nothing in this table can reconstruct what
-- anyone typed -- only how the call to Anthropic behaved.
create table if not exists argument_mapper.ai_call_log (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  user_id      uuid references auth.users(id) on delete cascade,
  status       int,                 -- Anthropic's HTTP status, null if it never answered
  duration_ms  int,                 -- how long the upstream call actually took
  attempts     int,                 -- 1 unless a 529 or a timeout forced a retry
  outcome      text,                -- 'ok' | 'timeout' | 'http_error' | 'exception'
  input_tokens int,
  output_tokens int,
  -- Anthropic returns its quota state on every response. This is the field that
  -- would have answered "is it rate limiting?" without any guessing.
  ratelimit    jsonb
);

create index if not exists ai_call_log_created_at_idx
  on argument_mapper.ai_call_log (created_at desc);

alter table argument_mapper.ai_call_log enable row level security;

-- Same shape as the other policies here: you see your own rows. The suite runs
-- as the test account, so its stalls are readable with credentials that already
-- exist rather than needing a new one.
drop policy if exists "Users can view own ai call log" on argument_mapper.ai_call_log;
create policy "Users can view own ai call log"
  on argument_mapper.ai_call_log for select
  using (auth.uid() = user_id);

grant select on argument_mapper.ai_call_log to authenticated;
grant usage, select on sequence argument_mapper.ai_call_log_id_seq to service_role;
