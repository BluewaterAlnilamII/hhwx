"use client";

import { useCachedFetch } from "@/hooks/useCachedFetch";
import { usePublicAssetIndex } from "@/hooks/usePublicAssetIndex";
import { createPublicAssetIndexStore } from "@/lib/public-asset-index-client";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { LONG_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import type { OurNotesCardSummary } from "@/lib/ournotes/cards/api-contract";
import type { OurNotesCharacters, OurNotesBands } from "@/lib/ournotes/cards/catalog";
import type { OurNotesSkills } from "@/lib/ournotes/skills-contract";
import { OURNOTES_CARDS_INDEX_URL, parseOurNotesCardsAssetIndex } from "@/lib/ournotes/cards/assets";

type Datasets = {
  "cards/member": Record<string, OurNotesCardSummary>;
  "cards/support": Record<string, OurNotesCardSummary>;
  characters: OurNotesCharacters; bands: OurNotesBands; skills: OurNotesSkills;
};
function parseMaster<T>(raw: unknown): T {
  const data = parseApiSuccessData<unknown>(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid OurNotes master response");
  return data as T;
}
export function useOurNotesMaster<K extends keyof Datasets>(dataset: K) {
  return useCachedFetch<Datasets[K]>("ournotes-master:" + dataset, "/api/ournotes/master/" + dataset, parseMaster<Datasets[K]>, LONG_CLIENT_CACHE_POLICY);
}
const imageIndex = createPublicAssetIndexStore({ parse: parseOurNotesCardsAssetIndex });
export function useOurNotesCardsAssetIndex() {
  return usePublicAssetIndex(OURNOTES_CARDS_INDEX_URL, imageIndex);
}
