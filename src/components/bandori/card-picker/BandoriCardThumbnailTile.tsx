"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import SharedBandoriCardThumbnail, {
  type BandoriCardThumbnailCard,
  type BandoriCardThumbnailMetadata,
} from "@/components/bandori/BandoriCardThumbnail";
import { BandoriCardHoverTooltipPortal } from "@/components/bandori/BandoriCardHoverTooltip";
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
    assetRegion: card.assetRegion,
  };
}

export default function BandoriCardThumbnailTile({
  card,
  trainType,
  selected = false,
  region,
  skillEffectLabel = "未知技能",
  onSelect,
  className,
}: {
  card: BandoriCardCatalogEntry;
  trainType: BandoriCardArtVariant;
  selected?: boolean;
  region: BandoriAssetRegion;
  skillEffectLabel?: string;
  onSelect: () => void;
  className?: string;
}) {
  const label = `${card.displayName} / ${card.characterName} / Card #${card.cardId}`;
  const assetRegion = card.assetRegion ?? region;
  const tileRef = useRef<HTMLElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const showPreview = () => {
    setPreviewOpen(true);
  };

  const hidePreview = () => {
    setPreviewOpen(false);
  };

  return (
    <article
      ref={tileRef}
      onMouseEnter={showPreview}
      onMouseLeave={hidePreview}
      className={cn(
        "relative h-[56px] w-[56px] overflow-visible rounded-[5px] outline outline-1 outline-white/80 transition hover:z-40 hover:-translate-y-0.5 hover:outline-2 hover:outline-sky-400 focus-within:z-40 focus-within:outline-2 focus-within:outline-sky-400 sm:h-[76px] sm:w-[76px]",
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
        className="relative block h-full w-full overflow-visible rounded-[5px] bg-white text-left shadow-[0_2px_7px_rgba(15,23,42,0.22)]"
      >
        <SharedBandoriCardThumbnail
          card={buildThumbnailCard(card, trainType)}
          metadata={buildThumbnailMetadata(card)}
          bandId={card.bandId}
          region={assetRegion}
          alt={card.displayName}
          loading="eager"
          showLevel={false}
        />
      </button>

      {previewOpen ? (
        <BandoriCardHoverTooltipPortal
          anchorRef={tileRef}
          open={previewOpen}
          cardName={card.displayName}
          characterName={card.characterName}
        >
          <span className="block w-full whitespace-normal break-words rounded-xl bg-slate-50 px-2 py-1 text-slate-700">
            {skillEffectLabel}
          </span>
        </BandoriCardHoverTooltipPortal>
      ) : null}

      {selected ? (
        <span className="pointer-events-none absolute -right-2 -top-2 z-40 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white bg-sky-600 text-white shadow-[0_6px_16px_rgba(2,132,199,0.35)]">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
    </article>
  );
}
