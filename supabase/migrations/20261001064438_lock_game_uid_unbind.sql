-- Serialize unbinding with saves and ownership transfers for the same UID.
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

  perform pg_advisory_xact_lock(hashtext(p_game_uid)::bigint);

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

revoke all on function public.unbind_game_uid(text, uuid) from public, anon, authenticated;
grant execute on function public.unbind_game_uid(text, uuid) to service_role;
