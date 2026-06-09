const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "../..");
const benchmarkScript = path.join(__dirname, "benchmark-real-profiles-medley.cjs");
const fixturePath = process.env.HHWX_ISOLATED_FIXTURE_PATH
  ?? "temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json";
const labels = (process.env.HHWX_ISOLATED_PROFILE_LABELS ?? "P01,P02,P03,P04,P05,P06,P07,P08,P09,P10")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const events = (process.env.HHWX_ISOLATED_EVENT_KEYS ?? "none,244,260,323")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const explicitCases = (process.env.HHWX_ISOLATED_CASES ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    const [label, eventKey] = value.split(":").map((part) => part.trim());
    if (!label || !eventKey) {
      throw new Error(`Invalid HHWX_ISOLATED_CASES entry: ${value}`);
    }
    return { label, eventKey };
  });
const durationMs = Number(process.env.HHWX_ISOLATED_DURATION_MS ?? 300000);
const nodeOptions = process.env.HHWX_ISOLATED_NODE_OPTIONS ?? "--max-old-space-size=8192";
const nodeArgs = (process.env.HHWX_ISOLATED_NODE_ARGS ?? "")
  .split(/\s+/)
  .map((value) => value.trim())
  .filter(Boolean);
const optimizationJson = process.env.HHWX_REAL_PROFILE_OPTIMIZATION_JSON;
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const runId = process.env.HHWX_ISOLATED_RUN_ID ?? `2026-06-08-p01-p10-40exact-isolated-${runStamp}`;
const logDir = path.join(__dirname, "logs", `medley-40-exact-isolated-${runStamp}`);
const outPath = path.join(__dirname, `medley-40-exact-isolated-${runStamp}.json`);
const partialPath = path.join(__dirname, `medley-40-exact-isolated-${runStamp}-partial.json`);

fs.mkdirSync(logDir, { recursive: true });

function percentile(values, p) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarize(rows) {
  const elapsed = rows
    .map((row) => row.all?.elapsedMs)
    .filter((value) => Number.isFinite(value));
  const boundedRows = rows.filter((row) => row.all && !row.all.exact);
  const boundedGaps = boundedRows
    .map((row) => row.all.observedScoreUpperBoundGap)
    .filter((value) => Number.isFinite(value));
  const peakHeaps = rows
    .map((row) => row.all?.peakUsedHeapMiB)
    .filter((value) => Number.isFinite(value));
  return {
    caseCount: rows.length,
    exactCount: rows.filter((row) => row.all?.exact === true).length,
    boundedCount: boundedRows.length,
    failedCount: rows.filter((row) => row.failed).length,
    timedOutCount: rows.filter((row) => row.all?.timedOut === true).length,
    memoryLimitedCount: rows.filter((row) => row.all?.memoryLimited === true).length,
    boundedGapTotal: boundedGaps.reduce((sum, value) => sum + value, 0),
    medianElapsedMs: percentile(elapsed, 50),
    p95ElapsedMs: percentile(elapsed, 95),
    maxElapsedMs: elapsed.length > 0 ? Math.max(...elapsed) : null,
    peakUsedHeapMiB: peakHeaps.length > 0 ? Math.max(...peakHeaps) : null,
  };
}

function buildReport(rows) {
  return {
    generatedAt: new Date().toISOString(),
    runId,
    variant: "baselineCleanIsolatedProcessPerCase",
    fixturePath,
    durationMs,
    labels,
    events,
    nodeOptions,
    nodeArgs,
    command: ["node", ...nodeArgs, path.relative(repoRoot, benchmarkScript)].join(" "),
    env: {
      HHWX_REAL_PROFILE_FIXTURE_PATH: fixturePath,
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_EVENT_KEYS: "<per-case>",
      HHWX_REAL_PROFILE_DURATION_MS: String(durationMs),
      HHWX_REAL_PROFILE_SAMPLE_COUNT: "10",
      HHWX_REAL_PROFILE_SONG_IDS: "385,193,619",
      HHWX_REAL_PROFILE_LABELS: "<per-case>",
      HHWX_REAL_PROFILE_BENCHMARK_SEED: runId,
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: optimizationJson ?? undefined,
      NODE_OPTIONS: nodeOptions,
      HHWX_ISOLATED_NODE_ARGS: nodeArgs.join(" "),
    },
    summary: summarize(rows),
    rows,
  };
}

function writeReport(rows, final = false) {
  const report = buildReport(rows);
  fs.writeFileSync(final ? outPath : partialPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(__dirname, "last-medley-40-exact-isolated.json"), JSON.stringify(report, null, 2), "utf8");
  return report;
}

function parseFinalJsonPath(stdout) {
  const matches = [...stdout.matchAll(/"jsonPath"\s*:\s*"([^"]+)"/g)];
  if (matches.length === 0) {
    return null;
  }
  return matches[matches.length - 1][1].replace(/\\\\/g, "\\");
}

function runCase(label, eventKey) {
  const caseId = `${label}-${eventKey}`;
  const stdoutPath = path.join(logDir, `${caseId}.stdout.log`);
  const stderrPath = path.join(logDir, `${caseId}.stderr.log`);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const env = {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    HHWX_REAL_PROFILE_FIXTURE_PATH: fixturePath,
    HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
    HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
    HHWX_REAL_PROFILE_EVENT_KEYS: eventKey,
    HHWX_REAL_PROFILE_DURATION_MS: String(durationMs),
    HHWX_REAL_PROFILE_SAMPLE_COUNT: "10",
    HHWX_REAL_PROFILE_SONG_IDS: "385,193,619",
    HHWX_REAL_PROFILE_LABELS: label,
    HHWX_REAL_PROFILE_BENCHMARK_SEED: runId,
  };
  if (optimizationJson !== undefined) {
    env.HHWX_REAL_PROFILE_OPTIMIZATION_JSON = optimizationJson;
  } else {
    delete env.HHWX_REAL_PROFILE_OPTIMIZATION_JSON;
  }

  const child = spawnSync(process.execPath, [...nodeArgs, benchmarkScript], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: durationMs + 90000,
  });
  const endedAt = new Date().toISOString();
  const processWallElapsedMs = Date.now() - started;
  fs.writeFileSync(stdoutPath, child.stdout ?? "", "utf8");
  fs.writeFileSync(stderrPath, child.stderr ?? "", "utf8");

  const base = {
    profile: { label },
    eventKey,
    startedAt,
    endedAt,
    processWallElapsedMs,
    stdoutPath,
    stderrPath,
    exitCode: child.status,
    signal: child.signal,
  };
  if (child.error || child.status !== 0) {
    return {
      ...base,
      failed: true,
      error: child.error ? String(child.error.stack ?? child.error.message ?? child.error) : null,
      stderrTail: (child.stderr ?? "").slice(-4000),
      stdoutTail: (child.stdout ?? "").slice(-4000),
    };
  }

  const jsonPath = parseFinalJsonPath(child.stdout ?? "");
  if (!jsonPath || !fs.existsSync(jsonPath)) {
    return {
      ...base,
      failed: true,
      error: "Could not locate case matrix jsonPath in stdout",
      stdoutTail: (child.stdout ?? "").slice(-4000),
    };
  }
  const caseReport = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const row = caseReport.rows?.[0];
  if (!row) {
    return {
      ...base,
      failed: true,
      error: `No row in ${jsonPath}`,
    };
  }
  return {
    ...row,
    isolated: {
      startedAt,
      endedAt,
      processWallElapsedMs,
      jsonPath,
      stdoutPath,
      stderrPath,
      exitCode: child.status,
      signal: child.signal,
    },
  };
}

const rows = [];
const cases = explicitCases.length > 0
  ? explicitCases
  : labels.flatMap((label) => events.map((eventKey) => ({ label, eventKey })));
for (const { label, eventKey } of cases) {
  process.stdout.write(`isolated start ${label}:${eventKey}\n`);
  const row = runCase(label, eventKey);
  rows.push(row);
  const report = writeReport(rows, false);
  const all = row.all ?? {};
  process.stdout.write(
    `isolated done ${label}:${eventKey} exact=${all.exact ?? false} ms=${all.elapsedMs ?? ""} `
    + `gap=${all.observedScoreUpperBoundGap ?? ""} timedOut=${all.timedOut ?? ""} `
    + `memoryLimited=${all.memoryLimited ?? ""} peakMiB=${all.peakUsedHeapMiB ?? ""} `
    + `summary=${report.summary.exactCount}/${report.summary.caseCount}\n`,
  );
}

const finalReport = writeReport(rows, true);
process.stdout.write(JSON.stringify({
  outPath,
  partialPath,
  logDir,
  summary: finalReport.summary,
}, null, 2));
process.stdout.write("\n");
