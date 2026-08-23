export type BandoriEffectAnimationClockInput = {
  animationTimeSeconds: number;
  isPlaying: boolean;
  playbackRate: number;
  presentationTimeSeconds: number;
  previousPresentationTimeSeconds: number;
  previousTimelineVersion: number;
  timelineVersion: number;
};

export type BandoriEffectAnimationClockStep = {
  animationDeltaSeconds: number;
  animationTimeSeconds: number;
  didResetTimeline: boolean;
};

/** Keeps stage effect animation on the media clock while preserving 1x wall-clock speed. */
export function advanceBandoriEffectAnimationClock({
  animationTimeSeconds,
  isPlaying,
  playbackRate,
  presentationTimeSeconds,
  previousPresentationTimeSeconds,
  previousTimelineVersion,
  timelineVersion,
}: BandoriEffectAnimationClockInput): BandoriEffectAnimationClockStep {
  if (
    !Number.isFinite(animationTimeSeconds)
    || animationTimeSeconds < 0
    || !Number.isFinite(presentationTimeSeconds)
    || presentationTimeSeconds < 0
    || !Number.isFinite(previousPresentationTimeSeconds)
    || previousPresentationTimeSeconds < 0
    || !Number.isFinite(playbackRate)
    || playbackRate <= 0
    || !Number.isSafeInteger(previousTimelineVersion)
    || previousTimelineVersion < 0
    || !Number.isSafeInteger(timelineVersion)
    || timelineVersion < 0
  ) {
    throw new RangeError("Effect animation clock input is invalid");
  }

  const didResetTimeline = timelineVersion !== previousTimelineVersion
    || presentationTimeSeconds < previousPresentationTimeSeconds;
  if (didResetTimeline) {
    return {
      animationDeltaSeconds: 0,
      animationTimeSeconds: 0,
      didResetTimeline: true,
    };
  }

  const animationDeltaSeconds = isPlaying
    ? (presentationTimeSeconds - previousPresentationTimeSeconds) / playbackRate
    : 0;
  return {
    animationDeltaSeconds,
    animationTimeSeconds: animationTimeSeconds + animationDeltaSeconds,
    didResetTimeline: false,
  };
}
