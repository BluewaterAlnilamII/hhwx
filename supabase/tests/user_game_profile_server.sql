begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select ok(
  to_regprocedure(
    'public.create_manual_game_profile(uuid,text,text,text,integer,integer,jsonb)'
  ) is null,
  'legacy manual profile RPC signature is removed'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_manual_game_profile(uuid,text,text,text,integer,integer,jsonb,integer)',
    'EXECUTE'
  ),
  'authenticated cannot execute manual profile RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_manual_game_profile(uuid,text,text,text,integer,integer,jsonb,integer)',
    'EXECUTE'
  ),
  'service_role can execute manual profile RPC'
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
values (
  '00000000-0000-0000-0000-000000000000',
  'a1843f63-ab1c-4bb5-9efa-e7aab5b00ef1',
  'authenticated',
  'authenticated',
  'profile-server-test@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

set local role service_role;

select is(
  (
    select server
    from public.create_manual_game_profile(
      p_web_user_id => 'a1843f63-ab1c-4bb5-9efa-e7aab5b00ef1',
      p_profile_name => 'EN Profile',
      p_payload_compressed => 'payload-en',
      p_payload_sha256 => 'sha-en',
      p_payload_size => 10,
      p_card_count => 2051,
      p_summary => '{}'::jsonb,
      p_server => 1
    )
  ),
  1,
  'manual profile RPC stores the EN server'
);

select is(
  (
    select server
    from public.create_manual_game_profile(
      p_web_user_id => 'a1843f63-ab1c-4bb5-9efa-e7aab5b00ef1',
      p_profile_name => 'Legacy Default Profile',
      p_payload_compressed => 'payload-default',
      p_payload_sha256 => 'sha-default',
      p_payload_size => 15,
      p_card_count => 0,
      p_summary => '{}'::jsonb
    )
  ),
  3,
  'legacy calls still default to the CN server'
);

select throws_ok(
  $$
    select public.create_manual_game_profile(
      p_web_user_id => 'a1843f63-ab1c-4bb5-9efa-e7aab5b00ef1',
      p_profile_name => 'Invalid Profile',
      p_payload_compressed => 'payload-invalid',
      p_payload_sha256 => 'sha-invalid',
      p_payload_size => 15,
      p_card_count => 0,
      p_summary => '{}'::jsonb,
      p_server => 4
    )
  $$,
  'P0001',
  'server must be between 0 and 3',
  'manual profile RPC rejects invalid servers'
);

select * from finish();

rollback;
