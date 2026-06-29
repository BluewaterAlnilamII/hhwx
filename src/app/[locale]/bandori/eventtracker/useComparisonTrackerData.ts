"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BANDORI_TRACKER_DATA_TABLE } from "@/lib/supabase-table-names";
import { COMPARISON_LINE_COLORS } from "./constants";
import type { MonthlyRankingOption } from "./useChartData";
import type {
  ComparisonAlignment,
  ComparisonConfig,
  ComparisonLine,
  ComparisonLinePoint,
  ComparisonStatus,
  ComparisonTargetType,
  MinimalEvent,
  TrackerData,
} from "./types";

type TrackerResponse = {
  cutoffs?: unknown;
};

type TrackerRow = {
  time?: number | string;
  ep?: number | string;
  isFinal?: boolean | null;
  is_final?: boolean | null;
};

const dataCache = new Map<string, TrackerData[]>();

type ResolvedComparisonConfig = ComparisonConfig & {
  targetId: number;
  tier: number;
};

function isResolvedConfig(config: ComparisonConfig): config is ResolvedComparisonConfig {
  return config.targetId !== null && config.tier !== null;
}

function cacheKey(config: ComparisonConfig): string {
  return `${config.targetType}:${config.targetId}:${config.tier}`;
}

function parsePoint(point: unknown): TrackerData | null {
  const raw = point as TrackerRow | null;
  if (raw?.isFinal || raw?.is_final) return null;

  const time = Number(raw?.time);
  const ep = Number(raw?.ep);
  if (!Number.isFinite(time) || !Number.isFinite(ep)) return null;

  return { time, ep };
}

function normalizePoints(points: TrackerData[]): TrackerData[] {
  const byTime = new Map<number, TrackerData>();

  for (const point of points) {
    if (Number.isFinite(point.time) && Number.isFinite(point.ep)) {
      byTime.set(point.time, { time: point.time, ep: point.ep });
    }
  }

  return Array.from(byTime.values()).sort((left, right) => left.time - right.time);
}

async function fetchComparison(config: ComparisonConfig): Promise<TrackerData[]> {
  const response = await fetch(`/api/bandori/tracker/data?server=3&event=${config.targetId}&type=${config.targetType}&tier=${config.tier}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = await response.json() as TrackerResponse;
  if (!Array.isArray(payload.cutoffs)) return [];

  return normalizePoints(payload.cutoffs.flatMap((point) => {
    const parsed = parsePoint(point);
    return parsed ? [parsed] : [];
  }));
}

function getLocalDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

type ComparisonTargetMeta = {
  targetType: ComparisonTargetType;
  targetId: number;
  label: string;
  startAt: number | null;
  endAt: number | null;
};

function buildComparisonTargetMeta(
  config: ResolvedComparisonConfig,
  eventMap: Map<number, MinimalEvent>,
  monthlyOptionMap: Map<number, MonthlyRankingOption>,
): ComparisonTargetMeta {
  if (config.targetType === "monthly") {
    const option = monthlyOptionMap.get(config.targetId);
    return {
      targetType: "monthly",
      targetId: config.targetId,
      label: option?.label ?? `月度 ${config.targetId}`,
      startAt: option?.domainStart ?? null,
      endAt: option ? option.cutoffEnd - 1000 : null,
    };
  }

  const event = eventMap.get(config.targetId);
  return {
    targetType: "event",
    targetId: config.targetId,
    label: `${config.targetId}期`,
    startAt: event?.startAt ?? null,
    endAt: event?.endAt ?? null,
  };
}

function buildLine(
  config: ResolvedComparisonConfig,
  index: number,
  target: ComparisonTargetMeta,
  points: TrackerData[] | undefined,
  isLoading: boolean,
  alignment: ComparisonAlignment,
  currentStart: number | null,
  currentEnd: number | null,
): ComparisonLine {
  const colorIndex = config.colorIndex ?? index;
  const dataKey = `compare_${colorIndex}_ep` as const;
  const color = COMPARISON_LINE_COLORS[colorIndex % COMPARISON_LINE_COLORS.length];
  const label = `${target.label} T${config.tier}`;
  let status: ComparisonStatus = "ready";
  let shiftedPoints: ComparisonLinePoint[] = [];

  if (target.startAt === null || target.endAt === null || currentStart === null || currentEnd === null) {
    status = "time-missing";
  } else if (isLoading && points === undefined) {
    status = "loading";
  } else if (!points || points.length === 0) {
    status = "no-data";
  } else {
    const currentEndAt = currentEnd - 1000;
    const offset = alignment === "end"
      ? currentEndAt - target.endAt
      : getLocalDayStart(currentStart) - getLocalDayStart(target.startAt);
    const visibleEnd = currentEnd + 1000;

    shiftedPoints = points.flatMap((point) => {
      const shiftedTime = point.time + offset;
      if (shiftedTime < currentStart || shiftedTime > visibleEnd) return [];

      return [{
        dataKey,
        targetType: target.targetType,
        targetId: target.targetId,
        tier: config.tier,
        label,
        originalTime: point.time,
        shiftedTime,
        ep: point.ep,
        color,
      }];
    });

    if (shiftedPoints.length === 0) status = "no-data";
  }

  return {
    config,
    dataKey,
    color,
    label,
    status,
    points: shiftedPoints,
  };
}

export function mergeComparisonLines(baseData: TrackerData[], lines: ComparisonLine[]): TrackerData[] {
  const byTime = new Map<number, TrackerData>();

  for (const point of baseData) {
    byTime.set(point.time, { ...point });
  }

  for (const line of lines) {
    for (const point of line.points) {
      const existing = byTime.get(point.shiftedTime) ?? ({ time: point.shiftedTime } as TrackerData);
      byTime.set(point.shiftedTime, {
        ...existing,
        time: point.shiftedTime,
        [line.dataKey]: point.ep,
        comparisonPoints: {
          ...(existing.comparisonPoints ?? {}),
          [line.dataKey]: point,
        },
      });
    }
  }

  return Array.from(byTime.values()).sort((left, right) => left.time - right.time);
}

export function useComparisonTrackerData({
  enabled,
  configs,
  events,
  monthlyOptions,
  alignment,
  currentStart,
  currentEnd,
}: {
  enabled: boolean;
  configs: ComparisonConfig[];
  events: MinimalEvent[];
  monthlyOptions: MonthlyRankingOption[];
  alignment: ComparisonAlignment;
  currentStart: number | null;
  currentEnd: number | null;
}) {
  const [dataByKey, setDataByKey] = useState<Record<string, TrackerData[]>>({});
  const [loadingByKey, setLoadingByKey] = useState<Record<string, boolean>>({});
  const configsRef = useRef(configs);

  useEffect(() => {
    configsRef.current = configs;
  }, [configs]);

  const eventMap = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const monthlyOptionMap = useMemo(
    () => new Map(monthlyOptions.map((option) => [option.monthId, option])),
    [monthlyOptions],
  );
  const configSignature = useMemo(
    () => configs.filter(isResolvedConfig).map((config) => cacheKey(config)).join("|"),
    [configs],
  );

  useEffect(() => {
    const resolvedConfigs = configs.filter(isResolvedConfig);
    if (!enabled || resolvedConfigs.length === 0) return;

    let cancelled = false;
    const loadingTimeoutIds: number[] = [];
    const uniqueConfigs = Array.from(new Map(resolvedConfigs.map((config) => [cacheKey(config), config])).values());

    for (const config of uniqueConfigs) {
      const key = cacheKey(config);
      const cached = dataCache.get(key);

      if (cached) {
        continue;
      }

      const loadingTimeoutId = window.setTimeout(() => {
        if (!cancelled) {
          setLoadingByKey((previous) => ({ ...previous, [key]: true }));
        }
      }, 0);
      loadingTimeoutIds.push(loadingTimeoutId);
      fetchComparison(config)
        .then((points) => {
          if (cancelled) return;
          dataCache.set(key, points);
          setDataByKey((previous) => ({ ...previous, [key]: points }));
        })
        .catch((error) => {
          console.error(`[useComparisonTrackerData] ${key}:`, error);
          if (!cancelled) {
            dataCache.set(key, []);
            setDataByKey((previous) => ({ ...previous, [key]: [] }));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingByKey((previous) => ({ ...previous, [key]: false }));
          }
        });
    }

    return () => {
      cancelled = true;
      for (const timeoutId of loadingTimeoutIds) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [configSignature, configs, enabled]);

  useEffect(() => {
    const resolvedConfigs = configs.filter(isResolvedConfig);
    if (!enabled || resolvedConfigs.length === 0) return;

    const channel = supabase
      .channel("bandori_tracker_comparison_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: BANDORI_TRACKER_DATA_TABLE },
        (payload) => {
          const row = payload.new as {
            event_id?: number;
            type?: string;
            tier?: number;
            song_id?: number | null;
            time?: number | string;
            ep?: number | string;
            is_final?: boolean | null;
          } | null;

          if (!row || (row.type !== "event" && row.type !== "monthly") || Number(row.song_id ?? 0) !== 0 || row.is_final) return;

          const targetId = Number(row.event_id);
          const targetType = row.type as ComparisonTargetType;
          const tier = Number(row.tier);
          const time = Number(row.time);
          const ep = Number(row.ep);
          const matched = configsRef.current.find((config) => (
            config.targetType === targetType &&
            config.targetId === targetId &&
            config.tier === tier
          ));

          if (!matched || !Number.isFinite(time) || !Number.isFinite(ep)) return;

          const key = cacheKey(matched);
          setDataByKey((previous) => {
            const nextPoints = normalizePoints([...(dataCache.get(key) ?? previous[key] ?? []), { time, ep }]);
            dataCache.set(key, nextPoints);
            return { ...previous, [key]: nextPoints };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [configSignature, configs, enabled]);

  const comparisonLines = useMemo(() => {
    if (!enabled) return [];

    return configs.filter(isResolvedConfig).map((config, index) => {
      const key = cacheKey(config);
      const cached = dataCache.get(key);
      const target = buildComparisonTargetMeta(config, eventMap, monthlyOptionMap);
      return buildLine(
        config,
        index,
        target,
        dataByKey[key] ?? cached,
        Boolean(loadingByKey[key]),
        alignment,
        currentStart,
        currentEnd,
      );
    });
  }, [alignment, configs, currentEnd, currentStart, dataByKey, enabled, eventMap, loadingByKey, monthlyOptionMap]);

  return { comparisonLines };
}
