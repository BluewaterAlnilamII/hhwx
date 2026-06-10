-- Align existing production schemas with the baseline migration state.
-- This migration is intentionally idempotent so it can run on both the
-- production project, which has historical duplicate policies, and a fresh
-- local database rebuilt from the baseline migration.

drop policy if exists "Allow public read access" on public.bandori_tracker_data;

drop policy if exists "Auth insert" on public.guestbook_comments;
drop policy if exists "Public read" on public.guestbook_comments;
drop policy if exists "comments_delete_own" on public.guestbook_comments;
drop policy if exists "comments_insert_authenticated" on public.guestbook_comments;
drop policy if exists "comments_insert_own" on public.guestbook_comments;
drop policy if exists "comments_select_all" on public.guestbook_comments;
drop policy if exists "comments_select_public" on public.guestbook_comments;

drop policy if exists "Owner insert" on public.profiles;
drop policy if exists "Public read" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "profiles_select_all" on public.profiles;

drop function if exists public.handle_new_user();

update public.guestbook_comments
set created_at = now()
where created_at is null;

alter table public.guestbook_comments
  alter column created_at set not null;
