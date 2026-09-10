"use client";

import { useCallback, useState, type ImgHTMLAttributes } from "react";
import LoadingPlaceholder from "@/components/LoadingPlaceholder";
import { cn } from "@/lib/utils";

type LoadingImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  src: string;
  loadingLabel: string;
};

// The containing surface owns the image dimensions and positioning.
export default function LoadingImage({ src, alt, loadingLabel, className, onLoad, ...props }: LoadingImageProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) setLoadedSrc(src);
  }, [src]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...props}
        key={src}
        ref={imageRef}
        src={src}
        alt={alt}
        className={cn(className, loadedSrc !== src && "opacity-0")}
        onLoad={(event) => { setLoadedSrc(src); onLoad?.(event); }}
      />
      {loadedSrc !== src ? <LoadingPlaceholder label={loadingLabel} className="pointer-events-none absolute inset-0 rounded-[inherit]" /> : null}
    </>
  );
}
