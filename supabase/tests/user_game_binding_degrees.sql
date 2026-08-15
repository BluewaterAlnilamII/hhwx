begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.merge_game_uid_binding_degrees(uuid,text,integer[])',
    'EXECUTE'
  ),
  'authenticated cannot merge bound game Degree IDs'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.merge_game_uid_binding_degrees(uuid,text,integer[])',
    'EXECUTE'
  ),
  'service_role can merge bound game Degree IDs'
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
  'b1740f88-f48e-44b9-a557-7a458070b0d5',
  'authenticated',
  'authenticated',
  'binding-degrees-test@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.user_game_bindings (game_uid, web_user_id)
values ('1001', 'b1740f88-f48e-44b9-a557-7a458070b0d5');

select is(
  (
    select owned_degree_ids
    from public.user_game_bindings
    where game_uid = '1001'
  ),
  '{}'::integer[],
  'new bindings default to an empty Degree ID array'
);

set local role service_role;

select is(
  public.merge_game_uid_binding_degrees(
    'b1740f88-f48e-44b9-a557-7a458070b0d5',
    '1001',
    array[202, 101, 202, 0, null]::integer[]
  ),
  array[101, 202]::integer[],
  'first merge filters, deduplicates, and sorts Degree IDs'
);

select is(
  public.merge_game_uid_binding_degrees(
    'b1740f88-f48e-44b9-a557-7a458070b0d5',
    '1001',
    array[303, 202]::integer[]
  ),
  array[101, 202, 303]::integer[],
  'later merges preserve existing IDs and add new IDs'
);

select is(
  public.merge_game_uid_binding_degrees(
    'b1740f88-f48e-44b9-a557-7a458070b0d5',
    '1001',
    '{}'::integer[]
  ),
  array[101, 202, 303]::integer[],
  'an empty observation preserves existing Degree IDs'
);

select * from finish();
rollback;
