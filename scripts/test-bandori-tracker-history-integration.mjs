import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = join(repositoryRoot, "node_modules", "next", "dist", "bin", "next");
const prefix = "bandori/trackerdata";

async function writeObject(root, key, body) {
  const path = join(root, ...key.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

function buildPack(targetPrefix, kind, payload, options = {}) {
  const body = options.corrupt
    ? Buffer.from("not-a-gzip-pack")
    : gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { mtime: 0 });
  const compressedSha256 = createHash("sha256").update(body).digest("hex");
  return {
    body,
    descriptor: {
      key: `${targetPrefix}/packs/${kind}/${compressedSha256}.json.gz`,
      semanticSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      compressedSha256,
      compressedSize: body.length,
      recordCount: options.recordCount ?? 2,
      tierCount: options.tierCount ?? 1,
      hasFinalPoint: options.hasFinalPoint ?? true,
    },
  };
}

function buildManifest(identity, packs) {
  return {
    schemaVersion: 1,
    kind: "period" in identity ? "monthly" : "events",
    server: "cn",
    generation: 1,
    publishedAt: "2026-07-13T13:00:00+00:00",
    preserveIrregularPoints: true,
    hasFinalPoint: true,
    packs,
    recentPackKeys: Object.fromEntries(
      Object.entries(packs).map(([kind, descriptor]) => [kind, [descriptor.key]]),
    ),
    ...identity,
  };
}

async function createStore() {
  const root = await mkdtemp(join(tmpdir(), "hhwx-tracker-history-"));

  const eventPrefix = `${prefix}/events/316/cn`;
  const eventPayload = {
    schemaVersion: 1,
    kind: "event",
    server: "cn",
    eventId: 316,
    tiers: { 1000: [[1000, 10], [2000, 20, 1]] },
  };
  const eventPack = buildPack(eventPrefix, "event", eventPayload);
  await writeObject(root, eventPack.descriptor.key, eventPack.body);
  await writeObject(
    root,
    `${eventPrefix}/manifest.json`,
    Buffer.from(JSON.stringify(buildManifest({ eventId: 316 }, { event: eventPack.descriptor }))),
  );

  // Reuse the exact bytes under another target path. The second target must
  // not reuse event 316's parsed cache entry because the payload identity is
  // still event 316 and must fail validation for event 321.
  const duplicatePrefix = `${prefix}/events/321/cn`;
  const duplicateDescriptor = {
    ...eventPack.descriptor,
    key: `${duplicatePrefix}/packs/event/${eventPack.descriptor.compressedSha256}.json.gz`,
  };
  await writeObject(root, duplicateDescriptor.key, eventPack.body);
  await writeObject(
    root,
    `${duplicatePrefix}/manifest.json`,
    Buffer.from(JSON.stringify(buildManifest({ eventId: 321 }, { event: duplicateDescriptor }))),
  );

  const monthlyPrefix = `${prefix}/monthly/2026-07/cn`;
  const monthlyPayload = {
    schemaVersion: 1,
    kind: "monthly",
    server: "cn",
    period: "2026-07",
    sourceMonthId: 18,
    tiers: { 1000: [[3000, 30], [4000, 40, 1]] },
  };
  const monthlyPack = buildPack(monthlyPrefix, "monthly", monthlyPayload);
  await writeObject(root, monthlyPack.descriptor.key, monthlyPack.body);
  await writeObject(
    root,
    `${monthlyPrefix}/manifest.json`,
    Buffer.from(JSON.stringify(buildManifest(
      { period: "2026-07", sourceMonthId: 18 },
      { monthly: monthlyPack.descriptor },
    ))),
  );

  for (const [eventId, options] of [
    [317, { corrupt: true, writePack: true }],
    [318, { corrupt: false, writePack: false }],
    [319, { corrupt: false, writePack: false }],
    [320, { corrupt: false, writePack: true }],
  ]) {
    const targetPrefix = `${prefix}/events/${eventId}/cn`;
    const payload = {
      schemaVersion: 1,
      kind: "event",
      server: "cn",
      eventId,
      tiers: { 1000: [[1000, 10], [2000, 20, 1]] },
    };
    const pack = buildPack(targetPrefix, "event", payload, { corrupt: options.corrupt });
    if (options.writePack) await writeObject(root, pack.descriptor.key, pack.body);
    await writeObject(
      root,
      `${targetPrefix}/manifest.json`,
      Buffer.from(JSON.stringify(buildManifest({ eventId }, { event: pack.descriptor }))),
    );
  }
  return root;
}

async function reservePort() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = createServer();
    const port = 20_000 + Math.floor(Math.random() * 20_000);
    try {
      await new Promise((resolvePromise, rejectPromise) => {
        server.once("error", rejectPromise);
        server.listen(port, "127.0.0.1", resolvePromise);
      });
      server.close();
      await once(server, "close");
      return port;
    } catch (error) {
      if (error.code !== "EADDRINUSE" && error.code !== "EACCES") throw error;
    }
  }
  throw new Error("Unable to reserve a Next.js-safe test port");
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exitPromise = once(child, "exit");
  child.kill("SIGTERM");
  const exited = await Promise.race([
    exitPromise.then(() => true),
    new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), 5_000)),
  ]);
  if (!exited) {
    child.kill("SIGKILL");
    await exitPromise;
  }
}

async function withServer(storeRoot, assertion, environment = {}) {
  const port = await reservePort();
  const logs = [];
  const childEnvironment = {
    ...process.env,
    BANDORI_TRACKER_HISTORY_SOURCE: "r2",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key",
    ...environment,
  };
  delete childEnvironment.BANDORI_TRACKER_HISTORY_LOCAL_STORE_ROOT;
  if (storeRoot) childEnvironment.BANDORI_TRACKER_HISTORY_LOCAL_STORE_ROOT = storeRoot;
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--hostname", "localhost", "--port", String(port)],
    {
      cwd: repositoryRoot,
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const baseUrl = `http://localhost:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (child.exitCode !== null) {
        throw new Error(`Next dev exited before becoming ready:\n${logs.join("")}`);
      }
      try {
        const response = await fetch(`${baseUrl}/api/bandori/tracker/data?server=0&event=1&tier=1`);
        if (response.status === 400) {
          ready = true;
          break;
        }
      } catch {
        // The dev server may still be compiling.
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    if (!ready) throw new Error(`Next dev did not become ready:\n${logs.join("")}`);
    await assertion(baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\nNext output:\n${logs.join("")}`, { cause: error });
  } finally {
    await stopServer(child);
  }
}

function eventArtifacts(eventId, options = {}) {
  const targetPrefix = `${prefix}/events/${eventId}/cn`;
  const payload = {
    schemaVersion: options.schemaVersion ?? 1,
    kind: "event",
    server: "cn",
    eventId: options.payloadEventId ?? eventId,
    tiers: { 1000: options.points ?? [[1000, eventId], [2000, eventId + 1, 1]] },
  };
  const pack = buildPack(targetPrefix, "event", payload);
  return {
    manifestKey: `${targetPrefix}/manifest.json`,
    manifestBody: Buffer.from(JSON.stringify(buildManifest({ eventId }, { event: pack.descriptor }))),
    packKey: pack.descriptor.key,
    packBody: pack.body,
    descriptor: pack.descriptor,
  };
}

async function withFakeR2(assertion) {
  const objects = new Map();
  const behaviors = new Map();
  const requestCounts = new Map();
  const bucket = "tracker-history-test";
  const server = createHttpServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const bucketPrefix = `/${bucket}/`;
    assert.ok(pathname.startsWith(bucketPrefix), `unexpected fake R2 path: ${pathname}`);
    const objectKey = decodeURIComponent(pathname.slice(bucketPrefix.length));
    requestCounts.set(objectKey, (requestCounts.get(objectKey) ?? 0) + 1);
    const behavior = behaviors.get(objectKey) ?? {};
    const respond = () => {
      if (response.destroyed) return;
      const status = behavior.status ?? (objects.has(objectKey) ? 200 : 404);
      const body = status >= 200 && status < 300
        ? objects.get(objectKey) ?? Buffer.alloc(0)
        : Buffer.from(`fake R2 HTTP ${status}`);
      response.writeHead(status, {
        "content-type": "application/octet-stream",
        "content-length": String(body.length),
      });
      response.end(body);
    };
    if (behavior.delayMs) {
      setTimeout(respond, behavior.delayMs);
    } else {
      respond();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const control = {
    endpoint: `http://127.0.0.1:${address.port}`,
    bucket,
    put: (key, body) => objects.set(key, body),
    setBehavior: (key, behavior) => behaviors.set(key, behavior),
    clearBehavior: (key) => behaviors.delete(key),
    count: (key) => requestCounts.get(key) ?? 0,
  };
  try {
    await assertion(control);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function installArtifacts(fakeR2, artifacts) {
  fakeR2.put(artifacts.manifestKey, artifacts.manifestBody);
  fakeR2.put(artifacts.packKey, artifacts.packBody);
}

function fakeR2Environment(fakeR2, overrides = {}) {
  return {
    BANDORI_R2_ENDPOINT: fakeR2.endpoint,
    BANDORI_R2_ACCESS_KEY_ID: "test-access-key",
    BANDORI_R2_SECRET_ACCESS_KEY: "test-secret-key",
    BANDORI_R2_REGION: "auto",
    BANDORI_TRACKER_HISTORY_R2_BUCKET: fakeR2.bucket,
    ...overrides,
  };
}

async function withFakeSupabase(assertion) {
  let requestCount = 0;
  const server = createHttpServer((request, response) => {
    requestCount += 1;
    assert.match(request.url ?? "", /^\/rest\/v1\/bandori_tracker_data\?/u);
    if ((request.url ?? "").includes("event_id=eq.318")) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({
        code: "XX000",
        details: null,
        hint: null,
        message: "test query failure",
      }));
      return;
    }
    response.writeHead(200, {
      "content-type": "application/json",
      "content-range": "0-1/2",
    });
    response.end(JSON.stringify([
      { time: 5000, ep: 50, is_final: false },
      { time: 6000, ep: 60, is_final: true },
    ]));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await assertion(`http://127.0.0.1:${address.port}`, () => requestCount);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function readJson(baseUrl, query) {
  const response = await fetch(`${baseUrl}/api/bandori/tracker/data?${query}`);
  return { response, body: await response.json() };
}

const storeRoot = await createStore();
try {
  await withServer(storeRoot, async (baseUrl) => {
    for (const [requestQuery, expectedStatus, expectedCode] of [
      ["server=0&event=316&tier=1000&type=event", 400, "INVALID_REQUEST"],
      ["server=3&tier=1000&type=event", 400, "INVALID_REQUEST"],
      ["server=3&event=316&type=event", 400, "INVALID_REQUEST"],
      ["server=3&event=316&tier=1000&type=invalid", 400, "INVALID_REQUEST"],
      ["server=3&event=0&tier=1000&type=event", 400, "INVALID_REQUEST"],
      ["server=3&event=316&tier=999999&type=event", 404, "TRACKER_TIER_NOT_SUPPORTED"],
    ]) {
      const invalid = await readJson(baseUrl, requestQuery);
      assert.equal(invalid.response.status, expectedStatus);
      assert.equal(invalid.body.success, false);
      assert.equal(invalid.body.error.code, expectedCode);
    }

    const event = await readJson(baseUrl, "server=3&event=316&tier=1000&type=event");
    assert.equal(event.response.status, 200);
    assert.match(event.response.headers.get("cache-control") ?? "", /no-store/u);
    assert.deepEqual(event.body, {
      result: true,
      cutoffs: [
        { time: 1000, ep: 10 },
        { time: 2000, ep: 20, isFinal: true },
      ],
    });
    const defaultEventType = await readJson(baseUrl, "server=3&event=316&tier=1000");
    assert.equal(defaultEventType.response.status, 200);
    assert.deepEqual(defaultEventType.body, event.body);

    const crossTarget = await readJson(baseUrl, "server=3&event=321&tier=1000&type=event");
    assert.equal(crossTarget.response.status, 503);
    assert.equal(crossTarget.body.error.code, "TRACKER_HISTORY_UNAVAILABLE");

    const monthly = await readJson(baseUrl, "server=3&event=18&tier=1000&type=monthly");
    assert.equal(monthly.response.status, 200);
    assert.deepEqual(monthly.body.cutoffs, [
      { time: 3000, ep: 30 },
      { time: 4000, ep: 40, isFinal: true },
    ]);

    for (const query of [
      "server=3&event=999&tier=1000&type=event",
      "server=3&event=316&tier=1000&type=song",
      "server=3&event=316&tier=1&type=event",
    ]) {
      const empty = await readJson(baseUrl, query);
      assert.equal(empty.response.status, 200);
      assert.deepEqual(empty.body, { result: true, cutoffs: [] });
    }

    for (const eventId of [317, 318, 319]) {
      const failure = await readJson(baseUrl, `server=3&event=${eventId}&tier=1000&type=event`);
      assert.equal(failure.response.status, 503);
      assert.equal(failure.body.success, false);
      assert.equal(failure.body.error.code, "TRACKER_HISTORY_UNAVAILABLE");
    }

    const warm = await readJson(baseUrl, "server=3&event=320&tier=1000&type=event");
    assert.equal(warm.response.status, 200);
    const staleManifestKey = `${prefix}/events/320/cn/manifest.json`;
    await writeObject(storeRoot, staleManifestKey, Buffer.from(JSON.stringify({ schemaVersion: 2 })));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    const stale = await readJson(baseUrl, "server=3&event=320&tier=1000&type=event");
    assert.equal(stale.response.status, 200);
    assert.deepEqual(stale.body, warm.body);
  }, {
    BANDORI_TRACKER_HISTORY_TEST_MANIFEST_TTL_MS: "5",
  });

  await withFakeSupabase(async (supabaseUrl, getRequestCount) => {
    await withServer(storeRoot, async (baseUrl) => {
      const empty = await readJson(baseUrl, "server=3&event=999&tier=1000&type=event");
      assert.equal(empty.response.status, 200);
      assert.deepEqual(empty.body, { result: true, cutoffs: [] });
      const missingTier = await readJson(baseUrl, "server=3&event=316&tier=1&type=event");
      assert.equal(missingTier.response.status, 200);
      assert.deepEqual(missingTier.body, { result: true, cutoffs: [] });
      const missingKind = await readJson(baseUrl, "server=3&event=316&tier=1000&type=song");
      assert.equal(missingKind.response.status, 200);
      assert.deepEqual(missingKind.body, { result: true, cutoffs: [] });
      assert.equal(getRequestCount(), 0, "an R2 empty result must not query Supabase");

      const fallback = await readJson(baseUrl, "server=3&event=317&tier=1000&type=event");
      assert.equal(fallback.response.status, 200);
      assert.deepEqual(fallback.body, {
        result: true,
        cutoffs: [
          { time: 5000, ep: 50 },
          { time: 6000, ep: 60, isFinal: true },
        ],
      });
      assert.equal(getRequestCount(), 1, "a corrupt R2 pack must use one whole-request fallback");

      const missingPack = await readJson(baseUrl, "server=3&event=319&tier=1000&type=event");
      assert.equal(missingPack.response.status, 200);
      assert.equal(missingPack.body.cutoffs[0].ep, 50);
      assert.equal(getRequestCount(), 2, "a referenced missing pack must use fallback");

      const doubleFailure = await readJson(baseUrl, "server=3&event=318&tier=1000&type=event");
      assert.equal(doubleFailure.response.status, 500);
      assert.equal(doubleFailure.body.success, false);
      assert.equal(doubleFailure.body.error.code, "DATABASE_QUERY_FAILED");
      assert.deepEqual(doubleFailure.body.error.details, {
        event: 318,
        tier: 1000,
        type: "event",
      });
      assert.equal(getRequestCount(), 3);
    }, {
      BANDORI_TRACKER_HISTORY_SOURCE: "r2-with-supabase-fallback",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    });

    await withServer(storeRoot, async (baseUrl) => {
      const legacySource = await readJson(baseUrl, "server=3&event=315&tier=1000&type=event");
      assert.equal(legacySource.response.status, 200);
      assert.deepEqual(legacySource.body.cutoffs, [
        { time: 5000, ep: 50 },
        { time: 6000, ep: 60, isFinal: true },
      ]);
      assert.equal(getRequestCount(), 4);
    }, {
      BANDORI_TRACKER_HISTORY_SOURCE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    });
  });
} finally {
  await rm(storeRoot, { recursive: true, force: true });
}

await withFakeR2(async (fakeR2) => {
  const concurrentArtifacts = eventArtifacts(350);
  installArtifacts(fakeR2, concurrentArtifacts);

  const hashMismatch = eventArtifacts(363);
  const wrongHash = "f".repeat(64);
  const wrongDescriptor = {
    ...hashMismatch.descriptor,
    compressedSha256: wrongHash,
    key: `${prefix}/events/363/cn/packs/event/${wrongHash}.json.gz`,
  };
  fakeR2.put(wrongDescriptor.key, hashMismatch.packBody);
  fakeR2.put(
    hashMismatch.manifestKey,
    Buffer.from(JSON.stringify(buildManifest({ eventId: 363 }, { event: wrongDescriptor }))),
  );

  const schemaMismatch = eventArtifacts(364, { schemaVersion: 2 });
  installArtifacts(fakeR2, schemaMismatch);

  const manifestSchemaMismatch = eventArtifacts(366);
  installArtifacts(fakeR2, manifestSchemaMismatch);
  fakeR2.put(
    manifestSchemaMismatch.manifestKey,
    Buffer.from(JSON.stringify({
      ...JSON.parse(manifestSchemaMismatch.manifestBody.toString("utf8")),
      schemaVersion: 2,
    })),
  );

  const recoveryArtifacts = eventArtifacts(365);
  installArtifacts(fakeR2, recoveryArtifacts);
  fakeR2.setBehavior(recoveryArtifacts.manifestKey, { status: 503 });

  const failureTargets = [
    [360, { status: 403 }],
    [361, { status: 503 }],
    [362, { delayMs: 1_500 }],
  ];
  for (const [eventId, behavior] of failureTargets) {
    fakeR2.setBehavior(`${prefix}/events/${eventId}/cn/manifest.json`, behavior);
  }

  const evictionArtifacts = [];
  for (let eventId = 400; eventId < 417; eventId += 1) {
    const artifacts = eventArtifacts(eventId);
    evictionArtifacts.push(artifacts);
    installArtifacts(fakeR2, artifacts);
  }

  await withFakeSupabase(async (supabaseUrl, getSupabaseRequestCount) => {
    await withServer(null, async (baseUrl) => {
      const concurrent = await Promise.all(
        Array.from({ length: 12 }, () => (
          readJson(baseUrl, "server=3&event=350&tier=1000&type=event")
        )),
      );
      for (const result of concurrent) {
        assert.equal(result.response.status, 200);
        assert.equal(result.body.cutoffs[0].ep, 350);
      }
      assert.equal(fakeR2.count(concurrentArtifacts.manifestKey), 1);
      assert.equal(fakeR2.count(concurrentArtifacts.packKey), 1);
      assert.equal(getSupabaseRequestCount(), 0);

      for (const eventId of [360, 361, 362, 363, 364, 366]) {
        const before = getSupabaseRequestCount();
        const fallback = await readJson(
          baseUrl,
          `server=3&event=${eventId}&tier=1000&type=event`,
        );
        assert.equal(fallback.response.status, 200);
        assert.deepEqual(fallback.body.cutoffs, [
          { time: 5000, ep: 50 },
          { time: 6000, ep: 60, isFinal: true },
        ]);
        assert.equal(
          getSupabaseRequestCount(),
          before + 1,
          `R2 failure for event ${eventId} must use one whole-request fallback`,
        );
      }

      const beforeCooldown = getSupabaseRequestCount();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const fallback = await readJson(baseUrl, "server=3&event=365&tier=1000&type=event");
        assert.equal(fallback.response.status, 200);
        assert.equal(fallback.body.cutoffs[0].ep, 50);
      }
      assert.equal(fakeR2.count(recoveryArtifacts.manifestKey), 1);
      assert.equal(getSupabaseRequestCount(), beforeCooldown + 2);

      fakeR2.clearBehavior(recoveryArtifacts.manifestKey);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1100));
      const recovered = await readJson(baseUrl, "server=3&event=365&tier=1000&type=event");
      assert.equal(recovered.response.status, 200);
      assert.equal(recovered.body.cutoffs[0].ep, 365);
      assert.equal(fakeR2.count(recoveryArtifacts.manifestKey), 2);
      assert.equal(getSupabaseRequestCount(), beforeCooldown + 2);

      for (const artifacts of evictionArtifacts) {
        const eventId = Number(artifacts.manifestKey.split("/")[3]);
        const result = await readJson(
          baseUrl,
          `server=3&event=${eventId}&tier=1000&type=event`,
        );
        assert.equal(result.response.status, 200);
      }
      const oldest = evictionArtifacts[0];
      assert.equal(fakeR2.count(oldest.packKey), 1);
      const reloaded = await readJson(baseUrl, "server=3&event=400&tier=1000&type=event");
      assert.equal(reloaded.response.status, 200);
      assert.equal(fakeR2.count(oldest.manifestKey), 1, "fresh manifest should remain cached");
      assert.equal(fakeR2.count(oldest.packKey), 2, "entry-count LRU must reload the oldest pack");
    }, fakeR2Environment(fakeR2, {
      BANDORI_TRACKER_HISTORY_SOURCE: "r2-with-supabase-fallback",
      BANDORI_TRACKER_HISTORY_TEST_FAILURE_COOLDOWN_MS: "1000",
      BANDORI_TRACKER_HISTORY_TEST_R2_BUDGET_MS: "1000",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    }));
  });

  const byteLimited = [eventArtifacts(500), eventArtifacts(501)];
  for (const artifacts of byteLimited) installArtifacts(fakeR2, artifacts);
  await withServer(null, async (baseUrl) => {
    for (const eventId of [500, 501, 500]) {
      const result = await readJson(baseUrl, `server=3&event=${eventId}&tier=1000&type=event`);
      assert.equal(result.response.status, 200);
    }
    assert.equal(
      fakeR2.count(byteLimited[0].packKey),
      2,
      "estimated-byte LRU must reload an evicted pack",
    );
  }, fakeR2Environment(fakeR2, {
    BANDORI_TRACKER_HISTORY_SOURCE: "r2",
    BANDORI_TRACKER_HISTORY_TEST_MAX_PARSED_CACHE_BYTES: "600",
  }));
});

console.log("Bandori tracker-history integration checks passed.");
