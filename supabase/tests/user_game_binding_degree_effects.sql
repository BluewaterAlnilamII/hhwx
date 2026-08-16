begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.merge_game_uid_binding_degree_effects(uuid,text,integer[])',
    'EXECUTE'
  ),
  'authenticated cannot merge bound game Degree effect IDs'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.merge_game_uid_binding_degree_effects(uuid,text,integer[])',
    'EXECUTE'
  ),
  'anon cannot merge bound game Degree effect IDs'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.merge_game_uid_binding_degree_effects(uuid,text,integer[])',
    'EXECUTE'
  ),
  'service_role can merge bound game Degree effect IDs'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'e1740f88-f48e-44b9-a557-7a458070b0d1',
  'authenticated', 'authenticated', 'degree-effect@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":"degree_effect"}'::jsonb,
  now(), now()
);

insert into public.user_game_bindings (
  game_uid, web_user_id, owned_degree_ids, owned_degree_effect_ids
)
values
  ('9201', 'e1740f88-f48e-44b9-a557-7a458070b0d1', array[201], '{}'),
  ('9202', 'e1740f88-f48e-44b9-a557-7a458070b0d1', array[202], array[999]);

select is(
  (
    select owned_degree_effect_ids
    from public.user_game_bindings
    where game_uid = '9201'
  ),
  '{}'::integer[],
  'new bindings default to an empty Degree effect ID array'
);

set local role service_role;

select is(
  public.merge_game_uid_binding_degree_effects(
    'e1740f88-f48e-44b9-a557-7a458070b0d1',
    '9201',
    array[902, 901, 902, 0, null]::integer[]
  ),
  array[901, 902]::integer[],
  'first merge filters, deduplicates, and sorts Degree effect IDs'
);

select is(
  public.merge_game_uid_binding_degree_effects(
    'e1740f88-f48e-44b9-a557-7a458070b0d1',
    '9201',
    array[903, 902]::integer[]
  ),
  array[901, 902, 903]::integer[],
  'later merges preserve existing effect IDs and add new IDs'
);

select is(
  public.merge_game_uid_binding_degree_effects(
    'e1740f88-f48e-44b9-a557-7a458070b0d1',
    '9201',
    null::integer[]
  ),
  array[901, 902, 903]::integer[],
  'a missing observation does not erase existing effect IDs'
);

select throws_ok(
  $$ select public.merge_game_uid_binding_degree_effects(
    'e1740f88-f48e-44b9-a557-7a458070b0d1',
    'missing',
    array[901]::integer[]
  ) $$,
  'P0001',
  'game uid is not bound to user',
  'an unknown binding is rejected'
);

select throws_ok(
  $$ select public.merge_game_uid_binding_degree_effects(
    '00000000-0000-0000-0000-000000000001',
    '9201',
    array[901]::integer[]
  ) $$,
  'P0001',
  'game uid is not bound to user',
  'a binding owned by another user is rejected'
);

select * from finish();
rollback;
