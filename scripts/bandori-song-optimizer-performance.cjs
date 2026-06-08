#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Real-chart performance harness for the fixed-team Bandori song optimizer.
 */
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const repoRoot = path.resolve(__dirname, "..");
const bestdoriApiOrigin = "https://bestdori.com/api";
const cacheDir = path.join(repoRoot, "temp", "bandori-team-builder", "song-optimizer-real-chart-cache");
const outputDir = path.join(repoRoot, "temp", "bandori-team-builder", "song-optimizer-performance");
const supportedProfiles = new Set(["interactive", "analysis30", "offline"]);
const supportedOrders = new Set(["original", "heavy-first", "random"]);
const difficultyIndex = { easy: "0", normal: "1", hard: "2", expert: "3", special: "4" };

function resolveSourcePath(request) {
  const direct = path.resolve(repoRoot, request);
  return [
    direct,
    `${direct}.ts`,
    `${direct}.tsx`,
    `${direct}.js`,
    path.join(direct, "index.ts"),
    path.join(direct, "index.tsx"),
    path.join(direct, "index.js"),
  ].find((candidate) => fs.existsSync(candidate)) ?? null;
}

function registerTypeScriptHook() {
  const typescript = require("typescript");
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request.startsWith("@/")) {
      const resolved = resolveSourcePath(path.join("src", request.slice(2)));
      if (resolved) {
        return resolved;
      }
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  require.extensions[".ts"] = function compileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = typescript.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: typescript.ModuleKind.CommonJS,
        target: typescript.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

registerTypeScriptHook();
const { optimizeBandoriSongScoreForFixedTeam } = require("../src/lib/bandori/team-builder/song-optimizer");
const { buildOptimizerTimeline } = require("../src/lib/bandori/team-builder/song-optimizer/chart");

function parseArgs(argv) {
  const args = {
    profile: "interactive",
    order: "original",
    seed: 20260608,
    refresh: false,
    caseFilter: null,
    requireExact: false,
    maxElapsedMs: null,
    jsonOnly: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--refresh") args.refresh = true;
    else if (arg === "--json-only") args.jsonOnly = true;
    else if (arg === "--require-exact") args.requireExact = true;
    else if (arg.startsWith("--profile=")) args.profile = arg.slice("--profile=".length);
    else if (arg === "--profile") args.profile = argv[++index] ?? args.profile;
    else if (arg.startsWith("--order=")) args.order = arg.slice("--order=".length);
    else if (arg === "--order") args.order = argv[++index] ?? args.order;
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice("--seed=".length));
    else if (arg === "--seed") args.seed = Number(argv[++index] ?? args.seed);
    else if (arg.startsWith("--case=")) args.caseFilter = arg.slice("--case=".length);
    else if (arg === "--case") args.caseFilter = argv[++index] ?? null;
    else if (arg.startsWith("--max-elapsed-ms=")) args.maxElapsedMs = Number(arg.slice("--max-elapsed-ms=".length));
    else if (arg === "--max-elapsed-ms") args.maxElapsedMs = Number(argv[++index] ?? args.maxElapsedMs);
  }
  if (!supportedProfiles.has(args.profile)) throw new Error(`Unsupported profile: ${args.profile}`);
  if (!supportedOrders.has(args.order)) throw new Error(`Unsupported order: ${args.order}`);
  if (!Number.isFinite(args.seed)) throw new Error(`Invalid seed: ${args.seed}`);
  if (args.maxElapsedMs !== null && (!Number.isFinite(args.maxElapsedMs) || args.maxElapsedMs <= 0)) {
    throw new Error(`Invalid --max-elapsed-ms: ${args.maxElapsedMs}`);
  }
  return args;
}

function readJson(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchBestdoriJson(apiPath) {
  const response = await fetch(`${bestdoriApiOrigin}/${apiPath}`, {
    headers: { "User-Agent": "hhwx-song-optimizer/1.0" },
  });
  if (!response.ok) throw new Error(`Bestdori API failed for ${apiPath}: HTTP ${response.status}`);
  return response.json();
}

async function getSongsMetadata(refresh) {
  const filePath = path.join(cacheDir, "songs-all.7.json");
  const cached = refresh ? null : readJson(filePath);
  if (cached) return cached;
  const payload = await fetchBestdoriJson("songs/all.7.json");
  writeJson(filePath, payload);
  return payload;
}

async function getChart(songId, difficulty, refresh) {
  const filePath = path.join(cacheDir, "charts", `${songId}-${difficulty}.json`);
  const cached = refresh ? null : readJson(filePath);
  if (cached) return cached;
  const payload = await fetchBestdoriJson(`charts/${songId}/${difficulty}.json`);
  writeJson(filePath, payload);
  return payload;
}

function pickTitle(song) {
  const titles = song?.musicTitle;
  if (!Array.isArray(titles)) return null;
  return [3, 0, 1, 2, 4].map((index) => titles[index]).find((title) => typeof title === "string" && title.trim()) ?? null;
}

function getPlayLevel(song, difficulty) {
  const value = Number(song?.difficulty?.[difficultyIndex[difficulty]]?.playLevel);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Missing play level for ${difficulty}`);
  return Math.trunc(value);
}

function scoreSkill(valuePercent, durationSeconds, type = "score", hasRateUpWithPerfect = false) {
  return {
    durationSeconds,
    hasRateUpWithPerfect,
    cacheKey: `${type}:${valuePercent}:${durationSeconds}:${hasRateUpWithPerfect ? 1 : 0}`,
    scoreEffects: [{ type, valuePercent, condition: "none", conditionLife: null, isUnifiedValue: false }],
  };
}

function rateUpSkill(valuePercent, durationSeconds) {
  return {
    durationSeconds,
    hasRateUpWithPerfect: true,
    cacheKey: `rate-up:${valuePercent}:${durationSeconds}`,
    scoreEffects: [
      { type: "score_rate_up_with_perfect", valuePercent: 0, condition: "none", conditionLife: null, isUnifiedValue: false },
      { type: "score", valuePercent, condition: "none", conditionLife: null, isUnifiedValue: false },
    ],
  };
}

function noSkill() {
  return { durationSeconds: 0, hasRateUpWithPerfect: false, cacheKey: "none", scoreEffects: [] };
}

function representativeScoreSkills(durationSeconds = 5) {
  return [80, 90, 100, 110, 120].map((value) => scoreSkill(value, durationSeconds));
}

function createRealCaseSpecs() {
  return [
    ["real-193-expert-no-skill-coarse", "real-exact-baseline", 193, "expert", [noSkill(), noSkill(), noSkill(), noSkill(), noSkill()], { stepFrames: 7, maxSearchDurationMs: 3000, maxExactCandidateEvents: 6000, maxExactDpStates: 50000 }],
    ["real-193-expert-score-step1", "real-score", 193, "expert", representativeScoreSkills(5), { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 16000, maxExactDpStates: 100000 }],
    ["real-385-expert-score-step1", "real-score", 385, "expert", representativeScoreSkills(5), { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 18000, maxExactDpStates: 100000 }],
    ["real-619-expert-score-step1", "real-score", 619, "expert", representativeScoreSkills(5), { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 14000, maxExactDpStates: 100000 }],
    ["real-686-expert-score-step1", "real-score", 686, "expert", representativeScoreSkills(5), { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 18000, maxExactDpStates: 100000 }],
    ["real-686-expert-score-step0_5-budget", "real-fine-grid", 686, "expert", representativeScoreSkills(5), { stepFrames: 0.5, maxSearchDurationMs: 3000, maxExactCandidateEvents: 32000, maxExactDpStates: 120000 }],
    ["real-686-expert-rate-up-step1", "real-skill-state", 686, "expert", [rateUpSkill(60, 5), scoreSkill(90, 5), scoreSkill(100, 5), scoreSkill(110, 5), scoreSkill(120, 5)], { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 18000, maxExactDpStates: 120000 }],
    ["real-385-expert-continued-step1", "real-skill-state", 385, "expert", [scoreSkill(110, 5, "score_continued_note_judge"), scoreSkill(90, 5), scoreSkill(100, 5), scoreSkill(110, 5), scoreSkill(120, 5)], { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 18000, maxExactDpStates: 120000 }],
    ["real-5-expert-score-step1", "real-score-expanded", 5, "expert", representativeScoreSkills(5), { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 18000, maxExactDpStates: 100000 }],
    ["real-72-expert-score-step1", "real-score-expanded", 72, "expert", representativeScoreSkills(5), { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 18000, maxExactDpStates: 100000 }],
    ["real-253-expert-score-step1", "real-score-expanded", 253, "expert", representativeScoreSkills(5), { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 20000, maxExactDpStates: 100000 }],
    ["real-747-expert-score-step1", "real-score-expanded", 747, "expert", representativeScoreSkills(5), { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 22000, maxExactDpStates: 120000 }],
    ["real-503-expert-rate-up-step1", "real-skill-state-expanded", 503, "expert", [rateUpSkill(60, 5), scoreSkill(90, 5), scoreSkill(100, 5), scoreSkill(110, 5), scoreSkill(120, 5)], { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 18000, maxExactDpStates: 120000 }],
    ["real-259-expert-continued-step1", "real-skill-state-expanded", 259, "expert", [scoreSkill(110, 5, "score_continued_note_judge"), scoreSkill(90, 5), scoreSkill(100, 5), scoreSkill(110, 5), scoreSkill(120, 5)], { stepFrames: 1, maxSearchDurationMs: 3000, maxExactCandidateEvents: 18000, maxExactDpStates: 120000 }],
    ["real-119-expert-score-step0_5", "real-fine-grid-expanded", 119, "expert", representativeScoreSkills(5), { stepFrames: 0.5, maxSearchDurationMs: 3000, maxExactCandidateEvents: 32000, maxExactDpStates: 120000 }],
  ].map(([name, category, songId, difficulty, skillSet, overrides]) => ({
    name, category, songId, difficulty, skillSet, overrides,
  }));
}

function profileOverrides(profile, overrides) {
  if (profile === "analysis30") {
    return { maxSearchDurationMs: 30000, maxExactCandidateEvents: Math.max(32000, overrides.maxExactCandidateEvents ?? 0), maxExactDpStates: Math.max(150000, overrides.maxExactDpStates ?? 0) };
  }
  if (profile === "offline") {
    return { maxSearchDurationMs: 120000, maxExactCandidateEvents: Math.max(32000, overrides.maxExactCandidateEvents ?? 0), maxExactDpStates: Math.max(200000, overrides.maxExactDpStates ?? 0) };
  }
  return {};
}

function buildOptions(testCase) {
  return {
    chart: testCase.chart,
    playLevel: testCase.playLevel,
    totalPower: 300000,
    skills: testCase.skillSet,
    leaderIndex: 0,
    fixedSkillOrder: [0, 1, 2, 3, 4],
    useFever: true,
    ...testCase.overrides,
    ...profileOverrides(testCase.profile, testCase.overrides),
  };
}

function runPriority(spec) {
  if (spec.overrides.stepFrames < 1) return 0;
  if (spec.name.includes("rate-up")) return 1;
  if (spec.category.includes("skill-state")) return 2;
  return 3;
}

function seededRandom(seed) {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function orderSpecs(specs, order, seed) {
  if (order === "original") return specs;
  if (order === "heavy-first") {
    return specs.map((spec, index) => ({ spec, index }))
      .sort((left, right) => runPriority(left.spec) - runPriority(right.spec) || left.index - right.index)
      .map((entry) => entry.spec);
  }
  const random = seededRandom(seed);
  return specs.map((spec, index) => ({ spec, index, value: random() }))
    .sort((left, right) => left.value - right.value || left.index - right.index)
    .map((entry) => entry.spec);
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : value;
}

async function resolveCase(spec, songsMetadata, profile, refresh) {
  const song = songsMetadata[String(spec.songId)];
  if (!song) throw new Error(`Missing song metadata for ${spec.songId}`);
  const chart = await getChart(spec.songId, spec.difficulty, refresh);
  const timeline = buildOptimizerTimeline(chart, true);
  return {
    ...spec,
    profile,
    chart,
    title: pickTitle(song),
    playLevel: getPlayLevel(song, spec.difficulty),
    noteCount: timeline.notes.length,
    skillTriggerCount: timeline.skillTriggerNoteIndexes.length,
  };
}

function runCase(testCase) {
  if (global.gc) global.gc();
  const options = buildOptions(testCase);
  const startedAt = performance.now();
  const result = optimizeBandoriSongScoreForFixedTeam(options);
  const elapsedMs = performance.now() - startedAt;
  return {
    name: testCase.name,
    category: testCase.category,
    songId: testCase.songId,
    title: testCase.title,
    difficulty: testCase.difficulty,
    playLevel: testCase.playLevel,
    noteCount: testCase.noteCount,
    skillTriggerCount: testCase.skillTriggerCount,
    options: {
      stepFrames: options.stepFrames,
      maxSearchDurationMs: options.maxSearchDurationMs,
      maxExactCandidateEvents: options.maxExactCandidateEvents,
      maxExactDpStates: options.maxExactDpStates,
      leaderIndex: options.leaderIndex,
      fixedSkillOrder: options.fixedSkillOrder,
    },
    elapsedMs: round(elapsedMs),
    searchMode: result.searchMode,
    score: result.score,
    scoreUpperBound: result.scoreUpperBound,
    upperBoundGap: Math.max(0, result.scoreUpperBound - result.score),
    pgSearchUpperBoundGap: Math.max(0, result.pgSearchUpperBound - result.score),
    lowJudgementUpperBoundGap: Math.max(0, result.lowJudgementUpperBound - result.score),
    movedNoteCount: result.movedNotes.length,
    proofStats: result.proofStats,
    proofBlockers: result.searchMode === "exact" ? [] : result.proofStats.boundedReasons,
  };
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function summarize(results) {
  const elapsed = results.map((result) => result.elapsedMs);
  return {
    caseCount: results.length,
    exactCount: results.filter((result) => result.searchMode === "exact").length,
    boundedCount: results.filter((result) => result.searchMode === "bounded").length,
    unsupportedCount: results.filter((result) => result.searchMode === "unsupported").length,
    elapsedMs: {
      p50: round(percentile(elapsed, 0.5)),
      p95: round(percentile(elapsed, 0.95)),
      max: round(Math.max(0, ...elapsed)),
    },
    maxDpStateCount: Math.max(0, ...results.map((result) => result.proofStats.maxDpStateCount)),
    maxCandidateEventCount: Math.max(0, ...results.map((result) => result.proofStats.maxCandidateEventCount)),
    slowest: [...results].sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 5).map((result) => ({
      name: result.name,
      elapsedMs: result.elapsedMs,
      searchMode: result.searchMode,
      gap: result.upperBoundGap,
      states: result.proofStats.maxDpStateCount,
      events: result.proofStats.maxCandidateEventCount,
      reasons: result.proofStats.boundedReasons,
    })),
  };
}

function timestampForFile(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function renderMarkdown(report) {
  const lines = [
    "# Bandori Song Optimizer Real-Chart Performance Report",
    "",
    `Generated at: ${report.generatedAt}`,
    `Profile: ${report.profile}`,
    `Order: ${report.order}`,
    `Seed: ${report.seed}`,
    "",
    "## Summary",
    "",
    `- Cases: ${report.summary.caseCount}`,
    `- Exact / bounded / unsupported: ${report.summary.exactCount} / ${report.summary.boundedCount} / ${report.summary.unsupportedCount}`,
    `- Elapsed P50 / P95 / max: ${report.summary.elapsedMs.p50}ms / ${report.summary.elapsedMs.p95}ms / ${report.summary.elapsedMs.max}ms`,
    `- Max DP states: ${report.summary.maxDpStateCount}`,
    `- Max candidate events: ${report.summary.maxCandidateEventCount}`,
    "",
    "## Cases",
    "",
    "| case | notes | mode | elapsed ms | gap | states | events | reasons |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |",
    ...report.results.map((result) => `| ${result.name} | ${result.noteCount} | ${result.searchMode} | ${result.elapsedMs} | ${result.upperBoundGap} | ${result.proofStats.maxDpStateCount} | ${result.proofStats.maxCandidateEventCount} | ${result.proofStats.boundedReasons.join(", ")} |`),
    "",
    "## Slowest",
    "",
    ...report.summary.slowest.map((result, index) => `${index + 1}. ${result.name}: ${result.elapsedMs}ms, ${result.searchMode}, gap=${result.gap}, states=${result.states}, events=${result.events}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv);
  const specs = createRealCaseSpecs();
  const filtered = args.caseFilter
    ? specs.filter((spec) => spec.name.includes(args.caseFilter) || String(spec.songId).includes(args.caseFilter))
    : specs;
  if (filtered.length === 0) throw new Error(`No performance cases matched filter: ${args.caseFilter}`);
  const ordered = orderSpecs(filtered, args.order, args.seed);
  const songsMetadata = await getSongsMetadata(args.refresh);
  const cases = [];
  for (const spec of ordered) {
    cases.push(await resolveCase(spec, songsMetadata, args.profile, args.refresh));
  }
  const results = cases.map((testCase) => {
    const result = runCase(testCase);
    console.log(`${result.name}: ${result.searchMode} ${result.elapsedMs}ms notes=${result.noteCount} gap=${result.upperBoundGap}`);
    return result;
  });
  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    profile: args.profile,
    order: args.order,
    seed: args.seed,
    argv: process.argv.slice(2),
    summary: summarize(results),
    results,
  };
  fs.mkdirSync(outputDir, { recursive: true });
  const baseName = timestampForFile(new Date(report.generatedAt));
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  const markdownPath = path.join(outputDir, `${baseName}.md`);
  writeJson(jsonPath, report);
  if (!args.jsonOnly) fs.writeFileSync(markdownPath, renderMarkdown(report));
  console.log(`report json: ${path.relative(repoRoot, jsonPath)}`);
  if (!args.jsonOnly) console.log(`report markdown: ${path.relative(repoRoot, markdownPath)}`);
  if (args.requireExact && report.summary.exactCount !== report.summary.caseCount) {
    throw new Error(`Expected all cases exact, got ${report.summary.exactCount}/${report.summary.caseCount}`);
  }
  if (args.maxElapsedMs !== null && report.summary.elapsedMs.max > args.maxElapsedMs) {
    throw new Error(`Expected max elapsed <= ${args.maxElapsedMs}ms, got ${report.summary.elapsedMs.max}ms`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
