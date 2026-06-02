import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";

const BESTDORI_CN_THEN_JP_NAME_PREFERENCE_ORDER = [3, 0, 2, 1, 4] as const;

export type BestdoriRegionalName = {
  name: string;
  assetRegion: BandoriAssetRegion;
};

function getBestdoriAssetRegionForNameIndex(index: number): BandoriAssetRegion {
  return index === 3 ? "cn" : "jp";
}

export function pickBestdoriCnThenJpRegionalName(
  names: readonly (string | null | undefined)[] | null | undefined,
): BestdoriRegionalName | null {
  if (!Array.isArray(names)) {
    return null;
  }

  const visitedIndexes = new Set<number>();
  for (const index of BESTDORI_CN_THEN_JP_NAME_PREFERENCE_ORDER) {
    visitedIndexes.add(index);
    const name = names[index]?.trim();
    if (name) {
      return {
        name,
        assetRegion: getBestdoriAssetRegionForNameIndex(index),
      };
    }
  }

  for (let index = 0; index < names.length; index += 1) {
    if (visitedIndexes.has(index)) {
      continue;
    }
    const name = names[index]?.trim();
    if (name) {
      return {
        name,
        assetRegion: getBestdoriAssetRegionForNameIndex(index),
      };
    }
  }

  return null;
}

export function pickBestdoriCnThenJpName(
  names: readonly (string | null | undefined)[] | null | undefined,
): string | null {
  return pickBestdoriCnThenJpRegionalName(names)?.name ?? null;
}
