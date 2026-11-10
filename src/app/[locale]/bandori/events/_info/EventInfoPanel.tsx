"use client";
import LoadingError from "@/components/LoadingError";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ClipboardList,
  Gift,
} from "lucide-react";
import BandoriEventBonusPanel from "@/components/bandori/BandoriEventBonusPanel";
import BandoriStampView from "@/components/bandori/BandoriStampView";
import Heading from "@/components/Heading";
import LoadingIndicator from "@/components/LoadingIndicator";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriSkillsMaster } from "@/hooks/useBandoriSkillsMaster";
import { useCommentStampCatalog } from "@/hooks/useCommentStamps";
import { useBandoriMusicAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { SESSION_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import { buildBandoriCardBandIconUrl } from "@/lib/bandori-builtin-resources";
import {
  getBandoriEventBandId,
  resolveBandoriEventBandName,
  type BandoriBandNameRecord,
} from "@/lib/bandori/events/band";
import type { BandoriMusicMasterMap } from "@/lib/bandori-music-api-client";
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
import { BandoriDetailColumns, BandoriDetailRow as OverviewRow } from "@/components/bandori/BandoriDetailLayout";
import {
  resolveBandoriSkillLabel,
  type BandoriSkillLabelMaster,
} from "@/lib/bandori-skill-label";
import {
  buildEventInfoModel,
} from "./eventInfo";
import EventStatusSummary from "./EventStatusSummary";
import EventSongs from "./EventSongs";
import { parseBandoriSongMetaResponse } from "@/lib/bandori/songs/meta";

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
  error,
  onRetry,
  musicLoading,
  musicError,
  onRetryMusic,
}: {
  eventId: number | null;
  server: BandoriServer;
  eventRecord: Record<string, unknown> | null;
  musicMaster: BandoriMusicMasterMap | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  musicLoading: boolean;
  musicError: Error | null;
  onRetryMusic: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("bandori.events.info");
  const commonT = useTranslations("common");
  const eventTypesT = useTranslations("bandori.teamBuilder.eventTypes");
  const model = useMemo(
    () => eventRecord ? buildEventInfoModel(eventRecord, server) : null,
    [eventRecord, server],
  );
  const eventBandId = model ? getBandoriEventBandId(model.band) : null;
  const shouldLoadBandNames = eventId !== null;
  const stamps = useCommentStampCatalog(Boolean(model));
  const { catalog: stampCatalog, loading: stampsLoading } = stamps;
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
  const musicAssets = useBandoriMusicAssetIndex(Boolean(model));
  const { value: musicAssetIndex } = musicAssets;
  const cardsRequest = useBandoriCardsMaster(server, Boolean(model), "regional");
  const charactersRequest = useCachedFetch<Record<string, CharacterRecord | undefined>>(
    model ? "bandori-master-characters-main" : null,
    model ? "/api/bandori/master/characters/main" : null,
    parseCharacterResponse,
    SESSION_CLIENT_CACHE_POLICY,
  );
  const skillsRequest = useBandoriSkillsMaster(Boolean(model));
  const metaRequest = useCachedFetch(
    model ? "bandori-song-meta-v2" : null,
    model ? "/api/bandori/master/music/meta" : null,
    parseBandoriSongMetaResponse,
    SESSION_CLIENT_CACHE_POLICY,
  );
  const bandsRequest = useCachedFetch<Record<string, BandoriBandNameRecord | undefined>>(
    shouldLoadBandNames ? "bandori-master-bands-all" : null,
    shouldLoadBandNames ? "/api/bandori/master/bands/all" : null,
    parseBandResponse,
    SESSION_CLIENT_CACHE_POLICY,
  );
  const { data: cards } = cardsRequest;
  const { data: characters } = charactersRequest;
  const { data: skills } = skillsRequest;
  const { data: bands } = bandsRequest;
  const missingRequests = [cardsRequest, charactersRequest, skillsRequest, bandsRequest, metaRequest]
    .filter((request) => request.data === null);
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

  if (!model || !eventRecord || eventId === null || !musicMaster || !skills || !metaRequest.data || missingRequests.length > 0) {
    const failed = (!model && error) || (!musicMaster && musicError) || missingRequests.some((request) => request.error);
    const pending = (!model && loading) || (!musicMaster && musicLoading) || missingRequests.some((request) => request.loading);
    return (
      <div className="event-info-loading hhwx-panel border">
        {!failed && pending ? <LoadingIndicator label={commonT("states.loading")} className="p-8" /> : (
          <LoadingError className="p-8" onRetry={() => {
            if (!model) onRetry();
            if (!musicMaster) onRetryMusic();
            missingRequests.filter((request) => !request.loading).forEach((request) => request.refresh());
          }} />
        )}
      </div>
    );
  }

  return (
    <article className="event-info hhwx-panel border">
      <section className="@container">
        <Heading as="h2" visualRole="section" accentSlot="a" icon={<ClipboardList className="h-5 w-5" />}>{t("overviewTitle")}</Heading>
        <div className="mt-4">
          <BandoriDetailColumns left={<dl>
            <OverviewRow label={t("eventId")}>{eventId}</OverviewRow>
            <OverviewRow label={t("eventTitle")} mobileLayout="stacked">
              <span>{localizedTitle ?? t("eventTitleFallback", { eventId })}</span>
              {jpTitle ? <span className="mt-1 block font-normal text-[var(--theme-color-text-muted)]">{jpTitle}</span> : null}
            </OverviewRow>
            <OverviewRow label={t("eventType")} alignment="center">
              <span className="inline-flex rounded-full border border-[var(--theme-color-semantic-info-border)] bg-[var(--theme-color-semantic-info-background)] px-3 py-1 text-[var(--theme-color-semantic-info-foreground)]">
                {eventTypeLabel}
              </span>
            </OverviewRow>
            <OverviewRow label={t("featuredBand")} alignment="center">
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
          </dl>} right={
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
          } />
        </div>
      </section>

      <section className="@container mt-6 border-t border-[var(--theme-color-border-subtle)] pt-6">
        <Heading as="h2" visualRole="section" accentSlot="b" icon={<Gift className="h-5 w-5" />}>{t("rewardsTitle")}</Heading>
        <div className="mt-4">
          <BandoriDetailColumns left={<dl>
            {stampCatalog || !stamps.error ? <OverviewRow label={t("rewardStamps", { server: SERVER_LABELS[rewardStampSelection.server] })} mobileLayout="stacked" alignment="start">
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
                  {stampsLoading ? <LoadingIndicator compact label={commonT("states.loading")} /> : t("noRewardStamps")}
                </div>
              )}
            </OverviewRow> : null}
          </dl>} right={<dl className="mt-2 pt-2 @min-[54rem]:mt-0 @min-[54rem]:pt-0">
            <OverviewRow label={t("rewardCards")} mobileLayout="stacked" alignment="start">
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
          </dl>} />
        </div>
      </section>

      <EventSongs music={musicMaster} event={eventRecord} server={server} meta={metaRequest.data}
        skills={skills} assets={musicAssetIndex} assetsLoading={musicAssets.loading && !musicAssetIndex} />
    </article>
  );
}
