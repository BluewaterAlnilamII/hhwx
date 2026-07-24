"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import {
  buildBandoriPublicAssetUrl,
  lookupBandoriCardImage,
} from "@/lib/bandori-public-asset-index";
import { cn } from "@/lib/utils";
import type { BandoriCardArtVariant } from "./types";

export function BandoriCardArtImage({
  cardId,
  resourceSetName,
  trainType,
  alt,
  className,
}: {
  cardId: number;
  resourceSetName: string | null | undefined;
  trainType: BandoriCardArtVariant;
  alt: string;
  className?: string;
}) {
  const { value: assetIndex } = useBandoriCardsAssetIndex();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = buildBandoriPublicAssetUrl(
    lookupBandoriCardImage(assetIndex, resourceSetName, trainType, "thumb"),
  );
  const failed = Boolean(src && failedSrc === src);

  if (!src || failed) {
    return (
      <div
        data-card-id={cardId}
        className={cn("flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400", className)}
      >
        <ImageOff className="h-5 w-5" aria-hidden="true" />
        <span className="text-[10px] font-semibold">No image</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-card-id={cardId}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("h-full w-full object-cover", className)}
      onError={() => setFailedSrc(src)}
    />
  );
}
