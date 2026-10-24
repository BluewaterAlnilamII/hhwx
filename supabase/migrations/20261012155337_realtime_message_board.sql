create schema if not exists chat_private;
revoke all on schema chat_private from public, anon, authenticated;
grant usage on schema chat_private to service_role;

create table chat_private.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id uuid not null,
  content text,
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  unique (user_id, client_request_id),
  check ((deleted_at is null and char_length(btrim(content)) between 1 and 1000 and content is not null)
    or (deleted_at is not null and content is null))
);
create index chat_messages_visible_cursor on chat_private.messages (created_at desc, id desc) where deleted_at is null;
create index chat_messages_retention on chat_private.messages (created_at);

create table chat_private.user_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  next_send_at timestamptz,
  muted_until timestamptz,
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz
);
create index chat_user_state_moderated_by on chat_private.user_state (moderated_by) where moderated_by is not null;

alter table chat_private.messages enable row level security;
alter table chat_private.user_state enable row level security;
revoke all on all tables in schema chat_private from public, anon, authenticated;
grant all on all tables in schema chat_private to service_role;

create function chat_private.require_account(p_actor uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_actor is null or not exists (select 1 from public.profiles where id = p_actor) then
    raise exception using message = 'CHAT_ACCOUNT_REQUIRED', errcode = 'P0001';
  end if;
end $$;

create function chat_private.is_moderator(p_actor uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = p_actor and role = 'chat_moderator');
$$;

create function chat_private.message_json(p_message chat_private.messages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_message.id, 'clientRequestId', p_message.client_request_id,
    'content', p_message.content,
    'createdAt', to_char(p_message.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'author', jsonb_build_object('userId', p.id, 'username', p.username, 'publicUid', p.public_uid,
      'avatarCardId', p.avatar_card_id, 'avatarCardServer', p.avatar_card_server,
      'avatarCardTrainType', p.avatar_card_train_type)
  ) from public.profiles p where p.id = p_message.user_id;
$$;

create function public.read_chat_viewer(p_actor uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  perform chat_private.require_account(p_actor);
  return (select jsonb_build_object('userId', p_actor,
    'emailVerified', exists (select 1 from public.account_status where user_id = p_actor and email_verified_at is not null),
    'canModerate', chat_private.is_moderator(p_actor),
    'mutedUntil', (select muted_until from chat_private.user_state where user_id = p_actor),
    'nextSendAt', (select next_send_at from chat_private.user_state where user_id = p_actor)));
end $$;

create function public.read_chat_messages(p_actor uuid, p_before_at timestamptz default null, p_before_id uuid default null)
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
  ), page as (
    select c.* from candidates c order by c.created_at desc, c.id desc limit 50
  )
  select coalesce((select jsonb_agg(chat_private.message_json(p::chat_private.messages) order by p.created_at, p.id) from page p), '[]'),
    (select count(*) > 50 from candidates),
    (select jsonb_build_object('createdAt', to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'id', p.id)
      from page p order by p.created_at, p.id limit 1)
  into v_rows, v_more, v_cursor;
  return jsonb_build_object('messages', v_rows, 'nextCursor', case when v_more then v_cursor else null end);
end $$;

create function public.send_chat_message(p_actor uuid, p_request_id uuid, p_content text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_state chat_private.user_state; v_message chat_private.messages; v_now timestamptz; v_data jsonb;
begin
  perform chat_private.require_account(p_actor);
  if p_request_id is null or p_content is null or char_length(btrim(p_content)) not between 1 and 1000 then
    raise exception using message = 'CHAT_INVALID_CONTENT', errcode = 'P0001';
  end if;
  insert into chat_private.user_state(user_id) values (p_actor) on conflict do nothing;
  select * into v_state from chat_private.user_state where user_id = p_actor for update;
  select * into v_message from chat_private.messages where user_id = p_actor and client_request_id = p_request_id;
  if found then
    if v_message.deleted_at is null and v_message.content <> p_content then
      raise exception using message = 'CHAT_REQUEST_CONFLICT', errcode = 'P0001';
    end if;
  else
    v_now := clock_timestamp();
    if not exists (select 1 from public.account_status where user_id = p_actor and email_verified_at is not null) then
      raise exception using message = 'EMAIL_VERIFICATION_REQUIRED', errcode = 'P0001';
    end if;
    if v_state.muted_until > v_now then
      raise exception using message = 'CHAT_MUTED', errcode = 'P0001',
        detail = jsonb_build_object('retryAt', v_state.muted_until)::text;
    end if;
    if v_state.next_send_at > v_now then
      raise exception using message = 'CHAT_COOLDOWN', errcode = 'P0001',
        detail = jsonb_build_object('retryAt', v_state.next_send_at)::text;
    end if;
    insert into chat_private.messages(user_id, client_request_id, content, created_at)
      values (p_actor, p_request_id, p_content, v_now) returning * into v_message;
    v_state.next_send_at := v_now + interval '3 seconds';
    update chat_private.user_state set next_send_at = v_state.next_send_at where user_id = p_actor;
    v_data := chat_private.message_json(v_message);
  end if;
  return jsonb_build_object('messageId', v_message.id, 'clientRequestId', v_message.client_request_id,
    'message', case when v_message.deleted_at is null then coalesce(v_data, chat_private.message_json(v_message)) else null end,
    'deleted', v_message.deleted_at is not null, 'nextSendAt', v_state.next_send_at);
end $$;

create function public.delete_chat_message(p_actor uuid, p_message_id uuid) returns jsonb
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
    update chat_private.messages set content = null, deleted_at = clock_timestamp()
      where id = p_message_id returning * into v_message;
  end if;
  return jsonb_build_object('type', 'message.deleted', 'messageId', v_message.id, 'deletedAt', v_message.deleted_at);
end $$;

create function public.set_chat_mute(p_actor uuid, p_user_id uuid, p_until timestamptz) returns jsonb
language plpgsql set search_path = '' as $$
begin
  perform chat_private.require_account(p_actor);
  if not chat_private.is_moderator(p_actor) then
    raise exception using message = 'CHAT_FORBIDDEN', errcode = 'P0001';
  end if;
  perform chat_private.require_account(p_user_id);
  if p_until is not null and (p_until <= clock_timestamp() or p_until > clock_timestamp() + interval '30 days') then
    raise exception using message = 'CHAT_INVALID_MUTE', errcode = 'P0001';
  end if;
  insert into chat_private.user_state(user_id, muted_until, moderated_by, moderated_at)
    values (p_user_id, p_until, p_actor, clock_timestamp())
    on conflict (user_id) do update set muted_until = excluded.muted_until,
      moderated_by = excluded.moderated_by, moderated_at = excluded.moderated_at;
  return jsonb_build_object('userId', p_user_id, 'mutedUntil', p_until);
end $$;

create function public.cleanup_chat_messages() returns integer
language plpgsql set search_path = '' as $$
declare v_count integer;
begin
  delete from chat_private.messages where id in (
    select id from chat_private.messages where created_at <= now() - interval '30 days'
      order by created_at limit 1000 for update skip locked
  );
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on all functions in schema chat_private from public, anon, authenticated;
grant execute on all functions in schema chat_private to service_role;
revoke all on function public.read_chat_viewer(uuid), public.read_chat_messages(uuid,timestamptz,uuid),
  public.send_chat_message(uuid,uuid,text), public.delete_chat_message(uuid,uuid),
  public.set_chat_mute(uuid,uuid,timestamptz), public.cleanup_chat_messages() from public, anon, authenticated;
grant execute on function public.read_chat_viewer(uuid), public.read_chat_messages(uuid,timestamptz,uuid),
  public.send_chat_message(uuid,uuid,text), public.delete_chat_message(uuid,uuid),
  public.set_chat_mute(uuid,uuid,timestamptz), public.cleanup_chat_messages() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('hhwx-chat-retention', '*/10 * * * *', 'select public.cleanup_chat_messages()');
