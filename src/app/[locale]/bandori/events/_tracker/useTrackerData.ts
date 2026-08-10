"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useBandoriEventsMaster } from "@/hooks/useBandoriEventsMaster";
import { parseApiSuccessData } from "@/lib/api-contracts";
import {
  hasBandoriOfficialCnEventContent,
  resolveBandoriEventServerScheduleWindow,
} from "@/lib/bandori/events/region";
import {
  getBandoriServerCode,
  pickBandoriRegionalText,
  type BandoriServer,
} from "@/lib/bandori-server";
import {
  LIVE_CLIENT_CACHE_POLICY,
  LONG_CLIENT_CACHE_POLICY,
} from "@/lib/api-cache";
import type { ChinaMainlandHolidayCalendarData } from "@/lib/bandori-china-mainland-holiday-calendar";
import type { BandoriEventSummary } from "@/lib/bandori/events/summary";
import {
  type BandoriTrackerLiveSnapshot,
  type BandoriTrackerLiveTarget,
} from "@/lib/bandori/event-tracker/live-contract";
import {
  appendBandoriTrackerLivePoint,
  buildBandoriTrackerLiveSeriesUpdates,
} from "@/lib/bandori/event-tracker/live-series";
import type { TrackerData, TrackerResult, TrackerSongGroup, EventMetadata, MinimalEvent, TrackingMode } from "./types";
import {
  mergeTrackerCutoffs,
  mergeTrackerSongGroups,
  resolveSelectedSongId,
  selectSongCutoffs,
} from "@/lib/bandori/event-tracker/song-series";
import { getMonthlyRankingWindow } from "./useChartData";
import { useBandoriTrackerLiveListener } from "./useBandoriTrackerLive";
import { useBoundaryClock } from "./useBoundaryClock";

function appendTrackerPoint(series: TrackerData[], time: number, ep: number, isFinal = false): TrackerData[] {
  if (series.length > 0 && time <= series[series.length - 1].time) {
    return series;
  }

  return [...series, { time, ep, isFinal }];
}

function upsertSongGroupPoint(songGroups: TrackerSongGroup[], songId: number, time: number, ep: number, isFinal = false): TrackerSongGroup[] {
  let didUpdate = false;
  const nextGroups = songGroups.map((group) => {
    if (group.songId !== songId) {
      return group;
    }

    didUpdate = true;
    return {
      songId: group.songId,
      cutoffs: appendTrackerPoint(group.cutoffs, time, ep, isFinal),
    };
  });

  if (!didUpdate) {
    nextGroups.push({
      songId,
      cutoffs: [{ time, ep, isFinal }],
    });
  }

  return nextGroups.sort((left, right) => left.songId - right.songId);
}

function parseTrackerPoint(point: unknown): TrackerData {
  const parsedPoint = point as { time?: number | string; ep?: number | string; isFinal?: boolean | null } | null;
  const nextPoint: TrackerData = {
    time: Number(parsedPoint?.time),
    ep: Number(parsedPoint?.ep),
  };

  if (parsedPoint?.isFinal === true) {
    nextPoint.isFinal = true;
  }

  return nextPoint;
}

function parseSongCutoffsPayload(
  payload: unknown,
  selectedSongId: number,
  eventType?: string | null,
): { cutoffs: TrackerData[]; songGroups?: TrackerSongGroup[] } {
  if (Array.isArray(payload)) {
    return {
      cutoffs: payload.map((point) => parseTrackerPoint(point)),
    };
  }

  if (!payload || typeof payload !== "object") {
    return { cutoffs: [] };
  }

  const songGroups = Object.entries(payload as Record<string, unknown>)
    .map(([songIdText, groupPoints]) => ({
      songId: Number(songIdText),
      cutoffs: Array.isArray(groupPoints)
        ? groupPoints.map((point) => parseTrackerPoint(point))
        : [],
    }))
    .filter((group) => Number.isFinite(group.songId))
    .sort((left, right) => left.songId - right.songId);

  return {
    cutoffs: selectSongCutoffs(songGroups, selectedSongId, eventType),
    songGroups,
  };
}

function resolvePreferredEventName(
  event: Pick<BandoriEventSummary, "eventId" | "name">,
  server: BandoriServer,
  fallbackName: string,
): string {
  return pickBandoriRegionalText(
    [event.name.jp, event.name.en, event.name.tw, event.name.cn],
    server,
    server,
  ) ?? fallbackName;
}

function findBestEvent(events: MinimalEvent[], now: number): MinimalEvent | null {
  const withStart = events
    .filter((event): event is MinimalEvent & { startAt: number } => event.startAt !== null);

  const ongoing = withStart
    .filter((event) => event.endAt !== null && event.startAt <= now && now < event.endAt)
    .sort((left, right) => (left.endAt ?? 0) - (right.endAt ?? 0))[0];
  if (ongoing) {
    return ongoing;
  }

  const upcoming = withStart
    .filter((event) => event.startAt > now)
    .sort((left, right) => left.startAt - right.startAt)[0];
  if (upcoming) {
    return upcoming;
  }

  return withStart.sort((left, right) => right.startAt - left.startAt)[0] ?? null;
}

/**
 * Data hook for the Bandori event tracker page.
 *
 * Responsibilities:
 * 1. Load event catalog, event metadata, and tracker series via useCachedFetch.
 * 2. Subscribe to CN-only Supabase private live snapshots and mirror new points into local cache.
 * 3. Merge API refreshes with realtime points so foreground refreshes do not drop
 *    points that arrived while the request was in flight.
 */
export function useTrackerData(
  currentEventId: number | null,
  trackingMode: TrackingMode,
  selectedTier: number,
  selectedSongId: number,
  selectedMonthlyMonthId: number | null,
  server: BandoriServer,
  enabled = true,
) {
  const t = useTranslations("bandori.events.common");
  const [liveCutoffsByKey, setLiveCutoffsByKey] = useState<Record<string, TrackerData[]>>({});
  const [liveSongGroupsByKey, setLiveSongGroupsByKey] = useState<Record<string, TrackerSongGroup[]>>({});
  const [liveHasResultByKey, setLiveHasResultByKey] = useState<Record<string, boolean>>({});

  // Event metadata is shared for the full SPA session. Live tracker data uses
  // a separate foreground refresh policy below.
  const { events: eventCatalog } = useBandoriEventsMaster();

  const { data: holidayData } = useCachedFetch<ChinaMainlandHolidayCalendarData | null>(
    server === 3 ? "bandori-calendar-cn-holidays" : null,
    server === 3 ? "/api/bandori/calendar/cn/holidays" : null,
    (data: unknown) => parseApiSuccessData<ChinaMainlandHolidayCalendarData>(data) ?? data as ChinaMainlandHolidayCalendarData,
    { ...LONG_CLIENT_CACHE_POLICY },
  );

  const eventMetaMap = useMemo(() => {
    return new Map<number, BandoriEventSummary>(eventCatalog.map((event) => [event.eventId, event]));
  }, [eventCatalog]);

  const allEvents = useMemo<MinimalEvent[]>(() => {
    return eventCatalog
      .map((event) => {
        const scheduleWindow = resolveBandoriEventServerScheduleWindow(event, server);

        return {
          id: event.eventId,
          eventType: event.eventType,
          name: resolvePreferredEventName(
            event,
            server,
            t("eventFallback", { eventId: event.eventId }),
          ),
          startAt: scheduleWindow.startAt,
          endAt: scheduleWindow.endAt,
          hasCn: hasBandoriOfficialCnEventContent(event),
          hasJp: Boolean(event.name.jp.trim()),
        };
      })
      .sort((left, right) => right.id - left.id);
  }, [eventCatalog, server, t]);

  const eventScheduleBoundaries = useMemo(
    () => allEvents.flatMap((event) => {
      const boundaries: number[] = [];

      if (event.startAt !== null) {
        boundaries.push(event.startAt);
      }

      if (event.endAt !== null) {
        boundaries.push(event.endAt + 1);
      }

      return boundaries;
    }),
    [allEvents],
  );

  const eventScheduleNow = useBoundaryClock(eventScheduleBoundaries);

  const recommendedEventId = useMemo(
    () => findBestEvent(allEvents, eventScheduleNow)?.id ?? null,
    [allEvents, eventScheduleNow],
  );
  const resolvedCurrentEventId = currentEventId !== null && eventMetaMap.has(currentEventId)
    ? currentEventId
    : recommendedEventId;

  // The tracker currently only needs fields already present in the event catalog,
  // so derive the current event from that list instead of issuing a detail request.
  const eventMeta = useMemo<EventMetadata | null>(() => {
    if (resolvedCurrentEventId === null) {
      return null;
    }

    return eventMetaMap.get(resolvedCurrentEventId) ?? null;
  }, [eventMetaMap, resolvedCurrentEventId]);

  const resolvedSelectedSongId = useMemo(
    () => resolveSelectedSongId(trackingMode, eventMeta, selectedSongId, server),
    [eventMeta, selectedSongId, server, trackingMode],
  );

  // Tracker data cache and foreground refresh.
  // Monthly ranking uses the selected month id. Other modes use the selected event id.
  // Challenge song mode returns every song_id group for the selected event and tier,
  // so the cache key intentionally does not include selectedSongId.
  const monthlyWindow = getMonthlyRankingWindow(server, selectedMonthlyMonthId);
  const targetEventParam = trackingMode === "monthly" ? monthlyWindow.monthId : resolvedCurrentEventId;
  const liveTarget = useMemo<BandoriTrackerLiveTarget | null>(() => {
    if (!enabled || server !== 3 || trackingMode !== "event" || targetEventParam === null) return null;
    const eventWindow = eventMeta ? resolveBandoriEventServerScheduleWindow(eventMeta, server) : null;
    if (
      eventWindow === null
      || eventWindow.startAt === null
      || eventWindow.endAt === null
      || eventScheduleNow < eventWindow.startAt
      || eventScheduleNow > eventWindow.endAt
    ) {
      return null;
    }
    return {
      server: getBandoriServerCode(server),
      namespace: "events",
      targetId: targetEventParam,
    };
  }, [enabled, eventMeta, eventScheduleNow, server, targetEventParam, trackingMode]);
  const canUseTrackerLive = server === 3 && liveTarget !== null;
  const trackerCacheKey = enabled && targetEventParam !== null
    ? `tracker-${server}-${targetEventParam}-${trackingMode}-${selectedTier}`
    : null;

  /**
   * Merge tracker API refreshes with realtime data.
   *
   * If the user returns to the foreground, useCachedFetch can start a background
   * API refresh while Supabase realtime inserts are already adding newer points.
   * The merge keeps the API response as the baseline and preserves cached points
   * that are newer than the latest API point.
   */
  const trackerMerge = useCallback(
    (incoming: TrackerResult, existing: TrackerResult): TrackerResult => {
      const mergedSongGroups = mergeTrackerSongGroups(incoming.songGroups ?? [], existing.songGroups ?? []);
      return {
        cutoffs: mergedSongGroups.length > 0
          ? mergedSongGroups[0].cutoffs
          : mergeTrackerCutoffs(incoming.cutoffs, existing.cutoffs),
        result: incoming.result || existing.result,
        songGroups: mergedSongGroups.length > 0 ? mergedSongGroups : undefined,
      };
    },
    []
  );

  const { data: trackerResult, loading, refreshing } = useCachedFetch<TrackerResult>(
    trackerCacheKey,
    trackerCacheKey !== null && targetEventParam !== null
      ? `/api/bandori/tracker/data?server=${server}&event=${targetEventParam}&type=${trackingMode}&tier=${selectedTier}`
      : null,
    (data: unknown) => {
      const payload = data as { cutoffs?: unknown; result?: boolean } | null;
      const parsedSongResult = trackingMode === "song"
        ? parseSongCutoffsPayload(payload?.cutoffs, resolvedSelectedSongId, eventMeta?.eventType)
        : undefined;

      return {
        cutoffs: trackingMode === "song"
          ? parsedSongResult?.cutoffs ?? []
          : Array.isArray(payload?.cutoffs)
            ? payload.cutoffs.map((point) => parseTrackerPoint(point))
            : [],
        result: payload?.result || false,
        songGroups: parsedSongResult?.songGroups,
      };
    },
    {
      merge: trackerMerge,
      ...LIVE_CLIENT_CACHE_POLICY,
    }
  );

  const handlePrivateLiveSnapshot = useCallback((snapshot: BandoriTrackerLiveSnapshot) => {
    if (snapshot.server !== getBandoriServerCode(server) || snapshot.namespace !== "events") return;

    const updates = buildBandoriTrackerLiveSeriesUpdates(snapshot);

    if (updates.cutoffUpdates.length > 0) {
      setLiveCutoffsByKey((previous) => {
        let next = previous;
        for (const update of updates.cutoffUpdates) {
          next = appendBandoriTrackerLivePoint(next, update.cacheKey, {
            time: update.time,
            ep: update.ep,
            isFinal: update.isFinal,
          });
        }
        return next;
      });
    }

    if (updates.songUpdates.length > 0) {
      setLiveSongGroupsByKey((previous) => {
        let next = previous;
        for (const update of updates.songUpdates) {
          next = {
            ...next,
            [update.cacheKey]: upsertSongGroupPoint(
              next[update.cacheKey] ?? [],
              update.songId,
              update.time,
              update.ep,
              update.isFinal === true,
            ),
          };
        }
        return next;
      });
    }

    if (updates.resultKeys.length > 0) {
      setLiveHasResultByKey((previous) => {
        const next = { ...previous };
        for (const cacheKey of updates.resultKeys) next[cacheKey] = true;
        return next;
      });
    }
  }, [server]);

  const hasPrivateLiveAccess = useBandoriTrackerLiveListener(
    liveTarget,
    canUseTrackerLive,
    handlePrivateLiveSnapshot,
  );
  const liveCutoffsForView = trackerCacheKey && hasPrivateLiveAccess
    ? liveCutoffsByKey[trackerCacheKey]
    : undefined;
  const liveSongGroupsForView = trackerCacheKey && hasPrivateLiveAccess
    ? liveSongGroupsByKey[trackerCacheKey]
    : undefined;
  const mergedSongGroupsForView = useMemo(
    () => mergeTrackerSongGroups(liveSongGroupsForView ?? [], trackerResult?.songGroups ?? []),
    [liveSongGroupsForView, trackerResult?.songGroups],
  );
  const mergedCutoffsForView = useMemo(
    () => mergeTrackerCutoffs(liveCutoffsForView ?? [], trackerResult?.cutoffs ?? []),
    [liveCutoffsForView, trackerResult?.cutoffs],
  );

  const chartData = useMemo(() => {
    if (trackingMode === "song" && mergedSongGroupsForView.length > 0) {
      return selectSongCutoffs(
        mergedSongGroupsForView,
        resolvedSelectedSongId,
        eventMeta?.eventType,
      );
    }

    return mergedCutoffsForView;
  }, [eventMeta?.eventType, mergedCutoffsForView, mergedSongGroupsForView, resolvedSelectedSongId, trackingMode]);

  const apiHasResult = useMemo(() => {
    const liveHasResult = trackerCacheKey !== null && hasPrivateLiveAccess
      ? liveHasResultByKey[trackerCacheKey]
      : undefined;

    if (trackingMode === "song" && mergedSongGroupsForView.length > 0) {
      return mergedSongGroupsForView.some((group) => group.cutoffs.length > 0);
    }

    return Boolean(liveHasResult || trackerResult?.result);
  }, [hasPrivateLiveAccess, liveHasResultByKey, mergedSongGroupsForView, trackerCacheKey, trackerResult?.result, trackingMode]);

  const resolvedCurrentEventWindow = useMemo(() => {
    if (resolvedCurrentEventId === null) {
      return {
        startDate: null,
        endDate: null,
        displayServer: server,
        statusStartDate: null,
        statusEndDate: null,
      };
    }

    const currentWindow = eventMeta
      ? resolveBandoriEventServerScheduleWindow(eventMeta, server)
      : null;

    return {
      startDate: currentWindow?.startAt ?? null,
      endDate: currentWindow?.endAt ?? null,
      displayServer: server,
      statusStartDate: currentWindow?.startAt ?? null,
      statusEndDate: currentWindow?.endAt ?? null,
    };
  }, [eventMeta, resolvedCurrentEventId, server]);

  return {
    allEvents,
    currentEventId: resolvedCurrentEventId,
    recommendedEventId,
    eventMeta,
    selectedSongId: resolvedSelectedSongId,
    startDate: resolvedCurrentEventWindow.startDate,
    endDate: resolvedCurrentEventWindow.endDate,
    eventTimeServer: resolvedCurrentEventWindow.displayServer,
    eventStatusStartDate: resolvedCurrentEventWindow.statusStartDate,
    eventStatusEndDate: resolvedCurrentEventWindow.statusEndDate,
    chartData,
    holidayData,
    loading,
    refreshing,
    apiHasResult,
    liveTarget,
  };
}
