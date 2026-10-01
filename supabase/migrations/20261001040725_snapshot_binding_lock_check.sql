-- Check current ownership after acquiring the existing save/transfer locks.
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

  perform pg_advisory_xact_lock(hashtext(p_web_user_id::text || ':auto-game-profiles')::bigint);
  perform pg_advisory_xact_lock(hashtext(p_game_uid)::bigint);

  if not exists (
    select 1
    from public.user_game_bindings
    where web_user_id = p_web_user_id
      and game_uid = p_game_uid
  ) then
    raise exception 'game uid is not bound to user';
  end if;

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
