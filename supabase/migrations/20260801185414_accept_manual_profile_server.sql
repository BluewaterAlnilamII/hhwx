drop function if exists public.create_manual_game_profile(uuid, text, text, text, integer, integer, jsonb);

create function public.create_manual_game_profile(
  p_web_user_id uuid,
  p_profile_name text,
  p_payload_compressed text,
  p_payload_sha256 text,
  p_payload_size integer,
  p_card_count integer,
  p_summary jsonb default '{}'::jsonb,
  p_server integer default 3
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

  if p_server is null or p_server not between 0 and 3 then
    raise exception 'server must be between 0 and 3';
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
    p_server,
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

revoke all on function public.create_manual_game_profile(uuid, text, text, text, integer, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.create_manual_game_profile(uuid, text, text, text, integer, integer, jsonb, integer) to service_role;
