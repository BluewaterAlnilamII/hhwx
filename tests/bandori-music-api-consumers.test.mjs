import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { parseBandoriMusicMasterResponse } from "../src/lib/bandori-music-api-client.ts";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Music consumers accept only the direct API data map", () => {
  const music = {
    musicTitle: ["JP", "EN", null, "CN"],
    difficulty: { "3": { playLevel: 27 } },
  };

  assert.deepEqual(
    parseBandoriMusicMasterResponse({ success: true, data: { "181": music } }),
    { "181": music },
  );
  assert.throws(
    () => parseBandoriMusicMasterResponse({
      success: true,
      data: { payload: { "181": music } },
    }),
    /invalid Music record: payload/u,
  );
});

test("Team Builder and Event Tracker use the shared Music API", async () => {
  const [page, worker, tracker, hook] = await Promise.all([
    readSource("src/app/[locale]/bandori/teambuilder/page.tsx"),
    readSource("src/app/[locale]/bandori/teambuilder/team-search-worker.ts"),
    readSource("src/app/[locale]/bandori/eventtracker/page.tsx"),
    readSource("src/hooks/useBandoriMusicMaster.ts"),
  ]);

  assert.match(page, /useBandoriMusicMaster\(\)/u);
  assert.match(page, /songs: masterMusic/u);
  assert.match(worker, /requestJson<Record<string, BestdoriSongMaster \| undefined>>\("\/api\/bandori\/master\/music"/u);
  assert.match(worker, /const song = songsPayload\[String\(songId\)\]/u);
  assert.match(tracker, /useBandoriMusicMaster\(\)/u);
  assert.match(tracker, /pickBandoriRegionalText/u);
  assert.match(hook, /SESSION_CLIENT_CACHE_POLICY/u);

  for (const source of [page, worker, tracker]) {
    assert.doesNotMatch(source, /\/api\/bandori\/master\/songs/u);
    assert.doesNotMatch(source, /\/api\/bandori\/songs/u);
  }
});

test("legacy Songs route files are removed", async () => {
  const paths = [
    "src/app/api/bandori/songs/route.ts",
    "src/app/api/bandori/master/songs/[songId]/route.ts",
    "src/app/api/bandori/master/songs/meta/route.ts",
  ];
  for (const path of paths) {
    await assert.rejects(access(new URL(`../${path}`, import.meta.url)));
  }
});
