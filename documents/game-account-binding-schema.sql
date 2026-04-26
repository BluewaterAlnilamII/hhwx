-- Game account binding schema for hhwx.
-- Run this in Supabase SQL editor with service-role/admin privileges.

create extension if not exists pgcrypto;

create table if not exists public.user_game_bind_challenges (
  id uuid primary key default gen_random_uuid(),
  web_user_id uuid not null references auth.users(id) on delete cascade,
  game_uid text not null,
  challenge text not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.user_game_bindings (
  game_uid text primary key,
  web_user_id uuid not null references auth.users(id) on delete cascade,
  bound_at timestamptz not null default now()
);

-- Existing installations may have functions depending on the old table row type.
drop function if exists public.cleanup_old_game_bind_challenges(timestamptz);
drop function if exists public.create_game_uid_bind_challenge(uuid, text, text, timestamptz);
drop function if exists public.complete_game_uid_binding(uuid, text, uuid);
drop function if exists public.increment_game_bind_challenge_attempt(uuid, uuid);
drop function if exists public.unbind_game_uid(text, uuid);

-- Bring older installations to the lean schema.
alter table public.user_game_bind_challenges
  add column if not exists attempt_count integer not null default 0;

alter table public.user_game_bind_challenges
  add column if not exists created_at timestamptz not null default now();

alter table public.user_game_bind_challenges
  drop constraint if exists user_game_bind_challenges_status_check;

alter table public.user_game_bind_challenges
  drop constraint if exists user_game_bind_challenges_attempt_count_check;

alter table public.user_game_bind_challenges
  drop column if exists status;

alter table public.user_game_bind_challenges
  drop column if exists verified_at;

alter table public.user_game_bindings
  add column if not exists bound_at timestamptz not null default now();

alter table public.user_game_bindings
  drop column if exists challenge_id;

alter table public.user_game_bindings
  drop column if exists updated_at;

-- Normalize existing challenge data before tightening generated-code constraints.
delete from public.user_game_bind_challenges
where challenge !~ '^hhwx[a-z2-9]{8}$';

update public.user_game_bind_challenges
set attempt_count = 0
where attempt_count is null or attempt_count < 0;

alter table public.user_game_bind_challenges
  drop constraint if exists user_game_bind_challenges_challenge_check;

alter table public.user_game_bind_challenges
  add constraint user_game_bind_challenges_challenge_check
  check (challenge ~ '^hhwx[a-z2-9]{8}$');

alter table public.user_game_bind_challenges
  add constraint user_game_bind_challenges_attempt_count_check
  check (attempt_count >= 0);

create index if not exists user_game_bind_challenges_user_created_idx
  on public.user_game_bind_challenges(web_user_id, created_at desc);

create index if not exists user_game_bind_challenges_game_uid_idx
  on public.user_game_bind_challenges(game_uid);

create index if not exists user_game_bind_challenges_expires_idx
  on public.user_game_bind_challenges(expires_at);

create index if not exists user_game_bindings_user_idx
  on public.user_game_bindings(web_user_id, bound_at desc);

drop index if exists public.user_game_bind_challenges_status_idx;

alter table public.user_game_bind_challenges enable row level security;
alter table public.user_game_bindings enable row level security;

drop policy if exists "Users can read own game bind challenges" on public.user_game_bind_challenges;
drop policy if exists "Users can insert own game bind challenges" on public.user_game_bind_challenges;
drop policy if exists "Users can update own game bind challenges" on public.user_game_bind_challenges;
drop policy if exists "Users can delete own game bind challenges" on public.user_game_bind_challenges;

drop policy if exists "Users can read own game uid bindings" on public.user_game_bindings;
drop policy if exists "Users can delete own game uid bindings" on public.user_game_bindings;

create policy "Users can read own game bind challenges"
  on public.user_game_bind_challenges
  for select
  to authenticated
  using (auth.uid() = web_user_id);

create policy "Users can insert own game bind challenges"
  on public.user_game_bind_challenges
  for insert
  to authenticated
  with check (auth.uid() = web_user_id);

create policy "Users can update own game bind challenges"
  on public.user_game_bind_challenges
  for update
  to authenticated
  using (auth.uid() = web_user_id)
  with check (auth.uid() = web_user_id);

create policy "Users can delete own game bind challenges"
  on public.user_game_bind_challenges
  for delete
  to authenticated
  using (auth.uid() = web_user_id);

create policy "Users can read own game uid bindings"
  on public.user_game_bindings
  for select
  to authenticated
  using (auth.uid() = web_user_id);

create policy "Users can delete own game uid bindings"
  on public.user_game_bindings
  for delete
  to authenticated
  using (auth.uid() = web_user_id);

create or replace function public.cleanup_old_game_bind_challenges(
  p_before timestamptz default now() - interval '7 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.user_game_bind_challenges
  where created_at < p_before;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.create_game_uid_bind_challenge(
  p_web_user_id uuid,
  p_game_uid text,
  p_challenge text,
  p_expires_at timestamptz
)
returns public.user_game_bind_challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.user_game_bind_challenges;
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  if p_game_uid is null or btrim(p_game_uid) = '' then
    raise exception 'game_uid is required';
  end if;

  if p_challenge !~ '^hhwx[a-z2-9]{8}$' then
    raise exception 'challenge format is invalid';
  end if;

  if p_expires_at <= now() then
    raise exception 'expires_at must be in the future';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_web_user_id::text || ':' || p_game_uid)::bigint);

  if not exists (
    select 1
    from public.user_game_bindings
    where web_user_id = p_web_user_id
      and game_uid = p_game_uid
  ) and (
    select count(*)
    from public.user_game_bindings
    where web_user_id = p_web_user_id
  ) >= 5 then
    raise exception 'game uid binding limit reached';
  end if;

  delete from public.user_game_bind_challenges
  where web_user_id = p_web_user_id
    and game_uid = p_game_uid;

  insert into public.user_game_bind_challenges (
    web_user_id,
    game_uid,
    challenge,
    expires_at
  )
  values (
    p_web_user_id,
    p_game_uid,
    p_challenge,
    p_expires_at
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.complete_game_uid_binding(
  p_challenge_id uuid,
  p_game_uid text,
  p_web_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.user_game_bindings;
  consumed_challenge public.user_game_bind_challenges;
  previous_web_user_id uuid;
  transferred boolean;
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  if p_game_uid is null or btrim(p_game_uid) = '' then
    raise exception 'game_uid is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_game_uid)::bigint);

  delete from public.user_game_bind_challenges
  where id = p_challenge_id
    and web_user_id = p_web_user_id
    and game_uid = p_game_uid
    and expires_at > now()
  returning * into consumed_challenge;

  if not found then
    raise exception 'challenge is invalid or expired';
  end if;

  select web_user_id into previous_web_user_id
  from public.user_game_bindings
  where game_uid = p_game_uid;

  transferred := previous_web_user_id is not null and previous_web_user_id <> p_web_user_id;

  if previous_web_user_id is null and (
    select count(*)
    from public.user_game_bindings
    where web_user_id = p_web_user_id
  ) >= 5 then
    raise exception 'game uid binding limit reached';
  end if;

  if transferred and to_regclass('public.user_game_profiles') is not null then
    execute
      'delete from public.user_game_profiles where web_user_id = $1 and source_game_uid = $2'
      using previous_web_user_id, p_game_uid;
  end if;

  insert into public.user_game_bindings as bindings (
    game_uid,
    web_user_id,
    bound_at
  )
  values (
    p_game_uid,
    p_web_user_id,
    now()
  )
  on conflict (game_uid) do update
  set web_user_id = excluded.web_user_id,
      bound_at = now()
  returning * into result;

  return jsonb_build_object(
    'gameUid', result.game_uid,
    'webUserId', result.web_user_id,
    'boundAt', result.bound_at,
    'transferred', transferred
  );
end;
$$;

create or replace function public.increment_game_bind_challenge_attempt(
  p_challenge_id uuid,
  p_web_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_attempt_count integer;
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  update public.user_game_bind_challenges
  set attempt_count = attempt_count + 1
  where id = p_challenge_id
    and web_user_id = p_web_user_id
  returning attempt_count into next_attempt_count;

  if not found then
    raise exception 'challenge is invalid';
  end if;

  return next_attempt_count;
end;
$$;

create or replace function public.unbind_game_uid(
  p_game_uid text,
  p_web_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  delete from public.user_game_bindings
  where game_uid = p_game_uid
    and web_user_id = p_web_user_id;

  if to_regclass('public.user_game_profiles') is not null then
    execute
      'delete from public.user_game_profiles where web_user_id = $1 and source_game_uid = $2'
      using p_web_user_id, p_game_uid;
  end if;

  delete from public.user_game_bind_challenges
  where game_uid = p_game_uid
    and web_user_id = p_web_user_id;
end;
$$;

revoke all on function public.cleanup_old_game_bind_challenges(timestamptz) from public, anon, authenticated;
revoke all on function public.create_game_uid_bind_challenge(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_game_uid_binding(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.increment_game_bind_challenge_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.unbind_game_uid(text, uuid) from public, anon, authenticated;

grant execute on function public.cleanup_old_game_bind_challenges(timestamptz) to service_role;
grant execute on function public.create_game_uid_bind_challenge(uuid, text, text, timestamptz) to service_role;
grant execute on function public.complete_game_uid_binding(uuid, text, uuid) to service_role;
grant execute on function public.increment_game_bind_challenge_attempt(uuid, uuid) to service_role;
grant execute on function public.unbind_game_uid(text, uuid) to service_role;
