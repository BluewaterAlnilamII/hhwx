-- Retired: Auth auto-confirm historically did not prove email ownership in HHWX.
-- Do not infer registration completion from auth.users.email_confirmed_at.
-- Use the canonical native_auth_otp_registration migration and the rollout
-- instructions in account-auth-flow.md.
do $$ begin
  raise exception 'Unsafe historical backfill is retired; see account-auth-flow.md';
end $$;
