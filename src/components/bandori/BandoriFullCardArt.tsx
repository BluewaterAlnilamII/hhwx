"use client";

import { useMemo, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  buildBandoriCardAttributeIconUrl,
  buildBandoriCardBandIconUrl,
  buildBandoriFullCardFrameUrl,
  buildBandoriRarityStarIconUrl,
  type BandoriFullCardFrameName,
} from "@/lib/bandori-builtin-resources";
import {
  buildBandoriPublicAssetUrl,
  lookupBandoriCardImage,
  type BandoriCardAssetVariant,
  type BandoriCardsAssetIndex,
} from "@/lib/bandori-public-asset-index";
import type { BandoriCardAttribute } from "@/lib/bandori-card-filter";
import { BANDORI_FULL_CARD_LAYOUT } from "@/lib/bandori-full-card-layout";
import { cn } from "@/lib/utils";

export type BandoriFullCardArtItem = {
  variant: BandoriCardAssetVariant;
  isTrained: boolean;
  label: string;
  alt: string;
};

export type BandoriFullCardArtMetadata = {
  cardId: number;
  resourceSetName: string;
  rarity: number;
  attribute: BandoriCardAttribute | null;
  bandId: number | null;
};

const FULL_CARD_ATTRIBUTE_STYLE = {
  top: `${(BANDORI_FULL_CARD_LAYOUT.attribute.top / BANDORI_FULL_CARD_LAYOUT.surface.height) * 100}%`,
  right: `${(BANDORI_FULL_CARD_LAYOUT.attribute.right / BANDORI_FULL_CARD_LAYOUT.surface.width) * 100}%`,
  width: `${(BANDORI_FULL_CARD_LAYOUT.attribute.width / BANDORI_FULL_CARD_LAYOUT.surface.width) * 100}%`,
  height: `${(BANDORI_FULL_CARD_LAYOUT.attribute.height / BANDORI_FULL_CARD_LAYOUT.surface.height) * 100}%`,
} satisfies CSSProperties;

const FULL_CARD_ARTWORK_VIEWPORT_STYLE = {
  top: `${(BANDORI_FULL_CARD_LAYOUT.artworkViewport.top / BANDORI_FULL_CARD_LAYOUT.surface.height) * 100}%`,
  right: `${(BANDORI_FULL_CARD_LAYOUT.artworkViewport.right / BANDORI_FULL_CARD_LAYOUT.surface.width) * 100}%`,
  bottom: `${(BANDORI_FULL_CARD_LAYOUT.artworkViewport.bottom / BANDORI_FULL_CARD_LAYOUT.surface.height) * 100}%`,
  left: `${(BANDORI_FULL_CARD_LAYOUT.artworkViewport.left / BANDORI_FULL_CARD_LAYOUT.surface.width) * 100}%`,
  borderRadius: `${(BANDORI_FULL_CARD_LAYOUT.artworkViewport.radius / BANDORI_FULL_CARD_LAYOUT.surface.width) * 100}% / ${(BANDORI_FULL_CARD_LAYOUT.artworkViewport.radius / BANDORI_FULL_CARD_LAYOUT.surface.height) * 100}%`,
} satisfies CSSProperties;

const FULL_CARD_BAND_MARK_STYLE = {
  left: `${(BANDORI_FULL_CARD_LAYOUT.bandMark.left / BANDORI_FULL_CARD_LAYOUT.surface.width) * 100}%`,
  top: `${(BANDORI_FULL_CARD_LAYOUT.bandMark.top / BANDORI_FULL_CARD_LAYOUT.surface.height) * 100}%`,
  width: `${(BANDORI_FULL_CARD_LAYOUT.bandMark.width / BANDORI_FULL_CARD_LAYOUT.surface.width) * 100}%`,
  height: `${(BANDORI_FULL_CARD_LAYOUT.bandMark.height / BANDORI_FULL_CARD_LAYOUT.surface.height) * 100}%`,
} satisfies CSSProperties;

const FULL_CARD_RARITY_STAR_STYLES = Array.from({ length: 5 }, (_, index) => ({
  left: `${(BANDORI_FULL_CARD_LAYOUT.rarityStar.left / BANDORI_FULL_CARD_LAYOUT.surface.width) * 100}%`,
  bottom: `${((BANDORI_FULL_CARD_LAYOUT.rarityStar.bottom + index * BANDORI_FULL_CARD_LAYOUT.rarityStar.verticalStep) / BANDORI_FULL_CARD_LAYOUT.surface.height) * 100}%`,
  width: `${(BANDORI_FULL_CARD_LAYOUT.rarityStar.width / BANDORI_FULL_CARD_LAYOUT.surface.width) * 100}%`,
  height: `${(BANDORI_FULL_CARD_LAYOUT.rarityStar.height / BANDORI_FULL_CARD_LAYOUT.surface.height) * 100}%`,
  // The game paints each lower star over the star immediately above it.
  zIndex: 5 - index,
})) satisfies CSSProperties[];

function getFullCardFrameName(
  rarity: number,
  attribute: BandoriCardAttribute | null,
): BandoriFullCardFrameName | null {
  if (rarity <= 1) return attribute ? `frame_n_${attribute}` : null;
  if (rarity === 2) return "frame_r_silver";
  if (rarity === 3) return "frame_s_gold";
  if (rarity === 4) return "frame_ss_rainbow";
  return "frame_ur_orange";
}

function BandoriFullCardSurface({
  metadata,
  src,
  alt,
  isTrained,
  isResolving = false,
  loadingLabel,
  unavailableLabel,
  priority = false,
  className,
}: {
  metadata: BandoriFullCardArtMetadata;
  src: string | null;
  alt: string;
  isTrained: boolean;
  isResolving?: boolean;
  loadingLabel: string;
  unavailableLabel: string;
  priority?: boolean;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const rarity = Math.min(5, Math.max(1, Math.trunc(metadata.rarity)));
  const frameName = getFullCardFrameName(rarity, metadata.attribute);
  const frameUrl = frameName ? buildBandoriFullCardFrameUrl(frameName) : null;
  const attributeIconUrl = metadata.attribute
    ? buildBandoriCardAttributeIconUrl(metadata.attribute)
    : null;
  const bandIconUrl = metadata.bandId ? buildBandoriCardBandIconUrl(metadata.bandId) : null;
  const starIconUrl = buildBandoriRarityStarIconUrl(isTrained);
  const isFailed = Boolean(src && failedSrc === src);

  return (
    <div className={cn(
      "relative aspect-[127/85] w-full",
      className,
    )} data-bandori-full-card-art data-trained={isTrained ? "true" : "false"}>
      <div
        data-bandori-card-artwork-viewport
        className="absolute overflow-hidden bg-slate-100"
        style={FULL_CARD_ARTWORK_VIEWPORT_STYLE}
      >
        {src && !isFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setFailedSrc(src)}
          />
        ) : isResolving ? (
          <div
            role="status"
            aria-busy="true"
            aria-label={loadingLabel}
            className="h-full w-full animate-pulse bg-slate-100"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm font-bold text-slate-400">
            <ImageOff className="h-8 w-8" aria-hidden="true" />
            <span>{unavailableLabel}</span>
          </div>
        )}
      </div>
      {frameUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frameUrl}
          alt=""
          aria-hidden="true"
          data-bandori-card-frame="stretched"
          className="pointer-events-none absolute inset-0 h-full w-full object-fill"
        />
      ) : null}
      {bandIconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bandIconUrl}
          alt=""
          aria-hidden="true"
          data-bandori-card-overlay="band"
          className="pointer-events-none absolute object-contain"
          style={FULL_CARD_BAND_MARK_STYLE}
        />
      ) : null}
      {attributeIconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attributeIconUrl}
          alt=""
          aria-hidden="true"
          data-bandori-card-overlay="attribute"
          className="pointer-events-none absolute object-contain"
          style={FULL_CARD_ATTRIBUTE_STYLE}
        />
      ) : null}
      {starIconUrl ? Array.from({ length: rarity }, (_, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={index}
          src={starIconUrl}
          alt=""
          aria-hidden="true"
          data-bandori-card-overlay="rarity-star"
          data-rarity-star-position={index + 1}
          className="pointer-events-none absolute object-contain"
          style={FULL_CARD_RARITY_STAR_STYLES[index]}
        />
      )) : null}
    </div>
  );
}

export type BandoriFullCardArtProps = {
  metadata: BandoriFullCardArtMetadata;
  assetIndex: BandoriCardsAssetIndex | null | undefined;
  assetIndexLoading: boolean;
  item: BandoriFullCardArtItem;
  loadingLabel: string;
  unavailableLabel: string;
  onOpen: () => void;
};

export function BandoriFullCardArt({
  metadata,
  assetIndex,
  assetIndexLoading,
  item,
  loadingLabel,
  unavailableLabel,
  onOpen,
}: BandoriFullCardArtProps) {
  const src = buildBandoriPublicAssetUrl(
    lookupBandoriCardImage(
      assetIndex,
      metadata.resourceSetName,
      item.variant,
      "full",
    ),
  );

  return (
    <figure className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={item.alt}
        className="group relative block w-full rounded-[2.4%] outline-hidden focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-4"
      >
        <BandoriFullCardSurface
          metadata={metadata}
          src={src}
          alt={item.alt}
          isTrained={item.isTrained}
          isResolving={assetIndexLoading}
          loadingLabel={loadingLabel}
          unavailableLabel={unavailableLabel}
        />
        <span className="pointer-events-none absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-slate-950/55 text-white opacity-0 shadow-lg backdrop-blur-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
      <figcaption className="mt-3 text-center text-sm font-black text-[var(--theme-color-text-default)] dark:text-slate-200">
        {item.label}
      </figcaption>
    </figure>
  );
}

export type BandoriFullCardGalleryProps = {
  metadata: BandoriFullCardArtMetadata;
  assetIndex: BandoriCardsAssetIndex | null | undefined;
  assetIndexLoading?: boolean;
  items: BandoriFullCardArtItem[];
  viewerLabels: {
    close: string;
    zoomIn: string;
    zoomOut: string;
    previous: string;
    next: string;
    imageLoading: string;
    imageUnavailable: string;
  };
};

export default function BandoriFullCardGallery({
  metadata,
  assetIndex,
  assetIndexLoading = false,
  items,
  viewerLabels,
}: BandoriFullCardGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const activeItem = activeIndex === null ? null : items[activeIndex] ?? null;
  const activeSrc = useMemo(() => activeItem ? buildBandoriPublicAssetUrl(
    lookupBandoriCardImage(
      assetIndex,
      metadata.resourceSetName,
      activeItem.variant,
      "full",
    ),
  ) : null, [activeItem, assetIndex, metadata.resourceSetName]);

  const changeActiveIndex = (nextIndex: number) => {
    setActiveIndex((nextIndex + items.length) % items.length);
    setZoom(1);
  };

  return (
    <>
      <div className={cn(
        "grid gap-6",
        items.length > 1
          ? "lg:grid-cols-2"
          : "mx-auto w-full lg:max-w-[calc(50%-0.75rem)]",
      )}>
        {items.map((item, index) => (
          <BandoriFullCardArt
            key={item.variant}
            metadata={metadata}
            assetIndex={assetIndex}
            assetIndexLoading={assetIndexLoading}
            item={item}
            loadingLabel={viewerLabels.imageLoading}
            unavailableLabel={viewerLabels.imageUnavailable}
            onOpen={() => {
              setActiveIndex(index);
              setZoom(1);
            }}
          />
        ))}
      </div>

      <Dialog.Root
        open={activeIndex !== null}
        onOpenChange={(open) => {
          if (!open) setActiveIndex(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[1100] bg-slate-950/88 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-[1101] flex flex-col outline-hidden"
          >
            <Dialog.Title className="sr-only">{activeItem?.label}</Dialog.Title>
            <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 sm:px-5">
              <div className="truncate text-sm font-black text-white">{activeItem?.label}</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.5))} disabled={zoom <= 1} aria-label={viewerLabels.zoomOut} title={viewerLabels.zoomOut} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-35">
                  <ZoomOut className="h-5 w-5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.5))} disabled={zoom >= 3} aria-label={viewerLabels.zoomIn} title={viewerLabels.zoomIn} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-35">
                  <ZoomIn className="h-5 w-5" aria-hidden="true" />
                </button>
                <Dialog.Close asChild>
                  <button type="button" aria-label={viewerLabels.close} title={viewerLabels.close} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-auto p-4 sm:p-8">
              {items.length > 1 ? (
                <>
                  <button type="button" onClick={() => changeActiveIndex((activeIndex ?? 0) - 1)} aria-label={viewerLabels.previous} title={viewerLabels.previous} className="fixed left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-sm transition hover:bg-white/22 sm:left-6">
                    <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => changeActiveIndex((activeIndex ?? 0) + 1)} aria-label={viewerLabels.next} title={viewerLabels.next} className="fixed right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-sm transition hover:bg-white/22 sm:right-6">
                    <ChevronRight className="h-6 w-6" aria-hidden="true" />
                  </button>
                </>
              ) : null}
              <div className="flex min-h-full min-w-full items-center justify-center">
                {activeItem ? (
                  <div
                    style={{ width: `calc(min(90vw, 1100px) * ${zoom})` }}
                    className="mx-auto shrink-0 max-w-none"
                  >
                    <BandoriFullCardSurface
                      metadata={metadata}
                      src={activeSrc}
                      alt={activeItem.alt}
                      isTrained={activeItem.isTrained}
                      isResolving={assetIndexLoading}
                      loadingLabel={viewerLabels.imageLoading}
                      unavailableLabel={viewerLabels.imageUnavailable}
                      priority
                      className="mx-auto w-full max-w-none"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
