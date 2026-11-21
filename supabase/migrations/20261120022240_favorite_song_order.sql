alter table public.bandori_favorites add column song_order bigint
  check (song_order is null or (kind = 'songs' and song_order > 0));

create or replace function public.read_bandori_favorites(p_public_uid bigint, p_viewer_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', g.kind, 'items', g.items) || g.layout order by g.ordinality), '[]')
  from (
    select f.kind, m.ordinality,
      case when f.kind = 'cards' and p_public_uid is not null then
        jsonb_build_object('previewCount', coalesce(h.card_preview_count, 6)) ||
        case when p.id = p_viewer_id then jsonb_build_object('layoutVersion', coalesce(h.card_layout_version, 0))
             else '{}'::jsonb end
      else '{}'::jsonb end as layout,
      jsonb_agg(jsonb_build_object('target', f.target, 'normalArt', f.normal_art)
        order by coalesce(case when p_public_uid is not null then coalesce(f.song_order, f.card_order) end, f.position) desc, f.position desc) as items
    from public.profiles p
    left join public.profile_homepages h on h.user_id = p.id
    cross join lateral jsonb_array_elements(coalesce(h.preferences->'modules',
      '[{"id":"cards","public":true},{"id":"events","public":true},{"id":"songs","public":true}]'::jsonb))
      with ordinality as m(item, ordinality)
    join public.bandori_favorites f on f.kind = m.item->>'id' and f.user_id = p.id
    where (case when p_public_uid is null then p.id = p_viewer_id else p.public_uid = p_public_uid end)
      and (p.id = p_viewer_id or m.item->'public' = 'true'::jsonb)
    group by p.id, h.user_id, f.kind, m.ordinality
  ) g;
$$;

create function public.save_favorite_song_order(p_user_id uuid, p_previous text[], p_targets text[])
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  current_targets text[];
begin
  -- Lock in immutable insertion order so concurrent edits compare the latest saved order.
  select array_agg(target order by coalesce(song_order, position), position) into current_targets from (
    select target, song_order, position from public.bandori_favorites
    where user_id = p_user_id and kind = 'songs' order by position for update
  ) songs;
  if current_targets is null or p_targets is null then return false; end if;
  if current_targets = p_targets then return true; end if;
  if current_targets is distinct from p_previous or cardinality(current_targets) <> cardinality(p_targets)
     or not (current_targets <@ p_targets and p_targets <@ current_targets) then return false; end if;
  update public.bandori_favorites f set song_order = r.ordinality
    from unnest(p_targets) with ordinality as r(target, ordinality)
    where f.user_id = p_user_id and f.kind = 'songs' and f.target = r.target
      and coalesce(f.song_order, f.position) <> r.ordinality;
  return true;
end;
$$;
revoke all on function public.save_favorite_song_order(uuid, text[], text[]) from public, anon, authenticated;
grant execute on function public.save_favorite_song_order(uuid, text[], text[]) to service_role;
