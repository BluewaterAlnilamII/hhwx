"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import SharedBandoriCardThumbnail, {
  BANDORI_MUTED_CARD_CLASS_NAME,
  type BandoriCardThumbnailCard,
  type BandoriCardThumbnailMetadata,
} from "@/components/bandori/BandoriCardThumbnail";
import { BandoriCardHoverPopover } from "@/components/bandori/BandoriCardHoverTooltip";
import { useBandoriCardHoverTooltip } from "@/hooks/useBandoriCardHoverTooltip";
import {
  getBandoriServerCode,
  type BandoriServer,
  type BandoriServerLanguageTag,
} from "@/lib/bandori-server";
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
    type: card.type,
  };
}

export default function BandoriCardThumbnailTile({
  card,
  trainType,
  isSelected = false,
  isMuted = false,
  skillEffectLabel,
  skillEffectLanguageTag,
  detailServer,
  onSelect,
  className,
}: {
  card: BandoriCardCatalogEntry;
  trainType: BandoriCardArtVariant;
  isSelected?: boolean;
  isMuted?: boolean;
  skillEffectLabel?: string;
  skillEffectLanguageTag?: BandoriServerLanguageTag;
  detailServer: BandoriServer;
  onSelect: () => void;
  className?: string;
}) {
  const cardPickerT = useTranslations("bandori.cardPicker");
  const termsT = useTranslations("bandori.terms");
  const label = `${card.displayName} / ${card.characterName} / ${cardPickerT("cardFallback", { cardId: card.cardId })}`;
  const resolvedSkillEffectLabel = skillEffectLabel || termsT("unknownSkill");
  const {
    anchorRef,
    tooltipId,
    isOpen: isHoverTooltipOpen,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    onKeyDown,
    tooltipInteractionProps,
  } = useBandoriCardHoverTooltip<HTMLElement>();

  return (
    <article
      ref={anchorRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={cn(
        "relative h-[56px] w-[56px] overflow-visible rounded-[5px] outline-solid outline-1 outline-white/80 transition hover:z-40 hover:-translate-y-0.5 hover:outline-2 hover:outline-sky-400 focus-within:z-40 focus-within:outline-2 focus-within:outline-sky-400 sm:h-[76px] sm:w-[76px]",
        isSelected && "z-30 outline-2 outline-sky-500 ring-2 ring-sky-300/70",
        className,
      )}
    >
      <button
        type="button"
        data-card-id={card.cardId}
        data-card-ref={card.cardRef}
        data-entity-server={card.entityServer ?? undefined}
        onClick={onSelect}
        title={label}
        aria-pressed={isSelected}
        className={cn(
          "relative block h-full w-full overflow-visible rounded-[5px] bg-white text-left shadow-[0_2px_7px_rgba(15,23,42,0.22)]",
          isMuted && BANDORI_MUTED_CARD_CLASS_NAME,
        )}
      >
        <SharedBandoriCardThumbnail
          card={buildThumbnailCard(card, trainType)}
          metadata={buildThumbnailMetadata(card)}
          bandId={card.bandId}
          alt={card.displayName}
          loading="eager"
          showLevel={false}
        />
      </button>

      {card.entityServer !== null ? (
        <span className="pointer-events-none absolute -left-1.5 -top-1.5 z-30 rounded-full border border-white bg-slate-800 px-1.5 py-0.5 text-[9px] font-black leading-none text-white shadow-xs sm:text-[10px]">
          {card.entityServer === 1 ? "EN" : "CN"}
        </span>
      ) : null}

      {isHoverTooltipOpen ? (
        <BandoriCardHoverPopover
          id={tooltipId}
          anchorRef={anchorRef}
          open={isHoverTooltipOpen}
          cardName={card.displayName}
          characterName={card.characterName}
          detailLanguageTag={skillEffectLanguageTag}
          detailHref={`/bandori/cards/${card.cardId}?server=${getBandoriServerCode(detailServer)}`}
          {...tooltipInteractionProps}
        >
          <span className="block w-full whitespace-normal wrap-break-word rounded-xl bg-slate-50 px-2 py-1 text-slate-700">
            {resolvedSkillEffectLabel}
          </span>
        </BandoriCardHoverPopover>
      ) : null}

      {isSelected ? (
        <span className="pointer-events-none absolute -right-2 -top-2 z-40 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white bg-sky-600 text-white shadow-[0_6px_16px_rgba(2,132,199,0.35)]">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
    </article>
  );
}
