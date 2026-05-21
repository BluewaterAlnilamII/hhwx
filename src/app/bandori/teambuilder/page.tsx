"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileJson,
  ListFilter,
  Loader2,
  Music2,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import BandoriAccountShell from "@/app/bandori/BandoriAccountShell";
import BandoriEventSwitcher, { type BandoriEventSwitcherEvent } from "@/app/bandori/BandoriEventSwitcher";
import { AccountErrorState, AccountLoadingState, AccountSignInState } from "@/app/account/AccountShell";
import { getAccessToken, useAccountProfile } from "@/app/account/useAccountProfile";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import {
  type BandoriAssetRegion,
  buildBandoriCardThumbnailPublicUrl,
  buildBandoriEventBannerPublicUrl,
  buildBandoriResIconPublicUrl,
  buildBandoriResImagePublicUrl,
  resolveBandoriEventBannerBundleName,
} from "@/lib/bandori-asset-proxy";
import {
  hasBandoriOfficialCnEventContent,
  resolveBandoriCnScheduleWindow,
  resolveBandoriEventAssetRegion,
} from "@/lib/bandori-event-region";
import type { BandoriCardAttribute, BandoriEventBonus, BestdoriSkillMaster } from "@/lib/bandori-team-calculator";
import type {
  BandoriTeamSearchDifficulty,
  BandoriTeamSearchEventType,
  BandoriTeamSearchResultCard,
  BandoriTeamSearchResponse,
  BandoriTeamSearchResult,
  BandoriTeamSearchSkillOrderActor,
  BandoriTeamSearchTarget,
} from "@/lib/bandori-team-search";
import {
  listLocalGameProfiles,
  readLocalGameProfilePayload,
  type LocalGameProfileSummary,
} from "@/lib/user-game-profile-local-store";
import {
  decodeCompressedGameProfilePayload,
  type CompressedGameProfilePayload,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";
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
  firstName?: string[] | string;
  characterName?: string[] | string;
  colorCode?: string | null;
};

type SkillMaster = BestdoriSkillMaster & {
  description?: Array<string | null>;
  simpleDescription?: Array<string | null>;
  onceEffect?: {
    onceEffectValue?: unknown;
  };
};

type CardMetadata = {
  characterId?: number;
  rarity?: number;
  attribute?: string;
  resourceSetName?: string;
  displayName?: string | null;
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
  perfectRate?: string;
  otherPlayersAveragePower?: string;
  encoreSkillSource?: EncoreSkillSource;
  otherPlayers?: OtherPlayerDraft[];
};

const STEPS: Array<{ id: StepId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "event", label: "活动", icon: Clock3 },
  { id: "live", label: "Live", icon: Users },
  { id: "song", label: "歌曲", icon: Music2 },
  { id: "profile", label: "游戏档案", icon: FileJson },
  { id: "calculate", label: "计算", icon: Calculator },
];

const SUPPORTED_EVENT_TYPES = new Set(["story", "challenge", "versus", "live_try", "mission_live", "festival", "medley"]);
const DEFAULT_SONG_ID = "306";
const DEFAULT_DIFFICULTY: BandoriTeamSearchDifficulty = "expert";
const DEFAULT_PERFECT_RATE = "97";
const TEAMBUILDER_LIVE_PREFERENCES_STORAGE_KEY = "hhwx-bandori-teambuilder-live-preferences:v1";
const DIFFICULTIES: BandoriTeamSearchDifficulty[] = ["easy", "normal", "hard", "expert", "special"];
const DIFFICULTY_KEYS: Record<BandoriTeamSearchDifficulty, string> = {
  easy: "0",
  normal: "1",
  hard: "2",
  expert: "3",
  special: "4",
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
const LIVE_LABELS: Record<LiveType, string> = {
  free: "自由LIVE",
  multi: "协力LIVE",
  challenge: "挑战LIVE",
  versus: "对战LIVE",
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
const AREA_ITEM_PARAMETER_LABELS: Record<"performance" | "technique" | "visual", string> = {
  performance: "演出",
  technique: "技巧",
  visual: "形象",
};
const ATTRIBUTE_SWATCH_CLASSES: Record<BandoriCardAttribute, string> = {
  powerful: "bg-rose-500",
  cool: "bg-sky-500",
  happy: "bg-amber-400",
  pure: "bg-emerald-500",
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

function pickRegionalText(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[3] ?? value[2] ?? value[1] ?? value[0] ?? value[4] ?? "").trim();
  }
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSkillOptionLevel(skillLevel: string | number): number {
  const level = Math.min(5, Math.max(1, Math.trunc(Number(skillLevel) || 1)));
  return level;
}

function pickSkillLevelNumber(value: unknown, skillLevel: string | number): number | null {
  const level = normalizeSkillOptionLevel(skillLevel);
  const rawValue = Array.isArray(value) ? value[level - 1] : value;
  const numeric = Number(rawValue);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatSkillNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function getSkillDurationByLevel(skill: SkillMaster | undefined, skillLevel: string | number): number | null {
  return pickSkillLevelNumber(skill?.duration, skillLevel);
}

function getSkillOnceEffectValueByLevel(skill: SkillMaster | undefined, skillLevel: string | number): number | null {
  return pickSkillLevelNumber(skill?.onceEffect?.onceEffectValue, skillLevel);
}

function normalizeSkillLabel(skill: SkillMaster | undefined, skillLevel: string | number): string {
  const description = pickRegionalText(skill?.description) || pickRegionalText(skill?.simpleDescription);
  const duration = getSkillDurationByLevel(skill, skillLevel);
  const onceEffectValue = getSkillOnceEffectValueByLevel(skill, skillLevel);
  const durationText = duration !== null ? `${formatSkillNumber(duration)}秒` : "";
  const onceEffectText = onceEffectValue !== null ? formatSkillNumber(onceEffectValue) : "";
  const usesSecondaryPlaceholder = description.includes("{1}");
  const primaryText = usesSecondaryPlaceholder ? onceEffectText : durationText;
  const resolvedDescription = description
    .replace(/\{1\}秒/g, durationText)
    .replace(/\{1\}/g, durationText)
    .replace(/\{0\}秒/g, usesSecondaryPlaceholder && primaryText ? `${primaryText}秒` : primaryText)
    .replace(/\{0\}/g, primaryText)
    .replace(/\s+/g, " ")
    .trim();
  return resolvedDescription || "未知技能";
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
      label: pickLocalizedName(character?.firstName ?? character?.characterName),
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
  if (liveType === "versus" && (eventType === "versus" || eventType === "festival")) {
    return "共演LIVE";
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

function canShowEventSongPicker(eventType: BandoriTeamSearchEventType, liveType: LiveType): boolean {
  if (eventType === "challenge") {
    return liveType === "challenge";
  }
  return eventType === "versus" || eventType === "medley";
}

function isScoreLinkedEventPointTarget(eventType: BandoriTeamSearchEventType, liveType: LiveType): boolean {
  return eventType === "medley"
    || eventType === "versus"
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

/*
function runTeamSearchWorker(request: TeamSearchWorkerRequest): Promise<BandoriTeamSearchResponse> {
  return new Promise((resolve, reject) => {
    const worker = createTeamSearchWorker();
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<TeamSearchWorkerResponse>) => {
      if (event.data.requestId !== request.requestId) {
        return;
      }
      finish();
      if (event.data.ok) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "计算线程启动失败"));
    };
    worker.postMessage(request);
  });
}
*/

type DisplayCardLike = Pick<BandoriTeamSearchResultCard, "cardId" | "rarity" | "attribute" | "bandId" | "level" | "masterRank" | "skillLevel">;

function orderResultCardsWithLeaderCenter(cards: BandoriTeamSearchResultCard[], leaderCardId: number): BandoriTeamSearchResultCard[] {
  if (cards.length !== 5) {
    return cards;
  }

  const leader = cards.find((card) => card.cardId === leaderCardId);
  if (!leader) {
    return cards;
  }

  const others = cards.filter((card) => card.cardId !== leaderCardId);
  return [others[0], others[1], leader, others[2], others[3]].filter(Boolean) as BandoriTeamSearchResultCard[];
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
): string {
  if (skillOrderActors && skillOrderActors.length > 0) {
    return skillOrderActors.map(getSkillOrderActorLabel).join(" → ");
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
  const selectedOptionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedOptionRef.current?.scrollIntoView({ block: "center" });
  }, [selectedSongId, options]);

  if (options.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-sm font-semibold text-slate-500">
        没有找到匹配的歌曲
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
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

function EventSongQuickPicker({
  songs,
  selectedSongId,
  onSelect,
}: {
  songs: Array<{ id: string; title: string; sourceLabels: Array<"JP" | "CN"> }>;
  selectedSongId: string;
  onSelect: (songId: string) => void;
}) {
  if (songs.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
      <div className="flex flex-wrap gap-2">
        {songs.map((song) => {
          const selected = song.id === selectedSongId;
          return (
            <button
              type="button"
              key={song.id}
              onClick={() => onSelect(song.id)}
              className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                selected
                  ? "border-sky-300 bg-white text-sky-800 shadow-sm"
                  : "border-sky-100 bg-white/70 text-slate-700 hover:border-sky-200 hover:bg-white"
              }`}
            >
              <span className="max-w-56 truncate">{song.title}</span>
              {song.sourceLabels.map((sourceLabel) => (
                <span key={sourceLabel} className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{sourceLabel}</span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
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
  percent,
  assetRegion,
}: {
  cardId: number;
  metadata: CardMetadata | undefined;
  percent: number;
  assetRegion: BandoriAssetRegion;
}) {
  const rarity = Math.min(5, Math.max(1, Math.trunc(Number(metadata?.rarity) || 1)));
  return (
    <TeamBuilderCardTile
      card={{
        cardId,
        rarity,
        attribute: isKnownAttribute(metadata?.attribute) ? metadata.attribute : "powerful",
        bandId: null,
        level: 1,
        masterRank: 0,
        skillLevel: 1,
      }}
      metadata={metadata}
      badge={formatPercent(percent)}
      assetRegion={assetRegion}
    />
  );
}

function TeamBuilderCardTile({
  card,
  metadata,
  badge,
  leader,
  assetRegion = "cn",
}: {
  card: DisplayCardLike;
  metadata: CardMetadata | undefined;
  badge?: string;
  leader?: boolean;
  assetRegion?: BandoriAssetRegion;
}) {
  const cardId = card.cardId;
  const cardName = pickCardDisplayName(cardId, metadata);
  const rarity = Math.min(5, Math.max(1, Math.trunc(Number(metadata?.rarity ?? card.rarity) || 1)));
  const attribute = isKnownAttribute(metadata?.attribute) ? metadata.attribute : card.attribute;
  const thumbnailUrl = metadata?.resourceSetName
    ? buildBandoriCardThumbnailPublicUrl(assetRegion, cardId, metadata.resourceSetName, rarity >= 3 ? "after_training" : "normal")
    : null;
  const frameUrl = rarity >= 2
    ? buildBandoriResImagePublicUrl(`card-${rarity}.png`)
    : attribute ? buildBandoriResImagePublicUrl(`card-1-${attribute}.png`) : null;
  const attributeIconUrl = attribute ? buildBandoriResIconPublicUrl(`${attribute}.svg`) : null;
  const bandIconUrl = card.bandId ? buildBandoriResIconPublicUrl(`band_${card.bandId}.svg`) : null;
  const starIconUrl = buildBandoriResIconPublicUrl("star.png");
  const masterIconUrl = buildBandoriResIconPublicUrl("master.svg");

  return (
    <article className="group relative h-[74px] w-[74px] overflow-visible rounded-[5px] outline outline-1 outline-white/80 transition hover:z-40 hover:-translate-y-0.5 hover:outline-2 hover:outline-sky-400 focus-within:z-40 focus-within:outline-2 focus-within:outline-sky-400 sm:h-[76px] sm:w-[76px]">
      <div className="relative h-full w-full overflow-hidden rounded-[5px] bg-white text-left shadow-[0_2px_7px_rgba(15,23,42,0.22)]">
        <div className="absolute inset-0">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt={cardName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-black text-slate-400">
              {cardId}
            </div>
          )}
        </div>
        {frameUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frameUrl} alt="" aria-hidden="true" loading="lazy" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
        ) : null}
        {bandIconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bandIconUrl} alt="" aria-hidden="true" loading="lazy" className="pointer-events-none absolute left-0 top-0 h-[21px] w-[21px]" />
        ) : null}
        {attributeIconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attributeIconUrl} alt="" aria-hidden="true" loading="lazy" className="pointer-events-none absolute right-[2px] top-[2px] h-[18px] w-[18px]" />
        ) : null}
        <div className="pointer-events-none absolute bottom-[2px] left-[2px] z-10 flex flex-col-reverse items-start gap-0">
          {Array.from({ length: rarity }, (_, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={index}
              src={starIconUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="-mt-[2.5px] h-[13px] w-[14px] object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
            />
          ))}
        </div>
        {card.masterRank > 0 ? (
          <div className="pointer-events-none absolute right-[-1px] top-[20px] z-10 h-[21px] w-[21px] drop-shadow-[0_1px_2px_rgba(15,23,42,0.55)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={masterIconUrl} alt="" aria-hidden="true" loading="lazy" className="h-full w-full object-contain" />
            <span className="absolute inset-0 flex items-center justify-center pb-[1px] text-[10px] font-black leading-none text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.68)]">
              {card.masterRank}
            </span>
          </div>
        ) : null}
        {card.skillLevel > 1 ? (
          <div className="pointer-events-none absolute right-[-1px] top-[41px] z-10 flex h-[15px] min-w-[21px] items-center justify-center rounded-[3px] border border-white/80 bg-rose-500 px-[3px] text-[10px] font-black leading-none text-white shadow-[0_1px_2px_rgba(15,23,42,0.5)] [text-shadow:0_1px_1px_rgba(0,0,0,0.55)]">
            {card.skillLevel}
          </div>
        ) : null}
        <div
          className="pointer-events-none absolute bottom-[2px] right-[2px] z-10 h-[15px] w-[48px]"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.42)",
            clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%)",
          }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute bottom-[3px] right-[4px] z-20 flex h-[12px] items-center justify-end text-[10px] font-semibold leading-none text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.72)]">
          <span>Lv.{card.level}</span>
        </div>
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
      <div className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 hidden w-56 -translate-x-1/2 rounded-[18px] border border-white/90 bg-white p-3 text-center shadow-[0_18px_48px_rgba(15,23,42,0.22)] ring-1 ring-slate-950/5 group-hover:block group-focus-within:block">
        <div className="truncate text-sm font-black text-slate-900">{cardName}</div>
        <div className="mt-1 truncate text-xs font-semibold text-slate-500">Card #{cardId}</div>
        <div className="mt-2 flex justify-center gap-2 text-[11px] font-black">
          <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-amber-700">★{rarity}</span>
          <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-sky-700">星光 {card.masterRank}</span>
          <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-1 text-rose-700">技能 {card.skillLevel}</span>
        </div>
      </div>
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
  assetRegion,
  eventFormula,
}: {
  eventType: BandoriTeamSearchEventType;
  eventBonus: BandoriEventBonus | null;
  eventBonusLoading: boolean;
  eventBonusError: string;
  characters: Record<string, CharacterMaster | undefined>;
  cardMetadata: Record<string, CardMetadata | undefined>;
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
            <BonusCardThumbnail key={item.cardId} cardId={item.cardId} metadata={item.metadata} percent={item.percent} assetRegion={assetRegion} />
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
  assetRegion,
  displayLiveBoostCount,
  displayChallengeCpCost,
  displayPlacement,
  displayFestivalResult,
}: {
  result: BandoriTeamSearchResult;
  cardMetadata: Record<string, CardMetadata | undefined>;
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
  const displayedCards = orderResultCardsWithLeaderCenter(result.cards, result.leaderCardId);
  const skillOrderDisplay = buildSkillOrderDisplay(result.skillOrderCardIds, displayedCards, result.skillOrderActors);
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
            key={card.cardId}
            card={card}
            metadata={cardMetadata[String(card.cardId)]}
            leader={card.cardId === result.leaderCardId}
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
  const [activeStep, setActiveStep] = useState<StepId>("event");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [songSearch, setSongSearch] = useState("");
  const [songId, setSongId] = useState(DEFAULT_SONG_ID);
  const [difficulty, setDifficulty] = useState<BandoriTeamSearchDifficulty>(DEFAULT_DIFFICULTY);
  const [perfectRate, setPerfectRate] = useState(() => readLivePreferences().perfectRate ?? DEFAULT_PERFECT_RATE);
  const [liveType, setLiveType] = useState<LiveType>(() => readLivePreferences().liveType ?? "multi");
  const eventFormula: EventFormulaOption = "2";
  const liveBoostCount: LiveBoostCountOption = "3";
  const challengeCpCost: ChallengeCpCostOption = "1600";
  const roomPower = "";
  const [otherPlayersAveragePower, setOtherPlayersAveragePower] = useState(() => readLivePreferences().otherPlayersAveragePower ?? "380000");
  const useSpecialRoomBonus = true;
  const [encoreSkillSource, setEncoreSkillSource] = useState<EncoreSkillSource>(() => readLivePreferences().encoreSkillSource ?? "self");
  const [otherPlayers, setOtherPlayers] = useState<OtherPlayerDraft[]>(() => readLivePreferences().otherPlayers ?? DEFAULT_OTHER_PLAYERS);
  const [profileChoice, setProfileChoice] = useState<ProfileChoice | null>(null);
  const [target, setTarget] = useState<BandoriTeamSearchTarget>("eventPoint");
  const [resultLimit, setResultLimit] = useState("10");
  const [maxSearchDurationSeconds, setMaxSearchDurationSeconds] = useState("30");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BandoriTeamSearchResponse | null>(null);
  const [resultError, setResultError] = useState("");
  const [resultLiveBoostCount, setResultLiveBoostCount] = useState<LiveBoostCountOption>("3");
  const [resultChallengeCpCost, setResultChallengeCpCost] = useState<ChallengeCpCostOption>("1600");
  const [resultPlacement, setResultPlacement] = useState<ResultPlacementOption>("1");
  const [resultFestivalResult, setResultFestivalResult] = useState<FestivalResultOption>("win");
  const [cardMetadata, setCardMetadata] = useState<Record<string, CardMetadata | undefined>>({});
  const [eventBonus, setEventBonus] = useState<BandoriEventBonus | null>(null);
  const [eventBonusLoading, setEventBonusLoading] = useState(false);
  const [eventBonusError, setEventBonusError] = useState("");
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
  }>());
  const profilePayloadCacheRef = useRef(new Map<string, UserGameProfilePayload>());

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
  const selectedEventAssetRegion = useMemo<BandoriAssetRegion>(() => (
    selectedEvent ? resolveBandoriEventAssetRegion(selectedEvent) : "cn"
  ), [selectedEvent]);
  const recommendedEventStatus = recommendedEvent ? getEventStatus(recommendedEvent, referenceNow) : "unknown";
  const selectedEventSwitcherId = selectedEventId ?? (recommendedEvent ? String(recommendedEvent.eventId) : "none");
  const availableLiveTypes = useMemo(() => allowedLiveTypes(selectedEventType), [selectedEventType]);
  const liveTypeLabels = useMemo<Record<LiveType, string>>(() => ({
    ...LIVE_LABELS,
    multi: getLiveLabel("multi", selectedEventType),
    versus: getLiveLabel("versus", selectedEventType),
  }), [selectedEventType]);
  const updateLiveType = useCallback((value: LiveType) => {
    setLiveType(value);
    writeLivePreferences({ liveType: value });
  }, []);
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
  const showCoopLiveSettings = shouldUseCoopLiveSettings(selectedEventType, liveType);
  const scoreLinkedEventPointTarget = isScoreLinkedEventPointTarget(selectedEventType, liveType);
  const targetOptions = useMemo<BandoriTeamSearchTarget[]>(() => (
    scoreLinkedEventPointTarget ? ["eventPoint"] : ["score", "eventPoint"]
  ), [scoreLinkedEventPointTarget]);
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
  const eventSongOptions = useMemo(() => {
    if (!canShowEventSongPicker(selectedEventType, liveType)) {
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
  }, [data.songs, liveType, selectedEvent, selectedEventType]);
  const songOptions = useMemo(() => {
    const normalizedSearch = songSearch.trim().toLowerCase();
    const entries = Object.entries(data.songs)
      .flatMap(([id, song]) => {
        if (!song) {
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
  }, [data.songs, songSearch]);
  const selectedSong = songId ? data.songs[songId] ?? null : null;
  const selectedSongDifficulties = useMemo(() => (
    DIFFICULTIES.filter((item) => getSongDifficulty(selectedSong, item))
  ), [selectedSong]);
  const allProfiles = useMemo(() => [
    ...data.cloudProfiles.map((profile) => ({ type: "cloud" as const, id: profile.id, name: profile.name, cardCount: profile.cardCount })),
    ...data.localProfiles.map((profile) => ({ type: "local" as const, id: profile.id, name: profile.name, cardCount: profile.cardCount })),
  ], [data.cloudProfiles, data.localProfiles]);

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
      callback.resolve(event.data);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "计算线程启动失败");
      workerCallbacksRef.current.forEach((callback) => callback.reject(error));
      workerCallbacksRef.current.clear();
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const postTeamSearchWorkerMessage = useCallback((message: TeamSearchWorkerMessage): Promise<TeamSearchWorkerResponse> => (
    new Promise((resolve, reject) => {
      workerCallbacksRef.current.set(message.requestId, { resolve, reject });
      getTeamSearchWorker().postMessage(message);
    })
  ), [getTeamSearchWorker]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    workerCallbacksRef.current.clear();
  }, []);

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
    setPreloadState((current) => ({
      ...current,
      master: current.master === "ready" ? "ready" : "loading",
      chart: songId ? "loading" : "idle",
      eventBonus: selectedEvent ? "loading" : "ready",
      message: "",
    }));

    void postTeamSearchWorkerMessage({
      type: "preload",
      requestId,
      song: songId ? { songId: Number(songId), difficulty } : undefined,
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
            chart: songId ? "ready" : "idle",
            eventBonus: selectedEvent ? "ready" : "ready",
            message: "",
          }));
        } else {
          setPreloadState((current) => ({
            ...current,
            master: current.master === "ready" ? "ready" : "error",
            chart: songId ? "error" : "idle",
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
          chart: songId ? "error" : "idle",
          eventBonus: selectedEvent ? "error" : "ready",
          message: preloadError instanceof Error ? preloadError.message : "准备数据失败",
        }));
      });

    return () => {
      active = false;
    };
  }, [difficulty, postTeamSearchWorkerMessage, selectedEvent, songId]);

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
    if (!availableLiveTypes.includes(liveType)) {
      setLiveType(availableLiveTypes.includes("multi") ? "multi" : availableLiveTypes[0] ?? "free");
    }
  }, [availableLiveTypes, liveType]);

  useEffect(() => {
    if (!targetOptions.includes(target)) {
      setTarget(targetOptions.includes("eventPoint") ? "eventPoint" : targetOptions[0]);
    }
  }, [target, targetOptions]);

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
      setDifficulty(selectedSongDifficulties[selectedSongDifficulties.length - 1]);
    }
  }, [difficulty, selectedSongDifficulties]);

  useEffect(() => {
    const resultCardIds = result?.results.flatMap((item) => item.cards.map((card) => card.cardId)) ?? [];
    const cardIds = [...getEventBonusMemberCardIds(eventBonus), ...resultCardIds];
    const uniqueCardIds = Array.from(new Set(cardIds)).filter((cardId) => !cardMetadata[String(cardId)]);
    if (uniqueCardIds.length === 0) {
      return;
    }
    void requestJson<{ cards: Record<string, CardMetadata | undefined> }>(`/api/bandori/cards?ids=${uniqueCardIds.join(",")}`)
      .then((payload) => setCardMetadata((current) => ({ ...current, ...payload.cards })))
      .catch(() => undefined);
  }, [cardMetadata, eventBonus, result]);

  const selectedProfileLabel = profileChoice
    ? allProfiles.find((profile) => profile.type === profileChoice.source && profile.id === profileChoice.id)?.name ?? "已选择档案"
    : "未选择档案";

  const resultEventPointMode = useMemo(() => (
    result?.results.find((item) => item.eventPointOptions.mode !== "none")?.eventPointOptions.mode ?? "none"
  ), [result]);
  const selectedProfileCacheKey = profileChoice ? `${profileChoice.source}:${profileChoice.id}` : "";
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

  async function handleCalculate() {
    if (!profileChoice) {
      setResultError("请选择一个卡牌档案");
      setActiveStep("profile");
      return;
    }
    if (!songId) {
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
    setResultError("");
    setResult(null);
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
          type: liveType,
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
          songId: Number(songId),
          difficulty,
          perfectRate: Math.max(0, Math.min(1, Number(perfectRate) / 100)),
        },
        cards: { excludedCardIds: [] },
        calculation: {
          target,
          resultLimit: Number(resultLimit),
          maxSearchDurationMs: Math.max(1, Number(maxSearchDurationSeconds)) * 1000,
        },
      });
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
    }
  }

  if (loading) {
    return <AccountLoadingState message="正在读取组队计算器数据..." />;
  }
  if (error) {
    return <AccountErrorState message={error} />;
  }

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
            assetRegion={selectedEventAssetRegion}
            eventFormula={eventFormula}
          />
        </section>
      ) : null}

      {activeStep === "live" ? (
        <section className="space-y-5">
          <FieldRow label="种类">
            <Segment value={liveType} options={availableLiveTypes} onChange={updateLiveType} labels={liveTypeLabels} />
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
          <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
            <div className="text-lg font-bold text-slate-900">{selectedSong ? pickLocalizedName(selectedSong.musicTitle, `#${songId}`) : "未选择歌曲"}</div>
            {selectedSong && pickLocalizedName(selectedSong.bandName) ? (
              <div className="mt-1 text-sm text-slate-500">{pickLocalizedName(selectedSong.bandName)}</div>
            ) : null}
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_16rem] lg:items-end">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500">难度</div>
                <div className="flex flex-wrap items-center gap-3">
                  <Segment value={difficulty} options={selectedSongDifficulties.length ? selectedSongDifficulties : DIFFICULTIES} onChange={setDifficulty} />
                  <div className="text-sm text-slate-600">
                    难度 {getSongDifficulty(selectedSong, difficulty)?.playLevel ?? "-"}
                  </div>
                </div>
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
              <EventSongQuickPicker songs={eventSongOptions} selectedSongId={songId} onSelect={setSongId} />
            </FieldRow>
          ) : null}
          <FieldRow label="歌曲">
            <SongOptionList options={songOptions} selectedSongId={songId} onSelect={setSongId} />
          </FieldRow>
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
                  <div className="mt-2 text-sm text-slate-500">{profile.cardCount} 张卡牌</div>
                </button>
              );
            })}
          </div>
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
              <div className="text-xs font-semibold text-slate-500">歌曲</div>
              <div className="mt-1 font-bold text-slate-900">{selectedSong ? pickLocalizedName(selectedSong.musicTitle, `#${songId}`) : "未选择"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold text-slate-500">档案</div>
              <div className="mt-1 font-bold text-slate-900">{selectedProfileLabel}</div>
            </div>
          </div>
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
            <FieldRow label="模式">
              <Segment value="maximize" options={["maximize"]} onChange={() => undefined} labels={{ maximize: "最大化" }} />
            </FieldRow>
            <FieldRow label="目标">
              <Segment value={target} options={targetOptions} onChange={setTarget} labels={targetLabels} />
            </FieldRow>
            <FieldRow label="组队结果">
              <Segment value={resultLimit} options={["10", "20", "50"]} onChange={setResultLimit} />
            </FieldRow>
            <FieldRow label="时间限制">
              <div className="flex items-center gap-2">
                <TextInput value={maxSearchDurationSeconds} onChange={(event) => setMaxSearchDurationSeconds(event.target.value)} inputMode="numeric" />
                <span className="shrink-0 text-sm font-semibold text-slate-500">秒</span>
              </div>
            </FieldRow>
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
            {!isPreloadReady && preloadStatusMessage ? (
              <div className={`rounded-xl p-3 text-center text-sm font-semibold ${
                preloadState.message ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"
              }`}>
                {preloadStatusMessage}
              </div>
            ) : null}
            {resultError ? <div className="rounded-xl bg-red-50 p-3 text-center text-sm font-semibold text-red-600">{resultError}</div> : null}
            {result ? (
              <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-600">
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
                完成：用时 {result.stats.elapsedMs}ms
                {result.stats.timedOut ? "，已按当前最佳结果返回" : ""}
              </div>
            ) : null}
          </div>
          {result ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-bold text-slate-900">结果</h2>
              </div>
              {resultEventPointMode !== "none" ? (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                  {resultEventPointMode === "liveBoost" || resultEventPointMode === "versus" || resultEventPointMode === "festival" ? (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-600">Live Boost</span>
                      <Segment value={resultLiveBoostCount} options={LIVE_BOOST_OPTIONS} onChange={setResultLiveBoostCount} labels={LIVE_BOOST_LABELS} />
                    </div>
                  ) : null}
                  {resultEventPointMode === "challengeCp" ? (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-600">CP</span>
                      <Segment value={resultChallengeCpCost} options={CHALLENGE_CP_OPTIONS} onChange={setResultChallengeCpCost} labels={CHALLENGE_CP_LABELS} />
                    </div>
                  ) : null}
                  {resultEventPointMode === "versus" || resultEventPointMode === "festival" ? (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-600">公演LIVE排名</span>
                      <Segment value={resultPlacement} options={RESULT_PLACEMENT_OPTIONS} onChange={setResultPlacement} labels={RESULT_PLACEMENT_LABELS} />
                    </div>
                  ) : null}
                  {resultEventPointMode === "festival" ? (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-600">结果</span>
                      <Segment value={resultFestivalResult} options={FESTIVAL_RESULT_OPTIONS} onChange={setResultFestivalResult} labels={FESTIVAL_RESULT_LABELS} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-3">
                {result.results.map((item) => (
                  <ResultCard
                    key={item.rank}
                    result={item}
                    cardMetadata={cardMetadata}
                    assetRegion={selectedEventAssetRegion}
                    displayLiveBoostCount={resultLiveBoostCount}
                    displayChallengeCpCost={resultChallengeCpCost}
                    displayPlacement={resultPlacement}
                    displayFestivalResult={resultFestivalResult}
                  />
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <ListFilter className="mr-2 inline h-4 w-4" />
                候选卡牌 {result.stats.candidateCardCount} · 区域道具配置 {result.stats.areaItemConfigurationCount} · 搜索模式 {result.stats.searchMode}
                {result.stats.supportBandEnabled
                  ? ` · 支援候选 ${result.stats.supportCandidateCount} · 支援评估 ${result.stats.supportEvaluationCount}`
                  : ""}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-500">
          <SlidersHorizontal className="mr-1 inline h-4 w-4" />
          目前支持除 medley 外的活动类型；控分模式后续再接入。
        </div>
        <div className="flex gap-2">
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
      description="按活动、Live、歌曲、档案与计算目标组合筛选 Bandori 最优队伍。"
      backHref="/bandori/game-profiles"
      backLabel="返回档案"
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
