"use client";

import { useCallback, useEffect, useState } from "react";
import {
  COMPARISON_ALIGNMENT_STORAGE_KEY,
  COMPARISON_CONFIG_STORAGE_KEY,
  MAX_COMPARISON_LINES,
} from "./constants";
import type { ComparisonAlignment, ComparisonConfig } from "./types";

const COMPARISON_PREFERENCE_EVENT = "eventtracker:comparison-preference-change";

type ConfigUpdater = ComparisonConfig[] | ((previous: ComparisonConfig[]) => ComparisonConfig[]);
type AlignmentUpdater = ComparisonAlignment | ((previous: ComparisonAlignment) => ComparisonAlignment);

function normalizeConfigs(value: unknown): ComparisonConfig[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: ComparisonConfig[] = [];

  value.forEach((item, index) => {
    const raw = item as Partial<ComparisonConfig> | null;
    const rawEventId = raw?.eventId === null || raw?.eventId === undefined ? null : Number(raw.eventId);
    const rawTier = raw?.tier === null || raw?.tier === undefined ? null : Number(raw.tier);
    const eventId = rawEventId !== null && Number.isInteger(rawEventId) && rawEventId > 0 ? rawEventId : null;
    const tier = rawTier !== null && Number.isInteger(rawTier) && rawTier > 0 ? rawTier : null;
    const key = eventId !== null && tier !== null ? `${eventId}:${tier}` : null;

    if (key !== null && seen.has(key)) {
      return;
    }

    if (key !== null) {
      seen.add(key);
    }

    result.push({
      id: typeof raw?.id === "string" && raw.id.trim() ? raw.id : `comparison-${Date.now()}-${index}`,
      eventId,
      tier,
      enabled: raw?.enabled !== false,
    });
  });

  return result.slice(0, MAX_COMPARISON_LINES);
}

function readConfigs(): ComparisonConfig[] {
  if (typeof window === "undefined") return [];

  try {
    return normalizeConfigs(JSON.parse(window.localStorage.getItem(COMPARISON_CONFIG_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function writeConfigs(configs: ComparisonConfig[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(COMPARISON_CONFIG_STORAGE_KEY, JSON.stringify(normalizeConfigs(configs)));
  } catch {
    return;
  }
}

function readAlignment(): ComparisonAlignment {
  if (typeof window === "undefined") return "start";
  return window.localStorage.getItem(COMPARISON_ALIGNMENT_STORAGE_KEY) === "end" ? "end" : "start";
}

function writeAlignment(alignment: ComparisonAlignment) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(COMPARISON_ALIGNMENT_STORAGE_KEY, alignment);
  } catch {
    return;
  }
}

export function useComparisonPreferences() {
  const [comparisonConfigs, setComparisonConfigsState] = useState<ComparisonConfig[]>([]);
  const [comparisonAlignment, setComparisonAlignmentState] = useState<ComparisonAlignment>("start");

  useEffect(() => {
    const sync = () => {
      setComparisonConfigsState(readConfigs());
      setComparisonAlignmentState(readAlignment());
    };

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(COMPARISON_PREFERENCE_EVENT, sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(COMPARISON_PREFERENCE_EVENT, sync);
    };
  }, []);

  const setComparisonConfigs = useCallback((nextValue: ConfigUpdater) => {
    setComparisonConfigsState((previous) => {
      const resolved = normalizeConfigs(typeof nextValue === "function" ? nextValue(previous) : nextValue);
      writeConfigs(resolved);
      return resolved;
    });
  }, []);

  const setComparisonAlignment = useCallback((nextValue: AlignmentUpdater) => {
    setComparisonAlignmentState((previous) => {
      const resolved = typeof nextValue === "function" ? nextValue(previous) : nextValue;
      const normalized = resolved === "end" ? "end" : "start";
      writeAlignment(normalized);
      return normalized;
    });
  }, []);

  return {
    comparisonConfigs,
    setComparisonConfigs,
    comparisonAlignment,
    setComparisonAlignment,
  };
}
