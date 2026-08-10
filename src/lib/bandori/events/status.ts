export type BandoriEventStatus =
  | "upcoming"
  | "ongoing"
  | "ended";

export function getBandoriEventStatusAt(
  currentTimeMs: number,
  startAt: number | "auto" | null,
  endAt: number | "auto" | null,
): BandoriEventStatus {
  if (typeof startAt !== "number" || typeof endAt !== "number") {
    return "upcoming";
  }

  if (currentTimeMs < startAt) {
    return "upcoming";
  }

  if (currentTimeMs > endAt) {
    return "ended";
  }

  return "ongoing";
}
