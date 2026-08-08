import {
  getBandoriServerCode,
  type BandoriServer,
  type BandoriServerCode,
} from "@/lib/bandori-server";

export type BandoriTrackerSeriesPoint = {
  time: number;
  ep: number;
  isFinal?: boolean;
};

export type BandoriTrackerSongGroup<TPoint extends BandoriTrackerSeriesPoint = BandoriTrackerSeriesPoint> = {
  songId: number;
  cutoffs: TPoint[];
};

export type BandoriTrackerSongEvent = {
  eventType: string;
  musicIds: Record<BandoriServerCode, number[]>;
};

function normalizeTrackerCutoffs<TPoint extends BandoriTrackerSeriesPoint>(
  series: TPoint[],
): TPoint[] {
  const pointByTime = new Map<number, TPoint>();

  for (const point of series) {
    const time = Number(point?.time);
    const ep = Number(point?.ep);

    if (!Number.isFinite(time) || !Number.isFinite(ep)) {
      continue;
    }

    const previousPoint = pointByTime.get(time);
    pointByTime.set(time, {
      ...previousPoint,
      ...point,
      time,
      ep,
      isFinal: previousPoint?.isFinal || point?.isFinal ? true : undefined,
    });
  }

  return Array.from(pointByTime.values()).sort((left, right) => left.time - right.time);
}

export function mergeTrackerCutoffs<TPoint extends BandoriTrackerSeriesPoint>(
  incoming: TPoint[],
  existing: TPoint[],
): TPoint[] {
  const merged = new Map<number, TPoint>();

  for (const point of normalizeTrackerCutoffs(existing)) {
    merged.set(point.time, point);
  }
  for (const point of normalizeTrackerCutoffs(incoming)) {
    merged.set(point.time, point);
  }

  return Array.from(merged.values()).sort((left, right) => left.time - right.time);
}

export function mergeTrackerSongGroups<TPoint extends BandoriTrackerSeriesPoint>(
  incoming: BandoriTrackerSongGroup<TPoint>[],
  existing: BandoriTrackerSongGroup<TPoint>[],
): BandoriTrackerSongGroup<TPoint>[] {
  const existingBySongId = new Map(existing.map((group) => [group.songId, group]));

  for (const group of incoming) {
    const previousGroup = existingBySongId.get(group.songId);
    existingBySongId.set(group.songId, {
      songId: group.songId,
      cutoffs: previousGroup
        ? mergeTrackerCutoffs(group.cutoffs, previousGroup.cutoffs)
        : group.cutoffs,
    });
  }

  return Array.from(existingBySongId.values()).sort((left, right) => left.songId - right.songId);
}

function normalizeEventType(eventType: string | null | undefined): string {
  return (eventType ?? "").trim().toLowerCase();
}

function getAvailableSongIds(
  eventMeta: BandoriTrackerSongEvent | null,
  server: BandoriServer,
): number[] {
  const eventType = normalizeEventType(eventMeta?.eventType);
  if (eventType !== "challenge" && eventType !== "versus") {
    return [];
  }

  const songIds = eventMeta?.musicIds[getBandoriServerCode(server)] ?? [];
  return Array.from(
    new Set(
      songIds
        .map((musicId) => Number(musicId))
        .filter((musicId) => Number.isFinite(musicId) && musicId > 0),
    ),
  ).sort((left, right) => left - right);
}

export function resolveSelectedSongId(
  trackingMode: string,
  eventMeta: BandoriTrackerSongEvent | null,
  selectedSongId: number,
  server: BandoriServer,
): number {
  if (trackingMode !== "song") {
    return 0;
  }

  const eventType = normalizeEventType(eventMeta?.eventType);
  const availableSongIds = getAvailableSongIds(eventMeta, server);
  if (eventType === "versus") {
    return availableSongIds.length === 1 ? availableSongIds[0] : 0;
  }
  if (eventType !== "challenge" || availableSongIds.length === 0) {
    return 0;
  }

  return availableSongIds.includes(selectedSongId)
    ? selectedSongId
    : availableSongIds[0];
}

export function selectSongCutoffs<TPoint extends BandoriTrackerSeriesPoint>(
  songGroups: BandoriTrackerSongGroup<TPoint>[],
  selectedSongId: number,
  eventType?: string | null,
): TPoint[] {
  const selectedGroup = songGroups.find((group) => group.songId === selectedSongId);

  // Older Versus samples were stored under songId=0. During and after the
  // canonical migration, merge both series so cached responses and retained
  // immutable packs cannot create a visible gap. Explicit song data wins when
  // both groups contain the same timestamp.
  if (normalizeEventType(eventType) === "versus" && selectedSongId > 0) {
    const legacyGroup = songGroups.find((group) => group.songId === 0);
    if (selectedGroup && legacyGroup) {
      return mergeTrackerCutoffs(selectedGroup.cutoffs, legacyGroup.cutoffs);
    }
    return selectedGroup?.cutoffs ?? legacyGroup?.cutoffs ?? [];
  }

  if (selectedGroup) {
    return selectedGroup.cutoffs;
  }
  if (selectedSongId === 0) {
    return songGroups.find((group) => group.songId === 0)?.cutoffs
      ?? songGroups[0]?.cutoffs
      ?? [];
  }
  return [];
}
