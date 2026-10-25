begin;
select '1..3';
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('f0000000-0000-4000-8000-000000000001','authenticated','authenticated','reading-test@example.invalid',
 '{"provider":"email","providers":["email"]}','{"username":"reading_test"}',now(),now());
set local role service_role;
do $$
declare a uuid := 'f0000000-0000-4000-8000-000000000001'; page jsonb; item jsonb; ids uuid[] := '{}';
  cursor_at timestamptz := now()-interval '2 seconds'; cursor_id uuid := '00000000-0000-0000-0000-000000000000';
  deleted_id uuid; expired_id uuid; foreign_id uuid; total integer := 0;
begin
  insert into chat_private.messages(user_id,client_request_id,content,created_at)
    select a,gen_random_uuid(),'forward',now()-interval '1 second' from generate_series(1,121);
  insert into chat_private.messages(user_id,client_request_id,content,created_at)
    values(a,gen_random_uuid(),'expired',now()-interval '31 days') returning id into expired_id;
  insert into chat_private.messages(user_id,client_request_id,content,room_id)
    values(a,gen_random_uuid(),'foreign','other') returning id into foreign_id;
  select id into deleted_id from chat_private.messages where content='forward' limit 1;
  perform public.delete_chat_message(a,deleted_id);
  loop
    page := public.read_newer_chat_messages(a,cursor_at,cursor_id);
    assert jsonb_array_length(page->'messages')=case when total<100 then 50 else 20 end;
    for item in select value from jsonb_array_elements(page->'messages') loop
      assert not ((item->>'id')::uuid=any(ids));
      assert ((item->>'createdAt')::timestamptz,(item->>'id')::uuid) > (cursor_at,cursor_id);
      cursor_at := (item->>'createdAt')::timestamptz; cursor_id := (item->>'id')::uuid;
      ids := array_append(ids,cursor_id); total := total+1;
    end loop;
    exit when not (page->>'hasMore')::boolean;
  end loop;
  assert total=120;
  page := public.read_newer_chat_messages(a,cursor_at,ids[70]);
  assert jsonb_array_length(page->'messages')=50 and not (page->>'hasMore')::boolean;
  assert public.read_newer_chat_messages(a,cursor_at,cursor_id)='{"messages":[],"hasMore":false}'::jsonb;
end $$;
reset role;
select 'ok 1 - forward keysets, ties, gaps, deletion, retention and room isolation';

do $$
declare role_name text; signature text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    execute format('set local role %I',role_name);
    begin
      perform public.read_newer_chat_messages('f0000000-0000-4000-8000-000000000001',now(),gen_random_uuid());
      raise exception 'client executed forward read';
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;
  foreach signature in array array['public.read_newer_chat_messages(uuid,timestamptz,uuid,text)'] loop
    assert not (select prosecdef from pg_proc where oid=signature::regprocedure);
    assert has_function_privilege('service_role',signature,'execute');
  end loop;
end $$;
select 'ok 2 - client roles cannot execute service-only invoker reads';
set local role service_role;
do $$
declare a uuid := 'f0000000-0000-4000-8000-000000000001'; r uuid; img jsonb; dims integer[];
begin
  foreach dims slice 1 in array array[[1000,12000],[4096,4096],[1,16383],[4096,4097],[1,16384]] loop
    r := gen_random_uuid();
    img := jsonb_build_object('key','user/images/temporary/'||a||'/'||r||'/'||repeat('a',64)||'.png',
      'width',dims[1],'height',dims[2],'bytes',20971520,'contentType','image/png','hash',repeat('a',64));
    if dims[1]::bigint*dims[2]<=16777216 and dims[2]<=16383 then
      perform public.send_chat_image(a,r,img);
    else
      begin
        perform public.send_chat_image(a,r,img); raise exception 'oversized metadata accepted';
      exception when check_violation then null; end;
    end if;
  end loop;
end $$;
reset role;
select 'ok 3 - long images, inclusive pixel boundaries and both rejection paths';
rollback;
