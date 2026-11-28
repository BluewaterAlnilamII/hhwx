begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000001001','authenticated','authenticated','regional-a@example.invalid','{}','{}'),
  ('00000000-0000-4000-8000-000000001002','authenticated','authenticated','regional-b@example.invalid','{}','{}');

set local role anon;
select throws_ok($$select public.merge_game_uid_binding_titles(null, '1234', '{}', '{}')$$, '42501', null, 'anon cannot merge private titles');
select throws_ok($$select * from public.bandori_public_players$$, '42501', null, 'anon cannot enumerate observations');
select throws_ok($$select public.merge_bandori_public_player('cn','1234','{}')$$, '42501', null, 'anon cannot submit observations');
set local role authenticated;
select throws_ok($$select public.merge_game_uid_binding_titles(null, '1234', '{}', '{}')$$, '42501', null, 'authenticated cannot merge private titles');
select throws_ok($$select * from public.bandori_public_players$$, '42501', null, 'authenticated cannot enumerate observations');
select throws_ok($$select public.merge_bandori_public_player('cn','1234','{}')$$, '42501', null, 'authenticated cannot submit observations');
set local role service_role;
select public.merge_bandori_public_player('cn','1234',
  '{"player_name":"old","introduction":"before","owned_card_ids":[2,1,2],"owned_degree_ids":[5,4,5],"high_score_rating":{"1":[1],"2":[2]},"music_clear_counts":{"easy":2,"hard":1},"music_full_combo_counts":{"easy":1}}');
select is(owned_degree_ids, array[4,5], 'duplicate title slots yield one ID from the first observation')
from public.bandori_public_players where server='cn' and game_uid='1234';
select public.merge_bandori_public_player('cn','1234',
  '{"player_name":"new","introduction":"","owned_card_ids":[2,3],"owned_degree_ids":[5,6],"high_score_rating":{"1":[]},"music_clear_counts":{"easy":0}}');
select is(owned_card_ids, array[1,2,3], 'union of observed cards') from public.bandori_public_players where server='cn' and game_uid='1234';
select is(owned_degree_ids, array[4,5,6], 'union of observed titles') from public.bandori_public_players where server='cn' and game_uid='1234';
select is(player_name, 'new', 'updated name') from public.bandori_public_players where server='cn' and game_uid='1234';
select is(introduction, '', 'explicit empty signature') from public.bandori_public_players where server='cn' and game_uid='1234';
select is(high_score_rating, '{"1":[],"2":[2]}'::jsonb, 'replace just the observed rating group') from public.bandori_public_players where server='cn' and game_uid='1234';
select is(music_clear_counts, '{"easy":0,"hard":1}'::jsonb, 'explicit zero and absent difficulty') from public.bandori_public_players where server='cn' and game_uid='1234';
select is(music_full_combo_counts, '{"easy":1}'::jsonb, 'absent metric retained') from public.bandori_public_players where server='cn' and game_uid='1234';
create temp table observed_version as select ctid as previous from public.bandori_public_players where server='cn' and game_uid='1234';
select public.merge_bandori_public_player('cn','1234','{"owned_card_ids":[3,1],"music_clear_counts":{"easy":0},"high_score_rating":{"1":[]}}');
select is(ctid,(select previous from observed_version),'a partial observation with no new facts keeps the row version')
from public.bandori_public_players where server='cn' and game_uid='1234';
select public.merge_bandori_public_player('cn','1234','{"player_rank":0}');
select isnt(ctid,(select previous from observed_version),'a newly observed zero writes a new version')
from public.bandori_public_players where server='cn' and game_uid='1234';

select public.create_game_uid_bind_challenge('00000000-0000-4000-8000-000000001001','1234','hhwx000001',now()+interval '5 minutes',s)
from unnest(array['jp','en','tw','cn']) s;
select is(count(*),4::bigint,'four independent pending challenges') from public.user_game_bind_challenges where game_uid='1234';
select throws_ok($$select public.complete_game_uid_binding(id,game_uid,web_user_id,'jp')
  from public.user_game_bind_challenges where game_uid='1234' and server='cn'$$, 'P0001','challenge is invalid or expired','server fixed at issuance');
select public.complete_game_uid_binding(id,game_uid,web_user_id,server) from public.user_game_bind_challenges where game_uid='1234';
select is(count(*),4::bigint,'same digits bind independently') from public.user_game_bindings where game_uid='1234';
select public.merge_game_uid_binding_titles('00000000-0000-4000-8000-000000001001','1234','{9,9,7}','{3}');
select public.merge_game_uid_binding_titles('00000000-0000-4000-8000-000000001001','1234','{}','{1,3}');
select public.merge_game_uid_binding_titles('00000000-0000-4000-8000-000000001001','1234','{8}','{}');
select is(owned_degree_ids, array[7,8,9], 'private titles accumulate') from public.user_game_bindings where server='cn' and game_uid='1234';
select is(owned_degree_effect_ids, array[1,3], 'private effects accumulate independently') from public.user_game_bindings where server='cn' and game_uid='1234';
create temp table title_version as select ctid as previous from public.user_game_bindings where server='cn' and game_uid='1234';
select public.merge_game_uid_binding_titles('00000000-0000-4000-8000-000000001001','1234','{7}','{3}');
select is(ctid,(select previous from title_version),'existing private titles keep the row version')
from public.user_game_bindings where server='cn' and game_uid='1234';
select is(count(*),3::bigint,'other regions keep empty private collections')
from public.user_game_bindings where server<>'cn' and game_uid='1234' and owned_degree_ids='{}' and owned_degree_effect_ids='{}';
select public.upsert_auto_game_profile('00000000-0000-4000-8000-000000001001','1234','CN profile','payload',repeat('0',64),7,1,'{}');
select public.create_game_uid_bind_challenge('00000000-0000-4000-8000-000000001002','1234','hhwx000002',now()+interval '5 minutes','jp');
select public.complete_game_uid_binding(id,game_uid,web_user_id,server) from public.user_game_bind_challenges where game_uid='1234' and server='jp';
select throws_ok($$select public.upsert_auto_game_profile('00000000-0000-4000-8000-000000001002','1234','test','payload',repeat('0',64),7,1,'{}')$$,
  'P0001','game uid is not bound to user','JP binding cannot save a CN snapshot');
select public.unbind_game_uid('1234','00000000-0000-4000-8000-000000001002','jp');
select is(count(*),1::bigint,'JP transfer and unbind preserve CN profile') from public.user_game_profiles where source_game_uid='1234';
select public.unbind_game_uid('1234','00000000-0000-4000-8000-000000001001');
select throws_ok($$select public.merge_game_uid_binding_titles('00000000-0000-4000-8000-000000001001','1234','{7}','{3}')$$,
  'P0001','game uid is not bound to user','known IDs cannot bypass ownership after CN unbind');
select is(count(*),0::bigint,'legacy unbind cleans up CN profile') from public.user_game_profiles where source_game_uid='1234';
select is(count(*),2::bigint,'other regions retain bindings') from public.user_game_bindings where game_uid='1234';
select is(count(*),1::bigint,'public observations survive unbind') from public.bandori_public_players where game_uid='1234';
-- Reissuing affects only the same server. Expired and exhausted challenges cannot commit.
select public.create_game_uid_bind_challenge('00000000-0000-4000-8000-000000001001','5555','hhwx000003',now()+interval '1 minute','jp');
select public.create_game_uid_bind_challenge('00000000-0000-4000-8000-000000001001','5555','hhwx000004',now()+interval '1 minute','jp');
select is(count(*),1::bigint,'reissue replaces the previous code') from public.user_game_bind_challenges where game_uid='5555';
update public.user_game_bind_challenges set attempt_count=5 where game_uid='5555';
select throws_ok($$select public.complete_game_uid_binding(id,game_uid,web_user_id,server)
  from public.user_game_bind_challenges where game_uid='5555'$$,'P0001','challenge is invalid or expired','exhausted attempts');
update public.user_game_bind_challenges set attempt_count=0,expires_at=now() where game_uid='5555';
select throws_ok($$select public.complete_game_uid_binding(id,game_uid,web_user_id,server)
  from public.user_game_bind_challenges where game_uid='5555'$$,'P0001','challenge is invalid or expired','expired challenge');

insert into public.user_game_bindings(server,game_uid,web_user_id)
select 'cn',n::text,'00000000-0000-4000-8000-000000001002'::uuid from generate_series(6001,6005) n;
insert into public.user_game_bind_challenges(web_user_id,server,game_uid,challenge,expires_at)
values ('00000000-0000-4000-8000-000000001002','tw','1234','hhwx000005',now()+interval '1 minute');
select throws_ok($$select public.complete_game_uid_binding(id,game_uid,web_user_id,server)
  from public.user_game_bind_challenges where server='tw' and game_uid='1234'$$,
  'P0001','game uid binding limit reached','transfers respect the per-owner cross-region limit');
reset role;
-- Force two observations to overlap on a previously unseen player.
select lives_ok($test$
do $race$
declare
  conn text := format('hostaddr=%s port=%s dbname=%I user=postgres password=postgres',
    coalesce(host(inet_server_addr()), '127.0.0.1'), current_setting('port'), current_database());
  holder integer;
  waiter integer;
begin
  perform dblink_connect('observe_a', conn);
  perform dblink_connect('observe_b', conn);
  select pid into holder from dblink('observe_a','select pg_backend_pid()') as r(pid int);
  select pid into waiter from dblink('observe_b','select pg_backend_pid()') as r(pid int);
  perform dblink_exec('observe_a','begin');
  perform result from dblink('observe_a',$q$select public.merge_bandori_public_player('en','9900101201',
    '{"owned_card_ids":[1,2],"owned_degree_ids":[8],"band_ranks":{"1":2}}')$q$) as r(result text);
  perform dblink_send_query('observe_b',$q$select public.merge_bandori_public_player('en','9900101201',
    '{"owned_card_ids":[2,3],"owned_degree_ids":[9],"band_ranks":{"2":3}}')$q$);
  for i in 1..100 loop
    exit when holder = any(pg_blocking_pids(waiter));
    perform pg_sleep(0.01);
  end loop;
  if not holder = any(pg_blocking_pids(waiter)) then raise exception 'expected simultaneous observations'; end if;
  perform dblink_exec('observe_a','commit');
  perform result from dblink_get_result('observe_b') as r(result text);
  if not exists (select 1 from public.bandori_public_players where server='en' and game_uid='9900101201'
    and owned_card_ids=array[1,2,3] and owned_degree_ids=array[8,9] and band_ranks='{"1":2,"2":3}'::jsonb)
  then raise exception 'concurrent update dropped a fact'; end if;
  perform dblink_exec('observe_a',$q$delete from public.bandori_public_players where server='en' and game_uid='9900101201'$q$);
  perform dblink_disconnect('observe_a');
  perform dblink_disconnect('observe_b');
end $race$
$test$, 'concurrent observations retain both card sets, title sets and map entries');
select * from finish();
rollback;
