import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Songs home reuses the Music and public-asset contracts without a new API", async () => {
  const [page, client, controls, row, navigation] = await Promise.all([
    read("src/app/[locale]/bandori/songs/page.tsx"),
    read("src/app/[locale]/bandori/songs/SongsPageClient.tsx"),
    read("src/app/[locale]/bandori/songs/_components/BandoriSongFilterControls.tsx"),
    read("src/app/[locale]/bandori/songs/_components/BandoriSongDetailedRow.tsx"),
    read("src/lib/section-navigation.ts"),
  ]);

  assert.match(page, /<Suspense fallback=\{<SongsPageFallback \/>\}>/u);
  assert.match(client, /useBandoriMusicMaster\(\)/u);
  assert.match(client, /useBandoriMusicAssetIndex\(\)/u);
  assert.match(client, /buildBandoriSongCatalog/u);
  assert.match(client, /filterBandoriSongCatalog/u);
  assert.match(client, /INITIAL_VISIBLE_COUNT = 40/u);
  assert.match(client, /nextFilter\.difficulty === "expert"/u);
  assert.match(client, /nextFilter\.sortBy === "id"/u);
  assert.match(client, /params\.delete\("server"\)/u);
  assert.match(client, /"available"/u);
  assert.doesNotMatch(client, /BandoriCardServerSwitcher|selectedServer|displayServer/u);
  assert.doesNotMatch(controls, /allDifficulties/u);
  assert.match(controls, /serverAvailability/u);
  assert.match(row, /difficultyLevels/u);
  assert.match(row, /buildBandoriPublicAssetUrl/u);
  assert.match(navigation, /href: "\/bandori\/songs"/u);
  assert.doesNotMatch(client, /fetch\(|\/api\/bandori\/songs/u);
});

test("Songs filters use the game terminology and Cards-style regional release ordering", async () => {
  const [catalog, zhMessages] = await Promise.all([
    read("src/lib/bandori/songs/catalog.ts"),
    read("messages/zh-CN/bandori.json").then(JSON.parse),
  ]);

  assert.match(catalog, /"id",\s*"title",\s*"level",\s*"release_jp",\s*"release_en",\s*"release_tw",\s*"release_cn"/u);
  assert.deepEqual(zhMessages.songs.filters.rows, {
    serverAvailability: "服务器",
    band: "乐队",
    type: "类型",
    difficulty: "难易度",
    level: "乐曲等级",
    sort: "排序",
  });
  assert.deepEqual(Object.keys(zhMessages.songs.filters.sort), [
    "id",
    "title",
    "level",
    "release_jp",
    "release_en",
    "release_tw",
    "release_cn",
  ]);
});

test("song detail uses one URL-backed first-level view and mounts the simulator on demand", async () => {
  const detail = await read("src/app/[locale]/bandori/songs/[songId]/SongDetailPageClient.tsx");

  assert.match(detail, /searchParams\.get\("view"\) === "simulator"/u);
  assert.match(detail, /role="tablist"/u);
  assert.match(detail, /\["info", "simulator"\]/u);
  assert.match(detail, /next\.delete\("view"\)/u);
  assert.match(detail, /next\.delete\("server"\)/u);
  assert.doesNotMatch(detail, /getBandoriServerFromCode|useBandoriPreferredServer/u);
  assert.match(detail, /next\.set\("view", view\)/u);
  assert.match(detail, /activeView === "info"[\s\S]*<ChartSimulatorClientShell \{\.\.\.simulator\} \/>/u);
});
