#!/usr/bin/env node

let fs;
let path;
let spawnSync;
let repoRoot;
let defaultRunnerPath;
let defaultFixturePath;
let benchmarkDir;
let baseEnv;
let cleanBaseEnv;

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
    description: "P01-P10 all-mode exact proof, 300s per profile.",
    reportKind: "matrix",
    expectedProfileCount: 10,
    maxElapsedMs: 300000,
    env: {
      HHWX_REAL_PROFILE_SCOPE_MATRIX: "1",
      HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES: "0",
    },
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

function assertSingleReport(scenarioName, scenario) {
  const reportPath = path.join(benchmarkDir, "last-real-profile-medley-benchmark.json");
  const report = loadJson(reportPath);
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
  const allExactCount = report.summary?.allExactCount;
  const maxElapsedMs = report.summary?.allMaxElapsedMs ?? Number.POSITIVE_INFINITY;
  if (profileCount !== scenario.expectedProfileCount) {
    throw new Error(`${scenarioName}: expected ${scenario.expectedProfileCount} profiles, got ${profileCount}`);
  }
  if (allExactCount !== scenario.expectedProfileCount) {
    throw new Error(`${scenarioName}: all-mode exact ${allExactCount}/${scenario.expectedProfileCount}`);
  }
  if (maxElapsedMs > scenario.maxElapsedMs) {
    throw new Error(`${scenarioName}: all-mode max ${maxElapsedMs}ms exceeded ${scenario.maxElapsedMs}ms`);
  }
  console.log(`assert ${scenarioName}: all exact ${allExactCount}/${profileCount}, max ${maxElapsedMs}ms <= ${scenario.maxElapsedMs}ms`);
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

function runScenario(scenarioName) {
  const scenario = scenarios[scenarioName];
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioName}`);
  }
  if (scenario.scenarios) {
    for (const childScenarioName of scenario.scenarios) {
      runScenario(childScenarioName);
    }
    return;
  }

  console.log(`Running ${scenarioName}: ${scenario.description}`);
  const result = spawnSync(process.execPath, [defaultRunnerPath], {
    cwd: repoRoot,
    env: {
      ...cleanBaseEnv,
      ...baseEnv,
      ...scenario.env,
    },
    stdio: "inherit",
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${scenarioName}: runner exited with status ${result.status ?? 1}`);
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
  spawnSync = childProcessModule.spawnSync;

  repoRoot = path.resolve(__dirname, "..");
  defaultRunnerPath = path.join(repoRoot, "temp", "bandori-team-builder", "benchmark-real-profiles-medley.cjs");
  defaultFixturePath = path.join(repoRoot, "temp", "bandori-team-builder", "hard-case-profiles-2026-05-31.json");
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
    runScenario(scenarioName);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
