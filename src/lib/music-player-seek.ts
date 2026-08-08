export type MusicPlayerSeekTarget = {
  currentTime: number;
  duration: number;
  fastSeek?: (time: number) => void;
};

export function clampMusicPlayerSeekPosition(
  positionSeconds: number,
  durationSeconds: number,
): number {
  const safePosition = Number.isFinite(positionSeconds) ? positionSeconds : 0;
  const maximumPosition = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : Number.POSITIVE_INFINITY;
  return Math.min(maximumPosition, Math.max(0, safePosition));
}

export function seekMusicPlayerAudio(
  audio: MusicPlayerSeekTarget,
  positionSeconds: number,
  preferFastSeek = false,
): number {
  const nextPosition = clampMusicPlayerSeekPosition(positionSeconds, audio.duration);
  if (preferFastSeek && typeof audio.fastSeek === "function") {
    audio.fastSeek(nextPosition);
  } else {
    audio.currentTime = nextPosition;
  }
  return nextPosition;
}
