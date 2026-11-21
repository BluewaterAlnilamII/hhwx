-- Replace the pre-release, versioned RPCs together with their web caller.
drop function public.move_favorite_song(uuid,text[],integer,integer);
drop function public.save_favorite_song_order(uuid,text[],text[]);
drop function public.save_favorite_card_layout(uuid,text[],integer,bigint);
drop function account_private.apply_favorite_order(uuid,text,text[],text[]);

create function public.save_favorite_layout(p_user_id uuid, p_kind text, p_targets text[], p_preview_count integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  valid_membership boolean;
begin
  if p_kind is null or p_kind not in ('cards','songs') or coalesce(cardinality(p_targets), 0) = 0
     or (p_kind = 'cards' and (p_preview_count is null or p_preview_count not between 1 and 6))
     or (p_kind = 'songs' and p_preview_count is not null) then
    raise exception 'Invalid favorite layout' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':favorite-' || p_kind, 0));
  with items as materialized (
    select target, position, coalesce(display_order, position) as slot
    from public.bandori_favorites where user_id = p_user_id and kind = p_kind
  ), layout as (
    select array_agg(target order by slot, position) as targets, array_agg(position order by position) as slots
    from items
  ), valid as (
    select * from layout where cardinality(targets) = cardinality(p_targets)
      and not exists (select target from items except select unnest(p_targets))
  ), moved as (
    update public.bandori_favorites f set display_order = nullif(r.slot, f.position)
    from valid cross join lateral unnest(p_targets, valid.slots) as r(target, slot)
    join items i on i.target = r.target
    where valid.targets <> p_targets and i.slot <> r.slot and f.user_id = p_user_id
      and f.kind = p_kind and f.target = i.target and f.position = i.position
  )
  select exists (select from valid) into valid_membership;

  if valid_membership and p_kind = 'cards' then
    if p_preview_count = 6 or p_preview_count >= cardinality(p_targets) then
      update public.profile_homepages set card_preview_count = 6 where user_id = p_user_id and card_preview_count <> 6;
    else
      insert into public.profile_homepages as h (user_id, card_preview_count) values (p_user_id, p_preview_count)
        on conflict (user_id) do update set card_preview_count = excluded.card_preview_count
        where h.card_preview_count <> excluded.card_preview_count;
    end if;
  end if;
  return valid_membership;
end;
$$;
revoke all on function public.save_favorite_layout(uuid,text,text[],integer) from public, anon, authenticated;
grant execute on function public.save_favorite_layout(uuid,text,text[],integer) to service_role;

create or replace function public.read_bandori_favorites(p_public_uid bigint, p_viewer_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', g.kind, 'items', g.items) || g.layout order by g.ordinality), '[]')
  from (
    select f.kind, m.ordinality,
      case when f.kind = 'cards' and p_public_uid is not null then
        jsonb_build_object('previewCount', coalesce(h.card_preview_count, 6))
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

create or replace function public.remove_favorite_card(p_user_id uuid, p_target text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':favorite-cards', 0));
  delete from public.bandori_favorites where user_id = p_user_id and kind = 'cards' and target = p_target;
  if not found then return; end if;
  update public.profile_homepages h set card_preview_count = 6
  where user_id = p_user_id and card_preview_count < 6 and not exists (
    select from public.bandori_favorites f where f.user_id = p_user_id and f.kind = 'cards'
    offset h.card_preview_count limit 1
  );
end;
$$;

alter table public.profile_homepages drop column card_layout_version;
