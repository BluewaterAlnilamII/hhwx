create table public.bandori_favorites (
  position bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('cards','events','songs')),
  target text not null,
  normal_art boolean not null default false check (kind = 'cards' or not normal_art),
  unique (user_id, kind, target),
  check (case kind
    when 'events' then target ~ '^(jp|en|tw|cn):[1-9][0-9]{0,8}$'
    when 'cards' then target ~ '^((en|cn):)?[1-9][0-9]{0,8}$'
    else target ~ '^[1-9][0-9]{0,8}$' end)
);
create index bandori_favorites_count_idx on public.bandori_favorites(kind, target);
alter table public.bandori_favorites enable row level security;
revoke all on public.bandori_favorites from public, anon, authenticated;
grant select, insert, update, delete on public.bandori_favorites to service_role;
grant usage on sequence public.bandori_favorites_position_seq to service_role;

-- Apply visibility and read ordered items in one snapshot, including collections over the REST row limit.
create function public.read_bandori_favorites(p_public_uid bigint, p_viewer_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', g.kind, 'items', g.items) order by g.ordinality), '[]')
  from (
    select m.item->>'id' as kind, m.ordinality,
      jsonb_agg(jsonb_build_object('target', f.target, 'normalArt', f.normal_art) order by f.position desc) as items
    from public.profiles p
    left join public.profile_homepages h on h.user_id = p.id
    cross join lateral jsonb_array_elements(coalesce(h.preferences->'modules',
      '[{"id":"cards","public":true},{"id":"events","public":true},{"id":"songs","public":true}]'::jsonb))
      with ordinality as m(item, ordinality)
    join public.bandori_favorites f on f.kind = m.item->>'id' and f.user_id = p.id
    where (case when p_public_uid is null then p.id = p_viewer_id else p.public_uid = p_public_uid end)
      and (p.id = p_viewer_id or m.item->'public' = 'true'::jsonb)
    group by m.ordinality, m.item->>'id'
  ) g;
$$;
revoke all on function public.read_bandori_favorites(bigint, uuid) from public, anon, authenticated;
grant execute on function public.read_bandori_favorites(bigint, uuid) to service_role;
