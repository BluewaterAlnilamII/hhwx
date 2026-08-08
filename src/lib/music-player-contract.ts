export const MUSIC_PLAYER_STORAGE_VERSION = 1;
export const MUSIC_PLAYER_QUEUE_STORAGE_KEY = "hhwx:music-player:queue:v1";
export const MUSIC_PLAYER_PREFERENCES_STORAGE_KEY = "hhwx:music-player:preferences:v1";
export const MUSIC_PLAYER_PLAYBACK_OWNER_STORAGE_KEY = "hhwx:music-player:playback-owner:v1";
export const MUSIC_PLAYER_BROADCAST_CHANNEL_NAME = "hhwx:music-player:v1";
export const MUSIC_PLAYER_TEMPORARY_QUEUE_ID = "temporary";

export const DEFAULT_MUSIC_PLAYER_VOLUME = 0.72;
export const DEFAULT_MUSIC_PLAYER_MUTED = false;
export const DEFAULT_MUSIC_PLAYER_REPEAT_MODE = "one" as const;

export type MusicPlayerRepeatMode = "off" | "one" | "all";
export type MusicPlayerStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export type MusicPlayerItem = {
  id: string;
  provider: "bandori";
  providerTrackId: string;
  title: string;
  artist: string | null;
  sourceUrl: string;
  artworkUrl: string | null;
  durationSeconds: number | null;
};

export type MusicPlayerQueueSnapshot = {
  version: typeof MUSIC_PLAYER_STORAGE_VERSION;
  queueId: string;
  items: MusicPlayerItem[];
  currentIndex: number | null;
  updatedAt: number;
};

export type MusicPlayerPreferencesSnapshot = {
  version: typeof MUSIC_PLAYER_STORAGE_VERSION;
  volume: number;
  muted: boolean;
  repeatMode: MusicPlayerRepeatMode;
  updatedAt: number;
};

export type MusicPlayerPlaybackClaim = {
  version: typeof MUSIC_PLAYER_STORAGE_VERSION;
  type: "playback-claim";
  ownerId: string;
  token: string;
  claimedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 128
    && /^[A-Za-z0-9][A-Za-z0-9:_-]*$/u.test(value);
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseMusicPlayerItem(value: unknown): MusicPlayerItem | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id",
    "provider",
    "providerTrackId",
    "title",
    "artist",
    "sourceUrl",
    "artworkUrl",
    "durationSeconds",
  ])) {
    return null;
  }

  if (
    !isSafeIdentifier(value.id)
    || value.provider !== "bandori"
    || !isSafeIdentifier(value.providerTrackId)
    || !isSafeText(value.title)
    || (value.artist !== null && (typeof value.artist !== "string" || value.artist.length > 512))
    || !isHttpUrl(value.sourceUrl)
    || (value.artworkUrl !== null && !isHttpUrl(value.artworkUrl))
    || (
      value.durationSeconds !== null
      && (
        typeof value.durationSeconds !== "number"
        || !Number.isFinite(value.durationSeconds)
        || value.durationSeconds <= 0
      )
    )
  ) {
    return null;
  }

  return {
    id: value.id,
    provider: value.provider,
    providerTrackId: value.providerTrackId,
    title: value.title.trim(),
    artist: typeof value.artist === "string" ? value.artist.trim() || null : null,
    sourceUrl: value.sourceUrl,
    artworkUrl: value.artworkUrl,
    durationSeconds: value.durationSeconds,
  };
}

export function parseMusicPlayerQueueSnapshot(rawValue: string | null): MusicPlayerQueueSnapshot | null {
  if (!rawValue) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(rawValue);
    if (!isRecord(value) || !hasExactKeys(value, [
      "version",
      "queueId",
      "items",
      "currentIndex",
      "updatedAt",
    ])) {
      return null;
    }
    if (
      value.version !== MUSIC_PLAYER_STORAGE_VERSION
      || !isSafeIdentifier(value.queueId)
      || !Array.isArray(value.items)
      || value.items.length > 500
      || typeof value.updatedAt !== "number"
      || !Number.isSafeInteger(value.updatedAt)
      || value.updatedAt < 0
    ) {
      return null;
    }

    const items = value.items.map(parseMusicPlayerItem);
    if (items.some((item) => item === null)) {
      return null;
    }

    if (items.length === 0) {
      if (value.currentIndex !== null) {
        return null;
      }
    } else if (
      typeof value.currentIndex !== "number"
      || !Number.isSafeInteger(value.currentIndex)
      || value.currentIndex < 0
      || value.currentIndex >= items.length
    ) {
      return null;
    }

    return {
      version: MUSIC_PLAYER_STORAGE_VERSION,
      queueId: value.queueId,
      items: items as MusicPlayerItem[],
      currentIndex: value.currentIndex as number | null,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

export function parseMusicPlayerPreferencesSnapshot(rawValue: string | null): MusicPlayerPreferencesSnapshot | null {
  if (!rawValue) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(rawValue);
    if (!isRecord(value) || !hasExactKeys(value, [
      "version",
      "volume",
      "muted",
      "repeatMode",
      "updatedAt",
    ])) {
      return null;
    }
    if (
      value.version !== MUSIC_PLAYER_STORAGE_VERSION
      || typeof value.volume !== "number"
      || !Number.isFinite(value.volume)
      || value.volume < 0
      || value.volume > 1
      || typeof value.muted !== "boolean"
      || !isMusicPlayerRepeatMode(value.repeatMode)
      || typeof value.updatedAt !== "number"
      || !Number.isSafeInteger(value.updatedAt)
      || value.updatedAt < 0
    ) {
      return null;
    }

    return {
      version: MUSIC_PLAYER_STORAGE_VERSION,
      volume: value.volume,
      muted: value.muted,
      repeatMode: value.repeatMode,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

export function parseMusicPlayerPlaybackClaim(rawValue: string | null): MusicPlayerPlaybackClaim | null {
  if (!rawValue) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(rawValue);
    if (!isRecord(value) || !hasExactKeys(value, [
      "version",
      "type",
      "ownerId",
      "token",
      "claimedAt",
    ])) {
      return null;
    }
    if (
      value.version !== MUSIC_PLAYER_STORAGE_VERSION
      || value.type !== "playback-claim"
      || !isSafeIdentifier(value.ownerId)
      || !isSafeIdentifier(value.token)
      || typeof value.claimedAt !== "number"
      || !Number.isSafeInteger(value.claimedAt)
      || value.claimedAt < 0
    ) {
      return null;
    }

    return {
      version: MUSIC_PLAYER_STORAGE_VERSION,
      type: "playback-claim",
      ownerId: value.ownerId,
      token: value.token,
      claimedAt: value.claimedAt,
    };
  } catch {
    return null;
  }
}

export function isMusicPlayerRepeatMode(value: unknown): value is MusicPlayerRepeatMode {
  return value === "off" || value === "one" || value === "all";
}

export function createMusicPlayerQueueSnapshot(
  items: MusicPlayerItem[],
  currentIndex: number | null,
  updatedAt = Date.now(),
): MusicPlayerQueueSnapshot {
  return {
    version: MUSIC_PLAYER_STORAGE_VERSION,
    queueId: MUSIC_PLAYER_TEMPORARY_QUEUE_ID,
    items,
    currentIndex,
    updatedAt,
  };
}

export function createMusicPlayerPreferencesSnapshot(
  volume: number,
  muted: boolean,
  repeatMode: MusicPlayerRepeatMode,
  updatedAt = Date.now(),
): MusicPlayerPreferencesSnapshot {
  return {
    version: MUSIC_PLAYER_STORAGE_VERSION,
    volume,
    muted,
    repeatMode,
    updatedAt,
  };
}
