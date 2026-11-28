-- Skip a physical row update when a partial observation adds no new facts.
create function public.skip_unchanged_bandori_public_player()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  return null;
end;
$$;
revoke all on function public.skip_unchanged_bandori_public_player() from public, anon, authenticated, service_role;

create trigger skip_unchanged_bandori_public_player
before update on public.bandori_public_players
for each row when (old.* is not distinct from new.*)
execute function public.skip_unchanged_bandori_public_player();

create function public.merge_game_uid_binding_titles(
  p_web_user_id uuid, p_game_uid text, p_degree_ids integer[], p_degree_effect_ids integer[]
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  current_degrees integer[];
  current_effects integer[];
begin
  select owned_degree_ids, owned_degree_effect_ids into current_degrees, current_effects
  from public.user_game_bindings
  where server = 'cn' and game_uid = p_game_uid and web_user_id = p_web_user_id
  for update;
  if not found then
    raise exception 'game uid is not bound to user';
  end if;

  if coalesce(p_degree_ids, '{}') <@ current_degrees
     and coalesce(p_degree_effect_ids, '{}') <@ current_effects then
    return;
  end if;

  update public.user_game_bindings
  set owned_degree_ids = array(
        select distinct id from unnest(current_degrees || p_degree_ids) id where id > 0 order by id
      ),
      owned_degree_effect_ids = array(
        select distinct id from unnest(current_effects || p_degree_effect_ids) id where id > 0 order by id
      )
  where server = 'cn' and game_uid = p_game_uid and web_user_id = p_web_user_id;
end;
$$;
revoke all on function public.merge_game_uid_binding_titles(uuid, text, integer[], integer[]) from public, anon, authenticated;
grant execute on function public.merge_game_uid_binding_titles(uuid, text, integer[], integer[]) to service_role;
