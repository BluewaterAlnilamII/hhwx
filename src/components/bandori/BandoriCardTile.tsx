"use client";

import { useRef, useState } from "react";
import BandoriCardThumbnail, {
  type BandoriCardThumbnailCard,
  type BandoriCardThumbnailMetadata,
} from "@/components/bandori/BandoriCardThumbnail";
import { BandoriCardHoverTooltipPortal } from "@/components/bandori/BandoriCardHoverTooltip";
import type { BandoriAssetRegion } from "@/lib/bandori-asset-proxy";

export type BandoriCardTileCard = BandoriCardThumbnailCard & {
  bandId: number | null;
  totalPower?: number | null;
};

export type BandoriCardTileProps = {
  card: BandoriCardTileCard;
  metadata?: BandoriCardThumbnailMetadata;
  cardName: string;
  characterName: string;
  skillEffectLabel: string;
  assetRegion: BandoriAssetRegion;
  badge?: string;
  leaderLabel?: string;
  showPower?: boolean;
};

export default function BandoriCardTile({
  card,
  metadata,
  cardName,
  characterName,
  skillEffectLabel,
  assetRegion,
  badge,
  leaderLabel,
  showPower = true,
}: BandoriCardTileProps) {
  const tileRef = useRef<HTMLElement | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);

  return (
    <article
      ref={tileRef}
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      className="group relative h-[74px] w-[74px] overflow-visible rounded-[5px] outline-solid outline-1 outline-white/80 transition hover:z-40 hover:-translate-y-0.5 hover:outline-2 hover:outline-sky-400 focus-within:z-40 focus-within:outline-2 focus-within:outline-sky-400 sm:h-[76px] sm:w-[76px]"
    >
      <div className="h-full w-full overflow-visible rounded-[5px] shadow-[0_2px_7px_rgba(15,23,42,0.22)]">
        <BandoriCardThumbnail
          card={card}
          metadata={metadata}
          bandId={card.bandId}
          region={assetRegion}
          alt={cardName}
          power={card.totalPower}
          showPower={showPower}
        />
      </div>
      {badge ? (
        <span className="absolute -right-2 -top-2 z-30 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-black leading-none text-rose-600 shadow-xs">
          {badge}
        </span>
      ) : null}
      {leaderLabel ? (
        <span className="absolute -left-1.5 -top-1.5 z-30 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-black leading-none text-sky-600 shadow-xs">
          {leaderLabel}
        </span>
      ) : null}
      {hoverOpen ? (
        <BandoriCardHoverTooltipPortal
          anchorRef={tileRef}
          open={hoverOpen}
          cardName={cardName}
          characterName={characterName}
        >
          <span className="block w-full whitespace-normal wrap-break-word rounded-xl bg-slate-50 px-2 py-1 text-slate-700">
            {skillEffectLabel}
          </span>
        </BandoriCardHoverTooltipPortal>
      ) : null}
    </article>
  );
}
