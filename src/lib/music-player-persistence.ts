import {
  MUSIC_PLAYER_PREFERENCES_STORAGE_KEY,
  MUSIC_PLAYER_QUEUE_STORAGE_KEY,
  createMusicPlayerPreferencesSnapshot,
  createMusicPlayerQueueSnapshot,
  parseMusicPlayerPreferencesSnapshot,
  parseMusicPlayerQueueSnapshot,
  type MusicPlayerItem,
  type MusicPlayerPreferencesSnapshot,
  type MusicPlayerQueueSnapshot,
  type MusicPlayerRepeatMode,
} from "@/lib/music-player-contract";

type MusicPlayerStorage = Pick<Storage, "getItem" | "setItem">;
type RemovableMusicPlayerStorage = Pick<Storage, "removeItem">;

export function readMusicPlayerQueueSnapshot(
  storage: MusicPlayerStorage,
): MusicPlayerQueueSnapshot | null {
  try {
    return parseMusicPlayerQueueSnapshot(storage.getItem(MUSIC_PLAYER_QUEUE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeMusicPlayerQueueSnapshot(
  storage: MusicPlayerStorage,
  items: MusicPlayerItem[],
  currentIndex: number | null,
): void {
  try {
    storage.setItem(
      MUSIC_PLAYER_QUEUE_STORAGE_KEY,
      JSON.stringify(createMusicPlayerQueueSnapshot(items, currentIndex)),
    );
  } catch {
    // Persistence is optional; the in-memory player remains usable when storage is unavailable.
  }
}

export function clearMusicPlayerQueueSnapshot(storage: RemovableMusicPlayerStorage): void {
  try {
    storage.removeItem(MUSIC_PLAYER_QUEUE_STORAGE_KEY);
  } catch {
    // Persistence is optional; the in-memory player has already been cleared.
  }
}

export function readMusicPlayerPreferencesSnapshot(
  storage: MusicPlayerStorage,
): MusicPlayerPreferencesSnapshot | null {
  try {
    return parseMusicPlayerPreferencesSnapshot(
      storage.getItem(MUSIC_PLAYER_PREFERENCES_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export function writeMusicPlayerPreferencesSnapshot(
  storage: MusicPlayerStorage,
  volume: number,
  muted: boolean,
  repeatMode: MusicPlayerRepeatMode,
): void {
  try {
    storage.setItem(
      MUSIC_PLAYER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(createMusicPlayerPreferencesSnapshot(volume, muted, repeatMode)),
    );
  } catch {
    // Persistence is optional; the in-memory player remains usable when storage is unavailable.
  }
}
