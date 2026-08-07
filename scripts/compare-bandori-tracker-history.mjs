import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

import {
  BANDORI_CUTOFF_HISTORY_MAX_COMPRESSED_BYTES,
  BANDORI_CUTOFF_HISTORY_MAX_DECOMPRESSED_BYTES,
  BANDORI_CUTOFF_HISTORY_MAX_MANIFEST_BYTES,
  BANDORI_CUTOFF_HISTORY_MAX_ROWS,
  buildBandoriCutoffHistoryManifestKey,
  parseBandoriCutoffHistoryManifest,
  parseBandoriCutoffHistoryPack,
  selectBandoriCutoffHistoryCutoffs,
} from "../src/lib/bandori-cutoff-history-contract.ts";
import { fetchR2Object } from "../src/lib/r2-s3-reader.ts";

const PAGE_SIZE = 1_000;
const R2_BUDGET_MS = 3_000;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = nextEnv;

loadEnvConfig(repositoryRoot);

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function buildQuery() {
  const type = argument("--type", "event");
  if (type !== "event" && type !== "song" && type !== "monthly") {
    throw new Error("--type must be event, song, or monthly");
  }
  const targetId = Number(argument("--event"));
  const tier = Number(argument("--tier"));
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    throw new Error("--event must be a positive integer");
  }
  if (!Number.isSafeInteger(tier) || tier <= 0) {
    throw new Error("--tier must be a positive integer");
  }
  return { server: "cn", targetId, tier, type };
}

function getR2Config() {
  return {
    endpoint: requiredEnv("BANDORI_R2_ENDPOINT"),
    bucket: requiredEnv("BANDORI_PUBLIC_R2_BUCKET"),
    accessKeyId: requiredEnv("BANDORI_R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("BANDORI_R2_SECRET_ACCESS_KEY"),
  };
}

async function readManifest(config, query) {
  const response = await fetchR2Object(
    config,
    buildBandoriCutoffHistoryManifestKey(query),
    undefined,
    { maxBytes: BANDORI_CUTOFF_HISTORY_MAX_MANIFEST_BYTES, timeoutMs: R2_BUDGET_MS },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 manifest read failed with HTTP ${response.status}`);
  return parseBandoriCutoffHistoryManifest(await response.json(), query);
}

async function readR2Cutoffs(config, query) {
  const firstManifest = await readManifest(config, query);
  if (!firstManifest) {
    assert.equal(await readManifest(config, query), null, "manifest appeared during comparison");
    return { cutoffs: [], generation: null, descriptorHash: null };
  }
  if (!firstManifest.descriptor) {
    const secondManifest = await readManifest(config, query);
    assert.ok(secondManifest, "manifest disappeared during comparison");
    assert.equal(secondManifest.generation, firstManifest.generation, "manifest generation changed");
    assert.equal(secondManifest.descriptor, null, "manifest gained a pack during comparison");
    return { cutoffs: [], generation: firstManifest?.generation ?? null, descriptorHash: null };
  }
  const response = await fetchR2Object(
    config,
    firstManifest.descriptor.key,
    undefined,
    { maxBytes: BANDORI_CUTOFF_HISTORY_MAX_COMPRESSED_BYTES, timeoutMs: R2_BUDGET_MS },
  );
  if (!response.ok) throw new Error(`R2 pack read failed with HTTP ${response.status}`);
  const compressed = await response.buffer();
  assert.equal(compressed.length, firstManifest.descriptor.compressedSize, "compressed size mismatch");
  assert.equal(
    createHash("sha256").update(compressed).digest("hex"),
    firstManifest.descriptor.compressedSha256,
    "compressed hash mismatch",
  );
  const decompressed = gunzipSync(compressed, {
    maxOutputLength: BANDORI_CUTOFF_HISTORY_MAX_DECOMPRESSED_BYTES,
  });
  const parsed = parseBandoriCutoffHistoryPack(
    JSON.parse(decompressed.toString("utf8")),
    query,
    firstManifest.descriptor,
  );
  const secondManifest = await readManifest(config, query);
  assert.ok(secondManifest?.descriptor, "manifest lost the selected pack during comparison");
  assert.equal(secondManifest.generation, firstManifest.generation, "manifest generation changed");
  assert.equal(
    secondManifest.descriptor.compressedSha256,
    firstManifest.descriptor.compressedSha256,
    "manifest pack changed during comparison",
  );
  return {
    cutoffs: selectBandoriCutoffHistoryCutoffs(parsed, query.tier),
    generation: firstManifest.generation,
    descriptorHash: firstManifest.descriptor.compressedSha256,
  };
}

function toPoint(row) {
  return {
    time: Number(row.time),
    ep: Number(row.ep),
    ...(row.is_final ? { isFinal: true } : {}),
  };
}

function buildSongCutoffs(rows) {
  const groups = new Map();
  for (const row of rows) {
    const songId = Number(row.song_id ?? 0);
    const points = groups.get(songId) ?? [];
    points.push(toPoint(row));
    groups.set(songId, points);
  }
  if (groups.size === 0) return [];
  if (groups.size === 1 && groups.has(0)) return groups.get(0);
  return Object.fromEntries(
    Array.from(groups.entries())
      .sort(([left], [right]) => left - right)
      .map(([songId, points]) => [String(songId), points]),
  );
}

async function readSupabaseCutoffs(query) {
  const client = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
  const rows = [];
  for (let offset = 0; offset < BANDORI_CUTOFF_HISTORY_MAX_ROWS; offset += PAGE_SIZE) {
    const pageEnd = Math.min(offset + PAGE_SIZE, BANDORI_CUTOFF_HISTORY_MAX_ROWS) - 1;
    let result;
    if (query.type === "song") {
      result = await client
        .from("bandori_tracker_data")
        .select("time, ep, song_id, is_final")
        .eq("event_id", query.targetId)
        .eq("type", query.type)
        .eq("tier", query.tier)
        .order("song_id", { ascending: true })
        .order("time", { ascending: true })
        .range(offset, pageEnd);
    } else {
      result = await client
        .from("bandori_tracker_data")
        .select("time, ep, is_final")
        .eq("event_id", query.targetId)
        .eq("type", query.type)
        .eq("tier", query.tier)
        .eq("song_id", 0)
        .order("time", { ascending: true })
        .range(offset, pageEnd);
    }
    if (result.error) throw result.error;
    const pageRows = result.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }
  return query.type === "song" ? buildSongCutoffs(rows) : rows.map(toPoint);
}

function cutoffCount(cutoffs) {
  if (Array.isArray(cutoffs)) return cutoffs.length;
  return Object.values(cutoffs).reduce((total, points) => total + points.length, 0);
}

const query = buildQuery();
const r2 = await readR2Cutoffs(getR2Config(), query);
const supabaseCutoffs = await readSupabaseCutoffs(query);
assert.deepEqual(r2.cutoffs, supabaseCutoffs, "R2 and Supabase tracker histories differ");
console.log(JSON.stringify({
  matched: true,
  server: query.server,
  event: query.targetId,
  type: query.type,
  tier: query.tier,
  generation: r2.generation,
  compressedSha256: r2.descriptorHash,
  recordCount: cutoffCount(r2.cutoffs),
}, null, 2));
