"use client";

import { useCallback, useEffect, useState } from "react";
import { getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";
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
type ScopedConfigsState = {
  storageKey: string;
  value: ComparisonConfig[];
};
type ScopedAlignmentState = {
  storageKey: string;
  value: ComparisonAlignment;
};

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

function getPreferenceStorageKeys(
  server: BandoriServer,
  targetType: ComparisonTargetType,
) {
  const serverSuffix = getBandoriServerCode(server);
  if (targetType === "monthly") {
    return {
      configsKey: `${MONTHLY_COMPARISON_CONFIG_STORAGE_KEY}:${serverSuffix}`,
      alignmentKey: `${MONTHLY_COMPARISON_ALIGNMENT_STORAGE_KEY}:${serverSuffix}`,
    };
  }

  return {
    configsKey: `${COMPARISON_CONFIG_STORAGE_KEY}:${serverSuffix}`,
    alignmentKey: `${COMPARISON_ALIGNMENT_STORAGE_KEY}:${serverSuffix}`,
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

export function useComparisonPreferences(
  server: BandoriServer,
  targetType: ComparisonTargetType = "event",
) {
  const { configsKey, alignmentKey } = getPreferenceStorageKeys(server, targetType);
  const [configsState, setConfigsState] = useState<ScopedConfigsState>({
    storageKey: configsKey,
    value: [],
  });
  const [alignmentState, setAlignmentState] = useState<ScopedAlignmentState>({
    storageKey: alignmentKey,
    value: "start",
  });
  const comparisonConfigs = configsState.storageKey === configsKey ? configsState.value : [];
  const comparisonAlignment = alignmentState.storageKey === alignmentKey
    ? alignmentState.value
    : "start";

  useEffect(() => {
    const sync = () => {
      setConfigsState({
        storageKey: configsKey,
        value: readConfigs(configsKey, targetType),
      });
      setAlignmentState({
        storageKey: alignmentKey,
        value: readAlignment(alignmentKey),
      });
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
    setConfigsState((previousState) => {
      const previous = previousState.storageKey === configsKey
        ? previousState.value
        : readConfigs(configsKey, targetType);
      const resolved = normalizeConfigs(
        typeof nextValue === "function" ? nextValue(previous) : nextValue,
        targetType,
      );
      if (previousState.storageKey === configsKey && areConfigsEqual(previous, resolved)) {
        return previousState;
      }

      writeConfigs(configsKey, targetType, resolved);
      return { storageKey: configsKey, value: resolved };
    });
  }, [configsKey, targetType]);

  const setComparisonAlignment = useCallback((nextValue: AlignmentUpdater) => {
    setAlignmentState((previousState) => {
      const previous = previousState.storageKey === alignmentKey
        ? previousState.value
        : readAlignment(alignmentKey);
      const resolved = typeof nextValue === "function" ? nextValue(previous) : nextValue;
      const normalized = resolved === "end" ? "end" : "start";
      if (previousState.storageKey === alignmentKey && previous === normalized) {
        return previousState;
      }

      writeAlignment(alignmentKey, normalized);
      return { storageKey: alignmentKey, value: normalized };
    });
  }, [alignmentKey]);

  return {
    comparisonConfigs,
    setComparisonConfigs,
    comparisonAlignment,
    setComparisonAlignment,
  };
}
