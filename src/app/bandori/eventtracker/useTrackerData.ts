"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useCachedFetch, updateFetchCache } from "@/hooks/useCachedFetch";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { BANDORI_TRACKER_DATA_TABLE } from "@/lib/supabase-table-names";
import {
  EXTERNAL_REFERENCE_CACHE_PROFILE,
  MUTABLE_DIRECTORY_CACHE_PROFILE,
  REALTIME_HOT_CACHE_PROFILE,
} from "@/lib/api-cache";
import type { ChinaMainlandHolidayCalendarData } from "@/app/bandori/calendar/chinaMainlandHolidayCalendar";
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

function resolveCnScheduleWindow(event: Pick<BandoriEventSummary, "timeline">): { startAt: number | null; endAt: number | null } {
  if (event.timeline.cn.startAt !== null || event.timeline.cn.endAt !== null) {
    return {
      startAt: event.timeline.cn.startAt,
      endAt: event.timeline.cn.endAt,
    };
  }

  const predictedWindow = event.timeline.cnSchedule;
  if (predictedWindow) {
    return predictedWindow;
  }

  return { startAt: null, endAt: null };
}

function findBestEvent(events: MinimalEvent[], now: number): MinimalEvent | null {
  const ongoing = events.find(ev => ev.startAt !== null && ev.endAt !== null && now >= ev.startAt && now <= ev.endAt);
  if (ongoing) {
    return ongoing;
  }

  const upcoming = events
    .filter(ev => ev.startAt === null || ev.startAt > now)
    .sort((a, b) => a.id - b.id);
  if (upcoming.length > 0) {
    return upcoming[0];
  }

  const finished = events
    .filter(ev => ev.endAt !== null && ev.endAt < now)
    .sort((a, b) => b.id - a.id);
  if (finished.length > 0) {
    return finished[0];
  }

  return null;
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
 * useTrackerData —— 活动追踪页面的数据获取层钩子。
 *
 * 职责：
 * 1. 通过 useCachedFetch 获取活动列表、活动元数据、追踪数据
 * 2. 建立 Supabase 实时订阅，将新数据追加到 chartData 并同步回缓存
 * 3. 提供防竞态的数据合并策略，确保前台恢复后的接口刷新不会覆盖
 *    实时推送已经追加的数据点
 *
 * 设计取舍：
 * - 页面组件同时承担数据获取、派生计算和界面渲染时，职责边界会过于模糊
 * - 将接口请求、实时推送与缓存同步抽离后，更便于独立审查竞态修复是否正确
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

  // ===== 缓存 + 前台自动刷新：活动列表 =====
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
      .map((event) => ({
        id: event.eventId,
        name: resolvePreferredEventName(event),
        startAt: resolveCnScheduleWindow(event).startAt,
        endAt: resolveCnScheduleWindow(event).endAt,
        hasCn: Boolean(event.name.cn?.trim()),
        hasJp: Boolean(event.name.jp.trim()),
      }))
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

  // eventtracker 当前只消费目录摘要里已经存在的字段，
  // 因此直接从 events 列表中选出当前活动，避免再发一次 detail 请求。
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

  // ===== 缓存 + 前台自动刷新：追踪数据 =====
  // 月度排行按当前有效月份自动切换 month id，其余模式沿用当前选中的活动编号。
  // challenge 的 song 模式接口会一次返回当前活动该档位下的全部 song_id 分组；
  // 普通活动则仍返回单条时间序列。前端缓存键不区分 selectedSongId，
  // 避免同一批 challenge 数据重复缓存多份。
  const monthlyWindow = getMonthlyRankingWindow();
  const targetEventParam = trackingMode === "monthly" ? monthlyWindow.monthId : resolvedCurrentEventId;
  const trackerCacheKey = targetEventParam !== null
    ? `tracker-3-${targetEventParam}-${trackingMode}-${selectedTier}`
    : null;

  /**
    * 追踪数据的合并策略 —— 防止接口静默刷新覆盖实时推送已追加的新数据。
   *
    * 竞态场景：用户切回前台后，`useCachedFetch` 触发接口静默刷新；
    * 请求尚未返回时，实时推送已经写入了更新的数据点。若直接用接口结果覆盖缓存，
    * 图表会丢失这段增量并出现回退。
   *
    * 合并逻辑：以接口返回的完整结果为基准，
    * 再补入缓存中时间戳晚于接口最新点的数据，也就是实时推送期间追加的增量，
   * 确保两个数据源的结果都不会丢失。
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

  // 订阅在组件生命周期内只建立一次，因此通过 ref 维持最新视图参数，
  // 以便实时回调能够准确判断推送数据是否属于当前页面视图。
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

  // ===== Supabase 实时订阅：监听新追踪数据插入 =====
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

          // 仅当新数据匹配当前图表视图（活动+模式+排名）时才追加
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
              // song 模式维护完整 songGroups，图表当前曲目只是在本地做投影与切换，
              // 不需要为每个 song_id 单独建一条实时订阅链路。
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
                // 丢弃时间戳不递增的数据，避免乱序插入导致折线图绘制扭曲
                [cacheKey]: appendTrackerPoint(baseCutoffs, time, ep, incomingIsFinal),
              };
            });
            setLiveHasResultByKey((prev) => ({ ...prev, [cacheKey]: true }));

            // 实时推送不仅要更新组件状态，也要同步写回缓存，
            // 否则用户切换视图再返回时仍会读到旧缓存，导致增量数据丢失。
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

    const currentWindow = eventMeta ? resolveCnScheduleWindow(eventMeta) : null;

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
