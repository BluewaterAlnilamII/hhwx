import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const top10PanelSource = readFileSync(
  new URL("../src/app/[locale]/bandori/eventtracker/Top10Panel.tsx", import.meta.url),
  "utf8",
);
const top10PlayerListSource = readFileSync(
  new URL("../src/app/[locale]/bandori/eventtracker/Top10PlayerList.tsx", import.meta.url),
  "utf8",
);
const top10TooltipSource = readFileSync(
  new URL("../src/app/[locale]/bandori/eventtracker/Top10Tooltip.tsx", import.meta.url),
  "utf8",
);
const trackerChartPanelSource = readFileSync(
  new URL("../src/app/[locale]/bandori/eventtracker/TrackerChartPanel.tsx", import.meta.url),
  "utf8",
);
const trackerActiveMarkerOverlaySource = readFileSync(
  new URL("../src/app/[locale]/bandori/eventtracker/TrackerActiveMarkerOverlay.tsx", import.meta.url),
  "utf8",
);
const top10DataHookSource = readFileSync(
  new URL("../src/app/[locale]/bandori/eventtracker/useBandoriTop10Data.ts", import.meta.url),
  "utf8",
);

test("TOP10 adapts its data into the mature tracker components", () => {
  assert.match(top10PanelSource, /<TrackerStatusSummary/u);
  assert.match(top10PanelSource, /<TrackerChartPanel/u);
  assert.match(top10PanelSource, /lineSeries=\{lineSeries\}/u);
  assert.match(top10PanelSource, /nonWorkingDayBands=\{nonWorkingDayBands\}/u);
  assert.match(top10PanelSource, /showScoreValues=\{false\}/u);
  assert.match(top10PanelSource, /zoomEnabled=\{false\}/u);
  assert.match(trackerChartPanelSource, /const effectiveZoomWidthMultiplier = zoomEnabled \? zoomWidthMultiplier : 1/u);
  assert.match(trackerChartPanelSource, /\{zoomEnabled \? \(/u);
  assert.match(trackerActiveMarkerOverlaySource, /BANDORI_TOPDATA_MAX_SAMPLE_SIZE/u);
  assert.doesNotMatch(top10PanelSource, /Top10ChartPanel/u);
});

test("TOP10 distinguishes blocking loads from background refreshes", () => {
  assert.match(top10PanelSource, /\{ data, loading, refreshing, error, refresh \}/u);
  assert.match(top10PanelSource, /const isBlockingLoading = loading \|\| \(refreshing && data === null\)/u);
  assert.match(top10PanelSource, /\{isBlockingLoading && \(/u);
  assert.match(top10PanelSource, /isRefreshing=\{refreshing\}/u);
  assert.match(top10PanelSource, /isLoading=\{isBlockingLoading\}/u);
  assert.doesNotMatch(top10PanelSource, /isRefreshing=\{loading\}/u);
});

test("TOP10 history uses the same foreground refresh policy as cutoff history", () => {
  assert.match(top10DataHookSource, /LIVE_CLIENT_CACHE_POLICY/u);
  assert.doesNotMatch(top10DataHookSource, /SESSION_CLIENT_CACHE_POLICY/u);
});

test("TOP10 player identity and score copy stays label-free and uses P", () => {
  assert.doesNotMatch(top10PlayerListSource, />ID<|>UID<|>分</u);
  assert.doesNotMatch(top10PlayerListSource, /style=\{\{ backgroundColor: player\.color \}\}/u);
  assert.doesNotMatch(top10TooltipSource, />ID<|>UID<|>分<|`UID /u);
  assert.match(top10PlayerListSource, />P<\/span>/u);
  assert.match(top10TooltipSource, /\{SCORE_FORMATTER\.format\(score\)\} P/u);
});
