import {
  BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  BANDORI_NATIVE_NOTE_SPEED_MAX,
  BANDORI_NATIVE_NOTE_SPEED_MIN,
  BANDORI_NATIVE_NOTE_SPEED_STEP,
} from "@/lib/bandori/chart-simulator/native-note-presentation";
import {
  BANDORI_SLIDE_JUDGMENT_FRAME_CORRECTION_DEFAULT_TENTHS,
  isBandoriSlideJudgmentFrameCorrectionTenths,
  type BandoriSlideJudgmentFrameCorrectionTenths,
} from "@/lib/bandori/chart-simulator/native-judgment-window-presentation";
import {
  BANDORI_NATIVE_TAP_SE_SKIN,
  BANDORI_NATIVE_TAP_SE_SKINS,
  type BandoriNativeTapSeSkin,
} from "@/lib/bandori/chart-simulator/native-note-sound-presentation";
import {
  BANDORI_SIMULATOR_PLAYBACK_RATE_DEFAULT_HUNDREDTHS,
  BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS,
  BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS,
} from "@/lib/bandori/chart-simulator/playback-rate";
import {
  BANDORI_SIMULATOR_FRAME_RATE_LIMIT_DEFAULT,
  BANDORI_SIMULATOR_RESOLUTION_SCALE_DEFAULT,
  isBandoriSimulatorFrameRateLimit,
  isBandoriSimulatorResolutionScale,
  type BandoriSimulatorFrameRateLimit,
  type BandoriSimulatorResolutionScale,
} from "@/lib/bandori/chart-simulator/render-settings";
import {
  BANDORI_LIMITED_PERFORMANCE_SKINS,
  type BandoriLimitedPerformanceSkin,
} from "./limited-performance-skins";
import {
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS,
  BANDORI_NATIVE_NOTE_SKIN,
  BANDORI_NATIVE_NOTE_SKINS,
  type BandoriNativeDirectionalFlickSkin,
  type BandoriNativeNoteSkin,
} from "./native-note-assets";
import {
  BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANT_DEFAULT,
  BANDORI_NATIVE_NOTE_SIZE_DEFAULT,
  BANDORI_NATIVE_NOTE_SIZE_MAX,
  BANDORI_NATIVE_NOTE_SIZE_MIN,
  BANDORI_NATIVE_SUDDEN_RATE_DEFAULT,
  BANDORI_NATIVE_SUDDEN_RATE_MAX,
  BANDORI_NATIVE_SUDDEN_RATE_MIN,
  BANDORI_NATIVE_VOLUME_DEFAULT,
  BANDORI_NATIVE_VOLUME_MAX,
  BANDORI_NATIVE_VOLUME_MIN,
  type BandoriNativeDirectionalEffectVariant,
} from "./native-live-settings";
import {
  BANDORI_NATIVE_BACKGROUND_SKIN,
  BANDORI_NATIVE_BACKGROUND_SKINS,
  BANDORI_NATIVE_FIELD_SKIN,
  BANDORI_NATIVE_FIELD_SKIN_CHOICES,
  type BandoriNativeBackgroundSkin,
  type BandoriNativeFieldSkin,
} from "./native-stage-contract";
import {
  BANDORI_NATIVE_TAP_EFFECT_SKIN,
  BANDORI_NATIVE_TAP_EFFECT_SKINS,
  type BandoriNativeTapEffectSkin,
} from "./native-tap-effect-assets";

export const BANDORI_CHART_SIMULATOR_PREFERENCES_STORAGE_KEY =
  "hhwx-bandori-chart-simulator-preferences:v1";

type SkinId = number | string;
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export type BandoriChartSimulatorPreferences = Readonly<{
  backgroundSkinId: BandoriNativeBackgroundSkin["id"];
  bgmVolume: number;
  directionalEffectVariant: BandoriNativeDirectionalEffectVariant;
  directionalFlickSkinId: BandoriNativeDirectionalFlickSkin["id"];
  fieldSkinId: BandoriNativeFieldSkin["id"];
  frameRateLimit: BandoriSimulatorFrameRateLimit;
  isBgmMuted: boolean;
  isLaneEffectEnabled: boolean;
  isMirrored: boolean;
  isGreatJudgmentWindowEnabled: boolean;
  isPerfectJudgmentWindowEnabled: boolean;
  isRhythmSupportEnabled: boolean;
  isSeMuted: boolean;
  isSuddenLaneEnabled: boolean;
  isSyncLineEnabled: boolean;
  limitedPerformanceSkinId: BandoriLimitedPerformanceSkin["id"] | null;
  noteSize: number;
  noteSkinId: BandoriNativeNoteSkin["id"];
  noteSpeed: number;
  playbackRateHundredths: number;
  resolutionScale: BandoriSimulatorResolutionScale;
  seVolume: number;
  slideJudgmentFrameCorrectionTenths: BandoriSlideJudgmentFrameCorrectionTenths;
  suddenRate: number;
  tapEffectSkinId: BandoriNativeTapEffectSkin["id"];
  tapSeSkinId: BandoriNativeTapSeSkin["id"];
}>;

export function createDefaultBandoriChartSimulatorPreferences(): BandoriChartSimulatorPreferences {
  return {
    backgroundSkinId: BANDORI_NATIVE_BACKGROUND_SKIN.id,
    bgmVolume: BANDORI_NATIVE_VOLUME_DEFAULT,
    directionalEffectVariant: BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANT_DEFAULT,
    directionalFlickSkinId: BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN.id,
    fieldSkinId: BANDORI_NATIVE_FIELD_SKIN.id,
    frameRateLimit: BANDORI_SIMULATOR_FRAME_RATE_LIMIT_DEFAULT,
    isBgmMuted: false,
    isLaneEffectEnabled: true,
    isMirrored: false,
    isGreatJudgmentWindowEnabled: false,
    isPerfectJudgmentWindowEnabled: false,
    isRhythmSupportEnabled: true,
    isSeMuted: false,
    isSuddenLaneEnabled: false,
    isSyncLineEnabled: true,
    limitedPerformanceSkinId: null,
    noteSize: BANDORI_NATIVE_NOTE_SIZE_DEFAULT,
    noteSkinId: BANDORI_NATIVE_NOTE_SKIN.id,
    noteSpeed: BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
    playbackRateHundredths: BANDORI_SIMULATOR_PLAYBACK_RATE_DEFAULT_HUNDREDTHS,
    resolutionScale: BANDORI_SIMULATOR_RESOLUTION_SCALE_DEFAULT,
    seVolume: BANDORI_NATIVE_VOLUME_DEFAULT,
    slideJudgmentFrameCorrectionTenths:
      BANDORI_SLIDE_JUDGMENT_FRAME_CORRECTION_DEFAULT_TENTHS,
    suddenRate: BANDORI_NATIVE_SUDDEN_RATE_DEFAULT,
    tapEffectSkinId: BANDORI_NATIVE_TAP_EFFECT_SKIN.id,
    tapSeSkinId: BANDORI_NATIVE_TAP_SE_SKIN.id,
  };
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function normalizeNoteSpeed(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(
    BANDORI_NATIVE_NOTE_SPEED_MAX,
    Math.max(BANDORI_NATIVE_NOTE_SPEED_MIN, value),
  );
  return Math.round(clamped / BANDORI_NATIVE_NOTE_SPEED_STEP)
    * BANDORI_NATIVE_NOTE_SPEED_STEP;
}

function normalizeSkinId<TChoice extends Readonly<{ id: SkinId }>>(
  value: unknown,
  choices: readonly TChoice[],
  fallback: TChoice["id"],
): TChoice["id"] {
  return choices.some((choice) => choice.id === value)
    ? value as TChoice["id"]
    : fallback;
}

function normalizeLimitedPerformanceSkinId(
  value: unknown,
): BandoriLimitedPerformanceSkin["id"] | null {
  if (value === null) return null;
  return BANDORI_LIMITED_PERFORMANCE_SKINS.some((skin) => skin.id === value)
    ? value as BandoriLimitedPerformanceSkin["id"]
    : null;
}

function normalizeDirectionalEffectVariant(
  value: unknown,
): BandoriNativeDirectionalEffectVariant {
  return value === "normal" || value === "light" || value === "off"
    ? value
    : BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANT_DEFAULT;
}

export function normalizeBandoriChartSimulatorPreferences(
  value: unknown,
): BandoriChartSimulatorPreferences {
  const defaults = createDefaultBandoriChartSimulatorPreferences();
  if (typeof value !== "object" || value === null) return defaults;
  const record = value as Record<string, unknown>;
  const isGreatJudgmentWindowEnabled = normalizeBoolean(
    record.isGreatJudgmentWindowEnabled,
    defaults.isGreatJudgmentWindowEnabled,
  );
  const isPerfectJudgmentWindowEnabled = isGreatJudgmentWindowEnabled
    || normalizeBoolean(
      record.isPerfectJudgmentWindowEnabled,
      defaults.isPerfectJudgmentWindowEnabled,
    );
  return {
    backgroundSkinId: normalizeSkinId(
      record.backgroundSkinId,
      BANDORI_NATIVE_BACKGROUND_SKINS,
      defaults.backgroundSkinId,
    ),
    bgmVolume: normalizeInteger(
      record.bgmVolume,
      BANDORI_NATIVE_VOLUME_MIN,
      BANDORI_NATIVE_VOLUME_MAX,
      defaults.bgmVolume,
    ),
    directionalEffectVariant: normalizeDirectionalEffectVariant(
      record.directionalEffectVariant,
    ),
    directionalFlickSkinId: normalizeSkinId(
      record.directionalFlickSkinId,
      BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS,
      defaults.directionalFlickSkinId,
    ),
    fieldSkinId: normalizeSkinId(
      record.fieldSkinId,
      BANDORI_NATIVE_FIELD_SKIN_CHOICES,
      defaults.fieldSkinId,
    ),
    frameRateLimit: isBandoriSimulatorFrameRateLimit(record.frameRateLimit)
      ? record.frameRateLimit
      : defaults.frameRateLimit,
    isBgmMuted: normalizeBoolean(record.isBgmMuted, defaults.isBgmMuted),
    isLaneEffectEnabled: normalizeBoolean(
      record.isLaneEffectEnabled,
      defaults.isLaneEffectEnabled,
    ),
    isMirrored: normalizeBoolean(record.isMirrored, defaults.isMirrored),
    isGreatJudgmentWindowEnabled,
    isPerfectJudgmentWindowEnabled,
    isRhythmSupportEnabled: normalizeBoolean(
      record.isRhythmSupportEnabled,
      defaults.isRhythmSupportEnabled,
    ),
    isSeMuted: normalizeBoolean(record.isSeMuted, defaults.isSeMuted),
    isSuddenLaneEnabled: normalizeBoolean(
      record.isSuddenLaneEnabled,
      defaults.isSuddenLaneEnabled,
    ),
    isSyncLineEnabled: normalizeBoolean(
      record.isSyncLineEnabled,
      defaults.isSyncLineEnabled,
    ),
    limitedPerformanceSkinId: normalizeLimitedPerformanceSkinId(
      record.limitedPerformanceSkinId,
    ),
    noteSize: normalizeInteger(
      record.noteSize,
      BANDORI_NATIVE_NOTE_SIZE_MIN,
      BANDORI_NATIVE_NOTE_SIZE_MAX,
      defaults.noteSize,
    ),
    noteSkinId: normalizeSkinId(
      record.noteSkinId,
      BANDORI_NATIVE_NOTE_SKINS,
      defaults.noteSkinId,
    ),
    noteSpeed: normalizeNoteSpeed(record.noteSpeed, defaults.noteSpeed),
    playbackRateHundredths: normalizeInteger(
      record.playbackRateHundredths,
      BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS,
      BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS,
      defaults.playbackRateHundredths,
    ),
    resolutionScale: isBandoriSimulatorResolutionScale(record.resolutionScale)
      ? record.resolutionScale
      : defaults.resolutionScale,
    seVolume: normalizeInteger(
      record.seVolume,
      BANDORI_NATIVE_VOLUME_MIN,
      BANDORI_NATIVE_VOLUME_MAX,
      defaults.seVolume,
    ),
    slideJudgmentFrameCorrectionTenths:
      isBandoriSlideJudgmentFrameCorrectionTenths(
        record.slideJudgmentFrameCorrectionTenths,
      )
        ? record.slideJudgmentFrameCorrectionTenths
        : defaults.slideJudgmentFrameCorrectionTenths,
    suddenRate: normalizeInteger(
      record.suddenRate,
      BANDORI_NATIVE_SUDDEN_RATE_MIN,
      BANDORI_NATIVE_SUDDEN_RATE_MAX,
      defaults.suddenRate,
    ),
    tapEffectSkinId: normalizeSkinId(
      record.tapEffectSkinId,
      BANDORI_NATIVE_TAP_EFFECT_SKINS,
      defaults.tapEffectSkinId,
    ),
    tapSeSkinId: normalizeSkinId(
      record.tapSeSkinId,
      BANDORI_NATIVE_TAP_SE_SKINS,
      defaults.tapSeSkinId,
    ),
  };
}

export function readBandoriChartSimulatorPreferences(
  storage: PreferenceStorage | null,
): BandoriChartSimulatorPreferences {
  if (!storage) return createDefaultBandoriChartSimulatorPreferences();
  try {
    const rawValue = storage.getItem(BANDORI_CHART_SIMULATOR_PREFERENCES_STORAGE_KEY);
    return normalizeBandoriChartSimulatorPreferences(
      rawValue === null ? null : JSON.parse(rawValue),
    );
  } catch {
    return createDefaultBandoriChartSimulatorPreferences();
  }
}

export function writeBandoriChartSimulatorPreferences(
  storage: PreferenceStorage | null,
  preferences: BandoriChartSimulatorPreferences,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      BANDORI_CHART_SIMULATOR_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizeBandoriChartSimulatorPreferences(preferences)),
    );
  } catch {
    // Preferences are optional; the current simulator session remains usable.
  }
}
