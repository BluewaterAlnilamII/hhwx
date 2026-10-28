begin;
select '1..5';
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('e2000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','mention-'||i||'@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('username','mention_'||i),now(),now() from generate_series(1,12) i;
set local role service_role;
do $$
declare a uuid:='e2000000-0000-4000-8000-000000000001'; b uuid:='e2000000-0000-4000-8000-000000000002';
 mentions jsonb; result jsonb; id uuid; rid uuid:=gen_random_uuid();
begin
 mentions:=jsonb_build_array(jsonb_build_object('userId',b,'start',2,'end',12),jsonb_build_object('userId',b,'start',13,'end',23));
 result:=public.send_chat_message(a,rid,'😀 @mention_2 @mention_2','main',null,mentions);
 id:=(result->>'messageId')::uuid;
 assert result->'message'->'mentions'=mentions;
 assert (public.read_chat_mentions(b)->>'total')::integer=1;
 assert public.send_chat_message(a,rid,'😀 @mention_2 @mention_2','main',null,mentions)->>'messageId'=id::text;
 assert (public.read_chat_mentions(b)->>'total')::integer=1;
 begin perform public.send_chat_message(a,rid,'😀 @mention_2 @mention_2','main',null,'[]');raise exception 'changed mentions accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='CHAT_REQUEST_CONFLICT';end;
 perform public.send_chat_message(a,gen_random_uuid(),'@mention_2');
 perform public.send_chat_message(a,gen_random_uuid(),'quote','main',id);
 perform public.send_chat_message(b,gen_random_uuid(),'@mention_2','main',null,jsonb_build_array(jsonb_build_object('userId',b,'start',0,'end',10)));
 assert (public.read_chat_mentions(b)->>'total')::integer=1;
 assert (public.read_chat_mentions(a)->>'total')::integer=0;
 assert exists(select 1 from jsonb_array_elements(public.read_chat_messages(a)->'messages') m where m->>'id'=id::text and m->'mentions'=mentions);
end $$;
select 'ok 1 - explicit references survive reads and retries; repeated recipients, self mentions, plain text and quotes do not duplicate alerts';

do $$
declare a uuid:='e2000000-0000-4000-8000-000000000001'; b uuid:='e2000000-0000-4000-8000-000000000002'; bad jsonb;
begin
 foreach bad in array array['null'::jsonb,'{}'::jsonb,
   jsonb_build_array(jsonb_build_object('userId',b,'start',1,'end',10)),
   jsonb_build_array(jsonb_build_object('userId',b,'start',0,'end',11)),
   jsonb_build_array(jsonb_build_object('userId',a,'start',0,'end',10)),
   jsonb_build_array(jsonb_build_object('userId',b,'start',0,'end',10),jsonb_build_object('userId',b,'start',0,'end',10))] loop
   begin perform public.send_chat_message(a,gen_random_uuid(),'@mention_2','main',null,bad);raise exception 'invalid mention accepted';
   exception when sqlstate 'P0001' then assert sqlerrm='CHAT_INVALID_MENTION';end;
 end loop;
 update chat_private.user_state set muted_until=now()+interval '1 hour' where user_id=a;
 begin perform public.send_chat_message(a,gen_random_uuid(),'@mention_2','main',null,jsonb_build_array(jsonb_build_object('userId',b,'start',0,'end',10)));raise exception 'muted mention accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='CHAT_MUTED';end;
 update chat_private.user_state set muted_until=null where user_id=a;
end $$;
select 'ok 2 - invalid spans, hidden targets and muted sends are rejected';

do $$
declare a uuid:='e2000000-0000-4000-8000-000000000001'; b uuid:='e2000000-0000-4000-8000-000000000002'; first_id uuid; second_id uuid;
begin
 first_id:=(public.read_chat_mentions(b)->'items'->0->>'id')::uuid;
 second_id:=(public.send_chat_message(a,gen_random_uuid(),'@mention_2','main',null,jsonb_build_array(jsonb_build_object('userId',b,'start',0,'end',10)))->>'messageId')::uuid;
 assert (public.read_chat_mentions(b)->'items'->0->>'id')::uuid=first_id;
 perform public.acknowledge_chat_mentions(a,array[first_id]);
 assert (public.read_chat_mentions(b)->>'total')::integer=2;
 perform public.acknowledge_chat_mentions(b,array[first_id],'other');
 assert (public.read_chat_mentions(b)->>'total')::integer=2;
 perform public.acknowledge_chat_mentions(b,array[first_id]);
 assert (public.read_chat_mentions(b)->>'total')::integer=1;
 assert (public.read_chat_mentions(b)->'items'->0->>'id')::uuid=second_id;
 perform public.delete_chat_message(a,second_id);
 assert (public.read_chat_mentions(b)->>'total')::integer=0;
 update chat_private.messages set created_at=now()-interval '31 days' where id=first_id;
 update chat_private.mentions set read_at=null where message_id=first_id;
 assert (public.read_chat_mentions(b)->>'total')::integer=0;
end $$;
select 'ok 3 - inbox is oldest first; acknowledgement is per recipient and message, deletion and expiry remove stale alerts';

do $$
declare a uuid:='e2000000-0000-4000-8000-000000000001'; b uuid:='e2000000-0000-4000-8000-000000000002'; result jsonb; uid text;
begin
 insert into chat_private.messages(user_id,client_request_id,content,created_at)
 select id,gen_random_uuid(),'search fixture',clock_timestamp() from public.profiles where id::text like 'e2000000-%';
 result:=public.search_chat_mention_users(a,'mention_');assert jsonb_array_length(result)=8;
 assert jsonb_array_length(public.search_chat_mention_users(a))=8;
 assert public.search_chat_mention_users(a,'MENTION_12')->0->>'username'='mention_12';
 select public_uid::text into uid from public.profiles where id=b;
 assert public.search_chat_mention_users(a,uid)->0->>'userId'=b::text;
 assert public.search_chat_mention_users(a,'nonexistent_mention')='[]'::jsonb;
 assert public.search_chat_mention_users(a,'%_')='[]'::jsonb;
end $$;
select 'ok 4 - candidates are capped at eight after ranking, support case-insensitive names and exact UID, and treat wildcard characters literally';
reset role;
set local role authenticated;
do $$ begin
 begin perform public.read_chat_mentions('e2000000-0000-4000-8000-000000000001');raise exception 'client read allowed';exception when insufficient_privilege then null;end;
 begin perform public.acknowledge_chat_mentions('e2000000-0000-4000-8000-000000000001',array[gen_random_uuid()]);raise exception 'client write allowed';exception when insufficient_privilege then null;end;
 begin perform public.search_chat_mention_users('e2000000-0000-4000-8000-000000000001');raise exception 'client directory access allowed';exception when insufficient_privilege then null;end;
 begin perform 1 from chat_private.mentions;raise exception 'private table exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'ok 5 - actual client role cannot access service-only inbox, directory, acknowledgement or private table';
rollback;
