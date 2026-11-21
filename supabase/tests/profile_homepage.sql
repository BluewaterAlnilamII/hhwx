begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);
select ok((select relrowsecurity from pg_class where oid = 'public.profile_homepages'::regclass), 'homepage preferences use RLS');
select ok(not has_table_privilege('anon', 'public.profile_homepages', 'SELECT'), 'anonymous cannot inspect hidden account IDs');
select ok(not has_table_privilege('authenticated', 'public.profile_homepages', 'SELECT'), 'authenticated cannot inspect another owner settings');
select ok(not has_table_privilege('authenticated', 'public.profile_homepages', 'UPDATE'), 'writes go through authenticated web API');
select ok(not has_function_privilege('anon', 'public.update_profile_homepage(uuid,jsonb)', 'EXECUTE'), 'anonymous cannot call update');
select ok(not has_function_privilege('authenticated', 'public.update_profile_homepage(uuid,jsonb)', 'EXECUTE'), 'client cannot spoof RPC owner');
select ok(has_function_privilege('service_role', 'public.update_profile_homepage(uuid,jsonb)', 'EXECUTE'), 'web service can persist verified writes');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('c42b6b39-ef78-4536-8f58-000000000001', 'authenticated', 'authenticated', 'homepage-1@example.invalid', '{}', '{"username":"homepage_one"}'),
       ('c42b6b39-ef78-4536-8f58-000000000002', 'authenticated', 'authenticated', 'homepage-2@example.invalid', '{}', '{"username":"homepage_two"}');
insert into public.profiles (id, username) values
  ('c42b6b39-ef78-4536-8f58-000000000001', 'homepage_one'),
  ('c42b6b39-ef78-4536-8f58-000000000002', 'homepage_two') on conflict (id) do nothing;

set local role authenticated;
select throws_ok('select * from public.profile_homepages', '42501', null, 'authenticated reads are denied at runtime');
select throws_ok($$insert into public.profile_homepages (user_id) values ('c42b6b39-ef78-4536-8f58-000000000001')$$, '42501', null, 'client inserts are denied');
select throws_ok($$select public.update_profile_homepage('c42b6b39-ef78-4536-8f58-000000000002','{}')$$, '42501', null, 'client cannot impersonate an owner');
reset role;
set local role anon;
select throws_ok('select * from public.profile_homepages', '42501', null, 'anonymous reads are denied at runtime');
select throws_ok($$select public.update_profile_homepage('c42b6b39-ef78-4536-8f58-000000000001','{}')$$, '42501', null, 'anonymous writes are denied at runtime');
reset role;
set local role service_role;
select is(public.update_profile_homepage('c42b6b39-ef78-4536-8f58-000000000001', '{"signature":"one"}')::text, '{"signature":"one"}'::jsonb::text, 'service creates preferences');
select is(public.update_profile_homepage('c42b6b39-ef78-4536-8f58-000000000001', '{"publicAccounts":false}')::text, '{"signature":"one","publicAccounts":false}'::jsonb::text, 'partial writes preserve unrelated settings');
select is(public.update_profile_homepage('c42b6b39-ef78-4536-8f58-000000000002', '{"signature":"two"}')::text, '{"signature":"two"}'::jsonb::text, 'second owner has independent settings');
select is((select preferences->>'signature' from public.profile_homepages where user_id='c42b6b39-ef78-4536-8f58-000000000001'), 'one', 'second owner write leaves first owner untouched');
reset role;
delete from public.profiles where id='c42b6b39-ef78-4536-8f58-000000000001';
select is((select count(*) from public.profile_homepages where user_id='c42b6b39-ef78-4536-8f58-000000000001'), 0::bigint, 'deleting profile removes private settings');
select * from finish();
rollback;
