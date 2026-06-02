-- Optional profile avatar card selection.
-- Stores only the selected Bandori card id and art variant; card metadata and
-- image URLs are resolved from Bestdori master data at read/render time.
-- Card 1 normal art is the default avatar for profiles without an explicit
-- selection.

alter table public.profiles
  add column if not exists avatar_card_id integer;

alter table public.profiles
  add column if not exists avatar_card_train_type text;

update public.profiles
set
  avatar_card_id = 1,
  avatar_card_train_type = 'normal'
where avatar_card_id is null;

update public.profiles
set avatar_card_train_type = 'normal'
where avatar_card_id = 1;

alter table public.profiles
  alter column avatar_card_id set default 1;

alter table public.profiles
  alter column avatar_card_id set not null;

alter table public.profiles
  alter column avatar_card_train_type set default 'normal';

alter table public.profiles
  alter column avatar_card_train_type set not null;

alter table public.profiles
  drop constraint if exists profiles_avatar_card_id_check;

alter table public.profiles
  add constraint profiles_avatar_card_id_check
  check (avatar_card_id > 0);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_avatar_card_train_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_card_train_type_check
      check (avatar_card_train_type in ('normal', 'after_training'));
  end if;
end $$;

comment on column public.profiles.avatar_card_id is
  'Bandori card id selected as the public profile avatar; defaults to card 1.';

comment on column public.profiles.avatar_card_train_type is
  'Selected avatar art variant: normal or after_training.';
