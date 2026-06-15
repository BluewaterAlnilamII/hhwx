import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const REGION = "cn";
const RESOURCE_VERSION = "Android-2.1.1";
const DEFAULT_OUTPUT_DIR = path.join(
  "temp",
  "nfo-offline",
  REGION,
  RESOURCE_VERSION,
);
const ASSET_BASE_URL =
  "https://l4-prod-patch-bd.bilibiligame.net/assetbundle/nfo/Android/";
const CAPTURED_FLOW = "D:\\Workspace\\temp\\en_flows_20260614_184805.mitm";

const KNOWN_RESOURCES = [
  { type: "manifest", path: "Android-2.1.1" },
  { type: "bgm", path: "nfo/audio/bgm/bgm_01_852c024c8a7cc0618e3cc26ea3936520" },
  { type: "bgm", path: "nfo/audio/bgm/bgm_02_0222fc9403fef7c08e36a94ee0457919" },
  { type: "bgm", path: "nfo/audio/bgm/bgm_03_5b339cb1f550fe6ee111e1d294a2ad6d" },
  { type: "bgm", path: "nfo/audio/bgm/bgm_04_257ff9f928f9a1bd9531629224fd996a" },
  { type: "bgm", path: "nfo/audio/bgm/bgm_05_ca0a8eefa02b2b0effa9fcb557a26a7e" },
  { type: "bgm", path: "nfo/audio/bgm/bgm_06_b99fb006c83b87b99c096cdaa597dc17" },
  { type: "bgm", path: "nfo/audio/bgm/bgm_07_13990e117666fd5143a918950e9bb133" },
  { type: "bgm", path: "nfo/audio/bgm/bgm_08_29d6dc8ccfc2795a26229e2b41be6f81" },
  { type: "bgm", path: "nfo/audio/bgm/bgm_09_367304877d9656d781319e80779f1200" },
  { type: "bgm", path: "nfo/audio/bgm/bgm_10_68109c3afb63fc953c8c3a5f0698f350" },
  { type: "audio", path: "nfo/audio/se_4a34ecc64a854e628175f8b751fbe3cf" },
  { type: "audio", path: "nfo/audio/voice_f58a69c9257f33c28ac01746332d75dd" },
  { type: "data", path: "nfo/buff_b2feb356d7f0cd75b28ad802cecb34b3" },
  { type: "data", path: "nfo/bullet_16d650ee9e094bef9169beac4ecd1a87" },
  { type: "data", path: "nfo/chara_59a2f633865e30adc9dc333aef96ded1" },
  { type: "data", path: "nfo/data_0ff80651a7dbc235eb52ab440a58a76a" },
  { type: "data", path: "nfo/items_d8154a2088813a0bd6a55aa887ef9150" },
  { type: "data", path: "nfo/map_54f658fb0992cb00d073e4a5744ea4db" },
  { type: "data", path: "nfo/uiefx_6dc3725070368ee67dd7d7448b143e65" },
];

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    force: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output") {
      args.outputDir = argv[++i];
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/nfo-freeze-local.mjs [--output temp/nfo-offline/cn/Android-2.1.1] [--force] [--dry-run]

Downloads the currently captured CN NFO resource set into an ignored local
snapshot directory and writes snapshot-manifest.json plus source-urls.txt.`);
}

function resolveSourceUrl(relativePath) {
  return new URL(relativePath, ASSET_BASE_URL).toString();
}

function resolveLocalRawPath(outputDir, relativePath) {
  return path.join(outputDir, "raw", ...relativePath.split("/"));
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  const buffer = await readFile(filePath);
  hash.update(buffer);
  return hash.digest("hex");
}

async function headResource(sourceUrl) {
  try {
    const response = await fetch(sourceUrl, { method: "HEAD" });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        contentLength: null,
        contentType: null,
      };
    }
    return {
      ok: true,
      status: response.status,
      contentLength: Number(response.headers.get("content-length")) || null,
      contentType: response.headers.get("content-type"),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      contentLength: null,
      contentType: null,
      error: String(error),
    };
  }
}

async function downloadResource(sourceUrl, destinationPath) {
  const response = await fetch(sourceUrl);
  if (!response.ok || !response.body) {
    throw new Error(`GET ${sourceUrl} failed with ${response.status}`);
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destinationPath));

  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
  };
}

async function freezeResource(resource, args, frozenAt) {
  const sourceUrl = resolveSourceUrl(resource.path);
  const destinationPath = resolveLocalRawPath(args.outputDir, resource.path);
  const head = await headResource(sourceUrl);
  const alreadyExists = await fileExists(destinationPath);

  if (args.dryRun) {
    return {
      ...resource,
      sourceUrl,
      rawPath: path.relative(args.outputDir, destinationPath).replaceAll(path.sep, "/"),
      size: head.contentLength,
      sha256: null,
      contentType: head.contentType,
      httpStatus: head.status,
      frozenAt: null,
      status: alreadyExists ? "exists" : "would-download",
    };
  }

  if (!alreadyExists || args.force) {
    console.log(`GET ${resource.path}`);
    await downloadResource(sourceUrl, destinationPath);
  } else {
    console.log(`SKIP ${resource.path}`);
  }

  const stats = await stat(destinationPath);
  const sha256 = await hashFile(destinationPath);

  return {
    ...resource,
    sourceUrl,
    rawPath: path.relative(args.outputDir, destinationPath).replaceAll(path.sep, "/"),
    size: stats.size,
    sha256,
    contentType: head.contentType,
    httpStatus: head.status,
    frozenAt,
    status: alreadyExists && !args.force ? "existing" : "downloaded",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(args.outputDir);
  const frozenAt = new Date().toISOString();

  await mkdir(outputDir, { recursive: true });

  const entries = [];
  for (const resource of KNOWN_RESOURCES) {
    entries.push(await freezeResource(resource, { ...args, outputDir }, frozenAt));
  }

  const manifest = {
    schemaVersion: 1,
    purpose: "cn-first-local-freeze",
    region: REGION,
    resourceVersion: RESOURCE_VERSION,
    assetBaseUrl: ASSET_BASE_URL,
    capturedFlow: CAPTURED_FLOW,
    createdAt: frozenAt,
    longTermMirror: false,
    entries,
  };

  await writeFile(
    path.join(outputDir, "snapshot-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(outputDir, "source-urls.txt"),
    `${entries.map((entry) => entry.sourceUrl).join("\n")}\n`,
    "utf8",
  );

  const totalSize = entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0);
  console.log(
    `Wrote ${entries.length} entries to ${path.join(outputDir, "snapshot-manifest.json")}`,
  );
  console.log(`Total local size: ${(totalSize / 1024 / 1024).toFixed(2)} MiB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
