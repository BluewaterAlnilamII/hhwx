export type BandoriEventStatus = "未开始" | "进行中" | "已结束";

export function getBandoriEventStatusAt(
  currentTimeMs: number,
  startAt: number | "auto" | null,
  endAt: number | "auto" | null,
): BandoriEventStatus {
  if (typeof startAt !== "number" || typeof endAt !== "number") {
    return "未开始";
  }

  if (currentTimeMs < startAt) {
    return "未开始";
  }

  if (currentTimeMs > endAt) {
    return "已结束";
  }

  return "进行中";
}
