import assert from "node:assert/strict";
import test from "node:test";
import {
  BANDORI_CHART_SIMULATOR_TEXTURE_RELEASE_DELAY_MS,
  createBandoriChartSimulatorTextureLeaseCache,
} from "../src/lib/bandori/chart-simulator/texture-lease-cache.ts";

function createManualScheduler() {
  let nextId = 1;
  const scheduled = new Map();
  return {
    cancel(timer) {
      scheduled.delete(timer);
    },
    flush(timer) {
      const callback = scheduled.get(timer);
      scheduled.delete(timer);
      callback?.();
    },
    schedule(callback, delayMs) {
      assert.equal(delayMs, BANDORI_CHART_SIMULATOR_TEXTURE_RELEASE_DELAY_MS);
      const timer = nextId++;
      scheduled.set(timer, callback);
      return timer;
    },
    snapshot() {
      return [...scheduled.entries()];
    },
  };
}

test("shared texture leases unload once after the zero-reference grace period", async () => {
  const scheduler = createManualScheduler();
  const loads = [];
  const unloads = [];
  const cache = createBandoriChartSimulatorTextureLeaseCache({
    load: async (url) => {
      loads.push(url);
      return { url };
    },
    unload: async (url) => {
      unloads.push(url);
    },
    releaseDelayMs: BANDORI_CHART_SIMULATOR_TEXTURE_RELEASE_DELAY_MS,
    scheduleRelease: scheduler.schedule,
    cancelRelease: scheduler.cancel,
  });

  const first = cache.acquire("texture-a.png");
  const second = cache.acquire("texture-a.png");
  assert.equal(await first.resource, await second.resource);
  assert.deepEqual(loads, ["texture-a.png"]);

  first.release();
  assert.deepEqual(scheduler.snapshot(), []);
  second.release();
  const [[timer, callback]] = scheduler.snapshot();
  assert.equal(typeof callback, "function");

  const reused = cache.acquire("texture-a.png");
  assert.equal(await reused.resource, await first.resource);
  assert.deepEqual(scheduler.snapshot(), []);
  scheduler.flush(timer);
  assert.deepEqual(unloads, []);

  reused.release();
  const [[releaseTimer]] = scheduler.snapshot();
  scheduler.flush(releaseTimer);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(unloads, ["texture-a.png"]);
});

test("a new lease waits for an in-progress unload before loading the same URL", async () => {
  const scheduler = createManualScheduler();
  const events = [];
  let finishUnload = () => undefined;
  const cache = createBandoriChartSimulatorTextureLeaseCache({
    load: async (url) => {
      events.push(`load:${url}`);
      return { url };
    },
    unload: async (url) => {
      events.push(`unload:${url}`);
      await new Promise((resolve) => {
        finishUnload = resolve;
      });
    },
    releaseDelayMs: 15_000,
    scheduleRelease: scheduler.schedule,
    cancelRelease: scheduler.cancel,
  });

  const oldLease = cache.acquire("shared.png");
  await oldLease.resource;
  oldLease.release();
  const [[releaseTimer]] = scheduler.snapshot();
  scheduler.flush(releaseTimer);
  await Promise.resolve();
  assert.deepEqual(events, ["load:shared.png", "unload:shared.png"]);

  const replacement = cache.acquire("shared.png");
  await Promise.resolve();
  assert.deepEqual(events, ["load:shared.png", "unload:shared.png"]);
  finishUnload();
  await replacement.resource;
  assert.deepEqual(events, [
    "load:shared.png",
    "unload:shared.png",
    "load:shared.png",
  ]);
});

test("page-level cleanup immediately releases every unused texture", async () => {
  const scheduler = createManualScheduler();
  const unloads = [];
  const cache = createBandoriChartSimulatorTextureLeaseCache({
    load: async (url) => ({ url }),
    unload: async (url) => {
      unloads.push(url);
    },
    releaseDelayMs: 15_000,
    scheduleRelease: scheduler.schedule,
    cancelRelease: scheduler.cancel,
  });

  const lease = cache.acquire("unused.png");
  await lease.resource;
  lease.release();
  assert.equal(scheduler.snapshot().length, 1);
  cache.releaseUnusedNow();
  assert.deepEqual(scheduler.snapshot(), []);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(unloads, ["unused.png"]);
});
