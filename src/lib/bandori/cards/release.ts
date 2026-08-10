/**
 * Keeps display-time validation independent from picker release ordering.
 * Placeholder dates in 2100 remain meaningful provenance on detail pages even
 * though picker sorting intentionally excludes them as unreleased cards.
 */
export function normalizeBandoriCardDisplayReleaseTimestamp(value: unknown): number | null {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}
