"use client";

import { useMemo } from "react";
import type { TrackerData, TrackingMode } from "./types";
import { useBoundaryClock } from "./useBoundaryClock";

/**
 * 图表时间域（X 轴范围）信息。
 * domainStart/domainEnd 为 "auto" 时表示自适应。
 */
export type ChartDomain = {
  domainStart: number | "auto";
  domainEnd: number | "auto";
  cutoffEnd: number | null;
  midnights: number[];
};

type EventStatus = "未开始" | "进行中" | "已结束";

type MonthlyRankingWindow = {
  effectiveMonthStart: Date;
  domainStart: number;
  cutoffEnd: number;
  monthId: number;
};

export function getMonthlyRankingWindow(referenceTime: Date = new Date()): MonthlyRankingWindow {
  const monthAnchor = new Date(referenceTime.getFullYear(), referenceTime.getMonth(), 1, 13, 0, 0);
  const effectiveMonthStart = referenceTime.getTime() < monthAnchor.getTime()
    ? new Date(referenceTime.getFullYear(), referenceTime.getMonth() - 1, 1, 13, 0, 0)
    : monthAnchor;

  return {
    effectiveMonthStart,
    domainStart: effectiveMonthStart.getTime(),
    cutoffEnd: new Date(
      effectiveMonthStart.getFullYear(),
      effectiveMonthStart.getMonth() + 1,
      1,
      0,
      0,
      0,
    ).getTime(),
    monthId: (effectiveMonthStart.getFullYear() - 2025) * 12 + effectiveMonthStart.getMonth(),
  };
}

/**
 * useChartDomain —— 根据追踪模式和活动起止时间计算图表 X 轴域范围。
 *
 * - 月度排行模式：默认显示“当前有效月度榜”
 *   - 若当前时间已到本月 1 日 13:00，则显示本月 1 日 13:00 到次月 1 日 00:00
 *   - 若当前时间尚未到本月 1 日 13:00，则继续显示上月 1 日 13:00 到本月 1 日 00:00
 * - 活动排行与歌曲排行模式：从活动开始到结束后 1 秒
 * - `midnights`：域内每个午夜 0:00 的时间戳列表，用于绘制日期分割竖线
 */
export function useChartDomain(
  trackingMode: TrackingMode,
  startDate: number | null,
  endDate: number | null,
): ChartDomain {
  return useMemo(() => {
    let domainStart: number | "auto" = "auto";
    let domainEnd: number | "auto" = "auto";
    let cutoffEnd: number | null = null;

    if (trackingMode === "monthly") {
      const monthlyWindow = getMonthlyRankingWindow();
      domainStart = monthlyWindow.domainStart;
      cutoffEnd = monthlyWindow.cutoffEnd;
      domainEnd = cutoffEnd;
    } else if (startDate && endDate) {
      domainStart = startDate;
      cutoffEnd = endDate + 1000;
      domainEnd = cutoffEnd;
    }

    const midnights: number[] = [];
    if (typeof domainStart === "number" && typeof domainEnd === "number") {
      const m = new Date(domainStart);
      m.setHours(24, 0, 0, 0);
      while (m.getTime() <= domainEnd) {
        midnights.push(m.getTime());
        m.setDate(m.getDate() + 1);
      }
    }

    return { domainStart, domainEnd, cutoffEnd, midnights };
  }, [trackingMode, startDate, endDate]);
}

/**
 * useProcessedData —— 对原始追踪数据进行速度计算，生成含瞬时速度和 24h 速度的完整数据。
 *
 * 计算逻辑：
 * - speed（瞬时速度）：相邻两点的 EP 差 / 时间差（单位 P/h）
 * - speed24（24h 速度）：当前点与约 24 小时前那个点的 EP 差 / 天数差（单位 P/d）
 *
 * 设计原因：24 小时速度使用 23 小时 55 分阈值，而不是严格的 24 小时。
 * 服务端采集间隔约为 5 分钟，若完全按 24 小时截取，容易恰好落在两个采集点之间，
 * 导致找不到足够远的参考点。放宽 5 分钟容差可以稳定命中有效样本。
 */
export function useProcessedData(
  chartData: TrackerData[],
  apiHasResult: boolean,
  domainStart: number | "auto",
  trackingMode: TrackingMode,
): TrackerData[] {
  return useMemo(() => {
    let raw = [...chartData];

    // 当域起点明确且存在有效数据时，在序列头部补一个原点，
    // 让折线从活动起点开始绘制，而不是从第一个采集点突然出现。
    // 歌曲排行没有统一的起始时刻，因此不补原点。
    if (apiHasResult && typeof domainStart === "number" && trackingMode !== "song") {
      if (raw.length === 0 || raw[0].time > domainStart) {
        raw = [{ time: domainStart, ep: 0 }, ...raw];
      }
    }

    const processed: TrackerData[] = raw.map(d => ({ ...d }));

    // `l24` 表示 24 小时速度滑动窗口的左指针，采用双指针方式推进。
    let l24 = 0;
    // 23 小时 55 分阈值的选取原因见上方函数说明。
    const threshold24 = (23 * 60 + 55) * 60 * 1000;

    for (let r = 0; r < processed.length; r++) {
      // 瞬时速度：与前一个点的 EP 差 / 小时差
      if (r > 0) {
        const prev = processed[r - 1];
        const dtHours = (processed[r].time - prev.time) / 3600000;
        if (dtHours > 0) {
          processed[r].speed = Math.round((processed[r].ep - prev.ep) / dtHours);
        }
      }

      // 24h 速度：双指针向右推进左端，使窗口宽度尽量接近 24h
      while (l24 + 1 < r && (processed[r].time - processed[l24 + 1].time >= threshold24)) {
        l24++;
      }

      if (processed[r].time - processed[l24].time >= threshold24) {
        const dtDays = (processed[r].time - processed[l24].time) / 86400000;
        if (dtDays > 0) {
          processed[r].speed24 = Math.round((processed[r].ep - processed[l24].ep) / dtDays);
          processed[r].refSpeed24 = processed[l24].speed24;
        }
      } else if (r > 0) {
        // 不足 24h 时将累计 EP 作为近似日速度（活动早期数据）
        processed[r].speed24 = processed[r].ep;
        processed[r].refSpeed24 = processed[0].speed24;
      }
    }
    return processed;
  }, [chartData, apiHasResult, domainStart, trackingMode]);
}

/**
 * useEventStatus —— 根据活动时间域判断当前活动状态。
 *
 * 设计取舍：活动状态只在域边界变化时才需要重算。
 * 若按秒级更新时间反复读取当前时间，会让包含图表的父组件发生无意义的整树重渲染。
 */
function getEventStatusAt(
  currentTimeMs: number,
  domainStart: number | "auto",
  domainEnd: number | "auto",
): EventStatus {
  if (domainStart === "auto" || domainEnd === "auto") {
    return "未开始";
  }

  if (currentTimeMs < domainStart) {
    return "未开始";
  }

  if (currentTimeMs > domainEnd) {
    return "已结束";
  }

  return "进行中";
}

export function useEventStatus(
  domainStart: number | "auto",
  domainEnd: number | "auto",
): EventStatus {
  const boundaryNow = useBoundaryClock([
    typeof domainStart === "number" ? domainStart : null,
    typeof domainEnd === "number" ? domainEnd + 1 : null,
  ]);

  return getEventStatusAt(boundaryNow, domainStart, domainEnd);
}

/**
 * useFinalDisplayedData —— 在已处理数据基础上裁剪时间范围并追加投影虚拟点。
 *
 * 投影逻辑：在活动进行中且图表最新点未到达结束时间时，
 * 根据瞬时速度和 24h 速度线性外推到活动结束时刻，
 * 在数据末尾追加一个虚拟投影点与最新真实点相连形成虚线投影。
 */
export function useFinalDisplayedData(
  fullProcessedData: TrackerData[],
  cutoffEnd: number | null,
  status: string,
  showInstantProjection: boolean,
  showDayProjection: boolean,
): TrackerData[] {
  return useMemo(() => {
    const base = fullProcessedData.filter(d => cutoffEnd === null || d.time <= cutoffEnd);
    if (status !== "进行中" || base.length === 0 || typeof cutoffEnd !== "number") return base;

    const result = base.map(d => ({ ...d }));
    const latestPoint = result[result.length - 1];
    if (latestPoint.time >= cutoffEnd) return result;

    const remainingMs = cutoffEnd - latestPoint.time;
    const renderEndTime = cutoffEnd - 1;

    let instantEp: number | undefined;
    let dayEp: number | undefined;

    if (showInstantProjection && latestPoint.speed !== undefined) {
      instantEp = Math.max(0, Math.round(latestPoint.ep + latestPoint.speed * (remainingMs / 3600000)));
    }
    if (showDayProjection && latestPoint.speed24 !== undefined) {
      dayEp = Math.max(0, Math.round(latestPoint.ep + latestPoint.speed24 * (remainingMs / 86400000)));
    }

    if (instantEp !== undefined || dayEp !== undefined) {
      // 在最新真实点加入投影数据键，使投影虚线能从此点开始连接
      latestPoint.instantEp = latestPoint.ep;
      latestPoint.dayEp = latestPoint.ep;

      result.push({
        time: renderEndTime,
        instantEp,
        dayEp,
        projectionType: instantEp !== undefined && dayEp !== undefined ? "both" : (instantEp !== undefined ? "instant" : "24h"),
        projectionEndTime: cutoffEnd,
        isProjection: true,
      } as TrackerData);
    }

    return result;
  }, [fullProcessedData, cutoffEnd, status, showInstantProjection, showDayProjection]);
}

/** 自定义 Y 轴刻度生成器，使用“友好刻度”算法自动计算更易读的刻度间距。 */
export function generateYTicks(data: TrackerData[]): { ticks: number[] | undefined; domain: [number | string, number | string] } {
  if (data.length === 0) return { ticks: undefined, domain: [0, "dataMax"] };

  const minEp = 0;
  let maxEp = minEp;
  for (const d of data) {
    if (d.ep !== undefined && d.ep > maxEp) maxEp = d.ep;
    if (d.instantEp !== undefined && d.instantEp > maxEp) maxEp = d.instantEp;
    if (d.dayEp !== undefined && d.dayEp > maxEp) maxEp = d.dayEp;
  }

  const range = Math.max(maxEp - minEp, 100);
  // 分母为 6，确保除底座 0 位外刻度总数不超过约 10 个
  const roughStep = range / 6;

  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalizedStep = roughStep / magnitude;

  let stepMultiplier;
  if (normalizedStep <= 1.5) stepMultiplier = 1;
  else if (normalizedStep <= 3) stepMultiplier = 2;
  else if (normalizedStep <= 7) stepMultiplier = 5;
  else stepMultiplier = 10;

  const selectedStep = stepMultiplier * magnitude;
  const ticks: number[] = [minEp];

  let currentTick = Math.floor(minEp / selectedStep) * selectedStep + selectedStep;
  while (currentTick <= maxEp + selectedStep) {
    ticks.push(currentTick);
    currentTick += selectedStep;
  }

  return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] };
}

/**
 * 在已处理数据中查找距目标时间最近的得分值（容差内）。
 * 用于活动结束后查询"结束分数"和"最终分数"。
 */
export function getScoreAtTime(
  data: TrackerData[],
  targetTime: number,
  toleranceMs = 5 * 60 * 1000,
): number | null {
  let best = null;
  let minDiff = Infinity;
  for (const pt of data) {
    const diff = Math.abs(pt.time - targetTime);
    if (diff < minDiff && diff <= toleranceMs) {
      minDiff = diff;
      best = pt.ep;
    }
  }
  return best;
}

export function getFinalScore(data: TrackerData[]): number | null {
  for (let index = data.length - 1; index >= 0; index -= 1) {
    if (data[index].isFinal) {
      return data[index].ep;
    }
  }
  return null;
}
