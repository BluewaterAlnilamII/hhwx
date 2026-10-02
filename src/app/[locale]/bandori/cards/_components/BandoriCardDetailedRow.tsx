"use client";

import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import BandoriCardThumbnail from "@/components/bandori/BandoriCardThumbnail";
import CardCatalogRow from "@/components/CardCatalogRow";
import type { BandoriCardsPageCatalogEntry } from "@/lib/bandori/cards/cards-page-catalog";
import {
  listBandoriCardAssetVariants,
  type BandoriCardAssetVariant,
  type BandoriCardsAssetIndex,
} from "@/lib/bandori-public-asset-index";
import { getBandoriServerTimeZone } from "@/lib/bandori-server";

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
        timeZone: getBandoriServerTimeZone(entry.displayServer),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(entry.displayReleaseTimestamp)
    : t("common.noInformation");
  const indexedVariants = listBandoriCardAssetVariants(assetIndex, entry.resourceSetName);
  const variants: BandoriCardAssetVariant[] = indexedVariants.length > 0
    ? indexedVariants
    : ["normal"];

  return <CardCatalogRow href={href} id={entry.cardId} title={entry.displayName} subtitle={entry.characterName}
    preview={variants.map((variant) => <CardPreview key={variant} entry={entry} variant={variant} />)}
    metadata={<><span>{typeLabel}</span><span className="inline-flex items-center gap-1 tabular-nums">
      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{releaseDate}
    </span></>}
    description={entry.skillEffectLabel || t("common.noInformation")} />;
}
