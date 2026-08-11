"use client";

import { useCallback, useState } from "react";
import { Volume2 } from "lucide-react";
import { BandoriAtlasAnimationCanvas } from "@/components/bandori/BandoriAtlasAnimationCanvas";
import { useCommentStampAnimation } from "@/hooks/useCommentStamps";
import type { BandoriStampCatalogItem } from "@/lib/bandori-stamp-assets";
import { playSoundEffect } from "@/lib/sound-effect-audio";
import { cn } from "@/lib/utils";

export { BandoriAtlasAnimationCanvas as BandoriStampAnimationCanvas };

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
      : "h-16 w-24 sm:h-[76px] sm:w-[114px]",
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
        "rounded-lg transition hover:bg-[var(--theme-color-control-background-hover)] focus:outline-hidden focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:hover:bg-rose-500/10 dark:focus:ring-rose-500/30",
      )}
      aria-label={`Play ${label}`}
      title={`Play ${label}`}
    >
      {image}
      <span className="absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-xs ring-2 ring-white dark:ring-slate-900">
        <Volume2 size={12} aria-hidden="true" />
      </span>
    </button>
  );
}
