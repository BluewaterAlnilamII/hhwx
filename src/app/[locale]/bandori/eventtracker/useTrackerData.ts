"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useCachedFetch, updateFetchCache } from "@/hooks/useCachedFetch";
import { parseApiSuccessData } from "@/lib/api-contracts";
import {
  hasBandoriOfficialCnEventContent,
  resolveBandoriCnScheduleWindow,
} from "@/lib/bandori-event-region";
import { BANDORI_TRACKER_DATA_TABLE } from "@/lib/supabase-table-names";
import {
  EXTERNAL_REFERENCE_CACHE_PROFILE,
  MUTABLE_DIRECTORY_CACHE_PROFILE,
  REALTIME_HOT_CACHE_PROFILE,
} from "@/lib/api-cache";
import type { ChinaMainlandHolidayCalendarData } from "@/app/[locale]/bandori/calendar/chinaMainlandHolidayCalendar";
import type { TrackerData, TrackerResult, TrackerSongGroup, EventMetadata, MinimalEvent, TrackingMode, BandoriEventSummary } from "./types";
import { getMonthlyRankingWindow } from "./useChartData";
import { useBoundaryClock } from "./useBoundaryClock";

function appendTrackerPoint(series: TrackerData[], time: number, ep: number, isFinal = false): TrackerData[] {
  if (series.length > 0 && time <= series[series.length - 1].time) {
    return series;
  }

  return [...series, { time, ep, isFinal }];
}

function normalizeTrackerCutoffs(series: TrackerData[]): TrackerData[] {
  const pointByTime = new Map<number, TrackerData>();

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

function mergeTrackerCutoffs(incoming: TrackerData[], existing: TrackerData[]): TrackerData[] {
  const merged = new Map<number, TrackerData>();

  for (const point of normalizeTrackerCutoffs(existing)) {
    merged.set(point.time, point);
  }

  for (const point of normalizeTrackerCutoffs(incoming)) {
    merged.set(point.time, point);
  }

  return Array.from(merged.values()).sort((left, right) => left.time - right.time);
}

function mergeTrackerSongGroups(incoming: TrackerSongGroup[], existing: TrackerSongGroup[]): TrackerSongGroup[] {
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

function upsertSongGroupPoint(songGroups: TrackerSongGroup[], songId: number, time: number, ep: number, isFinal = false): TrackerSongGroup[] {
  let didUpdate = false;
  const nextGroups = songGroups.map((group) => {
    if (group.songId !== songId) {
      return group;
    }

    didUpdate = true;
    return {
      songId: group.songId,
      cutoffs: appendTrackerPoint(group.cutoffs, time, ep, isFinal),
    };
  });

  if (!didUpdate) {
    nextGroups.push({
      songId,
      cutoffs: [{ time, ep, isFinal }],
    });
  }

  return nextGroups.sort((left, right) => left.songId - right.songId);
}

function selectSongCutoffs(songGroups: TrackerSongGroup[], selectedSongId: number): TrackerData[] {
  const selectedGroup = songGroups.find((group) => group.songId === selectedSongId);
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

function parseTrackerPoint(point: unknown): TrackerData {
  const parsedPoint = point as { time?: number | string; ep?: number | string; isFinal?: boolean | null } | null;
  const nextPoint: TrackerData = {
    time: Number(parsedPoint?.time),
    ep: Number(parsedPoint?.ep),
  };

  if (parsedPoint?.isFinal === true) {
    nextPoint.isFinal = true;
  }

  return nextPoint;
}

function parseSongCutoffsPayload(
  payload: unknown,
  selectedSongId: number,
): { cutoffs: TrackerData[]; songGroups?: TrackerSongGroup[] } {
  if (Array.isArray(payload)) {
    return {
      cutoffs: payload.map((point) => parseTrackerPoint(point)),
    };
  }

  if (!payload || typeof payload !== "object") {
    return { cutoffs: [] };
  }

  const songGroups = Object.entries(payload as Record<string, unknown>)
    .map(([songIdText, groupPoints]) => ({
      songId: Number(songIdText),
      cutoffs: Array.isArray(groupPoints)
        ? groupPoints.map((point) => parseTrackerPoint(point))
        : [],
    }))
    .filter((group) => Number.isFinite(group.songId))
    .sort((left, right) => left.songId - right.songId);

  return {
    cutoffs: selectSongCutoffs(songGroups, selectedSongId),
    songGroups,
  };
}

function resolvePreferredEventName(event: Pick<BandoriEventSummary, "eventId" | "name">): string {
  const preferredName = event.name.cn?.trim();
  if (preferredName) {
    return preferredName;
  }

  const fallbackName = event.name.jp.trim();
  if (fallbackName) {
    return fallbackName;
  }

  return `娲诲姩 #${event.eventId}`;
}

function findBestEvent(events: MinimalEvent[], now: number): MinimalEvent | null {
  const withStart = events
    .filter((event): event is MinimalEvent & { startAt: number } => event.startAt !== null);

  const ongoing = withStart
    .filter((event) => event.endAt !== null && event.startAt <= now && now < event.endAt)
    .sort((left, right) => (left.endAt ?? 0) - (right.endAt ?? 0))[0];
  if (ongoing) {
    return ongoing;
  }

  const upcoming = withStart
    .filter((event) => event.startAt > now)
    .sort((left, right) => left.startAt - right.startAt)[0];
  if (upcoming) {
    return upcoming;
  }

  return withStart.sort((left, right) => right.startAt - left.startAt)[0] ?? null;
}

function getAvailableChallengeSongIds(eventMeta: EventMetadata | null): number[] {
  if (eventMeta?.eventType !== "challenge") {
    return [];
  }

  const challengeSongIds = eventMeta.musicIds.jp.length > 0
    ? eventMeta.musicIds.jp
    : eventMeta.musicIds.cn;

  return Array.from(
    new Set(
      challengeSongIds
        .map((musicId) => Number(musicId))
        .filter((musicId) => Number.isFinite(musicId) && musicId > 0),
    ),
  ).sort((left, right) => left - right);
}

function resolveSelectedSongId(
  trackingMode: TrackingMode,
  eventMeta: EventMetadata | null,
  selectedSongId: number,
): number {
  if (trackingMode !== "song") {
    return 0;
  }

  const availableChallengeSongIds = getAvailableChallengeSongIds(eventMeta);
  if (availableChallengeSongIds.length === 0) {
    return 0;
  }

  return availableChallengeSongIds.includes(selectedSongId)
    ? selectedSongId
    : availableChallengeSongIds[0];
}

/**
 * useTrackerData 鈥斺€?娲诲姩杩借釜椤甸潰鐨勬暟鎹幏鍙栧眰閽╁瓙銆?
 *
 * 鑱岃矗锛?
 * 1. 閫氳繃 useCachedFetch 鑾峰彇娲诲姩鍒楄〃銆佹椿鍔ㄥ厓鏁版嵁銆佽拷韪暟鎹?
 * 2. 寤虹珛 Supabase 瀹炴椂璁㈤槄锛屽皢鏂版暟鎹拷鍔犲埌 chartData 骞跺悓姝ュ洖缂撳瓨
 * 3. 鎻愪緵闃茬珵鎬佺殑鏁版嵁鍚堝苟绛栫暐锛岀‘淇濆墠鍙版仮澶嶅悗鐨勬帴鍙ｅ埛鏂颁笉浼氳鐩?
 *    瀹炴椂鎺ㄩ€佸凡缁忚拷鍔犵殑鏁版嵁鐐?
 *
 * 璁捐鍙栬垗锛?
 * - 椤甸潰缁勪欢鍚屾椂鎵挎媴鏁版嵁鑾峰彇銆佹淳鐢熻绠楀拰鐣岄潰娓叉煋鏃讹紝鑱岃矗杈圭晫浼氳繃浜庢ā绯?
 * - 灏嗘帴鍙ｈ姹傘€佸疄鏃舵帹閫佷笌缂撳瓨鍚屾鎶界鍚庯紝鏇翠究浜庣嫭绔嬪鏌ョ珵鎬佷慨澶嶆槸鍚︽纭?
 */
export function useTrackerData(
  currentEventId: number | null,
  trackingMode: TrackingMode,
  selectedTier: number,
  selectedSongId: number,
) {
  const [liveCutoffsByKey, setLiveCutoffsByKey] = useState<Record<string, TrackerData[]>>({});
  const [liveSongGroupsByKey, setLiveSongGroupsByKey] = useState<Record<string, TrackerSongGroup[]>>({});
  const [liveHasResultByKey, setLiveHasResultByKey] = useState<Record<string, boolean>>({});

  // ===== 缂撳瓨 + 鍓嶅彴鑷姩鍒锋柊锛氭椿鍔ㄥ垪琛?=====
  const { data: eventCatalog } = useCachedFetch<{ events: BandoriEventSummary[] }>(
    "bandori-events-v3",
    "/api/bandori/events",
    (data: unknown) => {
      const payload = parseApiSuccessData<{ events?: BandoriEventSummary[] }>(data) ?? data as { events?: BandoriEventSummary[] } | null;
      return {
        events: Array.isArray(payload?.events) ? payload.events : [],
      };
    },
    { ...(MUTABLE_DIRECTORY_CACHE_PROFILE.client ?? {}) },
  );

  const { data: holidayData } = useCachedFetch<ChinaMainlandHolidayCalendarData | null>(
    "bandori-calendar-cn-holidays",
    "/api/bandori/calendar/cn/holidays",
    (data: unknown) => parseApiSuccessData<ChinaMainlandHolidayCalendarData>(data) ?? data as ChinaMainlandHolidayCalendarData,
    { ...(EXTERNAL_REFERENCE_CACHE_PROFILE.client ?? {}) },
  );

  const eventMetaMap = useMemo(() => {
    return new Map<number, BandoriEventSummary>((eventCatalog?.events ?? []).map((event) => [event.eventId, event]));
  }, [eventCatalog]);

  const allEvents = useMemo<MinimalEvent[]>(() => {
    return (eventCatalog?.events ?? [])
      .map((event) => {
        const scheduleWindow = resolveBandoriCnScheduleWindow(event);

        return {
          id: event.eventId,
          name: resolvePreferredEventName(event),
          startAt: scheduleWindow.startAt,
          endAt: scheduleWindow.endAt,
          hasCn: hasBandoriOfficialCnEventContent(event),
          hasJp: Boolean(event.name.jp.trim()),
        };
      })
      .sort((left, right) => right.id - left.id);
  }, [eventCatalog]);

  const eventScheduleBoundaries = useMemo(
    () => allEvents.flatMap((event) => {
      const boundaries: number[] = [];

      if (event.startAt !== null) {
        boundaries.push(event.startAt);
      }

      if (event.endAt !== null) {
        boundaries.push(event.endAt + 1);
      }

      return boundaries;
    }),
    [allEvents],
  );

  const eventScheduleNow = useBoundaryClock(eventScheduleBoundaries);

  const recommendedEventId = useMemo(
    () => findBestEvent(allEvents, eventScheduleNow)?.id ?? null,
    [allEvents, eventScheduleNow],
  );
  const resolvedCurrentEventId = currentEventId !== null && eventMetaMap.has(currentEventId)
    ? currentEventId
    : recommendedEventId;

  // eventtracker 褰撳墠鍙秷璐圭洰褰曟憳瑕侀噷宸茬粡瀛樺湪鐨勫瓧娈碉紝
  // 鍥犳鐩存帴浠?events 鍒楄〃涓€夊嚭褰撳墠娲诲姩锛岄伩鍏嶅啀鍙戜竴娆?detail 璇锋眰銆?
  const eventMeta = useMemo<EventMetadata | null>(() => {
    if (resolvedCurrentEventId === null) {
      return null;
    }

    return eventMetaMap.get(resolvedCurrentEventId) ?? null;
  }, [eventMetaMap, resolvedCurrentEventId]);

  const resolvedSelectedSongId = useMemo(
    () => resolveSelectedSongId(trackingMode, eventMeta, selectedSongId),
    [eventMeta, selectedSongId, trackingMode],
  );

  // ===== 缂撳瓨 + 鍓嶅彴鑷姩鍒锋柊锛氳拷韪暟鎹?=====
  // 鏈堝害鎺掕鎸夊綋鍓嶆湁鏁堟湀浠借嚜鍔ㄥ垏鎹?month id锛屽叾浣欐ā寮忔部鐢ㄥ綋鍓嶉€変腑鐨勬椿鍔ㄧ紪鍙枫€?
  // challenge 鐨?song 妯″紡鎺ュ彛浼氫竴娆¤繑鍥炲綋鍓嶆椿鍔ㄨ妗ｄ綅涓嬬殑鍏ㄩ儴 song_id 鍒嗙粍锛?
  // 鏅€氭椿鍔ㄥ垯浠嶈繑鍥炲崟鏉℃椂闂村簭鍒椼€傚墠绔紦瀛橀敭涓嶅尯鍒?selectedSongId锛?
  // 閬垮厤鍚屼竴鎵?challenge 鏁版嵁閲嶅缂撳瓨澶氫唤銆?
  const monthlyWindow = getMonthlyRankingWindow();
  const targetEventParam = trackingMode === "monthly" ? monthlyWindow.monthId : resolvedCurrentEventId;
  const trackerCacheKey = targetEventParam !== null
    ? `tracker-3-${targetEventParam}-${trackingMode}-${selectedTier}`
    : null;

  /**
    * 杩借釜鏁版嵁鐨勫悎骞剁瓥鐣?鈥斺€?闃叉鎺ュ彛闈欓粯鍒锋柊瑕嗙洊瀹炴椂鎺ㄩ€佸凡杩藉姞鐨勬柊鏁版嵁銆?
   *
    * 绔炴€佸満鏅細鐢ㄦ埛鍒囧洖鍓嶅彴鍚庯紝`useCachedFetch` 瑙﹀彂鎺ュ彛闈欓粯鍒锋柊锛?
    * 璇锋眰灏氭湭杩斿洖鏃讹紝瀹炴椂鎺ㄩ€佸凡缁忓啓鍏ヤ簡鏇存柊鐨勬暟鎹偣銆傝嫢鐩存帴鐢ㄦ帴鍙ｇ粨鏋滆鐩栫紦瀛橈紝
    * 鍥捐〃浼氫涪澶辫繖娈靛閲忓苟鍑虹幇鍥為€€銆?
   *
    * 鍚堝苟閫昏緫锛氫互鎺ュ彛杩斿洖鐨勫畬鏁寸粨鏋滀负鍩哄噯锛?
    * 鍐嶈ˉ鍏ョ紦瀛樹腑鏃堕棿鎴虫櫄浜庢帴鍙ｆ渶鏂扮偣鐨勬暟鎹紝涔熷氨鏄疄鏃舵帹閫佹湡闂磋拷鍔犵殑澧為噺锛?
   * 纭繚涓や釜鏁版嵁婧愮殑缁撴灉閮戒笉浼氫涪澶便€?
   */
  const trackerMerge = useCallback(
    (incoming: TrackerResult, existing: TrackerResult): TrackerResult => {
      const mergedSongGroups = mergeTrackerSongGroups(incoming.songGroups ?? [], existing.songGroups ?? []);
      return {
        cutoffs: mergedSongGroups.length > 0
          ? mergedSongGroups[0].cutoffs
          : mergeTrackerCutoffs(incoming.cutoffs, existing.cutoffs),
        result: incoming.result || existing.result,
        songGroups: mergedSongGroups.length > 0 ? mergedSongGroups : undefined,
      };
    },
    []
  );

  const { data: trackerResult, loading } = useCachedFetch<TrackerResult>(
    trackerCacheKey,
    targetEventParam !== null
      ? `/api/bandori/tracker/data?server=3&event=${targetEventParam}&type=${trackingMode}&tier=${selectedTier}`
      : null,
    (data: unknown) => {
      const payload = data as { cutoffs?: unknown; result?: boolean } | null;
      const parsedSongResult = trackingMode === "song"
        ? parseSongCutoffsPayload(payload?.cutoffs, resolvedSelectedSongId)
        : undefined;

      return {
        cutoffs: trackingMode === "song"
          ? parsedSongResult?.cutoffs ?? []
          : Array.isArray(payload?.cutoffs)
            ? payload.cutoffs.map((point) => parseTrackerPoint(point))
            : [],
        result: payload?.result || false,
        songGroups: parsedSongResult?.songGroups,
      };
    },
    {
      merge: trackerMerge,
      ...(REALTIME_HOT_CACHE_PROFILE.client ?? {}),
    }
  );

  // 璁㈤槄鍦ㄧ粍浠剁敓鍛藉懆鏈熷唴鍙缓绔嬩竴娆★紝鍥犳閫氳繃 ref 缁存寔鏈€鏂拌鍥惧弬鏁帮紝
  // 浠ヤ究瀹炴椂鍥炶皟鑳藉鍑嗙‘鍒ゆ柇鎺ㄩ€佹暟鎹槸鍚﹀睘浜庡綋鍓嶉〉闈㈣鍥俱€?
  const currentViewRef = useRef({ targetEventId: targetEventParam, mode: trackingMode, tier: selectedTier, songId: resolvedSelectedSongId });
  useEffect(() => {
    currentViewRef.current = { targetEventId: targetEventParam, mode: trackingMode, tier: selectedTier, songId: resolvedSelectedSongId };
  }, [resolvedSelectedSongId, selectedTier, targetEventParam, trackingMode]);

  const liveCutoffsForView = trackerCacheKey ? liveCutoffsByKey[trackerCacheKey] : undefined;
  const liveSongGroupsForView = trackerCacheKey ? liveSongGroupsByKey[trackerCacheKey] : undefined;
  const mergedSongGroupsForView = useMemo(
    () => mergeTrackerSongGroups(liveSongGroupsForView ?? [], trackerResult?.songGroups ?? []),
    [liveSongGroupsForView, trackerResult?.songGroups],
  );
  const mergedCutoffsForView = useMemo(
    () => mergeTrackerCutoffs(liveCutoffsForView ?? [], trackerResult?.cutoffs ?? []),
    [liveCutoffsForView, trackerResult?.cutoffs],
  );
  const mergedTrackerStateRef = useRef<{
    cacheKey: string | null;
    cutoffs: TrackerData[];
    songGroups: TrackerSongGroup[];
  }>({
    cacheKey: null,
    cutoffs: [],
    songGroups: [],
  });

  useEffect(() => {
    mergedTrackerStateRef.current = {
      cacheKey: trackerCacheKey,
      cutoffs: mergedCutoffsForView,
      songGroups: mergedSongGroupsForView,
    };
  }, [mergedCutoffsForView, mergedSongGroupsForView, trackerCacheKey]);

  // ===== Supabase 瀹炴椂璁㈤槄锛氱洃鍚柊杩借釜鏁版嵁鎻掑叆 =====
  useEffect(() => {
    const channel = supabase
      .channel("bandori_tracker_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: BANDORI_TRACKER_DATA_TABLE },
        (payload) => {
          const newRow = payload.new;
          if (!newRow) return;

          const view = currentViewRef.current;

          // 浠呭綋鏂版暟鎹尮閰嶅綋鍓嶅浘琛ㄨ鍥撅紙娲诲姩+妯″紡+鎺掑悕锛夋椂鎵嶈拷鍔?
          if (
            newRow.event_id === view.targetEventId &&
            newRow.type === view.mode &&
            newRow.tier === view.tier
          ) {
            const time = Number(newRow.time);
            const ep = Number(newRow.ep);
            const incomingSongId = Number(newRow.song_id ?? 0);
            const incomingIsFinal = Boolean(newRow.is_final ?? false);

            if (view.mode === "song") {
              // song 妯″紡缁存姢瀹屾暣 songGroups锛屽浘琛ㄥ綋鍓嶆洸鐩彧鏄湪鏈湴鍋氭姇褰变笌鍒囨崲锛?
              // 涓嶉渶瑕佷负姣忎釜 song_id 鍗曠嫭寤轰竴鏉″疄鏃惰闃呴摼璺€?
              const cacheKey = `tracker-3-${view.targetEventId}-${view.mode}-${view.tier}`;

              setLiveSongGroupsByKey((prev) => {
                const baseSongGroups = mergeTrackerSongGroups(
                  prev[cacheKey] ?? [],
                  mergedTrackerStateRef.current.cacheKey === cacheKey
                    ? mergedTrackerStateRef.current.songGroups
                    : [],
                );

                return {
                  ...prev,
                  [cacheKey]: upsertSongGroupPoint(baseSongGroups, incomingSongId, time, ep, incomingIsFinal),
                };
              });
              setLiveHasResultByKey((prev) => ({ ...prev, [cacheKey]: true }));

              if (view.targetEventId !== null) {
                updateFetchCache<TrackerResult>(cacheKey, (cached) => {
                  const nextSongGroups = upsertSongGroupPoint(cached?.songGroups ?? [], incomingSongId, time, ep, incomingIsFinal);
                  return {
                    result: true,
                    cutoffs: nextSongGroups[0]?.cutoffs ?? [],
                    songGroups: nextSongGroups,
                  };
                });
              }

              return;
            }

            const cacheKey = `tracker-3-${view.targetEventId}-${view.mode}-${view.tier}`;
            setLiveCutoffsByKey((prev) => {
              const baseCutoffs = mergeTrackerCutoffs(
                prev[cacheKey] ?? [],
                mergedTrackerStateRef.current.cacheKey === cacheKey
                  ? mergedTrackerStateRef.current.cutoffs
                  : [],
              );

              return {
                ...prev,
                // 涓㈠純鏃堕棿鎴充笉閫掑鐨勬暟鎹紝閬垮厤涔卞簭鎻掑叆瀵艰嚧鎶樼嚎鍥剧粯鍒舵壄鏇?
                [cacheKey]: appendTrackerPoint(baseCutoffs, time, ep, incomingIsFinal),
              };
            });
            setLiveHasResultByKey((prev) => ({ ...prev, [cacheKey]: true }));

            // 瀹炴椂鎺ㄩ€佷笉浠呰鏇存柊缁勪欢鐘舵€侊紝涔熻鍚屾鍐欏洖缂撳瓨锛?
            // 鍚﹀垯鐢ㄦ埛鍒囨崲瑙嗗浘鍐嶈繑鍥炴椂浠嶄細璇诲埌鏃х紦瀛橈紝瀵艰嚧澧為噺鏁版嵁涓㈠け銆?
            if (view.targetEventId !== null) {
              updateFetchCache<TrackerResult>(cacheKey, (cached) => {
                const prevCutoffs = cached?.cutoffs ?? [];
                return {
                  result: true,
                  cutoffs: appendTrackerPoint(prevCutoffs, time, ep, incomingIsFinal),
                };
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const chartData = useMemo(() => {
    if (trackingMode === "song" && mergedSongGroupsForView.length > 0) {
      return selectSongCutoffs(mergedSongGroupsForView, resolvedSelectedSongId);
    }

    return mergedCutoffsForView;
  }, [mergedCutoffsForView, mergedSongGroupsForView, resolvedSelectedSongId, trackingMode]);

  const apiHasResult = useMemo(() => {
    const liveHasResult = trackerCacheKey !== null ? liveHasResultByKey[trackerCacheKey] : undefined;

    if (trackingMode === "song" && mergedSongGroupsForView.length > 0) {
      return mergedSongGroupsForView.some((group) => group.cutoffs.length > 0);
    }

    return Boolean(liveHasResult || trackerResult?.result);
  }, [liveHasResultByKey, mergedSongGroupsForView, trackerCacheKey, trackerResult?.result, trackingMode]);

  const resolvedCurrentEventWindow = useMemo(() => {
    if (resolvedCurrentEventId === null) {
      return { startDate: null, endDate: null };
    }

    const currentWindow = eventMeta ? resolveBandoriCnScheduleWindow(eventMeta) : null;

    return {
      startDate: currentWindow?.startAt ?? null,
      endDate: currentWindow?.endAt ?? null,
    };
  }, [eventMeta, resolvedCurrentEventId]);

  return {
    allEvents,
    currentEventId: resolvedCurrentEventId,
    recommendedEventId,
    eventMeta,
    selectedSongId: resolvedSelectedSongId,
    startDate: resolvedCurrentEventWindow.startDate,
    endDate: resolvedCurrentEventWindow.endDate,
    chartData,
    holidayData,
    loading,
    apiHasResult,
  };
}
