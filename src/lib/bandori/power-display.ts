/** Display only: preserve the original power for scoring and search. */
export function getBandoriPowerDisplayValue(power: number): number {
  return Math.trunc(Math.fround(power));
}

/** Native Enumerable.Sum(float): double accumulation, float result, then truncate. */
export function getBandoriTotalPowerDisplayValue(powers: readonly number[]): number {
  return getBandoriPowerDisplayValue(powers.reduce((sum, power) => sum + Math.fround(power), 0));
}
