"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { BandoriStampArtwork } from "@/components/bandori/BandoriStampArtwork";
import { useCommentStampAnimation } from "@/hooks/useCommentStamps";
import type { BandoriStampCatalogItem } from "@/lib/bandori-stamp-assets";
import { playSoundEffect } from "@/lib/sound-effect-audio";
import { cn } from "@/lib/utils";

export { BandoriAtlasAnimationCanvas as BandoriStampAnimationCanvas } from "@/components/bandori/BandoriAtlasAnimationCanvas";

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
  const t = useTranslations("bandori.stamps");
  const [imageFailed, setImageFailed] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const animationSummary = stamp.animation;
  const { animation } = useCommentStampAnimation(
    stamp.region,
    stamp.id,
    animationSummary,
    Boolean(animationSummary) && !animationFailed,
  );
  const handleAnimationError = useCallback(() => setAnimationFailed(true), []);
  const handleImageError = useCallback(() => setImageFailed(true), []);

  if (imageFailed) return <span>{label}</span>;

  const image = <BandoriStampArtwork imageUrl={stamp.imageUrl} label={label}
    animation={!animationFailed ? animation : null} showVoice={Boolean(stamp.voiceUrl)}
    onAnimationError={handleAnimationError} onImageError={handleImageError} />;

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
        "rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]",
      )}
      aria-label={t("playVoice", { stamp: label })}
      title={t("playVoice", { stamp: label })}
    >
      {image}
    </button>
  );
}
