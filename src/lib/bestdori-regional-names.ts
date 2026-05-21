const BESTDORI_CN_THEN_JP_NAME_PREFERENCE_ORDER = [3, 0, 2, 1, 4] as const;

export function pickBestdoriCnThenJpName(
  names: readonly (string | null | undefined)[] | null | undefined,
): string | null {
  if (!Array.isArray(names)) {
    return null;
  }

  const visitedIndexes = new Set<number>();
  for (const index of BESTDORI_CN_THEN_JP_NAME_PREFERENCE_ORDER) {
    visitedIndexes.add(index);
    const name = names[index]?.trim();
    if (name) {
      return name;
    }
  }

  for (let index = 0; index < names.length; index += 1) {
    if (visitedIndexes.has(index)) {
      continue;
    }
    const name = names[index]?.trim();
    if (name) {
      return name;
    }
  }

  return null;
}
