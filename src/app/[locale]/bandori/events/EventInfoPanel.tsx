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
import Heading from "@/components/Heading";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriSkillsMaster } from "@/hooks/useBandoriSkillsMaster";
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
  resolveBandoriSkillLabel,
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
  未开始: "border border-[var(--theme-color-status-upcoming-border)] bg-[var(--theme-color-status-upcoming-background)] text-[var(--theme-color-status-upcoming-foreground)] dark:text-[var(--theme-color-status-upcoming-foreground-on-dark)]",
  进行中: "border border-[var(--theme-color-status-ongoing-border)] bg-[var(--theme-color-status-ongoing-background)] text-[var(--theme-color-status-ongoing-foreground)] dark:text-[var(--theme-color-status-ongoing-foreground-on-dark)]",
  已结束: "border border-[var(--theme-color-status-ended-border)] bg-[var(--theme-color-status-ended-background)] text-[var(--theme-color-status-ended-foreground)] dark:text-[var(--theme-color-status-ended-foreground-on-dark)]",
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
      "grid border-b border-[var(--theme-color-border-subtle)] py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-5 dark:border-slate-700",
      mobileLayout === "inline"
        ? "grid-cols-[7rem_minmax(0,1fr)] items-start gap-3"
        : "grid-cols-1 gap-1",
    )}>
      <dt className={cn(
        "text-sm font-semibold leading-5 text-[var(--theme-color-text-muted)] dark:text-slate-400",
        mobileLayout === "inline" && "pt-0.5",
      )}>
        {label}
      </dt>
      <dd className="min-w-0 text-right text-sm font-semibold leading-5 text-[var(--theme-color-text-default)] dark:text-slate-100">{children}</dd>
    </div>
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
  skills: Record<string, BandoriSkillLabelMaster | null | undefined>;
}) {
  const cardPickerT = useTranslations("bandori.cardPicker");
  const termsT = useTranslations("bandori.terms");
  const card = cards?.[String(cardId)];
  const cardFallback = cardPickerT("cardFallback", { cardId });
  const title = pickBandoriRegionalText(card?.prefix, server, server) ?? cardFallback;
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
    .find((value): value is string => Boolean(value)) ?? cardFallback;
  const bandId = Number(character?.bandId);
  const skillId = Number(card?.skillId);
  const skillEffect = resolveBandoriSkillLabel(
    Number.isFinite(skillId) && skillId > 0 ? skills[String(Math.trunc(skillId))] ?? undefined : undefined,
    5,
    5,
    server,
    server,
    termsT("unknownSkill"),
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
        releasedAt: card?.releasedAt,
      }}
      cardName={title}
      characterName={characterName}
      skillEffectLabel={skillEffect.label}
      skillEffectLanguageTag={skillEffect.languageTag}
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
  const shouldLoadBandNames = eventId !== null;
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
  const { data: skills } = useBandoriSkillsMaster(Boolean(model));
  const { data: bands } = useCachedFetch<Record<string, BandoriBandNameRecord | undefined>>(
    shouldLoadBandNames ? "bandori-master-bands-all" : null,
    shouldLoadBandNames ? "/api/bandori/master/bands/all" : null,
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
      <div className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-8 text-center shadow-sm dark:border-slate-700 dark:bg-[#111827]">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[var(--theme-color-action-primary-background)] border-t-transparent" />
        <p className="mt-4 text-sm font-semibold text-[var(--theme-color-text-muted)] dark:text-[var(--theme-color-text-muted-on-dark)]">正在读取活动详细信息…</p>
      </div>
    );
  }

  if (!model || eventId === null) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-10 text-center text-sm font-semibold text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-slate-900/60 dark:text-[var(--theme-color-text-muted-on-dark)]">
        暂时无法读取这一期活动的详细信息
      </div>
    );
  }

  return (
    <article className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-6 dark:border-slate-700/80 dark:bg-[#111827]">
      <section className="@container">
        <Heading as="h2" visualRole="section" accentSlot="a" icon={<ClipboardList className="h-5 w-5" />} className="dark:text-[var(--theme-color-text-default-on-dark)]">活动概览</Heading>
        <div className="mt-3 grid min-w-0 items-stretch gap-y-0 @min-[54rem]:grid-cols-2 @min-[54rem]:gap-x-0">
          <dl className="min-w-0 @min-[54rem]:pr-8">
            <OverviewRow label="活动 ID">{eventId}</OverviewRow>
            <OverviewRow label="活动标题" mobileLayout="stacked">
              <span>{localizedTitle ?? `Event #${eventId}`}</span>
              {jpTitle && jpTitle !== localizedTitle ? <span className="mt-1 block font-medium text-[var(--theme-color-text-muted)] opacity-70">{jpTitle}</span> : null}
            </OverviewRow>
            <OverviewRow label="活动类型">
              <span className="inline-flex rounded-full border border-[var(--theme-color-semantic-info-border)] bg-[var(--theme-color-semantic-info-background)] px-3 py-1 text-[var(--theme-color-semantic-info-foreground)]">
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
                  <span className="text-sm font-semibold text-[var(--theme-color-text-default)] dark:text-slate-100">
                    <EventRelativeCountdown prefix="距开始" remainingMs={model.statusStartAt - now} completedLabel="活动已开始" />
                  </span>
                ) : null}
                {status === "进行中" && model.statusEndAt !== null ? (
                  <span className="text-sm font-semibold text-[var(--theme-color-text-default)] dark:text-slate-100">
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

          <div className="min-w-0 border-t border-[var(--theme-color-border-subtle)] @min-[54rem]:border-l @min-[54rem]:border-t-0 @min-[54rem]:pl-8 dark:border-slate-700">
            <BandoriEventBonusPanel
              variant="embedded"
              eventTypeLabel={eventTypeLabel}
              eventBonus={eventBonus}
              characters={characters ?? {}}
              skills={skills ?? {}}
              cardMetadata={cards ?? {}}
              preferredServer={server}
              showMatch={false}
              showMasterRank={false}
            />
          </div>
        </div>
      </section>

      <section className="@container mt-7 border-t border-[var(--theme-color-border-subtle)] pt-6 dark:border-slate-700">
        <Heading as="h2" visualRole="section" accentSlot="b" icon={<Gift className="h-5 w-5" />} className="dark:text-[var(--theme-color-text-default-on-dark)]">活动奖励</Heading>
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

          <dl className="mt-2 min-w-0 border-t border-[var(--theme-color-border-subtle)] pt-2 @min-[54rem]:mt-0 @min-[54rem]:border-l @min-[54rem]:border-t-0 @min-[54rem]:pl-8 @min-[54rem]:pt-0 dark:border-slate-700">
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

      <section className="mt-7 border-t border-[var(--theme-color-border-subtle)] pt-6 dark:border-slate-700">
        <Heading as="h2" visualRole="section" accentSlot="c" icon={<Music2 className="h-5 w-5" />} className="dark:text-[var(--theme-color-text-default-on-dark)]">
          活动歌曲（{SERVER_LABELS[songSelection?.sourceServer ?? server]}）
        </Heading>
        <div className="mt-4 max-w-3xl space-y-3">
          {songs.map((song) => {
            const jacketUrl = buildBandoriPublicAssetUrl(musicAssetIndex?.songs[String(song.id)]?.files.thumb);
            return (
              <div key={song.id} data-music-id={song.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] p-3 shadow-sm transition hover:border-[var(--theme-color-action-secondary-border)] hover:shadow-md sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center dark:border-slate-700 dark:bg-slate-950/50">
                <div className="flex h-18 w-18 items-center justify-center overflow-hidden rounded-xl bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-action-secondary-foreground)] dark:bg-slate-800 dark:text-[var(--theme-color-action-secondary-foreground-on-dark)]">
                  {jacketUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={jacketUrl} alt={`${song.title} 封面`} className="h-full w-full object-cover" />
                  ) : <ImageOff className="h-6 w-6" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-black text-[var(--theme-color-text-default)] dark:text-[var(--theme-color-text-default-on-dark)]">{song.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--theme-color-text-muted)] dark:text-[var(--theme-color-text-muted-on-dark)]">
                    <span>#{song.id}</span>
                    {song.bandName ? <span>{song.bandName}</span> : null}
                    <span>{formatDateTime(song.publishedAt, songSelection?.sourceServer ?? server)} 发布</span>
                  </div>
                </div>
                <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-start-auto sm:justify-end">
                  {song.difficultyLevels.map((level, index) => (
                    <span key={`${level}-${index}`} className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-[var(--theme-color-control-background-muted)] px-1.5 text-[11px] font-black text-[var(--theme-color-text-muted)] dark:bg-slate-800 dark:text-slate-300">{level}</span>
                  ))}
                </div>
              </div>
            );
          })}
          {songs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] px-5 py-8 text-center text-sm font-semibold text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-slate-950/30 dark:text-[var(--theme-color-text-muted-on-dark)]">
              {songSelection?.startAt === null || songSelection?.endAt === null ? "暂时无法确定活动时间，无法匹配歌曲" : "该活动时间区间内没有匹配到新发布歌曲"}
            </div>
          ) : null}
        </div>
      </section>
    </article>
  );
}
