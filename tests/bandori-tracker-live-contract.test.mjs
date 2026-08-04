import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bandoriTrackerMonthIdToPeriod,
  buildBandoriTrackerLiveTopic,
  mergeBandoriTrackerLiveSnapshots,
  parseBandoriTrackerLiveSnapshot,
} from "../src/lib/bandori-tracker-live-contract.ts";
import {
  authorizeBandoriTrackerRealtimeConnection,
  subscribeBandoriTrackerLive,
} from "../src/lib/bandori-tracker-live-connection.ts";
import {
  appendBandoriTrackerLivePoint,
  buildBandoriTrackerLiveSeriesUpdates,
} from "../src/lib/bandori-tracker-live-series.ts";
import { selectCachedFetchData } from "../src/hooks/useCachedFetch.ts";
import { formatBandoriTrackerUpdateAge } from "../src/lib/bandori-tracker-time.ts";

const eventPayload = {
  schemaVersion: 1,
  server: "cn",
  namespace: "events",
  targetId: 316,
  revision: 42,
  sampleId: "cn:events:316:1780000000000",
  publishedAt: 1780000000000,
  event: [
    [100, 1780000000000, 123456],
    [1000, 1780000000000, 112233, 3],
  ],
  songs: [[123, 100, 1780000000000, 654321]],
};

const trackerDataHookSource = readFileSync(
  new URL("../src/app/[locale]/bandori/eventtracker/useTrackerData.ts", import.meta.url),
  "utf8",
);
const comparisonDataHookSource = readFileSync(
  new URL("../src/app/[locale]/bandori/eventtracker/useComparisonTrackerData.ts", import.meta.url),
  "utf8",
);

test("history-only mode does not open legacy Postgres Changes connections", () => {
  for (const source of [trackerDataHookSource, comparisonDataHookSource]) {
    assert.doesNotMatch(source, /postgres_changes|BANDORI_TRACKER_DATA_TABLE/u);
    assert.match(source, /useBandoriTrackerLiveListener/u);
  }
});

test("parses event/song points and interprets only the final flag bit", () => {
  const parsed = parseBandoriTrackerLiveSnapshot(eventPayload, {
    server: "cn",
    namespace: "events",
    targetId: 316,
  });

  assert.equal(parsed.revision, 42);
  assert.equal(parsed.event[0].isFinal, undefined);
  assert.equal(parsed.event[1].isFinal, true);
  assert.equal(parsed.songs[0].songId, 123);
});

test("rejects null/default flags and target mismatches", () => {
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot({ ...eventPayload, event: [[100, 1, 1, null]] }),
    /flags/,
  );
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot(eventPayload, {
      server: "cn",
      namespace: "events",
      targetId: 317,
    }),
    /does not match/,
  );
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot({
      ...eventPayload,
      event: [[100, eventPayload.publishedAt + 1, 123456]],
    }),
    /cannot exceed publishedAt/,
  );
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot({ ...eventPayload, period: "2026-07" }),
    /must not contain period/,
  );
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot({
      ...eventPayload,
      publishedAt: Number.MAX_SAFE_INTEGER + 1,
      sampleId: `cn:events:316:${Number.MAX_SAFE_INTEGER + 1}`,
    }),
    /revision and publishedAt/,
  );
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot({
      ...eventPayload,
      event: [...eventPayload.event].reverse(),
    }),
    /canonical/,
  );
});

test("revision merge ignores duplicate and out-of-order snapshots", () => {
  const current = parseBandoriTrackerLiveSnapshot(eventPayload);
  const stale = parseBandoriTrackerLiveSnapshot({
    ...eventPayload,
    revision: 41,
    sampleId: "cn:events:316:1779999999000",
    publishedAt: 1779999999000,
    event: [[100, 1779999999000, 120000]],
    songs: [[123, 100, 1779999999000, 650000]],
  });
  const newer = parseBandoriTrackerLiveSnapshot({
    ...eventPayload,
    revision: 43,
    sampleId: "cn:events:316:1780000060000",
    publishedAt: 1780000060000,
    event: [[100, 1780000060000, 124000]],
  });

  assert.equal(mergeBandoriTrackerLiveSnapshots(current, stale), current);
  assert.equal(mergeBandoriTrackerLiveSnapshots(current, current), current);
  assert.equal(mergeBandoriTrackerLiveSnapshots(current, newer), newer);
  const conflicting = parseBandoriTrackerLiveSnapshot({
    ...eventPayload,
    event: [[100, 1780000000000, 999999]],
  });
  assert.throws(
    () => mergeBandoriTrackerLiveSnapshots(current, conflicting),
    /same revision/,
  );
});

test("monthly target derives the source period and private topic", () => {
  const period = bandoriTrackerMonthIdToPeriod(18);
  assert.equal(period, "2026-07");
  assert.equal(
    buildBandoriTrackerLiveTopic({ server: "cn", namespace: "monthly", targetId: 18, period }),
    "bandori:cutoff:cn:monthly:2026-07",
  );
});

test("a tier switch never exposes or seeds the previous tier series", () => {
  const t100Key = "tracker-3-316-event-100";
  const t40000Key = "tracker-3-316-event-40000";
  const t100Series = [{ time: 1780000000000, ep: 10_351_005 }];

  assert.equal(
    selectCachedFetchData({ key: t100Key, value: t100Series }, t40000Key),
    null,
  );

  const firstLivePoint = appendBandoriTrackerLivePoint(
    { [t100Key]: t100Series },
    t40000Key,
    { time: 1780000060000, ep: 211_030 },
  );
  assert.deepEqual(firstLivePoint[t100Key], t100Series);
  assert.deepEqual(firstLivePoint[t40000Key], [{ time: 1780000060000, ep: 211_030 }]);

  const sameEpNextMinute = appendBandoriTrackerLivePoint(
    firstLivePoint,
    t40000Key,
    { time: 1780000120000, ep: 211_030 },
  );
  assert.deepEqual(sameEpNextMinute[t40000Key], [
    { time: 1780000060000, ep: 211_030 },
    { time: 1780000120000, ep: 211_030 },
  ]);
});

test("one private snapshot seeds every event tier and ignores legacy song points", () => {
  const snapshot = parseBandoriTrackerLiveSnapshot({
    ...eventPayload,
    songs: [
      [123, 100, 1780000000000, 654321],
      [456, 1000, 1780000000000, 543210],
    ],
  });

  const updates = buildBandoriTrackerLiveSeriesUpdates(snapshot);

  assert.deepEqual(
    updates.cutoffUpdates.map((update) => update.cacheKey),
    ["tracker-3-316-event-100", "tracker-3-316-event-1000"],
  );
  assert.deepEqual(updates.songUpdates, []);
  assert.deepEqual(updates.resultKeys, [
    "tracker-3-316-event-100",
    "tracker-3-316-event-1000",
  ]);
});

test("monthly snapshots are ignored by the event-only live series", () => {
  const snapshot = parseBandoriTrackerLiveSnapshot({
    schemaVersion: 1,
    server: "cn",
    namespace: "monthly",
    targetId: 18,
    period: "2026-07",
    revision: 24,
    sampleId: "cn:monthly:18:1780000000000",
    publishedAt: 1780000000000,
    monthly: [
      [100, 1780000000000, 123456],
      [1000, 1780000000000, 112233],
    ],
  });

  const updates = buildBandoriTrackerLiveSeriesUpdates(snapshot);
  assert.deepEqual(updates.cutoffUpdates, []);
  assert.deepEqual(updates.songUpdates, []);
  assert.deepEqual(updates.resultKeys, []);
});

test("private realtime auth completes before a connection may continue", async () => {
  let authResolved = false;
  let releaseAuth;
  const auth = new Promise((resolve) => {
    releaseAuth = () => {
      authResolved = true;
      resolve();
    };
  });
  const pending = authorizeBandoriTrackerRealtimeConnection(
    () => auth,
    () => authResolved,
  );

  assert.equal(authResolved, false);
  releaseAuth();
  assert.equal(await pending, true);

  assert.equal(
    await authorizeBandoriTrackerRealtimeConnection(
      async () => undefined,
      () => false,
    ),
    false,
  );
});

test("shared live connection buffers broadcasts until snapshot bootstrap completes", async () => {
  let releaseSnapshot;
  const snapshotPromise = new Promise((resolve) => {
    releaseSnapshot = resolve;
  });
  let broadcastHandler;
  let removeCount = 0;
  const channel = {
    on(_type, _filter, handler) {
      broadcastHandler = handler;
      return this;
    },
    subscribe(callback) {
      callback("SUBSCRIBED");
      return this;
    },
  };
  const client = {
    realtime: { setAuth: async () => undefined },
    channel: () => channel,
    removeChannel: async () => {
      removeCount += 1;
    },
  };
  const revisions = [];
  const unsubscribe = subscribeBandoriTrackerLive(
    {
      topic: "bandori:test:shared-live:1",
      event: "snapshot",
      label: "bandoriTrackerLiveTest",
      client,
      loadSnapshot: () => snapshotPromise,
      parseSnapshot: (value) => value,
      mergeSnapshots: (current, incoming) => (
        !current || incoming.revision > current.revision ? incoming : current
      ),
      getRevision: (value) => value.revision,
    },
    (value) => revisions.push(value.revision),
  );

  await new Promise((resolve) => setImmediate(resolve));
  broadcastHandler({ payload: { revision: 2 } });
  releaseSnapshot({ revision: 1 });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(revisions, [1, 2]);
  unsubscribe();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removeCount, 1);
});

test("shared live connection reloads latest after a prolonged hidden state", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const hiddenTimerId = 60_000;
  let visibilityHandler;
  let hiddenDisconnect;
  let channelCount = 0;
  let loadCount = 0;
  let removeCount = 0;
  let unsubscribe;

  const testDocument = {
    visibilityState: "visible",
    addEventListener(type, handler) {
      if (type === "visibilitychange") visibilityHandler = handler;
    },
  };
  const testWindow = {
    setTimeout(handler, delayMs) {
      if (delayMs === hiddenTimerId) {
        hiddenDisconnect = handler;
        return hiddenTimerId;
      }
      return globalThis.setTimeout(handler, delayMs);
    },
    clearTimeout(timerId) {
      if (timerId === hiddenTimerId) {
        hiddenDisconnect = undefined;
        return;
      }
      globalThis.clearTimeout(timerId);
    },
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: testDocument,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: testWindow,
  });

  try {
    const client = {
      realtime: { setAuth: async () => undefined },
      channel: () => {
        channelCount += 1;
        return {
          on() {
            return this;
          },
          subscribe(callback) {
            callback("SUBSCRIBED");
            return this;
          },
        };
      },
      removeChannel: async () => {
        removeCount += 1;
      },
    };
    const revisions = [];
    unsubscribe = subscribeBandoriTrackerLive(
      {
        topic: "bandori:test:shared-live:visibility",
        event: "snapshot",
        label: "bandoriTrackerLiveVisibilityTest",
        client,
        loadSnapshot: async () => ({ revision: ++loadCount }),
        parseSnapshot: (value) => value,
        mergeSnapshots: (current, incoming) => (
          !current || incoming.revision > current.revision ? incoming : current
        ),
        getRevision: (value) => value.revision,
      },
      (value) => revisions.push(value.revision),
    );

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(channelCount, 1);
    assert.equal(loadCount, 1);
    assert.deepEqual(revisions, [1]);

    testDocument.visibilityState = "hidden";
    visibilityHandler();
    assert.equal(typeof hiddenDisconnect, "function");
    hiddenDisconnect();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(removeCount, 1);

    testDocument.visibilityState = "visible";
    visibilityHandler();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(channelCount, 2);
    assert.equal(loadCount, 2);
    assert.deepEqual(revisions, [1, 2]);
  } finally {
    unsubscribe?.();
    await new Promise((resolve) => setImmediate(resolve));
    if (originalDocument) {
      Object.defineProperty(globalThis, "document", originalDocument);
    } else {
      delete globalThis.document;
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete globalThis.window;
    }
  }
});

test("update age uses seconds for the first minute and minutes afterwards", () => {
  const timestamp = 1_780_000_000_000;

  assert.deepEqual(formatBandoriTrackerUpdateAge(timestamp, timestamp), {
    label: "0秒前",
    isStale: false,
  });
  assert.deepEqual(formatBandoriTrackerUpdateAge(timestamp, timestamp + 59_999), {
    label: "59秒前",
    isStale: false,
  });
  assert.deepEqual(formatBandoriTrackerUpdateAge(timestamp, timestamp + 60_000), {
    label: "1分钟前",
    isStale: false,
  });
  assert.deepEqual(formatBandoriTrackerUpdateAge(timestamp, timestamp + 31 * 60_000), {
    label: "31分钟前",
    isStale: true,
  });
});
