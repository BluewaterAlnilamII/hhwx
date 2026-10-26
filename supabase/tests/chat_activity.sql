begin;
select '1..3';
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, 'authenticated', 'authenticated', id::text || '@example.invalid', '{"provider":"email","providers":["email"]}',
  jsonb_build_object('username', 'activity_' || right(id::text, 4)), now(), now()
from unnest(array['d0000000-0000-4000-8000-000000000001'::uuid,'d0000000-0000-4000-8000-000000000002'::uuid]) id;

set local role service_role;
do $$
declare a uuid := 'd0000000-0000-4000-8000-000000000001'; b uuid := 'd0000000-0000-4000-8000-000000000002';
  own_id uuid; other_id uuid; activity jsonb; snapshot jsonb;
begin
  assert public.read_chat_activity(a) = '{"latest":null,"latestOther":null}'::jsonb;
  insert into chat_private.messages(user_id,client_request_id,content,created_at)
    values(b,gen_random_uuid(),'other',now()-interval '2 seconds') returning id into other_id;
  insert into chat_private.messages(user_id,client_request_id,content,created_at)
    values(a,gen_random_uuid(),'own',now()-interval '1 second') returning id into own_id;
  insert into chat_private.messages(user_id,client_request_id,content,created_at,room_id)
    values(b,gen_random_uuid(),'expired',now()-interval '31 days','main'),
      (b,gen_random_uuid(),'foreign',now(),'other');
  activity := public.read_chat_activity(a);
  assert activity->'latest'->>'id' = own_id::text;
  assert activity->'latestOther'->>'id' = other_id::text;
  assert not (activity::text like '%content%') and not (activity::text like '%username%');
  snapshot := public.read_chat_snapshot(a);
  assert snapshot->'activity' = activity and jsonb_array_length(snapshot->'messages') = 2;
  perform public.delete_chat_message(b, other_id);
  assert public.read_chat_activity(a)->'latestOther' = 'null'::jsonb;
end $$;
reset role;
select 'ok 1 - lightweight cursors exclude self, deleted, expired and foreign room messages';

do $$
declare role_name text; signature text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    execute format('set local role %I',role_name);
    begin
      perform public.read_chat_activity('d0000000-0000-4000-8000-000000000001');
      raise exception 'client executed summary';
    exception when insufficient_privilege then null; end;
    begin
      perform public.read_chat_snapshot('d0000000-0000-4000-8000-000000000001');
      raise exception 'client executed snapshot';
    exception when insufficient_privilege then null; end;
    reset role;
    foreach signature in array array['public.read_chat_activity(uuid,text)','public.read_chat_snapshot(uuid,text)'] loop
      assert not has_function_privilege(role_name,signature,'EXECUTE');
    end loop;
  end loop;
  assert has_function_privilege('service_role','public.read_chat_activity(uuid,text)','EXECUTE');
  assert has_function_privilege('service_role','public.read_chat_snapshot(uuid,text)','EXECUTE');
end $$;
select 'ok 2 - RPC execution is restricted to the service role';

set local role service_role;
do $$
begin
  begin
    perform public.read_chat_activity('d0000000-0000-4000-8000-000000000099');
    raise exception 'missing account accepted';
  exception when sqlstate 'P0001' then assert sqlerrm = 'CHAT_ACCOUNT_REQUIRED'; end;
end $$;
reset role;
select 'ok 3 - an unknown account cannot read summaries';
rollback;
