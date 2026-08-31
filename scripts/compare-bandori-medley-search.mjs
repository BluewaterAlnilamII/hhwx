// Direct regression or current-search diagnosis: never replay or seed from old teams.
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { buildMedleySearchInput } from "../src/lib/bandori/medley-foundation/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_ROOT = join(REPO_ROOT, "temp/medley-regression-fixtures");
const CANDIDATE_BUDGET_BYTES = 256 * 1024 ** 2;
const PROCESS_LIMIT_BYTES = 1024 ** 3;
const { values } = parseArgs({ options: {
  remaining: { type: "boolean", default: false },
  six: { type: "boolean", default: false },
  diagnose: { type: "boolean", default: false },
} });
assert([values.remaining, values.six, values.diagnose].filter(Boolean).length <= 1, "choose one run mode");
const DURATION_MS = values.diagnose ? 60_000 : 300_000;
const continueAfterFailure = values.remaining || values.six || values.diagnose;
const CASES = (values.remaining ? [119, 961, 962, 972] : values.six || values.diagnose ? [119, 961] : [119]).flatMap((cardCount) => (
  (values.diagnose ? [null] : cardCount === 119 ? [null, 323] : [null, 244, 260, 323]).map((eventId) => ({
    id: `${cardCount}-${eventId === null ? "no-event" : `event-${eventId}`}`,
    cardCount, eventId, songIds: cardCount === 119 ? [295, 300, 703] : [385, 193, 619],
  }))
)).filter((testCase) => !values.remaining || testCase.id !== "119-no-event");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const manifest = JSON.parse(readFileSync(join(ARCHIVE_ROOT, "manifest.json"), "utf8"));
const usedFiles = new Map();

function readArchived(path) {
  const bytes = readFileSync(join(ARCHIVE_ROOT, path));
  const hash = sha256(bytes);
  assert.equal(hash, manifest.files.find((file) => file.path === path)?.sha256, `archive hash: ${path}`);
  usedFiles.set(path, { path, sha256: hash });
  return JSON.parse(bytes.toString("utf8"));
}

const snapshot = manifest.dataSnapshots.find((entry) => entry.id === "main");
const readAsset = (name) => readArchived(snapshot.assets.find((asset) => asset.name === name).path);
const source = {
  schemaVersion: "hhwx-medley-search-source-v1",
  cardsById: readAsset("cards-all-5.json"),
  charactersById: readAsset("characters-main-3.json"),
  skillsById: readAsset("skills-all-10.json"),
  areaItemsById: readAsset("areaItems-main-5.json"),
  songsById: readAsset("songs-all-7.json"),
  perfectRatePercentText: "100",
};

function readBaseline(testCase, profile) {
  if (testCase.cardCount === 119) {
    const suffix = `small-119-card-pool-295-300-703${testCase.eventId === null ? "" : "-event323"}-top1-60000ms.json`;
    const reference = manifest.references.find((entry) => entry.sourcePath.endsWith(suffix));
    const report = readArchived(reference.path);
    assert.deepEqual(report.inputs.songIds, testCase.songIds);
    assert.deepEqual(report.inputs.difficulties, ["expert", "expert", "expert"]);
    assert.equal(report.inputs.eventId, testCase.eventId);
    assert.equal(report.inputs.userCardCount, testCase.cardCount);
    return {
      reportPath: reference.path, scoreField: "topResult.averageScore",
      averageScore: report.topResult.averageScore,
      reportedExact: report.stats.isExhaustive, settings: report.inputs,
    };
  }
  const entry = manifest.results.find((row) => (
    row.profileSha256 === profile.payloadSha256 && row.sourceId === "main"
    && row.eventKey === String(testCase.eventId ?? "none") && /^rows\[\d+\]\.all$/u.test(row.resultPath)
  ));
  assert(entry, `missing full-scope historical result: ${testCase.id}`);
  assert.deepEqual(entry.songIds, testCase.songIds);
  assert.deepEqual(entry.difficulties, ["expert", "expert", "expert"]);
  assert.equal(entry.perfectRate, 1);
  const report = readArchived(entry.reportPath);
  const saved = report.rows[Number(entry.resultPath.match(/\d+/u)[0])].all;
  assert.equal(saved.score, entry.score);
  // This known scope-matrix formatter stored topResult.score, the primary
  // medley average, without retaining a separate averageScore field.
  return {
    reportPath: entry.reportPath, scoreField: `${entry.resultPath}.score`,
    averageScore: saved.score, reportedExact: entry.reportedExact,
    settings: { songIds: entry.songIds, difficulties: entry.difficulties, perfectRate: entry.perfectRate, eventId: testCase.eventId, reportScope: "all" },
  };
}

const cases = CASES.map((testCase) => {
  const profile = manifest.profiles.find((entry) => entry.aliases.includes(`sample-${testCase.cardCount}`));
  const baseline = readBaseline(testCase, profile);
  const event = testCase.eventId === null ? null : readAsset(`event-${testCase.eventId}.json`);
  const eventBonus = event === null ? null : {
    attributes: event.attributes, characters: event.characters,
    members: event.members, limitBreaks: event.limitBreaks,
    ...event.eventAttributeAndCharacterBonus,
  };
  const input = buildMedleySearchInput({
    ...source, profilePayload: readArchived(profile.path), eventBonus,
    songs: testCase.songIds.map((id) => ({
      songIdText: String(id), difficulty: "expert", chart: readAsset(`chart-${id}-expert.json`),
    })),
  });
  assert.equal(input.cards.length, testCase.cardCount);
  if (testCase.cardCount === 119) {
    assert.deepEqual(input.areaConfigurations.map((configuration) => configuration.selectedAreaItemIds), [
      [1, 6, 11, 16, 21], [5, 10, 15, 20, 25, 30, 35],
    ]);
  }
  assert(Number.isFinite(baseline.averageScore));
  return { ...testCase, input, baseline, profilePayloadSha256: profile.payloadSha256 };
});

const runDirectory = join(ARCHIVE_ROOT, "runs", new Date().toISOString().replaceAll(":", "-"));
mkdirSync(runDirectory, { recursive: true });
const metadata = {
  mode: values.diagnose ? "current-search-diagnosis" : "historical-score-comparison",
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim(),
  sourceChanges: execFileSync("git", ["status", "--short"], { cwd: REPO_ROOT, encoding: "utf8" }).trim(),
  runtime: { node: process.version, rust: execFileSync("rustc", ["--version"], { encoding: "utf8" }).trim(), cpu: cpus()[0]?.model },
  limits: { durationMs: DURATION_MS, candidateBudgetBytes: CANDIDATE_BUDGET_BYTES, processLimitBytes: PROCESS_LIMIT_BYTES },
  dataSnapshot: snapshot.id, files: [...usedFiles.values()], continueAfterFailure,
  historicalLimitations: "Historical reports omit per-run data hashes; the 119-card reports also omit PERFECT rate. This run explicitly uses full PERFECT and the retained main-directory cache.",
  ...(values.diagnose ? {
    timingMeasurement: "Exclusive wall-clock phases in the native test build, including instrumentation overhead. Production search has no timers. Saved historical scores are compared only after search; no old solver or team replay is run.",
  } : {}),
  memoryMeasurement: "Windows native process PeakWorkingSet64 sampled every second; excludes input preparation and is not browser/WASM incremental memory. The last interval before exit may be missed.",
  storageAccounting: "candidateBudgetBytes retains its archive field name; the budget covers rows/indexes, score cache, joint workspace reservations and live conditional tables. peakSearchStorageBytes includes conservative workspace reservations, not a sampled heap total.",
  cases: cases.map(({ id, cardCount, eventId, input, baseline, profilePayloadSha256 }) => {
    const inputPath = join(runDirectory, `${id}.input.json`);
    writeJson(inputPath, input);
    return { id, cardCount, eventId, baseline, profilePayloadSha256, areaConfigurations: input.areaConfigurations.length, inputSha256: sha256(readFileSync(inputPath)) };
  }),
};
writeJson(join(runDirectory, "run.json"), metadata);
console.log(`Retaining ${metadata.mode} in ${runDirectory}`);

const buildArguments = values.diagnose
  ? ["test", "--release", "--locked", "-p", "bandori-medley-search", "--lib", "--no-run", "--message-format=json"]
  : ["build", "--release", "--locked", "-p", "bandori-medley-search", "--example", "run_search"];
const build = spawnSync("cargo", buildArguments, {
  cwd: REPO_ROOT, stdio: values.diagnose ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8", windowsHide: true,
});
if (build.error) throw build.error;
assert.equal(build.status, 0, "native release build failed");
const executable = values.diagnose
  ? build.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)).find((entry) => (
    entry.reason === "compiler-artifact" && entry.target.name === "bandori_medley_search" && entry.profile.test
  ))?.executable
  : join(REPO_ROOT, "target/release/examples", process.platform === "win32" ? "run_search.exe" : "run_search");
assert(executable, "native diagnostic test executable is missing");

function runNative(id) {
  return new Promise((resolveRun, reject) => {
    const started = performance.now();
    const inputPath = join(runDirectory, `${id}.input.json`);
    const nativeArguments = values.diagnose
      ? ["search::tests::profile_real_roster_search", "--exact", "--ignored", "--nocapture", "--test-threads=1"]
      : [inputPath, String(DURATION_MS), String(CANDIDATE_BUDGET_BYTES)];
    const child = spawn(executable, nativeArguments, {
      windowsHide: true,
      env: {
        ...process.env,
        ...(values.diagnose ? {
          HHWX_MEDLEY_DIAGNOSTIC_INPUT: inputPath,
          HHWX_MEDLEY_DIAGNOSTIC_DURATION_MS: String(DURATION_MS),
          HHWX_MEDLEY_DIAGNOSTIC_BUDGET_BYTES: String(CANDIDATE_BUDGET_BYTES),
        } : {}),
      },
    });
    let stdout = "", stderr = "", peakWorkingSetBytes = null, memorySamples = 0;
    let forcedStop = null, isSampling = false;
    const stop = (reason) => { forcedStop ??= reason; child.kill(); };
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    const memoryTimer = setInterval(() => {
      if (process.platform !== "win32" || isSampling || child.exitCode !== null || child.killed) return;
      isSampling = true;
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty PeakWorkingSet64`], { windowsHide: true, timeout: 3000 }, (error, output) => {
        isSampling = false;
        const bytes = Number(output.trim());
        if (error || !Number.isFinite(bytes) || bytes <= 0) return;
        peakWorkingSetBytes = Math.max(peakWorkingSetBytes ?? 0, bytes);
        memorySamples += 1;
        if (bytes >= PROCESS_LIMIT_BYTES) stop("process_memory_limit");
      });
    }, 1000);
    const deadline = setTimeout(() => stop("outer_deadline"), DURATION_MS + 15_000);
    const progress = setInterval(() => console.log(`${id}: ${Math.round((performance.now() - started) / 1000)}s, observed native peak ${peakWorkingSetBytes === null ? "unavailable" : `${(peakWorkingSetBytes / 1024 ** 2).toFixed(1)} MiB`}`), 30_000);
    const cleanup = () => { clearInterval(memoryTimer); clearInterval(progress); clearTimeout(deadline); };
    child.once("error", (error) => { cleanup(); reject(error); });
    child.once("close", (exitCode, signal) => {
      cleanup();
      writeFileSync(join(runDirectory, `${id}.stdout.${values.diagnose ? "log" : "json"}`), stdout);
      writeFileSync(join(runDirectory, `${id}.stderr.log`), stderr);
      const marker = "MEDLEY_SEARCH_PROFILE:";
      const profileLine = values.diagnose ? stdout.split(/\r?\n/u).find((line) => line.includes(marker)) : null;
      const nativeOutput = values.diagnose ? profileLine?.slice(profileLine.indexOf(marker) + marker.length) : stdout;
      resolveRun({ exitCode, signal, forcedStop, elapsedMs: performance.now() - started, peakWorkingSetBytes, memorySamples, native: exitCode === 0 ? JSON.parse(nativeOutput) : null });
    });
  });
}

const results = [];
for (const { id, cardCount, input, baseline } of cases) {
  console.log(`${id}: starting full ${cardCount}-card search, ${input.areaConfigurations.length} area configurations; historical average ${baseline.averageScore}`);
  const execution = await runNative(id);
  const outcome = execution.native?.outcome;
  const solution = outcome?.status === "exact" ? outcome.best : outcome?.bestSoFar;
  const averageScore = solution?.totalAverageScore ?? null;
  const scoreAtLeastHistorical = averageScore === null ? null : averageScore >= baseline.averageScore;
  const passed = outcome?.status === "exact" && solution !== null && scoreAtLeastHistorical === true && execution.forcedStop === null;
  const diagnosticCompleted = execution.exitCode === 0 && execution.forcedStop === null
    && (outcome?.status === "exact" || (outcome?.status === "incomplete" && outcome.reason === "timed_out"));
  const comparison = {
    baseline, delta: averageScore === null ? null : averageScore - baseline.averageScore, scoreAtLeastHistorical, passed,
    ...(values.diagnose ? { diagnosticCompleted } : {}),
  };
  const result = { id, ...execution, averageScore, ...comparison };
  results.push(result);
  writeJson(join(runDirectory, `${id}.result.json`), result);
  writeJson(join(runDirectory, "summary.json"), { results, skipped: cases.slice(results.length).map(({ id: remaining }) => remaining) });
  console.log(JSON.stringify({
    id, status: outcome?.status ?? "process_failed", reason: outcome?.reason ?? execution.forcedStop, averageScore,
    delta: result.delta, passed, ...(values.diagnose ? { diagnosticCompleted } : {}),
  }));
  if (!(values.diagnose ? diagnosticCompleted : passed)) {
    process.exitCode = 1;
    if (!continueAfterFailure) break;
  }
}
