"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useCachedFetch, updateFetchCache } from "@/hooks/useCachedFetch";
import type { TrackerData, TrackerResult, EventMetadata, MinimalEvent, TrackingMode } from "./types";

/**
 * useTrackerData —— 活动追踪页面的数据获取层 Hook。
 *
 * 职责：
 * 1. 通过 useCachedFetch 获取活动列表、活动元数据、追踪数据
 * 2. 建立 Supabase 实时订阅，将新数据追加到 chartData 并同步回缓存
 * 3. 提供防竞态的 merge 策略，确保前台恢复后 HTTP 静默刷新不会覆盖
 *    WebSocket 已追加的更新数据点
 *
 * 为什么将数据获取逻辑从 page.tsx 中抽离：
 * - page.tsx 同时承担数据获取、派生计算和 UI 渲染，职责过密
 * - 数据获取逻辑（HTTP + WebSocket + 缓存同步）本身已足够复杂，
 *   独立为 Hook 后便于单独审查和测试竞态修复的正确性
 */
export function useTrackerData(
  currentEventId: number | null,
  trackingMode: TrackingMode,
  selectedTier: number,
) {
  const [chartData, setChartData] = useState<TrackerData[]>([]);
  const [apiHasResult, setApiHasResult] = useState(false);

  // ===== 缓存 + 前台自动刷新：活动列表 =====
  const { data: allEventsData } = useCachedFetch<MinimalEvent[]>(
    "bestdori-events",
    "/api/bestdori/events",
    (data: any) => {
      if (!data || data.error) return [];
      const eventsList: MinimalEvent[] = [];
      Object.entries(data).forEach(([idStr, ev]: [string, any]) => {
        const cnName = ev.eventName?.[3];
        const jpName = ev.eventName?.[0];
        if (cnName || jpName) {
          eventsList.push({
            id: parseInt(idStr),
            name: cnName || jpName || "Unknown",
            startAt: ev.startAt?.[3] ? parseInt(ev.startAt[3]) : null,
            endAt: ev.endAt?.[3] ? parseInt(ev.endAt[3]) : null,
            hasCn: !!cnName,
            hasJp: !!jpName,
          });
        }
      });
      eventsList.sort((a, b) => b.id - a.id);
      return eventsList;
    }
  );
  const allEvents = allEventsData ?? [];

  // ===== 缓存 + 前台自动刷新：活动元数据 =====
  const { data: eventMeta } = useCachedFetch<EventMetadata | null>(
    currentEventId !== null ? `event-meta-${currentEventId}` : null,
    currentEventId !== null ? `/api/bestdori/event/${currentEventId}` : null,
    (data: any) => (data && !data.error ? data : null)
  );

  // ===== 缓存 + 前台自动刷新：追踪数据 =====
  // monthly 模式固定使用 event_id=14 查询，其他模式使用当前选中的活动 ID
  const targetEventParam = trackingMode === "monthly" ? 14 : currentEventId;
  const trackerCacheKey = currentEventId !== null
    ? `tracker-3-${targetEventParam}-${trackingMode}-${selectedTier}`
    : null;

  /**
   * 追踪数据的合并策略 —— 防止 HTTP 静默刷新覆盖 WebSocket 已追加的新数据。
   *
   * 竞态场景：用户切回前台 → useCachedFetch 触发 HTTP 静默刷新 →
   * 请求飞行期间 WebSocket 推送了新数据点并写入缓存 → HTTP 响应到达。
   * 若直接覆盖缓存，WebSocket 追加的新点会丢失，图表出现回退。
   *
   * 合并逻辑：以 HTTP 响应（服务端完整数据）为基准，
   * 补入缓存中时间戳晚于 HTTP 最新点的数据（即 WebSocket 追加的增量），
   * 确保两个数据源的结果都不会丢失。
   */
  const trackerMerge = useCallback(
    (incoming: TrackerResult, existing: TrackerResult): TrackerResult => {
      const httpCutoffs = incoming.cutoffs;
      const latestHttpTime = httpCutoffs.length > 0
        ? httpCutoffs[httpCutoffs.length - 1].time
        : -Infinity;
      // 保留缓存中比 HTTP 响应更新的数据点（通常是 WebSocket 在请求期间追加的）
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
    currentEventId !== null
      ? `/api/tracker/data?server=3&event=${targetEventParam}&type=${trackingMode}&tier=${selectedTier}`
      : null,
    (data: any) => ({
      cutoffs: data?.cutoffs || [],
      result: data?.result || false,
    }),
    { merge: trackerMerge }
  );

  // 用于在实时回调中获取最新的视图参数，而不需每次参数改变都重新建立 WebSocket 订阅。
  // 为什么使用 ref：WebSocket 订阅在组件整个生命周期内只建立一次（依赖数组为空），
  // 但回调需要判断推送数据是否匹配当前视图，ref 让回调总能读到最新参数。
  const currentViewRef = useRef({ eventId: currentEventId, mode: trackingMode, tier: selectedTier });
  useEffect(() => {
    currentViewRef.current = { eventId: currentEventId, mode: trackingMode, tier: selectedTier };
  }, [currentEventId, trackingMode, selectedTier]);

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
          const targetEvent = view.mode === "monthly" ? 14 : view.eventId;

          // 仅当新数据匹配当前图表视图（活动+模式+排名）时才追加
          if (
            newRow.event_id === targetEvent &&
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

            // 同步写入模块级缓存，确保切换视图再切回时看到实时追加的数据。
            // 为什么实时推送后必须同步写缓存：若只更新了 React 状态而不更新缓存，
            // 用户切到其他 tier 再切回来时，useCachedFetch 会从缓存读取旧数据，
            // 丢失 WebSocket 推送的增量。
            if (view.eventId !== null) {
              const cacheKey = `tracker-3-${targetEvent}-${view.mode}-${view.tier}`;
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

  // HTTP 获取的追踪数据同步到本地状态
  // 为什么需要 chartData 与 trackerResult 分离：WebSocket 实时追加直接操作 chartData，
  // 而 trackerResult 是 useCachedFetch 的输出。将两者通过 useEffect 桥接，
  // 使得 HTTP 刷新和实时推送都能统一反映到图表数据源上。
  useEffect(() => {
    setChartData(trackerResult?.cutoffs ?? []);
    setApiHasResult(trackerResult?.result ?? false);
  }, [trackerResult]);

  return {
    allEvents,
    eventMeta,
    chartData,
    loading,
    apiHasResult,
  };
}
