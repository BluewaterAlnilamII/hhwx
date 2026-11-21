-- Private preferences are projected by the web API, never exposed as raw settings.
create table public.profile_homepages (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object')
);
alter table public.profile_homepages enable row level security;
revoke all on public.profile_homepages from public, anon, authenticated;
grant select, insert, update, delete on public.profile_homepages to service_role;

-- Merge only changed fields so signature and privacy writes cannot overwrite each other.
create function public.update_profile_homepage(p_user_id uuid, p_patch jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  insert into public.profile_homepages (user_id, preferences) values (p_user_id, p_patch)
  on conflict (user_id) do update
    set preferences = public.profile_homepages.preferences || excluded.preferences
  returning preferences;
$$;
revoke all on function public.update_profile_homepage(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_profile_homepage(uuid, jsonb) to service_role;
