-- Additive reads keep older clients and application rollbacks compatible.
create function public.read_newer_chat_messages(p_actor uuid, p_after_at timestamptz, p_after_id uuid, p_room_id text default 'main')
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
  select coalesce((select jsonb_agg(chat_private.message_json(p::chat_private.messages,a) order by p.created_at,p.id)
      from page p join public.profiles a on a.id = p.user_id), '[]'),
    (select count(*) > 50 from candidates)
  into v_rows, v_more;
  return jsonb_build_object('messages', v_rows, 'hasMore', v_more);
end $$;

revoke all on function public.read_newer_chat_messages(uuid,timestamptz,uuid,text) from public, anon, authenticated;
grant execute on function public.read_newer_chat_messages(uuid,timestamptz,uuid,text) to service_role;

alter table chat_private.messages drop constraint chat_message_payload,
  add constraint chat_message_payload check (
    (image_key is null and image_width is null and image_height is null and image_bytes is null and image_content_type is null
      and ((deleted_at is null and content is not null and char_length(btrim(content)) between 1 and 1000)
        or (deleted_at is not null and content is null)))
    or (deleted_at is null and content is null and image_key is not null
      and image_width is not null and image_width between 1 and 16383
      and image_height is not null and image_height between 1 and 16383
      and image_width::bigint * image_height <= 16777216
      and image_bytes is not null and image_bytes between 1 and 20971520
      and image_content_type is not null and image_content_type in ('image/jpeg','image/png','image/webp','image/gif','image/apng')
      and image_key ~ ('^user/images/temporary/' || user_id::text || '/' || client_request_id::text || '/[a-f0-9]{64}\.(jpg|png|webp|gif)$'))
  );
