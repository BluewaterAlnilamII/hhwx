import assert from "node:assert/strict";
import test from "node:test";
import {
  MUSIC_PLAYER_PREFERENCES_STORAGE_KEY,
  MUSIC_PLAYER_QUEUE_STORAGE_KEY,
  createMusicPlayerPreferencesSnapshot,
  createMusicPlayerQueueSnapshot,
  parseMusicPlayerPlaybackClaim,
  parseMusicPlayerPreferencesSnapshot,
  parseMusicPlayerQueueSnapshot,
} from "../src/lib/music-player-contract.ts";
import {
  readMusicPlayerPreferencesSnapshot,
  readMusicPlayerQueueSnapshot,
  writeMusicPlayerPreferencesSnapshot,
  writeMusicPlayerQueueSnapshot,
} from "../src/lib/music-player-persistence.ts";
import {
  MUSIC_PLAYER_MARQUEE_MAX_SPEED_PX_PER_SECOND,
  MUSIC_PLAYER_MARQUEE_TRAVEL_FRACTION,
  calculateMusicPlayerMarqueeDurationSeconds,
} from "../src/lib/music-player-marquee.ts";

const ITEM = {
  id: "bandori:595",
  provider: "bandori",
  providerTrackId: "595",
  title: "STAR BEAT!～ホシノコドウ～",
  artist: "Poppin'Party",
  sourceUrl: "https://cdn.hhwx.org/bandori/music/audio/595.ogg",
  artworkUrl: "https://cdn.hhwx.org/bandori/music/jackets/595.png",
  durationSeconds: 289,
};

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("music player queue snapshot round-trips only durable queue state", () => {
  const snapshot = createMusicPlayerQueueSnapshot([ITEM], 0, 1234);
  const serialized = JSON.stringify(snapshot);
  const parsed = parseMusicPlayerQueueSnapshot(serialized);

  assert.deepEqual(parsed, snapshot);
  assert.doesNotMatch(serialized, /currentTime|"duration":|status|error/u);
});

test("optional loop points preserve old queues and reject invalid ranges", () => {
  const oldQueue = createMusicPlayerQueueSnapshot([ITEM], 0, 1234);
  assert.deepEqual(parseMusicPlayerQueueSnapshot(JSON.stringify(oldQueue)), oldQueue);

  const loopedItem = {
    ...ITEM,
    loop: { startSeconds: 15, endSeconds: 80 },
  };
  const loopedQueue = createMusicPlayerQueueSnapshot([loopedItem], 0, 1234);
  assert.deepEqual(parseMusicPlayerQueueSnapshot(JSON.stringify(loopedQueue)), loopedQueue);
  for (const loop of [
    { startSeconds: -1, endSeconds: 80 },
    { startSeconds: 80, endSeconds: 80 },
    { startSeconds: 15, endSeconds: 300 },
    { startSeconds: 15, endSeconds: Infinity },
  ]) {
    assert.equal(parseMusicPlayerQueueSnapshot(JSON.stringify({
      ...loopedQueue,
      items: [{ ...loopedItem, loop }],
    })), null);
  }
});

test("Falcom loop tracks survive queue persistence without admitting unknown providers", () => {
  const item = {
    ...ITEM,
    id: "falcom:ed6210",
    provider: "falcom",
    providerTrackId: "ed6210",
    title: "空を見上げて",
    artist: null,
    sourceUrl: "https://cdn.hhwx.org/hhwx/music/falcom-sound-team-jdk/ed6210_%E7%A9%BA%E3%82%92%E8%A6%8B%E4%B8%8A%E3%81%92%E3%81%A6_v1.mp3",
    artworkUrl: null,
    durationSeconds: 160.709021,
    loop: { startSeconds: 1_012_726 / 48_000, endSeconds: 6_895_279 / 48_000 },
  };
  const snapshot = createMusicPlayerQueueSnapshot([item], 0, 1234);
  assert.deepEqual(parseMusicPlayerQueueSnapshot(JSON.stringify(snapshot)), snapshot);
  assert.equal(parseMusicPlayerQueueSnapshot(JSON.stringify({
    ...snapshot,
    items: [{ ...item, provider: "unknown" }],
  })), null);
});

test("music player queue parser rejects version drift and unsafe sources", () => {
  const snapshot = createMusicPlayerQueueSnapshot([ITEM], 0, 1234);
  assert.equal(parseMusicPlayerQueueSnapshot(JSON.stringify({ ...snapshot, version: 2 })), null);
  assert.equal(parseMusicPlayerQueueSnapshot(JSON.stringify({
    ...snapshot,
    items: [{ ...ITEM, sourceUrl: "javascript:alert(1)" }],
  })), null);
  assert.equal(parseMusicPlayerQueueSnapshot(JSON.stringify({ ...snapshot, currentIndex: 4 })), null);
  assert.equal(parseMusicPlayerQueueSnapshot(JSON.stringify({ ...snapshot, extra: true })), null);
});

test("music player preferences round-trip independently from queue state", () => {
  const snapshot = createMusicPlayerPreferencesSnapshot(0.42, true, "one", 5678);
  assert.deepEqual(parseMusicPlayerPreferencesSnapshot(JSON.stringify(snapshot)), snapshot);
  assert.equal(parseMusicPlayerPreferencesSnapshot(JSON.stringify({ ...snapshot, volume: 2 })), null);
});

test("music player persistence uses separate versioned storage keys", () => {
  const storage = createMemoryStorage();
  writeMusicPlayerQueueSnapshot(storage, [ITEM], 0);
  writeMusicPlayerPreferencesSnapshot(storage, 0.5, false, "off");

  assert.deepEqual(readMusicPlayerQueueSnapshot(storage)?.items, [ITEM]);
  assert.equal(readMusicPlayerPreferencesSnapshot(storage)?.volume, 0.5);
  assert.ok(storage.getItem(MUSIC_PLAYER_QUEUE_STORAGE_KEY));
  assert.ok(storage.getItem(MUSIC_PLAYER_PREFERENCES_STORAGE_KEY));
});

test("playback claim parser rejects unknown cross-tab messages", () => {
  const validClaim = {
    version: 1,
    type: "playback-claim",
    ownerId: "tab-a",
    token: "claim-a",
    claimedAt: 1234,
  };
  assert.deepEqual(parseMusicPlayerPlaybackClaim(JSON.stringify(validClaim)), validClaim);
  assert.equal(parseMusicPlayerPlaybackClaim(JSON.stringify({ ...validClaim, type: "pause-all" })), null);
});

test("overflow marquee duration enforces a maximum travel speed", () => {
  for (const overflowDistance of [31, 288, 1000, 3000]) {
    const duration = calculateMusicPlayerMarqueeDurationSeconds(overflowDistance);
    const travelSpeed = overflowDistance / (duration * MUSIC_PLAYER_MARQUEE_TRAVEL_FRACTION);
    assert.ok(travelSpeed <= MUSIC_PLAYER_MARQUEE_MAX_SPEED_PX_PER_SECOND + Number.EPSILON);
  }

  assert.equal(calculateMusicPlayerMarqueeDurationSeconds(31), 7);
  assert.ok(calculateMusicPlayerMarqueeDurationSeconds(1000) > 16);
});
