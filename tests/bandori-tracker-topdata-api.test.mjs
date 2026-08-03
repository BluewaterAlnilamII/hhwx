import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { gzipSync } from "node:zlib";

import { handleBandoriTrackerTopDataRequest } from "../src/lib/bandori-tracker-topdata-server.ts";
import { countBandoriTopDataSamples } from "../src/lib/bandori-topdata-contract.ts";

let storeRoot;

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function payload(time = 1_785_501_041_920) {
  return {
    points: Array.from({ length: 10 }, (_, index) => ({
      time,
      uid: 1_001 + index,
      value: 1_000_000 - index,
    })),
    users: Array.from({ length: 10 }, (_, index) => ({
      uid: 1_001 + index,
      name: `Player ${index + 1}`,
      introduction: index === 0 ? "Hello" : "",
      rank: 300,
      sid: index === 0 ? 0 : 1_801 + index,
      strained: index % 2,
      degrees: index === 0 ? [] : [8_508, 20_094],
    })),
  };
}

async function writeObject(key, body) {
  const path = join(storeRoot, ...key.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

async function writeHistory(eventId, value, options = {}) {
  const uncompressed = Buffer.from(JSON.stringify(value), "utf8");
  const compressed = options.corrupt
    ? Buffer.from("not-gzip", "utf8")
    : gzipSync(uncompressed, { mtime: 0 });
  const compressedSha256 = createHash("sha256").update(compressed).digest("hex");
  const prefix = `bandori/trackerdata/topdata/events/${eventId}/cn`;
  const packKey = `${prefix}/packs/event/${compressedSha256}.json.gz`;
  const hasFinalSample = options.hasFinalSample === true;
  const descriptor = {
    key: packKey,
    semanticSha256: createHash("sha256").update(canonicalJson(value)).digest("hex"),
    compressedSha256,
    compressedSize: compressed.length,
    pointCount: value.points.length,
    userCount: value.users.length,
    sampleCount: countBandoriTopDataSamples(value.points),
    hasFinalSample,
  };
  const manifest = {
    schemaVersion: 1,
    kind: "eventTop10",
    server: "cn",
    eventId,
    generation: 1,
    publishedAt: new Date().toISOString(),
    hasFinalSample,
    pack: descriptor,
    recentPackKeys: [packKey],
  };
  await writeObject(packKey, compressed);
  const manifestKey = `${prefix}/manifest.json`;
  await writeObject(manifestKey, Buffer.from(JSON.stringify(manifest), "utf8"));
  return { packKey, manifestKey, manifest };
}

async function request(query) {
  return handleBandoriTrackerTopDataRequest(new Request(`http://localhost/api/bandori/tracker/topdata?${query}`));
}

before(async () => {
  storeRoot = await mkdtemp(join(tmpdir(), "hhwx-topdata-"));
  process.env.BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT = storeRoot;
});

after(async () => {
  delete process.env.BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT;
  await rm(storeRoot, { recursive: true, force: true });
});

test("returns the exact Bestdori-compatible history body and ignores unrelated parameters", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/bandori-topdata-python-writer.json", import.meta.url),
    "utf8",
  ));
  assert.equal(fixture.producer, "hhwx-tracker TopDataHistoryRepository");
  await writeObject(fixture.manifest.pack.key, Buffer.from(fixture.packBase64, "base64"));
  await writeObject(
    `bandori/trackerdata/topdata/events/${fixture.eventId}/cn/manifest.json`,
    Buffer.from(JSON.stringify(fixture.manifest), "utf8"),
  );
  const expected = fixture.expected;
  const response = await request("server=3&event=318&type=event&interval=1&latest=1&mid=99&unknown=x");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /(?:^|,\s*)no-store(?:,|$)/u);
  assert.deepEqual(await response.json(), expected);

  const emptyTypeResponse = await request("server=3&event=318&type=");
  assert.equal(emptyTypeResponse.status, 200);
  assert.deepEqual(await emptyTypeResponse.json(), expected);
});

test("returns the exact empty protocol when the manifest does not exist", async () => {
  const response = await request("server=3&event=319");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { points: [], users: [] });
});

test("returns mixed partial TOP10 history without changing the Bestdori wire shape", async () => {
  const base = 1_785_501_041_920;
  const complete = payload(base + 60_000);
  const mixed = {
    points: [
      ...payload(base).points.slice(0, 1),
      ...payload(base + 30_000).points.slice(0, 5),
      ...complete.points,
    ],
    users: complete.users,
  };
  await writeHistory(329, mixed);

  const response = await request("server=3&event=329&type=event");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), mixed);
});

test("preserves BBCode, line feeds, and literal backslash-n text through the API", async () => {
  const value = payload(1_785_501_131_920);
  value.users[0].name = "[b]Player[/b]";
  value.users[0].introduction = "real line one\nreal line two\\nliteral text";
  await writeHistory(333, value);

  const response = await request("server=3&event=333&type=event");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), value);
});

test("validates only the supported contract parameters", async () => {
  for (const query of [
    "server=0&event=318",
    "server=3&event=",
    "server=3&event=1.5",
    "server=3&event=2147483648",
    "server=3&event=318&type=song",
  ]) {
    const response = await request(query);
    assert.equal(response.status, 400, query);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "INVALID_REQUEST");
  }
});

test("returns an explicit HHWX error for a referenced corrupt pack", async () => {
  await writeHistory(320, payload(1_785_501_071_920), { corrupt: true });
  const response = await request("server=3&event=320&type=event");
  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control"), /(?:^|,\s*)no-store(?:,|$)/u);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "TRACKER_HISTORY_UNAVAILABLE");
});

test("returns unavailable when a referenced pack is missing or has a semantic mismatch", async () => {
  const missing = await writeHistory(321, payload(1_785_501_081_920));
  await rm(join(storeRoot, ...missing.packKey.split("/")));
  let response = await request("server=3&event=321");
  assert.equal(response.status, 503);

  const mismatched = await writeHistory(322, payload(1_785_501_091_920));
  mismatched.manifest.pack.semanticSha256 = "0".repeat(64);
  await writeObject(
    mismatched.manifestKey,
    Buffer.from(JSON.stringify(mismatched.manifest), "utf8"),
  );
  response = await request("server=3&event=322");
  assert.equal(response.status, 503);
});

test("rejects referenced empty history and an incorrect feasible sample count", async () => {
  await writeHistory(331, { points: [], users: [] });
  let response = await request("server=3&event=331");
  assert.equal(response.status, 503);

  const wrongCount = await writeHistory(332, payload(1_785_501_091_930));
  wrongCount.manifest.pack.sampleCount = 2;
  await writeObject(
    wrongCount.manifestKey,
    Buffer.from(JSON.stringify(wrongCount.manifest), "utf8"),
  );
  response = await request("server=3&event=332");
  assert.equal(response.status, 503);
});

test("serves bounded active stale data during failure cooldown and then expires it", async () => {
  const originalNow = Date.now;
  let now = 1_800_000_000_000;
  Date.now = () => now;
  try {
    const written = await writeHistory(323, payload(1_785_501_101_920));
    let response = await request("server=3&event=323");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), payload(1_785_501_101_920));

    now += 60_001;
    await writeObject(written.manifestKey, Buffer.from("{", "utf8"));
    response = await request("server=3&event=323");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), payload(1_785_501_101_920));

    response = await request("server=3&event=323");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), payload(1_785_501_101_920));

    now += 6 * 60 * 60 * 1_000 + 1;
    response = await request("server=3&event=323");
    assert.equal(response.status, 503);
  } finally {
    Date.now = originalNow;
  }
});

test("a manifest 404 clears an older stale target", async () => {
  const originalNow = Date.now;
  let now = 1_810_000_000_000;
  Date.now = () => now;
  try {
    const written = await writeHistory(324, payload(1_785_501_111_920));
    let response = await request("server=3&event=324");
    assert.equal(response.status, 200);

    now += 60_001;
    await rm(join(storeRoot, ...written.manifestKey.split("/")));
    response = await request("server=3&event=324");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { points: [], users: [] });

    now += 60_001;
    await writeObject(written.manifestKey, Buffer.from("{", "utf8"));
    response = await request("server=3&event=324");
    assert.equal(response.status, 503);
  } finally {
    Date.now = originalNow;
  }
});

test("an existing null manifest is corrupt and does not clear stale history", async () => {
  const originalNow = Date.now;
  let now = 1_815_000_000_000;
  Date.now = () => now;
  try {
    const written = await writeHistory(330, payload(1_785_501_121_920));
    let response = await request("server=3&event=330");
    assert.equal(response.status, 200);

    now += 60_001;
    await writeObject(written.manifestKey, Buffer.from("null", "utf8"));
    response = await request("server=3&event=330");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), payload(1_785_501_121_920));

    now += 6 * 60 * 60 * 1_000 + 1;
    response = await request("server=3&event=330");
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "TRACKER_HISTORY_UNAVAILABLE");
  } finally {
    Date.now = originalNow;
  }
});

test("source scope changes do not reuse stale payloads or cooldown state", async () => {
  const originalRoot = storeRoot;
  const secondRoot = await mkdtemp(join(tmpdir(), "hhwx-topdata-second-"));
  try {
    await writeHistory(327, payload(1_785_501_131_920));
    let response = await request("server=3&event=327");
    assert.equal(response.status, 200);

    storeRoot = secondRoot;
    process.env.BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT = secondRoot;
    response = await request("server=3&event=327");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { points: [], users: [] });

    await writeObject(
      "bandori/trackerdata/topdata/events/328/cn/manifest.json",
      Buffer.from("{", "utf8"),
    );
    response = await request("server=3&event=328");
    assert.equal(response.status, 503);

    storeRoot = originalRoot;
    process.env.BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT = originalRoot;
    await writeHistory(328, payload(1_785_501_141_920));
    response = await request("server=3&event=328");
    assert.equal(response.status, 200);
  } finally {
    storeRoot = originalRoot;
    process.env.BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT = originalRoot;
    await rm(secondRoot, { recursive: true, force: true });
  }
});

test("rejects a manifest larger than the fixed 64 KiB limit", async () => {
  const key = "bandori/trackerdata/topdata/events/325/cn/manifest.json";
  await writeObject(key, Buffer.alloc(64 * 1024 + 1, 0x20));
  const response = await request("server=3&event=325");
  assert.equal(response.status, 503);
});

test("final history remains eligible for stale reads while retained in the bounded pack cache", async () => {
  const originalNow = Date.now;
  let now = 1_820_000_000_000;
  Date.now = () => now;
  try {
    const expected = payload(1_785_501_121_920);
    const written = await writeHistory(326, expected, { hasFinalSample: true });
    let response = await request("server=3&event=326");
    assert.equal(response.status, 200);

    now += 30 * 24 * 60 * 60 * 1_000;
    await writeObject(written.manifestKey, Buffer.from("{", "utf8"));
    response = await request("server=3&event=326");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
  } finally {
    Date.now = originalNow;
  }
});
