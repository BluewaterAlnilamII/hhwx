"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { type BandoriCharacterMaster } from "@/lib/bandori/cards/master";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_RARITIES,
  buildBandoriCardFilterOptions,
  reconcileBandoriCardFilterSelection,
} from "@/lib/bandori/cards/filter";
import {
  buildDefaultBandoriProfileCardFilter,
  filterAndSortBandoriProfileCardEntries,
  type BandoriProfileCardEntry,
  type BandoriProfileCardFilterState,
  type BandoriProfileCardSortBy,
} from "@/lib/bandori/cards/profile-card-collection";
import { type BandoriServer } from "@/lib/bandori-server";

export function useBandoriProfileCardFilter({
  entries,
  characters,
  preferredServer,
  contextServer,
  unknownMetadataPolicy,
  getBandLabel,
  getCharacterLabel,
  sortValues,
}: {
  entries: readonly BandoriProfileCardEntry[];
  characters: Readonly<Record<string, BandoriCharacterMaster | null | undefined>>;
  preferredServer: BandoriServer;
  contextServer: BandoriServer;
  unknownMetadataPolicy: "exclude" | "include-when-unfiltered";
  getBandLabel: (bandId: number) => string;
  getCharacterLabel: (characterId: number) => string;
  sortValues: readonly BandoriProfileCardSortBy[];
}) {
  const [storedState, setStoredState] = useState<{
    filter: BandoriProfileCardFilterState;
    availableBandIds: number[];
    availableCharacterIds: number[];
  } | null>(null);
  const { bandOptions, characterOptions, bandIds, characterIds } = useMemo(
    () => buildBandoriCardFilterOptions(characters, {
      preferredServer,
      contextServer,
      getBandLabel,
      getCharacterLabel,
    }),
    [characters, contextServer, getBandLabel, getCharacterLabel, preferredServer],
  );
  const filter = useMemo<BandoriProfileCardFilterState>(() => {
    const defaultSortBy = sortValues[0] ?? "power";
    const defaultFilter = buildDefaultBandoriProfileCardFilter(
      bandIds,
      characterIds,
      contextServer,
      defaultSortBy,
    );
    if (!storedState) return defaultFilter;
    return {
      ...storedState.filter,
      servers: storedState.filter.servers.includes(contextServer) ? [contextServer] : [],
      bandIds: reconcileBandoriCardFilterSelection(
        storedState.filter.bandIds,
        storedState.availableBandIds,
        bandIds,
      ),
      attributes: storedState.filter.attributes.filter((attribute) => BANDORI_CARD_ATTRIBUTES.includes(attribute)),
      rarities: storedState.filter.rarities.filter((rarity) => BANDORI_CARD_RARITIES.includes(rarity)),
      characterIds: reconcileBandoriCardFilterSelection(
        storedState.filter.characterIds,
        storedState.availableCharacterIds,
        characterIds,
      ),
      sortBy: sortValues.includes(storedState.filter.sortBy) ? storedState.filter.sortBy : defaultSortBy,
    };
  }, [bandIds, characterIds, contextServer, sortValues, storedState]);
  const deferredQuery = useDeferredValue(filter.query);
  const filteredEntries = useMemo(() => filterAndSortBandoriProfileCardEntries(
    entries,
    { ...filter, query: deferredQuery },
    {
      availableBandIds: bandIds,
      availableCharacterIds: characterIds,
      unknownMetadataPolicy,
    },
  ), [bandIds, characterIds, deferredQuery, entries, filter, unknownMetadataPolicy]);
  const filterKey = useMemo(() => JSON.stringify({
    query: deferredQuery,
    servers: filter.servers,
    bandIds: filter.bandIds,
    attributes: filter.attributes,
    rarities: filter.rarities,
    characterIds: filter.characterIds,
    sortBy: filter.sortBy,
    sortDirection: filter.sortDirection,
    entryCount: entries.length,
  }), [deferredQuery, entries.length, filter]);

  const updateFilter = useCallback((patch: Partial<BandoriProfileCardFilterState>) => {
    setStoredState({
      filter: { ...filter, ...patch },
      availableBandIds: bandIds,
      availableCharacterIds: characterIds,
    });
  }, [bandIds, characterIds, filter]);
  const resetFilter = useCallback(() => {
    setStoredState(null);
  }, []);

  return {
    filter,
    filteredEntries,
    filterKey,
    bandOptions,
    characterOptions,
    bandIds,
    characterIds,
    updateFilter,
    resetFilter,
  };
}
