"use client";

import { useCachedFetch } from "@/hooks/useCachedFetch";
import { LONG_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import { bandoriMasterTransforms, type BandoriCharacterMaster } from "@/lib/bandori-card-master";

export function useBandoriCharactersMaster(isEnabled = true) {
  return useCachedFetch<Record<string, BandoriCharacterMaster | null | undefined>>(
    isEnabled ? "bandori-master-characters-v3" : null,
    isEnabled ? "/api/bandori/master/characters" : null,
    bandoriMasterTransforms.characters,
    { ...LONG_CLIENT_CACHE_POLICY },
  );
}
