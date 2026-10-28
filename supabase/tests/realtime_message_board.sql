begin;
select '1..2';

do $$ begin
  assert exists (select 1 from cron.job where jobname='hhwx-chat-retention'
    and schedule='*/10 * * * *' and command='select public.cleanup_chat_messages()' and active);
end $$;

insert into auth.users (id, aud, role, email, email_confirmed_at, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('c0000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'authenticated', 'authenticated',
  'chat-test-' || n || '@example.invalid', now(), case when n=4 then 'legacy-password-fixture' else '' end,
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('username', 'chat_test_' || n), now(), now() from generate_series(1,4) n;
-- Complete registrations through the Auth trigger, never by seeding verified status.
update auth.users set encrypted_password='password-fixture',
  raw_app_meta_data=raw_app_meta_data || jsonb_build_object('hhwx_registration',
    jsonb_build_object('id',gen_random_uuid()::text,'username',raw_user_meta_data->>'username'))
where id in ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003');
insert into public.user_roles(user_id,role) values ('c0000000-0000-4000-8000-000000000003','chat_moderator');
set local role service_role;

do $$
declare a uuid := 'c0000000-0000-4000-8000-000000000001';
  b uuid := 'c0000000-0000-4000-8000-000000000002';
  m uuid := 'c0000000-0000-4000-8000-000000000003';
  r uuid := gen_random_uuid(); saved jsonb; again jsonb; event jsonb; page jsonb; total integer;
begin
  assert not has_schema_privilege('anon','chat_private','USAGE');
  assert not has_schema_privilege('authenticated','chat_private','USAGE');
  assert not has_function_privilege('authenticated','public.send_chat_message(uuid,uuid,text,text,uuid,jsonb)','EXECUTE');
  assert not has_function_privilege('anon','public.read_chat_messages(uuid,timestamptz,uuid,text)','EXECUTE');
  assert has_function_privilege('service_role','public.send_chat_message(uuid,uuid,text,text,uuid,jsonb)','EXECUTE');
  assert not (public.read_chat_viewer(b) ? 'emailVerified');
  assert jsonb_array_length(public.read_chat_messages(b)->'messages') = 0;
  saved := public.send_chat_message(a,r,repeat('汉',1000));
  again := public.send_chat_message(a,r,repeat('汉',1000));
  assert saved->>'messageId' = again->>'messageId';
  assert (select count(*) from chat_private.messages where user_id=a and client_request_id=r) = 1;
  begin perform public.send_chat_message(a,r,'different'); raise exception 'conflict allowed';
    exception when sqlstate 'P0001' then assert sqlerrm = 'CHAT_REQUEST_CONFLICT'; end;
  assert (select send_count from chat_private.user_state where user_id=a) = 1, 'retry counts once';
  begin perform public.send_chat_message(m,gen_random_uuid(),repeat('汉',1001)); raise exception 'oversize allowed';
    exception when sqlstate 'P0001' then assert sqlerrm = 'CHAT_INVALID_CONTENT'; end;
  begin perform public.delete_chat_message(b,(saved->>'messageId')::uuid); raise exception 'delete bypassed';
    exception when sqlstate 'P0001' then assert sqlerrm = 'CHAT_FORBIDDEN'; end;
  begin perform public.set_chat_mute(a,b,now()+interval '1 hour'); raise exception 'mute bypassed';
    exception when sqlstate 'P0001' then assert sqlerrm = 'CHAT_FORBIDDEN'; end;
  perform public.set_chat_mute(m,a,now()+interval '1 hour');
  begin perform public.send_chat_message(a,gen_random_uuid(),'muted'); raise exception 'mute ignored';
    exception when sqlstate 'P0001' then assert sqlerrm = 'CHAT_MUTED'; end;
  event := public.delete_chat_message(a,(saved->>'messageId')::uuid);
  assert public.delete_chat_message(a,(saved->>'messageId')::uuid) = event;
  assert (select content is null from chat_private.messages where id=(saved->>'messageId')::uuid);
  assert (public.send_chat_message(a,r,'deleted retry')->>'deleted')::boolean;
  assert jsonb_array_length(public.read_chat_messages(a)->'messages') = 0;
  perform public.set_chat_mute(m,a,null);
  assert public.read_chat_viewer(a)->>'mutedUntil' is null;

  insert into chat_private.messages(user_id,client_request_id,content,created_at)
  select a,gen_random_uuid(),'page',now()-interval '1 second' from generate_series(1,101);
  page := public.read_chat_messages(a);
  assert jsonb_array_length(page->'messages') = 50;
  total := 50;
  while page->>'nextCursor' is not null loop
    page := public.read_chat_messages(a,(page#>>'{nextCursor,createdAt}')::timestamptz,(page#>>'{nextCursor,id}')::uuid);
    total := total + jsonb_array_length(page->'messages');
  end loop;
  assert total = 101, 'same-timestamp pagination must not lose rows';
  insert into chat_private.messages(user_id,client_request_id,content,created_at)
  select a,gen_random_uuid(),'expired',now()-interval '31 days' from generate_series(1,1001);
  assert public.cleanup_chat_messages() = 1000;
  assert public.cleanup_chat_messages() = 1;
end $$;

reset role;

select 'ok 1 - chat permissions, mutations, idempotency, cursor and retention';

-- Chat receives an authenticated actor from the HTTP boundary and must not query email status.
revoke select on public.account_status from service_role;
set local role service_role;
do $$
declare actor uuid := 'c0000000-0000-4000-8000-000000000002';
  legacy uuid := 'c0000000-0000-4000-8000-000000000004';
  r uuid := gen_random_uuid(); saved jsonb;
begin
  assert not has_table_privilege('service_role','public.account_status','SELECT');
  assert not (public.read_chat_viewer(actor) ? 'emailVerified');
  saved := public.send_chat_message(actor,r,'first');
  for n in 2..20 loop perform public.send_chat_message(actor,gen_random_uuid(),'burst ' || n); end loop;
  assert (select send_count from chat_private.user_state where user_id=actor) = 20;
  assert public.read_chat_viewer(actor)->>'nextSendAt' is not null;
  assert public.send_chat_message(actor,r,'first')->>'messageId' = saved->>'messageId';
  assert (select send_count from chat_private.user_state where user_id=actor) = 20;
  begin perform public.send_chat_message(actor,gen_random_uuid(),'twenty first'); raise exception 'quota bypassed';
    exception when sqlstate 'P0001' then assert sqlerrm = 'CHAT_COOLDOWN'; end;
  assert (select count(*) from chat_private.messages where user_id=actor) = 20;
  perform public.delete_chat_message(actor,(saved->>'messageId')::uuid);
  assert (public.send_chat_message(actor,r,'deleted retry')->>'deleted')::boolean;
  assert (select send_count from chat_private.user_state where user_id=actor) = 20, 'deletion cannot refund quota';
  update chat_private.user_state set send_window_started_at=clock_timestamp()-interval '61 seconds' where user_id=actor;
  assert public.read_chat_viewer(actor)->>'nextSendAt' is null;
  perform public.send_chat_message(actor,gen_random_uuid(),'new window');
  assert (select send_count from chat_private.user_state where user_id=actor) = 1;
  begin perform public.send_chat_message(actor,gen_random_uuid(),repeat('x',1001)); raise exception 'oversize allowed';
    exception when sqlstate 'P0001' then assert sqlerrm = 'CHAT_INVALID_CONTENT'; end;
  assert (select send_count from chat_private.user_state where user_id=actor) = 1;
  assert jsonb_array_length(public.read_chat_messages(actor)->'messages') = 50;
  -- Existing authenticated legacy identities use the same chat policy, with no second email gate.
  saved := public.send_chat_message(legacy,gen_random_uuid(),'authenticated legacy account');
  assert saved#>>'{message,author,userId}' = legacy::text;
end $$;
reset role;
select 'ok 2 - 20 per 60 seconds, idempotent quota and no email-status reads';
rollback;
