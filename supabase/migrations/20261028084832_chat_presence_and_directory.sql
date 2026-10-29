-- Presence is ephemeral in the broker; only the account's visibility is persisted.
alter table chat_private.user_state add column presence_visible boolean not null default true;

create function public.read_chat_user_directory(p_actor uuid,p_room_id text default 'main') returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
  perform chat_private.require_account(p_actor);
  with recent as (
    select user_id,max(created_at) latest from chat_private.messages
      where room_id=p_room_id and deleted_at is null and created_at>now()-interval '30 days' group by user_id
  ) select coalesce(jsonb_agg(jsonb_build_object('userId',p.id,'username',p.username,'publicUid',p.public_uid,
    'avatarCardId',p.avatar_card_id,'avatarCardServer',p.avatar_card_server,'avatarCardTrainType',p.avatar_card_train_type,
    'lastMessageAt',r.latest) order by p.public_uid),'[]') into result
    from public.profiles p left join recent r on r.user_id=p.id
    where p.username is not null and chat_private.can_mention(p.id);
  return result;
end $$;

create function public.read_chat_online_users(p_actor uuid,p_user_ids uuid[]) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
  perform chat_private.require_account(p_actor);
  select coalesce(jsonb_agg(jsonb_build_object('userId',p.id,'username',p.username,'publicUid',p.public_uid,
    'avatarCardId',p.avatar_card_id,'avatarCardServer',p.avatar_card_server,'avatarCardTrainType',p.avatar_card_train_type)
    order by p.username,p.public_uid),'[]') into result
    from public.profiles p left join chat_private.user_state s on s.user_id=p.id
    where p.id=any(p_user_ids) and p.username is not null and chat_private.can_mention(p.id)
      and coalesce(s.presence_visible,true);
  return result;
end $$;

create function public.set_chat_presence_visibility(p_actor uuid,p_visible boolean) returns void
language plpgsql set search_path='' as $$
begin
  perform chat_private.require_account(p_actor);
  if p_visible is null then raise exception using message='CHAT_INVALID_CONTENT',errcode='P0001'; end if;
  insert into chat_private.user_state(user_id,presence_visible) values(p_actor,p_visible)
    on conflict(user_id) do update set presence_visible=excluded.presence_visible;
end $$;

revoke all on function public.read_chat_user_directory(uuid,text) from public,anon,authenticated;
revoke all on function public.read_chat_online_users(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.set_chat_presence_visibility(uuid,boolean) from public,anon,authenticated;
grant execute on function public.read_chat_user_directory(uuid,text) to service_role;
grant execute on function public.read_chat_online_users(uuid,uuid[]) to service_role;
grant execute on function public.set_chat_presence_visibility(uuid,boolean) to service_role;

-- Self-mentions are searchable; existing notification creation already excludes the sender.
create or replace function public.search_chat_mention_users(p_actor uuid,p_query text default '',p_room_id text default 'main') returns jsonb
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
    where chat_private.can_mention(p.id) and p.username is not null
      and (case when p_query='' then r.latest is not null
        else strpos(lower(p.username),lower(p_query))>0 or p.public_uid::text=p_query end)
    order by rank,r.latest desc nulls last,p.public_uid limit 8
  ) select coalesce(jsonb_agg(jsonb_build_object('userId',id,'username',username,'publicUid',public_uid,
    'avatarCardId',avatar_card_id,'avatarCardServer',avatar_card_server,'avatarCardTrainType',avatar_card_train_type)
    order by rank,latest desc nulls last,public_uid),'[]') into result from candidates;
  return result;
end $$;
