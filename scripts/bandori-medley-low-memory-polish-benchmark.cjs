#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { gzipSync } = require("zlib");
const { spawnSync } = require("child_process");
const Module = require("module");
const { pathToFileURL } = require("url");

const repoRoot = path.resolve(__dirname, "..");
const tempDir = path.join(repoRoot, "temp", "bandori-team-builder");
const reportDir = path.join(tempDir, "low-memory-polish");
const hhwxRunnerPath = path.join(tempDir, "run-medley-40case-isolated.cjs");
const hhwxBenchmarkPath = path.join(tempDir, "benchmark-real-profiles-medley.cjs");
const defaultFixturePath = path.join(tempDir, "hard-case-profiles-2026-06-02.json");
const calcResearchDir = path.join(reportDir, "calc-research-2026-06-16");
const calcAssetDir = path.join(calcResearchDir, "calc-wasm");
const calcPkgDir = path.join(calcAssetDir, "pkg");
const calcGameDataCacheDir = path.join(calcAssetDir, "game-data-cache");
const calcWasmJsPath = path.join(calcPkgDir, "bangdream_optimize_web_wasm.js");
const calcWasmPath = path.join(calcPkgDir, "bangdream_optimize_web_wasm_bg.wasm");
const calcGameSyncPath = path.join(calcAssetDir, "src", "data", "game-sync.mjs");
const defaultOptimizationJson = JSON.stringify({
  memorySoftLimitMiB: 4488,
  exactNodeSoftLimit: 5000000,
  skipConfigurationSeedingWhenMemoryHeadroomBelowMiB: 1600,
  debugConfigurationTrace: false,
  enableExactCandidateCompactScoreOnlyCache: true,
  enableExactCandidateThinResultRetention: true,
});

const profileLabels = ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10"];
const eventKeys = ["none", "244", "260", "323"];
const songSelections = [
  { songId: 385, difficulty: 3, chartName: "expert" },
  { songId: 193, difficulty: 3, chartName: "expert" },
  { songId: 619, difficulty: 3, chartName: "expert" },
];

function printUsage() {
  console.log([
    "Usage: node scripts/bandori-medley-low-memory-polish-benchmark.cjs <setup|hhwx|hhwx-finalize-last|calc|both|calc-fidelity|calc-profile-export|calc-case>",
    "",
    "Environment:",
    "  HHWX_LOW_MEMORY_CASES=P01:none,P08:323     optional explicit case list",
    "  HHWX_LOW_MEMORY_DURATION_MS=300000         per-case budget",
    "  HHWX_LOW_MEMORY_FIXTURE_PATH=...           profile fixture path",
    "  HHWX_LOW_MEMORY_TRACE=1                    enable HHWX memory attribution trace fields",
    "  HHWX_LOW_MEMORY_ANCHOR_FRONTIER_CHEAP_UPPER_PROBE=1 run opt-in no-op anchor cheap-upper probe even when frontier precheck guards fail",
    "  HHWX_LOW_MEMORY_PREFIX_UPPER_REPLAY=1      include lightweight prefix upper replay summary",
    "  HHWX_LOW_MEMORY_PREFIX_HARD_UPPER_REPLAY=1 include lightweight cross-slot prefix hard-upper replay summary",
    "  HHWX_LOW_MEMORY_PREFIX_OTHER_UPPER_SOURCE_REPLAY=1 include opt-in other-slot upper source diagnostics",
    "  HHWX_LOW_MEMORY_PREFIX_CAPACITY_BATCH_REPLAY=1 include opt-in level-4 capacity replay diagnostics",
    "  HHWX_LOW_MEMORY_PREFIX_CAPACITY_LEVEL3_REPLAY=1 include opt-in level-3 capacity replay diagnostics",
    "  HHWX_LOW_MEMORY_PREFIX_CAPACITY_LEVEL3_LOOKAHEAD_REPLAY=1 include opt-in level-3 lookahead capacity replay diagnostics",
    "  HHWX_LOW_MEMORY_CAPACITY_LEVEL3_LOOKAHEAD_PRUNING=1 enable opt-in level-3 lookahead branch pruning",
    "  HHWX_LOW_MEMORY_PREFIX_OTHER_UPPER_SOURCE_MAX_CHECKS=2048 cap expensive source diagnostic checks per generator",
    "  HHWX_LOW_MEMORY_PREFIX_OTHER_UPPER_SOURCE_MAX_MARGIN=10000 cap source diagnostic to near-cutoff leaves",
    "  HHWX_LOW_MEMORY_CAPACITY_SOURCE_LEAF_PRUNING=1 enable narrow capacity-source leaf pruning",
    "  HHWX_LOW_MEMORY_RAW_ANCHOR_CHEAP_UPPER_REPLAY=1 compare anchor cheap-upper replay over local raw candidate pools",
    "  HHWX_LOW_MEMORY_RAW_ANCHOR_FRONTIER_PROBE=1 run no-op raw-index anchor/frontier upper probe on hard rows",
    "  HHWX_LOW_MEMORY_RAW_CANDIDATE_POOL_PROFILE=1 build opt-in raw typed-array candidate pool profile",
    "  HHWX_LOW_MEMORY_RAW_PAIR_COMPLEMENT_PARITY=1 compare banned-card pair complement over shared raw candidate pool",
    "  HHWX_LOW_MEMORY_RAW_PAIR_UPPER_SCAN_PARITY=1 compare generated pair upper scan over shared raw candidate pool",
    "  HHWX_LOW_MEMORY_RAW_SOLVER_INPUT_CENSUS=1 estimate compact raw solver input footprint without memory attribution",
    "  HHWX_LOW_MEMORY_DISABLE_GLOBAL_COMPLEMENT_CACHE=1 disable exact-join global complement upper cache",
    "  HHWX_LOW_MEMORY_COMPACT_GLOBAL_COMPLEMENT_CACHE=1 use compact exact-join global complement upper cache (default)",
    "  HHWX_LOW_MEMORY_LEGACY_GLOBAL_COMPLEMENT_CACHE=1 use legacy Map exact-join global complement cache",
    "  HHWX_LOW_MEMORY_THIN_CANDIDATE_RESULT=1 retain only score fields on exact candidates (default with compact score-only cache)",
    "  HHWX_LOW_MEMORY_FULL_CANDIDATE_RESULT=1 keep legacy full candidate result retention",
    "  HHWX_LOW_MEMORY_COMPACT_CANDIDATE_KEY_SET=1 use compact exact-join candidate key sets (default)",
    "  HHWX_LOW_MEMORY_LEGACY_CANDIDATE_KEY_SET=1 use legacy Set exact-join candidate key sets",
    "  HHWX_LOW_MEMORY_SCORE_CALC_CACHE_LIMIT=... bound exact-join score calculation cache entries",
    "  HHWX_LOW_MEMORY_SKIP_SEEDING_HEADROOM_MIB=1600 skip config seeding below this memory headroom",
    "  HHWX_LOW_MEMORY_AUTO_SEEDING_PRESSURE_SKIP=1 skip config seeding under proof-safe memory pressure",
    "  HHWX_LOW_MEMORY_AUTO_SEEDING_PRESSURE_HEADROOM_MIB=4000 auto seeding pressure threshold",
    "  HHWX_LOW_MEMORY_AUTO_SEEDING_PRESSURE_SLOT_CARDS=200 auto seeding pressure slot-width threshold",
    "  HHWX_LOW_MEMORY_SCORE_CALC_CACHE_PRESSURE_FALLBACK=1 disable score calc cache for high-slot-card exact joins",
    "  HHWX_LOW_MEMORY_SCORE_CALC_CACHE_PRESSURE_SLOT_CARDS=260 fallback threshold for high-slot-card exact joins",
    "  HHWX_LOW_MEMORY_INITIAL_SCORE_CALC_CACHE_PRESSURE_FALLBACK=1 disable initial-candidate score calc cache under pressure",
    "  HHWX_LOW_MEMORY_INITIAL_SCORE_CALC_CACHE_PRESSURE_SLOT_CARDS=200 fallback threshold for initial-candidate sync",
    "  HHWX_LOW_MEMORY_SCORE_ONLY_CACHE_PRESSURE_FALLBACK=1 disable score-only result cache for high-slot-card exact joins",
    "  HHWX_LOW_MEMORY_SCORE_ONLY_CACHE_PRESSURE_SLOT_CARDS=260 fallback threshold for score-only result cache",
    "  HHWX_LOW_MEMORY_COMPACT_SCORE_ONLY_CACHE=1 store compact score-only cache entries (default)",
    "  HHWX_LOW_MEMORY_LEGACY_SCORE_ONLY_CACHE=1 store legacy full score-only cache entries",
    "  HHWX_LOW_MEMORY_COMPACT_CANDIDATE_CARDS=1 strip exact-join candidate SearchCard[] retention (default)",
    "  HHWX_LOW_MEMORY_RETAIN_CANDIDATE_CARDS=1 keep legacy exact-join candidate SearchCard[] retention",
    "  HHWX_LOW_MEMORY_DISABLE_SKILL_WINDOW_CACHE=1 disable exact-join skill-window contribution cache",
    "  HHWX_LOW_MEMORY_DISABLE_SCORE_CALC_CACHE=1 disable exact-join score calculation cache",
    "  HHWX_LOW_MEMORY_DISABLE_SCORE_ONLY_CACHE=1 disable exact-join score-only result cache",
    "  HHWX_LOW_MEMORY_SOURCE_TEMP=...            source temp folder for setup copy",
    "  HHWX_LOW_MEMORY_CALC_BASE_URL=...          calc site base URL",
    "  HHWX_LOW_MEMORY_CALC_OPTIONS_JSON=...      optional WASM options JSON",
    "  HHWX_LOW_MEMORY_CALC_TIMEOUT_MS=390000     calc child timeout",
    "",
    "Notes:",
    "  hhwx results carry exact/bounded proof fields.",
    "  calc WASM results are black-box score/resource observations, not proof of exactness.",
  ].join("\n"));
}

function parseCsv(value, fallback) {
  const source = value ?? fallback.join(",");
  return source
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectedCases() {
  const explicit = parseCsv(process.env.HHWX_LOW_MEMORY_CASES, []);
  if (explicit.length > 0) {
    return explicit.map((entry) => {
      const [label, eventKey] = entry.split(":").map((part) => part.trim());
      if (!label || !eventKey) {
        throw new Error(`Invalid HHWX_LOW_MEMORY_CASES entry: ${entry}`);
      }
      return { label, eventKey };
    });
  }
  const labels = parseCsv(process.env.HHWX_LOW_MEMORY_PROFILE_LABELS, profileLabels);
  const events = parseCsv(process.env.HHWX_LOW_MEMORY_EVENT_KEYS, eventKeys);
  return labels.flatMap((label) => events.map((eventKey) => ({ label, eventKey })));
}

function durationMs() {
  const parsed = Number(process.env.HHWX_LOW_MEMORY_DURATION_MS ?? 300000);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 300000;
}

function fixturePath() {
  return path.resolve(process.env.HHWX_LOW_MEMORY_FIXTURE_PATH ?? defaultFixturePath);
}

function parseJsonObject(value, label) {
  if (!value) {
    return {};
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

function hhwxOptimizationJson() {
  const optimization = {
    ...parseJsonObject(defaultOptimizationJson, "defaultOptimizationJson"),
    ...parseJsonObject(process.env.HHWX_REAL_PROFILE_OPTIMIZATION_JSON, "HHWX_REAL_PROFILE_OPTIMIZATION_JSON"),
  };
  if (process.env.HHWX_LOW_MEMORY_TRACE === "1") {
    optimization.debugConfigurationTrace = true;
    optimization.debugExactCandidateJoinMemoryAttribution = true;
  }
  if (process.env.HHWX_LOW_MEMORY_RAW_MIRROR === "1") {
    optimization.debugExactCandidateJoinMemoryAttribution = true;
    optimization.debugExactCandidateRawMirror = true;
  }
  if (process.env.HHWX_LOW_MEMORY_RAW_JOIN_PARITY === "1") {
    optimization.debugExactCandidateJoinMemoryAttribution = true;
    optimization.debugExactCandidateRawJoinParity = true;
  }
  if (process.env.HHWX_LOW_MEMORY_SIGNATURE_CENSUS === "1") {
    optimization.debugExactCandidateJoinMemoryAttribution = true;
    optimization.debugExactCandidateSignatureCensus = true;
  }
  if (process.env.HHWX_LOW_MEMORY_UPPER_REPLAY === "1") {
    optimization.debugExactCandidateJoinMemoryAttribution = true;
    optimization.debugExactCandidateUpperReplay = true;
  }
  if (process.env.HHWX_LOW_MEMORY_ANCHOR_FRONTIER_CHEAP_UPPER_PROBE === "1") {
    optimization.debugExactCandidateAnchorFrontierCheapUpperProbe = true;
  }
  if (process.env.HHWX_LOW_MEMORY_PREFIX_UPPER_REPLAY === "1") {
    optimization.debugExactCandidatePrefixUpperReplay = true;
  }
  if (process.env.HHWX_LOW_MEMORY_PREFIX_HARD_UPPER_REPLAY === "1") {
    optimization.debugExactCandidatePrefixUpperReplay = true;
    optimization.debugExactCandidatePrefixHardUpperReplay = true;
  }
  if (process.env.HHWX_LOW_MEMORY_PREFIX_OTHER_UPPER_SOURCE_REPLAY === "1") {
    optimization.debugExactCandidatePrefixUpperReplay = true;
    optimization.debugExactCandidatePrefixOtherUpperSourceReplay = true;
  }
  if (process.env.HHWX_LOW_MEMORY_PREFIX_CAPACITY_BATCH_REPLAY === "1") {
    optimization.debugExactCandidatePrefixUpperReplay = true;
    optimization.debugExactCandidatePrefixCapacityBatchReplay = true;
  }
  if (process.env.HHWX_LOW_MEMORY_PREFIX_CAPACITY_LEVEL3_REPLAY === "1") {
    optimization.debugExactCandidatePrefixUpperReplay = true;
    optimization.debugExactCandidatePrefixCapacityLevel3Replay = true;
  }
  if (process.env.HHWX_LOW_MEMORY_PREFIX_CAPACITY_LEVEL3_LOOKAHEAD_REPLAY === "1") {
    optimization.debugExactCandidatePrefixUpperReplay = true;
    optimization.debugExactCandidatePrefixCapacityLevel3LookaheadReplay = true;
  }
  if (process.env.HHWX_LOW_MEMORY_CAPACITY_LEVEL3_LOOKAHEAD_PRUNING === "1") {
    optimization.debugExactCandidatePrefixUpperReplay = true;
    optimization.debugExactCandidatePrefixCapacityLevel3LookaheadReplay = true;
    optimization.enableExactCandidateCapacityLevel3LookaheadPruning = true;
  }
  if (process.env.HHWX_LOW_MEMORY_CAPACITY_SOURCE_LEAF_PRUNING === "1") {
    optimization.debugExactCandidatePrefixUpperReplay = true;
    optimization.debugExactCandidatePrefixOtherUpperSourceReplay = true;
    optimization.enableExactCandidateCapacitySourceLeafPruning = true;
  }
  if (
    process.env.HHWX_LOW_MEMORY_PREFIX_OTHER_UPPER_SOURCE_REPLAY === "1"
    || process.env.HHWX_LOW_MEMORY_PREFIX_CAPACITY_BATCH_REPLAY === "1"
    || process.env.HHWX_LOW_MEMORY_PREFIX_CAPACITY_LEVEL3_REPLAY === "1"
    || process.env.HHWX_LOW_MEMORY_PREFIX_CAPACITY_LEVEL3_LOOKAHEAD_REPLAY === "1"
    || process.env.HHWX_LOW_MEMORY_CAPACITY_LEVEL3_LOOKAHEAD_PRUNING === "1"
    || process.env.HHWX_LOW_MEMORY_CAPACITY_SOURCE_LEAF_PRUNING === "1"
  ) {
    const parsedMaxChecks = Number(process.env.HHWX_LOW_MEMORY_PREFIX_OTHER_UPPER_SOURCE_MAX_CHECKS);
    if (Number.isFinite(parsedMaxChecks) && parsedMaxChecks > 0) {
      optimization.debugExactCandidatePrefixOtherUpperSourceReplayMaxChecks = Math.trunc(parsedMaxChecks);
    }
    const parsedMaxMargin = Number(process.env.HHWX_LOW_MEMORY_PREFIX_OTHER_UPPER_SOURCE_MAX_MARGIN);
    if (Number.isFinite(parsedMaxMargin) && parsedMaxMargin >= 0) {
      optimization.debugExactCandidatePrefixOtherUpperSourceReplayMaxMargin = parsedMaxMargin;
    }
  }
  if (process.env.HHWX_LOW_MEMORY_DOMINANCE_REPLAY === "1") {
    optimization.debugExactCandidateJoinMemoryAttribution = true;
    optimization.debugExactCandidateDominanceReplay = true;
  }
  if (process.env.HHWX_LOW_MEMORY_RAW_ANCHOR_CHEAP_UPPER_REPLAY === "1") {
    optimization.debugExactCandidateRawAnchorCheapUpperReplay = true;
  }
  if (process.env.HHWX_LOW_MEMORY_RAW_ANCHOR_FRONTIER_PROBE === "1") {
    optimization.debugExactCandidateRawAnchorFrontierProbe = true;
  }
  if (process.env.HHWX_LOW_MEMORY_RAW_CANDIDATE_POOL_PROFILE === "1") {
    optimization.debugExactCandidateRawCandidatePoolProfile = true;
  }
  if (process.env.HHWX_LOW_MEMORY_RAW_PAIR_COMPLEMENT_PARITY === "1") {
    optimization.debugExactCandidateRawPairComplementParity = true;
  }
  if (process.env.HHWX_LOW_MEMORY_RAW_PAIR_UPPER_SCAN_PARITY === "1") {
    optimization.debugExactCandidateRawPairUpperScanParity = true;
  }
  if (process.env.HHWX_LOW_MEMORY_RAW_SOLVER_INPUT_CENSUS === "1") {
    optimization.debugExactCandidateRawSolverInputCensus = true;
  }
  if (process.env.HHWX_LOW_MEMORY_SCORE_CALC_CACHE_LIMIT) {
    const parsed = Number(process.env.HHWX_LOW_MEMORY_SCORE_CALC_CACHE_LIMIT);
    if (Number.isFinite(parsed) && parsed > 0) {
      optimization.exactCandidateScoreCalculationCacheEntryLimit = Math.trunc(parsed);
    }
  }
  if (process.env.HHWX_LOW_MEMORY_SKIP_SEEDING_HEADROOM_MIB) {
    const parsed = Number(process.env.HHWX_LOW_MEMORY_SKIP_SEEDING_HEADROOM_MIB);
    if (Number.isFinite(parsed) && parsed >= 0) {
      optimization.skipConfigurationSeedingWhenMemoryHeadroomBelowMiB = Math.trunc(parsed);
    }
  }
  if (process.env.HHWX_LOW_MEMORY_AUTO_SEEDING_PRESSURE_SKIP === "1") {
    optimization.enableLowMemoryConfigurationSeedingPressureSkip = true;
  }
  if (process.env.HHWX_LOW_MEMORY_AUTO_SEEDING_PRESSURE_HEADROOM_MIB) {
    const parsed = Number(process.env.HHWX_LOW_MEMORY_AUTO_SEEDING_PRESSURE_HEADROOM_MIB);
    if (Number.isFinite(parsed) && parsed >= 0) {
      optimization.lowMemoryConfigurationSeedingPressureHeadroomMiB = Math.trunc(parsed);
    }
  }
  if (process.env.HHWX_LOW_MEMORY_AUTO_SEEDING_PRESSURE_SLOT_CARDS) {
    const parsed = Number(process.env.HHWX_LOW_MEMORY_AUTO_SEEDING_PRESSURE_SLOT_CARDS);
    if (Number.isFinite(parsed) && parsed > 0) {
      optimization.lowMemoryConfigurationSeedingPressureMinSlotCardCount = Math.trunc(parsed);
    }
  }
  if (process.env.HHWX_LOW_MEMORY_SCORE_CALC_CACHE_PRESSURE_FALLBACK === "1") {
    optimization.enableExactCandidateScoreCalculationCachePressureFallback = true;
  }
  if (process.env.HHWX_LOW_MEMORY_SCORE_CALC_CACHE_PRESSURE_SLOT_CARDS) {
    const parsed = Number(process.env.HHWX_LOW_MEMORY_SCORE_CALC_CACHE_PRESSURE_SLOT_CARDS);
    if (Number.isFinite(parsed) && parsed > 0) {
      optimization.exactCandidateScoreCalculationCachePressureSlotCardCount = Math.trunc(parsed);
    }
  }
  if (process.env.HHWX_LOW_MEMORY_INITIAL_SCORE_CALC_CACHE_PRESSURE_FALLBACK === "1") {
    optimization.enableLowMemoryInitialCandidateScoreCalculationCachePressureFallback = true;
  }
  if (process.env.HHWX_LOW_MEMORY_INITIAL_SCORE_CALC_CACHE_PRESSURE_SLOT_CARDS) {
    const parsed = Number(process.env.HHWX_LOW_MEMORY_INITIAL_SCORE_CALC_CACHE_PRESSURE_SLOT_CARDS);
    if (Number.isFinite(parsed) && parsed > 0) {
      optimization.lowMemoryInitialCandidateScoreCalculationCachePressureSlotCardCount = Math.trunc(parsed);
    }
  }
  if (process.env.HHWX_LOW_MEMORY_SCORE_ONLY_CACHE_PRESSURE_FALLBACK === "1") {
    optimization.enableExactCandidateScoreOnlyCachePressureFallback = true;
  }
  if (process.env.HHWX_LOW_MEMORY_SCORE_ONLY_CACHE_PRESSURE_SLOT_CARDS) {
    const parsed = Number(process.env.HHWX_LOW_MEMORY_SCORE_ONLY_CACHE_PRESSURE_SLOT_CARDS);
    if (Number.isFinite(parsed) && parsed > 0) {
      optimization.exactCandidateScoreOnlyCachePressureSlotCardCount = Math.trunc(parsed);
    }
  }
  if (process.env.HHWX_LOW_MEMORY_COMPACT_SCORE_ONLY_CACHE === "1") {
    optimization.enableExactCandidateCompactScoreOnlyCache = true;
  }
  if (process.env.HHWX_LOW_MEMORY_LEGACY_SCORE_ONLY_CACHE === "1") {
    optimization.enableExactCandidateCompactScoreOnlyCache = false;
  }
  if (process.env.HHWX_LOW_MEMORY_DISABLE_GLOBAL_COMPLEMENT_CACHE === "1") {
    optimization.disableExactCandidateGlobalComplementCache = true;
  }
  if (process.env.HHWX_LOW_MEMORY_COMPACT_GLOBAL_COMPLEMENT_CACHE === "1") {
    optimization.enableExactCandidateCompactGlobalComplementCache = true;
  }
  if (process.env.HHWX_LOW_MEMORY_LEGACY_GLOBAL_COMPLEMENT_CACHE === "1") {
    optimization.enableExactCandidateCompactGlobalComplementCache = false;
  }
  if (process.env.HHWX_LOW_MEMORY_THIN_CANDIDATE_RESULT === "1") {
    optimization.enableExactCandidateThinResultRetention = true;
  }
  if (process.env.HHWX_LOW_MEMORY_FULL_CANDIDATE_RESULT === "1") {
    optimization.enableExactCandidateThinResultRetention = false;
  }
  if (process.env.HHWX_LOW_MEMORY_COMPACT_CANDIDATE_KEY_SET === "1") {
    optimization.enableExactCandidateCompactCandidateKeySet = true;
  }
  if (process.env.HHWX_LOW_MEMORY_LEGACY_CANDIDATE_KEY_SET === "1") {
    optimization.enableExactCandidateCompactCandidateKeySet = false;
  }
  if (process.env.HHWX_LOW_MEMORY_COMPACT_CANDIDATE_CARDS === "1") {
    optimization.disableExactCandidateCardsRetention = true;
  }
  if (process.env.HHWX_LOW_MEMORY_RETAIN_CANDIDATE_CARDS === "1") {
    optimization.disableExactCandidateCardsRetention = false;
  }
  if (process.env.HHWX_LOW_MEMORY_DISABLE_SKILL_WINDOW_CACHE === "1") {
    optimization.disableExactCandidateSkillWindowContributionCache = true;
  }
  if (process.env.HHWX_LOW_MEMORY_DISABLE_SCORE_CALC_CACHE === "1") {
    optimization.disableExactCandidateScoreCalculationCache = true;
  }
  if (process.env.HHWX_LOW_MEMORY_DISABLE_SCORE_ONLY_CACHE === "1") {
    optimization.disableExactCandidateScoreOnlyCache = true;
  }
  return JSON.stringify(optimization);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function caseFileStem(caseKey) {
  return String(caseKey).replace(/[^A-Za-z0-9_-]+/g, "-");
}

function copyIfMissing(source, target) {
  if (fs.existsSync(target)) {
    return false;
  }
  if (!fs.existsSync(source)) {
    return false;
  }
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
  return true;
}

function setupLocalArtifacts() {
  ensureDir(tempDir);
  const sourceTemp = path.resolve(
    process.env.HHWX_LOW_MEMORY_SOURCE_TEMP
      ?? path.join(repoRoot, "..", "hhwx", "temp", "bandori-team-builder"),
  );
  const copied = [];
  for (const fileName of [
    "benchmark-real-profiles-medley.cjs",
    "hard-case-profiles-2026-06-02.json",
  ]) {
    const target = path.join(tempDir, fileName);
    if (copyIfMissing(path.join(sourceTemp, fileName), target)) {
      copied.push(path.relative(repoRoot, target));
    }
  }
  if (!fs.existsSync(hhwxRunnerPath)) {
    throw new Error(`Missing tracked isolated runner: ${hhwxRunnerPath}`);
  }
  const patchedHhwxBenchmarkScoreMetrics = patchHhwxBenchmarkScoreMetrics();
  return { sourceTemp, copied, patchedHhwxBenchmarkScoreMetrics };
}

function patchHhwxBenchmarkScoreMetrics() {
  if (!fs.existsSync(hhwxBenchmarkPath)) {
    return false;
  }
  let source = fs.readFileSync(hhwxBenchmarkPath, "utf8");
  let patched = source;
  if (!patched.includes("lastNodeHeapUsedMiB: profiling.lastNodeHeapUsedMiB ?? null")) {
    patched = patched.replace(
      /(relativeGap: profiling\.relativeGap \?\? null,\r?\n)/,
      "$1"
        + "    lastNodeHeapUsedMiB: profiling.lastNodeHeapUsedMiB ?? null,\n"
        + "    peakNodeHeapUsedMiB: profiling.peakNodeHeapUsedMiB ?? null,\n"
        + "    lastNodeRssMiB: profiling.lastNodeRssMiB ?? null,\n"
        + "    peakNodeRssMiB: profiling.peakNodeRssMiB ?? null,\n"
        + "    lastNodeExternalMiB: profiling.lastNodeExternalMiB ?? null,\n"
        + "    peakNodeExternalMiB: profiling.peakNodeExternalMiB ?? null,\n"
        + "    lastNodeArrayBuffersMiB: profiling.lastNodeArrayBuffersMiB ?? null,\n"
        + "    peakNodeArrayBuffersMiB: profiling.peakNodeArrayBuffersMiB ?? null,\n"
        + "    lastMemoryGuardUsedMiB: profiling.lastMemoryGuardUsedMiB ?? null,\n"
        + "    peakMemoryGuardUsedMiB: profiling.peakMemoryGuardUsedMiB ?? null,\n",
    );
  }
  if (!patched.includes("memoryLimited: stats.memoryLimited")) {
    patched = patched.replace(
      /(timedOut: stats\.timedOut,\r?\n)/,
      "$1"
        + "    memoryLimited: stats.memoryLimited,\n"
        + "    memorySoftLimitMiB: stats.memorySoftLimitMiB ?? null,\n"
        + "    peakUsedHeapMiB: stats.peakUsedHeapMiB ?? null,\n",
    );
  }
  if (!patched.includes("averageScore: report.topResult?.averageScore ?? null")) {
    patched = patched.replace(
      /(score: report\.topResult\?\.score \?\? null,\r?\n)(\s+elapsedMs:)/,
      "$1"
        + "    averageScore: report.topResult?.averageScore ?? null,\n"
        + "    maxScore: report.topResult?.maxScore ?? null,\n"
        + "    minScore: report.topResult?.minScore ?? null,\n"
        + "$2",
    );
  }
  if (!patched.includes("maxScoreCandidate: report.maxScoreCandidate")) {
    patched = patched.replace(
      /(minScore: report\.topResult\?\.minScore \?\? null,\r?\n)(\s+elapsedMs:)/,
      "$1"
        + "    maxScoreCandidate: report.maxScoreCandidate ? {\n"
        + "      score: report.maxScoreCandidate.score ?? null,\n"
        + "      averageScore: report.maxScoreCandidate.averageScore ?? null,\n"
        + "      maxScore: report.maxScoreCandidate.maxScore ?? null,\n"
        + "      minScore: report.maxScoreCandidate.minScore ?? null,\n"
        + "      cardIds: report.maxScoreCandidate.cardIds ?? null,\n"
        + "      areaItemConfiguration: report.maxScoreCandidate.areaItemConfiguration ?? null,\n"
        + "    } : null,\n"
        + "    evaluatedAverageTopCandidates: (report.evaluatedAverageTopCandidates ?? []).map((candidate) => ({\n"
        + "      score: candidate.score ?? null,\n"
        + "      averageScore: candidate.averageScore ?? null,\n"
        + "      maxScore: candidate.maxScore ?? null,\n"
        + "      minScore: candidate.minScore ?? null,\n"
        + "      cardIds: candidate.cardIds ?? null,\n"
        + "      areaItemConfiguration: candidate.areaItemConfiguration ?? null,\n"
        + "    })),\n"
        + "$2",
    );
  }
  if (!patched.includes("maxScoreCandidate: searchResult.maxScoreCandidate &&")) {
    patched = patched.replace(
      /(topResult: top && \{\r?\n\s+score: top\.score,\r?\n\s+averageScore: top\.averageScore,\r?\n\s+maxScore: top\.maxScore,\r?\n\s+minScore: top\.minScore,\r?\n\s+cardIds: top\.cardIds,\r?\n\s+areaItemConfiguration: top\.areaItemConfiguration,\r?\n\s+\},)/,
      "$1\n"
        + "    maxScoreCandidate: searchResult.maxScoreCandidate && {\n"
        + "      score: searchResult.maxScoreCandidate.score,\n"
        + "      averageScore: searchResult.maxScoreCandidate.averageScore,\n"
        + "      maxScore: searchResult.maxScoreCandidate.maxScore,\n"
        + "      minScore: searchResult.maxScoreCandidate.minScore,\n"
        + "      cardIds: searchResult.maxScoreCandidate.cardIds,\n"
        + "      areaItemConfiguration: searchResult.maxScoreCandidate.areaItemConfiguration,\n"
        + "    },\n"
        + "    evaluatedAverageTopCandidates: (searchResult.evaluatedAverageTopCandidates ?? []).map((candidate) => ({\n"
        + "      score: candidate.score,\n"
        + "      averageScore: candidate.averageScore,\n"
        + "      maxScore: candidate.maxScore,\n"
        + "      minScore: candidate.minScore,\n"
        + "      cardIds: candidate.cardIds,\n"
        + "      areaItemConfiguration: candidate.areaItemConfiguration,\n"
        + "    })),",
    );
  }
  if (!patched.includes("exactCandidateJoinMemorySnapshots: profiling.exactCandidateJoinMemorySnapshots ?? null")) {
    patched = patched.replace(
      /(exactCandidateJoinPairComplementHighPairRecordCount: profiling\.exactCandidateJoinPairComplementHighPairRecordCount \?\? null,\r?\n)/,
      "$1"
        + "    exactCandidateJoinMemorySnapshots: profiling.exactCandidateJoinMemorySnapshots ?? null,\n",
    );
  }
  if (!patched.includes("exactCandidateJoinPrefixUpperReplaySummary: profiling.exactCandidateJoinPrefixUpperReplaySummary ?? null")) {
    patched = patched.replace(
      /(exactCandidateJoinMemorySnapshots: profiling\.exactCandidateJoinMemorySnapshots \?\? null,\r?\n)/,
      "$1"
        + "    exactCandidateJoinPrefixUpperReplaySummary: profiling.exactCandidateJoinPrefixUpperReplaySummary ?? null,\n",
    );
  }
  if (!patched.includes("exactCandidateJoinRawSolverInputCensus: profiling.exactCandidateJoinRawSolverInputCensus ?? null")) {
    patched = patched.replace(
      /(exactCandidateJoinMemorySnapshots: profiling\.exactCandidateJoinMemorySnapshots \?\? null,\r?\n)/,
      "$1"
        + "    exactCandidateJoinRawSolverInputCensus: profiling.exactCandidateJoinRawSolverInputCensus ?? null,\n",
    );
  }
  if (!patched.includes("exactCandidateJoinRawCandidatePoolProfile: profiling.exactCandidateJoinRawCandidatePoolProfile ?? null")) {
    patched = patched.replace(
      /(exactCandidateJoinMemorySnapshots: profiling\.exactCandidateJoinMemorySnapshots \?\? null,\r?\n)/,
      "$1"
        + "    exactCandidateJoinRawCandidatePoolProfile: profiling.exactCandidateJoinRawCandidatePoolProfile ?? null,\n",
    );
  }
  if (!patched.includes("exactCandidateJoinRawAnchorCheapUpperReplay: profiling.exactCandidateJoinRawAnchorCheapUpperReplay ?? null")) {
    patched = patched.replace(
      /(exactCandidateJoinMemorySnapshots: profiling\.exactCandidateJoinMemorySnapshots \?\? null,\r?\n)/,
      "$1"
        + "    exactCandidateJoinRawAnchorCheapUpperReplay: profiling.exactCandidateJoinRawAnchorCheapUpperReplay ?? null,\n",
    );
  }
  if (!patched.includes("exactCandidateJoinRawAnchorFrontierProbe: profiling.exactCandidateJoinRawAnchorFrontierProbe ?? null")) {
    patched = patched.replace(
      /(exactCandidateJoinMemorySnapshots: profiling\.exactCandidateJoinMemorySnapshots \?\? null,\r?\n)/,
      "$1"
        + "    exactCandidateJoinRawAnchorFrontierProbe: profiling.exactCandidateJoinRawAnchorFrontierProbe ?? null,\n",
    );
  }
  if (!patched.includes("exactCandidateJoinRawPairUpperScanParity: profiling.exactCandidateJoinRawPairUpperScanParity ?? null")) {
    patched = patched.replace(
      /(exactCandidateJoinMemorySnapshots: profiling\.exactCandidateJoinMemorySnapshots \?\? null,\r?\n)/,
      "$1"
        + "    exactCandidateJoinRawPairUpperScanParity: profiling.exactCandidateJoinRawPairUpperScanParity ?? null,\n",
    );
  }
  if (!patched.includes("exactCandidateJoinRawPairComplementParity: profiling.exactCandidateJoinRawPairComplementParity ?? null")) {
    patched = patched.replace(
      /(exactCandidateJoinMemorySnapshots: profiling\.exactCandidateJoinMemorySnapshots \?\? null,\r?\n)/,
      "$1"
        + "    exactCandidateJoinRawPairComplementParity: profiling.exactCandidateJoinRawPairComplementParity ?? null,\n",
    );
  }
  if (!patched.includes("exactCandidateJoinLastAnchorFrontierPrecheckSlotIndex: profiling.exactCandidateJoinLastAnchorFrontierPrecheckSlotIndex ?? null")) {
    patched = patched.replace(
      /(exactCandidateJoinLastAnchorFrontierProofHighPairRecordUpperCount: \(\r?\n\s+profiling\.exactCandidateJoinLastAnchorFrontierProofHighPairRecordUpperCount \?\? null\r?\n\s+\),\r?\n)/,
      "$1"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckSlotIndex: profiling.exactCandidateJoinLastAnchorFrontierPrecheckSlotIndex ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckCalculatedCardCount: profiling.exactCandidateJoinLastAnchorFrontierPrecheckCalculatedCardCount ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckMaxCardCount: profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxCardCount ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckAnchorCandidateCount: profiling.exactCandidateJoinLastAnchorFrontierPrecheckAnchorCandidateCount ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckMaxAnchorCandidateCount: profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxAnchorCandidateCount ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckOtherSlotCandidateCounts: profiling.exactCandidateJoinLastAnchorFrontierPrecheckOtherSlotCandidateCounts ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckOtherSlotCandidateTotal: profiling.exactCandidateJoinLastAnchorFrontierPrecheckOtherSlotCandidateTotal ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckMaxOtherSlotCandidateCount: profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxOtherSlotCandidateCount ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckMaxOtherSlotCandidateTotal: profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxOtherSlotCandidateTotal ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckFrontierGap: profiling.exactCandidateJoinLastAnchorFrontierPrecheckFrontierGap ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckMaxFrontierGap: profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxFrontierGap ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckPeekUpperBound: profiling.exactCandidateJoinLastAnchorFrontierPrecheckPeekUpperBound ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckOtherUpper: profiling.exactCandidateJoinLastAnchorFrontierPrecheckOtherUpper ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckIncumbentScore: profiling.exactCandidateJoinLastAnchorFrontierPrecheckIncumbentScore ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckRemainingMs: profiling.exactCandidateJoinLastAnchorFrontierPrecheckRemainingMs ?? null,\n"
        + "    exactCandidateJoinLastAnchorFrontierPrecheckMinRemainingMs: profiling.exactCandidateJoinLastAnchorFrontierPrecheckMinRemainingMs ?? null,\n",
    );
  }
  if (patched === source) {
    return false;
  }
  if (
    !patched.includes("lastNodeHeapUsedMiB: profiling.lastNodeHeapUsedMiB ?? null")
    || !patched.includes("memoryLimited: stats.memoryLimited")
    || !patched.includes("averageScore: report.topResult?.averageScore ?? null")
    || !patched.includes("maxScoreCandidate: report.maxScoreCandidate")
    || !patched.includes("maxScoreCandidate: searchResult.maxScoreCandidate &&")
    || !patched.includes("exactCandidateJoinMemorySnapshots: profiling.exactCandidateJoinMemorySnapshots ?? null")
    || !patched.includes("exactCandidateJoinPrefixUpperReplaySummary: profiling.exactCandidateJoinPrefixUpperReplaySummary ?? null")
    || !patched.includes("exactCandidateJoinRawAnchorCheapUpperReplay: profiling.exactCandidateJoinRawAnchorCheapUpperReplay ?? null")
    || !patched.includes("exactCandidateJoinRawAnchorFrontierProbe: profiling.exactCandidateJoinRawAnchorFrontierProbe ?? null")
    || !patched.includes("exactCandidateJoinRawCandidatePoolProfile: profiling.exactCandidateJoinRawCandidatePoolProfile ?? null")
    || !patched.includes("exactCandidateJoinRawPairComplementParity: profiling.exactCandidateJoinRawPairComplementParity ?? null")
    || !patched.includes("exactCandidateJoinRawPairUpperScanParity: profiling.exactCandidateJoinRawPairUpperScanParity ?? null")
    || !patched.includes("exactCandidateJoinRawSolverInputCensus: profiling.exactCandidateJoinRawSolverInputCensus ?? null")
    || !patched.includes("exactCandidateJoinLastAnchorFrontierPrecheckSlotIndex: profiling.exactCandidateJoinLastAnchorFrontierPrecheckSlotIndex ?? null")
  ) {
    throw new Error(`Could not patch score metrics into ${hhwxBenchmarkPath}`);
  }
  fs.writeFileSync(hhwxBenchmarkPath, patched, "utf8");
  return true;
}

async function downloadFile(url, target) {
  ensureDir(path.dirname(target));
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`${url} failed: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
  return buffer.length;
}

async function setupCalcAssets() {
  const baseUrl = (process.env.HHWX_LOW_MEMORY_CALC_BASE_URL ?? "https://calc.krkrdkdk.cn").replace(/\/+$/, "");
  const assets = [
    ["pkg/bangdream_optimize_web_wasm.js", calcWasmJsPath],
    ["pkg/bangdream_optimize_web_wasm_bg.wasm", calcWasmPath],
    ["src/data/game-sync.js?v=1", calcGameSyncPath],
  ];
  const downloaded = [];
  for (const [remotePath, target] of assets) {
    if (fs.existsSync(target)) {
      continue;
    }
    const size = await downloadFile(`${baseUrl}/${remotePath}`, target);
    downloaded.push({ path: path.relative(repoRoot, target), size });
  }
  return { baseUrl, downloaded };
}

function assertBenchmarkArtifacts() {
  const missing = [];
  for (const filePath of [fixturePath(), hhwxBenchmarkPath, hhwxRunnerPath]) {
    if (!fs.existsSync(filePath)) {
      missing.push(filePath);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing benchmark artifact(s). Run setup first.\n${missing.join("\n")}`);
  }
}

function runHhwx() {
  assertBenchmarkArtifacts();
  patchHhwxBenchmarkScoreMetrics();
  ensureDir(reportDir);
  const cases = selectedCases();
  const labels = [...new Set(cases.map((item) => item.label))].join(",");
  const events = [...new Set(cases.map((item) => item.eventKey))].join(",");
  const explicitCases = cases.length === profileLabels.length * eventKeys.length
    ? ""
    : cases.map((item) => `${item.label}:${item.eventKey}`).join(",");
  const runId = `low-memory-polish-hhwx-${stamp()}`;
  const env = {
    ...process.env,
    NODE_PATH: nodePathWithFallback(process.env.NODE_PATH),
    HHWX_ISOLATED_FIXTURE_PATH: path.relative(repoRoot, fixturePath()).replace(/\\/g, "/"),
    HHWX_ISOLATED_PROFILE_LABELS: labels,
    HHWX_ISOLATED_EVENT_KEYS: events,
    HHWX_ISOLATED_CASES: explicitCases,
    HHWX_ISOLATED_DURATION_MS: String(durationMs()),
    HHWX_ISOLATED_RUN_ID: runId,
    HHWX_REAL_PROFILE_OPTIMIZATION_JSON: hhwxOptimizationJson(),
  };
  if (!explicitCases) {
    delete env.HHWX_ISOLATED_CASES;
  }
  const result = spawnSync(process.execPath, [hhwxRunnerPath], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdoutPath = path.join(reportDir, `${runId}.stdout.log`);
  const stderrPath = path.join(reportDir, `${runId}.stderr.log`);
  fs.writeFileSync(stdoutPath, result.stdout ?? "", "utf8");
  fs.writeFileSync(stderrPath, result.stderr ?? "", "utf8");
  if (result.status !== 0) {
    throw new Error(`hhwx benchmark failed with status ${result.status}; see ${stderrPath}`);
  }
  const lastReportPath = path.join(tempDir, "last-medley-40-exact-isolated.json");
  const copiedReportPath = path.join(reportDir, `${runId}.json`);
  fs.copyFileSync(lastReportPath, copiedReportPath);
  const report = JSON.parse(fs.readFileSync(copiedReportPath, "utf8"));
  annotateHhwxReportScoreMetrics(report);
  fs.writeFileSync(copiedReportPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(reportDir, "last-low-memory-polish-hhwx.json"), JSON.stringify(report, null, 2), "utf8");
  return {
    algorithm: "hhwx-current",
    runId,
    reportPath: copiedReportPath,
    stdoutPath,
    stderrPath,
    summary: report.summary,
    scoreSummary: report.scoreSummary,
  };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summarizeScoreMetrics(rows) {
  const metrics = rows
    .filter(Boolean)
    .map((row) => row.scoreMetrics)
    .filter(Boolean);
  const averageScores = metrics.map((item) => item.averageScore).filter(Number.isFinite);
  const maxScores = metrics.map((item) => item.maxScore).filter(Number.isFinite);
  const primaryScores = metrics.map((item) => item.primaryScore).filter(Number.isFinite);
  return {
    metricCount: metrics.length,
    averageScoreCount: averageScores.length,
    maxScoreCount: maxScores.length,
    primaryScoreCount: primaryScores.length,
    bestAverageScore: averageScores.length > 0 ? Math.max(...averageScores) : null,
    bestMaxScore: maxScores.length > 0 ? Math.max(...maxScores) : null,
    bestPrimaryScore: primaryScores.length > 0 ? Math.max(...primaryScores) : null,
  };
}

function buildHhwxScoreMetrics(result) {
  if (!result) {
    return null;
  }
  return {
    source: "hhwx",
    objective: "average-score-search",
    primaryScoreField: "score",
    primaryScore: finiteNumber(result.score),
    averageScore: finiteNumber(result.averageScore ?? result.score),
    maxScore: finiteNumber(result.maxScore),
    minScore: finiteNumber(result.minScore),
    comparableAverageScore: finiteNumber(result.averageScore ?? result.score),
    comparableMaxScore: finiteNumber(result.maxScore),
    note: "HHWX medley search proves the current primary score ordering; averageScore and maxScore are recorded separately.",
  };
}

function annotateHhwxResultScoreMetrics(result) {
  if (!result || typeof result !== "object") {
    return;
  }
  result.scoreMetrics = buildHhwxScoreMetrics(result);
  if (result.maxScoreCandidate) {
    result.maxScoreCandidate.scoreMetrics = buildHhwxScoreMetrics(result.maxScoreCandidate);
  }
  for (const candidate of result.evaluatedAverageTopCandidates ?? []) {
    if (candidate && typeof candidate === "object") {
      candidate.scoreMetrics = buildHhwxScoreMetrics(candidate);
    }
  }
}

function annotateHhwxReportScoreMetrics(report) {
  report.scoreSemantics = {
    algorithm: "hhwx-current",
    primaryObjective: "average-score-search",
    directCalcComparison: "Compare averageScore with averageScore and maxScore with maxScore only.",
  };
  for (const row of report.rows ?? []) {
    annotateHhwxResultScoreMetrics(row.all);
    annotateHhwxResultScoreMetrics(row.resultFixed);
    annotateHhwxResultScoreMetrics(row.result60);
    annotateHhwxResultScoreMetrics(row.result120);
    annotateHhwxResultScoreMetrics(row.maxLocked?.result);
    for (const lockedRow of row.lockedRows ?? []) {
      annotateHhwxResultScoreMetrics(lockedRow.result);
    }
  }
  report.scoreSummary = summarizeScoreMetrics(
    (report.rows ?? [])
      .filter((row) => !row.failed)
      .map((row) => row.all ?? row.resultFixed ?? row.result60),
  );
}

function finalizeLastHhwxReport() {
  const sourceReportPath = path.join(tempDir, "last-medley-40-exact-isolated.json");
  if (!fs.existsSync(sourceReportPath)) {
    throw new Error(`Missing ${sourceReportPath}`);
  }
  ensureDir(reportDir);
  const runId = `low-memory-polish-hhwx-finalized-${stamp()}`;
  const copiedReportPath = path.join(reportDir, `${runId}.json`);
  const report = JSON.parse(fs.readFileSync(sourceReportPath, "utf8"));
  annotateHhwxReportScoreMetrics(report);
  report.finalizedFrom = sourceReportPath;
  report.finalizedAt = new Date().toISOString();
  fs.writeFileSync(copiedReportPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(reportDir, "last-low-memory-polish-hhwx.json"), JSON.stringify(report, null, 2), "utf8");
  return {
    algorithm: "hhwx-current",
    runId,
    reportPath: copiedReportPath,
    sourceReportPath,
    summary: report.summary,
    scoreSummary: report.scoreSummary,
  };
}

function nodePathWithFallback(currentNodePath) {
  const entries = [];
  const localNodeModules = path.join(repoRoot, "node_modules");
  const siblingNodeModules = path.join(repoRoot, "..", "hhwx", "node_modules");
  if (currentNodePath) {
    entries.push(...currentNodePath.split(path.delimiter).filter(Boolean));
  }
  if (!fs.existsSync(localNodeModules) && fs.existsSync(siblingNodeModules)) {
    entries.unshift(siblingNodeModules);
  }
  return [...new Set(entries)].join(path.delimiter);
}

function addNodeModuleFallback() {
  const localNodeModules = path.join(repoRoot, "node_modules");
  const siblingNodeModules = path.join(repoRoot, "..", "hhwx", "node_modules");
  if (fs.existsSync(localNodeModules)) {
    return;
  }
  if (!fs.existsSync(siblingNodeModules)) {
    return;
  }
  process.env.NODE_PATH = process.env.NODE_PATH
    ? `${siblingNodeModules}${path.delimiter}${process.env.NODE_PATH}`
    : siblingNodeModules;
  Module._initPaths();
}

function installTypeScriptLoader() {
  addNodeModuleFallback();
  const ts = require("typescript");
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request.startsWith("@/")) {
      return originalResolveFilename.call(
        this,
        path.join(repoRoot, "src", request.slice(2)),
        parent,
        isMain,
        options,
      );
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  require.extensions[".ts"] = function compileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        skipLibCheck: true,
      },
      fileName: filename,
    });
    module._compile(output.outputText, filename);
  };
}

function loadProfiles() {
  installTypeScriptLoader();
  const { decodeGameProfilePayload } = require("../src/lib/user-game-profile-payload-server.ts");
  const { getGameProfileCards } = require("../src/lib/user-game-profile-payload.ts");
  const fixture = JSON.parse(fs.readFileSync(fixturePath(), "utf8"));
  const rows = Array.isArray(fixture) ? fixture : fixture.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`${fixturePath()} must contain rows`);
  }
  return rows.map((row, index) => {
    const payload = decodeGameProfilePayload({
      storageCodec: row.storage_codec,
      payloadCompressed: row.payload_compressed,
      payloadSha256: row.payload_sha256,
      payloadSize: row.payload_size,
    });
    return {
      label: row.label ?? `P${String(index + 1).padStart(2, "0")}`,
      payload,
      cardCount: getGameProfileCards(payload).length,
      source: {
        id: row.id,
        payloadSize: row.payload_size,
      },
    };
  });
}

function combineCharacterBonuses(potentials, missionBonuses) {
  const byCharacter = new Map();
  for (const potential of potentials) {
    const record = byCharacter.get(potential.characterId) ?? {
      potential: { performance: 0, technique: 0, visual: 0 },
      characterTask: { performance: 0, technique: 0, visual: 0 },
    };
    record.potential = {
      performance: (potential.performanceLevel ?? 0) / 1000,
      technique: (potential.techniqueLevel ?? 0) / 1000,
      visual: (potential.visualLevel ?? 0) / 1000,
    };
    byCharacter.set(potential.characterId, record);
  }
  for (const bonus of missionBonuses) {
    const record = byCharacter.get(bonus.characterId) ?? {
      potential: { performance: 0, technique: 0, visual: 0 },
      characterTask: { performance: 0, technique: 0, visual: 0 },
    };
    record.characterTask.performance += (bonus.performance ?? 0) / 1000;
    record.characterTask.technique += (bonus.technique ?? 0) / 1000;
    record.characterTask.visual += (bonus.visual ?? 0) / 1000;
    byCharacter.set(bonus.characterId, record);
  }
  return Object.fromEntries([...byCharacter.entries()].map(([characterId, value]) => [String(characterId), value]));
}

function serverName(server) {
  return ["jp", "en", "tw", "cn", "kr"][Number(server)] ?? "cn";
}

function calcEventId(eventKey) {
  return eventKey === "none" ? 0 : Number(eventKey);
}

function emptyMedleyEvent() {
  return {
    eventType: "medley",
    attributes: [],
    characters: [],
    members: [],
    eventAttributeAndCharacterBonus: { pointPercent: 0, parameterPercent: 0 },
    eventCharacterParameterBonus: { performance: 0, technique: 0, visual: 0 },
    limitBreaks: [],
  };
}

async function fetchCalcJson(pathName) {
  const cachePath = calcGameDataCachePath(pathName);
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } catch {
      // Fall through and refresh a corrupt or partial cache file.
    }
  }
  const baseUrl = (process.env.HHWX_LOW_MEMORY_CALC_BASE_URL ?? "https://calc.krkrdkdk.cn").replace(/\/+$/, "");
  const url = `${baseUrl}/game-data/${pathName}`;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      const parsed = JSON.parse(text);
      ensureDir(path.dirname(cachePath));
      fs.writeFileSync(cachePath, text, "utf8");
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await delay(500 * attempt);
      }
    }
  }
  throw new Error(`${pathName} failed after 3 attempts: ${lastError?.message ?? String(lastError)}`);
}

function calcGameDataCachePath(pathName) {
  const safeParts = String(pathName)
    .replace(/^[\\/]+/, "")
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9._-]/g, "_"));
  return path.join(calcGameDataCacheDir, ...safeParts);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCalcCore() {
  const [
    cards,
    characters,
    skills,
    areaItems,
    events,
    songs,
    cardsFix,
    skillsFix,
    areaItemsFix,
    eventCharacterParameterBonusFix,
  ] = await Promise.all([
    fetchCalcJson("api/cards/all.5.json"),
    fetchCalcJson("api/characters/main.3.json"),
    fetchCalcJson("api/skills/all.10.json"),
    fetchCalcJson("api/areaItems/main.5.json"),
    fetchCalcJson("api/events/all.6.json"),
    fetchCalcJson("api/songs/all.7.json"),
    fetchCalcJson("cardsCNfix.json"),
    fetchCalcJson("skillsCNfix.json"),
    fetchCalcJson("areaItemFix.json"),
    fetchCalcJson("eventCharacterParameterBonusFix.json"),
  ]);
  return {
    cards,
    characters,
    skills,
    areaItems,
    events,
    songs,
    cardsFix,
    skillsFix,
    areaItemsFix,
    eventCharacterParameterBonusFix,
  };
}

function maxCardLevel(card) {
  const levels = Object.keys(card?.stat ?? {})
    .filter((key) => /^\d+$/.test(key))
    .map(Number);
  return levels.length > 0 ? Math.max(...levels) : 1;
}

async function ensureOwnedCardDetails(coreCards, ownedCards) {
  const cards = { ...coreCards };
  for (const owned of ownedCards) {
    const cardId = String(owned.cardId);
    const level = String(owned.level ?? maxCardLevel(cards[cardId]));
    if (cards[cardId]?.stat?.[level]) {
      continue;
    }
    cards[cardId] = mergeCalcCardDetail(cards[cardId], await fetchCalcJson(`api/cards/${cardId}.json`));
  }
  return cards;
}

function mergeCalcCardDetail(baseCard, detail) {
  if (!baseCard) {
    return detail;
  }
  if (!detail?.stat) {
    return baseCard;
  }
  return {
    ...baseCard,
    stat: detail.stat,
  };
}

function applyCalcEventCharacterParameterBonusFix(event, fix, eventId) {
  if (event?.eventCharacterParameterBonus != null) {
    return event;
  }
  const fixedValue = fix?.[String(eventId)];
  if (fixedValue == null) {
    return event;
  }
  return {
    ...event,
    eventCharacterParameterBonus: fixedValue,
  };
}

function difficultyName(difficulty) {
  return ["easy", "normal", "hard", "expert", "special"][Number(difficulty)] ?? "expert";
}

function calcOptions() {
  return process.env.HHWX_LOW_MEMORY_CALC_OPTIONS_JSON
    ? JSON.parse(process.env.HHWX_LOW_MEMORY_CALC_OPTIONS_JSON)
    : {};
}

async function prewarmCalcGameData(cases) {
  const startedAt = new Date().toISOString();
  const errors = [];
  await loadCalcCore();
  const chartPaths = songSelections.map((selection) =>
    `api/charts/${selection.songId}/${selection.chartName}.json`);
  const eventPaths = [...new Set(cases
    .map((item) => item.eventKey)
    .filter((eventKey) => eventKey !== "none")
    .map((eventKey) => `api/events/${Number(eventKey)}.json`))];
  for (const pathName of [...chartPaths, ...eventPaths]) {
    try {
      await fetchCalcJson(pathName);
    } catch (error) {
      errors.push({
        pathName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    startedAt,
    endedAt: new Date().toISOString(),
    cacheDir: calcGameDataCacheDir,
    chartPaths,
    eventPaths,
    errorCount: errors.length,
    errors,
  };
}

function buildCalcPlayer(profile, ownedCards, cards, eventKey) {
  installTypeScriptLoader();
  const {
    getGameProfileAreaItems,
    getGameProfileCharacterMissionBonuses,
    getGameProfileCharacterPotentials,
  } = require("../src/lib/user-game-profile-payload.ts");
  const eventId = calcEventId(eventKey);
  return {
    playerId: 0,
    server: serverName(profile.payload.bestdoriProfile?.server),
    currentEvent: eventId,
    activityMode: "medley",
    eventSongs: {
      [String(eventId)]: songSelections.map(({ songId, difficulty }) => ({ songId, difficulty })),
    },
    eventPresets: {},
    eventOverrides: eventKey === "none" ? { [String(eventId)]: emptyMedleyEvent() } : {},
    cardList: Object.fromEntries(ownedCards.map((card) => [String(card.cardId), {
      level: card.level ?? maxCardLevel(cards[String(card.cardId)]),
      training: Boolean(card.isTrained),
      illustTrainingStatus: Boolean(card.hasTrainedArt),
      episodes: [card.episodeCount >= 1, card.episodeCount >= 2],
      limitBreakRank: card.masterRank ?? 0,
      skillLevel: card.skillLevel ?? 1,
    }])),
    areaItem: Object.fromEntries(getGameProfileAreaItems(profile.payload).map((item) => [
      String(item.areaItemId),
      { level: item.level ?? 0 },
    ])),
    characterBouns: combineCharacterBonuses(
      getGameProfileCharacterPotentials(profile.payload),
      getGameProfileCharacterMissionBonuses(profile.payload),
    ),
  };
}

function selectedExportScope() {
  const explicitCases = parseCsv(process.env.HHWX_LOW_MEMORY_CASES, []);
  if (explicitCases.length > 0) {
    const labels = [];
    const events = [];
    for (const entry of explicitCases) {
      const [label, eventKey] = entry.split(":").map((part) => part.trim());
      if (!label || !eventKey) {
        throw new Error(`Invalid HHWX_LOW_MEMORY_CASES entry: ${entry}`);
      }
      labels.push(label);
      events.push(eventKey);
    }
    return {
      labels: [...new Set(labels)],
      events: [...new Set(events)],
    };
  }

  const labels = parseCsv(process.env.HHWX_LOW_MEMORY_PROFILE_LABELS, ["P01"]);
  const events = parseCsv(process.env.HHWX_LOW_MEMORY_EVENT_KEYS, eventKeys);
  return {
    labels,
    events,
  };
}

function calcCompactProfilePayload(player) {
  const cardList = [];
  for (const [cardId, config] of Object.entries(player.cardList ?? {})) {
    const id = Number(cardId);
    if (!Number.isInteger(id) || id <= 0 || !config || typeof config !== "object") {
      continue;
    }
    const episodes = Array.isArray(config.episodes) ? config.episodes : [];
    cardList.push([
      id,
      Math.trunc(Number(config.level) || 0),
      config.training ? 1 : 0,
      config.illustTrainingStatus ? 1 : 0,
      episodes[0] ? 1 : 0,
      episodes[1] ? 1 : 0,
      Math.trunc(Number(config.limitBreakRank) || 0),
      Math.trunc(Number(config.skillLevel) || 1),
    ]);
  }
  cardList.sort((left, right) => left[0] - right[0]);

  const areaItems = [];
  for (const [itemId, item] of Object.entries(player.areaItem ?? {})) {
    const id = Number(itemId);
    if (!Number.isInteger(id) || id <= 0 || !item || typeof item !== "object") {
      continue;
    }
    areaItems.push([id, Math.trunc(Number(item.level) || 0)]);
  }
  areaItems.sort((left, right) => left[0] - right[0]);

  const characterBonuses = [];
  for (const [characterId, bonus] of Object.entries(player.characterBouns ?? {})) {
    const id = Number(characterId);
    if (!Number.isInteger(id) || id <= 0 || !bonus || typeof bonus !== "object") {
      continue;
    }
    const potential = bonus.potential ?? {};
    const task = bonus.characterTask ?? {};
    const values = [
      Number(potential.performance) || 0,
      Number(potential.technique) || 0,
      Number(potential.visual) || 0,
      Number(task.performance) || 0,
      Number(task.technique) || 0,
      Number(task.visual) || 0,
    ];
    if (values.every((value) => value === 0)) {
      continue;
    }
    characterBonuses.push([id, ...values]);
  }
  characterBonuses.sort((left, right) => left[0] - right[0]);

  return {
    v: 1,
    c: cardList,
    b: characterBonuses,
    a: areaItems,
  };
}

function calcBase64ProfileExport(player) {
  const payload = calcCompactProfilePayload(player);
  return {
    compactPayload: payload,
    compressed: {
      v: 1,
      t: "gz+b64",
      d: gzipSync(Buffer.from(JSON.stringify(payload), "utf8")).toString("base64"),
    },
  };
}

function profileExportInstructionText() {
  return [
    "P01 profile export for calc.krkrdkdk.cn manual checks",
    "",
    "Files:",
    "- P01-bestdori-profile.json: paste into 导入配置 -> 按 Bestdori 格式导入.",
    "- P01-calc-base64-profile.json: paste into 导入配置 -> 按 base64 格式导入; this preserves calc player card/item/characterBouns fields.",
    "- P01-calc-player-<event>.json: full calc player state for diagnostics and script reproduction; the current UI does not expose a direct paste target for this full object.",
    "",
    "After importing a profile, set the activity/event and the three medley songs in the page before calculating.",
  ].join("\n");
}

function exportCalcProfiles() {
  assertBenchmarkArtifacts();
  ensureDir(reportDir);
  installTypeScriptLoader();
  const {
    exportBestdoriGameProfilePayload,
    getGameProfileCards,
  } = require("../src/lib/user-game-profile-payload.ts");
  const { labels, events } = selectedExportScope();
  const profiles = loadProfiles();
  const runId = `low-memory-polish-profile-export-${stamp()}`;
  const artifactDir = path.join(reportDir, `${runId}-profiles`);
  ensureDir(artifactDir);
  fs.writeFileSync(path.join(artifactDir, "README.txt"), profileExportInstructionText(), "utf8");

  const rows = [];
  for (const label of labels) {
    const profile = profiles.find((entry) => entry.label === label);
    if (!profile) {
      throw new Error(`Profile not found: ${label}`);
    }
    const ownedCards = getGameProfileCards(profile.payload).filter((card) => !card.isExcluded);
    const bestdoriProfile = exportBestdoriGameProfilePayload(profile.payload);
    const bestdoriPath = path.join(artifactDir, `${label}-bestdori-profile.json`);
    fs.writeFileSync(bestdoriPath, JSON.stringify(bestdoriProfile, null, 2), "utf8");

    const basePlayer = buildCalcPlayer(profile, ownedCards, {}, "none");
    const { compactPayload, compressed } = calcBase64ProfileExport(basePlayer);
    const compactPath = path.join(artifactDir, `${label}-calc-compact-profile-v1.json`);
    const base64Path = path.join(artifactDir, `${label}-calc-base64-profile.json`);
    fs.writeFileSync(compactPath, JSON.stringify(compactPayload, null, 2), "utf8");
    fs.writeFileSync(base64Path, JSON.stringify(compressed, null, 2), "utf8");

    const playerPaths = [];
    for (const eventKey of events) {
      const player = buildCalcPlayer(profile, ownedCards, {}, eventKey);
      const playerPath = path.join(artifactDir, `${label}-calc-player-${eventKey}.json`);
      fs.writeFileSync(playerPath, JSON.stringify(player, null, 2), "utf8");
      playerPaths.push({
        eventKey,
        path: playerPath,
        sha256: sha256File(playerPath),
        playerSummary: {
          currentEvent: player.currentEvent,
          activityMode: player.activityMode,
          songCount: player.eventSongs?.[String(player.currentEvent)]?.length ?? null,
          cardCount: Object.keys(player.cardList ?? {}).length,
          areaItemCount: Object.keys(player.areaItem ?? {}).length,
          characterBonusCount: Object.keys(player.characterBouns ?? {}).length,
        },
      });
    }

    rows.push({
      label,
      source: profile.source,
      cardCount: profile.cardCount,
      ownedNonExcludedCardCount: ownedCards.length,
      bestdoriProfilePath: bestdoriPath,
      bestdoriProfileSha256: sha256File(bestdoriPath),
      calcBase64ProfilePath: base64Path,
      calcBase64ProfileSha256: sha256File(base64Path),
      calcCompactProfilePath: compactPath,
      calcCompactProfileSha256: sha256File(compactPath),
      calcPlayerPaths: playerPaths,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    runId,
    algorithm: "calc-profile-export",
    calcSite: "https://calc.krkrdkdk.cn/",
    fixturePath: fixturePath(),
    fixtureSha256: sha256File(fixturePath()),
    labels,
    events,
    artifactDir,
    notes: [
      "Bestdori JSON is compatible with the page's Bestdori import parser.",
      "The page's Bestdori importer collapses character bonus detail into Bestdori potentials; use calc-base64-profile for exact calc player profile fields.",
      "calc-player event files include currentEvent and medley song selections for script/browser diagnostics.",
    ],
    rows,
  };
  const manifestPath = path.join(artifactDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  fs.writeFileSync(path.join(reportDir, "last-low-memory-polish-profile-export.json"), JSON.stringify(manifest, null, 2), "utf8");
  return {
    algorithm: "calc-profile-export",
    runId,
    artifactDir,
    manifestPath,
    rows: manifest.rows.map((row) => ({
      label: row.label,
      cardCount: row.cardCount,
      bestdoriProfilePath: row.bestdoriProfilePath,
      calcBase64ProfilePath: row.calcBase64ProfilePath,
      calcPlayerPaths: row.calcPlayerPaths.map((item) => ({
        eventKey: item.eventKey,
        path: item.path,
      })),
    })),
  };
}

async function buildCalcPayload(profile, eventKey) {
  installTypeScriptLoader();
  const {
    getGameProfileCards,
  } = require("../src/lib/user-game-profile-payload.ts");
  const core = await loadCalcCore();
  const ownedCards = getGameProfileCards(profile.payload).filter((card) => !card.isExcluded);
  const cards = await ensureOwnedCardDetails(core.cards, ownedCards);
  const eventId = calcEventId(eventKey);
  const rawEvent = eventKey === "none"
    ? emptyMedleyEvent()
    : await fetchCalcJson(`api/events/${eventId}.json`).catch(() => core.events[String(eventId)]);
  const event = eventKey === "none"
    ? rawEvent
    : applyCalcEventCharacterParameterBonusFix(rawEvent, core.eventCharacterParameterBonusFix, eventId);
  const charts = await Promise.all(songSelections.map(async (selection) => ({
    songId: selection.songId,
    difficulty: selection.difficulty,
    data: await fetchCalcJson(`api/charts/${selection.songId}/${selection.chartName}.json`),
  })));
  const player = buildCalcPlayer(profile, ownedCards, cards, eventKey);
  const options = calcOptions();
  return {
    cards,
    characters: core.characters,
    skills: core.skills,
    areaItems: core.areaItems,
    cardsFix: core.cardsFix,
    skillsFix: core.skillsFix,
    areaItemsFix: core.areaItemsFix,
    event,
    songs: Object.fromEntries(songSelections.map((selection) => [
      String(selection.songId),
      core.songs[String(selection.songId)],
    ])),
    charts,
    player,
    server: player.server,
    eventId,
    options,
  };
}

async function buildCalcPayloadViaWebBuilder(profile, eventKey) {
  installTypeScriptLoader();
  const {
    getGameProfileCards,
  } = require("../src/lib/user-game-profile-payload.ts");
  if (!fs.existsSync(calcGameSyncPath)) {
    await setupCalcAssets();
  }
  const { GameDataClient } = await import(`${pathToFileURL(calcGameSyncPath).href}?t=${Date.now()}`);
  const core = await loadCalcCore();
  const ownedCards = getGameProfileCards(profile.payload).filter((card) => !card.isExcluded);
  const player = buildCalcPlayer(profile, ownedCards, core.cards, eventKey);
  const client = Object.create(GameDataClient.prototype);
  client.syncCardDetail = async (cardId) => fetchCalcJson(`api/cards/${cardId}.json`);
  client.syncEvent = async (eventId) => (
    fetchCalcJson(`api/events/${eventId}.json`).catch(() => core.events[String(eventId)])
  );
  client.syncChart = async (songId, difficulty) => ({
    songId,
    difficulty,
    data: await fetchCalcJson(`api/charts/${songId}/${difficultyName(difficulty)}.json`),
  });
  return GameDataClient.prototype.buildCalculationPayload.call(client, {
    player,
    server: player.server,
    eventId: calcEventId(eventKey),
    options: calcOptions(),
    core,
  });
}

async function runCalcCase(caseKey) {
  const [label, eventKey] = caseKey.split(":");
  if (!label || !eventKey) {
    throw new Error(`Invalid calc-case: ${caseKey}`);
  }
  if (!fs.existsSync(calcWasmJsPath) || !fs.existsSync(calcWasmPath)) {
    await setupCalcAssets();
  }
  const profiles = loadProfiles();
  const profile = profiles.find((entry) => entry.label === label);
  if (!profile) {
    throw new Error(`Profile not found: ${label}`);
  }
  const wasm = await import(pathToFileURL(calcWasmJsPath).href);
  wasm.initSync({ module: fs.readFileSync(calcWasmPath) });
  const payload = await buildCalcPayload(profile, eventKey);
  const payloadSha256 = stableJsonHash(payload);
  const payloadSummaryValue = payloadSummary(payload);
  const artifactDir = process.env.HHWX_LOW_MEMORY_CALC_CASE_ARTIFACT_DIR
    ? path.resolve(process.env.HHWX_LOW_MEMORY_CALC_CASE_ARTIFACT_DIR)
    : null;
  const artifactStem = caseFileStem(caseKey);
  const inputSummaryPath = artifactDir ? path.join(artifactDir, `${artifactStem}.input-summary.json`) : null;
  const inputPlayerPath = artifactDir ? path.join(artifactDir, `${artifactStem}.player.json`) : null;
  const inputPayloadPath = artifactDir && process.env.HHWX_LOW_MEMORY_SAVE_CALC_PAYLOADS === "1"
    ? path.join(artifactDir, `${artifactStem}.payload.json`)
    : null;
  if (artifactDir) {
    ensureDir(artifactDir);
    fs.writeFileSync(inputSummaryPath, JSON.stringify({
      caseKey,
      profile: {
        label,
        cardCount: profile.cardCount,
        source: profile.source,
      },
      eventKey,
      generatedAt: new Date().toISOString(),
      payloadSha256,
      payloadSummary: payloadSummaryValue,
      calcOptions: calcOptions(),
      fixturePath: fixturePath(),
      fixtureSha256: sha256File(fixturePath()),
    }, null, 2), "utf8");
    fs.writeFileSync(inputPlayerPath, JSON.stringify(payload.player, null, 2), "utf8");
    if (inputPayloadPath) {
      fs.writeFileSync(inputPayloadPath, JSON.stringify(payload, null, 2), "utf8");
    }
  }
  const startedAt = new Date().toISOString();
  const rssBefore = process.memoryUsage().rss;
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const resultJson = wasm.calculateFromStaticData(JSON.stringify(payload));
  const elapsedMs = Math.round(performance.now() - started);
  const rssAfter = process.memoryUsage().rss;
  const heapAfter = process.memoryUsage().heapUsed;
  const result = JSON.parse(resultJson);
  const scoreMetrics = buildCalcScoreMetrics(result);
  return {
    caseKey,
    profile: {
      label,
      cardCount: profile.cardCount,
      source: profile.source,
    },
    eventKey,
    algorithm: "calc-krkrdkdk-wasm",
    startedAt,
    endedAt: new Date().toISOString(),
    elapsedMs,
    rssBeforeMiB: Math.ceil(rssBefore / 1048576),
    rssAfterMiB: Math.ceil(rssAfter / 1048576),
    rssDeltaMiB: Math.ceil((rssAfter - rssBefore) / 1048576),
    heapBeforeMiB: Math.ceil(heapBefore / 1048576),
    heapAfterMiB: Math.ceil(heapAfter / 1048576),
    payloadSha256,
    payloadSummary: payloadSummaryValue,
    inputSummaryPath,
    inputPlayerPath,
    inputPayloadPath,
    totalScore: result.totalScore ?? null,
    scoreSemantics: calcScoreSemantics(),
    scoreMetrics,
    primaryScore: scoreMetrics.primaryScore,
    averageScore: scoreMetrics.averageScore,
    maxScore: scoreMetrics.maxScore,
    minScore: scoreMetrics.minScore,
    totalStat: result.totalStat ?? null,
    solver: result.solver ?? null,
    metrics: result.metrics ?? null,
    songs: (result.songs ?? []).map((song) => ({
      songId: song.songId,
      difficulty: song.difficulty,
      score: song.score,
      stat: song.stat,
      teamCardIds: song.teamCardIds,
      captainCardId: song.captainCardId,
    })),
    rawResult: result,
  };
}

function calcScoreSemantics() {
  return {
    algorithm: "calc-krkrdkdk-wasm",
    primaryScoreField: "totalScore",
    likelyPrimaryObjective: "max-score",
    directHhwxComparison: false,
    note: "The public calc output appears to optimize/report highest score; compare only same-named metrics when present.",
  };
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function calcBaselineFidelity() {
  return {
    exactReplicaOfWebsite: false,
    wasmEntrypoint: "calculateFromStaticData",
    wasmAssetVersionObserved: "20260615-current-core",
    localAssets: {
      jsSha256: fs.existsSync(calcWasmJsPath) ? sha256File(calcWasmJsPath) : null,
      wasmSha256: fs.existsSync(calcWasmPath) ? sha256File(calcWasmPath) : null,
    },
    confirmed: [
      "Uses the same public WASM entrypoint as the browser worker.",
      "Uses calc.krkrdkdk.cn game-data JSON endpoints.",
      "Payload construction now mirrors core parts of src/data/game-sync.js: card stat detail merge and eventCharacterParameterBonusFix application.",
    ],
    notYetConfirmed: [
      "The converted HHWX profile exactly matches a calc website saved player config.",
      "All website UI/default options are identical to HHWX_LOW_MEMORY_CALC_OPTIONS_JSON.",
      "The generated payload has been captured from a real browser session and byte-compared.",
      "The output has been validated against the visible website result for the same player/config.",
    ],
  };
}

function sumFinite(values) {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length === values.length && finiteValues.length > 0
    ? finiteValues.reduce((sum, value) => sum + value, 0)
    : null;
}

function buildCalcScoreMetrics(result) {
  const songs = Array.isArray(result?.songs) ? result.songs : [];
  const songScores = songs.map((song) => finiteNumber(song.score));
  const totalScore = finiteNumber(result?.totalScore ?? sumFinite(songScores));
  const averageScore = finiteNumber(
    result?.averageScore
      ?? result?.totalAverageScore
      ?? result?.avgScore
      ?? result?.expectedScore,
  );
  const maxScore = finiteNumber(
    result?.maxScore
      ?? result?.totalMaxScore
      ?? totalScore,
  );
  const minScore = finiteNumber(result?.minScore ?? result?.totalMinScore);
  return {
    source: "calc-krkrdkdk-wasm",
    objective: "likely-max-score",
    primaryScoreField: "totalScore",
    primaryScore: totalScore,
    averageScore,
    maxScore,
    minScore,
    comparableAverageScore: averageScore,
    comparableMaxScore: maxScore,
    note: "averageScore is null unless the calc WASM returns an explicit average-score field.",
  };
}

function summarizeCalc(rows) {
  const okRows = rows.filter((row) => !row.failed);
  const elapsed = okRows.map((row) => row.elapsedMs).filter(Number.isFinite);
  const rssAfter = okRows.map((row) => row.rssAfterMiB).filter(Number.isFinite);
  const scoreSummary = summarizeScoreMetrics(okRows);
  return {
    caseCount: rows.length,
    completedCount: okRows.length,
    failedCount: rows.length - okRows.length,
    medianElapsedMs: percentile(elapsed, 50),
    p95ElapsedMs: percentile(elapsed, 95),
    maxElapsedMs: elapsed.length > 0 ? Math.max(...elapsed) : null,
    peakRssAfterMiB: rssAfter.length > 0 ? Math.max(...rssAfter) : null,
    scoreSummary,
  };
}

function percentile(values, p) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function stableJsonHash(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function describeValue(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (typeof value === "object") {
    return `object(${Object.keys(value).length})`;
  }
  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }
  return value;
}

function diffJson(left, right, currentPath = "$", diffs = [], maxDiffs = 200) {
  if (diffs.length >= maxDiffs) {
    return diffs;
  }
  if (Object.is(left, right)) {
    return diffs;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      diffs.push({ path: currentPath, left: describeValue(left), right: describeValue(right), reason: "type" });
      return diffs;
    }
    if (left.length !== right.length) {
      diffs.push({ path: `${currentPath}.length`, left: left.length, right: right.length, reason: "array-length" });
    }
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length && diffs.length < maxDiffs; index += 1) {
      diffJson(left[index], right[index], `${currentPath}[${index}]`, diffs, maxDiffs);
    }
    return diffs;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      if (diffs.length >= maxDiffs) {
        break;
      }
      if (!(key in left)) {
        diffs.push({ path: `${currentPath}.${key}`, left: undefined, right: describeValue(right[key]), reason: "missing-left" });
        continue;
      }
      if (!(key in right)) {
        diffs.push({ path: `${currentPath}.${key}`, left: describeValue(left[key]), right: undefined, reason: "missing-right" });
        continue;
      }
      diffJson(left[key], right[key], `${currentPath}.${key}`, diffs, maxDiffs);
    }
    return diffs;
  }
  diffs.push({ path: currentPath, left: describeValue(left), right: describeValue(right), reason: "value" });
  return diffs;
}

function payloadSummary(payload) {
  return {
    topLevelKeys: Object.keys(payload).sort(),
    cardCount: Object.keys(payload.cards ?? {}).length,
    playerCardCount: Object.keys(payload.player?.cardList ?? {}).length,
    areaItemCount: Object.keys(payload.player?.areaItem ?? {}).length,
    songIds: Object.keys(payload.songs ?? {}).sort((left, right) => Number(left) - Number(right)),
    chartCount: Array.isArray(payload.charts) ? payload.charts.length : null,
    eventId: payload.eventId,
    eventType: payload.event?.eventType ?? null,
    server: payload.server,
    activityMode: payload.player?.activityMode ?? null,
    optionKeys: Object.keys(payload.options ?? {}).sort(),
  };
}

async function runCalcFidelity() {
  assertBenchmarkArtifacts();
  await setupCalcAssets();
  ensureDir(reportDir);
  const selected = selectedCases()[0] ?? { label: "P01", eventKey: "none" };
  const caseKey = `${selected.label}:${selected.eventKey}`;
  const profiles = loadProfiles();
  const profile = profiles.find((entry) => entry.label === selected.label);
  if (!profile) {
    throw new Error(`Profile not found: ${selected.label}`);
  }
  const runId = `low-memory-polish-calc-fidelity-${stamp()}`;
  const artifactDir = path.join(reportDir, `${runId}-payloads`);
  ensureDir(artifactDir);
  const adapterPayload = await buildCalcPayload(profile, selected.eventKey);
  const webBuilderPayload = await buildCalcPayloadViaWebBuilder(profile, selected.eventKey);
  const adapterPayloadPath = path.join(artifactDir, `${selected.label}-${selected.eventKey}-adapter-payload.json`);
  const webBuilderPayloadPath = path.join(artifactDir, `${selected.label}-${selected.eventKey}-web-builder-payload.json`);
  fs.writeFileSync(adapterPayloadPath, JSON.stringify(adapterPayload, null, 2), "utf8");
  fs.writeFileSync(webBuilderPayloadPath, JSON.stringify(webBuilderPayload, null, 2), "utf8");
  const diffs = diffJson(adapterPayload, webBuilderPayload);
  const report = {
    generatedAt: new Date().toISOString(),
    runId,
    caseKey,
    algorithm: "calc-payload-fidelity",
    baselineFidelity: {
      ...calcBaselineFidelity(),
      webBuilderLocalDiffChecked: true,
      exactReplicaOfWebsite: diffs.length === 0 ? false : false,
      note: "A zero diff against game-sync.js improves payload-builder fidelity, but real browser UI payload/output validation is still required.",
    },
    adapterPayloadPath,
    webBuilderPayloadPath,
    adapterPayloadSha256: stableJsonHash(adapterPayload),
    webBuilderPayloadSha256: stableJsonHash(webBuilderPayload),
    exactPayloadMatch: diffs.length === 0,
    diffCount: diffs.length,
    diffLimit: 200,
    diffs,
    adapterSummary: payloadSummary(adapterPayload),
    webBuilderSummary: payloadSummary(webBuilderPayload),
  };
  const reportPath = path.join(reportDir, `${runId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(reportDir, "last-low-memory-polish-calc-fidelity.json"), JSON.stringify(report, null, 2), "utf8");
  return {
    algorithm: "calc-payload-fidelity",
    runId,
    reportPath,
    caseKey,
    exactPayloadMatch: report.exactPayloadMatch,
    diffCount: report.diffCount,
    adapterPayloadSha256: report.adapterPayloadSha256,
    webBuilderPayloadSha256: report.webBuilderPayloadSha256,
  };
}

async function runCalc() {
  assertBenchmarkArtifacts();
  await setupCalcAssets();
  ensureDir(reportDir);
  const runId = `low-memory-polish-calc-${stamp()}`;
  const artifactDir = path.join(reportDir, `${runId}-artifacts`);
  const logDir = path.join(artifactDir, "logs");
  const caseInputDir = path.join(artifactDir, "case-inputs");
  ensureDir(logDir);
  ensureDir(caseInputDir);
  const timeoutMs = Number(process.env.HHWX_LOW_MEMORY_CALC_TIMEOUT_MS ?? (durationMs() + 90000));
  const cases = selectedCases();
  const fixtureSnapshotPath = path.join(artifactDir, "fixture-snapshot.json");
  const caseListPath = path.join(artifactDir, "case-list.json");
  const prewarm = await prewarmCalcGameData(cases);
  fs.copyFileSync(fixturePath(), fixtureSnapshotPath);
  fs.writeFileSync(caseListPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    fixturePath: fixturePath(),
    fixtureSha256: sha256File(fixturePath()),
    cases,
    songSelections,
    calcOptions: calcOptions(),
    durationMs: durationMs(),
    calcTimeoutMs: timeoutMs,
    prewarm,
  }, null, 2), "utf8");
  const rows = [];
  const partialReportPath = path.join(reportDir, `${runId}-partial.json`);
  function buildCalcRunReport({ partial = false, lastCaseKey = null } = {}) {
    return {
      generatedAt: new Date().toISOString(),
      runId,
      algorithm: "calc-krkrdkdk-wasm",
      partial,
      lastCaseKey,
      caveat: "Black-box score/resource observations only; calc public output does not prove exhaustive exactness and appears to use a max-score objective.",
      scoreSemantics: calcScoreSemantics(),
      baselineFidelity: calcBaselineFidelity(),
      fixturePath: fixturePath(),
      fixtureSha256: sha256File(fixturePath()),
      artifactDir,
      fixtureSnapshotPath,
      caseListPath,
      prewarm,
      durationMs: durationMs(),
      calcTimeoutMs: timeoutMs,
      cases,
      summary: summarizeCalc(rows),
      rows,
    };
  }
  function writePartialCalcReport(lastCaseKey) {
    const partialReport = buildCalcRunReport({ partial: true, lastCaseKey });
    fs.writeFileSync(partialReportPath, JSON.stringify(partialReport, null, 2), "utf8");
    fs.writeFileSync(path.join(reportDir, "last-low-memory-polish-calc-partial.json"), JSON.stringify(partialReport, null, 2), "utf8");
  }
  for (const { label, eventKey } of cases) {
    const caseKey = `${label}:${eventKey}`;
    process.stdout.write(`calc start ${caseKey}\n`);
    const inputSummaryPath = path.join(caseInputDir, `${caseFileStem(caseKey)}.input-summary.json`);
    const inputPlayerPath = path.join(caseInputDir, `${caseFileStem(caseKey)}.player.json`);
    const inputPayloadPath = path.join(caseInputDir, `${caseFileStem(caseKey)}.payload.json`);
    const child = spawnSync(process.execPath, [__filename, "calc-case", caseKey], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HHWX_LOW_MEMORY_FIXTURE_PATH: fixturePath(),
        HHWX_LOW_MEMORY_CALC_CASE_ARTIFACT_DIR: caseInputDir,
      },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : durationMs() + 90000,
    });
    const stdoutPath = path.join(logDir, `${label}-${eventKey}.stdout.log`);
    const stderrPath = path.join(logDir, `${label}-${eventKey}.stderr.log`);
    fs.writeFileSync(stdoutPath, child.stdout ?? "", "utf8");
    fs.writeFileSync(stderrPath, child.stderr ?? "", "utf8");
    if (child.status !== 0 || child.error) {
      rows.push({
        caseKey,
        profile: { label },
        eventKey,
        algorithm: "calc-krkrdkdk-wasm",
        failed: true,
        exitCode: child.status,
        signal: child.signal,
        error: child.error ? String(child.error.message ?? child.error) : null,
        stdoutPath,
        stderrPath,
        inputSummaryPath: fs.existsSync(inputSummaryPath) ? inputSummaryPath : null,
        inputPlayerPath: fs.existsSync(inputPlayerPath) ? inputPlayerPath : null,
        inputPayloadPath: fs.existsSync(inputPayloadPath) ? inputPayloadPath : null,
        stdoutTail: (child.stdout ?? "").slice(-4000),
        stderrTail: (child.stderr ?? "").slice(-4000),
      });
      writePartialCalcReport(caseKey);
      continue;
    }
    rows.push({
      ...JSON.parse(child.stdout),
      stdoutPath,
      stderrPath,
    });
    writePartialCalcReport(caseKey);
  }
  const report = buildCalcRunReport({ partial: false });
  const reportPath = path.join(reportDir, `${runId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(reportDir, "last-low-memory-polish-calc.json"), JSON.stringify(report, null, 2), "utf8");
  return {
    algorithm: "calc-krkrdkdk-wasm",
    runId,
    reportPath,
    summary: report.summary,
  };
}

async function main() {
  const command = process.argv[2];
  if (!command || command === "-h" || command === "--help") {
    printUsage();
    process.exit(command ? 0 : 1);
  }
  if (command === "setup") {
    const local = setupLocalArtifacts();
    const calc = await setupCalcAssets();
    console.log(JSON.stringify({ local, calc }, null, 2));
    return;
  }
  if (command === "hhwx") {
    console.log(JSON.stringify(runHhwx(), null, 2));
    return;
  }
  if (command === "hhwx-finalize-last") {
    console.log(JSON.stringify(finalizeLastHhwxReport(), null, 2));
    return;
  }
  if (command === "calc") {
    console.log(JSON.stringify(await runCalc(), null, 2));
    return;
  }
  if (command === "calc-fidelity") {
    console.log(JSON.stringify(await runCalcFidelity(), null, 2));
    return;
  }
  if (command === "calc-profile-export") {
    console.log(JSON.stringify(exportCalcProfiles(), null, 2));
    return;
  }
  if (command === "both") {
    const setup = setupLocalArtifacts();
    const calcSetup = await setupCalcAssets();
    const hhwx = runHhwx();
    const calc = await runCalc();
    console.log(JSON.stringify({ setup, calcSetup, hhwx, calc }, null, 2));
    return;
  }
  if (command === "calc-case") {
    const caseKey = process.argv[3];
    if (!caseKey) {
      throw new Error("calc-case requires Pxx:eventKey");
    }
    console.log(JSON.stringify(await runCalcCase(caseKey)));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
