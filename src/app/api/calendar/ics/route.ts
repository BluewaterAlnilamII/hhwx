import { NextResponse } from "next/server";
import { formatCalendarSubscriptionTitle } from "@/app/bandori/calendar/options";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/ics
 * 生成 iCalendar (.ics) 格式的活动日历。
 * 所有活动以"全天事件"形式记录，不包含小时/分钟信息。
 */
export async function GET(request: Request) {
  try {
    const serviceClient = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const bandQuery = searchParams.get("bands")?.trim() ?? "";
    const selectedBands = new Set(
      bandQuery
        .split(",")
        .map((band) => band.trim())
        .filter(Boolean),
    );

    const { data: events, error } = await serviceClient
      .from("gbp_event")
      .select("event_id, event_name_jp, event_name_cn, band_type, cn_start_at, cn_end_at, predicted_start, predicted_end, is_skipped")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("gbp_event 查询失败:", error);
      return new Response("数据库查询失败", { status: 500 });
    }

    const now = new Date();
    const dtstamp = formatICSDate(now);

    let icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//HHWX//Bandori CN Calendar//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Bandori 国服活动日历",
      "X-WR-TIMEZONE:Asia/Shanghai",
    ];

    for (const ev of events ?? []) {
      if (selectedBands.size > 0 && !selectedBands.has(ev.band_type)) {
        continue;
      }

      // 跳过已提前举办且无官方时间的活动
      if (ev.is_skipped && !ev.cn_start_at) continue;

      // 确定显示用起止日期
      let startDate: string | null = null;
      let endDate: string | null = null;

      if (ev.cn_start_at && ev.cn_end_at) {
        // 为什么这么做：官方时间戳要按“当前运行时区”与 UTC+8 的差值映射到国服自然日，
        // 不能直接硬编码 +8 小时，否则部署时区变化后会继续出现日期偏移。
        startDate = timestampToUtc8DateStr(ev.cn_start_at);
        endDate = timestampToUtc8DateStr(ev.cn_end_at);
      } else if (ev.predicted_start && ev.predicted_end) {
        // 为什么这么做：预测活动本身就是按“国服日期”维护的，
        // 订阅日历直接映射 predicted_start / predicted_end 对应的真实日期即可。
        startDate = predictedDateToDateStr(ev.predicted_start);
        endDate = predictedDateToDateStr(ev.predicted_end);
      }

      if (!startDate || !endDate) continue;

      const durationDays = calculateInclusiveDurationDays(startDate, endDate);
      if (durationDays < 1) continue;

      const summary = formatCalendarSubscriptionTitle(
        ev.band_type,
        ev.event_id,
        ev.event_name_cn || ev.event_name_jp || `活动 #${ev.event_id}`,
      );

      icsContent.push(
        "BEGIN:VEVENT",
        `UID:gbp-event-${ev.event_id}@hhwx`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${startDate}`,
        `DURATION:P${durationDays}D`,
        `SUMMARY:${escapeICSText(summary)}`,
        "END:VEVENT"
      );
    }

    icsContent.push("END:VCALENDAR");

    return new Response(icsContent.join("\r\n"), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="bandori-cn-calendar.ics"',
        // 为什么这么做：允许日历应用程序定期拉取最新内容，不做长时间缓存
        "Cache-Control": "no-cache, max-age=0",
      },
    });
  } catch (error) {
    console.error("ICS API 错误:", error);
    return new Response("服务器内部错误", { status: 500 });
  }
}

/** 将毫秒时间戳按“当前运行时区”与 UTC+8 的差值映射为 ICS DATE 格式（YYYYMMDD） */
function timestampToUtc8DateStr(ms: number): string {
  const sourceDate = new Date(ms);
  const runtimeOffsetMinutes = sourceDate.getTimezoneOffset();
  const utc8OffsetMinutes = -8 * 60;
  const offsetDeltaMinutes = runtimeOffsetMinutes - utc8OffsetMinutes;
  const mappedDate = new Date(ms + offsetDeltaMinutes * 60 * 1000);
  return formatDateOnlyLocal(mappedDate);
}

function predictedDateToDateStr(dateText: string): string {
  return dateText.replace(/-/g, "");
}

function calculateInclusiveDurationDays(startDateText: string, endDateText: string): number {
  const start = parseDateTextAsUtc(startDateText);
  const end = parseDateTextAsUtc(endDateText);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function parseDateTextAsUtc(dateText: string): Date {
  const year = Number(dateText.slice(0, 4));
  const month = Number(dateText.slice(4, 6));
  const day = Number(dateText.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnlyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** 格式化为 ICS DTSTAMP（UTC） */
function formatICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 转义 ICS 文本中的特殊字符 */
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
