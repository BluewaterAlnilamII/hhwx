"use client";

import { useCallback, useState } from "react";
import { BandoriAtlasAnimationCanvas } from "@/components/bandori/BandoriAtlasAnimationCanvas";
import type { BandoriAtlasAnimation } from "@/lib/bandori-atlas-animation";
import { buildBandoriChatStampResources } from "@/lib/bandori-builtin-resources";

const { voiceBadge } = buildBandoriChatStampResources();

export function BandoriStampArtwork({
  imageUrl, label, animation, showVoice, active = true, pauseWhenHidden = true,
  loading = "lazy", onAnimationError, onImageError,
}: {
  imageUrl: string;
  label: string;
  animation?: BandoriAtlasAnimation | null;
  showVoice: boolean;
  active?: boolean;
  pauseWhenHidden?: boolean;
  loading?: "lazy" | "eager";
  onAnimationError: () => void;
  onImageError?: () => void;
}) {
  const [mediaSize, setMediaSize] = useState({ src: "", width: 200, height: 165 });
  const source = animation?.atlasUrl ?? imageUrl;
  const dimensions = mediaSize.src === source ? mediaSize : animation?.frames[0]?.rect ?? { width: 200, height: 165 };
  const aspectRatio = dimensions.width / dimensions.height;
  const handleFrameSizeChange = useCallback((width: number, height: number) => {
    setMediaSize({ src: source, width, height });
  }, [source]);

  return (
    <span className="relative block h-full w-full [container-type:size]">
      {/* Fit the artwork and badge together; the caller's padding and letterboxing stay outside this plane. */}
      <span className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2"
        style={{ aspectRatio, width: `min(100cqw, calc(100cqh * ${aspectRatio}))` }}>
        {animation ? (
          <BandoriAtlasAnimationCanvas animation={animation} label={label} active={active}
            pauseWhenHidden={pauseWhenHidden} onError={onAnimationError} onFrameSizeChange={handleFrameSizeChange} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={label} title={label || undefined} loading={loading} decoding="async"
            referrerPolicy="strict-origin-when-cross-origin" className="block h-full w-full object-contain"
            onLoad={(event) => {
              const image = event.currentTarget;
              setMediaSize({ src: imageUrl, width: image.naturalWidth, height: image.naturalHeight });
            }}
            onError={onImageError} />
        )}
        {showVoice && voiceBadge ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={voiceBadge} alt="" className="pointer-events-none absolute bottom-0 right-0 w-[24%]" />
        ) : null}
      </span>
    </span>
  );
}
