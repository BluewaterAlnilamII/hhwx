"use client";

import { useCallback, useState } from "react";
import { BandoriAtlasAnimationCanvas } from "@/components/bandori/BandoriAtlasAnimationCanvas";
import { useBandoriDegreeAnimation } from "@/hooks/useBandoriDegrees";
import type { BandoriDegreeCatalogItem } from "@/lib/bandori-degree-assets";
import { buildBandoriPublicAssetUrl } from "@/lib/bandori-public-asset-index";
import { cn } from "@/lib/utils";

function DegreeImage({
  src,
  label,
  className,
}: {
  src: string | null;
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      title={label}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("absolute inset-0 h-full w-full object-contain", className)}
    />
  );
}

export default function BandoriDegreeView({
  degree,
  active = false,
  size = "default",
  className,
}: BandoriDegreeViewProps) {
  const [animationFailed, setAnimationFailed] = useState(false);
  const { animation } = useBandoriDegreeAnimation(
    degree.animation,
    Boolean(degree.animation) && !animationFailed,
  );
  const label = degree.degreeName || `Degree ${degree.id}`;
  const baseImageUrl = buildBandoriPublicAssetUrl(degree.baseImage);
  const handleAnimationError = useCallback(() => setAnimationFailed(true), []);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex aspect-[23/5] max-w-full shrink-0 items-center justify-center overflow-hidden",
        size === "comment" ? "w-[92px]" : "w-[115px]",
        className,
      )}
    >
      {animation && !animationFailed ? (
        <BandoriAtlasAnimationCanvas
          animation={animation}
          label={label}
          active={active}
          onError={handleAnimationError}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : baseImageUrl ? (
        <DegreeImage src={baseImageUrl} label={label} />
      ) : (
        <span className={cn(
          "text-center font-semibold text-current",
          size === "comment"
            ? "max-w-full truncate px-1 text-[9px] leading-3"
            : "line-clamp-2 px-3 text-xs leading-4",
        )}>
          {label}
        </span>
      )}
      <DegreeImage src={buildBandoriPublicAssetUrl(degree.rankImage)} label={label} />
      <DegreeImage src={buildBandoriPublicAssetUrl(degree.iconImage)} label={label} />
    </span>
  );
}

export type BandoriDegreeViewProps = {
  degree: BandoriDegreeCatalogItem;
  active?: boolean;
  size?: "default" | "comment";
  className?: string;
};
