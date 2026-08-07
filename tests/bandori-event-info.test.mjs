import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildBandoriEventCommentTargetId, parseBandoriEventCommentTargetId } from "../src/lib/bandori-comment-target.ts";
import {
  BANDORI_EVENT_BAND_ID_BY_SLUG,
  getBandoriEventBandId,
  resolveBandoriEventBandName,
} from "../src/lib/bandori-event-band.ts";
import { getBandoriEventStatusAt } from "../src/lib/bandori-event-status.ts";
import {
  buildEventInfoModel,
  deriveEventSongs,
  deriveEventSongsWithFallback,
} from "../src/app/[locale]/bandori/events/eventInfo.ts";
import {
  parseEventTrackerServerSearchParam,
  resolveEventTrackerServerSelection,
} from "../src/app/[locale]/bandori/events/urlQuery.ts";

const music = {
  "764": {
    musicTitle: ["Shining Leaves", null, "Shining Leaves", "Shining Leaves"],
    bandName: ["Morfonica", null, "Morfonica", "Morfonica"],
    publishedAt: [1768024800000, null, 1782630000000, 1785128400000],
    difficulty: { "0": { playLevel: 7 }, "3": { playLevel: 25 } },
  },
  "765": {
    musicTitle: ["START!! True dreams", null, null, "START!! True dreams"],
    publishedAt: [1768370400000, null, null, 1783659600000],
    difficulty: { "0": { playLevel: 7 }, "3": { playLevel: 25 } },
  },
};

const eventTrackerPageSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/EventTrackerPage.tsx", import.meta.url),
  "utf8",
);
const eventSwitcherSource = readFileSync(
  new URL("../src/app/[locale]/bandori/BandoriEventSwitcher.tsx", import.meta.url),
  "utf8",
);
const serverIconSource = readFileSync(
  new URL("../src/components/bandori/BandoriServerIcon.tsx", import.meta.url),
  "utf8",
);
const eventInfoPanelSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/EventInfoPanel.tsx", import.meta.url),
  "utf8",
);
const eventBonusPanelSource = readFileSync(
  new URL("../src/components/bandori/BandoriEventBonusPanel.tsx", import.meta.url),
  "utf8",
);
const commentContentSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/commentContent.tsx", import.meta.url),
  "utf8",
);
const trackerStatusSummarySource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/TrackerStatusSummary.tsx", import.meta.url),
  "utf8",
);

test("event songs are derived from the selected server publication window", () => {
  assert.deepEqual(
    deriveEventSongs(music, 0, 1768024800000, 1768823999000).map((song) => song.id),
    [764, 765],
  );
  assert.deepEqual(
    deriveEventSongs(music, 3, 1785128400000, 1785941999000).map((song) => song.id),
    [764],
  );
});

test("event info time windows follow current, JP, EN, TW, CN with per-server schedules", () => {
  const record = {
    eventType: "story",
    eventName: ["JP", "EN", "TW", "CN"],
    startAt: [1000, null, 5000, null],
    endAt: [2000, null, 6000, null],
    cnSchedule: { startAt: 7000, endAt: 8000 },
  };

  assert.deepEqual(
    (({ startAt, endAt, timeServer, timeSource }) => ({ startAt, endAt, timeServer, timeSource }))(buildEventInfoModel(record, 2)),
    { startAt: 5000, endAt: 6000, timeServer: 2, timeSource: "official" },
  );
  assert.deepEqual(
    (({ startAt, endAt, timeServer, timeSource }) => ({ startAt, endAt, timeServer, timeSource }))(buildEventInfoModel(record, 3)),
    { startAt: 7000, endAt: 8000, timeServer: 3, timeSource: "predicted" },
  );
  assert.deepEqual(
    (({ startAt, endAt, timeServer, timeSource }) => ({ startAt, endAt, timeServer, timeSource }))(buildEventInfoModel(record, 1)),
    { startAt: 1000, endAt: 2000, timeServer: 0, timeSource: "official" },
  );
  assert.deepEqual(
    (({ startAt, endAt, timeServer, timeSource }) => ({ startAt, endAt, timeServer, timeSource }))(
      buildEventInfoModel({
        ...record,
        startAt: [null, null, 5000, 9000],
        endAt: [null, null, 6000, 10000],
        cnSchedule: undefined,
      }, 1),
    ),
    { startAt: 5000, endAt: 6000, timeServer: 2, timeSource: "official" },
  );
});

test("event songs keep publication timestamps and event windows on one fallback server", () => {
  const selection = deriveEventSongsWithFallback(music, {
    startAt: [1768024800000, null, 1800000000000, null],
    endAt: [1768823999000, null, 1800600000000, null],
  }, 1);

  assert.equal(selection.sourceServer, 0);
  assert.deepEqual(selection.songs.map((song) => song.id), [764, 765]);
  assert.equal(selection.startAt, 1768024800000);
  assert.equal(selection.endAt, 1768823999000);
});

test("event status uses the tracker three-state rule", () => {
  assert.equal(getBandoriEventStatusAt(999, 1000, 2000), "未开始");
  assert.equal(getBandoriEventStatusAt(1000, 1000, 2000), "进行中");
  assert.equal(getBandoriEventStatusAt(2000, 1000, 2000), "进行中");
  assert.equal(getBandoriEventStatusAt(2001, 1000, 2000), "已结束");
  assert.equal(getBandoriEventStatusAt(1000, null, null), "未开始");
  const fallbackOnlyModel = buildEventInfoModel({
    eventType: "story",
    startAt: [1000, null, null, null],
    endAt: [2000, null, null, null],
  }, 1);
  assert.equal(fallbackOnlyModel.timeServer, 0);
  assert.equal(fallbackOnlyModel.statusStartAt, null);
  assert.equal(fallbackOnlyModel.statusEndAt, null);
  assert.equal(
    getBandoriEventStatusAt(1500, fallbackOnlyModel.statusStartAt, fallbackOnlyModel.statusEndAt),
    "未开始",
  );
  assert.doesNotMatch(eventInfoPanelSource, /该服务器尚未公布时间|label: "活动已结束"/u);
  assert.match(eventInfoPanelSource, /prefix="距开始"/u);
  assert.match(eventInfoPanelSource, /prefix="距结束"/u);
  assert.equal(
    eventInfoPanelSource.match(/<span className="text-sm font-semibold text-\[var\(--theme-color-text-default\)\] dark:text-slate-100">/gu)?.length,
    2,
  );
  assert.doesNotMatch(eventInfoPanelSource, /text-xs font-semibold text-slate-600/u);
  assert.match(eventInfoPanelSource, /SERVER_LABELS\[model\.timeServer\]/u);
  assert.match(eventInfoPanelSource, /<OverviewRow label="活动状态">/u);
  assert.match(eventInfoPanelSource, /model\.statusStartAt !== null/u);
  assert.match(eventInfoPanelSource, /model\.statusEndAt !== null/u);
  assert.doesNotMatch(eventInfoPanelSource, /活动状态（/u);
  assert.match(trackerStatusSummarySource, />活动状态<\/span>/u);
  assert.doesNotMatch(trackerStatusSummarySource, /活动状态（|eventServer/u);
  assert.match(eventTrackerPageSource, /eventStatusStartDate \?\? "auto"/u);
  assert.match(eventTrackerPageSource, /eventStatusEndDate \?\? "auto"/u);
  assert.match(eventTrackerPageSource, /eventStatusStartDate !== null && eventStatusEndDate !== null/u);
});

test("event tracker server params accept codes and legacy numeric values", () => {
  assert.equal(parseEventTrackerServerSearchParam("jp"), 0);
  assert.equal(parseEventTrackerServerSearchParam("cn"), 3);
  assert.equal(parseEventTrackerServerSearchParam("2"), 2);
  assert.equal(parseEventTrackerServerSearchParam("invalid"), null);
});

test("event tracker server selection prefers the page query without changing the global fallback", () => {
  assert.equal(resolveEventTrackerServerSelection("jp", 3), 0);
  assert.equal(resolveEventTrackerServerSelection("invalid", 1), 1);
  assert.equal(resolveEventTrackerServerSelection(null, 2), 2);
  assert.doesNotMatch(eventTrackerPageSource, /setPreferredServer/u);
  assert.match(eventTrackerPageSource, /readInitialTrackerQueryState\(preferredServer, initialEventId\)/u);
});

test("event tracker renders the shared tracker surface for every server", () => {
  assert.match(
    eventTrackerPageSource,
    /selectedServer,\s*hasAppliedInitialUrlState && activeView === "tracker" && !isTop10Selected,/u,
  );
  assert.doesNotMatch(eventTrackerPageSource, /activeView === "tracker" \? selectedServer === 3/u);
  assert.doesNotMatch(eventTrackerPageSource, /分数追踪数据尚未接入|页面结构和服务器上下文已经就绪/u);
});

test("event server switcher uses the shared compact local Bestdori-style icons", () => {
  for (const server of ["jp", "en", "tw", "cn"]) {
    assert.match(serverIconSource, new RegExp(`/res/server-icons/${server}\\.svg`, "u"));
  }
  assert.match(eventSwitcherSource, /<BandoriServerIcon/u);
  assert.match(eventSwitcherSource, /isDecorative/u);
  assert.match(eventSwitcherSource, /aria-label=\{accessibleLabel\}/u);
  assert.match(eventSwitcherSource, /aria-pressed=\{active\}/u);
  assert.match(eventSwitcherSource, /inline-grid grid-cols-4/u);
  assert.match(eventSwitcherSource, /h-11 w-11[\s\S]*sm:h-10/u);
  assert.match(eventSwitcherSource, /first:rounded-l-\[11px\] last:rounded-r-\[11px\]/u);
  assert.match(eventSwitcherSource, /active && "scale-105 ring-2 ring-\[var\(--theme-color-control-ring-pressed\)\]/u);
  assert.doesNotMatch(eventSwitcherSource, /shadow-\[inset_0_0_0_1px/u);
  assert.doesNotMatch(eventSwitcherSource, /\/res\/server-icons/u);
  assert.match(serverIconSource, /alt=\{isDecorative \? "" : serverCode\}/u);
  assert.ok(eventSwitcherSource.indexOf(">服务器<") < eventSwitcherSource.indexOf(">活动选择<"));
  assert.ok(eventSwitcherSource.indexOf(">活动选择<") < eventSwitcherSource.indexOf("<h1"));
});

test("event title stays on one line with bounded adaptive sizing", () => {
  assert.match(eventSwitcherSource, /function getEventTitleSizeClass/u);
  assert.match(eventSwitcherSource, /if \(visualLength > 23\) return "text-xl sm:text-\[22px\]"/u);
  assert.match(eventSwitcherSource, /if \(visualLength > 16\) return "text-\[22px\] sm:text-\[26px\]"/u);
  assert.match(eventSwitcherSource, /return "text-2xl sm:text-3xl"/u);
  assert.match(eventSwitcherSource, /title=\{title\}/u);
  assert.match(eventSwitcherSource, /h-10 min-w-0 w-full truncate whitespace-nowrap/u);
  assert.doesNotMatch(eventSwitcherSource, /min-h-21 max-h-21|md:min-h-14 md:max-h-14/u);
});

test("event overview presents start and end timestamps as separate standard rows", () => {
  assert.doesNotMatch(eventInfoPanelSource, /公开展示时间|结算 \/ 发奖|兑换截止|model\.exchangeEndAt/u);
  assert.match(eventInfoPanelSource, /label=\{`开始时间（\$\{SERVER_LABELS\[model\.timeServer\]\}）`\}/u);
  assert.match(eventInfoPanelSource, /label=\{`结束时间（\$\{SERVER_LABELS\[model\.timeServer\]\}）`\}/u);
  assert.doesNotMatch(eventInfoPanelSource, /label=\{`活动时间|>至 \{formatDateTime/u);
});

test("event overview reuses the team builder event type labels", () => {
  assert.match(eventInfoPanelSource, /useTranslations\("bandori\.teamBuilder\.eventTypes"\)/u);
  assert.doesNotMatch(eventInfoPanelSource, /EVENT_TYPE_LABELS|挑战演出|任务演出|团队演出祭典|对邦活动|组曲演出/u);
});

test("event overview integrates bonuses into a responsive two-column layout", () => {
  assert.match(eventInfoPanelSource, /<section className="@container">/u);
  assert.match(eventInfoPanelSource, /@min-\[54rem\]:grid-cols-2/u);
  assert.match(eventInfoPanelSource, /items-stretch[\s\S]*@min-\[54rem\]:gap-x-0/u);
  assert.match(eventInfoPanelSource, /<dl className="min-w-0 @min-\[54rem\]:pr-8">/u);
  assert.match(eventInfoPanelSource, /@min-\[54rem\]:border-l @min-\[54rem\]:border-t-0/u);
  assert.match(eventInfoPanelSource, /@min-\[54rem\]:pl-8/u);
  assert.match(eventInfoPanelSource, /<BandoriEventBonusPanel[\s\S]*variant="embedded"/u);
  assert.match(eventBonusPanelSource, /variant === "card" \? \([\s\S]*labelsT\("eventBonus"\)/u);
  assert.match(eventBonusPanelSource, /variant === "card" \? \([\s\S]*labelsT\("type"\)/u);
  assert.match(eventBonusPanelSource, /border-b border-\[var\(--theme-color-border-subtle\)\] py-3 last:border-b-0[\s\S]*md:gap-5/u);
  assert.match(eventBonusPanelSource, /grid-cols-\[7rem_minmax\(0,1fr\)\] items-start gap-3/u);
  assert.match(eventBonusPanelSource, /variant === "embedded" && "justify-end"/u);
  assert.match(eventBonusPanelSource, /const LabelElement = variant === "embedded" \? "dt" : "div"/u);
  assert.match(eventBonusPanelSource, /const ValueElement = variant === "embedded" \? "dd" : "div"/u);
  assert.match(eventBonusPanelSource, /const RowsContainer = variant === "embedded" \? "dl" : "div"/u);
  for (const label of ["加成属性", "加成角色", "加成参数", "加成卡牌"]) {
    assert.match(eventBonusPanelSource, new RegExp(`variant === "embedded" \\? "${label}"`, "u"));
  }
});

test("event card skills reuse the shared master hook", () => {
  assert.match(eventInfoPanelSource, /useBandoriSkillsMaster\(Boolean\(model\)\)/u);
  assert.doesNotMatch(eventInfoPanelSource, /"bandori-master-skills"|parseSkillResponse/u);
});

test("event rewards fallback stamps by server and keep reward cards unlabelled", () => {
  const model = buildEventInfoModel({
    eventType: "story",
    eventName: ["JP", "EN", "TW", "CN"],
    startAt: [1000, 1000, 1000, 1000],
    endAt: [2000, 2000, 2000, 2000],
    rewardCards: [2356, 2355],
    pointRewards: [
      [
        { point: 30000, rewardType: "stamp", rewardId: 541, rewardQuantity: 1 },
        { point: 50000, rewardType: "star", rewardQuantity: 50 },
      ],
      null,
      null,
      [
        { point: 30000, rewardType: "stamp", rewardId: 541, rewardQuantity: 1 },
        { point: 50000, rewardType: "star", rewardQuantity: 50 },
      ],
    ],
    rankingRewards: [
      [{ fromRank: 1, toRank: 100, rewardType: "voice_stamp", rewardId: 9001, rewardQuantity: 1 }],
      null,
      null,
      [
        { fromRank: 1, toRank: 100, rewardType: "voice_stamp", rewardId: 541, rewardQuantity: 1 },
        { fromRank: 1, toRank: 100, rewardType: "voice_stamp", rewardId: 10135, rewardQuantity: 1 },
      ],
    ],
  }, 3);

  assert.deepEqual(model.rewardCardIds, [2356, 2355]);
  assert.deepEqual(model.rewardStampIds, [541, 10135]);
  assert.equal(model.rewardStampServer, 3);
  assert.deepEqual(model.rewardStampIdsByServer, [[541, 9001], [], [], [541, 10135]]);
  assert.ok(eventInfoPanelSource.indexOf("活动奖励") < eventInfoPanelSource.indexOf("活动歌曲"));
  assert.ok(eventInfoPanelSource.indexOf("奖励贴纸") < eventInfoPanelSource.indexOf("奖励卡牌"));
  assert.match(eventInfoPanelSource, /useCommentStampCatalog/u);
  assert.match(eventInfoPanelSource, /getBandoriStampCatalogItemsForRegion/u);
  assert.match(eventInfoPanelSource, /<CommentStampView/u);
  assert.match(eventInfoPanelSource, /variant="reward"/u);
  assert.match(commentContentSource, /export function CommentStampView/u);
  assert.match(commentContentSource, /variant\?: "comment" \| "reward"/u);
  assert.match(commentContentSource, /h-\[74px\] w-\[111px\] sm:h-\[76px\] sm:w-\[114px\]/u);
  assert.match(commentContentSource, /h-16 w-24 sm:h-\[76px\] sm:w-\[114px\]/u);
  assert.ok(eventInfoPanelSource.includes('<OverviewRow label={`奖励贴纸（${SERVER_LABELS[rewardStampSelection.server]}）`} mobileLayout="stacked">'));
  assert.match(eventInfoPanelSource, /<OverviewRow label="奖励卡牌" mobileLayout="stacked">/u);
  assert.match(eventInfoPanelSource, /useBandoriCardsMaster\(server, Boolean\(model\), "regional"\)/u);
  assert.equal(eventInfoPanelSource.match(/justify-end/gu)?.length >= 4, true);
  assert.match(eventInfoPanelSource, /@min-\[54rem\]:grid-cols-2/u);
  assert.match(eventInfoPanelSource, /@min-\[54rem\]:border-l @min-\[54rem\]:border-t-0/u);
  assert.doesNotMatch(eventInfoPanelSource, /RewardDetails|完整积分奖励|完整排名奖励|rewardLabel/u);
});

test("only source-sensitive activity information fields display fallback server labels", () => {
  assert.match(eventInfoPanelSource, /开始时间（/u);
  assert.match(eventInfoPanelSource, /结束时间（/u);
  assert.match(eventInfoPanelSource, /奖励贴纸（/u);
  assert.match(eventInfoPanelSource, /活动歌曲（/u);
  assert.doesNotMatch(
    eventInfoPanelSource,
    /活动状态（|活动标题（|主题乐队（|活动横幅（|奖励卡牌（|加成角色（|加成卡牌（|歌曲标题（|乐队名（|封面（/u,
  );
  assert.match(eventTrackerPageSource, /getBandoriRegionalDisplayOrder\(selectedServer\)[\s\S]*lookupBandoriEventBanner/u);
});

test("event songs omit the automatic publication-window matching description", () => {
  assert.doesNotMatch(eventInfoPanelSource, /歌曲发布时间落入本期活动时间区间自动匹配/u);
});

test("event band slugs resolve through the localized bands API records", () => {
  const bands = {
    "3": { bandName: ["ハロー、ハッピーワールド！", "Hello, Happy World!", "Hello, Happy World！TW", "Hello, Happy World！"] },
  };
  assert.deepEqual(BANDORI_EVENT_BAND_ID_BY_SLUG, {
    ppp: 1,
    ag: 2,
    hhw: 3,
    pp: 4,
    roselia: 5,
    ras: 18,
    morfonica: 21,
    mygo: 45,
  });
  assert.equal(getBandoriEventBandId("hhw"), 3);
  assert.equal(getBandoriEventBandId("mix"), null);
  assert.equal(resolveBandoriEventBandName("hhw", bands, 0), "ハロー、ハッピーワールド！");
  assert.equal(resolveBandoriEventBandName("hhw", bands, 1), "Hello, Happy World!");
  assert.equal(resolveBandoriEventBandName("hhw", bands, 2), "Hello, Happy World！TW");
  assert.equal(resolveBandoriEventBandName("mix", bands, 3), "混合乐队");
  assert.equal(resolveBandoriEventBandName("unknown", bands, 3), "-");
  assert.match(eventInfoPanelSource, /\/api\/bandori\/master\/bands\/all/u);
  assert.match(eventInfoPanelSource, /const shouldLoadBandNames = eventId !== null/u);
  assert.match(eventInfoPanelSource, /shouldLoadBandNames \? "bandori-master-bands-all" : null/u);
  assert.doesNotMatch(eventInfoPanelSource, /eventBandId !== null \? "bandori-master-bands-all"/u);
  assert.match(eventInfoPanelSource, /`band_\$\{eventBandId\}\.svg`/u);
  assert.doesNotMatch(eventInfoPanelSource, /BAND_LABELS/u);
});

test("comment targets isolate event discussions by server", () => {
  assert.equal(buildBandoriEventCommentTargetId(318, 3), "cn:318");
  assert.deepEqual(parseBandoriEventCommentTargetId("jp:318"), { eventId: 318, server: 0 });
  assert.equal(parseBandoriEventCommentTargetId("318"), null);
});
