begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.set_profile_display_degree(uuid,integer,integer,integer)',
    'EXECUTE'
  ),
  'authenticated cannot execute the effect-aware display Degree RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.set_profile_display_degree(uuid,integer,integer,integer)',
    'EXECUTE'
  ),
  'service_role can execute the effect-aware display Degree RPC'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.profiles',
    'display_degree_effect_id',
    'UPDATE'
  ),
  'authenticated cannot directly update the display Degree effect column'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'f1740f88-f48e-44b9-a557-7a458070b0d1',
    'authenticated', 'authenticated', 'display-degree-effect-1@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"display_degree_effect_1"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f1740f88-f48e-44b9-a557-7a458070b0d2',
    'authenticated', 'authenticated', 'display-degree-effect-2@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"display_degree_effect_2"}'::jsonb,
    now(), now()
  );

select is(
  (
    select display_degree_effect_id
    from public.profiles
    where id = 'f1740f88-f48e-44b9-a557-7a458070b0d1'
  ),
  null::integer,
  'new profiles select the standard Degree variant by default'
);

insert into public.user_game_bindings (
  game_uid, web_user_id, owned_degree_ids, owned_degree_effect_ids
)
values
  ('9301', 'f1740f88-f48e-44b9-a557-7a458070b0d1', array[201], array[901]),
  ('9302', 'f1740f88-f48e-44b9-a557-7a458070b0d1', array[201], '{}'),
  ('9303', 'f1740f88-f48e-44b9-a557-7a458070b0d1', array[202], array[902]);

set local role service_role;

select throws_ok(
  $$ select public.set_profile_display_degree(
    'f1740f88-f48e-44b9-a557-7a458070b0d1', 3, 201, 902
  ) $$,
  'P0001',
  'display degree is not owned',
  'the Degree and effect must be owned by the same binding'
);

select throws_ok(
  $$ select public.set_profile_display_degree(
    'f1740f88-f48e-44b9-a557-7a458070b0d1', 0, 100, 901
  ) $$,
  'P0001',
  'display degree effect is only available on CN',
  'an effect cannot be selected for a non-CN Degree'
);

select is(
  public.set_profile_display_degree(
    'f1740f88-f48e-44b9-a557-7a458070b0d1', 3, 201, 901
  ),
  '{"displayDegreeId": 201, "displayDegreeServer": 3, "displayDegreeEffectId": 901}'::jsonb,
  'an owned effect variant can be selected'
);

select is(
  (
    select (display_degree_server, display_degree_id, display_degree_effect_id)::text
    from public.profiles
    where id = 'f1740f88-f48e-44b9-a557-7a458070b0d1'
  ),
  '(3,201,901)',
  'the effect variant is stored on the profile'
);

select is(
  public.set_profile_display_degree(
    'f1740f88-f48e-44b9-a557-7a458070b0d1', 3, 201
  ),
  '{"displayDegreeId": 201, "displayDegreeServer": 3}'::jsonb,
  'the legacy RPC keeps its response contract and selects the standard variant'
);

select is(
  (
    select display_degree_effect_id
    from public.profiles
    where id = 'f1740f88-f48e-44b9-a557-7a458070b0d1'
  ),
  null::integer,
  'the legacy RPC clears a previously selected effect'
);

select public.set_profile_display_degree(
  'f1740f88-f48e-44b9-a557-7a458070b0d1', 3, 201, 901
);
select public.unbind_game_uid('9301', 'f1740f88-f48e-44b9-a557-7a458070b0d1');

select is(
  (
    select (display_degree_server, display_degree_id, display_degree_effect_id)::text
    from public.profiles
    where id = 'f1740f88-f48e-44b9-a557-7a458070b0d1'
  ),
  '(3,201,)',
  'removing the effect owner falls back to the still-owned standard variant'
);

select public.set_profile_display_degree(
  'f1740f88-f48e-44b9-a557-7a458070b0d1', 3, 202, 902
);

insert into public.user_game_bind_challenges (
  id, web_user_id, game_uid, challenge, expires_at
)
values (
  'f2740f88-f48e-44b9-a557-7a458070b0d3',
  'f1740f88-f48e-44b9-a557-7a458070b0d2',
  '9303',
  'hhwx930300',
  now() + interval '10 minutes'
);

select is(
  (public.complete_game_uid_binding(
    'f2740f88-f48e-44b9-a557-7a458070b0d3',
    '9303',
    'f1740f88-f48e-44b9-a557-7a458070b0d2'
  ) ->> 'transferred')::boolean,
  true,
  'the effect-owning binding is transferred to the new web user'
);

select is(
  (
    select (display_degree_server, display_degree_id, display_degree_effect_id)::text
    from public.profiles
    where id = 'f1740f88-f48e-44b9-a557-7a458070b0d1'
  ),
  '(0,100,)',
  'transferring the final Degree owner restores the previous user fallback'
);

select * from finish();
rollback;
