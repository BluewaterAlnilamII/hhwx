-- Public numeric profile UID for personal homepage links.
-- Keep auth.users.id as the private authorization identifier; public_uid is
-- only for public profile routing such as /u/10001.

create sequence if not exists public.profile_public_uid_seq
  start with 10001
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

alter table public.profiles
  add column if not exists public_uid bigint;

-- Backfill profile rows for historical auth users that do not yet have one.
-- The username follows the application fallback rule used by the profile API.
insert into public.profiles (id, username, created_at)
select
  users.id,
  'user_' || left(users.id::text, 8),
  users.created_at
from auth.users as users
where not exists (
  select 1
  from public.profiles as profiles
  where profiles.id = users.id
);

with ordered_profiles as (
  select
    profiles.id,
    10000 + row_number() over (
      order by users.created_at asc, users.id asc
    ) as assigned_public_uid
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.id
  where profiles.public_uid is null
)
update public.profiles as profiles
set public_uid = ordered_profiles.assigned_public_uid
from ordered_profiles
where profiles.id = ordered_profiles.id;

select setval(
  'public.profile_public_uid_seq',
  greatest(
    10000,
    coalesce((select max(public_uid) from public.profiles), 10000)
  ),
  true
);

alter table public.profiles
  alter column public_uid set default nextval('public.profile_public_uid_seq');

alter table public.profiles
  alter column public_uid set not null;

create unique index if not exists profiles_public_uid_key
  on public.profiles(public_uid);
