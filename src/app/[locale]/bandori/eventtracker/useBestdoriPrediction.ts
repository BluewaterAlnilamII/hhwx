"use client";

import { useMemo } from "react";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { REALTIME_HOT_CACHE_PROFILE } from "@/lib/api-cache";
import type { TrackerData } from "./types";

type BestdoriPredictionPoint = {
  time: number;
  ep: number;
};

type BestdoriPredictionResponse = {
  enabled: boolean;
  result: boolean;
  source: "bestdori";
  cutoffs: BestdoriPredictionPoint[];
  predictionPoints: BestdoriPredictionPoint[];
  latestPrediction: number | null;
  latestCutoff: number | null;
  updatedAt: number | null;
};

export type BestdoriPredictionStatus = "disabled" | "loading" | "ready" | "no-data";

function normalizePredictionResponse(raw: unknown): BestdoriPredictionResponse {
  const payload = raw as Partial<BestdoriPredictionResponse> | null;

  return {
    enabled: payload?.enabled === true,
    result: payload?.result === true,
    source: "bestdori",
    cutoffs: Array.isArray(payload?.cutoffs) ? payload.cutoffs : [],
    predictionPoints: Array.isArray(payload?.predictionPoints) ? payload.predictionPoints : [],
    latestPrediction: typeof payload?.latestPrediction === "number" ? payload.latestPrediction : null,
    latestCutoff: typeof payload?.latestCutoff === "number" ? payload.latestCutoff : null,
    updatedAt: typeof payload?.updatedAt === "number" ? payload.updatedAt : null,
  };
}

export function mergeBestdoriPredictionData(
  baseData: TrackerData[],
  predictionPoints: BestdoriPredictionPoint[],
): TrackerData[] {
  if (predictionPoints.length === 0) {
    return baseData;
  }

  const byTime = new Map<number, TrackerData>();
  for (const point of baseData) {
    byTime.set(point.time, { ...point });
  }

  for (const point of predictionPoints) {
    const existing = byTime.get(point.time) ?? ({ time: point.time } as TrackerData);
    byTime.set(point.time, {
      ...existing,
      time: point.time,
      bestdoriPredictionEp: point.ep,
      bestdoriPrediction: {
        time: point.time,
        ep: point.ep,
        source: "bestdori",
      },
    });
  }

  return Array.from(byTime.values()).sort((left, right) => left.time - right.time);
}

export function useBestdoriPrediction({
  enabled,
  eventId,
  tier,
}: {
  enabled: boolean;
  eventId: number | null;
  tier: number;
}) {
  const requestKey = enabled && eventId !== null
    ? `bestdori-prediction-3-${eventId}-${tier}`
    : null;
  const requestUrl = enabled && eventId !== null
    ? `/api/bandori/bestdori-prediction?event=${eventId}&tier=${tier}`
    : null;

  const { data, loading } = useCachedFetch<BestdoriPredictionResponse>(
    requestKey,
    requestUrl,
    normalizePredictionResponse,
    { ...(REALTIME_HOT_CACHE_PROFILE.client ?? {}) },
  );

  const predictionPoints = useMemo(
    () => data?.enabled && data.result ? data.predictionPoints : [],
    [data],
  );

  const status: BestdoriPredictionStatus = !enabled
    ? "disabled"
    : loading
      ? "loading"
      : predictionPoints.length > 0 && data?.latestPrediction !== null
        ? "ready"
        : "no-data";

  return {
    data,
    loading,
    status,
    predictionPoints,
    latestPrediction: data?.latestPrediction ?? null,
  };
}
