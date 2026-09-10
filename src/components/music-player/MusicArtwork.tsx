"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import LoadingImage from "@/components/LoadingImage";

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
  const t = useTranslations("common");

  if (failedSourceUrl === src) {
    return fallback;
  }

  // Let the browser and CDN handle request coalescing and caching while keeping
  // the durable source URL visible to the page and system media integrations.
  return (
    <span className="relative block h-full w-full overflow-hidden rounded-[inherit]">
      <LoadingImage
        {...imageProps}
        src={src}
        loadingLabel={t("states.loading")}
        onError={(event) => {
          onError?.(event);
          setFailedSourceUrl(src);
        }}
      />
    </span>
  );
}
