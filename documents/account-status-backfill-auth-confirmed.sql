-- Backfill application-side email verification state from Supabase Auth.
--
-- Use this once after applying account-status-schema.sql when existing users
-- who already completed Supabase Auth email confirmation should stay verified
-- in the application-side authorization model.
--
-- This preserves any account_status rows that are already verified. Users whose
-- auth.users.email_confirmed_at is null remain unverified.

insert into public.account_status (
  user_id,
  email_verified_at,
  created_at,
  updated_at
)
select
  users.id,
  users.email_confirmed_at,
  now(),
  now()
from auth.users as users
where users.email_confirmed_at is not null
on conflict (user_id) do update
set
  email_verified_at = excluded.email_verified_at,
  updated_at = now()
where
  public.account_status.email_verified_at is null
  and excluded.email_verified_at is not null;

