-- Roll out with native email confirmations enabled and the new application.
-- Preserve trusted historical registrations; pending accounts remain restricted.
alter table public.profiles drop constraint if exists profiles_username_key;

update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('hhwx_registration', jsonb_build_object(
    'id', gen_random_uuid()::text, 'username', p.username))
from public.account_status s, public.profiles p
where s.user_id = u.id and p.id = u.id and s.email_verified_at is not null
  and u.raw_app_meta_data -> 'hhwx_registration' ->> 'id' is null;

-- End pending legacy email changes without changing the current login email.
-- These accounts use the same email-proof + final registration flow as new users.
delete from auth.one_time_tokens t using public.account_status s
where t.user_id = s.user_id and s.email_verified_at is null
  and t.token_type in ('email_change_token_new', 'email_change_token_current');
update auth.users u set email_change = '', email_change_token_new = '',
  email_change_token_current = '', email_change_confirm_status = 0, email_change_sent_at = null
from public.account_status s
where s.user_id = u.id and s.email_verified_at is null and coalesce(u.email_change, '') <> '';

create schema if not exists account_private;
revoke all on schema account_private from public, anon, authenticated;

-- The Auth admin API changes password + metadata in one transaction. Keeping the
-- completion marker immutable rejects concurrent/replayed finalization atomically.
create function account_private.complete_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  registration jsonb := new.raw_app_meta_data -> 'hhwx_registration';
  previous_registration jsonb := old.raw_app_meta_data -> 'hhwx_registration';
  display_name text;
begin
  if previous_registration ->> 'id' is not null then
    if registration is distinct from previous_registration then
      raise exception 'Registration is already complete' using errcode = '23514';
    end if;
    return new;
  end if;
  if registration ->> 'id' is null then return new; end if;
  if new.email_confirmed_at is null or coalesce(new.encrypted_password, '') = '' then
    raise exception 'Verified email and password are required' using errcode = '23514';
  end if;
  perform (registration ->> 'id')::uuid;
  display_name := btrim(registration ->> 'username');
  if display_name is null or char_length(display_name) not between 2 and 24 then
    raise exception 'Invalid display name' using errcode = '23514';
  end if;
  insert into public.profiles(id, username) values (new.id, display_name)
    on conflict (id) do update set username = excluded.username;
  insert into public.account_status(user_id, email_verified_at) values (new.id, now())
    on conflict (user_id) do update set email_verified_at = excluded.email_verified_at;
  return new;
end;
$$;
revoke all on function account_private.complete_registration() from public, anon, authenticated;
create trigger complete_hhwx_registration
before update of raw_app_meta_data on auth.users
for each row execute function account_private.complete_registration();

-- This is a completion projection for existing SQL consumers, not a second OTP
-- mechanism. Calendar writes also require a post-completion JWT so a revoked
-- pre-verification session cannot gain permissions after its owner completes.
create policy registration_insert on public.bandori_event_schedules_cn
as restrictive for insert to authenticated
with check (exists (select 1 from public.account_status s where s.user_id = (select auth.uid()) and s.email_verified_at is not null) and ((select auth.jwt()) -> 'app_metadata' -> 'hhwx_registration' ->> 'id') is not null);
create policy registration_update on public.bandori_event_schedules_cn
as restrictive for update to authenticated
using (exists (select 1 from public.account_status s where s.user_id = (select auth.uid()) and s.email_verified_at is not null))
with check (exists (select 1 from public.account_status s where s.user_id = (select auth.uid()) and s.email_verified_at is not null) and ((select auth.jwt()) -> 'app_metadata' -> 'hhwx_registration' ->> 'id') is not null);

-- Old links are intentionally retired. No accounts are deleted by this migration.
drop table public.account_email_verifications;
