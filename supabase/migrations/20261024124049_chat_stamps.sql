-- Ephemeral stamps only consume account quota; no message or outbox rows.
alter table chat_private.user_state
  add column stamp_window_started_at timestamptz,
  add column stamp_count smallint not null default 0 check (stamp_count between 0 and 20);

create function public.authorize_chat_stamp(p_actor uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare v_author public.profiles; v_state chat_private.user_state; v_now timestamptz;
begin
  select * into v_author from public.profiles where id = p_actor;
  if not found then raise exception using message = 'CHAT_ACCOUNT_REQUIRED', errcode = 'P0001'; end if;
  select * into v_state from chat_private.user_state where user_id = p_actor for update;
  if not found then
    insert into chat_private.user_state(user_id) values (p_actor) on conflict do nothing;
    select * into v_state from chat_private.user_state where user_id = p_actor for update;
  end if;
  v_now := clock_timestamp();
  if v_state.muted_until > v_now then
    raise exception using message = 'CHAT_MUTED', errcode = 'P0001',
      detail = jsonb_build_object('retryAt', v_state.muted_until)::text;
  end if;
  if v_state.stamp_window_started_at is null or v_state.stamp_window_started_at + interval '60 seconds' <= v_now then
    v_state.stamp_window_started_at := v_now;
    v_state.stamp_count := 0;
  end if;
  if v_state.stamp_count >= 20 then
    raise exception using message = 'CHAT_STAMP_COOLDOWN', errcode = 'P0001',
      detail = jsonb_build_object('retryAt', v_state.stamp_window_started_at + interval '60 seconds')::text;
  end if;
  v_state.stamp_count := v_state.stamp_count + 1;
  update chat_private.user_state set stamp_window_started_at = v_state.stamp_window_started_at,
    stamp_count = v_state.stamp_count where user_id = p_actor;
  return jsonb_build_object('username', v_author.username, 'publicUid', v_author.public_uid,
    'nextStampAt', case when v_state.stamp_count >= 20 then v_state.stamp_window_started_at + interval '60 seconds' end);
end $$;
revoke all on function public.authorize_chat_stamp(uuid) from public, anon, authenticated;
grant execute on function public.authorize_chat_stamp(uuid) to service_role;
