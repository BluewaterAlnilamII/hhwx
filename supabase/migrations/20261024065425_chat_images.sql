-- Deploy the image-aware application before enabling image uploads. Text RPC stays compatible.
alter table chat_private.messages
  drop constraint messages_check,
  add column image_key text,
  add column image_width integer,
  add column image_height integer,
  add column image_bytes integer,
  add column image_content_type text,
  add constraint chat_message_payload check (
    (image_key is null and image_width is null and image_height is null and image_bytes is null and image_content_type is null
      and ((deleted_at is null and content is not null and char_length(btrim(content)) between 1 and 1000)
        or (deleted_at is not null and content is null)))
    or (deleted_at is null and content is null and image_key is not null
      and image_width is not null and image_width between 1 and 4096
      and image_height is not null and image_height between 1 and 4096
      and image_bytes is not null and image_bytes between 1 and 20971520
      and image_content_type is not null and image_content_type in ('image/jpeg','image/png','image/webp','image/gif','image/apng')
      and image_key ~ ('^user/images/temporary/' || user_id::text || '/' || client_request_id::text || '/[a-f0-9]{64}\.(jpg|png|webp|gif)$'))
  );
alter table chat_private.user_state
  add column upload_window_started_at timestamptz,
  add column upload_count smallint not null default 0 check (upload_count between 0 and 20);

create or replace function chat_private.message_json(p_message chat_private.messages, p_author public.profiles) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_message.id, 'clientRequestId', p_message.client_request_id,
    'content', coalesce(p_message.content, ''),
    'image', case when p_message.image_key is not null then jsonb_build_object(
      'key',p_message.image_key,'width',p_message.image_width,'height',p_message.image_height,
      'bytes',p_message.image_bytes,'contentType',p_message.image_content_type,
      'hash',split_part(split_part(p_message.image_key,'/',6),'.',1)) end,
    'createdAt', to_char(p_message.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'author', jsonb_build_object('userId', p_author.id, 'username', p_author.username, 'publicUid', p_author.public_uid,
      'avatarCardId', p_author.avatar_card_id, 'avatarCardServer', p_author.avatar_card_server,
      'avatarCardTrainType', p_author.avatar_card_train_type));
$$;
revoke all on function chat_private.message_json(chat_private.messages,public.profiles) from public, anon, authenticated;
grant execute on function chat_private.message_json(chat_private.messages,public.profiles) to service_role;

create or replace function chat_private.save_message(p_actor uuid, p_request_id uuid, p_content text, p_image jsonb) returns jsonb
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
    if v_message.deleted_at is null and (v_message.content is distinct from p_content or v_message.image_key is distinct from (p_image->>'key')
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
    insert into chat_private.messages(user_id, client_request_id, content, created_at,
      image_key,image_width,image_height,image_bytes,image_content_type)
      values (p_actor, p_request_id, p_content, v_now, p_image->>'key',(p_image->>'width')::integer,
        (p_image->>'height')::integer,(p_image->>'bytes')::integer,p_image->>'contentType') returning * into v_message;
    v_state.send_count := v_state.send_count + 1;
    update chat_private.user_state set send_window_started_at = v_state.send_window_started_at,
      send_count = v_state.send_count where user_id = p_actor;
  end if;
  return jsonb_build_object('messageId', v_message.id, 'clientRequestId', v_message.client_request_id,
    'message', case when v_message.deleted_at is null then chat_private.message_json(v_message,v_author) end,
    'deleted', v_message.deleted_at is not null,
    'nextSendAt', case when v_state.send_count >= 20 and v_state.send_window_started_at + interval '60 seconds' > clock_timestamp()
      then v_state.send_window_started_at + interval '60 seconds' end);
end $$;


create or replace function public.send_chat_message(p_actor uuid,p_request_id uuid,p_content text) returns jsonb
language sql set search_path='' as $$
  select chat_private.save_message(p_actor,p_request_id,p_content,null);
$$;
create function public.send_chat_image(p_actor uuid,p_request_id uuid,p_image jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
  if p_image is null or jsonb_typeof(p_image) <> 'object' or not (p_image ?& array['key','width','height','bytes','contentType','hash']) then
    raise exception using message='CHAT_IMAGE_INVALID',errcode='P0001';
  end if;
  return chat_private.save_message(p_actor,p_request_id,null,p_image);
end $$;

-- Issuance is independently limited: abandoning an upload does not consume a message slot.
create function public.authorize_chat_image_upload(p_actor uuid) returns void
language plpgsql set search_path='' as $$
declare s chat_private.user_state; t timestamptz;
begin
  perform chat_private.require_account(p_actor);
  select * into s from chat_private.user_state where user_id=p_actor for update;
  if not found then
    insert into chat_private.user_state(user_id) values(p_actor) on conflict do nothing;
    select * into s from chat_private.user_state where user_id=p_actor for update;
  end if;
  t:=clock_timestamp();
  if s.muted_until > t then
    raise exception using message='CHAT_MUTED',errcode='P0001',detail=jsonb_build_object('retryAt',s.muted_until)::text;
  end if;
  if s.send_count>=20 and s.send_window_started_at+interval '60 seconds'>t then
    raise exception using message='CHAT_COOLDOWN',errcode='P0001',detail=jsonb_build_object('retryAt',s.send_window_started_at+interval '60 seconds')::text;
  end if;
  if s.upload_window_started_at is null or s.upload_window_started_at+interval '60 seconds'<=t then
    s.upload_window_started_at:=t; s.upload_count:=0;
  end if;
  if s.upload_count>=20 then
    raise exception using message='CHAT_UPLOAD_COOLDOWN',errcode='P0001',detail=jsonb_build_object('retryAt',s.upload_window_started_at+interval '60 seconds')::text;
  end if;
  update chat_private.user_state set upload_window_started_at=s.upload_window_started_at,upload_count=s.upload_count+1 where user_id=p_actor;
end $$;
revoke all on function chat_private.save_message(uuid,uuid,text,jsonb),public.send_chat_image(uuid,uuid,jsonb),public.authorize_chat_image_upload(uuid) from public,anon,authenticated;
grant execute on function chat_private.save_message(uuid,uuid,text,jsonb),public.send_chat_image(uuid,uuid,jsonb),public.authorize_chat_image_upload(uuid) to service_role;

create or replace function public.delete_chat_message(p_actor uuid, p_message_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare v_message chat_private.messages;
begin
  perform chat_private.require_account(p_actor);
  select * into v_message from chat_private.messages where id = p_message_id for update;
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
  return jsonb_build_object('type', 'message.deleted', 'messageId', v_message.id, 'deletedAt', v_message.deleted_at);
end $$;

