import { LIVE_API_CACHE_CONTROL, withCacheControl } from "@/lib/api-cache";
import { jsonError } from "@/lib/api-response";
import { resolveBandoriCnScheduleWindow } from "@/lib/bandori-event-region";
import { fetchBandoriEventRecords, toBandoriEventSummary } from "@/lib/bandori-events-server";
import { isSupportedTrackerTier } from "@/lib/bandori-tracker-tiers";

const BESTDORI_CN_SERVER = 3;
const BESTDORI_TRACKER_DATA_URL = "https://bestdori.com/api/tracker/data";
const BESTDORI_TRACKER_RATES_URL = "https://bestdori.com/api/tracker/rates.json";
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RATES_REVALIDATE_SECONDS = 12 * 60 * 60;

export type BestdoriTrackerPoint = {
  time: number;
  ep: number;
};

export type BestdoriPredictionPoint = {
  time: number;
  ep: number;
};

export type BestdoriPredictionResult = {
  enabled: boolean;
  result: boolean;
  source: "bestdori";
  cutoffs: BestdoriTrackerPoint[];
  predictionPoints: BestdoriPredictionPoint[];
  latestPrediction: number | null;
  latestCutoff: number | null;
  updatedAt: number | null;
};

type BestdoriRate = {
  type?: string;
  server?: number;
  tier?: number;
  rate?: number | null;
};

type BestdoriTrackerDataPayload = {
  result?: boolean;
  cutoffs?: unknown;
};

type RegressionResult = {
  a: number;
  b: number;
};

function disabledResult(): BestdoriPredictionResult {
  return {
    enabled: false,
    result: false,
    source: "bestdori",
    cutoffs: [],
    predictionPoints: [],
    latestPrediction: null,
    latestCutoff: null,
    updatedAt: null,
  };
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTrackerPoint(point: unknown): BestdoriTrackerPoint | null {
  const raw = point as { time?: unknown; ep?: unknown } | null;
  const time = Number(raw?.time);
  const ep = Number(raw?.ep);

  if (!Number.isFinite(time) || !Number.isFinite(ep)) {
    return null;
  }

  return { time, ep };
}

function normalizeTrackerPoints(points: unknown): BestdoriTrackerPoint[] {
  if (!Array.isArray(points)) return [];

  const byTime = new Map<number, BestdoriTrackerPoint>();
  for (const point of points) {
    const normalized = normalizeTrackerPoint(point);
    if (normalized) {
      byTime.set(normalized.time, normalized);
    }
  }

  return Array.from(byTime.values()).sort((left, right) => left.time - right.time);
}

function regression(points: [number, number][]): RegressionResult | null {
  if (points.length === 0) return null;

  let averageX = 0;
  let averageY = 0;
  for (const [x, y] of points) {
    averageX += x;
    averageY += y;
  }
  averageX /= points.length;
  averageY /= points.length;

  let covariance = 0;
  let variance = 0;
  for (const [x, y] of points) {
    covariance += (x - averageX) * (y - averageY);
    variance += (x - averageX) * (x - averageX);
  }

  if (variance === 0) return null;

  const b = covariance / variance;
  const a = averageY - b * averageX;
  return { a, b };
}

function calculateBestdoriPrediction(options: {
  cutoffs: BestdoriTrackerPoint[];
  eventStartAt: number;
  eventEndAt: number;
  rate: number | null;
}): BestdoriPredictionPoint[] {
  const { cutoffs, eventStartAt, eventEndAt, rate } = options;
  const duration = eventEndAt - eventStartAt;

  if (!Number.isFinite(rate) || rate === null || duration <= 0 || cutoffs.length === 0) {
    return [];
  }

  const rawPredictions: Array<{ time: number; progress: number; ep: number }> = [
    { time: eventStartAt, progress: 0, ep: Number.POSITIVE_INFINITY },
  ];
  const regressionSamples: [number, number][] = [];

  for (const cutoff of cutoffs) {
    const progress = (cutoff.time - eventStartAt) / duration;

    if (cutoff.time - eventStartAt >= TWELVE_HOURS_MS) {
      regressionSamples.push([progress, cutoff.ep]);
    }

    let prediction = {
      time: cutoff.time,
      progress,
      ep: Number.POSITIVE_INFINITY,
    };

    if (
      cutoff.time - eventStartAt >= ONE_DAY_MS &&
      eventEndAt - cutoff.time >= ONE_DAY_MS &&
      regressionSamples.length >= 5
    ) {
      const fit = regression(regressionSamples);
      if (fit) {
        prediction = {
          time: cutoff.time,
          progress,
          ep: fit.a + fit.b + fit.b * rate,
        };
      }
    }

    if (eventEndAt - cutoff.time < ONE_DAY_MS && rawPredictions.length > 0) {
      prediction = {
        time: cutoff.time,
        progress,
        ep: rawPredictions[rawPredictions.length - 1].ep,
      };
    }

    rawPredictions.push(prediction);
  }

  const smoothedPredictions = rawPredictions.map((point, index) => {
    if (point.ep === Number.POSITIVE_INFINITY) {
      return { time: point.time, progress: point.progress, ep: Number.POSITIVE_INFINITY };
    }

    let weightedSum = 0;
    let weightTotal = 0;
    for (let cursor = 0; cursor <= index; cursor += 1) {
      const candidate = rawPredictions[cursor];
      if (candidate.ep !== Number.POSITIVE_INFINITY) {
        const weight = candidate.progress * candidate.progress;
        weightedSum += candidate.ep * weight;
        weightTotal += weight;
      }
    }

    return {
      time: point.time,
      progress: point.progress,
      ep: weightTotal > 0 ? weightedSum / weightTotal : Number.POSITIVE_INFINITY,
    };
  });

  const latest = smoothedPredictions[smoothedPredictions.length - 1];
  if (latest && latest.time < eventEndAt && latest.ep !== Number.POSITIVE_INFINITY) {
    smoothedPredictions.push({
      time: eventEndAt,
      progress: 1,
      ep: latest.ep,
    });
  }

  return smoothedPredictions.flatMap((point) => (
    Number.isFinite(point.ep)
      ? [{ time: point.time, ep: Math.round(point.ep) }]
      : []
  ));
}

async function fetchBestdoriTrackerData(eventId: number, tier: number): Promise<BestdoriTrackerPoint[]> {
  const url = new URL(BESTDORI_TRACKER_DATA_URL);
  url.searchParams.set("server", String(BESTDORI_CN_SERVER));
  url.searchParams.set("event", String(eventId));
  url.searchParams.set("tier", String(tier));

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Bestdori tracker/data failed with HTTP ${response.status}`);
  }

  const payload = await response.json() as BestdoriTrackerDataPayload;
  return payload.result ? normalizeTrackerPoints(payload.cutoffs) : [];
}

async function fetchBestdoriRates(): Promise<BestdoriRate[]> {
  const response = await fetch(BESTDORI_TRACKER_RATES_URL, {
    cache: "force-cache",
    next: { revalidate: RATES_REVALIDATE_SECONDS },
  });
  if (!response.ok) {
    throw new Error(`Bestdori tracker/rates failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload as BestdoriRate[] : [];
}

function findBestdoriRate(rates: BestdoriRate[], eventType: string, tier: number): number | null {
  const match = rates.find((rate) => (
    rate.type === eventType &&
    rate.server === BESTDORI_CN_SERVER &&
    rate.tier === tier
  ));

  return typeof match?.rate === "number" && Number.isFinite(match.rate)
    ? match.rate
    : null;
}

export async function buildBestdoriPredictionResponse(
  eventId: number,
  tier: number,
): Promise<BestdoriPredictionResult> {
  const records = await fetchBandoriEventRecords({ eventId });
  const event = records[0] ? toBandoriEventSummary(records[0]) : null;
  if (!event) {
    return disabledResult();
  }

  const window = resolveBandoriCnScheduleWindow(event);
  const now = Date.now();
  if (
    window.startAt === null ||
    window.endAt === null ||
    now < window.startAt ||
    now >= window.endAt
  ) {
    return disabledResult();
  }

  const [cutoffs, rates] = await Promise.all([
    fetchBestdoriTrackerData(eventId, tier),
    fetchBestdoriRates(),
  ]);
  const rate = findBestdoriRate(rates, event.eventType, tier);
  const predictionPoints = calculateBestdoriPrediction({
    cutoffs,
    eventStartAt: window.startAt,
    eventEndAt: window.endAt,
    rate,
  });
  const latestPrediction = predictionPoints.length > 0
    ? predictionPoints[predictionPoints.length - 1].ep
    : null;
  const latestCutoff = cutoffs.length > 0 ? cutoffs[cutoffs.length - 1].ep : null;
  const updatedAt = cutoffs.length > 0 ? cutoffs[cutoffs.length - 1].time : null;

  return {
    enabled: true,
    result: cutoffs.length > 0,
    source: "bestdori",
    cutoffs,
    predictionPoints,
    latestPrediction,
    latestCutoff,
    updatedAt,
  };
}

export async function handleBestdoriPredictionRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = parsePositiveInteger(searchParams.get("event"));
    const tier = parsePositiveInteger(searchParams.get("tier"));

    if (eventId === null || tier === null) {
      return jsonError(400, "INVALID_REQUEST", "Missing or invalid required parameters: event, tier.", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
        details: {
          event: searchParams.get("event"),
          tier: searchParams.get("tier"),
        },
      });
    }

    if (!isSupportedTrackerTier("event", tier)) {
      return jsonError(404, "TRACKER_TIER_NOT_SUPPORTED", "The requested event tracker tier is not supported.", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
        details: { event: eventId, tier },
      });
    }

    return Response.json(await buildBestdoriPredictionResponse(eventId, tier), {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bestdori prediction API error:", error);
    return jsonError(502, "BESTDORI_PREDICTION_FAILED", "Failed to fetch Bestdori prediction data.", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
