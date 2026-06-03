"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import {
  buildBandoriCardThumbnailPublicUrl,
  buildBandoriResIconPublicUrl,
  buildBandoriResImagePublicUrl,
  type BandoriAssetRegion,
} from "@/lib/bandori-asset-proxy";
import { cn } from "@/lib/utils";

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
};

function isKnownAttribute(value: string | undefined): value is CardAttribute {
  return value === "powerful" || value === "pure" || value === "cool" || value === "happy";
}

function getCardTrainType(card: BandoriCardThumbnailCard): TrainType {
  return card.hasTrainedArt || card.isTrained ? "after_training" : "normal";
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
  fallbackLabel = "无资源",
  loading = "lazy",
}: {
  src: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  loading?: "eager" | "lazy";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src && failedSrc === src);

  if (!src || failed) {
    return <BrokenImageFallback label={fallbackLabel} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={loading}
      className={className}
      onError={() => setFailedSrc(src)}
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
}: {
  card: BandoriCardThumbnailCard;
  metadata?: BandoriCardThumbnailMetadata;
  bandId: number | null;
  region: BandoriAssetRegion;
  alt: string;
  size?: "tile" | "preview";
  loading?: "eager" | "lazy";
}) {
  const trainType = getCardTrainType(card);
  const thumbnailUrl = metadata?.resourceSetName
    ? buildBandoriCardThumbnailPublicUrl(region, card.cardId, metadata.resourceSetName, trainType)
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
  const isPreview = size === "preview";

  return (
    <div className="relative h-full w-full rounded-[5px] bg-white">
      <div className="absolute inset-0">
        <div className="h-full w-full overflow-hidden rounded-[5px]">
          <CardAssetImage src={thumbnailUrl} alt={alt} loading={loading} className="h-full w-full object-cover" fallbackLabel={isPreview ? "缩略图" : "无图"} />
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {frameUrl ? <img src={frameUrl} alt="" aria-hidden="true" loading={loading} className="pointer-events-none absolute inset-0 h-full w-full object-fill" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {bandIconUrl ? <img src={bandIconUrl} alt="" aria-hidden="true" loading={loading} className={cn("pointer-events-none absolute left-0 top-0", isPreview ? "h-[31px] w-[31px]" : "h-[21px] w-[21px]")} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {attributeIconUrl ? <img src={attributeIconUrl} alt="" aria-hidden="true" loading={loading} className={cn("pointer-events-none absolute right-[0.8%]", isPreview ? "top-[1.6px] h-[28.4px] w-[28.4px]" : "top-[0.8px] h-[19.4px] w-[19.4px]")} /> : null}
      <div className={cn("pointer-events-none absolute z-10 flex flex-col-reverse items-start gap-0", isPreview ? "bottom-[2px] left-[3px]" : "bottom-0 left-[2px]")}>
        {starSlots.map((slot) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={slot}
            src={starIconUrl}
            alt=""
            aria-hidden="true"
            loading={loading}
            className={cn("object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]", isPreview ? "-mt-[3.5px] h-[19px] w-[20px]" : "-mt-[2.5px] h-[13px] w-[14px]")}
          />
        ))}
      </div>
      {card.masterRank > 0 ? (
        <div className={cn("pointer-events-none absolute z-30 drop-shadow-[0_1px_2px_rgba(15,23,42,0.55)]", isPreview ? "right-[-4px] top-[30px] h-[31px] w-[31px]" : "right-[-4px] top-[20px] h-[21px] w-[21px]")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={masterIconUrl} alt="" aria-hidden="true" loading={loading} className="h-full w-full object-contain" />
          <span className={cn("absolute inset-0 flex items-center justify-center font-black leading-none text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.68)]", isPreview ? "pb-[2px] text-sm" : "pb-[1px] text-[10px]")}>
            {card.masterRank}
          </span>
        </div>
      ) : null}
      {card.skillLevel > 1 ? (
        <div className={cn("pointer-events-none absolute z-10 flex items-center justify-center rounded-[3px] border border-white/80 bg-rose-500 font-black leading-none text-white shadow-[0_1px_2px_rgba(15,23,42,0.5)] [text-shadow:0_1px_1px_rgba(0,0,0,0.55)]", isPreview ? "right-[-1px] top-[61px] h-[22px] min-w-[31px] px-1 text-sm" : "right-[-1px] top-[41px] h-[15px] min-w-[21px] px-[3px] text-[10px]")}>
          {card.skillLevel}
        </div>
      ) : null}
      <div
        className={cn("pointer-events-none absolute right-[2px] z-10", isPreview ? "bottom-[3px] h-[22px] w-[70px]" : "bottom-[2px] h-[15px] w-[48px]")}
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.42)",
          clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%)",
        }}
        aria-hidden="true"
      />
      <div className={cn("pointer-events-none absolute z-20 flex items-center justify-end font-semibold leading-none text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.72)]", isPreview ? "bottom-[5px] right-[6px] h-[17px] text-sm" : "bottom-[3px] right-[4px] h-[12px] text-[10px]")}>
        <span>Lv.{card.level}</span>
      </div>
    </div>
  );
}
