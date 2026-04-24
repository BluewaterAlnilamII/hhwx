import { ApiRouteError } from "@/lib/api-contracts";

export const GAME_BIND_CHALLENGE_TTL_MINUTES = 30;
export const GAME_BIND_CHALLENGE_MAX_ATTEMPTS = 5;
export const GAME_BIND_CHALLENGE_RETENTION_DAYS = 7;


const CHALLENGE_PREFIX = "hhwx";
const CHALLENGE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const GAME_UID_PATTERN = /^[1-9][0-9]{3,15}$/;
const CHALLENGE_SUFFIX_LENGTH = 8;

export type GameAccountBinding = {
  gameUid: string;
  boundAt: string;
  lastVerifiedAt: string;
};

export type GameBindChallenge = {
  id: string;
  gameUid: string;
  challenge: string;
  expiresAt: string;
};

type TrackerSignaturePayload = {
  signature?: unknown;
  fetchedAt?: unknown;
};

export function normalizeGameUid(value: unknown): string {
  const gameUid = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

  if (!GAME_UID_PATTERN.test(gameUid)) {
    throw new ApiRouteError(400, "INVALID_GAME_UID", "\u8bf7\u8f93\u5165\u6709\u6548\u7684\u6e38\u620f UID");
  }

  return gameUid;
}

export function createGameBindChallenge(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(CHALLENGE_SUFFIX_LENGTH));
  let suffix = "";

  for (const byte of randomBytes) {
    suffix += CHALLENGE_ALPHABET[byte % CHALLENGE_ALPHABET.length];
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
  const baseUrl = process.env.HHWX_USER_FETCHER_BASE_URL?.trim();
  const token = process.env.HHWX_USER_FETCHER_TOKEN?.trim();

  if (!baseUrl || !token) {
    throw new ApiRouteError(500, "TRACKER_SERVICE_NOT_CONFIGURED", "\u6e38\u620f\u8d26\u53f7\u9a8c\u8bc1\u670d\u52a1\u5c1a\u672a\u914d\u7f6e");
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/internal/hhwx-user-fetcher/profile-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ gameUid }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as TrackerSignaturePayload | null;

  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiRouteError(503, "TRACKER_SERVICE_BUSY", "\u6e38\u620f\u8d26\u53f7\u9a8c\u8bc1\u670d\u52a1\u7e41\u5fd9\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5", payload);
    }

    throw new ApiRouteError(response.status >= 500 ? 502 : 400, "TRACKER_SERVICE_FAILED", "\u8bfb\u53d6\u6e38\u620f\u8d26\u53f7\u7b7e\u540d\u5931\u8d25", payload);
  }

  if (!payload || typeof payload.signature !== "string") {
    throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "\u6e38\u620f\u8d26\u53f7\u9a8c\u8bc1\u670d\u52a1\u8fd4\u56de\u683c\u5f0f\u65e0\u6548");
  }

  return {
    signature: payload.signature,
    fetchedAt: typeof payload.fetchedAt === "string" ? payload.fetchedAt : null,
  };
}

