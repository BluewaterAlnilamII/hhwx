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
      draggable={false}
      onError={() => setFailed(true)}
      className={cn("pointer-events-none select-none object-contain", className)}
    />
  );
}

function getDegreeViewLayout(
  size: "default" | "comment",
): { container: string; icon: string } {
  if (size === "comment") {
    return {
      container: "h-5 w-[92px]",
      icon: "w-5",
    };
  }
  return {
    container: "h-[25px] w-[115px]",
    icon: "w-[25px]",
  };
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
  const rankImageUrl = buildBandoriPublicAssetUrl(degree.rankImage);
  const iconImageUrl = buildBandoriPublicAssetUrl(degree.iconImage);
  const layout = getDegreeViewLayout(size);
  const handleAnimationError = useCallback(() => setAnimationFailed(true), []);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex max-w-full shrink-0",
        layout.container,
        className,
      )}
    >
      <span className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {animation && !animationFailed ? (
          <BandoriAtlasAnimationCanvas
            animation={animation}
            label={label}
            active={active}
            onError={handleAnimationError}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        ) : baseImageUrl ? (
          <DegreeImage
            src={baseImageUrl}
            label={label}
            className="absolute inset-0 h-full w-full"
          />
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
        <DegreeImage
          src={rankImageUrl}
          label={label}
          className="absolute inset-0 h-full w-full"
        />
      </span>
      {/* Ranking icons include the crown-to-body connector and share the body's origin. */}
      <DegreeImage
        src={iconImageUrl}
        label={label}
        className={cn(
          "absolute left-0 top-0 z-10 h-full",
          layout.icon,
        )}
      />
    </span>
  );
}

export type BandoriDegreeViewProps = {
  degree: BandoriDegreeCatalogItem;
  active?: boolean;
  size?: "default" | "comment";
  className?: string;
};
