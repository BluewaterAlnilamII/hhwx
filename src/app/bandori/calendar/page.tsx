"use client";

import { useState, useCallback } from "react";
import { useCalendarData, useCalendarPermission, BAND_COLORS } from "./useCalendarData";
import CalendarGrid from "./CalendarGrid";
import EventEditor from "./EventEditor";
import { CALENDAR_BAND_OPTIONS } from "./options";
import Toolbar from "@/components/Toolbar";

function getReadableTextColor(hexColor: string): string {
  if (hexColor.toLowerCase() === BAND_COLORS.hhw.toLowerCase()) {
    return "#FFFFFF";
  }

  const normalized = hexColor.replace("#", "");
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 170 ? "#1F2937" : "#FFFFFF";
}

export default function CalendarPage() {
  const { allEvents, calendarEvents, loading, refresh } = useCalendarData();
  const hasPermission = useCalendarPermission();
  const [showIcsModal, setShowIcsModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedBands, setSelectedBands] = useState<string[]>([]);

  const handleSaved = useCallback(() => {
    refresh();
  }, [refresh]);

  // 构建 ICS 订阅 URL
  const icsUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/calendar/ics${selectedBands.length > 0 ? `?bands=${encodeURIComponent(selectedBands.join(","))}` : ""}`
    : "/api/calendar/ics";

  const toggleBand = useCallback((band: string) => {
    setSelectedBands((prev) => (
      prev.includes(band)
        ? prev.filter((item) => item !== band)
        : [...prev, band]
    ));
  }, []);

  const handleCopyIcs = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(icsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 回退方案
      const input = document.createElement("input");
      input.value = icsUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [icsUrl]);

  return (
    <div className="relative z-10 min-h-screen px-4 py-8 md:px-6 lg:px-8">
      <Toolbar showDebugButton={false} />

      <div className="max-w-5xl mx-auto">
        {/* 页面标题 */}
        <div className="text-center mb-8 pt-4 md:pt-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-wide text-gray-900 mb-2">Bandori 国服活动日历</h1>
          <p className="text-sm md:text-base text-gray-700">查看国服活动时间安排，并订阅会自动更新的日历</p>
        </div>

        {/* 工具栏：订阅按钮 */}
        <div className="flex justify-end mb-5 gap-2">
          <button
            onClick={() => setShowIcsModal(!showIcsModal)}
            className="px-4 py-2 rounded-xl bg-white/75 hover:bg-white shadow-sm backdrop-blur text-sm font-semibold transition-colors flex items-center gap-2 text-gray-800"
          >
            📅 订阅日历
          </button>
        </div>

        {/* ICS 订阅弹窗 */}
        {showIcsModal && (
          <div className="mb-6 p-5 rounded-2xl bg-white/80 backdrop-blur-md shadow-[0_10px_40px_rgba(0,0,0,0.12)] ring-1 ring-white/70">
            <p className="text-sm font-bold mb-3 text-gray-800">订阅日历 URL</p>
            <div className="mb-4">
              <p className="text-xs md:text-sm text-gray-700 mb-2 font-medium">选择要订阅的乐队内容</p>
              <div className="flex flex-wrap gap-2">
                {CALENDAR_BAND_OPTIONS.map((option) => {
                  const checked = selectedBands.includes(option.value);
                  const bandColor = BAND_COLORS[option.value] ?? BAND_COLORS.mix;
                  return (
                    <label
                      key={option.value}
                      className={`px-3 py-1.5 rounded-full text-xs md:text-sm cursor-pointer transition-colors border ${
                        checked
                          ? "shadow-sm"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      }`}
                      style={checked ? {
                        backgroundColor: bandColor,
                        borderColor: bandColor,
                        color: getReadableTextColor(bandColor),
                      } : undefined}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleBand(option.value)}
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">不勾选任何乐队时，订阅链接会包含全部活动。</p>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={icsUrl}
                readOnly
                className="flex-1 text-xs md:text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white/90 text-gray-700"
              />
              <button
                onClick={handleCopyIcs}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  copied
                    ? "bg-green-500 text-white"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                {copied ? "已复制" : "复制"}
              </button>
            </div>
            <p className="text-xs md:text-sm text-gray-600 leading-6">
              将此链接添加到您的日历应用（Google Calendar、Apple Calendar 等）以自动同步活动日程。
              活动以全天事件形式显示，不包含具体时间点。
            </p>
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="text-center py-12 text-gray-500">
            加载中...
          </div>
        )}

        {/* 日历 */}
        {!loading && <CalendarGrid events={calendarEvents} />}

        {/* 编辑按钮（仅有权限用户可见） */}
        {hasPermission && !loading && (
          <EventEditor allEvents={allEvents} onSaved={handleSaved} />
        )}
      </div>
    </div>
  );
}
