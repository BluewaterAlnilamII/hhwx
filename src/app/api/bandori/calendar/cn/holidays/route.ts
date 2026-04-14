import { NextResponse } from "next/server";
import {
  ChinaMainlandHolidayCalendarData,
  getFallbackChinaMainlandHolidayCalendarData,
} from "@/app/bandori/calendar/chinaMainlandHolidayCalendar";
import {
  HOLIDAY_API_CACHE_CONTROL,
  HOLIDAY_FALLBACK_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";

const ICLOUD_HOLIDAY_URL = "https://p10-calendars.icloud.com/holiday/CN_zh.ics";
const WORK_HOLIDAY_TYPE = "WORK-HOLIDAY";
const ALTERNATE_WORKDAY_TYPE = "ALTERNATE-WORKDAY";
const UTC8_OFFSET_MINUTES = 8 * 60;
const MILLISECONDS_PER_DAY = 86400000;

export const dynamic = "force-dynamic";

function unfoldIcsLines(content: string): string[] {
  const rawLines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];

  rawLines.forEach((line) => {
    if (!line) {
      return;
    }

    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
      return;
    }

    lines.push(line);
  });

  return lines;
}

function parseIcsDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{8}$/.test(value)) {
    return null;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+08:00`);
}

function formatDateKeyInUtc8(timestamp: number): string {
  const utc8Date = new Date(timestamp + UTC8_OFFSET_MINUTES * 60 * 1000);
  const year = utc8Date.getUTCFullYear();
  const month = String(utc8Date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc8Date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function enumerateDateRange(startDate: Date, endDateExclusive: Date | null): string[] {
  const values: string[] = [];
  let cursor = startDate.getTime();
  let endInclusive = endDateExclusive ? endDateExclusive.getTime() : startDate.getTime();

  if (endDateExclusive) {
    endInclusive -= MILLISECONDS_PER_DAY;
  }

  while (cursor <= endInclusive) {
    values.push(formatDateKeyInUtc8(cursor));
    cursor += MILLISECONDS_PER_DAY;
  }

  return values;
}

// 这里继续保留 iCloud ICS 解析，而不是把节假日静态写死在数据库里，
// 是因为调休规则每年都可能变更；线上优先拉权威日历，失败时再回退本地兜底数据。
function parseHolidayCalendar(content: string): ChinaMainlandHolidayCalendarData {
  const restDays = new Set<string>();
  const makeupWorkDays = new Set<string>();
  const lines = unfoldIcsLines(content);

  let inEvent = false;
  let specialDayType: string | null = null;
  let dtstart: string | null = null;
  let dtend: string | null = null;

  const flushEvent = () => {
    if (!specialDayType || !dtstart) {
      return;
    }

    const startDate = parseIcsDate(dtstart);
    const endDate = parseIcsDate(dtend);
    if (!startDate) {
      return;
    }

    const targetValues = enumerateDateRange(startDate, endDate);
    if (specialDayType === WORK_HOLIDAY_TYPE) {
      targetValues.forEach((value) => restDays.add(value));
      return;
    }

    if (specialDayType === ALTERNATE_WORKDAY_TYPE) {
      targetValues.forEach((value) => makeupWorkDays.add(value));
    }
  };

  lines.forEach((line) => {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      specialDayType = null;
      dtstart = null;
      dtend = null;
      return;
    }

    if (line === "END:VEVENT") {
      flushEvent();
      inEvent = false;
      return;
    }

    if (!inEvent) {
      return;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      return;
    }

    const rawName = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    const propertyName = rawName.split(";")[0];

    if (propertyName === "X-APPLE-SPECIAL-DAY") {
      specialDayType = value;
      return;
    }

    if (propertyName === "DTSTART") {
      dtstart = value;
      return;
    }

    if (propertyName === "DTEND") {
      dtend = value;
    }
  });

  return {
    restDays: Array.from(restDays).sort(),
    makeupWorkDays: Array.from(makeupWorkDays).sort(),
    source: "icloud",
  };
}

export async function GET() {
  try {
    const response = await fetch(ICLOUD_HOLIDAY_URL, {
      headers: {
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8",
      },
      next: { revalidate: 43200 },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = await response.text();
    const holidayCalendar = parseHolidayCalendar(content);
    return NextResponse.json(holidayCalendar, {
      headers: withCacheControl(HOLIDAY_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori calendar/cn/holidays API 错误:", error);
    return NextResponse.json(getFallbackChinaMainlandHolidayCalendarData(), {
      headers: withCacheControl(HOLIDAY_FALLBACK_API_CACHE_CONTROL),
    });
  }
}