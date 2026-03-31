import { NextResponse } from "next/server";
import {
  ChinaMainlandHolidayCalendarData,
  getFallbackChinaMainlandHolidayCalendarData,
} from "@/app/bandori/calendar/chinaMainlandHolidayCalendar";

const ICLOUD_HOLIDAY_URL = "https://p10-calendars.icloud.com/holiday/CN_zh.ics";
const WORK_HOLIDAY_TYPE = "WORK-HOLIDAY";
const ALTERNATE_WORKDAY_TYPE = "ALTERNATE-WORKDAY";

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

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function enumerateDateRange(startDate: Date, endDateExclusive: Date | null): string[] {
  const values: string[] = [];
  const cursor = new Date(startDate);
  const endInclusive = endDateExclusive ? new Date(endDateExclusive) : new Date(startDate);

  if (endDateExclusive) {
    endInclusive.setDate(endInclusive.getDate() - 1);
  }

  while (cursor.getTime() <= endInclusive.getTime()) {
    values.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return values;
}

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
      headers: {
        "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("holiday-days API 错误:", error);
    return NextResponse.json(getFallbackChinaMainlandHolidayCalendarData(), {
      headers: {
        "Cache-Control": "no-cache, max-age=0",
      },
    });
  }
}