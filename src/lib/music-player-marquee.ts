export const MUSIC_PLAYER_MARQUEE_MAX_SPEED_PX_PER_SECOND = 28;
export const MUSIC_PLAYER_MARQUEE_TRAVEL_FRACTION = 0.7;

const MUSIC_PLAYER_MARQUEE_MIN_DURATION_SECONDS = 7;
const MUSIC_PLAYER_MARQUEE_PREFERRED_PIXELS_PER_SECOND = 24;
const MUSIC_PLAYER_MARQUEE_ENDPOINT_PAUSE_SECONDS = 4;

export function calculateMusicPlayerMarqueeDurationSeconds(overflowDistance: number): number {
  const safeDistance = Number.isFinite(overflowDistance)
    ? Math.max(0, overflowDistance)
    : 0;
  const preferredDuration = (
    safeDistance / MUSIC_PLAYER_MARQUEE_PREFERRED_PIXELS_PER_SECOND
    + MUSIC_PLAYER_MARQUEE_ENDPOINT_PAUSE_SECONDS
  );
  const speedLimitedDuration = safeDistance / (
    MUSIC_PLAYER_MARQUEE_MAX_SPEED_PX_PER_SECOND
    * MUSIC_PLAYER_MARQUEE_TRAVEL_FRACTION
  );

  return Math.max(
    MUSIC_PLAYER_MARQUEE_MIN_DURATION_SECONDS,
    preferredDuration,
    speedLimitedDuration,
  );
}
