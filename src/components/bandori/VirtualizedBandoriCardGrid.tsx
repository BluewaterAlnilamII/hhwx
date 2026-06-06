"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

type VirtualizedBandoriCardGridProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  mobileItemSize?: number;
  desktopItemSize?: number;
  gap?: number;
  visibleLimit?: number;
  scrollElementRef?: RefObject<HTMLElement | null>;
  className?: string;
  overscan?: number;
  layoutKey?: string | number | boolean;
};

const DEFAULT_MOBILE_ITEM_SIZE = 56;
const DEFAULT_DESKTOP_ITEM_SIZE = 76;
const DEFAULT_GAP = 6;
const DEFAULT_OVERSCAN = 5;
const TAILWIND_SM_MEDIA_QUERY = "(min-width: 640px)";

function useDesktopBreakpoint() {
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(TAILWIND_SM_MEDIA_QUERY).matches
  ));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(TAILWIND_SM_MEDIA_QUERY);
    const update = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

function useElementWidth() {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => setWidth(element.clientWidth);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { elementRef, width };
}

function getScrollMargin(
  rootElement: HTMLDivElement,
  scrollElement: HTMLElement | null | undefined,
): number {
  if (scrollElement) {
    const rootRect = rootElement.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    return rootRect.top - scrollRect.top + scrollElement.scrollTop;
  }

  if (typeof window === "undefined") {
    return 0;
  }

  return rootElement.getBoundingClientRect().top + window.scrollY;
}

function useVirtualizerScrollMargin(
  rootRef: RefObject<HTMLDivElement | null>,
  updateKey: string,
  scrollElementRef?: RefObject<HTMLElement | null>,
) {
  const [scrollMargin, setScrollMargin] = useState(0);
  const updateScrollMargin = useCallback(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }

    const nextScrollMargin = getScrollMargin(element, scrollElementRef?.current ?? null);
    setScrollMargin((current) => (
      Math.abs(current - nextScrollMargin) > 0.5 ? nextScrollMargin : current
    ));
  }, [rootRef, scrollElementRef]);

  useLayoutEffect(() => {
    updateScrollMargin();
  }, [updateKey, updateScrollMargin]);

  useEffect(() => {
    updateScrollMargin();
    window.addEventListener("resize", updateScrollMargin);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateScrollMargin);
      const rootElement = rootRef.current;
      const scrollElement = scrollElementRef?.current ?? null;
      if (rootElement) {
        observer.observe(rootElement);
      }
      if (scrollElement) {
        observer.observe(scrollElement);
      }
    }

    return () => {
      window.removeEventListener("resize", updateScrollMargin);
      observer?.disconnect();
    };
  }, [rootRef, scrollElementRef, updateKey, updateScrollMargin]);

  return scrollMargin;
}

function calculateColumnCount(containerWidth: number, itemSize: number, gap: number): number {
  if (containerWidth <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor((containerWidth + gap) / (itemSize + gap)));
}

function getVisibleItems<T>(items: readonly T[], visibleLimit: number | undefined): readonly T[] {
  if (visibleLimit === undefined) {
    return items;
  }

  return items.slice(0, Math.max(0, Math.min(items.length, visibleLimit)));
}

function VirtualRows<T>({
  items,
  columns,
  itemSize,
  gap,
  rowVirtualItems,
  getKey,
  renderItem,
  translateOffset = 0,
}: {
  items: readonly T[];
  columns: number;
  itemSize: number;
  gap: number;
  rowVirtualItems: Array<{ index: number; key: string | number | bigint; start: number }>;
  getKey: (item: T) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  translateOffset?: number;
}) {
  return (
    <>
      {rowVirtualItems.map((virtualRow) => {
        const startIndex = virtualRow.index * columns;
        const rowItems = items.slice(startIndex, startIndex + columns);
        return (
          <div
            key={String(virtualRow.key)}
            className="absolute left-0 top-0 grid w-full justify-center overflow-visible"
            style={{
              gap,
              gridTemplateColumns: `repeat(${columns}, ${itemSize}px)`,
              transform: `translateY(${virtualRow.start - translateOffset}px)`,
            }}
          >
            {rowItems.map((item, rowItemIndex) => {
              const itemIndex = startIndex + rowItemIndex;
              return (
                <div key={getKey(item)} className="overflow-visible" style={{ height: itemSize, width: itemSize }}>
                  {renderItem(item, itemIndex)}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function WindowVirtualizedBandoriCardGrid<T>({
  items,
  getKey,
  renderItem,
  mobileItemSize = DEFAULT_MOBILE_ITEM_SIZE,
  desktopItemSize = DEFAULT_DESKTOP_ITEM_SIZE,
  gap = DEFAULT_GAP,
  visibleLimit,
  className,
  overscan = DEFAULT_OVERSCAN,
  layoutKey = "",
}: VirtualizedBandoriCardGridProps<T>) {
  const isDesktop = useDesktopBreakpoint();
  const itemSize = isDesktop ? desktopItemSize : mobileItemSize;
  const rowHeight = itemSize + gap;
  const { elementRef, width } = useElementWidth();
  const columns = calculateColumnCount(width, itemSize, gap);
  const visibleItems = useMemo(() => getVisibleItems(items, visibleLimit), [items, visibleLimit]);
  const rowCount = Math.ceil(visibleItems.length / columns);
  const scrollMargin = useVirtualizerScrollMargin(elementRef, `${width}:${rowCount}:${itemSize}:${gap}:${layoutKey}`);
  const rowVirtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: rowCount,
    estimateSize: () => rowHeight,
    overscan,
    scrollMargin,
    getItemKey: (index) => `row-${index}`,
  });

  return (
    <div ref={elementRef} data-bandori-virtual-grid className={cn("relative w-full overflow-visible", className)}>
      <div className="relative overflow-visible" style={{ height: rowVirtualizer.getTotalSize() }}>
        <VirtualRows
          items={visibleItems}
          columns={columns}
          itemSize={itemSize}
          gap={gap}
          rowVirtualItems={rowVirtualizer.getVirtualItems()}
          getKey={getKey}
          renderItem={renderItem}
          translateOffset={scrollMargin}
        />
      </div>
    </div>
  );
}

function ElementVirtualizedBandoriCardGrid<T>({
  items,
  getKey,
  renderItem,
  mobileItemSize = DEFAULT_MOBILE_ITEM_SIZE,
  desktopItemSize = DEFAULT_DESKTOP_ITEM_SIZE,
  gap = DEFAULT_GAP,
  visibleLimit,
  scrollElementRef,
  className,
  overscan = DEFAULT_OVERSCAN,
  layoutKey = "",
}: VirtualizedBandoriCardGridProps<T>) {
  const isDesktop = useDesktopBreakpoint();
  const itemSize = isDesktop ? desktopItemSize : mobileItemSize;
  const rowHeight = itemSize + gap;
  const { elementRef, width } = useElementWidth();
  const columns = calculateColumnCount(width, itemSize, gap);
  const visibleItems = useMemo(() => getVisibleItems(items, visibleLimit), [items, visibleLimit]);
  const rowCount = Math.ceil(visibleItems.length / columns);
  const scrollMargin = useVirtualizerScrollMargin(
    elementRef,
    `${width}:${rowCount}:${itemSize}:${gap}:${layoutKey}`,
    scrollElementRef,
  );
  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: rowCount,
    getScrollElement: () => scrollElementRef?.current ?? null,
    estimateSize: () => rowHeight,
    overscan,
    scrollMargin,
    getItemKey: (index) => `row-${index}`,
  });

  return (
    <div ref={elementRef} data-bandori-virtual-grid className={cn("relative w-full overflow-visible", className)}>
      <div className="relative overflow-visible" style={{ height: rowVirtualizer.getTotalSize() }}>
        <VirtualRows
          items={visibleItems}
          columns={columns}
          itemSize={itemSize}
          gap={gap}
          rowVirtualItems={rowVirtualizer.getVirtualItems()}
          getKey={getKey}
          renderItem={renderItem}
          translateOffset={scrollMargin}
        />
      </div>
    </div>
  );
}

export default function VirtualizedBandoriCardGrid<T>(props: VirtualizedBandoriCardGridProps<T>) {
  if (props.scrollElementRef) {
    return <ElementVirtualizedBandoriCardGrid {...props} />;
  }

  return <WindowVirtualizedBandoriCardGrid {...props} />;
}
