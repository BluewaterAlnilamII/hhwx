const UTC8_OFFSET_MINUTES = 8 * 60;
const MILLISECONDS_PER_DAY = 86400000;

/** 将毫秒时间戳映射到 UTC+8 日期键。 */
function formatDateKeyInUtc8(timestamp: number): string {
  const utc8Date = new Date(timestamp + UTC8_OFFSET_MINUTES * 60 * 1000);
  const year = utc8Date.getUTCFullYear();
  const month = String(utc8Date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc8Date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 基于 UTC+8 日期键计算星期编号，0 表示周日，6 表示周六。 */
function getUtc8Weekday(dateKey: string): number {
  const [yearText, monthText, dayText] = dateKey.split("-");
  return new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))).getUTCDay();
}

/** 按年份维护的法定休息日区间，格式为“开始日期:结束日期”。 */
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

/** 按年份维护的调休上班日期。 */
const MAKEUP_WORK_DAYS: Record<number, string[]> = {
  2024: ["2024-02-04", "2024-02-18", "2024-04-07", "2024-04-28", "2024-05-11", "2024-09-14", "2024-09-29", "2024-10-12"],
  2025: ["2025-01-26", "2025-02-08", "2025-04-27", "2025-09-28", "2025-10-11"],
  2026: ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"],
};

/** 中国大陆节假日数据源的统一结构。 */
export interface ChinaMainlandHolidayCalendarData {
  /** 法定休息日列表，格式为 YYYY-MM-DD。 */
  restDays: string[];
  /** 调休上班日列表，格式为 YYYY-MM-DD。 */
  makeupWorkDays: string[];
  /** 当前数据来源。 */
  source?: "icloud" | "fallback";
}

/** 便于高频查询的节假日集合结构。 */
export interface ChinaMainlandHolidayLookup {
  /** 法定休息日集合。 */
  restDays: Set<string>;
  /** 调休上班日集合。 */
  makeupWorkDays: Set<string>;
}

/** 将日期对象格式化为 UTC+8 下的 YYYY-MM-DD 键值。 */
function formatDateKey(date: Date): string {
  return formatDateKeyInUtc8(date.getTime());
}

/** 枚举闭区间内的所有日期键，用于将区间配置展开成逐日集合。 */
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

/** 将按年份定义的休息日区间展开为集合，降低运行期查询成本。 */
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

/** 将数组结构的节假日数据转换为查询集合。 */
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

/** 返回内置的本地节假日回退数据，供远程数据不可用时使用。 */
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
 * 判断某个日期是否为中国大陆的非工作日。
 *
 * 判定顺序：
 * 1. 若存在远程节假日查询表，则优先使用远程结果；
 * 2. 调休上班日优先级高于周末；
 * 3. 若无显式配置，再按周六、周日视为休息日。
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