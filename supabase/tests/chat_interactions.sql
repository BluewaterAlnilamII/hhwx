begin;
select '1..4';
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('e1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','interaction-'||i||'@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('username','interaction_'||i),now(),now() from generate_series(1,53) i;
set local role service_role;
do $$
declare a uuid:='e1000000-0000-4000-8000-000000000001'; b uuid:='e1000000-0000-4000-8000-000000000002';
 original uuid; target uuid; expired uuid; foreign_id uuid; rid uuid:=gen_random_uuid(); saved jsonb; page jsonb; image jsonb;
begin
 original:=(public.send_chat_message(a,gen_random_uuid(),'original')->>'messageId')::uuid;
 saved:=public.send_chat_message(b,rid,'answer','main',original);target:=(saved->>'messageId')::uuid;
 assert saved->'message'->'reply'->>'id'=original::text and saved->'message'->'reply'->>'content'='original';
 assert public.send_chat_message(b,rid,'answer','main',original)->>'messageId'=target::text;
 begin perform public.send_chat_message(b,rid,'answer','main',null);raise exception 'changed reply accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='CHAT_REQUEST_CONFLICT';end;
 rid:=gen_random_uuid();
 image:=jsonb_build_object('key','user/images/temporary/'||b||'/'||rid||'/'||repeat('a',64)||'.png','width',1,'height',1,'bytes',5,'contentType','image/png','hash',repeat('a',64));
 assert public.send_chat_image(b,rid,image,'main',original)->'message'->'reply'->>'id'=original::text;
 insert into chat_private.messages(user_id,client_request_id,content,created_at) values(a,gen_random_uuid(),'expired',now()-interval '31 days') returning id into expired;
 insert into chat_private.messages(user_id,client_request_id,content,room_id) values(a,gen_random_uuid(),'private room','other') returning id into foreign_id;
 foreach original in array array[expired,foreign_id,gen_random_uuid()] loop
   begin perform public.send_chat_message(b,gen_random_uuid(),'invalid reference','main',original);raise exception 'invalid reference accepted';
   exception when sqlstate 'P0001' then assert sqlerrm='CHAT_REPLY_DELETED';end;
 end loop;
 original:=(saved->'message'->'reply'->>'id')::uuid;
 select client_request_id into rid from chat_private.messages where id=target;
 perform public.delete_chat_message(a,original);
 saved:=public.send_chat_message(b,rid,'answer','main',original);
 assert saved->'message'->'reply'=jsonb_build_object('id',original,'deleted',true);
 delete from chat_private.messages where id=original;
 assert (select m->'reply' from jsonb_array_elements(public.read_chat_context(b,target)->'messages') m
   where m->>'id'=target::text)=jsonb_build_object('id',original,'deleted',true);
end $$;
reset role;
select 'ok 1 - replies bind one target, retry idempotently, isolate rooms and hide deleted content';
set local role service_role;
do $$
declare a uuid:='e1000000-0000-4000-8000-000000000001'; b uuid:='e1000000-0000-4000-8000-000000000002';
 target uuid; event jsonb; page jsonb; count_before integer;
begin
 target:=(public.send_chat_message(a,gen_random_uuid(),'react here')->>'messageId')::uuid;
 select send_count into count_before from chat_private.user_state where user_id=a;
 event:=public.set_chat_reaction(a,target,'KokoroYay',true);assert (event->>'version')::integer=1;
 assert public.set_chat_reaction(a,target,'KokoroYay',true)=event;
 event:=public.set_chat_reaction(a,target,'KanonLove',true);assert event->'ownEmojiKeys'='["KanonLove","KokoroYay"]'::jsonb;
 perform public.set_chat_reaction(b,target,'KokoroYay',true);
 page:=public.read_chat_context(a,target);assert (page->'messages'->-1->'reactions'->1->>'count')::integer=2;
 assert (page->'messages'->-1->'reactions'->1->>'reactedByViewer')::boolean;
 assert (select send_count from chat_private.user_state where user_id=a)=count_before;
 update chat_private.user_state set muted_until=now()+interval '1 hour' where user_id=a;
 begin perform public.set_chat_reaction(a,target,'SaayaXD',true);raise exception 'muted reaction accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='CHAT_MUTED';end;
 event:=public.set_chat_reaction(a,target,'KokoroYay',false);assert event->'ownEmojiKeys'='["KanonLove"]'::jsonb;
 assert public.set_chat_reaction(a,target,'KokoroYay',false)=event;
 begin perform public.set_chat_reaction(b,target,'bad key',true);raise exception 'invalid key accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='CHAT_INVALID_REACTION';end;
 perform public.delete_chat_message(a,target);assert not exists(select 1 from chat_private.reactions where message_id=target);
 begin perform public.set_chat_reaction(b,target,'KokoroYay',true);raise exception 'deleted target accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='CHAT_NOT_FOUND';end;
 update chat_private.user_state set muted_until=null where user_id=a;
end $$;
reset role;
select 'ok 2 - reactions are idempotent and per user, with independent quotas and mute/delete rules';
set local role service_role;
do $$
declare a uuid:='e1000000-0000-4000-8000-000000000001'; target uuid; page jsonb; cursor text; total integer; user_id uuid;
begin
 target:=(public.send_chat_message(a,gen_random_uuid(),'participants')->>'messageId')::uuid;
 for user_id in select id from public.profiles where id::text like 'e1000000-%' loop perform public.set_chat_reaction(user_id,target,'KokoroYay',true);end loop;
 page:=public.read_chat_reaction_participants(a,target,'KokoroYay');assert jsonb_array_length(page->'users')=50 and (page->>'hasMore')::boolean;
 cursor:=page->>'nextCursor';total:=jsonb_array_length(page->'users');
 page:=public.read_chat_reaction_participants(a,target,'KokoroYay',split_part(cursor,'|',1)::timestamptz,split_part(cursor,'|',2)::uuid);
 assert jsonb_array_length(page->'users')=3 and not (page->>'hasMore')::boolean;
 insert into chat_private.messages(user_id,client_request_id,content,created_at)
 select a,gen_random_uuid(),'surrounding',now()+i*interval '1 millisecond' from generate_series(-60,60) i;
 page:=public.read_chat_context(a,target);assert jsonb_array_length(page->'messages')<=50;
 assert exists(select 1 from jsonb_array_elements(page->'messages') m where m->>'id'=target::text);
 update chat_private.messages set created_at=now()-interval '31 days' where id=target;
 begin perform public.read_chat_context(a,target);raise exception 'expired context readable';exception when sqlstate 'P0001' then assert sqlerrm='CHAT_NOT_FOUND';end;
 begin perform public.read_chat_reaction_participants(a,target,'KokoroYay');raise exception 'expired participants readable';exception when sqlstate 'P0001' then assert sqlerrm='CHAT_NOT_FOUND';end;
end $$;
reset role;
select 'ok 3 - participant keysets paginate, context stays bounded, retention applies to every read';
do $$
declare client text; signature text;
begin
 foreach signature in array array['public.set_chat_reaction(uuid,uuid,text,boolean,text)',
 'public.read_chat_reaction_participants(uuid,uuid,text,timestamptz,uuid,text)','public.read_chat_context(uuid,uuid,text)',
 'public.send_chat_message(uuid,uuid,text,text,uuid,jsonb)','public.send_chat_image(uuid,uuid,jsonb,text,uuid)'] loop
   assert has_function_privilege('service_role',signature,'execute');
   assert not (select prosecdef from pg_proc where oid=signature::regprocedure);
   foreach client in array array['anon','authenticated'] loop assert not has_function_privilege(client,signature,'execute');end loop;
 end loop;
 foreach client in array array['anon','authenticated'] loop
   execute format('set local role %I',client);
   begin perform public.set_chat_reaction('e1000000-0000-4000-8000-000000000001',gen_random_uuid(),'KokoroYay',true);raise exception 'client wrote reaction';exception when insufficient_privilege then null;end;
   begin perform * from chat_private.reactions;raise exception 'client read private table';exception when insufficient_privilege then null;end;
   reset role;
 end loop;
end $$;
select 'ok 4 - client roles cannot forge actors or read private reaction storage';
rollback;
