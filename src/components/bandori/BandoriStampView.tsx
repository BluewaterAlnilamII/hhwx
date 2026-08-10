"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { useCommentStampAnimation } from "@/hooks/useCommentStamps";
import type {
  BandoriStampAnimationResponse,
  BandoriStampCatalogItem,
} from "@/lib/bandori-stamp-assets";
import { playSoundEffect } from "@/lib/sound-effect-audio";
import { cn } from "@/lib/utils";

const stampAtlasImageCache = new Map<string, Promise<HTMLImageElement>>();

function loadStampAtlasImage(atlasUrl: string): Promise<HTMLImageElement> {
  const cachedImage = stampAtlasImageCache.get(atlasUrl);
  if (cachedImage) return cachedImage;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load stamp atlas: ${atlasUrl}`));
    image.src = atlasUrl;
  }).catch((error) => {
    stampAtlasImageCache.delete(atlasUrl);
    throw error;
  });

  stampAtlasImageCache.set(atlasUrl, promise);
  return promise;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

export function BandoriStampAnimationCanvas({
  animation,
  label,
  onError,
  active = true,
  className = "h-full max-h-16 w-full max-w-24 object-contain",
}: {
  animation: BandoriStampAnimationResponse;
  label: string;
  onError: () => void;
  active?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [frameIndex, setFrameIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const frameCount = animation.frames.length;
  const frame = animation.frames[Math.min(frameIndex, Math.max(0, frameCount - 1))];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry?.isIntersecting ?? true),
      { rootMargin: "96px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active || prefersReducedMotion || !isVisible || frameCount <= 1) return;

    const intervalMs = 1000 / Math.max(1, animation.frameRate);
    const intervalId = window.setInterval(() => {
      setFrameIndex((currentFrameIndex) => (currentFrameIndex + 1) % frameCount);
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [active, animation.frameRate, frameCount, isVisible, prefersReducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;

    let cancelled = false;
    void loadStampAtlasImage(animation.atlasUrl)
      .then((atlasImage) => {
        if (cancelled) return;
        const context = canvas.getContext("2d");
        if (!context) {
          onError();
          return;
        }

        const { x, y, width, height } = frame.cssRect;
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(atlasImage, x, y, width, height, 0, 0, width, height);
      })
      .catch(() => {
        if (!cancelled) onError();
      });

    return () => {
      cancelled = true;
    };
  }, [animation.atlasUrl, frame, onError]);

  if (!frame) return null;

  return (
    <canvas
      ref={canvasRef}
      width={frame.cssRect.width}
      height={frame.cssRect.height}
      role="img"
      aria-label={label}
      title={label}
      className={className}
    />
  );
}

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
    <BandoriStampAnimationCanvas
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
