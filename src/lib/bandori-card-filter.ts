import { BANDORI_CHARACTER_GROUPS, compareBandoriCharacterIds } from "@/lib/bandori-character-groups";
import {
  pickBandoriCharacterDisplayName,
  type BandoriCharacterMaster,
} from "@/lib/bandori-card-master";
import {
  BANDORI_SERVERS,
  getBandoriServerCode,
  getBandoriServerFromCode,
  type BandoriServer,
  type BandoriServerCode,
} from "@/lib/bandori-server";

export type BandoriCardAttribute = "powerful" | "pure" | "cool" | "happy";

export const BANDORI_CARD_ATTRIBUTES: BandoriCardAttribute[] = [
  "powerful",
  "cool",
  "happy",
  "pure",
];
export const BANDORI_CARD_RARITIES = [1, 2, 3, 4, 5];

const BANDORI_CARD_ATTRIBUTE_SET = new Set<string>(BANDORI_CARD_ATTRIBUTES);
const BANDORI_BAND_LABELS = new Map(BANDORI_CHARACTER_GROUPS.map((group) => [group.bandId, group.label]));
const BANDORI_CARD_PLACEHOLDER_RELEASE_CUTOFF_TIMESTAMP = Date.UTC(2100, 0, 1);

export type BandoriCardReleaseSortBy = `release_${BandoriServerCode}`;
export type BandoriCardSortBy = "power" | "id" | BandoriCardReleaseSortBy;
export type BandoriCardPickerSortBy = Exclude<BandoriCardSortBy, "power">;

const BANDORI_CARD_RELEASE_SORT_VALUES = [
  "release_jp",
  "release_en",
  "release_tw",
  "release_cn",
] as const satisfies readonly BandoriCardReleaseSortBy[];

export function getBandoriCardReleaseSortBy(server: BandoriServer): BandoriCardReleaseSortBy {
  return `release_${getBandoriServerCode(server)}`;
}

export function getBandoriCardReleaseSortServer(sortBy: string): BandoriServer | null {
  return sortBy.startsWith("release_")
    ? getBandoriServerFromCode(sortBy.slice("release_".length))
    : null;
}

export function normalizeBandoriCardReleaseSortTimestamp(value: unknown): number {
  const timestamp = Number(value);
  return Number.isFinite(timestamp)
    && timestamp > 0
    && timestamp < BANDORI_CARD_PLACEHOLDER_RELEASE_CUTOFF_TIMESTAMP
    ? timestamp
    : 0;
}

export function isBandoriCardPickerSortBy(value: unknown): value is BandoriCardPickerSortBy {
  return value === "id"
    || (typeof value === "string" && getBandoriCardReleaseSortServer(value) !== null);
}

export function isBandoriCardAttribute(value: unknown): value is BandoriCardAttribute {
  return typeof value === "string" && BANDORI_CARD_ATTRIBUTE_SET.has(value);
}

export function buildBandoriCardSortValues(options: {
  shouldIncludePower: true;
  contextServer?: BandoriServer | null;
}): BandoriCardSortBy[];
export function buildBandoriCardSortValues(options: {
  shouldIncludePower: false;
  contextServer?: BandoriServer | null;
}): BandoriCardPickerSortBy[];
export function buildBandoriCardSortValues({
  shouldIncludePower,
  contextServer,
}: {
  shouldIncludePower: boolean;
  contextServer?: BandoriServer | null;
}): BandoriCardSortBy[] {
  if (contextServer === undefined || contextServer === null) {
    return [
      ...(shouldIncludePower ? ["power" as const] : []),
      "id",
      ...BANDORI_CARD_RELEASE_SORT_VALUES,
    ];
  }
  const currentServerRelease = getBandoriCardReleaseSortBy(contextServer);
  return [
    ...(shouldIncludePower ? ["power" as const] : []),
    "id",
    "release_jp",
    ...(currentServerRelease === "release_jp" ? [] : [currentServerRelease]),
  ];
}

export type BandoriCardFilterState<TSortBy extends string> = {
  query: string;
  servers: BandoriServer[];
  bandIds: number[];
  attributes: BandoriCardAttribute[];
  rarities: number[];
  characterIds: number[];
  sortBy: TSortBy;
  sortDirection: "asc" | "desc";
};

export type BandoriCardFilterOptions = {
  bandOptions: Array<{ bandId: number; label: string }>;
  characterOptions: Array<{ characterId: number; label: string }>;
  bandIds: number[];
  characterIds: number[];
};

export type BandoriCardFilterFallbackLabels = {
  getBandLabel: (bandId: number) => string;
  getCharacterLabel: (characterId: number) => string;
};

export type BandoriCardFilterOptionContext = BandoriCardFilterFallbackLabels & {
  preferredServer: BandoriServer;
  contextServer?: BandoriServer | null;
};

export type BandoriCardFilterSelection = {
  query: string;
  servers: Set<BandoriServer>;
  bandIds: Set<number>;
  attributes: Set<BandoriCardAttribute>;
  rarities: Set<number>;
  characterIds: Set<number>;
};

export type BandoriCardFilterEntryFields = {
  availableServers: readonly BandoriServer[];
  bandId: number | null;
  attribute: BandoriCardAttribute | null;
  rarity: number | null;
  characterId: number | null;
};

export type BandoriCardFilterUnknownFieldPolicy = {
  shouldIncludeUnknownBand?: boolean;
  shouldIncludeUnknownAttribute?: boolean;
  shouldIncludeUnknownRarity?: boolean;
  shouldIncludeUnknownCharacter?: boolean;
};

export function reconcileBandoriCardFilterSelection<T>(
  selectedValues: readonly T[],
  previousAvailableValues: readonly T[],
  availableValues: readonly T[],
): T[] {
  const selectedSet = new Set(selectedValues);
  const wasAllSelected = previousAvailableValues.every((value) => selectedSet.has(value));
  if (wasAllSelected) {
    return [...availableValues];
  }
  const availableSet = new Set(availableValues);
  return selectedValues.filter((value) => availableSet.has(value));
}

export function buildBandoriCardFilterSelection(
  filter: Pick<BandoriCardFilterState<string>, "query" | "servers" | "bandIds" | "attributes" | "rarities" | "characterIds">,
): BandoriCardFilterSelection {
  return {
    query: filter.query.trim().toLowerCase(),
    servers: new Set(filter.servers ?? BANDORI_SERVERS),
    bandIds: new Set(filter.bandIds),
    attributes: new Set(filter.attributes),
    rarities: new Set(filter.rarities),
    characterIds: new Set(filter.characterIds),
  };
}

export function matchesBandoriCardFilterSelection(
  entry: BandoriCardFilterEntryFields,
  selection: BandoriCardFilterSelection,
  unknownFieldPolicy: BandoriCardFilterUnknownFieldPolicy = {},
): boolean {
  if (
    entry.availableServers
    && !entry.availableServers.some((server) => selection.servers.has(server))
  ) return false;
  if (entry.bandId === null
    ? !unknownFieldPolicy.shouldIncludeUnknownBand
    : !selection.bandIds.has(entry.bandId)) return false;
  if (entry.attribute === null
    ? !unknownFieldPolicy.shouldIncludeUnknownAttribute
    : !selection.attributes.has(entry.attribute)) return false;
  if (entry.rarity === null
    ? !unknownFieldPolicy.shouldIncludeUnknownRarity
    : !selection.rarities.has(entry.rarity)) return false;
  if (entry.characterId === null
    ? !unknownFieldPolicy.shouldIncludeUnknownCharacter
    : !selection.characterIds.has(entry.characterId)) return false;
  return true;
}

export function getBandoriCardFilterServers(contextServer?: BandoriServer | null): BandoriServer[] {
  return contextServer === undefined || contextServer === null
    ? [...BANDORI_SERVERS]
    : [contextServer];
}

export function buildBandoriCardFilterOptions(
  characters: Readonly<Record<string, BandoriCharacterMaster | null | undefined>>,
  context: BandoriCardFilterOptionContext,
): BandoriCardFilterOptions {
  const bandIdSet = new Set<number>();
  const characterOptions: Array<{ characterId: number; label: string }> = [];
  Object.entries(characters).forEach(([rawCharacterId, character]) => {
    const characterId = Number(rawCharacterId);
    if (!Number.isInteger(characterId) || characterId <= 0 || !character) {
      return;
    }
    const bandId = Number(character.bandId);
    if (Number.isInteger(bandId) && bandId > 0) {
      bandIdSet.add(bandId);
    }
    characterOptions.push({
      characterId,
      label: pickBandoriCharacterDisplayName(
        character,
        context.preferredServer,
        context.contextServer,
        context.getCharacterLabel(characterId),
      ),
    });
  });
  const bandIds = Array.from(bandIdSet).sort((left, right) => left - right);
  characterOptions.sort((left, right) => compareBandoriCharacterIds(left.characterId, right.characterId));
  return {
    bandOptions: bandIds.map((bandId) => ({
      bandId,
      label: BANDORI_BAND_LABELS.get(bandId) ?? context.getBandLabel(bandId),
    })),
    characterOptions,
    bandIds,
    characterIds: characterOptions.map((option) => option.characterId),
  };
}
