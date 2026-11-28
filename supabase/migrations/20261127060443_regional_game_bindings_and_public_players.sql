-- Existing binding data, outstanding challenges and homepage settings belong to CN.
alter table public.user_game_bind_challenges
  add column server text not null default 'cn' check (server in ('jp','en','tw','cn'));
alter table public.user_game_bindings
  add column server text not null default 'cn' check (server in ('jp','en','tw','cn')),
  drop constraint user_game_bindings_pkey,
  add primary key (server, game_uid);
drop index public.user_game_bind_challenges_game_uid_idx;
create index user_game_bind_challenges_account_idx on public.user_game_bind_challenges(server, game_uid);

update public.profile_homepages h
set preferences = jsonb_set(preferences, '{accounts}', (
  select jsonb_agg(jsonb_build_object('server', 3) || account order by position)
  from jsonb_array_elements(h.preferences->'accounts') with ordinality as a(account, position)
))
where jsonb_typeof(preferences->'accounts') = 'array' and preferences->'accounts' <> '[]'::jsonb;

create table public.bandori_public_players (
  server text not null check (server in ('jp','en','tw','cn')),
  game_uid text not null check (game_uid ~ '^(0|[1-9][0-9]{0,19})$' and game_uid::numeric <= 18446744073709551615),
  player_name text,
  player_rank integer,
  introduction text,
  owned_card_ids integer[] not null default '{}',
  owned_degree_ids integer[] not null default '{}',
  band_ranks jsonb,
  music_clear_counts jsonb,
  music_full_combo_counts jsonb,
  music_all_perfect_counts jsonb,
  high_score_rating jsonb,
  stage_challenge_stars jsonb,
  deck_ranks jsonb,
  character_ranks jsonb,
  primary key (server, game_uid)
);
alter table public.bandori_public_players enable row level security;
revoke all on public.bandori_public_players from public, anon, authenticated;
grant select, insert, update on public.bandori_public_players to service_role;

create function public.merge_bandori_public_player(p_server text, p_game_uid text, p_observation jsonb)
returns void language sql security invoker set search_path = '' as $$
  insert into public.bandori_public_players as old (
    server, game_uid, player_name, player_rank, introduction, owned_card_ids, owned_degree_ids,
    band_ranks, music_clear_counts, music_full_combo_counts, music_all_perfect_counts,
    high_score_rating, stage_challenge_stars, deck_ranks, character_ranks
  )
  select p_server, p_game_uid, o.player_name, o.player_rank, o.introduction,
    array(select distinct id from unnest(o.owned_card_ids) id order by id),
    array(select distinct id from unnest(o.owned_degree_ids) id order by id),
    o.band_ranks, o.music_clear_counts, o.music_full_combo_counts, o.music_all_perfect_counts,
    o.high_score_rating, o.stage_challenge_stars, o.deck_ranks, o.character_ranks
  from jsonb_populate_record(null::public.bandori_public_players, p_observation) o
  on conflict (server, game_uid) do update set
    player_name = coalesce(excluded.player_name, old.player_name),
    player_rank = coalesce(excluded.player_rank, old.player_rank),
    introduction = coalesce(excluded.introduction, old.introduction),
    owned_card_ids = array(select distinct id from unnest(old.owned_card_ids || excluded.owned_card_ids) id order by id),
    owned_degree_ids = array(select distinct id from unnest(old.owned_degree_ids || excluded.owned_degree_ids) id order by id),
    band_ranks = case when excluded.band_ranks is null then old.band_ranks
      else coalesce(old.band_ranks, '{}') || excluded.band_ranks end,
    music_clear_counts = case when excluded.music_clear_counts is null then old.music_clear_counts
      else coalesce(old.music_clear_counts, '{}') || excluded.music_clear_counts end,
    music_full_combo_counts = case when excluded.music_full_combo_counts is null then old.music_full_combo_counts
      else coalesce(old.music_full_combo_counts, '{}') || excluded.music_full_combo_counts end,
    music_all_perfect_counts = case when excluded.music_all_perfect_counts is null then old.music_all_perfect_counts
      else coalesce(old.music_all_perfect_counts, '{}') || excluded.music_all_perfect_counts end,
    high_score_rating = case when excluded.high_score_rating is null then old.high_score_rating
      else coalesce(old.high_score_rating, '{}') || excluded.high_score_rating end,
    stage_challenge_stars = case when excluded.stage_challenge_stars is null then old.stage_challenge_stars
      else coalesce(old.stage_challenge_stars, '{}') || excluded.stage_challenge_stars end,
    deck_ranks = case when excluded.deck_ranks is null then old.deck_ranks
      else coalesce(old.deck_ranks, '{}') || excluded.deck_ranks end,
    character_ranks = case when excluded.character_ranks is null then old.character_ranks
      else coalesce(old.character_ranks, '{}') || excluded.character_ranks end;
$$;

revoke all on function public.merge_bandori_public_player(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.merge_bandori_public_player(text, text, jsonb) to service_role;

drop function public.create_game_uid_bind_challenge(uuid, text, text, timestamptz);
create or replace function public.create_game_uid_bind_challenge(
  p_web_user_id uuid,
  p_game_uid text,
  p_challenge text,
  p_expires_at timestamptz,
  p_server text default 'cn'
)
returns public.user_game_bind_challenges
language plpgsql
security invoker
set search_path = ''
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

  if p_challenge !~ '^hhwx[0-9]{6}$' then
    raise exception 'challenge format is invalid';
  end if;

  if p_expires_at <= now() then
    raise exception 'expires_at must be in the future';
  end if;

  perform pg_advisory_xact_lock(1, hashtext(p_web_user_id::text));

  if not exists (
    select 1
    from public.user_game_bindings
    where web_user_id = p_web_user_id
      and server = p_server and game_uid = p_game_uid
  ) and (
    select count(*)
    from public.user_game_bindings
    where web_user_id = p_web_user_id
  ) >= 5 then
    raise exception 'game uid binding limit reached';
  end if;

  delete from public.user_game_bind_challenges
  where web_user_id = p_web_user_id
    and server = p_server and game_uid = p_game_uid;

  insert into public.user_game_bind_challenges (
    web_user_id,
    server, game_uid,
    challenge,
    expires_at
  )
  values (
    p_web_user_id,
    p_server, p_game_uid,
    p_challenge,
    p_expires_at
  )
  returning * into result;

  return result;
end;
$$;
revoke all on function public.create_game_uid_bind_challenge(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.create_game_uid_bind_challenge(uuid, text, text, timestamptz, text) to service_role;


drop function public.complete_game_uid_binding(uuid, text, uuid);
create or replace function public.complete_game_uid_binding(
  p_challenge_id uuid,
  p_game_uid text,
  p_web_user_id uuid,
  p_server text default 'cn'
)
returns jsonb
language plpgsql
security invoker
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

  perform pg_advisory_xact_lock(1, hashtext(p_web_user_id::text));
  perform pg_advisory_xact_lock(hashtext(case when p_server = 'cn' then p_game_uid else p_server || ':' || p_game_uid end)::bigint);

  delete from public.user_game_bind_challenges
  where id = p_challenge_id
    and web_user_id = p_web_user_id
    and server = p_server and game_uid = p_game_uid
    and attempt_count < 5
    and expires_at > now()
  returning * into consumed_challenge;

  if not found then
    raise exception 'challenge is invalid or expired';
  end if;

  select web_user_id into previous_web_user_id
  from public.user_game_bindings
  where server = p_server and game_uid = p_game_uid;

  transferred := previous_web_user_id is not null and previous_web_user_id <> p_web_user_id;

  if previous_web_user_id is distinct from p_web_user_id and (
    select count(*)
    from public.user_game_bindings
    where web_user_id = p_web_user_id
  ) >= 5 then
    raise exception 'game uid binding limit reached';
  end if;

  if transferred and p_server = 'cn' then
    delete from public.user_game_profiles where web_user_id = previous_web_user_id and server = 3
      and profile_kind = 'auto' and source_game_uid = p_game_uid;
  end if;

  insert into public.user_game_bindings as bindings (
    server, game_uid,
    web_user_id,
    bound_at
  )
  values (
    p_server, p_game_uid,
    p_web_user_id,
    now()
  )
  on conflict (server, game_uid) do update
  set web_user_id = excluded.web_user_id,
      bound_at = now()
  returning * into result;

  if transferred and p_server = 'cn' then
    update public.profiles as profile
    set display_degree_server = case
          when profile.display_degree_server = 3 and exists (
            select 1
            from public.user_game_bindings as remaining_binding
            where remaining_binding.server = 'cn' and remaining_binding.web_user_id = previous_web_user_id
              and profile.display_degree_id = any(remaining_binding.owned_degree_ids)
          ) then profile.display_degree_server
          else 0
        end,
        display_degree_id = case
          when profile.display_degree_server = 3 and exists (
            select 1
            from public.user_game_bindings as remaining_binding
            where remaining_binding.server = 'cn' and remaining_binding.web_user_id = previous_web_user_id
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
              where remaining_binding.server = 'cn' and remaining_binding.web_user_id = previous_web_user_id
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
    'server', result.server,
    'gameUid', result.game_uid,
    'webUserId', result.web_user_id,
    'boundAt', result.bound_at,
    'transferred', transferred
  );
end;
$$;
revoke all on function public.complete_game_uid_binding(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.complete_game_uid_binding(uuid, text, uuid, text) to service_role;


drop function public.unbind_game_uid(text, uuid);
create or replace function public.unbind_game_uid(
  p_game_uid text,
  p_web_user_id uuid,
  p_server text default 'cn'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(case when p_server = 'cn' then p_game_uid else p_server || ':' || p_game_uid end)::bigint);

  delete from public.user_game_bindings
  where server = p_server and game_uid = p_game_uid
    and web_user_id = p_web_user_id;

  if found and p_server = 'cn' then
    update public.profiles as profile
    set display_degree_server = case
          when profile.display_degree_server = 3 and exists (
            select 1
            from public.user_game_bindings as remaining_binding
            where remaining_binding.server = 'cn' and remaining_binding.web_user_id = p_web_user_id
              and profile.display_degree_id = any(remaining_binding.owned_degree_ids)
          ) then profile.display_degree_server
          else 0
        end,
        display_degree_id = case
          when profile.display_degree_server = 3 and exists (
            select 1
            from public.user_game_bindings as remaining_binding
            where remaining_binding.server = 'cn' and remaining_binding.web_user_id = p_web_user_id
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
              where remaining_binding.server = 'cn' and remaining_binding.web_user_id = p_web_user_id
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

  if p_server = 'cn' then
    delete from public.user_game_profiles where web_user_id = p_web_user_id and server = 3
      and profile_kind = 'auto' and source_game_uid = p_game_uid;
  end if;

  delete from public.user_game_bind_challenges
  where server = p_server and game_uid = p_game_uid
    and web_user_id = p_web_user_id;
end;
$$;
revoke all on function public.unbind_game_uid(text, uuid, text) from public, anon, authenticated;
grant execute on function public.unbind_game_uid(text, uuid, text) to service_role;


create or replace function public.merge_game_uid_binding_degrees(
  p_web_user_id uuid,
  p_game_uid text,
  p_degree_ids integer[]
)
returns integer[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  merged_degree_ids integer[];
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;
  if p_game_uid is null or btrim(p_game_uid) = '' then
    raise exception 'game_uid is required';
  end if;

  update public.user_game_bindings as bindings
  set owned_degree_ids = (
    select coalesce(
      array_agg(normalized.degree_id order by normalized.degree_id),
      '{}'::integer[]
    )
    from (
      select distinct degree_id
      from unnest(
        coalesce(bindings.owned_degree_ids, '{}'::integer[])
        || coalesce(p_degree_ids, '{}'::integer[])
      ) as degree_ids(degree_id)
      where degree_id is not null
        and degree_id > 0
    ) as normalized
  )
  where bindings.server = 'cn' and bindings.web_user_id = p_web_user_id
    and bindings.game_uid = p_game_uid
  returning bindings.owned_degree_ids into merged_degree_ids;

  if not found then
    raise exception 'game uid is not bound to user';
  end if;

  return merged_degree_ids;
end;
$$;

create or replace function public.merge_game_uid_binding_degree_effects(
  p_web_user_id uuid,
  p_game_uid text,
  p_degree_effect_ids integer[]
)
returns integer[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  merged_degree_effect_ids integer[];
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;
  if p_game_uid is null or btrim(p_game_uid) = '' then
    raise exception 'game_uid is required';
  end if;

  update public.user_game_bindings as bindings
  set owned_degree_effect_ids = (
    select coalesce(
      array_agg(normalized.degree_effect_id order by normalized.degree_effect_id),
      '{}'::integer[]
    )
    from (
      select distinct degree_effect_id
      from unnest(
        coalesce(bindings.owned_degree_effect_ids, '{}'::integer[])
        || coalesce(p_degree_effect_ids, '{}'::integer[])
      ) as degree_effect_ids(degree_effect_id)
      where degree_effect_id is not null
        and degree_effect_id > 0
    ) as normalized
  )
  where bindings.server = 'cn' and bindings.web_user_id = p_web_user_id
    and bindings.game_uid = p_game_uid
  returning bindings.owned_degree_effect_ids into merged_degree_effect_ids;

  if not found then
    raise exception 'game uid is not bound to user';
  end if;

  return merged_degree_effect_ids;
end;
$$;

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
      where bindings.server = 'cn' and bindings.web_user_id = p_web_user_id
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
set search_path = ''
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
    where server = 'cn' and web_user_id = p_web_user_id
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
