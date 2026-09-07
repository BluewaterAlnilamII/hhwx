import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { ApiRouteError } from "../src/lib/api-contracts.ts";
import * as apiCache from "../src/lib/api-cache.ts";
import { BANDORI_SERVER_CODES } from "../src/lib/bandori-server.ts";

const require = createRequire(import.meta.url);
const epoch = Date.parse("2026-09-07T06:00:00Z");
const sources = ["scoreTracking", "userFetch", "dataBuild", "assetBuild"];
const names = ["cutoffTracker", "userFetcher", "masterBuilder", "assetsBuilder"];
const clone = (value) => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(setImmediate);

function report() {
  return { schemaVersion: 1, components: sources.flatMap((service) =>
    BANDORI_SERVER_CODES.map((server) => ({
      service, server, reportState: "confirmed", status: "operational",
      observedAt: "2026-09-07T06:00:00.123456+00:00",
    }))) };
}

function harness(env = {
  HHWX_USER_FETCHER_BASE_URL: "https://backend.example/private/",
  HHWX_BANDORI_BACKEND_TOKEN: "private-test-token",
}) {
  let monotonic = 0;
  let wallClock = epoch;
  let responder = () => Response.json(report());
  const requests = [];
  const timers = [];
  const warnings = [];
  const dependencies = {
    "server-only": {},
    "@/lib/api-contracts": { ApiRouteError },
    "@/lib/api-cache": apiCache,
    "@/lib/bandori-server": { BANDORI_SERVER_CODES },
    "next/server": require("next/server"),
  };
  const context = createContext({
    process: { env }, Buffer, URL,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [wallClock])); }
      static now() { return wallClock; }
    },
    performance: { now: () => monotonic },
    AbortSignal: { timeout: (ms) => {
      assert.equal(ms, 5_000);
      return new AbortController().signal;
    } },
    fetch: async (...args) => { requests.push(args); return responder(...args); },
    setInterval: (callback, ms) => {
      const timer = { callback, ms, unreferenced: false, unref() { this.unreferenced = true; } };
      timers.push(timer);
      return timer;
    },
    console: { warn: (message) => warnings.push(message) },
    require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  });
  function load(path) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const exports = {};
    context.exports = exports;
    runInContext(`(function (exports) { ${outputText}\n })(exports)`, context);
    return exports;
  }
  dependencies["@/lib/hhwx-bandori-backend-server"] = load("../src/lib/hhwx-bandori-backend-server.ts");
  const service = load("../src/lib/service-status-server.ts");
  const player = load("../src/lib/bandori-player-fetcher.ts");
  const snapshot = load("../src/lib/user-game-snapshot-fetcher.ts");
  dependencies["@/lib/service-status-server"] = service;
  dependencies["@/lib/api-response"] = load("../src/lib/api-response.ts");
  const route = load("../src/app/api/status/route.ts");
  return {
    service, player, snapshot, route, requests, timers, warnings,
    loadAgain: () => load("../src/lib/service-status-server.ts"),
    respond: (next) => { responder = next; },
    advance: (ms, wallMs = ms) => { monotonic += ms; wallClock += wallMs; },
    tick: async () => { timers[0].callback(); await settle(); },
    read: () => clone(service.readServiceStatus()),
  };
}

test("status, player, and snapshot requests share token precedence and legacy compatibility", async () => {
  for (const [env, token] of [
    [{ HHWX_BANDORI_BACKEND_TOKEN: " new " }, "new"],
    [{ HHWX_USER_FETCHER_TOKEN: " legacy " }, "legacy"],
    [{ HHWX_BANDORI_BACKEND_TOKEN: "new", HHWX_USER_FETCHER_TOKEN: "legacy" }, "new"],
    [{ HHWX_BANDORI_BACKEND_TOKEN: " ", HHWX_USER_FETCHER_TOKEN: "legacy" }, "legacy"],
    [{}, null],
    [{ HHWX_BANDORI_BACKEND_TOKEN: " ", HHWX_USER_FETCHER_TOKEN: "" }, null],
  ]) {
    const h = harness({ HHWX_USER_FETCHER_BASE_URL: "https://backend.example", ...env });
    h.service.startServiceStatusPolling();
    await settle();
    h.respond(() => Response.json({ profile: {}, snapshot: {} }));
    if (token) {
      await h.player.fetchBandoriPlayerProfile("cn", "1001", 0);
      await h.snapshot.fetchGameUserSnapshot("1001");
      assert.equal(h.requests.length, 3);
      for (const [, options] of h.requests) assert.equal(options.headers.Authorization, `Bearer ${token}`);
    } else {
      assert.equal(h.route.GET().status, 503);
      await assert.rejects(h.player.fetchBandoriPlayerProfile("cn", "1001", 0), { code: "TRACKER_SERVICE_NOT_CONFIGURED" });
      await assert.rejects(h.snapshot.fetchGameUserSnapshot("1001"), { code: "TRACKER_SERVICE_NOT_CONFIGURED" });
      assert.equal(h.requests.length, 0);
    }
  }
});

test("startup collects without visitors; API reads and module reloads share one 60-second collector", async () => {
  const h = harness();
  let resolve;
  h.respond(() => new Promise((done) => { resolve = done; }));
  h.service.startServiceStatusPolling();
  const initial = h.read();
  assert.equal(initial.meta.checkedAt, null);
  assert.deepEqual(Object.keys(initial.data.hhwxBandoriBackend), names);
  for (const service of Object.values(initial.data.hhwxBandoriBackend)) {
    assert.deepEqual(Object.keys(service), [...BANDORI_SERVER_CODES]);
    for (const entry of Object.values(service)) assert.deepEqual(entry, { status: null, observedAt: null });
  }
  h.loadAgain().startServiceStatusPolling();
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, 60_000);
  assert.equal(h.timers[0].unreferenced, true);
  await h.tick();
  assert.equal(h.requests.length, 1, "pending requests must not overlap");
  resolve(Response.json(report()));
  await settle();
  const response = h.route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("cloudflare-cdn-cache-control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.meta.checkedAt, "2026-09-07T06:00:00.000Z");
  assert.equal(payload.data.hhwxBandoriBackend.cutoffTracker.jp.observedAt, "2026-09-07T06:00:00.123Z");
  h.service.readServiceStatus().data.hhwxBandoriBackend.cutoffTracker.jp.status = "error";
  assert.equal(h.read().data.hhwxBandoriBackend.cutoffTracker.jp.status, "operational");
  h.advance(60_000);
  h.route.GET();
  assert.equal(h.requests.length, 1, "visitors only read memory");
  h.respond(() => Response.json(report()));
  await h.tick();
  assert.equal(h.requests.length, 2, "the timer collects without a request");
  assert.equal(h.requests[0][0], "https://backend.example/private/internal/service-health");
  assert.equal(h.requests[0][1].headers.Authorization, "Bearer private-test-token");
  assert.equal(h.requests[0][1].cache, "no-store");
  assert.equal(h.requests[0][1].redirect, "error");
});

test("failures age per component for 180 elapsed seconds and recovery replaces the cached result", async () => {
  const h = harness();
  const data = report();
  data.components[0].status = "error";
  data.components[0].reasonCode = "update_required";
  data.components[4].status = "maintenance";
  h.respond(() => Response.json(data));
  h.service.startServiceStatusPolling();
  await settle();
  assert.equal(h.read().data.hhwxBandoriBackend.userFetcher.jp.status, "maintenance");
  assert.equal(h.read().data.hhwxBandoriBackend.cutoffTracker.jp.reasonCode, "update_required");
  assert.equal(h.route.GET().status, 200, "maintenance and errors are successful status queries");

  const partial = report();
  partial.components[0] = { service: "scoreTracking", server: "jp", reportState: "unconfirmed" };
  h.respond(() => Response.json(partial));
  h.advance(60_000);
  await h.tick();
  const checkedAt = h.read().meta.checkedAt;
  h.advance(179_999, -86_400_000);
  assert.equal(h.read().data.hhwxBandoriBackend.cutoffTracker.jp.reasonCode, "update_required");
  h.advance(1);
  await h.tick();
  const expired = h.read();
  assert.deepEqual(expired.data.hhwxBandoriBackend.cutoffTracker.jp, {
    status: "error", observedAt: "2026-09-07T06:00:00.123Z",
  });
  assert.equal(expired.data.hhwxBandoriBackend.cutoffTracker.en.status, "operational");
  assert.notEqual(expired.meta.checkedAt, checkedAt);

  const recovered = report();
  recovered.components[0].observedAt = "2026-09-07T06:05:00Z";
  h.respond(() => Response.json(recovered));
  h.advance(60_000);
  await h.tick();
  assert.deepEqual(h.read().data.hhwxBandoriBackend.cutoffTracker.jp, {
    status: "operational", observedAt: "2026-09-07T06:05:00.000Z",
  });
});

test("initial missing reports and a stalled collector expire without inventing observation times", async () => {
  const h = harness();
  h.respond(() => { throw new Error("private upstream details"); });
  h.service.startServiceStatusPolling();
  await settle();
  h.advance(179_999);
  assert.equal(h.read().data.hhwxBandoriBackend.assetsBuilder.cn.status, null);
  h.advance(1);
  assert.deepEqual(h.read().data.hhwxBandoriBackend.assetsBuilder.cn, { status: "error", observedAt: null });
  const checkedAt = h.read().meta.checkedAt;
  h.advance(60_000);
  assert.equal(h.read().meta.checkedAt, checkedAt);
  h.respond(() => Response.json(report()));
  await h.tick();
  assert.equal(h.read().data.hhwxBandoriBackend.assetsBuilder.cn.status, "operational");
  h.advance(240_000);
  assert.equal(h.read().data.hhwxBandoriBackend.assetsBuilder.cn.status, "error");
  h.respond(() => { throw new Error("still unavailable"); });
  await h.tick();
  assert.equal(h.read().data.hhwxBandoriBackend.assetsBuilder.cn.status, "error", "resuming failed collection must not reset the outage");
});

test("invalid and duplicate components stay unconfirmed without hiding valid regions or exposing private fields", async () => {
  const h = harness();
  const data = report();
  data.components[0].status = "unexpected";
  data.components[1].observedAt = "2026-02-30T06:00:00Z";
  data.components[2].observedAt = "2026-09-07T06:00:00";
  data.components[3].reportState = "unconfirmed";
  data.components.push({ ...data.components[4], reportState: "unconfirmed" });
  data.components[5].status = "error";
  data.components[5].reasonCode = "private-error";
  data.components[5].message = "https://private.example/token=secret";
  data.components[6].reasonCode = "update_required";
  data.components.push({ ...data.components[7], server: "kr" }, null);
  h.respond(() => Response.json(data));
  h.service.startServiceStatusPolling();
  await settle();
  const snapshot = h.read();
  for (const entry of Object.values(snapshot.data.hhwxBandoriBackend.cutoffTracker)) assert.equal(entry.status, null);
  assert.equal(snapshot.data.hhwxBandoriBackend.userFetcher.jp.status, null);
  assert.equal(snapshot.data.hhwxBandoriBackend.userFetcher.en.status, "error");
  assert.equal(snapshot.data.hhwxBandoriBackend.userFetcher.en.reasonCode, undefined);
  assert.equal(snapshot.data.hhwxBandoriBackend.userFetcher.tw.reasonCode, undefined);
  assert.equal(snapshot.data.hhwxBandoriBackend.userFetcher.cn.status, "operational");
  assert.doesNotMatch(JSON.stringify(snapshot), /private|secret|message|reportState|"kr"/u);
});

test("HTTP errors, invalid envelopes, invalid JSON and oversized streams cannot renew confirmations", async () => {
  const responses = [
    () => new Response("private error", { status: 503 }),
    () => new Response("<html>private error</html>"),
    () => Response.json({ schemaVersion: 2, components: report().components }),
    () => Response.json({ schemaVersion: 1, components: {} }),
    () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(40_000));
      controller.enqueue(new Uint8Array(40_000));
      controller.close();
    } })),
    () => new Response(new ReadableStream({ start(controller) {
      controller.error(new Error("timed out reading the response"));
    } })),
  ];
  for (const respond of responses) {
    const h = harness();
    h.service.startServiceStatusPolling();
    await settle();
    h.respond(respond);
    h.advance(60_000);
    await h.tick();
    h.advance(180_000);
    const snapshot = h.read();
    for (const service of Object.values(snapshot.data.hhwxBandoriBackend)) {
      for (const entry of Object.values(service)) assert.equal(entry.status, "error");
    }
    assert.equal(snapshot.meta.checkedAt, "2026-09-07T06:01:00.000Z");
    assert.doesNotMatch(JSON.stringify(snapshot), /private|timed out/u);
  }
});

test("missing or invalid private configuration returns a sanitized 503 without starting collection", async () => {
  for (const base of [undefined, "", "invalid", "ftp://backend.example", "https://secret@backend.example", "https://backend.example/?token=secret"]) {
    const h = harness({ HHWX_USER_FETCHER_BASE_URL: base, HHWX_USER_FETCHER_TOKEN: "secret" });
    h.service.startServiceStatusPolling();
    assert.equal(h.timers.length, 0);
    assert.equal(h.requests.length, 0);
    const response = h.route.GET();
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.deepEqual(payload, {
      success: false, error: { code: "SERVICE_STATUS_NOT_CONFIGURED", message: "Service status is not configured" },
    });
    assert.doesNotMatch(JSON.stringify(payload), /secret|backend.example/u);
  }
  const h = harness({ HHWX_USER_FETCHER_BASE_URL: "https://backend.example" });
  h.service.startServiceStatusPolling();
  assert.equal(h.route.GET().status, 503);
  assert.equal(h.requests.length, 0);
});
