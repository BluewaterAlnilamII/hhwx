import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_PORT = 3118;
const DEFAULT_START_TIMEOUT_MS = 30000;
const LOG_TAIL_LIMIT = 20000;

function parseArgs(argv) {
  const args = {
    port: Number(process.env.NFO_SMOKE_PROD_PORT || DEFAULT_PORT),
    startTimeoutMs: Number(
      process.env.NFO_SMOKE_PROD_START_TIMEOUT_MS || DEFAULT_START_TIMEOUT_MS,
    ),
    smokeArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") {
      args.port = Number(argv[++index]);
    } else if (arg === "--start-timeout-ms") {
      args.startTimeoutMs = Number(argv[++index]);
    } else if (arg === "--help") {
      printUsage();
      process.exit(0);
    } else {
      args.smokeArgs.push(arg);
    }
  }

  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535) {
    throw new Error(`Invalid production smoke port: ${args.port}`);
  }
  if (!Number.isFinite(args.startTimeoutMs) || args.startTimeoutMs <= 0) {
    throw new Error(`Invalid production smoke start timeout: ${args.startTimeoutMs}`);
  }

  return args;
}

function printUsage() {
  console.log(`Usage:
  npm run build
  npm run smoke:nfo:prod
  npm run smoke:nfo:prod -- --port 3118
  npm run smoke:nfo:prod -- --skip-browser

Starts a local Next.js production server with next start, waits for the NFO
local-runtime API, then reuses scripts/nfo-smoke-local.mjs against that server.
Additional arguments are passed through to the smoke script.`);
}

async function assertBuildExists() {
  try {
    await access(path.join(process.cwd(), ".next", "BUILD_ID"));
  } catch {
    throw new Error("No production build found. Run npm run build before smoke:nfo:prod.");
  }
}

function createLogTail() {
  let text = "";
  return {
    append(chunk) {
      text = `${text}${chunk.toString()}`.slice(-LOG_TAIL_LIMIT);
    },
    read() {
      return text.trim();
    },
  };
}

async function probe(url, timeoutMs) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    response.body?.cancel();
    return response.status;
  } catch {
    return 0;
  }
}

async function assertPortAvailable(port) {
  const status = await probe(`http://localhost:${port}/api/bandori/nfo/local-runtime`, 1000);
  if (status > 0) {
    throw new Error(
      `Port ${port} is already serving HTTP ${status}. `
        + "Stop that server or pass --port / NFO_SMOKE_PROD_PORT.",
    );
  }
}

function spawnNextStart(port) {
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const stdoutTail = createLogTail();
  const stderrTail = createLogTail();

  child.stdout.on("data", (chunk) => stdoutTail.append(chunk));
  child.stderr.on("data", (chunk) => stderrTail.append(chunk));

  return {
    child,
    getLogTail() {
      return [
        stdoutTail.read() ? `stdout:\n${stdoutTail.read()}` : "",
        stderrTail.read() ? `stderr:\n${stderrTail.read()}` : "",
      ].filter(Boolean).join("\n");
    },
  };
}

async function waitForServer({ child, getLogTail }, baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const url = new URL("/api/bandori/nfo/local-runtime", baseUrl).toString();

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `next start exited before NFO production smoke could run.\n${getLogTail()}`,
      );
    }

    const status = await probe(url, 2000);
    if (status === 200) {
      console.log(`ok - production server ready at ${baseUrl}`);
      return;
    }

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for production NFO server at ${baseUrl}.\n${getLogTail()}`,
  );
}

async function runSmoke(baseUrl, smokeArgs) {
  const child = spawn(
    process.execPath,
    ["scripts/nfo-smoke-local.mjs", "--base-url", baseUrl, ...smokeArgs],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    },
  );

  const code = await new Promise((resolve) => {
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
    child.on("error", () => resolve(1));
  });

  if (code !== 0) {
    throw new Error(`NFO production smoke failed with exit code ${code}`);
  }
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );
      killer.on("exit", resolve);
      killer.on("error", resolve);
    });
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.on("exit", resolve)),
    delay(5000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = new URL(`http://localhost:${args.port}`).toString();

  await assertBuildExists();
  await assertPortAvailable(args.port);

  const server = spawnNextStart(args.port);
  try {
    await waitForServer(server, baseUrl, args.startTimeoutMs);
    await runSmoke(baseUrl, args.smokeArgs);
    console.log(`ok - NFO production smoke passed for ${baseUrl}`);
  } finally {
    await stopServer(server.child);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
