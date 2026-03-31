"use client";

import { useEffect, useState, useMemo } from "react";
import { CalendarEvent, CalendarHolidayData, filterEventsForMonth } from "./useCalendarData";
import { buildChinaMainlandHolidayLookup, isChinaMainlandRestDay } from "./chinaMainlandHolidayCalendar";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

interface CalendarGridProps {
  events: CalendarEvent[];
  holidayData?: CalendarHolidayData | null;
}

interface CalendarCell {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
}

/** 获取某月有多少天 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** 获取某月第一天是星期几（0=周一，6=周日） */
function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  // 日历以周一开头，因此需要将原生日期中的周日编码转换到最后一列。
  return day === 0 ? 6 : day - 1;
}

/** 判断日期是否是今天 */
function isToday(year: number, month: number, day: number): boolean {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
}

/**
 * 计算活动在日历网格中的位置信息。
 * 返回一组“行段”，每个行段表示一个活动在某一周中的跨度。
 */
interface EventRow {
  event: CalendarEvent;
  /** 在网格中的起始列（0-6） */
  startCol: number;
  /** 跨越的列数 */
  colSpan: number;
  /** 所在的周行索引，0 表示第一周。 */
  weekRow: number;
  /** 在该格子中的纵向层级（用于堆叠） */
  lane: number;
}

interface EventSegment {
  startCol: number;
  colSpan: number;
  isCurrentMonth: boolean;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffInDays(left: Date, right: Date): number {
  const millisecondsPerDay = 86400000;
  return Math.floor((startOfDay(left).getTime() - startOfDay(right).getTime()) / millisecondsPerDay);
}

function compareYearMonth(leftYear: number, leftMonth: number, rightYear: number, rightMonth: number): number {
  if (leftYear !== rightYear) {
    return leftYear - rightYear;
  }

  return leftMonth - rightMonth;
}

function clampYearMonth(
  targetYear: number,
  targetMonth: number,
  minYear: number,
  minMonth: number,
  maxYear: number,
  maxMonth: number,
): [number, number] {
  if (compareYearMonth(targetYear, targetMonth, minYear, minMonth) < 0) {
    return [minYear, minMonth];
  }

  if (compareYearMonth(targetYear, targetMonth, maxYear, maxMonth) > 0) {
    return [maxYear, maxMonth];
  }

  return [targetYear, targetMonth];
}

function buildCalendarCells(year: number, month: number, firstDayOffset: number, totalWeeks: number): CalendarCell[] {
  const monthStart = new Date(year, month, 1);
  const gridStart = addDays(monthStart, -firstDayOffset);

  return Array.from({ length: totalWeeks * 7 }, (_, index) => {
    const date = addDays(gridStart, index);

    return {
      date,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getFullYear() === year && date.getMonth() === month,
    };
  });
}

function buildEventSegments(row: EventRow, weekCells: CalendarCell[]): EventSegment[] {
  const segments: EventSegment[] = [];
  let currentSegment: EventSegment | null = null;

  for (let offset = 0; offset < row.colSpan; offset += 1) {
    const currentCol = row.startCol + offset;
    const isCurrentMonth = weekCells[currentCol]?.isCurrentMonth ?? true;

    if (!currentSegment || currentSegment.isCurrentMonth !== isCurrentMonth) {
      currentSegment = {
        startCol: currentCol,
        colSpan: 1,
        isCurrentMonth,
      };
      segments.push(currentSegment);
      continue;
    }

    currentSegment.colSpan += 1;
  }

  return segments;
}

function getOuterSegmentRadiusStyle(segments: EventSegment[], segmentIndex: number) {
  const previousSegment = segments[segmentIndex - 1] ?? null;
  const nextSegment = segments[segmentIndex + 1] ?? null;

  return {
    borderTopLeftRadius: previousSegment ? "0px" : "12px",
    borderBottomLeftRadius: previousSegment ? "0px" : "12px",
    borderTopRightRadius: nextSegment ? "0px" : "12px",
    borderBottomRightRadius: nextSegment ? "0px" : "12px",
  };
}

function getFirstCurrentMonthStartCol(segments: EventSegment[], fallbackStartCol: number): number {
  const firstCurrentMonthSegment = segments.find((segment) => segment.isCurrentMonth);
  return firstCurrentMonthSegment?.startCol ?? fallbackStartCol;
}

function computeEventRows(
  events: CalendarEvent[],
  gridStart: Date,
  gridEnd: Date,
  totalWeeks: number,
): EventRow[] {
  const visibleGridStart = startOfDay(gridStart);
  const visibleGridEnd = endOfDay(gridEnd);

  // 先按周拆分活动条，可以让跨周活动在月视图中按周行稳定布局，
  // 避免后续渲染阶段再做复杂切片。
  const rows: EventRow[] = [];

  for (const ev of events) {
    // 活动在当前月视图完整网格中的实际可见范围。
    const visStart = ev.startDate < visibleGridStart ? visibleGridStart : ev.startDate;
    const visEnd = ev.endDate > visibleGridEnd ? visibleGridEnd : ev.endDate;

    const startIndex = diffInDays(visStart, visibleGridStart);
    const endIndex = diffInDays(visEnd, visibleGridStart);

    // 采用整个月视图的格子索引切分活动条，
    // 可以规避首周偏移带来的负区间、重复区间和首段截断问题。
    let segmentStartIndex = startIndex;
    while (segmentStartIndex <= endIndex) {
      const week = Math.floor(segmentStartIndex / 7);
      const weekEndIndex = week * 7 + 6;
      const segmentEndIndex = Math.min(endIndex, weekEndIndex);

      rows.push({
        event: ev,
        startCol: segmentStartIndex % 7,
        colSpan: segmentEndIndex - segmentStartIndex + 1,
        weekRow: week,
        lane: 0,
      });

      segmentStartIndex = segmentEndIndex + 1;
    }
  }

  // 同一周内可能存在时间重叠的活动，需要为它们分配不同的纵向层级。
  for (let week = 0; week < totalWeeks; week++) {
    const weekRows = rows.filter(r => r.weekRow === week);
    // 先按起始列排序，再用贪心策略分配纵向层级。
    weekRows.sort((a, b) => a.startCol - b.startCol);

    const laneEnds: number[] = []; // 记录每个纵向层级当前占用到的结束列。
    for (const row of weekRows) {
      let assigned = false;
      for (let l = 0; l < laneEnds.length; l++) {
        if (laneEnds[l] < row.startCol) {
          row.lane = l;
          laneEnds[l] = row.startCol + row.colSpan - 1;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        row.lane = laneEnds.length;
        laneEnds.push(row.startCol + row.colSpan - 1);
      }
    }
  }

  return rows;
}

export default function CalendarGrid({ events, holidayData }: CalendarGridProps) {
  const now = new Date();
  const monthBounds = useMemo(() => {
    if (events.length === 0) {
      return null;
    }

    let earliestStart = events[0].startDate;
    let latestEnd = events[0].endDate;

    events.forEach((event) => {
      if (event.startDate.getTime() < earliestStart.getTime()) {
        earliestStart = event.startDate;
      }

      if (event.endDate.getTime() > latestEnd.getTime()) {
        latestEnd = event.endDate;
      }
    });

    return {
      minYear: earliestStart.getFullYear(),
      minMonth: earliestStart.getMonth(),
      maxYear: latestEnd.getFullYear(),
      maxMonth: latestEnd.getMonth(),
    };
  }, [events]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 月份沿用原生日期对象的 0 到 11 编码。

  useEffect(() => {
    if (!monthBounds) {
      return;
    }

    const [nextYear, nextMonth] = clampYearMonth(
      year,
      month,
      monthBounds.minYear,
      monthBounds.minMonth,
      monthBounds.maxYear,
      monthBounds.maxMonth,
    );

    if (nextYear !== year) {
      setYear(nextYear);
    }

    if (nextMonth !== month) {
      setMonth(nextMonth);
    }
  }, [month, monthBounds, year]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOffset = getFirstDayOfWeek(year, month);
  const totalWeeks = Math.ceil((firstDayOffset + daysInMonth) / 7);
  const calendarCells = useMemo(
    () => buildCalendarCells(year, month, firstDayOffset, totalWeeks),
    [year, month, firstDayOffset, totalWeeks],
  );
  const gridStartDate = calendarCells[0]?.date ?? new Date(year, month, 1);
  const gridEndDate = calendarCells[calendarCells.length - 1]?.date ?? new Date(year, month, daysInMonth);
  const holidayLookup = useMemo(() => buildChinaMainlandHolidayLookup(holidayData), [holidayData]);

  const monthEvents = useMemo(
    () => filterEventsForMonth(events, year, month),
    [events, year, month]
  );

  const eventRows = useMemo(
    () => computeEventRows(monthEvents, gridStartDate, gridEndDate, totalWeeks),
    [monthEvents, gridStartDate, gridEndDate, totalWeeks]
  );

  const eventRowsByWeek = useMemo(() => {
    const grouped: Record<number, EventRow[]> = {};

    for (const row of eventRows) {
      if (!grouped[row.weekRow]) {
        grouped[row.weekRow] = [];
      }

      grouped[row.weekRow].push(row);
    }

    return grouped;
  }, [eventRows]);

  // 统计每周需要的最大纵向层级，用于推导单元格高度。
  const maxLanesPerWeek = useMemo(() => {
    const map: Record<number, number> = {};
    for (const row of eventRows) {
      map[row.weekRow] = Math.max(map[row.weekRow] ?? 0, row.lane + 1);
    }
    return map;
  }, [eventRows]);

  const isPrevDisabled = monthBounds
    ? compareYearMonth(year, month, monthBounds.minYear, monthBounds.minMonth) <= 0
    : false;
  const isNextDisabled = monthBounds
    ? compareYearMonth(year, month, monthBounds.maxYear, monthBounds.maxMonth) >= 0
    : false;

  const goToPrevMonth = () => {
    if (isPrevDisabled) {
      return;
    }

    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };

  const goToNextMonth = () => {
    if (isNextDisabled) {
      return;
    }

    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const goToToday = () => {
    const now = new Date();
    if (!monthBounds) {
      setYear(now.getFullYear());
      setMonth(now.getMonth());
      return;
    }

    const [nextYear, nextMonth] = clampYearMonth(
      now.getFullYear(),
      now.getMonth(),
      monthBounds.minYear,
      monthBounds.minMonth,
      monthBounds.maxYear,
      monthBounds.maxMonth,
    );
    setYear(nextYear);
    setMonth(nextMonth);
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* 导航栏 */}
      <div className="mb-5 flex items-center justify-center rounded-[22px] border border-white/70 bg-white/65 px-2 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.08)] ring-1 ring-white/50 md:mb-6 md:px-3 md:py-3">
        <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-2.5 md:gap-3.5">
          <button
            onClick={goToPrevMonth}
            disabled={isPrevDisabled}
            className="rounded-xl border border-gray-200/80 bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white md:px-4 md:py-2"
          >
            ◀
          </button>
          <h2 className="min-w-0 text-center text-base font-black tracking-[0.02em] text-gray-800 sm:text-lg md:text-2xl md:tracking-[0.08em]">
            {year}年 {month + 1}月
          </h2>
          <button
            onClick={goToNextMonth}
            disabled={isNextDisabled}
            className="rounded-xl border border-gray-200/80 bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white md:px-4 md:py-2"
          >
            ▶
          </button>
          <button
            onClick={goToToday}
            className="ml-1.5 shrink-0 rounded-xl bg-gradient-to-r from-gray-900 to-gray-700 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm ring-1 ring-black/10 transition-opacity hover:opacity-95 sm:ml-2 md:ml-2.5 md:px-4 md:py-2"
          >
            今天
          </button>
        </div>
      </div>

      {/* 日历网格 */}
      <div className="overflow-hidden rounded-[24px] border border-white/70 bg-white/72 backdrop-blur-md shadow-[0_22px_60px_rgba(15,23,42,0.12)] ring-1 ring-white/60">
        {/* 星期头 */}
        <div className="grid grid-cols-7 border-b border-gray-200/70 bg-gradient-to-r from-white/90 via-white/75 to-white/90">
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={`py-3 text-center text-sm font-bold tracking-[0.2em] ${
                i >= 5 ? "text-red-500" : "text-gray-700"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* 周行 */}
        {Array.from({ length: totalWeeks }, (_, weekIdx) => {
          const lanes = maxLanesPerWeek[weekIdx] ?? 0;
          const minH = 42 + lanes * 28 + 18;
          const weekEvents = eventRowsByWeek[weekIdx] ?? [];

          return (
            <div
              key={weekIdx}
              className="relative border-b border-gray-200/50 last:border-b-0 bg-gradient-to-b from-white/65 via-white/42 to-white/30"
              style={{ minHeight: `${Math.max(36 + lanes * 24 + 14, 102)}px` }}
            >
              <div className="grid grid-cols-7">
                {Array.from({ length: 7 }, (_, colIdx) => {
                  const cell = calendarCells[weekIdx * 7 + colIdx];
                  const today = isToday(cell.date.getFullYear(), cell.date.getMonth(), cell.dayNumber);
                  const isRestDay = isChinaMainlandRestDay(cell.date, holidayLookup);

                  return (
                    <div
                      key={colIdx}
                      className={`relative min-h-[102px] border-r border-gray-200/40 last:border-r-0 p-1.5 sm:p-2 md:min-h-[120px] ${
                        !cell.isCurrentMonth
                          ? "bg-slate-50/72"
                          : isRestDay
                            ? "bg-[#fff7f7]/50"
                            : ""
                      }`}
                    >
                      {!cell.isCurrentMonth && (
                        <div className="pointer-events-none absolute inset-0 bg-white/22" />
                      )}
                      {today && (
                        <div className="pointer-events-none absolute inset-x-1.5 inset-y-1.5 rounded-2xl border border-blue-200/80 bg-blue-50/45 md:inset-x-2 md:inset-y-2" />
                      )}
                      <span
                        className={`relative z-[1] inline-flex text-sm leading-none ${
                          today
                            ? "h-7 w-7 items-center justify-center rounded-full bg-blue-600 font-bold text-white shadow-sm"
                            : !cell.isCurrentMonth
                              ? isRestDay
                                ? "font-medium text-red-300"
                                : "font-medium text-slate-400"
                              : isRestDay
                                ? "font-semibold text-red-500"
                                : "font-semibold text-gray-700"
                        }`}
                      >
                        {cell.dayNumber}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 活动横条层 —— 相对当前周行定位 */}
              <div className="absolute inset-0 pointer-events-none z-10">
                {weekEvents.map((row, i) => {
                  const weekCells = calendarCells.slice(weekIdx * 7, weekIdx * 7 + 7);
                  const segments = buildEventSegments(row, weekCells);
                  const topPx = 30 + row.lane * 24;
                  const leftPercent = (row.startCol / 7) * 100;
                  const widthPercent = (row.colSpan / 7) * 100;
                  const textStartCol = getFirstCurrentMonthStartCol(segments, row.startCol);
                  const textInsetPercent = ((textStartCol - row.startCol) / row.colSpan) * 100;

                  return (
                    <div
                      key={`${row.event.event_id}-${row.weekRow}-${i}`}
                      className="absolute overflow-hidden whitespace-nowrap rounded-xl px-2 py-0.5 text-[11px] font-semibold leading-tight text-white shadow-[0_8px_18px_rgba(0,0,0,0.16)] ring-1 ring-white/25 md:py-1 md:text-xs"
                      style={{
                        backgroundColor: row.event.primaryColor,
                        backgroundImage: row.event.secondaryColor
                          ? `repeating-linear-gradient(135deg, ${row.event.primaryColor} 0 36px, ${row.event.primaryColor} 36px 72px, ${row.event.secondaryColor} 72px 108px, ${row.event.secondaryColor} 108px 144px)`
                          : undefined,
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        top: `${topPx}px`,
                        height: "20px",
                        opacity: 0.97,
                      }}
                      title={row.event.name}
                    >
                      {segments.map((segment, segmentIndex) => {
                        if (segment.isCurrentMonth) {
                          return null;
                        }

                        const segmentLeftPercent = ((segment.startCol - row.startCol) / row.colSpan) * 100;
                        const segmentWidthPercent = (segment.colSpan / row.colSpan) * 100;

                        return (
                          <div
                            key={`${row.event.event_id}-${row.weekRow}-${i}-mask-${segmentIndex}`}
                            className="absolute inset-y-0 z-[1]"
                            style={{
                              left: `${segmentLeftPercent}%`,
                              width: `${segmentWidthPercent}%`,
                              backgroundColor: "rgba(255, 255, 255, 0.62)",
                              boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.18)",
                              ...getOuterSegmentRadiusStyle(segments, segmentIndex),
                            }}
                          />
                        );
                      })}
                      <span
                        className="absolute inset-y-0 right-0 z-[2] flex items-center overflow-hidden whitespace-nowrap pr-1"
                        style={{ left: textInsetPercent > 0 ? `calc(${textInsetPercent}% + 0.35rem)` : "0.5rem" }}
                      >
                        {row.event.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
