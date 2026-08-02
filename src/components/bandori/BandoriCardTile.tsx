"use client";

import BandoriCardThumbnail, {
  BANDORI_MUTED_CARD_CLASS_NAME,
  type BandoriCardThumbnailCard,
  type BandoriCardThumbnailMetadata,
} from "@/components/bandori/BandoriCardThumbnail";
import { BandoriCardHoverTooltipPortal } from "@/components/bandori/BandoriCardHoverTooltip";
import { useBandoriCardHoverTooltip } from "@/hooks/useBandoriCardHoverTooltip";
import type { BandoriServerLanguageTag } from "@/lib/bandori-server";

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
  skillEffectLanguageTag?: BandoriServerLanguageTag;
  badge?: string;
  leaderLabel?: string;
  showPower?: boolean;
  size?: "compact" | "default";
  isMuted?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

export default function BandoriCardTile({
  card,
  metadata,
  cardName,
  characterName,
  skillEffectLabel,
  skillEffectLanguageTag,
  badge,
  leaderLabel,
  showPower = true,
  size = "default",
  isMuted = false,
  actionLabel,
  onAction,
}: BandoriCardTileProps) {
  const {
    anchorRef,
    isOpen: isHoverTooltipOpen,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
  } = useBandoriCardHoverTooltip<HTMLElement>();
  const thumbnail = (
    <BandoriCardThumbnail
      card={card}
      metadata={metadata}
      bandId={card.bandId}
      alt={cardName}
      power={card.totalPower}
      showPower={showPower}
    />
  );

  return (
    <article
      ref={anchorRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={`group relative ${size === "compact" ? "h-[56px] w-[56px]" : "h-[74px] w-[74px]"} overflow-visible rounded-[5px] outline-solid outline-1 outline-white/80 transition hover:z-40 hover:-translate-y-0.5 hover:outline-2 hover:outline-sky-400 focus-within:z-40 focus-within:outline-2 focus-within:outline-sky-400 sm:h-[76px] sm:w-[76px]`}
    >
      {onAction ? (
        <button
          type="button"
          aria-label={actionLabel ?? cardName}
          title={actionLabel ?? cardName}
          onClick={onAction}
          className={`h-full w-full overflow-visible rounded-[5px] bg-white text-left shadow-[0_2px_7px_rgba(15,23,42,0.22)] ${isMuted ? BANDORI_MUTED_CARD_CLASS_NAME : ""}`}
        >
          {thumbnail}
        </button>
      ) : (
        <div className={`h-full w-full overflow-visible rounded-[5px] shadow-[0_2px_7px_rgba(15,23,42,0.22)] ${isMuted ? BANDORI_MUTED_CARD_CLASS_NAME : ""}`}>
          {thumbnail}
        </div>
      )}
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
      {isHoverTooltipOpen ? (
        <BandoriCardHoverTooltipPortal
          anchorRef={anchorRef}
          open={isHoverTooltipOpen}
          cardName={cardName}
          characterName={characterName}
          detailLanguageTag={skillEffectLanguageTag}
        >
          <span className="block w-full whitespace-normal wrap-break-word rounded-xl bg-slate-50 px-2 py-1 text-slate-700">
            {skillEffectLabel}
          </span>
        </BandoriCardHoverTooltipPortal>
      ) : null}
    </article>
  );
}
