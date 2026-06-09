import type { BandoriTeamSearchConstraints } from "./types";

export type NormalizedBandoriTeamSearchConstraints = {
  minLeaderScoreUpPercent: number | null;
  minTotalPower: number | null;
};

function normalizePositiveConstraint(value: unknown): number | null {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

export function normalizeTeamSearchConstraints(
  constraints: BandoriTeamSearchConstraints | undefined,
): NormalizedBandoriTeamSearchConstraints {
  return {
    minLeaderScoreUpPercent: normalizePositiveConstraint(constraints?.minLeaderScoreUpPercent),
    minTotalPower: normalizePositiveConstraint(constraints?.minTotalPower),
  };
}
