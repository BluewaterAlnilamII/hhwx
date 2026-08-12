"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ClipboardList, Images, Play } from "lucide-react";
import Heading from "@/components/Heading";
import { useBandoriCharactersMaster } from "@/hooks/useBandoriCharactersMaster";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { useBandoriSkillsMaster } from "@/hooks/useBandoriSkillsMaster";
import { Link, useRouter } from "@/i18n/navigation";
import {
  normalizeBandoriCardCatalogType,
  type BandoriCardCatalogType,
} from "@/lib/bandori/cards/cards-page-catalog";
import { buildBandoriCardDetailHref } from "@/lib/bandori/cards/detail-url";
import { isKnownBandoriCardEntityCollision } from "@/lib/bandori/cards/regional-extensions";
import { readBandoriCardsListHref } from "@/lib/bandori/cards/cards-list-query-snapshot";
import { normalizeBandoriCardDisplayReleaseTimestamp } from "@/lib/bandori/cards/release";
import {
  pickBandoriCharacterDisplayName,
  type BandoriCardMaster,
} from "@/lib/bandori/cards/master";
import {
  hasTrainedCardArt,
  usesBandoriTrainedStarStyle,
} from "@/lib/bandori/cards/training";
import {
  buildBandoriCardAttributeIconUrl,
  buildBandoriCardBandIconUrl,
  buildBandoriCharacterIconUrl,
  buildBandoriRarityStarIconUrl,
} from "@/lib/bandori-builtin-resources";
import { BANDORI_CHARACTER_GROUPS } from "@/lib/bandori-character-groups";
import {
  buildBandoriPublicAssetUrl,
  listBandoriCardAssetVariants,
  lookupBandoriCardGachaVoice,
  type BandoriCardAssetVariant,
} from "@/lib/bandori-public-asset-index";
import { isBandoriCardAttribute } from "@/lib/bandori/cards/filter";
import { resolveBandoriSkillLabelForServer } from "@/lib/bandori-skill-label";
import { playSoundEffect } from "@/lib/sound-effect-audio";
import {
  getBandoriServerCode,
  getBandoriServerTimeZone,
  readBandoriRegionalNumberAt,
  readBandoriRegionalTextAt,
  type BandoriServer,
} from "@/lib/bandori-server";
import {
  calculateBandoriCard,
  type BandoriParamVector,
  type BestdoriCardMaster,
} from "@/lib/bandori-team-calculator";
import { useLocale, useTranslations } from "next-intl";
import BandoriPageShell from "../../BandoriPageShell";
import BandoriCardServerSwitcher from "../_components/BandoriCardServerSwitcher";
import CardComments from "./CardComments";
import BandoriFullCardGallery from "./_components/BandoriFullCardArt";

type CardStats = {
  totalPower: number;
  parameters: BandoriParamVector;
};

function toPositiveInteger(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.trunc(numericValue)
    : null;
}

function calculateMaxCardStats(cardId: number, card: BandoriCardMaster): CardStats | null {
  const baseLevelLimit = Math.max(1, Math.trunc(Number(card.levelLimit) || 1));
  const trainingLevelLimit = Math.max(
    0,
    Math.trunc(Number((card.stat?.training as { levelLimit?: unknown } | undefined)?.levelLimit) || 0),
  );
  const episodeCount = Array.isArray(card.stat?.episodes) ? card.stat.episodes.length : 0;
  try {
    const calculated = calculateBandoriCard(
      {
        cardId,
        level: baseLevelLimit + trainingLevelLimit,
        masterRank: 4,
        skillLevel: 5,
        episodeCount,
        isTrained: hasTrainedCardArt(card),
      },
      card as BestdoriCardMaster,
      {},
    );
    return {
      totalPower: calculated.totalPower,
      parameters: calculated.baseParam,
    };
  } catch {
    return null;
  }
}

function RegionalDetailRow({
  label,
  currentValue,
  jpValue,
}: {
  label: string;
  currentValue: ReactNode;
  jpValue?: ReactNode | null;
}) {
  return (
    <SingleDetailRow label={label}>
      <span className="block">{currentValue}</span>
      {jpValue ? (
        <span className="mt-1 block font-medium text-[var(--theme-color-text-muted)] opacity-70 dark:text-slate-400">
          {jpValue}
        </span>
      ) : null}
    </SingleDetailRow>
  );
}

function SingleDetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 border-b border-[var(--theme-color-border-subtle)] py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-5 dark:border-slate-700">
      <dt className="pt-0.5 text-sm font-semibold leading-5 text-[var(--theme-color-text-muted)] dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-right text-sm font-semibold leading-5 text-[var(--theme-color-text-default)] dark:text-slate-100">{children}</dd>
    </div>
  );
}

function ServerTaggedValue({ value, server }: { value: string; server: BandoriServer }) {
  return (
    <span>
      {value}
      <span className="ml-1 font-medium">
        （{getBandoriServerCode(server).toUpperCase()}）
      </span>
    </span>
  );
}

function GachaVoiceButton({
  src,
  playLabel,
}: {
  src: string;
  playLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void playSoundEffect(src).catch(() => {});
      }}
      aria-label={playLabel}
      title={playLabel}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-action-secondary-foreground)] outline-hidden transition-colors hover:border-[var(--theme-color-action-secondary-border)] hover:bg-[var(--theme-color-action-secondary-background-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-color-surface-background)]"
    >
      <Play className="ml-px h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export type CardDetailPageClientProps = {
  cardId: number;
  currentCard: BandoriCardMaster;
  jpCard: BandoriCardMaster | null;
  selectedServer: BandoriServer;
  availableServers: BandoriServer[];
};

export default function CardDetailPageClient({
  cardId,
  currentCard,
  jpCard,
  selectedServer,
  availableServers,
}: CardDetailPageClientProps) {
  const locale = useLocale();
  const t = useTranslations("bandori.cards");
  const termsT = useTranslations("bandori.terms");
  const router = useRouter();
  const charactersMaster = useBandoriCharactersMaster();
  const skillsMaster = useBandoriSkillsMaster();
  const { value: assetIndex, loading: assetIndexLoading } = useBandoriCardsAssetIndex();
  const [cardsListHref, setCardsListHref] = useState("/bandori/cards");

  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => {
      if (!cancelled) {
        setCardsListHref(readBandoriCardsListHref());
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const noInformation = t("common.noInformation");
  const characterId = toPositiveInteger(currentCard.characterId);
  const character = characterId === null ? null : charactersMaster.data?.[String(characterId)];
  const characterName = pickBandoriCharacterDisplayName(
    character,
    selectedServer,
    selectedServer,
    noInformation,
  );
  const bandId = toPositiveInteger(character?.bandId);
  const bandName = BANDORI_CHARACTER_GROUPS.find((group) => group.bandId === bandId)?.label
    ?? noInformation;
  const skillId = toPositiveInteger(currentCard.skillId);
  const skill = skillId === null ? undefined : skillsMaster.data?.[String(skillId)] ?? undefined;
  const type = normalizeBandoriCardCatalogType(currentCard.type);
  const attribute = isBandoriCardAttribute(currentCard.attribute) ? currentCard.attribute : null;
  const rarity = toPositiveInteger(currentCard.rarity) ?? 1;
  const resourceSetName = currentCard.resourceSetName?.trim() ?? "";
  const cardName = readBandoriRegionalTextAt(currentCard.prefix, selectedServer) ?? noInformation;
  const jpCardName = selectedServer !== 0 && jpCard
    ? readBandoriRegionalTextAt(jpCard.prefix, 0)
    : null;
  const skillName = readBandoriRegionalTextAt(currentCard.skillName, selectedServer) ?? noInformation;
  const jpSkillName = selectedServer !== 0 && jpCard
    ? readBandoriRegionalTextAt(jpCard.skillName, 0)
    : null;
  const gachaText = readBandoriRegionalTextAt(currentCard.gachaText, selectedServer);
  const jpGachaText = selectedServer !== 0 && jpCard
    ? readBandoriRegionalTextAt(jpCard.gachaText, 0)
    : null;
  const releaseTimestamp = normalizeBandoriCardDisplayReleaseTimestamp(
    readBandoriRegionalNumberAt(currentCard.releasedAt, selectedServer),
  );
  const jpReleaseTimestamp = selectedServer !== 0 && jpCard
    ? normalizeBandoriCardDisplayReleaseTimestamp(
        readBandoriRegionalNumberAt(jpCard.releasedAt, 0),
      )
    : null;
  const formatDate = (timestamp: number | null, server: BandoriServer) => timestamp !== null
    ? new Intl.DateTimeFormat(locale, {
        timeZone: getBandoriServerTimeZone(server),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(timestamp)
    : noInformation;
  const currentReleaseDate = formatDate(releaseTimestamp, selectedServer);
  const jpReleaseDate = jpReleaseTimestamp ? formatDate(jpReleaseTimestamp, 0) : null;
  const stats = useMemo(() => calculateMaxCardStats(cardId, currentCard), [cardId, currentCard]);
  const skillEffect = resolveBandoriSkillLabelForServer(
    skill,
    5,
    selectedServer,
    5,
    noInformation,
  ).label;
  const voiceUrl = buildBandoriPublicAssetUrl(
    lookupBandoriCardGachaVoice(assetIndex, resourceSetName),
  );
  const indexedArtVariants = listBandoriCardAssetVariants(assetIndex, resourceSetName);
  const artVariants: BandoriCardAssetVariant[] = indexedArtVariants.length > 0
    ? indexedArtVariants
    : [usesBandoriTrainedStarStyle(type, "normal") ? "after_training" : "normal"];
  const artItems = artVariants.map((variant) => {
    const isTrained = usesBandoriTrainedStarStyle(type, variant);
    const label = isTrained ? t("detail.afterTrainingArt") : t("detail.normalArt");
    return {
      variant,
      isTrained,
      label,
      alt: t("detail.openOriginal", { label }),
    };
  });
  const rarityStarIconUrl = buildBandoriRarityStarIconUrl(
    artItems.some((item) => item.isTrained),
  );
  const characterIconUrl = characterId === null ? null : buildBandoriCharacterIconUrl(characterId);
  const bandIconUrl = bandId === null ? null : buildBandoriCardBandIconUrl(bandId);
  const attributeIconUrl = attribute ? buildBandoriCardAttributeIconUrl(attribute) : null;
  const jpReferenceName = jpCardName;
  const jpReferenceReleaseDate = jpReleaseDate;
  const entityServer = isKnownBandoriCardEntityCollision(cardId)
    ? selectedServer
    : null;
  const handleServerChange = useCallback((server: BandoriServer) => {
    const changesCommentTarget = isKnownBandoriCardEntityCollision(cardId)
      && server !== selectedServer;
    router.replace(buildBandoriCardDetailHref(
      `/bandori/cards/${cardId}`,
      {
        server,
        commentPage: changesCommentTarget ? null : undefined,
        commentId: changesCommentTarget ? null : undefined,
      },
    ));
  }, [cardId, router, selectedServer]);

  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <article className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-6 dark:border-slate-700 dark:bg-[#111827]">
        <Link href={cardsListHref} className="inline-flex items-center gap-2 text-sm font-black text-sky-700 transition hover:text-sky-500 dark:text-sky-300">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("detail.back")}
        </Link>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="wrap-break-word text-2xl font-black tracking-tight text-[var(--theme-color-text-default)] sm:text-3xl dark:text-slate-100">
              {characterName} - {cardName}
            </h1>
            <div className="mt-2 flex min-h-5 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm leading-5 text-[var(--theme-color-text-muted)] dark:text-slate-400">
              <span className="font-black uppercase tracking-[0.18em]">#{cardId}</span>
              {jpReferenceName ? (
                <span lang="ja" className="font-semibold">{jpReferenceName}</span>
              ) : null}
            </div>
          </div>
          <BandoriCardServerSwitcher
            selectedServer={selectedServer}
            availableServers={availableServers}
            label={t("detail.server")}
            onChange={handleServerChange}
          />
        </div>

        <section className="@container mt-7 border-t border-[var(--theme-color-border-subtle)] pt-6 dark:border-slate-700">
          <Heading as="h2" visualRole="section" accentSlot="c" icon={<Images className="h-5 w-5" />}>
            {t("detail.artworkTitle")}
          </Heading>
          <div className="mt-5">
            <BandoriFullCardGallery
              metadata={{
                cardId,
                resourceSetName,
                rarity,
                attribute,
                bandId,
              }}
              assetIndex={assetIndex}
              assetIndexLoading={assetIndexLoading}
              items={artItems}
              viewerLabels={{
                close: t("detail.closeViewer"),
                zoomIn: t("detail.zoomIn"),
                zoomOut: t("detail.zoomOut"),
                previous: t("detail.previousArt"),
                next: t("detail.nextArt"),
                imageLoading: t("common.imageLoading"),
                imageUnavailable: t("common.imageUnavailable"),
              }}
            />
          </div>
        </section>

        <section className="@container mt-7 border-t border-[var(--theme-color-border-subtle)] pt-6 dark:border-slate-700">
          <Heading as="h2" visualRole="section" accentSlot="a" icon={<ClipboardList className="h-5 w-5" />}>
            {t("detail.informationTitle")}
          </Heading>

          <div className="mt-3 grid min-w-0 items-stretch gap-y-0 @min-[54rem]:grid-cols-2 @min-[54rem]:gap-x-0">
            <dl className="min-w-0 @min-[54rem]:pr-8">
              <SingleDetailRow label={t("detail.cardId")}>{cardId}</SingleDetailRow>
              <RegionalDetailRow
                label={t("detail.cardName")}
                currentValue={cardName}
                jpValue={jpReferenceName}
              />
              <SingleDetailRow label={t("detail.character")}>
                <span className="inline-flex items-center justify-end gap-2">
                  {characterIconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={characterIconUrl}
                      alt=""
                      aria-hidden="true"
                      className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-[var(--theme-color-border-subtle)] dark:ring-slate-700"
                    />
                  ) : null}
                  <span>{characterName}</span>
                </span>
              </SingleDetailRow>
              <SingleDetailRow label={t("detail.band")}>
                <span className="inline-flex items-center justify-end gap-2">
                  {bandIconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bandIconUrl}
                      alt=""
                      aria-hidden="true"
                      className="h-7 w-7 shrink-0 object-contain"
                    />
                  ) : null}
                  <span>{bandName}</span>
                </span>
              </SingleDetailRow>
              <SingleDetailRow label={t("detail.attribute")}>
                <span className="inline-flex items-center justify-end gap-2">
                  {attributeIconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attributeIconUrl}
                      alt=""
                      aria-hidden="true"
                      className="h-7 w-7 shrink-0 object-contain"
                    />
                  ) : null}
                  <span>{attribute ? termsT(`attributes.${attribute}`) : noInformation}</span>
                </span>
              </SingleDetailRow>
              <SingleDetailRow label={t("detail.rarity")}>
                {rarityStarIconUrl ? (
                  <span className="inline-flex items-center justify-end gap-0.5">
                    <span className="sr-only">{rarity}</span>
                    {Array.from({ length: rarity }, (_, index) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={index}
                        src={rarityStarIconUrl}
                        alt=""
                        aria-hidden="true"
                        className="h-7 w-7 shrink-0 object-contain"
                      />
                    ))}
                  </span>
                ) : rarity}
              </SingleDetailRow>
            </dl>

            <dl className="mt-2 min-w-0 border-t border-[var(--theme-color-border-subtle)] pt-2 @min-[54rem]:mt-0 @min-[54rem]:border-l @min-[54rem]:border-t-0 @min-[54rem]:pl-8 @min-[54rem]:pt-0 dark:border-slate-700">
              <SingleDetailRow label={t("detail.type")}>{t(`types.${type as BandoriCardCatalogType}`)}</SingleDetailRow>
              <RegionalDetailRow
                label={t("detail.releaseDate")}
                currentValue={<ServerTaggedValue value={currentReleaseDate} server={selectedServer} />}
                jpValue={jpReferenceReleaseDate ? (
                  <ServerTaggedValue value={jpReferenceReleaseDate} server={0} />
                ) : null}
              />
              <RegionalDetailRow
                label={t("detail.skillName")}
                currentValue={skillName}
                jpValue={jpSkillName}
              />
              <SingleDetailRow label={t("detail.skillEffect")}>{skillEffect}</SingleDetailRow>
              {gachaText ? (
                <RegionalDetailRow
                  label={t("detail.gachaText")}
                  currentValue={(
                    <span className="inline-flex items-start justify-end gap-2">
                      <span>{gachaText}</span>
                      {voiceUrl ? (
                        <GachaVoiceButton
                          src={voiceUrl}
                          playLabel={t("detail.playVoice")}
                        />
                      ) : null}
                    </span>
                  )}
                  jpValue={jpGachaText}
                />
              ) : null}
            </dl>
          </div>

          <div className="mt-6 border-t border-[var(--theme-color-border-subtle)] pt-5 dark:border-slate-700">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {[
                ["performance", stats?.parameters[0]],
                ["technique", stats?.parameters[1]],
                ["visual", stats?.parameters[2]],
                ["totalPower", stats?.totalPower],
              ].map(([key, value], index) => (
                <div
                  key={String(key)}
                  className={`border-[var(--theme-color-border-subtle)] px-3 py-3 text-center dark:border-slate-700 ${index % 2 === 1 ? "border-l" : ""} ${index >= 2 ? "border-t sm:border-t-0" : ""} ${index > 0 ? "sm:border-l" : "sm:border-l-0"}`}
                >
                  <div className="text-xs font-bold text-[var(--theme-color-text-muted)] dark:text-slate-400">{t(`detail.${key}`)}</div>
                  <div className="mt-1 text-xl font-black tabular-nums text-[var(--theme-color-text-default)] dark:text-slate-100">
                    {typeof value === "number" ? value.toLocaleString(locale) : noInformation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </article>
      <CardComments cardId={cardId} entityServer={entityServer} />
    </BandoriPageShell>
  );
}
