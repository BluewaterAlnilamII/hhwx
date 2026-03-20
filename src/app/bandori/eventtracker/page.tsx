"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import * as Tabs from "@radix-ui/react-tabs";
import { ZoomIn, ZoomOut, Search, History, X, ChevronDown, Check, Info } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { supabase } from "@/lib/supabase";

type TrackerData = {
  time: number;
  ep: number;
  speed?: number;
  speed24?: number;
  refSpeed24?: number;
  instantEp?: number;
  dayEp?: number;
  isProjection?: boolean;
  projectionType?: "instant" | "24h" | "both";
  projectionEndTime?: number;
};

type EventMetadata = {
  eventType: string;
  eventName: string[];
  assetBundleName: string;
  startAt: (string | null)[];
  endAt: (string | null)[];
};

type MinimalEvent = {
  id: number;
  name: string;
  startAt: number | null;
  endAt: number | null;
  hasCn: boolean;
  hasJp: boolean;
};

const EVENT_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 40000, 50000, 70000, 100000];
const SONG_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000];
const MONTHLY_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 500, 1000, 2000, 3000, 4000];
const INSTANT_PROJECTION_COOKIE = "eventtracker_projection_instant";
const DAY_PROJECTION_COOKIE = "eventtracker_projection_24h";

function readProjectionCookie(cookieName: string): boolean | null {
  if (typeof document === "undefined") return null;
  const found = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));

  if (!found) return null;
  const rawValue = found.slice(cookieName.length + 1).toLowerCase();
  if (rawValue === "1" || rawValue === "true") return true;
  if (rawValue === "0" || rawValue === "false") return false;
  return null;
}

function writeProjectionCookie(cookieName: string, value: boolean) {
  if (typeof document === "undefined") return;
  document.cookie = `${cookieName}=${value ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * EventProgressBar —— 活动进度条与倒计时展示组件。
 * 将每秒的 Date.now() 调用隔离在此组件内部，
 * 防止父组件每秒触发包含 Recharts 图表的全量重渲染。
 */
function EventProgressBar({ startDate, endDate }: { startDate: number; endDate: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = Math.min(100, Math.max(0, ((now - startDate) / (endDate - startDate)) * 100));
  const remainingMs = endDate - now;

  const timeRemaining = () => {
    if (remainingMs <= 0) return <span>活动已结束</span>;
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
    return (
      <>
        距结束
        <span className="text-blue-500">{days}</span>天
        <span className="text-blue-500">{hours}</span>小时
        <span className="text-blue-500">{minutes}</span>分
        <span className="text-blue-500">{seconds}</span>秒
      </>
    );
  };

  return (
    <div className="bg-white dark:bg-[#131A2B] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="flex justify-between text-sm font-semibold mb-2">
        <span className="text-blue-500 font-bold">活动进度</span>
        <span>
          <span className="text-blue-500">{progress.toFixed(1)}%</span>已完成 {timeRemaining()}
        </span>
      </div>
      <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * MinutesAgo —— "N分钟前更新"实时展示组件。
 * 每秒自主更新，超过 30 分钟则高亮警告色。
 * 同样隔离在子组件内以避免父组件全量重渲染。
 */
function MinutesAgo({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const minutesAgo = Math.floor((now - timestamp) / 60000);

  return (
    <span className={`text-base font-medium ${minutesAgo > 30 ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}>
      {minutesAgo >= 0 ? `${minutesAgo}分钟前` : "-"}
    </span>
  );
}

export default function EventTrackerPage() {
  const [currentEventId, setCurrentEventId] = useState<number | null>(null);
  const [eventMeta, setEventMeta] = useState<EventMetadata | null>(null);
  
  const [trackingMode, setTrackingMode] = useState<"event" | "song" | "monthly">("event");
  const [selectedTier, setSelectedTier] = useState<number>(1000);
  
  const [chartData, setChartData] = useState<TrackerData[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [zoomLevel, setZoomLevel] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [allEvents, setAllEvents] = useState<MinimalEvent[]>([]);

  // 用于在实时回调中获取最新的视图参数，而不需每次参数改变都重新建立 WebSocket 订阅。
  const currentViewRef = useRef({ eventId: currentEventId, mode: trackingMode, tier: selectedTier });
  useEffect(() => {
    currentViewRef.current = { eventId: currentEventId, mode: trackingMode, tier: selectedTier };
  }, [currentEventId, trackingMode, selectedTier]);

  useEffect(() => {
    // 建立全局唯一 WebSocket 监听以实现前端实时刷新
    // 监听 `bandori_tracker_data` 表的新数据插入
    const channel = supabase
      .channel("bandori_tracker_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bandori_tracker_data" },
        (payload) => {
          const newRow = payload.new;
          if (!newRow) return;

          const view = currentViewRef.current;
          // 根据当前的追踪模式，确认应该返回的关联 eventId 取值
          const targetEventParam = view.mode === "monthly" ? 14 : view.eventId;

          // 仅当新数据符合当前图表视图时才更新当前数据
          if (
            newRow.event_id === targetEventParam &&
            newRow.type === view.mode &&
            newRow.tier === view.tier
          ) {
            setChartData((prev) => {
              const time = Number(newRow.time);
              const ep = Number(newRow.ep);

              // 避免乱序或重复数据插入导致图表绘制扭曲
              if (prev.length > 0 && time <= prev[prev.length - 1].time) {
                return prev;
              }

              // 此处追加最新点并返回全新引用以触发图表平滑重渲染
              return [...prev, { time, ep }];
            });
            setApiHasResult(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [apiHasResult, setApiHasResult] = useState(false);
  const [showInstantProjection, setShowInstantProjection] = useState(true);
  const [showDayProjection, setShowDayProjection] = useState(true);
  const [projectionPrefLoaded, setProjectionPrefLoaded] = useState(false);

  useEffect(() => {
    const instantPref = readProjectionCookie(INSTANT_PROJECTION_COOKIE);
    const dayPref = readProjectionCookie(DAY_PROJECTION_COOKIE);

    if (instantPref !== null) setShowInstantProjection(instantPref);
    if (dayPref !== null) setShowDayProjection(dayPref);
    setProjectionPrefLoaded(true);
  }, []);

  useEffect(() => {
    if (!projectionPrefLoaded) return;
    writeProjectionCookie(INSTANT_PROJECTION_COOKIE, showInstantProjection);
  }, [projectionPrefLoaded, showInstantProjection]);

  useEffect(() => {
    if (!projectionPrefLoaded) return;
    writeProjectionCookie(DAY_PROJECTION_COOKIE, showDayProjection);
  }, [projectionPrefLoaded, showDayProjection]);

  // Auto-scroll to the rightmost (latest data) whenever the container resizes (e.g., from zooming)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    let isUserScrolling = false;
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      isUserScrolling = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isUserScrolling = false;
      }, 200);
    };

    el.addEventListener('scroll', handleScroll);

    // Watch for width changes caused by zoomLevel scaling
    const resizeObserver = new ResizeObserver(() => {
      if (!isUserScrolling) {
        el.scrollLeft = el.scrollWidth;
      }
    });
    
    // We observe the inner div that actually scales
    if (el.firstElementChild) {
      resizeObserver.observe(el.firstElementChild);
    }

    return () => {
      el.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
      clearTimeout(scrollTimeout);
    };
  }, []);

  // Fetch Event Metadata
  useEffect(() => {
    if (currentEventId === null) return;
    let active = true;
    fetch(`/api/bestdori/event/${currentEventId}`)
      .then((res) => res.json())
      .then((data) => {
        if (active && !data.error) setEventMeta(data);
      })
      .catch((err) => console.error("Error fetching event metadata:", err));
    return () => { active = false; };
  }, [currentEventId]);

  // Fetch All Events list for selector
  useEffect(() => {
    fetch('/api/bestdori/events')
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          const eventsList: MinimalEvent[] = [];
          Object.entries(data).forEach(([idStr, ev]: [string, any]) => {
            // Keep everything that has at least one valid name
            const cnName = ev.eventName?.[3];
            const jpName = ev.eventName?.[0];
            
            if (cnName || jpName) {
              eventsList.push({
                id: parseInt(idStr),
                name: cnName || jpName || "Unknown",
                startAt: ev.startAt?.[3] ? parseInt(ev.startAt[3]) : null,
                endAt: ev.endAt?.[3] ? parseInt(ev.endAt[3]) : null,
                hasCn: !!cnName,
                hasJp: !!jpName
              });
            }
          });
          // Sort descending by ID (newest first) for the dropdown list
          eventsList.sort((a, b) => b.id - a.id);
          setAllEvents(eventsList);

          // Auto-select logic with strict priority:
          // 1. Ongoing
          // 2. Earliest Upcoming (Min ID)
          // 3. Latest Finished (Max ID)
          const now = Date.now();
          
          let bestMatch: MinimalEvent | null = null;
          
          // Priority 1: Ongoing
          bestMatch = eventsList.find(ev => ev.startAt !== null && ev.endAt !== null && now >= ev.startAt && now <= ev.endAt) || null;
          
          // Priority 2: Upcoming (startAt is null or in the future)
          if (!bestMatch) {
            const upcoming = eventsList
              .filter(ev => ev.startAt === null || ev.startAt > now)
              .sort((a, b) => a.id - b.id); // ASCENDING ID (Smallest ID first, e.g. 303)
            if (upcoming.length > 0) bestMatch = upcoming[0];
          }
          
          // Priority 3: Finished
          if (!bestMatch) {
            const finished = eventsList
              .filter(ev => ev.endAt !== null && ev.endAt < now)
              .sort((a, b) => b.id - a.id); // DESCENDING ID (Newest ID first, e.g. 313)
            if (finished.length > 0) bestMatch = finished[0];
          }

          if (bestMatch && currentEventId === null) {
            setCurrentEventId(bestMatch.id);
          }
        }
      })
      .catch(err => console.error("Error fetching events list:", err));
  }, []); // Run once on mount

  // Helper for "Jump to Latest" logic (same as auto-select)
  const jumpToLatest = () => {
    if (allEvents.length === 0) return;
    const now = Date.now();
    let bestMatch: MinimalEvent | null = null;
    
    // 1. Ongoing
    bestMatch = allEvents.find(ev => ev.startAt !== null && ev.endAt !== null && now >= ev.startAt && now <= ev.endAt) || null;
    
    // 2. Upcoming (Min ID)
    if (!bestMatch) {
      const upcoming = [...allEvents]
        .filter(ev => ev.startAt === null || ev.startAt > now)
        .sort((a, b) => a.id - b.id);
      if (upcoming.length > 0) bestMatch = upcoming[0];
    }
    
    // 3. Finished (Max ID)
    if (!bestMatch) {
      const finished = [...allEvents]
        .filter(ev => ev.endAt !== null && ev.endAt < now)
        .sort((a, b) => b.id - a.id);
      if (finished.length > 0) bestMatch = finished[0];
    }

    if (bestMatch) {
      setCurrentEventId(bestMatch.id);
    }
  };
  // Handle tier jumping and zoom reset when tracking mode changes
  useEffect(() => {
    setZoomLevel(1);
    
    const targetTiers = trackingMode === "event" ? EVENT_TIERS : trackingMode === "song" ? SONG_TIERS : MONTHLY_TIERS;
    if (!targetTiers.includes(selectedTier)) {
      // Find the nearest lower tier (largest value in targetTiers that is <= selectedTier)
      const validTiers = targetTiers.filter(t => t <= selectedTier);
      if (validTiers.length > 0) {
        setSelectedTier(validTiers[validTiers.length - 1]);
      } else {
        // Fallback to the lowest index tier if none are smaller
        setSelectedTier(targetTiers[0]);
      }
    }
  }, [trackingMode]);

  // Fetch Tracker Data
  useEffect(() => {
    if (currentEventId === null) return;
    let active = true;
    setLoading(true);
    
    // For monthly, default eventId is the month ID (e.g., 14 for March 2026)
    // Here we'll map currentEventId -> monthId conceptually if monthly is selected.
    // For now we assume if monthly is selected, we pass 14 as event param
    const targetEventParam = trackingMode === "monthly" ? 14 : currentEventId;

    fetch(`/api/tracker/data?server=3&event=${targetEventParam}&type=${trackingMode}&tier=${selectedTier}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch data");
        return res.json();
      })
      .then((data: { result: boolean, cutoffs: TrackerData[] }) => {
        if (active) {
          setChartData(data.cutoffs || []);
          setApiHasResult(data.result || false);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error fetching tracker data:", err);
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [currentEventId, trackingMode, selectedTier]);

  const cnEventName = eventMeta?.eventName[3] || eventMeta?.eventName[0] || "Loading Event...";
  
  // Decide which banner to show: CN if meta has it, else JP
  const bannerPath = eventMeta?.eventName[3] ? "cn" : "jp";
  const bannerUrl = eventMeta?.assetBundleName 
    ? `https://bestdori.com/assets/${bannerPath}/event/${eventMeta.assetBundleName}/images_rip/banner.png`
    : "";
    
  // Only read CN time information (server index 3)
  const startDate = eventMeta?.startAt[3] ? parseInt(eventMeta.startAt[3]!) : null;
  const endDate = eventMeta?.endAt[3] ? parseInt(eventMeta.endAt[3]!) : null;

  // Chart X-Axis Boundaries
  let domainStart: number | "auto" = "auto";
  let domainEnd: number | "auto" = "auto";
  let cutoffEnd: number | null = null;
  
  if (trackingMode === "monthly") {
    const now = new Date();
    domainStart = new Date(now.getFullYear(), now.getMonth(), 1, 13, 0, 0).getTime();
    cutoffEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0).getTime(); // 24:00:00 of last day is 00:00:00 of next month
    domainEnd = cutoffEnd;
  } else if (startDate && endDate) {
    domainStart = startDate;
    cutoffEnd = endDate + 1000; // 1秒后
    domainEnd = cutoffEnd;
  }

  // 计算所有的午夜 0:00 时间戳
  const midnights: number[] = [];
  if (typeof domainStart === "number" && typeof domainEnd === "number") {
    let m = new Date(domainStart);
    m.setHours(24, 0, 0, 0); // 跳到下一个 0 点
    while (m.getTime() <= domainEnd) {
      midnights.push(m.getTime());
      m.setDate(m.getDate() + 1);
    }
  }

  // fullProcessedData includes origin point and speeds but NO temporal cutoff filter
  const fullProcessedData = useMemo(() => {
    let raw = [...chartData];
    if (apiHasResult && typeof domainStart === "number" && trackingMode !== "song") {
      if (raw.length === 0 || raw[0].time > domainStart) {
        raw = [{ time: domainStart, ep: 0 }, ...raw];
      }
    }
    
    const processed: TrackerData[] = raw.map(d => ({ ...d }));
    let l24 = 0;
    const threshold24 = (23 * 60 + 55) * 60 * 1000;

    for (let r = 0; r < processed.length; r++) {
      if (r > 0) {
        const prev = processed[r - 1];
        const dtHours = (processed[r].time - prev.time) / (3600000);
        if (dtHours > 0) {
          processed[r].speed = Math.round((processed[r].ep - prev.ep) / dtHours);
        }
      }

      while (l24 + 1 < r && (processed[r].time - processed[l24 + 1].time >= threshold24)) {
        l24++;
      }
      
      if (processed[r].time - processed[l24].time >= threshold24) {
        const dtDays = (processed[r].time - processed[l24].time) / (86400000);
        if (dtDays > 0) {
          processed[r].speed24 = Math.round((processed[r].ep - processed[l24].ep) / dtDays);
          processed[r].refSpeed24 = processed[l24].speed24;
        }
      } else if (r > 0) {
        processed[r].speed24 = processed[r].ep;
        processed[r].refSpeed24 = processed[0].speed24;
      }
    }
    return processed;
  }, [chartData, apiHasResult, domainStart, trackingMode]);


  // 活动状态仅在图表时间范围变化时重新计算。
  // 原先它依赖于每秒 ticker 更新的 nowTime，导致整页每秒全量重渲染；
  // 改为 useMemo 后只在 domainStart/domainEnd 变化时（即切换活动时）才重算。
  const status = useMemo(() => {
    if (domainStart === "auto" || domainEnd === "auto") return "未开始";
    const now = Date.now();
    if (now < (domainStart as number)) return "未开始";
    if (now > (domainEnd as number)) return "已结束";
    return "进行中";
  }, [domainStart, domainEnd]);

  // finalDisplayedData is what actually goes into the chart (strictly bounded and includes projections)
  const finalDisplayedData = useMemo(() => {
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
      // Latest real point needs the keys to connect the projection lines
      latestPoint.instantEp = latestPoint.ep;
      latestPoint.dayEp = latestPoint.ep;

      result.push({
        time: renderEndTime,
        instantEp,
        dayEp,
        projectionType: instantEp !== undefined && dayEp !== undefined ? "both" : (instantEp !== undefined ? "instant" : "24h"),
        projectionEndTime: cutoffEnd,
        isProjection: true,
      } as any);
    }

    return result;
  }, [fullProcessedData, cutoffEnd, status, showInstantProjection, showDayProjection]);

  // projectionData no longer needed as we integrate it into data array


  // visibleProjectionEndPoints replaced by isProjection flag in data array


  // 自定义 Y 轴 Ticks 生成器
  const generateYTicks = () => {
    const ySourceData = finalDisplayedData;

    if (ySourceData.length === 0) return undefined;

    let minEp = 0;
    let maxEp = minEp;
    for (const d of ySourceData) {
      if (d.ep !== undefined && d.ep > maxEp) maxEp = d.ep;
      if (d.instantEp !== undefined && d.instantEp > maxEp) maxEp = d.instantEp;
      if (d.dayEp !== undefined && d.dayEp > maxEp) maxEp = d.dayEp;
    }

    // 自动计算理想步进 (Nice steps: 1, 2, 5 * 10^n)
    const range = Math.max(maxEp - minEp, 100); // 至少 100
    const roughStep = range / 6; // 分母改为 6，以确保除 0 位外刻度总数不超过 10 个

    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalizedStep = roughStep / magnitude;

    let stepMultiplier;
    if (normalizedStep <= 1.5) stepMultiplier = 1;
    else if (normalizedStep <= 3) stepMultiplier = 2;
    else if (normalizedStep <= 7) stepMultiplier = 5;
    else stepMultiplier = 10;

    let selectedStep = stepMultiplier * magnitude;

    const ticks: number[] = [minEp]; // 强插首个底座点

    // 从首个点后寻找下一个整数倍点作为对齐分割点
    let currentTick = Math.floor(minEp / selectedStep) * selectedStep + selectedStep;

    while (currentTick <= maxEp + selectedStep) {
      ticks.push(currentTick);
      currentTick += selectedStep;
    }

    return ticks;
  };
  const yTicks = generateYTicks();
  const yDomainInfo: any[] = yTicks && yTicks.length > 0 ? [yTicks[0], yTicks[yTicks.length - 1]] : [0, 'dataMax'];

  const getScoreAtTime = (targetTime: number, toleranceMs = 5 * 60 * 1000) => {
    let best = null;
    let minDiff = Infinity;
    for (const pt of fullProcessedData) {
      const diff = Math.abs(pt.time - targetTime);
      if (diff < minDiff && diff <= toleranceMs) {
        minDiff = diff;
        best = pt.ep;
      }
    }
    return best;
  };

  let latestScore: number | null = null;
  let latestUpdateTime: number | null = null; // 传递给 MinutesAgo 组件进行实时显示
  let endScore: number | null = null;
  let finalScore: number | null = null;

  if (fullProcessedData.length > 0) {
    const latestPt = fullProcessedData[fullProcessedData.length - 1];
    latestScore = latestPt.ep;
    latestUpdateTime = latestPt.time;

    if (status === "已结束") {
      if (trackingMode === "monthly" && typeof domainEnd === "number") {
        const nextMonth1st0000 = domainEnd + 1;
        const nextMonth1st0015 = nextMonth1st0000 + 15 * 60 * 1000;
        endScore = getScoreAtTime(nextMonth1st0000);
        finalScore = getScoreAtTime(nextMonth1st0015);
      } else if (endDate) {
        const ed = new Date(endDate);
        const endDay2300 = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 0, 0).getTime();
        const endDay2315 = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 15, 0).getTime();
        endScore = getScoreAtTime(endDay2300);
        finalScore = getScoreAtTime(endDay2315);
      }
    }
  }

  // Custom Tooltip for Speed calculation
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      if (payload[0]?.payload?.isProjection) {
        const p = payload[0].payload;
        const projectionLabelTime = p.projectionEndTime || label;

        return (
          <div className="bg-white/90 backdrop-blur-xl p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/40 dark:bg-[#131A2B]/90 dark:border-gray-800 min-w-[210px]">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{format(projectionLabelTime, "yyyy/MM/dd HH:mm:ss")}</p>

            {p.instantEp !== undefined && (
              <div className="mt-1 flex justify-between items-center gap-6">
                <span className="text-xs font-bold text-[#ef4444]">线性投影（瞬时）</span>
                <span className="text-sm font-bold text-[#ef4444]">
                  {new Intl.NumberFormat().format(p.instantEp)} {trackingMode === "song" ? "Pt" : "P"}
                </span>
              </div>
            )}

            {p.dayEp !== undefined && (
              <div className="mt-1 flex justify-between items-center gap-6">
                <span className="text-xs font-bold text-[#3b82f6]">线性投影（24h）</span>
                <span className="text-sm font-bold text-[#3b82f6]">
                  {new Intl.NumberFormat().format(p.dayEp)} {trackingMode === "song" ? "Pt" : "P"}
                </span>
              </div>
            )}
          </div>
        );
      }


      const mainEntry = payload.find(
        (entry: any) => entry?.dataKey === "ep" && !entry?.payload?.isProjection
      );


      if (!mainEntry?.payload) return null;

      const currentPoint = mainEntry.payload;
      
      const currentIndex = finalDisplayedData.findIndex((d: TrackerData) => d.time === currentPoint.time);
      const pointWithSpeeds = currentIndex !== -1 ? finalDisplayedData[currentIndex] : currentPoint;
      
      let speedRender = null;
      let speed24Render = null;
      
      if (pointWithSpeeds.speed !== undefined) {
          speedRender = (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50 flex justify-between items-center">
               <span className="text-xs font-bold text-gray-400">瞬时速度</span>
               <span className="text-[#f43f5e] font-bold text-sm">+{new Intl.NumberFormat().format(pointWithSpeeds.speed)} {trackingMode === "song" ? "Pt" : "P"}/h</span>
            </div>
          );
      }

      if (pointWithSpeeds.speed24 !== undefined) {
          let diffRender = null;
          if (pointWithSpeeds.refSpeed24 !== undefined && pointWithSpeeds.refSpeed24 !== 0) {
              let diffPercent = ((pointWithSpeeds.speed24 - pointWithSpeeds.refSpeed24) / pointWithSpeeds.refSpeed24) * 100;
              if (Math.abs(diffPercent) < 0.005) diffPercent = 0; // Prevent "-0.00%"
              const sign = diffPercent >= 0 ? "+" : "";
              const colorClass = diffPercent < 0 ? "text-red-500" : "text-blue-500";
              diffRender = (
                  <div className="mt-0.5 flex justify-end">
                      <span className={`${colorClass} font-bold text-xs`}>({sign}{diffPercent.toFixed(2)}%)</span>
                  </div>
              );
          }

          speed24Render = (
            <div>
              <div className="mt-1 flex justify-between items-center">
                 <span className="text-xs font-bold text-gray-400">24h速度</span>
                 <span className="text-blue-500 font-bold text-sm">+{new Intl.NumberFormat().format(pointWithSpeeds.speed24)} {trackingMode === "song" ? "Pt" : "P"}/d</span>
              </div>
              {diffRender}
            </div>
          );
      }

      return (
        <div className="bg-white/90 backdrop-blur-xl p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/40 dark:bg-[#131A2B]/90 dark:border-gray-800 min-w-[180px]">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{format(label, "yyyy/MM/dd HH:mm:ss")}</p>
          <div className="flex items-end gap-2">
            <span className="text-blue-500 font-extrabold text-2xl leading-none">
              {new Intl.NumberFormat().format(currentPoint.ep)}
            </span>
            <span className="text-sm font-bold text-blue-500/70 mb-0.5">{trackingMode === "song" ? "Pt" : "P"}</span>
          </div>
          {speedRender}
          {speed24Render}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen text-gray-800 dark:text-gray-100 p-2 sm:p-6 lg:p-10 font-sans relative z-10">
      
      {/* Header Container */}
      <div className="max-w-5xl mx-auto space-y-4 lg:space-y-8 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-[#131A2B] rounded-3xl shadow-xl shadow-blue-500/5 dark:shadow-blue-500/10 border border-gray-100 dark:border-gray-800 p-4 sm:p-8 relative z-20">
          
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl font-extrabold text-[#f43f5e] block w-full">
              {cnEventName}
            </h1>
            
            {allEvents.length > 0 && (
              <div className="flex items-center gap-2">
                <select 
                  className="bg-gray-100 dark:bg-[#0C111C] border border-gray-200 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-[#f43f5e] focus:outline-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors shadow-sm w-full max-w-[400px] text-ellipsis sm:min-w-[320px]"
                  value={currentEventId || ""}
                  onChange={(e) => setCurrentEventId(parseInt(e.target.value))}
                >
                  <option disabled value="">切换往期活动...</option>
                  {allEvents.map(ev => (
                    <option key={ev.id} value={ev.id}>
                      {ev.id}期 : {ev.name}
                    </option>
                  ))}
                </select>

                <button 
                  onClick={jumpToLatest}
                  className="p-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all border border-blue-200/50 dark:border-blue-800/50 shadow-sm group flex-shrink-0"
                  title="最新活动"
                >
                  <History size={22} className="group-hover:rotate-[-45deg] transition-transform duration-500" />
                </button>

                <Dialog.Root open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                  <Dialog.Trigger asChild>
                    <button 
                      className="p-2.5 bg-gray-50 dark:bg-gray-900/50 text-gray-500 border border-gray-200 dark:border-gray-800 rounded-xl hover:text-blue-500 hover:border-blue-300 transition-all shadow-sm flex-shrink-0"
                      title="搜索活动"
                    >
                      <Search size={22} />
                    </button>
                  </Dialog.Trigger>
                  
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100] animate-in fade-in duration-200" />
                    <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-[#131A2B] rounded-2xl shadow-2xl z-[101] flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-200">
                      
                      {/* Header */}
                      <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                        <Dialog.Title className="text-xl font-bold text-gray-800 dark:text-white">Select Event</Dialog.Title>
                        <Dialog.Close asChild>
                          <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400">
                            <X size={22} />
                          </button>
                        </Dialog.Close>
                      </div>

                      {/* Search Area */}
                      <div className="p-4 border-b border-gray-50 dark:border-gray-800/50 flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" size={18} />
                          <input 
                            autoFocus
                            type="text" 
                            placeholder="Search" 
                            className="w-full bg-white dark:bg-[#0C111C] border border-blue-400 dark:border-blue-500 rounded px-10 py-1.5 shadow-[0_0_8px_rgba(59,130,246,0.3)] text-sm font-medium text-gray-700 dark:text-gray-200 outline-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                          {searchQuery && (
                            <button 
                              onClick={() => setSearchQuery("")}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 bg-gray-200 dark:bg-gray-800 rounded-md text-gray-500"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <Dialog.Close asChild>
                          <button className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-800">
                            <X size={18} />
                          </button>
                        </Dialog.Close>
                      </div>

                      {/* Event List */}
                      <div className="flex-1 overflow-y-auto max-h-[60vh] py-2">
                        {allEvents
                          .filter(ev => !searchQuery || ev.name.toLowerCase().includes(searchQuery.toLowerCase()) || ev.id.toString().includes(searchQuery))
                          .map(ev => (
                            <button
                              key={ev.id}
                              onClick={() => {
                                setCurrentEventId(ev.id);
                                setIsPickerOpen(false);
                                setSearchQuery("");
                              }}
                              className="w-full px-6 py-3.5 flex items-center justify-between hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors group"
                            >
                              <span className={`text-sm font-bold ${ev.id === currentEventId ? 'text-blue-500' : 'text-gray-600 dark:text-gray-300'}`}>
                                {ev.id}期 : {ev.name}
                              </span>
                              <div className="flex gap-2">
                                {ev.hasCn && <span className="px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-bold text-gray-400 group-hover:text-blue-500 group-hover:border-blue-200 transition-colors">CN</span>}
                                {ev.hasJp && <span className="px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-bold text-gray-400 group-hover:text-blue-500 group-hover:border-blue-200 transition-colors">JP</span>}
                              </div>
                            </button>
                          ))}
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              </div>
            )}
            
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {startDate && endDate ? (
                <>
                  <p>Start: {format(startDate, "MMM do yyyy, HH:mm")} (CN)</p>
                  <p>End: {format(endDate, "MMM do yyyy, HH:mm")} (CN)</p>
                </>
              ) : null}
            </div>
          </div>
          
          <div className="flex-1 pt-6 md:pt-0 flex justify-end">
            {bannerUrl ? (
              <img 
                src={bannerUrl} 
                alt="Event Banner" 
                className="rounded-2xl shadow-lg ring-1 ring-black/5 hover:scale-105 transition-transform duration-500 max-h-[140px] object-cover"
              />
            ) : (
              <div className="w-[300px] h-[100px] bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse"></div>
            )}
          </div>
        </div>

        {/* Status Bar —— 实时倒计时和进度条已抽离到 EventProgressBar，避免每秒触发父组件整页重渲染 */}
        {startDate && endDate && (
          <EventProgressBar startDate={startDate} endDate={endDate} />
        )}

        {/* Navigation & Controls */}
        <div className="bg-white/80 dark:bg-[#131A2B]/80 backdrop-blur-xl rounded-3xl p-3 sm:p-6 shadow-xl border border-white/20 dark:border-gray-800">
          <Tabs.Root 
            value={trackingMode} 
            onValueChange={(val: string) => setTrackingMode(val as any)}
            className="w-full flex flex-col gap-4 sm:gap-6"
          >
            <div className="flex flex-col xl:flex-row gap-4 items-stretch">
              
              {/* Tab Toggles */}
              <Tabs.List className="flex flex-row xl:flex-col justify-center gap-1 sm:gap-2 p-1.5 sm:p-2 bg-gray-100/80 dark:bg-gray-900/50 rounded-2xl shadow-inner flex-shrink-0 overflow-x-auto">
                {[
                  { id: "event", label: "活动排行" },
                  { id: "song", label: "歌曲排行" },
                  { id: "monthly", label: "月度排行" }
                ].map((mode) => (
                  <Tabs.Trigger
                    key={mode.id}
                    value={mode.id}
                    className="px-4 py-2 sm:px-6 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 whitespace-nowrap
                      data-[state=active]:bg-white data-[state=active]:dark:bg-gray-800 
                      data-[state=active]:text-blue-600 data-[state=active]:dark:text-blue-400
                      data-[state=active]:shadow-md data-[state=inactive]:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 w-full text-center tracking-wide"
                  >
                    {mode.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {/* Tier Selection */}
              <div className="flex-1 bg-gray-50/50 dark:bg-[#0C111C]/50 rounded-2xl p-3 sm:p-5 border border-gray-100 dark:border-gray-800/60 shadow-inner overflow-hidden flex flex-col justify-center">
                <div className="text-xs sm:text-sm font-bold tracking-wider text-gray-400 mb-2 ml-1 block hidden xl:block">选择排名</div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {(trackingMode === "event" ? EVENT_TIERS : trackingMode === "song" ? SONG_TIERS : MONTHLY_TIERS).map(tier => (
                    <button
                      key={tier}
                      onClick={() => setSelectedTier(tier)}
                      className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-all duration-300 ${
                        selectedTier === tier 
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-[#131A2B] scale-105" 
                          : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-105 border border-gray-200 dark:border-gray-700 shadow-sm"
                      }`}
                    >
                      T{tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex flex-col justify-center bg-gray-50 dark:bg-[#0C111C] rounded-2xl border border-gray-100 dark:border-gray-800/60 shadow-inner min-w-[280px] divide-y divide-gray-200 dark:divide-gray-800 flex-shrink-0">
                <div className="flex justify-between items-center p-4">
                  <span className="text-base font-bold text-gray-500 dark:text-gray-400">活动状态</span>
                  <span className={`text-base font-bold tracking-wider ${status === '进行中' ? 'text-green-500' : status === '已结束' ? 'text-gray-500' : 'text-blue-500'}`}>
                    {status}
                  </span>
                </div>
                {status === "进行中" && (
                  <>
                     <div className="flex justify-between items-center p-4">
                       <span className="text-base text-gray-500 dark:text-gray-400">最新分数</span>
                       <span className="text-base font-bold text-blue-500">{latestScore !== null ? new Intl.NumberFormat().format(latestScore) : "-"}</span>
                     </div>
                     <div className="flex justify-between items-center p-4">
                       <span className="text-base text-gray-500 dark:text-gray-400">更新时间</span>
                       {latestUpdateTime !== null
                         ? <MinutesAgo timestamp={latestUpdateTime} />
                         : <span className="text-base font-medium text-gray-600 dark:text-gray-300">-</span>
                       }
                     </div>
                  </>
                )}
                {status === "已结束" && (
                  <>
                     <div className="flex justify-between items-center p-4">
                       <span className="text-base text-gray-500 dark:text-gray-400">结束分数</span>
                       <span className="text-base font-bold text-gray-700 dark:text-gray-300">{endScore !== null ? new Intl.NumberFormat().format(endScore) : "结算中"}</span>
                     </div>
                     <div className="flex justify-between items-center p-4">
                       <span className="text-base text-gray-500 dark:text-gray-400">最终分数</span>
                       <div className="flex items-center gap-1.5">
                         <span className="text-base font-bold text-gray-700 dark:text-gray-300">
                           {finalScore !== null ? new Intl.NumberFormat().format(finalScore) : "结算中"}
                         </span>
                         {finalScore !== null && endScore !== null && finalScore < endScore && (
                           <span className="text-sm font-bold text-red-500">
                             (-{new Intl.NumberFormat().format(endScore - finalScore)})
                           </span>
                         )}
                       </div>
                     </div>
                  </>
                )}
              </div>
            </div>

            <Tabs.Content value={trackingMode} className="outline-none focus:outline-none w-full animate-in fade-in zoom-in-95 duration-500">
              <div className="mt-2 relative bg-[#F9FBFC] dark:bg-[#0C111C] p-1 sm:p-4 rounded-2xl border border-gray-100 dark:border-gray-800/60 shadow-inner">
                
                {loading && (
                   <div className="absolute inset-0 bg-white/50 dark:bg-[#0C111C]/50 backdrop-blur-sm z-30 flex items-center justify-center rounded-2xl">
                     <div className="flex flex-col items-center">
                       <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                       <p className="mt-4 text-sm font-semibold text-blue-600 animate-pulse">Fetching latest scores...</p>
                     </div>
                   </div>
                )}

                <div className="h-[400px] w-full relative group">
                  <div 
                    ref={scrollContainerRef}
                    className="w-full h-full overflow-x-auto overflow-y-hidden rounded-xl styling-scrollbar relative"
                  >
                    <div style={{ minWidth: `${zoomLevel * 100}%`, height: '100%', transition: 'min-width 0.3s ease-out' }}>
                      {finalDisplayedData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={finalDisplayedData} margin={{ top: 20, right: 5, left: 0, bottom: 20 }}>
                            <CartesianGrid vertical={false} stroke="#374151" opacity={0.15} />

                            
                            {midnights.map(m => (
                              <ReferenceLine 
                                key={m} 
                                x={m} 
                                stroke="#D1D5DB" 
                                opacity={0.6}
                              />
                            ))}

                            <XAxis 
                              dataKey="time" 
                              domain={[domainStart, domainEnd]}
                              type="number"
                              ticks={midnights}
                              tickFormatter={(unixTime) => format(unixTime, "MM/dd")}
                              stroke="#6B7280"
                              fontSize={12}
                              tickLine={false}
                              axisLine={false}
                              dy={10}
                            />
                            <YAxis 
                              stroke="#6B7280"
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                              width={45}
                              ticks={yTicks}
                              type="number"
                              domain={yDomainInfo}
                              tickFormatter={(value) => {
                                if (value === 0) return "0";
                                if (value % 1000000 === 0 && value >= 1000000) return (value / 1000000) + "M";
                                if (value % 100000 === 0 && value >= 1000000) return (value / 1000000).toFixed(1) + "M"; 
                                if (value >= 1000) return (value / 1000) + "K";
                                return value.toString();
                              }}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#9CA3AF', strokeWidth: 1, strokeDasharray: '4 4' }} />
                            <Line 
                              type="linear" 
                              dataKey="ep" 
                              stroke="#3B82F6" 
                              strokeWidth={2}
                              strokeOpacity={0.6}
                              dot={{ r: 2.5, fill: '#3B82F6', strokeWidth: 0 }}
                              activeDot={(props: any) => {
                                const { cx, cy, payload } = props;
                                if (payload.isProjection || isNaN(cx) || isNaN(cy)) return <circle cx={0} cy={0} r={0} stroke="none" />;
                                return <circle cx={cx} cy={cy} r={6} fill="#3B82F6" stroke="none" />;
                              }}
                              isAnimationActive={false}
                            />

                            {showInstantProjection && (
                              <Line 
                                type="linear" 
                                dataKey="instantEp" 
                                stroke="#ef4444" 
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                dot={(props: any) => {
                                  const { cx, cy, payload, index } = props;
                                  if (payload.isProjection) {
                                    return <circle key={`dot-instant-${index}`} cx={cx} cy={cy} r={2.5} fill="#ef4444" stroke="none" />;
                                  }
                                  return <circle key={`dot-hidden-instant-${index}`} cx={cx} cy={cy} r={0} stroke="none" />;
                                }}
                                activeDot={(props: any) => {
                                  const { cx, cy, payload } = props;
                                  if (!payload.isProjection || isNaN(cx) || isNaN(cy)) return <circle cx={0} cy={0} r={0} stroke="none" />;
                                  return <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="none" />;
                                }}
                                isAnimationActive={false}
                              />
                            )}

                            {showDayProjection && (
                              <Line 
                                type="linear" 
                                dataKey="dayEp" 
                                stroke="#3b82f6" 
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                dot={(props: any) => {
                                  const { cx, cy, payload, index } = props;
                                  if (payload.isProjection) {
                                    return <circle key={`dot-day-${index}`} cx={cx} cy={cy} r={2.5} fill="#3b82f6" stroke="none" />;
                                  }
                                  return <circle key={`dot-hidden-day-${index}`} cx={cx} cy={cy} r={0} stroke="none" />;
                                }}
                                activeDot={(props: any) => {
                                  const { cx, cy, payload } = props;
                                  if (!payload.isProjection || isNaN(cx) || isNaN(cy)) return <circle cx={0} cy={0} r={0} stroke="none" />;
                                  return <circle cx={cx} cy={cy} r={6} fill="#3b82f6" stroke="none" />;
                                }}
                                isAnimationActive={false}
                              />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                          {loading ? null : (
                            <>
                              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              <p>No tracking data available for this tier yet.</p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Zoom Controls Overlay - Transparent Vertical Float */}
                  <div className="absolute top-[70%] right-4 -translate-y-1/2 flex flex-col gap-2 z-20 transition-opacity opacity-70 hover:opacity-100 mix-blend-difference dark:mix-blend-normal">
                    <button 
                      onClick={() => setZoomLevel(prev => Math.min(10, prev + 1))}
                      className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 rounded-full transition-transform hover:scale-110 active:scale-95 bg-white/20 dark:bg-black/20 backdrop-blur-sm"
                      title="Zoom In"
                    >
                      <ZoomIn size={22} strokeWidth={2.5} />
                    </button>
                    
                    <button 
                      onClick={() => setZoomLevel(prev => Math.max(1, prev - 1))}
                      className={`p-1.5 rounded-full transition-all hover:scale-110 active:scale-95 bg-white/20 dark:bg-black/20 backdrop-blur-sm ${zoomLevel <= 1 ? 'text-gray-300/50 dark:text-gray-700/50 cursor-not-allowed hidden' : 'text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400'}`}
                      disabled={zoomLevel <= 1}
                      title="Zoom Out"
                    >
                      <ZoomOut size={22} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {status === "进行中" && (
                  <div className="px-1 pt-4 sm:px-2">
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                      <button
                        type="button"
                        aria-pressed={showInstantProjection}
                        onClick={() => setShowInstantProjection((prev) => !prev)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                          showInstantProjection
                            ? "border-red-300 bg-red-50 text-red-600 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
                            : "border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400"
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            showInstantProjection ? "bg-red-500" : "bg-gray-300 dark:bg-gray-600"
                          }`}
                        />
                        线性投影（瞬时）
                      </button>

                      <button
                        type="button"
                        aria-pressed={showDayProjection}
                        onClick={() => setShowDayProjection((prev) => !prev)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                          showDayProjection
                            ? "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                            : "border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400"
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            showDayProjection ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                          }`}
                        />
                        线性投影（24h）
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
