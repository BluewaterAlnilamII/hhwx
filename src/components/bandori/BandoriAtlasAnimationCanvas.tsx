"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getBandoriAtlasFrameIndex,
  type BandoriAtlasAnimation,
  type BandoriAtlasAnimationFrame,
} from "@/lib/bandori-atlas-animation";

const atlasImageCache = new Map<string, Promise<HTMLImageElement>>();
const pageVisibilitySubscribers = new Set<() => void>();
const reducedMotionSubscribers = new Set<() => void>();
let reducedMotionQuery: MediaQueryList | null = null;

function loadAtlasImage(atlasUrl: string): Promise<HTMLImageElement> {
  const cachedImage = atlasImageCache.get(atlasUrl);
  if (cachedImage) return cachedImage;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load Bandori atlas: ${atlasUrl}`));
    image.src = atlasUrl;
  }).catch((error) => {
    atlasImageCache.delete(atlasUrl);
    throw error;
  });

  atlasImageCache.set(atlasUrl, promise);
  return promise;
}

function subscribePageVisibility(callback: () => void): () => void {
  pageVisibilitySubscribers.add(callback);
  if (pageVisibilitySubscribers.size === 1) {
    document.addEventListener("visibilitychange", notifyPageVisibilitySubscribers);
  }
  return () => {
    pageVisibilitySubscribers.delete(callback);
    if (pageVisibilitySubscribers.size === 0) {
      document.removeEventListener("visibilitychange", notifyPageVisibilitySubscribers);
    }
  };
}

function notifyPageVisibilitySubscribers(): void {
  pageVisibilitySubscribers.forEach((callback) => callback());
}

function getPageVisibilitySnapshot(): boolean {
  return document.visibilityState !== "hidden";
}

function getServerPageVisibilitySnapshot(): boolean {
  return true;
}

function getReducedMotionQuery(): MediaQueryList {
  reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotionQuery;
}

function subscribeReducedMotion(callback: () => void): () => void {
  reducedMotionSubscribers.add(callback);
  if (reducedMotionSubscribers.size === 1) {
    getReducedMotionQuery().addEventListener("change", notifyReducedMotionSubscribers);
  }
  return () => {
    reducedMotionSubscribers.delete(callback);
    if (reducedMotionSubscribers.size === 0 && reducedMotionQuery) {
      reducedMotionQuery.removeEventListener("change", notifyReducedMotionSubscribers);
    }
  };
}

function notifyReducedMotionSubscribers(): void {
  reducedMotionSubscribers.forEach((callback) => callback());
}

function getReducedMotionSnapshot(): boolean {
  return getReducedMotionQuery().matches;
}

function getServerReducedMotionSnapshot(): boolean {
  return false;
}

function drawAtlasFrame(
  canvas: HTMLCanvasElement,
  atlasImage: HTMLImageElement,
  frame: BandoriAtlasAnimationFrame,
): boolean {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const { x, y, width, height } = frame.rect;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.drawImage(atlasImage, x, y, width, height, 0, 0, width, height);
  return true;
}

export type BandoriAtlasAnimationCanvasProps = {
  animation: BandoriAtlasAnimation;
  label: string;
  onError: () => void;
  active?: boolean;
  className?: string;
};

export function BandoriAtlasAnimationCanvas({
  animation,
  label,
  onError,
  active = true,
  className = "h-full w-full object-contain",
}: BandoriAtlasAnimationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsedMsRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const drawnFrameIndexRef = useRef(-1);
  const onErrorRef = useRef(onError);
  const [isIntersecting, setIsIntersecting] = useState(true);
  const isPageVisible = useSyncExternalStore(
    subscribePageVisibility,
    getPageVisibilitySnapshot,
    getServerPageVisibilitySnapshot,
  );
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  );
  const firstFrame = animation.frames[0];

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry?.isIntersecting ?? true),
      { rootMargin: "96px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    elapsedMsRef.current = 0;
    lastFrameTimeRef.current = null;
    drawnFrameIndexRef.current = -1;
  }, [animation.atlasUrl, animation.frameRate, animation.frames, animation.loop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !firstFrame) return;
    const frames = animation.frames;
    const shouldAnimate = (
      active
      && isIntersecting
      && isPageVisible
      && !prefersReducedMotion
      && frames.length > 1
    );
    let cancelled = false;
    let animationFrameId: number | null = null;

    void loadAtlasImage(animation.atlasUrl)
      .then((atlasImage) => {
        if (cancelled) return;

        const drawFrameAtIndex = (frameIndex: number) => {
          if (drawnFrameIndexRef.current === frameIndex) return true;
          const frame = frames[frameIndex];
          if (!frame || !drawAtlasFrame(canvas, atlasImage, frame)) return false;
          drawnFrameIndexRef.current = frameIndex;
          return true;
        };
        const initialFrameIndex = prefersReducedMotion
          ? 0
          : getBandoriAtlasFrameIndex(
              elapsedMsRef.current,
              animation.frameRate,
              frames.length,
              animation.loop,
            );
        if (!drawFrameAtIndex(initialFrameIndex)) {
          onErrorRef.current();
          return;
        }
        if (!shouldAnimate) return;

        const animate = (timestamp: number) => {
          if (cancelled) return;
          const previousTimestamp = lastFrameTimeRef.current;
          lastFrameTimeRef.current = timestamp;
          if (previousTimestamp !== null) {
            elapsedMsRef.current += Math.max(0, timestamp - previousTimestamp);
          }
          const frameIndex = getBandoriAtlasFrameIndex(
            elapsedMsRef.current,
            animation.frameRate,
            frames.length,
            animation.loop,
          );
          if (!drawFrameAtIndex(frameIndex)) {
            onErrorRef.current();
            return;
          }
          if (!animation.loop && frameIndex === frames.length - 1) return;
          animationFrameId = window.requestAnimationFrame(animate);
        };
        animationFrameId = window.requestAnimationFrame(animate);
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current();
      });

    return () => {
      cancelled = true;
      lastFrameTimeRef.current = null;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    active,
    animation.atlasUrl,
    animation.frameRate,
    animation.frames,
    animation.loop,
    firstFrame,
    isIntersecting,
    isPageVisible,
    prefersReducedMotion,
  ]);

  if (!firstFrame) return null;

  return (
    <canvas
      ref={canvasRef}
      width={firstFrame.rect.width}
      height={firstFrame.rect.height}
      role="img"
      aria-label={label}
      title={label}
      className={className}
    />
  );
}
