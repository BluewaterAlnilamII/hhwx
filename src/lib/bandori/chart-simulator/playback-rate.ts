export const BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS = 50;
export const BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS = 100;
export const BANDORI_SIMULATOR_PLAYBACK_RATE_DEFAULT_HUNDREDTHS = 100;

const PLAYBACK_RATE_ADJUSTMENTS = new Set([-10, -1, 1, 10]);

function assertPlaybackRateHundredths(playbackRateHundredths: number): void {
  if (
    !Number.isInteger(playbackRateHundredths)
    || playbackRateHundredths < BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS
    || playbackRateHundredths > BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS
  ) {
    throw new RangeError("Simulator playback rate must be a whole percent from 50 through 100");
  }
}

export function getBandoriSimulatorPlaybackRate(
  playbackRateHundredths: number,
): number {
  assertPlaybackRateHundredths(playbackRateHundredths);
  return playbackRateHundredths / 100;
}

export function getBandoriSimulatorNoteApproachTimeScale(
  playbackRateHundredths: number,
): number {
  return getBandoriSimulatorPlaybackRate(playbackRateHundredths);
}

export function adjustBandoriSimulatorPlaybackRate(
  playbackRateHundredths: number,
  adjustmentHundredths: number,
): number {
  assertPlaybackRateHundredths(playbackRateHundredths);
  if (!PLAYBACK_RATE_ADJUSTMENTS.has(adjustmentHundredths)) {
    throw new RangeError("Simulator playback rate adjustment must be ±10 or ±1 percent");
  }
  return Math.min(
    BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS,
    Math.max(
      BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS,
      playbackRateHundredths + adjustmentHundredths,
    ),
  );
}
