export const BANDORI_SIMULATOR_FRAME_RATE_LIMIT_OPTIONS = [
  30,
  60,
  90,
  120,
  144,
  180,
  240,
  null,
] as const;

export type BandoriSimulatorFrameRateLimit =
  typeof BANDORI_SIMULATOR_FRAME_RATE_LIMIT_OPTIONS[number];

export const BANDORI_SIMULATOR_FRAME_RATE_LIMIT_DEFAULT:
  BandoriSimulatorFrameRateLimit = null;

export const BANDORI_SIMULATOR_RESOLUTION_SCALE_OPTIONS = [
  50,
  75,
  100,
  125,
  150,
  175,
  200,
] as const;

export type BandoriSimulatorResolutionScale =
  typeof BANDORI_SIMULATOR_RESOLUTION_SCALE_OPTIONS[number];

export const BANDORI_SIMULATOR_RESOLUTION_SCALE_DEFAULT:
  BandoriSimulatorResolutionScale = 100;

export function isBandoriSimulatorFrameRateLimit(
  value: unknown,
): value is BandoriSimulatorFrameRateLimit {
  return BANDORI_SIMULATOR_FRAME_RATE_LIMIT_OPTIONS.some(
    (option) => option === value,
  );
}

export function isBandoriSimulatorResolutionScale(
  value: unknown,
): value is BandoriSimulatorResolutionScale {
  return BANDORI_SIMULATOR_RESOLUTION_SCALE_OPTIONS.some(
    (option) => option === value,
  );
}

export function getBandoriSimulatorRendererResolution(
  devicePixelRatio: number,
  resolutionScale: BandoriSimulatorResolutionScale,
): number {
  const baseResolution = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? Math.min(devicePixelRatio, 2)
    : 1;
  return baseResolution * resolutionScale / 100;
}

export function getBandoriSimulatorTickerMaxFps(
  frameRateLimit: BandoriSimulatorFrameRateLimit,
): number {
  return frameRateLimit ?? 0;
}
