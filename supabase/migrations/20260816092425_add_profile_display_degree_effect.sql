alter table public.profiles
  add column if not exists display_degree_effect_id integer;

alter table public.profiles
  drop constraint if exists profiles_display_degree_effect_id_check;

alter table public.profiles
  add constraint profiles_display_degree_effect_id_check
    check (display_degree_effect_id is null or display_degree_effect_id > 0);

comment on column public.profiles.display_degree_effect_id is
  'Optional CN biliDegreeEffectId selected for the public display Degree; null selects the standard variant.';

-- Keep display identity writable only through the service-role RPC even when
-- this migration is applied to an installation with older table-level grants.
revoke insert, update on table public.profiles from authenticated;
grant insert (id, username, avatar_card_id, avatar_card_server, avatar_card_train_type)
  on table public.profiles to authenticated;
grant update (username, avatar_card_id, avatar_card_server, avatar_card_train_type)
  on table public.profiles to authenticated;

create or replace function public.set_profile_display_degree(
  p_web_user_id uuid,
  p_server integer,
  p_degree_id integer,
  p_degree_effect_id integer
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
  if p_degree_effect_id is not null and p_degree_effect_id <= 0 then
    raise exception 'display degree effect id is invalid';
  end if;
  if p_degree_effect_id is not null and p_server <> 3 then
    raise exception 'display degree effect is only available on CN';
  end if;

  perform 1
  from public.profiles
  where id = p_web_user_id
  for update;

  if not found then
    raise exception 'profile does not exist';
  end if;

  if not (
    p_server = 0
    and p_degree_id = 100
    and p_degree_effect_id is null
  ) and not (
    p_server = 3
    and exists (
      select 1
      from public.user_game_bindings as bindings
      where bindings.web_user_id = p_web_user_id
        and p_degree_id = any(bindings.owned_degree_ids)
        and (
          p_degree_effect_id is null
          or p_degree_effect_id = any(bindings.owned_degree_effect_ids)
        )
    )
  ) then
    raise exception 'display degree is not owned';
  end if;

  update public.profiles
  set display_degree_server = p_server,
      display_degree_id = p_degree_id,
      display_degree_effect_id = p_degree_effect_id
  where id = p_web_user_id;

  return jsonb_build_object(
    'displayDegreeServer', p_server,
    'displayDegreeId', p_degree_id,
    'displayDegreeEffectId', p_degree_effect_id
  );
end;
$$;

-- Keep the three-argument contract available during migration-first rollout.
-- Existing callers explicitly select the standard variant and clear any effect.
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
declare
  applied jsonb;
begin
  applied := public.set_profile_display_degree(
    p_web_user_id,
    p_server,
    p_degree_id,
    null::integer
  );
  return jsonb_build_object(
    'displayDegreeServer', applied -> 'displayDegreeServer',
    'displayDegreeId', applied -> 'displayDegreeId'
  );
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
    set display_degree_server = case
          when profile.display_degree_server = 3 and exists (
            select 1
            from public.user_game_bindings as remaining_binding
            where remaining_binding.web_user_id = previous_web_user_id
              and profile.display_degree_id = any(remaining_binding.owned_degree_ids)
          ) then profile.display_degree_server
          else 0
        end,
        display_degree_id = case
          when profile.display_degree_server = 3 and exists (
            select 1
            from public.user_game_bindings as remaining_binding
            where remaining_binding.web_user_id = previous_web_user_id
              and profile.display_degree_id = any(remaining_binding.owned_degree_ids)
          ) then profile.display_degree_id
          else 100
        end,
        display_degree_effect_id = case
          when profile.display_degree_server = 3
            and profile.display_degree_effect_id is not null
            and exists (
              select 1
              from public.user_game_bindings as remaining_binding
              where remaining_binding.web_user_id = previous_web_user_id
                and profile.display_degree_id = any(remaining_binding.owned_degree_ids)
                and profile.display_degree_effect_id = any(remaining_binding.owned_degree_effect_ids)
            ) then profile.display_degree_effect_id
          else null
        end
    where profile.id = previous_web_user_id
      and not (
        profile.display_degree_server = 0
        and profile.display_degree_id = 100
        and profile.display_degree_effect_id is null
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
    set display_degree_server = case
          when profile.display_degree_server = 3 and exists (
            select 1
            from public.user_game_bindings as remaining_binding
            where remaining_binding.web_user_id = p_web_user_id
              and profile.display_degree_id = any(remaining_binding.owned_degree_ids)
          ) then profile.display_degree_server
          else 0
        end,
        display_degree_id = case
          when profile.display_degree_server = 3 and exists (
            select 1
            from public.user_game_bindings as remaining_binding
            where remaining_binding.web_user_id = p_web_user_id
              and profile.display_degree_id = any(remaining_binding.owned_degree_ids)
          ) then profile.display_degree_id
          else 100
        end,
        display_degree_effect_id = case
          when profile.display_degree_server = 3
            and profile.display_degree_effect_id is not null
            and exists (
              select 1
              from public.user_game_bindings as remaining_binding
              where remaining_binding.web_user_id = p_web_user_id
                and profile.display_degree_id = any(remaining_binding.owned_degree_ids)
                and profile.display_degree_effect_id = any(remaining_binding.owned_degree_effect_ids)
            ) then profile.display_degree_effect_id
          else null
        end
    where profile.id = p_web_user_id
      and not (
        profile.display_degree_server = 0
        and profile.display_degree_id = 100
        and profile.display_degree_effect_id is null
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

revoke all on function public.set_profile_display_degree(uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.set_profile_display_degree(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_game_uid_binding(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.unbind_game_uid(text, uuid)
  from public, anon, authenticated;

grant execute on function public.set_profile_display_degree(uuid, integer, integer, integer)
  to service_role;
grant execute on function public.set_profile_display_degree(uuid, integer, integer)
  to service_role;
grant execute on function public.complete_game_uid_binding(uuid, text, uuid)
  to service_role;
grant execute on function public.unbind_game_uid(text, uuid)
  to service_role;
