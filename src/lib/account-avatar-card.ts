import { DEFAULT_ACCOUNT_AVATAR_CARD_ID } from "@/lib/account-avatar-defaults";
import { isKnownBandoriCardEntityCollision } from "@/lib/bandori/cards/regional-extensions";
import {
  normalizeBandoriServer,
  type BandoriServer,
} from "@/lib/bandori-server";

export type AccountAvatarCardIdentity = {
  cardId: number;
  entityServer: BandoriServer | null;
};

export function normalizeAccountAvatarCardServer(
  cardId: number,
  value: unknown,
): BandoriServer | null {
  if (!isKnownBandoriCardEntityCollision(cardId)) {
    return null;
  }

  const server = normalizeBandoriServer(value);
  return server === 1 || server === 3 ? server : null;
}

export function resolveStoredAccountAvatarCardIdentity(
  cardId: number,
  server: unknown,
): AccountAvatarCardIdentity {
  const entityServer = normalizeAccountAvatarCardServer(cardId, server);
  if (isKnownBandoriCardEntityCollision(cardId) && entityServer === null) {
    return {
      cardId: DEFAULT_ACCOUNT_AVATAR_CARD_ID,
      entityServer: null,
    };
  }

  return { cardId, entityServer };
}
