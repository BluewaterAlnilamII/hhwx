"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  ClipboardList,
  Gift,
  ImageOff,
  Music2,
} from "lucide-react";
import BandoriEventBonusPanel from "@/components/bandori/BandoriEventBonusPanel";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useCommentStampCatalog } from "@/hooks/useCommentStamps";
import { useBandoriMusicAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { SESSION_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import { buildBandoriResIconPublicUrl } from "@/lib/bandori-asset-proxy";
import { buildBandoriPublicAssetUrl } from "@/lib/bandori-public-asset-index";
import {
  getBandoriEventStatusAt,
  type BandoriEventStatus,
} from "@/lib/bandori-event-status";
import {
  getBandoriEventBandId,
  resolveBandoriEventBandName,
  type BandoriBandNameRecord,
} from "@/lib/bandori-event-band";
import type { BandoriMusicMasterMap } from "@/lib/bandori-music-api-client";
import {
  getBandoriRegionalDisplayOrder,
  getBandoriServerCode,
  pickBandoriRegionalText,
  type BandoriServer,
} from "@/lib/bandori-server";
import { getBandoriStampCatalogItemsForRegion } from "@/lib/bandori-stamp-assets";
import type { BandoriEventBonus } from "@/lib/bandori-team-calculator";
import BandoriCardTile from "@/components/bandori/BandoriCardTile";
import {
  normalizeBandoriSkillLabel,
  type BandoriSkillLabelMaster,
} from "@/lib/bandori-skill-label";
import { cn } from "@/lib/utils";
import {
  buildStampShortcode,
  CommentStampView,
} from "./commentContent";
import EventRelativeCountdown from "./EventRelativeCountdown";
import {
  buildEventInfoModel,
  deriveEventSongsWithFallback,
} from "./eventInfo";

type CharacterRecord = Record<string, unknown> & {
  bandId?: number | null;
  nickname?: string[] | string;
  firstName?: string[] | string;
  characterName?: string[] | string;
};

const SERVER_LABELS = ["JP", "EN", "TW", "CN"] as const;
const TEAM_BUILDER_EVENT_TYPES = [
  "story",
  "challenge",
  "versus",
  "live_try",
  "mission_live",
  "festival",
  "medley",
] as const;
type TeamBuilderEventType = (typeof TEAM_BUILDER_EVENT_TYPES)[number];
const TEAM_BUILDER_EVENT_TYPE_SET = new Set<string>(TEAM_BUILDER_EVENT_TYPES);
const TIME_ZONES = ["Asia/Tokyo", "UTC", "Asia/Taipei", "Asia/Shanghai"] as const;
const EVENT_STATUS_TONES: Record<BandoriEventStatus, string> = {
  未开始: "text-blue-700 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-200",
  进行中: "text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-200",
  已结束: "text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-300",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTeamBuilderEventType(value: string): value is TeamBuilderEventType {
  return TEAM_BUILDER_EVENT_TYPE_SET.has(value);
}

function parseCharacterResponse(raw: unknown): Record<string, CharacterRecord | undefined> {
  const data = parseApiSuccessData<unknown>(raw);
  if (!isRecord(data)) throw new Error("Bandori character API returned an invalid dataset");
  const payload = isRecord(data.payload) ? data.payload : data;
  return payload as Record<string, CharacterRecord | undefined>;
}

function parseSkillResponse(raw: unknown): Record<string, BandoriSkillLabelMaster | undefined> {
  const data = parseApiSuccessData<unknown>(raw);
  if (!isRecord(data)) throw new Error("Bandori skill API returned an invalid dataset");
  const payload = isRecord(data.payload) ? data.payload : data;
  return payload as Record<string, BandoriSkillLabelMaster | undefined>;
}

function parseBandResponse(raw: unknown): Record<string, BandoriBandNameRecord | undefined> {
  const data = parseApiSuccessData<unknown>(raw);
  if (!isRecord(data)) throw new Error("Bandori band API returned an invalid dataset");
  const payload = isRecord(data.payload) ? data.payload : data;
  return payload as Record<string, BandoriBandNameRecord | undefined>;
}

function formatDateTime(timestamp: number | null, server: BandoriServer): string {
  if (timestamp === null) return "尚未公布";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TIME_ZONES[server],
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

type OverviewRowProps = {
  label: string;
  children: ReactNode;
  mobileLayout?: "inline" | "stacked";
};

function OverviewRow({ label, children, mobileLayout = "inline" }: OverviewRowProps) {
  return (
    <div className={cn(
      "grid border-b border-slate-200/70 py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-5",
      mobileLayout === "inline"
        ? "grid-cols-[7rem_minmax(0,1fr)] items-start gap-3"
        : "grid-cols-1 gap-1",
    )}>
      <dt className={cn(
        "text-sm font-semibold leading-5 text-slate-500 dark:text-slate-400",
        mobileLayout === "inline" && "pt-0.5",
      )}>
        {label}
      </dt>
      <dd className="min-w-0 text-right text-sm font-semibold leading-5 text-slate-800 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function SectionTitle({ icon, children, tone = "blue" }: {
  icon: ReactNode;
  children: ReactNode;
  tone?: "blue" | "violet" | "amber";
}) {
  return (
    <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 dark:text-white">
      <span className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-xl",
        tone === "blue" && "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
        tone === "violet" && "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
        tone === "amber" && "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
      )}>
        {icon}
      </span>
      {children}
    </h2>
  );
}

function EventCardTile({
  cardId,
  server,
  cards,
  characters,
  skills,
}: {
  cardId: number;
  server: BandoriServer;
  cards: ReturnType<typeof useBandoriCardsMaster>["data"];
  characters: Record<string, CharacterRecord | undefined>;
  skills: Record<string, BandoriSkillLabelMaster | undefined>;
}) {
  const card = cards?.[String(cardId)];
  const title = pickBandoriRegionalText(card?.prefix, server, server) ?? `卡牌 ${cardId}`;
  const rarity = Math.min(5, Math.max(1, Math.trunc(Number(card?.rarity) || 1)));
  const trainedLevelFallback = rarity >= 4 ? 60 : rarity >= 3 ? 50 : rarity >= 2 ? 30 : 20;
  const baseLevelLimit = Math.trunc(Number(card?.levelLimit) || 0);
  const stat = isRecord(card?.stat) ? card.stat : null;
  const training = stat && isRecord(stat.training) ? stat.training : null;
  const trainingLevelLimit = Math.trunc(Number(training?.levelLimit) || 0);
  const level = Math.max(1, baseLevelLimit + trainingLevelLimit || trainedLevelFallback);
  const characterId = Number(card?.characterId);
  const character = Number.isFinite(characterId) ? characters[String(Math.trunc(characterId))] : undefined;
  const characterName = [character?.nickname, character?.characterName, character?.firstName]
    .map((value) => typeof value === "string" ? value.trim() : pickBandoriRegionalText(value, server, server))
    .find((value): value is string => Boolean(value)) ?? `Card #${cardId}`;
  const bandId = Number(character?.bandId);
  const skillId = Number(card?.skillId);
  const skillEffectLabel = normalizeBandoriSkillLabel(
    Number.isFinite(skillId) && skillId > 0 ? skills[String(Math.trunc(skillId))] : undefined,
    5,
    5,
    server,
    server,
  );
  return (
    <BandoriCardTile
      card={{
        cardId,
        level,
        masterRank: 0,
        skillLevel: 1,
        isTrained: rarity >= 3,
        bandId: Number.isFinite(bandId) && bandId > 0 ? Math.trunc(bandId) : null,
        totalPower: 0,
      }}
      metadata={{
        rarity,
        attribute: card?.attribute,
        resourceSetName: card?.resourceSetName,
        levelLimit: card?.levelLimit,
        assetRegion: card?.assetRegion === "cn" || card?.assetRegion === "jp" ? card.assetRegion : undefined,
        releasedAt: card?.releasedAt,
      }}
      cardName={title}
      characterName={characterName}
      skillEffectLabel={skillEffectLabel}
      assetRegion={server === 3 ? "cn" : "jp"}
      showPower={false}
    />
  );
}

export default function EventInfoPanel({
  eventId,
  server,
  eventRecord,
  musicMaster,
  loading,
}: {
  eventId: number | null;
  server: BandoriServer;
  eventRecord: Record<string, unknown> | null;
  musicMaster: BandoriMusicMasterMap | null;
  loading: boolean;
}) {
  const eventTypesT = useTranslations("bandori.teamBuilder.eventTypes");
  const now = useCurrentTime();
  const model = useMemo(
    () => eventRecord ? buildEventInfoModel(eventRecord, server) : null,
    [eventRecord, server],
  );
  const songSelection = useMemo(
    () => eventRecord ? deriveEventSongsWithFallback(musicMaster, eventRecord, server) : null,
    [eventRecord, musicMaster, server],
  );
  const songs = songSelection?.songs ?? [];
  const eventBandId = model ? getBandoriEventBandId(model.band) : null;
  const { catalog: stampCatalog, loading: stampsLoading } = useCommentStampCatalog(Boolean(model));
  const rewardStampIdsByServer = model?.rewardStampIdsByServer;
  const fallbackRewardStampServer = model?.rewardStampServer ?? server;
  // Keep catalog filtering off the one-second countdown render path.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const rewardStampSelection = useMemo(() => {
    if (!rewardStampIdsByServer || !stampCatalog) {
      return { server: fallbackRewardStampServer, stamps: [] };
    }
    for (const candidateServer of getBandoriRegionalDisplayOrder(server)) {
      const rewardStampIdSet = new Set(rewardStampIdsByServer[candidateServer]);
      if (rewardStampIdSet.size === 0) {
        continue;
      }
      const stamps = getBandoriStampCatalogItemsForRegion(
        stampCatalog,
        getBandoriServerCode(candidateServer),
      ).filter((stamp) => stamp.kind === "normal" && rewardStampIdSet.has(stamp.id));
      if (stamps.length > 0) {
        return { server: candidateServer, stamps };
      }
    }
    return { server: fallbackRewardStampServer, stamps: [] };
  }, [fallbackRewardStampServer, rewardStampIdsByServer, server, stampCatalog]);
  const rewardStamps = rewardStampSelection.stamps;
  const { value: musicAssetIndex } = useBandoriMusicAssetIndex(Boolean(model));
  const { data: cards } = useBandoriCardsMaster(server, Boolean(model), "regional");
  const { data: characters } = useCachedFetch<Record<string, CharacterRecord | undefined>>(
    model ? "bandori-master-characters-main" : null,
    model ? "/api/bandori/master/characters/main" : null,
    parseCharacterResponse,
    SESSION_CLIENT_CACHE_POLICY,
  );
  const { data: skills } = useCachedFetch<Record<string, BandoriSkillLabelMaster | undefined>>(
    model ? "bandori-master-skills" : null,
    model ? "/api/bandori/master/skills" : null,
    parseSkillResponse,
    SESSION_CLIENT_CACHE_POLICY,
  );
  const { data: bands } = useCachedFetch<Record<string, BandoriBandNameRecord | undefined>>(
    eventBandId !== null ? "bandori-master-bands-all" : null,
    eventBandId !== null ? "/api/bandori/master/bands/all" : null,
    parseBandResponse,
    SESSION_CLIENT_CACHE_POLICY,
  );
  const status = model
    ? getBandoriEventStatusAt(now, model.statusStartAt, model.statusEndAt)
    : null;
  const jpTitle = model ? pickBandoriRegionalText(model.eventName, 0, 0) : null;
  const localizedTitle = model ? pickBandoriRegionalText(model.eventName, server, server) : null;
  const eventTypeLabel = model && isTeamBuilderEventType(model.eventType)
    ? eventTypesT(model.eventType)
    : model?.eventType ?? "-";
  const bandName = model ? resolveBandoriEventBandName(model.band, bands ?? {}, server) : "-";
  const eventBonus = useMemo<BandoriEventBonus | null>(() => {
    if (!model) return null;
    return {
      attributes: model.attributes,
      characters: model.characters.map((entry) => ({ characterId: entry.id, percent: entry.percent })),
      pointPercent: model.combinedPointPercent,
      parameterPercent: model.combinedParameterPercent,
      performancePercent: model.parameterBonuses.performance ?? null,
      techniquePercent: model.parameterBonuses.technique ?? null,
      visualPercent: model.parameterBonuses.visual ?? null,
      members: model.members,
      limitBreaks: model.limitBreaks,
    };
  }, [model]);

  if (loading && !model) {
    return (
      <div className="rounded-3xl border border-[#ffe16c]/90 bg-[#fffef4] p-8 text-center shadow-sm dark:border-slate-700 dark:bg-[#111827]">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
        <p className="mt-4 text-sm font-semibold text-slate-500">正在读取活动详细信息…</p>
      </div>
    );
  }

  if (!model || eventId === null) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900/60">
        暂时无法读取这一期活动的详细信息
      </div>
    );
  }

  return (
    <article className="rounded-3xl border border-[#ffe16c]/90 bg-[#fffef4] p-4 shadow-[0_18px_48px_rgba(65,54,0,0.09)] dark:border-slate-700/80 dark:bg-[#111827] sm:p-6">
      <section className="@container">
        <SectionTitle icon={<ClipboardList className="h-5 w-5" />}>活动概览</SectionTitle>
        <div className="mt-3 grid min-w-0 items-stretch gap-y-0 @min-[54rem]:grid-cols-2 @min-[54rem]:gap-x-0">
          <dl className="min-w-0 @min-[54rem]:pr-8">
            <OverviewRow label="活动 ID">{eventId}</OverviewRow>
            <OverviewRow label="活动标题" mobileLayout="stacked">
              <span>{localizedTitle ?? `Event #${eventId}`}</span>
              {jpTitle && jpTitle !== localizedTitle ? <span className="mt-1 block font-medium text-slate-400">{jpTitle}</span> : null}
            </OverviewRow>
            <OverviewRow label="活动类型">
              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                {eventTypeLabel}
              </span>
            </OverviewRow>
            <OverviewRow label="主题乐队">
              <span className="inline-flex items-center gap-2">
                {eventBandId !== null ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={buildBandoriResIconPublicUrl(`band_${eventBandId}.svg`)}
                    data-event-band-icon={eventBandId}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="h-7 w-7 shrink-0 object-contain"
                  />
                ) : null}
                <span>{bandName}</span>
              </span>
            </OverviewRow>
            <OverviewRow label="活动状态">
              <span className="inline-flex flex-col items-end gap-1">
                {status ? (
                  <span className={cn("inline-flex rounded-full px-3 py-1", EVENT_STATUS_TONES[status])}>{status}</span>
                ) : null}
                {status === "未开始" && model.statusStartAt !== null ? (
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <EventRelativeCountdown prefix="距开始" remainingMs={model.statusStartAt - now} completedLabel="活动已开始" />
                  </span>
                ) : null}
                {status === "进行中" && model.statusEndAt !== null ? (
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <EventRelativeCountdown prefix="距结束" remainingMs={model.statusEndAt - now} completedLabel="活动已结束" />
                  </span>
                ) : null}
              </span>
            </OverviewRow>
            <OverviewRow label={`开始时间（${SERVER_LABELS[model.timeServer]}）`}>
              {formatDateTime(model.startAt, model.timeServer)}
            </OverviewRow>
            <OverviewRow label={`结束时间（${SERVER_LABELS[model.timeServer]}）`}>
              {formatDateTime(model.endAt, model.timeServer)}
            </OverviewRow>
          </dl>

          <div className="min-w-0 border-t border-slate-200/80 dark:border-slate-700 @min-[54rem]:border-l @min-[54rem]:border-t-0 @min-[54rem]:pl-8">
            <BandoriEventBonusPanel
              variant="embedded"
              eventTypeLabel={eventTypeLabel}
              eventBonus={eventBonus}
              characters={characters ?? {}}
              skills={skills ?? {}}
              cardMetadata={cards ?? {}}
              preferredServer={server}
              assetRegion={server === 3 ? "cn" : "jp"}
              showMatch={false}
              showMasterRank={false}
            />
          </div>
        </div>
      </section>

      <section className="@container mt-7 border-t border-slate-200/80 pt-6 dark:border-slate-700">
        <SectionTitle icon={<Gift className="h-5 w-5" />} tone="amber">活动奖励</SectionTitle>
        <div className="mt-4 grid min-w-0 items-stretch gap-y-0 @min-[54rem]:grid-cols-2 @min-[54rem]:gap-x-0">
          <dl className="min-w-0 @min-[54rem]:pr-8">
            <OverviewRow label={`奖励贴纸（${SERVER_LABELS[rewardStampSelection.server]}）`} mobileLayout="stacked">
              {rewardStamps.length > 0 ? (
                <div className="flex min-h-16 flex-wrap items-center justify-end gap-2">
                  {rewardStamps.map((stamp) => (
                    <CommentStampView
                      key={`${stamp.region}-${stamp.id}-${stamp.kind}`}
                      stamp={stamp}
                      shortcode={buildStampShortcode(stamp)}
                      variant="reward"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-16 items-center justify-end">
                  {stampsLoading ? "正在读取奖励贴纸" : "暂无奖励贴纸"}
                </div>
              )}
            </OverviewRow>
          </dl>

          <dl className="mt-2 min-w-0 border-t border-slate-200/80 pt-2 dark:border-slate-700 @min-[54rem]:mt-0 @min-[54rem]:border-l @min-[54rem]:border-t-0 @min-[54rem]:pl-8 @min-[54rem]:pt-0">
            <OverviewRow label="奖励卡牌" mobileLayout="stacked">
              {model.rewardCardIds.length > 0 ? (
                <div className="flex min-h-16 flex-wrap items-start justify-end gap-3">
                  {model.rewardCardIds.map((cardId) => (
                    <EventCardTile
                      key={cardId}
                      cardId={cardId}
                      server={server}
                      cards={cards}
                      characters={characters ?? {}}
                      skills={skills ?? {}}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-16 items-center justify-end">
                  本期活动暂无奖励卡牌
                </div>
              )}
            </OverviewRow>
          </dl>
        </div>
      </section>

      <section className="mt-7 border-t border-slate-200/80 pt-6 dark:border-slate-700">
        <SectionTitle icon={<Music2 className="h-5 w-5" />} tone="violet">
          活动歌曲（{SERVER_LABELS[songSelection?.sourceServer ?? server]}）
        </SectionTitle>
        <div className="mt-4 max-w-3xl space-y-3">
          {songs.map((song) => {
            const jacketUrl = buildBandoriPublicAssetUrl(musicAssetIndex?.songs[String(song.id)]?.files.thumb);
            return (
              <div key={song.id} data-music-id={song.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm transition hover:border-violet-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-950/50 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center">
                <div className="flex h-18 w-18 items-center justify-center overflow-hidden rounded-xl bg-violet-50 text-violet-300 dark:bg-violet-500/10">
                  {jacketUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={jacketUrl} alt={`${song.title} 封面`} className="h-full w-full object-cover" />
                  ) : <ImageOff className="h-6 w-6" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-black text-slate-900 dark:text-white">{song.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-400">
                    <span>#{song.id}</span>
                    {song.bandName ? <span>{song.bandName}</span> : null}
                    <span>{formatDateTime(song.publishedAt, songSelection?.sourceServer ?? server)} 发布</span>
                  </div>
                </div>
                <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-start-auto sm:justify-end">
                  {song.difficultyLevels.map((level, index) => (
                    <span key={`${level}-${index}`} className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 px-1.5 text-[11px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{level}</span>
                  ))}
                </div>
              </div>
            );
          })}
          {songs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-5 py-8 text-center text-sm font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-950/30">
              {songSelection?.startAt === null || songSelection?.endAt === null ? "暂时无法确定活动时间，无法匹配歌曲" : "该活动时间区间内没有匹配到新发布歌曲"}
            </div>
          ) : null}
        </div>
      </section>
    </article>
  );
}
