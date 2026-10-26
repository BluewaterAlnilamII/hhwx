-- Summary reads use the existing room/cursor index and never load message bodies or profiles.
create function public.read_chat_activity(p_actor uuid, p_room_id text default 'main')
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_latest jsonb; v_other jsonb;
begin
  perform chat_private.require_account(p_actor);
  select jsonb_build_object('createdAt', to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'id', m.id)
    into v_latest from chat_private.messages m
    where m.room_id = p_room_id and m.deleted_at is null and m.created_at > now() - interval '30 days'
    order by m.created_at desc, m.id desc limit 1;
  select jsonb_build_object('createdAt', to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'id', m.id)
    into v_other from chat_private.messages m
    where m.room_id = p_room_id and m.deleted_at is null and m.created_at > now() - interval '30 days' and m.user_id <> p_actor
    order by m.created_at desc, m.id desc limit 1;
  return jsonb_build_object('latest', v_latest, 'latestOther', v_other);
end $$;

-- One database snapshot supplies both the first page and the unread baseline.
create function public.read_chat_snapshot(p_actor uuid, p_room_id text default 'main')
returns jsonb language sql stable set search_path = '' as $$
  select public.read_chat_messages(p_actor, null, null, p_room_id)
    || jsonb_build_object('activity', public.read_chat_activity(p_actor, p_room_id));
$$;

revoke all on function public.read_chat_activity(uuid,text), public.read_chat_snapshot(uuid,text) from public, anon, authenticated;
grant execute on function public.read_chat_activity(uuid,text), public.read_chat_snapshot(uuid,text) to service_role;
