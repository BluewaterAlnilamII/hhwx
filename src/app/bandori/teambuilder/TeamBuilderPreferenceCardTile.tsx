"use client";

import { useRef, useState } from "react";
import BandoriCardThumbnail from "@/components/bandori/BandoriCardThumbnail";
import { BandoriCardHoverTooltipPortal } from "@/components/bandori/BandoriCardHoverTooltip";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { type TeamBuilderPreferenceCardEntry } from "./useTeamBuilderPreferenceCardEntries";

export type TeamBuilderPreferenceCardTileProps = {
  entry: TeamBuilderPreferenceCardEntry;
  assetRegion: BandoriAssetRegion;
  title: string;
  compact?: boolean;
  selected?: boolean;
  muted?: boolean;
  onClick: () => void;
};

export default function TeamBuilderPreferenceCardTile({
  entry,
  assetRegion,
  title,
  compact = false,
  selected = false,
  muted = false,
  onClick,
}: TeamBuilderPreferenceCardTileProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHoverOpen(true)}
        onMouseLeave={() => setHoverOpen(false)}
        title={title}
        className={`group relative ${compact ? "h-[56px] w-[56px]" : "h-[74px] w-[74px]"} rounded-[5px] outline outline-1 transition hover:z-40 hover:-translate-y-0.5 sm:h-[76px] sm:w-[76px] ${
          selected ? "outline-2 outline-rose-500 ring-2 ring-rose-200" : "outline-white/80 hover:outline-2 hover:outline-sky-400"
        }`}
      >
        <span className={`relative block h-full w-full overflow-visible rounded-[5px] bg-white text-left shadow-[0_2px_7px_rgba(15,23,42,0.22)] ${
          muted ? "brightness-[0.42] saturate-[0.9] contrast-110" : ""
        }`}
        >
          <BandoriCardThumbnail card={entry.card} metadata={entry.metadata} bandId={entry.bandId} region={assetRegion} alt={entry.cardName} power={entry.totalPower} />
          {selected ? (
            <span className="absolute inset-x-1 bottom-1 rounded bg-rose-600/90 px-1 py-0.5 text-center text-[10px] font-black text-white">
              排除
            </span>
          ) : null}
        </span>
      </button>
      {hoverOpen ? (
        <BandoriCardHoverTooltipPortal
          anchorRef={buttonRef}
          open={hoverOpen}
          cardName={entry.cardName}
          characterName={entry.characterName}
        >
          <span className="block w-full whitespace-normal break-words rounded-xl bg-slate-50 px-2 py-1 text-slate-700">
            {entry.skillEffectLabel}
          </span>
        </BandoriCardHoverTooltipPortal>
      ) : null}
    </>
  );
}
