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

function toRegionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
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

function getRegionalNumberForExactServer(value: unknown, server: number): number | null {
  if (Array.isArray(value)) {
    return toRegionalFiniteNumber(value[server]);
  }

  return toRegionalFiniteNumber(value);
}

export function getRegionalLevelNumber(
  levels: Record<string, unknown> | undefined,
  level: number,
  server: number,
): number {
  const normalizedLevel = Math.trunc(toFiniteNumber(level, 0));
  for (let currentLevel = normalizedLevel; currentLevel > 0; currentLevel -= 1) {
    const regionalValue = getRegionalNumberForExactServer(levels?.[String(currentLevel)], server);
    if (regionalValue !== null) {
      return regionalValue;
    }
  }

  return 0;
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
