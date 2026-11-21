-- Six represents following the end, with a maximum of six visible cards.
-- Upgrade existing profiles whose divider already has no cards below it.
update public.profile_homepages h set card_preview_count = 6, card_layout_version = card_layout_version + 1
where h.card_preview_count < 6 and not exists (
  select 1 from public.bandori_favorites f where f.user_id = h.user_id and f.kind = 'cards'
  offset h.card_preview_count limit 1
);

create or replace function public.save_favorite_card_layout(p_user_id uuid, p_targets text[], p_preview_count integer, p_version bigint)
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
  update public.profile_homepages set card_preview_count = case when p_preview_count >= cardinality(current_targets) then 6 else p_preview_count end,
    card_layout_version = current_version + 1
    where user_id = p_user_id;
  return true;
end;
$$;

create function public.remove_favorite_card(p_user_id uuid, p_target text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  preview integer;
begin
  -- Serialize concurrent removals with each other and with edits to the divider.
  insert into public.profile_homepages (user_id) values (p_user_id) on conflict do nothing;
  select card_preview_count into strict preview from public.profile_homepages where user_id = p_user_id for update;
  delete from public.bandori_favorites where user_id = p_user_id and kind = 'cards' and target = p_target;
  if not found or preview = 6 then return; end if;
  if not exists (
    select 1 from public.bandori_favorites where user_id = p_user_id and kind = 'cards' offset preview limit 1
  ) then
    update public.profile_homepages set card_preview_count = 6, card_layout_version = card_layout_version + 1
      where user_id = p_user_id;
  end if;
end;
$$;
revoke all on function public.remove_favorite_card(uuid, text) from public, anon, authenticated;
grant execute on function public.remove_favorite_card(uuid, text) to service_role;
