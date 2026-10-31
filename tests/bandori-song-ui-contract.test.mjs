import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as songCatalog from "../src/lib/bandori/songs/catalog.ts";
import * as bandoriServers from "../src/lib/bandori-server.ts";
import * as utils from "../src/lib/utils.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

for (const game of ["bandori", "ournotes"]) {
  test(`${game} song tabs add one history entry per switch and retain filters and hash`, async () => {
    const source = await read(`src/app/[locale]/${game}/songs/SongsPageClient.tsx`);
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    for (const initialView of ["", "&view=info", "&view=unknown", "&view=meta"]) {
      const initialUrl = `http://localhost:3000/${game}/songs?q=%23306&perfect=95${initialView}#results`;
      const entries = [initialUrl];
      const window = {
        location: new URL(initialUrl),
        history: {
          pushState: (_state, _title, url) => {
            window.location = new URL(url, window.location);
            entries.push(window.location.href);
          },
        },
      };
      const jsx = (type, props) => ({ type, props });
      const dependencies = {
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "next-intl": { useTranslations: () => (key) => key },
        "next/navigation": { useSearchParams: () => window.location.searchParams },
        "@radix-ui/react-tabs": { Root: "tabs" },
      };
      const exports = {};
      runInNewContext(outputText, {
        exports, window, URLSearchParams,
        require: (id) => dependencies[id] ?? {},
      });
      const tabs = () => exports.default().props.children.find((child) => child.type === "tabs").props;
      const originalView = tabs().value;
      const nextView = originalView === "info" ? "meta" : "info";
      const onValueChange = tabs().onValueChange;
      onValueChange(originalView);
      assert.equal(entries.length, 1);
      // Radix can invoke focus and mouse-down callbacks before React renders again.
      onValueChange(nextView);
      onValueChange(nextView);
      assert.equal(entries.length, 2);
      assert.equal(tabs().value, nextView);
      assert.equal(window.location.pathname, `/${game}/songs`);
      assert.equal(window.location.searchParams.get("q"), "#306");
      assert.equal(window.location.searchParams.get("perfect"), "95");
      assert.equal(window.location.hash, "#results");
      entries.pop();
      window.location = new URL(entries.at(-1));
      assert.equal(tabs().value, originalView);
    }
  });
}

test("clearing song filters discards uncommitted level drafts before they can be submitted again", async () => {
  const effects = [];
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: { useRef: (current) => ({ current }), useEffect: (effect) => effects.push(effect) },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next-intl": { useTranslations: () => (key) => key },
    "lucide-react": {},
    "@/lib/bandori-builtin-resources": {},
    "@/lib/bandori-character-groups": { BANDORI_CHARACTER_GROUPS: [] },
    "@/lib/bandori/songs/catalog": songCatalog,
    "@/lib/bandori-server": bandoriServers,
    "@/lib/utils": utils,
  };
  function load(path) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    const exports = {};
    runInNewContext(outputText, { exports, require: (id) => {
      if (["@/components/SongFilterControls", "@/components/FilterControls"].includes(id)) return load(id.replace("@/", "src/") + ".tsx");
      if (id.startsWith("@/components/")) return { default: () => null };
      assert.ok(Object.hasOwn(dependencies, id), id);
      return dependencies[id];
    } });
    return exports;
  }
  const exports = load("src/app/[locale]/bandori/songs/_components/BandoriSongFilterControls.tsx");
  const inputs = [];
  const buttons = [];
  const mount = (node) => {
    if (Array.isArray(node)) { node.forEach(mount); return; }
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "function") { mount(node.type(node.props)); return; }
    if (node.type === "input") {
      const element = { value: node.props.defaultValue ?? "" };
      node.props.ref.current = element;
      inputs.push({ ...node.props, element });
    }
    if (node.type === "button") buttons.push(node.props);
    mount(node.props?.children);
  };
  const patches = [];
  let cleared = 0;
  mount(exports.default({
    filter: songCatalog.parseBandoriSongsPageFilter(new URLSearchParams()),
    resultCountLabel: "809 songs",
    onFilterChange: (patch) => patches.push(patch),
    onClearFilter: () => { cleared += 1; },
  }));
  effects.forEach((effect) => effect());
  const clear = buttons.find((button) => Array.isArray(button.children) && button.children.includes("actions.clear"));
  for (const input of inputs.filter((candidate) => candidate.type === "number")) {
    input.element.value = "26";
    input.onBlur();
    assert.equal(Object.values(patches.at(-1))[0], 26);
    // Clear wins before the pending URL update changes the committed value.
    clear.onClick();
    assert.equal(input.element.value, "");
    patches.length = 0;
    input.onBlur();
    assert.equal(patches.length, 0);
  }
  assert.equal(cleared, 2);
});

test("Songs home reuses the Music and public-asset contracts without a new API", async () => {
  const [page, client, controls, row, navigation, catalog] = await Promise.all([
    read("src/app/[locale]/bandori/songs/page.tsx"),
    read("src/app/[locale]/bandori/songs/SongsPageClient.tsx"),
    read("src/app/[locale]/bandori/songs/_components/BandoriSongFilterControls.tsx"),
    read("src/app/[locale]/bandori/songs/_components/BandoriSongDetailedRow.tsx"),
    read("src/lib/section-navigation.ts"),
    read("src/lib/bandori/songs/catalog.ts"),
  ]);

  assert.match(page, /<Suspense fallback=\{<SongsPageFallback \/>\}>/u);
  assert.match(client, /useBandoriMusicMaster\(\)/u);
  assert.match(client, /useBandoriPreferredServer\(\)/u);
  assert.doesNotMatch(client, /locale === "en" \? 1 : 3/u);
  assert.match(client, /useBandoriMusicAssetIndex\(\)/u);
  assert.match(client, /buildBandoriSongCatalog/u);
  assert.match(client, /filterBandoriSongCatalog/u);
  assert.match(client, /INITIAL_VISIBLE_COUNT = 40/u);
  assert.match(catalog, /setListParam\(params, "difficulty", nextFilter\.difficulties, BANDORI_SONG_DIFFICULTY_FILTERS\)/u);
  assert.match(catalog, /nextFilter\.sortBy === "id"/u);
  assert.match(client, /params\.delete\("server"\)/u);
  assert.match(catalog, /"available"/u);
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

test("song detail keeps one URL-backed view and retains the simulator after first use", async () => {
  const [detail, runtime, shared] = await Promise.all([
    read("src/app/[locale]/bandori/songs/[songId]/SongDetailPageClient.tsx"),
    read("src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
    read("src/components/SongDetailLayout.tsx"),
  ]);

  assert.match(detail, /searchParams\.get\("view"\) === "simulator"/u);
  assert.match(detail, /SongDetailTabs value=\{activeView\} onChange=\{selectView\}/u);
  assert.match(shared, /role="tablist"/u);
  assert.match(shared, /\["info", "simulator"\]/u);
  assert.match(detail, /next\.delete\("view"\)/u);
  assert.match(detail, /next\.delete\("server"\)/u);
  assert.doesNotMatch(detail, /getBandoriServerFromCode|locale === "en" \? 1 : 3/u);
  assert.match(detail, /useBandoriPreferredServer\(\)/u);
  assert.match(detail, /next\.set\("view", view\)/u);
  assert.match(detail, /window\.history\.replaceState/u);
  assert.match(detail, /hasOpenedSimulator[\s\S]*hidden=\{activeView !== "simulator"\}/u);
  assert.match(detail, /onDifficultyChange=\{selectDifficulty\}/u);
  assert.doesNotMatch(detail, /aria-label=\{t\("difficultyLabel"\)\}/u);
  assert.match(runtime, /SongDifficultyControls label=\{songsT\("difficultyLabel"\)\}/u);
  assert.match(shared, /role="group" aria-label=\{label\}/u);
  assert.match(runtime, /difficulties\.map\(\(option\) =>/u);
});
