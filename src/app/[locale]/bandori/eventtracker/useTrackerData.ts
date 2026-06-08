"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useCachedFetch, updateFetchCache } from "@/hooks/useCachedFetch";
import { parseApiSuccessData } from "@/lib/api-contracts";
import {
  hasBandoriOfficialCnEventContent,
  resolveBandoriCnScheduleWindow,
} from "@/lib/bandori-event-region";
import { BANDORI_TRACKER_DATA_TABLE } from "@/lib/supabase-table-names";
import {
  EXTERNAL_REFERENCE_CACHE_PROFILE,
  MUTABLE_DIRECTORY_CACHE_PROFILE,
  REALTIME_HOT_CACHE_PROFILE,
} from "@/lib/api-cache";
import type { ChinaMainlandHolidayCalendarData } from "@/lib/bandori-china-mainland-holiday-calendar";
import type { TrackerData, TrackerResult, TrackerSongGroup, EventMetadata, MinimalEvent, TrackingMode, BandoriEventSummary } from "./types";
import { getMonthlyRankingWindow } from "./useChartData";
import { useBoundaryClock } from "./useBoundaryClock";

function appendTrackerPoint(series: TrackerData[], time: number, ep: number, isFinal = false): TrackerData[] {
  if (series.length > 0 && time <= series[series.length - 1].time) {
    return series;
  }

  return [...series, { time, ep, isFinal }];
}

function normalizeTrackerCutoffs(series: TrackerData[]): TrackerData[] {
  const pointByTime = new Map<number, TrackerData>();

  for (const point of series) {
    const time = Number(point?.time);
    const ep = Number(point?.ep);

    if (!Number.isFinite(time) || !Number.isFinite(ep)) {
      continue;
    }

    const previousPoint = pointByTime.get(time);
    pointByTime.set(time, {
      ...previousPoint,
      ...point,
      time,
      ep,
      isFinal: previousPoint?.isFinal || point?.isFinal ? true : undefined,
    });
  }

  return Array.from(pointByTime.values()).sort((left, right) => left.time - right.time);
}

function mergeTrackerCutoffs(incoming: TrackerData[], existing: TrackerData[]): TrackerData[] {
  const merged = new Map<number, TrackerData>();

  for (const point of normalizeTrackerCutoffs(existing)) {
    merged.set(point.time, point);
  }

  for (const point of normalizeTrackerCutoffs(incoming)) {
    merged.set(point.time, point);
  }

  return Array.from(merged.values()).sort((left, right) => left.time - right.time);
}

function mergeTrackerSongGroups(incoming: TrackerSongGroup[], existing: TrackerSongGroup[]): TrackerSongGroup[] {
  const existingBySongId = new Map(existing.map((group) => [group.songId, group]));

  for (const group of incoming) {
    const previousGroup = existingBySongId.get(group.songId);
    existingBySongId.set(group.songId, {
      songId: group.songId,
      cutoffs: previousGroup
        ? mergeTrackerCutoffs(group.cutoffs, previousGroup.cutoffs)
        : group.cutoffs,
    });
  }

  return Array.from(existingBySongId.values()).sort((left, right) => left.songId - right.songId);
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

function selectSongCutoffs(songGroups: TrackerSongGroup[], selectedSongId: number): TrackerData[] {
  const selectedGroup = songGroups.find((group) => group.songId === selectedSongId);
  if (selectedGroup) {
    return selectedGroup.cutoffs;
  }

  if (selectedSongId === 0) {
    return songGroups.find((group) => group.songId === 0)?.cutoffs
      ?? songGroups[0]?.cutoffs
      ?? [];
  }

  return [];
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
    cutoffs: selectSongCutoffs(songGroups, selectedSongId),
    songGroups,
  };
}

function resolvePreferredEventName(event: Pick<BandoriEventSummary, "eventId" | "name">): string {
  const preferredName = event.name.cn?.trim();
  if (preferredName) {
    return preferredName;
  }

  const fallbackName = event.name.jp.trim();
  if (fallbackName) {
    return fallbackName;
  }

  return `活动 #${event.eventId}`;
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

function getAvailableChallengeSongIds(eventMeta: EventMetadata | null): number[] {
  if (eventMeta?.eventType !== "challenge") {
    return [];
  }

  const challengeSongIds = eventMeta.musicIds.jp.length > 0
    ? eventMeta.musicIds.jp
    : eventMeta.musicIds.cn;

  return Array.from(
    new Set(
      challengeSongIds
        .map((musicId) => Number(musicId))
        .filter((musicId) => Number.isFinite(musicId) && musicId > 0),
    ),
  ).sort((left, right) => left - right);
}

function resolveSelectedSongId(
  trackingMode: TrackingMode,
  eventMeta: EventMetadata | null,
  selectedSongId: number,
): number {
  if (trackingMode !== "song") {
    return 0;
  }

  const availableChallengeSongIds = getAvailableChallengeSongIds(eventMeta);
  if (availableChallengeSongIds.length === 0) {
    return 0;
  }

  return availableChallengeSongIds.includes(selectedSongId)
    ? selectedSongId
    : availableChallengeSongIds[0];
}

/**
 * Data hook for the Bandori event tracker page.
 *
 * Responsibilities:
 * 1. Load event catalog, event metadata, and tracker series via useCachedFetch.
 * 2. Subscribe to Supabase realtime inserts and mirror new points into local cache.
 * 3. Merge API refreshes with realtime points so foreground refreshes do not drop
 *    points that arrived while the request was in flight.
 */
export function useTrackerData(
  currentEventId: number | null,
  trackingMode: TrackingMode,
  selectedTier: number,
  selectedSongId: number,
) {
  const [liveCutoffsByKey, setLiveCutoffsByKey] = useState<Record<string, TrackerData[]>>({});
  const [liveSongGroupsByKey, setLiveSongGroupsByKey] = useState<Record<string, TrackerSongGroup[]>>({});
  const [liveHasResultByKey, setLiveHasResultByKey] = useState<Record<string, boolean>>({});

  // Event catalog cache and foreground refresh.
  const { data: eventCatalog } = useCachedFetch<{ events: BandoriEventSummary[] }>(
    "bandori-events-v3",
    "/api/bandori/events",
    (data: unknown) => {
      const payload = parseApiSuccessData<{ events?: BandoriEventSummary[] }>(data) ?? data as { events?: BandoriEventSummary[] } | null;
      return {
        events: Array.isArray(payload?.events) ? payload.events : [],
      };
    },
    { ...(MUTABLE_DIRECTORY_CACHE_PROFILE.client ?? {}) },
  );

  const { data: holidayData } = useCachedFetch<ChinaMainlandHolidayCalendarData | null>(
    "bandori-calendar-cn-holidays",
    "/api/bandori/calendar/cn/holidays",
    (data: unknown) => parseApiSuccessData<ChinaMainlandHolidayCalendarData>(data) ?? data as ChinaMainlandHolidayCalendarData,
    { ...(EXTERNAL_REFERENCE_CACHE_PROFILE.client ?? {}) },
  );

  const eventMetaMap = useMemo(() => {
    return new Map<number, BandoriEventSummary>((eventCatalog?.events ?? []).map((event) => [event.eventId, event]));
  }, [eventCatalog]);

  const allEvents = useMemo<MinimalEvent[]>(() => {
    return (eventCatalog?.events ?? [])
      .map((event) => {
        const scheduleWindow = resolveBandoriCnScheduleWindow(event);

        return {
          id: event.eventId,
          name: resolvePreferredEventName(event),
          startAt: scheduleWindow.startAt,
          endAt: scheduleWindow.endAt,
          hasCn: hasBandoriOfficialCnEventContent(event),
          hasJp: Boolean(event.name.jp.trim()),
        };
      })
      .sort((left, right) => right.id - left.id);
  }, [eventCatalog]);

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
    () => resolveSelectedSongId(trackingMode, eventMeta, selectedSongId),
    [eventMeta, selectedSongId, trackingMode],
  );

  // Tracker data cache and foreground refresh.
  // Monthly ranking uses the current month id. Other modes use the selected event id.
  // Challenge song mode returns every song_id group for the selected event and tier,
  // so the cache key intentionally does not include selectedSongId.
  const monthlyWindow = getMonthlyRankingWindow();
  const targetEventParam = trackingMode === "monthly" ? monthlyWindow.monthId : resolvedCurrentEventId;
  const trackerCacheKey = targetEventParam !== null
    ? `tracker-3-${targetEventParam}-${trackingMode}-${selectedTier}`
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

  const { data: trackerResult, loading } = useCachedFetch<TrackerResult>(
    trackerCacheKey,
    targetEventParam !== null
      ? `/api/bandori/tracker/data?server=3&event=${targetEventParam}&type=${trackingMode}&tier=${selectedTier}`
      : null,
    (data: unknown) => {
      const payload = data as { cutoffs?: unknown; result?: boolean } | null;
      const parsedSongResult = trackingMode === "song"
        ? parseSongCutoffsPayload(payload?.cutoffs, resolvedSelectedSongId)
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
      ...(REALTIME_HOT_CACHE_PROFILE.client ?? {}),
    }
  );

  // The subscription is established once, so keep the latest view parameters in a ref.
  const currentViewRef = useRef({ targetEventId: targetEventParam, mode: trackingMode, tier: selectedTier, songId: resolvedSelectedSongId });
  useEffect(() => {
    currentViewRef.current = { targetEventId: targetEventParam, mode: trackingMode, tier: selectedTier, songId: resolvedSelectedSongId };
  }, [resolvedSelectedSongId, selectedTier, targetEventParam, trackingMode]);

  const liveCutoffsForView = trackerCacheKey ? liveCutoffsByKey[trackerCacheKey] : undefined;
  const liveSongGroupsForView = trackerCacheKey ? liveSongGroupsByKey[trackerCacheKey] : undefined;
  const mergedSongGroupsForView = useMemo(
    () => mergeTrackerSongGroups(liveSongGroupsForView ?? [], trackerResult?.songGroups ?? []),
    [liveSongGroupsForView, trackerResult?.songGroups],
  );
  const mergedCutoffsForView = useMemo(
    () => mergeTrackerCutoffs(liveCutoffsForView ?? [], trackerResult?.cutoffs ?? []),
    [liveCutoffsForView, trackerResult?.cutoffs],
  );
  const mergedTrackerStateRef = useRef<{
    cacheKey: string | null;
    cutoffs: TrackerData[];
    songGroups: TrackerSongGroup[];
  }>({
    cacheKey: null,
    cutoffs: [],
    songGroups: [],
  });

  useEffect(() => {
    mergedTrackerStateRef.current = {
      cacheKey: trackerCacheKey,
      cutoffs: mergedCutoffsForView,
      songGroups: mergedSongGroupsForView,
    };
  }, [mergedCutoffsForView, mergedSongGroupsForView, trackerCacheKey]);

  // Supabase realtime subscription for newly inserted tracker points.
  useEffect(() => {
    const channel = supabase
      .channel("bandori_tracker_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: BANDORI_TRACKER_DATA_TABLE },
        (payload) => {
          const newRow = payload.new;
          if (!newRow) return;

          const view = currentViewRef.current;

          // Append only points that match the active chart view.
          if (
            newRow.event_id === view.targetEventId &&
            newRow.type === view.mode &&
            newRow.tier === view.tier
          ) {
            const time = Number(newRow.time);
            const ep = Number(newRow.ep);
            const incomingSongId = Number(newRow.song_id ?? 0);
            const incomingIsFinal = Boolean(newRow.is_final ?? false);

            if (view.mode === "song") {
              // Song mode keeps the full songGroups payload and projects the selected
              // song locally, so each song_id does not need a separate subscription.
              const cacheKey = `tracker-3-${view.targetEventId}-${view.mode}-${view.tier}`;

              setLiveSongGroupsByKey((prev) => {
                const baseSongGroups = mergeTrackerSongGroups(
                  prev[cacheKey] ?? [],
                  mergedTrackerStateRef.current.cacheKey === cacheKey
                    ? mergedTrackerStateRef.current.songGroups
                    : [],
                );

                return {
                  ...prev,
                  [cacheKey]: upsertSongGroupPoint(baseSongGroups, incomingSongId, time, ep, incomingIsFinal),
                };
              });
              setLiveHasResultByKey((prev) => ({ ...prev, [cacheKey]: true }));

              if (view.targetEventId !== null) {
                updateFetchCache<TrackerResult>(cacheKey, (cached) => {
                  const nextSongGroups = upsertSongGroupPoint(cached?.songGroups ?? [], incomingSongId, time, ep, incomingIsFinal);
                  return {
                    result: true,
                    cutoffs: nextSongGroups[0]?.cutoffs ?? [],
                    songGroups: nextSongGroups,
                  };
                });
              }

              return;
            }

            const cacheKey = `tracker-3-${view.targetEventId}-${view.mode}-${view.tier}`;
            setLiveCutoffsByKey((prev) => {
              const baseCutoffs = mergeTrackerCutoffs(
                prev[cacheKey] ?? [],
                mergedTrackerStateRef.current.cacheKey === cacheKey
                  ? mergedTrackerStateRef.current.cutoffs
                  : [],
              );

              return {
                ...prev,
                // Drop non-increasing timestamps so out-of-order inserts do not distort the line chart.
                [cacheKey]: appendTrackerPoint(baseCutoffs, time, ep, incomingIsFinal),
              };
            });
            setLiveHasResultByKey((prev) => ({ ...prev, [cacheKey]: true }));

            // Mirror realtime points back into cache so switching views does not
            // resurrect stale cached series and lose the incremental data.
            if (view.targetEventId !== null) {
              updateFetchCache<TrackerResult>(cacheKey, (cached) => {
                const prevCutoffs = cached?.cutoffs ?? [];
                return {
                  result: true,
                  cutoffs: appendTrackerPoint(prevCutoffs, time, ep, incomingIsFinal),
                };
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const chartData = useMemo(() => {
    if (trackingMode === "song" && mergedSongGroupsForView.length > 0) {
      return selectSongCutoffs(mergedSongGroupsForView, resolvedSelectedSongId);
    }

    return mergedCutoffsForView;
  }, [mergedCutoffsForView, mergedSongGroupsForView, resolvedSelectedSongId, trackingMode]);

  const apiHasResult = useMemo(() => {
    const liveHasResult = trackerCacheKey !== null ? liveHasResultByKey[trackerCacheKey] : undefined;

    if (trackingMode === "song" && mergedSongGroupsForView.length > 0) {
      return mergedSongGroupsForView.some((group) => group.cutoffs.length > 0);
    }

    return Boolean(liveHasResult || trackerResult?.result);
  }, [liveHasResultByKey, mergedSongGroupsForView, trackerCacheKey, trackerResult?.result, trackingMode]);

  const resolvedCurrentEventWindow = useMemo(() => {
    if (resolvedCurrentEventId === null) {
      return { startDate: null, endDate: null };
    }

    const currentWindow = eventMeta ? resolveBandoriCnScheduleWindow(eventMeta) : null;

    return {
      startDate: currentWindow?.startAt ?? null,
      endDate: currentWindow?.endAt ?? null,
    };
  }, [eventMeta, resolvedCurrentEventId]);

  return {
    allEvents,
    currentEventId: resolvedCurrentEventId,
    recommendedEventId,
    eventMeta,
    selectedSongId: resolvedSelectedSongId,
    startDate: resolvedCurrentEventWindow.startDate,
    endDate: resolvedCurrentEventWindow.endDate,
    chartData,
    holidayData,
    loading,
    apiHasResult,
  };
}
