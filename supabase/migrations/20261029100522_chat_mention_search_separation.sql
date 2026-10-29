-- The account directory and keyword search do not read message history.
create or replace function public.read_chat_user_directory(p_actor uuid,p_room_id text default 'main') returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
  perform chat_private.require_account(p_actor);
  select coalesce(jsonb_agg(jsonb_build_object('userId',p.id,'username',p.username,'publicUid',p.public_uid,
    'avatarCardId',p.avatar_card_id,'avatarCardServer',p.avatar_card_server,'avatarCardTrainType',p.avatar_card_train_type)
    order by p.public_uid),'[]') into result
    from public.profiles p where p.username is not null and chat_private.can_mention(p.id);
  return result;
end $$;

create or replace function public.search_chat_mention_users(p_actor uuid,p_query text default '',p_room_id text default 'main') returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
  perform chat_private.require_account(p_actor);
  if p_query is null or char_length(p_query)>96 then raise exception using message='CHAT_INVALID_MENTION',errcode='P0001'; end if;
  p_query := btrim(p_query);
  if p_query='' then
    -- Only the small empty-query recommendation carries activity cursors.
    with recent as (
      select user_id,max(created_at) latest from chat_private.messages
        where room_id=p_room_id and deleted_at is null and created_at>now()-interval '30 days'
        group by user_id
    ), candidates as (
      select p.*,r.latest from recent r join public.profiles p on p.id=r.user_id
        where p.username is not null and chat_private.can_mention(p.id)
        order by r.latest desc,p.public_uid limit 8
    ) select coalesce(jsonb_agg(jsonb_build_object('userId',id,'username',username,'publicUid',public_uid,
      'avatarCardId',avatar_card_id,'avatarCardServer',avatar_card_server,'avatarCardTrainType',avatar_card_train_type,
      'lastMessageAt',to_char(latest at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'lastMessageId',last_message_id)
      order by latest desc,public_uid),'[]') into result from candidates c
      cross join lateral (select m.id last_message_id from chat_private.messages m
        where m.room_id=p_room_id and m.user_id=c.id and m.created_at=c.latest and m.deleted_at is null
        order by m.id desc limit 1) last_message;
  else
    with candidates as (
      select p.*,case when p.public_uid::text=p_query or lower(p.username)=lower(p_query) then 0
        when starts_with(lower(p.username),lower(p_query)) then 1 else 2 end rank
      from public.profiles p where p.username is not null and chat_private.can_mention(p.id)
        and (strpos(lower(p.username),lower(p_query))>0 or p.public_uid::text=p_query)
      order by rank,p.public_uid limit 8
    ) select coalesce(jsonb_agg(jsonb_build_object('userId',id,'username',username,'publicUid',public_uid,
      'avatarCardId',avatar_card_id,'avatarCardServer',avatar_card_server,'avatarCardTrainType',avatar_card_train_type)
      order by rank,public_uid),'[]') into result from candidates;
  end if;
  return result;
end $$;
