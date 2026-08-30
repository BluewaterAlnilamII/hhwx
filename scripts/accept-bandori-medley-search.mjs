import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { buildMedleySearchInput } from "../src/lib/bandori/medley-foundation/index.ts";

const PROFILE_FIXTURE_NAME = "small-119-card-pool";
const SONG_IDS = [595, 88, 619];
const ACCEPTANCE_CARD_IDS = new Set([
  1, 636, 1134,
  285, 409, 641,
  103, 41, 42,
  240, 651, 887,
  82, 147, 358,
]);
const EXPECTED_AREA_CONFIGURATIONS = [
  [1, 6, 11, 16, 21],
  [5, 10, 15, 20, 25, 30, 35],
];

function readJson(path) {
  if (!existsSync(path)) throw new Error(`required acceptance file is missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildAcceptanceInput(root) {
  const cache = join(root, "bestdori-cache");
  const fixtures = readJson(join(root, "team-builder-benchmark-fixtures.json"));
  const compressed = fixtures.compressedProfiles?.find(
    (entry) => entry.name === PROFILE_FIXTURE_NAME,
  );
  if (!compressed || compressed.compression !== "gzip-base64") {
    throw new Error(`missing ${PROFILE_FIXTURE_NAME} gzip-base64 fixture`);
  }
  const profilePayload = JSON.parse(
    gunzipSync(Buffer.from(compressed.value, "base64")).toString("utf8"),
  );
  const cardsById = readJson(join(cache, "cards-all-5.json"));
  const charactersById = readJson(join(cache, "characters-main-3.json"));
  const skillsById = readJson(join(cache, "skills-all-10.json"));
  const areaItemsById = readJson(join(cache, "areaItems-main-5.json"));
  const songsById = readJson(join(cache, "songs-all-7.json"));
  const songs = SONG_IDS.map((songId) => ({
    songIdText: String(songId),
    difficulty: "expert",
    chart: readJson(join(cache, `chart-${songId}-expert.json`)),
  }));
  const normalized = buildMedleySearchInput({
    schemaVersion: "hhwx-medley-search-source-v1",
    profilePayload,
    cardsById,
    charactersById,
    skillsById,
    areaItemsById,
    songsById,
    eventBonus: null,
    perfectRatePercentText: "100",
    songs,
  });
  const cards = normalized.cards
    .filter((card) => ACCEPTANCE_CARD_IDS.has(card.masterCardId))
    .map((card, instanceId) => ({ ...card, instanceId }));
  if (cards.length !== ACCEPTANCE_CARD_IDS.size) {
    throw new Error(`acceptance projection found ${cards.length} of ${ACCEPTANCE_CARD_IDS.size} cards`);
  }
  const actualConfigurations = normalized.areaConfigurations.map(
    (configuration) => configuration.selectedAreaItemIds,
  );
  if (JSON.stringify(actualConfigurations) !== JSON.stringify(EXPECTED_AREA_CONFIGURATIONS)) {
    throw new Error("real profile no longer yields the retained two area configurations");
  }
  return { ...normalized, cards };
}

const configuredRoot = process.env.HHWX_MEDLEY_ACCEPTANCE_ROOT;
if (!configuredRoot) {
  console.log("real-profile medley acceptance skipped; set HHWX_MEDLEY_ACCEPTANCE_ROOT to opt in");
  process.exit(0);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "hhwx-medley-acceptance-"));
const inputPath = join(temporaryDirectory, "input.json");
try {
  writeFileSync(inputPath, JSON.stringify(buildAcceptanceInput(resolve(configuredRoot))), "utf8");
  const result = spawnSync(
    "cargo",
    [
      "test",
      "--release",
      "-p",
      "bandori-medley-search",
      "--test",
      "real_profile_acceptance",
      "--locked",
      "--",
      "--nocapture",
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, HHWX_MEDLEY_ACCEPTANCE_INPUT: inputPath },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
