-- Existing clients continue to use main; the HTTP boundary controls which rooms are open.
alter table chat_private.messages add column room_id text not null default 'main'
  check (room_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$');
drop index chat_private.chat_messages_visible_cursor;
create index chat_messages_visible_cursor on chat_private.messages (room_id, created_at desc, id desc)
  where deleted_at is null;

-- Replace signatures, rather than leaving ambiguous PostgREST overloads.
drop function public.read_chat_messages(uuid,timestamptz,uuid);
drop function public.send_chat_message(uuid,uuid,text);
drop function public.send_chat_image(uuid,uuid,jsonb);
drop function public.delete_chat_message(uuid,uuid);
drop function chat_private.save_message(uuid,uuid,text,jsonb);


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
  select coalesce((select jsonb_agg(chat_private.message_json(p::chat_private.messages,a) order by p.created_at,p.id)
      from page p join public.profiles a on a.id = p.user_id), '[]'),
    (select count(*) > 50 from candidates),
    (select jsonb_build_object('createdAt', to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'id', p.id)
      from page p order by p.created_at, p.id limit 1)
  into v_rows, v_more, v_cursor;
  return jsonb_build_object('messages', v_rows, 'nextCursor', case when v_more then v_cursor else null end);
end $$;

create or replace function chat_private.save_message(p_actor uuid, p_request_id uuid, p_content text, p_image jsonb, p_room_id text default 'main') returns jsonb
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
    insert into chat_private.messages(user_id, client_request_id, content, created_at, room_id,
      image_key,image_width,image_height,image_bytes,image_content_type)
      values (p_actor, p_request_id, p_content, v_now, p_room_id, p_image->>'key',(p_image->>'width')::integer,
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

create function public.send_chat_message(p_actor uuid,p_request_id uuid,p_content text,p_room_id text default 'main') returns jsonb
language sql set search_path='' as $$
  select chat_private.save_message(p_actor,p_request_id,p_content,null,p_room_id);
$$;
create function public.send_chat_image(p_actor uuid,p_request_id uuid,p_image jsonb,p_room_id text default 'main') returns jsonb
language plpgsql set search_path='' as $$
begin
  if p_image is null or jsonb_typeof(p_image) <> 'object' or not (p_image ?& array['key','width','height','bytes','contentType','hash']) then
    raise exception using message='CHAT_IMAGE_INVALID',errcode='P0001';
  end if;
  return chat_private.save_message(p_actor,p_request_id,null,p_image,p_room_id);
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
  return jsonb_build_object('type', 'message.deleted', 'messageId', v_message.id, 'deletedAt', v_message.deleted_at);
end $$;

create or replace function public.cleanup_chat_messages() returns integer
language plpgsql set search_path = '' as $$
declare v_count integer;
begin
  -- Materialize once so alternate join plans cannot select additional batches.
  with expired as materialized (
    select id from chat_private.messages where created_at <= now() - interval '30 days'
      order by created_at limit 1000 for update skip locked
  )
  delete from chat_private.messages m using expired e where m.id = e.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.read_chat_messages(uuid,timestamptz,uuid,text),
  public.send_chat_message(uuid,uuid,text,text), public.send_chat_image(uuid,uuid,jsonb,text),
  public.delete_chat_message(uuid,uuid,text), chat_private.save_message(uuid,uuid,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.read_chat_messages(uuid,timestamptz,uuid,text),
  public.send_chat_message(uuid,uuid,text,text), public.send_chat_image(uuid,uuid,jsonb,text),
  public.delete_chat_message(uuid,uuid,text), chat_private.save_message(uuid,uuid,text,jsonb,text)
  to service_role;
