ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_card_server SMALLINT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_card_server_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_card_server_check
  CHECK (avatar_card_server IS NULL OR avatar_card_server IN (1, 3));

COMMENT ON COLUMN public.profiles.avatar_card_server IS
  'Entity server for same-ID avatar card collisions; null for ordinary cards.';
