-- Addition order remains immutable for membership reads and newly favorited cards.
alter table public.bandori_favorites add column card_order bigint
  check (card_order is null or (kind = 'cards' and card_order > 0));
alter table public.profile_homepages
  add column card_preview_count smallint not null default 6 check (card_preview_count between 1 and 6),
  add column card_layout_version bigint not null default 0;

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
        order by coalesce(case when p_public_uid is not null then f.card_order end, f.position) desc, f.position desc) as items
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

create function public.save_favorite_card_layout(p_user_id uuid, p_targets text[], p_preview_count integer, p_version bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  current_targets text[];
  current_version bigint;
begin
  if p_preview_count is null or p_preview_count not between 1 and 6 or coalesce(cardinality(p_targets), 0) = 0 then
    raise exception 'Invalid favorite card layout' using errcode = '22023';
  end if;
  insert into public.profile_homepages (user_id) values (p_user_id) on conflict do nothing;
  select card_layout_version into strict current_version from public.profile_homepages where user_id = p_user_id for update;
  if current_version is distinct from p_version then return false; end if;

  select array_agg(target order by coalesce(card_order, position), position) into current_targets from (
    select target, card_order, position from public.bandori_favorites
    where user_id = p_user_id and kind = 'cards' order by position for update
  ) cards;
  if current_targets is distinct from p_targets then
    if cardinality(current_targets) is distinct from cardinality(p_targets)
       or not (current_targets <@ p_targets and p_targets <@ current_targets) then return false; end if;
    update public.bandori_favorites f set card_order = r.ordinality
      from unnest(p_targets) with ordinality as r(target, ordinality)
      where f.user_id = p_user_id and f.kind = 'cards' and f.target = r.target
        and coalesce(f.card_order, f.position) <> r.ordinality;
  end if;
  update public.profile_homepages set card_preview_count = p_preview_count, card_layout_version = current_version + 1
    where user_id = p_user_id;
  return true;
end;
$$;
revoke all on function public.save_favorite_card_layout(uuid, text[], integer, bigint) from public, anon, authenticated;
grant execute on function public.save_favorite_card_layout(uuid, text[], integer, bigint) to service_role;
