import { buildBandoriAssetCdnUrl } from "@/lib/bandori-asset-proxy";

const BUILTIN_RESOURCE_PREFIX = "bandori/resources";
const LEGACY_RARITY_ICON_PREFIX = "bandori/res/icon";
const SUPPORTED_BAND_IDS = new Set([1, 2, 3, 4, 5, 18, 21, 45]);

export type BandoriBuiltinAttribute = "powerful" | "cool" | "happy" | "pure";

export type BandoriFullCardFrameName =
  | "frame_n_cool"
  | "frame_n_happy"
  | "frame_n_powerful"
  | "frame_n_pure"
  | "frame_r_silver"
  | "frame_s_gold"
  | "frame_ss_rainbow"
  | "frame_ur_orange";

function buildMenuAtlasSpriteUrl(spriteName: string): string | null {
  return buildBandoriAssetCdnUrl(
    `${BUILTIN_RESOURCE_PREFIX}/atlases/menu-atlas/${spriteName}.png`,
  );
}

export function buildBandoriFullCardFrameUrl(
  frameName: BandoriFullCardFrameName,
): string | null {
  return buildBandoriAssetCdnUrl(
    `${BUILTIN_RESOURCE_PREFIX}/images/card-frame/${frameName}.png`,
  );
}

export function buildBandoriThumbnailFrameUrl(
  rarity: number,
  attribute: BandoriBuiltinAttribute | null,
): string | null {
  const normalizedRarity = Math.max(1, Math.min(5, Math.trunc(rarity)));
  const frameName = normalizedRarity === 1
    ? attribute ? `frame_n_${attribute}` : null
    : normalizedRarity === 2
      ? "frame_r_silver"
      : normalizedRarity === 3
        ? "frame_s_gold"
        : normalizedRarity === 4
          ? "frame_ss_rainbow"
          : "frame_ur_orange";
  return frameName ? buildMenuAtlasSpriteUrl(frameName) : null;
}

export function buildBandoriAttributeIconUrl(
  attribute: BandoriBuiltinAttribute,
): string | null {
  return buildMenuAtlasSpriteUrl(`icon_attribute_${attribute}`);
}

export function buildBandoriCharacterIconUrl(characterId: number): string | null {
  const normalizedId = Math.trunc(characterId);
  if (normalizedId < 1 || normalizedId > 40) {
    return null;
  }
  return buildMenuAtlasSpriteUrl(`icon_character${normalizedId.toString().padStart(3, "0")}`);
}

export function buildBandoriBandIconUrl(bandId: number): string | null {
  const normalizedId = Math.trunc(bandId);
  if (!SUPPORTED_BAND_IDS.has(normalizedId)) {
    return null;
  }
  return buildMenuAtlasSpriteUrl(`bandmark_flat_${normalizedId.toString().padStart(3, "0")}`);
}

export function buildBandoriRarityStarIconUrl(isTrained: boolean): string | null {
  return buildMenuAtlasSpriteUrl(
    isTrained ? "icon_rarity_rainbow" : "icon_rarity_yellow",
  );
}

export function buildBandoriMasterRankIconUrl(): string | null {
  return buildMenuAtlasSpriteUrl("bg_masterrank");
}

export function buildBandoriLegacyRarityCompositeUrl(rarity: number): string | null {
  const normalizedRarity = Math.trunc(rarity);
  if (normalizedRarity < 1 || normalizedRarity > 5) {
    return null;
  }
  return buildBandoriAssetCdnUrl(
    `${LEGACY_RARITY_ICON_PREFIX}/star_${normalizedRarity}.png`,
  );
}
