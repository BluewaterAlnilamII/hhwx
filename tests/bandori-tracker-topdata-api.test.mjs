import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { gzipSync } from "node:zlib";

import { handleBandoriTrackerTopDataRequest } from "../src/lib/bandori-tracker-topdata-server.ts";
import { countBandoriTopDataSamples } from "../src/lib/bandori-topdata-contract.ts";
import {
  inspectBandoriTopDataTargetStateSizesForTests,
  resetBandoriTopDataTargetStatesForTests,
} from "@/lib/bandori-topdata-history-server";

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
  const server = options.server ?? "cn";
  const uncompressed = Buffer.from(JSON.stringify(value), "utf8");
  const compressed = options.corrupt
    ? Buffer.from("not-gzip", "utf8")
    : gzipSync(uncompressed, { mtime: 0 });
  const compressedSha256 = createHash("sha256").update(compressed).digest("hex");
  const prefix = `bandori/trackerdata/topdata/events/${eventId}/${server}`;
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
    server,
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

async function buildScopedPack(prefix, packName, value, hasFinalSample = false) {
  const compressed = gzipSync(Buffer.from(JSON.stringify(value), "utf8"), { mtime: 0 });
  const compressedSha256 = createHash("sha256").update(compressed).digest("hex");
  const key = `${prefix}/packs/${packName}/${compressedSha256}.json.gz`;
  const descriptor = {
    key,
    semanticSha256: createHash("sha256").update(canonicalJson(value)).digest("hex"),
    compressedSha256,
    compressedSize: compressed.length,
    pointCount: value.points.length,
    userCount: value.users.length,
    sampleCount: countBandoriTopDataSamples(value.points),
    hasFinalSample,
  };
  await writeObject(key, compressed);
  return descriptor;
}

async function writeSongHistory(eventId, server, songIds, values) {
  const prefix = `bandori/trackerdata/topdata/songs/${eventId}/${server}`;
  const packs = {};
  const recentPackKeys = {};
  for (const songId of songIds) {
    const value = values[songId];
    packs[songId] = value ? await buildScopedPack(prefix, songId, value) : null;
    recentPackKeys[songId] = packs[songId] ? [packs[songId].key] : [];
  }
  const manifest = {
    schemaVersion: 1,
    kind: "songTop10",
    server,
    eventId,
    songIds,
    generation: 1,
    publishedAt: new Date().toISOString(),
    hasFinalSample: false,
    packs,
    recentPackKeys,
  };
  const manifestKey = `${prefix}/manifest.json`;
  await writeObject(manifestKey, Buffer.from(JSON.stringify(manifest), "utf8"));
  return { manifest, manifestKey };
}

async function writeMonthlyHistory(period, monthlyRankingId, server, value, options = {}) {
  const prefix = `bandori/trackerdata/topdata/monthly/${period}/${server}`;
  const descriptor = await buildScopedPack(
    prefix,
    "monthly",
    value,
    options.hasFinalSample === true,
  );
  await writeObject(`${prefix}/manifest.json`, Buffer.from(JSON.stringify({
    schemaVersion: 1,
    kind: "monthlyTop10",
    server,
    period,
    monthlyRankingId,
    generation: 1,
    publishedAt: new Date().toISOString(),
    hasFinalSample: options.hasFinalSample === true,
    pack: descriptor,
    recentPackKeys: [descriptor.key],
  }), "utf8"));
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
  for (const server of [0, 1, 2, 3]) {
    const response = await request(`server=${server}&event=319`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { points: [], users: [] });
  }
});

test("reads isolated TOP10 history for every server", async () => {
  const servers = [[0, "jp"], [1, "en"], [2, "tw"], [3, "cn"]];
  for (const [server, serverCode] of servers) {
    const value = payload(1_785_502_000_000 + server * 60_000);
    value.users[0].name = `${serverCode.toUpperCase()} Player`;
    await writeHistory(340, value, { server: serverCode });
    const response = await request(`server=${server}&event=340&type=event`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), value);
  }
});

test("rejects a manifest published under another server identity", async () => {
  const written = await writeHistory(341, payload(1_785_502_300_000), { server: "jp" });
  await writeObject(
    "bandori/trackerdata/topdata/events/341/en/manifest.json",
    Buffer.from(JSON.stringify(written.manifest), "utf8"),
  );
  const response = await request("server=1&event=341&type=event");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "TRACKER_HISTORY_UNAVAILABLE");
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
    "server=4&event=318",
    "server=3&event=",
    "server=3&event=1.5",
    "server=3&event=2147483648",
    "server=3&event=318&type=unknown",
    "server=3&event=318&type=song&song=-1",
  ]) {
    const response = await request(query);
    assert.equal(response.status, 400, query);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "INVALID_REQUEST");
  }
});

test("resolves song TOP10 targets and enforces challenge song selection", async () => {
  const challenge = payload(1_785_503_000_000);
  await writeSongHistory(350, "cn", [583, 714, 743], { 583: challenge });

  let response = await request("server=3&event=350&type=song&song=583");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), challenge);

  response = await request("server=3&event=350&type=song");
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "SONG_REQUIRED");

  response = await request("server=3&event=350&type=song&song=999");
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "SONG_TOP10_NOT_FOUND");

  const versus = payload(1_785_503_100_000);
  await writeSongHistory(351, "jp", [746], { 746: versus });
  response = await request("server=0&event=351&type=song");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), versus);
  response = await request("server=0&event=351&type=song&song=746");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), versus);

  const medley = payload(1_785_503_200_000);
  await writeSongHistory(352, "tw", [0], { 0: medley });
  response = await request("server=2&event=352&type=song&song=0");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), medley);
});

test("rejects a song manifest whose final summary is not all-target complete", async () => {
  const written = await writeSongHistory(
    353,
    "en",
    [583, 714, 743],
    { 583: payload(1_785_503_250_000) },
  );
  written.manifest.hasFinalSample = true;
  await writeObject(
    written.manifestKey,
    Buffer.from(JSON.stringify(written.manifest), "utf8"),
  );

  const response = await request("server=1&event=353&type=song&song=583");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "TRACKER_HISTORY_UNAVAILABLE");
});

test("maps monthly ranking IDs to natural-period TOP10 paths", async () => {
  const value = payload(1_785_503_300_000);
  await writeMonthlyHistory("2026-08", 19, "cn", value);
  const response = await request("server=3&event=19&type=monthly");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), value);
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

test("song history shares stale fallback, failure cooldown, and recovery semantics", async () => {
  const originalNow = Date.now;
  let now = 1_830_000_000_000;
  Date.now = () => now;
  resetBandoriTopDataTargetStatesForTests();
  try {
    const initial = payload(1_785_504_000_000);
    const updated = payload(1_785_504_100_000);
    const written = await writeSongHistory(360, "cn", [711], { 711: initial });

    let response = await request("server=3&event=360&type=song");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), initial);

    now += 60_001;
    await writeObject(written.manifestKey, Buffer.from("{", "utf8"));
    response = await request("server=3&event=360&type=song");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), initial);

    await writeSongHistory(360, "cn", [711], { 711: updated });
    response = await request("server=3&event=360&type=song");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), initial);

    now += 15_001;
    response = await request("server=3&event=360&type=song");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), updated);
  } finally {
    Date.now = originalNow;
    resetBandoriTopDataTargetStatesForTests();
  }
});

test("active scoped stale history expires after six hours", async () => {
  const originalNow = Date.now;
  let now = 1_840_000_000_000;
  Date.now = () => now;
  resetBandoriTopDataTargetStatesForTests();
  try {
    const written = await writeSongHistory(361, "cn", [712], {
      712: payload(1_785_504_200_000),
    });
    let response = await request("server=3&event=361&type=song&song=712");
    assert.equal(response.status, 200);

    now += 6 * 60 * 60 * 1_000 + 1;
    await writeObject(written.manifestKey, Buffer.from("{", "utf8"));
    response = await request("server=3&event=361&type=song&song=712");
    assert.equal(response.status, 503);
  } finally {
    Date.now = originalNow;
    resetBandoriTopDataTargetStatesForTests();
  }
});

test("a partially-final Challenge manifest does not make one song stale forever", async () => {
  const originalNow = Date.now;
  let now = 1_845_000_000_000;
  Date.now = () => now;
  resetBandoriTopDataTargetStatesForTests();
  try {
    const expected = payload(1_785_504_250_000);
    const written = await writeSongHistory(362, "cn", [713, 714, 715], {
      713: expected,
      714: payload(1_785_504_251_000),
      715: payload(1_785_504_252_000),
    });
    written.manifest.packs[713].hasFinalSample = true;
    await writeObject(
      written.manifestKey,
      Buffer.from(JSON.stringify(written.manifest), "utf8"),
    );

    let response = await request("server=3&event=362&type=song&song=713");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);

    now += 6 * 60 * 60 * 1_000 + 1;
    await writeObject(written.manifestKey, Buffer.from("{", "utf8"));
    response = await request("server=3&event=362&type=song&song=713");
    assert.equal(response.status, 503);
  } finally {
    Date.now = originalNow;
    resetBandoriTopDataTargetStatesForTests();
  }
});

test("final monthly history remains stale-eligible while its pack is retained", async () => {
  const originalNow = Date.now;
  let now = 1_850_000_000_000;
  Date.now = () => now;
  resetBandoriTopDataTargetStatesForTests();
  try {
    const expected = payload(1_785_504_300_000);
    await writeMonthlyHistory("2026-09", 20, "cn", expected, { hasFinalSample: true });
    let response = await request("server=3&event=20&type=monthly");
    assert.equal(response.status, 200);

    now += 30 * 24 * 60 * 60 * 1_000;
    await writeObject(
      "bandori/trackerdata/topdata/monthly/2026-09/cn/manifest.json",
      Buffer.from("{", "utf8"),
    );
    response = await request("server=3&event=20&type=monthly");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
  } finally {
    Date.now = originalNow;
    resetBandoriTopDataTargetStatesForTests();
  }
});

test("shared TOP10 failure state remains bounded across event and scoped targets", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  resetBandoriTopDataTargetStatesForTests();
  try {
    for (let eventId = 400; eventId < 470; eventId += 1) {
      await writeObject(
        `bandori/trackerdata/topdata/songs/${eventId}/cn/manifest.json`,
        Buffer.from("{}", "utf8"),
      );
      const response = await request(`server=3&event=${eventId}&type=song&song=1`);
      assert.equal(response.status, 503);
    }
    assert.deepEqual(inspectBandoriTopDataTargetStateSizesForTests(), {
      lastSuccess: 0,
      cooldown: 64,
    });

    resetBandoriTopDataTargetStatesForTests();
    for (let eventId = 500; eventId < 570; eventId += 1) {
      await writeHistory(eventId, payload(1_785_505_000_000 + eventId));
      const response = await request(`server=3&event=${eventId}&type=event`);
      assert.equal(response.status, 200);
    }
    assert.deepEqual(inspectBandoriTopDataTargetStateSizesForTests(), {
      lastSuccess: 64,
      cooldown: 0,
    });
  } finally {
    console.warn = originalWarn;
    resetBandoriTopDataTargetStatesForTests();
  }
});

test("song manifest and pack reads share one end-to-end three-second budget", async () => {
  const value = payload(1_785_504_400_000);
  const compressed = gzipSync(Buffer.from(JSON.stringify(value), "utf8"), { mtime: 0 });
  const compressedSha256 = createHash("sha256").update(compressed).digest("hex");
  const prefix = "bandori/trackerdata/topdata/songs/380/cn";
  const packKey = `${prefix}/packs/713/${compressedSha256}.json.gz`;
  const manifestKey = `${prefix}/manifest.json`;
  const manifest = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    kind: "songTop10",
    server: "cn",
    eventId: 380,
    songIds: [713],
    generation: 1,
    publishedAt: new Date().toISOString(),
    hasFinalSample: false,
    packs: {
      713: {
        key: packKey,
        semanticSha256: createHash("sha256").update(canonicalJson(value)).digest("hex"),
        compressedSha256,
        compressedSize: compressed.length,
        pointCount: value.points.length,
        userCount: value.users.length,
        sampleCount: countBandoriTopDataSamples(value.points),
        hasFinalSample: false,
      },
    },
    recentPackKeys: { 713: [packKey] },
  }), "utf8");
  const objects = new Map([
    [`/test-bucket/${manifestKey}`, manifest],
    [`/test-bucket/${packKey}`, compressed],
  ]);
  const server = createServer((incoming, outgoing) => {
    const body = objects.get(new URL(incoming.url ?? "/", "http://localhost").pathname);
    setTimeout(() => {
      if (outgoing.destroyed) return;
      if (!body) {
        outgoing.writeHead(404, { "content-length": "0" });
        outgoing.end();
        return;
      }
      outgoing.writeHead(200, { "content-length": String(body.length) });
      outgoing.end(body);
    }, 1_750);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const originalRoot = process.env.BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT;
  const originalR2 = {
    endpoint: process.env.BANDORI_R2_ENDPOINT,
    bucket: process.env.BANDORI_PRIVATE_R2_BUCKET,
    accessKeyId: process.env.BANDORI_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.BANDORI_R2_SECRET_ACCESS_KEY,
  };
  delete process.env.BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT;
  const address = server.address();
  assert(address && typeof address === "object");
  process.env.BANDORI_R2_ENDPOINT = `http://127.0.0.1:${address.port}`;
  process.env.BANDORI_PRIVATE_R2_BUCKET = "test-bucket";
  process.env.BANDORI_R2_ACCESS_KEY_ID = "test-access-key";
  process.env.BANDORI_R2_SECRET_ACCESS_KEY = "test-secret-key";
  resetBandoriTopDataTargetStatesForTests();
  try {
    const startedAt = performance.now();
    const response = await request("server=3&event=380&type=song&song=713");
    const elapsedMs = performance.now() - startedAt;
    assert.equal(response.status, 503);
    assert(elapsedMs >= 2_700, `read returned too early: ${elapsedMs}ms`);
    assert(elapsedMs < 3_800, `read exceeded the shared budget: ${elapsedMs}ms`);
  } finally {
    if (originalRoot === undefined) delete process.env.BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT;
    else process.env.BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT = originalRoot;
    for (const [name, value] of [
      ["BANDORI_R2_ENDPOINT", originalR2.endpoint],
      ["BANDORI_PRIVATE_R2_BUCKET", originalR2.bucket],
      ["BANDORI_R2_ACCESS_KEY_ID", originalR2.accessKeyId],
      ["BANDORI_R2_SECRET_ACCESS_KEY", originalR2.secretAccessKey],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    resetBandoriTopDataTargetStatesForTests();
    server.close();
    await once(server, "close");
  }
});
