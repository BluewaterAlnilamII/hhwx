import assert from "node:assert/strict";
import test from "node:test";
import {
  MUSIC_PLAYER_PREFERENCES_STORAGE_KEY,
  MUSIC_PLAYER_QUEUE_STORAGE_KEY,
  createMusicPlayerPreferencesSnapshot,
  createMusicPlayerQueueSnapshot,
} from "../src/lib/music-player-contract.ts";
import { useMusicPlayerStore } from "../src/store/useMusicPlayerStore.ts";

const FIRST_ITEM = {
  id: "bandori:595",
  provider: "bandori",
  providerTrackId: "595",
  title: "First song",
  artist: "Band A",
  sourceUrl: "https://cdn.hhwx.org/first.ogg",
  artworkUrl: "https://cdn.hhwx.org/first.png",
  durationSeconds: 100,
};
const SECOND_ITEM = {
  ...FIRST_ITEM,
  id: "bandori:686",
  providerTrackId: "686",
  title: "Second song",
  sourceUrl: "https://cdn.hhwx.org/second.ogg",
  artworkUrl: "https://cdn.hhwx.org/second.png",
  durationSeconds: 120,
};

function createMemoryStorage(initialEntries = []) {
  const values = new Map(initialEntries);
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

function resetStore(storage = createMemoryStorage()) {
  globalThis.window = { localStorage: storage };
  useMusicPlayerStore.setState({
    queueId: "temporary",
    queue: [],
    currentIndex: null,
    status: "idle",
    currentTime: 0,
    duration: 0,
    volume: 0.72,
    muted: false,
    repeatMode: "off",
    hydrated: false,
    command: null,
  });
  return storage;
}

test("hydrate restores queue and preferences but starts paused at zero", () => {
  const storage = resetStore(createMemoryStorage([
    [MUSIC_PLAYER_QUEUE_STORAGE_KEY, JSON.stringify(createMusicPlayerQueueSnapshot([FIRST_ITEM], 0, 1))],
    [MUSIC_PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(createMusicPlayerPreferencesSnapshot(0.4, true, "off", 2))],
  ]));

  useMusicPlayerStore.getState().hydrate();
  const state = useMusicPlayerStore.getState();
  assert.equal(state.queue[0]?.id, FIRST_ITEM.id);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.status, "paused");
  assert.equal(state.currentTime, 0);
  assert.equal(state.volume, 0.4);
  assert.equal(state.muted, true);
  assert.equal(state.repeatMode, "off");
  assert.ok(storage.getItem(MUSIC_PLAYER_QUEUE_STORAGE_KEY));
});

test("hydrate disables repeat by default when no preference has been saved", () => {
  resetStore();

  useMusicPlayerStore.getState().hydrate();

  assert.equal(useMusicPlayerStore.getState().repeatMode, "off");
});

test("playing the same song again issues a new restart command", () => {
  const storage = resetStore();
  const store = useMusicPlayerStore.getState();
  store.playQueueFromStart([FIRST_ITEM], 0);
  const firstRequestId = useMusicPlayerStore.getState().command?.requestId;
  const firstRestartRequestId = useMusicPlayerStore.getState().command?.restartRequestId;
  useMusicPlayerStore.getState().setPlaybackTime(48, 100);
  useMusicPlayerStore.getState().playQueueFromStart([FIRST_ITEM], 0);
  const state = useMusicPlayerStore.getState();

  assert.equal(state.command?.type, "restart");
  assert.equal(state.command?.requestId, firstRequestId + 1);
  assert.equal(state.command?.restartRequestId, firstRestartRequestId + 1);
  assert.equal(state.currentTime, 0);
  assert.equal(state.status, "loading");
  assert.doesNotMatch(storage.getItem(MUSIC_PLAYER_QUEUE_STORAGE_KEY), /currentTime|status/u);
});

test("toolbar toggle resumes, pauses, and restarts ended or failed tracks", () => {
  resetStore();
  useMusicPlayerStore.getState().playQueueFromStart([FIRST_ITEM], 0);
  const initialRestartRequestId = useMusicPlayerStore.getState().command?.restartRequestId;
  useMusicPlayerStore.getState().setPlaybackStatus("paused");
  useMusicPlayerStore.getState().requestTogglePlayback();
  assert.equal(useMusicPlayerStore.getState().command?.type, "resume");
  assert.equal(useMusicPlayerStore.getState().command?.restartRequestId, initialRestartRequestId);

  useMusicPlayerStore.getState().setPlaybackStatus("playing");
  useMusicPlayerStore.getState().requestTogglePlayback();
  assert.equal(useMusicPlayerStore.getState().command?.type, "pause");
  assert.equal(useMusicPlayerStore.getState().command?.restartRequestId, initialRestartRequestId);

  useMusicPlayerStore.getState().setPlaybackStatus("ended");
  useMusicPlayerStore.getState().requestTogglePlayback();
  assert.equal(useMusicPlayerStore.getState().command?.type, "restart");
  const endedRestartRequestId = useMusicPlayerStore.getState().command?.restartRequestId;
  assert.ok(endedRestartRequestId > initialRestartRequestId);

  useMusicPlayerStore.getState().setPlaybackStatus("error");
  useMusicPlayerStore.getState().requestTogglePlayback();
  assert.equal(useMusicPlayerStore.getState().command?.type, "restart");
  assert.ok(useMusicPlayerStore.getState().command?.restartRequestId > endedRestartRequestId);
});

test("clear removes the current queue while retaining player preferences", () => {
  const storage = resetStore();
  useMusicPlayerStore.getState().setVolume(0.33);
  useMusicPlayerStore.getState().toggleMuted();
  useMusicPlayerStore.getState().cycleRepeatMode();
  const preferencesBeforeClear = storage.getItem(MUSIC_PLAYER_PREFERENCES_STORAGE_KEY);
  useMusicPlayerStore.getState().playQueueFromStart([FIRST_ITEM], 0);
  useMusicPlayerStore.getState().clear();
  const state = useMusicPlayerStore.getState();

  assert.deepEqual(state.queue, []);
  assert.equal(state.currentIndex, null);
  assert.equal(state.status, "idle");
  assert.equal(state.command?.type, "clear");
  assert.equal(storage.getItem(MUSIC_PLAYER_QUEUE_STORAGE_KEY), null);
  assert.equal(storage.getItem(MUSIC_PLAYER_PREFERENCES_STORAGE_KEY), preferencesBeforeClear);
});

test("track ending advances a temporary queue and retains the final track", () => {
  resetStore();
  useMusicPlayerStore.getState().playQueueFromStart([FIRST_ITEM, SECOND_ITEM], 0);
  useMusicPlayerStore.getState().handleTrackEnded();
  assert.equal(useMusicPlayerStore.getState().currentIndex, 1);
  assert.equal(useMusicPlayerStore.getState().command?.type, "restart");

  useMusicPlayerStore.getState().setPlaybackTime(120, 120);
  useMusicPlayerStore.getState().handleTrackEnded();
  assert.equal(useMusicPlayerStore.getState().currentIndex, 1);
  assert.equal(useMusicPlayerStore.getState().status, "ended");
  assert.equal(useMusicPlayerStore.getState().currentTime, 120);
});

test("repeat-one restarts the same queue item", () => {
  resetStore();
  useMusicPlayerStore.getState().playQueueFromStart([FIRST_ITEM, SECOND_ITEM], 0);
  useMusicPlayerStore.getState().cycleRepeatMode();
  useMusicPlayerStore.getState().cycleRepeatMode();
  useMusicPlayerStore.getState().handleTrackEnded();

  assert.equal(useMusicPlayerStore.getState().currentIndex, 0);
  assert.equal(useMusicPlayerStore.getState().command?.type, "restart");
  assert.equal(useMusicPlayerStore.getState().currentTime, 0);
});

test("repeat mode cycles through off, all, and one while persisting the choice", () => {
  const storage = resetStore();

  useMusicPlayerStore.getState().cycleRepeatMode();
  assert.equal(useMusicPlayerStore.getState().repeatMode, "all");
  useMusicPlayerStore.getState().cycleRepeatMode();
  assert.equal(useMusicPlayerStore.getState().repeatMode, "one");
  useMusicPlayerStore.getState().cycleRepeatMode();
  assert.equal(useMusicPlayerStore.getState().repeatMode, "off");

  const preferences = JSON.parse(storage.getItem(MUSIC_PLAYER_PREFERENCES_STORAGE_KEY));
  assert.equal(preferences.repeatMode, "off");
});

test("manual navigation wraps the queue in both directions without a repeat mode", () => {
  resetStore();
  useMusicPlayerStore.getState().playQueueFromStart([FIRST_ITEM, SECOND_ITEM], 0);

  useMusicPlayerStore.getState().requestPrevious();
  assert.equal(useMusicPlayerStore.getState().currentIndex, 1);

  useMusicPlayerStore.getState().requestNext();
  assert.equal(useMusicPlayerStore.getState().currentIndex, 0);
});

test("repeat-all wraps natural playback from the final track", () => {
  resetStore();
  useMusicPlayerStore.getState().playQueueFromStart([FIRST_ITEM, SECOND_ITEM], 1);
  useMusicPlayerStore.getState().cycleRepeatMode();

  useMusicPlayerStore.getState().handleTrackEnded();
  assert.equal(useMusicPlayerStore.getState().currentIndex, 0);
  assert.equal(useMusicPlayerStore.getState().command?.type, "restart");
});

test("single-track previous and next actions restart the same song", () => {
  resetStore();
  useMusicPlayerStore.getState().playQueueFromStart([FIRST_ITEM], 0);
  useMusicPlayerStore.getState().setPlaybackTime(42, 100);
  const initialRequestId = useMusicPlayerStore.getState().command?.requestId;

  useMusicPlayerStore.getState().requestPrevious();
  assert.equal(useMusicPlayerStore.getState().currentIndex, 0);
  assert.equal(useMusicPlayerStore.getState().currentTime, 0);
  assert.equal(useMusicPlayerStore.getState().command?.requestId, initialRequestId + 1);

  useMusicPlayerStore.getState().setPlaybackTime(24, 100);
  useMusicPlayerStore.getState().requestNext();

  assert.equal(useMusicPlayerStore.getState().currentIndex, 0);
  assert.equal(useMusicPlayerStore.getState().currentTime, 0);
  assert.equal(useMusicPlayerStore.getState().command?.requestId, initialRequestId + 2);
});
