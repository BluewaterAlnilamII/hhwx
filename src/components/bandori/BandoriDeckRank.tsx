"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImageOff } from "lucide-react";
import LoadingImage from "@/components/LoadingImage";
import { getBandoriDeckRankLayout } from "@/lib/bandori/deck-rank-layout";
import { cn } from "@/lib/utils";

export default function BandoriDeckRank({ rank, level = null, size = 28, className }: {
  rank: string;
  level?: number | null;
  size?: number;
  className?: string;
}) {
  const common = useTranslations("common");
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const sprites = getBandoriDeckRankLayout(rank, level);
  const label = rank === "hyphen" ? "—" : `${rank.toUpperCase()}${level && level > 0 ? level : ""}`;
  const unavailable = sprites?.some(({ src }) => !src || src === failedSrc);

  return <span role="img" aria-label={unavailable ? `${label} · ${common("states.imageUnavailable")}` : label} className={cn("relative inline-flex shrink-0 items-center justify-center overflow-visible align-middle", className)} style={{ width: size, height: size }}>
    {!sprites ? label : unavailable ? <ImageOff className="h-5 w-5 text-[var(--theme-color-text-muted)]" aria-hidden="true" /> : sprites.map((sprite, index) => (
      <span key={index} className="pointer-events-none absolute" style={{ left: `${sprite.x * 2}%`, top: `${sprite.y * 2}%`, width: `${sprite.width * 2}%`, height: `${sprite.height * 2}%` }}>
        <LoadingImage src={sprite.src!} alt="" loadingLabel={common("states.loading")} loading="lazy" decoding="async" className="h-full w-full max-w-none object-fill" onError={() => setFailedSrc(sprite.src)} />
      </span>
    ))}
  </span>;
}
