begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.set_profile_display_degree(uuid,integer,integer)',
    'EXECUTE'
  ),
  'authenticated cannot execute the display Degree RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.set_profile_display_degree(uuid,integer,integer)',
    'EXECUTE'
  ),
  'service_role can execute the display Degree RPC'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.profiles',
    'display_degree_id',
    'UPDATE'
  ),
  'authenticated cannot directly update the display Degree columns'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'd1740f88-f48e-44b9-a557-7a458070b0d1',
    'authenticated', 'authenticated', 'display-degree-1@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"display_degree_1"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd1740f88-f48e-44b9-a557-7a458070b0d2',
    'authenticated', 'authenticated', 'display-degree-2@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"display_degree_2"}'::jsonb,
    now(), now()
  );

select is(
  (
    select (display_degree_server, display_degree_id)::text
    from public.profiles
    where id = 'd1740f88-f48e-44b9-a557-7a458070b0d1'
  ),
  '(0,100)',
  'new profiles default to JP Degree 100'
);

set local role service_role;

select throws_ok(
  $$ select public.set_profile_display_degree(
    'd1740f88-f48e-44b9-a557-7a458070b0d1', 3, 201
  ) $$,
  'P0001',
  'display degree is not owned',
  'the RPC rejects an unowned custom Degree'
);

select lives_ok(
  $$ select public.set_profile_display_degree(
    'd1740f88-f48e-44b9-a557-7a458070b0d1', 0, 100
  ) $$,
  'JP Degree 100 remains a legal fallback without ownership'
);

insert into public.user_game_bindings (game_uid, web_user_id, owned_degree_ids)
values
  ('9101', 'd1740f88-f48e-44b9-a557-7a458070b0d1', array[201]),
  ('9102', 'd1740f88-f48e-44b9-a557-7a458070b0d1', array[201]);

select is(
  public.set_profile_display_degree(
    'd1740f88-f48e-44b9-a557-7a458070b0d1', 3, 201
  ),
  '{"displayDegreeId": 201, "displayDegreeServer": 3}'::jsonb,
  'an owned CN Degree can be selected'
);

select is(
  (
    select (display_degree_server, display_degree_id)::text
    from public.profiles
    where id = 'd1740f88-f48e-44b9-a557-7a458070b0d1'
  ),
  '(3,201)',
  'the custom selection is stored on the profile'
);

select public.unbind_game_uid('9101', 'd1740f88-f48e-44b9-a557-7a458070b0d1');

select is(
  (
    select (display_degree_server, display_degree_id)::text
    from public.profiles
    where id = 'd1740f88-f48e-44b9-a557-7a458070b0d1'
  ),
  '(3,201)',
  'removing one duplicate owner preserves the selection'
);

select public.unbind_game_uid('9102', 'd1740f88-f48e-44b9-a557-7a458070b0d1');

select is(
  (
    select (display_degree_server, display_degree_id)::text
    from public.profiles
    where id = 'd1740f88-f48e-44b9-a557-7a458070b0d1'
  ),
  '(0,100)',
  'removing the final owner restores JP Degree 100'
);

insert into public.user_game_bindings (game_uid, web_user_id, owned_degree_ids)
values ('9103', 'd1740f88-f48e-44b9-a557-7a458070b0d1', array[202]);

select public.set_profile_display_degree(
  'd1740f88-f48e-44b9-a557-7a458070b0d1', 3, 202
);

insert into public.user_game_bind_challenges (
  id, web_user_id, game_uid, challenge, expires_at
)
values (
  'd2740f88-f48e-44b9-a557-7a458070b0d3',
  'd1740f88-f48e-44b9-a557-7a458070b0d2',
  '9103',
  'hhwx910300',
  now() + interval '10 minutes'
);

select is(
  (public.complete_game_uid_binding(
    'd2740f88-f48e-44b9-a557-7a458070b0d3',
    '9103',
    'd1740f88-f48e-44b9-a557-7a458070b0d2'
  ) ->> 'transferred')::boolean,
  true,
  'the binding is transferred to the new web user'
);

select is(
  (
    select (display_degree_server, display_degree_id)::text
    from public.profiles
    where id = 'd1740f88-f48e-44b9-a557-7a458070b0d1'
  ),
  '(0,100)',
  'transferring the final owner restores the previous user fallback'
);

select is(
  (
    select owned_degree_ids
    from public.user_game_bindings
    where game_uid = '9103'
      and web_user_id = 'd1740f88-f48e-44b9-a557-7a458070b0d2'
  ),
  array[202]::integer[],
  'transferred bindings retain their observed Degree ownership'
);

select * from finish();
rollback;
