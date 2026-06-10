-- Apply Supabase Performance Advisor recommendations for auth RLS initplans
-- and missing foreign-key indexes. Keep unused-index cleanup separate because
-- usage statistics depend on real traffic and observation windows.

create index if not exists idx_comments_root_id
  on public.comments(root_id);

create index if not exists idx_comments_moderated_by
  on public.comments(moderated_by);

create index if not exists idx_comment_reports_reporter_user_id
  on public.comment_reports(reporter_user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists guestbook_comments_insert_own on public.guestbook_comments;
create policy guestbook_comments_insert_own
  on public.guestbook_comments
  for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists guestbook_comments_delete_own on public.guestbook_comments;
create policy guestbook_comments_delete_own
  on public.guestbook_comments
  for delete
  using ((select auth.uid()) = user_id);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
  on public.comments
  for insert
  with check ((select auth.uid()) = user_id and moderation_status = 'visible');

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
  on public.comments
  for update
  using ((select auth.uid()) = user_id and deleted_at is null and moderation_status = 'visible')
  with check ((select auth.uid()) = user_id and moderation_status = 'visible');

drop policy if exists comment_reports_insert_own on public.comment_reports;
create policy comment_reports_insert_own
  on public.comment_reports
  for insert
  with check ((select auth.uid()) = reporter_user_id);

drop policy if exists bandori_event_schedules_cn_insert_editor on public.bandori_event_schedules_cn;
create policy bandori_event_schedules_cn_insert_editor
  on public.bandori_event_schedules_cn
  for insert
  with check (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = (select auth.uid())
        and user_roles.role = 'calendar_editor'
    )
  );

drop policy if exists bandori_event_schedules_cn_update_editor on public.bandori_event_schedules_cn;
create policy bandori_event_schedules_cn_update_editor
  on public.bandori_event_schedules_cn
  for update
  using (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = (select auth.uid())
        and user_roles.role = 'calendar_editor'
    )
  );

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own
  on public.user_roles
  for select
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read own game bind challenges" on public.user_game_bind_challenges;
create policy "Users can read own game bind challenges"
  on public.user_game_bind_challenges
  for select
  to authenticated
  using ((select auth.uid()) = web_user_id);

drop policy if exists "Users can insert own game bind challenges" on public.user_game_bind_challenges;
create policy "Users can insert own game bind challenges"
  on public.user_game_bind_challenges
  for insert
  to authenticated
  with check ((select auth.uid()) = web_user_id);

drop policy if exists "Users can update own game bind challenges" on public.user_game_bind_challenges;
create policy "Users can update own game bind challenges"
  on public.user_game_bind_challenges
  for update
  to authenticated
  using ((select auth.uid()) = web_user_id)
  with check ((select auth.uid()) = web_user_id);

drop policy if exists "Users can delete own game bind challenges" on public.user_game_bind_challenges;
create policy "Users can delete own game bind challenges"
  on public.user_game_bind_challenges
  for delete
  to authenticated
  using ((select auth.uid()) = web_user_id);

drop policy if exists "Users can read own game uid bindings" on public.user_game_bindings;
create policy "Users can read own game uid bindings"
  on public.user_game_bindings
  for select
  to authenticated
  using ((select auth.uid()) = web_user_id);

drop policy if exists "Users can delete own game uid bindings" on public.user_game_bindings;
create policy "Users can delete own game uid bindings"
  on public.user_game_bindings
  for delete
  to authenticated
  using ((select auth.uid()) = web_user_id);

drop policy if exists "Users can read own game profiles" on public.user_game_profiles;
create policy "Users can read own game profiles"
  on public.user_game_profiles
  for select
  to authenticated
  using ((select auth.uid()) = web_user_id);

drop policy if exists "Users can delete own game profiles" on public.user_game_profiles;
create policy "Users can delete own game profiles"
  on public.user_game_profiles
  for delete
  to authenticated
  using ((select auth.uid()) = web_user_id);
