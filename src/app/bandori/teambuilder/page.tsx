"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileJson,
  ListFilter,
  Loader2,
  Music2,
  Users,
} from "lucide-react";
import BandoriAccountShell from "@/app/bandori/BandoriAccountShell";
import BandoriCardThumbnail from "@/components/bandori/BandoriCardThumbnail";
import BandoriEventSwitcher, { type BandoriEventSwitcherEvent } from "@/app/bandori/BandoriEventSwitcher";
import { AccountErrorState, AccountLoadingState, AccountSignInState } from "@/app/account/AccountShell";
import { getAccessToken, useAccountProfile } from "@/app/account/useAccountProfile";
import { BandoriCardHoverTooltipPortal } from "@/components/bandori/BandoriCardHoverTooltip";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import {
  type BandoriAssetRegion,
  buildBandoriEventBannerPublicUrl,
  buildBandoriResIconPublicUrl,
  resolveBandoriEventBannerBundleName,
} from "@/lib/bandori-asset-proxy";
import {
  hasBandoriOfficialCnEventContent,
  resolveBandoriCnScheduleWindow,
  resolveBandoriEventAssetRegion,
} from "@/lib/bandori-event-region";
import {
  type BandoriCardAttribute,
  type BandoriEventBonus,
} from "@/lib/bandori-team-calculator";
import {
  buildBandoriCharacterBonuses,
  toBandoriCharacterBonusMap,
} from "@/lib/bandori-character-bonuses";
import {
  normalizeBandoriSkillLabel,
  type BandoriSkillLabelMaster,
} from "@/lib/bandori-skill-label";
import type {
  BandoriTeamSearchDifficulty,
  BandoriTeamSearchEventType,
  BandoriTeamSearchResultCard,
  BandoriTeamSearchResponse,
  BandoriTeamSearchResult,
  BandoriTeamSearchSkillOrderActor,
  BandoriTeamSearchTarget,
} from "@/lib/bandori-team-search";
import type {
  BandoriMedleyTeamSearchResponse,
  BandoriMedleyTeamSearchResult,
} from "@/lib/bandori/team-builder/medley";
import {
  listLocalGameProfiles,
  readLocalGameProfilePayload,
  type LocalGameProfileSummary,
} from "@/lib/user-game-profile-local-store";
import {
  decodeCompressedGameProfilePayload,
  getGameProfileCards,
  getGameProfileCharacterMissionBonuses,
  getGameProfileCharacterPotentials,
  type CompressedGameProfilePayload,
  type UserGameProfileCardRecord,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";
import { type BandoriCardPickerValue } from "@/components/bandori/card-picker/types";
import { createMaxGameProfileCard } from "@/lib/bandori-game-profile-card";
import TeamBuilderCardPreferencesPanel from "./CardPreferencesPanel";
import { type TemporaryCardEditorDialogProps, type TemporaryCardPickerDialogProps } from "./TemporaryCardDialogs";
import {
  createDefaultCardPreferences,
  normalizeCardPreferences,
  normalizeOwnedCardParameterPreferences,
  readCardPreferences,
  writeCardPreferences,
  type OwnedCardParameterPreferences,
  type TeamBuilderCardPreferences,
  type TemporaryGameProfileCard,
} from "./card-preferences";
import type { TeamSearchWorkerMessage, TeamSearchWorkerRequest, TeamSearchWorkerResponse } from "./team-search-worker";

type StepId = "event" | "live" | "song" | "profile" | "calculate";
type LiveType = "free" | "multi" | "challenge" | "versus";
type EncoreSkillSource = NonNullable<TeamSearchWorkerRequest["live"]["encoreSkillSource"]>;
type EventFormulaOption = "0" | "1" | "2";
type LiveBoostCountOption = "0" | "1" | "2" | "3";
type ChallengeCpCostOption = "200" | "400" | "800" | "1600";
type ResultPlacementOption = "1" | "2" | "3" | "4" | "5";
type FestivalResultOption = "win" | "lose";
type ProfileChoice = { source: "cloud"; id: string } | { source: "local"; id: string };
type PreloadStatus = "idle" | "loading" | "ready" | "error";
type PreloadState = {
  master: PreloadStatus;
  chart: PreloadStatus;
  eventBonus: PreloadStatus;
  profile: PreloadStatus;
  message: string;
};
type MedleySongSource = "custom" | "event-cn" | "event-jp";
type MedleyCalculationMode = "maximize" | "legacy-greedy-single";
type TeamBuilderSearchResponse = BandoriTeamSearchResponse | BandoriMedleyTeamSearchResponse;
type BrowserMemoryPerformance = Performance & {
  memory?: {
    usedJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
  measureUserAgentSpecificMemory?: () => Promise<{
    bytes?: number;
    breakdown?: Array<{ bytes?: number }>;
  }>;
};

const DynamicTemporaryCardPickerDialog = dynamic<TemporaryCardPickerDialogProps>(
  () => import("./TemporaryCardDialogs").then((module) => module.TemporaryCardPickerDialog),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[1000] flex h-dvh items-center justify-center overflow-hidden overscroll-contain bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true">
        <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-2xl">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          正在载入临时卡牌选择器
        </div>
      </div>
    ),
  },
);

const DynamicTemporaryCardEditorDialog = dynamic<TemporaryCardEditorDialogProps>(
  () => import("./TemporaryCardDialogs").then((module) => module.TemporaryCardEditorDialog),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[1100] flex h-dvh items-center justify-center overflow-hidden overscroll-contain bg-slate-950/72 p-3 backdrop-blur-md sm:p-6" role="dialog" aria-modal="true">
        <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-2xl">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          正在载入临时卡牌编辑器
        </div>
      </div>
    ),
  },
);

type CloudGameProfileSummary = {
  id: string;
  kind: "auto" | "manual";
  name: string;
  server: number;
  sourceGameUid: string | null;
  localProfileId: string | null;
  isEditable: boolean;
  cardCount: number;
  syncedAt: string | null;
  updatedAt: string;
};

type BandoriEventSummary = {
  eventId: number;
  eventType: string;
  name: {
    jp: string;
    cn: string | null;
  };
  asset: {
    bundleName: string;
    bannerBundleName: string | null;
  };
  timeline: {
    jp: { startAt: number; endAt: number };
    cn: { startAt: number | null; endAt: number | null };
    cnSchedule?: { startAt: number; endAt: number };
  };
  musicIds: {
    jp: number[];
    cn: number[];
  };
};

type SongMaster = {
  musicTitle?: string[] | string;
  bandName?: string[] | string;
  difficulty?: Record<string, { playLevel?: number }>;
};

type CharacterMaster = {
  nickname?: string[] | string;
  firstName?: string[] | string;
  characterName?: string[] | string;
  bandId?: number | null;
  colorCode?: string | null;
};

type SkillMaster = BandoriSkillLabelMaster;

type CardMetadata = {
  characterId?: number;
  rarity?: number;
  attribute?: string;
  skillId?: number;
  levelLimit?: number;
  resourceSetName?: string;
  assetRegion?: BandoriAssetRegion;
  releasedAt?: Array<string | number | null>;
  displayName?: string | null;
  hasTrainedArt?: boolean;
  stat?: {
    training?: {
      levelLimit?: number;
    };
  };
};

type TeamBuilderData = {
  cloudProfiles: CloudGameProfileSummary[];
  localProfiles: LocalGameProfileSummary[];
  events: BandoriEventSummary[];
  songs: Record<string, SongMaster | undefined>;
  characters: Record<string, CharacterMaster | undefined>;
  skills: Record<string, SkillMaster | undefined>;
};

type OtherPlayerDraft = {
  skillId: string;
  skillLevel: string;
};

type LivePreferenceState = {
  liveType?: LiveType;
  songId?: string;
  difficulty?: BandoriTeamSearchDifficulty;
  medleySongIds?: [string, string, string];
  medleyDifficulties?: [BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty];
  perfectRate?: string;
  otherPlayersAveragePower?: string;
  encoreSkillSource?: EncoreSkillSource;
  otherPlayers?: OtherPlayerDraft[];
};

const STEPS: Array<{ id: StepId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "event", label: "活动", icon: Clock3 },
  { id: "live", label: "演出", icon: Users },
  { id: "song", label: "歌曲", icon: Music2 },
  { id: "profile", label: "卡牌", icon: FileJson },
  { id: "calculate", label: "计算", icon: Calculator },
];

const SUPPORTED_EVENT_TYPES = new Set(["story", "challenge", "versus", "live_try", "mission_live", "festival", "medley"]);
const DEFAULT_SONG_ID = "306";
const DEFAULT_DIFFICULTY: BandoriTeamSearchDifficulty = "expert";
const MEDLEY_SLOT_COUNT = 3;
const DEFAULT_MEDLEY_SONG_IDS: [string, string, string] = [DEFAULT_SONG_ID, DEFAULT_SONG_ID, DEFAULT_SONG_ID];
const DEFAULT_MEDLEY_DIFFICULTIES: [BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty] = [
  DEFAULT_DIFFICULTY,
  DEFAULT_DIFFICULTY,
  DEFAULT_DIFFICULTY,
];
const DEFAULT_SEARCH_DURATION_SECONDS = "30";
const MEDLEY_PREVIEW_SEARCH_DURATION_SECONDS = "300";
const MEDLEY_BROWSER_MEMORY_WATCHDOG_LIMIT_MIB = 3000;
const MEDLEY_BROWSER_MEMORY_WATCHDOG_HEAP_LIMIT_RATIO = 0.7;
const MEDLEY_BROWSER_MEMORY_WATCHDOG_INTERVAL_MS = 200;
const DEFAULT_PERFECT_RATE = "100";
const TEAMBUILDER_LIVE_PREFERENCES_STORAGE_KEY = "hhwx-bandori-teambuilder-live-preferences:v1";
const DIFFICULTIES: BandoriTeamSearchDifficulty[] = ["easy", "normal", "hard", "expert", "special"];
const DIFFICULTY_KEYS: Record<BandoriTeamSearchDifficulty, string> = {
  easy: "0",
  normal: "1",
  hard: "2",
  expert: "3",
  special: "4",
};
const DIFFICULTY_LABELS: Record<BandoriTeamSearchDifficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
  expert: "Expert",
  special: "Special",
};
const DIFFICULTY_LEVEL_CLASSES: Record<BandoriTeamSearchDifficulty, string> = {
  easy: "bg-[#2F52FD] text-white ring-[#2F52FD]/35",
  normal: "bg-[#18B721] text-white ring-[#18B721]/35",
  hard: "bg-[#FFA922] text-white ring-[#FFA922]/45",
  expert: "bg-[#ED2D2E] text-white ring-[#ED2D2E]/35",
  special: "bg-[#ED268D] text-white ring-[#ED268D]/35",
};
const LIVE_BOOST_OPTIONS: LiveBoostCountOption[] = ["0", "1", "2", "3"];
const CHALLENGE_CP_OPTIONS: ChallengeCpCostOption[] = ["200", "400", "800", "1600"];
const RESULT_PLACEMENT_OPTIONS: ResultPlacementOption[] = ["1", "2", "3", "4", "5"];
const FESTIVAL_RESULT_OPTIONS: FestivalResultOption[] = ["win", "lose"];
const EVENT_TYPE_LABELS: Record<string, string> = {
  none: "无活动",
  story: "普通活动",
  challenge: "挑战活动",
  versus: "竞演活动",
  live_try: "试炼活动",
  mission_live: "任务活动",
  festival: "团队FES活动",
  medley: "巡回活动",
};
const TARGET_LABELS: Record<BandoriTeamSearchTarget, string> = {
  score: "分数",
  eventPoint: "活动Pt",
};
const MEDLEY_CALCULATION_MODE_LABELS: Record<MedleyCalculationMode, string> = {
  maximize: "最大化",
  "legacy-greedy-single": "传统3次单曲贪心",
};
const LIVE_LABELS: Record<LiveType, string> = {
  free: "自由演出",
  multi: "协力演出",
  challenge: "挑战演出",
  versus: "巡回演出",
};

const EVENT_FORMULA_LABELS: Record<EventFormulaOption, string> = {
  "0": "V1",
  "1": "V2",
  "2": "V3",
};
const LIVE_BOOST_LABELS: Record<LiveBoostCountOption, string> = {
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
};
const CHALLENGE_CP_LABELS: Record<ChallengeCpCostOption, string> = {
  "200": "200",
  "400": "400",
  "800": "800",
  "1600": "1600",
};
const RESULT_PLACEMENT_LABELS: Record<ResultPlacementOption, string> = {
  "1": "#1",
  "2": "#2",
  "3": "#3",
  "4": "#4",
  "5": "#5",
};
const FESTIVAL_RESULT_LABELS: Record<FestivalResultOption, string> = {
  win: "胜利",
  lose: "失败",
};
const ENCORE_SKILL_SOURCE_LABELS: Record<EncoreSkillSource, string> = {
  self: "你的队长",
  other1: "队长 1",
  other2: "队长 2",
  other3: "队长 3",
  other4: "队长 4",
};
const ENCORE_SKILL_SOURCE_OPTIONS: EncoreSkillSource[] = ["self", "other1", "other2", "other3", "other4"];
const OTHER_PLAYER_SKILL_LEVEL_OPTIONS = ["1", "2", "3", "4", "5"];
const DEFAULT_OTHER_PLAYERS: OtherPlayerDraft[] = [
  { skillId: "69", skillLevel: "5" },
  { skillId: "69", skillLevel: "1" },
  { skillId: "66", skillLevel: "5" },
  { skillId: "66", skillLevel: "1" },
];
const ATTRIBUTE_LABELS: Record<BandoriCardAttribute, string> = {
  powerful: "Powerful",
  cool: "Cool",
  happy: "Happy",
  pure: "Pure",
};
const ATTRIBUTE_SWATCH_CLASSES: Record<BandoriCardAttribute, string> = {
  powerful: "bg-rose-500",
  cool: "bg-sky-500",
  happy: "bg-amber-400",
  pure: "bg-emerald-500",
};
const AREA_ITEM_PARAMETER_LABELS: Record<"performance" | "technique" | "visual", string> = {
  performance: "演出",
  technique: "技巧",
  visual: "形象",
};
type EventBonusResponse = {
  bonuses: BandoriEventBonus[];
};

async function requestJson<T>(path: string, init?: RequestInit, withAuth = false): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (withAuth) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error("请先登录");
    }
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) || `请求失败（HTTP ${response.status}）`);
  }

  const data = parseApiSuccessData<T>(payload);
  if (data === null) {
    throw new Error("接口返回格式无效");
  }

  return data;
}

function pickLocalizedName(value: string[] | string | undefined, fallback = ""): string {
  if (typeof value === "string") {
    return value.trim() || fallback;
  }
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value[3]?.trim() || value[0]?.trim() || fallback;
}

function pickCharacterDisplayName(character: CharacterMaster | undefined, fallback = ""): string {
  return pickLocalizedName(character?.nickname)
    || pickLocalizedName(character?.characterName)
    || pickLocalizedName(character?.firstName)
    || fallback;
}

function formatDate(value: number | null): string {
  if (!value) {
    return "未定";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未定";
  }
  return format(date, "yyyy年M月d日 HH:mm");
}

function formatProfileSyncDate(value: string | null | undefined): string {
  if (!value) {
    return "无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "无";
  }

  return format(date, "yyyy年M月d日");
}

function getEventStartAt(event: BandoriEventSummary): number | null {
  return resolveBandoriCnScheduleWindow(event).startAt;
}

function getEventEndAt(event: BandoriEventSummary): number | null {
  return resolveBandoriCnScheduleWindow(event).endAt;
}

function getEventStatus(event: BandoriEventSummary, now: number): "ongoing" | "upcoming" | "ended" | "unknown" {
  const startAt = getEventStartAt(event);
  const endAt = getEventEndAt(event);
  if (!startAt || !endAt) {
    return "unknown";
  }
  if (startAt <= now && now < endAt) {
    return "ongoing";
  }
  if (startAt > now) {
    return "upcoming";
  }
  return "ended";
}

function getEventStatusLabel(status: ReturnType<typeof getEventStatus>): string {
  if (status === "ongoing") {
    return "进行中";
  }
  if (status === "upcoming") {
    return "即将开始";
  }
  if (status === "ended") {
    return "已结束";
  }
  return "时间未定";
}

function findRecommendedEvent(events: BandoriEventSummary[], now: number): BandoriEventSummary | null {
  const withStart = events
    .map((event) => ({ event, startAt: getEventStartAt(event), endAt: getEventEndAt(event) }))
    .filter((item): item is { event: BandoriEventSummary; startAt: number; endAt: number | null } => item.startAt !== null);
  const ongoing = withStart
    .filter((item) => item.endAt !== null && item.startAt <= now && now < item.endAt)
    .sort((left, right) => (left.endAt ?? 0) - (right.endAt ?? 0))[0]?.event;
  if (ongoing) {
    return ongoing;
  }

  const upcoming = withStart
    .filter((item) => item.startAt > now)
    .sort((left, right) => left.startAt - right.startAt)[0]?.event;
  if (upcoming) {
    return upcoming;
  }

  return withStart.sort((left, right) => right.startAt - left.startAt)[0]?.event ?? null;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return Math.round(value).toLocaleString("zh-CN");
}

function formatDurationLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function buildBrowserHeapSnapshot(
  usedBytes: number,
  heapLimitBytes: number | null,
  source: "agent" | "heap",
): { usedMiB: number; limitMiB: number | null; effectiveLimitMiB: number; source: "agent" | "heap" } {
  const dynamicLimitMiB = heapLimitBytes !== null
    ? Math.floor((heapLimitBytes / (1024 * 1024)) * MEDLEY_BROWSER_MEMORY_WATCHDOG_HEAP_LIMIT_RATIO)
    : Number.POSITIVE_INFINITY;
  const effectiveLimitMiB = Math.min(MEDLEY_BROWSER_MEMORY_WATCHDOG_LIMIT_MIB, dynamicLimitMiB);
  return {
    usedMiB: Math.ceil(usedBytes / (1024 * 1024)),
    limitMiB: heapLimitBytes !== null ? Math.floor(heapLimitBytes / (1024 * 1024)) : null,
    effectiveLimitMiB,
    source,
  };
}

async function readBrowserHeapSnapshot(): Promise<{
  usedMiB: number;
  limitMiB: number | null;
  effectiveLimitMiB: number;
  source: "agent" | "heap";
} | null> {
  const runtimePerformance = performance as BrowserMemoryPerformance;
  const memory = runtimePerformance.memory;
  const heapLimitBytes = typeof memory?.jsHeapSizeLimit === "number" && Number.isFinite(memory.jsHeapSizeLimit) && memory.jsHeapSizeLimit > 0
    ? memory.jsHeapSizeLimit
    : null;

  if (typeof runtimePerformance.measureUserAgentSpecificMemory === "function") {
    try {
      const measurement = await runtimePerformance.measureUserAgentSpecificMemory();
      const measuredBytes = typeof measurement.bytes === "number" && Number.isFinite(measurement.bytes)
        ? measurement.bytes
        : measurement.breakdown?.reduce((sum, item) => (
          sum + (typeof item.bytes === "number" && Number.isFinite(item.bytes) ? item.bytes : 0)
        ), 0) ?? null;
      if (measuredBytes !== null && measuredBytes > 0) {
        return buildBrowserHeapSnapshot(measuredBytes, heapLimitBytes, "agent");
      }
    } catch {
      // Fall through to the older Chrome heap counter when process-wide memory is unavailable.
    }
  }

  const usedBytes = typeof memory?.usedJSHeapSize === "number" && Number.isFinite(memory.usedJSHeapSize)
    ? memory.usedJSHeapSize
    : null;
  if (usedBytes === null) {
    return null;
  }
  return buildBrowserHeapSnapshot(usedBytes, heapLimitBytes, "heap");
}

function formatAreaItemAttribute(attribute: BandoriCardAttribute | null): string {
  return attribute ? attribute.toUpperCase() : "-";
}

function formatAreaItemParameter(parameter: "performance" | "technique" | "visual" | null): string {
  return parameter ? AREA_ITEM_PARAMETER_LABELS[parameter] : "-";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toInteger(value: unknown): number | null {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : Math.trunc(numeric);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  const rounded = Math.round(value * 10) / 10;
  return `+${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function formatPercentSequence(values: number[]): string {
  return values.map((value) => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  }).join("/");
}

function normalizeSkillLabel(skill: SkillMaster | undefined, skillLevel: string | number): string {
  return normalizeBandoriSkillLabel(skill, skillLevel);
}

function buildSkillOptions(
  skills: Record<string, SkillMaster | undefined>,
  skillLevel: string | number,
): Array<{ value: string; label: string }> {
  return Object.entries(skills)
    .flatMap(([skillId, skill]) => {
      const id = Number(skillId);
      if (!Number.isFinite(id) || id <= 0 || !skill) {
        return [];
      }
      return [{ value: skillId, label: normalizeSkillLabel(skill, skillLevel) }];
    })
    .sort((left, right) => Number(left.value) - Number(right.value));
}

function readAttributeBonusItems(eventBonus: BandoriEventBonus | null): Array<{ attribute: BandoriCardAttribute; percent: number }> {
  return (eventBonus?.attributes ?? []).flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const attribute = item.attribute;
    const percent = toFiniteNumber(item.percent);
    if (typeof attribute !== "string" || !(attribute in ATTRIBUTE_LABELS) || percent === null) {
      return [];
    }
    return [{ attribute: attribute as BandoriCardAttribute, percent }];
  });
}

function readCharacterBonusItems(
  eventBonus: BandoriEventBonus | null,
  characters: Record<string, CharacterMaster | undefined>,
): Array<{ characterId: number; label: string; color: string | null; percent: number }> {
  return (eventBonus?.characters ?? []).flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const characterId = toInteger(item.characterId);
    const percent = toFiniteNumber(item.percent);
    if (characterId === null || percent === null) {
      return [];
    }
    const character = characters[String(characterId)];
    return [{
      characterId,
      label: pickCharacterDisplayName(character),
      color: character?.colorCode ?? null,
      percent,
    }];
  });
}

function readMemberBonusItems(
  eventBonus: BandoriEventBonus | null,
  cardMetadata: Record<string, CardMetadata | undefined>,
): Array<{ cardId: number; metadata: CardMetadata | undefined; percent: number }> {
  return (eventBonus?.members ?? []).flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const cardId = toInteger(item.situationId ?? item.id);
    const percent = toFiniteNumber(item.percent);
    if (cardId === null || percent === null) {
      return [];
    }
    return [{
      cardId,
      metadata: cardMetadata[String(cardId)],
      percent,
    }];
  });
}

function readMasterRankBonusGroups(eventBonus: BandoriEventBonus | null): Array<{ rarity: number; values: number[] }> {
  const groups = new Map<number, number[]>();
  (eventBonus?.limitBreaks ?? []).forEach((item) => {
    if (!isRecord(item)) {
      return;
    }
    const rarity = toInteger(item.rarity);
    const rank = toInteger(item.rank);
    const percent = toFiniteNumber(item.percent);
    if (rarity === null || rank === null || percent === null) {
      return;
    }
    const values = groups.get(rarity) ?? [];
    values[rank] = percent;
    groups.set(rarity, values);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rarity, values]) => ({ rarity, values: Array.from({ length: 5 }, (_, rank) => values[rank] ?? 0) }));
}

function getEventBonusMemberCardIds(eventBonus: BandoriEventBonus | null): number[] {
  return (eventBonus?.members ?? []).flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const cardId = toInteger(item.situationId ?? item.id);
    return cardId === null ? [] : [cardId];
  });
}

function getTemporaryCardParameterKey(
  card: Pick<UserGameProfileCardRecord, "cardId" | "level" | "masterRank" | "skillLevel" | "episodeCount" | "isTrained" | "hasTrainedArt">,
): string {
  return [
    card.cardId,
    card.level,
    card.masterRank,
    card.skillLevel,
    card.episodeCount,
    card.isTrained ? 1 : 0,
    card.hasTrainedArt ? 1 : 0,
  ].join(":");
}

function selectMissingTemporaryCards(
  profileCards: UserGameProfileCardRecord[],
  preferences: TeamBuilderCardPreferences,
  candidateTemporaryCards: TemporaryGameProfileCard[],
): { cardsToAdd: TemporaryGameProfileCard[]; skippedDuplicateCount: number } {
  const excludedCardIds = new Set(preferences.excludedCardIds);
  const existingKeys = new Set([
    ...profileCards
      .filter((card) => !card.isExcluded && !excludedCardIds.has(card.cardId))
      .map(getTemporaryCardParameterKey),
    ...preferences.temporaryCards.map(getTemporaryCardParameterKey),
  ]);
  const cardsToAdd: TemporaryGameProfileCard[] = [];
  let skippedDuplicateCount = 0;

  candidateTemporaryCards.forEach((card) => {
    const key = getTemporaryCardParameterKey(card);
    if (existingKeys.has(key)) {
      skippedDuplicateCount += 1;
      return;
    }
    existingKeys.add(key);
    cardsToAdd.push(card);
  });

  return { cardsToAdd, skippedDuplicateCount };
}

function buildBandoriCharacterIconUrl(characterId: number): string {
  return buildBandoriResIconPublicUrl(`chara_icon_${characterId}.png`);
}

function buildBandoriRarityIconUrl(rarity: number): string {
  return buildBandoriResIconPublicUrl(`star_${Math.max(1, Math.min(5, Math.trunc(rarity)))}.png`);
}

function buildBandoriAttributeIconUrl(attribute: BandoriCardAttribute): string | null {
  return buildBandoriResIconPublicUrl(`${attribute}.svg`);
}

function isKnownAttribute(value: string | undefined): value is BandoriCardAttribute {
  return value === "powerful" || value === "cool" || value === "happy" || value === "pure";
}

function pickCardDisplayName(cardId: number, metadata: CardMetadata | undefined): string {
  return metadata?.displayName?.trim() || `Card ${cardId}`;
}

function getCardBandId(metadata: CardMetadata | undefined, characters: Record<string, CharacterMaster | undefined>): number | null {
  const characterId = Number(metadata?.characterId);
  if (!Number.isFinite(characterId)) {
    return null;
  }

  const bandId = Number(characters[String(Math.trunc(characterId))]?.bandId);
  return Number.isFinite(bandId) && bandId > 0 ? Math.trunc(bandId) : null;
}

function getDisplayedEventPointOption(
  result: BandoriTeamSearchResult,
  selections: {
    liveBoostCount: LiveBoostCountOption;
    challengeCpCost: ChallengeCpCostOption;
    placement: ResultPlacementOption;
    festivalResult: FestivalResultOption;
  },
) {
  const options = result.eventPointOptions.options;
  if (options.length === 0) {
    return null;
  }

  const liveBoostCount = Number(selections.liveBoostCount);
  const challengeCpCost = Number(selections.challengeCpCost);
  const placement = Number(selections.placement);
  const matchedOption = options.find((option) => {
    if (result.eventPointOptions.mode === "challengeCp") {
      return option.challengeCpCost === challengeCpCost;
    }
    if (result.eventPointOptions.mode === "versus") {
      return option.liveBoostCount === liveBoostCount && option.placement === placement;
    }
    if (result.eventPointOptions.mode === "festival") {
      return option.liveBoostCount === liveBoostCount
        && option.placement === placement
        && option.festivalResult === selections.festivalResult;
    }
    if (result.eventPointOptions.mode === "liveBoost") {
      return option.liveBoostCount === liveBoostCount;
    }
    return false;
  });
  return matchedOption ?? options.find((option) => option.key === result.eventPointOptions.defaultKey) ?? options[0] ?? null;
}

function eventTypeFromValue(value: string | undefined): BandoriTeamSearchEventType {
  if (value && SUPPORTED_EVENT_TYPES.has(value)) {
    return value as BandoriTeamSearchEventType;
  }
  return "none";
}

function allowedLiveTypes(eventType: BandoriTeamSearchEventType): LiveType[] {
  if (eventType === "challenge") {
    return ["free", "multi", "challenge"];
  }
  if (eventType === "versus" || eventType === "festival") {
    return ["versus"];
  }
  if (eventType === "medley") {
    return ["free"];
  }
  return ["free", "multi"];
}

function isLiveType(value: unknown): value is LiveType {
  return value === "free" || value === "multi" || value === "challenge" || value === "versus";
}

function isEncoreSkillSource(value: unknown): value is EncoreSkillSource {
  return typeof value === "string" && (ENCORE_SKILL_SOURCE_OPTIONS as string[]).includes(value);
}

function getLiveLabel(liveType: LiveType, eventType: BandoriTeamSearchEventType): string {
  if (eventType === "medley") {
    return "巡回演出";
  }
  if (liveType === "versus" && (eventType === "versus" || eventType === "festival")) {
    return "团队演出";
  }
  return LIVE_LABELS[liveType];
}

function shouldUseCoopLiveSettings(eventType: BandoriTeamSearchEventType, liveType: LiveType): boolean {
  return liveType === "multi" && eventType !== "versus" && eventType !== "festival";
}

function getSongDifficulty(song: SongMaster | null | undefined, difficulty: BandoriTeamSearchDifficulty) {
  return song?.difficulty?.[DIFFICULTY_KEYS[difficulty]];
}

function getEventSongIds(event: BandoriEventSummary | null | undefined): number[] {
  if (!event) {
    return [];
  }

  return Array.from(new Set([
    ...event.musicIds.cn,
    ...event.musicIds.jp,
  ])).filter((songId) => Number.isFinite(songId) && songId > 0);
}

function getMedleyEventSongIdsForSource(event: BandoriEventSummary | null | undefined, source: "CN" | "JP"): number[] {
  if (!event) {
    return [];
  }
  const sourceSongIds = source === "CN" ? event.musicIds.cn : event.musicIds.jp;
  return sourceSongIds.filter((songId) => Number.isFinite(songId) && songId > 0).slice(0, MEDLEY_SLOT_COUNT);
}

function canShowEventSongPicker(eventType: BandoriTeamSearchEventType, liveType: LiveType): boolean {
  if (eventType === "challenge") {
    return liveType === "challenge";
  }
  return eventType === "versus" || eventType === "medley";
}

function isScoreLinkedEventPointTarget(eventType: BandoriTeamSearchEventType, liveType: LiveType): boolean {
  return eventType === "versus"
    || eventType === "festival"
    || (eventType === "challenge" && liveType === "challenge");
}

function normalizeOtherPlayersPreference(value: unknown): OtherPlayerDraft[] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }

  const players = value.map((player) => {
    if (typeof player !== "object" || player === null) {
      return null;
    }
    const candidate = player as Partial<OtherPlayerDraft>;
    const skillId = typeof candidate.skillId === "string" && /^\d+$/.test(candidate.skillId) ? candidate.skillId : null;
    const skillLevel = typeof candidate.skillLevel === "string" && OTHER_PLAYER_SKILL_LEVEL_OPTIONS.includes(candidate.skillLevel)
      ? candidate.skillLevel
      : null;
    return skillId && skillLevel ? { skillId, skillLevel } : null;
  });
  return players.every((player): player is OtherPlayerDraft => player !== null)
    ? players
    : undefined;
}

function isSongPreferenceId(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value) && Number(value) > 0;
}

function isTeamSearchDifficulty(value: unknown): value is BandoriTeamSearchDifficulty {
  return typeof value === "string" && DIFFICULTIES.includes(value as BandoriTeamSearchDifficulty);
}

function normalizeMedleySongIdsPreference(value: unknown): [string, string, string] | undefined {
  if (!Array.isArray(value) || value.length !== MEDLEY_SLOT_COUNT || !value.every(isSongPreferenceId)) {
    return undefined;
  }

  return [value[0], value[1], value[2]];
}

function normalizeMedleyDifficultiesPreference(value: unknown): [BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty] | undefined {
  if (!Array.isArray(value) || value.length !== MEDLEY_SLOT_COUNT || !value.every(isTeamSearchDifficulty)) {
    return undefined;
  }

  return [value[0], value[1], value[2]];
}

function readLivePreferences(): LivePreferenceState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(TEAMBUILDER_LIVE_PREFERENCES_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }
    const value = JSON.parse(rawValue) as Partial<LivePreferenceState>;
    return {
      liveType: isLiveType(value.liveType) ? value.liveType : undefined,
      songId: isSongPreferenceId(value.songId) ? value.songId : undefined,
      difficulty: isTeamSearchDifficulty(value.difficulty) ? value.difficulty : undefined,
      medleySongIds: normalizeMedleySongIdsPreference(value.medleySongIds),
      medleyDifficulties: normalizeMedleyDifficultiesPreference(value.medleyDifficulties),
      perfectRate: typeof value.perfectRate === "string" ? value.perfectRate : undefined,
      otherPlayersAveragePower: typeof value.otherPlayersAveragePower === "string" ? value.otherPlayersAveragePower : undefined,
      encoreSkillSource: isEncoreSkillSource(value.encoreSkillSource) ? value.encoreSkillSource : undefined,
      otherPlayers: normalizeOtherPlayersPreference(value.otherPlayers),
    };
  } catch {
    return {};
  }
}

function writeLivePreferences(patch: LivePreferenceState): void {
  if (typeof window === "undefined") {
    return;
  }

  const current = readLivePreferences();
  window.localStorage.setItem(TEAMBUILDER_LIVE_PREFERENCES_STORAGE_KEY, JSON.stringify({
    ...current,
    ...patch,
  }));
}

function shouldShowParameterBonus(eventType: BandoriTeamSearchEventType): boolean {
  return eventType === "challenge" || eventType === "versus" || eventType === "festival" || eventType === "medley";
}

function readEventParameterBonusItems(eventBonus: BandoriEventBonus | null): Array<{ label: string; percent: number }> {
  return [
    { label: "演出", percent: eventBonus?.performancePercent },
    { label: "技巧", percent: eventBonus?.techniquePercent },
    { label: "形象", percent: eventBonus?.visualPercent },
  ].flatMap((item) => {
    const percent = toFiniteNumber(item.percent);
    return percent !== null && percent !== 0 ? [{ label: item.label, percent }] : [];
  });
}

function createTeamSearchWorker(): Worker {
  return new Worker(new URL("./team-search-worker.ts", import.meta.url), { type: "module" });
}

type DisplayCardLike = Pick<BandoriTeamSearchResultCard, "cardId" | "cardInstanceKey" | "skillId" | "rarity" | "attribute" | "bandId" | "level" | "masterRank" | "skillLevel" | "isTrained" | "totalPower">;

function getDisplayCardKey(card: Pick<BandoriTeamSearchResultCard, "cardId" | "cardInstanceKey">): string {
  return card.cardInstanceKey ?? `profile:${card.cardId}`;
}

function getCardSkillId(card: { skillId?: unknown } | undefined, metadata: CardMetadata | undefined): number | null {
  const rawSkillId = card?.skillId ?? metadata?.skillId;
  const skillId = Number(rawSkillId);
  return Number.isFinite(skillId) && skillId > 0 ? Math.trunc(skillId) : null;
}

function getCardSkillEffectLabel(
  card: { skillId?: unknown; skillLevel?: unknown } | undefined,
  metadata: CardMetadata | undefined,
  skills: Record<string, SkillMaster | undefined> | undefined,
): string {
  const skillId = getCardSkillId(card, metadata);
  return normalizeBandoriSkillLabel(skillId ? skills?.[String(skillId)] : undefined, card?.skillLevel, 5);
}

function orderResultCardsWithLeaderCenter(
  cards: BandoriTeamSearchResultCard[],
  leaderCardId: number,
  leaderCardInstanceKey?: string,
): BandoriTeamSearchResultCard[] {
  if (cards.length !== 5) {
    return cards;
  }

  const leaderKey = leaderCardInstanceKey ?? `profile:${leaderCardId}`;
  const leader = cards.find((card) => getDisplayCardKey(card) === leaderKey)
    ?? cards.find((card) => card.cardId === leaderCardId);
  if (!leader) {
    return cards;
  }

  const leaderDisplayKey = getDisplayCardKey(leader);
  const others = cards.filter((card) => getDisplayCardKey(card) !== leaderDisplayKey);
  return [others[0], others[1], leader, others[2], others[3]].filter(Boolean) as BandoriTeamSearchResultCard[];
}

function isMedleySearchResult(result: BandoriTeamSearchResult | BandoriMedleyTeamSearchResult): result is BandoriMedleyTeamSearchResult {
  return "songResults" in result;
}

function isMedleySearchResponse(result: TeamBuilderSearchResponse): result is BandoriMedleyTeamSearchResponse {
  return result.results.some((item) => "songResults" in item);
}

function isMedleySearchStats(stats: TeamBuilderSearchResponse["stats"]): stats is BandoriMedleyTeamSearchResponse["stats"] {
  return "profiling" in stats;
}

function getSearchTimeLimitLabel(maxSearchDurationSeconds?: string): string | null {
  if (!maxSearchDurationSeconds) {
    return null;
  }
  const seconds = Number(maxSearchDurationSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? `${seconds} 秒` : null;
}

function getExactCandidateJoinAbortReasonLabel(
  reason: string | null | undefined,
  stats: BandoriMedleyTeamSearchResponse["stats"],
  maxSearchDurationSeconds?: string,
): string | null {
  if (!reason) {
    return null;
  }
  const profiling = stats.profiling;
  const timeLimitLabel = getSearchTimeLimitLabel(maxSearchDurationSeconds);
  const candidateSoftLimit = profiling.exactCandidateJoinLastAbortCandidateSoftLimit;
  const candidateCount = profiling.exactCandidateJoinLastAbortCandidateCount;
  const nodeSoftLimit = profiling.exactCandidateJoinLastAbortNodeSoftLimit;
  const labels: Record<string, string> = {
    "candidate-fill-deadline": `候选补全达到时间限制${timeLimitLabel ? `（限制 ${timeLimitLabel}）` : ""}`,
    "candidate-fill-soft-limit": `候选数量达到软上限${candidateSoftLimit !== null ? `（上限 ${formatNumber(candidateSoftLimit)}${candidateCount !== null ? `，已生成 ${formatNumber(candidateCount)}` : ""}）` : ""}`,
    "candidate-fill-generator-aborted": "候选生成提前中止",
    "memory-soft-limit": "达到内存保护上限",
    "solve-workload-limit": "精确子问题工作量达到上限",
    "solve-timeout": `子问题达到时间限制${timeLimitLabel ? `（限制 ${timeLimitLabel}）` : ""}`,
    "anchored-join-timeout": `锚定候选拼接达到时间限制${timeLimitLabel ? `（限制 ${timeLimitLabel}）` : ""}`,
    "candidate-fill-pair-refine": "候选补全阶段仍需继续细化",
    "initial-candidate": "初始候选生成未完成",
    "pair-upper": "双队伍上界证明未闭合",
    "deep-pair-upper": "深层双队伍上界证明未闭合",
    "high-budget-pair-upper": "高预算双队伍上界证明未闭合",
    "invalid-input": "精确子问题输入无效",
  };
  if (reason === "solve-workload-limit" && nodeSoftLimit !== null) {
    return `精确子问题工作量达到上限（上限 ${formatNumber(nodeSoftLimit)} 节点）`;
  }
  return labels[reason] ?? reason;
}

function getConfigurationTraceStringValue(entry: Record<string, unknown>, key: string): string | null {
  const value = entry[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isClosedConfigurationTraceStatus(status: string | null): boolean {
  return Boolean(status && (status.endsWith("-proved") || status.endsWith("-pruned")));
}

function getConfigurationTraceStatusLabel(status: string | null): string {
  const labels: Record<string, string> = {
    "bounded-dominated-root-skip": "因已有未闭合配置而跳过",
    "bounded-near-deadline-root-skip": "接近时间限制，跳过证明",
    "exact-unproved-skip-dfs": "候选拼接未能完成证明，跳过 DFS",
    "exact-before-seeding-timeout": "种子生成前达到时间限制",
    "slot-candidate-seeding-timeout": "slot 候选种子阶段达到时间限制",
    "greedy-seeding-timeout": "贪心种子阶段达到时间限制",
    "conflict-bnb-timeout": "冲突分支定界达到时间限制",
    "exact-after-seeding-timeout": "种子生成后候选拼接达到时间限制",
    "dfs-timeout": "DFS 证明达到时间限制",
  };
  return status ? labels[status] ?? status : "未记录完成状态";
}

function formatConfigurationTraceEntry(entry: Record<string, unknown>): string {
  const bandKey = getConfigurationTraceStringValue(entry, "bandKey") ?? "-";
  const attribute = getConfigurationTraceStringValue(entry, "attribute");
  const parameter = getConfigurationTraceStringValue(entry, "parameter");
  const attributeLabel = attribute && attribute in ATTRIBUTE_LABELS
    ? ATTRIBUTE_LABELS[attribute as BandoriCardAttribute]
    : "-";
  const parameterLabel = parameter === "performance" || parameter === "technique" || parameter === "visual"
    ? formatAreaItemParameter(parameter)
    : "-";
  const status = getConfigurationTraceStringValue(entry, "status");
  return `${bandKey} / ${attributeLabel} / ${parameterLabel}（${getConfigurationTraceStatusLabel(status)}）`;
}

function getFirstUnclosedConfigurationTrace(stats: BandoriMedleyTeamSearchResponse["stats"]): Record<string, unknown> | null {
  return stats.profiling.configurationTrace?.find((entry) => (
    !isClosedConfigurationTraceStatus(getConfigurationTraceStringValue(entry, "status"))
  )) ?? null;
}

function buildConfigurationProgressReason(stats: BandoriMedleyTeamSearchResponse["stats"]): string | null {
  const totalCount = stats.areaItemConfigurationCount;
  if (totalCount <= 0) {
    return null;
  }
  const closedCount = Math.min(
    totalCount,
    stats.profiling.completedAreaItemConfigurationCount + stats.profiling.rootUpperPrunedConfigurationCount,
  );
  const startedCount = Math.min(totalCount, stats.profiling.startedAreaItemConfigurationCount);
  if (closedCount >= totalCount) {
    return null;
  }

  const firstUnclosedTrace = getFirstUnclosedConfigurationTrace(stats);
  const traceLabel = firstUnclosedTrace ? `；第一个未完成配置：${formatConfigurationTraceEntry(firstUnclosedTrace)}` : "";
  return `配置证明进度 ${closedCount}/${totalCount}，已开始 ${startedCount}/${totalCount}${traceLabel}`;
}

function buildBoundedEarlyStopReason(stats: TeamBuilderSearchResponse["stats"], maxSearchDurationSeconds?: string): string {
  const reasons: string[] = [];

  if ("memoryLimited" in stats && stats.memoryLimited) {
    const limitLabel = stats.memorySoftLimitMiB !== null ? `（上限 ${stats.memorySoftLimitMiB} MiB）` : "";
    reasons.push(`达到内存保护上限${limitLabel}`);
  }
  if (stats.timedOut) {
    const timeLimitLabel = getSearchTimeLimitLabel(maxSearchDurationSeconds);
    reasons.push(`达到时间限制${timeLimitLabel ? `（限制 ${timeLimitLabel}）` : ""}`);
  }

  if (isMedleySearchStats(stats)) {
    const abortReason = getExactCandidateJoinAbortReasonLabel(
      stats.profiling.exactCandidateJoinLastAbortReason,
      stats,
      maxSearchDurationSeconds,
    );
    if (abortReason && !reasons.includes(abortReason)) {
      reasons.push(`候选拼接未完成：${abortReason}`);
    }
    const configurationProgressReason = buildConfigurationProgressReason(stats);
    if (configurationProgressReason) {
      reasons.push(configurationProgressReason);
    }
  }

  if (reasons.length === 0) {
    reasons.push("搜索空间尚未完全证明，已按当前最佳结果返回");
  }
  return reasons.join("；");
}

function buildSearchCompletionSummary(result: TeamBuilderSearchResponse, maxSearchDurationSeconds?: string): string {
  const { stats } = result;
  const isMedleyResult = isMedleySearchResponse(result);
  const elapsedLabel = isMedleyResult
    ? `${(stats.elapsedMs / 1000).toFixed(1)}s`
    : `${stats.elapsedMs}ms`;
  const parts = [`完成：用时 ${elapsedLabel}`];
  if (stats.searchMode === "exact" && isMedleyResult) {
    parts.push("已完成精确的全局最优证明");
  } else if (stats.searchMode === "bounded") {
    parts.push(`无法完成精确的全局最优证明，提前结束：${buildBoundedEarlyStopReason(stats, maxSearchDurationSeconds)}`);
    if (stats.observedScoreUpperBoundGap !== null) {
      parts.push(`gap ${formatNumber(stats.observedScoreUpperBoundGap)}`);
    }
  }
  return parts.join("\n");
}

function getSearchProofStatusLabel(result: TeamBuilderSearchResponse): string | null {
  if (!isMedleySearchResponse(result)) {
    return null;
  }
  if (result.stats.searchMode === "exact") {
    return "已完成精确的全局最优证明";
  }
  if (result.stats.searchMode === "bounded") {
    return "未完成精确的全局最优证明";
  }
  return null;
}

function getSearchResultCardIds(result: TeamBuilderSearchResponse | null): number[] {
  if (!result) {
    return [];
  }
  return result.results.flatMap((item) => (
    isMedleySearchResult(item)
      ? item.songResults.flatMap((songResult) => songResult.cards.map((card) => card.cardId))
      : item.cards.map((card) => card.cardId)
  ));
}

function buildMedleyDebugPayload({
  result,
  selectedEvent,
  medleySongIds,
  medleyDifficulties,
  songs,
  profileLabel,
  selectedProfileCacheKey,
  perfectRate,
  maxSearchDurationSeconds,
  medleyCalculationMode,
}: {
  result: BandoriMedleyTeamSearchResponse;
  selectedEvent: BandoriEventSummary | null;
  medleySongIds: [string, string, string];
  medleyDifficulties: [BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty];
  songs: Record<string, SongMaster | undefined>;
  profileLabel: string;
  selectedProfileCacheKey: string;
  perfectRate: string;
  maxSearchDurationSeconds: string;
  medleyCalculationMode: MedleyCalculationMode;
}) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    page: "bandori/teambuilder",
    mode: "medley-preview",
    input: {
      medleyCalculationMode,
      event: selectedEvent ? {
        eventId: selectedEvent.eventId,
        eventType: selectedEvent.eventType,
        name: selectedEvent.name,
        musicIds: selectedEvent.musicIds,
      } : null,
      songs: medleySongIds.map((songId, index) => ({
        slot: index + 1,
        songId: Number(songId),
        title: pickLocalizedName(songs[songId]?.musicTitle, `#${songId}`),
        difficulty: medleyDifficulties[index],
      })),
      profileLabel,
      profileCacheKey: selectedProfileCacheKey,
      perfectRate,
      maxSearchDurationSeconds,
    },
    proof: {
      searchMode: result.stats.searchMode,
      isExhaustive: result.stats.isExhaustive,
      timedOut: result.stats.timedOut,
      memoryLimited: result.stats.memoryLimited,
      observedScoreUpperBound: result.stats.observedScoreUpperBound,
      observedScoreUpperBoundGap: result.stats.observedScoreUpperBoundGap,
      memorySoftLimitMiB: result.stats.memorySoftLimitMiB,
      peakUsedHeapMiB: result.stats.peakUsedHeapMiB,
    },
    stats: result.stats,
    results: result.results.map((item) => ({
      rank: item.rank,
      score: item.score,
      averageScore: item.averageScore,
      maxScore: item.maxScore,
      minScore: item.minScore,
      areaItemConfiguration: item.areaItemConfiguration,
      cardIds: item.cardIds,
      songResults: item.songResults.map((songResult) => ({
        songIndex: songResult.songIndex,
        score: songResult.score,
        averageScore: songResult.averageScore,
        maxScore: songResult.maxScore,
        minScore: songResult.minScore,
        startCombo: songResult.startCombo,
        notesCount: songResult.notesCount,
        totalPower: songResult.totalPower,
        eventPower: songResult.eventPower,
        pointBonusRate: songResult.pointBonusRate,
        leaderCardId: songResult.leaderCardId,
        skillOrderCardIds: songResult.skillOrderCardIds,
        skillOrderActors: songResult.skillOrderActors,
        areaItemConfiguration: songResult.areaItemConfiguration,
        cards: songResult.cards.map((card) => ({
          cardId: card.cardId,
          characterId: card.characterId,
          attribute: card.attribute,
          bandId: card.bandId,
          rarity: card.rarity,
          skillId: card.skillId,
          skillLevel: card.skillLevel,
          totalPower: card.totalPower,
        })),
      })),
    })),
  };
}

function getSkillOrderActorLabel(actor: BandoriTeamSearchSkillOrderActor): string {
  if (actor === "self") {
    return "你";
  }
  return `队友 ${actor.replace("other", "")}`;
}

function buildSkillOrderDisplay(
  skillOrderCardIds: number[],
  displayedCards: BandoriTeamSearchResultCard[],
  skillOrderActors?: BandoriTeamSearchSkillOrderActor[],
  skillOrderCardInstanceKeys?: string[],
): string {
  if (skillOrderActors && skillOrderActors.length > 0) {
    return skillOrderActors.map(getSkillOrderActorLabel).join(" → ");
  }
  if (skillOrderCardInstanceKeys && skillOrderCardInstanceKeys.length > 0) {
    const positionByCardKey = new Map(displayedCards.map((card, index) => [getDisplayCardKey(card), index + 1]));
    return skillOrderCardInstanceKeys.map((cardKey) => positionByCardKey.get(cardKey) ?? "?").join(" → ");
  }
  const positionByCardId = new Map(displayedCards.map((card, index) => [card.cardId, index + 1]));
  return skillOrderCardIds.map((cardId) => positionByCardId.get(cardId) ?? "?").join(" → ");
}

function StepButton({
  step,
  active,
  onClick,
}: {
  step: (typeof STEPS)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = step.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-max items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${
        active
          ? "border-sky-500 text-sky-600"
          : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-900"
      }`}
    >
      <Icon className="h-4 w-4" />
      {step.label}
    </button>
  );
}

function Segment<T extends string>({
  value,
  options,
  onChange,
  labels,
}: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <div className="inline-flex max-w-full gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
      {options.map((option) => (
        <button
          type="button"
          key={option}
          onClick={() => onChange(option)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            value === option ? "bg-white text-sky-700 shadow-sm ring-1 ring-inset ring-sky-300" : "text-slate-600 hover:bg-white/80"
          }`}
        >
          {labels?.[option] ?? option}
        </button>
      ))}
    </div>
  );
}

function ResultOptionControl({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:flex-row sm:items-center">
      <span className="whitespace-nowrap font-semibold text-slate-600">{label}</span>
      {children}
    </div>
  );
}

function SongDifficultyLevelBadge({
  difficulty,
  song,
  selected = false,
  className = "",
}: {
  difficulty: BandoriTeamSearchDifficulty;
  song: SongMaster | null | undefined;
  selected?: boolean;
  className?: string;
}) {
  const playLevel = getSongDifficulty(song, difficulty)?.playLevel ?? "-";

  return (
    <span
      title={`${DIFFICULTY_LABELS[difficulty]} ${playLevel}`}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black leading-none shadow-sm ring-1 ${DIFFICULTY_LEVEL_CLASSES[difficulty]} ${
        selected ? "outline outline-2 outline-offset-2 outline-sky-400" : "outline outline-2 outline-offset-2 outline-transparent"
      } ${className}`}
    >
      {playLevel}
    </span>
  );
}

function SongDifficultyPicker({
  value,
  options,
  song,
  onChange,
}: {
  value: BandoriTeamSearchDifficulty;
  options: BandoriTeamSearchDifficulty[];
  song: SongMaster | null | undefined;
  onChange: (value: BandoriTeamSearchDifficulty) => void;
}) {
  return (
    <div className="flex max-w-full flex-wrap items-center gap-2" role="radiogroup" aria-label="歌曲难度">
      {options.map((option) => {
        const selected = option === value;

        return (
          <button
            type="button"
            key={option}
            role="radio"
            aria-checked={selected}
            title={`${DIFFICULTY_LABELS[option]} ${getSongDifficulty(song, option)?.playLevel ?? "-"}`}
            onClick={() => onChange(option)}
            className="rounded-full transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <SongDifficultyLevelBadge difficulty={option} song={song} selected={selected} />
          </button>
        );
      })}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm sm:grid-cols-[9rem_1fr] sm:items-center">
      <span className="font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 ${props.className ?? ""}`}
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-9 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 ${props.className ?? ""}`}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function SongOptionList({
  options,
  selectedSongId,
  onSelect,
}: {
  options: Array<{ id: string; title: string }>;
  selectedSongId: string;
  onSelect: (songId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedOptionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const selectedOption = selectedOptionRef.current;
    if (!container || !selectedOption) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const selectedOptionRect = selectedOption.getBoundingClientRect();
    const selectedOptionCenter = selectedOptionRect.top - containerRect.top + container.scrollTop + selectedOptionRect.height / 2;
    const nextScrollTop = selectedOptionCenter - container.clientHeight / 2;
    container.scrollTop = Math.max(0, nextScrollTop);
  }, [selectedSongId, options]);

  if (options.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-sm font-semibold text-slate-500">
        没有找到匹配的歌曲
      </div>
    );
  }

  return (
    <div ref={containerRef} className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((option) => {
        const selected = option.id === selectedSongId;
        return (
          <button
            type="button"
            key={option.id}
            ref={selected ? selectedOptionRef : null}
            onClick={() => onSelect(option.id)}
            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
              selected ? "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-300" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="min-w-0 truncate font-semibold">{option.title}</span>
            <span className="shrink-0 text-xs font-semibold text-slate-400">#{option.id}</span>
          </button>
        );
      })}
    </div>
  );
}

function QuickPickerPanel({
  options,
  selectedId,
  onSelect,
}: {
  options: Array<{ id: string; title: string; badges?: string[] }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.id === selectedId;
          return (
            <button
              type="button"
              key={option.id}
              onClick={() => onSelect(option.id)}
              className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                selected
                  ? "border-sky-300 bg-white text-sky-800 shadow-sm"
                  : "border-sky-100 bg-white/70 text-slate-700 hover:border-sky-200 hover:bg-white"
              }`}
            >
              <span className="max-w-56 truncate">{option.title}</span>
              {(option.badges ?? []).map((badge) => (
                <span key={badge} className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{badge}</span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventSongQuickPicker({
  songs,
  selectedSongId,
  onSelect,
}: {
  songs: Array<{ id: string; title: string; sourceLabels: Array<"JP" | "CN"> }>;
  selectedSongId: string;
  onSelect: (songId: string) => void;
}) {
  return (
    <QuickPickerPanel
      options={songs.map((song) => ({ id: song.id, title: song.title, badges: song.sourceLabels }))}
      selectedId={selectedSongId}
      onSelect={onSelect}
    />
  );
}

function MedleyEventSongQuickPicker({
  options,
  selectedSource,
  onSelect,
}: {
  options: Array<{ id: MedleySongSource; title: string; sourceLabel: "JP" | "CN" }>;
  selectedSource: MedleySongSource;
  onSelect: (source: MedleySongSource) => void;
}) {
  return (
    <QuickPickerPanel
      options={options.map((option) => ({ id: option.id, title: option.title, badges: [option.sourceLabel] }))}
      selectedId={selectedSource === "custom" ? null : selectedSource}
      onSelect={(id) => onSelect(id as MedleySongSource)}
    />
  );
}

function BonusChip({
  children,
  tone = "default",
  compact = false,
}: {
  children: React.ReactNode;
  tone?: "default" | "accent" | "muted";
  compact?: boolean;
}) {
  const toneClassName = tone === "accent"
    ? "border-sky-200 bg-sky-50 text-sky-800"
    : tone === "muted"
      ? "border-slate-200 bg-slate-50 text-slate-500"
      : "border-slate-200 bg-white text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full border text-sm font-semibold shadow-sm ${compact ? "min-h-8 gap-1.5 px-2.5 py-1" : "min-h-9 gap-2 px-3 py-1.5"} ${toneClassName}`}>
      {children}
    </span>
  );
}

function AttributeIcon({ attribute }: { attribute: BandoriCardAttribute }) {
  const iconUrl = buildBandoriAttributeIconUrl(attribute);

  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${ATTRIBUTE_SWATCH_CLASSES[attribute]}`}
      title={ATTRIBUTE_LABELS[attribute]}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      ) : null}
    </span>
  );
}

function CharacterIcon({ characterId, label }: { characterId: number; label: string }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200" title={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={buildBandoriCharacterIconUrl(characterId)}
        alt={label}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

function CharacterBonusChip({ items }: { items: Array<{ characterId: number; label: string; percent: number }> }) {
  if (items.length === 0) {
    return <BonusChip tone="muted">无</BonusChip>;
  }

  const firstPercent = items[0]?.percent ?? 0;
  const allSamePercent = items.every((item) => item.percent === firstPercent);

  if (!allSamePercent) {
    return items.map((item) => (
      <BonusChip key={item.characterId} compact>
        <CharacterIcon characterId={item.characterId} label={item.label} />
        {formatPercent(item.percent)}
      </BonusChip>
    ));
  }

  return (
    <BonusChip compact>
      <span className="flex items-center -space-x-1">
        {items.map((item) => (
          <CharacterIcon key={item.characterId} characterId={item.characterId} label={item.label} />
        ))}
      </span>
      <span className="pl-1">{formatPercent(firstPercent)}</span>
    </BonusChip>
  );
}

function RarityIcon({ rarity }: { rarity: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={buildBandoriRarityIconUrl(rarity)}
      alt={`${rarity}星`}
      className="h-5 w-5 shrink-0 object-contain"
      loading="lazy"
      decoding="async"
    />
  );
}

function BonusCardThumbnail({
  cardId,
  metadata,
  characters,
  skills,
  percent,
  assetRegion,
  bandId,
}: {
  cardId: number;
  metadata: CardMetadata | undefined;
  characters: Record<string, CharacterMaster | undefined>;
  skills: Record<string, SkillMaster | undefined>;
  percent: number;
  assetRegion: BandoriAssetRegion;
  bandId: number | null;
}) {
  const rarity = Math.min(5, Math.max(1, Math.trunc(Number(metadata?.rarity) || 1)));
  const trainedLevelFallback = rarity >= 5 ? 60 : rarity >= 4 ? 60 : rarity >= 3 ? 50 : rarity >= 2 ? 30 : 20;
  const baseLevelLimit = Math.trunc(Number(metadata?.levelLimit) || 0);
  const trainingLevelLimit = Math.trunc(Number(metadata?.stat?.training?.levelLimit) || 0);
  const level = Math.max(1, baseLevelLimit + trainingLevelLimit || trainedLevelFallback);
  return (
    <TeamBuilderCardTile
      card={{
        cardId,
        skillId: getCardSkillId(undefined, metadata) ?? 0,
        rarity,
        attribute: isKnownAttribute(metadata?.attribute) ? metadata.attribute : "powerful",
        bandId,
        level,
        masterRank: 0,
        skillLevel: 1,
        isTrained: rarity >= 3,
        totalPower: 0,
      }}
      metadata={metadata}
      characters={characters}
      skills={skills}
      skillEffectLevel={5}
      badge={formatPercent(percent)}
      assetRegion={assetRegion}
      showPower={false}
    />
  );
}

function TeamBuilderCardTile({
  card,
  metadata,
  characters,
  skills,
  skillEffectLevel,
  badge,
  leader,
  assetRegion = "cn",
  showPower = true,
}: {
  card: DisplayCardLike;
  metadata: CardMetadata | undefined;
  characters?: Record<string, CharacterMaster | undefined>;
  skills?: Record<string, SkillMaster | undefined>;
  skillEffectLevel?: unknown;
  badge?: string;
  leader?: boolean;
  assetRegion?: BandoriAssetRegion;
  showPower?: boolean;
}) {
  const cardId = card.cardId;
  const cardName = pickCardDisplayName(cardId, metadata);
  const tileRef = useRef<HTMLElement | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const rarity = Math.min(5, Math.max(1, Math.trunc(Number(metadata?.rarity ?? card.rarity) || 1)));
  const attribute = isKnownAttribute(metadata?.attribute) ? metadata.attribute : card.attribute;
  const skillEffectLabel = getCardSkillEffectLabel(
    skillEffectLevel === undefined ? card : { ...card, skillLevel: skillEffectLevel },
    metadata,
    skills,
  );

  return (
    <article
      ref={tileRef}
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      className="group relative h-[74px] w-[74px] overflow-visible rounded-[5px] outline outline-1 outline-white/80 transition hover:z-40 hover:-translate-y-0.5 hover:outline-2 hover:outline-sky-400 focus-within:z-40 focus-within:outline-2 focus-within:outline-sky-400 sm:h-[76px] sm:w-[76px]"
    >
      <div className="h-full w-full overflow-visible rounded-[5px] shadow-[0_2px_7px_rgba(15,23,42,0.22)]">
        <BandoriCardThumbnail
          card={card}
          metadata={{ ...metadata, rarity, attribute }}
          bandId={card.bandId}
          region={assetRegion}
          alt={cardName}
          power={card.totalPower}
          showPower={showPower}
        />
      </div>
      {badge ? (
        <span className="absolute -right-2 -top-2 z-30 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-black leading-none text-rose-600 shadow-sm">
          {badge}
        </span>
      ) : null}
      {leader ? (
        <span className="absolute -left-1.5 -top-1.5 z-30 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-black leading-none text-sky-600 shadow-sm">
          队长
        </span>
      ) : null}
      {hoverOpen ? (
        <BandoriCardHoverTooltipPortal
          anchorRef={tileRef}
          open={hoverOpen}
          cardName={cardName}
          characterName={characters ? getCardCharacterLabel(metadata, characters) : `Card #${cardId}`}
        >
          <span className="block w-full whitespace-normal break-words rounded-xl bg-slate-50 px-2 py-1 text-slate-700">
            {skillEffectLabel}
          </span>
        </BandoriCardHoverTooltipPortal>
      ) : null}
    </article>
  );
}

function EventBonusInfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 md:grid-cols-[7rem_1fr] md:items-start">
      <div className="pt-1 text-sm font-semibold text-slate-600">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function EventBonusPanel({
  eventType,
  eventBonus,
  eventBonusLoading,
  eventBonusError,
  characters,
  cardMetadata,
  skills,
  assetRegion,
  eventFormula,
}: {
  eventType: BandoriTeamSearchEventType;
  eventBonus: BandoriEventBonus | null;
  eventBonusLoading: boolean;
  eventBonusError: string;
  characters: Record<string, CharacterMaster | undefined>;
  cardMetadata: Record<string, CardMetadata | undefined>;
  skills: Record<string, SkillMaster | undefined>;
  assetRegion: BandoriAssetRegion;
  eventFormula: EventFormulaOption;
}) {
  const attributeItems = readAttributeBonusItems(eventBonus);
  const characterItems = readCharacterBonusItems(eventBonus, characters);
  const memberItems = readMemberBonusItems(eventBonus, cardMetadata);
  const masterRankGroups = readMasterRankBonusGroups(eventBonus);
  const hasBonus = eventBonus !== null;
  const pointPercent = eventBonus?.pointPercent ?? null;
  const parameterPercent = eventBonus?.parameterPercent ?? null;
  const matchBonusPercent = parameterPercent !== null && parameterPercent !== 0 ? parameterPercent : pointPercent;
  const showParameterBonus = shouldShowParameterBonus(eventType);
  const parameterBonusItems = readEventParameterBonusItems(eventBonus);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-[0_16px_44px_rgba(15,23,42,0.06)] backdrop-blur sm:p-5">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">活动加成</h2>
        </div>
        {eventBonusLoading ? (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            读取加成
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <EventBonusInfoRow label="种类">
          <BonusChip tone="accent">{EVENT_TYPE_LABELS[eventType]}</BonusChip>
          {!hasBonus && !eventBonusLoading ? <BonusChip tone="muted">无活动加成数据</BonusChip> : null}
          {eventBonusError ? <span className="text-sm font-semibold text-rose-600">{eventBonusError}</span> : null}
        </EventBonusInfoRow>

        <EventBonusInfoRow label="属性">
          {attributeItems.length > 0 ? attributeItems.map((item) => (
            <BonusChip key={item.attribute} compact>
              <AttributeIcon attribute={item.attribute} />
              {formatPercent(item.percent)}
            </BonusChip>
          )) : <BonusChip tone="muted">无</BonusChip>}
        </EventBonusInfoRow>

        <EventBonusInfoRow label="角色">
          <CharacterBonusChip items={characterItems} />
        </EventBonusInfoRow>

        <EventBonusInfoRow label="匹配">
          <BonusChip compact>{formatPercent(matchBonusPercent)}</BonusChip>
        </EventBonusInfoRow>

        {showParameterBonus && parameterBonusItems.length > 0 ? (
          <EventBonusInfoRow label="参数">
            {parameterBonusItems.map((item) => (
              <BonusChip key={item.label} compact>{item.label} {formatPercent(item.percent)}</BonusChip>
            ))}
          </EventBonusInfoRow>
        ) : null}

        <EventBonusInfoRow label="星光等级">
          {masterRankGroups.length > 0 ? masterRankGroups.map((group) => (
            <BonusChip key={group.rarity}>
              <RarityIcon rarity={group.rarity} />
              +{formatPercentSequence(group.values)}%
            </BonusChip>
          )) : <BonusChip tone="muted">无</BonusChip>}
        </EventBonusInfoRow>

        <EventBonusInfoRow label="卡牌">
          {memberItems.length > 0 ? memberItems.map((item) => (
            <BonusCardThumbnail
              key={item.cardId}
              cardId={item.cardId}
              metadata={item.metadata}
              characters={characters}
              skills={skills}
              percent={item.percent}
              assetRegion={assetRegion}
              bandId={getCardBandId(item.metadata, characters)}
            />
          )) : <BonusChip tone="muted">无</BonusChip>}
        </EventBonusInfoRow>

        <EventBonusInfoRow label="分数公式">
          <BonusChip compact>{EVENT_FORMULA_LABELS[eventFormula]}</BonusChip>
        </EventBonusInfoRow>
      </div>
    </section>
  );
}

function MultiLiveSettingsPanel({
  averagePower,
  onAveragePowerChange,
  encoreSkillSource,
  onEncoreSkillSourceChange,
  otherPlayers,
  onOtherPlayersChange,
  skills,
}: {
  averagePower: string;
  onAveragePowerChange: (value: string) => void;
  encoreSkillSource: EncoreSkillSource;
  onEncoreSkillSourceChange: (value: EncoreSkillSource) => void;
  otherPlayers: OtherPlayerDraft[];
  onOtherPlayersChange: (value: OtherPlayerDraft[]) => void;
  skills: Record<string, SkillMaster | undefined>;
}) {
  const updatePlayer = (index: number, patch: Partial<OtherPlayerDraft>) => {
    onOtherPlayersChange(otherPlayers.map((player, playerIndex) => (
      playerIndex === index ? { ...player, ...patch } : player
    )));
  };

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <FieldRow label="平均综合力">
        <TextInput
          value={averagePower}
          onChange={(event) => onAveragePowerChange(event.target.value)}
          inputMode="numeric"
        />
      </FieldRow>

      <FieldRow label="技能6">
        <SelectInput value={encoreSkillSource} onChange={(event) => onEncoreSkillSourceChange(event.target.value as EncoreSkillSource)}>
          {ENCORE_SKILL_SOURCE_OPTIONS.map((option) => (
            <option key={option} value={option}>{ENCORE_SKILL_SOURCE_LABELS[option]}</option>
          ))}
        </SelectInput>
      </FieldRow>

      <div className="space-y-3">
        {otherPlayers.map((player, index) => (
          <div key={index} className="grid gap-2 rounded-2xl bg-slate-50 p-3 lg:grid-cols-[5rem_1fr_auto] lg:items-center">
            <div className="text-sm font-semibold text-slate-600">队长 {index + 1}</div>
            <SelectInput
              value={player.skillId}
              onChange={(event) => updatePlayer(index, { skillId: event.target.value })}
            >
              {buildSkillOptions(skills, player.skillLevel).map((skill) => (
                <option key={skill.value} value={skill.value}>{skill.label}</option>
              ))}
            </SelectInput>
            <Segment
              value={player.skillLevel}
              options={OTHER_PLAYER_SKILL_LEVEL_OPTIONS}
              onChange={(value) => updatePlayer(index, { skillLevel: value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultCard({
  result,
  cardMetadata,
  characters,
  skills,
  assetRegion,
  displayLiveBoostCount,
  displayChallengeCpCost,
  displayPlacement,
  displayFestivalResult,
}: {
  result: BandoriTeamSearchResult;
  cardMetadata: Record<string, CardMetadata | undefined>;
  characters: Record<string, CharacterMaster | undefined>;
  skills: Record<string, SkillMaster | undefined>;
  assetRegion: BandoriAssetRegion;
  displayLiveBoostCount: LiveBoostCountOption;
  displayChallengeCpCost: ChallengeCpCostOption;
  displayPlacement: ResultPlacementOption;
  displayFestivalResult: FestivalResultOption;
}) {
  const displayedEventPointOption = getDisplayedEventPointOption(result, {
    liveBoostCount: displayLiveBoostCount,
    challengeCpCost: displayChallengeCpCost,
    placement: displayPlacement,
    festivalResult: displayFestivalResult,
  });
  const displayedEventPoint = displayedEventPointOption?.eventPoint ?? result.eventPoint;
  const displayedTargetValue = result.target === "eventPoint" && displayedEventPoint !== null
    ? displayedEventPoint
    : result.targetValue;
  const displayedCards = orderResultCardsWithLeaderCenter(result.cards, result.leaderCardId, result.leaderCardInstanceKey);
  const skillOrderDisplay = buildSkillOrderDisplay(result.skillOrderCardIds, displayedCards, result.skillOrderActors, result.skillOrderCardInstanceKeys);
  const targetLabel = isScoreLinkedEventPointTarget(result.eventType, result.liveType) && result.target === "eventPoint"
    ? "分数/活动Pt"
    : TARGET_LABELS[result.target];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 text-right text-lg font-bold text-slate-700">#{result.rank}</div>
          <div>
            <div className="text-xl font-bold text-slate-900">{formatNumber(displayedTargetValue)}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              {targetLabel} · {EVENT_TYPE_LABELS[result.eventType]} · {getLiveLabel(result.liveType, result.eventType)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-5">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="font-semibold text-slate-500">分数</div>
            <div className="mt-1 font-bold text-slate-900">{formatNumber(result.score)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="font-semibold text-slate-500">活动Pt</div>
            <div className="mt-1 font-bold text-slate-900">{formatNumber(displayedEventPoint)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="font-semibold text-slate-500">综合力</div>
            <div className="mt-1 font-bold text-slate-900">{formatNumber(result.totalPower)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="font-semibold text-slate-500">房间分</div>
            <div className="mt-1 font-bold text-slate-900">{formatNumber(result.roomScore)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="font-semibold text-slate-500">加成</div>
            <div className="mt-1 font-bold text-slate-900">{formatPercent(result.pointBonusRate * 100)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-2 overflow-visible">
        {displayedCards.map((card) => (
          <TeamBuilderCardTile
            key={getDisplayCardKey(card)}
            card={card}
            metadata={cardMetadata[String(card.cardId)]}
            characters={characters}
            skills={skills}
            leader={getDisplayCardKey(card) === (result.leaderCardInstanceKey ?? `profile:${result.leaderCardId}`)}
            assetRegion={assetRegion}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 lg:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="font-semibold text-slate-800">最佳技能顺序</div>
          <div className="mt-1 break-all">{skillOrderDisplay}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="font-semibold text-slate-800">区域道具配置</div>
          <div className="mt-1">
            {result.areaItemConfiguration.bandKey ?? "-"} · {formatAreaItemAttribute(result.areaItemConfiguration.attribute)} ·{" "}
            {formatAreaItemParameter(result.areaItemConfiguration.parameter)}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="font-semibold text-slate-800">分数区间</div>
          <div className="mt-1">
            {formatNumber(result.minScore)} / {formatNumber(result.averageScore)} / {formatNumber(result.maxScore)}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="font-semibold text-slate-800">概率</div>
          <div className="mt-1">
            最高分顺序 {result.maxScoreOrderCount}/{result.maxScoreOrderTotal}
          </div>
        </div>
        {result.supportBandPower !== null ? (
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="font-semibold text-slate-800">支援队伍</div>
            <div className="mt-1">
              {formatNumber(result.supportBandPower)} · {result.supportCards.map((card) => card.cardId).join(", ")}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MedleyResultCard({
  result,
  cardMetadata,
  characters,
  skills,
  assetRegion,
  songs,
}: {
  result: BandoriMedleyTeamSearchResult;
  cardMetadata: Record<string, CardMetadata | undefined>;
  characters: Record<string, CharacterMaster | undefined>;
  skills: Record<string, SkillMaster | undefined>;
  assetRegion: BandoriAssetRegion;
  songs: Array<SongMaster | null>;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 text-right text-lg font-bold text-slate-700">#{result.rank}</div>
          <div>
            <div className="text-xl font-bold text-slate-900">{formatNumber(result.score)}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              巡回演出 · 平均 {formatNumber(result.averageScore)} · 区间 {formatNumber(result.minScore)} / {formatNumber(result.maxScore)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {result.songResults.map((songResult) => (
            <div key={songResult.songIndex} className="rounded-xl bg-slate-50 px-3 py-2">
              <div className="font-semibold text-slate-500">第 {songResult.songIndex + 1} 首</div>
              <div className="mt-1 font-bold text-slate-900">{formatNumber(songResult.score)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {result.songResults.map((songResult) => {
          const displayedCards = orderResultCardsWithLeaderCenter(songResult.cards, songResult.leaderCardId, songResult.leaderCardInstanceKey);
          const songTitle = pickLocalizedName(songs[songResult.songIndex]?.musicTitle, `第 ${songResult.songIndex + 1} 首`);
          const skillOrderDisplay = buildSkillOrderDisplay(songResult.skillOrderCardIds, displayedCards, songResult.skillOrderActors, songResult.skillOrderCardInstanceKeys);
          return (
            <section key={songResult.songIndex} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-900">第 {songResult.songIndex + 1} 首 · {songTitle}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    分数 {formatNumber(songResult.score)} · 起始 Combo {songResult.startCombo} · Notes {songResult.notesCount}
                  </div>
                </div>
                <div className="text-sm font-bold text-slate-700">{formatNumber(songResult.totalPower)}</div>
              </div>
              <div className="mt-3 flex flex-wrap items-start gap-2 overflow-visible">
                {displayedCards.map((card) => (
                  <TeamBuilderCardTile
                    key={getDisplayCardKey(card)}
                    card={card}
                    metadata={cardMetadata[String(card.cardId)]}
                    characters={characters}
                    skills={skills}
                    leader={getDisplayCardKey(card) === (songResult.leaderCardInstanceKey ?? `profile:${songResult.leaderCardId}`)}
                    assetRegion={assetRegion}
                  />
                ))}
              </div>
              <div className="mt-3 grid gap-3 text-sm text-slate-600 lg:grid-cols-2">
                <div className="rounded-xl bg-white p-3">
                  <div className="font-semibold text-slate-800">最佳技能顺序</div>
                  <div className="mt-1 break-all">{skillOrderDisplay}</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="font-semibold text-slate-800">区域道具配置</div>
                  <div className="mt-1">
                    {songResult.areaItemConfiguration.bandKey ?? "-"} · {formatAreaItemAttribute(songResult.areaItemConfiguration.attribute)} ·{" "}
                    {formatAreaItemParameter(songResult.areaItemConfiguration.parameter)}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}

function MedleyDebugInfoPanel({
  debugText,
  copied,
  onCopy,
}: {
  debugText: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <details className="rounded-2xl border border-red-200 bg-white p-4 text-sm shadow-sm">
      <summary className="cursor-pointer select-none rounded-xl bg-red-50 px-3 py-2 font-bold text-red-700 transition hover:bg-red-100">
        组曲调试信息
      </summary>
      <div className="mt-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-slate-500">
            反馈问题时可以复制这一段 JSON，里面包含输入摘要、证明状态、内存/耗时和算法统计。
          </p>
          <button
            type="button"
            onClick={onCopy}
            className="shrink-0 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:border-red-300 hover:bg-red-100"
          >
            {copied ? "已复制" : "复制调试信息"}
          </button>
        </div>
        <textarea
          readOnly
          value={debugText}
          className="h-80 w-full resize-y rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 outline-none"
        />
      </div>
    </details>
  );
}

function getCardCharacterLabel(metadata: CardMetadata | undefined, characters: Record<string, CharacterMaster | undefined>): string {
  const characterId = Number(metadata?.characterId);
  if (!Number.isFinite(characterId)) {
    return "";
  }
  const character = characters[String(Math.trunc(characterId))];
  return pickCharacterDisplayName(character);
}

function TeamBuilderPanel() {
  const [data, setData] = useState<TeamBuilderData>({
    cloudProfiles: [],
    localProfiles: [],
    events: [],
    songs: {},
    characters: {},
    skills: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const initialLivePreferences = useMemo(() => readLivePreferences(), []);
  const [activeStep, setActiveStep] = useState<StepId>("event");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [songSearch, setSongSearch] = useState("");
  const [songId, setSongId] = useState(() => initialLivePreferences.songId ?? DEFAULT_SONG_ID);
  const [medleySongIds, setMedleySongIds] = useState<[string, string, string]>(() => initialLivePreferences.medleySongIds ?? DEFAULT_MEDLEY_SONG_IDS);
  const [activeMedleySongSlot, setActiveMedleySongSlot] = useState(0);
  const [medleySongSource, setMedleySongSource] = useState<MedleySongSource>("custom");
  const [medleyDifficulties, setMedleyDifficulties] = useState<[BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty]>(() => (
    initialLivePreferences.medleyDifficulties ?? DEFAULT_MEDLEY_DIFFICULTIES
  ));
  const [difficulty, setDifficulty] = useState<BandoriTeamSearchDifficulty>(() => initialLivePreferences.difficulty ?? DEFAULT_DIFFICULTY);
  const [perfectRate, setPerfectRate] = useState(() => initialLivePreferences.perfectRate ?? DEFAULT_PERFECT_RATE);
  const [liveType, setLiveType] = useState<LiveType>(() => initialLivePreferences.liveType ?? "multi");
  const eventFormula: EventFormulaOption = "2";
  const liveBoostCount: LiveBoostCountOption = "3";
  const challengeCpCost: ChallengeCpCostOption = "1600";
  const roomPower = "";
  const [otherPlayersAveragePower, setOtherPlayersAveragePower] = useState(() => initialLivePreferences.otherPlayersAveragePower ?? "380000");
  const useSpecialRoomBonus = true;
  const [encoreSkillSource, setEncoreSkillSource] = useState<EncoreSkillSource>(() => initialLivePreferences.encoreSkillSource ?? "self");
  const [otherPlayers, setOtherPlayers] = useState<OtherPlayerDraft[]>(() => initialLivePreferences.otherPlayers ?? DEFAULT_OTHER_PLAYERS);
  const [profileChoice, setProfileChoice] = useState<ProfileChoice | null>(null);
  const [cardPreferences, setCardPreferences] = useState<TeamBuilderCardPreferences>(() => createDefaultCardPreferences());
  const [cardPickerOpen, setCardPickerOpen] = useState(false);
  const [cardPickerValue, setCardPickerValue] = useState<BandoriCardPickerValue | null>(null);
  const [editingTemporaryCard, setEditingTemporaryCard] = useState<TemporaryGameProfileCard | null>(null);
  const [addingTemporaryCard, setAddingTemporaryCard] = useState(false);
  const cardPickerScrollRef = useRef<HTMLDivElement | null>(null);
  const [target, setTarget] = useState<BandoriTeamSearchTarget>("eventPoint");
  const [medleyCalculationMode, setMedleyCalculationMode] = useState<MedleyCalculationMode>("maximize");
  const [resultLimit, setResultLimit] = useState("10");
  const [maxSearchDurationSeconds, setMaxSearchDurationSeconds] = useState(DEFAULT_SEARCH_DURATION_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [calculationStartedAt, setCalculationStartedAt] = useState<number | null>(null);
  const [calculationNow, setCalculationNow] = useState<number | null>(null);
  const [result, setResult] = useState<TeamBuilderSearchResponse | null>(null);
  const [resultError, setResultError] = useState("");
  const [debugInfoCopied, setDebugInfoCopied] = useState(false);
  const [resultLiveBoostCount, setResultLiveBoostCount] = useState<LiveBoostCountOption>("3");
  const [resultChallengeCpCost, setResultChallengeCpCost] = useState<ChallengeCpCostOption>("1600");
  const [resultPlacement, setResultPlacement] = useState<ResultPlacementOption>("1");
  const [resultFestivalResult, setResultFestivalResult] = useState<FestivalResultOption>("win");
  const [cardMetadata, setCardMetadata] = useState<Record<string, CardMetadata | undefined>>({});
  const [eventBonus, setEventBonus] = useState<BandoriEventBonus | null>(null);
  const [eventBonusLoading, setEventBonusLoading] = useState(false);
  const [eventBonusError, setEventBonusError] = useState("");
  const [addingCurrentEventCards, setAddingCurrentEventCards] = useState(false);
  const [temporaryCardActionError, setTemporaryCardActionError] = useState("");
  const [temporaryCardActionNotice, setTemporaryCardActionNotice] = useState("");
  const [preloadState, setPreloadState] = useState<PreloadState>({
    master: "idle",
    chart: "idle",
    eventBonus: "idle",
    profile: "idle",
    message: "",
  });
  const workerRef = useRef<Worker | null>(null);
  const workerCallbacksRef = useRef(new Map<string, {
    resolve: (response: TeamSearchWorkerResponse) => void;
    reject: (error: Error) => void;
    cleanup?: () => void;
  }>());
  const profilePayloadCacheRef = useRef(new Map<string, UserGameProfilePayload>());
  const selectedProfileCacheKey = profileChoice ? `${profileChoice.source}:${profileChoice.id}` : "";

  const [referenceNow] = useState(() => Date.now());
  const recommendedEvent = useMemo(() => findRecommendedEvent(data.events, referenceNow), [data.events, referenceNow]);
  const selectedEvent = useMemo(() => {
    if (selectedEventId === "none") {
      return null;
    }
    if (selectedEventId !== null) {
      return data.events.find((event) => String(event.eventId) === selectedEventId) ?? null;
    }
    return recommendedEvent;
  }, [data.events, recommendedEvent, selectedEventId]);
  const selectedEventType = useMemo<BandoriTeamSearchEventType>(() => (
    selectedEvent ? eventTypeFromValue(selectedEvent.eventType) : "none"
  ), [selectedEvent]);
  const isMedleyEvent = selectedEventType === "medley";
  const selectedEventAssetRegion = useMemo<BandoriAssetRegion>(() => (
    selectedEvent ? resolveBandoriEventAssetRegion(selectedEvent) : "cn"
  ), [selectedEvent]);
  const currentEventBonusCardIds = useMemo(
    () => Array.from(new Set(getEventBonusMemberCardIds(eventBonus))),
    [eventBonus],
  );
  const recommendedEventStatus = recommendedEvent ? getEventStatus(recommendedEvent, referenceNow) : "unknown";
  const selectedEventSwitcherId = selectedEventId ?? (recommendedEvent ? String(recommendedEvent.eventId) : "none");
  const availableLiveTypes = useMemo(() => allowedLiveTypes(selectedEventType), [selectedEventType]);
  const liveTypeLabels = useMemo<Record<LiveType, string>>(() => ({
    ...LIVE_LABELS,
    free: getLiveLabel("free", selectedEventType),
    multi: getLiveLabel("multi", selectedEventType),
    versus: getLiveLabel("versus", selectedEventType),
  }), [selectedEventType]);
  const updateLiveType = useCallback((value: LiveType) => {
    setLiveType(value);
    writeLivePreferences({ liveType: value });
  }, []);
  const updateSongId = useCallback((value: string) => {
    setSongId(value);
    writeLivePreferences({ songId: value });
  }, []);
  const updateDifficulty = useCallback((value: BandoriTeamSearchDifficulty) => {
    setDifficulty(value);
    writeLivePreferences({ difficulty: value });
  }, []);
  const updateMedleySongId = useCallback((slotIndex: number, value: string) => {
    const next = [...medleySongIds] as [string, string, string];
    next[slotIndex] = value;
    setMedleySongIds(next);
    setMedleySongSource("custom");
    writeLivePreferences({ medleySongIds: next });
  }, [medleySongIds]);
  const updateMedleyDifficulty = useCallback((slotIndex: number, value: BandoriTeamSearchDifficulty) => {
    const next = [...medleyDifficulties] as [BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty];
    next[slotIndex] = value;
    setMedleyDifficulties(next);
    writeLivePreferences({ medleyDifficulties: next });
  }, [medleyDifficulties]);
  const updatePerfectRate = useCallback((value: string) => {
    setPerfectRate(value);
    writeLivePreferences({ perfectRate: value });
  }, []);
  const updateOtherPlayersAveragePower = useCallback((value: string) => {
    setOtherPlayersAveragePower(value);
    writeLivePreferences({ otherPlayersAveragePower: value });
  }, []);
  const updateEncoreSkillSource = useCallback((value: EncoreSkillSource) => {
    setEncoreSkillSource(value);
    writeLivePreferences({ encoreSkillSource: value });
  }, []);
  const updateOtherPlayers = useCallback((value: OtherPlayerDraft[]) => {
    setOtherPlayers(value);
    writeLivePreferences({ otherPlayers: value });
  }, []);
  const updateCardPreferences = useCallback((updater: (current: TeamBuilderCardPreferences) => TeamBuilderCardPreferences) => {
    setCardPreferences((current) => {
      const next = normalizeCardPreferences(updater(current));
      if (selectedProfileCacheKey) {
        writeCardPreferences(selectedProfileCacheKey, next);
      }
      return next;
    });
  }, [selectedProfileCacheKey]);
  const toggleExcludedCard = useCallback((cardId: number) => {
    updateCardPreferences((current) => {
      const excluded = new Set(current.excludedCardIds);
      if (excluded.has(cardId)) {
        excluded.delete(cardId);
      } else {
        excluded.add(cardId);
      }
      return { ...current, excludedCardIds: [...excluded] };
    });
  }, [updateCardPreferences]);
  const bulkSetExcludedCards = useCallback((cardIds: number[], excludedState: boolean) => {
    updateCardPreferences((current) => {
      const excluded = new Set(current.excludedCardIds);
      cardIds.forEach((cardId) => {
        if (!Number.isFinite(cardId) || cardId <= 0) {
          return;
        }
        const normalizedCardId = Math.trunc(cardId);
        if (excludedState) {
          excluded.add(normalizedCardId);
        } else {
          excluded.delete(normalizedCardId);
        }
      });
      return { ...current, excludedCardIds: [...excluded] };
    });
  }, [updateCardPreferences]);
  const clearTemporaryCards = useCallback(() => {
    setTemporaryCardActionError("");
    setTemporaryCardActionNotice("");
    updateCardPreferences((current) => ({ ...current, temporaryCards: [] }));
  }, [updateCardPreferences]);
  const updateOwnedCardParameters = useCallback((patch: Partial<OwnedCardParameterPreferences>) => {
    updateCardPreferences((current) => ({
      ...current,
      ownedCardParameters: normalizeOwnedCardParameterPreferences({
        ...current.ownedCardParameters,
        ...patch,
      }),
    }));
  }, [updateCardPreferences]);
  const editTemporaryCard = useCallback((instanceId: string) => {
    const card = cardPreferences.temporaryCards.find((item) => item.instanceId === instanceId);
    if (card) {
      setEditingTemporaryCard(card);
    }
  }, [cardPreferences.temporaryCards]);
  const saveTemporaryCard = useCallback((card: UserGameProfileCardRecord) => {
    if (!editingTemporaryCard) {
      return;
    }
    setTemporaryCardActionError("");
    setTemporaryCardActionNotice("");
    const nextCard: TemporaryGameProfileCard = {
      ...card,
      instanceId: editingTemporaryCard.instanceId,
      isExcluded: false,
    };
    updateCardPreferences((current) => {
      const exists = current.temporaryCards.some((item) => item.instanceId === nextCard.instanceId);
      return {
        ...current,
        temporaryCards: exists
          ? current.temporaryCards.map((item) => item.instanceId === nextCard.instanceId ? nextCard : item)
          : [...current.temporaryCards, nextCard],
      };
    });
    setEditingTemporaryCard(null);
    setCardPickerValue(null);
  }, [editingTemporaryCard, updateCardPreferences]);
  const deleteTemporaryCard = useCallback(() => {
    if (!editingTemporaryCard) {
      return;
    }
    setTemporaryCardActionError("");
    setTemporaryCardActionNotice("");
    updateCardPreferences((current) => ({
      ...current,
      temporaryCards: current.temporaryCards.filter((card) => card.instanceId !== editingTemporaryCard.instanceId),
    }));
    setEditingTemporaryCard(null);
    setCardPickerValue(null);
  }, [editingTemporaryCard, updateCardPreferences]);
  const closeTemporaryCardEditor = useCallback(() => {
    setEditingTemporaryCard(null);
    setCardPickerValue(null);
  }, []);
  const ensureCardsMetadata = useCallback(async (cardIds: number[]): Promise<Record<string, CardMetadata | undefined>> => {
    const normalizedCardIds = Array.from(new Set(cardIds
      .map((cardId) => Math.trunc(cardId))
      .filter((cardId) => Number.isFinite(cardId) && cardId > 0)));
    const missingCardIds = normalizedCardIds.filter((cardId) => !cardMetadata[String(cardId)]);
    if (missingCardIds.length === 0) {
      return Object.fromEntries(normalizedCardIds.map((cardId) => [String(cardId), cardMetadata[String(cardId)]]));
    }

    const payload = await requestJson<{ cards: Record<string, CardMetadata | undefined> }>(`/api/bandori/cards?ids=${missingCardIds.join(",")}`);
    const mergedMetadata = { ...cardMetadata, ...payload.cards };
    setCardMetadata((current) => ({ ...current, ...payload.cards }));
    return Object.fromEntries(normalizedCardIds.map((cardId) => [String(cardId), mergedMetadata[String(cardId)]]));
  }, [cardMetadata]);
  const ensureCardMetadata = useCallback(async (cardId: number): Promise<CardMetadata | undefined> => {
    const cards = await ensureCardsMetadata([cardId]);
    return cards[String(Math.trunc(cardId))];
  }, [ensureCardsMetadata]);
  const selectTemporaryCard = useCallback((value: BandoriCardPickerValue | null) => {
    setCardPickerValue(value);
    if (!value || addingTemporaryCard) {
      return;
    }
    setAddingTemporaryCard(true);
    void ensureCardMetadata(value.cardId)
      .then((metadata) => {
        const card = createMaxGameProfileCard(value.cardId, metadata);
        setEditingTemporaryCard({ ...card, instanceId: crypto.randomUUID() });
      })
      .finally(() => setAddingTemporaryCard(false));
  }, [addingTemporaryCard, ensureCardMetadata]);
  const showCoopLiveSettings = shouldUseCoopLiveSettings(selectedEventType, liveType);
  const scoreLinkedEventPointTarget = isScoreLinkedEventPointTarget(selectedEventType, liveType);
  const targetOptions = useMemo<BandoriTeamSearchTarget[]>(() => (
    isMedleyEvent ? ["score"] : scoreLinkedEventPointTarget ? ["eventPoint"] : ["score", "eventPoint"]
  ), [isMedleyEvent, scoreLinkedEventPointTarget]);
  const targetLabels = useMemo<Record<BandoriTeamSearchTarget, string>>(() => ({
    ...TARGET_LABELS,
    eventPoint: scoreLinkedEventPointTarget ? "分数/活动Pt" : TARGET_LABELS.eventPoint,
  }), [scoreLinkedEventPointTarget]);
  const eventSwitcherEvents = useMemo<BandoriEventSwitcherEvent[]>(() => (
    data.events.map((event) => {
      const status = getEventStatus(event, referenceNow);
      return {
        id: event.eventId,
        name: event.name.cn ?? event.name.jp,
        startAt: getEventStartAt(event),
        endAt: getEventEndAt(event),
        hasCn: hasBandoriOfficialCnEventContent(event),
        hasJp: Boolean(event.name.jp),
        typeLabel: EVENT_TYPE_LABELS[event.eventType] ?? event.eventType,
        statusLabel: getEventStatusLabel(status),
        statusTone: status === "ongoing" ? "emerald" : status === "upcoming" ? "blue" : "muted",
      };
    })
  ), [data.events, referenceNow]);
  const selectedEventBannerUrl = useMemo(() => {
    if (!selectedEvent) {
      return "";
    }
    const bundleName = resolveBandoriEventBannerBundleName(selectedEvent.asset);
    if (!bundleName) {
      return "";
    }
    return buildBandoriEventBannerPublicUrl(selectedEventAssetRegion, bundleName);
  }, [selectedEvent, selectedEventAssetRegion]);
  const shouldLimitSongsToEventSongs = selectedEventType === "challenge" && liveType === "challenge";
  const medleyEventSongOptions = useMemo(() => {
    const sources: Array<{ source: "CN" | "JP"; id: MedleySongSource }> = [
      { source: "CN", id: "event-cn" },
      { source: "JP", id: "event-jp" },
    ];
    return sources.flatMap(({ source, id }) => {
      const songIds = getMedleyEventSongIdsForSource(selectedEvent, source);
      if (songIds.length !== MEDLEY_SLOT_COUNT) {
        return [];
      }
      return [{
        id,
        title: `活动曲目 ${source}`,
        sourceLabel: source,
        songIds: songIds.map(String) as [string, string, string],
      }];
    });
  }, [selectedEvent]);
  const useEventMedleySongs = useCallback((source: MedleySongSource) => {
    const option = medleyEventSongOptions.find((item) => item.id === source);
    if (!option) {
      return;
    }
    setMedleySongIds(option.songIds);
    setMedleySongSource(option.id);
    writeLivePreferences({ medleySongIds: option.songIds });
  }, [medleyEventSongOptions]);
  const eventSongOptions = useMemo(() => {
    if (isMedleyEvent || !canShowEventSongPicker(selectedEventType, liveType)) {
      return [];
    }

    return getEventSongIds(selectedEvent).flatMap((eventSongId) => {
      const song = data.songs[String(eventSongId)];
      if (!song) {
        return [];
      }

      const sourceLabels: Array<"JP" | "CN"> = [];
      if (selectedEvent?.musicIds.jp.includes(eventSongId)) {
        sourceLabels.push("JP");
      }
      if (selectedEvent?.musicIds.cn.includes(eventSongId)) {
        sourceLabels.push("CN");
      }

      return [{
        id: String(eventSongId),
        title: pickLocalizedName(song.musicTitle, `#${eventSongId}`),
        sourceLabels,
      }];
    });
  }, [data.songs, isMedleyEvent, liveType, selectedEvent, selectedEventType]);
  const songOptions = useMemo(() => {
    const normalizedSearch = songSearch.trim().toLowerCase();
    const eventSongIdSet = shouldLimitSongsToEventSongs
      ? new Set(eventSongOptions.map((option) => option.id))
      : null;
    const entries = Object.entries(data.songs)
      .flatMap(([id, song]) => {
        if (!song) {
          return [];
        }
        if (eventSongIdSet && !eventSongIdSet.has(id)) {
          return [];
        }
        const title = pickLocalizedName(song.musicTitle, `#${id}`);
        if (normalizedSearch && !(`${id} ${title}`.toLowerCase().includes(normalizedSearch))) {
          return [];
        }
        return [{ id, song, title }];
      })
      .sort((left, right) => Number(right.id) - Number(left.id));
    return entries;
  }, [data.songs, eventSongOptions, shouldLimitSongsToEventSongs, songSearch]);
  const selectedSong = songId ? data.songs[songId] ?? null : null;
  const selectedMedleySongs = useMemo(() => (
    medleySongIds.map((id) => data.songs[id] ?? null)
  ), [data.songs, medleySongIds]);
  const activeMedleySong = selectedMedleySongs[activeMedleySongSlot] ?? null;
  const activeMedleyDifficulty = medleyDifficulties[activeMedleySongSlot];
  const activeMedleySongDifficulties = useMemo(() => (
    DIFFICULTIES.filter((item) => getSongDifficulty(activeMedleySong, item))
  ), [activeMedleySong]);
  const selectedSongDifficulties = useMemo(() => (
    DIFFICULTIES.filter((item) => getSongDifficulty(selectedSong, item))
  ), [selectedSong]);
  const allProfiles = useMemo(() => [
    ...data.cloudProfiles.map((profile) => ({
      type: "cloud" as const,
      id: profile.id,
      name: profile.name,
      cardCount: profile.cardCount,
      syncedAt: profile.syncedAt,
      updatedAt: profile.updatedAt,
    })),
    ...data.localProfiles.map((profile) => ({
      type: "local" as const,
      id: profile.id,
      name: profile.name,
      cardCount: profile.cardCount,
      syncedAt: profile.syncedAt,
      updatedAt: profile.updatedAt,
    })),
  ], [data.cloudProfiles, data.localProfiles]);
  const selectedProfileLabel = profileChoice
    ? allProfiles.find((profile) => profile.type === profileChoice.source && profile.id === profileChoice.id)?.name ?? "已选择档案"
    : "未选择档案";
  const selectedProfilePayload = selectedProfileCacheKey
    ? profilePayloadCacheRef.current.get(selectedProfileCacheKey) ?? null
    : null;
  const selectedProfileCards = useMemo(
    () => selectedProfilePayload ? getGameProfileCards(selectedProfilePayload) : [],
    [selectedProfilePayload],
  );
  const selectedProfileAssetRegion = useMemo<BandoriAssetRegion>(() => (
    selectedProfilePayload?.bestdoriProfile.server === 3 ? "cn" : "jp"
  ), [selectedProfilePayload]);
  const selectedProfileCharacterBonusesById = useMemo(
    () => selectedProfilePayload
      ? toBandoriCharacterBonusMap(buildBandoriCharacterBonuses(
        getGameProfileCharacterPotentials(selectedProfilePayload),
        getGameProfileCharacterMissionBonuses(selectedProfilePayload),
      ))
      : {},
    [selectedProfilePayload],
  );
  const addCurrentEventBonusTemporaryCards = useCallback(() => {
    if (currentEventBonusCardIds.length === 0 || addingCurrentEventCards) {
      return;
    }

    const cardIds = currentEventBonusCardIds;
    setAddingCurrentEventCards(true);
    setTemporaryCardActionError("");
    setTemporaryCardActionNotice("");
    void ensureCardsMetadata(cardIds)
      .then((metadataById) => {
        const candidateTemporaryCards = cardIds.map((cardId) => ({
          ...createMaxGameProfileCard(cardId, metadataById[String(cardId)]),
          instanceId: crypto.randomUUID(),
        }));
        const { cardsToAdd, skippedDuplicateCount } = selectMissingTemporaryCards(
          selectedProfileCards,
          cardPreferences,
          candidateTemporaryCards,
        );
        if (skippedDuplicateCount > 0) {
          setTemporaryCardActionNotice(`${skippedDuplicateCount}张重复卡牌已跳过添加`);
        }
        if (cardsToAdd.length > 0) {
          updateCardPreferences((current) => ({
            ...current,
            temporaryCards: [...current.temporaryCards, ...cardsToAdd],
          }));
        }
      })
      .catch((error) => {
        setTemporaryCardActionError(error instanceof Error ? `添加当期卡牌失败：${error.message}` : "添加当期卡牌失败");
      })
      .finally(() => setAddingCurrentEventCards(false));
  }, [
    addingCurrentEventCards,
    cardPreferences,
    currentEventBonusCardIds,
    ensureCardsMetadata,
    selectedProfileCards,
    updateCardPreferences,
  ]);

  const getTeamSearchWorker = useCallback(() => {
    if (workerRef.current) {
      return workerRef.current;
    }

    const worker = createTeamSearchWorker();
    worker.onmessage = (event: MessageEvent<TeamSearchWorkerResponse>) => {
      const callback = workerCallbacksRef.current.get(event.data.requestId);
      if (!callback) {
        return;
      }
      workerCallbacksRef.current.delete(event.data.requestId);
      callback.cleanup?.();
      callback.resolve(event.data);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "计算线程启动失败");
      workerCallbacksRef.current.forEach((callback) => {
        callback.cleanup?.();
        callback.reject(error);
      });
      workerCallbacksRef.current.clear();
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const postTeamSearchWorkerMessage = useCallback((
    message: TeamSearchWorkerMessage,
    options?: { memoryWatchdog?: boolean },
  ): Promise<TeamSearchWorkerResponse> => (
    new Promise((resolve, reject) => {
      const worker = getTeamSearchWorker();
      let watchdogIntervalId: number | null = null;
      const cleanup = (): void => {
        if (watchdogIntervalId !== null) {
          window.clearInterval(watchdogIntervalId);
          watchdogIntervalId = null;
        }
      };
      const rejectAllAndResetWorker = (error: Error): void => {
        workerCallbacksRef.current.forEach((callback) => {
          callback.cleanup?.();
          callback.reject(error);
        });
        workerCallbacksRef.current.clear();
        worker.terminate();
        if (workerRef.current === worker) {
          workerRef.current = null;
        }
      };

      if (options?.memoryWatchdog) {
        let isCheckingMemory = false;
        watchdogIntervalId = window.setInterval(() => {
          if (isCheckingMemory) {
            return;
          }
          isCheckingMemory = true;
          void readBrowserHeapSnapshot()
            .then((heap) => {
              if (!heap || heap.usedMiB < heap.effectiveLimitMiB || !workerCallbacksRef.current.has(message.requestId)) {
                return;
              }
              rejectAllAndResetWorker(new Error(
                `已触发浏览器内存保护，计算已停止（当前约 ${heap.usedMiB} MiB，保护上限 ${heap.effectiveLimitMiB} MiB${heap.limitMiB !== null ? `，浏览器 heap 上限 ${heap.limitMiB} MiB` : ""}，来源 ${heap.source === "agent" ? "浏览器进程级统计" : "JS heap 统计"}）。`,
              ));
            })
            .finally(() => {
              isCheckingMemory = false;
            });
        }, MEDLEY_BROWSER_MEMORY_WATCHDOG_INTERVAL_MS);
      }

      workerCallbacksRef.current.set(message.requestId, { resolve, reject, cleanup });
      worker.postMessage(message);
    })
  ), [getTeamSearchWorker]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    workerCallbacksRef.current.forEach((callback) => callback.cleanup?.());
    workerCallbacksRef.current.clear();
  }, []);

  useEffect(() => {
    if (!submitting || calculationStartedAt === null) {
      return undefined;
    }
    setCalculationNow(Date.now());
    const intervalId = window.setInterval(() => {
      setCalculationNow(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [calculationStartedAt, submitting]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cloudProfiles, localProfiles, eventsResponse, songsResponse, charactersResponse, skillsResponse] = await Promise.all([
        requestJson<CloudGameProfileSummary[]>("/api/account/game-profiles", undefined, true),
        listLocalGameProfiles(),
        requestJson<{ events: BandoriEventSummary[] }>("/api/bandori/events"),
        requestJson<{ payload: Record<string, SongMaster | undefined> }>("/api/bandori/master/songs"),
        requestJson<{ payload: Record<string, CharacterMaster | undefined> }>("/api/bandori/master/characters"),
        requestJson<{ payload: Record<string, SkillMaster | undefined> }>("/api/bandori/master/skills"),
      ]);
      const supportedEvents = eventsResponse.events.filter((event) => SUPPORTED_EVENT_TYPES.has(event.eventType));
      setData({
        cloudProfiles,
        localProfiles,
        events: supportedEvents,
        songs: songsResponse.payload,
        characters: charactersResponse.payload,
        skills: skillsResponse.payload,
      });
      const firstProfile = cloudProfiles[0] ?? localProfiles[0];
      if (firstProfile) {
        setProfileChoice(firstProfile.id.startsWith("local_") ? { source: "local", id: firstProfile.id } : { source: "cloud", id: firstProfile.id });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取组队计算器数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const requestId = crypto.randomUUID();
    let active = true;
    const preloadSongs = isMedleyEvent
      ? medleySongIds.map((id, index) => ({ songId: Number(id), difficulty: medleyDifficulties[index] }))
      : undefined;
    const canPreloadCharts = isMedleyEvent
      ? medleySongIds.every((id) => id && Number.isFinite(Number(id)))
      : Boolean(songId);
    setPreloadState((current) => ({
      ...current,
      master: current.master === "ready" ? "ready" : "loading",
      chart: canPreloadCharts ? "loading" : "idle",
      eventBonus: selectedEvent ? "loading" : "ready",
      message: "",
    }));

    void postTeamSearchWorkerMessage({
      type: "preload",
      requestId,
      song: !isMedleyEvent && songId ? { songId: Number(songId), difficulty } : undefined,
      songs: preloadSongs,
      event: selectedEvent ? { eventId: selectedEvent.eventId } : undefined,
    })
      .then((response) => {
        if (!active) {
          return;
        }
        if (response.ok) {
          setPreloadState((current) => ({
            ...current,
            master: "ready",
            chart: canPreloadCharts ? "ready" : "idle",
            eventBonus: selectedEvent ? "ready" : "ready",
            message: "",
          }));
        } else {
          setPreloadState((current) => ({
            ...current,
            master: current.master === "ready" ? "ready" : "error",
            chart: canPreloadCharts ? "error" : "idle",
            eventBonus: selectedEvent ? "error" : "ready",
            message: response.error,
          }));
        }
      })
      .catch((preloadError) => {
        if (!active) {
          return;
        }
        setPreloadState((current) => ({
          ...current,
          master: current.master === "ready" ? "ready" : "error",
          chart: canPreloadCharts ? "error" : "idle",
          eventBonus: selectedEvent ? "error" : "ready",
          message: preloadError instanceof Error ? preloadError.message : "准备数据失败",
        }));
      });

    return () => {
      active = false;
    };
  }, [difficulty, isMedleyEvent, medleyDifficulties, medleySongIds, postTeamSearchWorkerMessage, selectedEvent, songId]);

  useEffect(() => {
    if (!profileChoice) {
      setPreloadState((current) => ({ ...current, profile: "idle" }));
      return;
    }

    const cacheKey = `${profileChoice.source}:${profileChoice.id}`;
    if (profilePayloadCacheRef.current.has(cacheKey)) {
      setPreloadState((current) => ({ ...current, profile: "ready", message: "" }));
      return;
    }

    let active = true;
    setPreloadState((current) => ({ ...current, profile: "loading", message: "" }));
    const profilePayloadPromise = profileChoice.source === "cloud"
      ? requestJson<CompressedGameProfilePayload>(
        `/api/account/game-profiles/${profileChoice.id}/payload`,
        undefined,
        true,
      ).then(decodeCompressedGameProfilePayload)
      : readLocalGameProfilePayload(profileChoice.id);

    void profilePayloadPromise
      .then((profilePayload) => {
        profilePayloadCacheRef.current.set(cacheKey, profilePayload);
        if (active) {
          setPreloadState((current) => ({ ...current, profile: "ready", message: "" }));
        }
      })
      .catch((profileError) => {
        if (active) {
          setPreloadState((current) => ({
            ...current,
            profile: "error",
            message: profileError instanceof Error ? profileError.message : "读取档案失败",
          }));
        }
      });

    return () => {
      active = false;
    };
  }, [profileChoice]);

  useEffect(() => {
    setCardPreferences(readCardPreferences(selectedProfileCacheKey));
    setCardPickerOpen(false);
    setCardPickerValue(null);
    setEditingTemporaryCard(null);
  }, [selectedProfileCacheKey]);

  useEffect(() => {
    if (!availableLiveTypes.includes(liveType)) {
      setLiveType(availableLiveTypes.includes("multi") ? "multi" : availableLiveTypes[0] ?? "free");
    }
  }, [availableLiveTypes, liveType]);

  useEffect(() => {
    if (isMedleyEvent) {
      setLiveType("free");
      setResultLimit("1");
      setMaxSearchDurationSeconds(MEDLEY_PREVIEW_SEARCH_DURATION_SECONDS);
      return;
    }
    setResultLimit((current) => (current === "1" ? "10" : current));
    setMaxSearchDurationSeconds((current) => (
      current === MEDLEY_PREVIEW_SEARCH_DURATION_SECONDS ? DEFAULT_SEARCH_DURATION_SECONDS : current
    ));
  }, [isMedleyEvent]);

  useEffect(() => {
    if (!isMedleyEvent || medleySongSource === "custom") {
      return;
    }
    const option = medleyEventSongOptions.find((item) => item.id === medleySongSource);
    if (!option) {
      setMedleySongSource("custom");
      return;
    }
    setMedleySongIds(option.songIds);
  }, [isMedleyEvent, medleyEventSongOptions, medleySongSource]);

  useEffect(() => {
    if (!targetOptions.includes(target)) {
      setTarget(targetOptions.includes("eventPoint") ? "eventPoint" : targetOptions[0]);
    }
  }, [target, targetOptions]);

  useEffect(() => {
    if (!shouldLimitSongsToEventSongs || eventSongOptions.length === 0) {
      return;
    }

    if (!eventSongOptions.some((option) => option.id === songId)) {
      setSongId(eventSongOptions[0].id);
    }
  }, [eventSongOptions, shouldLimitSongsToEventSongs, songId]);

  useEffect(() => {
    if (!selectedEvent) {
      setEventBonus(null);
      setEventBonusLoading(false);
      setEventBonusError("");
      return;
    }

    const controller = new AbortController();
    setEventBonusLoading(true);
    setEventBonusError("");
    void requestJson<EventBonusResponse>(`/api/bandori/events/bonuses?event=${selectedEvent.eventId}`, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setEventBonus(payload.bonuses[0] ?? null);
        }
      })
      .catch((bonusError) => {
        if (!controller.signal.aborted) {
          setEventBonus(null);
          setEventBonusError(bonusError instanceof Error ? bonusError.message : "读取活动加成失败");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setEventBonusLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedEvent]);

  useEffect(() => {
    if (selectedSongDifficulties.length > 0 && !selectedSongDifficulties.includes(difficulty)) {
      const nextDifficulty = selectedSongDifficulties[selectedSongDifficulties.length - 1];
      setDifficulty(nextDifficulty);
      writeLivePreferences({ difficulty: nextDifficulty });
    }
  }, [difficulty, selectedSongDifficulties]);

  useEffect(() => {
    if (!isMedleyEvent || activeMedleySongDifficulties.length === 0 || activeMedleySongDifficulties.includes(activeMedleyDifficulty)) {
      return;
    }
    updateMedleyDifficulty(activeMedleySongSlot, activeMedleySongDifficulties[activeMedleySongDifficulties.length - 1]);
  }, [activeMedleyDifficulty, activeMedleySongDifficulties, activeMedleySongSlot, isMedleyEvent, updateMedleyDifficulty]);

  useEffect(() => {
    if (!isMedleyEvent) {
      return;
    }
    let changed = false;
    const nextDifficulties = [...medleyDifficulties] as [BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty, BandoriTeamSearchDifficulty];
    selectedMedleySongs.forEach((song, index) => {
      const availableDifficulties = DIFFICULTIES.filter((item) => getSongDifficulty(song, item));
      if (availableDifficulties.length > 0 && !availableDifficulties.includes(nextDifficulties[index])) {
        nextDifficulties[index] = availableDifficulties[availableDifficulties.length - 1];
        changed = true;
      }
    });
    if (changed) {
      setMedleyDifficulties(nextDifficulties);
      writeLivePreferences({ medleyDifficulties: nextDifficulties });
    }
  }, [isMedleyEvent, medleyDifficulties, selectedMedleySongs]);

  useEffect(() => {
    const resultCardIds = getSearchResultCardIds(result);
    const preferenceCardIds = [
      ...selectedProfileCards.map((card) => card.cardId),
      ...cardPreferences.temporaryCards.map((card) => card.cardId),
    ];
    const cardIds = [...currentEventBonusCardIds, ...resultCardIds, ...preferenceCardIds];
    const uniqueCardIds = Array.from(new Set(cardIds)).filter((cardId) => !cardMetadata[String(cardId)]);
    if (uniqueCardIds.length === 0) {
      return;
    }
    void requestJson<{ cards: Record<string, CardMetadata | undefined> }>(`/api/bandori/cards?ids=${uniqueCardIds.join(",")}`)
      .then((payload) => setCardMetadata((current) => ({ ...current, ...payload.cards })))
      .catch(() => undefined);
  }, [cardMetadata, cardPreferences.temporaryCards, currentEventBonusCardIds, result, selectedProfileCards]);

  const resultEventPointMode = useMemo(() => {
    const singleResult = result?.results.find((item): item is BandoriTeamSearchResult => (
      !isMedleySearchResult(item) && item.eventPointOptions.mode !== "none"
    ));
    return singleResult?.eventPointOptions.mode ?? "none";
  }, [result]);
  const isPreloadReady = preloadState.master === "ready"
    && preloadState.chart === "ready"
    && preloadState.eventBonus === "ready"
    && preloadState.profile === "ready";
  const isPreloadLoading = preloadState.master === "loading"
    || preloadState.chart === "loading"
    || preloadState.eventBonus === "loading"
    || preloadState.profile === "loading";
  const preloadStatusMessage = preloadState.message || (
    isPreloadLoading ? "正在准备计算数据" : ""
  );
  const calculationElapsedSeconds = submitting && calculationStartedAt !== null && calculationNow !== null
    ? Math.max(0, Math.floor((calculationNow - calculationStartedAt) / 1000))
    : 0;
  const calculationElapsedLabel = formatDurationLabel(calculationElapsedSeconds);
  const medleyPreviewSearchDurationLabel = formatDurationLabel(Number(MEDLEY_PREVIEW_SEARCH_DURATION_SECONDS));
  const medleyDebugText = useMemo(() => {
    if (!result || !isMedleySearchResponse(result)) {
      return "";
    }
    return JSON.stringify(buildMedleyDebugPayload({
      result,
      selectedEvent,
      medleySongIds,
      medleyDifficulties,
      songs: data.songs,
      profileLabel: selectedProfileLabel,
      selectedProfileCacheKey,
      perfectRate,
      maxSearchDurationSeconds,
      medleyCalculationMode,
    }), null, 2);
  }, [
    data.songs,
    maxSearchDurationSeconds,
    medleyCalculationMode,
    medleyDifficulties,
    medleySongIds,
    perfectRate,
    result,
    selectedEvent,
    selectedProfileCacheKey,
    selectedProfileLabel,
  ]);
  const copyMedleyDebugInfo = useCallback(() => {
    if (!medleyDebugText) {
      return;
    }
    void navigator.clipboard.writeText(medleyDebugText)
      .then(() => {
        setDebugInfoCopied(true);
        window.setTimeout(() => setDebugInfoCopied(false), 1600);
      })
      .catch(() => {
        setDebugInfoCopied(false);
      });
  }, [medleyDebugText]);

  async function handleCalculate() {
    if (!profileChoice) {
      setResultError("请选择一个卡牌档案");
      setActiveStep("profile");
      return;
    }
    if (isMedleyEvent && !medleySongIds.every((id) => id && Number.isFinite(Number(id)))) {
      setResultError("巡回演出需要选择 3 首歌曲");
      setActiveStep("song");
      return;
    }
    if (!isMedleyEvent && !songId) {
      setResultError("请选择歌曲");
      setActiveStep("song");
      return;
    }

    if (!isPreloadReady) {
      setResultError(preloadStatusMessage || "计算数据尚未准备完成");
      return;
    }
    const profilePayload = profilePayloadCacheRef.current.get(selectedProfileCacheKey);
    if (!profilePayload) {
      setResultError("档案尚未准备完成");
      return;
    }

    setSubmitting(true);
    const startedAt = Date.now();
    setCalculationStartedAt(startedAt);
    setCalculationNow(startedAt);
    setResultError("");
    setResult(null);
    setDebugInfoCopied(false);
    try {
      const response = await postTeamSearchWorkerMessage({
        type: "search",
        requestId: crypto.randomUUID(),
        profilePayload,
        event: {
          eventId: selectedEvent ? selectedEvent.eventId : undefined,
          eventType: selectedEventType,
          formula: Number(eventFormula) as 0 | 1 | 2,
          bonusOverride: undefined,
        },
        live: {
          type: isMedleyEvent ? "free" : liveType,
          roomPower: roomPower.trim() ? Number(roomPower) : undefined,
          otherPlayersAveragePower: otherPlayersAveragePower.trim() ? Number(otherPlayersAveragePower) : undefined,
          useSpecialRoomBonus,
          encoreSkillSource,
          liveBoostCount: Number(liveBoostCount) as TeamSearchWorkerRequest["live"]["liveBoostCount"],
          challengeCpCost: Number(challengeCpCost) as TeamSearchWorkerRequest["live"]["challengeCpCost"],
          otherPlayerSkills: otherPlayers.map((player) => ({
            skillId: Number(player.skillId),
            skillLevel: Number(player.skillLevel),
          })),
        },
        song: {
          songId: Number(isMedleyEvent ? medleySongIds[0] : songId),
          difficulty: isMedleyEvent ? medleyDifficulties[0] : difficulty,
          perfectRate: Math.max(0, Math.min(1, Number(perfectRate) / 100)),
        },
        songs: isMedleyEvent
          ? medleySongIds.map((id, index) => ({ songId: Number(id), difficulty: medleyDifficulties[index] }))
          : undefined,
        cards: {
          excludedCardIds: cardPreferences.excludedCardIds,
          ownedCardParameters: cardPreferences.ownedCardParameters,
          temporaryCards: cardPreferences.temporaryCards.map((card) => ({
            ...card,
            cardInstanceKey: `temporary:${card.instanceId}`,
          })),
        },
        calculation: {
          target: isMedleyEvent ? "score" : target,
          resultLimit: isMedleyEvent ? 1 : Number(resultLimit),
          maxSearchDurationMs: Math.min(
            isMedleyEvent ? 300000 : Number.POSITIVE_INFINITY,
            Math.max(1, Number(maxSearchDurationSeconds)) * 1000,
          ),
          medleyMode: isMedleyEvent ? medleyCalculationMode : undefined,
        },
      }, { memoryWatchdog: isMedleyEvent });
      if (!response.ok) {
        throw new Error(response.error);
      }
      if (response.type !== "search") {
        throw new Error("计算线程返回格式无效");
      }
      setResultLiveBoostCount(liveBoostCount);
      setResultChallengeCpCost(challengeCpCost);
      setResultPlacement("1");
      setResultFestivalResult("win");
      setResult(response.result);
      setActiveStep("calculate");
    } catch (calculateError) {
      setResultError(calculateError instanceof Error ? calculateError.message : "计算失败");
    } finally {
      setSubmitting(false);
      setCalculationStartedAt(null);
      setCalculationNow(null);
    }
  }

  if (loading) {
    return <AccountLoadingState message="正在读取组队计算器数据..." />;
  }
  if (error) {
    return <AccountErrorState message={error} />;
  }

  const editingTemporaryCardExists = editingTemporaryCard
    ? cardPreferences.temporaryCards.some((card) => card.instanceId === editingTemporaryCard.instanceId)
    : false;

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max justify-end gap-1">
          {STEPS.map((step) => (
            <StepButton key={step.id} step={step} active={activeStep === step.id} onClick={() => setActiveStep(step.id)} />
          ))}
        </div>
      </div>

      {activeStep === "event" ? (
        <section className="space-y-5">
          <BandoriEventSwitcher
            title={selectedEvent ? selectedEvent.name.cn ?? selectedEvent.name.jp : "无活动"}
            events={eventSwitcherEvents}
            selectedEventId={selectedEventSwitcherId}
            onSelectedEventIdChange={setSelectedEventId}
            bannerUrl={selectedEventBannerUrl}
            startText={selectedEvent ? `${formatDate(getEventStartAt(selectedEvent))} (CN)` : null}
            endText={selectedEvent ? `${formatDate(getEventEndAt(selectedEvent))} (CN)` : null}
            recommendedEventId={recommendedEvent ? String(recommendedEvent.eventId) : null}
            recommendedLabel={recommendedEvent ? getEventStatusLabel(recommendedEventStatus) : "推荐活动"}
            allowNoEvent
            noEventLabel="无活动"
          />
          <EventBonusPanel
            eventType={selectedEventType}
            eventBonus={eventBonus}
            eventBonusLoading={eventBonusLoading}
            eventBonusError={eventBonusError}
            characters={data.characters}
            cardMetadata={cardMetadata}
            skills={data.skills}
            assetRegion={selectedEventAssetRegion}
            eventFormula={eventFormula}
          />
        </section>
      ) : null}

      {activeStep === "live" ? (
        <section className="space-y-5">
          <FieldRow label="种类">
            {isMedleyEvent ? (
              <Segment value="medley" options={["medley"]} onChange={() => undefined} labels={{ medley: "巡回演出" }} />
            ) : (
              <Segment value={liveType} options={availableLiveTypes} onChange={updateLiveType} labels={liveTypeLabels} />
            )}
          </FieldRow>
          {showCoopLiveSettings ? (
            <MultiLiveSettingsPanel
              averagePower={otherPlayersAveragePower}
              onAveragePowerChange={updateOtherPlayersAveragePower}
              encoreSkillSource={encoreSkillSource}
              onEncoreSkillSourceChange={updateEncoreSkillSource}
              otherPlayers={otherPlayers}
              onOtherPlayersChange={updateOtherPlayers}
              skills={data.skills}
            />
          ) : null}
        </section>
      ) : null}

      {activeStep === "song" ? (
        <section className="space-y-5">
          {isMedleyEvent ? (
            <>
              <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-3">
                  {medleySongIds.map((slotSongId, index) => {
                    const slotSong = data.songs[slotSongId] ?? null;
                    const active = activeMedleySongSlot === index;
                    return (
                      <button
                        type="button"
                        key={index}
                        onClick={() => setActiveMedleySongSlot(index)}
                        className={`min-h-28 rounded-2xl border p-4 text-left transition ${
                          active
                            ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100"
                            : "border-slate-200 bg-white hover:border-sky-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-bold text-slate-500">第 {index + 1} 首</div>
                          <SongDifficultyLevelBadge difficulty={medleyDifficulties[index]} song={slotSong} className="h-6 w-6 text-xs" />
                        </div>
                        <div className="mt-2 flex min-w-0 items-start gap-2">
                          <div className="line-clamp-2 min-w-0 text-base font-bold text-slate-900">
                            {slotSong ? pickLocalizedName(slotSong.musicTitle, `#${slotSongId}`) : "未选择歌曲"}
                          </div>
                        </div>
                        <div className="mt-2 text-xs font-semibold text-slate-400">#{slotSongId}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_16rem] lg:items-end">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-500">难度</div>
                    <SongDifficultyPicker
                      value={activeMedleyDifficulty}
                      options={activeMedleySongDifficulties.length ? activeMedleySongDifficulties : DIFFICULTIES}
                      song={activeMedleySong}
                      onChange={(nextDifficulty) => updateMedleyDifficulty(activeMedleySongSlot, nextDifficulty)}
                    />
                  </div>
                  <label className="space-y-2">
                    <span className="block text-xs font-semibold text-slate-500">Perfect率</span>
                    <TextInput value={perfectRate} onChange={(event) => updatePerfectRate(event.target.value)} inputMode="decimal" />
                  </label>
                </div>
              </div>
              <FieldRow label={`第 ${activeMedleySongSlot + 1} 首搜索`}>
                <TextInput value={songSearch} onChange={(event) => setSongSearch(event.target.value)} placeholder="输入歌曲名或 ID" />
              </FieldRow>
              {medleyEventSongOptions.length > 0 ? (
                <FieldRow label="活动曲目">
                  <MedleyEventSongQuickPicker
                    options={medleyEventSongOptions}
                    selectedSource={medleySongSource}
                    onSelect={useEventMedleySongs}
                  />
                </FieldRow>
              ) : null}
              <div className="grid gap-2 text-sm sm:grid-cols-[9rem_1fr] sm:items-start">
                <span className="font-semibold text-slate-600">歌曲</span>
                <SongOptionList
                  options={songOptions}
                  selectedSongId={medleySongIds[activeMedleySongSlot]}
                  onSelect={(nextSongId) => updateMedleySongId(activeMedleySongSlot, nextSongId)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                <div className="text-lg font-bold text-slate-900">{selectedSong ? pickLocalizedName(selectedSong.musicTitle, `#${songId}`) : "未选择歌曲"}</div>
                {selectedSong && pickLocalizedName(selectedSong.bandName) ? (
                  <div className="mt-1 text-sm text-slate-500">{pickLocalizedName(selectedSong.bandName)}</div>
                ) : null}
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_16rem] lg:items-end">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-500">难度</div>
                    <SongDifficultyPicker
                      value={difficulty}
                      options={selectedSongDifficulties.length ? selectedSongDifficulties : DIFFICULTIES}
                      song={selectedSong}
                      onChange={updateDifficulty}
                    />
                  </div>
                  <label className="space-y-2">
                    <span className="block text-xs font-semibold text-slate-500">Perfect率</span>
                    <TextInput value={perfectRate} onChange={(event) => updatePerfectRate(event.target.value)} inputMode="decimal" />
                  </label>
                </div>
              </div>
              <FieldRow label="歌曲搜索">
                <TextInput value={songSearch} onChange={(event) => setSongSearch(event.target.value)} placeholder="输入歌曲名或 ID" />
              </FieldRow>
              {eventSongOptions.length > 0 ? (
                <FieldRow label="活动曲目">
                  <EventSongQuickPicker songs={eventSongOptions} selectedSongId={songId} onSelect={updateSongId} />
                </FieldRow>
              ) : null}
              <div className="grid gap-2 text-sm sm:grid-cols-[9rem_1fr] sm:items-start">
                <span className="font-semibold text-slate-600">歌曲</span>
                <SongOptionList options={songOptions} selectedSongId={songId} onSelect={updateSongId} />
              </div>
            </>
          )}
        </section>
      ) : null}

      {activeStep === "profile" ? (
        <section className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            {allProfiles.map((profile) => {
              const selected = profileChoice?.source === profile.type && profileChoice.id === profile.id;
              return (
                <button
                  type="button"
                  key={`${profile.type}:${profile.id}`}
                  onClick={() => setProfileChoice({ source: profile.type, id: profile.id })}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                    selected ? "border-sky-400 ring-2 ring-sky-100" : "border-slate-200 hover:border-sky-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-slate-900">{profile.name}</div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {profile.type === "cloud" ? "云端" : "本地"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                    <span>卡牌 {profile.cardCount}</span>
                    <span>最后同步：{formatProfileSyncDate(profile.syncedAt ?? profile.updatedAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {profileChoice ? (
            <TeamBuilderCardPreferencesPanel
              cacheScopeKey={selectedProfileCacheKey}
              profileCards={selectedProfileCards}
              preferences={cardPreferences}
              cardMetadata={cardMetadata}
              characters={data.characters}
              skills={data.skills}
              characterBonusesById={selectedProfileCharacterBonusesById}
              assetRegion={selectedProfileAssetRegion}
              currentEventBonusCardCount={currentEventBonusCardIds.length}
              addingCurrentEventCards={addingCurrentEventCards}
              temporaryCardActionError={temporaryCardActionError}
              temporaryCardActionNotice={temporaryCardActionNotice}
              onAddTemporary={() => {
                setTemporaryCardActionError("");
                setTemporaryCardActionNotice("");
                setCardPickerValue(null);
                setCardPickerOpen(true);
              }}
              onAddCurrentEventCards={addCurrentEventBonusTemporaryCards}
              onEditTemporary={editTemporaryCard}
              onClearTemporaryCards={clearTemporaryCards}
              onUpdateOwnedCardParameters={updateOwnedCardParameters}
              onToggleExcludedCard={toggleExcludedCard}
              onBulkSetExcludedCards={bulkSetExcludedCards}
            />
          ) : null}
        </section>
      ) : null}

      {activeStep === "calculate" ? (
        <section className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold text-slate-500">活动</div>
              <div className="mt-1 font-bold text-slate-900">{selectedEvent ? selectedEvent.name.cn ?? selectedEvent.name.jp : "无活动"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold text-slate-500">{isMedleyEvent ? "巡回演出" : "歌曲"}</div>
              {isMedleyEvent ? (
                <div className="mt-2 space-y-1">
                  {medleySongIds.map((slotSongId, index) => (
                    <div key={index} className="flex min-w-0 items-center gap-2 text-sm">
                      <span className="shrink-0 font-bold text-slate-400">{index + 1}</span>
                      <span className="min-w-0 truncate font-bold text-slate-900">
                        {pickLocalizedName(data.songs[slotSongId]?.musicTitle, `#${slotSongId}`)}
                      </span>
                      <SongDifficultyLevelBadge
                        difficulty={medleyDifficulties[index]}
                        song={data.songs[slotSongId] ?? null}
                        className="h-6 w-6 text-xs"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <div className="min-w-0 truncate font-bold text-slate-900">{selectedSong ? pickLocalizedName(selectedSong.musicTitle, `#${songId}`) : "未选择"}</div>
                  {selectedSong ? (
                    <SongDifficultyLevelBadge difficulty={difficulty} song={selectedSong} className="h-6 w-6" />
                  ) : null}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold text-slate-500">档案</div>
              <div className="mt-1 font-bold text-slate-900">{selectedProfileLabel}</div>
            </div>
          </div>
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
            <FieldRow label="模式">
              {isMedleyEvent ? (
                <Segment
                  value={medleyCalculationMode}
                  options={["maximize", "legacy-greedy-single"]}
                  onChange={setMedleyCalculationMode}
                  labels={MEDLEY_CALCULATION_MODE_LABELS}
                />
              ) : (
                <Segment value="maximize" options={["maximize"]} onChange={() => undefined} labels={{ maximize: "最大化" }} />
              )}
            </FieldRow>
            <FieldRow label="目标">
              <Segment value={target} options={targetOptions} onChange={setTarget} labels={targetLabels} />
            </FieldRow>
            <FieldRow label="组队结果">
              {isMedleyEvent ? (
                <Segment value="1" options={["1"]} onChange={() => undefined} />
              ) : (
                <Segment value={resultLimit} options={["10", "20", "50"]} onChange={setResultLimit} />
              )}
            </FieldRow>
            <FieldRow label="时间限制">
              <div className="flex items-center gap-2">
                <TextInput
                  value={maxSearchDurationSeconds}
                  onChange={(event) => setMaxSearchDurationSeconds(event.target.value)}
                  inputMode="numeric"
                  max={isMedleyEvent ? MEDLEY_PREVIEW_SEARCH_DURATION_SECONDS : undefined}
                />
                <span className="shrink-0 text-sm font-semibold text-slate-500">秒</span>
              </div>
            </FieldRow>
            {isMedleyEvent ? (
              <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800">
                <p>
                  组曲组队计算器为当前开发中的测试预览版本，仅供参考。如有发现“最大化”模式的分数结果低于“传统3次单曲贪心”模式的，或发现“传统3次单曲贪心”结果低于手动组队结果的，欢迎将你的档案名称/结果报告/页面最下方的调试信息（或在Out of Memory崩溃时直接反馈档案名称/OOM）发送至 bluewater.alnilam.ii@gmail.com 反馈。请在64位操作系统的电脑上通过最新版 Chrome 浏览器运行，以减少因内存不足崩溃的可能。
                </p>
                <p>
                  巡回活动将使用巡回演出计算，默认最多计算 300 秒。最大化模式会尝试精确证明全局最优结果。若无法在限制内完成证明，会提前返回已找到的最佳结果。传统3次单曲贪心仅作为临时对照，不提供最优性证明。
                </p>
              </div>
            ) : null}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleCalculate}
                disabled={submitting || !isPreloadReady}
                className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting || isPreloadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                {isPreloadReady ? "计算" : "准备数据中"}
              </button>
            </div>
            {submitting ? (
              <div className="rounded-xl bg-slate-50 p-3 text-center text-sm font-semibold text-slate-600">
                计算中 {calculationElapsedLabel}
                {isMedleyEvent ? ` / ${medleyPreviewSearchDurationLabel}` : ""}
              </div>
            ) : null}
            {!isPreloadReady && preloadStatusMessage ? (
              <div className={`rounded-xl p-3 text-center text-sm font-semibold ${
                preloadState.message ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"
              }`}>
                {preloadStatusMessage}
              </div>
            ) : null}
            {resultError ? <div className="rounded-xl bg-red-50 p-3 text-center text-sm font-semibold text-red-600">{resultError}</div> : null}
            {result ? (
              <div className="whitespace-pre-line rounded-xl bg-emerald-50 p-3 text-center text-sm font-semibold leading-6 text-emerald-600">
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
                {buildSearchCompletionSummary(result, maxSearchDurationSeconds)}
              </div>
            ) : null}
          </div>
          {result ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-bold text-slate-900">结果</h2>
              </div>
              {resultEventPointMode !== "none" ? (
                <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:items-center">
                  {resultEventPointMode === "liveBoost" || resultEventPointMode === "versus" || resultEventPointMode === "festival" ? (
                    <ResultOptionControl label="Live Boost">
                      <Segment value={resultLiveBoostCount} options={LIVE_BOOST_OPTIONS} onChange={setResultLiveBoostCount} labels={LIVE_BOOST_LABELS} />
                    </ResultOptionControl>
                  ) : null}
                  {resultEventPointMode === "challengeCp" ? (
                    <ResultOptionControl label="CP">
                      <Segment value={resultChallengeCpCost} options={CHALLENGE_CP_OPTIONS} onChange={setResultChallengeCpCost} labels={CHALLENGE_CP_LABELS} />
                    </ResultOptionControl>
                  ) : null}
                  {resultEventPointMode === "versus" || resultEventPointMode === "festival" ? (
                    <ResultOptionControl label="团队演出排名">
                      <Segment value={resultPlacement} options={RESULT_PLACEMENT_OPTIONS} onChange={setResultPlacement} labels={RESULT_PLACEMENT_LABELS} />
                    </ResultOptionControl>
                  ) : null}
                  {resultEventPointMode === "festival" ? (
                    <ResultOptionControl label="结果">
                      <Segment value={resultFestivalResult} options={FESTIVAL_RESULT_OPTIONS} onChange={setResultFestivalResult} labels={FESTIVAL_RESULT_LABELS} />
                    </ResultOptionControl>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-3">
                {result.results.map((item) => (
                  isMedleySearchResult(item) ? (
                    <MedleyResultCard
                      key={item.rank}
                      result={item}
                      cardMetadata={cardMetadata}
                      characters={data.characters}
                      skills={data.skills}
                      assetRegion={selectedEventAssetRegion}
                      songs={medleySongIds.map((id) => data.songs[id] ?? null)}
                    />
                  ) : (
                    <ResultCard
                      key={item.rank}
                      result={item}
                      cardMetadata={cardMetadata}
                      characters={data.characters}
                      skills={data.skills}
                      assetRegion={selectedEventAssetRegion}
                      displayLiveBoostCount={resultLiveBoostCount}
                      displayChallengeCpCost={resultChallengeCpCost}
                      displayPlacement={resultPlacement}
                      displayFestivalResult={resultFestivalResult}
                    />
                  )
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <ListFilter className="mr-2 inline h-4 w-4" />
                候选卡牌 {result.stats.candidateCardCount} · 区域道具配置 {result.stats.areaItemConfigurationCount}
                {getSearchProofStatusLabel(result) ? ` · ${getSearchProofStatusLabel(result)}` : ""}
                {"peakUsedHeapMiB" in result.stats && result.stats.peakUsedHeapMiB !== null
                  ? ` · 峰值内存 ${result.stats.peakUsedHeapMiB} MiB`
                  : ""}
                {"supportBandEnabled" in result.stats && result.stats.supportBandEnabled
                  ? ` · 支援候选 ${result.stats.supportCandidateCount} · 支援评估 ${result.stats.supportEvaluationCount}`
                  : ""}
              </div>
              {medleyDebugText ? (
                <MedleyDebugInfoPanel
                  debugText={medleyDebugText}
                  copied={debugInfoCopied}
                  onCopy={copyMedleyDebugInfo}
                />
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {cardPickerOpen ? (
        <DynamicTemporaryCardPickerDialog
          open={cardPickerOpen}
          value={cardPickerValue}
          adding={addingTemporaryCard}
          region={selectedProfileAssetRegion}
          scrollElementRef={cardPickerScrollRef}
          onValueChange={selectTemporaryCard}
          onClose={() => {
            setCardPickerOpen(false);
            setCardPickerValue(null);
          }}
        />
      ) : null}

      {editingTemporaryCard ? (
        <DynamicTemporaryCardEditorDialog
          card={editingTemporaryCard}
          baselineCard={editingTemporaryCardExists ? cardPreferences.temporaryCards.find((card) => card.instanceId === editingTemporaryCard.instanceId) ?? null : null}
          metadata={cardMetadata[String(editingTemporaryCard.cardId)]}
          characterName={getCardCharacterLabel(cardMetadata[String(editingTemporaryCard.cardId)], data.characters)}
          bandId={getCardBandId(cardMetadata[String(editingTemporaryCard.cardId)], data.characters)}
          characterBonusesById={selectedProfileCharacterBonusesById}
          region={selectedProfileAssetRegion}
          exists={editingTemporaryCardExists}
          onClose={closeTemporaryCardEditor}
          onSave={saveTemporaryCard}
          onDelete={deleteTemporaryCard}
        />
      ) : null}

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex w-full justify-end gap-2">
          {STEPS.map((step, index) => (
            activeStep === step.id && STEPS[index + 1] ? (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(STEPS[index + 1].id)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:text-sky-600"
              >
                下一步：{STEPS[index + 1].label}
              </button>
            ) : null
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BandoriTeamBuilderPage() {
  const { userId, authReady, profile, loadingProfile, profileError } = useAccountProfile();

  return (
    <BandoriAccountShell
      title="组队计算器"
      description={null}
      backHref={null}
      hideEyebrow
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message="正在读取账号信息..." />
      ) : !userId ? (
        <AccountSignInState nextPath="/bandori/teambuilder" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile?.emailVerified ? (
        <TeamBuilderPanel />
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-amber-900">邮箱验证后解锁组队计算器</h2>
          <p className="mt-2 text-sm leading-6 text-amber-700">组队计算会读取你的云端或本地游戏档案，因此需要先完成邮箱验证。</p>
          <div className="mt-5">
            <Link href="/account/email" className="hhwx-accent-button">
              前往验证邮箱
            </Link>
          </div>
        </section>
      )}
    </BandoriAccountShell>
  );
}
