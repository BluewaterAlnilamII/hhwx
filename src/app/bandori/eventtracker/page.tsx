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
  
  if (trackingMode === "monthly") {
    const now = new Date();
    domainStart = new Date(now.getFullYear(), now.getMonth(), 1, 13, 0, 0).getTime();
    domainEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime(); // Last day of that month 24:00
  } else if (startDate && endDate) {
    domainStart = startDate;
    domainEnd = endDate;
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
    <div className="min-h-screen text-gray-800 dark:text-gray-100 p-6 sm:p-10 font-sans relative z-10">
      
      {/* Header Container */}
      <div className="max-w-5xl mx-auto space-y-8 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-[#131A2B] rounded-3xl shadow-xl shadow-blue-500/5 dark:shadow-blue-500/10 border border-gray-100 dark:border-gray-800 p-8 relative z-20">
          
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl font-extrabold text-[#f43f5e]">
              {cnEventName}
            </h1>
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
        <div className="bg-white/80 dark:bg-[#131A2B]/80 backdrop-blur-xl rounded-3xl p-6 md:p-8 shadow-xl border border-white/20 dark:border-gray-800">
          <Tabs.Root 
            value={trackingMode} 
            onValueChange={(val: string) => setTrackingMode(val as any)}
            className="w-full flex flex-col space-y-8"
          >
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
              <Tabs.List className="flex items-center p-1.5 bg-gray-100/80 dark:bg-gray-900/50 rounded-2xl shadow-inner">
                {["event", "song", "monthly"].map((mode) => (
                  <Tabs.Trigger
                    key={mode}
                    value={mode}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all duration-300
                      data-[state=active]:bg-white data-[state=active]:dark:bg-gray-800 
                      data-[state=active]:text-blue-600 data-[state=active]:dark:text-blue-400
                      data-[state=active]:shadow-md data-[state=inactive]:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {mode} Score
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {/* Tier Selection */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mr-2">Select Tier</span>
                {(trackingMode === "event" ? EVENT_TIERS : trackingMode === "song" ? SONG_TIERS : MONTHLY_TIERS).map(tier => (
                  <button
                    key={tier}
                    onClick={() => setSelectedTier(tier)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 ${
                      selectedTier === tier 
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-[#131A2B] scale-105" 
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105"
                    }`}
                  >
                    T{tier}
                  </button>
                ))}
              </div>
            </div>

            <Tabs.Content value={trackingMode} className="outline-none focus:outline-none w-full animate-in fade-in zoom-in-95 duration-500">
              <div className="mt-4 relative bg-[#F9FBFC] dark:bg-[#0C111C] p-6 rounded-2xl border border-gray-100 dark:border-gray-800/60 shadow-inner">
                
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
                      {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                            <defs>
                              <linearGradient id="colorEp" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.15} />
                            <XAxis 
                              dataKey="time" 
                              domain={[domainStart, domainEnd]}
                              type="number"
                              tickFormatter={(unixTime) => format(unixTime, "MM/dd HH:mm")}
                              stroke="#6B7280"
                              fontSize={12}
                              tickLine={false}
                              axisLine={false}
                              dy={10}
                            />
                            <YAxis 
                              stroke="#6B7280"
                              fontSize={12}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(value)}
                            />
                            <Tooltip content={<CustomTooltip />} />
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
