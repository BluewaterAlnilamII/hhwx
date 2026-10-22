-- Only dispatch timestamps are retained; Supabase Auth owns all OTPs and confirmations.
create table account_private.email_change_dispatches (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default clock_timestamp(),
  primary key (user_id, attempted_at)
);
alter table account_private.email_change_dispatches enable row level security;
revoke all on account_private.email_change_dispatches from public, anon, authenticated;
grant usage on schema account_private to service_role;
grant select, insert, delete on account_private.email_change_dispatches to service_role;

create function public.reserve_account_email_change(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  -- Serialize quota reservations across app processes before any Auth mutation.
  perform pg_advisory_xact_lock(20261022, 125530);
  delete from account_private.email_change_dispatches where attempted_at <= v_now - interval '1 hour';
  if exists (select 1 from account_private.email_change_dispatches
             where user_id = p_user_id and attempted_at > v_now - interval '60 seconds') then
    raise exception 'EMAIL_CHANGE_RATE_LIMITED';
  end if;
  if (select count(*) from account_private.email_change_dispatches) >= 60 then
    raise exception 'EMAIL_CHANGE_QUOTA_EXCEEDED';
  end if;
  insert into account_private.email_change_dispatches(user_id, attempted_at) values (p_user_id, v_now);
end;
$$;
revoke all on function public.reserve_account_email_change(uuid) from public, anon, authenticated;
grant execute on function public.reserve_account_email_change(uuid) to service_role;
