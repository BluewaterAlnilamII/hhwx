import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const pageSource = readSource("../src/app/[locale]/bandori/events/EventTrackerPage.tsx");
const trackerDataSource = readSource("../src/app/[locale]/bandori/events/useTrackerData.ts");
const top10DataSource = readSource("../src/app/[locale]/bandori/events/useBandoriTop10Data.ts");
const comparisonDataSource = readSource("../src/app/[locale]/bandori/events/useComparisonTrackerData.ts");
const comparisonPreferencesSource = readSource("../src/app/[locale]/bandori/events/useComparisonPreferences.ts");

test("all servers request cutoff and TOP10 HTTP history", () => {
  assert.match(
    pageSource,
    /hasAppliedInitialUrlState && activeView === "tracker" && !isTop10Selected/u,
  );
  assert.doesNotMatch(
    pageSource,
    /hasAppliedInitialUrlState && selectedServer === 3 && activeView === "tracker" && !isTop10Selected/u,
  );
  assert.match(trackerDataSource, /tracker-\$\{server\}/u);
  assert.match(trackerDataSource, /tracker\/data\?server=\$\{server\}/u);
  assert.match(top10DataSource, /const canReadTopDataHistory = enabled && eventId !== null/u);
  assert.match(top10DataSource, /topdata\?server=\$\{server\}/u);
});

test("regional history never creates tracker latest or Broadcast capabilities", () => {
  assert.match(trackerDataSource, /server !== 3 \|\| trackingMode !== "event"/u);
  assert.match(trackerDataSource, /const canUseTrackerLive = server === 3 && liveTarget !== null/u);
  assert.match(top10DataSource, /const canUseTopDataLive = canReadTopDataHistory && server === 3/u);
  assert.match(top10DataSource, /useTopDataLiveSubscription\(eventId, canUseTopDataLive\)/u);
  assert.doesNotMatch(top10DataSource, /useTopDataLiveSubscription\(eventId, canReadTopDataHistory\)/u);
});

test("regional schedules, comparison requests, and caches use the selected server", () => {
  assert.doesNotMatch(trackerDataSource, /resolveBandoriEventScheduleWindow/u);
  assert.match(trackerDataSource, /resolveBandoriEventServerScheduleWindow\(event, server\)/u);
  assert.match(comparisonDataSource, /getBandoriServerCode\(server\).*config\.targetType/su);
  assert.match(comparisonDataSource, /tracker\/data\?server=\$\{server\}/u);
  assert.match(comparisonDataSource, /liveSnapshot\.server !== getBandoriServerCode\(server\)/u);
  assert.match(comparisonPreferencesSource, /serverSuffix = getBandoriServerCode\(server\)/u);
  assert.match(comparisonPreferencesSource, /CONFIG_STORAGE_KEY\}:\$\{serverSuffix\}/u);
  assert.match(
    comparisonPreferencesSource,
    /configsState\.storageKey === configsKey \? configsState\.value : \[\]/u,
  );
  assert.match(
    comparisonPreferencesSource,
    /alignmentState\.storageKey === alignmentKey/u,
  );
});

test("CN-only presentation rules do not leak to regional servers", () => {
  assert.match(pageSource, /return server === 3\s+&& targetId <= CN_T1500_LEGACY_EVENT_ID_LIMIT/u);
  assert.match(pageSource, /selectedServer === 3\s+\? buildNonWorkingDayBands/u);
  assert.match(pageSource, /selectedServer === 3 && activeView === "tracker".*showBestdoriPrediction/u);
});
