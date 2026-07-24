import assert from "node:assert/strict";
import test from "node:test";

import {
  createBandoriPublicAssetIndexStore,
} from "../src/lib/bandori-public-asset-index-client.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("same index URL uses one first-load request with the public HTTP options", async () => {
  const response = deferred();
  const calls = [];
  const store = createBandoriPublicAssetIndexStore({
    parse: (value) => value,
    fetcher: (url, init) => {
      calls.push({ url, init });
      return response.promise;
    },
    now: () => 100,
  });

  const first = store.load("https://assets.example.test/bandori/cards/index.json");
  const second = store.load("https://assets.example.test/bandori/cards/index.json");
  assert.equal(first, second);
  assert.equal(store.getState("https://assets.example.test/bandori/cards/index.json").inFlight, first);
  assert.deepEqual(calls, [{
    url: "https://assets.example.test/bandori/cards/index.json",
    init: { cache: "default", credentials: "omit" },
  }]);

  response.resolve(jsonResponse({ generation: 1 }));
  assert.deepEqual(await first, { generation: 1 });
  assert.deepEqual(store.getState("https://assets.example.test/bandori/cards/index.json"), {
    value: { generation: 1 },
    loadedAt: 100,
    inFlight: null,
  });
});

test("failed promises are evicted so the next call retries", async () => {
  let attempts = 0;
  const store = createBandoriPublicAssetIndexStore({
    parse: (value) => value,
    fetcher: async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: true }, 503)
        : jsonResponse({ generation: 2 });
    },
  });
  const url = "https://assets.example.test/bandori/events/index.json";

  await assert.rejects(store.load(url), /HTTP 503/u);
  assert.equal(store.getState(url).inFlight, null);
  assert.deepEqual(await store.load(url), { generation: 2 });
  assert.equal(attempts, 2);
});

test("a successful value is reused for the full page lifetime", async () => {
  let attempts = 0;
  let now = 1_000;
  const store = createBandoriPublicAssetIndexStore({
    parse: (value) => value,
    fetcher: async () => {
      attempts += 1;
      return jsonResponse({ generation: attempts });
    },
    now: () => now,
  });
  const url = "https://assets.example.test/bandori/cards/index.json";

  assert.deepEqual(await store.load(url), { generation: 1 });
  now += 24 * 60 * 60 * 1_000;
  assert.deepEqual(await store.load(url), { generation: 1 });
  assert.equal(attempts, 1);
});

test("refresh failures retain the last-good value and loadedAt", async () => {
  let attempts = 0;
  const requestOptions = [];
  const store = createBandoriPublicAssetIndexStore({
    parse: (value) => value,
    fetcher: async (_url, init) => {
      attempts += 1;
      requestOptions.push(init);
      if (attempts === 1) {
        return jsonResponse({ generation: 3 });
      }
      throw new Error("offline");
    },
    now: () => 300,
  });
  const url = "https://assets.example.test/bandori/cards/index.json";

  await store.load(url);
  await assert.rejects(store.load(url, { refresh: true }), /offline/u);
  assert.deepEqual(store.getState(url), {
    value: { generation: 3 },
    loadedAt: 300,
    inFlight: null,
  });
  assert.deepEqual(requestOptions, [
    { cache: "default", credentials: "omit" },
    { cache: "no-cache", credentials: "omit" },
  ]);
});

test("independent index URLs keep the correct value when responses arrive out of order", async () => {
  const responses = new Map([
    ["https://assets.example.test/bandori/cards/index.json", deferred()],
    ["https://assets.example.test/bandori/events/index.json", deferred()],
  ]);
  let now = 0;
  const store = createBandoriPublicAssetIndexStore({
    parse: (value) => value,
    fetcher: (url) => responses.get(url).promise,
    now: () => ++now,
  });
  const cardsUrl = "https://assets.example.test/bandori/cards/index.json";
  const eventsUrl = "https://assets.example.test/bandori/events/index.json";

  const cardsPromise = store.load(cardsUrl);
  const eventsPromise = store.load(eventsUrl);
  responses.get(eventsUrl).resolve(jsonResponse({ kind: "events" }));
  await eventsPromise;
  responses.get(cardsUrl).resolve(jsonResponse({ kind: "cards" }));
  await cardsPromise;

  assert.deepEqual(store.getState(cardsUrl).value, { kind: "cards" });
  assert.deepEqual(store.getState(eventsUrl).value, { kind: "events" });
});
