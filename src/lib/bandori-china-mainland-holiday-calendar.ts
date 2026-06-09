const UTC8_OFFSET_MINUTES = 8 * 60;
const MILLISECONDS_PER_DAY = 86400000;

/** Maps a millisecond timestamp to a UTC+8 date key. */
function formatDateKeyInUtc8(timestamp: number): string {
  const utc8Date = new Date(timestamp + UTC8_OFFSET_MINUTES * 60 * 1000);
  const year = utc8Date.getUTCFullYear();
  const month = String(utc8Date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc8Date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Calculates the weekday from a UTC+8 date key; Sunday is 0 and Saturday is 6. */
function getUtc8Weekday(dateKey: string): number {
  const [yearText, monthText, dayText] = dateKey.split("-");
  return new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))).getUTCDay();
}

/** Statutory rest-day ranges by year, stored as inclusive start:end date pairs. */
const REST_DAY_RANGES: Record<number, string[]> = {
  2024: [
    "2024-01-01:2024-01-01",
    "2024-02-10:2024-02-17",
    "2024-04-04:2024-04-06",
    "2024-05-01:2024-05-05",
    "2024-06-08:2024-06-10",
    "2024-09-15:2024-09-17",
    "2024-10-01:2024-10-07",
  ],
  2025: [
    "2025-01-01:2025-01-01",
    "2025-01-28:2025-02-04",
    "2025-04-04:2025-04-06",
    "2025-05-01:2025-05-05",
    "2025-05-31:2025-06-02",
    "2025-10-01:2025-10-08",
  ],
  2026: [
    "2026-01-01:2026-01-03",
    "2026-02-15:2026-02-23",
    "2026-04-04:2026-04-06",
    "2026-05-01:2026-05-05",
    "2026-06-19:2026-06-21",
    "2026-09-25:2026-09-27",
    "2026-10-01:2026-10-07",
  ],
};

/** Makeup workdays by year. */
const MAKEUP_WORK_DAYS: Record<number, string[]> = {
  2024: ["2024-02-04", "2024-02-18", "2024-04-07", "2024-04-28", "2024-05-11", "2024-09-14", "2024-09-29", "2024-10-12"],
  2025: ["2025-01-26", "2025-02-08", "2025-04-27", "2025-09-28", "2025-10-11"],
  2026: ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"],
};

/** Shared shape for China mainland holiday calendar data. */
export interface ChinaMainlandHolidayCalendarData {
  /** Statutory rest days in YYYY-MM-DD format. */
  restDays: string[];
  /** Makeup workdays in YYYY-MM-DD format. */
  makeupWorkDays: string[];
  /** Source used for the current payload. */
  source?: "icloud" | "fallback";
}

/** Set-based lookup for high-frequency holiday checks. */
export interface ChinaMainlandHolidayLookup {
  /** Statutory rest days. */
  restDays: Set<string>;
  /** Makeup workdays. */
  makeupWorkDays: Set<string>;
}

/** Formats a date object as a UTC+8 YYYY-MM-DD key. */
function formatDateKey(date: Date): string {
  return formatDateKeyInUtc8(date.getTime());
}

/** Expands an inclusive date range into per-day keys. */
function enumerateDateRange(startDateText: string, endDateText: string): string[] {
  const values: string[] = [];
  let cursor = new Date(`${startDateText}T00:00:00+08:00`).getTime();
  const end = new Date(`${endDateText}T00:00:00+08:00`).getTime();

  while (cursor <= end) {
    values.push(formatDateKeyInUtc8(cursor));
    cursor += MILLISECONDS_PER_DAY;
  }

  return values;
}

/** Expands yearly rest-day ranges to sets for cheaper runtime lookup. */
function buildRestDayMap(): Record<number, Set<string>> {
  const result: Record<number, Set<string>> = {};

  Object.entries(REST_DAY_RANGES).forEach(([yearText, ranges]) => {
    const year = Number(yearText);
    result[year] = new Set<string>();

    ranges.forEach((range) => {
      const [startDateText, endDateText] = range.split(":");
      enumerateDateRange(startDateText, endDateText).forEach((dateText) => {
        result[year].add(dateText);
      });
    });
  });

  return result;
}

const REST_DAY_MAP = buildRestDayMap();
const MAKEUP_WORKDAY_MAP: Record<number, Set<string>> = Object.fromEntries(
  Object.entries(MAKEUP_WORK_DAYS).map(([yearText, dates]) => [Number(yearText), new Set(dates)]),
);

/** Converts array-based holiday data into lookup sets. */
export function buildChinaMainlandHolidayLookup(
  calendarData: ChinaMainlandHolidayCalendarData | null | undefined,
): ChinaMainlandHolidayLookup | null {
  if (!calendarData) {
    return null;
  }

  return {
    restDays: new Set(calendarData.restDays),
    makeupWorkDays: new Set(calendarData.makeupWorkDays),
  };
}

/** Returns the built-in holiday fallback used when the remote calendar is unavailable. */
export function getFallbackChinaMainlandHolidayCalendarData(): ChinaMainlandHolidayCalendarData {
  const restDays = Object.values(REST_DAY_MAP).flatMap((values) => Array.from(values));
  const makeupWorkDays = Object.values(MAKEUP_WORKDAY_MAP).flatMap((values) => Array.from(values));

  return {
    restDays,
    makeupWorkDays,
    source: "fallback",
  };
}

/**
 * Determines whether a date is a non-working day in mainland China.
 *
 * Precedence:
 * 1. Remote holiday lookup wins when available.
 * 2. Makeup workdays override weekends.
 * 3. Otherwise Saturday and Sunday are treated as rest days.
 */
export function isChinaMainlandRestDay(date: Date, holidayLookup?: ChinaMainlandHolidayLookup | null): boolean {
  const dateKey = formatDateKey(date);
  const weekday = getUtc8Weekday(dateKey);

  if (holidayLookup) {
    if (holidayLookup.makeupWorkDays.has(dateKey)) {
      return false;
    }

    if (holidayLookup.restDays.has(dateKey)) {
      return true;
    }

    return weekday === 0 || weekday === 6;
  }

  const year = Number(dateKey.slice(0, 4));
  const makeupWorkdays = MAKEUP_WORKDAY_MAP[year];

  if (makeupWorkdays?.has(dateKey)) {
    return false;
  }

  const restDays = REST_DAY_MAP[year];
  if (restDays?.has(dateKey)) {
    return true;
  }

  return weekday === 0 || weekday === 6;
}
