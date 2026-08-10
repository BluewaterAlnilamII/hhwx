"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import {
  buildBandoriRarityStarIconUrl,
  buildBandoriCardAttributeIconUrl,
  buildBandoriCardBandIconUrl,
  buildBandoriCardMasterRankIconUrl,
  buildBandoriThumbnailFrameUrl,
} from "@/lib/bandori-builtin-resources";
import {
  buildBandoriPublicAssetUrl,
  lookupBandoriCardImage,
  resolveBandoriCardAssetVariant,
} from "@/lib/bandori-public-asset-index";
import { isBandoriCardAttribute, type BandoriCardAttribute } from "@/lib/bandori/cards/filter";
import { usesBandoriTrainedStarStyle } from "@/lib/bandori/cards/training";

type TrainType = "normal" | "after_training";

export const BANDORI_MUTED_CARD_CLASS_NAME = "brightness-[0.42] saturate-[0.9] contrast-110";

export type BandoriCardThumbnailCard = {
  cardId: number;
  level: number;
  masterRank: number;
  skillLevel: number;
  isTrained?: boolean;
  hasTrainedArt?: boolean;
};

export type BandoriCardThumbnailMetadata = {
  rarity?: number;
  attribute?: BandoriCardAttribute | string;
  resourceSetName?: string;
  levelLimit?: number;
  releasedAt?: Array<string | number | null>;
  type?: string;
};

export type BandoriCardThumbnailSize = "tile" | "preview" | "editor";

function getCardTrainType(card: BandoriCardThumbnailCard): TrainType {
  return card.isTrained ? "after_training" : "normal";
}

function formatThumbnailPower(power: number | null | undefined): string | null {
  if (!Number.isFinite(power) || power === null || power === undefined) {
    return null;
  }

  return String(Math.max(0, Math.trunc(power)));
}

function BrokenImageFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-white/70 text-center text-[10px] font-semibold text-slate-400">
      <ImageOff className="h-5 w-5" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function CardAssetImage({
  src,
  alt,
  className,
  isResolving,
  loadingLabel,
  fallbackLabel,
  loading = "lazy",
}: {
  src: string | null;
  alt: string;
  className?: string;
  isResolving: boolean;
  loadingLabel: string;
  fallbackLabel: string;
  loading?: "eager" | "lazy";
}) {
  const [failedSrcs, setFailedSrcs] = useState<string[]>([]);
  const activeSrc = src && !failedSrcs.includes(src) ? src : null;

  if (!activeSrc && isResolving) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={loadingLabel}
        className="h-full w-full animate-pulse bg-slate-100"
      />
    );
  }

  if (!activeSrc) {
    return <BrokenImageFallback label={fallbackLabel} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={activeSrc}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      onError={() => setFailedSrcs((current) => current.includes(activeSrc) ? current : [...current, activeSrc])}
    />
  );
}

export default function BandoriCardThumbnail({
  card,
  metadata,
  bandId,
  alt,
  size = "tile",
  loading = "lazy",
  showLevel = true,
  showPower = true,
  power,
}: {
  card: BandoriCardThumbnailCard;
  metadata?: BandoriCardThumbnailMetadata;
  bandId: number | null;
  alt: string;
  size?: BandoriCardThumbnailSize;
  loading?: "eager" | "lazy";
  showLevel?: boolean;
  showPower?: boolean;
  power?: number | null;
}) {
  const t = useTranslations("bandori.cards.common");
  const { value: assetIndex, loading: assetIndexLoading } = useBandoriCardsAssetIndex();
  const requestedTrainType = getCardTrainType(card);
  const trainType = resolveBandoriCardAssetVariant(
    assetIndex,
    metadata?.resourceSetName,
    requestedTrainType,
  ) ?? requestedTrainType;
  const thumbnailUrl = buildBandoriPublicAssetUrl(
    lookupBandoriCardImage(assetIndex, metadata?.resourceSetName, requestedTrainType, "thumb"),
  );
  const rarity = Math.min(5, Math.max(1, Math.trunc(Number(metadata?.rarity) || 1)));
  const attribute = isBandoriCardAttribute(metadata?.attribute) ? metadata.attribute : null;
  const frameUrl = buildBandoriThumbnailFrameUrl(rarity, attribute);
  const attributeIconUrl = attribute ? buildBandoriCardAttributeIconUrl(attribute) : null;
  const bandIconUrl = bandId ? buildBandoriCardBandIconUrl(bandId) : null;
  const starIconUrl = buildBandoriRarityStarIconUrl(
    usesBandoriTrainedStarStyle(metadata?.type, trainType),
  );
  const masterIconUrl = buildBandoriCardMasterRankIconUrl();
  const starSlots = Array.from({ length: rarity }, (_, index) => index);
  const powerLabel = showPower && showLevel ? formatThumbnailPower(power) : null;
  const starStyle = size === "preview"
    ? {
        "--bandori-card-star-left": "3px",
        "--bandori-card-star-bottom": "0.5px",
        "--bandori-card-star-width": "24px",
        "--bandori-card-star-height": "23px",
        "--bandori-card-star-step": "18.8px",
      }
    : size === "editor"
      ? {
          "--bandori-card-star-left": "2.4px",
          "--bandori-card-star-bottom": "0.4px",
          "--bandori-card-star-width": "18.9px",
          "--bandori-card-star-height": "18.1px",
          "--bandori-card-star-step": "14.8px",
        }
    : {
        "--bandori-card-star-left": "1px",
        "--bandori-card-star-bottom": "0px",
        "--bandori-card-star-width": "14px",
        "--bandori-card-star-height": "13px",
        "--bandori-card-star-step": "10.8px",
      };

  return (
    <div
      className="bandori-card-thumbnail relative h-full w-full rounded-[5px] bg-white @container"
      data-size={size}
      style={starStyle as CSSProperties}
    >
      <div className="absolute inset-0">
        <div className="h-full w-full overflow-hidden rounded-[5px]">
          <CardAssetImage
            src={thumbnailUrl}
            alt={alt}
            loading={loading}
            className="h-full w-full object-cover"
            isResolving={assetIndexLoading}
            loadingLabel={t("imageLoading")}
            fallbackLabel={t("imageUnavailable")}
          />
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {frameUrl ? <img src={frameUrl} alt="" aria-hidden="true" loading={loading} decoding="async" className="pointer-events-none absolute inset-0 h-full w-full object-fill" /> : null}
      {bandIconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bandIconUrl}
          alt=""
          aria-hidden="true"
          loading={loading}
          decoding="async"
          data-bandori-thumbnail-overlay="band"
          className="pointer-events-none absolute left-0 top-0 h-[27.6%] w-[27.6%] object-contain"
        />
      ) : null}
      {attributeIconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attributeIconUrl}
          alt=""
          aria-hidden="true"
          loading={loading}
          decoding="async"
          className="pointer-events-none absolute right-[0.8%] top-[1.1%] h-[25.5%] w-[25.5%]"
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 z-10">
        {starIconUrl ? starSlots.map((slot) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={slot}
            src={starIconUrl}
            alt=""
            aria-hidden="true"
            loading={loading}
            decoding="async"
            className="bandori-card-thumbnail-star absolute object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
            style={{ "--bandori-card-star-slot": slot } as CSSProperties}
          />
        )) : null}
      </div>
      {card.masterRank > 0 && masterIconUrl ? (
        <div className="pointer-events-none absolute right-[-5.3%] top-[26.3%] z-30 h-[27.6%] w-[27.6%] drop-shadow-[0_1px_2px_rgba(15,23,42,0.55)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={masterIconUrl} alt="" aria-hidden="true" loading={loading} decoding="async" className="h-full w-full object-contain" />
          <span className="absolute inset-0 flex items-center justify-center text-[13cqw] font-black leading-none text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.68)]">
            {card.masterRank}
          </span>
        </div>
      ) : null}
      {card.skillLevel > 1 ? (
        <div className="pointer-events-none absolute right-[-1.3%] top-[53.9%] z-10 flex h-[19.7%] min-w-[27.6%] items-center justify-center rounded-[3px] border border-white/80 bg-rose-500 px-[3.9%] text-[13cqw] font-black leading-none text-white shadow-[0_1px_2px_rgba(15,23,42,0.5)] [text-shadow:0_1px_1px_rgba(0,0,0,0.55)]">
          {card.skillLevel}
        </div>
      ) : null}
      {powerLabel ? (
        <>
          <div
            className="pointer-events-none absolute bottom-[2.6%] right-[2.6%] z-10 h-[21.7%] w-[58.5%]"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.42)",
              clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%)",
            }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute bottom-[3.9%] right-[5.3%] z-20 flex h-[16.8%] w-[58.5%] items-center justify-end overflow-hidden text-right text-[14cqw] font-normal leading-none text-white tabular-nums [text-shadow:0_1px_1px_rgba(0,0,0,0.72)]">
            <span className="block max-w-full whitespace-nowrap">{powerLabel}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
