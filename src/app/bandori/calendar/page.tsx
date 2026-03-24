"use client";

import { useState, useCallback, useMemo } from "react";
import { useCalendarData, useCalendarPermission, BAND_COLORS } from "./useCalendarData";
import CalendarGrid from "./CalendarGrid";
import EventEditor from "./EventEditor";
import { CALENDAR_BAND_OPTIONS } from "./options";
import Toolbar from "@/components/Toolbar";
import {
  buildStampCharacterOptions,
  CALENDAR_BAND_ORDER,
  CalendarBandType,
  getBandTypeByBandId,
  getCharacterDisplayName,
  getCharacterIconUrl,
} from "@/lib/calendar-character-service";

const DEFAULT_START_PREVIOUS_DAY_REMINDER_TIME = "21:00";
const DEFAULT_START_SAME_DAY_REMINDER_TIME = "14:30";
const DEFAULT_END_PREVIOUS_DAY_REMINDER_TIME = "21:00";
const DEFAULT_END_SAME_DAY_REMINDER_TIME = "17:00";
const DEFAULT_REMINDER_FLAG_TOKEN = "f";
const DEFAULT_REMINDER_TIMES = [
  DEFAULT_START_PREVIOUS_DAY_REMINDER_TIME,
  DEFAULT_START_SAME_DAY_REMINDER_TIME,
  DEFAULT_END_PREVIOUS_DAY_REMINDER_TIME,
  DEFAULT_END_SAME_DAY_REMINDER_TIME,
];
const REMINDER_HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const REMINDER_MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

function encodeMask(selectedValues: Array<string | number>, universe: Array<string | number>): string {
  const selectedSet = new Set(selectedValues.map((value) => String(value)));
  let mask = BigInt(0);

  universe.forEach((value, index) => {
    if (selectedSet.has(String(value))) {
      mask |= BigInt(1) << BigInt(index);
    }
  });

  return mask.toString(36);
}

function encodeReminderFlagToken(flags: boolean[]): string {
  let mask = 0;
  flags.forEach((flag, index) => {
    if (flag) {
      mask |= 1 << index;
    }
  });
  return mask.toString(36);
}

function encodeReminderState(flags: boolean[], times: string[]): string {
  const packedTimes = times.reduce((accumulator, time) => {
    const [hour, minute] = time.split(":").map(Number);
    return accumulator * BigInt(1440) + BigInt(hour * 60 + minute);
  }, BigInt(0));

  const flagToken = encodeReminderFlagToken(flags);
  const timeToken = packedTimes.toString(36);
  return `${flagToken}${timeToken !== "0" ? `.${timeToken}` : ""}`;
}

function TimeSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [hour = "00", minute = "00"] = value.split(":");

  return (
    <div className="mt-3 flex items-center gap-2">
      <select
        value={hour}
        onChange={(event) => onChange(`${event.target.value}:${minute}`)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 disabled:bg-gray-100"
        disabled={disabled}
      >
        {REMINDER_HOURS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="text-sm font-semibold text-gray-500">:</span>
      <select
        value={minute}
        onChange={(event) => onChange(`${hour}:${event.target.value}`)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 disabled:bg-gray-100"
        disabled={disabled}
      >
        {REMINDER_MINUTES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

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
  const { allEvents, allCharacters, calendarEvents, loading, refresh } = useCalendarData();
  const hasPermission = useCalendarPermission();
  const [showIcsModal, setShowIcsModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedBands, setSelectedBands] = useState<string[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>([]);
  const [enableStartPreviousDayReminder, setEnableStartPreviousDayReminder] = useState(true);
  const [enableStartSameDayReminder, setEnableStartSameDayReminder] = useState(true);
  const [enableEndPreviousDayReminder, setEnableEndPreviousDayReminder] = useState(true);
  const [enableEndSameDayReminder, setEnableEndSameDayReminder] = useState(true);
  const [startPreviousDayReminderTime, setStartPreviousDayReminderTime] = useState(DEFAULT_START_PREVIOUS_DAY_REMINDER_TIME);
  const [startSameDayReminderTime, setStartSameDayReminderTime] = useState(DEFAULT_START_SAME_DAY_REMINDER_TIME);
  const [endPreviousDayReminderTime, setEndPreviousDayReminderTime] = useState(DEFAULT_END_PREVIOUS_DAY_REMINDER_TIME);
  const [endSameDayReminderTime, setEndSameDayReminderTime] = useState(DEFAULT_END_SAME_DAY_REMINDER_TIME);

  const handleSaved = useCallback(() => {
    refresh();
  }, [refresh]);

  const stampCharacterOptions = useMemo(() => buildStampCharacterOptions(allCharacters), [allCharacters]);
  const bandUniverse = useMemo(() => CALENDAR_BAND_OPTIONS.map((option) => option.value), []);
  const characterUniverse = useMemo(() => stampCharacterOptions.map((option) => option.id), [stampCharacterOptions]);
  const characterNameById = useMemo(() => {
    const mapped = new Map<number, string>();

    allCharacters.forEach((character) => {
      mapped.set(character.character_id, getCharacterDisplayName(character) ?? `角色 ${character.character_id}`);
    });

    return mapped;
  }, [allCharacters]);

  const characterIdsByBand = useMemo(() => {
    const entries: Array<[string, number[]]> = CALENDAR_BAND_ORDER.map((bandType) => [bandType, []]);
    const grouped = new Map<string, number[]>(entries);

    stampCharacterOptions.forEach((option) => {
      const bandType = getBandTypeByBandId(option.bandId);
      if (bandType === "mix") {
        return;
      }

      grouped.get(bandType)?.push(option.id);
    });

    return grouped;
  }, [stampCharacterOptions]);

  const characterCards = useMemo(() => {
    return stampCharacterOptions
      .map((option) => {
        const bandType = getBandTypeByBandId(option.bandId);
        if (bandType === "mix") {
          return null;
        }

        return {
          id: option.id,
          bandType,
          name: characterNameById.get(option.id) ?? option.name,
          iconUrl: getCharacterIconUrl(option.id),
        };
      })
      .filter((character): character is {
        id: number;
        bandType: Exclude<CalendarBandType, "mix">;
        name: string;
        iconUrl: string;
      } => character !== null);
  }, [characterNameById, stampCharacterOptions]);

  const selectedBandSet = useMemo(() => new Set(selectedBands), [selectedBands]);
  const selectedCharacterSet = useMemo(() => new Set(selectedCharacterIds), [selectedCharacterIds]);

  const icsUrl = useMemo(() => {
    const params = new URLSearchParams();

    if (selectedBands.length > 0 || selectedCharacterIds.length > 0) {
      const bandToken = encodeMask(selectedBands, bandUniverse);
      const characterToken = encodeMask(selectedCharacterIds, characterUniverse);
      params.set("s", `${bandToken}.${characterToken}`);
    }
    const reminderFlagToken = encodeReminderFlagToken([
      enableStartPreviousDayReminder,
      enableStartSameDayReminder,
      enableEndPreviousDayReminder,
      enableEndSameDayReminder,
    ]);

    const reminderTimes = [
      startPreviousDayReminderTime,
      startSameDayReminderTime,
      endPreviousDayReminderTime,
      endSameDayReminderTime,
    ];
    if (
      reminderFlagToken !== DEFAULT_REMINDER_FLAG_TOKEN ||
      reminderTimes.some((time, index) => time !== DEFAULT_REMINDER_TIMES[index])
    ) {
      params.set("r", encodeReminderState([
        enableStartPreviousDayReminder,
        enableStartSameDayReminder,
        enableEndPreviousDayReminder,
        enableEndSameDayReminder,
      ], reminderTimes));
    }

    const query = params.toString();
    const path = `/api/bandori/calendar/cn/ics.ics${query ? `?${query}` : ""}`;
    return typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  }, [
    bandUniverse,
    characterUniverse,
    enableEndPreviousDayReminder,
    enableEndSameDayReminder,
    enableStartPreviousDayReminder,
    enableStartSameDayReminder,
    endPreviousDayReminderTime,
    endSameDayReminderTime,
    selectedBands,
    selectedCharacterIds,
    startPreviousDayReminderTime,
    startSameDayReminderTime,
  ]);

  const toggleBand = useCallback((band: string) => {
    const relatedCharacterIds = characterIdsByBand.get(band) ?? [];

    setSelectedBands((prevBands) => {
      const hasBandSelected = prevBands.includes(band);

      setSelectedCharacterIds((prevCharacterIds) => {
        if (hasBandSelected) {
          return prevCharacterIds.filter((id) => !relatedCharacterIds.includes(id));
        }

        return [...new Set([...prevCharacterIds, ...relatedCharacterIds])];
      });

      return hasBandSelected
        ? prevBands.filter((item) => item !== band)
        : [...prevBands, band];
    });
  }, [characterIdsByBand]);

  const toggleCharacter = useCallback((characterId: number, bandType: string) => {
    setSelectedCharacterIds((prevCharacterIds) => {
      const isSelected = prevCharacterIds.includes(characterId);
      const nextCharacterIds = isSelected
        ? prevCharacterIds.filter((id) => id !== characterId)
        : [...prevCharacterIds, characterId];

      if (isSelected) {
        setSelectedBands((prevBands) => prevBands.filter((item) => item !== bandType));
      }

      return nextCharacterIds;
    });
  }, []);

  const handleSelectAllBands = useCallback(() => {
    setSelectedBands(CALENDAR_BAND_OPTIONS.map((option) => option.value));
    setSelectedCharacterIds(stampCharacterOptions.map((option) => option.id));
  }, [stampCharacterOptions]);

  const handleClearBands = useCallback(() => {
    setSelectedBands([]);
    setSelectedCharacterIds([]);
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
        <div className="mb-8 pt-4 md:pt-8">
          <div className="px-2 py-4 text-center md:px-4">
            <h1 className="mb-2 text-3xl font-black tracking-[0.08em] text-[#38bdf8] md:text-5xl">
              BanGDream 国服活动日历
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-6 text-[#24506d] md:text-base">
              查看国服活动时间安排，并生成可自动更新的日历订阅链接
            </p>
          </div>
        </div>

        {/* 工具栏：订阅按钮 */}
        <div className="flex justify-end mb-5 gap-2">
          <button
            onClick={() => setShowIcsModal(!showIcsModal)}
            className="flex items-center gap-2 rounded-xl border border-[#ffd36a] bg-gradient-to-r from-[#ffe97a] via-[#ffd95c] to-[#ffc94f] px-4 py-2 text-sm font-semibold text-[#6f3d00] shadow-[0_10px_24px_rgba(255,196,79,0.28)] transition-opacity hover:opacity-95"
          >
            📅 订阅日历
          </button>
        </div>

        {/* ICS 订阅弹窗 */}
        {showIcsModal && (
          <div className="mb-6 rounded-2xl border border-white/75 bg-gradient-to-br from-white/85 via-[#fff8d8]/78 to-[#eef9ff]/82 p-5 backdrop-blur-md shadow-[0_14px_40px_rgba(255,184,0,0.16)] ring-1 ring-white/65">
            <p className="mb-3 text-sm font-bold text-[#7a4a00]">BanGDream 国服活动</p>
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs md:text-sm text-gray-700 font-medium">选择要订阅的乐队</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllBands}
                    className="rounded-full bg-gradient-to-r from-[#ff7a59] to-[#ff9b45] px-3 py-1 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={handleClearBands}
                    className="rounded-full border border-[#ffd89c] bg-white text-[#8a5a10] px-3 py-1 text-xs font-semibold transition-colors hover:bg-[#fff8ec]"
                  >
                    全部取消
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {CALENDAR_BAND_OPTIONS.map((option) => {
                  const checked = selectedBandSet.has(option.value);
                  const bandColor = BAND_COLORS[option.value as keyof typeof BAND_COLORS] ?? BAND_COLORS.mix;
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
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs md:text-sm text-gray-700 font-medium">选择要订阅的角色表情</p>
                  <p className="text-[11px] md:text-xs text-gray-500">
                    已选 {selectedBands.length} 个乐队 / {selectedCharacterIds.length} 个角色
                  </p>
                </div>
                <div className="mt-3 rounded-2xl border border-white/70 bg-white/65 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-wrap gap-2">
                    {characterCards.map((character) => {
                      const checked = selectedCharacterSet.has(character.id);
                      const bandColor = BAND_COLORS[character.bandType as keyof typeof BAND_COLORS] ?? BAND_COLORS.mix;

                      return (
                        <button
                          key={character.id}
                          type="button"
                          onClick={() => toggleCharacter(character.id, character.bandType)}
                          className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border bg-white transition-all ${
                            checked
                              ? "scale-[1.05] shadow-lg"
                              : "border-gray-200 hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-sm"
                          }`}
                          style={checked ? {
                            borderColor: bandColor,
                            background: `linear-gradient(180deg, ${bandColor}18 0%, #ffffff 55%)`,
                            boxShadow: `0 0 0 3px ${bandColor}55, 0 0 0 6px ${bandColor}22, 0 14px 26px rgba(15, 23, 42, 0.18)`,
                          } : undefined}
                          aria-pressed={checked}
                        >
                          <img
                            src={character.iconUrl}
                            alt={character.name}
                            loading="lazy"
                            decoding="async"
                            className={`h-full w-full object-cover transition-opacity ${checked ? "opacity-100" : "opacity-80 hover:opacity-100"}`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="rounded-xl border border-gray-200 bg-white/70 px-3 py-3 text-sm text-gray-700">
                <span className="flex items-center gap-2 font-semibold text-gray-900">
                  <input
                    type="checkbox"
                    className="accent-[#ff8a3d]"
                    checked={enableStartPreviousDayReminder}
                    onChange={(event) => setEnableStartPreviousDayReminder(event.target.checked)}
                  />
                  启用活动开始前一天提醒
                </span>
                <span className="mt-2 block text-xs text-gray-600">在活动开始前一天的以下时间提醒我</span>
                <TimeSelector
                  value={startPreviousDayReminderTime}
                  onChange={setStartPreviousDayReminderTime}
                  disabled={!enableStartPreviousDayReminder}
                />
              </label>

              <label className="rounded-xl border border-gray-200 bg-white/70 px-3 py-3 text-sm text-gray-700">
                <span className="flex items-center gap-2 font-semibold text-gray-900">
                  <input
                    type="checkbox"
                    className="accent-[#ff8a3d]"
                    checked={enableStartSameDayReminder}
                    onChange={(event) => setEnableStartSameDayReminder(event.target.checked)}
                  />
                  启用活动开始当天提醒
                </span>
                <span className="mt-2 block text-xs text-gray-600">在活动开始当天的以下时间提醒我</span>
                <TimeSelector
                  value={startSameDayReminderTime}
                  onChange={setStartSameDayReminderTime}
                  disabled={!enableStartSameDayReminder}
                />
              </label>

              <label className="rounded-xl border border-gray-200 bg-white/70 px-3 py-3 text-sm text-gray-700">
                <span className="flex items-center gap-2 font-semibold text-gray-900">
                  <input
                    type="checkbox"
                    className="accent-[#ff8a3d]"
                    checked={enableEndPreviousDayReminder}
                    onChange={(event) => setEnableEndPreviousDayReminder(event.target.checked)}
                  />
                  启用活动结束前一天提醒
                </span>
                <span className="mt-2 block text-xs text-gray-600">在活动结束前一天的以下时间提醒我</span>
                <TimeSelector
                  value={endPreviousDayReminderTime}
                  onChange={setEndPreviousDayReminderTime}
                  disabled={!enableEndPreviousDayReminder}
                />
              </label>

              <label className="rounded-xl border border-gray-200 bg-white/70 px-3 py-3 text-sm text-gray-700">
                <span className="flex items-center gap-2 font-semibold text-gray-900">
                  <input
                    type="checkbox"
                    className="accent-[#ff8a3d]"
                    checked={enableEndSameDayReminder}
                    onChange={(event) => setEnableEndSameDayReminder(event.target.checked)}
                  />
                  启用活动结束当天提醒
                </span>
                <span className="mt-2 block text-xs text-gray-600">在活动结束当天的以下时间提醒我</span>
                <TimeSelector
                  value={endSameDayReminderTime}
                  onChange={setEndSameDayReminderTime}
                  disabled={!enableEndSameDayReminder}
                />
              </label>
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
                    : "bg-gradient-to-r from-[#ff7b57] to-[#ffb11f] text-white hover:opacity-95"
                }`}
              >
                {copied ? "已复制" : "复制"}
              </button>
            </div>
            <p className="text-xs md:text-sm text-gray-600 leading-6">
              将此链接添加到您的日历应用（Google Calendar、Apple Calendar 等）以自动同步活动日程
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-6">
              活动将以全天事件形式显示，并附带在上方订阅的闹钟提醒，时间为UTC+8时区
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
          <EventEditor allEvents={allEvents} allCharacters={allCharacters} onSaved={handleSaved} />
        )}
      </div>
    </div>
  );
}
