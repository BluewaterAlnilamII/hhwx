import type { BandoriTapEffectAssetContract } from "./limited-performance-skins";

const CHART_SIMULATOR_LOGICAL_ASSET_ROOT = "/local/chart-simulator";

export type BandoriNativeTapEffectSkin = Readonly<{
  assetBundleName: "skin00" | "skin01" | "skin02" | "skin03" | "skin04" | null;
  effects: BandoriTapEffectAssetContract | null;
  id: 0 | 1 | 2 | 3 | 4 | "off";
}>;

type RecipeTapEffectSkin = Exclude<
  BandoriNativeTapEffectSkin["assetBundleName"],
  "skin00" | null
>;

const TAP_EFFECT_SOURCE_TEXTURES: Readonly<Record<RecipeTapEffectSkin, Readonly<{
  fileName: string;
  name: string;
  pathId: string;
  usesEffectCircle: boolean;
}>>> = {
  skin01: {
    fileName: "tex_e_001.png",
    name: "tex_e_001",
    pathId: "-6339044413595053316",
    usesEffectCircle: false,
  },
  skin02: {
    fileName: "tex_i_001.png",
    name: "tex_i_001",
    pathId: "-5555996997793013928",
    usesEffectCircle: false,
  },
  skin03: {
    fileName: "tex_simple.png",
    name: "tex_simple",
    pathId: "-7566360462000653723",
    usesEffectCircle: true,
  },
  skin04: {
    fileName: "tex_simple.png",
    name: "tex_simple",
    pathId: "4168229279886204533",
    usesEffectCircle: true,
  },
};

function createTapEffectAssetContract(
  assetBundleName: RecipeTapEffectSkin,
): BandoriTapEffectAssetContract {
  const sourceTexture = TAP_EFFECT_SOURCE_TEXTURES[assetBundleName];
  const root = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/tapeffect/${assetBundleName}`;
  const sourceTextureRoot = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/startapp/ingameskin/tapeffect/${assetBundleName}/textures`;
  const semanticRoot = `effect-textures/ingameskin-tapeffect-${assetBundleName}`;
  const resources: Record<string, string> = {
    [`${semanticRoot}/default-particle-8501139332677272989`]: `${root}/textures/Default-Particle.png`,
    [`${semanticRoot}/${sourceTexture.name}-${sourceTexture.pathId}`]: `${sourceTextureRoot}/${sourceTexture.fileName}`,
  };
  if (sourceTexture.usesEffectCircle) {
    resources[`${semanticRoot}/effect_circle-7323863615175650028`] =
      `${root}/textures/effect_circle.png`;
  }
  return {
    animatedVerticalBeam: null,
    recipes: {
      flick: `${root}/recipes/flick.json`,
      hold: `${root}/recipes/hold.json`,
      normal: `${root}/recipes/normal.json`,
      skill: `${root}/recipes/skill.json`,
    },
    resources,
  };
}

export const BANDORI_NATIVE_TAP_EFFECT_SKINS: readonly BandoriNativeTapEffectSkin[] = [
  {
    assetBundleName: "skin00",
    effects: null,
    id: 0,
  },
  {
    assetBundleName: "skin01",
    effects: createTapEffectAssetContract("skin01"),
    id: 1,
  },
  {
    assetBundleName: "skin02",
    effects: createTapEffectAssetContract("skin02"),
    id: 2,
  },
  {
    assetBundleName: "skin03",
    effects: createTapEffectAssetContract("skin03"),
    id: 3,
  },
  {
    assetBundleName: "skin04",
    effects: createTapEffectAssetContract("skin04"),
    id: 4,
  },
  {
    assetBundleName: null,
    effects: null,
    id: "off",
  },
];

export const BANDORI_NATIVE_TAP_EFFECT_SKIN = BANDORI_NATIVE_TAP_EFFECT_SKINS[0];
