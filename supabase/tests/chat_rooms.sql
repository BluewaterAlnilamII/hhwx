begin;
select '1..4';
insert into auth.users(id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('e0000000-0000-4000-8000-000000000001','authenticated','authenticated','room-test@example.invalid',now(),'fixture',
  '{"provider":"email","providers":["email"]}','{"username":"room_test"}',now(),now());
set local role service_role;
do $$
declare a uuid := 'e0000000-0000-4000-8000-000000000001'; r uuid := gen_random_uuid();
  saved jsonb; page jsonb; img jsonb; total integer; ids uuid[] := '{}'; item jsonb;
begin
  saved := public.send_chat_message(a,r,'red text','red');
  perform public.send_chat_message(a,gen_random_uuid(),'blue text','blue');
  perform public.send_chat_message(a,gen_random_uuid(),'default room');
  assert (select room_id='main' from chat_private.messages where content='default room' and user_id=a);
  assert jsonb_array_length(public.read_chat_messages(a)->'messages')=1;
  assert public.send_chat_message(a,r,'red text','red')->>'messageId'=saved->>'messageId';
  begin
    perform public.send_chat_message(a,r,'red text','blue'); raise exception 'cross-room retry accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='CHAT_REQUEST_CONFLICT'; end;
  begin
    perform public.delete_chat_message(a,(saved->>'messageId')::uuid,'blue'); raise exception 'cross-room delete accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='CHAT_NOT_FOUND'; end;
  perform public.delete_chat_message(a,(saved->>'messageId')::uuid,'red');
  begin
    perform public.send_chat_message(a,r,'red text','blue'); raise exception 'deleted cross-room retry accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='CHAT_REQUEST_CONFLICT'; end;
  assert (public.send_chat_message(a,r,'red text','red')->>'deleted')::boolean;
  r := gen_random_uuid();
  img := jsonb_build_object('key','user/images/temporary/'||a||'/'||r||'/'||repeat('a',64)||'.png',
    'width',10,'height',10,'bytes',100,'contentType','image/png','hash',repeat('a',64));
  saved := public.send_chat_image(a,r,img,'red');
  assert (select room_id='red' from chat_private.messages where id=(saved->>'messageId')::uuid);
  assert (select send_count=4 from chat_private.user_state where user_id=a), 'account quota is shared across rooms';
  update chat_private.user_state set send_count=20 where user_id=a;
  begin
    perform public.send_chat_message(a,gen_random_uuid(),'new room cannot bypass quota','green'); raise exception 'quota bypassed';
  exception when sqlstate 'P0001' then assert sqlerrm='CHAT_COOLDOWN'; end;
  update chat_private.user_state set send_count=0, muted_until=now()+interval '1 hour' where user_id=a;
  begin
    perform public.send_chat_message(a,gen_random_uuid(),'new room cannot bypass mute','green'); raise exception 'mute bypassed';
  exception when sqlstate 'P0001' then assert sqlerrm='CHAT_MUTED'; end;
  update chat_private.user_state set muted_until=null where user_id=a;
  insert into chat_private.messages(user_id,client_request_id,content,room_id,created_at)
    select a,gen_random_uuid(),'page',room,now()-interval '1 second'
    from unnest(array['red','blue']) room cross join generate_series(1,60);
  page := public.read_chat_messages(a,p_room_id=>'red'); total := 0;
  loop
    for item in select value from jsonb_array_elements(page->'messages') loop
      assert (select room_id='red' from chat_private.messages where id=(item->>'id')::uuid);
      assert not ((item->>'id')::uuid=any(ids)), 'pagination cannot repeat a row';
      ids := array_append(ids,(item->>'id')::uuid); total := total+1;
    end loop;
    exit when page->>'nextCursor' is null;
    page := public.read_chat_messages(a,(page#>>'{nextCursor,createdAt}')::timestamptz,(page#>>'{nextCursor,id}')::uuid,'red');
  end loop;
  assert total=61, 'room-scoped pagination must include all live text and images';
end $$;
reset role;
select 'ok 1 - room-scoped writes, pagination, deletion and retries preserve account-wide limits';

set local role service_role;
do $$
declare a uuid := 'e0000000-0000-4000-8000-000000000001'; live_count bigint; setting text;
begin
  select count(*) into live_count from chat_private.messages;
  for pass in 1..2 loop
    if pass=2 then
      foreach setting in array array['enable_hashjoin','enable_mergejoin','enable_hashagg','enable_sort','enable_material'] loop
        perform set_config(setting,'off',true);
      end loop;
    end if;
    insert into chat_private.messages(user_id,client_request_id,content,created_at,room_id)
      select a,gen_random_uuid(),'expired',now()-interval '31 days',case when n%2=0 then 'red' else 'blue' end
      from generate_series(1,1001) n;
    assert public.cleanup_chat_messages()=1000;
    assert public.cleanup_chat_messages()=1;
    assert public.cleanup_chat_messages()=0;
    assert (select count(*) from chat_private.messages)=live_count, 'live rows must survive both cleanup plans';
  end loop;
end $$;
reset role;
select 'ok 2 - retention stays bounded across rooms and alternate query plans';

do $$
declare role_name text; signature text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    foreach signature in array array['public.read_chat_messages(uuid,timestamptz,uuid,text)',
      'public.send_chat_message(uuid,uuid,text,text)','public.send_chat_image(uuid,uuid,jsonb,text)',
      'public.delete_chat_message(uuid,uuid,text)','chat_private.save_message(uuid,uuid,text,jsonb,text)'] loop
      assert not has_function_privilege(role_name,signature,'execute');
      assert has_function_privilege('service_role',signature,'execute');
    end loop;
  end loop;
  assert to_regprocedure('public.read_chat_messages(uuid,timestamptz,uuid)') is null;
  assert to_regprocedure('public.send_chat_message(uuid,uuid,text)') is null;
  assert to_regprocedure('public.send_chat_image(uuid,uuid,jsonb)') is null;
  assert to_regprocedure('public.delete_chat_message(uuid,uuid)') is null;
end $$;
select 'ok 3 - new signatures retain service-only grants without ambiguous overloads';

set local role authenticated;
do $$ begin
  begin perform public.send_chat_message(gen_random_uuid(),gen_random_uuid(),'forged','red'); raise exception 'client write allowed';
    exception when insufficient_privilege then null; end;
  begin perform public.delete_chat_message(gen_random_uuid(),gen_random_uuid(),'red'); raise exception 'client delete allowed';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.read_chat_messages(gen_random_uuid(),p_room_id=>'red'); raise exception 'guest read allowed';
    exception when insufficient_privilege then null; end;
  begin perform public.send_chat_image(gen_random_uuid(),gen_random_uuid(),'{}','red'); raise exception 'guest image allowed';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ok 4 - actual browser roles cannot invoke scoped room functions';
rollback;
