"use client";

import { useRef } from "react";
import { useHistoryEntryState } from "./useHistoryEntryState";
import { useListReadingPosition } from "./useListReadingPosition";

export const CATALOG_PAGE_SIZE = 40;

export function useVisitBatch(filter: string, pageSize: number) {
  const [count, setCount] = useHistoryEntryState("catalogBatch", filter, pageSize);
  return { count, setCount, showMore: () => setCount(count + pageSize) };
}

export function useCatalogVisit(filter: string, ready: boolean) {
  const listRef = useRef<HTMLDivElement>(null);
  const batch = useVisitBatch(filter, CATALOG_PAGE_SIZE);
  useListReadingPosition(listRef, filter + ":" + batch.count, ready);
  return { ...batch, listRef };
}
