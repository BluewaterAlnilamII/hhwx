const APK_ATLAS_SPRITE_ROOT = "/local/chart-simulator/apk/atlas-sprites";
const JUDGE_SKIN_ROOT = "/local/chart-simulator/ingameskin/judgeskin/skin00/atlas-frames";

export const BANDORI_NATIVE_PERFECT_JUDGMENT_URL =
  `${JUDGE_SKIN_ROOT}/judge_perfect.png`;
export const BANDORI_NATIVE_COMBO_UNIT_URL = `${APK_ATLAS_SPRITE_ROOT}/combo.png`;
export const BANDORI_NATIVE_ALL_PERFECT_COMBO_UNIT_URL =
  `${APK_ATLAS_SPRITE_ROOT}/combo_AP.png`;
export const BANDORI_NATIVE_COMBO_DIGIT_URLS = Array.from(
  { length: 10 },
  (_, digit) => `${APK_ATLAS_SPRITE_ROOT}/icon_number_big_${digit}.png`,
) as readonly string[];
export const BANDORI_NATIVE_ALL_PERFECT_COMBO_DIGIT_URLS = Array.from(
  { length: 10 },
  (_, digit) => `${APK_ATLAS_SPRITE_ROOT}/icon_number_big_AP_${digit}.png`,
) as readonly string[];

export const BANDORI_NATIVE_PERFECT_JUDGMENT_POSITION = {
  x: 667,
  y: 535,
} as const;
export const BANDORI_NATIVE_PERFECT_JUDGMENT_PARENT_SCALE = 0.8;
export const BANDORI_NATIVE_PERFECT_JUDGMENT_SIZE = {
  width: 286,
  height: 78,
} as const;
export const BANDORI_NATIVE_PERFECT_JUDGMENT_VISIBLE_SECONDS = 1;

export const BANDORI_NATIVE_COMBO_POSITION = {
  x: 1101.7,
  y: 292.2,
} as const;
export const BANDORI_NATIVE_COMBO_DIGIT_SIZE = {
  width: 82,
  height: 116,
} as const;
export const BANDORI_NATIVE_COMBO_UNIT_POSITION = {
  x: -6,
  y: 72,
} as const;
export const BANDORI_NATIVE_COMBO_UNIT_SIZE = {
  width: 150,
  height: 42,
} as const;

export type BandoriNativePerfectJudgmentSample = {
  alpha: number;
  childScale: number;
  visible: boolean;
};

export type BandoriNativeComboDigitPlacement = {
  digit: number;
  x: number;
};

export function evaluateBandoriNativePerfectJudgment(
  elapsedSeconds: number,
): BandoriNativePerfectJudgmentSample {
  if (elapsedSeconds < 0 || elapsedSeconds >= BANDORI_NATIVE_PERFECT_JUDGMENT_VISIBLE_SECONDS) {
    return { alpha: 0, childScale: 1, visible: false };
  }

  if (elapsedSeconds <= 0.04) {
    const t = elapsedSeconds;
    return {
      alpha: -3124.999756 * t ** 3 + 124.9999924 * t ** 2 + 10 * t + 0.6,
      childScale:
        -3125.000244 * t ** 3
        + 125.0000076 * t ** 2
        + 7.50000048 * t
        + 0.8,
      visible: true,
    };
  }

  if (elapsedSeconds <= 0.08) {
    const u = elapsedSeconds - 0.04;
    return {
      alpha: 3124.999756 * u ** 3 - 249.9999847 * u ** 2 + 5 * u + 1,
      childScale: 3905.316 * u ** 3 - 281.2126 * u ** 2 + 2.5 * u + 1.1,
      visible: true,
    };
  }

  return { alpha: 1, childScale: 1, visible: true };
}

export function getBandoriNativeComboDigitPlacements(
  combo: number,
): readonly BandoriNativeComboDigitPlacement[] {
  if (combo <= 0) return [];

  const digits = String(combo).split("").map(Number);
  const digitCount = digits.length;
  return digits.reverse().map((digit, index) => ({
    digit,
    x: 22 + 35 * digitCount - 70 * (index + 1),
  }));
}

export function evaluateBandoriNativeComboPopScale(elapsedSeconds: number): number {
  if (elapsedSeconds < 0) return 1;
  if (elapsedSeconds <= 1 / 12) {
    return -1036.800049 * elapsedSeconds ** 3
      + 129.6000061 * elapsedSeconds ** 2
      + 0.8;
  }
  if (elapsedSeconds <= 2 / 12) {
    return 1.1 - 1.2 * (elapsedSeconds - 1 / 12);
  }
  return 1;
}

export function evaluateBandoriNativeAllPerfectComboAlpha(
  animationSeconds: number,
): number {
  const duration = 10 / 12;
  const t = ((animationSeconds % duration) + duration) % duration;
  if (t <= 5 / 12) {
    return 13.82400131 * t ** 3 - 8.640000343 * t ** 2 + 1;
  }
  const u = t - 5 / 12;
  return -13.82400131 * u ** 3 + 8.640000343 * u ** 2 + 0.5;
}
