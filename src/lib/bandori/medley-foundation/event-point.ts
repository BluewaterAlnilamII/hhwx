export type MedleyLiveBoostCount = 0 | 1 | 2 | 3;

const MEDLEY_EVENT_POINT_BASE = 100;
const MEDLEY_SCORE_POINT_DIVISOR = 18_500;
const MEDLEY_BOOST_MULTIPLIERS = [3, 15, 30, 45] as const;

export function calculateMedleyEventPoint(
  averageScore: number,
  liveBoostCountPerSong: MedleyLiveBoostCount,
): number {
  const scorePoint = Math.floor(averageScore / MEDLEY_SCORE_POINT_DIVISOR);
  return (scorePoint + MEDLEY_EVENT_POINT_BASE) * MEDLEY_BOOST_MULTIPLIERS[liveBoostCountPerSong];
}
