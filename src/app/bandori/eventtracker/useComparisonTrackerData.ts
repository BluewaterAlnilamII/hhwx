"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BANDORI_TRACKER_DATA_TABLE } from "@/lib/supabase-table-names";
import { COMPARISON_LINE_COLORS } from "./constants";
import type {
  ComparisonAlignment,
  ComparisonConfig,
  ComparisonLine,
  ComparisonLinePoint,
  ComparisonStatus,
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
  eventId: number;
  tier: number;
};

function isResolvedConfig(config: ComparisonConfig): config is ResolvedComparisonConfig {
  return config.eventId !== null && config.tier !== null;
}

function cacheKey(config: ComparisonConfig): string {
  return `${config.eventId}:${config.tier}`;
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
  const response = await fetch(`/api/bandori/tracker/data?server=3&event=${config.eventId}&type=event&tier=${config.tier}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = await response.json() as TrackerResponse;
  if (!Array.isArray(payload.cutoffs)) return [];

  return normalizePoints(payload.cutoffs.flatMap((point) => {
    const parsed = parsePoint(point);
    return parsed ? [parsed] : [];
  }));
}

function eventLabel(event: MinimalEvent | undefined, eventId: number): string {
  const name = event?.name.trim();
  return name ? name : `${eventId}期`;
}

function buildLine(
  config: ComparisonConfig,
  index: number,
  event: MinimalEvent | undefined,
  points: TrackerData[] | undefined,
  isLoading: boolean,
  alignment: ComparisonAlignment,
  currentStart: number | null,
  currentEnd: number | null,
): ComparisonLine {
  const colorIndex = config.colorIndex ?? index;
  const dataKey = `compare_${colorIndex}_ep` as const;
  const color = COMPARISON_LINE_COLORS[colorIndex % COMPARISON_LINE_COLORS.length];
  const name = eventLabel(event, config.eventId ?? 0);
  let status: ComparisonStatus = "ready";
  let shiftedPoints: ComparisonLinePoint[] = [];

  if (!event || event.startAt === null || event.endAt === null || currentStart === null || currentEnd === null) {
    status = "time-missing";
  } else if (isLoading && points === undefined) {
    status = "loading";
  } else if (!points || points.length === 0) {
    status = "no-data";
  } else {
    const offset = alignment === "end" ? currentEnd - event.endAt : currentStart - event.startAt;
    const visibleEnd = currentEnd + 1000;

    shiftedPoints = points.flatMap((point) => {
      const shiftedTime = point.time + offset;
      if (shiftedTime < currentStart || shiftedTime > visibleEnd) return [];

      return [{
        dataKey,
        eventId: config.eventId ?? 0,
        tier: config.tier ?? 0,
        eventName: name,
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
    label: `${config.eventId ?? "-"}期 T${config.tier ?? "-"}`,
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
  alignment,
  currentStart,
  currentEnd,
}: {
  enabled: boolean;
  configs: ComparisonConfig[];
  events: MinimalEvent[];
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

          if (!row || row.type !== "event" || Number(row.song_id ?? 0) !== 0 || row.is_final) return;

          const eventId = Number(row.event_id);
          const tier = Number(row.tier);
          const time = Number(row.time);
          const ep = Number(row.ep);
          const matched = configsRef.current.find((config) => config.eventId === eventId && config.tier === tier);

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
      return buildLine(
        config,
        index,
        eventMap.get(config.eventId),
        dataByKey[key] ?? cached,
        Boolean(loadingByKey[key]),
        alignment,
        currentStart,
        currentEnd,
      );
    });
  }, [alignment, configs, currentEnd, currentStart, dataByKey, enabled, eventMap, loadingByKey]);

  return { comparisonLines };
}
