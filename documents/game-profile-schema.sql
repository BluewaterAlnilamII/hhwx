-- Game profile schema for compressed synced and manually uploaded profile data.
-- Run after documents/game-account-binding-schema.sql.
-- This migration intentionally drops the early row-level detail tables; the
-- compressed payload in user_game_profiles is the source of truth.

create extension if not exists pgcrypto;

drop function if exists public.touch_user_game_profile_counts(uuid);
drop function if exists public.create_manual_game_profile(uuid, text, jsonb);
drop function if exists public.upsert_auto_game_profile(uuid, text, text, jsonb, jsonb);
drop function if exists public.create_manual_game_profile(uuid, text, text, text, integer, integer, jsonb);
drop function if exists public.upsert_auto_game_profile(uuid, text, text, text, text, integer, integer, jsonb);

drop table if exists public.user_game_profile_character_mission_bonuses;
drop table if exists public.user_game_profile_character_potentials;
drop table if exists public.user_game_profile_area_items;
drop table if exists public.user_game_profile_cards;

create table if not exists public.user_game_profiles (
  id uuid primary key default gen_random_uuid(),
  web_user_id uuid not null references auth.users(id) on delete cascade,
  profile_kind text not null check (profile_kind in ('auto', 'manual')),
  profile_name text not null check (char_length(profile_name) between 1 and 40),
  server integer not null default 3,
  source_game_uid text null,
  storage_codec text not null default 'hhwx-profile+gzip+base64-v1',
  payload_compressed text not null,
  payload_sha256 text not null,
  payload_size integer not null check (payload_size > 0),
  card_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  synced_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint user_game_profiles_kind_source_check
    check ((profile_kind = 'auto' and source_game_uid is not null)
      or (profile_kind = 'manual' and source_game_uid is null))
);

alter table public.user_game_profiles
  add column if not exists storage_codec text not null default 'hhwx-profile+gzip+base64-v1';
alter table public.user_game_profiles
  add column if not exists payload_compressed text;
alter table public.user_game_profiles
  add column if not exists payload_sha256 text;
alter table public.user_game_profiles
  add column if not exists payload_size integer;

alter table public.user_game_profiles
  drop column if exists is_editable,
  drop column if exists is_active,
  drop column if exists bestdori_profile,
  drop column if exists area_item_count,
  drop column if exists potential_count,
  drop column if exists mission_bonus_count,
  drop column if exists created_at;

delete from public.user_game_profiles
where payload_compressed is null
   or payload_sha256 is null
   or payload_size is null;

alter table public.user_game_profiles
  drop constraint if exists user_game_profiles_auto_source_check,
  drop constraint if exists user_game_profiles_kind_source_check,
  drop constraint if exists user_game_profiles_payload_size_check;

alter table public.user_game_profiles
  alter column storage_codec set not null,
  alter column payload_compressed set not null,
  alter column payload_sha256 set not null,
  alter column payload_size set not null;

alter table public.user_game_profiles
  add constraint user_game_profiles_kind_source_check
    check ((profile_kind = 'auto' and source_game_uid is not null)
      or (profile_kind = 'manual' and source_game_uid is null)),
  add constraint user_game_profiles_payload_size_check
    check (payload_size > 0);

drop index if exists user_game_profiles_auto_uid_idx;
create unique index user_game_profiles_auto_uid_idx
  on public.user_game_profiles(web_user_id, source_game_uid)
  where profile_kind = 'auto';

drop index if exists user_game_profiles_user_kind_idx;
create index user_game_profiles_user_kind_idx
  on public.user_game_profiles(web_user_id, profile_kind, updated_at desc);

alter table public.user_game_profiles enable row level security;

revoke all on table public.user_game_profiles from public, anon, authenticated;
grant all on table public.user_game_profiles to service_role;

drop policy if exists "Users can read own game profiles" on public.user_game_profiles;
drop policy if exists "Users can delete own game profiles" on public.user_game_profiles;

create policy "Users can read own game profiles"
  on public.user_game_profiles
  for select
  to authenticated
  using (auth.uid() = web_user_id);

create policy "Users can delete own game profiles"
  on public.user_game_profiles
  for delete
  to authenticated
  using (auth.uid() = web_user_id);

create or replace function public.create_manual_game_profile(
  p_web_user_id uuid,
  p_profile_name text,
  p_payload_compressed text,
  p_payload_sha256 text,
  p_payload_size integer,
  p_card_count integer,
  p_summary jsonb default '{}'::jsonb
)
returns public.user_game_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.user_game_profiles;
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_web_user_id::text || ':manual-game-profiles')::bigint);

  if (
    select count(*)
    from public.user_game_profiles
    where web_user_id = p_web_user_id
      and profile_kind = 'manual'
  ) >= 10 then
    raise exception 'manual game profile limit reached';
  end if;

  insert into public.user_game_profiles (
    web_user_id,
    profile_kind,
    profile_name,
    server,
    source_game_uid,
    payload_compressed,
    payload_sha256,
    payload_size,
    card_count,
    summary,
    updated_at
  )
  values (
    p_web_user_id,
    'manual',
    p_profile_name,
    3,
    null,
    p_payload_compressed,
    p_payload_sha256,
    p_payload_size,
    greatest(0, p_card_count),
    coalesce(p_summary, '{}'::jsonb),
    now()
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.upsert_auto_game_profile(
  p_web_user_id uuid,
  p_game_uid text,
  p_profile_name text,
  p_payload_compressed text,
  p_payload_sha256 text,
  p_payload_size integer,
  p_card_count integer,
  p_summary jsonb
)
returns public.user_game_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.user_game_profiles;
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  if not exists (
    select 1
    from public.user_game_bindings
    where web_user_id = p_web_user_id
      and game_uid = p_game_uid
  ) then
    raise exception 'game uid is not bound to user';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_web_user_id::text || ':auto-game-profiles')::bigint);
  perform pg_advisory_xact_lock(hashtext(p_game_uid)::bigint);

  if not exists (
    select 1
    from public.user_game_profiles
    where web_user_id = p_web_user_id
      and profile_kind = 'auto'
      and source_game_uid = p_game_uid
  ) and (
    select count(*)
    from public.user_game_profiles
    where web_user_id = p_web_user_id
      and profile_kind = 'auto'
  ) >= 5 then
    raise exception 'auto game profile limit reached';
  end if;

  insert into public.user_game_profiles as profiles (
    web_user_id,
    profile_kind,
    profile_name,
    server,
    source_game_uid,
    payload_compressed,
    payload_sha256,
    payload_size,
    card_count,
    summary,
    synced_at,
    updated_at
  )
  values (
    p_web_user_id,
    'auto',
    p_profile_name,
    3,
    p_game_uid,
    p_payload_compressed,
    p_payload_sha256,
    p_payload_size,
    greatest(0, p_card_count),
    coalesce(p_summary, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (web_user_id, source_game_uid)
  where profile_kind = 'auto'
  do update
  set profile_name = excluded.profile_name,
      payload_compressed = excluded.payload_compressed,
      payload_sha256 = excluded.payload_sha256,
      payload_size = excluded.payload_size,
      card_count = excluded.card_count,
      summary = excluded.summary,
      synced_at = now(),
      updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.create_manual_game_profile(uuid, text, text, text, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.upsert_auto_game_profile(uuid, text, text, text, text, integer, integer, jsonb) from public, anon, authenticated;

grant execute on function public.create_manual_game_profile(uuid, text, text, text, integer, integer, jsonb) to service_role;
grant execute on function public.upsert_auto_game_profile(uuid, text, text, text, text, integer, integer, jsonb) to service_role;
