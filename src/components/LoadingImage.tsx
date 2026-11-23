"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type LoadingImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  /** null reserves this slot while its image URL is being resolved. */
  src: string | null;
  loadingLabel: string;
  revealBeforeHydration?: boolean;
};

// The containing surface owns the image dimensions and positioning.
export default function LoadingImage({ src, alt, loadingLabel, revealBeforeHydration = false, className, onLoad, onError, ...props }: LoadingImageProps) {
  const [result, setResult] = useState<{ src: string; failed: boolean } | null>(null);
  if (result && result.src !== src) setResult(null);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; }, []);
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    if (!image || !src) return;
    const ready = image.complete && image.naturalWidth > 0;
    // Only the initial, already painted banner should stay above its cover.
    if (revealBeforeHydration && (mounted.current || !ready)) image.dataset.covered = "";
    if (ready) setResult({ src, failed: false });
  }, [src, revealBeforeHydration]);
  const pending = !result || result.src !== src;
  const placeholder = <span className="hhwx-image-placeholder"
    role={pending ? "status" : undefined} aria-busy={pending || undefined}
    aria-label={pending ? loadingLabel : undefined} aria-hidden={!pending || undefined}
    data-failed={(!pending && result.failed) || undefined} />;

  return (
    <>
      {revealBeforeHydration && placeholder}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img
        {...props}
        key={src}
        ref={imageRef}
        src={src}
        alt={alt}
        className={cn(className, !revealBeforeHydration && pending && "opacity-0")}
        onLoad={event => {
          setResult(current => current?.src === src ? current : { src, failed: false });
          onLoad?.(event);
        }}
        onError={event => { setResult({ src, failed: true }); onError?.(event); }}
      />}
      {!revealBeforeHydration && placeholder}
    </>
  );
}
