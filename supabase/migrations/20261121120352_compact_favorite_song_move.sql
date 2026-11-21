-- A drag is completely described by its original order and two zero-based indices.
create function public.move_favorite_song(p_user_id uuid, p_previous text[], p_from integer, p_to integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  moved text := p_previous[p_from + 1];
  remaining text[];
begin
  if moved is null or p_to is null or p_to < 0 or p_to >= cardinality(p_previous) then return false; end if;
  remaining := array_remove(p_previous, moved);
  return public.save_favorite_song_order(p_user_id, p_previous,
    remaining[1:p_to] || array[moved] || remaining[p_to + 1:]);
end;
$$;
revoke all on function public.move_favorite_song(uuid,text[],integer,integer) from public, anon, authenticated;
grant execute on function public.move_favorite_song(uuid,text[],integer,integer) to service_role;
