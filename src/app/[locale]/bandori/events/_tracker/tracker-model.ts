import {
  buildChinaMainlandHolidayLookup,
  isChinaMainlandRestDay,
} from "@/lib/bandori-china-mainland-holiday-calendar";
import {
  getBandoriServerTimeZone,
  type BandoriServer,
} from "@/lib/bandori-server";
import { getEventTrackerTiersForMode } from "./constants";
import {
  TOP10_RANKING_SELECTION,
  type TrackerRankingSelection,
} from "./tracker-tier-preference";
import type {
  ComparisonConfig,
  ComparisonLine,
  ComparisonLinePoint,
  ComparisonTargetType,
  MinimalEvent,
  TrackerData,
  TrackingMode,
} from "./types";

export type NonWorkingDayBand = {
  key: string;
  start: number;
  end: number;
};

export type ComparisonTargetOption = {
  id: number;
  label: string;
  isSameEventType?: boolean;
};

type AutomaticComparisonTarget = {
  targetId: number;
  tier: number;
};

type MainTooltipPointIndexEntry = {
  time: number;
  point: TrackerData;
};

type ComparisonTooltipPointIndexEntry = {
  dataKey: `compare_${number}_ep`;
  points: ComparisonLinePoint[];
};

export const ZOOM_WIDTH_MULTIPLIERS = [1, 2, 4, 8, 16, 32] as const;

// Absorb collection-time jitter without merging adjacent 15/30-minute tracker snapshots.
const TOOLTIP_TIME_TOLERANCE_MS = 5 * 60_000;
const EVENT_TIER_1000 = 1000;
const EVENT_TIER_1500 = 1500;
const CN_T1500_BACKFILL_EVENT_ID = 311;
const CN_T1500_LEGACY_EVENT_ID_LIMIT = 313;
const EVENT_TYPES_WITHOUT_SONG_RANKING = new Set([
  "story",
  "mission_live",
  "live_try",
  "festival",
]);

export function isActualTrackerPoint(
  point: TrackerData,
  domainStart: number | "auto",
  trackingMode: TrackingMode,
  seriesLength: number,
): boolean {
  if (point.isBaseline) {
    return false;
  }

  if (
    seriesLength === 1
    && trackingMode !== "song"
    && typeof domainStart === "number"
    && point.time === domainStart
    && point.ep === 0
    && !point.isFinal
  ) {
    return false;
  }

  return true;
}

export function getTooltipPointTime(point: TrackerData): number {
  return point.isProjection ? point.projectionEndTime ?? point.time : point.time;
}

function isMainTooltipPoint(point: TrackerData): boolean {
  if (point.isProjection) {
    return (
      (point.instantEp !== undefined && Number.isFinite(point.instantEp))
      || (point.dayEp !== undefined && Number.isFinite(point.dayEp))
    );
  }

  return (
    !point.isBaseline
    && !point.isFinal
    && point.ep !== undefined
    && Number.isFinite(point.ep)
  );
}

function findNearestSortedPoint<T>(
  points: T[],
  targetTime: number,
  getTime: (point: T) => number,
): T | null {
  if (points.length === 0) return null;

  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getTime(points[mid]) < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const candidates = [points[low]];
  if (low > 0) candidates.push(points[low - 1]);
  if (low + 1 < points.length) candidates.push(points[low + 1]);

  let nearestPoint: T | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of candidates) {
    const distance = Math.abs(getTime(point) - targetTime);
    if (distance <= TOOLTIP_TIME_TOLERANCE_MS && distance < nearestDistance) {
      nearestPoint = point;
      nearestDistance = distance;
    }
  }

  return nearestPoint;
}

export function buildMainTooltipPointIndex(points: TrackerData[]): MainTooltipPointIndexEntry[] {
  return points
    .filter(isMainTooltipPoint)
    .map((point) => ({ time: getTooltipPointTime(point), point }))
    .sort((left, right) => left.time - right.time);
}

export function buildComparisonTooltipPointIndex(
  lines: ComparisonLine[],
): ComparisonTooltipPointIndexEntry[] {
  return lines.map((line) => ({
    dataKey: line.dataKey,
    points: [...line.points].sort((left, right) => left.shiftedTime - right.shiftedTime),
  }));
}

export function findNearestMainTooltipPoint(
  index: MainTooltipPointIndexEntry[],
  targetTime: number,
): TrackerData | null {
  return findNearestSortedPoint(index, targetTime, (entry) => entry.time)?.point ?? null;
}

export function collectNearbyComparisonPoints(
  index: ComparisonTooltipPointIndexEntry[],
  targetTime: number,
): ComparisonLinePoint[] {
  return index.flatMap((entry) => {
    const nearestPoint = findNearestSortedPoint(
      entry.points,
      targetTime,
      (point) => point.shiftedTime,
    );
    return nearestPoint ? [nearestPoint] : [];
  });
}

export function buildComparisonPointMap(
  points: ComparisonLinePoint[],
): Record<string, ComparisonLinePoint> {
  return Object.fromEntries(points.map((point) => [point.dataKey, point]));
}

export function createComparisonConfigId(): string {
  return `comparison-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasComparisonConfig(
  configs: ComparisonConfig[],
  targetType: ComparisonTargetType,
  targetId: number,
  tier: number,
): boolean {
  return configs.some((config) => (
    config.targetType === targetType
    && config.targetId === targetId
    && config.tier === tier
  ));
}

function isLegacyCnEventWithoutT1500(server: BandoriServer, targetId: number): boolean {
  return server === 3
    && targetId <= CN_T1500_LEGACY_EVENT_ID_LIMIT
    && targetId !== CN_T1500_BACKFILL_EVENT_ID;
}

function resolveLegacyCnEventTier(
  server: BandoriServer,
  targetId: number,
  tier: number,
): number {
  if (tier === EVENT_TIER_1500 && isLegacyCnEventWithoutT1500(server, targetId)) {
    return EVENT_TIER_1000;
  }

  return tier;
}

export function getComparisonTierOptions(
  server: BandoriServer,
  config: ComparisonConfig,
  tierOptions: readonly number[],
): readonly number[] {
  if (
    config.targetType !== "event"
    || config.targetId === null
    || !isLegacyCnEventWithoutT1500(server, config.targetId)
  ) {
    return tierOptions;
  }

  return tierOptions.filter((tier) => tier !== EVENT_TIER_1500);
}

export function getMainTrackerTierOptions(
  server: BandoriServer,
  trackingMode: TrackingMode,
  eventId: number | null,
): readonly number[] {
  const tierOptions = getEventTrackerTiersForMode(trackingMode);
  if (
    trackingMode !== "event"
    || eventId === null
    || !isLegacyCnEventWithoutT1500(server, eventId)
  ) {
    return tierOptions;
  }

  return tierOptions.filter((tier) => tier !== EVENT_TIER_1500);
}

export function isSongRankingDisabledEventType(
  eventType: string | null | undefined,
): boolean {
  return typeof eventType === "string" && EVENT_TYPES_WITHOUT_SONG_RANKING.has(eventType);
}

export function resolveTrackingModeForEventType(
  trackingMode: TrackingMode,
  eventType: string | null | undefined,
): TrackingMode {
  return trackingMode === "song" && isSongRankingDisabledEventType(eventType)
    ? "event"
    : trackingMode;
}

export function isComparisonTierSelectable(
  server: BandoriServer,
  config: ComparisonConfig,
  tierOptions: readonly number[],
): boolean {
  return config.tier !== null
    && getComparisonTierOptions(server, config, tierOptions).includes(config.tier);
}

export function normalizeComparisonConfigTier(
  server: BandoriServer,
  config: ComparisonConfig,
): ComparisonConfig {
  if (config.targetType !== "event" || config.targetId === null || config.tier === null) {
    return config;
  }

  const tier = resolveLegacyCnEventTier(server, config.targetId, config.tier);
  return tier === config.tier ? config : { ...config, tier };
}

export function resolveMainTrackerTier(
  server: BandoriServer,
  trackingMode: TrackingMode,
  eventId: number | null,
  tier: number,
): number {
  if (trackingMode !== "event" || eventId === null) {
    return tier;
  }

  return resolveLegacyCnEventTier(server, eventId, tier);
}

export function resolveMainTrackerRanking(
  server: BandoriServer,
  trackingMode: TrackingMode,
  eventId: number | null,
  ranking: TrackerRankingSelection,
): TrackerRankingSelection {
  if (ranking === TOP10_RANKING_SELECTION) {
    return TOP10_RANKING_SELECTION;
  }

  return resolveMainTrackerTier(server, trackingMode, eventId, ranking);
}

export function getComparisonConfigKey(config: ComparisonConfig): string | null {
  return config.targetId !== null && config.tier !== null
    ? `${config.targetType}:${config.targetId}:${config.tier}`
    : null;
}

export function findPreviousSameTypeEventComparisonTarget(
  server: BandoriServer,
  events: MinimalEvent[],
  currentEventId: number | null,
  currentEventType: string | null,
  tier: number,
  configs: ComparisonConfig[],
): AutomaticComparisonTarget | null {
  if (currentEventId === null || currentEventType === null) {
    return null;
  }

  const target = events.find((event) => {
    const comparisonTier = resolveLegacyCnEventTier(server, event.id, tier);
    return (
      event.id < currentEventId
      && event.eventType === currentEventType
      && !hasComparisonConfig(configs, "event", event.id, comparisonTier)
    );
  });

  return target
    ? {
        targetId: target.id,
        tier: resolveLegacyCnEventTier(server, target.id, tier),
      }
    : null;
}

export function findPreviousMonthlyComparisonTarget(
  monthlyOptions: Array<{ monthId: number }>,
  selectedMonthlyMonthId: number,
  tier: number,
  configs: ComparisonConfig[],
): AutomaticComparisonTarget | null {
  const target = monthlyOptions.find((option) => (
    option.monthId < selectedMonthlyMonthId
    && !hasComparisonConfig(configs, "monthly", option.monthId, tier)
  ));

  return target ? { targetId: target.monthId, tier } : null;
}

export function formatBandoriDateTime(
  timestamp: number,
  server: BandoriServer,
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: getBandoriServerTimeZone(server),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function buildNonWorkingDayBands(
  domainStart: number | "auto",
  domainEnd: number | "auto",
  holidayLookup: ReturnType<typeof buildChinaMainlandHolidayLookup>,
): NonWorkingDayBand[] {
  if (typeof domainStart !== "number" || typeof domainEnd !== "number") {
    return [];
  }

  const bands: NonWorkingDayBand[] = [];
  const cursor = new Date(domainStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < domainEnd) {
    const nextDay = new Date(cursor);
    nextDay.setDate(nextDay.getDate() + 1);

    if (isChinaMainlandRestDay(cursor, holidayLookup)) {
      const bandStart = Math.max(cursor.getTime(), domainStart);
      const bandEnd = Math.min(nextDay.getTime(), domainEnd);

      if (bandStart < bandEnd) {
        const year = cursor.getFullYear();
        const month = String(cursor.getMonth() + 1).padStart(2, "0");
        const day = String(cursor.getDate()).padStart(2, "0");
        bands.push({
          key: `${year}-${month}-${day}`,
          start: bandStart,
          end: bandEnd,
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return bands;
}
