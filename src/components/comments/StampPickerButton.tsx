"use client";

import type { CSSProperties, ReactNode } from "react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Grid2X2, MoreHorizontal, Star, Sticker } from "lucide-react";
import LoadingIndicator from "@/components/LoadingIndicator";
import { useTranslations } from "next-intl";
import { BandoriStampArtwork } from "@/components/bandori/BandoriStampArtwork";
import {
  useCommentStampAnimation,
  useCommentStampsForRegion,
} from "@/hooks/useCommentStamps";
import {
  COMMENT_STAMP_REGION_LABELS,
  COMMENT_STAMP_REGIONS,
  type CommentStamp,
} from "@/lib/comments/stamps";
import { cn } from "@/lib/utils";
import { buildStampShortcode } from "@/lib/comments/comment-content";
import { getCommentPopoverHorizontalPosition } from "@/lib/comments/comment-popover-position";
import { buildBandoriCardBandIconUrl } from "@/lib/bandori-builtin-resources";
import { BANDORI_CHARACTER_GROUPS } from "@/lib/bandori-character-groups";
import { selectStampPickerItems, STAMP_FAVORITES_STORAGE_KEY, useStampPickerStore } from "@/store/useStampPickerStore";

type StampPickerButtonProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (stamp: CommentStamp) => void;
  onPreview?: (stamp: CommentStamp) => void;
  variant?: "default" | "composer";
  disabled?: boolean;
  label?: string;
};

const StampPickerOption = memo(function StampPickerOption({
  stamp,
  onSelect,
  onPreview,
  favorite,
  onFavorite,
}: {
  stamp: CommentStamp;
  onSelect: (stamp: CommentStamp) => void;
  onPreview?: (stamp: CommentStamp) => void;
  favorite: boolean;
  onFavorite: (stamp: CommentStamp) => void;
}) {
  const t = useTranslations("comments");
  const shortcode = buildStampShortcode(stamp);
  const hasVoice = Boolean(stamp.voiceUrl);
  const [previewActive, setPreviewActive] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const shouldLoadAnimation = previewActive && Boolean(stamp.animation) && !animationFailed;
  const { animation } = useCommentStampAnimation(
    stamp.region,
    stamp.id,
    stamp.animation,
    shouldLoadAnimation,
  );

  const handleAnimationError = useCallback(() => {
    setAnimationFailed(true);
  }, []);

  return (
    <div data-stamp-key={shortcode} className="group relative h-20 min-w-0">
      <button
        type="button"
        onClick={() => {
          setPreviewActive(false);
          onSelect(stamp);
        }}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") { setPreviewActive(true); onPreview?.(stamp); } }}
        onPointerLeave={() => setPreviewActive(false)}
        onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) { setPreviewActive(true); onPreview?.(stamp); } }}
        onBlur={() => setPreviewActive(false)}
        className="relative flex h-20 w-full min-w-0 items-center justify-center rounded-lg p-1 transition hover:bg-[var(--theme-color-control-background-hover)] focus-visible:bg-[var(--theme-color-control-background-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
        aria-label={shortcode}
        title={shortcode}
      >
        <BandoriStampArtwork imageUrl={stamp.imageUrl} label={shortcode} animation={animation}
          active={previewActive} showVoice={hasVoice} onAnimationError={handleAnimationError} />
      </button>
      <button
        type="button"
        data-stamp-favorite
        aria-pressed={favorite}
        aria-label={t(favorite ? "pickers.stampRemoveFavorite" : "pickers.stampAddFavorite", { stamp: shortcode })}
        title={t(favorite ? "pickers.stampRemoveFavorite" : "pickers.stampAddFavorite", { stamp: shortcode })}
        onClick={() => onFavorite(stamp)}
        className={cn(
          "group/favorite absolute right-0 top-0 inline-flex size-8 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-[var(--theme-color-focus-ring)] sm:size-7",
          favorite
            ? "text-[var(--theme-color-stamp-favorite)]"
            : "text-[var(--theme-color-text-muted)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100",
        )}
      >
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--theme-color-floating-background)] shadow-xs transition group-hover/favorite:bg-[var(--theme-color-control-background-hover)]">
          <Star size={14} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
        </span>
      </button>
    </div>
  );
});

export const StampPickerButton = memo(function StampPickerButton({
  open,
  onOpenChange,
  onSelect,
  onPreview,
  variant = "default",
  disabled = false,
  label,
}: StampPickerButtonProps) {
  const t = useTranslations("comments");
  const pickerLabel = label ?? t("pickers.stamp");
  const commonT = useTranslations("common");
  const popoverId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const restoredViewRef = useRef<string | null>(null);
  const selectedRegion = useStampPickerStore((state) => state.region);
  const category = useStampPickerStore((state) => state.category);
  const favorites = useStampPickerStore((state) => state.favorites);
  const hydrated = useStampPickerStore((state) => state.hydrated);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const { stamps, loading, error, refresh } = useCommentStampsForRegion(selectedRegion, open);
  const visibleStamps = useMemo(() => selectStampPickerItems(stamps, category, favorites), [stamps, category, favorites]);
  const favoriteKeys = useMemo(() => new Set(favorites), [favorites]);
  const viewKey = `${selectedRegion}:${category}`;

  const rememberPosition = useCallback(() => {
    const grid = gridRef.current;
    if (!grid || restoredViewRef.current !== viewKey) return;
    const items = grid.querySelectorAll<HTMLElement>("[data-stamp-key]");
    if (!items.length) return;
    const rowHeight = items[4] ? items[4].offsetTop - items[0].offsetTop : items[0].offsetHeight;
    const first = items[Math.min(items.length - 1, Math.max(0, Math.floor((grid.scrollTop - items[0].offsetTop) / rowHeight)) * 4)];
    useStampPickerStore.getState().rememberPosition(viewKey, {
      stampKey: first.dataset.stampKey!, offset: Math.max(0, grid.scrollTop - first.offsetTop), scrollTop: grid.scrollTop,
    });
  }, [viewKey]);

  const toggleFavorite = useCallback((stamp: CommentStamp) => {
    const index = visibleStamps.indexOf(stamp);
    useStampPickerStore.getState().toggleFavorite(stamp);
    if (category === "favorites") window.requestAnimationFrame(() => {
      const items = gridRef.current?.querySelectorAll<HTMLElement>("[data-stamp-key]");
      const next = items?.[Math.min(index, items.length - 1)]?.querySelector<HTMLButtonElement>("[data-stamp-favorite]");
      (next ?? containerRef.current?.querySelector<HTMLButtonElement>('[data-stamp-category="favorites"]'))?.focus({ preventScroll: true });
    });
  }, [category, visibleStamps]);

  const updatePopoverPosition = useCallback(() => {
    if (!open || !buttonRef.current || !containerRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const panelElement = variant === "composer" ? containerRef.current.closest("[data-chat-panel]") : null;
    const panel = panelElement?.getBoundingClientRect();
    const left = Math.max(viewport?.offsetLeft ?? 0, panel?.left ?? 0);
    const right = Math.min((viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth), panel?.right ?? window.innerWidth);
    const top = Math.max(viewport?.offsetTop ?? 0, panelElement?.querySelector("header")?.getBoundingClientRect().bottom ?? panel?.top ?? 0);
    const inputTop = containerRef.current.closest("[data-chat-input]")?.getBoundingClientRect().top ?? rect.top;
    const desktop = window.matchMedia("(min-width: 640px)").matches;
    const bodyHeight = Math.max(0, Math.min(desktop ? 320 : 372, inputTop - top - 8 - 16 - 36));
    setPopoverStyle({ ...getCommentPopoverHorizontalPosition({
      anchorRect: rect,
      containerLeft: containerRect.left,
      preferredWidth: 456,
      viewportLeft: left,
      viewportWidth: right - left,
    }), "--stamp-picker-max-height": `${bodyHeight}px`, ...(panel ? { bottom: containerRect.bottom - inputTop + 8 } : {}) } as CSSProperties);
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      onOpenChange(false);
      window.requestAnimationFrame(() => buttonRef.current?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  useLayoutEffect(() => {
    if (!open) return;

    updatePopoverPosition();
    const viewport = window.visualViewport;
    window.addEventListener("resize", updatePopoverPosition);
    viewport?.addEventListener("resize", updatePopoverPosition);
    viewport?.addEventListener("scroll", updatePopoverPosition);
    const composer = variant === "composer" ? containerRef.current?.closest("form") : null;
    const observer = composer ? new ResizeObserver(updatePopoverPosition) : null;
    if (composer) observer?.observe(composer);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      viewport?.removeEventListener("resize", updatePopoverPosition);
      viewport?.removeEventListener("scroll", updatePopoverPosition);
      observer?.disconnect();
    };
  }, [open, updatePopoverPosition, variant]);

  useLayoutEffect(() => {
    if (open) useStampPickerStore.getState().hydrate();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof setTimeout>;
    const persist = () => useStampPickerStore.getState().persistSession();
    const unsubscribe = useStampPickerStore.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(persist, 150);
    });
    const syncFavorites = (event: StorageEvent) => {
      if (event.key === STAMP_FAVORITES_STORAGE_KEY || event.key === null) useStampPickerStore.getState().syncFavorites();
    };
    window.addEventListener("pagehide", persist);
    window.addEventListener("storage", syncFavorites);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      persist();
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("storage", syncFavorites);
    };
  }, [open]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    restoredViewRef.current = null;
    if (!open || !hydrated || loading || !grid) return;
    const restore = () => {
      const position = useStampPickerStore.getState().positions[viewKey];
      const anchor = position && Array.from(grid.querySelectorAll<HTMLElement>("[data-stamp-key]")).find((item) => item.dataset.stampKey === position.stampKey);
      grid.scrollTop = position ? anchor ? anchor.offsetTop + position.offset : position.scrollTop : 0;
      restoredViewRef.current = viewKey;
    };
    restore();
    const observer = new ResizeObserver(restore);
    observer.observe(grid);
    return () => { observer.disconnect(); restoredViewRef.current = null; };
  }, [open, hydrated, loading, viewKey, visibleStamps]);

  useLayoutEffect(() => {
    const navigation = categoriesRef.current;
    if (!open || !hydrated || !navigation) return;
    const restore = () => {
      const desktop = window.matchMedia("(min-width: 640px)").matches;
      const position = useStampPickerStore.getState().categoryScroll;
      navigation.scrollLeft = desktop ? 0 : position.horizontal;
      navigation.scrollTop = desktop ? position.vertical : 0;
      const active = navigation.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!active) return;
      const item = active.getBoundingClientRect(), bounds = navigation.getBoundingClientRect();
      if (desktop) navigation.scrollTop += item.top < bounds.top ? item.top - bounds.top : item.bottom > bounds.bottom ? item.bottom - bounds.bottom : 0;
      else navigation.scrollLeft += item.left < bounds.left ? item.left - bounds.left : item.right > bounds.right ? item.right - bounds.right : 0;
    };
    restore();
    const observer = new ResizeObserver(restore);
    observer.observe(navigation);
    return () => observer.disconnect();
  }, [open, hydrated, category]);

  const categoryButton = (key: string, label: string, icon: ReactNode) => (
    <button key={key} type="button" data-stamp-category={key} aria-label={label} title={label} aria-pressed={category === key}
      onClick={() => useStampPickerStore.getState().setCategory(key)}
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border-2 transition focus-visible:outline-2 focus-visible:outline-[var(--theme-color-focus-ring)]",
        category === key
          ? "border-[var(--theme-color-selection-subtle-ring)] bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)]"
          : "border-transparent text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)]")}>{icon}</button>
  );

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full text-[var(--theme-color-text-muted)] transition hover:bg-[var(--theme-color-action-secondary-background-hover)] hover:text-[var(--theme-color-action-secondary-foreground)] focus-visible:outline-2 focus-visible:outline-[var(--theme-color-focus-ring)] disabled:opacity-40",
          variant === "composer" ? "size-11" : "h-8 w-8 border",
          open
            ? "border-[var(--theme-color-selection-subtle-ring)] bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)] hover:bg-[var(--theme-color-selection-subtle-background)] hover:text-[var(--theme-color-selection-subtle-foreground)]"
            : variant === "composer" ? "bg-transparent" : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)]",
        )}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        aria-expanded={open}
        aria-label={pickerLabel}
        title={pickerLabel}
      >
        <Sticker size={variant === "composer" ? 20 : 15} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label={pickerLabel}
          style={popoverStyle}
          className="absolute bottom-10 z-20 overflow-hidden rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-floating-background)] p-2 shadow-xl"
        >
          <div className="mb-2 grid grid-cols-4 gap-1">
            {COMMENT_STAMP_REGIONS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => useStampPickerStore.getState().setRegion(region)}
                aria-pressed={selectedRegion === region}
                className={cn(
                  "h-7 rounded-full text-xs font-bold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]",
                  selectedRegion === region
                    ? "bg-[var(--theme-color-selection-strong-background)] text-[var(--theme-color-selection-strong-foreground)] shadow-xs"
                    : "bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)]",
                )}
              >
                {COMMENT_STAMP_REGION_LABELS[region]}
              </button>
            ))}
          </div>
          <div className="flex h-[var(--stamp-picker-max-height,20rem)] min-h-0 flex-col-reverse gap-2 sm:flex-row">
            <div role="group" aria-label={t("pickers.stampCategories")} className="flex min-h-0 shrink-0 sm:w-11 sm:flex-col">
              <div className="flex shrink-0 sm:flex-col">
                {categoryButton("all", t("pickers.stampAll"), <Grid2X2 size={20} aria-hidden="true" />)}
                {categoryButton("favorites", t("pickers.stampFavorites"), <Star size={20} fill="currentColor" className="text-[var(--theme-color-stamp-favorite)]" aria-hidden="true" />)}
              </div>
              <div aria-hidden="true" className="mx-1 my-1.5 w-0.5 shrink-0 rounded-full bg-[var(--theme-color-border-subtle)] sm:mx-0.5 sm:my-1 sm:h-0.5 sm:w-auto" />
              <div ref={categoriesRef} className="flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-contain touch-pan-x [scrollbar-width:none] sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:touch-pan-y [&::-webkit-scrollbar]:hidden"
                onScroll={(event) => {
                  const desktop = window.matchMedia("(min-width: 640px)").matches;
                  useStampPickerStore.getState().rememberCategoryScroll(desktop ? "vertical" : "horizontal", desktop ? event.currentTarget.scrollTop : event.currentTarget.scrollLeft);
                }}>
                {BANDORI_CHARACTER_GROUPS.map((band) => categoryButton(band.key, band.label,
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={buildBandoriCardBandIconUrl(band.bandId) ?? undefined} alt="" className="size-6 object-contain" />,
                ))}
                {categoryButton("other", t("pickers.stampOther"), <MoreHorizontal size={20} aria-hidden="true" />)}
              </div>
            </div>
          <div ref={gridRef} onScroll={rememberPosition} className="relative grid min-h-0 min-w-0 flex-1 grid-cols-4 content-start gap-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-1 [scrollbar-color:var(--theme-color-shell-scrollbar-thumb)_var(--theme-color-shell-scrollbar-track)] scrollbar-thin [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--theme-color-shell-scrollbar-thumb)] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[var(--theme-color-shell-scrollbar-track)]">
            {loading || !hydrated ? <LoadingIndicator label={t("states.loading")} className="col-span-4 min-h-40" /> : null}
            {error ? (
              <div role="alert" className="col-span-4 flex min-h-20 items-center justify-center gap-2 text-sm text-[var(--theme-color-text-muted)]">
                {commonT("states.loadFailed")}
                <button type="button" className="hhwx-text-link" onClick={refresh}>{commonT("actions.retry")}</button>
              </div>
            ) : !loading && hydrated && visibleStamps.length === 0 ? (
              <p className="col-span-4 py-10 text-center text-sm text-[var(--theme-color-text-muted)]">{t(category === "favorites" ? "pickers.stampFavoritesEmpty" : category === "all" ? "pickers.stampEmpty" : "pickers.stampCategoryEmpty")}</p>
            ) : null}
            {hydrated && visibleStamps.map((stamp) => (
              <StampPickerOption
                key={`${stamp.region}-${stamp.id}-${stamp.kind}`}
                stamp={stamp}
                onSelect={onSelect}
                onPreview={onPreview}
                favorite={favoriteKeys.has(buildStampShortcode(stamp))}
                onFavorite={toggleFavorite}
              />
            ))}
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
