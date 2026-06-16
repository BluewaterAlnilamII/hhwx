import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";

const DEFAULT_BASE_URL = "http://localhost:3117";
const EXPECTED_RUNTIME_PATH =
  "public/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json";
const EXPECTED_SOURCE_MANIFEST_PATH = "snapshot-manifest.json";
const STATIC_RUNTIME_URL_PATH =
  "/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json";
const EXPECTED_SMOKE_ACTIVE_SKILL_CHARACTER_ID = 110;
const EXPECTED_SMOKE_ACTIVE_SKILL_ID = 110;
const EXPECTED_SMOKE_ACTIVE_SKILL_EFFECT_NAME = "UIefx_flash_starlight";
export const LIVE_NFO_ENDPOINT_MARKERS = [
  "http://",
  "https://",
  "l3-prod-all-bd.bilibiligame.net",
  "l4-prod-patch-bd.bilibiligame.net",
  "nfo-test-bang.bilibiligame.net",
  "/api/user/",
  "/assetbundle/nfo/",
];
const LOCAL_ONLY_HOST_RESOLVER_RULES =
  "MAP * 0.0.0.0, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1";
const DEFAULT_BROWSER_VIRTUAL_TIME_MS = 30000;
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.NFO_SMOKE_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs: Number(process.env.NFO_SMOKE_TIMEOUT_MS || 15000),
    browserBin: process.env.NFO_SMOKE_BROWSER_BIN || "",
    browserVirtualTimeMs: Number(
      process.env.NFO_SMOKE_BROWSER_VIRTUAL_TIME_MS || DEFAULT_BROWSER_VIRTUAL_TIME_MS,
    ),
    screenshotPath: process.env.NFO_SMOKE_SCREENSHOT_PATH || "temp/nfo-smoke-browser.png",
    skipBrowser: process.env.NFO_SMOKE_SKIP_BROWSER === "1",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      args.baseUrl = argv[++index];
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[++index]);
    } else if (arg === "--browser-bin") {
      args.browserBin = argv[++index];
    } else if (arg === "--browser-virtual-time-ms") {
      args.browserVirtualTimeMs = Number(argv[++index]);
    } else if (arg === "--screenshot-path") {
      args.screenshotPath = argv[++index];
    } else if (arg === "--skip-browser") {
      args.skipBrowser = true;
    } else if (arg === "--help") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error(`Invalid timeout: ${args.timeoutMs}`);
  }
  if (!Number.isFinite(args.browserVirtualTimeMs) || args.browserVirtualTimeMs <= 0) {
    throw new Error(`Invalid browser virtual time: ${args.browserVirtualTimeMs}`);
  }

  return {
    ...args,
    baseUrl: new URL(args.baseUrl).toString(),
    screenshotPath: path.resolve(args.screenshotPath),
  };
}

function printUsage() {
  console.log(`Usage:
  npm run smoke:nfo
  npm run smoke:nfo:http
  npm run smoke:nfo -- --base-url http://localhost:3117
  npm run smoke:nfo -- --skip-browser
  npm run smoke:nfo -- --screenshot-path temp/nfo-smoke-browser.png
  npm run smoke:nfo -- --browser-bin "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

Checks the NFO page, local-runtime API, and deployable frozen runtime JSON
served by an already-running Next.js dev or production server. It also runs a
headless browser interaction smoke unless --skip-browser is set.`);
}

function resolveUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

function assertSmoke(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertNoLiveNfoEndpoints(value, label) {
  const serialized = JSON.stringify(value);
  const marker = LIVE_NFO_ENDPOINT_MARKERS.find((candidate) => serialized.includes(candidate));

  assertSmoke(
    !marker,
    `${label} contains live NFO endpoint marker ${marker}`,
  );
}

export function getStaticRuntimeEndpointCheckSurface(runtime) {
  const checkSurface = structuredClone(runtime);
  const multiplayConfigs = checkSurface.datasets?.multiplayConfigData;

  if (Array.isArray(multiplayConfigs)) {
    for (const multiplayConfig of multiplayConfigs) {
      if (multiplayConfig && typeof multiplayConfig === "object") {
        delete multiplayConfig.URL;
      }
    }
  }

  return checkSurface;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return response;
}

async function expectText(baseUrl, path, timeoutMs) {
  const url = resolveUrl(baseUrl, path);
  const response = await fetchWithTimeout(url, {}, timeoutMs);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  assertSmoke(response.ok, `GET ${url} failed with ${response.status}`);
  assertSmoke(
    contentType.includes("text/html"),
    `GET ${url} returned non-HTML content-type ${contentType}`,
  );
  assertSmoke(text.includes("<html"), `GET ${url} did not return an HTML document`);
  assertSmoke(text.length > 1000, `GET ${url} returned unexpectedly short HTML`);

  console.log(`ok - page ${path} returned ${response.status} (${text.length} bytes)`);
}

async function expectJson(baseUrl, path, timeoutMs) {
  const url = resolveUrl(baseUrl, path);
  const response = await fetchWithTimeout(url, {}, timeoutMs);
  const contentType = response.headers.get("content-type") || "";

  assertSmoke(response.ok, `GET ${url} failed with ${response.status}`);
  assertSmoke(
    contentType.includes("application/json"),
    `GET ${url} returned non-JSON content-type ${contentType}`,
  );

  return response.json();
}

async function smokeApiRuntime(baseUrl, timeoutMs) {
  const payload = await expectJson(baseUrl, "/api/bandori/nfo/local-runtime", timeoutMs);
  assertSmoke(payload.success === true, "local-runtime API did not return success=true");

  const data = payload.data;
  assertSmoke(data?.region === "cn", "local-runtime API did not return CN runtime data");
  assertSmoke(
    data.resourceVersion === "Android-2.1.1",
    `unexpected NFO resource version ${data?.resourceVersion}`,
  );
  assertSmoke(
    data.source?.runtimeDataPath === EXPECTED_RUNTIME_PATH,
    `local-runtime API used ${data?.source?.runtimeDataPath}, expected ${EXPECTED_RUNTIME_PATH}`,
  );
  assertSmoke(
    data.source?.manifestPath === EXPECTED_SOURCE_MANIFEST_PATH,
    `local-runtime API exposed manifest path ${data?.source?.manifestPath}, expected `
      + EXPECTED_SOURCE_MANIFEST_PATH,
  );
  assertSmoke(Array.isArray(data.characters) && data.characters.length > 0, "missing characters");
  assertSmoke(Array.isArray(data.weapons) && data.weapons.length > 0, "missing weapons");
  assertSmoke(Array.isArray(data.levels) && data.levels.length > 0, "missing playable levels");
  assertSmoke(Array.isArray(data.bulletShooters) && data.bulletShooters.length > 0, "missing bullet shooters");
  assertSmoke(Array.isArray(data.mapPrefabs) && data.mapPrefabs.length > 0, "missing map prefabs");
  assertNoLiveNfoEndpoints(data, "local-runtime API DTO");

  console.log(
    `ok - local-runtime API uses ${data.source.runtimeDataPath} `
      + `(${data.characters.length} characters, ${data.weapons.length} weapons)`,
  );

  return data;
}

async function smokeStaticRuntime(baseUrl, apiRuntimeData, timeoutMs) {
  const runtime = await expectJson(baseUrl, STATIC_RUNTIME_URL_PATH, timeoutMs);

  assertSmoke(runtime.schemaVersion === 1, "static runtime schemaVersion mismatch");
  assertSmoke(runtime.region === "cn", "static runtime region mismatch");
  assertSmoke(runtime.resourceVersion === "Android-2.1.1", "static runtime resource version mismatch");
  assertSmoke(runtime.datasetCounts?.weaponData === apiRuntimeData.counts?.weaponData, "weaponData count mismatch");
  assertSmoke(
    runtime.datasetCounts?.bulletShooterData === apiRuntimeData.counts?.bulletShooterData,
    "bulletShooterData count mismatch",
  );
  assertSmoke(Array.isArray(runtime.mapPrefabs) && runtime.mapPrefabs.length > 0, "static runtime missing map prefabs");
  assertNoLiveNfoEndpoints(
    getStaticRuntimeEndpointCheckSurface(runtime),
    "static runtime JSON offline gameplay surface",
  );

  console.log(
    `ok - static runtime JSON ${STATIC_RUNTIME_URL_PATH} returned `
      + `${runtime.datasetCounts.weaponData} weapons and ${runtime.mapPrefabs.length} map prefabs`,
  );
}

async function smokeBrowserInteraction(baseUrl, args) {
  if (args.skipBrowser) {
    console.log("skip - browser interaction smoke disabled");
    return;
  }

  const browserBin = await resolveBrowserBin(args.browserBin);
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "hhwx-nfo-smoke-"));
  const url = resolveUrl(baseUrl, "/zh-CN/bandori/nfo?nfoSmoke=1");
  const persistedSaveUrl = resolveUrl(baseUrl, "/zh-CN/bandori/nfo");

  try {
    const { stdout, stderr } = await dumpBrowserDom(
      browserBin,
      userDataDir,
      url,
      args,
    );

    const smokeTag = extractSmokeTag(stdout);
    assertSmoke(smokeTag, `browser smoke state marker was not rendered for ${url}`);
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-smoke-mode") === "1",
      "browser smoke mode was not enabled",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-runtime-status") === "ready",
      "browser smoke runtime did not reach ready state",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-save-ready") === "1",
      "browser smoke save state was not ready",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-all-unlocked") === "1",
      "browser smoke did not unlock all local content",
    );
    const unlockedCharacterCount = Number(
      readHtmlAttribute(smokeTag, "data-nfo-unlocked-character-count"),
    );
    const characterCount = Number(readHtmlAttribute(smokeTag, "data-nfo-character-count"));
    assertSmoke(
      Number.isFinite(unlockedCharacterCount)
        && Number.isFinite(characterCount)
        && unlockedCharacterCount === characterCount,
      "browser smoke did not unlock all local characters",
    );
    const selectedCharacterId = Number(
      readHtmlAttribute(smokeTag, "data-nfo-selected-character-id"),
    );
    assertSmoke(
      selectedCharacterId === EXPECTED_SMOKE_ACTIVE_SKILL_CHARACTER_ID,
      `browser smoke selected character ${selectedCharacterId}, expected `
        + `${EXPECTED_SMOKE_ACTIVE_SKILL_CHARACTER_ID}`,
    );
    const playerX = Number(readHtmlAttribute(smokeTag, "data-nfo-player-x"));
    const playerY = Number(readHtmlAttribute(smokeTag, "data-nfo-player-y"));
    assertSmoke(
      Number.isFinite(playerX) && Number.isFinite(playerY),
      "browser smoke did not expose the player position",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-player-moved") === "1",
      "browser smoke did not move the player",
    );
    const enemyCount = Number(readHtmlAttribute(smokeTag, "data-nfo-enemy-count"));
    const projectileCount = Number(readHtmlAttribute(smokeTag, "data-nfo-projectile-count"));
    const defeatedEnemyCount = Number(
      readHtmlAttribute(smokeTag, "data-nfo-defeated-enemy-count"),
    );
    const pickupCount = Number(readHtmlAttribute(smokeTag, "data-nfo-pickup-count"));
    const collectedExp = Number(readHtmlAttribute(smokeTag, "data-nfo-collected-exp"));
    const score = Number(readHtmlAttribute(smokeTag, "data-nfo-score"));
    assertSmoke(
      [
        enemyCount,
        projectileCount,
        defeatedEnemyCount,
        pickupCount,
        collectedExp,
        score,
      ].every(Number.isFinite),
      "browser smoke did not expose combat counters",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-enemy-observed") === "1",
      "browser smoke did not observe enemy spawning",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-combat-observed") === "1",
      "browser smoke did not observe combat activity",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-reward-observed") === "1",
      "browser smoke did not observe enemy defeat, drops, or EXP before clearing",
    );
    assertSmoke(
      defeatedEnemyCount > 0 || pickupCount > 0 || collectedExp > 0 || score > 0,
      "browser smoke did not expose a concrete enemy defeat, drop, EXP, or score signal",
    );
    const paidUpgradeCount = Number(readHtmlAttribute(smokeTag, "data-nfo-paid-upgrade-count"));
    const upgradeTotalCount = Number(readHtmlAttribute(smokeTag, "data-nfo-upgrade-total-count"));
    assertSmoke(
      Number.isFinite(upgradeTotalCount) && upgradeTotalCount > 0,
      "browser smoke did not expose a global upgrade tree",
    );
    assertSmoke(
      Number.isFinite(paidUpgradeCount) && paidUpgradeCount > 0,
      "browser smoke did not buy a global upgrade",
    );
    const activeSkillId = Number(readHtmlAttribute(smokeTag, "data-nfo-active-skill-id"));
    assertSmoke(
      activeSkillId === EXPECTED_SMOKE_ACTIVE_SKILL_ID,
      `browser smoke active skill ${activeSkillId}, expected ${EXPECTED_SMOKE_ACTIVE_SKILL_ID}`,
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-active-skill-observed") === "1",
      "browser smoke did not activate the active skill",
    );
    const fullScreenEffectCount = Number(
      readHtmlAttribute(smokeTag, "data-nfo-full-screen-effect-count"),
    );
    assertSmoke(
      Number.isFinite(fullScreenEffectCount) && fullScreenEffectCount > 0,
      "browser smoke did not expose an active-skill full-screen effect",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-full-screen-effect-name")
        === EXPECTED_SMOKE_ACTIVE_SKILL_EFFECT_NAME,
      "browser smoke did not expose the expected active-skill full-screen effect",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-active-skill-effect-observed") === "1",
      "browser smoke did not observe the active-skill shooter/VFX timeline",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-hud-status") === "cleared",
      "browser smoke did not quick-clear the active run",
    );
    const bankCoin = Number(readHtmlAttribute(smokeTag, "data-nfo-upgrade-coin"));
    const totalRuns = Number(readHtmlAttribute(smokeTag, "data-nfo-total-runs"));
    const clearedLevelCount = Number(readHtmlAttribute(smokeTag, "data-nfo-cleared-level-count"));
    assertSmoke(
      [bankCoin, totalRuns, clearedLevelCount].every(Number.isFinite),
      "browser smoke did not expose save settlement counters",
    );
    assertSmoke(totalRuns > 0, "browser smoke did not persist a completed run");
    assertSmoke(bankCoin > 0, "browser smoke did not persist clear coin");
    assertSmoke(clearedLevelCount > 0, "browser smoke did not persist a cleared level");
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-selected-level-cleared") === "1",
      "browser smoke did not mark the selected level cleared",
    );
    assertSmoke(
      readHtmlAttribute(smokeTag, "data-nfo-smoke-state") === "complete",
      "browser smoke interaction state did not complete",
    );
    assertSmoke(stdout.includes("<canvas"), "browser smoke did not render a Phaser canvas");
    assertSmoke(stdout.includes("Unlock all"), "browser smoke did not render the Unlock all control");
    assertSmoke(stdout.includes("Coin +500"), "browser smoke did not render the upgrade coin control");
    assertSmoke(stdout.includes("Active skill"), "browser smoke did not render the active skill control");
    assertSmoke(!stdout.includes("Application error"), "browser smoke rendered an application error");

    const { stdout: persistedStdout } = await dumpBrowserDom(
      browserBin,
      userDataDir,
      persistedSaveUrl,
      args,
    );
    const persistedSmokeTag = extractSmokeTag(persistedStdout);
    assertSmoke(
      persistedSmokeTag,
      `browser smoke persisted save marker was not rendered for ${persistedSaveUrl}`,
    );
    assertSmoke(
      readHtmlAttribute(persistedSmokeTag, "data-nfo-smoke-mode") === "0",
      "browser smoke persisted save check unexpectedly re-entered smoke mode",
    );
    assertSmoke(
      readHtmlAttribute(persistedSmokeTag, "data-nfo-runtime-status") === "ready",
      "browser smoke persisted save check did not reach ready runtime",
    );
    assertSmoke(
      readHtmlAttribute(persistedSmokeTag, "data-nfo-save-ready") === "1",
      "browser smoke persisted save check did not load save state",
    );
    const persistedBankCoin = Number(
      readHtmlAttribute(persistedSmokeTag, "data-nfo-upgrade-coin"),
    );
    const persistedTotalRuns = Number(
      readHtmlAttribute(persistedSmokeTag, "data-nfo-total-runs"),
    );
    const persistedClearedLevelCount = Number(
      readHtmlAttribute(persistedSmokeTag, "data-nfo-cleared-level-count"),
    );
    assertSmoke(
      [persistedBankCoin, persistedTotalRuns, persistedClearedLevelCount].every(Number.isFinite),
      "browser smoke persisted save check did not expose save counters",
    );
    assertSmoke(
      persistedTotalRuns >= totalRuns,
      "browser smoke did not reload the completed run from persisted save",
    );
    assertSmoke(
      persistedBankCoin >= bankCoin,
      "browser smoke did not reload clear coin from persisted save",
    );
    assertSmoke(
      persistedClearedLevelCount >= clearedLevelCount,
      "browser smoke did not reload cleared levels from persisted save",
    );
    assertSmoke(
      readHtmlAttribute(persistedSmokeTag, "data-nfo-selected-level-cleared") === "1",
      "browser smoke did not reload the selected level as cleared",
    );
    assertSmoke(!persistedStdout.includes("Application error"), "browser smoke reload rendered an application error");

    const screenshotStats = await captureAndInspectBrowserScreenshot(
      browserBin,
      userDataDir,
      url,
      args,
    );

    if (stderr.trim()) {
      console.log(`note - browser stderr: ${stderr.trim().split("\n").slice(0, 3).join(" | ")}`);
    }
    console.log(
      `ok - browser screenshot ${path.relative(process.cwd(), args.screenshotPath)} `
        + `${screenshotStats.width}x${screenshotStats.height} `
        + `colors=${screenshotStats.distinctColorCount}`,
    );
    console.log(`ok - browser interaction smoke completed via ${path.basename(browserBin)}`);
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function dumpBrowserDom(browserBin, userDataDir, url, args) {
  return execFileAsync(
    browserBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-dev-shm-usage",
      `--host-resolver-rules=${LOCAL_ONLY_HOST_RESOLVER_RULES}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDir}`,
      `--virtual-time-budget=${args.browserVirtualTimeMs}`,
      "--dump-dom",
      url,
    ],
    {
      timeout: args.timeoutMs + args.browserVirtualTimeMs + 5000,
      maxBuffer: 50 * 1024 * 1024,
    },
  );
}

async function captureAndInspectBrowserScreenshot(browserBin, userDataDir, url, args) {
  await mkdir(path.dirname(args.screenshotPath), { recursive: true });
  await execFileAsync(
    browserBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-dev-shm-usage",
      `--host-resolver-rules=${LOCAL_ONLY_HOST_RESOLVER_RULES}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDir}`,
      "--window-size=1280,900",
      `--virtual-time-budget=${args.browserVirtualTimeMs}`,
      `--screenshot=${args.screenshotPath}`,
      url,
    ],
    {
      timeout: args.timeoutMs + args.browserVirtualTimeMs + 5000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const stats = inspectPngScreenshot(await readFile(args.screenshotPath));
  assertSmoke(
    stats.width >= 960 && stats.height >= 540,
    `browser screenshot was unexpectedly small: ${stats.width}x${stats.height}`,
  );
  assertSmoke(
    stats.distinctColorCount >= 16 && stats.luminanceRange >= 24,
    `browser screenshot looked blank: ${stats.distinctColorCount} colors, `
      + `luminance range ${stats.luminanceRange}`,
  );
  return stats;
}

function inspectPngScreenshot(buffer) {
  assertSmoke(buffer.length > 0, "browser screenshot file was empty");
  assertSmoke(buffer.subarray(0, 8).equals(Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])), "browser screenshot was not a PNG");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assertSmoke(dataEnd + 4 <= buffer.length, `truncated PNG chunk ${type}`);

    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer.readUInt8(dataStart + 8);
      colorType = buffer.readUInt8(dataStart + 9);
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  assertSmoke(width > 0 && height > 0, "PNG screenshot was missing IHDR dimensions");
  assertSmoke(bitDepth === 8, `unsupported PNG bit depth ${bitDepth}`);
  const bytesPerPixel = getPngBytesPerPixel(colorType);
  const channelRows = inflateSync(Buffer.concat(idatChunks));
  const stride = width * bytesPerPixel;
  assertSmoke(
    channelRows.length >= (stride + 1) * height,
    "PNG screenshot pixel data was shorter than expected",
  );

  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const distinctColors = new Set();
  let minLuminance = 255;
  let maxLuminance = 0;

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filterType = channelRows.readUInt8(rowStart);
    const source = channelRows.subarray(rowStart + 1, rowStart + 1 + stride);
    unfilterPngRow(filterType, source, current, previous, bytesPerPixel);

    const sampleModulo = y % 8 === 0 ? 8 : 32;
    for (let x = 0; x < width; x += sampleModulo) {
      const offsetInRow = x * bytesPerPixel;
      const [red, green, blue] = readPngRgb(current, offsetInRow, colorType);
      const luminance = Math.round((red * 0.2126) + (green * 0.7152) + (blue * 0.0722));
      minLuminance = Math.min(minLuminance, luminance);
      maxLuminance = Math.max(maxLuminance, luminance);
      distinctColors.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }

    previous.set(current);
  }

  return {
    width,
    height,
    distinctColorCount: distinctColors.size,
    luminanceRange: maxLuminance - minLuminance,
  };
}

function getPngBytesPerPixel(colorType) {
  if (colorType === 0) {
    return 1;
  }
  if (colorType === 2) {
    return 3;
  }
  if (colorType === 6) {
    return 4;
  }
  throw new Error(`unsupported PNG color type ${colorType}`);
}

function unfilterPngRow(filterType, source, current, previous, bytesPerPixel) {
  for (let index = 0; index < source.length; index += 1) {
    const raw = source[index];
    const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;

    if (filterType === 0) {
      current[index] = raw;
    } else if (filterType === 1) {
      current[index] = (raw + left) & 0xff;
    } else if (filterType === 2) {
      current[index] = (raw + up) & 0xff;
    } else if (filterType === 3) {
      current[index] = (raw + Math.floor((left + up) / 2)) & 0xff;
    } else if (filterType === 4) {
      current[index] = (raw + paethPredictor(left, up, upLeft)) & 0xff;
    } else {
      throw new Error(`unsupported PNG filter type ${filterType}`);
    }
  }
}

function paethPredictor(left, up, upLeft) {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  if (upDistance <= upLeftDistance) {
    return up;
  }
  return upLeft;
}

function readPngRgb(row, offset, colorType) {
  if (colorType === 0) {
    const value = row[offset];
    return [value, value, value];
  }
  return [row[offset], row[offset + 1], row[offset + 2]];
}

async function resolveBrowserBin(explicitPath) {
  const candidates = [
    explicitPath,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "google-chrome",
    "chrome",
    "chromium",
    "msedge",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await canRunBrowser(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "No headless Chrome or Edge binary found. Set NFO_SMOKE_BROWSER_BIN or pass --browser-bin.",
  );
}

async function canRunBrowser(browserBin) {
  try {
    await execFileAsync(browserBin, ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function extractSmokeTag(html) {
  return html.match(/<[^>]*id="nfo-smoke-state"[^>]*>/)?.[0] ?? "";
}

function readHtmlAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`${escapedName}="([^"]*)"`))?.[1] ?? "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await expectText(args.baseUrl, "/bandori/nfo", args.timeoutMs);
  await expectText(args.baseUrl, "/zh-CN/bandori/nfo", args.timeoutMs);
  const apiRuntimeData = await smokeApiRuntime(args.baseUrl, args.timeoutMs);
  await smokeStaticRuntime(args.baseUrl, apiRuntimeData, args.timeoutMs);
  await smokeBrowserInteraction(args.baseUrl, args);

  console.log(`ok - NFO smoke passed for ${args.baseUrl}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
