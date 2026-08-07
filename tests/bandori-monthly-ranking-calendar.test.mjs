import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_MONTHLY_RANKING_EPOCHS,
  bandoriMonthlyRankingIdToPeriod,
  bandoriMonthlyRankingPeriodToId,
  getBandoriMonthlyRankingMidnights,
  getBandoriMonthlyRankingWindow,
  getCurrentBandoriMonthlyRankingWindow,
  remapBandoriMonthlyRankingId,
} from "../src/lib/bandori-monthly-ranking-calendar.ts";

const SERVERS = ["jp", "en", "tw", "cn"];

test("monthly ranking epochs and IDs are independent for all servers", () => {
  assert.deepEqual(
    Object.fromEntries(SERVERS.map((server) => [
      server,
      BANDORI_MONTHLY_RANKING_EPOCHS[server].anchorPeriod,
    ])),
    { jp: "2024-10", en: "2025-10", tw: "2025-06", cn: "2025-02" },
  );
  assert.deepEqual(
    Object.fromEntries(SERVERS.map((server) => [
      server,
      bandoriMonthlyRankingPeriodToId(server, "2026-08"),
    ])),
    { jp: 23, en: 11, tw: 15, cn: 19 },
  );

  for (const server of SERVERS) {
    for (const period of ["2025-12", "2026-01", "2026-08"]) {
      if (period < BANDORI_MONTHLY_RANKING_EPOCHS[server].anchorPeriod) continue;
      const monthId = bandoriMonthlyRankingPeriodToId(server, period);
      assert.equal(bandoriMonthlyRankingIdToPeriod(server, monthId), period);
    }
  }
});

test("monthly ranking windows use the verified fixed server offsets", () => {
  const cases = [
    ["jp", 23, "2026-08-01T06:00:00.000Z", "2026-08-31T14:59:59.999Z"],
    ["en", 11, "2026-08-01T08:00:00.000Z", "2026-09-01T07:59:59.999Z"],
    ["tw", 15, "2026-08-01T07:00:00.000Z", "2026-08-31T15:59:59.999Z"],
    ["cn", 19, "2026-08-01T05:00:00.000Z", "2026-08-31T15:59:59.999Z"],
  ];
  for (const [server, monthId, opensAt, endsAt] of cases) {
    const window = getBandoriMonthlyRankingWindow(server, monthId);
    assert.equal(new Date(window.opensAt).toISOString(), opensAt);
    assert.equal(new Date(window.endsAt).toISOString(), endsAt);
  }
});

test("current monthly window changes at each server opening boundary", () => {
  const cnBefore = getCurrentBandoriMonthlyRankingWindow(
    "cn",
    new Date("2026-08-01T04:59:59.999Z"),
  );
  assert.equal(cnBefore.period, "2026-07");
  assert.equal(cnBefore.monthId, 18);

  const cnOpened = getCurrentBandoriMonthlyRankingWindow(
    "cn",
    new Date("2026-08-01T05:00:00.000Z"),
  );
  assert.equal(cnOpened.period, "2026-08");
  assert.equal(cnOpened.monthId, 19);

  const enBefore = getCurrentBandoriMonthlyRankingWindow(
    "en",
    new Date("2026-08-01T07:59:59.999Z"),
  );
  assert.equal(enBefore.period, "2026-07");
  assert.equal(enBefore.monthId, 10);
});

test("server changes remap monthly state by period rather than numeric ID", () => {
  assert.equal(remapBandoriMonthlyRankingId("cn", "jp", 19), 23);
  assert.equal(remapBandoriMonthlyRankingId("jp", "en", 23), 11);
  assert.equal(remapBandoriMonthlyRankingId("en", "tw", 11), 15);
  assert.equal(remapBandoriMonthlyRankingId("tw", "cn", 15), 19);
});

test("midnight markers follow the selected server calendar", () => {
  const window = getBandoriMonthlyRankingWindow("en", 11);
  const midnights = getBandoriMonthlyRankingMidnights(
    "en",
    window.opensAt,
    window.opensAt + 2 * 24 * 60 * 60 * 1_000,
  );
  assert.deepEqual(midnights.map((value) => new Date(value).toISOString()), [
    "2026-08-02T08:00:00.000Z",
    "2026-08-03T08:00:00.000Z",
  ]);
});

test("periods before a server epoch are rejected", () => {
  assert.throws(
    () => bandoriMonthlyRankingPeriodToId("en", "2025-09"),
    /predates en epoch/u,
  );
  assert.throws(
    () => bandoriMonthlyRankingIdToPeriod("jp", 0),
    /Invalid Bandori monthly ranking ID/u,
  );
});
