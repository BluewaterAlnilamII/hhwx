alter table public.profiles
  add column if not exists display_degree_server integer not null default 0,
  add column if not exists display_degree_id integer not null default 100;

alter table public.profiles
  drop constraint if exists profiles_display_degree_server_check,
  drop constraint if exists profiles_display_degree_id_check;

alter table public.profiles
  add constraint profiles_display_degree_server_check
    check (display_degree_server between 0 and 3),
  add constraint profiles_display_degree_id_check
    check (display_degree_id > 0);

comment on column public.profiles.display_degree_server is
  'Bandori server slot for the public display Degree: 0 JP, 1 EN, 2 TW, 3 CN.';
comment on column public.profiles.display_degree_id is
  'Bandori Degree ID selected for public display; JP Degree 100 is the system baseline.';

-- Degree ownership is enforced by the service-only RPC below. Keep normal
-- profile edits available through the Data API without exposing these columns
-- to direct authenticated writes.
revoke insert, update on table public.profiles from authenticated;
grant insert (id, username, avatar_card_id, avatar_card_server, avatar_card_train_type)
  on table public.profiles to authenticated;
grant update (username, avatar_card_id, avatar_card_server, avatar_card_train_type)
  on table public.profiles to authenticated;

create or replace function public.set_profile_display_degree(
  p_web_user_id uuid,
  p_server integer,
  p_degree_id integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;
  if p_server is null or p_server < 0 or p_server > 3 then
    raise exception 'display degree server is invalid';
  end if;
  if p_degree_id is null or p_degree_id <= 0 then
    raise exception 'display degree id is invalid';
  end if;

  perform 1
  from public.profiles
  where id = p_web_user_id
  for update;

  if not found then
    raise exception 'profile does not exist';
  end if;

  if not (p_server = 0 and p_degree_id = 100) and not (
    p_server = 3
    and exists (
      select 1
      from public.user_game_bindings as bindings
      where bindings.web_user_id = p_web_user_id
        and p_degree_id = any(bindings.owned_degree_ids)
    )
  ) then
    raise exception 'display degree is not owned';
  end if;

  update public.profiles
  set display_degree_server = p_server,
      display_degree_id = p_degree_id
  where id = p_web_user_id;

  return jsonb_build_object(
    'displayDegreeServer', p_server,
    'displayDegreeId', p_degree_id
  );
end;
$$;

revoke all on function public.set_profile_display_degree(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.set_profile_display_degree(uuid, integer, integer)
  to service_role;

create or replace function public.complete_game_uid_binding(
  p_challenge_id uuid,
  p_game_uid text,
  p_web_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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

  if transferred then
    update public.profiles as profile
    set display_degree_server = 0,
        display_degree_id = 100
    where profile.id = previous_web_user_id
      and not (
        profile.display_degree_server = 0
        and profile.display_degree_id = 100
      )
      and (
        profile.display_degree_server <> 3
        or not exists (
          select 1
          from public.user_game_bindings as remaining_binding
          where remaining_binding.web_user_id = previous_web_user_id
            and profile.display_degree_id = any(remaining_binding.owned_degree_ids)
        )
      );
  end if;

  return jsonb_build_object(
    'gameUid', result.game_uid,
    'webUserId', result.web_user_id,
    'boundAt', result.bound_at,
    'transferred', transferred
  );
end;
$$;

create or replace function public.unbind_game_uid(
  p_game_uid text,
  p_web_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  delete from public.user_game_bindings
  where game_uid = p_game_uid
    and web_user_id = p_web_user_id;

  if found then
    update public.profiles as profile
    set display_degree_server = 0,
        display_degree_id = 100
    where profile.id = p_web_user_id
      and not (
        profile.display_degree_server = 0
        and profile.display_degree_id = 100
      )
      and (
        profile.display_degree_server <> 3
        or not exists (
          select 1
          from public.user_game_bindings as remaining_binding
          where remaining_binding.web_user_id = p_web_user_id
            and profile.display_degree_id = any(remaining_binding.owned_degree_ids)
        )
      );
  end if;

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

revoke all on function public.complete_game_uid_binding(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.unbind_game_uid(text, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_game_uid_binding(uuid, text, uuid)
  to service_role;
grant execute on function public.unbind_game_uid(text, uuid)
  to service_role;
