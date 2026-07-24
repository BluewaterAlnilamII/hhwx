import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import {
  getBandoriRegionalDisplayOrder,
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
  contextServer?: BandoriServer | null,
): BestdoriRegionalName | null {
  if (!Array.isArray(names)) {
    return null;
  }

  for (const index of getBandoriRegionalDisplayOrder(preferredServer, contextServer)) {
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
  contextServer?: BandoriServer | null,
): string | null {
  return pickBestdoriRegionalName(names, preferredServer, contextServer)?.name ?? null;
}
