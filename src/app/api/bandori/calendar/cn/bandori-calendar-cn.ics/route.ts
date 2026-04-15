import {
  fetchBandoriCharacters,
  fetchBandoriEventRecords,
  type BandoriEventRecord,
} from "@/lib/bandori-events-server";
import {
  buildStampCharacterOptions,
  formatCalendarSubscriptionTitle,
  getCharacterBandType,
  getSubscriptionEventColor,
  type CalendarCharacter,
} from "@/lib/calendar-character-service";
import {
  LIVE_API_CACHE_CONTROL,
  SUBSCRIPTION_API_CACHE_CONTROL,
  SUBSCRIPTION_FEED_CACHE_PROFILE,
  withCacheControl,
} from "@/lib/api-cache";

export const dynamic = "force-dynamic";

const MAX_PAST_SUBSCRIPTION_DAYS = 180;

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

function parseBase36BigInt(input: string): bigint {
  let result = BigInt(0);

  for (const character of input.toLowerCase()) {
    const digit = parseInt(character, 36);
    if (Number.isNaN(digit) || digit < 0 || digit >= 36) {
      return BigInt(0);
    }

    result = result * BigInt(36) + BigInt(digit);
  }

  return result;
}

function shouldIncludeTimelineEvent(record: BandoriEventRecord, nowMs: number) {
  if (record.cn_end_at !== null && record.cn_end_at < nowMs) {
    return true;
  }

  if (record.cn_start_at !== null && record.cn_end_at !== null) {
    return record.has_schedule_row;
  }

  return true;
}

/**
 * GET /api/bandori/calendar/cn/bandori-calendar-cn.ics
 * 生成可订阅的 Bandori 国服活动 ICS 日历。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const nowMs = Date.now();
    const events = (await fetchBandoriEventRecords()).filter((event) => shouldIncludeTimelineEvent(event, nowMs));

    const now = new Date();
    const dtstamp = formatICSDate(now);
    const characterRows = await fetchBandoriCharacters();
    const characterMap = new Map<number, CalendarCharacter>(
      characterRows.map((character) => [character.characterId, character]),
    );
    const characterUniverse = buildStampCharacterOptions(characterRows).map((option) => option.id);
    const selectedCharacterIds = parseSelectionState(searchParams.get("s"), characterUniverse);
    const selectedBandTypes = new Set<string>();

    selectedCharacterIds.forEach((characterId) => {
      const character = characterMap.get(characterId);
      if (!character) {
        return;
      }

      selectedBandTypes.add(getCharacterBandType(character));
    });

    const [
      enableStartPreviousDayReminder,
      enableStartSameDayReminder,
      enableEndPreviousDayReminder,
      enableEndSameDayReminder,
    ] = parseReminderState(searchParams.get("r"));
    const [
      startPreviousDayReminderTime,
      startSameDayReminderTime,
      endPreviousDayReminderTime,
      endSameDayReminderTime,
    ] = parseReminderStateTimes(searchParams.get("r"));

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//HHWX//Bandori CN Calendar//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:BanGDream 国服活动",
      "X-WR-TIMEZONE:Asia/Shanghai",
    ];

    for (const event of events) {
      const stampCharacter = event.stamp_character_id ? characterMap.get(event.stamp_character_id) ?? null : null;
      if (!shouldIncludeEventByFilters(event.band, event.stamp_character_id ?? null, selectedBandTypes, selectedCharacterIds)) {
        continue;
      }

      let startDate: string | null = null;
      let endDate: string | null = null;

      if (event.cn_start_at && event.cn_end_at) {
        // 为什么这里不用直接硬编码 +8 小时：
        // 部署环境时区不一定固定，先按运行时区求差再映射到 UTC+8，
        // 才能保证 ICS DATE 始终落在国服自然日上。
        startDate = timestampToUtc8DateStr(event.cn_start_at);
        endDate = timestampToUtc8DateStr(event.cn_end_at);
      } else if (event.predicted_start && event.predicted_end) {
        startDate = predictedDateToDateStr(event.predicted_start);
        endDate = predictedDateToDateStr(event.predicted_end);
      }

      if (!startDate || !endDate) continue;
      if (!shouldIncludeEventByAge(endDate)) continue;

      const durationDays = calculateInclusiveDurationDays(startDate, endDate);
      if (durationDays < 1) continue;
      const exclusiveEndDate = addDaysToCompactDate(endDate, 1);

      const summary = formatCalendarSubscriptionTitle(
        event.band,
        event.event_id,
        event.event_name_cn || event.event_name_jp || `活动 #${event.event_id}`,
        stampCharacter,
      );
      const eventColor = getSubscriptionEventColor(event.band, stampCharacter);

      icsContent.push(
        "BEGIN:VEVENT",
        `UID:gbp-event-${event.event_id}@hhwx`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${startDate}`,
        `DTEND;VALUE=DATE:${exclusiveEndDate}`,
        "TRANSP:TRANSPARENT",
        `COLOR:${eventColor}`,
        `X-APPLE-CALENDAR-COLOR:${eventColor}`,
        `SUMMARY:${escapeICSText(summary)}`,
        "END:VEVENT",
      );

      if (enableStartPreviousDayReminder || enableStartSameDayReminder) {
        const startAnchorSummary = `🎸 活动开始 ${event.event_id}期 - BanGDream梦想协奏曲`;
        const startAnchorDateTime = buildUtcDateTime(startDate, "15:00");
        const startAnchorAlarmBlocks = [
          ...(enableStartPreviousDayReminder
            ? buildRelativeDisplayAlarmBlock(
              `活动明天开始：${summary}`,
              buildRelativeTriggerFromLocalTimes(startPreviousDayReminderTime, "15:00", 1),
            )
            : []),
          ...(enableStartSameDayReminder
            ? buildRelativeDisplayAlarmBlock(
              `活动今天开始：${summary}`,
              buildRelativeTriggerFromLocalTimes(startSameDayReminderTime, "15:00", 0),
            )
            : []),
        ];

        icsContent.push(
          "BEGIN:VEVENT",
          `UID:gbp-event-${event.event_id}-start-anchor@hhwx`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART:${startAnchorDateTime}`,
          `DTEND:${addMinutesToICSDateTime(startAnchorDateTime, 1)}`,
          "TRANSP:TRANSPARENT",
          `COLOR:${eventColor}`,
          `X-APPLE-CALENDAR-COLOR:${eventColor}`,
          `SUMMARY:${escapeICSText(startAnchorSummary)}`,
          ...startAnchorAlarmBlocks,
          "END:VEVENT",
        );
      }

      if (enableEndPreviousDayReminder || enableEndSameDayReminder) {
        const endAnchorSummary = `🎸 活动结束 ${event.event_id}期 - BanGDream梦想协奏曲`;
        const endAnchorDateTime = buildUtcDateTime(endDate, "22:59");
        const endAnchorAlarmBlocks = [
          ...(enableEndPreviousDayReminder
            ? buildRelativeDisplayAlarmBlock(
              `活动明天结束：${summary}`,
              buildRelativeTriggerFromLocalTimes(endPreviousDayReminderTime, "22:59", 1),
            )
            : []),
          ...(enableEndSameDayReminder
            ? buildRelativeDisplayAlarmBlock(
              `活动今天结束：${summary}`,
              buildRelativeTriggerFromLocalTimes(endSameDayReminderTime, "22:59", 0),
            )
            : []),
        ];

        icsContent.push(
          "BEGIN:VEVENT",
          `UID:gbp-event-${event.event_id}-end-anchor@hhwx`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART:${endAnchorDateTime}`,
          `DTEND:${addMinutesToICSDateTime(endAnchorDateTime, 1)}`,
          "TRANSP:TRANSPARENT",
          `COLOR:${eventColor}`,
          `X-APPLE-CALENDAR-COLOR:${eventColor}`,
          `SUMMARY:${escapeICSText(endAnchorSummary)}`,
          ...endAnchorAlarmBlocks,
          "END:VEVENT",
        );
      }
    }

    icsContent.push("END:VCALENDAR");

    return new Response(serializeICalendar(icsContent), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="bandori-calendar-cn.ics"',
        "Cache-Control": SUBSCRIPTION_FEED_CACHE_PROFILE.cacheControl ?? SUBSCRIPTION_API_CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error("Bandori ICS API 错误:", error);
    return new Response("服务器内部错误", {
      status: 500,
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}

function shouldIncludeEventByFilters(
  bandType: string,
  stampCharacterId: number | null,
  selectedBandTypes: Set<string>,
  selectedCharacterIds: Set<number>,
): boolean {
  if (selectedCharacterIds.size === 0) {
    return true;
  }

  if (bandType === "mix") {
    return stampCharacterId !== null && selectedCharacterIds.has(stampCharacterId);
  }

  return selectedBandTypes.has(bandType);
}

function normalizeTimeInput(input: string | null, fallback: string): string {
  if (!input) return fallback;
  return /^\d{2}:\d{2}$/.test(input) ? input : fallback;
}

function decodeMask<T extends string | number>(token: string, universe: T[]): Set<T> {
  const normalized = /^[0-9a-z]+$/i.test(token) ? token : "0";
  const mask = parseBase36BigInt(normalized);
  const results = new Set<T>();

  universe.forEach((value, index) => {
    if ((mask & (BigInt(1) << BigInt(index))) !== BigInt(0)) {
      results.add(value);
    }
  });

  return results;
}

function parseSelectionState(input: string | null, characterUniverse: number[]): Set<number> {
  if (!input) {
    return new Set<number>();
  }

  return decodeMask(input, characterUniverse);
}

function parseReminderState(input: string | null): [boolean, boolean, boolean, boolean] {
  const [flagToken = DEFAULT_REMINDER_FLAG_TOKEN] = (input ?? "").split(".");
  const flagMask = /^[0-9a-z]$/i.test(flagToken) ? parseInt(flagToken, 36) : parseInt(DEFAULT_REMINDER_FLAG_TOKEN, 36);
  const normalized = Number.isNaN(flagMask) ? 15 : flagMask;
  return [
    (normalized & 1) !== 0,
    (normalized & 2) !== 0,
    (normalized & 4) !== 0,
    (normalized & 8) !== 0,
  ];
}

function parseReminderStateTimes(input: string | null): [string, string, string, string] {
  const [, timeToken = ""] = (input ?? "").split(".");
  if (!timeToken) {
    return [...DEFAULT_REMINDER_TIMES] as [string, string, string, string];
  }

  if (!/^[0-9a-z]+$/i.test(timeToken)) {
    return [...DEFAULT_REMINDER_TIMES] as [string, string, string, string];
  }

  let packed = parseBase36BigInt(timeToken);
  const decoded = new Array<string>(4);

  for (let index = 3; index >= 0; index -= 1) {
    const totalMinutes = Number(packed % BigInt(1440));
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    decoded[index] = normalizeTimeInput(`${hours}:${minutes}`, DEFAULT_REMINDER_TIMES[index]);
    packed /= BigInt(1440);
  }

  return decoded as [string, string, string, string];
}

function buildRelativeDisplayAlarmBlock(description: string, trigger: string): string[] {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:${trigger}`,
    `DESCRIPTION:${escapeICSText(description)}`,
    "END:VALARM",
  ];
}

function serializeICalendar(lines: string[]): string {
  return lines
    .flatMap((line) => foldICalendarLine(line))
    .join("\r\n");
}

function foldICalendarLine(line: string): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let currentChunk = "";
  let currentLimit = 75;

  for (const character of line) {
    if (encoder.encode(currentChunk + character).length > currentLimit) {
      if (currentChunk.length === 0) {
        chunks.push(character);
        currentLimit = 74;
        continue;
      }

      chunks.push(currentChunk);
      currentChunk = character;
      currentLimit = 74;
      continue;
    }

    currentChunk += character;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`));
}

function buildRelativeTriggerFromLocalTimes(reminderTimeText: string, anchorTimeText: string, dayOffset: number): string {
  const reminderMinutes = parseLocalTimeToMinutes(reminderTimeText);
  const anchorMinutes = parseLocalTimeToMinutes(anchorTimeText) + dayOffset * 1440;
  const deltaMinutes = anchorMinutes - reminderMinutes;

  if (deltaMinutes <= 0) {
    return "-PT0M";
  }

  return `-${formatDurationFromMinutes(deltaMinutes)}`;
}

function parseLocalTimeToMinutes(timeText: string): number {
  const [hour, minute] = timeText.split(":").map(Number);
  return hour * 60 + minute;
}

function formatDurationFromMinutes(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  let result = "P";

  if (days > 0) {
    result += `${days}D`;
  }

  if (hours > 0 || minutes > 0 || days === 0) {
    result += "T";

    if (hours > 0) {
      result += `${hours}H`;
    }

    if (minutes > 0 || (days === 0 && hours === 0)) {
      result += `${minutes}M`;
    }
  }

  return result;
}

function shouldIncludeEventByAge(endDateText: string): boolean {
  const today = new Date();
  const todayDateText = formatDateOnlyUtc(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));

  if (endDateText >= todayDateText) {
    return true;
  }

  const endDate = parseDateTextAsUtc(endDateText);
  const thresholdDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  thresholdDate.setUTCDate(thresholdDate.getUTCDate() - MAX_PAST_SUBSCRIPTION_DAYS);
  return endDate.getTime() >= thresholdDate.getTime();
}

function addDaysToCompactDate(dateText: string, days: number): string {
  const baseDate = parseDateTextAsUtc(dateText);
  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return formatDateOnlyUtc(baseDate);
}

function buildUtcDateTime(dateText: string, timeText: string): string {
  const year = Number(dateText.slice(0, 4));
  const month = Number(dateText.slice(4, 6));
  const day = Number(dateText.slice(6, 8));
  const [hour, minute] = timeText.split(":").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0));
  return formatICSDate(utcDate);
}

function addMinutesToICSDateTime(dateTimeText: string, minutes: number): string {
  const year = Number(dateTimeText.slice(0, 4));
  const month = Number(dateTimeText.slice(4, 6));
  const day = Number(dateTimeText.slice(6, 8));
  const hour = Number(dateTimeText.slice(9, 11));
  const minute = Number(dateTimeText.slice(11, 13));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return formatICSDate(date);
}

function timestampToUtc8DateStr(ms: number): string {
  const sourceDate = new Date(ms);
  const runtimeOffsetMinutes = sourceDate.getTimezoneOffset();
  const utc8OffsetMinutes = -8 * 60;
  const offsetDeltaMinutes = runtimeOffsetMinutes - utc8OffsetMinutes;
  const mappedDate = new Date(ms + offsetDeltaMinutes * 60 * 1000);
  return formatDateOnlyLocal(mappedDate);
}

function predictedDateToDateStr(dateText: string): string {
  return dateText.replace(/-/g, "");
}

function calculateInclusiveDurationDays(startDateText: string, endDateText: string): number {
  const start = parseDateTextAsUtc(startDateText);
  const end = parseDateTextAsUtc(endDateText);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function parseDateTextAsUtc(dateText: string): Date {
  const year = Number(dateText.slice(0, 4));
  const month = Number(dateText.slice(4, 6));
  const day = Number(dateText.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnlyUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatDateOnlyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}