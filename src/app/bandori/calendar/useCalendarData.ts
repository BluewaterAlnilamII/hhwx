"use client";

import { useState, useEffect, useCallback } from "react";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { getSafeSession, supabase } from "@/lib/supabase";
import { ChinaMainlandHolidayCalendarData } from "./chinaMainlandHolidayCalendar";
import {
  CalendarCharacter,
  formatCalendarEventTitle,
  getCalendarEventColors,
} from "@/lib/calendar-character-service";

export { BAND_COLORS } from "@/lib/calendar-character-service";

export interface BandoriEventSummary {
  eventId: number;
  eventType: string;
  name: {
    jp: string;
    cn: string | null;
  };
  asset: {
    bundleName: string;
    bannerBundleName: string | null;
  };
  band: string;
  stampCharacterId: number | null;
  timeline: {
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
  musicIds: {
    jp: number[];
    cn: number[];
  };
}

export interface BandoriScheduleSupplement {
  eventId: number;
  predictedStart: string | null;
  predictedEnd: string | null;
  durationDays: number;
  hasRestDay: boolean;
  sortOrder: number;
}

export interface GbpEvent {
  eventId: number;
  eventNameJp: string;
  eventNameCn: string | null;
  band: string;
  stampCharacterId: number | null;
  cnStartAt: number | null;
  cnEndAt: number | null;
  predictedStart: string | null;
  predictedEnd: string | null;
  durationDays: number;
  hasRestDay: boolean;
  sortOrder: number;
  hasScheduleSupplement: boolean;
}

/** 日历上用于渲染的活动显示信息 */
export interface CalendarEvent {
  eventId: number;
  name: string;
  band: string;
  startDate: Date;
  endDate: Date;
  primaryColor: string;
  secondaryColor: string | null;
}

export type CalendarHolidayData = ChinaMainlandHolidayCalendarData;

function timestampToChinaDateText(timestamp: number) {
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function calculateInclusiveDurationDays(startText: string, endText: string) {
  const start = new Date(startText + "T00:00:00+08:00").getTime();
  const end = new Date(endText + "T00:00:00+08:00").getTime();
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function mergeCalendarEvent(event: BandoriEventSummary, schedule: BandoriScheduleSupplement | undefined): GbpEvent {
  const fallbackPredictedStart = event.timeline.cnSchedule ? timestampToChinaDateText(event.timeline.cnSchedule.startAt) : null;
  const fallbackPredictedEnd = event.timeline.cnSchedule ? timestampToChinaDateText(event.timeline.cnSchedule.endAt) : null;
  const predictedStart = schedule?.predictedStart ?? fallbackPredictedStart;
  const predictedEnd = schedule?.predictedEnd ?? fallbackPredictedEnd;

  return {
    eventId: event.eventId,
    eventNameJp: event.name.jp,
    eventNameCn: event.name.cn,
    band: event.band,
    stampCharacterId: event.stampCharacterId,
    cnStartAt: event.timeline.cn.startAt,
    cnEndAt: event.timeline.cn.endAt,
    predictedStart,
    predictedEnd,
    durationDays:
      schedule?.durationDays
      ?? (predictedStart && predictedEnd ? calculateInclusiveDurationDays(predictedStart, predictedEnd) : 7),
    hasRestDay: schedule?.hasRestDay ?? true,
    sortOrder: schedule?.sortOrder ?? event.eventId,
    hasScheduleSupplement: Boolean(schedule || event.timeline.cnSchedule),
  };
}

/** 将活动目录与未来排期补充层合并为日历显示用事件。 */
function toCalendarEvent(event: GbpEvent, characterMap: Map<number, CalendarCharacter>): CalendarEvent | null {
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (event.cnStartAt && event.cnEndAt) {
    startDate = new Date(event.cnStartAt);
    endDate = new Date(event.cnEndAt);
  } else if (event.predictedStart && event.predictedEnd) {
    startDate = new Date(event.predictedStart + "T00:00:00+08:00");
    endDate = new Date(event.predictedEnd + "T23:59:59+08:00");
  }

  if (!startDate || !endDate) {
    return null;
  }

  const stampCharacter = event.stampCharacterId ? characterMap.get(event.stampCharacterId) ?? null : null;
  const colors = getCalendarEventColors(event.band, stampCharacter);

  return {
    eventId: event.eventId,
    name: formatCalendarEventTitle(
      event.band,
      event.eventId,
      event.eventNameCn || event.eventNameJp || `活动 #${event.eventId}`,
      stampCharacter,
    ),
    band: event.band,
    startDate,
    endDate,
    primaryColor: colors.primaryColor,
    secondaryColor: colors.secondaryColor,
  };
}

/** 过滤出在指定月份内有重叠的活动 */
export function filterEventsForMonth(events: CalendarEvent[], year: number, month: number): CalendarEvent[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
  return events.filter((event) => event.startDate <= monthEnd && event.endDate >= monthStart);
}

export function useCalendarData() {
  const { data: eventCatalogData, loading: eventCatalogLoading, refresh: refreshEventCatalog } = useCachedFetch<{ events: BandoriEventSummary[] }>(
    "bandori-events-v2",
    "/api/bandori/events",
    (raw) => raw as { events: BandoriEventSummary[] },
    { staleTimeMs: 5 * 60 * 1000 },
  );
  const { data: scheduleData, loading: scheduleLoading, refresh: refreshSchedule } = useCachedFetch<{ events: BandoriScheduleSupplement[] }>(
    "bandori-calendar-cn-schedule-v2",
    "/api/bandori/calendar/cn/schedule",
    (raw) => raw as { events: BandoriScheduleSupplement[] },
    { staleTimeMs: 5 * 60 * 1000 },
  );
  const { data: characterData, loading: characterLoading, refresh: refreshCharacters } = useCachedFetch<{ characters: CalendarCharacter[] }>(
    "bandori-characters-v2",
    "/api/bandori/characters",
    (raw) => raw as { characters: CalendarCharacter[] },
    { refreshOnVisible: false, staleTimeMs: 12 * 60 * 60 * 1000 },
  );
  const { data: holidayData, loading: holidayLoading, refresh: refreshHolidayData } = useCachedFetch<CalendarHolidayData>(
    "bandori-calendar-cn-holidays",
    "/api/bandori/calendar/cn/holidays",
    (raw) => raw as CalendarHolidayData,
    { refreshOnVisible: false, staleTimeMs: 12 * 60 * 60 * 1000 },
  );

  const scheduleMap = new Map((scheduleData?.events ?? []).map((event) => [event.eventId, event]));
  const allEvents = (eventCatalogData?.events ?? []).map((event) => mergeCalendarEvent(event, scheduleMap.get(event.eventId)));
  const allCharacters = characterData?.characters ?? [];
  const characterMap = new Map(allCharacters.map((character) => [character.characterId, character]));

  const calendarEvents: CalendarEvent[] = allEvents
    .map((event) => toCalendarEvent(event, characterMap))
    .filter((event): event is CalendarEvent => event !== null);

  const refresh = useCallback(() => {
    refreshEventCatalog();
    refreshSchedule();
    refreshCharacters();
    refreshHolidayData();
  }, [refreshCharacters, refreshEventCatalog, refreshHolidayData, refreshSchedule]);

  return {
    allEvents,
    allCharacters,
    calendarEvents,
    holidayData,
    loading: eventCatalogLoading || scheduleLoading || characterLoading || holidayLoading,
    refresh,
  };
}

export function useCalendarPermission() {
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const checkPermission = async () => {
      const session = await getSafeSession();
      if (!session?.user) {
        setHasPermission(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "calendar_editor")
        .maybeSingle();

      if (!error) {
        setHasPermission(!!data);
        return;
      }

      setHasPermission(false);
    };

    void checkPermission();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void checkPermission();
    });

    return () => subscription.unsubscribe();
  }, []);

  return hasPermission;
}

export function useCalendarEditor(onSuccess: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveEvents = useCallback(async (events: Array<{
    eventId: number;
    predictedStart: string | null;
    predictedEnd: string | null;
    durationDays: number;
    hasRestDay: boolean;
    sortOrder: number;
  }>) => {
    setSaving(true);
    setError(null);

    try {
      const session = await getSafeSession();
      if (!session?.access_token) {
        setError("请先登录");
        return false;
      }

      const response = await fetch("/api/bandori/calendar/cn/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ events }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = [json.error, json.details].filter(Boolean).join("：");
        setError(message || `保存失败（HTTP ${response.status}）`);
        return false;
      }

      onSuccess();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "网络错误");
      return false;
    } finally {
      setSaving(false);
    }
  }, [onSuccess]);

  return { saveEvents, saving, error };
}
