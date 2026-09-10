"use client";

import { useState, type ReactNode } from "react";
import LoadingImage from "@/components/LoadingImage";
import LoadingPlaceholder from "@/components/LoadingPlaceholder";
import { ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import {
  buildBandoriPublicAssetUrl,
  lookupBandoriCardImage,
  type BandoriCardAssetVariant,
} from "@/lib/bandori-public-asset-index";
import { cn } from "@/lib/utils";

export type BandoriCardArtImageProps = {
  cardId: number;
  resourceSetName: string | null | undefined;
  trainType: BandoriCardAssetVariant;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fallback?: ReactNode;
};

export function BandoriCardArtImage({
  cardId,
  resourceSetName,
  trainType,
  alt,
  className,
  loading = "lazy",
  fallback,
}: BandoriCardArtImageProps) {
  const t = useTranslations("bandori.cards.common");
  const commonT = useTranslations("common");
  const { value: assetIndex, loading: indexLoading } = useBandoriCardsAssetIndex();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = buildBandoriPublicAssetUrl(
    lookupBandoriCardImage(assetIndex, resourceSetName, trainType, "thumb"),
  );
  const failed = Boolean(src && failedSrc === src);

  if (!src && indexLoading) {
    return (
      <LoadingPlaceholder label={t("imageLoading")} className={cn("h-full w-full", className)} />
    );
  }

  if (!src || failed) {
    return (
      <div
        data-card-id={cardId}
        role="img"
        aria-label={commonT("states.imageUnavailable")}
        className={cn("flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)]", className)}
      >
        {fallback ?? <><ImageOff className="h-5 w-5" aria-hidden="true" /><span className="text-[10px] font-semibold">{commonT("states.imageUnavailable")}</span></>}
      </div>
    );
  }

  return (
    <div data-card-id={cardId} className={cn("relative h-full w-full", className)}>
      <LoadingImage
        src={src}
        alt={alt}
        loadingLabel={t("imageLoading")}
        loading={loading}
        decoding="async"
        className={cn("h-full w-full object-cover", className)}
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}
