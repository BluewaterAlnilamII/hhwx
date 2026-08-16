"use client";

import { useCallback, useState } from "react";
import { BandoriAtlasAnimationCanvas } from "@/components/bandori/BandoriAtlasAnimationCanvas";
import {
  useBandoriDegreeAnimation,
  useBandoriDegreeEffect,
} from "@/hooks/useBandoriDegrees";
import type { BandoriDegreeCatalogItem } from "@/lib/bandori-degree-assets";
import { buildBandoriPublicAssetUrl } from "@/lib/bandori-public-asset-index";
import { cn } from "@/lib/utils";

function DegreeImage({
  src,
  label,
  className,
  isDecorativeOverlay = false,
}: {
  src: string | null;
  label: string;
  className?: string;
  isDecorativeOverlay?: boolean;
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
      draggable={isDecorativeOverlay ? false : undefined}
      onError={() => setFailed(true)}
      className={cn(
        "object-contain",
        isDecorativeOverlay && "pointer-events-none select-none",
        className,
      )}
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
  degreeEffectId = null,
  size = "default",
  className,
}: BandoriDegreeViewProps) {
  const [animationFailed, setAnimationFailed] = useState(false);
  const [failedEffectId, setFailedEffectId] = useState<number | null>(null);
  const { animation } = useBandoriDegreeAnimation(
    degree.animation,
    Boolean(degree.animation) && !animationFailed,
  );
  const selectedEffect = degree.degreeEffect?.biliDegreeEffectId === degreeEffectId
    ? degree.degreeEffect
    : undefined;
  const effectFailed = selectedEffect?.biliDegreeEffectId === failedEffectId;
  const { effect } = useBandoriDegreeEffect(
    selectedEffect,
    Boolean(selectedEffect?.animation) && !effectFailed,
  );
  const degreeLabel = degree.degreeName || `Degree ${degree.id}`;
  const description = selectedEffect?.description || degree.description;
  const label = description ? `${degreeLabel} · ${description}` : degreeLabel;
  const baseImageUrl = buildBandoriPublicAssetUrl(degree.baseImage);
  const rankImageUrl = buildBandoriPublicAssetUrl(degree.rankImage);
  const iconImageUrl = buildBandoriPublicAssetUrl(degree.iconImage);
  const layout = getDegreeViewLayout(size);
  const handleAnimationError = useCallback(() => setAnimationFailed(true), []);
  const handleEffectError = useCallback(
    () => setFailedEffectId(selectedEffect?.biliDegreeEffectId ?? null),
    [selectedEffect?.biliDegreeEffectId],
  );

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-degree-effect-id={selectedEffect?.biliDegreeEffectId}
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
            className="absolute inset-0 h-full w-full object-contain"
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
        {/* Effect atlases are overlays; context-menu targeting belongs to the base Degree. */}
        {effect && !effectFailed ? (
          <BandoriAtlasAnimationCanvas
            animation={effect}
            label={label}
            active={active}
            onError={handleEffectError}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        ) : null}
        <DegreeImage
          src={rankImageUrl}
          label={label}
          isDecorativeOverlay
          className="absolute inset-0 h-full w-full"
        />
      </span>
      {/* Ranking icons include the crown-to-body connector and share the body's origin. */}
      <DegreeImage
        src={iconImageUrl}
        label={label}
        isDecorativeOverlay
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
  degreeEffectId?: number | null;
  size?: "default" | "comment";
  className?: string;
};
