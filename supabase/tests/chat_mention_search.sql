begin;
select '1..5';
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('e4000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','search-split-'||i||'@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('username','searchsplit_'||i),now(),now() from generate_series(1,12) i;
set local role service_role;
insert into chat_private.messages(user_id,client_request_id,content,created_at,room_id)
select id,gen_random_uuid(),'search fixture',now()-interval '1 day'+public_uid*interval '1 microsecond','mention_search_test'
 from public.profiles where id::text like 'e4000000-%' and username<>'searchsplit_12';
do $$
declare a uuid:='e4000000-0000-4000-8000-000000000001'; before_search jsonb; before_directory jsonb; suggestions jsonb;
begin
 before_search:=public.search_chat_mention_users(a,'searchsplit_','mention_search_test');
 before_directory:=public.read_chat_user_directory(a,'mention_search_test');
 assert jsonb_array_length(before_search)=8;
 assert public.search_chat_mention_users(a,'searchsplit_12','mention_search_test')->0->>'username'='searchsplit_12';
 suggestions:=public.search_chat_mention_users(a,'','mention_search_test');
 assert jsonb_array_length(suggestions)=8;
 assert suggestions->0->>'username'='searchsplit_11';
 assert not exists(select 1 from jsonb_array_elements(suggestions) u where u->>'username'='searchsplit_12');
 assert (suggestions->0->>'lastMessageAt')::timestamptz=(select max(m.created_at) from chat_private.messages m
   where m.user_id=(suggestions->0->>'userId')::uuid and m.room_id='mention_search_test' and m.deleted_at is null);
 assert not exists(select 1 from jsonb_array_elements(suggestions) u where u ? 'lastMessageId');
 update chat_private.messages set created_at=now()-interval '1 hour' where user_id=a and room_id='mention_search_test';
 assert public.search_chat_mention_users(a,'','mention_search_test')->0->>'userId'=a::text;
 assert public.search_chat_mention_users(a,'searchsplit_','mention_search_test')=before_search;
 assert public.read_chat_user_directory(a,'mention_search_test')=before_directory;
 assert not exists(select 1 from jsonb_array_elements(before_directory) u where u ?| array['lastMessageAt','lastMessageId']);
end $$;
select 'ok 1 - only empty suggestions change with message recency; nonparticipants remain searchable beyond eight rows';

do $$
declare a uuid:='e4000000-0000-4000-8000-000000000001'; users jsonb;
begin
 update chat_private.messages set deleted_at=now(),content=null where user_id=a and room_id='mention_search_test';
 update chat_private.messages set created_at=now()-interval '31 days' where user_id='e4000000-0000-4000-8000-000000000011' and room_id='mention_search_test';
 users:=public.search_chat_mention_users(a,'   ','mention_search_test');
 assert jsonb_array_length(users)=8 and users->0->>'username'='searchsplit_10';
 assert not exists(select 1 from jsonb_array_elements(users) u where u->>'username' in ('searchsplit_1','searchsplit_11','searchsplit_12'));
 assert public.search_chat_mention_users(a,'','mention_search_other')='[]'::jsonb;
 assert public.search_chat_mention_users(a,'searchsplit_1','mention_search_other')->0->>'userId'=a::text;
end $$;
select 'ok 2 - empty suggestions respect deletion, retention and room; keywords do not depend on room activity';

reset role;
revoke select on chat_private.messages from service_role;
set local role service_role;
do $$
declare a uuid:='e4000000-0000-4000-8000-000000000001';
begin
 assert jsonb_array_length(public.read_chat_user_directory(a))>=12;
 assert jsonb_array_length(public.search_chat_mention_users(a,'searchsplit_'))=8;
 begin perform public.search_chat_mention_users(a,'','mention_search_test');raise exception 'empty suggestions did not read messages';exception when insufficient_privilege then null;end;
end $$;
select 'ok 3 - directory and keyword search work with message-table SELECT revoked; empty suggestions require it';
reset role;
set local role authenticated;
do $$
begin
 begin perform public.search_chat_mention_users('e4000000-0000-4000-8000-000000000001','searchsplit_');raise exception 'browser search allowed';exception when insufficient_privilege then null;end;
 begin perform public.read_chat_user_directory('e4000000-0000-4000-8000-000000000001');raise exception 'browser directory allowed';exception when insufficient_privilege then null;end;
end $$;
select 'ok 4 - browser role cannot bypass authenticated HTTP routes';
reset role;
set local role anon;
do $$
begin
 begin perform public.search_chat_mention_users('e4000000-0000-4000-8000-000000000001','');raise exception 'guest suggestions allowed';exception when insufficient_privilege then null;end;
end $$;
select 'ok 5 - anonymous role cannot call suggestions';
rollback;
