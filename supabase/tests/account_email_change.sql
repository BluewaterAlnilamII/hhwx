begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
('c1111111-1111-4111-8111-111111111111','dispatch-a@auth-test.invalid','{}','{}'),
('c2222222-2222-4222-8222-222222222222','dispatch-b@auth-test.invalid','{}','{}');
delete from account_private.email_change_dispatches;
set local role anon;
select throws_ok($$select public.reserve_account_email_change('c1111111-1111-4111-8111-111111111111')$$,'42501',null,'anonymous clients cannot reserve dispatch');
set local role authenticated;
select throws_ok($$select public.reserve_account_email_change('c1111111-1111-4111-8111-111111111111')$$,'42501',null,'authenticated clients cannot bypass server proof checks');
select throws_ok($$select * from account_private.email_change_dispatches$$,'42501',null,'dispatch timestamps remain private');
set local role service_role;
select lives_ok($$select public.reserve_account_email_change('c1111111-1111-4111-8111-111111111111')$$,'server can reserve a dispatch');
select throws_ok($$select public.reserve_account_email_change('c1111111-1111-4111-8111-111111111111')$$,'P0001','EMAIL_CHANGE_RATE_LIMITED','duplicate requests are limited before Auth mutation');
reset role;
insert into account_private.email_change_dispatches(user_id,attempted_at)
select 'c1111111-1111-4111-8111-111111111111',now()-interval '2 minutes'-n*interval '1 second' from generate_series(1,59) n;
set local role service_role;
select throws_ok($$select public.reserve_account_email_change('c2222222-2222-4222-8222-222222222222')$$,'P0001','EMAIL_CHANGE_QUOTA_EXCEEDED','hourly dispatch limit applies across accounts');
reset role;
update account_private.email_change_dispatches set attempted_at=attempted_at-interval '2 hours';
set local role service_role;
select lives_ok($$select public.reserve_account_email_change('c1111111-1111-4111-8111-111111111111')$$,'expired dispatch history does not block new requests');
select is((select count(*)::int from account_private.email_change_dispatches),1,'old dispatch records are pruned');
reset role;
select * from finish();
rollback;
