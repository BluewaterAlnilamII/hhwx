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

const MAKEUP_WORK_DAYS: Record<number, string[]> = {
  2024: ["2024-02-04", "2024-02-18", "2024-04-07", "2024-04-28", "2024-05-11", "2024-09-14", "2024-09-29", "2024-10-12"],
  2025: ["2025-01-26", "2025-02-08", "2025-04-27", "2025-09-28", "2025-10-11"],
  2026: ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"],
};

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function enumerateDateRange(startDateText: string, endDateText: string): string[] {
  const values: string[] = [];
  const cursor = new Date(`${startDateText}T00:00:00+08:00`);
  const end = new Date(`${endDateText}T00:00:00+08:00`);

  while (cursor.getTime() <= end.getTime()) {
    values.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return values;
}

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

export function isChinaMainlandRestDay(date: Date): boolean {
  const year = date.getFullYear();
  const dateKey = formatDateKey(date);
  const makeupWorkdays = MAKEUP_WORKDAY_MAP[year];

  if (makeupWorkdays?.has(dateKey)) {
    return false;
  }

  const restDays = REST_DAY_MAP[year];
  if (restDays?.has(dateKey)) {
    return true;
  }

  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}