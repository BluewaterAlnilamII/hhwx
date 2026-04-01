"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useCachedFetch, updateFetchCache } from "@/hooks/useCachedFetch";
import type { ChinaMainlandHolidayCalendarData } from "@/app/bandori/calendar/chinaMainlandHolidayCalendar";
import type { TrackerData, TrackerResult, EventMetadata, MinimalEvent, TrackingMode } from "./types";
import { getMonthlyRankingWindow } from "./useChartData";

type RawMinimalEvent = {
  id: number;
  name: string;
  startAtRaw: string | null;
  endAtRaw: string | null;
  hasCn: boolean;
  hasJp: boolean;
};

type TrackerCalendarEvent = {
  event_id: number;
  predicted_start: string | null;
  predicted_end: string | null;
};

function parseBestdoriTimestamp(timestampText: string | null | undefined): number | null {
  if (!timestampText) return null;
  const parsed = parseInt(timestampText, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePredictedStartTimestamp(dateText: string | null | undefined): number | null {
  if (!dateText) return null;
  const parsed = Date.parse(`${dateText}T15:00:00+08:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePredictedEndTimestamp(dateText: string | null | undefined): number | null {
  if (!dateText) return null;
  const parsed = Date.parse(`${dateText}T22:59:59+08:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTrackerEventWindow(
  cnStartAtRaw: string | null | undefined,
  cnEndAtRaw: string | null | undefined,
  predictedStart: string | null | undefined,
  predictedEnd: string | null | undefined,
): { startAt: number | null; endAt: number | null } {
  const bestdoriStartAt = parseBestdoriTimestamp(cnStartAtRaw);
  const bestdoriEndAt = parseBestdoriTimestamp(cnEndAtRaw);

  if (bestdoriStartAt !== null) {
    return {
      startAt: bestdoriStartAt,
      endAt: bestdoriEndAt,
    };
  }

  return {
    startAt: parsePredictedStartTimestamp(predictedStart),
    endAt: parsePredictedEndTimestamp(predictedEnd),
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
) {
  const [chartData, setChartData] = useState<TrackerData[]>([]);
  const [apiHasResult, setApiHasResult] = useState(false);

  // ===== 缓存 + 前台自动刷新：活动列表 =====
  const { data: rawAllEventsData } = useCachedFetch<RawMinimalEvent[]>(
    "bestdori-events",
    "/api/bestdori/events",
    (data: any) => {
      if (!data || data.error) return [];
      const eventsList: RawMinimalEvent[] = [];
      Object.entries(data).forEach(([idStr, ev]: [string, any]) => {
        const cnName = ev.eventName?.[3];
        const jpName = ev.eventName?.[0];
        if (cnName || jpName) {
          eventsList.push({
            id: parseInt(idStr),
            name: cnName || jpName || "Unknown",
            startAtRaw: ev.startAt?.[3] ?? null,
            endAtRaw: ev.endAt?.[3] ?? null,
            hasCn: !!cnName,
            hasJp: !!jpName,
          });
        }
      });
      eventsList.sort((a, b) => b.id - a.id);
      return eventsList;
    }
  );

  const { data: trackerCalendarEvents } = useCachedFetch<TrackerCalendarEvent[]>(
    "tracker-calendar-events",
    "/api/calendar/events",
    (data: any) => Array.isArray(data?.events)
      ? data.events.map((event: any) => ({
        event_id: Number(event.event_id),
        predicted_start: event.predicted_start ?? null,
        predicted_end: event.predicted_end ?? null,
      }))
      : []
  );

  const { data: holidayData } = useCachedFetch<ChinaMainlandHolidayCalendarData | null>(
    "calendar-holiday-days",
    "/api/calendar/holiday-days",
    (data: any) => data as ChinaMainlandHolidayCalendarData,
  );

  const trackerCalendarEventMap = useMemo(() => {
    return new Map<number, TrackerCalendarEvent>((trackerCalendarEvents ?? []).map((event) => [event.event_id, event]));
  }, [trackerCalendarEvents]);

  const allEvents = useMemo<MinimalEvent[]>(() => {
    return (rawAllEventsData ?? []).map((event) => {
      const trackerCalendarEvent = trackerCalendarEventMap.get(event.id);
      const { startAt, endAt } = resolveTrackerEventWindow(
        event.startAtRaw,
        event.endAtRaw,
        trackerCalendarEvent?.predicted_start,
        trackerCalendarEvent?.predicted_end,
      );

      return {
        id: event.id,
        name: event.name,
        startAt,
        endAt,
        hasCn: event.hasCn,
        hasJp: event.hasJp,
      };
    });
  }, [rawAllEventsData, trackerCalendarEventMap]);

  // ===== 缓存 + 前台自动刷新：活动元数据 =====
  const { data: eventMeta } = useCachedFetch<EventMetadata | null>(
    currentEventId !== null ? `event-meta-${currentEventId}` : null,
    currentEventId !== null ? `/api/bestdori/event/${currentEventId}` : null,
    (data: any) => (data && !data.error ? data : null)
  );

  // ===== 缓存 + 前台自动刷新：追踪数据 =====
  // 月度排行按当前有效月份自动切换 month id，其余模式沿用当前选中的活动编号。
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
      const httpCutoffs = incoming.cutoffs;
      const latestHttpTime = httpCutoffs.length > 0
        ? httpCutoffs[httpCutoffs.length - 1].time
        : -Infinity;
      // 仅保留缓存里比接口结果更新的数据点，避免覆盖实时推送的增量。
      const wsOnlyPoints = existing.cutoffs.filter(pt => pt.time > latestHttpTime);
      return {
        cutoffs: [...httpCutoffs, ...wsOnlyPoints],
        result: incoming.result || existing.result,
      };
    },
    []
  );

  const { data: trackerResult, loading } = useCachedFetch<TrackerResult>(
    trackerCacheKey,
    targetEventParam !== null
      ? `/api/tracker/data?server=3&event=${targetEventParam}&type=${trackingMode}&tier=${selectedTier}`
      : null,
    (data: any) => ({
      cutoffs: data?.cutoffs || [],
      result: data?.result || false,
    }),
    { merge: trackerMerge }
  );

  // 订阅在组件生命周期内只建立一次，因此通过 ref 维持最新视图参数，
  // 以便实时回调能够准确判断推送数据是否属于当前页面视图。
  const currentViewRef = useRef({ targetEventId: targetEventParam, mode: trackingMode, tier: selectedTier });
  useEffect(() => {
    currentViewRef.current = { targetEventId: targetEventParam, mode: trackingMode, tier: selectedTier };
  }, [targetEventParam, trackingMode, selectedTier]);

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

            setChartData((prev) => {
              // 丢弃时间戳不递增的数据，避免乱序插入导致折线图绘制扭曲
              if (prev.length > 0 && time <= prev[prev.length - 1].time) {
                return prev;
              }
              return [...prev, { time, ep }];
            });
            setApiHasResult(true);

            // 实时推送不仅要更新组件状态，也要同步写回缓存，
            // 否则用户切换视图再返回时仍会读到旧缓存，导致增量数据丢失。
            if (view.targetEventId !== null) {
              const cacheKey = `tracker-3-${view.targetEventId}-${view.mode}-${view.tier}`;
              updateFetchCache<TrackerResult>(cacheKey, (cached) => {
                const prevCutoffs = cached?.cutoffs ?? [];
                if (prevCutoffs.length > 0 && time <= prevCutoffs[prevCutoffs.length - 1].time) {
                  return cached ?? { result: true, cutoffs: [] };
                }
                return { result: true, cutoffs: [...prevCutoffs, { time, ep }] };
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
    setChartData(trackerResult?.cutoffs ?? []);
    setApiHasResult(trackerResult?.result ?? false);
  }, [trackerResult]);

  const resolvedCurrentEventWindow = useMemo(() => {
    if (currentEventId === null) {
      return { startDate: null, endDate: null };
    }

    const trackerCalendarEvent = trackerCalendarEventMap.get(currentEventId);
    const { startAt, endAt } = resolveTrackerEventWindow(
      eventMeta?.startAt?.[3] ?? null,
      eventMeta?.endAt?.[3] ?? null,
      trackerCalendarEvent?.predicted_start,
      trackerCalendarEvent?.predicted_end,
    );

    return { startDate: startAt, endDate: endAt };
  }, [currentEventId, eventMeta, trackerCalendarEventMap]);

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
