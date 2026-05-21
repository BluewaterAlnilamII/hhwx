import type { BandoriAssetRegion } from "@/lib/bandori-asset-proxy";

export type BandoriRegionalEventTimeline = {
  jp: {
    startAt: number;
    endAt: number;
  };
  cn: {
    startAt: number | null;
    endAt: number | null;
  };
  cnSchedule?: {
    startAt: number;
    endAt: number;
  };
};

export type BandoriRegionalEvent = {
  name: {
    jp: string;
    cn: string | null;
  };
  timeline: BandoriRegionalEventTimeline;
};

export type BandoriCnScheduleWindow = {
  startAt: number | null;
  endAt: number | null;
  source: "official" | "predicted" | "unknown";
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function hasBandoriOfficialCnEventContent(event: BandoriRegionalEvent): boolean {
  return hasText(event.name.cn)
    || event.timeline.cn.startAt !== null
    || event.timeline.cn.endAt !== null;
}

export function resolveBandoriCnScheduleWindow(event: Pick<BandoriRegionalEvent, "timeline">): BandoriCnScheduleWindow {
  if (event.timeline.cn.startAt !== null || event.timeline.cn.endAt !== null) {
    return {
      startAt: event.timeline.cn.startAt,
      endAt: event.timeline.cn.endAt,
      source: "official",
    };
  }

  const predictedWindow = event.timeline.cnSchedule;
  if (predictedWindow) {
    return {
      startAt: predictedWindow.startAt,
      endAt: predictedWindow.endAt,
      source: "predicted",
    };
  }

  return { startAt: null, endAt: null, source: "unknown" };
}

export function resolveBandoriEventAssetRegion(event: BandoriRegionalEvent): BandoriAssetRegion {
  // 预测排期只表示预计 CN 开展时间，不能作为 CN 资源已经存在的依据。
  return hasBandoriOfficialCnEventContent(event) ? "cn" : "jp";
}
