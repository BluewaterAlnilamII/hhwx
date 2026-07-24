import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import {
  getBandoriRegionalPreferenceOrder,
  type BandoriServer,
} from "@/lib/bandori-server";

export type BestdoriRegionalName = {
  name: string;
  assetRegion: BandoriAssetRegion;
};

function getBestdoriAssetRegionForNameIndex(index: number): BandoriAssetRegion {
  return index === 3 ? "cn" : "jp";
}

export function pickBestdoriRegionalName(
  names: readonly (string | null | undefined)[] | null | undefined,
  preferredServer: BandoriServer,
): BestdoriRegionalName | null {
  if (!Array.isArray(names)) {
    return null;
  }

  for (const index of getBandoriRegionalPreferenceOrder(preferredServer)) {
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

export function pickBestdoriLocalizedName(
  names: readonly (string | null | undefined)[] | null | undefined,
  preferredServer: BandoriServer,
): string | null {
  return pickBestdoriRegionalName(names, preferredServer)?.name ?? null;
}
