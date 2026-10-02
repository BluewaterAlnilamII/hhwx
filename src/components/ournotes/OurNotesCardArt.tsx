"use client";

import { useId, useState } from "react";
import { ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import LoadingImage from "@/components/LoadingImage";
import type { OurNotesCardKind, OurNotesCardSummary } from "@/lib/ournotes/cards/api-contract";
import { ourNotesAttributeIcon, ourNotesSpriteUrl } from "@/lib/ournotes/cards/assets";
import { ourNotesFrameColors } from "@/lib/ournotes/cards/frame";

// Native sliced sprites and prefab dimensions: documents/ournotes-cards.md.
function slicedSprite(name: string, size: number, borders: [number, number, number, number], width: number, height: number) {
  const [left, top, right, bottom] = borders;
  const sx = [0, left, size - right, size], sy = [0, top, size - bottom, size];
  const dx = [0, left, width - right, width], dy = [0, top, height - bottom, height];
  return [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => (
    <svg key={`${x}-${y}`} x={dx[x]} y={dy[y]} width={dx[x + 1] - dx[x]} height={dy[y + 1] - dy[y]}
      viewBox={`${sx[x]} ${sy[y]} ${Math.max(1, sx[x + 1] - sx[x])} ${Math.max(1, sy[y + 1] - sy[y])}`} preserveAspectRatio="none">
      <image href={ourNotesSpriteUrl(name)} width={size} height={size} />
    </svg>
  )));
}

export default function OurNotesCardArt({ kind, card, src, alt, className = "", eager = false, framed = true }: {
  kind: OurNotesCardKind; card: OurNotesCardSummary; src: string | null; alt: string; className?: string; eager?: boolean; framed?: boolean;
}) {
  const t = useTranslations("ournotes.cards");
  const id = useId().replace(/:/gu, "");
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [width, height] = kind === "member" ? [224, 294] : [326, 184];
  const attribute = ourNotesAttributeIcon(card.cardType);
  const colors = framed ? ourNotesFrameColors(kind, card.rarity) : [];
  return (
    <div className={`relative shrink-0 ${className}`} style={{ aspectRatio: framed ? `${width}/${height}` : kind === "member" ? "3/4" : "16/9" }}>
      {framed ? <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          {colors.map(({ points, gradients }, face) => <g key={face}>
            {points ? <clipPath id={`${id}-face-${face}`}><polygon points={points.map((p) => p.join(",")).join(" ")} shapeRendering="crispEdges" /></clipPath> : null}
            {gradients.map(({ from, to, stops }, channel) => (
              <linearGradient key={channel} id={`${id}-color-${face}-${channel}`} gradientUnits="userSpaceOnUse" colorInterpolation="sRGB" x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}>
                {stops.map(([offset, color], index) => <stop key={index} offset={offset} stopColor={`rgb(${color.join(" ")})`} />)}
              </linearGradient>
            ))}
          </g>)}
          <mask id={`${id}-shape`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{ maskType: "alpha" }}>
            {slicedSprite("FrameSquare_6px", 18, [9, 9, 9, 9], width, height)}
          </mask>
        </defs>
        {slicedSprite("FrameMemberThumShadow_9slice", 96, [46, 35, 46, 58], width, height)}
        {slicedSprite("FormationSupportCardOutline", 26, [13, 13, 13, 13], width, height)}
        <g mask={`url(#${id}-shape)`}>
          {colors.map(({ points, gradients }, face) => (
            <g key={face} clipPath={points ? `url(#${id}-face-${face})` : undefined} style={{ isolation: "isolate" }}>
              {gradients.map((_, channel) => <rect key={channel} width={width} height={height} fill={`url(#${id}-color-${face}-${channel})`} style={{ mixBlendMode: channel ? "screen" : "normal" }} />)}
            </g>
          ))}
        </g>
      </svg> : null}
      <div className="absolute overflow-hidden bg-[var(--theme-color-panel-background)]" style={{ inset: framed ? `${600 / height}% ${600 / width}%` : 0 }}>
        {src && failedSrc !== src ? <LoadingImage src={src} alt={alt} loadingLabel={t("states.imageLoading")} loading={eager ? "eager" : "lazy"}
          decoding="async" className={`h-full w-full ${!framed ? "object-contain" : kind === "member" ? "object-fill" : "object-cover"}`} onError={() => setFailedSrc(src)} />
          : <span role="img" aria-label={t("states.imageUnavailable")} className="flex h-full w-full items-center justify-center text-[var(--theme-color-text-muted)]"><ImageOff className="h-5 w-5" aria-hidden="true" /></span>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {framed && attribute ? <img src={attribute} alt="" aria-hidden="true" className="pointer-events-none absolute" style={{ width: `${5000 / width}%`, left: `${-900 / width}%`, top: `${-700 / height}%` }} /> : null}
    </div>
  );
}
