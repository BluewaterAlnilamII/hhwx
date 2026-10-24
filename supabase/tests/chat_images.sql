begin;
select '1..1';

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
declare a uuid:='c0000000-0000-4000-8000-000000000001'; r uuid:=gen_random_uuid();
 img jsonb; saved jsonb; again jsonb; cnt integer;
begin
 assert not has_function_privilege('anon','public.send_chat_image(uuid,uuid,jsonb,text)','EXECUTE');
 assert not has_function_privilege('authenticated','public.authorize_chat_image_upload(uuid)','EXECUTE');
 img:=jsonb_build_object('key','user/images/temporary/'||a||'/'||r||'/'||repeat('a',64)||'.gif',
 'width',4096,'height',200,'bytes',20971520,'contentType','image/gif','hash',repeat('a',64));
 perform public.authorize_chat_image_upload(a);
 assert (select send_count=0 and upload_count=1 from chat_private.user_state where user_id=a);
 saved:=public.send_chat_image(a,r,img);
 assert saved->'message'->>'content'='';
 assert saved->'message'->'image'=img;
 again:=public.send_chat_image(a,r,img);
 assert saved->>'messageId'=again->>'messageId';
 assert (select send_count=1 from chat_private.user_state where user_id=a);
 assert (public.read_chat_messages(a)->'messages') @> jsonb_build_array(saved->'message');
 begin
   perform public.send_chat_message(a,r,'different kind'); raise exception 'accepted conflicting message';
 exception when sqlstate 'P0001' then assert SQLERRM='CHAT_REQUEST_CONFLICT'; end;
 perform public.delete_chat_message(a,(saved->>'messageId')::uuid);
 assert (public.send_chat_image(a,r,img)->>'deleted')::boolean;
 assert (select image_key is null from chat_private.messages where id=(saved->>'messageId')::uuid);
 for i in 1..19 loop perform public.send_chat_message(a,gen_random_uuid(),'text'); end loop;
 begin
   perform public.send_chat_image(a,gen_random_uuid(),img); raise exception 'accepted quota overflow';
 exception when sqlstate 'P0001' then assert SQLERRM='CHAT_COOLDOWN'; end;
 update chat_private.user_state set send_window_started_at=now()-interval '61 seconds' where user_id=a;
 for i in 1..19 loop perform public.authorize_chat_image_upload(a); end loop;
 begin
   perform public.authorize_chat_image_upload(a); raise exception 'accepted upload overflow';
 exception when sqlstate 'P0001' then assert SQLERRM='CHAT_UPLOAD_COOLDOWN'; end;
 update chat_private.user_state set upload_window_started_at=now()-interval '61 seconds',muted_until=now()+interval '1 hour' where user_id=a;
 begin
   perform public.authorize_chat_image_upload(a); raise exception 'muted upload accepted';
 exception when sqlstate 'P0001' then assert SQLERRM='CHAT_MUTED'; end;
 begin
   perform public.send_chat_image(a,gen_random_uuid(),img); raise exception 'muted send accepted';
 exception when sqlstate 'P0001' then assert SQLERRM='CHAT_MUTED'; end;
 update chat_private.user_state set muted_until=null where user_id=a;
 r:=gen_random_uuid(); img:=img||jsonb_build_object('key','user/images/temporary/'||a||'/'||r||'/'||repeat('a',64)||'.gif','bytes',20971521);
 begin
   perform public.send_chat_image(a,r,img); raise exception 'oversize accepted';
 exception when check_violation then null; end;
 assert not exists(select 1 from chat_private.messages where client_request_id=r);
 assert (select send_count=20 from chat_private.user_state where user_id=a),'failed save rolls back counter';
end $$;
select 'ok 1 - image messages, limits, retries, deletion and service-only access';
rollback;
