"use client";

import { CalendarDays, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import BandoriCardThumbnail from "@/components/bandori/BandoriCardThumbnail";
import { Link } from "@/i18n/navigation";
import type { BandoriCardsPageCatalogEntry } from "@/lib/bandori-card-catalog";
import {
  listBandoriCardAssetVariants,
  type BandoriCardAssetVariant,
  type BandoriCardsAssetIndex,
} from "@/lib/bandori-public-asset-index";

const TIME_ZONES = ["Asia/Tokyo", "UTC", "Asia/Taipei", "Asia/Shanghai"] as const;

function CardPreview({
  entry,
  variant,
}: {
  entry: BandoriCardsPageCatalogEntry;
  variant: BandoriCardAssetVariant;
}) {
  const isTrained = variant === "after_training";
  return (
    <div className="h-16 w-16 shrink-0 sm:h-[72px] sm:w-[72px]">
      <BandoriCardThumbnail
        card={{
          cardId: entry.cardId,
          level: entry.levelLimit + (isTrained ? entry.trainingLevelLimit : 0),
          masterRank: 0,
          skillLevel: 1,
          isTrained,
          hasTrainedArt: entry.hasTrainedArt,
        }}
        metadata={{
          rarity: entry.rarity,
          attribute: entry.attribute ?? undefined,
          resourceSetName: entry.resourceSetName,
          levelLimit: entry.levelLimit,
          type: entry.type,
        }}
        bandId={entry.bandId}
        alt={entry.displayName}
        showLevel={false}
        showPower={false}
      />
    </div>
  );
}

export type BandoriCardDetailedRowProps = {
  entry: BandoriCardsPageCatalogEntry;
  assetIndex: BandoriCardsAssetIndex | null;
  typeLabel: string;
  href: string;
};

export default function BandoriCardDetailedRow({
  entry,
  assetIndex,
  typeLabel,
  href,
}: BandoriCardDetailedRowProps) {
  const locale = useLocale();
  const t = useTranslations("bandori.cards");
  const releaseDate = entry.displayReleaseTimestamp > 0
    ? new Intl.DateTimeFormat(locale, {
        timeZone: TIME_ZONES[entry.displayServer],
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(entry.displayReleaseTimestamp)
    : t("common.noInformation");
  const indexedVariants = listBandoriCardAssetVariants(assetIndex, entry.resourceSetName);
  const variants: BandoriCardAssetVariant[] = indexedVariants.length > 0
    ? indexedVariants
    : ["normal"];

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-3 shadow-[var(--theme-shadow-surface-raised)] outline-hidden transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_16px_34px_rgba(15,23,42,0.11)] focus-visible:ring-2 focus-visible:ring-sky-400 sm:p-4 dark:border-slate-700 dark:bg-[#111827]"
    >
      <article className="grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {variants.map((variant) => (
            <CardPreview key={variant} entry={entry} variant={variant} />
          ))}
        </div>

        <div className="min-w-0 self-stretch py-0.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="min-w-0 truncate text-base font-black text-[var(--theme-color-text-default)] sm:text-lg dark:text-slate-100">
              {entry.displayName}
            </h2>
            <span className="text-xs font-bold tabular-nums text-[var(--theme-color-text-muted)] dark:text-slate-400">
              #{entry.cardId}
            </span>
          </div>
          <div className="mt-0.5 truncate text-sm font-bold text-[var(--theme-color-text-muted)] dark:text-slate-300">
            {entry.characterName}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--theme-color-text-muted)] dark:text-slate-400">
            <span>{typeLabel}</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {releaseDate}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-5 text-slate-700 sm:text-sm dark:text-slate-300">
            {entry.skillEffectLabel || t("common.noInformation")}
          </p>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-500 dark:text-slate-600" aria-hidden="true" />
      </article>
    </Link>
  );
}
