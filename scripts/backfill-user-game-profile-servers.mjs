import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { inspectStoredGameProfileServer } from "../src/lib/user-game-profile-server-backfill-server.ts";

const PAGE_SIZE = 500;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = nextEnv;

loadEnvConfig(repositoryRoot);

function requiredEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

function parseMode() {
  const args = process.argv.slice(2);
  const unknown = args.filter((argument) => argument !== "--apply");
  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown.join(", ")}`);
  }
  return { apply: args.includes("--apply") };
}

function transitionKey(storedServer, payloadServer) {
  return `${storedServer ?? "invalid"}->${payloadServer}`;
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function printCounts(label, counts) {
  if (counts.size === 0) return;
  console.log(`${label}:`);
  for (const [key, count] of Array.from(counts).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`  ${key}: ${count}`);
  }
}

async function readManualProfileRows(client) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await client
      .from("user_game_profiles")
      .select("id, server, storage_codec, payload_compressed, payload_sha256, payload_size")
      .eq("profile_kind", "manual")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function main() {
  const { apply } = parseMode();
  const client = createClient(
    requiredEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const rows = await readManualProfileRows(client);
  const mismatches = [];
  const transitions = new Map();
  const failures = new Map();
  let matching = 0;

  for (const row of rows) {
    try {
      const inspection = inspectStoredGameProfileServer(row);
      if (inspection.matches) {
        matching += 1;
        continue;
      }
      mismatches.push({
        id: row.id,
        originalServer: row.server,
        payloadServer: inspection.payloadServer,
        payloadSha256: row.payload_sha256,
      });
      increment(transitions, transitionKey(inspection.storedServer, inspection.payloadServer));
    } catch (error) {
      increment(failures, error instanceof Error ? error.message : "Unknown inspection failure");
    }
  }

  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Manual profiles scanned: ${rows.length}`);
  console.log(`Already correct: ${matching}`);
  console.log(`Server mismatches: ${mismatches.length}`);
  console.log(`Unreadable or invalid payloads: ${Array.from(failures.values()).reduce((sum, count) => sum + count, 0)}`);
  printCounts("Mismatch transitions", transitions);
  printCounts("Inspection failures", failures);

  if (!apply) {
    console.log("No rows changed. Re-run with --apply after reviewing this audit.");
    return;
  }
  if (failures.size > 0) {
    throw new Error("Refusing to apply while unreadable or invalid manual profile payloads exist");
  }

  let updated = 0;
  let concurrentlyChanged = 0;
  for (const mismatch of mismatches) {
    const result = await client
      .from("user_game_profiles")
      .update({ server: mismatch.payloadServer })
      .eq("id", mismatch.id)
      .eq("profile_kind", "manual")
      .eq("server", mismatch.originalServer)
      .eq("payload_sha256", mismatch.payloadSha256)
      .select("id");
    if (result.error) throw result.error;
    if ((result.data ?? []).length === 1) updated += 1;
    else concurrentlyChanged += 1;
  }

  console.log(`Rows updated: ${updated}`);
  console.log(`Rows skipped after concurrent change: ${concurrentlyChanged}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
