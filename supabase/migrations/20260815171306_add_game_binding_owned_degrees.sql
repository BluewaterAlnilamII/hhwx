alter table public.user_game_bindings
  add column if not exists owned_degree_ids integer[] not null default '{}'::integer[];

comment on column public.user_game_bindings.owned_degree_ids is
  'CN suite/user Degree IDs observed for the bound game account; updated by monotonic set union.';

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
  where bindings.web_user_id = p_web_user_id
    and bindings.game_uid = p_game_uid
  returning bindings.owned_degree_ids into merged_degree_ids;

  if not found then
    raise exception 'game uid is not bound to user';
  end if;

  return merged_degree_ids;
end;
$$;

revoke all on function public.merge_game_uid_binding_degrees(uuid, text, integer[])
  from public, anon, authenticated;
grant execute on function public.merge_game_uid_binding_degrees(uuid, text, integer[])
  to service_role;
