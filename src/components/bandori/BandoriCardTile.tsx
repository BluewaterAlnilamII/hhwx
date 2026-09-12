"use client";

import BandoriCardThumbnail, {
  BANDORI_MUTED_CARD_CLASS_NAME,
  type BandoriCardThumbnailCard,
  type BandoriCardThumbnailMetadata,
} from "@/components/bandori/BandoriCardThumbnail";
import { BandoriCardHoverPopover } from "@/components/bandori/BandoriCardHoverTooltip";
import { useBandoriCardHoverTooltip } from "@/hooks/useBandoriCardHoverTooltip";
import { cn } from "@/lib/utils";
import {
  getBandoriServerCode,
  type BandoriServer,
  type BandoriServerLanguageTag,
} from "@/lib/bandori-server";

export type BandoriCardTileCard = BandoriCardThumbnailCard & {
  bandId: number | null;
  totalPower?: number | null;
};

type BandoriCardTileBaseProps = {
  card: BandoriCardTileCard;
  metadata?: BandoriCardThumbnailMetadata;
  cardName: string;
  badge?: string;
  leaderLabel?: string;
  showPower?: boolean;
  size?: "compact" | "default";
  isMuted?: boolean;
};

export type BandoriCardTileInteraction =
  | { kind: "information" }
  | {
      kind: "action";
      label: string;
      onAction: () => void;
      disabled?: boolean;
    }
  | { kind: "presentation" };

type BandoriCardTileInteractiveProps = BandoriCardTileBaseProps & {
  interaction: Exclude<BandoriCardTileInteraction, { kind: "presentation" }>;
  server: BandoriServer;
  characterName: string;
  skillEffectLabel: string;
  skillEffectLanguageTag?: BandoriServerLanguageTag;
};

type BandoriCardTilePresentationProps = BandoriCardTileBaseProps & {
  interaction: Extract<BandoriCardTileInteraction, { kind: "presentation" }>;
};

export type BandoriCardTileProps = BandoriCardTileInteractiveProps | BandoriCardTilePresentationProps;

function getBandoriCardTileClassName(
  size: "compact" | "default",
  isInteractive: boolean,
  isActive = false,
) {
  const interactionClassName = isInteractive
    ? "transition hover:z-40 hover:outline-2 hover:outline-[color:var(--theme-color-focus-ring)] has-[:focus-visible]:z-40 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[color:var(--theme-color-focus-ring)]"
    : "";
  const activeClassName = isActive
    ? "z-40 outline-2 outline-[color:var(--theme-color-selection-subtle-ring)] ring-2 ring-[var(--theme-color-selection-subtle-ring)]"
    : "";

  return cn(
    "group relative overflow-visible rounded-[5px] outline-solid outline-1 outline-white/80 sm:h-[76px] sm:w-[76px]",
    size === "compact" ? "h-[56px] w-[56px]" : "h-[74px] w-[74px]",
    interactionClassName,
    activeClassName,
  );
}

function BandoriCardTileContent({
  card,
  metadata,
  cardName,
  badge,
  leaderLabel,
  showPower = true,
  isMuted = false,
  trigger,
}: BandoriCardTileBaseProps & {
  trigger?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    tooltipId?: string;
    isTooltipOpen?: boolean;
  };
}) {
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
    <>
      {trigger ? (
        <button
          type="button"
          aria-label={trigger.label}
          title={trigger.label}
          aria-controls={trigger.tooltipId}
          aria-expanded={trigger.tooltipId ? trigger.isTooltipOpen : undefined}
          aria-haspopup={trigger.tooltipId ? "dialog" : undefined}
          disabled={trigger.disabled}
          onClick={trigger.onClick}
          className={`h-full w-full overflow-visible rounded-[5px] bg-[var(--theme-color-control-background)] text-left shadow-[0_2px_7px_rgba(15,23,42,0.22)] disabled:cursor-not-allowed disabled:opacity-70 ${isMuted ? BANDORI_MUTED_CARD_CLASS_NAME : ""}`}
        >
          {thumbnail}
        </button>
      ) : (
        <div className={`h-full w-full overflow-visible rounded-[5px] shadow-[0_2px_7px_rgba(15,23,42,0.22)] ${isMuted ? BANDORI_MUTED_CARD_CLASS_NAME : ""}`}>
          {thumbnail}
        </div>
      )}
      {badge ? (
        <span className="absolute -right-2 -top-2 z-30 rounded-full border border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-semantic-danger-background)] px-1.5 py-0.5 text-[11px] font-black leading-none text-[var(--theme-color-semantic-danger-foreground)] shadow-xs">
          {badge}
        </span>
      ) : null}
      {leaderLabel ? (
        <span className="absolute -left-1.5 -top-1.5 z-30 rounded-full border border-[var(--theme-color-semantic-info-border)] bg-[var(--theme-color-semantic-info-background)] px-1.5 py-0.5 text-[10px] font-black leading-none text-[var(--theme-color-semantic-info-foreground)] shadow-xs">
          {leaderLabel}
        </span>
      ) : null}
    </>
  );
}

function InteractiveBandoriCardTile(props: BandoriCardTileInteractiveProps) {
  const {
    cardName,
    characterName,
    skillEffectLabel,
    skillEffectLanguageTag,
  } = props;
  const {
    anchorRef,
    tooltipId,
    isOpen: isHoverTooltipOpen,
    openTooltip,
    closeTooltip,
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
    tooltipInteractionProps,
  } = useBandoriCardHoverTooltip<HTMLElement>();
  const interaction = props.interaction;
  const trigger = interaction.kind === "action"
    ? {
        label: interaction.label,
        onClick: () => {
          closeTooltip();
          interaction.onAction();
        },
        disabled: interaction.disabled,
      }
    : {
        label: cardName,
        onClick: openTooltip,
        tooltipId,
        isTooltipOpen: isHoverTooltipOpen,
      };

  return (
    <article
      ref={anchorRef}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={getBandoriCardTileClassName(
        props.size ?? "default",
        true,
        isHoverTooltipOpen,
      )}
    >
      <BandoriCardTileContent {...props} trigger={trigger} />
      {isHoverTooltipOpen ? (
        <BandoriCardHoverPopover
          id={tooltipId}
          anchorRef={anchorRef}
          open={isHoverTooltipOpen}
          cardName={cardName}
          characterName={characterName}
          detailLanguageTag={skillEffectLanguageTag}
          detailHref={`/bandori/cards/${props.card.cardId}?server=${getBandoriServerCode(props.server)}`}
          {...tooltipInteractionProps}
        >
          <span className="block w-full whitespace-normal wrap-break-word rounded-xl bg-[var(--theme-color-panel-background)] px-2 py-1 text-[var(--theme-color-text-default)]">
            {skillEffectLabel}
          </span>
        </BandoriCardHoverPopover>
      ) : null}
    </article>
  );
}

function PresentationBandoriCardTile(props: BandoriCardTilePresentationProps) {
  return (
    <article className={getBandoriCardTileClassName(props.size ?? "default", false)}>
      <BandoriCardTileContent {...props} />
    </article>
  );
}

function isPresentationBandoriCardTile(
  props: BandoriCardTileProps,
): props is BandoriCardTilePresentationProps {
  return props.interaction.kind === "presentation";
}

export default function BandoriCardTile(props: BandoriCardTileProps) {
  return isPresentationBandoriCardTile(props)
    ? <PresentationBandoriCardTile {...props} />
    : <InteractiveBandoriCardTile {...props} />;
}
