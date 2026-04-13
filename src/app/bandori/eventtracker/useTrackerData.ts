"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useCachedFetch, updateFetchCache } from "@/hooks/useCachedFetch";
import type { ChinaMainlandHolidayCalendarData } from "@/app/bandori/calendar/chinaMainlandHolidayCalendar";
import type { TrackerData, TrackerResult, TrackerSongGroup, EventMetadata, MinimalEvent, TrackingMode, BandoriEventSummary } from "./types";
import { getMonthlyRankingWindow } from "./useChartData";

function appendTrackerPoint(series: TrackerData[], time: number, ep: number, isFinal = false): TrackerData[] {
  if (series.length > 0 && time <= series[series.length - 1].time) {
    return series;
  }

  return [...series, { time, ep, isFinal }];
}

function mergeTrackerCutoffs(incoming: TrackerData[], existing: TrackerData[]): TrackerData[] {
  const latestIncomingTime = incoming.length > 0
    ? incoming[incoming.length - 1].time
    : -Infinity;

  return [...incoming, ...existing.filter((point) => point.time > latestIncomingTime)];
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
  return songGroups.find((group) => group.songId === selectedSongId)?.cutoffs
    ?? songGroups.find((group) => group.songId === 0)?.cutoffs
    ?? songGroups[0]?.cutoffs
    ?? [];
}

function parseTrackerPoint(point: any): TrackerData {
  const nextPoint: TrackerData = {
    time: Number(point?.time),
    ep: Number(point?.ep),
  };

  if (point?.isFinal === true) {
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
  const [chartData, setChartData] = useState<TrackerData[]>([]);
  const [songGroups, setSongGroups] = useState<TrackerSongGroup[]>([]);
  const [apiHasResult, setApiHasResult] = useState(false);

  // ===== 缓存 + 前台自动刷新：活动列表 =====
  const { data: eventCatalog } = useCachedFetch<{ events: BandoriEventSummary[] }>(
    "bandori-events",
    "/api/bandori/events",
    (data: any) => ({
      events: Array.isArray(data?.events) ? data.events as BandoriEventSummary[] : [],
    }),
  );

  const { data: holidayData } = useCachedFetch<ChinaMainlandHolidayCalendarData | null>(
    "bandori-holiday-days",
    "/api/bandori/holiday-days",
    (data: any) => data as ChinaMainlandHolidayCalendarData,
  );

  const allEvents = useMemo<MinimalEvent[]>(() => {
    return (eventCatalog?.events ?? [])
      .map((event) => ({
        id: event.eventId,
        name: event.name.display,
        startAt: event.timeline.trackerWindow.startAt,
        endAt: event.timeline.trackerWindow.endAt,
        hasCn: event.availability.hasCn,
        hasJp: event.availability.hasJp,
      }))
      .sort((left, right) => right.id - left.id);
  }, [eventCatalog]);

  // ===== 缓存 + 前台自动刷新：活动元数据 =====
  const { data: eventMeta } = useCachedFetch<EventMetadata | null>(
    currentEventId !== null ? `bandori-event-meta-${currentEventId}` : null,
    currentEventId !== null ? `/api/bandori/events/${currentEventId}` : null,
    (data: any) => (data && !data.error ? data : null)
  );

  // ===== 缓存 + 前台自动刷新：追踪数据 =====
  // 月度排行按当前有效月份自动切换 month id，其余模式沿用当前选中的活动编号。
  // challenge 的 song 模式接口会一次返回当前活动该档位下的全部 song_id 分组；
  // 普通活动则仍返回单条时间序列。前端缓存键不区分 selectedSongId，
  // 避免同一批 challenge 数据重复缓存多份。
  const monthlyWindow = getMonthlyRankingWindow();
  const targetEventParam = trackingMode === "monthly" ? monthlyWindow.monthId : currentEventId;
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
    (data: any) => {
      const parsedSongResult = trackingMode === "song"
        ? parseSongCutoffsPayload(data?.cutoffs, selectedSongId)
        : undefined;

      return {
        cutoffs: trackingMode === "song"
          ? parsedSongResult?.cutoffs ?? []
          : Array.isArray(data?.cutoffs)
            ? data.cutoffs.map((point: any) => parseTrackerPoint(point))
            : [],
        result: data?.result || false,
        songGroups: parsedSongResult?.songGroups,
      };
    },
    { merge: trackerMerge }
  );

  // 订阅在组件生命周期内只建立一次，因此通过 ref 维持最新视图参数，
  // 以便实时回调能够准确判断推送数据是否属于当前页面视图。
  const currentViewRef = useRef({ targetEventId: targetEventParam, mode: trackingMode, tier: selectedTier, songId: selectedSongId });
  useEffect(() => {
    currentViewRef.current = { targetEventId: targetEventParam, mode: trackingMode, tier: selectedTier, songId: selectedSongId };
  }, [targetEventParam, trackingMode, selectedTier, selectedSongId]);

  // ===== Supabase 实时订阅：监听新追踪数据插入 =====
  useEffect(() => {
    const channel = supabase
      .channel("bandori_tracker_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bandori_tracker_data" },
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
              setSongGroups((prev) => upsertSongGroupPoint(prev, incomingSongId, time, ep, incomingIsFinal));
              setApiHasResult(true);

              if (view.targetEventId !== null) {
                const cacheKey = `tracker-3-${view.targetEventId}-${view.mode}-${view.tier}`;
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

            setChartData((prev) => {
              // 丢弃时间戳不递增的数据，避免乱序插入导致折线图绘制扭曲
              return appendTrackerPoint(prev, time, ep, incomingIsFinal);
            });
            setApiHasResult(true);

            // 实时推送不仅要更新组件状态，也要同步写回缓存，
            // 否则用户切换视图再返回时仍会读到旧缓存，导致增量数据丢失。
            if (view.targetEventId !== null) {
              const cacheKey = `tracker-3-${view.targetEventId}-${view.mode}-${view.tier}`;
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

  // 接口数据与本地状态分离存放，目的是让接口刷新和实时推送都能汇聚到同一份图表数据源。
  useEffect(() => {
    setSongGroups(trackerResult?.songGroups ?? []);

    if (trackingMode === "song" && (trackerResult?.songGroups?.length ?? 0) > 0) {
      // song 接口返回的是全量分组；真正要画哪一条线，
      // 取决于当前页面选中的 selectedSongId。
      setChartData(selectSongCutoffs(trackerResult?.songGroups ?? [], selectedSongId));
      setApiHasResult((trackerResult?.songGroups?.length ?? 0) > 0);
      return;
    }

    setChartData(trackerResult?.cutoffs ?? []);
    setApiHasResult(trackerResult?.result ?? false);
  }, [selectedSongId, trackerResult, trackingMode]);

  useEffect(() => {
    if (trackingMode !== "song" || songGroups.length === 0) {
      return;
    }

    setChartData(selectSongCutoffs(songGroups, selectedSongId));
    setApiHasResult(songGroups.some((group) => group.cutoffs.length > 0));
  }, [selectedSongId, songGroups, trackingMode]);

  const resolvedCurrentEventWindow = useMemo(() => {
    if (currentEventId === null) {
      return { startDate: null, endDate: null };
    }

    return {
      startDate: eventMeta?.timeline.trackerWindow.startAt ?? null,
      endDate: eventMeta?.timeline.trackerWindow.endAt ?? null,
    };
  }, [currentEventId, eventMeta]);

  return {
    allEvents,
    eventMeta,
    startDate: resolvedCurrentEventWindow.startDate,
    endDate: resolvedCurrentEventWindow.endDate,
    chartData,
    holidayData,
    loading,
    apiHasResult,
  };
}
