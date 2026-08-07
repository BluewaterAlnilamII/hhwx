import {
  getBandoriServerCode,
  type BandoriServer,
  type BandoriServerCode,
} from "@/lib/bandori-server";

type BandoriMonthlyRankingEpoch = {
  anchorPeriod: string;
  anchorId: number;
  openHour: number;
  utcOffsetHours: number;
};

export type BandoriMonthlyRankingWindow = {
  period: string;
  monthId: number;
  opensAt: number;
  endsAt: number;
};

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/u;

/**
 * Mirrors hhwx-tracker's verified per-server monthly ranking contract.
 * Offsets are deliberately fixed because EN uses the game's fixed UTC-8
 * calendar rather than a daylight-saving civil timezone.
 */
export const BANDORI_MONTHLY_RANKING_EPOCHS: Readonly<Record<BandoriServerCode, BandoriMonthlyRankingEpoch>> = {
  jp: { anchorPeriod: "2024-10", anchorId: 1, openHour: 15, utcOffsetHours: 9 },
  en: { anchorPeriod: "2025-10", anchorId: 1, openHour: 0, utcOffsetHours: -8 },
  tw: { anchorPeriod: "2025-06", anchorId: 1, openHour: 15, utcOffsetHours: 8 },
  cn: { anchorPeriod: "2025-02", anchorId: 1, openHour: 13, utcOffsetHours: 8 },
};

function requirePeriodOrdinal(period: string): number {
  const match = PERIOD_PATTERN.exec(period);
  if (!match) {
    throw new Error(`Invalid Bandori monthly ranking period: ${period}`);
  }
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function periodFromOrdinal(ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new Error(`Invalid Bandori monthly ranking ordinal: ${ordinal}`);
  }
  const year = Math.floor(ordinal / 12);
  const month = ordinal % 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function requireMonthlyRankingId(monthId: number): void {
  if (!Number.isSafeInteger(monthId) || monthId < 1) {
    throw new Error(`Invalid Bandori monthly ranking ID: ${monthId}`);
  }
}

function serverLocalTimestamp(
  server: BandoriServerCode,
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
): number {
  const offsetMs = BANDORI_MONTHLY_RANKING_EPOCHS[server].utcOffsetHours * 60 * 60 * 1_000;
  return Date.UTC(year, monthIndex, day, hour) - offsetMs;
}

function serverLocalPeriodAt(server: BandoriServerCode, timestamp: number): string {
  const offsetMs = BANDORI_MONTHLY_RANKING_EPOCHS[server].utcOffsetHours * 60 * 60 * 1_000;
  const local = new Date(timestamp + offsetMs);
  return periodFromOrdinal(local.getUTCFullYear() * 12 + local.getUTCMonth());
}

export function bandoriMonthlyRankingIdToPeriod(
  server: BandoriServerCode,
  monthId: number,
): string {
  requireMonthlyRankingId(monthId);
  const epoch = BANDORI_MONTHLY_RANKING_EPOCHS[server];
  if (!epoch) {
    throw new Error(`Unsupported Bandori monthly ranking server: ${server}`);
  }
  return periodFromOrdinal(
    requirePeriodOrdinal(epoch.anchorPeriod) + monthId - epoch.anchorId,
  );
}

export function bandoriMonthlyRankingPeriodToId(
  server: BandoriServerCode,
  period: string,
): number {
  const epoch = BANDORI_MONTHLY_RANKING_EPOCHS[server];
  if (!epoch) {
    throw new Error(`Unsupported Bandori monthly ranking server: ${server}`);
  }
  const delta = requirePeriodOrdinal(period) - requirePeriodOrdinal(epoch.anchorPeriod);
  const monthId = epoch.anchorId + delta;
  if (delta < 0 || monthId < 1) {
    throw new Error(`Bandori monthly ranking period predates ${server} epoch: ${period}`);
  }
  return monthId;
}

export function getBandoriMonthlyRankingWindow(
  server: BandoriServerCode,
  monthId: number,
): BandoriMonthlyRankingWindow {
  const period = bandoriMonthlyRankingIdToPeriod(server, monthId);
  const ordinal = requirePeriodOrdinal(period);
  const year = Math.floor(ordinal / 12);
  const monthIndex = ordinal % 12;
  const opensAt = serverLocalTimestamp(
    server,
    year,
    monthIndex,
    1,
    BANDORI_MONTHLY_RANKING_EPOCHS[server].openHour,
  );
  const endsAt = serverLocalTimestamp(server, year, monthIndex + 1, 1, 0) - 1;
  return { period, monthId, opensAt, endsAt };
}

export function getCurrentBandoriMonthlyRankingWindow(
  server: BandoriServerCode,
  referenceTime: Date = new Date(),
): BandoriMonthlyRankingWindow {
  const referenceTimestamp = referenceTime.getTime();
  let period = serverLocalPeriodAt(server, referenceTimestamp);
  let monthId = bandoriMonthlyRankingPeriodToId(server, period);
  let window = getBandoriMonthlyRankingWindow(server, monthId);
  if (referenceTimestamp < window.opensAt) {
    period = periodFromOrdinal(requirePeriodOrdinal(period) - 1);
    monthId = bandoriMonthlyRankingPeriodToId(server, period);
    window = getBandoriMonthlyRankingWindow(server, monthId);
  }
  return window;
}

export function remapBandoriMonthlyRankingId(
  sourceServer: BandoriServerCode,
  targetServer: BandoriServerCode,
  sourceMonthId: number,
): number {
  return bandoriMonthlyRankingPeriodToId(
    targetServer,
    bandoriMonthlyRankingIdToPeriod(sourceServer, sourceMonthId),
  );
}

export function getBandoriMonthlyRankingMidnights(
  server: BandoriServerCode,
  startAt: number,
  endAt: number,
): number[] {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt >= endAt) {
    return [];
  }
  const offsetMs = BANDORI_MONTHLY_RANKING_EPOCHS[server].utcOffsetHours * 60 * 60 * 1_000;
  const localStart = new Date(startAt + offsetMs);
  let midnight = serverLocalTimestamp(
    server,
    localStart.getUTCFullYear(),
    localStart.getUTCMonth(),
    localStart.getUTCDate() + 1,
    0,
  );
  const result: number[] = [];
  while (midnight <= endAt) {
    result.push(midnight);
    const nextLocal = new Date(midnight + offsetMs);
    midnight = serverLocalTimestamp(
      server,
      nextLocal.getUTCFullYear(),
      nextLocal.getUTCMonth(),
      nextLocal.getUTCDate() + 1,
      0,
    );
  }
  return result;
}

export function getBandoriServerDayStart(
  server: BandoriServerCode,
  timestamp: number,
): number {
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid Bandori server timestamp: ${timestamp}`);
  }
  const offsetMs = BANDORI_MONTHLY_RANKING_EPOCHS[server].utcOffsetHours * 60 * 60 * 1_000;
  const local = new Date(timestamp + offsetMs);
  return serverLocalTimestamp(
    server,
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    0,
  );
}

export function getBandoriMonthlyRankingWindowForServer(
  server: BandoriServer,
  monthId: number,
): BandoriMonthlyRankingWindow {
  return getBandoriMonthlyRankingWindow(getBandoriServerCode(server), monthId);
}
