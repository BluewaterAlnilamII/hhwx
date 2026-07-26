import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  addBandoriCnSchedules,
  parseBandoriEventSummaries,
} from "../src/lib/bandori-events.ts";

function eventRecord(overrides = {}) {
  return {
    eventType: "medley",
    eventName: ["JP event", "EN event", "TW event", "CN event"],
    band: "mix",
    stampRewardId: [10, null, null, 20],
    stampCharacterId: 2,
    assetBundleName: "event_bundle",
    bannerAssetBundleName: "banner_event1",
    startAt: ["1000", null, null, null],
    endAt: ["2000", null, null, null],
    attributes: [{ attribute: "happy", percent: 20 }],
    characters: [{ characterId: 2, percent: 20 }],
    eventAttributeAndCharacterBonus: { pointPercent: 20, parameterPercent: 50 },
    eventCharacterParameterBonus: { performance: 50 },
    members: [{ situationId: 100, percent: 10 }],
    limitBreaks: [{ rarity: 5, rank: 1, percent: 5 }],
    musics: [[{ musicId: 5 }], null, null, [{ musicId: 6 }]],
    ...overrides,
  };
}

test("the shared adapter preserves regional metadata and embedded event bonuses", () => {
  const { events } = parseBandoriEventSummaries({
    success: true,
    data: { "1": eventRecord({ cnSchedule: { startAt: 3000, endAt: 4000 } }) },
  });

  assert.equal(events.length, 1);
  assert.deepEqual(events[0].name, { jp: "JP event", cn: "CN event" });
  assert.equal(events[0].stampCharacterId, 2);
  assert.deepEqual(events[0].timeline.cnSchedule, { startAt: 3000, endAt: 4000 });
  assert.deepEqual(events[0].musicIds, { jp: [5], cn: [6] });
  assert.deepEqual(events[0].bonus, {
    attributes: [{ attribute: "happy", percent: 20 }],
    characters: [{ characterId: 2, percent: 20 }],
    pointPercent: 20,
    parameterPercent: 50,
    performancePercent: 50,
    techniquePercent: null,
    visualPercent: null,
    members: [{ situationId: 100, percent: 10 }],
    limitBreaks: [{ rarity: 5, rank: 1, percent: 5 }],
  });
});

test("the shared adapter accepts the former regional stamp character during rollout", () => {
  const { events } = parseBandoriEventSummaries({
    success: true,
    data: { "1": eventRecord({ stampCharacterId: [1, null, null, 2] }) },
  });

  assert.equal(events[0].stampCharacterId, 2);
});

test("CN schedule is inserted after endAt only while the official CN range is incomplete", () => {
  const records = {
    "1": eventRecord(),
    "2": eventRecord({
      startAt: ["1000", null, null, "3000"],
      endAt: ["2000", null, null, "4000"],
    }),
  };
  const result = addBandoriCnSchedules(records, [
    { eventId: 1, predictedStart: "2026-08-01", predictedEnd: "2026-08-08" },
    { eventId: 2, predictedStart: "2026-09-01", predictedEnd: "2026-09-08" },
  ]);

  const keys = Object.keys(result["1"]);
  assert.equal(keys[keys.indexOf("endAt") + 1], "cnSchedule");
  assert.deepEqual(result["1"].cnSchedule, {
    startAt: Date.parse("2026-08-01T15:00:00+08:00"),
    endAt: Date.parse("2026-08-08T22:59:59+08:00"),
  });
  assert.equal("cnSchedule" in result["2"], false);
});

test("an invalid master response fails closed", () => {
  assert.throws(
    () => parseBandoriEventSummaries({ success: true, data: { invalid: [] } }),
    /invalid/u,
  );
});

test("Team Builder distinguishes an Events failure from initial loading and exposes retry", async () => {
  const source = await readFile(
    new URL("../src/app/[locale]/bandori/teambuilder/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /loaded: masterEventsLoaded/u);
  assert.match(source, /error: masterEventsError/u);
  assert.match(source, /refresh: refreshMasterEvents/u);
  assert.match(source, /!masterEventsLoaded && masterEventsError === null/u);
  assert.match(source, /onClick=\{retryLoadData\}/u);
});
