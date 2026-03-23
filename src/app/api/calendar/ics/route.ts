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
        // 使用官方时间戳（转为日期）
        startDate = timestampToDateStr(ev.cn_start_at);
        endDate = timestampToDateStr(ev.cn_end_at, true); // ICS 全天事件结束日为排他日（+1天）
      } else if (ev.predicted_start && ev.predicted_end) {
        // 使用预测日期
        startDate = ev.predicted_start.replace(/-/g, "");
        // ICS 全天事件的 DTEND 为排他日期，需要 +1 天
        const endObj = new Date(ev.predicted_end + "T00:00:00+08:00");
        endObj.setDate(endObj.getDate() + 1);
        endDate = formatDateOnly(endObj);
      }

      if (!startDate || !endDate) continue;

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
        `DTEND;VALUE=DATE:${endDate}`,
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

/** 将毫秒时间戳转换为 ICS DATE 格式（YYYYMMDD），可选 +1 天（排他结束日） */
function timestampToDateStr(ms: number, addOneDay = false): string {
  const shanghaiDateText = formatShanghaiDateText(ms);

  if (!addOneDay) {
    return shanghaiDateText.replace(/-/g, "");
  }

  const d = new Date(`${shanghaiDateText}T00:00:00+08:00`);
  d.setDate(d.getDate() + 1);
  return formatDateOnly(d);
}

function formatShanghaiDateText(ms: number): string {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date(ms));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`无法将时间戳 ${ms} 转换为上海时区日期`);
  }

  return `${year}-${month}-${day}`;
}

/** 格式化日期为 YYYYMMDD */
function formatDateOnly(d: Date): string {
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
