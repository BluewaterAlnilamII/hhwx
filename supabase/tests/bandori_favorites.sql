begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(58);
select ok(not has_table_privilege('anon','public.bandori_favorites','SELECT'), 'counts cannot expose individual users');
select ok(not has_table_privilege('authenticated','public.bandori_favorites','INSERT'), 'direct writes denied');
select ok(not has_function_privilege('authenticated','public.read_bandori_favorites(bigint,uuid)','EXECUTE'), 'viewer cannot impersonate owner');
set local role anon;
select throws_ok($$select public.read_bandori_favorite_keys(null)$$, '42501', null, 'anonymous clients cannot read membership keys');
select throws_ok($$select * from public.bandori_favorites$$, '42501', null, 'anonymous identity reads denied at runtime');
reset role;
set local role authenticated;
select ok(not has_schema_privilege(current_user,'account_private','USAGE'), 'client roles cannot invoke the internal ordering helper');
select throws_ok($$select public.save_favorite_layout(null,'cards',array['1','2'],2)$$,'42501',null,'card layouts require the verified web route');
select throws_ok($$select public.save_favorite_layout(null,'songs',array['2','1'],null)$$, '42501', null, 'authenticated clients cannot reorder another playlist directly');
select throws_ok($$select public.read_bandori_favorites(null,null)$$, '42501', null, 'direct projection denied at runtime');
reset role;
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('c42b6b39-ef78-4536-8f58-000000000003','authenticated','authenticated','favorite@example.invalid','{}','{"username":"favorite_test"}');
insert into public.profiles(id,username) values ('c42b6b39-ef78-4536-8f58-000000000003','favorite_test') on conflict (id) do nothing;
set local role service_role;
select public.remove_favorite_card('c42b6b39-ef78-4536-8f58-000000000003','1');
select is((select count(*) from public.profile_homepages where user_id='c42b6b39-ef78-4536-8f58-000000000003'),0::bigint,'a missing card does not create settings');
insert into public.bandori_favorites(user_id,kind,target)
select 'c42b6b39-ef78-4536-8f58-000000000003','cards',generate_series(1,1002)::text;
insert into public.bandori_favorites(user_id,kind,target) values
 ('c42b6b39-ef78-4536-8f58-000000000003','events','jp:8'),
 ('c42b6b39-ef78-4536-8f58-000000000003','events','cn:8'),
 ('c42b6b39-ef78-4536-8f58-000000000003','cards','1') on conflict (user_id,kind,target) do nothing;
update public.bandori_favorites set normal_art=true where user_id='c42b6b39-ef78-4536-8f58-000000000003' and kind='cards' and target='1';
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','cards',(select array_agg(n::text order by n) from generate_series(1,1002) n),6),'save a default layout');
select is((select count(*) from public.profile_homepages where user_id='c42b6b39-ef78-4536-8f58-000000000003'),0::bigint,'a default preview needs no settings row');
insert into public.profile_homepages(user_id,preferences) values ('c42b6b39-ef78-4536-8f58-000000000003',
 '{"modules":[{"id":"events","public":false},{"id":"cards","public":true},{"id":"songs","public":true}]}');
create temporary view favorite_views as select public.read_bandori_favorites(public_uid,null) as visitor,
 public.read_bandori_favorites(null,id) as owner from public.profiles where id='c42b6b39-ef78-4536-8f58-000000000003';
select is((select jsonb_array_length(visitor) from favorite_views),1,'private and empty groups absent');
select is((select owner #>> '{0,kind}' from favorite_views),'events','owner retains private module in chosen order');
select is((select jsonb_array_length(owner #> '{0,items}') from favorite_views),2,'regional events distinct');
select is(cardinality(public.read_bandori_favorite_keys('c42b6b39-ef78-4536-8f58-000000000003')),1004,'compact membership exceeds the HTTP row limit');
select ok(public.read_bandori_favorite_keys('c42b6b39-ef78-4536-8f58-000000000003') @> array['events:jp:8','events:cn:8'],'own membership includes private regional events');
select is((select jsonb_array_length(visitor #> '{0,items}') from favorite_views),1002,'collection exceeds REST row limit');
select is((select visitor #>> '{0,items,0,target}' from favorite_views),'1002','newest first');
select is((select visitor #> '{0,items,1001}' from favorite_views),'{"target":"1","normalArt":true}'::jsonb,'art changes and duplicate adds preserve position');
select is((select count(*) from public.bandori_favorites where kind='events' and target='cn:8' and user_id='c42b6b39-ef78-4536-8f58-000000000003'),1::bigint,'private regional favorite contributes to aggregate');
select is((select visitor #>> '{0,previewCount}' from favorite_views), '6', 'default home preview');
select ok(not has_function_privilege('authenticated','public.save_favorite_layout(uuid,text,text[],integer)','EXECUTE'),
  'layout edits require the verified server route');
create temporary view edited_order as select array_agg(n::text order by n desc) as targets from generate_series(1,1002) n;
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','cards',(select targets from edited_order),3),'save full collection and count atomically');
select is((select visitor #>> '{0,previewCount}' from favorite_views),'3','guest sees selected count');
select is((select visitor #> '{0,items,0}' from favorite_views),'{"target":"1","normalArt":true}'::jsonb,'custom order preserves illustration');
select is((select owner #>> '{1,items,0,target}' from favorite_views),'1002','membership endpoint still uses addition order');
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','cards',(select targets from edited_order),2),'a second editor can update the divider');
select ok(not public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','cards',array['1','2'],2),'reject incomplete collection');
select throws_ok($$select public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','cards',array['1'],7)$$,'22023',null,'reject out of range count');
delete from public.bandori_favorites where user_id='c42b6b39-ef78-4536-8f58-000000000003' and kind='cards' and target='1002';
insert into public.bandori_favorites(user_id,kind,target) values ('c42b6b39-ef78-4536-8f58-000000000003','cards','1002');
select is((select visitor #>> '{0,items,0,target}' from favorite_views),'1002','removed and re-added card follows the custom order at the end');
select ok(not ((select visitor->0 from favorite_views) ? 'layoutVersion'),'anonymous projection omits write version');
select ok(not has_function_privilege('authenticated','public.remove_favorite_card(uuid,text)','EXECUTE'),
  'card removal remains behind the verified route');
delete from public.bandori_favorites where user_id='c42b6b39-ef78-4536-8f58-000000000003'
  and kind='cards' and target not in ('1','2','3');
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','cards',array['1','2','3'],2),'leave one card below the divider');
insert into public.bandori_favorites(user_id,kind,target) values ('c42b6b39-ef78-4536-8f58-000000000003','cards','4');
select is((select visitor #>> '{0,previewCount}' from favorite_views),'2','adding below a fixed divider preserves its place');
select public.remove_favorite_card('c42b6b39-ef78-4536-8f58-000000000003','4');
select is((select visitor #>> '{0,previewCount}' from favorite_views),'2','removal with one hidden card keeps the fixed place');
select public.remove_favorite_card('c42b6b39-ef78-4536-8f58-000000000003','3');
select is((select visitor #>> '{0,previewCount}' from favorite_views),'6','removing the last hidden card switches back to following the end');
select public.remove_favorite_card('c42b6b39-ef78-4536-8f58-000000000003','3');
select is((select card_preview_count from public.profile_homepages where user_id='c42b6b39-ef78-4536-8f58-000000000003'),6::smallint,'duplicate removal keeps the automatic divider');
insert into public.bandori_favorites(user_id,kind,target) values ('c42b6b39-ef78-4536-8f58-000000000003','cards','3');
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','cards',array['2','1','3'],3),'save a short custom order with divider after last');
select is((select visitor #>> '{0,previewCount}' from favorite_views),'6','explicit short end position follows future cards');
insert into public.bandori_favorites(user_id,kind,target)
  select 'c42b6b39-ef78-4536-8f58-000000000003','cards',n::text from generate_series(4,7) n;
select is((select visitor #>> '{0,items,3,target}' from favorite_views),'4','fourth card appends after the three ordered cards');
select is((select card_preview_count from public.profile_homepages where user_id='c42b6b39-ef78-4536-8f58-000000000003'),6::smallint,'additions through the seventh card keep the automatic divider');
insert into public.bandori_favorites(user_id,kind,target)
  select 'c42b6b39-ef78-4536-8f58-000000000003','songs',n::text from generate_series(1,3) n;
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','songs',array['3','1','2'],null), 'save song order atomically');
select is((select visitor #>> '{1,items,2,target}' from favorite_views),'3','profile starts playback order with the moved song');
select is((select owner #>> '{2,items,0,target}' from favorite_views),'3','membership still uses addition order');
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','songs',array['2','1','3'],null), 'a second editor can replace the song order');
select is((select visitor #>> '{1,items,2,target}' from favorite_views),'2','later song order wins');
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','songs',array['3','1','2'],null), 'replayed song edit succeeds');
select ok(not public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','songs',array['1','1','3'],null), 'invalid permutation rejected');
insert into public.bandori_favorites(user_id,kind,target) values ('c42b6b39-ef78-4536-8f58-000000000003','songs','4');
select is((select visitor #>> '{1,items,0,target}' from favorite_views),'4','new song follows reordered favorites');
select ok(not public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','songs',array['2','3','1'],null), 'concurrent addition preserved');
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','songs',array['1','2','3','4'],null), 'restore insertion order');
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','songs',array['1','3','2','4'],null), 'swap adjacent songs');
select is((select count(display_order) from public.bandori_favorites where user_id='c42b6b39-ef78-4536-8f58-000000000003' and kind='songs'),2::bigint,'only the swapped songs need an order override');
select ok(public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','cards',array['7','6','5','4','3','2','1'],6),'another editor can reverse the card order');
select is((select visitor #>> '{0,items,6,target}' from favorite_views),'7','later card order wins');
select ok(not public.save_favorite_layout('c42b6b39-ef78-4536-8f58-000000000003','cards',array['7','6','5','4','3','2','9'],1),'a stale card cannot replace a current favorite');
select is((select visitor #>> '{0,previewCount}' from favorite_views),'6','a rejected order also preserves the divider');
select * from finish();
rollback;
