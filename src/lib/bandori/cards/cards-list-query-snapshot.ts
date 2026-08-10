const BANDORI_CARDS_LIST_QUERY_STORAGE_KEY = "hhwx:bandori:cards-list-query:v1";

const BANDORI_CARDS_LIST_QUERY_KEYS = [
  "server",
  "id",
  "q",
  "available",
  "bands",
  "attributes",
  "rarities",
  "characters",
  "types",
  "sort",
  "direction",
] as const;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Keeps only query state understood by the Cards list and writes it in a
 * stable order. Empty values are retained because they represent an explicit
 * empty multi-select filter.
 */
export function normalizeBandoriCardsListQuery(rawQuery: string): string {
  const source = new URLSearchParams(rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery);
  const normalized = new URLSearchParams();

  for (const key of BANDORI_CARDS_LIST_QUERY_KEYS) {
    const value = source.get(key);
    if (value !== null) {
      normalized.set(key, value);
    }
  }

  return normalized.toString();
}

export function saveBandoriCardsListQuery(
  rawQuery: string,
  storage: StorageWriter | null = getSessionStorage(),
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(
      BANDORI_CARDS_LIST_QUERY_STORAGE_KEY,
      normalizeBandoriCardsListQuery(rawQuery),
    );
  } catch {
    // Storage can be disabled or unavailable in privacy-restricted contexts.
  }
}

export function readBandoriCardsListQuery(
  storage: StorageReader | null = getSessionStorage(),
): string {
  if (storage === null) {
    return "";
  }

  try {
    return normalizeBandoriCardsListQuery(
      storage.getItem(BANDORI_CARDS_LIST_QUERY_STORAGE_KEY) ?? "",
    );
  } catch {
    return "";
  }
}

export function buildBandoriCardsListHref(query: string): string {
  const normalizedQuery = normalizeBandoriCardsListQuery(query);
  return normalizedQuery
    ? `/bandori/cards?${normalizedQuery}`
    : "/bandori/cards";
}

export function readBandoriCardsListHref(
  storage: StorageReader | null = getSessionStorage(),
): string {
  return buildBandoriCardsListHref(readBandoriCardsListQuery(storage));
}
