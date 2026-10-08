import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { before, after } from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { handleOurNotesTrackerRequest } from "../src/lib/ournotes/event-tracker/api-server.ts";
import { parseOurNotesTrackerManifest, parseOurNotesTrackerPack } from "../src/lib/ournotes/event-tracker/contract.ts";

const fixture = JSON.parse(await readFile(new URL("./fixtures/ournotes-tracker-publication.json", import.meta.url), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const golden = (kind) => fixture.artifacts.find((entry) => entry.kind === kind);
const rawPayload = (kind) => JSON.parse(gunzipSync(Buffer.from(golden(kind).gzipBase64, "base64")));
let root;
let eventId = 100;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "hhwx-ournotes-tracker-"));
  process.env.OURNOTES_TRACKER_LOCAL_STORE_ROOT = root;
});
after(async () => {
  delete process.env.OURNOTES_TRACKER_LOCAL_STORE_ROOT;
  await rm(root, { recursive: true, force: true });
});
async function object(key, bytes) {
  const path = join(root, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}
async function history(kind, options = {}) {
  const id = options.eventId ?? eventId++;
  const server = options.server ?? "jp";
  const raw = options.payload ?? rawPayload(kind);
  if (kind === "data") Object.assign(raw, { schemaVersion: 1, kind: "event", server, eventId: id });
  const prefix = `ournotes/trackerdata/${kind === "topdata" ? "topdata/" : ""}events/${id}/${server}`;
  const bytes = options.bytes ?? gzipSync(JSON.stringify(raw));
  const key = `${prefix}/packs/event/${sha(bytes)}.json.gz`;
  const descriptor = { key, compressedSha256: sha(bytes), compressedSize: bytes.length, semanticSha256: sha(canonical(raw)),
    ...(kind === "data" ? { recordCount: Object.values(raw.tiers).flat().length, tierCount: Object.keys(raw.tiers).length }
      : { pointCount: raw.points.length, userCount: raw.users.length, sampleCount: new Set(raw.points.map((p) => p.time)).size }) };
  const manifest = { schemaVersion: 1, kind: kind === "data" ? "events" : "eventTop10", server, eventId: id,
    generation: options.generation ?? 1, publishedAt: "2026-10-08T00:00:00Z",
    ...(kind === "data" ? { preserveIrregularPoints: true, packs: { event: descriptor }, recentPackKeys: { event: [key] } }
      : { pack: descriptor, recentPackKeys: [key] }) };
  options.mutate?.(manifest, descriptor);
  await object(key, bytes);
  const manifestKey = `${prefix}/manifest.json`;
  await object(manifestKey, JSON.stringify(manifest));
  return { id, key, bytes, manifest, manifestKey, raw };
}
async function request(kind, query) {
  const response = await handleOurNotesTrackerRequest(new Request(`http://localhost/api/ournotes/tracker/${kind}?${query}`), kind);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("cloudflare-cdn-cache-control"), "no-store");
  return { status: response.status, body: await response.json() };
}
const query = (id, kind, server = 0) => `server=${server}&eventId=${id}${kind === "data" ? "&tier=100" : ""}`;
async function withEnv(values, fn) {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("reads preserved Rust publications with both hashes, complete projection, and unified envelopes", async () => {
  for (const entry of fixture.artifacts) {
    const descriptor = entry.kind === "data" ? entry.manifest.packs.event : entry.manifest.pack;
    const bytes = Buffer.from(entry.gzipBase64, "base64");
    const raw = JSON.parse(gunzipSync(bytes));
    assert.equal(sha(bytes), descriptor.compressedSha256);
    assert.equal(sha(canonical(raw)), descriptor.semanticSha256);
    await object(descriptor.key, bytes);
    await object(descriptor.key.split("/packs/")[0] + "/manifest.json", JSON.stringify(entry.manifest));
    const result = await request(entry.kind, query(1, entry.kind));
    assert.equal(result.status, 200);
    assert.deepEqual(Object.keys(result.body), ["success", "data"]);
    if (entry.kind === "data") {
      assert.deepEqual(result.body.data, { cutoffs: raw.tiers["100"].map(([time, value]) => ({ time, value })) });
    } else {
      assert.deepEqual(result.body.data, { points: raw.points, users: raw.users.map((user) => ({
        id: user.id, profileId: user.profile_id, name: user.name, rankExp: user.rank_exp,
        lastUpdatedAt: user.last_updated_at, favoriteMemberCardMasterId: user.favorite_member_card_master_id,
      })) });
      assert.equal(result.body.data.points.filter((point) => point.time === raw.points[0].time).length, 11);
    }
  }
});

test("maps all four servers independently; accepts zero/default fields and preserves order", async () => {
  for (const [server, code] of [[0, "jp"], [1, "en"], [2, "tw"], [4, "kr"]]) {
    const payload = rawPayload("topdata");
    payload.points = payload.points.slice(0, 11).reverse();
    payload.points[0].value = 0;
    Object.assign(payload.users[0], { name: "", profile_id: 0, rank_exp: 0, last_updated_at: 0, favorite_member_card_master_id: 0 });
    const top = await history("topdata", { server: code, payload });
    const result = await request("topdata", query(top.id, "topdata", server));
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data.points, payload.points);
    assert.deepEqual(result.body.data.users[0], { id: payload.users[0].id, profileId: 0, name: "", rankExp: 0, lastUpdatedAt: 0, favoriteMemberCardMasterId: 0 });
    const ordinary = await history("data", { server: code, payload: { tiers: { 100: [[1000, 0], [2000, -1]] } } });
    assert.deepEqual((await request("data", query(ordinary.id, "data", server))).body.data.cutoffs, [{ time: 1000, value: 0 }, { time: 2000, value: -1 }]);
  }
});

test("validates complete query syntax, exact parameter set, active servers and supported tiers", async () => {
  for (const kind of ["data", "topdata"]) {
    for (const invalid of ["", query(1, kind, 3), query(1, kind, 5), query(1, kind) + "&server=0", query(1, kind) + "&type=event",
      query(1, kind).replace("eventId=1", "event=1"), ...["0", "01", "1x", "1e2", "+1", "-1", "1.0", "9007199254740992"].map((id) => query(id, kind))]) {
      const result = await request(kind, invalid);
      assert.equal(result.status, 400, invalid);
      assert.equal(result.body.success, false);
      assert.equal(result.body.error.code, "INVALID_REQUEST");
    }
  }
  for (const tier of [1, 10, 11, 20, 99]) {
    assert.equal((await request("data", `server=0&eventId=1&tier=${tier}`)).status, 404);
  }
});

test("missing publications and missing supported tiers are normal empty responses", async () => {
  assert.deepEqual(await request("data", query(eventId++, "data")), { status: 200, body: { success: true, data: { cutoffs: [] } } });
  assert.deepEqual(await request("topdata", query(eventId++, "topdata")), { status: 200, body: { success: true, data: { points: [], users: [] } } });
  const saved = await history("data", { payload: { tiers: { 101: [[1000, 1]] } } });
  assert.deepEqual((await request("data", query(saved.id, "data"))).body.data, { cutoffs: [] });
});

test("retains nine cutoff tiers and rejects all seven retired companion ranks", async () => {
  const tiers = [100, 101, 1000, 5000, 10000, 20000, 30000, 50000, 100000];
  const saved = await history("data", { payload: { tiers: Object.fromEntries(tiers.map((tier) => [tier, [[1000, tier]]])) } });
  for (const tier of tiers) {
    assert.deepEqual(await request("data", `server=0&eventId=${saved.id}&tier=${tier}`),
      { status: 200, body: { success: true, data: { cutoffs: [{ time: 1000, value: tier }] } } });
  }
  for (const tier of [1001, 5001, 10001, 20001, 30001, 50001, 100001]) {
    const result = await request("data", `server=0&eventId=${saved.id}&tier=${tier}`);
    assert.equal(result.status, 404);
    assert.equal(result.body.error.code, "TRACKER_TIER_NOT_SUPPORTED");
    const retired = await history("data", { payload: { tiers: { [tier]: [[1000, 1]] } } });
    const { descriptor } = parseOurNotesTrackerManifest(retired.manifest, { kind: "data", server: "jp", eventId: retired.id });
    assert.throws(() => parseOurNotesTrackerPack(retired.raw, descriptor));
  }
});

test("returns the earliest 5000 ordinary rows without changing complete pack validation", async () => {
  const saved = await history("data", { payload: { tiers: { 100: Array.from({ length: 5001 }, (_, n) => [n + 1, n]) } } });
  const result = await request("data", query(saved.id, "data"));
  assert.equal(result.status, 200);
  assert.equal(result.body.data.cutoffs.length, 5000);
  assert.deepEqual(result.body.data.cutoffs.at(-1), { time: 5000, value: 4999 });
  assert.equal("meta" in result.body, false);
});

test("rejects missing required descriptors, identity/path/count mismatches and obsolete finality fields", async () => {
  for (const kind of ["data", "topdata"]) {
    const mutations = [
      (m) => { m.server = "kr"; }, (m) => { m.eventId++; }, (m) => { m.schemaVersion = 2; },
      (m) => { m.generation = 0; }, (m) => { m.publishedAt = "yesterday"; },
      (m) => { m.hasFinalSample = true; },
      (_m, d) => { d.key = "other/packs/event/" + d.compressedSha256 + ".json.gz"; },
      (_m, d) => { d.compressedSize = 2 * 1024 * 1024 + 1; },
      (_m, d) => { d[kind === "data" ? "recordCount" : "pointCount"]++; },
      (m) => { if (kind === "data") delete m.packs.event; else delete m.pack; },
    ];
    for (const mutate of mutations) {
      const saved = await history(kind, { mutate });
      const result = await request(kind, query(saved.id, kind));
      assert.equal(result.status, 503);
      assert.deepEqual(result.body, { success: false, error: { code: "TRACKER_HISTORY_UNAVAILABLE", message: "Tracker history is temporarily unavailable." } });
    }
  }
});

test("checks pack content before projection, including counts, references, two-item points and safe integers", () => {
  for (const kind of ["data", "topdata"]) {
    const entry = golden(kind);
    const { descriptor } = parseOurNotesTrackerManifest(entry.manifest, { kind, server: "jp", eventId: 1 });
    const mutations = kind === "data" ? [
      (p) => { p.tiers[100][0].push(1); }, (p) => { p.tiers[100][1][0] = p.tiers[100][0][0]; },
      (p) => { p.tiers[100][0][1] = Number.MAX_SAFE_INTEGER + 1; },
      (p) => { p.tiers[10] = p.tiers[100]; delete p.tiers[100]; },
    ] : [
      (p) => { p.points[1].id = p.points[0].id; }, (p) => { p.points[0].id = "missing"; },
      (p) => { p.points[11].time = p.points[0].time; }, (p) => { p.points[0].time = p.points[1].time + 1; },
      (p) => { p.users.reverse(); }, (p) => { p.users[0].deck = []; },
      (p) => { p.users[0].profile_id = Number.MAX_SAFE_INTEGER + 1; },
      (p) => { p.users[0].rank_exp = 2_147_483_648; },
    ];
    for (const mutate of mutations) {
      const raw = rawPayload(kind);
      mutate(raw);
      assert.throws(() => parseOurNotesTrackerPack(raw, descriptor));
    }
  }
});

test("rejects missing packs, byte/hash mismatches, corrupt gzip and decompression overflow", async () => {
  for (const kind of ["data", "topdata"]) {
    for (const failure of ["missing", "compressedHash", "semanticHash", "size", "gzip", "overflow", "manifestSize"]) {
      const saved = await history(kind, {
        bytes: failure === "gzip" ? Buffer.from("invalid-gzip") : failure === "overflow" ? gzipSync(" ".repeat(16 * 1024 * 1024 + 1)) : undefined,
        mutate: (_m, d) => { if (failure === "semanticHash") d.semanticSha256 = "0".repeat(64); if (failure === "size") d.compressedSize++; },
      });
      if (failure === "missing") await rm(join(root, saved.key));
      if (failure === "compressedHash") await object(saved.key, Buffer.alloc(saved.bytes.length));
      if (failure === "manifestSize") await object(saved.manifestKey, " ".repeat(65537));
      assert.equal((await request(kind, query(saved.id, kind))).status, 503, `${kind}/${failure}`);
    }
  }
});

test("refreshes manifests, bounds stale fallback and does not interpret a missing root as stale", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  for (const kind of ["data", "topdata"]) {
    const first = await history(kind);
    const initial = await request(kind, query(first.id, kind));
    assert.equal(initial.status, 200);
    const payload = rawPayload(kind);
    if (kind === "data") payload.tiers[100][0][1] = 123;
    else payload.points[0].value = 123;
    const updated = await history(kind, { eventId: first.id, payload, generation: 2 });
    assert.deepEqual(await request(kind, query(first.id, kind)), initial);
    now += 60_001;
    const fresh = await request(kind, query(first.id, kind));
    assert.equal(fresh.status, 200);
    assert.notDeepEqual(fresh.body, initial.body);
    await object(updated.manifestKey, "{}");
    now += 60_001;
    assert.deepEqual(await request(kind, query(first.id, kind)), fresh);
    now += 6 * 60 * 60 * 1000;
    assert.equal((await request(kind, query(first.id, kind))).status, 503);
    now += 60_001;
    await rm(join(root, updated.manifestKey));
    assert.deepEqual((await request(kind, query(first.id, kind))).body.data, kind === "data" ? { cutoffs: [] } : { points: [], users: [] });
    now += 60_001;
    await object(updated.manifestKey, "{}");
    assert.equal((await request(kind, query(first.id, kind))).status, 503);
  }
});

test("uses signed public-bucket reads, coalesces concurrent reads, cools down failures and isolates sources", async (t) => {
  const saved = await history("topdata");
  const reads = [];
  let failure = false;
  const server = createServer((req, res) => {
    reads.push(req.url);
    assert.match(req.headers.authorization, /^AWS4-HMAC-SHA256 Credential=test-access\//);
    assert.ok(req.headers["x-amz-date"]);
    const key = req.url.replace("/tracker-public/", "");
    const body = failure ? Buffer.from("unavailable") : key === saved.key ? saved.bytes : key === saved.manifestKey ? Buffer.from(JSON.stringify(saved.manifest)) : null;
    res.writeHead(failure ? 503 : body ? 200 : 404, { "content-length": body?.length ?? 0 });
    res.end(body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await withEnv({ OURNOTES_TRACKER_LOCAL_STORE_ROOT: undefined, OURNOTES_R2_ENDPOINT: `http://127.0.0.1:${server.address().port}`,
      OURNOTES_PUBLIC_R2_BUCKET: "tracker-public", OURNOTES_R2_ACCESS_KEY_ID: "test-access", OURNOTES_R2_SECRET_ACCESS_KEY: "test-secret" }, async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => request("topdata", query(saved.id, "topdata"))));
      assert.ok(results.every((r) => r.status === 200));
      assert.deepEqual(reads.sort(), [`/tracker-public/${saved.key}`, `/tracker-public/${saved.manifestKey}`].sort());
      let now = Date.now() + 60_001;
      t.mock.method(Date, "now", () => now);
      failure = true;
      assert.equal((await request("topdata", query(saved.id, "topdata"))).status, 200);
      const readCount = reads.length;
      assert.equal((await request("topdata", query(saved.id, "topdata"))).status, 200);
      assert.equal(reads.length, readCount);
      now += 6 * 60 * 60 * 1000;
      assert.equal((await request("topdata", query(saved.id, "topdata"))).status, 503);
      await withEnv({ OURNOTES_PUBLIC_R2_BUCKET: "other-public" }, async () => {
        assert.equal((await request("topdata", query(saved.id, "topdata"))).status, 503);
      });
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("fails closed for missing configuration and production local overrides", async () => {
  await withEnv({ OURNOTES_TRACKER_LOCAL_STORE_ROOT: undefined, OURNOTES_PUBLIC_R2_BUCKET: undefined }, async () => {
    assert.equal((await request("data", query(1, "data"))).status, 503);
  });
  await withEnv({ NODE_ENV: "production" }, async () => {
    assert.equal((await request("data", query(1, "data"))).status, 503);
  });
});
