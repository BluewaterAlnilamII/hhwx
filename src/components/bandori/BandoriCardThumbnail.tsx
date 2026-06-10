"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import {
  buildBandoriCardThumbnailPublicUrl,
  buildBandoriResIconPublicUrl,
  buildBandoriResImagePublicUrl,
  type BandoriAssetRegion,
} from "@/lib/bandori-asset-proxy";

type CardAttribute = "powerful" | "pure" | "cool" | "happy";
type TrainType = "normal" | "after_training";

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
  attribute?: CardAttribute | string;
  resourceSetName?: string;
  levelLimit?: number;
  assetRegion?: BandoriAssetRegion;
  releasedAt?: Array<string | number | null>;
};

export type BandoriCardThumbnailSize = "tile" | "preview" | "editor";

function isKnownAttribute(value: string | undefined): value is CardAttribute {
  return value === "powerful" || value === "pure" || value === "cool" || value === "happy";
}

function getCardTrainType(card: BandoriCardThumbnailCard): TrainType {
  return card.isTrained ? "after_training" : "normal";
}

function readRegionalTimestampAt(values: BandoriCardThumbnailMetadata["releasedAt"], index: number): number {
  if (!Array.isArray(values)) {
    return 0;
  }
  const parsed = Number(values[index]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resolveThumbnailRegion(
  metadata: BandoriCardThumbnailMetadata | undefined,
  fallbackRegion: BandoriAssetRegion,
): BandoriAssetRegion {
  if (metadata?.assetRegion) {
    return metadata.assetRegion;
  }
  if (fallbackRegion === "cn" && metadata?.releasedAt && readRegionalTimestampAt(metadata.releasedAt, 3) <= 0) {
    return "jp";
  }
  return fallbackRegion;
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
  fallbackSrc,
  alt,
  className,
  fallbackLabel = "无资源",
  loading = "lazy",
}: {
  src: string | null;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  loading?: "eager" | "lazy";
}) {
  const [failedSrcs, setFailedSrcs] = useState<string[]>([]);
  const sourceCandidates = [src, fallbackSrc].filter((candidate): candidate is string => Boolean(candidate));
  const activeSrc = sourceCandidates.find((candidate, index) => (
    sourceCandidates.indexOf(candidate) === index && !failedSrcs.includes(candidate)
  )) ?? null;

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
  region,
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
  region: BandoriAssetRegion;
  alt: string;
  size?: BandoriCardThumbnailSize;
  loading?: "eager" | "lazy";
  showLevel?: boolean;
  showPower?: boolean;
  power?: number | null;
}) {
  const trainType = getCardTrainType(card);
  const thumbnailRegion = resolveThumbnailRegion(metadata, region);
  const thumbnailUrl = metadata?.resourceSetName
    ? buildBandoriCardThumbnailPublicUrl(thumbnailRegion, card.cardId, metadata.resourceSetName, trainType)
    : null;
  const fallbackThumbnailUrl = metadata?.resourceSetName && thumbnailRegion === "cn"
    ? buildBandoriCardThumbnailPublicUrl("jp", card.cardId, metadata.resourceSetName, trainType)
    : null;
  const rarity = Math.min(5, Math.max(1, Math.trunc(Number(metadata?.rarity) || 1)));
  const attribute = isKnownAttribute(metadata?.attribute) ? metadata.attribute : null;
  const frameUrl = rarity >= 2
    ? buildBandoriResImagePublicUrl(`card-${rarity}.png`)
    : attribute ? buildBandoriResImagePublicUrl(`card-1-${attribute}.png`) : null;
  const attributeIconUrl = attribute ? buildBandoriResIconPublicUrl(`${attribute}.svg`) : null;
  const bandIconUrl = bandId ? buildBandoriResIconPublicUrl(`band_${bandId}.svg`) : null;
  const starIconUrl = buildBandoriResIconPublicUrl(card.isTrained ? "star_trained.png" : "star.png");
  const masterIconUrl = buildBandoriResIconPublicUrl("master.svg");
  const starSlots = Array.from({ length: rarity }, (_, index) => index);
  const isPreview = size !== "tile";
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
      className="bandori-card-thumbnail relative h-full w-full rounded-[5px] bg-white [container-type:inline-size]"
      data-size={size}
      style={starStyle as CSSProperties}
    >
      <div className="absolute inset-0">
        <div className="h-full w-full overflow-hidden rounded-[5px]">
          <CardAssetImage
            src={thumbnailUrl}
            fallbackSrc={fallbackThumbnailUrl}
            alt={alt}
            loading={loading}
            className="h-full w-full object-cover"
            fallbackLabel={isPreview ? "缩略图" : "无图"}
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
          className="pointer-events-none absolute left-0 top-0 h-[27.6%] w-[27.6%]"
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
        {starSlots.map((slot) => (
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
        ))}
      </div>
      {card.masterRank > 0 ? (
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
