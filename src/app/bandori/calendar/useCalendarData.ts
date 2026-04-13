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

// ─── 类型定义 ───

export interface GbpEvent {
  event_id: number;
  event_name_jp: string;
  event_name_cn: string | null;
  band: string;
  stamp_character_id: number | null;
  cn_start_at: number | null;
  cn_end_at: number | null;
  predicted_start: string | null; // "YYYY-MM-DD"
  predicted_end: string | null;
  duration_days: number;
  has_rest_day: boolean;
  sort_order: number;
}

/** 日历上用于渲染的活动显示信息 */
export interface CalendarEvent {
  event_id: number;
  name: string;
  band: string;
  startDate: Date;
  endDate: Date;
  primaryColor: string;
  secondaryColor: string | null;
}

export type CalendarHolidayData = ChinaMainlandHolidayCalendarData;

// ─── 工具函数 ───

/** 将本地活动目录记录转换为日历显示用的事件 */
function toCalendarEvent(ev: GbpEvent, characterMap: Map<number, CalendarCharacter>): CalendarEvent | null {
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (ev.cn_start_at && ev.cn_end_at) {
    startDate = new Date(ev.cn_start_at);
    endDate = new Date(ev.cn_end_at);
  } else if (ev.predicted_start && ev.predicted_end) {
    startDate = new Date(ev.predicted_start + "T00:00:00+08:00");
    endDate = new Date(ev.predicted_end + "T23:59:59+08:00");
  }

  if (!startDate || !endDate) return null;

  const stampCharacter = ev.stamp_character_id ? characterMap.get(ev.stamp_character_id) ?? null : null;
  const colors = getCalendarEventColors(ev.band, stampCharacter);

  return {
    event_id: ev.event_id,
    name: formatCalendarEventTitle(
      ev.band,
      ev.event_id,
      ev.event_name_cn || ev.event_name_jp || `活动 #${ev.event_id}`,
      stampCharacter,
    ),
    band: ev.band,
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
  return events.filter(ev => ev.startDate <= monthEnd && ev.endDate >= monthStart);
}

// ─── 主 Hook ───

export function useCalendarData() {
  const { data: scheduleData, loading: eventLoading, refresh: refreshEvents } = useCachedFetch<{ events: GbpEvent[] }>(
    "bandori-schedule-cn",
    "/api/bandori/schedule_cn",
    (raw) => raw as { events: GbpEvent[] },
  );
  const { data: characterData, loading: characterLoading, refresh: refreshCharacters } = useCachedFetch<{ characters: CalendarCharacter[] }>(
    "bandori-characters",
    "/api/bandori/characters",
    (raw) => raw as { characters: CalendarCharacter[] },
  );
  const { data: holidayData, loading: holidayLoading, refresh: refreshHolidayData } = useCachedFetch<CalendarHolidayData>(
    "bandori-holiday-days",
    "/api/bandori/holiday-days",
    (raw) => raw as CalendarHolidayData,
  );

  const allEvents = scheduleData?.events ?? [];
  const allCharacters = characterData?.characters ?? [];
  const characterMap = new Map(allCharacters.map((character) => [character.character_id, character]));

  // 转换为日历显示格式
  const calendarEvents: CalendarEvent[] = allEvents
    .map((event) => toCalendarEvent(event, characterMap))
    .filter((ev): ev is CalendarEvent => ev !== null);

  const refresh = useCallback(() => {
    refreshEvents();
    refreshCharacters();
    refreshHolidayData();
  }, [refreshCharacters, refreshEvents, refreshHolidayData]);

  return {
    allEvents,
    allCharacters,
    calendarEvents,
    holidayData,
    loading: eventLoading || characterLoading || holidayLoading,
    refresh,
  };
}

// ─── 权限检查 Hook ───

export function useCalendarPermission() {
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const checkPermission = async () => {
      const session = await getSafeSession();
      if (!session?.user) {
        setHasPermission(false);
        return;
      }

      // 客户端 supabase 会自动携带当前用户会话，
      // 直接读取权限表即可触发 RLS，并在登录态变化后同步刷新按钮显示。
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

// ─── 编辑提交 Hook ───

export function useCalendarEditor(onSuccess: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveEvents = useCallback(async (events: Array<{
    event_id: number;
    predicted_start: string | null;
    predicted_end: string | null;
    duration_days: number;
    has_rest_day: boolean;
    sort_order: number;
  }>) => {
    setSaving(true);
    setError(null);

    try {
      const session = await getSafeSession();
      if (!session?.access_token) {
        setError("请先登录");
        return false;
      }

      const res = await fetch("/api/bandori/schedule_cn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ events }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = [json.error, json.details].filter(Boolean).join("：");
        setError(message || `保存失败（HTTP ${res.status}）`);
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
