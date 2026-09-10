"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadingSpinner } from "@/components/LoadingIndicator";

type ImageView = { zoom: number; x: number; y: number };
type Point = { x: number; y: number };

export type BandoriImageViewerLabels = {
  close: string;
  instructions: string;
  previous: string;
  next: string;
  imageLoading: string;
};

export default function BandoriImageViewer({ src, alt, label, labels, loading = false, onClose, onPrevious, onNext }: {
  src: string | null;
  alt?: string;
  label: string;
  labels: BandoriImageViewerLabels;
  loading?: boolean;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const commonT = useTranslations("common");
  const [view, setView] = useState<ImageView>({ zoom: 1, x: 0, y: 0 });
  const [imageSize, setImageSize] = useState<{ src: string; width: number; height: number } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const currentSize = imageSize?.src === src ? imageSize : null;
  const imageLoading = src ? failedSrc !== src && !currentSize : loading;
  const imageWidth = currentSize
    ? `min(${currentSize.width}px, 90vw, calc((100dvh - 8rem) * ${currentSize.width / currentSize.height}))`
    : "auto";
  const returnFocus = useRef<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const viewRef = useRef(view);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);
  const updateView = useCallback((value: ImageView) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    const zoom = Math.min(3, Math.max(1, value.zoom));
    const style = image ? getComputedStyle(image) : null;
    const limitX = viewport && style ? Math.max(0, (parseFloat(style.width) * zoom - viewport.clientWidth) / 2) : 0;
    const limitY = viewport && style ? Math.max(0, (parseFloat(style.height) * zoom - viewport.clientHeight) / 2) : 0;
    const next = { zoom, x: Math.max(-limitX, Math.min(limitX, value.x)), y: Math.max(-limitY, Math.min(limitY, value.y)) };
    const previous = viewRef.current;
    if (next.zoom === previous.zoom && next.x === previous.x && next.y === previous.y) return;
    viewRef.current = next;
    setView(next);
  }, []);
  const bindImage = useCallback((image: HTMLImageElement | null) => {
    imageRef.current = image;
    if (!image) return;
    setImageSize(src && image.complete && image.naturalWidth > 0
      ? { src, width: image.naturalWidth, height: image.naturalHeight }
      : null);
    const resize = new ResizeObserver(() => updateView(viewRef.current));
    resize.observe(image);
    return () => {
      resize.disconnect();
      imageRef.current = null;
    };
  }, [src, updateView]);
  const zoomAt = useCallback((zoom: number, from?: Point, to = from, previous = viewRef.current) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = from ? from.x - rect.left - rect.width / 2 : 0;
    const y = from ? from.y - rect.top - rect.height / 2 : 0;
    const ratio = Math.min(3, Math.max(1, zoom)) / previous.zoom;
    // Keep the same image point under the cursor or moving pinch midpoint.
    updateView({
      zoom,
      x: x - (x - previous.x) * ratio + (from && to ? to.x - from.x : 0),
      y: y - (y - previous.y) * ratio + (from && to ? to.y - from.y : 0),
    });
  }, [updateView]);
  const bindGestures = useCallback((viewport: HTMLDivElement | null) => {
    if (!viewport) return;
    viewportRef.current = viewport;
    const pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
    let pinch: { distance: number; center: Point; view: ImageView } | null = null;
    let suppressClick = false;
    const isControl = (event: Event) => event.target instanceof Element && !!event.target.closest("button");
    const gesture = () => {
      const [a, b] = [...pointers.values()];
      return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      if (!pointers.size && !isControl(event)) {
        zoomAt(viewRef.current.zoom * Math.exp(-event.deltaY * unit * 0.0015), { x: event.clientX, y: event.clientY });
      }
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isControl(event)) return;
      if (pointers.size === 0) suppressClick = false;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
      viewport.setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        pinch = { ...gesture(), view: viewRef.current };
        suppressClick = true;
      }
    };
    const pointerMove = (event: PointerEvent) => {
      const point = pointers.get(event.pointerId);
      if (!point) return;
      const dx = event.clientX - point.x;
      const dy = event.clientY - point.y;
      point.x = event.clientX;
      point.y = event.clientY;
      if (Math.hypot(point.x - point.startX, point.y - point.startY) > 5) suppressClick = true;
      if (pointers.size >= 2 && pinch) {
        const current = gesture();
        const zoom = pinch.view.zoom * current.distance / pinch.distance;
        zoomAt(zoom, pinch.center, current.center, pinch.view);
        if (zoom <= 1 || zoom >= 3) pinch = { ...current, view: viewRef.current };
      } else if (suppressClick) {
        const current = viewRef.current;
        updateView({ ...current, x: current.x + dx, y: current.y + dy });
      }
    };
    const pointerEnd = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
      if (event.type !== "pointerup") suppressClick = true;
      pinch = pointers.size >= 2 ? { ...gesture(), view: viewRef.current } : null;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick && !isControl(event)) closeRef.current();
    };
    const resize = new ResizeObserver(() => updateView(viewRef.current));
    resize.observe(viewport);
    // Native non-passive wheel handling prevents page zoom/scroll while viewing an image.
    viewport.addEventListener("wheel", wheel, { passive: false });
    viewport.addEventListener("pointerdown", pointerDown);
    viewport.addEventListener("pointermove", pointerMove);
    viewport.addEventListener("pointerup", pointerEnd);
    viewport.addEventListener("pointercancel", pointerEnd);
    viewport.addEventListener("lostpointercapture", pointerEnd);
    viewport.addEventListener("click", click);
    return () => {
      resize.disconnect();
      viewportRef.current = null;
      viewport.removeEventListener("wheel", wheel);
      viewport.removeEventListener("pointerdown", pointerDown);
      viewport.removeEventListener("pointermove", pointerMove);
      viewport.removeEventListener("pointerup", pointerEnd);
      viewport.removeEventListener("pointercancel", pointerEnd);
      viewport.removeEventListener("lostpointercapture", pointerEnd);
      viewport.removeEventListener("click", click);
    };
  }, [updateView, zoomAt]);
  const changeImage = (change?: () => void) => {
    if (change) {
      change();
      updateView({ zoom: 1, x: 0, y: 0 });
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1100] bg-slate-950/88 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-0 z-[1101] flex flex-col outline-hidden"
          onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus();
            }
          }}
          onKeyDown={(event) => {
            const dx = event.key === "ArrowLeft" ? 80 : event.key === "ArrowRight" ? -80 : 0;
            const dy = event.key === "ArrowUp" ? 80 : event.key === "ArrowDown" ? -80 : 0;
            if (event.shiftKey && (dx || dy)) {
              event.preventDefault();
              const current = viewRef.current;
              updateView({ ...current, x: current.x + dx, y: current.y + dy });
              return;
            }
            if (event.key === "ArrowLeft" && onPrevious) { event.preventDefault(); changeImage(onPrevious); }
            if (event.key === "ArrowRight" && onNext) { event.preventDefault(); changeImage(onNext); }
            if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomAt(viewRef.current.zoom + 0.5); }
            if (event.key === "-" || event.key === "_") { event.preventDefault(); zoomAt(viewRef.current.zoom - 0.5); }
          }}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Dialog.Description className="sr-only">{labels.instructions}</Dialog.Description>
          <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 sm:px-5">
            <div className="truncate text-sm font-black text-white">{label}</div>
            <Dialog.Close asChild>
              <button type="button" aria-label={labels.close} title={labels.close} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <div ref={bindGestures} className="relative min-h-0 flex-1 touch-none overflow-hidden overscroll-contain select-none">
            {onPrevious ? (
              <button type="button" onClick={() => changeImage(onPrevious)} aria-label={labels.previous} title={labels.previous} className="fixed left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-sm transition hover:bg-white/22 sm:left-6">
                <ChevronLeft className="h-6 w-6" aria-hidden="true" />
              </button>
            ) : null}
            {onNext ? (
              <button type="button" onClick={() => changeImage(onNext)} aria-label={labels.next} title={labels.next} className="fixed right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-sm transition hover:bg-white/22 sm:right-6">
                <ChevronRight className="h-6 w-6" aria-hidden="true" />
              </button>
            ) : null}
            <div className="flex h-full w-full items-center justify-center">
              {src && failedSrc !== src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={bindImage}
                  key={src}
                  src={src}
                  alt={alt ?? label}
                  decoding="async"
                  draggable={false}
                  className={`block h-auto origin-center shrink-0 ${view.zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-out"}`}
                  style={{
                    opacity: currentSize ? 1 : 0,
                    width: imageWidth,
                    maxWidth: currentSize ? "none" : "90vw",
                    maxHeight: currentSize ? "none" : "calc(100dvh - 8rem)",
                    transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                  }}
                  onLoad={(event) => {
                    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                    if (width > 0 && height > 0) setImageSize({ src, width, height });
                  }}
                  onError={() => setFailedSrc(src)}
                />
              ) : !imageLoading ? (
                <div className="m-auto flex flex-col items-center gap-2 text-center text-sm text-white">
                  <ImageOff className="h-8 w-8" aria-hidden="true" />
                  <span>{commonT("states.imageUnavailable")}</span>
                </div>
              ) : null}
            </div>
            {imageLoading ? (
              <div role="status" aria-busy="true" aria-label={commonT("states.loading")} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <LoadingSpinner className="h-10 w-10 border-4" />
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
