export type BandoriChartEntity = Record<string, unknown> & {
  type: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates only the lossless outer chart envelope. Entity-specific semantics
 * stay in the compiler so unsupported presentation data fails closed instead
 * of being normalized away at the API boundary.
 */
export function parseBandoriChartForSimulator(value: unknown): BandoriChartEntity[] {
  if (!Array.isArray(value)) {
    throw new Error("Bandori chart must be an array");
  }

  return value.map((rawEntity, entityIndex) => {
    if (!isRecord(rawEntity) || typeof rawEntity.type !== "string" || !rawEntity.type) {
      throw new Error(`chart[${entityIndex}] must have a non-empty type`);
    }
    return rawEntity as BandoriChartEntity;
  });
}
