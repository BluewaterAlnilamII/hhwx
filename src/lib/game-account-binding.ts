import { ApiRouteError } from "@/lib/api-contracts";
import { fetchBandoriPlayerProfile } from "@/lib/bandori-player-fetcher";

export const GAME_BIND_CHALLENGE_TTL_MINUTES = 10;
export const GAME_BIND_CHALLENGE_MAX_ATTEMPTS = 5;
export const GAME_BIND_CHALLENGE_RETENTION_DAYS = 7;


const CHALLENGE_PREFIX = "hhwx";
const GAME_UID_PATTERN = /^[1-9][0-9]{3,15}$/;
const CHALLENGE_SUFFIX_LENGTH = 6;
const GAME_BIND_PROFILE_SERVER = "cn";

export type GameAccountBinding = {
  gameUid: string;
  boundAt: string;
};

export type GameBindChallenge = {
  id: string;
  gameUid: string;
  challenge: string;
  expiresAt: string;
};

export function normalizeGameUid(value: unknown): string {
  const gameUid = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

  if (!GAME_UID_PATTERN.test(gameUid)) {
    throw new ApiRouteError(400, "INVALID_GAME_UID", "\u8bf7\u8f93\u5165\u6709\u6548\u7684\u6e38\u620f UID");
  }

  return gameUid;
}

export function createGameBindChallenge(): string {
  let suffix = "";

  while (suffix.length < CHALLENGE_SUFFIX_LENGTH) {
    const randomBytes = crypto.getRandomValues(new Uint8Array(CHALLENGE_SUFFIX_LENGTH));

    for (const byte of randomBytes) {
      if (byte >= 250) {
        continue;
      }

      suffix += String(byte % 10);
      if (suffix.length === CHALLENGE_SUFFIX_LENGTH) {
        break;
      }
    }
  }

  return `${CHALLENGE_PREFIX}${suffix}`;
}

export function createChallengeExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + GAME_BIND_CHALLENGE_TTL_MINUTES * 60 * 1000).toISOString();
}

export function isSignatureMatch(signature: unknown, challenge: string): boolean {
  return typeof signature === "string" && signature.trim() === challenge;
}

export async function fetchGameProfileSignature(gameUid: string): Promise<{ signature: string; fetchedAt: string | null }> {
  const player = await fetchBandoriPlayerProfile(GAME_BIND_PROFILE_SERVER, gameUid, 3);
  const signature = player.profile.introduction;

  if (typeof signature !== "string") {
    throw new ApiRouteError(
      502,
      "TRACKER_SERVICE_INVALID_RESPONSE",
      "\u6e38\u620f\u8d26\u53f7\u9a8c\u8bc1\u670d\u52a1\u8fd4\u56de\u683c\u5f0f\u65e0\u6548",
    );
  }

  return {
    signature,
    fetchedAt: player.fetchedAt,
  };
}
