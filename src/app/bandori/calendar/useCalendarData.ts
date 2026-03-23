"use client";

import { useState, useEffect, useCallback } from "react";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { supabase } from "@/lib/supabase";
import { formatCalendarEventTitle } from "./options";

// ─── 类型定义 ───

export interface GbpEvent {
  event_id: number;
  event_name_jp: string;
  event_name_cn: string | null;
  band_type: string;
  stamp?: number | null;
  jp_start_at: number;
  jp_end_at: number;
  cn_start_at: number | null;
  cn_end_at: number | null;
  predicted_start: string | null; // "YYYY-MM-DD"
  predicted_end: string | null;
  duration_days: number;
  has_rest_day: boolean;
  sort_order: number;
  is_skipped: boolean;
  updated_at: string;
}

/** 日历上用于渲染的活动显示信息 */
export interface CalendarEvent {
  event_id: number;
  name: string;
  band_type: string;
  startDate: Date;
  endDate: Date;
}

// ─── 乐团颜色映射 ───

export const BAND_COLORS: Record<string, string> = {
  ppp: "#FF6B9D",
  ag: "#FF2D54",
  pp: "#43B5A0",
  roselia: "#7044C4",
  hhw: "#FFBB00",
  morfonica: "#99CCFF",
  ras: "#C41E3A",
  mygo: "#4499EE",
  avemujica: "#8B5CF6",
  mix: "#888888",
};

// ─── 工具函数 ───

/** 将 gbp_event 记录转换为日历显示用的事件 */
function toCalendarEvent(ev: GbpEvent): CalendarEvent | null {
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
  if (ev.is_skipped && !ev.cn_start_at) return null;

  return {
    event_id: ev.event_id,
    name: formatCalendarEventTitle(
      ev.band_type,
      ev.event_id,
      ev.event_name_cn || ev.event_name_jp || `活动 #${ev.event_id}`,
    ),
    band_type: ev.band_type,
    startDate,
    endDate,
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
  const { data: rawData, loading, refresh } = useCachedFetch<{ events: GbpEvent[] }>(
    "calendar-events",
    "/api/calendar/events",
    (raw) => raw as { events: GbpEvent[] }
  );

  const allEvents = rawData?.events ?? [];

  // 转换为日历显示格式
  const calendarEvents: CalendarEvent[] = allEvents
    .map(toCalendarEvent)
    .filter((ev): ev is CalendarEvent => ev !== null);

  return { allEvents, calendarEvents, loading, refresh };
}

// ─── 权限检查 Hook ───

export function useCalendarPermission() {
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const checkPermission = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setHasPermission(false);
        return;
      }

      // 为什么这么做：客户端 supabase 已自动携带当前用户会话，
      // 直接读取权限表即可触发 RLS；这样既能首屏恢复，也能在登录状态变化后立即刷新按钮显示。
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
    stamp?: number | null;
    predicted_start: string | null;
    predicted_end: string | null;
    duration_days: number;
    has_rest_day: boolean;
    sort_order: number;
    is_skipped: boolean;
  }>) => {
    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("请先登录");
        return false;
      }

      const res = await fetch("/api/calendar/events", {
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
