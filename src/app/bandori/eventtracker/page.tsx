"use client";

import { useState, useEffect } from "react";
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

type TrackerData = {
  time: number;
  ep: number;
};

type EventMetadata = {
  eventType: string;
  eventName: string[];
  bannerAssetBundleName: string;
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
      .then((data: TrackerData[]) => {
        if (active) {
          setChartData(data);
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
  const bannerUrl = eventMeta?.bannerAssetBundleName 
    ? `https://bestdori.com/assets/cn/event/${eventMeta.bannerAssetBundleName}/images_rip/banner.png`
    : "";
    
  const startDate = eventMeta?.startAt[3] ? parseInt(eventMeta.startAt[3]) : null;
  const endDate = eventMeta?.endAt[3] ? parseInt(eventMeta.endAt[3]) : null;

  const progress = (startDate && endDate) 
    ? Math.min(100, Math.max(0, ((Date.now() - startDate) / (endDate - startDate)) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#0A0E17] text-gray-800 dark:text-gray-100 p-6 sm:p-10 font-sans transition-colors duration-300">
      
      {/* Header Container */}
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-[#131A2B] rounded-3xl shadow-xl shadow-blue-500/5 dark:shadow-blue-500/10 border border-gray-100 dark:border-gray-800 p-8">
          
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
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
                   <div className="absolute inset-0 bg-white/50 dark:bg-[#0C111C]/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
                     <div className="flex flex-col items-center">
                       <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                       <p className="mt-4 text-sm font-semibold text-blue-600 animate-pulse">Fetching latest scores...</p>
                     </div>
                   </div>
                )}

                <div className="h-[400px] w-full">
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
                          domain={["auto", "auto"]}
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
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(8px)',
                            color: '#1F2937',
                            padding: '12px 16px',
                          }}
                          labelFormatter={(label) => format(label, "PPpp")}
                          formatter={(value: number) => [new Intl.NumberFormat().format(value), "Event Points"]}
                        />
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
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
