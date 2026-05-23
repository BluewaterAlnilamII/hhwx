/*
 * Small pure helpers shared by teambuilder modules.
 *
 * Keep this file generic: anything that knows about Bandori cards, events, or scoring belongs
 * in a domain module instead of here.
 */
export function toFiniteNumber(value: unknown, fallback = 0): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function toPositiveInteger(value: unknown, fallback: number): number {
  const numberValue = Math.trunc(toFiniteNumber(value, fallback));
  return numberValue > 0 ? numberValue : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getRegionalNumber(value: unknown, server: number): number {
  if (Array.isArray(value)) {
    return toFiniteNumber(value[server], toFiniteNumber(value[0], 0));
  }

  return toFiniteNumber(value, 0);
}

export function buildPermutations(values: number[]): number[][] {
  if (values.length <= 1) {
    return [values];
  }

  return values.flatMap((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    return buildPermutations(rest).map((permutation) => [value, ...permutation]);
  });
}
