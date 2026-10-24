begin;
select '1..1';
insert into auth.users(id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('d0000000-0000-4000-8000-000000000001','authenticated','authenticated','stamp-test@example.invalid',now(),'fixture',
  '{"provider":"email","providers":["email"]}','{"username":"stamp_test"}',now(),now());
set local role service_role;
do $$
declare a uuid := 'd0000000-0000-4000-8000-000000000001'; result jsonb; before_count bigint;
begin
  assert not has_function_privilege('anon','public.authorize_chat_stamp(uuid)','execute');
  assert not has_function_privilege('authenticated','public.authorize_chat_stamp(uuid)','execute');
  select count(*) into before_count from chat_private.messages;
  for i in 1..20 loop result := public.authorize_chat_stamp(a); end loop;
  assert result->>'nextStampAt' is not null;
  assert result->>'username' = 'stamp_test';
  assert (select stamp_count=20 and send_count=0 and upload_count=0 from chat_private.user_state where user_id=a);
  assert (select count(*)=before_count from chat_private.messages);
  begin
    perform public.authorize_chat_stamp(a); raise exception 'accepted overflow';
  exception when sqlstate 'P0001' then assert SQLERRM='CHAT_STAMP_COOLDOWN'; end;
  perform public.send_chat_message(a,gen_random_uuid(),'independent text quota');
  assert (select stamp_count=20 and send_count=1 from chat_private.user_state where user_id=a);
  update chat_private.user_state set stamp_window_started_at=now()-interval '61 seconds' where user_id=a;
  result := public.authorize_chat_stamp(a);
  assert result->>'nextStampAt' is null;
  assert (select stamp_count=1 from chat_private.user_state where user_id=a);
  update chat_private.user_state set muted_until=now()+interval '1 hour' where user_id=a;
  begin
    perform public.authorize_chat_stamp(a); raise exception 'accepted muted account';
  exception when sqlstate 'P0001' then assert SQLERRM='CHAT_MUTED'; end;
  assert (select stamp_count=1 from chat_private.user_state where user_id=a);
  begin
    perform public.authorize_chat_stamp(gen_random_uuid()); raise exception 'accepted unknown account';
  exception when sqlstate 'P0001' then assert SQLERRM='CHAT_ACCOUNT_REQUIRED'; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin
    perform public.authorize_chat_stamp('d0000000-0000-4000-8000-000000000001');
    raise exception 'client invoked privileged quota';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.authorize_chat_stamp('d0000000-0000-4000-8000-000000000001');
    raise exception 'guest invoked privileged quota';
  exception when insufficient_privilege then null; end;
end $$;
select 'ok 1 - stamp quota, reset, mute, no history, independent text quota and role denial';
rollback;
