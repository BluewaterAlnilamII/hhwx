-- Mentions are explicit account references; ordinary @ text has no side effects.
alter table chat_private.messages add column mentions jsonb not null default '[]' check(jsonb_typeof(mentions)='array');
create table chat_private.mentions (
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references chat_private.messages(id) on delete cascade,
  created_at timestamptz not null,
  read_at timestamptz,
  primary key(recipient_user_id,message_id)
);
create index chat_mentions_message on chat_private.mentions(message_id);
create index chat_mentions_unread on chat_private.mentions(recipient_user_id,created_at,message_id) where read_at is null;
alter table chat_private.mentions enable row level security;
revoke all on chat_private.mentions from public,anon,authenticated;
grant all on chat_private.mentions to service_role;

-- Expose only eligibility to the service role, without granting access to Auth records.
create function chat_private.can_mention(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users where id=p_user_id and not coalesce(is_anonymous,false));
$$;
revoke all on function chat_private.can_mention(uuid) from public,anon,authenticated;
grant execute on function chat_private.can_mention(uuid) to service_role;

create function chat_private.validate_mentions(content text, mentions jsonb) returns void
language plpgsql set search_path='' as $$
declare entry jsonb; start_at integer; end_at integer; last_end integer:=0; account_name text;
begin
  if mentions is null or jsonb_typeof(mentions)<>'array' or jsonb_array_length(mentions)>500 then
    raise exception using message='CHAT_INVALID_MENTION',errcode='P0001';
  end if;
  for entry in select value from jsonb_array_elements(mentions) loop
    if jsonb_typeof(entry)<>'object' or not (entry ?& array['userId','start','end'])
      or jsonb_typeof(entry->'userId')<>'string' or entry->>'userId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or jsonb_typeof(entry->'start')<>'number' or jsonb_typeof(entry->'end')<>'number'
      or entry->>'start' !~ '^[0-9]{1,4}$' or entry->>'end' !~ '^[0-9]{1,4}$' then
      raise exception using message='CHAT_INVALID_MENTION',errcode='P0001';
    end if;
    start_at:=(entry->>'start')::integer; end_at:=(entry->>'end')::integer;
    if content is null or start_at<last_end or end_at<=start_at or end_at>char_length(content) then
      raise exception using message='CHAT_INVALID_MENTION',errcode='P0001';
    end if;
    select p.username into account_name from public.profiles p
      where p.id=(entry->>'userId')::uuid and chat_private.can_mention(p.id);
    if not found or substring(content from start_at+1 for end_at-start_at) is distinct from '@'||account_name then
      raise exception using message='CHAT_INVALID_MENTION',errcode='P0001';
    end if;
    last_end:=end_at;
  end loop;
end $$;

create or replace function chat_private.message_interactions(m chat_private.messages, viewer uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('mentions',m.mentions,'reply', case when m.reply_to_id is not null then
    coalesce((select jsonb_build_object('id',r.id,'createdAt',to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'username',a.username,'content',left(coalesce(r.content,''),160),'image',r.image_key is not null,'deleted',false)
      from chat_private.messages r join public.profiles a on a.id=r.user_id
      where r.id=m.reply_to_id and r.room_id=m.room_id and r.deleted_at is null and r.created_at>now()-interval '30 days'),
      jsonb_build_object('id',m.reply_to_id,'deleted',true)) end,
    'reactionsVersion',m.reactions_version,'reactionsViewerId',viewer,
    'reactions',coalesce((select jsonb_agg(jsonb_build_object('emojiKey',g.emoji_key,'count',g.n,'reactedByViewer',g.own) order by g.emoji_key)
      from (select emoji_key,count(*) n,bool_or(user_id=viewer) own from chat_private.reactions where message_id=m.id group by emoji_key) g),'[]'));
$$;

drop function public.send_chat_message(uuid,uuid,text,text,uuid);
drop function public.send_chat_image(uuid,uuid,jsonb,text,uuid);
drop function chat_private.save_message(uuid,uuid,text,jsonb,text,uuid);
create or replace function chat_private.save_message(p_actor uuid, p_request_id uuid, p_content text, p_image jsonb, p_room_id text default 'main', p_reply_to_id uuid default null, p_mentions jsonb default '[]') returns jsonb
language plpgsql set search_path = '' as $$
declare v_state chat_private.user_state; v_message chat_private.messages; v_author public.profiles; v_now timestamptz;
begin
  perform chat_private.require_account(p_actor);
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
    if v_message.deleted_at is null and (v_message.mentions is distinct from p_mentions or v_message.reply_to_id is distinct from p_reply_to_id or v_message.content is distinct from p_content or v_message.image_key is distinct from (p_image->>'key')
      or (p_image is not null and (chat_private.message_json(v_message,v_author)->'image') is distinct from p_image)) then
      raise exception using message = 'CHAT_REQUEST_CONFLICT', errcode = 'P0001';
    end if;
  else
    perform chat_private.validate_mentions(p_content,p_mentions);
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
    insert into chat_private.messages(user_id, client_request_id, content, created_at, room_id, reply_to_id, mentions,
      image_key,image_width,image_height,image_bytes,image_content_type)
      values (p_actor, p_request_id, p_content, v_now, p_room_id, p_reply_to_id, p_mentions, p_image->>'key',(p_image->>'width')::integer,
        (p_image->>'height')::integer,(p_image->>'bytes')::integer,p_image->>'contentType') returning * into v_message;
    insert into chat_private.mentions(recipient_user_id,message_id,created_at)
      select distinct (entry->>'userId')::uuid,v_message.id,v_now from jsonb_array_elements(p_mentions) entry
      where (entry->>'userId')::uuid <> p_actor;
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

create function public.send_chat_message(p_actor uuid,p_request_id uuid,p_content text,p_room_id text default 'main',p_reply_to_id uuid default null, p_mentions jsonb default '[]') returns jsonb
language sql set search_path='' as $$
  select chat_private.save_message(p_actor,p_request_id,p_content,null,p_room_id,p_reply_to_id,p_mentions);
$$;

create function public.send_chat_image(p_actor uuid,p_request_id uuid,p_image jsonb,p_room_id text default 'main',p_reply_to_id uuid default null) returns jsonb
language plpgsql set search_path='' as $$
begin
  if p_image is null or jsonb_typeof(p_image) <> 'object' or not (p_image ?& array['key','width','height','bytes','contentType','hash']) then
    raise exception using message='CHAT_IMAGE_INVALID',errcode='P0001';
  end if;
  return chat_private.save_message(p_actor,p_request_id,null,p_image,p_room_id,p_reply_to_id);
end $$;

create function public.search_chat_mention_users(p_actor uuid,p_query text default '',p_room_id text default 'main') returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
  perform chat_private.require_account(p_actor);
  if p_query is null or char_length(p_query)>96 then raise exception using message='CHAT_INVALID_MENTION',errcode='P0001'; end if;
  with recent as materialized (
    select user_id,max(created_at) latest from chat_private.messages
      where room_id=p_room_id and deleted_at is null and created_at>now()-interval '30 days' group by user_id
  ), candidates as (
    select p.*,r.latest,
      case when p.public_uid::text=p_query or lower(p.username)=lower(p_query) then 0
        when starts_with(lower(p.username),lower(p_query)) then 1 else 2 end rank
    from public.profiles p left join recent r on r.user_id=p.id
    where p.id<>p_actor and chat_private.can_mention(p.id) and p.username is not null
      and (case when p_query='' then r.latest is not null
        else strpos(lower(p.username),lower(p_query))>0 or p.public_uid::text=p_query end)
    order by rank,r.latest desc nulls last,p.public_uid limit 8
  ) select coalesce(jsonb_agg(jsonb_build_object('userId',id,'username',username,'publicUid',public_uid,
    'avatarCardId',avatar_card_id,'avatarCardServer',avatar_card_server,'avatarCardTrainType',avatar_card_train_type)
    order by rank,latest desc nulls last,public_uid),'[]') into result from candidates;
  return result;
end $$;

create function public.read_chat_mentions(p_actor uuid,p_room_id text default 'main') returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
  perform chat_private.require_account(p_actor);
  with unread as materialized (
    select m.id,m.created_at,p.username from chat_private.mentions n
    join chat_private.messages m on m.id=n.message_id join public.profiles p on p.id=m.user_id
    where n.recipient_user_id=p_actor and n.read_at is null and m.room_id=p_room_id
      and m.deleted_at is null and m.created_at>now()-interval '30 days'
  ), page as (select * from unread order by created_at,id limit 50)
  select jsonb_build_object('total',(select count(*) from unread),'items',coalesce((select jsonb_agg(
    jsonb_build_object('id',id,'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'username',username)
    order by created_at,id) from page),'[]')) into result;
  return result;
end $$;

create function public.acknowledge_chat_mentions(p_actor uuid,p_message_ids uuid[],p_room_id text default 'main') returns void
language plpgsql set search_path='' as $$
begin
  perform chat_private.require_account(p_actor);
  if p_message_ids is null or cardinality(p_message_ids) not between 1 and 50 then
    raise exception using message='CHAT_INVALID_MENTION',errcode='P0001';
  end if;
  update chat_private.mentions n set read_at=clock_timestamp() from chat_private.messages m
    where n.message_id=m.id and m.room_id=p_room_id and n.recipient_user_id=p_actor
      and n.message_id=any(p_message_ids) and n.read_at is null;
end $$;

revoke all on function chat_private.validate_mentions(text,jsonb) from public,anon,authenticated;
grant execute on function chat_private.validate_mentions(text,jsonb) to service_role;
revoke all on function chat_private.save_message(uuid,uuid,text,jsonb,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function chat_private.save_message(uuid,uuid,text,jsonb,text,uuid,jsonb) to service_role;
revoke all on function public.send_chat_message(uuid,uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.send_chat_message(uuid,uuid,text,text,uuid,jsonb) to service_role;
revoke all on function public.send_chat_image(uuid,uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.send_chat_image(uuid,uuid,jsonb,text,uuid) to service_role;
revoke all on function public.search_chat_mention_users(uuid,text,text) from public,anon,authenticated;
grant execute on function public.search_chat_mention_users(uuid,text,text) to service_role;
revoke all on function public.read_chat_mentions(uuid,text) from public,anon,authenticated;
grant execute on function public.read_chat_mentions(uuid,text) to service_role;
revoke all on function public.acknowledge_chat_mentions(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.acknowledge_chat_mentions(uuid,uuid[],text) to service_role;

