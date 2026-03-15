"use client";

import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import * as Tabs from "@radix-ui/react-tabs";
import { ZoomIn, ZoomOut } from "lucide-react";

type TrackerData = {
  time: number;
  ep: number;
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
  startAt: number;
};

const EVENT_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 40000, 50000, 70000, 100000];
const SONG_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000];
const MONTHLY_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 500, 1000, 2000, 3000, 4000];

export default function EventTrackerPage() {
  const [currentEventId, setCurrentEventId] = useState<number>(302);
  const [eventMeta, setEventMeta] = useState<EventMetadata | null>(null);
  
  const [trackingMode, setTrackingMode] = useState<"event" | "song" | "monthly">("event");
  const [selectedTier, setSelectedTier] = useState<number>(1000);
  
  const [chartData, setChartData] = useState<TrackerData[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [zoomLevel, setZoomLevel] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [allEvents, setAllEvents] = useState<MinimalEvent[]>([]);
  const [ticker, setTicker] = useState(0);

  // Real-time refresh for minutes ago
  useEffect(() => {
    const interval = setInterval(() => setTicker(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

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
            const cnName = ev.eventName?.[3];
            if (cnName) {
              eventsList.push({
                id: parseInt(idStr),
                name: cnName,
                startAt: ev.startAt?.[3] ? parseInt(ev.startAt[3]) : 0
              });
            }
          });
          // Sort descending by ID (newest first)
          eventsList.sort((a, b) => b.id - a.id);
          setAllEvents(eventsList);
        }
      })
      .catch(err => console.error("Error fetching all events list:", err));
  }, []);

  // Reset zoom when tracking mode changes
  useEffect(() => {
    setZoomLevel(1);
  }, [trackingMode]);

  // Fetch Tracker Data
  useEffect(() => {
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
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error fetching tracker data:", err);
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [currentEventId, trackingMode, selectedTier]);

  const cnEventName = eventMeta?.eventName[3] || "Loading Event...";
  const bannerUrl = eventMeta?.assetBundleName 
    ? `https://bestdori.com/assets/cn/event/${eventMeta.assetBundleName}/images_rip/banner.png`
    : "";
    
  const startDate = eventMeta?.startAt[3] ? parseInt(eventMeta.startAt[3]) : null;
  const endDate = eventMeta?.endAt[3] ? parseInt(eventMeta.endAt[3]) : null;

  const progress = (startDate && endDate) 
    ? Math.min(100, Math.max(0, ((Date.now() - startDate) / (endDate - startDate)) * 100))
    : 0;

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

  // 最右侧强锁定事件结束
  const displayedData = chartData.filter(d => cutoffEnd === null || d.time <= cutoffEnd);

  // XAxis 2% padding
  let paddedDomainStart = domainStart;
  let paddedDomainEnd = domainEnd;
  
  if (typeof domainStart === "number" && typeof domainEnd === "number") {
    const duration = domainEnd - domainStart;
    const paddingMs = duration * 0.02; // 2% 留白
    paddedDomainStart = domainStart - paddingMs;
    paddedDomainEnd = domainEnd + paddingMs;
  }

  // 自定义 Y 轴 Ticks 生成器
  const generateYTicks = () => {
    if (displayedData.length === 0) return undefined;
    
    let minEp = trackingMode === "monthly" ? 2500 : 0;
    let maxEp = minEp;
    for (const d of displayedData) {
      if (d.ep > maxEp) maxEp = d.ep;
    }
    
    // 自动计算理想步进 (Nice steps: 1, 2, 5 * 10^n)
    const range = Math.max(maxEp - minEp, 100); // 至少 100
    const roughStep = range / 8; // 最多 8-10 格
    
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

  const nowTime = Date.now();
  let status = "未开始";
  if (domainStart !== "auto" && domainEnd !== "auto") {
    if (nowTime < (domainStart as number)) status = "未开始";
    else if (nowTime > (domainEnd as number)) status = "已结束";
    else status = "进行中";
  }

  // Helper to extract data near a target timestamp
  const getScoreAtTime = (targetTime: number, toleranceMs = 5 * 60 * 1000) => {
    let best = null;
    let minDiff = Infinity;
    for (const pt of chartData) {
      const diff = Math.abs(pt.time - targetTime);
      if (diff < minDiff && diff <= toleranceMs) {
        minDiff = diff;
        best = pt.ep;
      }
    }
    return best;
  };

  let latestScore: number | null = null;
  let updateMinutesAgo = -1;
  let endScore: number | null = null;
  let finalScore: number | null = null;

  if (chartData.length > 0) {
    const latestPt = chartData[chartData.length - 1];
    latestScore = latestPt.ep;
    updateMinutesAgo = Math.floor((nowTime - latestPt.time) / 60000);

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
      const currentPoint = payload[0].payload;
      
      const currentIndex = chartData.findIndex((d) => d.time === currentPoint.time);
      let speedRender = null;
      
      if (trackingMode === "event" && currentIndex > 0) {
        const prevPoint = chartData[currentIndex - 1];
        const dtHours = (currentPoint.time - prevPoint.time) / (1000 * 60 * 60);
        const dEp = currentPoint.ep - prevPoint.ep;
        if (dtHours > 0) {
          const speed = Math.round(dEp / dtHours);
          speedRender = (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50">
               <span className="text-xs font-bold text-gray-400 mr-2">SPEED</span>
               <span className="text-[#f43f5e] font-bold text-sm">+{new Intl.NumberFormat().format(speed)} EP/hr</span>
            </div>
          );
        }
      }

      return (
        <div className="bg-white/90 backdrop-blur-xl p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/40 dark:bg-[#131A2B]/90 dark:border-gray-800 min-w-[180px]">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{format(label, "PPpp")}</p>
          <div className="flex items-end gap-2">
            <span className="text-blue-500 font-extrabold text-2xl leading-none">
              {new Intl.NumberFormat().format(currentPoint.ep)}
            </span>
            <span className="text-sm font-bold text-blue-500/70 mb-0.5">EP</span>
          </div>
          {speedRender}
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <h1 className="text-3xl font-extrabold text-[#f43f5e]">
                {cnEventName}
              </h1>
              {allEvents.length > 0 && (
                <select 
                  className="bg-gray-100 dark:bg-[#0C111C] border border-gray-200 dark:border-gray-700/50 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-[#f43f5e] focus:outline-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors shadow-sm max-w-[280px] text-ellipsis"
                  value={currentEventId}
                  onChange={(e) => setCurrentEventId(parseInt(e.target.value))}
                >
                  <option disabled value="">切换往期活动...</option>
                  {allEvents.map(ev => (
                    <option key={ev.id} value={ev.id}>
                      第 {ev.id} 期: {ev.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {startDate && endDate ? (
                <>
                  <p>Start: {format(startDate, "MMM do yyyy, HH:mm")} (CN)</p>
                  <p>End: {format(endDate, "MMM do yyyy, HH:mm")} (CN)</p>
                </>
              ) : (
                <p>Loading dates...</p>
              )}
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

        {/* Status Bar */}
        {startDate && endDate && (
          <div className="bg-white dark:bg-[#131A2B] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex justify-between text-sm font-semibold mb-2">
              <span className="text-blue-500">Event Progress</span>
              <span>{progress.toFixed(1)}% Completed</span>
            </div>
            <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
               <div 
                 className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-1000 ease-out"
                 style={{ width: `${progress}%` }}
               />
            </div>
          </div>
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
                       <span className="text-base font-medium text-gray-600 dark:text-gray-300">{updateMinutesAgo >= 0 ? `${updateMinutesAgo}分钟前` : "-"}</span>
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
                       <span className="text-base font-bold text-gray-700 dark:text-gray-300">{finalScore !== null ? new Intl.NumberFormat().format(finalScore) : "结算中"}</span>
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
                      {displayedData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={displayedData} margin={{ top: 20, right: 0, left: 0, bottom: 20 }}>
                            <defs>
                              <linearGradient id="colorEp" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.15} />
                            
                            {midnights.map(m => (
                              <ReferenceLine 
                                key={m} 
                                x={m} 
                                stroke="#D1D5DB" 
                                strokeDasharray="3 3" 
                                opacity={0.6}
                              />
                            ))}

                            <XAxis 
                              dataKey="time" 
                              domain={[paddedDomainStart, paddedDomainEnd]}
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
                              type="monotone" 
                              dataKey="ep" 
                              stroke="#3B82F6" 
                              strokeWidth={3}
                              dot={false}
                              activeDot={{ r: 6, strokeWidth: 0, fill: '#3B82F6' }}
                              animationDuration={1500}
                            />
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
                  <div className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-2 z-20 transition-opacity opacity-70 hover:opacity-100 mix-blend-difference dark:mix-blend-normal">
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
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
