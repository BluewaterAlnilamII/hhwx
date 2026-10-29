"use client";

import { useCallback, useState } from "react";
import { BandoriAtlasAnimationCanvas } from "@/components/bandori/BandoriAtlasAnimationCanvas";
import { useCommentStampAnimation } from "@/hooks/useCommentStamps";
import type { BandoriStampCatalogItem } from "@/lib/bandori-stamp-assets";
import { playSoundEffect } from "@/lib/sound-effect-audio";
import { cn } from "@/lib/utils";
import { buildBandoriChatStampResources } from "@/lib/bandori-builtin-resources";

const { voiceBadge } = buildBandoriChatStampResources();

export { BandoriAtlasAnimationCanvas as BandoriStampAnimationCanvas };

export const COMMENT_STAMP_SIZE = "h-16 w-24 sm:h-[76px] sm:w-[114px]";

export default function BandoriStampView({
  stamp,
  label,
  variant = "comment",
}: {
  stamp: BandoriStampCatalogItem;
  label: string;
  variant?: "comment" | "reward";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const animationSummary = stamp.animation;
  const { animation } = useCommentStampAnimation(
    stamp.region,
    stamp.id,
    animationSummary,
    Boolean(animationSummary) && !animationFailed,
  );
  const mediaClassName = cn(
    "h-full w-full object-contain",
    variant === "reward"
      ? "max-h-[74px] max-w-[111px] sm:max-h-[76px] sm:max-w-[114px]"
      : "max-h-16 max-w-24 sm:max-h-[76px] sm:max-w-[114px]",
  );
  const handleAnimationError = useCallback(() => setAnimationFailed(true), []);

  if (imageFailed) return <span>{label}</span>;

  const image = animation && !animationFailed ? (
    <BandoriAtlasAnimationCanvas
      animation={animation}
      label={label}
      onError={handleAnimationError}
      className={mediaClassName}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={stamp.imageUrl}
      alt={label}
      title={label}
      loading="lazy"
      decoding="async"
      referrerPolicy="strict-origin-when-cross-origin"
      onError={() => setImageFailed(true)}
      className={mediaClassName}
    />
  );

  const className = cn(
    "relative mx-0.5 inline-flex shrink-0 items-center justify-center align-[-1.35em]",
    variant === "reward"
      ? "h-[74px] w-[111px] sm:h-[76px] sm:w-[114px]"
      : COMMENT_STAMP_SIZE,
  );
  if (!stamp.voiceUrl) return <span className={className}>{image}</span>;

  return (
    <button
      type="button"
      onClick={() => {
        void playSoundEffect(stamp.voiceUrl);
      }}
      className={cn(
        className,
        "rounded-lg transition hover:bg-[var(--theme-color-control-background-hover)] focus:outline-hidden focus:ring-2 focus:ring-[var(--theme-color-focus-ring)]",
      )}
      aria-label={`Play ${label}`}
      title={`Play ${label}`}
    >
      {image}
      {voiceBadge ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={voiceBadge} alt="" className="pointer-events-none absolute right-0 top-0 w-[24%]" />
      ) : null}
    </button>
  );
}
