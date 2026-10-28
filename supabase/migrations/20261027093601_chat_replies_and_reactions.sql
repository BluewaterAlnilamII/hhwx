-- Additive payload fields; old HTTP clients continue to send without a reply target.
alter table chat_private.messages
  add column reply_to_id uuid,
  add column reactions_version integer not null default 0 check (reactions_version >= 0),
  add constraint chat_reply_not_self check (reply_to_id is distinct from id);
-- Keep the ID after retention cleanup so replies can render a deleted-message placeholder.
create table chat_private.reactions (
  message_id uuid not null references chat_private.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji_key text not null check (emoji_key ~ '^[A-Za-z0-9_+-]{1,64}$'),
  created_at timestamptz not null default clock_timestamp(),
  primary key(message_id,user_id,emoji_key)
);
create index chat_reaction_participants on chat_private.reactions(message_id,emoji_key,created_at,user_id);
create index chat_reactions_user on chat_private.reactions(user_id);
alter table chat_private.reactions enable row level security;
revoke all on chat_private.reactions from public,anon,authenticated;
grant all on chat_private.reactions to service_role;

create function chat_private.message_interactions(m chat_private.messages, viewer uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('reply', case when m.reply_to_id is not null then
    coalesce((select jsonb_build_object('id',r.id,'createdAt',to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'username',a.username,'content',left(coalesce(r.content,''),160),'image',r.image_key is not null,'deleted',false)
      from chat_private.messages r join public.profiles a on a.id=r.user_id
      where r.id=m.reply_to_id and r.room_id=m.room_id and r.deleted_at is null and r.created_at>now()-interval '30 days'),
      jsonb_build_object('id',m.reply_to_id,'deleted',true)) end,
    'reactionsVersion',m.reactions_version,'reactionsViewerId',viewer,
    'reactions',coalesce((select jsonb_agg(jsonb_build_object('emojiKey',g.emoji_key,'count',g.n,'reactedByViewer',g.own) order by g.emoji_key)
      from (select emoji_key,count(*) n,bool_or(user_id=viewer) own from chat_private.reactions where message_id=m.id group by emoji_key) g),'[]'));
$$;

create or replace function public.read_chat_messages(p_actor uuid, p_before_at timestamptz default null, p_before_id uuid default null, p_room_id text default 'main')
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_rows jsonb; v_more boolean; v_cursor jsonb;
begin
  perform chat_private.require_account(p_actor);
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception using message = 'CHAT_INVALID_CURSOR', errcode = 'P0001';
  end if;
  with candidates as materialized (
    select m.* from chat_private.messages m
    where m.room_id = p_room_id and m.deleted_at is null and m.created_at > now() - interval '30 days'
      and (m.created_at, m.id) < (coalesce(p_before_at, 'infinity'::timestamptz),
        coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by m.created_at desc, m.id desc limit 51
  ), page as materialized (
    select c.* from candidates c order by c.created_at desc, c.id desc limit 50
  )
  select coalesce((select jsonb_agg((chat_private.message_json(p::chat_private.messages,a) || chat_private.message_interactions(p::chat_private.messages,p_actor)) order by p.created_at,p.id)
      from page p join public.profiles a on a.id = p.user_id), '[]'),
    (select count(*) > 50 from candidates),
    (select jsonb_build_object('createdAt', to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'id', p.id)
      from page p order by p.created_at, p.id limit 1)
  into v_rows, v_more, v_cursor;
  return jsonb_build_object('messages', v_rows, 'nextCursor', case when v_more then v_cursor else null end);
end $$;

create or replace function public.read_newer_chat_messages(p_actor uuid, p_after_at timestamptz, p_after_id uuid, p_room_id text default 'main')
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_rows jsonb; v_more boolean;
begin
  perform chat_private.require_account(p_actor);
  if p_after_at is null or p_after_id is null then
    raise exception using message = 'CHAT_INVALID_CURSOR', errcode = 'P0001';
  end if;
  with candidates as materialized (
    select m.* from chat_private.messages m
    where m.room_id = p_room_id and m.deleted_at is null and m.created_at > now() - interval '30 days'
      and (m.created_at, m.id) > (p_after_at, p_after_id)
    order by m.created_at, m.id limit 51
  ), page as materialized (
    select c.* from candidates c order by c.created_at, c.id limit 50
  )
  select coalesce((select jsonb_agg((chat_private.message_json(p::chat_private.messages,a) || chat_private.message_interactions(p::chat_private.messages,p_actor)) order by p.created_at,p.id)
      from page p join public.profiles a on a.id = p.user_id), '[]'),
    (select count(*) > 50 from candidates)
  into v_rows, v_more;
  return jsonb_build_object('messages', v_rows, 'hasMore', v_more);
end $$;

drop function public.send_chat_message(uuid,uuid,text,text);
drop function public.send_chat_image(uuid,uuid,jsonb,text);
drop function chat_private.save_message(uuid,uuid,text,jsonb,text);
create or replace function chat_private.save_message(p_actor uuid, p_request_id uuid, p_content text, p_image jsonb, p_room_id text default 'main', p_reply_to_id uuid default null) returns jsonb
language plpgsql set search_path = '' as $$
declare v_state chat_private.user_state; v_message chat_private.messages; v_author public.profiles; v_now timestamptz;
begin
  select * into v_author from public.profiles where id = p_actor;
  if not found then raise exception using message = 'CHAT_ACCOUNT_REQUIRED', errcode = 'P0001'; end if;
  if p_request_id is null or (p_image is null and (p_content is null or char_length(btrim(p_content)) not between 1 and 1000)) then
    raise exception using message = 'CHAT_INVALID_CONTENT', errcode = 'P0001';
  end if;
  select * into v_state from chat_private.user_state where user_id = p_actor for update;
  if not found then
    insert into chat_private.user_state(user_id) values (p_actor) on conflict do nothing;
    select * into v_state from chat_private.user_state where user_id = p_actor for update;
  end if;
  select * into v_message from chat_private.messages where user_id = p_actor and client_request_id = p_request_id;
  if found then
    if v_message.room_id is distinct from p_room_id then
      raise exception using message = 'CHAT_REQUEST_CONFLICT', errcode = 'P0001';
    end if;
    if v_message.deleted_at is null and (v_message.reply_to_id is distinct from p_reply_to_id or v_message.content is distinct from p_content or v_message.image_key is distinct from (p_image->>'key')
      or (p_image is not null and (chat_private.message_json(v_message,v_author)->'image') is distinct from p_image)) then
      raise exception using message = 'CHAT_REQUEST_CONFLICT', errcode = 'P0001';
    end if;
  else
    v_now := clock_timestamp();
    if v_state.muted_until > v_now then
      raise exception using message = 'CHAT_MUTED', errcode = 'P0001',
        detail = jsonb_build_object('retryAt', v_state.muted_until)::text;
    end if;
    if v_state.send_window_started_at is null or v_state.send_window_started_at + interval '60 seconds' <= v_now then
      v_state.send_window_started_at := v_now;
      v_state.send_count := 0;
    end if;
    if v_state.send_count >= 20 then
      raise exception using message = 'CHAT_COOLDOWN', errcode = 'P0001',
        detail = jsonb_build_object('retryAt', v_state.send_window_started_at + interval '60 seconds')::text;
    end if;
    if p_reply_to_id is not null then
      perform 1 from chat_private.messages where id=p_reply_to_id and room_id=p_room_id
        and deleted_at is null and created_at>now()-interval '30 days' for share;
      if not found then raise exception using message='CHAT_REPLY_DELETED',errcode='P0001'; end if;
    end if;
    insert into chat_private.messages(user_id, client_request_id, content, created_at, room_id, reply_to_id,
      image_key,image_width,image_height,image_bytes,image_content_type)
      values (p_actor, p_request_id, p_content, v_now, p_room_id, p_reply_to_id, p_image->>'key',(p_image->>'width')::integer,
        (p_image->>'height')::integer,(p_image->>'bytes')::integer,p_image->>'contentType') returning * into v_message;
    v_state.send_count := v_state.send_count + 1;
    update chat_private.user_state set send_window_started_at = v_state.send_window_started_at,
      send_count = v_state.send_count where user_id = p_actor;
  end if;
  return jsonb_build_object('messageId', v_message.id, 'clientRequestId', v_message.client_request_id,
    'message', case when v_message.deleted_at is null then chat_private.message_json(v_message,v_author) || chat_private.message_interactions(v_message,p_actor) end,
    'deleted', v_message.deleted_at is not null,
    'nextSendAt', case when v_state.send_count >= 20 and v_state.send_window_started_at + interval '60 seconds' > clock_timestamp()
      then v_state.send_window_started_at + interval '60 seconds' end);
end $$;

create function public.send_chat_message(p_actor uuid,p_request_id uuid,p_content text,p_room_id text default 'main',p_reply_to_id uuid default null) returns jsonb
language sql set search_path='' as $$
  select chat_private.save_message(p_actor,p_request_id,p_content,null,p_room_id,p_reply_to_id);
$$;

create function public.send_chat_image(p_actor uuid,p_request_id uuid,p_image jsonb,p_room_id text default 'main',p_reply_to_id uuid default null) returns jsonb
language plpgsql set search_path='' as $$
begin
  if p_image is null or jsonb_typeof(p_image) <> 'object' or not (p_image ?& array['key','width','height','bytes','contentType','hash']) then
    raise exception using message='CHAT_IMAGE_INVALID',errcode='P0001';
  end if;
  return chat_private.save_message(p_actor,p_request_id,null,p_image,p_room_id,p_reply_to_id);
end $$;

create or replace function public.delete_chat_message(p_actor uuid, p_message_id uuid, p_room_id text default 'main') returns jsonb
language plpgsql set search_path = '' as $$
declare v_message chat_private.messages;
begin
  perform chat_private.require_account(p_actor);
  select * into v_message from chat_private.messages where id = p_message_id and room_id = p_room_id for update;
  if not found then
    raise exception using message = 'CHAT_NOT_FOUND', errcode = 'P0001';
  end if;
  if v_message.user_id <> p_actor and not chat_private.is_moderator(p_actor) then
    raise exception using message = 'CHAT_FORBIDDEN', errcode = 'P0001';
  end if;
  if v_message.deleted_at is null then
    update chat_private.messages set content = null, image_key=null, image_width=null, image_height=null, image_bytes=null, image_content_type=null, deleted_at = clock_timestamp()
      where id = p_message_id returning * into v_message;
  end if;
  delete from chat_private.reactions where message_id=p_message_id;
  return jsonb_build_object('type', 'message.deleted', 'messageId', v_message.id, 'deletedAt', v_message.deleted_at);
end $$;

create function public.set_chat_reaction(p_actor uuid,p_message_id uuid,p_emoji_key text,p_active boolean,p_room_id text default 'main')
returns jsonb language plpgsql set search_path='' as $$
declare m chat_private.messages; s chat_private.user_state; changed integer; groups jsonb;
begin
  perform chat_private.require_account(p_actor);
  if p_active is null or p_emoji_key is null or p_emoji_key !~ '^[A-Za-z0-9_+-]{1,64}$' then
    raise exception using message='CHAT_INVALID_REACTION',errcode='P0001';
  end if;
  insert into chat_private.user_state(user_id) values(p_actor) on conflict do nothing;
  select * into s from chat_private.user_state where user_id=p_actor for update;
  select * into m from chat_private.messages where id=p_message_id and room_id=p_room_id
    and deleted_at is null and created_at>now()-interval '30 days' for update;
  if not found then raise exception using message='CHAT_NOT_FOUND',errcode='P0001'; end if;
  if p_active and s.muted_until>clock_timestamp() then
    raise exception using message='CHAT_MUTED',errcode='P0001',detail=jsonb_build_object('retryAt',s.muted_until)::text;
  end if;
  if p_active then
    insert into chat_private.reactions(message_id,user_id,emoji_key) values(p_message_id,p_actor,p_emoji_key) on conflict do nothing;
  else
    delete from chat_private.reactions where message_id=p_message_id and user_id=p_actor and emoji_key=p_emoji_key;
  end if;
  get diagnostics changed=row_count;
  if changed>0 then
    update chat_private.messages set reactions_version=reactions_version+1 where id=p_message_id returning * into m;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('emojiKey',emoji_key,'count',n) order by emoji_key),'[]') into groups
    from (select emoji_key,count(*) n from chat_private.reactions where message_id=p_message_id group by emoji_key) g;
  return jsonb_build_object('type','message.reactions','messageId',m.id,'version',m.reactions_version,
    'reactions',groups,'userId',p_actor,'ownEmojiKeys',coalesce((select jsonb_agg(emoji_key order by emoji_key) from chat_private.reactions where message_id=p_message_id and user_id=p_actor),'[]'));
end $$;

create function public.read_chat_reaction_participants(p_actor uuid,p_message_id uuid,p_emoji_key text,
  p_after_at timestamptz default null,p_after_id uuid default null,p_room_id text default 'main') returns jsonb
language plpgsql stable set search_path='' as $$
declare rows jsonb; more boolean; cursor text;
begin
  perform chat_private.require_account(p_actor);
  if (p_after_at is null)<>(p_after_id is null) then raise exception using message='CHAT_INVALID_CURSOR',errcode='P0001'; end if;
  perform 1 from chat_private.messages where id=p_message_id and room_id=p_room_id and deleted_at is null and created_at>now()-interval '30 days';
  if not found then raise exception using message='CHAT_NOT_FOUND',errcode='P0001'; end if;
  with candidates as materialized (
    select r.*,a.username,a.public_uid,a.avatar_card_id,a.avatar_card_server,a.avatar_card_train_type
    from chat_private.reactions r join public.profiles a on a.id=r.user_id
    where r.message_id=p_message_id and r.emoji_key=p_emoji_key
      and (p_after_at is null or (r.created_at,r.user_id)>(p_after_at,p_after_id)) order by r.created_at,r.user_id limit 51
  ), page as materialized (select * from candidates order by created_at,user_id limit 50)
  select coalesce((select jsonb_agg(jsonb_build_object('userId',user_id,'username',username,'publicUid',public_uid,
    'avatar',jsonb_build_object('cardId',avatar_card_id,'entityServer',avatar_card_server,'trainType',avatar_card_train_type),
    'reactedAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by created_at,user_id) from page),'[]'),
    (select count(*)>50 from candidates),
    (select to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')||'|'||user_id::text from page order by created_at desc,user_id desc limit 1)
    into rows,more,cursor;
  return jsonb_build_object('messageId',p_message_id,'emojiKey',p_emoji_key,'users',rows,'hasMore',more,'nextCursor',case when more then cursor end);
end $$;

create function public.read_chat_context(p_actor uuid,p_message_id uuid,p_room_id text default 'main') returns jsonb
language plpgsql stable set search_path='' as $$
declare target chat_private.messages; rows jsonb;
begin
  perform chat_private.require_account(p_actor);
  select * into target from chat_private.messages where id=p_message_id and room_id=p_room_id
    and deleted_at is null and created_at>now()-interval '30 days';
  if not found then raise exception using message='CHAT_NOT_FOUND',errcode='P0001'; end if;
  with before_rows as (
    select m.* from chat_private.messages m where room_id=p_room_id and deleted_at is null and created_at>now()-interval '30 days'
      and (created_at,id)<=(target.created_at,target.id) order by created_at desc,id desc limit 25
  ), after_rows as (
    select m.* from chat_private.messages m where room_id=p_room_id and deleted_at is null and created_at>now()-interval '30 days'
      and (created_at,id)>(target.created_at,target.id) order by created_at,id limit 25
  ), page as (select * from before_rows union all select * from after_rows)
  select jsonb_agg(chat_private.message_json(p::chat_private.messages,a)||chat_private.message_interactions(p::chat_private.messages,p_actor) order by p.created_at,p.id)
    into rows from page p join public.profiles a on a.id=p.user_id;
  return jsonb_build_object('messages',rows,'nextCursor',jsonb_build_object('createdAt',rows->0->>'createdAt','id',rows->0->>'id'));
end $$;

revoke all on function chat_private.message_interactions(chat_private.messages,uuid) from public,anon,authenticated;
grant execute on function chat_private.message_interactions(chat_private.messages,uuid) to service_role;
revoke all on function chat_private.save_message(uuid,uuid,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function chat_private.save_message(uuid,uuid,text,jsonb,text,uuid) to service_role;
revoke all on function public.send_chat_message(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.send_chat_message(uuid,uuid,text,text,uuid) to service_role;
revoke all on function public.send_chat_image(uuid,uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.send_chat_image(uuid,uuid,jsonb,text,uuid) to service_role;
revoke all on function public.set_chat_reaction(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.set_chat_reaction(uuid,uuid,text,boolean,text) to service_role;
revoke all on function public.read_chat_reaction_participants(uuid,uuid,text,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.read_chat_reaction_participants(uuid,uuid,text,timestamptz,uuid,text) to service_role;
revoke all on function public.read_chat_context(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_chat_context(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
