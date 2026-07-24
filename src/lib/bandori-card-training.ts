type BandoriCardTrainingMetadata = {
  stat?: {
    training?: unknown;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A training object can exist with only zero values on cards that do not
 * support training. Treat the card as trainable only when Master declares an
 * actual positive training increment.
 */
export function hasTrainedCardArt(
  card: BandoriCardTrainingMetadata | null | undefined,
): boolean {
  const training = card?.stat?.training;
  if (!isRecord(training)) {
    return false;
  }

  return Object.values(training).some((value) => {
    if (typeof value !== "number" && typeof value !== "string") {
      return false;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0;
  });
}
