"use client";

import { useCachedFetch } from "@/hooks/useCachedFetch";
import { LONG_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import { bandoriMasterTransforms, type BandoriSkillMaster } from "@/lib/bandori-card-master";

export function useBandoriSkillsMaster(isEnabled = true) {
  return useCachedFetch<Record<string, BandoriSkillMaster | null | undefined>>(
    isEnabled ? "bandori-master-skills-v1" : null,
    isEnabled ? "/api/bandori/master/skills" : null,
    bandoriMasterTransforms.skills,
    { ...LONG_CLIENT_CACHE_POLICY },
  );
}
