import type { CompiledBandoriChart } from "@/lib/bandori/chart-simulator/compiler";
import { BANDORI_NATIVE_FIELD_RECT } from "./native-stage-contract";

export const BANDORI_NATIVE_NOTE_SIZE_MIN = 10;
export const BANDORI_NATIVE_NOTE_SIZE_MAX = 200;
export const BANDORI_NATIVE_NOTE_SIZE_DEFAULT = 100;
export const BANDORI_NATIVE_NOTE_SIZE_STEP = 10;

export const BANDORI_NATIVE_SUDDEN_RATE_MIN = 0;
export const BANDORI_NATIVE_SUDDEN_RATE_MAX = 100;
export const BANDORI_NATIVE_SUDDEN_RATE_DEFAULT = 0;
export const BANDORI_NATIVE_SUDDEN_RATE_ADJUSTMENTS = [1, 5] as const;

export type BandoriNativeDirectionalEffectVariant = "normal" | "light";
export const BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANT_DEFAULT = "normal";

export const BANDORI_NATIVE_SUDDEN_LINE_URL =
  "/local/chart-simulator/apk/textures/sudden_line.png";
export const BANDORI_NATIVE_SUDDEN_LINE_BORDER_PIXELS = {
  bottom: 0,
  left: 26,
  right: 26,
  top: 0,
} as const;

const BANDORI_NATIVE_SUDDEN_LINE_BASE_WIDTH = 1.98;
const BANDORI_NATIVE_SUDDEN_LINE_EXPANDING_WIDTH = 105.67;
const BANDORI_NATIVE_SUDDEN_LINE_HEIGHT = 0.3;
const BANDORI_NATIVE_SUDDEN_LINE_SCALE = 10;
const BANDORI_NATIVE_SUDDEN_LINE_TOP_CENTER_Y = 6.6100006103515625;
const BANDORI_NATIVE_SUDDEN_LINE_TRAVEL_Y = 608.3909912109375;

function clampAndAlign(
  value: number,
  minimum: number,
  maximum: number,
  step: number,
): number {
  if (!Number.isFinite(value)) return minimum;
  const clamped = Math.max(minimum, Math.min(maximum, value));
  return Math.round((clamped - minimum) / step) * step + minimum;
}

export function adjustBandoriNativeNoteSize(
  current: number,
  adjustment: number,
): number {
  return clampAndAlign(
    current + adjustment,
    BANDORI_NATIVE_NOTE_SIZE_MIN,
    BANDORI_NATIVE_NOTE_SIZE_MAX,
    BANDORI_NATIVE_NOTE_SIZE_STEP,
  );
}

export function adjustBandoriNativeSuddenRate(
  current: number,
  adjustment: number,
): number {
  return clampAndAlign(
    current + adjustment,
    BANDORI_NATIVE_SUDDEN_RATE_MIN,
    BANDORI_NATIVE_SUDDEN_RATE_MAX,
    1,
  );
}

export function isBandoriNativeMultiRangeChart(
  compiled: CompiledBandoriChart,
): boolean {
  for (let index = 0; index < compiled.notes.times.length; index += 1) {
    if (
      compiled.notes.coverageOffsets[index + 1]
      - compiled.notes.coverageOffsets[index]
      > 1
    ) return true;
  }
  return false;
}

export function getBandoriNativeNoteScale(
  noteSize: number,
  isMultiRangeChart: boolean,
): number {
  const size = isMultiRangeChart
    ? Math.max(80, Math.min(150, noteSize))
    : Math.max(BANDORI_NATIVE_NOTE_SIZE_MIN, Math.min(BANDORI_NATIVE_NOTE_SIZE_MAX, noteSize));
  return size / 100;
}

function getBandoriNativeSuddenRawRatio(rate: number): number {
  return Math.max(
    BANDORI_NATIVE_SUDDEN_RATE_MIN,
    Math.min(BANDORI_NATIVE_SUDDEN_RATE_MAX, rate),
  ) / 100;
}

export function getBandoriNativeSuddenRatio(rate: number): number {
  const rawRatio = getBandoriNativeSuddenRawRatio(rate);
  return rawRatio === 0 ? 0 : 0.05 + 0.95 * rawRatio;
}

export function getBandoriNativeSuddenScreenY(rate: number): number {
  return BANDORI_NATIVE_FIELD_RECT.top
    + BANDORI_NATIVE_FIELD_RECT.height * getBandoriNativeSuddenRatio(rate);
}

export function getBandoriNativeSuddenLineScreenY(rate: number): number {
  return BANDORI_NATIVE_SUDDEN_LINE_TOP_CENTER_Y
    + BANDORI_NATIVE_SUDDEN_LINE_TRAVEL_Y * getBandoriNativeSuddenRatio(rate);
}

export function getBandoriNativeSuddenLineSize(rate: number): Readonly<{
  height: number;
  width: number;
}> {
  // The APK applies the nonzero-biased ratio only to vertical travel; the
  // SpriteRenderer width is driven by the raw setting and its authored scale.
  const nativeWidth = BANDORI_NATIVE_SUDDEN_LINE_BASE_WIDTH
    + BANDORI_NATIVE_SUDDEN_LINE_EXPANDING_WIDTH
    * getBandoriNativeSuddenRawRatio(rate);
  return {
    height: BANDORI_NATIVE_SUDDEN_LINE_HEIGHT * BANDORI_NATIVE_SUDDEN_LINE_SCALE,
    width: nativeWidth * BANDORI_NATIVE_SUDDEN_LINE_SCALE,
  };
}
