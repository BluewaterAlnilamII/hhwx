"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import LoadingImage from "@/components/LoadingImage";

export function ChatImageContent({ src, width, height, compact = false, onOpen }: {
  src: string; width: number; height: number; compact?: boolean; onOpen?(): void;
}) {
  const t = useTranslations("chat"), common = useTranslations("common");
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width: `min(${compact ? 128 : 320}px, ${width}px, calc(min(${compact ? 96 : 360}px, 50dvh) * ${width / height}))`,
    aspectRatio: `${width} / ${height}` };
  const content = failed === src
    ? <span className="absolute inset-0 flex items-center justify-center bg-[var(--theme-color-control-background)] p-2 text-center text-xs text-[var(--theme-color-text-muted)]">{common("states.imageUnavailable")}</span>
    : <LoadingImage src={src} width={width} height={height} alt={t("image")} loadingLabel={t("loading")}
      crossOrigin="anonymous" loading="lazy" decoding="async" draggable={false} className="block h-full w-full select-none object-contain [-webkit-touch-callout:none]"
      onError={() => setFailed(src)} />;
  const className = "relative block max-w-full shrink-0 select-none overflow-hidden rounded-xl [-webkit-touch-callout:none]";
  return onOpen ? <button type="button" className={className} style={style} onClick={onOpen} aria-label={t("openImage")}>{content}</button>
    : <div className={className} style={style}>{content}</div>;
}
