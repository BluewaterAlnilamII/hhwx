UPDATE public.profiles
SET
  avatar_card_id = 1,
  avatar_card_server = NULL,
  avatar_card_train_type = 'normal'
WHERE avatar_card_id BETWEEN 10001 AND 10010
  AND avatar_card_server IS NULL;

UPDATE public.profiles
SET avatar_card_server = NULL
WHERE avatar_card_id NOT BETWEEN 10001 AND 10010
  AND avatar_card_server IS NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_card_server_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_card_server_check
  CHECK (
    (
      avatar_card_id BETWEEN 10001 AND 10010
      AND avatar_card_server IN (1, 3)
    )
    OR
    (
      avatar_card_id NOT BETWEEN 10001 AND 10010
      AND avatar_card_server IS NULL
    )
  );

NOTIFY pgrst, 'reload schema';
