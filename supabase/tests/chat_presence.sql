begin;
select '1..4';
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('e3000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','presence-'||i||'@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('username','presence_'||i),now(),now() from generate_series(1,1005) i;
set local role service_role;
do $$
declare a uuid:='e3000000-0000-4000-8000-000000000001'; users jsonb;
begin
 users:=public.read_chat_user_directory(a);
 assert (select count(*) from jsonb_array_elements(users) u where u->>'username' like 'presence_%')=1005;
 assert exists(select 1 from jsonb_array_elements(users) u where u->>'userId'=a::text);
 assert not exists(select 1 from jsonb_array_elements(users) u where u ?| array['email','presenceVisible','presence_visible','lastSeenAt','lastMessageAt','lastMessageId']);
 assert public.search_chat_mention_users(a,'presence_1')->0->>'userId'=a::text;
 perform public.send_chat_message(a,gen_random_uuid(),'@presence_1','main',null,
   jsonb_build_array(jsonb_build_object('userId',a,'start',0,'end',char_length('@presence_1'))));
 assert (public.read_chat_mentions(a)->>'total')::int=0;
end $$;
select 'ok 1 - directory includes all 1005 accounts and self; self mention has no notification';
do $$
declare a uuid:='e3000000-0000-4000-8000-000000000001'; b uuid:='e3000000-0000-4000-8000-000000000002'; users jsonb;
begin
 assert jsonb_array_length(public.read_chat_online_users(a,array[a,a,b]))=2;
 perform public.set_chat_presence_visibility(b,false);
 users:=public.read_chat_online_users(a,array[a,a,b]);
 assert jsonb_array_length(users)=1 and users->0->>'userId'=a::text;
 assert exists(select 1 from jsonb_array_elements(public.read_chat_user_directory(a)) u where u->>'userId'=b::text);
 assert public.search_chat_mention_users(a,'presence_2')->0->>'userId'=b::text;
 perform public.send_chat_message(b,gen_random_uuid(),'invisible but able to chat');
 assert jsonb_array_length(public.read_chat_online_users(a,array[a,b]))=1;
 perform public.set_chat_presence_visibility(b,true);
 assert jsonb_array_length(public.read_chat_online_users(a,array[a,b]))=2;
 assert jsonb_array_length(public.read_chat_online_users(a,array[]::uuid[]))=0;
end $$;
select 'ok 2 - default visibility, per-account deduplication and invisibility apply without changing chat or search';
reset role;
update auth.users set is_anonymous=true where id='e3000000-0000-4000-8000-000000001005';
set local role service_role;
do $$
declare a uuid:='e3000000-0000-4000-8000-000000000001'; b uuid:='e3000000-0000-4000-8000-000000001005';
begin
 assert public.read_chat_online_users(a,array[b])='[]'::jsonb;
 assert not exists(select 1 from jsonb_array_elements(public.read_chat_user_directory(a)) u where u->>'userId'=b::text);
end $$;
select 'ok 3 - anonymous accounts are excluded from both public data sets';
reset role;
set local role authenticated;
do $$
begin
 begin perform public.read_chat_user_directory('e3000000-0000-4000-8000-000000000001');raise exception 'client directory allowed';exception when insufficient_privilege then null;end;
 begin perform public.read_chat_online_users('e3000000-0000-4000-8000-000000000001',array[]::uuid[]);raise exception 'client presence allowed';exception when insufficient_privilege then null;end;
 begin perform public.set_chat_presence_visibility('e3000000-0000-4000-8000-000000000002',false);raise exception 'client visibility write allowed';exception when insufficient_privilege then null;end;
 begin perform presence_visible from chat_private.user_state;raise exception 'private preference exposed';exception when insufficient_privilege then null;end;
end $$;
select 'ok 4 - actual browser role cannot read private state or call privileged member functions';
rollback;
