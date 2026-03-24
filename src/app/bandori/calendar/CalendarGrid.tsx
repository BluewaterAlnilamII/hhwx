"use client";

import { useState, useMemo } from "react";
import { CalendarEvent, filterEventsForMonth } from "./useCalendarData";
import { isChinaMainlandRestDay } from "./chinaMainlandHolidayCalendar";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

interface CalendarGridProps {
  events: CalendarEvent[];
}

/** 获取某月有多少天 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** 获取某月第一天是星期几（0=周一，6=周日） */
function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  // 将周日(0)映射为6，其它天-1
  return day === 0 ? 6 : day - 1;
}

/** 判断日期是否是今天 */
function isToday(year: number, month: number, day: number): boolean {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
}

/**
 * 计算活动在日历网格中的位置信息。
 * 返回一组"行段"，每行段表示一个活动在某一周中的跨度。
 */
interface EventRow {
  event: CalendarEvent;
  /** 在网格中的起始列（0-6） */
  startCol: number;
  /** 跨越的列数 */
  colSpan: number;
  /** 所在的周行索引（0-based） */
  weekRow: number;
  /** 在该格子中的纵向层级（用于堆叠） */
  lane: number;
}

function computeEventRows(
  events: CalendarEvent[],
  year: number,
  month: number,
  totalWeeks: number,
  firstDayOffset: number,
  daysInMonth: number
): EventRow[] {
  const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, daysInMonth, 23, 59, 59, 999);

  // 为什么这么做：将每个活动拆分成"周段"，以便在日历网格中逐行渲染横条。
  // 一个活动可能跨越多周，每周都需要单独的一段。
  const rows: EventRow[] = [];

  for (const ev of events) {
    // 活动在本月的实际可见范围
    const visStart = ev.startDate < monthStart ? monthStart : ev.startDate;
    const visEnd = ev.endDate > monthEnd ? monthEnd : ev.endDate;

    const startIndex = firstDayOffset + visStart.getDate() - 1;
    const endIndex = firstDayOffset + visEnd.getDate() - 1;

    // 为什么这么做：使用整个月视图的“格子索引”来切分活动条，
    // 能避免第一周因为 firstDayOffset 造成的负区间/重复区间问题，
    // 从根上修复首行幽灵横条和首段异常截断。
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

  // 分配 lane：同周重叠的活动需要纵向堆叠
  for (let week = 0; week < totalWeeks; week++) {
    const weekRows = rows.filter(r => r.weekRow === week);
    // 按起始列排序
    weekRows.sort((a, b) => a.startCol - b.startCol);

    // 贪心分配 lane
    const laneEnds: number[] = []; // 每条 lane 的已占用结束列
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

export default function CalendarGrid({ events }: CalendarGridProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOffset = getFirstDayOfWeek(year, month);
  const totalWeeks = Math.ceil((firstDayOffset + daysInMonth) / 7);

  const monthEvents = useMemo(
    () => filterEventsForMonth(events, year, month),
    [events, year, month]
  );

  const eventRows = useMemo(
    () => computeEventRows(monthEvents, year, month, totalWeeks, firstDayOffset, daysInMonth),
    [monthEvents, year, month, totalWeeks, firstDayOffset, daysInMonth]
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

  // 每周最大 lane 数（用于计算格子高度）
  const maxLanesPerWeek = useMemo(() => {
    const map: Record<number, number> = {};
    for (const row of eventRows) {
      map[row.weekRow] = Math.max(map[row.weekRow] ?? 0, row.lane + 1);
    }
    return map;
  }, [eventRows]);

  const goToPrevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };

  const goToNextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const goToToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* 导航栏 */}
      <div className="mb-6 flex items-center justify-center gap-3 rounded-[22px] border border-white/70 bg-white/65 px-3 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] ring-1 ring-white/50 md:gap-4">
        <button
          onClick={goToPrevMonth}
          className="rounded-xl border border-gray-200/80 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          ◀
        </button>
        <h2 className="min-w-[200px] text-center text-2xl font-black tracking-[0.08em] text-gray-800 md:min-w-[240px]">
          {year}年 {month + 1}月
        </h2>
        <button
          onClick={goToNextMonth}
          className="rounded-xl border border-gray-200/80 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          ▶
        </button>
        <button
          onClick={goToToday}
          className="rounded-xl bg-gradient-to-r from-gray-900 to-gray-700 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-black/10 transition-opacity hover:opacity-95"
        >
          今天
        </button>
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
              style={{ minHeight: `${Math.max(minH, 120)}px` }}
            >
              <div className="grid grid-cols-7">
                {Array.from({ length: 7 }, (_, colIdx) => {
                  const dayNum = weekIdx * 7 + colIdx - firstDayOffset + 1;
                  const isValidDay = dayNum >= 1 && dayNum <= daysInMonth;
                  const today = isValidDay && isToday(year, month, dayNum);
                  const cellDate = isValidDay ? new Date(year, month, dayNum) : null;
                  const isRestDay = cellDate ? isChinaMainlandRestDay(cellDate) : false;

                  return (
                    <div
                      key={colIdx}
                      className={`relative min-h-[120px] border-r border-gray-200/40 last:border-r-0 p-2 ${
                        !isValidDay ? "bg-gray-50/35" : isRestDay ? "bg-[#fff7f7]/50" : ""
                      }`}
                    >
                      {today && (
                        <div className="pointer-events-none absolute inset-x-2 inset-y-2 rounded-2xl border border-blue-200/80 bg-blue-50/45" />
                      )}
                      {isValidDay && (
                        <span
                          className={`relative z-[1] inline-flex text-sm leading-none ${
                            today
                              ? "h-7 w-7 items-center justify-center rounded-full bg-blue-600 font-bold text-white shadow-sm"
                              : isRestDay
                                ? "text-red-500 font-semibold"
                                : "text-gray-700 font-semibold"
                          }`}
                        >
                          {dayNum}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 活动横条层 —— 相对当前周行定位 */}
              <div className="absolute inset-0 pointer-events-none z-10">
                {weekEvents.map((row, i) => {
                  const leftPercent = (row.startCol / 7) * 100;
                  const widthPercent = (row.colSpan / 7) * 100;
                  const topPx = 34 + row.lane * 28;

                  return (
                    <div
                      key={`${row.event.event_id}-${row.weekRow}-${i}`}
                      className="absolute overflow-hidden whitespace-nowrap rounded-xl px-2 py-1 text-xs font-semibold leading-tight text-white shadow-[0_8px_18px_rgba(0,0,0,0.16)] ring-1 ring-white/25"
                      style={{
                        backgroundColor: row.event.primaryColor,
                        backgroundImage: row.event.secondaryColor
                          ? `repeating-linear-gradient(135deg, ${row.event.primaryColor} 0 36px, ${row.event.primaryColor} 36px 72px, ${row.event.secondaryColor} 72px 108px, ${row.event.secondaryColor} 108px 144px)`
                          : undefined,
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        top: `${topPx}px`,
                        height: "22px",
                        opacity: 0.97,
                      }}
                      title={row.event.name}
                    >
                      {row.event.name}
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
