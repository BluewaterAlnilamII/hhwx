"use client";

import { useCallback, useEffect, useState } from "react";
import {
  COMPARISON_ALIGNMENT_STORAGE_KEY,
  COMPARISON_CONFIG_STORAGE_KEY,
  MAX_COMPARISON_LINES,
  MONTHLY_COMPARISON_ALIGNMENT_STORAGE_KEY,
  MONTHLY_COMPARISON_CONFIG_STORAGE_KEY,
} from "./constants";
import type { ComparisonAlignment, ComparisonConfig, ComparisonTargetType } from "./types";

const COMPARISON_PREFERENCE_EVENT = "eventtracker:comparison-preference-change";

type ConfigUpdater = ComparisonConfig[] | ((previous: ComparisonConfig[]) => ComparisonConfig[]);
type AlignmentUpdater = ComparisonAlignment | ((previous: ComparisonAlignment) => ComparisonAlignment);

function areConfigsEqual(left: ComparisonConfig[], right: ComparisonConfig[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftConfig, index) => {
    const rightConfig = right[index];
    return (
      leftConfig.id === rightConfig.id &&
      leftConfig.targetType === rightConfig.targetType &&
      leftConfig.targetId === rightConfig.targetId &&
      leftConfig.tier === rightConfig.tier &&
      leftConfig.enabled === rightConfig.enabled
    );
  });
}

function getPreferenceStorageKeys(targetType: ComparisonTargetType) {
  if (targetType === "monthly") {
    return {
      configsKey: MONTHLY_COMPARISON_CONFIG_STORAGE_KEY,
      alignmentKey: MONTHLY_COMPARISON_ALIGNMENT_STORAGE_KEY,
    };
  }

  return {
    configsKey: COMPARISON_CONFIG_STORAGE_KEY,
    alignmentKey: COMPARISON_ALIGNMENT_STORAGE_KEY,
  };
}

function normalizeConfigs(value: unknown, targetType: ComparisonTargetType): ComparisonConfig[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: ComparisonConfig[] = [];

  value.forEach((item) => {
    const raw = item as Partial<ComparisonConfig> | null;
    if (raw?.targetType !== targetType) {
      return;
    }

    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : null;
    if (id === null) {
      return;
    }

    const rawTargetId = raw.targetId === null || raw.targetId === undefined ? null : Number(raw.targetId);
    const rawTier = raw?.tier === null || raw?.tier === undefined ? null : Number(raw.tier);
    const targetId = rawTargetId !== null && Number.isInteger(rawTargetId) && rawTargetId > 0 ? rawTargetId : null;
    const tier = rawTier !== null && Number.isInteger(rawTier) && rawTier > 0 ? rawTier : null;
    const key = targetId !== null && tier !== null ? `${targetType}:${targetId}:${tier}` : null;

    if (key !== null && seen.has(key)) {
      return;
    }

    if (key !== null) {
      seen.add(key);
    }

    result.push({
      id,
      targetType,
      targetId,
      tier,
      enabled: raw?.enabled !== false,
    });
  });

  return result.slice(0, MAX_COMPARISON_LINES);
}

function readConfigs(storageKey: string, targetType: ComparisonTargetType): ComparisonConfig[] {
  if (typeof window === "undefined") return [];

  try {
    return normalizeConfigs(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"), targetType);
  } catch {
    return [];
  }
}

function writeConfigs(storageKey: string, targetType: ComparisonTargetType, configs: ComparisonConfig[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeConfigs(configs, targetType)));
  } catch {
    return;
  }
}

function readAlignment(storageKey: string): ComparisonAlignment {
  if (typeof window === "undefined") return "start";
  return window.localStorage.getItem(storageKey) === "end" ? "end" : "start";
}

function writeAlignment(storageKey: string, alignment: ComparisonAlignment) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, alignment);
  } catch {
    return;
  }
}

export function useComparisonPreferences(targetType: ComparisonTargetType = "event") {
  const [comparisonConfigs, setComparisonConfigsState] = useState<ComparisonConfig[]>([]);
  const [comparisonAlignment, setComparisonAlignmentState] = useState<ComparisonAlignment>("start");
  const { configsKey, alignmentKey } = getPreferenceStorageKeys(targetType);

  useEffect(() => {
    const sync = () => {
      setComparisonConfigsState(readConfigs(configsKey, targetType));
      setComparisonAlignmentState(readAlignment(alignmentKey));
    };

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(COMPARISON_PREFERENCE_EVENT, sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(COMPARISON_PREFERENCE_EVENT, sync);
    };
  }, [alignmentKey, configsKey, targetType]);

  const setComparisonConfigs = useCallback((nextValue: ConfigUpdater) => {
    setComparisonConfigsState((previous) => {
      const resolved = normalizeConfigs(typeof nextValue === "function" ? nextValue(previous) : nextValue, targetType);
      if (areConfigsEqual(previous, resolved)) {
        return previous;
      }

      writeConfigs(configsKey, targetType, resolved);
      return resolved;
    });
  }, [configsKey, targetType]);

  const setComparisonAlignment = useCallback((nextValue: AlignmentUpdater) => {
    setComparisonAlignmentState((previous) => {
      const resolved = typeof nextValue === "function" ? nextValue(previous) : nextValue;
      const normalized = resolved === "end" ? "end" : "start";
      if (previous === normalized) {
        return previous;
      }

      writeAlignment(alignmentKey, normalized);
      return normalized;
    });
  }, [alignmentKey]);

  return {
    comparisonConfigs,
    setComparisonConfigs,
    comparisonAlignment,
    setComparisonAlignment,
  };
}
