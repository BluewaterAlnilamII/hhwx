import assert from "node:assert/strict";
import test from "node:test";
import { buildBandoriMusicPlayerItem } from "../src/lib/bandori-music-player.ts";

test("Bandori player adapter resolves regional copy, audio, and full jacket assets", () => {
  process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = "https://cdn.hhwx.org";
  const item = buildBandoriMusicPlayerItem({
    musicId: 595,
    preferredServer: 3,
    contextServer: 0,
    music: {
      musicTitle: ["JP title", null, null, "CN title"],
      bandName: ["JP band", null, null, "CN band"],
    },
    assets: {
      files: {
        jacket: { key: "bandori/music/jackets/595.png", sha256: "0".repeat(64) },
        thumb: { key: "bandori/music/thumbs/595.png", sha256: "1".repeat(64) },
        audio: { key: "bandori/music/audio/595.ogg", sha256: "2".repeat(64) },
        charts: {},
      },
      notes: {},
      bpm: {},
      length: 289,
    },
  });

  assert.equal(item?.id, "bandori:595");
  assert.equal(item?.title, "JP title");
  assert.equal(item?.artist, "JP band");
  assert.equal(item?.sourceUrl, "https://cdn.hhwx.org/bandori/music/audio/595.ogg");
  assert.equal(item?.artworkUrl, "https://cdn.hhwx.org/bandori/music/jackets/595.png");
  assert.equal(item?.durationSeconds, 289);
});

test("Bandori player adapter falls back to a thumbnail when the jacket is unavailable", () => {
  process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = "https://cdn.hhwx.org";
  const item = buildBandoriMusicPlayerItem({
    musicId: 595,
    preferredServer: 0,
    assets: {
      files: {
        thumb: { key: "bandori/music/thumbs/595.png", sha256: "1".repeat(64) },
        audio: { key: "bandori/music/audio/595.ogg", sha256: "2".repeat(64) },
        charts: {},
      },
      notes: {},
      bpm: {},
      length: 289,
    },
  });

  assert.equal(item?.artworkUrl, "https://cdn.hhwx.org/bandori/music/thumbs/595.png");
});

test("Bandori player adapter excludes entries without an audio descriptor", () => {
  process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = "https://cdn.hhwx.org";
  assert.equal(buildBandoriMusicPlayerItem({
    musicId: 595,
    preferredServer: 0,
    assets: {
      files: {
        jacket: { key: "bandori/music/jackets/595.png", sha256: "0".repeat(64) },
        thumb: { key: "bandori/music/thumbs/595.png", sha256: "1".repeat(64) },
        charts: {},
      },
      notes: {},
      bpm: {},
      length: 289,
    },
  }), null);
});
