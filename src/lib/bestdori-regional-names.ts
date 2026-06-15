import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { type AppLocale } from "@/i18n/routing";

const BESTDORI_CN_THEN_JP_NAME_PREFERENCE_ORDER = [3, 0, 2, 1, 4] as const;
const BESTDORI_EN_THEN_JP_NAME_PREFERENCE_ORDER = [1, 0, 3, 2, 4] as const;

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
  return pickBestdoriRegionalName(names, "zh-CN");
}

export function pickBestdoriRegionalName(
  names: readonly (string | null | undefined)[] | null | undefined,
  locale: AppLocale = "zh-CN",
): BestdoriRegionalName | null {
  if (!Array.isArray(names)) {
    return null;
  }

  const visitedIndexes = new Set<number>();
  const preferredIndexes = locale === "en"
    ? BESTDORI_EN_THEN_JP_NAME_PREFERENCE_ORDER
    : BESTDORI_CN_THEN_JP_NAME_PREFERENCE_ORDER;
  for (const index of preferredIndexes) {
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

export function pickBestdoriLocalizedName(
  names: readonly (string | null | undefined)[] | null | undefined,
  locale: AppLocale = "zh-CN",
): string | null {
  return pickBestdoriRegionalName(names, locale)?.name ?? null;
}
