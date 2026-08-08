import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSharedMusicArtworkCache,
  getSharedMusicArtworkUrl,
  subscribeSharedMusicArtworkUrl,
} from "../src/lib/music-player-artwork-cache.ts";

const ARTWORK_URL = "https://cdn.hhwx.org/bandori/music/thumbs/test.png";

async function waitForNotification(subscribe) {
  await new Promise((resolve) => {
    const release = subscribe(() => {
      release();
      resolve();
    });
  });
}

test("shared artwork cache deduplicates concurrent consumers", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(new Blob(["image"], { type: "image/png" }), { status: 200 });
  };
  context.after(() => {
    clearSharedMusicArtworkCache();
    globalThis.fetch = originalFetch;
  });

  const firstNotification = waitForNotification((listener) => (
    subscribeSharedMusicArtworkUrl(ARTWORK_URL, listener)
  ));
  const secondNotification = waitForNotification((listener) => (
    subscribeSharedMusicArtworkUrl(ARTWORK_URL, listener)
  ));
  await Promise.all([firstNotification, secondNotification]);

  const resolvedUrl = getSharedMusicArtworkUrl(ARTWORK_URL);
  assert.equal(requestCount, 1);
  assert.match(resolvedUrl ?? "", /^blob:/u);
});

test("shared artwork cache falls back to the source URL after a failed fetch", async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("missing", { status: 404 });
  context.after(() => {
    clearSharedMusicArtworkCache();
    globalThis.fetch = originalFetch;
  });

  await waitForNotification((listener) => (
    subscribeSharedMusicArtworkUrl(ARTWORK_URL, listener)
  ));

  assert.equal(getSharedMusicArtworkUrl(ARTWORK_URL), ARTWORK_URL);
});
