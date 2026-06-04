#!/usr/bin/env node

let fs;
let path;
let spawn;
let spawnSync;
let repoRoot;
let defaultRunnerPath;
let defaultFixturePath;
let benchmarkDir;
let baseEnv;
let cleanBaseEnv;

const expectedProfileIdentities20260602 = [
  { label: "P01", cardCount: 1161, profileHash: "04eade1b0884" },
  { label: "P02", cardCount: 1747, profileHash: "95cfb075da58" },
  { label: "P03", cardCount: 1211, profileHash: "83a95dcc90c6" },
  { label: "P04", cardCount: 1229, profileHash: "ba51d3283cf7" },
  { label: "P05", cardCount: 1036, profileHash: "26285f7f1b36" },
  { label: "P06", cardCount: 1433, profileHash: "ea4686707f70" },
  { label: "P07", cardCount: 1703, profileHash: "440f106f6740" },
  { label: "P08", cardCount: 1513, profileHash: "96a1a1bd4e09" },
  { label: "P09", cardCount: 962, profileHash: "53d1017c73a9" },
  { label: "P10", cardCount: 1127, profileHash: "d33da319c911" },
];

const expectedProfileIdentityByLabel = new Map(
  expectedProfileIdentities20260602.map((profile) => [profile.label, profile]),
);

const medleyAllScopeEventKeys20260602 = ["none", "244", "260", "323"];

function makeAllScopeCases(profileLabels, eventKeys = medleyAllScopeEventKeys20260602) {
  return profileLabels.flatMap((profileLabel) => (
    eventKeys.map((eventKey) => ({ profileLabel, eventKey }))
  ));
}

const scenarios = {
  "gate-120": {
    description: "Composite gate: all-300 plus known locked/single hard cases at 120s.",
    scenarios: [
      "all-300",
      "p01-locked",
      "p01-visual",
      "p01-performance",
      "p01-technique",
      "p05-visual",
      "p09-visual",
    ],
  },
  "all-300": {
    description: "P01-P10 x none/244/260/323 all-mode proof, 300s per case.",
    reportKind: "matrix",
    expectedProfileCount: 40,
    baselineAllExactCount: 36,
    baselineBoundedGapTotal: 1534986,
    maxP95ElapsedMs: 231981,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_EVENT_KEYS: "none,244,260,323",
    },
  },
  "all-40-focus-300": {
    description: "P01-P10 x none/244/260/323 all-scope record-only run, one process per case, 300s per case.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
    },
    cases: makeAllScopeCases(expectedProfileIdentities20260602.map((profile) => profile.label)),
  },
  "p02-p07-no-proof-skips-300": {
    description: "Ablation for P02/P07 all-scope regressions with bounded proof shortcuts disabled, 300s per case.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true,\"disableDominatedRootSkip\":true,\"disableAllScopeExactJoinPreSkip\":true,\"disableNearDeadlineRootSkip\":true,\"disableSkipDfsAfterUnprovedExactCandidateJoin\":true}",
    },
    cases: makeAllScopeCases(["P02", "P07"]),
  },
  "p02-p07-no-pre-skip-300": {
    description: "Ablation for P02/P07 all-scope regressions with exact-join pre-skip disabled, 300s per case.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true,\"disableAllScopeExactJoinPreSkip\":true}",
    },
    cases: makeAllScopeCases(["P02", "P07"]),
  },
  "p02-p07-default-300": {
    description: "Default-path validation for P02/P07 all-scope regression cases, 300s per case.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
    },
    cases: makeAllScopeCases(["P02", "P07"]),
  },
  "focus-6-300": {
    description: "Six focused all-scope cases at 300s with memory monitoring.",
    reportKind: "focus",
    maxElapsedMs: 300000,
    baselineBoundedGapTotal: 1534986,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true}",
    },
    cases: [
      { profileLabel: "P02", eventKey: "260", baselineExact: false, baselineGap: 384110 },
      { profileLabel: "P04", eventKey: "260", baselineExact: false, baselineGap: 164392 },
      { profileLabel: "P08", eventKey: "323", baselineExact: false, baselineGap: 431957 },
      { profileLabel: "P10", eventKey: "244", baselineExact: false, baselineGap: 554527 },
      { profileLabel: "P04", eventKey: "244", baselineExact: true, baselineElapsedMs: 231981 },
      { profileLabel: "P08", eventKey: "260", baselineExact: true, baselineElapsedMs: 295714 },
    ],
  },
  "bounded-3-trace-300": {
    description: "Trace three bounded non-OOM all-scope cases at 300s.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true}",
    },
    cases: [
      { profileLabel: "P08", eventKey: "323" },
      { profileLabel: "P10", eventKey: "244" },
      { profileLabel: "P08", eventKey: "260" },
    ],
  },
  "p02-260-trace-300": {
    description: "Trace P02:260 all-scope at 300s.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true}",
    },
    cases: [
      { profileLabel: "P02", eventKey: "260" },
    ],
  },
  "p04-260-trace-300": {
    description: "Trace P04:260 all-scope at 300s.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true}",
    },
    cases: [
      { profileLabel: "P04", eventKey: "260" },
    ],
  },
  "p04-oom-2-trace-300": {
    description: "Trace P04:244/260 all-scope OOM candidates at 300s.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true}",
    },
    cases: [
      { profileLabel: "P04", eventKey: "244" },
      { profileLabel: "P04", eventKey: "260" },
    ],
  },
  "bounded-2-fill-trace-300": {
    description: "Trace two candidate-fill bounded all-scope cases at 300s.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true}",
    },
    cases: [
      { profileLabel: "P08", eventKey: "323" },
      { profileLabel: "P10", eventKey: "244" },
    ],
  },
  "bounded-2-soft600-trace-300": {
    description: "Trace two candidate-fill bounded all-scope cases at 300s with a 600k exact candidate soft limit.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true,\"exactCandidateSoftLimit\":600000}",
    },
    cases: [
      { profileLabel: "P08", eventKey: "323" },
      { profileLabel: "P10", eventKey: "244" },
    ],
  },
  "bounded-2-soft520-trace-300": {
    description: "Trace two candidate-fill bounded all-scope cases at 300s with a 520k exact candidate soft limit.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true,\"exactCandidateSoftLimit\":520000}",
    },
    cases: [
      { profileLabel: "P08", eventKey: "323" },
      { profileLabel: "P10", eventKey: "244" },
    ],
  },
  "p10-244-soft800-trace-300": {
    description: "Trace P10:244 at 300s with an 800k exact candidate soft limit.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true,\"exactCandidateSoftLimit\":800000}",
    },
    cases: [
      { profileLabel: "P10", eventKey: "244" },
    ],
  },
  "p08-260-trace-300": {
    description: "Trace P08:260 all-scope at 300s.",
    reportKind: "focus",
    recordOnly: true,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true}",
    },
    cases: [
      { profileLabel: "P08", eventKey: "260" },
    ],
  },
  "p05-p09-300": {
    description: "P05/P09 fast-profile regression check across none/244/260/323 at 300s.",
    reportKind: "focus",
    maxElapsedMs: 300000,
    baselineExactElapsedRegressionRatio: 2,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
      HHWX_REAL_PROFILE_DURATION_MS: "300000",
    },
    cases: [
      { profileLabel: "P05", eventKey: "none", baselineExact: true, baselineElapsedMs: 21096 },
      { profileLabel: "P05", eventKey: "244", baselineExact: true, baselineElapsedMs: 21924 },
      { profileLabel: "P05", eventKey: "260", baselineExact: true, baselineElapsedMs: 21211 },
      { profileLabel: "P05", eventKey: "323", baselineExact: true, baselineElapsedMs: 32686 },
      { profileLabel: "P09", eventKey: "none", baselineExact: true, baselineElapsedMs: 18532 },
      { profileLabel: "P09", eventKey: "244", baselineExact: true, baselineElapsedMs: 21517 },
      { profileLabel: "P09", eventKey: "260", baselineExact: true, baselineElapsedMs: 19772 },
      { profileLabel: "P09", eventKey: "323", baselineExact: true, baselineElapsedMs: 19399 },
    ],
  },
  "p01-locked": {
    description: "Known hard locked band/attribute scope: P01 PoppinParty/cool.",
    reportKind: "single",
    expectedTotal: 1,
    maxElapsedMs: 120000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "0",
      HHWX_REAL_PROFILE_LABELS: "P01",
      HHWX_REAL_PROFILE_COARSE_MODE: "locked",
      HHWX_REAL_PROFILE_COARSE_BAND: "PoppinParty",
      HHWX_REAL_PROFILE_COARSE_ATTRIBUTE: "cool",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true}",
    },
  },
  "p01-visual": {
    description: "Single locked configuration: P01 PoppinParty/cool/visual.",
    reportKind: "single",
    expectedTotal: 1,
    maxElapsedMs: 120000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "0",
      HHWX_REAL_PROFILE_LABELS: "P01",
      HHWX_REAL_PROFILE_COARSE_MODE: "locked",
      HHWX_REAL_PROFILE_COARSE_BAND: "PoppinParty",
      HHWX_REAL_PROFILE_COARSE_ATTRIBUTE: "cool",
      HHWX_REAL_PROFILE_COARSE_PARAMETER: "visual",
    },
  },
  "p01-performance": {
    description: "Single locked configuration: P01 PoppinParty/cool/performance.",
    reportKind: "single",
    expectedTotal: 1,
    maxElapsedMs: 120000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "0",
      HHWX_REAL_PROFILE_LABELS: "P01",
      HHWX_REAL_PROFILE_COARSE_MODE: "locked",
      HHWX_REAL_PROFILE_COARSE_BAND: "PoppinParty",
      HHWX_REAL_PROFILE_COARSE_ATTRIBUTE: "cool",
      HHWX_REAL_PROFILE_COARSE_PARAMETER: "performance",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true}",
    },
  },
  "p01-technique": {
    description: "Single locked configuration: P01 PoppinParty/cool/technique.",
    reportKind: "single",
    expectedTotal: 1,
    maxElapsedMs: 120000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "0",
      HHWX_REAL_PROFILE_LABELS: "P01",
      HHWX_REAL_PROFILE_COARSE_MODE: "locked",
      HHWX_REAL_PROFILE_COARSE_BAND: "PoppinParty",
      HHWX_REAL_PROFILE_COARSE_ATTRIBUTE: "cool",
      HHWX_REAL_PROFILE_COARSE_PARAMETER: "technique",
      HHWX_REAL_PROFILE_OPTIMIZATION_JSON: "{\"debugConfigurationTrace\":true}",
    },
  },
  "p05-visual": {
    description: "Single locked configuration: P05 PoppinParty/powerful/visual.",
    reportKind: "single",
    expectedTotal: 1,
    maxElapsedMs: 120000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "0",
      HHWX_REAL_PROFILE_LABELS: "P05",
      HHWX_REAL_PROFILE_COARSE_MODE: "locked",
      HHWX_REAL_PROFILE_COARSE_BAND: "PoppinParty",
      HHWX_REAL_PROFILE_COARSE_ATTRIBUTE: "powerful",
      HHWX_REAL_PROFILE_COARSE_PARAMETER: "visual",
    },
  },
  "p09-visual": {
    description: "Single locked configuration: P09 Morfonica/pure/visual.",
    reportKind: "single",
    expectedTotal: 1,
    maxElapsedMs: 120000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "0",
      HHWX_REAL_PROFILE_LABELS: "P09",
      HHWX_REAL_PROFILE_COARSE_MODE: "locked",
      HHWX_REAL_PROFILE_COARSE_BAND: "Morfonica",
      HHWX_REAL_PROFILE_COARSE_ATTRIBUTE: "pure",
      HHWX_REAL_PROFILE_COARSE_PARAMETER: "visual",
    },
  },
};

function printUsage() {
  console.log("Usage: node scripts/bandori-medley-hard-case-benchmark.cjs <scenario>");
  console.log("");
  console.log("Scenarios:");
  for (const [name, scenario] of Object.entries(scenarios)) {
    console.log(`  ${name.padEnd(16)} ${scenario.description}`);
  }
  console.log("");
  console.log("Required local files:");
  console.log(`  ${path.relative(repoRoot, defaultRunnerPath)}`);
  console.log(`  ${path.relative(repoRoot, defaultFixturePath)}`);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sampleProcessMemoryBytes(pid) {
  if (!pid) {
    return null;
  }
  try {
    if (process.platform === "win32") {
      const result = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { [Console]::Write($p.WorkingSet64) }`,
        ],
        { encoding: "utf8", windowsHide: true },
      );
      const value = Number(String(result.stdout ?? "").trim());
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    const result = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" });
    const rssKb = Number(String(result.stdout ?? "").trim());
    return Number.isFinite(rssKb) && rssKb > 0 ? rssKb * 1024 : null;
  } catch {
    return null;
  }
}

function formatMiB(bytes) {
  return Number.isFinite(bytes) ? (bytes / 1024 / 1024).toFixed(1) : "";
}

function formatSeconds(ms) {
  return Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : "";
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function formatProfileIdentity(profile) {
  if (!profile) {
    return "missing";
  }
  return `${profile.label ?? "?"}:${profile.cardCount ?? "?"}:${profile.profileHash ?? "?"}`;
}

function isRunnerTimeoutResult(result) {
  if (!result?.failed) {
    return false;
  }
  return /timeout/i.test(String(result.failureReason ?? ""));
}

function assertProfileIdentity(context, profile) {
  const expected = expectedProfileIdentityByLabel.get(profile?.label);
  if (!expected) {
    throw new Error(`${context}: unexpected profile identity ${formatProfileIdentity(profile)}`);
  }
  if (profile.profileHash !== expected.profileHash || profile.cardCount !== expected.cardCount) {
    throw new Error(
      `${context}: profile ${profile.label} identity drifted, `
      + `expected ${expected.cardCount}:${expected.profileHash}, `
      + `got ${profile.cardCount}:${profile.profileHash}`,
    );
  }
}

function assertReportProfileIdentities(context, rows) {
  for (const row of rows ?? []) {
    assertProfileIdentity(context, row.profile);
  }
}

function runRunner(env, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [defaultRunnerPath], {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    });
    const memory = {
      sampleCount: 0,
      peakWorkingSetBytes: null,
      lastWorkingSetBytes: null,
    };
    const sample = () => {
      const bytes = sampleProcessMemoryBytes(child.pid);
      if (bytes === null) {
        return;
      }
      memory.sampleCount += 1;
      memory.lastWorkingSetBytes = bytes;
      memory.peakWorkingSetBytes = Math.max(memory.peakWorkingSetBytes ?? 0, bytes);
    };
    const sampleMs = 1000;
    const interval = setInterval(sample, sampleMs);
    child.once("spawn", sample);
    child.once("error", (error) => {
      clearInterval(interval);
      reject(error);
    });
    child.once("exit", (status, signal) => {
      clearInterval(interval);
      sample();
      console.log(
        `memory ${label}: peakWorkingSet=${formatMiB(memory.peakWorkingSetBytes)} MiB samples=${memory.sampleCount}`,
      );
      resolve({ status: status ?? 1, signal, memory });
    });
  });
}

function assertSingleReport(scenarioName, scenario) {
  const reportPath = path.join(benchmarkDir, "last-real-profile-medley-benchmark.json");
  const report = loadJson(reportPath);
  assertReportProfileIdentities(scenarioName, report.rows);
  const total = report.summary?.total;
  const exactWithinDuration = report.summary?.exactWithinDuration;
  const maxElapsedMs = Math.max(...(report.rows ?? []).map((row) => (
    row.resultFixed?.elapsedMs
    ?? row.result120?.elapsedMs
    ?? row.result60?.elapsedMs
    ?? Number.POSITIVE_INFINITY
  )));
  const exactWithinThreshold = (report.rows ?? []).every((row) => {
    const result = row.resultFixed ?? row.result120 ?? row.result60;
    return Boolean(result?.exact) && (result.elapsedMs ?? Number.POSITIVE_INFINITY) <= scenario.maxElapsedMs;
  });

  if (total !== scenario.expectedTotal) {
    throw new Error(`${scenarioName}: expected ${scenario.expectedTotal} cases, got ${total}`);
  }
  if (exactWithinDuration !== scenario.expectedTotal) {
    throw new Error(`${scenarioName}: not all cases were exact within duration`);
  }
  if (!exactWithinThreshold) {
    throw new Error(`${scenarioName}: exact elapsed ${maxElapsedMs}ms exceeded ${scenario.maxElapsedMs}ms`);
  }
  console.log(`assert ${scenarioName}: exact ${total}/${scenario.expectedTotal}, max ${maxElapsedMs}ms <= ${scenario.maxElapsedMs}ms`);
}

function assertMatrixReport(scenarioName, scenario) {
  const reportPath = path.join(benchmarkDir, "last-real-profile-medley-scope-matrix.json");
  const report = loadJson(reportPath);
  const profileCount = report.summary?.profileCount;
  const caseCount = report.summary?.caseCount ?? profileCount;
  const allExactCount = report.summary?.allExactCount;
  const allP95ElapsedMs = report.summary?.allP95ElapsedMs ?? Number.POSITIVE_INFINITY;
  const maxElapsedMs = report.summary?.allMaxElapsedMs ?? Number.POSITIVE_INFINITY;
  const rows = report.rows ?? [];
  assertReportProfileIdentities(scenarioName, rows);
  const timedOutCount = rows.filter((row) => isRunnerTimeoutResult(row.all)).length;
  const boundedGapTotal = rows.reduce((sum, row) => {
    if (row.all?.exact) {
      return sum;
    }
    const gap = row.all?.observedScoreUpperBoundGap;
    return Number.isFinite(gap) ? sum + gap : Number.POSITIVE_INFINITY;
  }, 0);
  if (caseCount !== scenario.expectedProfileCount) {
    throw new Error(`${scenarioName}: expected ${scenario.expectedProfileCount} cases, got ${caseCount}`);
  }
  if (timedOutCount > 0) {
    throw new Error(`${scenarioName}: ${timedOutCount} all-mode case(s) timed out`);
  }
  if (scenario.baselineAllExactCount !== undefined) {
    const exactImproved = allExactCount > scenario.baselineAllExactCount;
    const gapImproved = (
      Number.isFinite(boundedGapTotal)
      && Number.isFinite(scenario.baselineBoundedGapTotal)
      && boundedGapTotal <= scenario.baselineBoundedGapTotal * 0.75
    );
    if (!exactImproved && !gapImproved) {
      throw new Error(`${scenarioName}: all-mode exact ${allExactCount}/${caseCount}, gap ${boundedGapTotal} did not beat baseline`);
    }
  } else if (allExactCount !== scenario.expectedProfileCount) {
    throw new Error(`${scenarioName}: all-mode exact ${allExactCount}/${scenario.expectedProfileCount}`);
  }
  if (scenario.maxP95ElapsedMs !== undefined && allP95ElapsedMs > scenario.maxP95ElapsedMs) {
    throw new Error(`${scenarioName}: all-mode P95 ${allP95ElapsedMs}ms exceeded ${scenario.maxP95ElapsedMs}ms`);
  }
  if (maxElapsedMs > scenario.maxElapsedMs) {
    throw new Error(`${scenarioName}: all-mode max ${maxElapsedMs}ms exceeded ${scenario.maxElapsedMs}ms`);
  }
  console.log(
    `assert ${scenarioName}: all exact ${allExactCount}/${caseCount}, `
    + `gap=${Number.isFinite(boundedGapTotal) ? boundedGapTotal : "unknown"}, `
    + `p95=${allP95ElapsedMs}ms, max ${maxElapsedMs}ms <= ${scenario.maxElapsedMs}ms`,
  );
}

function summarizeFocusRows(rows, scenario) {
  const boundedRows = rows.filter((row) => row.baselineExact === false);
  const exactConvertedCount = boundedRows.filter((row) => row.result.exact === true).length;
  const boundedGapTotal = boundedRows.reduce((sum, row) => {
    if (row.result.exact) {
      return sum;
    }
    const gap = row.result.observedScoreUpperBoundGap;
    return Number.isFinite(gap) ? sum + gap : Number.POSITIVE_INFINITY;
  }, 0);
  const baselineBoundedGapTotal = scenario.baselineBoundedGapTotal
    ?? boundedRows.reduce((sum, row) => sum + (row.baselineGap ?? 0), 0);
  return {
    total: rows.length,
    exactCount: rows.filter((row) => row.result.exact === true).length,
    timeoutCount: rows.filter((row) => isRunnerTimeoutResult(row.result)).length,
    failedCount: rows.filter((row) => row.result.failed === true).length,
    maxElapsedMs: rows.reduce((max, row) => Math.max(max, row.result.elapsedMs ?? 0), 0),
    boundedBaselineCount: boundedRows.length,
    boundedExactConvertedCount: exactConvertedCount,
    boundedBaselineGapTotal: baselineBoundedGapTotal,
    boundedGapTotal,
    boundedGapReductionRatio: Number.isFinite(boundedGapTotal) && baselineBoundedGapTotal > 0
      ? (baselineBoundedGapTotal - boundedGapTotal) / baselineBoundedGapTotal
      : null,
    peakWorkingSetBytes: rows.reduce((max, row) => Math.max(max, row.memory.peakWorkingSetBytes ?? 0), 0),
    memorySampleCount: rows.reduce((sum, row) => sum + (row.memory.sampleCount ?? 0), 0),
  };
}

function getFocusStatusLabel(row) {
  if (row.result.exact) {
    return "exact";
  }
  if (isRunnerTimeoutResult(row.result)) {
    return "timeout";
  }
  if (row.result.failed) {
    return "failed";
  }
  return "bounded";
}

function getFocusPivotEventKeys(rows) {
  const present = new Set(rows.map((row) => row.eventKey));
  const preferred = ["none", "323", "244", "260"];
  const ordered = preferred.filter((eventKey) => present.has(eventKey));
  for (const eventKey of present) {
    if (!ordered.includes(eventKey)) {
      ordered.push(eventKey);
    }
  }
  return ordered;
}

function getFocusPivotProfiles(rows) {
  const rowsByProfile = new Map();
  const orderByLabel = new Map(expectedProfileIdentities20260602.map((profile, index) => [profile.label, index]));
  for (const row of rows) {
    const label = row.profile?.label ?? row.profileLabel;
    if (!rowsByProfile.has(label)) {
      rowsByProfile.set(label, {
        label,
        cardCount: row.profile?.cardCount ?? null,
        rows: [],
      });
    }
    const bucket = rowsByProfile.get(label);
    bucket.rows.push(row);
    if (bucket.cardCount === null && row.profile?.cardCount !== undefined) {
      bucket.cardCount = row.profile.cardCount;
    }
  }
  return [...rowsByProfile.values()].sort((left, right) => (
    (orderByLabel.get(left.label) ?? Number.MAX_SAFE_INTEGER)
    - (orderByLabel.get(right.label) ?? Number.MAX_SAFE_INTEGER)
    || left.label.localeCompare(right.label)
  ));
}

function buildFocusPivotTable(report, kind) {
  const eventKeys = getFocusPivotEventKeys(report.rows);
  if (eventKeys.length <= 1 || report.rows.length <= eventKeys.length) {
    return [];
  }

  const profiles = getFocusPivotProfiles(report.rows);
  const rowByProfileEvent = new Map(report.rows.map((row) => [
    `${row.profile?.label ?? row.profileLabel}:${row.eventKey}`,
    row,
  ]));
  const title = kind === "time" ? "Time Matrix" : "Memory Matrix";
  const header = ["profile", "cards", ...eventKeys];
  const separator = ["---", "---:", ...eventKeys.map(() => "---")];
  const lines = [
    `## ${title}`,
    "",
    `Units: ${kind === "time" ? "s" : "MiB"}.`,
    "",
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
  ];

  for (const profile of profiles) {
    const cells = [
      profile.label,
      profile.cardCount ?? "",
    ];
    for (const eventKey of eventKeys) {
      const row = rowByProfileEvent.get(`${profile.label}:${eventKey}`);
      if (!row) {
        cells.push("");
        continue;
      }
      const status = getFocusStatusLabel(row);
      if (kind === "time") {
        cells.push(status === "exact" ? `${formatSeconds(row.result.elapsedMs)} exact` : status);
      } else {
        const peakMiB = formatMiB(row.memory?.peakWorkingSetBytes);
        cells.push(peakMiB ? `${peakMiB} MiB ${status}` : status);
      }
    }
    lines.push(`| ${cells.map(escapeMarkdownCell).join(" | ")} |`);
  }

  lines.push("");
  return lines;
}

function toFocusMarkdown(report) {
  return [
    `# ${report.scenarioName}`,
    "",
    report.description,
    "",
    "## Summary",
    "",
    `Cases: ${report.summary.exactCount}/${report.summary.total} exact`,
    `Timeouts: ${report.summary.timeoutCount}`,
    `Failures: ${report.summary.failedCount}`,
    `Bounded conversions: ${report.summary.boundedExactConvertedCount}/${report.summary.boundedBaselineCount}`,
    `Bounded gap total: ${Number.isFinite(report.summary.boundedGapTotal) ? report.summary.boundedGapTotal : "unknown"} / baseline ${report.summary.boundedBaselineGapTotal}`,
    `Bounded gap reduction: ${report.summary.boundedGapReductionRatio === null ? "unknown" : `${Math.round(report.summary.boundedGapReductionRatio * 1000) / 10}%`}`,
    `Peak working set: ${formatMiB(report.summary.peakWorkingSetBytes)} MiB`,
    "",
    ...buildFocusPivotTable(report, "time"),
    ...buildFocusPivotTable(report, "memory"),
    "| case | baseline | exact | elapsed ms | gap | abort reason | abort slot | soft limit | candidates | third fallback | fallback words | peak MiB | status |",
    "| --- | --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...report.rows.map((row) => [
      row.caseKey,
      row.baselineExact === true
        ? `exact ${row.baselineElapsedMs ?? ""}`.trim()
        : row.baselineExact === false
          ? `bounded gap ${row.baselineGap}`
          : "",
      row.result.exact ? "yes" : "no",
      row.result.elapsedMs ?? "",
      row.result.observedScoreUpperBoundGap ?? "",
      row.result.exactCandidateJoinAbortReason ?? "",
      row.result.exactCandidateJoinAbortSlotIndex ?? "",
      row.result.exactCandidateJoinAbortCandidateSoftLimit ?? "",
      row.result.exactCandidateJoinAbortCandidateCount ?? "",
      row.result.exactCandidateJoinThirdShortlistFallbackCount ?? "",
      row.result.exactCandidateJoinThirdFallbackWordScanCount ?? "",
      formatMiB(row.memory.peakWorkingSetBytes),
      row.result.failureReason ?? row.result.searchMode ?? "",
    ].join(" | ")).map((line) => `| ${line} |`),
    "",
  ].join("\n");
}

function writeFocusReportFiles(report) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(benchmarkDir, `focus-medley-cases-${stamp}.json`);
  const markdownPath = path.join(benchmarkDir, `focus-medley-cases-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(markdownPath, toFocusMarkdown(report), "utf8");
  fs.writeFileSync(path.join(benchmarkDir, "last-focus-medley-cases.json"), JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(benchmarkDir, "last-focus-medley-cases.md"), toFocusMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function assertFocusReport(scenarioName, scenario, report) {
  if (report.rows.length !== scenario.cases.length) {
    throw new Error(`${scenarioName}: expected ${scenario.cases.length} cases, got ${report.rows.length}`);
  }
  assertReportProfileIdentities(scenarioName, report.rows);
  if (scenario.recordOnly) {
    console.log(
      `record ${scenarioName}: exact ${report.summary.exactCount}/${report.summary.total}, `
      + `failures=${report.summary.failedCount}, `
      + `peak=${formatMiB(report.summary.peakWorkingSetBytes)} MiB`,
    );
    return;
  }
  if (report.summary.timeoutCount > 0) {
    throw new Error(`${scenarioName}: ${report.summary.timeoutCount} case(s) timed out`);
  }
  for (const row of report.rows) {
    if ((row.result.elapsedMs ?? Number.POSITIVE_INFINITY) > scenario.maxElapsedMs) {
      throw new Error(`${scenarioName}: ${row.caseKey} exceeded ${scenario.maxElapsedMs}ms`);
    }
  }
  for (const row of report.rows.filter((currentRow) => currentRow.baselineExact)) {
    if (!row.result.exact) {
      throw new Error(`${scenarioName}: ${row.caseKey} regressed from exact to bounded`);
    }
    const maxRegressionRatio = scenario.baselineExactElapsedRegressionRatio ?? 1.15;
    if (
      report.summary.boundedExactConvertedCount === 0
      && Number.isFinite(row.baselineElapsedMs)
      && (row.result.elapsedMs ?? Number.POSITIVE_INFINITY) > row.baselineElapsedMs * maxRegressionRatio
    ) {
      throw new Error(
        `${scenarioName}: ${row.caseKey} exact elapsed regressed beyond `
        + `${Math.round((maxRegressionRatio - 1) * 100)}% without a bounded conversion`,
      );
    }
  }
  const gapAccepted = (
    report.summary.boundedExactConvertedCount >= 1
    || (
      report.summary.boundedGapReductionRatio !== null
      && report.summary.boundedGapReductionRatio >= 0.25
    )
  );
  if (report.summary.boundedBaselineCount > 0 && !gapAccepted) {
    throw new Error(`${scenarioName}: no bounded case converted and bounded gap reduction was below 25%`);
  }
  console.log(
    `assert ${scenarioName}: exact ${report.summary.exactCount}/${report.summary.total}, `
    + `converted ${report.summary.boundedExactConvertedCount}/${report.summary.boundedBaselineCount}, `
    + `gapReduction=${report.summary.boundedGapReductionRatio === null ? "unknown" : `${Math.round(report.summary.boundedGapReductionRatio * 1000) / 10}%`}, `
    + `peak=${formatMiB(report.summary.peakWorkingSetBytes)} MiB`,
  );
}

function assertScenarioReport(scenarioName, scenario) {
  if (scenario.reportKind === "single") {
    assertSingleReport(scenarioName, scenario);
    return;
  }
  if (scenario.reportKind === "matrix") {
    assertMatrixReport(scenarioName, scenario);
  }
}

async function runFocusScenario(scenarioName, scenario) {
  console.log(`Running ${scenarioName}: ${scenario.description}`);
  const rows = [];
  for (const caseSpec of scenario.cases) {
    const caseKey = `${caseSpec.profileLabel}:${caseSpec.eventKey}`;
    console.log(`Running ${scenarioName} case ${caseKey}`);
    const result = await runRunner(
      {
        ...cleanBaseEnv,
        ...baseEnv,
        ...scenario.env,
        HHWX_REAL_PROFILE_LABELS: caseSpec.profileLabel,
        HHWX_REAL_PROFILE_EVENT_KEYS: caseSpec.eventKey,
      },
      `${scenarioName}:${caseKey}`,
    );
    if (result.status !== 0) {
      if (!scenario.recordOnly) {
        throw new Error(`${scenarioName} ${caseKey}: runner exited with status ${result.status}`);
      }
      rows.push({
        caseKey,
        profileLabel: caseSpec.profileLabel,
        eventKey: caseSpec.eventKey,
        baselineExact: caseSpec.baselineExact,
        baselineGap: caseSpec.baselineGap ?? null,
        baselineElapsedMs: caseSpec.baselineElapsedMs ?? null,
        result: {
          exact: false,
          elapsedMs: null,
          timedOut: false,
          failed: true,
          failureReason: result.signal
            ? `runner-signal-${result.signal}`
            : `runner-exit-${result.status}`,
        },
        profile: expectedProfileIdentityByLabel.get(caseSpec.profileLabel) ?? {
          label: caseSpec.profileLabel,
          profileHash: null,
          cardCount: null,
        },
        memory: result.memory,
        matrixRow: null,
      });
      continue;
    }
    const matrixReport = loadJson(path.join(benchmarkDir, "last-real-profile-medley-scope-matrix.json"));
    if (!Array.isArray(matrixReport.rows) || matrixReport.rows.length !== 1) {
      throw new Error(`${scenarioName} ${caseKey}: expected one matrix row, got ${matrixReport.rows?.length ?? "none"}`);
    }
    const matrixRow = matrixReport.rows[0];
    assertProfileIdentity(`${scenarioName} ${caseKey}`, matrixRow.profile);
    rows.push({
      caseKey,
      profileLabel: caseSpec.profileLabel,
      eventKey: caseSpec.eventKey,
      baselineExact: caseSpec.baselineExact,
      baselineGap: caseSpec.baselineGap ?? null,
      baselineElapsedMs: caseSpec.baselineElapsedMs ?? null,
      result: matrixRow.all,
      profile: matrixRow.profile,
      memory: result.memory,
      matrixRow,
    });
  }
  const report = {
    scenarioName,
    description: scenario.description,
    generatedAt: new Date().toISOString(),
    durationMs: scenario.maxElapsedMs,
    cases: scenario.cases,
    summary: summarizeFocusRows(rows, scenario),
    rows,
  };
  const { jsonPath, markdownPath } = writeFocusReportFiles(report);
  assertFocusReport(scenarioName, scenario, report);
  console.log(JSON.stringify({ jsonPath, markdownPath, summary: report.summary }, null, 2));
}

async function runScenario(scenarioName) {
  const scenario = scenarios[scenarioName];
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioName}`);
  }
  if (scenario.scenarios) {
    for (const childScenarioName of scenario.scenarios) {
      await runScenario(childScenarioName);
    }
    return;
  }
  if (scenario.reportKind === "focus") {
    await runFocusScenario(scenarioName, scenario);
    return;
  }

  console.log(`Running ${scenarioName}: ${scenario.description}`);
  const result = await runRunner(
    {
      ...cleanBaseEnv,
      ...baseEnv,
      ...scenario.env,
    },
    scenarioName,
  );
  if (result.status !== 0) {
    throw new Error(`${scenarioName}: runner exited with status ${result.status}`);
  }
  assertScenarioReport(scenarioName, scenario);
}

async function main() {
  const [fsModule, pathModule, childProcessModule] = await Promise.all([
    import("node:fs"),
    import("node:path"),
    import("node:child_process"),
  ]);
  fs = fsModule.default ?? fsModule;
  path = pathModule.default ?? pathModule;
  spawn = childProcessModule.spawn;
  spawnSync = childProcessModule.spawnSync;

  repoRoot = path.resolve(__dirname, "..");
  defaultRunnerPath = path.join(repoRoot, "temp", "bandori-team-builder", "benchmark-real-profiles-medley.cjs");
  defaultFixturePath = path.join(repoRoot, "temp", "bandori-team-builder", "hard-case-profiles-2026-06-02.json");
  benchmarkDir = path.dirname(defaultRunnerPath);
  baseEnv = {
    HHWX_REAL_PROFILE_FIXTURE_PATH: defaultFixturePath,
    HHWX_REAL_PROFILE_SAMPLE_COUNT: "10",
    HHWX_REAL_PROFILE_SONG_IDS: "385,193,619",
    HHWX_REAL_PROFILE_EVENT_KEYS: "none",
    HHWX_REAL_PROFILE_DURATION_MS: "300000",
    HHWX_REAL_PROFILE_RERUN_120: "0",
  };

  const scenarioName = process.argv[2];
  const scenario = scenarios[scenarioName];

  if (!scenario) {
    printUsage();
    process.exit(scenarioName ? 1 : 0);
  }

  if (!fs.existsSync(defaultRunnerPath)) {
    console.error(`Missing benchmark runner: ${defaultRunnerPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(defaultFixturePath)) {
    console.error(`Missing hard-case fixture: ${defaultFixturePath}`);
    process.exit(1);
  }

  cleanBaseEnv = { ...process.env };
  for (const key of Object.keys(cleanBaseEnv)) {
    if (key.startsWith("HHWX_REAL_PROFILE_")) {
      delete cleanBaseEnv[key];
    }
  }

  try {
    await runScenario(scenarioName);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
