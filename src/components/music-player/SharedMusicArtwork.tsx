"use client";

import type { ImgHTMLAttributes, ReactNode } from "react";
import { useSharedMusicArtworkUrl } from "@/hooks/useSharedMusicArtworkUrl";

interface SharedMusicArtworkProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
  fallback?: ReactNode;
}

export default function SharedMusicArtwork({
  src,
  fallback = null,
  ...imageProps
}: SharedMusicArtworkProps) {
  const resolvedUrl = useSharedMusicArtworkUrl(src);

  if (!resolvedUrl) {
    return fallback;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img {...imageProps} src={resolvedUrl} />;
}
