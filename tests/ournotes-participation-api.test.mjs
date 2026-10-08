import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { handleOurNotesParticipationRequest } from "../src/lib/ournotes/event-tracker/api-server.ts";
import { parseOurNotesParticipationManifest, parseOurNotesParticipationPack } from "../src/lib/ournotes/event-tracker/participation-contract.ts";

const fixture = JSON.parse(await readFile(new URL("./fixtures/ournotes-participation-publication.json", import.meta.url), "utf8"));
const bytes = Buffer.from(fixture.gzipBase64, "base64");
const payload = () => JSON.parse(gunzipSync(bytes));
const manifestKey = "ournotes/trackerdata/participation/manifest.json";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (v) => v === null || typeof v !== "object" ? JSON.stringify(v)
  : Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
    : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
async function object(root, key, body) {
  const path = join(root, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}
async function scope(fn) {
  const root = await mkdtemp(join(tmpdir(), "hhwx-participation-"));
  const saved = process.env.OURNOTES_TRACKER_LOCAL_STORE_ROOT;
  process.env.OURNOTES_TRACKER_LOCAL_STORE_ROOT = root;
  try { await fn(root); } finally {
    if (saved === undefined) delete process.env.OURNOTES_TRACKER_LOCAL_STORE_ROOT;
    else process.env.OURNOTES_TRACKER_LOCAL_STORE_ROOT = saved;
    await rm(root, { recursive: true, force: true });
  }
}
async function publish(root, manifest = fixture.manifest, body = bytes) {
  await object(root, manifest.pack.key, body);
  await object(root, manifestKey, JSON.stringify(manifest));
}
async function request(query = "") {
  const response = await handleOurNotesParticipationRequest(new Request(`http://localhost/api/ournotes/tracker/participation${query}`));
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("cloudflare-cdn-cache-control"), "no-store");
  return { status: response.status, body: await response.json() };
}

test("reads actual Rust bytes and returns one complete event map with five fixed slots", async () => {
  const raw = payload();
  assert.equal(sha(bytes), fixture.manifest.pack.compressedSha256);
  assert.equal(sha(canonical(raw)), fixture.manifest.pack.semanticSha256);
  assert.equal(gunzipSync(bytes).length, fixture.manifest.pack.jsonSize);
  await scope(async (root) => {
    await publish(root);
    assert.deepEqual(await request(), { status: 200, body: { success: true, data: raw.events } });
    assert.deepEqual(Object.keys(raw.events), ["1", "2"]);
    for (const event of Object.values(raw.events)) for (const slots of Object.values(event)) {
      assert.equal(slots.length, 5);
      assert.equal(slots[3], null);
    }
    assert.equal(raw.events["2"].firstCardRewardCount[0], 0);
    assert.equal(raw.events["2"].allPointRewardsCount[0], null);
  });
});

test("rejects filters and distinguishes unpublished history from failed reads", async () => {
  await scope(async () => {
    assert.deepEqual(await request(), { status: 200, body: { success: true, data: {} } });
    for (const query of ["?eventId=1", "?server=0", "?tier=100", "?x=", "?server=0&server=1"]) {
      const response = await request(query);
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "INVALID_REQUEST");
    }
  });
  await scope(async (root) => {
    await object(root, manifestKey, "{}");
    const response = await request();
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "TRACKER_HISTORY_UNAVAILABLE");
  });
});

test("validates the shared root identity, sizes, slots and count relationships", () => {
  for (const mutate of [
    (m) => { m.kind = "eventTop10"; }, (m) => { m.server = "jp"; },
    (m) => { m.pack.key = m.pack.key.replace("participation", "events/1/jp"); },
    (m) => { m.pack.jsonSize = 0; }, (m) => { m.pack.jsonSize = 16 * 1024 * 1024 + 1; },
    (m) => { m.pack.compressedSize = 2 * 1024 * 1024 + 1; },
    (m) => { m.generation = 0; }, (m) => { m.recentPackKeys = []; },
  ]) {
    const m = structuredClone(fixture.manifest);
    mutate(m);
    assert.throws(() => parseOurNotesParticipationManifest(m));
  }
  const { descriptor } = parseOurNotesParticipationManifest(fixture.manifest);
  for (const mutate of [
    (p) => { p.events["01"] = p.events["1"]; delete p.events["1"]; },
    (p) => { p.events["1"].participantCount.pop(); },
    (p) => { p.events["1"].participantCount[3] = 0; },
    (p) => { p.events["1"].participantCount[0] = -1; },
    (p) => { p.events["1"].participantCount[0] = 2 ** 31; },
    (p) => { p.events["1"].firstCardRewardCount[0] = 0; },
    (p) => { p.events["1"].lastCardRewardCount[0] = 31; },
    (p) => { p.events["1"].allNonEventItemRewardsCount[0] = 0; },
    (p) => { p.events["1"].lastCardRewardCount[3] = 1; },
    (p) => { p.events["1"].lastCardRewardCount = null; },
    (p) => { p.events["1"].participantCount[0] = 0; },
    (p) => { p.events["1"].participantCount[0] = "100"; },
    (p) => { p.events["1"].extra = []; }, (p) => { delete p.events["2"]; },
  ]) {
    const p = payload();
    mutate(p);
    assert.throws(() => parseOurNotesParticipationPack(p, descriptor));
  }
});

test("preserves early three-metric packs and validates relationships across null metrics", () => {
  const { descriptor } = parseOurNotesParticipationManifest(fixture.manifest);
  const raw = payload();
  for (const counts of Object.values(raw.events)) {
    delete counts.lastCardRewardCount;
    delete counts.allNonEventItemRewardsCount;
  }
  const { events } = parseOurNotesParticipationPack(raw, descriptor);
  assert.deepEqual(events["1"].lastCardRewardCount, [null, null, null, null, null]);
  assert.deepEqual(events["1"].allNonEventItemRewardsCount, [null, null, null, null, null]);
  assert.deepEqual(events["1"].firstCardRewardCount, raw.events["1"].firstCardRewardCount);
  const gap = payload();
  gap.events["1"].lastCardRewardCount[0] = null;
  gap.events["1"].allNonEventItemRewardsCount[0] = 31;
  assert.throws(() => parseOurNotesParticipationPack(gap, descriptor));
});

test("fails closed on missing packs, gzip, either hash, and declared JSON size", async () => {
  for (const failure of ["missing", "gzip", "compressedHash", "semanticHash", "jsonSize"]) {
    await scope(async (root) => {
      const m = structuredClone(fixture.manifest);
      if (failure === "semanticHash") m.pack.semanticSha256 = "0".repeat(64);
      if (failure === "jsonSize") m.pack.jsonSize++;
      const body = failure === "gzip" ? Buffer.from("bad-gzip") : bytes;
      if (failure === "gzip") {
        m.pack.compressedSize = body.length;
        m.pack.compressedSha256 = sha(body);
        m.pack.key = `ournotes/trackerdata/participation/packs/${sha(body)}.json.gz`;
        m.recentPackKeys = [m.pack.key];
      }
      await publish(root, m, body);
      if (failure === "missing") await rm(join(root, m.pack.key));
      if (failure === "compressedHash") await object(root, m.pack.key, Buffer.alloc(body.length));
      assert.equal((await request()).status, 503, failure);
    });
  }
});

test("refreshes the whole map and limits stale fallback when a newer publication is invalid", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  await scope(async (root) => {
    await publish(root);
    const old = await request();
    const raw = payload();
    raw.events["3"] = structuredClone(raw.events["1"]);
    const body = gzipSync(canonical(raw));
    const m = structuredClone(fixture.manifest);
    m.generation++;
    Object.assign(m.pack, { key: `ournotes/trackerdata/participation/packs/${sha(body)}.json.gz`,
      semanticSha256: sha(canonical(raw)), compressedSha256: sha(body), compressedSize: body.length,
      jsonSize: Buffer.byteLength(canonical(raw)), recordCount: 3 });
    m.recentPackKeys.unshift(m.pack.key);
    await publish(root, m, body);
    assert.deepEqual(await request(), old);
    now += 60_001;
    const fresh = await request();
    assert.deepEqual(fresh.body.data, raw.events);
    await object(root, manifestKey, "{}");
    now += 60_001;
    assert.deepEqual(await request(), fresh);
    now += 6 * 60 * 60 * 1000;
    assert.equal((await request()).status, 503);
  });
});
