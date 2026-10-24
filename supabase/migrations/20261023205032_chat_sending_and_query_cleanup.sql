-- Deploy with the chat client update. Existing messages and mutes are preserved.
alter table chat_private.user_state
  drop column next_send_at,
  add column send_window_started_at timestamptz,
  add column send_count smallint not null default 0 check (send_count between 0 and 20);

-- Formatting does not query profiles: callers supply the row they already read.
create function chat_private.message_json(p_message chat_private.messages, p_author public.profiles) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_message.id, 'clientRequestId', p_message.client_request_id,
    'content', p_message.content,
    'createdAt', to_char(p_message.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'author', jsonb_build_object('userId', p_author.id, 'username', p_author.username, 'publicUid', p_author.public_uid,
      'avatarCardId', p_author.avatar_card_id, 'avatarCardServer', p_author.avatar_card_server,
      'avatarCardTrainType', p_author.avatar_card_train_type));
$$;
revoke all on function chat_private.message_json(chat_private.messages,public.profiles) from public, anon, authenticated;
grant execute on function chat_private.message_json(chat_private.messages,public.profiles) to service_role;

create or replace function public.read_chat_viewer(p_actor uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object('userId', p.id,
    'canModerate', chat_private.is_moderator(p.id), 'mutedUntil', s.muted_until,
    'nextSendAt', case when s.send_count >= 20 and s.send_window_started_at + interval '60 seconds' > now()
      then s.send_window_started_at + interval '60 seconds' end)
    into result from public.profiles p left join chat_private.user_state s on s.user_id = p.id where p.id = p_actor;
  if not found then raise exception using message = 'CHAT_ACCOUNT_REQUIRED', errcode = 'P0001'; end if;
  return result;
end $$;

create or replace function public.read_chat_messages(p_actor uuid, p_before_at timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_rows jsonb; v_more boolean; v_cursor jsonb;
begin
  perform chat_private.require_account(p_actor);
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception using message = 'CHAT_INVALID_CURSOR', errcode = 'P0001';
  end if;
  with candidates as materialized (
    select m.* from chat_private.messages m
    where m.deleted_at is null and m.created_at > now() - interval '30 days'
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

create or replace function public.send_chat_message(p_actor uuid, p_request_id uuid, p_content text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_state chat_private.user_state; v_message chat_private.messages; v_author public.profiles; v_now timestamptz;
begin
  select * into v_author from public.profiles where id = p_actor;
  if not found then raise exception using message = 'CHAT_ACCOUNT_REQUIRED', errcode = 'P0001'; end if;
  if p_request_id is null or p_content is null or char_length(btrim(p_content)) not between 1 and 1000 then
    raise exception using message = 'CHAT_INVALID_CONTENT', errcode = 'P0001';
  end if;
  select * into v_state from chat_private.user_state where user_id = p_actor for update;
  if not found then
    insert into chat_private.user_state(user_id) values (p_actor) on conflict do nothing;
    select * into v_state from chat_private.user_state where user_id = p_actor for update;
  end if;
  select * into v_message from chat_private.messages where user_id = p_actor and client_request_id = p_request_id;
  if found then
    if v_message.deleted_at is null and v_message.content <> p_content then
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
    insert into chat_private.messages(user_id, client_request_id, content, created_at)
      values (p_actor, p_request_id, p_content, v_now) returning * into v_message;
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

drop function chat_private.message_json(chat_private.messages);
