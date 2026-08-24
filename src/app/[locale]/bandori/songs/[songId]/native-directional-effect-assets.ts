import type { BandoriNativeDirectionalFlickSkin } from "./native-note-assets";
import type { BandoriNativeDirectionalEffectVariant } from "./native-live-settings";

const CHART_SIMULATOR_LOGICAL_ASSET_ROOT = "/local/chart-simulator";
const VERIFIED_DIRECTIONAL_EFFECT_FAMILIES = new Set([
  "skin00",
  "skin01",
  "skin02",
  "skin03",
  "skin04",
  "skin_persona",
]);

export const BANDORI_NATIVE_DIRECTIONAL_EFFECT_RECIPE_KEYS = [
  "finger-left",
  "finger-right",
  "left-1",
  "left-2",
  "left-3",
  "right-1",
  "right-2",
  "right-3",
] as const;

export type BandoriNativeDirectionalEffectRecipeKey =
  (typeof BANDORI_NATIVE_DIRECTIONAL_EFFECT_RECIPE_KEYS)[number];

export const BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANTS = [
  "normal",
  "light",
] as const satisfies readonly Exclude<
  BandoriNativeDirectionalEffectVariant,
  "off"
>[];

type BandoriNativeDirectionalEffectRecipeVariant =
  (typeof BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANTS)[number];

export type BandoriNativeDirectionalEffectAssetContract = Readonly<{
  recipes: Readonly<Record<
    BandoriNativeDirectionalEffectRecipeVariant,
    Readonly<Record<BandoriNativeDirectionalEffectRecipeKey, string>>
  >>;
  resources: Readonly<Record<string, string>>;
}>;

function getDirectionalEffectRoot(
  assetBundleName: string,
  variant: BandoriNativeDirectionalEffectRecipeVariant,
): string {
  return `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/tapeffect/directionalflick${assetBundleName}${variant}`;
}

function createRecipeUrls(
  assetBundleName: string,
  variant: BandoriNativeDirectionalEffectRecipeVariant,
): Readonly<Record<BandoriNativeDirectionalEffectRecipeKey, string>> {
  const root = getDirectionalEffectRoot(assetBundleName, variant);
  return Object.fromEntries(BANDORI_NATIVE_DIRECTIONAL_EFFECT_RECIPE_KEYS.map(
    (key) => [key, `${root}/recipes/${key}.json`],
  )) as Record<BandoriNativeDirectionalEffectRecipeKey, string>;
}

/** Maps the six verified native families without rewriting their recipe payloads. */
export function getBandoriNativeDirectionalEffectAssetContract(
  skin: BandoriNativeDirectionalFlickSkin,
): BandoriNativeDirectionalEffectAssetContract {
  if (!VERIFIED_DIRECTIONAL_EFFECT_FAMILIES.has(skin.assetBundleName)) {
    throw new Error(
      `Directional effect family is outside the verified JP set: ${skin.assetBundleName}`,
    );
  }
  const normalRoot = getDirectionalEffectRoot(skin.assetBundleName, "normal");
  const lightRoot = getDirectionalEffectRoot(skin.assetBundleName, "light");
  const resources: Record<string, string> = skin.assetBundleName === "skin_persona"
    ? {
        "limited-persona-directional-light-default-particlesystem": `${lightRoot}/textures/default-particlesystem.png`,
        "limited-persona-directional-light-effect_circle": `${lightRoot}/textures/effect_circle.png`,
        "limited-persona-directional-light-tex_parset_1": `${lightRoot}/textures/tex_parset_1.png`,
        "limited-persona-directional-normal-default-particlesystem": `${normalRoot}/textures/default-particlesystem.png`,
        "limited-persona-directional-normal-effect_circle": `${normalRoot}/textures/effect_circle.png`,
        "limited-persona-directional-normal-tex_parset_1": `${normalRoot}/textures/tex_parset_1.png`,
      }
    : {
        "directional-circle": `${normalRoot}/textures/effect_circle.png`,
        "directional-default": `${normalRoot}/textures/Default-ParticleSystem.png`,
        "directional-set1": `${normalRoot}/textures/tex_parset_1.png`,
      };
  return {
    recipes: {
      light: createRecipeUrls(skin.assetBundleName, "light"),
      normal: createRecipeUrls(skin.assetBundleName, "normal"),
    },
    resources,
  };
}
