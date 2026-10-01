begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

select ok(has_function_privilege('service_role',
  'public.upsert_auto_game_profile(uuid,text,text,text,text,integer,integer,jsonb)', 'EXECUTE'),
  'the private save RPC remains available to service_role');
select ok(has_function_privilege('service_role',
  'public.unbind_game_uid(text,uuid)', 'EXECUTE'),
  'the private unbind RPC remains available to service_role');

set local role anon;
select throws_ok($$select public.upsert_auto_game_profile(
  '00000000-0000-0000-0000-000000000001', '1001', 'test', 'test', 'test', 1, 1, '{}')$$,
  '42501', 'permission denied for function upsert_auto_game_profile', 'anon cannot save');
select throws_ok($$select public.unbind_game_uid(
  '1001', '00000000-0000-0000-0000-000000000001')$$,
  '42501', 'permission denied for function unbind_game_uid', 'anon cannot unbind');
reset role;
set local role authenticated;
select throws_ok($$select public.upsert_auto_game_profile(
  '00000000-0000-0000-0000-000000000001', '1001', 'test', 'test', 'test', 1, 1, '{}')$$,
  '42501', 'permission denied for function upsert_auto_game_profile', 'authenticated cannot save');
select throws_ok($$select public.unbind_game_uid(
  '1001', '00000000-0000-0000-0000-000000000001')$$,
  '42501', 'permission denied for function unbind_game_uid', 'authenticated cannot unbind');
reset role;

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'snapshot-ownership@example.invalid', now(), '{}', '{}');
insert into public.user_game_bindings (game_uid, web_user_id)
values ('1001', '00000000-0000-0000-0000-000000000001');

set local role service_role;
select lives_ok($$select public.upsert_auto_game_profile(
  '00000000-0000-0000-0000-000000000001', '1001', 'test', 'test', repeat('0', 64), 1, 1, '{}')$$,
  'current owner can save');
select public.unbind_game_uid('1001', '00000000-0000-0000-0000-000000000001');
select is((select count(*) from public.user_game_bindings where game_uid = '1001'),
  0::bigint, 'unbind removes the binding');
select is((select count(*) from public.user_game_profiles where source_game_uid = '1001'),
  0::bigint, 'unbind removes the saved auto profile');
select throws_ok($$select public.upsert_auto_game_profile(
  '00000000-0000-0000-0000-000000000001', '1001', 'test', 'test', repeat('0', 64), 1, 1, '{}')$$,
  'P0001', 'game uid is not bound to user', 'an owner who unbound while waiting cannot save');
select throws_ok($$select public.upsert_auto_game_profile(
  null, '1001', 'test', 'test', repeat('0', 64), 1, 1, '{}')$$,
  'P0001', 'web_user_id is required', 'missing owner is rejected');
select throws_ok($$select public.unbind_game_uid('1001', null)$$,
  'P0001', 'web_user_id is required', 'unbind rejects a missing owner');
reset role;

create extension if not exists dblink with schema extensions;
select lives_ok($test$
do $race$
declare
  connection_string text := format(
    'hostaddr=%s port=%s dbname=%I user=postgres password=postgres',
    coalesce(host(inet_server_addr()), '127.0.0.1'), current_setting('port'), current_database());
  owner_id uuid := '00000000-0000-0000-0000-000000001004';
  game_uid text := '9900101001';
  save_query text := format(
    'select id from public.upsert_auto_game_profile(%L, %L, ''race'', ''test'', repeat(''0'', 64), 1, 1, ''{}'')',
    owner_id, game_uid);
  unbind_query text := format('do $unbind$ begin perform public.unbind_game_uid(%L, %L); end $unbind$',
    game_uid, owner_id);
  holder_pid integer;
  waiter_pid integer;
  save_first boolean;
  blocked boolean;
  remaining bigint;
  connection_name text;
begin
  perform dblink_connect('profile_lock_holder', connection_string);
  perform dblink_connect('profile_lock_waiter', connection_string);
  select pid into holder_pid from dblink('profile_lock_holder', 'select pg_backend_pid()') as result(pid integer);
  select pid into waiter_pid from dblink('profile_lock_waiter', 'select pg_backend_pid()') as result(pid integer);
  perform dblink_exec('profile_lock_holder', format(
    'insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
     values (%L, ''authenticated'', ''authenticated'', ''profile-lock@example.invalid'', ''{}'', ''{}'')', owner_id));
  perform dblink_exec('profile_lock_holder', 'set statement_timeout = ''5s''');
  perform dblink_exec('profile_lock_waiter', 'set statement_timeout = ''5s''; set role service_role');

  foreach save_first in array array[true, false] loop
    perform dblink_exec('profile_lock_holder', format(
      'insert into public.user_game_bindings (game_uid, web_user_id) values (%L, %L)', game_uid, owner_id));
    perform dblink_exec('profile_lock_holder', 'begin; set local role service_role');
    if save_first then
      perform id from dblink('profile_lock_holder', save_query) as result(id uuid);
      perform dblink_send_query('profile_lock_waiter', unbind_query);
    else
      perform dblink_exec('profile_lock_holder', unbind_query);
      perform dblink_send_query('profile_lock_waiter', save_query);
    end if;

    blocked := false;
    for attempt in 1..200 loop
      select exists(select 1 from pg_locks where pid = waiter_pid and locktype = 'advisory' and not granted)
        and holder_pid = any(pg_blocking_pids(waiter_pid)) into blocked;
      exit when blocked;
      perform pg_sleep(0.01);
    end loop;
    if not blocked then
      raise exception 'save_first=%: the competing RPC did not wait on the UID lock', save_first;
    end if;
    perform dblink_exec('profile_lock_holder', 'commit');

    if save_first then
      perform status from dblink_get_result('profile_lock_waiter') as result(status text);
      perform status from dblink_get_result('profile_lock_waiter') as result(status text);
    else
      perform id from dblink_get_result('profile_lock_waiter', false) as result(id uuid);
      if position('game uid is not bound to user' in dblink_error_message('profile_lock_waiter')) = 0 then
        raise exception 'save after unbind did not reject the old owner';
      end if;
      perform id from dblink_get_result('profile_lock_waiter', false) as result(id uuid);
    end if;
    select total into remaining from dblink('profile_lock_holder', format(
      'select (select count(*) from public.user_game_bindings where game_uid = %L)
       + (select count(*) from public.user_game_profiles where source_game_uid = %L)', game_uid, game_uid)) as result(total bigint);
    if remaining <> 0 then
      raise exception 'save_first=%: unbind left a binding or auto profile', save_first;
    end if;
  end loop;
  perform dblink_disconnect('profile_lock_holder');
  perform dblink_disconnect('profile_lock_waiter');
  perform dblink_exec(connection_string, format('delete from auth.users where id = %L', owner_id));
exception when others then
  foreach connection_name in array array['profile_lock_holder', 'profile_lock_waiter'] loop
    if connection_name = any(coalesce(dblink_get_connections(), array[]::text[])) then
      perform dblink_disconnect(connection_name);
    end if;
  end loop;
  perform dblink_exec(connection_string, format('delete from auth.users where id = %L', owner_id));
  raise;
end;
$race$;
$test$, 'save and unbind serialize in both orders without leaving an auto profile');
select * from finish();
rollback;
