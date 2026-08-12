begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(36);

select ok(
  to_regprocedure('public.read_comment_reaction_summary_rows(uuid[],uuid)') is not null,
  'reaction summary RPC exists'
);

select ok(
  to_regprocedure('public.read_comment_preview_reply_ids(uuid[])') is not null,
  'reply preview RPC exists'
);

select ok(
  not (
    select procedure.prosecdef
    from pg_catalog.pg_proc as procedure
    where procedure.oid = 'public.read_comment_reaction_summary_rows(uuid[],uuid)'::regprocedure
  ),
  'reaction summary RPC is security invoker'
);

select ok(
  not (
    select procedure.prosecdef
    from pg_catalog.pg_proc as procedure
    where procedure.oid = 'public.read_comment_preview_reply_ids(uuid[])'::regprocedure
  ),
  'reply preview RPC is security invoker'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.read_comment_reaction_summary_rows(uuid[],uuid)',
    'EXECUTE'
  ),
  'anon cannot execute reaction summary RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.read_comment_reaction_summary_rows(uuid[],uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute reaction summary RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.read_comment_reaction_summary_rows(uuid[],uuid)',
    'EXECUTE'
  ),
  'service_role can execute reaction summary RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.read_comment_preview_reply_ids(uuid[])',
    'EXECUTE'
  ),
  'anon cannot execute reply preview RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.read_comment_preview_reply_ids(uuid[])',
    'EXECUTE'
  ),
  'authenticated cannot execute reply preview RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.read_comment_preview_reply_ids(uuid[])',
    'EXECUTE'
  ),
  'service_role can execute reply preview RPC'
);

select ok(
  to_regclass('public.idx_comment_reactions_comment_emoji_created_at_user_id') is not null,
  'reaction summary covering index exists'
);

select ok(
  to_regclass('public.idx_comment_reactions_comment_emoji_created_at') is null,
  'superseded reaction index is removed'
);

select ok(
  to_regclass('public.idx_comments_visible_thread_preview') is not null,
  'visible thread preview partial index exists'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  ('00000000-0000-0000-0000-' || lpad(sequence.value::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'comment-read-path-' || sequence.value || '@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('username', 'comment_read_path_' || sequence.value),
  now(),
  now()
from generate_series(1, 10) as sequence(value);

select lives_ok(
  $$
    insert into public.comments (
      id, target_type, target_id, user_id, content
    ) values (
      '30000000-0000-0000-0000-000000000001',
      'bandori_card',
      '595',
      '00000000-0000-0000-0000-000000000001',
      'Card comment target constraint test'
    )
  $$,
  'comments accept Bandori card targets'
);

select throws_ok(
  $$
    insert into public.comments (
      id, target_type, target_id, user_id, content
    ) values (
      '30000000-0000-0000-0000-000000000002',
      'unknown_target',
      '595',
      '00000000-0000-0000-0000-000000000001',
      'Unknown target constraint test'
    )
  $$,
  '23514',
  null,
  'comments reject unknown target types'
);

select lives_ok(
  $$
    insert into public.comment_notifications (
      recipient_user_id,
      actor_user_id,
      type,
      target_type,
      target_id,
      comment_id,
      activity_comment_id
    ) values (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      'comment_reply',
      'bandori_card',
      '595',
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001'
    )
  $$,
  'comment notifications accept Bandori card targets'
);

select throws_ok(
  $$
    insert into public.comment_notifications (
      recipient_user_id,
      actor_user_id,
      type,
      target_type,
      target_id,
      comment_id,
      activity_comment_id
    ) values (
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      'comment_reply',
      'unknown_target',
      '595',
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001'
    )
  $$,
  '23514',
  null,
  'comment notifications reject unknown target types'
);

select lives_ok(
  $$
    insert into public.comments (
      id, target_type, target_id, user_id, content
    ) values (
      '30000000-0000-0000-0000-000000000003',
      'bandori_card',
      '595',
      '00000000-0000-0000-0000-000000000001',
      repeat('长', 1000)
    )
  $$,
  'shared comments accept 1000 Unicode characters'
);

select throws_ok(
  $$
    insert into public.comments (
      id, target_type, target_id, user_id, content
    ) values (
      '30000000-0000-0000-0000-000000000004',
      'bandori_card',
      '595',
      '00000000-0000-0000-0000-000000000001',
      repeat('长', 1001)
    )
  $$,
  '23514',
  null,
  'shared comments reject more than 1000 Unicode characters'
);

select lives_ok(
  $$
    insert into public.guestbook_comments (
      id, user_id, content
    ) values (
      '40000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      repeat('旧', 500)
    )
  $$,
  'legacy Othello guestbook still accepts 500 Unicode characters'
);

select throws_ok(
  $$
    insert into public.guestbook_comments (
      id, user_id, content
    ) values (
      '40000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      repeat('旧', 501)
    )
  $$,
  '23514',
  null,
  'legacy Othello guestbook still rejects more than 500 Unicode characters'
);

insert into public.comments (
  id,
  target_type,
  target_id,
  user_id,
  content,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'bandori_event',
    'comment-read-path-test',
    '00000000-0000-0000-0000-000000000001',
    'Root one',
    '2026-08-11 00:00:00+00',
    '2026-08-11 00:00:00+00'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'bandori_event',
    'comment-read-path-test',
    '00000000-0000-0000-0000-000000000002',
    'Root two',
    '2026-08-11 00:00:01+00',
    '2026-08-11 00:00:01+00'
  );

insert into public.comments (
  id,
  target_type,
  target_id,
  parent_id,
  user_id,
  content,
  created_at,
  updated_at,
  moderation_status
)
values
  ('20000000-0000-0000-0000-000000000001', 'bandori_event', 'comment-read-path-test', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Hidden earliest reply', '2026-08-11 00:01:00+00', '2026-08-11 00:01:00+00', 'hidden'),
  ('20000000-0000-0000-0000-000000000002', 'bandori_event', 'comment-read-path-test', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Visible reply 1', '2026-08-11 00:01:01+00', '2026-08-11 00:01:01+00', 'visible'),
  ('20000000-0000-0000-0000-000000000003', 'bandori_event', 'comment-read-path-test', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'Visible reply 2', '2026-08-11 00:01:02+00', '2026-08-11 00:01:02+00', 'visible'),
  ('20000000-0000-0000-0000-000000000004', 'bandori_event', 'comment-read-path-test', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Visible reply 3', '2026-08-11 00:01:03+00', '2026-08-11 00:01:03+00', 'visible'),
  ('20000000-0000-0000-0000-000000000005', 'bandori_event', 'comment-read-path-test', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'Visible reply 4', '2026-08-11 00:01:04+00', '2026-08-11 00:01:04+00', 'visible'),
  ('20000000-0000-0000-0000-000000000006', 'bandori_event', 'comment-read-path-test', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'Root two reply 1', '2026-08-11 00:02:01+00', '2026-08-11 00:02:01+00', 'visible'),
  ('20000000-0000-0000-0000-000000000007', 'bandori_event', 'comment-read-path-test', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000007', 'Root two reply 2', '2026-08-11 00:02:02+00', '2026-08-11 00:02:02+00', 'visible');

insert into public.comment_reactions (
  comment_id,
  user_id,
  emoji_key,
  created_at
)
select
  '10000000-0000-0000-0000-000000000001',
  ('00000000-0000-0000-0000-' || lpad(sequence.value::text, 12, '0'))::uuid,
  'KokoroYay',
  '2026-08-11 00:03:00+00'::timestamptz
from generate_series(1, 10) as sequence(value);

insert into public.comment_reactions (
  comment_id,
  user_id,
  emoji_key,
  created_at
)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Tae', '2026-08-11 00:04:00+00'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Tae', '2026-08-11 00:04:01+00');

insert into public.comment_reactions (
  comment_id,
  user_id,
  emoji_key,
  created_at
)
select
  '10000000-0000-0000-0000-000000000002',
  ('00000000-0000-0000-0000-' || lpad(participant.value::text, 12, '0'))::uuid,
  'ScaleEmoji' || lpad(emoji.value::text, 3, '0'),
  '2026-08-11 00:10:00+00'::timestamptz + emoji.value * interval '1 second'
from generate_series(1, 158) as emoji(value)
cross join generate_series(1, 8) as participant(value);

set local role service_role;

select is(
  (
    select count(*)
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      null
    )
  ),
  1::bigint,
  'reaction summary returns one row per comment'
);

select is(
  (
    select jsonb_array_length(reaction_group.value->'users')
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-000000000010'
    ) as summary
    cross join lateral jsonb_array_elements(summary.reaction_groups) as reaction_group(value)
    where reaction_group.value->>'emoji_key' = 'KokoroYay'
  ),
  8,
  'reaction summary returns at most eight preview users'
);

select is(
  (
    select (reaction_group.value->>'reaction_count')::bigint
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-000000000010'
    ) as summary
    cross join lateral jsonb_array_elements(summary.reaction_groups) as reaction_group(value)
    where reaction_group.value->>'emoji_key' = 'KokoroYay'
  ),
  10::bigint,
  'reaction summary keeps the exact participant count'
);

select is(
  (
    select (reaction_group.value->>'reacted_by_viewer')::boolean
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-000000000010'
    ) as summary
    cross join lateral jsonb_array_elements(summary.reaction_groups) as reaction_group(value)
    where reaction_group.value->>'emoji_key' = 'KokoroYay'
  ),
  true,
  'viewer reaction is detected outside the first eight participants'
);

select results_eq(
  $$
    select participant.value->>'user_id'
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-000000000010'
    ) as summary
    cross join lateral jsonb_array_elements(summary.reaction_groups) as reaction_group(value)
    cross join lateral jsonb_array_elements(reaction_group.value->'users')
      with ordinality as participant(value, participant_rank)
    where reaction_group.value->>'emoji_key' = 'KokoroYay'
    order by participant.participant_rank
  $$,
  $$
    values
      ('00000000-0000-0000-0000-000000000001'),
      ('00000000-0000-0000-0000-000000000002'),
      ('00000000-0000-0000-0000-000000000003'),
      ('00000000-0000-0000-0000-000000000004'),
      ('00000000-0000-0000-0000-000000000005'),
      ('00000000-0000-0000-0000-000000000006'),
      ('00000000-0000-0000-0000-000000000007'),
      ('00000000-0000-0000-0000-000000000008')
  $$,
  'reaction previews use user ID as the stable timestamp tie-breaker'
);

select is(
  (
    select reaction_groups->0->>'emoji_key'
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      null
    )
  ),
  'KokoroYay',
  'reaction groups preserve first-use ordering'
);

select is(
  (
    select reaction_group.value->'users'->0->>'username'
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      null
    ) as summary
    cross join lateral jsonb_array_elements(summary.reaction_groups) as reaction_group(value)
    where reaction_group.value->>'emoji_key' = 'KokoroYay'
  ),
  'comment_read_path_1',
  'reaction preview JSON includes profile display data'
);

select is(
  (
    select count(*)
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000002']::uuid[],
      null
    )
  ),
  1::bigint,
  'a comment with more than one thousand former flat rows still returns one RPC row'
);

select is(
  (
    select jsonb_array_length(reaction_groups)
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000002']::uuid[],
      null
    )
  ),
  158,
  'bounded reaction summary keeps every emoji group'
);

select is(
  (
    select bool_and(
      (reaction_group.value->>'reaction_count')::integer = 8
      and jsonb_array_length(reaction_group.value->'users') = 8
    )
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000002']::uuid[],
      null
    ) as summary
    cross join lateral jsonb_array_elements(summary.reaction_groups) as reaction_group(value)
  ),
  true,
  'bounded reaction summary keeps exact counts and complete previews'
);

select results_eq(
  $$
    select reaction_groups->0->>'emoji_key', reaction_groups->157->>'emoji_key'
    from public.read_comment_reaction_summary_rows(
      array['10000000-0000-0000-0000-000000000002']::uuid[],
      null
    )
  $$,
  $$
    values ('ScaleEmoji001', 'ScaleEmoji158')
  $$,
  'bounded reaction summary preserves group ordering at scale'
);

select results_eq(
  $$
    select reply_id::text
    from public.read_comment_preview_reply_ids(
      array['10000000-0000-0000-0000-000000000001']::uuid[]
    )
  $$,
  $$
    values
      ('20000000-0000-0000-0000-000000000002'),
      ('20000000-0000-0000-0000-000000000003'),
      ('20000000-0000-0000-0000-000000000004')
  $$,
  'reply preview returns the first three visible replies per root'
);

select results_eq(
  $$
    select root_id::text, reply_id::text
    from public.read_comment_preview_reply_ids(
      array[
        '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002'
      ]::uuid[]
    )
    where root_id = '10000000-0000-0000-0000-000000000002'
  $$,
  $$
    values
      ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006'),
      ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000007')
  $$,
  'reply preview batches multiple roots independently'
);

select is(
  (
    select count(*)
    from public.read_comment_reaction_summary_rows(null, null)
  ),
  0::bigint,
  'reaction summary treats a null ID array as empty'
);

select is(
  (
    select count(*)
    from public.read_comment_preview_reply_ids(null)
  ),
  0::bigint,
  'reply preview treats a null ID array as empty'
);

select * from finish();

rollback;
