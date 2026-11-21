-- Preserve insertion order and both kinds of custom order across the upgrade.
alter table public.bandori_favorites rename column card_order to display_order;
alter table public.bandori_favorites drop constraint bandori_favorites_check2;
update public.bandori_favorites set display_order = song_order where song_order is not null;
alter table public.bandori_favorites
  drop column song_order,
  add constraint bandori_favorites_display_order_check
    check (display_order is null or (kind in ('cards','songs') and display_order > 0)),
  drop constraint bandori_favorites_pkey,
  drop constraint bandori_favorites_user_id_kind_target_key,
  add primary key (user_id, kind, target);
drop index public.bandori_favorites_count_idx;

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
        order by coalesce(case when p_public_uid is not null then f.display_order end, f.position) desc, f.position desc) as items
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

-- Membership is an unordered set. No profile join, art projection or sort is needed.
create function public.read_bandori_favorite_keys(p_user_id uuid)
returns text[] language sql stable security invoker set search_path = '' as $$
  select array(select kind || ':' || target from public.bandori_favorites where user_id = p_user_id);
$$;
revoke all on function public.read_bandori_favorite_keys(uuid) from public, anon, authenticated;
grant execute on function public.read_bandori_favorite_keys(uuid) to service_role;

-- The caller serializes edits to this owner's collection. Validate and reorder one
-- snapshot; an item removed and re-added concurrently has a new insertion position.
create function account_private.apply_favorite_order(p_user_id uuid, p_kind text, p_targets text[], p_previous text[])
returns boolean language sql volatile security invoker set search_path = '' as $$
  with items as materialized (
    select target, position, coalesce(display_order, position) as slot
    from public.bandori_favorites where user_id = p_user_id and kind = p_kind
  ), layout as (
    select array_agg(target order by slot, position) as targets,
           array_agg(position order by position) as slots from items
  ), valid as (
    select * from layout where targets = p_targets or (
      (p_previous is null or targets = p_previous) and cardinality(targets) = cardinality(p_targets)
      and not exists (select target from items except select unnest(p_targets))
    )
  ), moved as (
    update public.bandori_favorites f set display_order = nullif(r.slot, f.position)
    from valid cross join lateral unnest(p_targets, valid.slots) as r(target, slot)
    join items i on i.target = r.target
    where valid.targets <> p_targets and i.slot <> r.slot
      and f.user_id = p_user_id and f.kind = p_kind and f.target = i.target and f.position = i.position
  )
  select exists (select from valid);
$$;
revoke all on function account_private.apply_favorite_order(uuid,text,text[],text[]) from public, anon, authenticated;
grant execute on function account_private.apply_favorite_order(uuid,text,text[],text[]) to service_role;

create or replace function public.save_favorite_song_order(p_user_id uuid, p_previous text[], p_targets text[])
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_previous is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':favorite-songs', 0));
  return account_private.apply_favorite_order(p_user_id, 'songs', p_targets, p_previous);
end;
$$;

create or replace function public.save_favorite_card_layout(p_user_id uuid, p_targets text[], p_preview_count integer, p_version bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  current_version bigint;
begin
  if p_preview_count is null or p_preview_count not between 1 and 6 or coalesce(cardinality(p_targets), 0) = 0 then
    raise exception 'Invalid favorite card layout' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':favorite-cards', 0));
  select card_layout_version into current_version from public.profile_homepages where user_id = p_user_id;
  if coalesce(current_version, 0) is distinct from p_version then return false; end if;
  if not account_private.apply_favorite_order(p_user_id, 'cards', p_targets, null) then return false; end if;
  insert into public.profile_homepages (user_id, card_preview_count, card_layout_version)
    values (p_user_id, case when p_preview_count >= cardinality(p_targets) then 6 else p_preview_count end, p_version + 1)
    on conflict (user_id) do update set card_preview_count = excluded.card_preview_count,
                                        card_layout_version = excluded.card_layout_version;
  return true;
end;
$$;

create or replace function public.remove_favorite_card(p_user_id uuid, p_target text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':favorite-cards', 0));
  delete from public.bandori_favorites where user_id = p_user_id and kind = 'cards' and target = p_target;
  if not found then return; end if;
  update public.profile_homepages h set card_preview_count = 6, card_layout_version = card_layout_version + 1
  where user_id = p_user_id and card_preview_count < 6 and not exists (
    select from public.bandori_favorites f where f.user_id = p_user_id and f.kind = 'cards'
    offset h.card_preview_count limit 1
  );
end;
$$;
