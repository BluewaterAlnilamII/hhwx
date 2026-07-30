import type { BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import {
  getBandoriRegionalDisplayOrder,
  getBandoriServerCode,
  type BandoriServer,
} from "@/lib/bandori-server";

export type BandoriRegionalEventTimeline = {
  jp: {
    startAt: number | null;
    endAt: number | null;
  };
  en?: {
    startAt: number | null;
    endAt: number | null;
  };
  tw?: {
    startAt: number | null;
    endAt: number | null;
  };
  cn: {
    startAt: number | null;
    endAt: number | null;
  };
  jpSchedule?: {
    startAt: number;
    endAt: number;
  };
  enSchedule?: {
    startAt: number;
    endAt: number;
  };
  twSchedule?: {
    startAt: number;
    endAt: number;
  };
  cnSchedule?: {
    startAt: number;
    endAt: number;
  };
};

export type BandoriRegionalEvent = {
  name: {
    jp: string;
    en?: string | null;
    tw?: string | null;
    cn: string | null;
  };
  timeline: BandoriRegionalEventTimeline;
};

export type BandoriEventScheduleWindow = {
  startAt: number | null;
  endAt: number | null;
  source: "official" | "predicted" | "unknown";
  displayServer: BandoriServer;
};

export type BandoriCnScheduleWindow = BandoriEventScheduleWindow;

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function hasBandoriOfficialCnEventContent(event: BandoriRegionalEvent): boolean {
  return hasText(event.name.cn)
    || event.timeline.cn.startAt !== null
    || event.timeline.cn.endAt !== null;
}

function hasCompleteWindow(window: { startAt: number | null; endAt: number | null } | undefined): window is { startAt: number; endAt: number } {
  return window?.startAt !== null
    && window?.startAt !== undefined
    && window.endAt !== null
    && window.endAt !== undefined;
}

function getBandoriEventSchedule(
  timeline: BandoriRegionalEventTimeline,
  server: BandoriServer,
): { startAt: number; endAt: number } | undefined {
  const code = getBandoriServerCode(server);
  return timeline[`${code}Schedule`];
}

export function resolveBandoriCnScheduleWindow(event: Pick<BandoriRegionalEvent, "timeline">): BandoriCnScheduleWindow {
  return resolveBandoriEventScheduleWindow(event, 3);
}

export function resolveBandoriEventServerScheduleWindow(
  event: Pick<BandoriRegionalEvent, "timeline">,
  server: BandoriServer,
): BandoriEventScheduleWindow {
  const officialWindow = event.timeline[getBandoriServerCode(server)];
  if (hasCompleteWindow(officialWindow)) {
    return {
      startAt: officialWindow.startAt,
      endAt: officialWindow.endAt,
      source: "official",
      displayServer: server,
    };
  }

  const predictedWindow = getBandoriEventSchedule(event.timeline, server);
  if (hasCompleteWindow(predictedWindow)) {
    return {
      startAt: predictedWindow.startAt,
      endAt: predictedWindow.endAt,
      source: "predicted",
      displayServer: server,
    };
  }

  return { startAt: null, endAt: null, source: "unknown", displayServer: server };
}

export function resolveBandoriEventScheduleWindow(
  event: Pick<BandoriRegionalEvent, "timeline">,
  server: BandoriServer,
): BandoriEventScheduleWindow {
  for (const candidateServer of getBandoriRegionalDisplayOrder(server)) {
    const window = resolveBandoriEventServerScheduleWindow(event, candidateServer);
    if (window.startAt !== null && window.endAt !== null) {
      return window;
    }
  }

  return { startAt: null, endAt: null, source: "unknown", displayServer: server };
}

export function resolveBandoriEventAssetRegion(event: BandoriRegionalEvent): BandoriAssetRegion {
  // 预测排期只表示预计 CN 开展时间，不能作为 CN 资源已经存在的依据。
  return hasBandoriOfficialCnEventContent(event) ? "cn" : "jp";
}
