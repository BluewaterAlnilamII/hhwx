"use client";

import { useMemo, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ClipboardList,
  Gift,
  ImageOff,
  Music2,
  Play,
} from "lucide-react";
import MusicArtwork from "@/components/music-player/MusicArtwork";
import BandoriEventBonusPanel from "@/components/bandori/BandoriEventBonusPanel";
import BandoriStampView from "@/components/bandori/BandoriStampView";
import Heading from "@/components/Heading";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriSkillsMaster } from "@/hooks/useBandoriSkillsMaster";
import { useCommentStampCatalog } from "@/hooks/useCommentStamps";
import { useBandoriMusicAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { SESSION_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import { buildBandoriCardBandIconUrl } from "@/lib/bandori-builtin-resources";
import { buildBandoriPublicAssetUrl } from "@/lib/bandori-public-asset-index";
import {
  getBandoriEventBandId,
  resolveBandoriEventBandName,
  type BandoriBandNameRecord,
} from "@/lib/bandori/events/band";
import type { BandoriMusicMasterMap } from "@/lib/bandori-music-api-client";
import { buildBandoriMusicPlayerItem } from "@/lib/bandori-music-player";
import {
  getBandoriRegionalDisplayOrder,
  getBandoriServerCode,
  getBandoriServerTimeZone,
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
import { useMusicPlayerStore } from "@/store/useMusicPlayerStore";
import {
  buildEventInfoModel,
  deriveEventSongsWithFallback,
} from "./eventInfo";
import EventStatusSummary from "./EventStatusSummary";

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

function formatDateTime(
  timestamp: number | null,
  server: BandoriServer,
  locale: string,
  unannouncedLabel: string,
): string {
  if (timestamp === null) return unannouncedLabel;
  return new Intl.DateTimeFormat(locale, {
    timeZone: getBandoriServerTimeZone(server),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
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
      interaction={{ kind: "information" }}
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
      server={server}
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
  const locale = useLocale();
  const t = useTranslations("bandori.events.info");
  const eventTypesT = useTranslations("bandori.teamBuilder.eventTypes");
  const playerT = useTranslations("navigation.toolbar.player");
  const model = useMemo(
    () => eventRecord ? buildEventInfoModel(eventRecord, server) : null,
    [eventRecord, server],
  );
  const songSelection = useMemo(
    () => eventRecord ? deriveEventSongsWithFallback(musicMaster, eventRecord, server) : null,
    [eventRecord, musicMaster, server],
  );
  const songs = useMemo(() => songSelection?.songs ?? [], [songSelection]);
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
  const playQueueFromStart = useMusicPlayerStore((state) => state.playQueueFromStart);
  const playableSongs = useMemo(
    () => songs.flatMap((song) => {
      const item = buildBandoriMusicPlayerItem({
        musicId: song.id,
        music: musicMaster?.[String(song.id)],
        assets: musicAssetIndex?.songs[String(song.id)],
        preferredServer: server,
        contextServer: songSelection?.sourceServer ?? server,
        fallbackTitle: song.title,
        fallbackArtist: song.bandName,
      });
      return item ? [item] : [];
    }),
    [musicAssetIndex, musicMaster, server, songSelection?.sourceServer, songs],
  );
  const playableSongIndexById = useMemo(
    () => new Map(playableSongs.map((song, index) => [song.providerTrackId, index])),
    [playableSongs],
  );
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
  const jpTitle = model && server !== 0
    ? pickBandoriRegionalText(model.eventName, 0, 0)
    : null;
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
        <p className="mt-4 text-sm font-semibold text-[var(--theme-color-text-muted)] dark:text-[var(--theme-color-text-muted-on-dark)]">{t("loading")}</p>
      </div>
    );
  }

  if (!model || eventId === null) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-10 text-center text-sm font-semibold text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-slate-900/60 dark:text-[var(--theme-color-text-muted-on-dark)]">
        {t("unavailable")}
      </div>
    );
  }

  return (
    <article className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-6 dark:border-slate-700/80 dark:bg-[#111827]">
      <section className="@container">
        <Heading as="h2" visualRole="section" accentSlot="a" icon={<ClipboardList className="h-5 w-5" />} className="dark:text-[var(--theme-color-text-default-on-dark)]">{t("overviewTitle")}</Heading>
        <div className="mt-3 grid min-w-0 items-stretch gap-y-0 @min-[54rem]:grid-cols-2 @min-[54rem]:gap-x-0">
          <dl className="min-w-0 @min-[54rem]:pr-8">
            <OverviewRow label={t("eventId")}>{eventId}</OverviewRow>
            <OverviewRow label={t("eventTitle")} mobileLayout="stacked">
              <span>{localizedTitle ?? t("eventTitleFallback", { eventId })}</span>
              {jpTitle ? <span className="mt-1 block font-medium text-[var(--theme-color-text-muted)] opacity-70">{jpTitle}</span> : null}
            </OverviewRow>
            <OverviewRow label={t("eventType")}>
              <span className="inline-flex rounded-full border border-[var(--theme-color-semantic-info-border)] bg-[var(--theme-color-semantic-info-background)] px-3 py-1 text-[var(--theme-color-semantic-info-foreground)]">
                {eventTypeLabel}
              </span>
            </OverviewRow>
            <OverviewRow label={t("featuredBand")}>
              <span className="inline-flex items-center gap-2">
                {eventBandId !== null ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={buildBandoriCardBandIconUrl(eventBandId) ?? undefined}
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
            <OverviewRow label={t("eventStatus")}>
              <EventStatusSummary
                startAt={model.statusStartAt}
                endAt={model.statusEndAt}
              />
            </OverviewRow>
            <OverviewRow label={t("startTime", { server: SERVER_LABELS[model.timeServer] })}>
              {formatDateTime(model.startAt, model.timeServer, locale, t("unannounced"))}
            </OverviewRow>
            <OverviewRow label={t("endTime", { server: SERVER_LABELS[model.timeServer] })}>
              {formatDateTime(model.endAt, model.timeServer, locale, t("unannounced"))}
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
        <Heading as="h2" visualRole="section" accentSlot="b" icon={<Gift className="h-5 w-5" />} className="dark:text-[var(--theme-color-text-default-on-dark)]">{t("rewardsTitle")}</Heading>
        <div className="mt-4 grid min-w-0 items-stretch gap-y-0 @min-[54rem]:grid-cols-2 @min-[54rem]:gap-x-0">
          <dl className="min-w-0 @min-[54rem]:pr-8">
            <OverviewRow label={t("rewardStamps", { server: SERVER_LABELS[rewardStampSelection.server] })} mobileLayout="stacked">
              {rewardStamps.length > 0 ? (
                <div className="flex min-h-16 flex-wrap items-center justify-end gap-2">
                  {rewardStamps.map((stamp) => (
                    <BandoriStampView
                      key={`${stamp.region}-${stamp.id}-${stamp.kind}`}
                      stamp={stamp}
                      label={`${stamp.region.toUpperCase()} #${stamp.id}`}
                      variant="reward"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-16 items-center justify-end">
                  {stampsLoading ? t("loadingRewardStamps") : t("noRewardStamps")}
                </div>
              )}
            </OverviewRow>
          </dl>

          <dl className="mt-2 min-w-0 border-t border-[var(--theme-color-border-subtle)] pt-2 @min-[54rem]:mt-0 @min-[54rem]:border-l @min-[54rem]:border-t-0 @min-[54rem]:pl-8 @min-[54rem]:pt-0 dark:border-slate-700">
            <OverviewRow label={t("rewardCards")} mobileLayout="stacked">
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
                  {t("noRewardCards")}
                </div>
              )}
            </OverviewRow>
          </dl>
        </div>
      </section>

      <section className="mt-7 border-t border-[var(--theme-color-border-subtle)] pt-6 dark:border-slate-700">
        <Heading as="h2" visualRole="section" accentSlot="c" icon={<Music2 className="h-5 w-5" />} className="dark:text-[var(--theme-color-text-default-on-dark)]">
          {t("songsTitle", { server: SERVER_LABELS[songSelection?.sourceServer ?? server] })}
        </Heading>
        <div className="mt-4 max-w-3xl space-y-3">
          {songs.map((song) => {
            const thumbnailUrl = buildBandoriPublicAssetUrl(musicAssetIndex?.songs[String(song.id)]?.files.thumb);
            const playableSongIndex = playableSongIndexById.get(String(song.id));
            return (
              <div key={song.id} data-music-id={song.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] p-3 shadow-sm transition hover:border-[var(--theme-color-action-secondary-border)] hover:shadow-md sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center dark:border-slate-700 dark:bg-slate-950/50">
                <div className="flex h-18 w-18 items-center justify-center overflow-hidden rounded-xl bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-action-secondary-foreground)] dark:bg-slate-800 dark:text-[var(--theme-color-action-secondary-foreground-on-dark)]">
                  {thumbnailUrl ? (
                    <MusicArtwork
                      src={thumbnailUrl}
                      alt={t("coverAlt", { title: song.title })}
                      className="h-full w-full object-cover"
                      fallback={<ImageOff className="h-6 w-6" />}
                    />
                  ) : <ImageOff className="h-6 w-6" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-black text-[var(--theme-color-text-default)] dark:text-[var(--theme-color-text-default-on-dark)]">{song.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--theme-color-text-muted)] dark:text-[var(--theme-color-text-muted-on-dark)]">
                    <span>#{song.id}</span>
                    {song.bandName ? <span>{song.bandName}</span> : null}
                    <span>{t("publishedAt", {
                      date: formatDateTime(
                        song.publishedAt,
                        songSelection?.sourceServer ?? server,
                        locale,
                        t("unannounced"),
                      ),
                    })}</span>
                  </div>
                </div>
                <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-start-auto sm:justify-end">
                  {song.difficultyLevels.map((level, index) => (
                    <span key={`${level}-${index}`} className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-[var(--theme-color-control-background-muted)] px-1.5 text-[11px] font-black text-[var(--theme-color-text-muted)] dark:bg-slate-800 dark:text-slate-300">{level}</span>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (playableSongIndex !== undefined) {
                        playQueueFromStart(playableSongs, playableSongIndex);
                      }
                    }}
                    disabled={playableSongIndex === undefined}
                    title={playableSongIndex === undefined ? playerT("audioUnavailable") : undefined}
                    aria-label={playableSongIndex === undefined
                      ? playerT("audioUnavailable")
                      : playerT("playSong", { title: song.title })}
                    className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--theme-color-action-accent-background)] text-[var(--theme-color-action-accent-foreground)] shadow-sm outline-hidden transition hover:scale-105 hover:bg-[var(--theme-color-action-accent-background-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:shadow-none"
                  >
                    <Play className="ml-px h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
          {songs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] px-5 py-8 text-center text-sm font-semibold text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-slate-950/30 dark:text-[var(--theme-color-text-muted-on-dark)]">
              {songSelection?.startAt === null || songSelection?.endAt === null
                ? t("songWindowUnavailable")
                : t("noSongs")}
            </div>
          ) : null}
        </div>
      </section>
    </article>
  );
}
