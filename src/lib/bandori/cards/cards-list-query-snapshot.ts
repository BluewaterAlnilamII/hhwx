import { BANDORI_SERVERS, getBandoriServerCode } from "@/lib/bandori-server";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_CATALOG_TYPES,
  BANDORI_CARD_RARITIES,
  type BandoriCardFilterOptions,
} from "./filter";
import type { BandoriCardsPageFilter } from "./cards-page-catalog";

const BANDORI_CARDS_LIST_QUERY_STORAGE_KEY = "hhwx:bandori:cards-list-query:v1";

const BANDORI_CARDS_LIST_QUERY_KEYS = [
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

/** Patch only edited fields so successive browser updates retain earlier selections. */
export function updateBandoriCardsListQuery(
  rawQuery: string,
  patch: Partial<BandoriCardsPageFilter>,
  options: Pick<BandoriCardFilterOptions, "bandIds" | "characterIds">,
): string {
  const params = new URLSearchParams(rawQuery);
  params.delete("server");
  const setList = (
    key: string,
    values: readonly (string | number)[] | undefined,
    defaults: readonly (string | number)[],
  ) => {
    if (values === undefined) return;
    if (values.length === defaults.length && defaults.every((value) => values.includes(value))) {
      params.delete(key);
    } else {
      params.set(key, values.join(","));
    }
  };
  if (patch.query !== undefined) {
    params.delete("id");
    if (patch.query.trim()) params.set("q", patch.query.trim());
    else params.delete("q");
  }
  setList("available", patch.servers?.map(getBandoriServerCode), BANDORI_SERVERS.map(getBandoriServerCode));
  setList("bands", patch.bandIds, options.bandIds);
  setList("attributes", patch.attributes, BANDORI_CARD_ATTRIBUTES);
  setList("rarities", patch.rarities, BANDORI_CARD_RARITIES);
  setList("characters", patch.characterIds, options.characterIds);
  setList("types", patch.types, BANDORI_CARD_CATALOG_TYPES);
  if (patch.sortBy !== undefined) params.set("sort", patch.sortBy);
  if (patch.sortDirection === "desc") params.delete("direction");
  else if (patch.sortDirection !== undefined) params.set("direction", patch.sortDirection);
  return params.toString();
}

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
