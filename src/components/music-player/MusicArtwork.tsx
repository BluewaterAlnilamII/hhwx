"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

interface MusicArtworkProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
  fallback?: ReactNode;
}

export default function MusicArtwork({
  src,
  fallback = null,
  onError,
  ...imageProps
}: MusicArtworkProps) {
  const [failedSourceUrl, setFailedSourceUrl] = useState<string | null>(null);

  if (failedSourceUrl === src) {
    return fallback;
  }

  // Let the browser and CDN handle request coalescing and caching while keeping
  // the durable source URL visible to the page and system media integrations.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      {...imageProps}
      src={src}
      onError={(event) => {
        onError?.(event);
        setFailedSourceUrl(src);
      }}
    />
  );
}
