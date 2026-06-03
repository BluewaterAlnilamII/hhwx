"use client";

import { Check } from "lucide-react";
import SharedBandoriCardThumbnail, {
  type BandoriCardThumbnailCard,
  type BandoriCardThumbnailMetadata,
} from "@/app/bandori/BandoriCardThumbnail";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { cn } from "@/lib/utils";
import type { BandoriCardArtVariant, BandoriCardCatalogEntry } from "./types";

function buildThumbnailCard(
  card: BandoriCardCatalogEntry,
  trainType: BandoriCardArtVariant,
): BandoriCardThumbnailCard {
  const isTrainedArt = trainType === "after_training" && card.hasTrainedArt;
  return {
    cardId: card.cardId,
    level: Math.max(1, card.levelLimit + (isTrainedArt ? card.trainingLevelLimit : 0)),
    masterRank: 0,
    skillLevel: 1,
    isTrained: isTrainedArt,
    hasTrainedArt: isTrainedArt,
  };
}

function buildThumbnailMetadata(card: BandoriCardCatalogEntry): BandoriCardThumbnailMetadata {
  return {
    rarity: card.rarity,
    attribute: card.attribute ?? undefined,
    resourceSetName: card.resourceSetName,
    levelLimit: card.levelLimit,
  };
}

export default function BandoriCardThumbnailTile({
  card,
  trainType,
  selected = false,
  region,
  onSelect,
  className,
}: {
  card: BandoriCardCatalogEntry;
  trainType: BandoriCardArtVariant;
  selected?: boolean;
  region: BandoriAssetRegion;
  onSelect: () => void;
  className?: string;
}) {
  const label = `${card.displayName} / ${card.characterName} / Card #${card.cardId}`;
  const assetRegion = card.assetRegion ?? region;

  return (
    <article
      className={cn(
        "group relative h-[74px] w-[74px] overflow-visible rounded-[5px] outline outline-1 outline-white/80 transition hover:z-40 hover:-translate-y-0.5 hover:outline-2 hover:outline-sky-400 focus-within:z-40 focus-within:outline-2 focus-within:outline-sky-400 sm:h-[76px] sm:w-[76px]",
        selected && "z-30 outline-2 outline-sky-500 ring-2 ring-sky-300/70",
        className,
      )}
    >
      <button
        type="button"
        data-card-id={card.cardId}
        onClick={onSelect}
        title={label}
        aria-pressed={selected}
        className="relative block h-full w-full overflow-hidden rounded-[5px] bg-white text-left shadow-[0_2px_7px_rgba(15,23,42,0.22)]"
      >
        <SharedBandoriCardThumbnail
          card={buildThumbnailCard(card, trainType)}
          metadata={buildThumbnailMetadata(card)}
          bandId={card.bandId}
          region={assetRegion}
          alt={card.displayName}
          loading="eager"
        />
      </button>

      <div className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 hidden w-56 -translate-x-1/2 rounded-[18px] border border-white/90 bg-white p-3 text-center shadow-[0_18px_48px_rgba(15,23,42,0.22)] ring-1 ring-slate-950/5 group-hover:block group-focus-within:block">
        <div className="truncate text-sm font-black text-slate-900">{card.displayName}</div>
        <div className="mt-1 truncate text-xs font-semibold text-slate-500">{card.characterName}</div>
        <div className="mt-2 flex justify-center gap-2 text-[11px] font-black">
          <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-amber-700">★{card.rarity}</span>
          <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-sky-700">#{card.cardId}</span>
        </div>
      </div>

      {selected ? (
        <span className="pointer-events-none absolute -right-2 -top-2 z-40 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white bg-sky-600 text-white shadow-[0_6px_16px_rgba(2,132,199,0.35)]">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
    </article>
  );
}
