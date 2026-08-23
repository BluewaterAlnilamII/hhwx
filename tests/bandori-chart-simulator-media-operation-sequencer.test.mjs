import assert from "node:assert/strict";
import test from "node:test";
import { createBandoriMediaOperationSequencer } from "../src/lib/bandori/chart-simulator/media-operation-sequencer.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function handlers(commits, errors) {
  return {
    commit: (value) => commits.push(value),
    reportError: (error) => errors.push(error),
  };
}

test("a newer media intent aborts and prevents an older out-of-order commit", async () => {
  const sequencer = createBandoriMediaOperationSequencer();
  const commits = [];
  const errors = [];
  const firstGate = deferred();
  const secondGate = deferred();
  let firstContext;
  let secondContext;

  const first = sequencer.runLatest(async (context) => {
    firstContext = context;
    return firstGate.promise;
  }, handlers(commits, errors));
  const second = sequencer.runLatest(async (context) => {
    secondContext = context;
    return secondGate.promise;
  }, handlers(commits, errors));

  assert.equal(firstContext.generation, 1);
  assert.equal(secondContext.generation, 2);
  assert.equal(firstContext.signal.aborted, true);
  assert.equal(secondContext.signal.aborted, false);

  secondGate.resolve("second");
  assert.deepEqual(await second, { status: "committed", generation: 2 });
  assert.deepEqual(commits, ["second"]);

  firstGate.resolve("first");
  assert.deepEqual(await first, { status: "superseded", generation: 1 });
  assert.deepEqual(commits, ["second"]);
  assert.deepEqual(errors, []);
});

test("an explicit cancel aborts the active operation without reporting an error", async () => {
  const sequencer = createBandoriMediaOperationSequencer();
  const commits = [];
  const errors = [];
  let operationSignal;

  const pending = sequencer.runLatest(({ signal }) => {
    operationSignal = signal;
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  }, handlers(commits, errors));

  sequencer.cancel();

  assert.equal(sequencer.generation, 2);
  assert.equal(operationSignal.aborted, true);
  assert.deepEqual(await pending, { status: "superseded", generation: 1 });
  assert.deepEqual(commits, []);
  assert.deepEqual(errors, []);
});

test("only the latest operation reports an asynchronous error", async () => {
  const sequencer = createBandoriMediaOperationSequencer();
  const commits = [];
  const errors = [];
  const firstGate = deferred();
  const secondGate = deferred();
  const firstError = new Error("stale failure");
  const secondError = new Error("current failure");

  const first = sequencer.runLatest(() => firstGate.promise, handlers(commits, errors));
  const second = sequencer.runLatest(() => secondGate.promise, handlers(commits, errors));

  firstGate.reject(firstError);
  assert.deepEqual(await first, { status: "superseded", generation: 1 });
  assert.deepEqual(errors, []);

  secondGate.reject(secondError);
  assert.deepEqual(await second, {
    status: "failed",
    generation: 2,
    error: secondError,
  });
  assert.deepEqual(errors, [secondError]);
  assert.deepEqual(commits, []);
});

test("throwIfSuperseded stops a stale continuation after an await", async () => {
  const sequencer = createBandoriMediaOperationSequencer();
  const commits = [];
  const errors = [];
  const firstGate = deferred();
  const secondGate = deferred();
  let continuedAfterGuard = false;

  const first = sequencer.runLatest(async (context) => {
    await firstGate.promise;
    context.throwIfSuperseded();
    continuedAfterGuard = true;
    return "first";
  }, handlers(commits, errors));
  const second = sequencer.runLatest(async () => secondGate.promise, handlers(commits, errors));

  firstGate.resolve();
  assert.deepEqual(await first, { status: "superseded", generation: 1 });
  assert.equal(continuedAfterGuard, false);

  secondGate.resolve("second");
  assert.deepEqual(await second, { status: "committed", generation: 2 });
  assert.deepEqual(commits, ["second"]);
  assert.deepEqual(errors, []);
});
