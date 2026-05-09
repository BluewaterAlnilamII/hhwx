-- Private account authorization state.
-- Apply this after the existing auth/profile schema and before enabling
-- application-side email verification in production.

create table if not exists public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_account_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_account_status_updated_at on public.account_status;
create trigger set_account_status_updated_at
  before update on public.account_status
  for each row
  execute function public.set_account_status_updated_at();

alter table public.account_status enable row level security;

drop policy if exists "Users can read own account status" on public.account_status;
create policy "Users can read own account status"
  on public.account_status
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.account_status from public, anon, authenticated;
grant select on public.account_status to authenticated;
grant all on public.account_status to service_role;

create table if not exists public.account_email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists account_email_verifications_user_id_idx
  on public.account_email_verifications(user_id, created_at desc);

alter table public.account_email_verifications enable row level security;

revoke all on public.account_email_verifications from public, anon, authenticated;
grant all on public.account_email_verifications to service_role;
