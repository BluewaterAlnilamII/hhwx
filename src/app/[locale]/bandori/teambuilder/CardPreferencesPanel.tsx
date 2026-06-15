"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ChevronDown, ListFilter, Plus, Sparkles, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import VirtualizedBandoriCardGrid from "@/components/bandori/VirtualizedBandoriCardGrid";
import { type AppLocale } from "@/i18n/routing";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { BANDORI_CHARACTER_GROUPS, compareBandoriCharacterIds } from "@/lib/bandori-character-groups";
import { type BandoriCharacterBonusState } from "@/lib/bandori-team-calculator";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";
import {
  CARD_PARAMETER_RARITY_THRESHOLD_OPTIONS,
  DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES,
  normalizeRarityThreshold,
  type OwnedCardParameterPreferences,
  type TeamBuilderCardPreferences,
  type TemporaryGameProfileCard,
} from "./card-preferences";
import ExcludedCardFilterControls, {
  CARD_FILTER_ATTRIBUTE_VALUES,
  CARD_FILTER_RARITY_OPTIONS,
  buildDefaultExcludedCardFilter,
  readCardReleaseTimestamp,
  type TeamBuilderExcludedCardFilterState,
} from "./ExcludedCardFilterControls";
import TeamBuilderPreferenceCardTile from "./TeamBuilderPreferenceCardTile";
import {
  buildPreferenceCardEntry,
  type TeamBuilderPreferenceCardEntry,
  type TeamBuilderPreferenceCardMetadata,
  type TeamBuilderPreferenceCharacterMaster,
  type TeamBuilderPreferenceSkillMaster,
  useTeamBuilderPreferenceCardEntries,
} from "./useTeamBuilderPreferenceCardEntries";

const EXCLUDED_PROFILE_CARD_INITIAL_VISIBLE_COUNT = 60;
const EXCLUDED_PROFILE_CARD_VISIBLE_INCREMENT = 60;
export type TeamBuilderCardPreferencesPanelProps = {
  cacheScopeKey: string;
  profileCards: UserGameProfileCardRecord[];
  preferences: TeamBuilderCardPreferences;
  cardMetadata: Record<string, TeamBuilderPreferenceCardMetadata | undefined>;
  characters: Record<string, TeamBuilderPreferenceCharacterMaster | undefined>;
  skills: Record<string, TeamBuilderPreferenceSkillMaster | undefined>;
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>;
  assetRegion: BandoriAssetRegion;
  currentEventBonusCardCount: number;
  addingCurrentEventCards: boolean;
  temporaryCardActionError: string;
  temporaryCardActionNotice: string;
  onAddTemporary: () => void;
  onAddCurrentEventCards: () => void;
  onEditTemporary: (instanceId: string) => void;
  onClearTemporaryCards: () => void;
  onUpdateOwnedCardParameters: (patch: Partial<OwnedCardParameterPreferences>) => void;
  onToggleExcludedCard: (cardId: number) => void;
  onBulkSetExcludedCards: (cardIds: number[], excluded: boolean) => void;
};

export default function TeamBuilderCardPreferencesPanel({
  cacheScopeKey,
  profileCards,
  preferences,
  cardMetadata,
  characters,
  skills,
  characterBonusesById,
  assetRegion,
  currentEventBonusCardCount,
  addingCurrentEventCards,
  temporaryCardActionError,
  temporaryCardActionNotice,
  onAddTemporary,
  onAddCurrentEventCards,
  onEditTemporary,
  onClearTemporaryCards,
  onUpdateOwnedCardParameters,
  onToggleExcludedCard,
  onBulkSetExcludedCards,
}: TeamBuilderCardPreferencesPanelProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("bandori.teamBuilder.preferences");
  const excludedCardIdSet = useMemo(
    () => new Set(preferences.excludedCardIds),
    [preferences.excludedCardIds],
  );
  const [excludedFiltersOpen, setExcludedFiltersOpen] = useState(false);
  const [excludedCardFilter, setExcludedCardFilter] = useState<TeamBuilderExcludedCardFilterState | null>(null);
  const [visibleExcludedProfileCardState, setVisibleExcludedProfileCardState] = useState({
    key: "",
    count: EXCLUDED_PROFILE_CARD_INITIAL_VISIBLE_COUNT,
  });

  const {
    entries: profileCardEntries,
    ready: profileCardEntriesReady,
  } = useTeamBuilderPreferenceCardEntries({
    cacheScopeKey,
    locale,
    profileCards,
    cardMetadata,
    characters,
    skills,
    characterBonusesById,
  });

  const temporaryCardEntries = useMemo(() => preferences.temporaryCards.map((card) => ({
    ...buildPreferenceCardEntry(
      card,
      cardMetadata,
      characters,
      skills,
      characterBonusesById,
      locale,
    ),
    card,
  } satisfies TeamBuilderPreferenceCardEntry & { card: TemporaryGameProfileCard })), [cardMetadata, characterBonusesById, characters, locale, preferences.temporaryCards, skills]);

  const bandOptions = useMemo(() => {
    const knownLabels = new Map(BANDORI_CHARACTER_GROUPS.map((group) => [group.bandId, group.label]));
    return Array.from(new Set(profileCardEntries.flatMap((entry) => entry.bandId === null ? [] : [entry.bandId])))
      .sort((left, right) => left - right)
      .map((bandId) => ({
        bandId,
        label: knownLabels.get(bandId) ?? `Band ${bandId}`,
      }));
  }, [profileCardEntries]);
  const characterOptions = useMemo(() => {
    const labelByCharacterId = new Map<number, string>();
    profileCardEntries.forEach((entry) => {
      if (entry.characterId !== null && !labelByCharacterId.has(entry.characterId)) {
        labelByCharacterId.set(entry.characterId, entry.characterName || `Character ${entry.characterId}`);
      }
    });
    return Array.from(labelByCharacterId.entries())
      .map(([characterId, label]) => ({ characterId, label }))
      .sort((left, right) => compareBandoriCharacterIds(left.characterId, right.characterId));
  }, [profileCardEntries]);
  const bandIds = useMemo(() => bandOptions.map((option) => option.bandId), [bandOptions]);
  const characterIds = useMemo(() => characterOptions.map((option) => option.characterId), [characterOptions]);
  const excludedFilterBandIds = excludedCardFilter?.bandIds;
  const excludedFilterAttributes = excludedCardFilter?.attributes;
  const excludedFilterRarities = excludedCardFilter?.rarities;
  const excludedFilterCharacterIds = excludedCardFilter?.characterIds;
  const excludedFilterSortBy = excludedCardFilter?.sortBy;
  const excludedFilterSortDirection = excludedCardFilter?.sortDirection;

  const effectiveExcludedCardFilterCriteria = useMemo(() => {
    const defaultFilter = excludedFilterBandIds ? null : buildDefaultExcludedCardFilter(bandIds, characterIds);
    return {
      bandIds: (excludedFilterBandIds ?? defaultFilter?.bandIds ?? []).filter((bandId) => bandIds.includes(bandId)),
      attributes: (excludedFilterAttributes ?? defaultFilter?.attributes ?? [])
        .filter((attribute) => CARD_FILTER_ATTRIBUTE_VALUES.includes(attribute)),
      rarities: (excludedFilterRarities ?? defaultFilter?.rarities ?? [])
        .filter((rarity) => CARD_FILTER_RARITY_OPTIONS.includes(rarity)),
      characterIds: (excludedFilterCharacterIds ?? defaultFilter?.characterIds ?? [])
        .filter((characterId) => characterIds.includes(characterId)),
      sortBy: excludedFilterSortBy ?? defaultFilter?.sortBy ?? "power",
      sortDirection: excludedFilterSortDirection ?? defaultFilter?.sortDirection ?? "desc",
    };
  }, [
    bandIds,
    characterIds,
    excludedFilterAttributes,
    excludedFilterBandIds,
    excludedFilterCharacterIds,
    excludedFilterRarities,
    excludedFilterSortBy,
    excludedFilterSortDirection,
  ]);
  const effectiveExcludedCardFilter = useMemo(() => ({
    query: excludedCardFilter?.query ?? "",
    ...effectiveExcludedCardFilterCriteria,
  }), [effectiveExcludedCardFilterCriteria, excludedCardFilter?.query]);
  const effectiveExcludedCardFilterSets = useMemo(() => ({
    bandIds: new Set(effectiveExcludedCardFilterCriteria.bandIds),
    attributes: new Set(effectiveExcludedCardFilterCriteria.attributes),
    rarities: new Set(effectiveExcludedCardFilterCriteria.rarities),
    characterIds: new Set(effectiveExcludedCardFilterCriteria.characterIds),
  }), [
    effectiveExcludedCardFilterCriteria.attributes,
    effectiveExcludedCardFilterCriteria.bandIds,
    effectiveExcludedCardFilterCriteria.characterIds,
    effectiveExcludedCardFilterCriteria.rarities,
  ]);
  const deferredExcludedQuery = useDeferredValue(effectiveExcludedCardFilter.query);
  const excludedCardFilterKey = useMemo(
    () => JSON.stringify({
      query: deferredExcludedQuery,
      bandIds: effectiveExcludedCardFilterCriteria.bandIds,
      attributes: effectiveExcludedCardFilterCriteria.attributes,
      rarities: effectiveExcludedCardFilterCriteria.rarities,
      characterIds: effectiveExcludedCardFilterCriteria.characterIds,
      sortBy: effectiveExcludedCardFilterCriteria.sortBy,
      sortDirection: effectiveExcludedCardFilterCriteria.sortDirection,
      profileCardCount: profileCards.length,
    }),
    [
      deferredExcludedQuery,
      effectiveExcludedCardFilterCriteria.attributes,
      effectiveExcludedCardFilterCriteria.bandIds,
      effectiveExcludedCardFilterCriteria.characterIds,
      effectiveExcludedCardFilterCriteria.rarities,
      effectiveExcludedCardFilterCriteria.sortBy,
      effectiveExcludedCardFilterCriteria.sortDirection,
      profileCards.length,
    ],
  );

  const updateExcludedCardFilter = (patch: Partial<TeamBuilderExcludedCardFilterState>) => {
    setExcludedCardFilter((current) => ({
      ...(current ?? buildDefaultExcludedCardFilter(bandIds, characterIds)),
      ...patch,
    }));
  };

  const filteredProfileCardEntries = useMemo(() => {
    if (
      effectiveExcludedCardFilterCriteria.bandIds.length === 0
      || effectiveExcludedCardFilterCriteria.attributes.length === 0
      || effectiveExcludedCardFilterCriteria.rarities.length === 0
      || effectiveExcludedCardFilterCriteria.characterIds.length === 0
    ) {
      return [];
    }

    const query = deferredExcludedQuery.trim().toLowerCase();
    const direction = effectiveExcludedCardFilterCriteria.sortDirection === "asc" ? 1 : -1;
    return profileCardEntries.filter((entry) => {
      if (query && !entry.searchText.includes(query)) {
        return false;
      }
      if (entry.bandId === null || !effectiveExcludedCardFilterSets.bandIds.has(entry.bandId)) {
        return false;
      }
      if (entry.attribute === null || !effectiveExcludedCardFilterSets.attributes.has(entry.attribute)) {
        return false;
      }
      if (entry.rarity === null || !effectiveExcludedCardFilterSets.rarities.has(entry.rarity)) {
        return false;
      }
      if (entry.characterId === null || !effectiveExcludedCardFilterSets.characterIds.has(entry.characterId)) {
        return false;
      }
      if (effectiveExcludedCardFilterCriteria.sortBy === "release_cn" && readCardReleaseTimestamp(entry.metadata, "release_cn") <= 0) {
        return false;
      }
      return true;
    }).sort((left, right) => {
      if (effectiveExcludedCardFilterCriteria.sortBy === "power") {
        return direction * (left.totalPower - right.totalPower) || direction * (left.card.cardId - right.card.cardId);
      }
      if (effectiveExcludedCardFilterCriteria.sortBy === "id") {
        return direction * (left.card.cardId - right.card.cardId);
      }
      return direction * (
        readCardReleaseTimestamp(left.metadata, effectiveExcludedCardFilterCriteria.sortBy)
        - readCardReleaseTimestamp(right.metadata, effectiveExcludedCardFilterCriteria.sortBy)
      ) || direction * (left.card.cardId - right.card.cardId);
    });
  }, [
    deferredExcludedQuery,
    effectiveExcludedCardFilterCriteria,
    effectiveExcludedCardFilterSets,
    profileCardEntries,
  ]);
  const filteredProfileCardIds = useMemo(
    () => filteredProfileCardEntries.map((entry) => entry.card.cardId),
    [filteredProfileCardEntries],
  );
  const visibleExcludedProfileCardCount = visibleExcludedProfileCardState.key === excludedCardFilterKey
    ? visibleExcludedProfileCardState.count
    : EXCLUDED_PROFILE_CARD_INITIAL_VISIBLE_COUNT;
  const visibleExcludedProfileCardCountClamped = Math.min(visibleExcludedProfileCardCount, filteredProfileCardEntries.length);
  const hiddenExcludedProfileCardCount = Math.max(0, filteredProfileCardEntries.length - visibleExcludedProfileCardCountClamped);
  const profileCardEntriesInitialLoading = !profileCardEntriesReady && profileCardEntries.length === 0;
  const profileCardEntriesRefreshing = !profileCardEntriesReady && profileCardEntries.length > 0;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">{t("title")}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {t("summary", {
              temporaryCount: preferences.temporaryCards.length,
              excludedCount: preferences.excludedCardIds.length,
            })}
          </p>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
        <div>
          <div className="text-sm font-bold text-slate-700">{t("ownedNormalization")}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">{t("ownedNormalizationDescription")}</div>
        </div>
        <label className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 rounded-xl bg-white p-2 text-sm font-semibold text-slate-700 shadow-sm">
          <input
            type="checkbox"
            checked={preferences.ownedCardParameters.maxLevelEpisodeTraining}
            onChange={(event) => onUpdateOwnedCardParameters({ maxLevelEpisodeTraining: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span className="min-w-0 leading-5">
            {t("maxOwnedCards")}
          </span>
        </label>
        <label className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 rounded-xl bg-white p-2 text-sm font-semibold text-slate-700 shadow-sm">
          <input
            type="checkbox"
            checked={preferences.ownedCardParameters.maxMasterRank}
            onChange={(event) => onUpdateOwnedCardParameters({ maxMasterRank: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span className="flex min-w-0 flex-wrap items-center gap-2 leading-5">
            <span>{t("maxMasterRank")}</span>
            <select
              value={preferences.ownedCardParameters.maxMasterRankRarityThreshold}
              onChange={(event) => onUpdateOwnedCardParameters({
                maxMasterRankRarityThreshold: normalizeRarityThreshold(event.target.value, 4),
              })}
              disabled={!preferences.ownedCardParameters.maxMasterRank}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {CARD_PARAMETER_RARITY_THRESHOLD_OPTIONS.map((rarity) => (
                <option key={rarity} value={rarity}>{t("rarityAndBelow", { rarity })}</option>
              ))}
            </select>
          </span>
        </label>
        <label className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 rounded-xl bg-white p-2 text-sm font-semibold text-slate-700 shadow-sm">
          <input
            type="checkbox"
            checked={preferences.ownedCardParameters.maxSkillLevel}
            onChange={(event) => onUpdateOwnedCardParameters({ maxSkillLevel: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span className="flex min-w-0 flex-wrap items-center gap-2 leading-5">
            <span>{t("maxSkillLevel")}</span>
            <select
              value={preferences.ownedCardParameters.maxSkillLevelRarityThreshold}
              onChange={(event) => onUpdateOwnedCardParameters({
                maxSkillLevelRarityThreshold: normalizeRarityThreshold(
                  event.target.value,
                  DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES.maxSkillLevelRarityThreshold,
                ),
              })}
              disabled={!preferences.ownedCardParameters.maxSkillLevel}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {CARD_PARAMETER_RARITY_THRESHOLD_OPTIONS.map((rarity) => (
                <option key={rarity} value={rarity}>{t("rarityAndBelow", { rarity })}</option>
              ))}
            </select>
          </span>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="shrink-0 whitespace-nowrap text-lg font-bold text-slate-900">{t("temporaryCards")}</h3>
          <div className="flex min-w-0 flex-1 flex-wrap gap-2 sm:justify-end">
            <button type="button" onClick={onAddTemporary} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-sky-600 px-4 text-sm font-bold text-white transition hover:bg-sky-500">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addTemporary")}
            </button>
            <button
              type="button"
              onClick={onAddCurrentEventCards}
              disabled={currentEventBonusCardCount === 0 || addingCurrentEventCards}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-amber-200 bg-white px-4 text-sm font-bold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {addingCurrentEventCards ? t("adding") : t("addCurrentEventCards")}
            </button>
            <button type="button" onClick={onClearTemporaryCards} disabled={preferences.temporaryCards.length === 0} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("clearTemporary")}
            </button>
          </div>
        </div>
        {temporaryCardActionError ? (
          <div className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-600">{temporaryCardActionError}</div>
        ) : null}
        {temporaryCardActionNotice ? (
          <div role="status" aria-live="polite" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-700">{temporaryCardActionNotice}</div>
        ) : null}
        {temporaryCardEntries.length > 0 ? (
          <div className="grid justify-center gap-[6px] [grid-template-columns:repeat(auto-fill,56px)] sm:[grid-template-columns:repeat(auto-fill,76px)]">
            {temporaryCardEntries.map((entry) => (
              <TeamBuilderPreferenceCardTile
                key={entry.card.instanceId}
                entry={entry}
                assetRegion={assetRegion}
                title={t("editTemporaryCard")}
                compact
                onClick={() => onEditTemporary(entry.card.instanceId)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">{t("emptyTemporary")}</div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{t("excludedCards")}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onBulkSetExcludedCards(filteredProfileCardIds, false)}
              disabled={filteredProfileCardIds.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("keepAll")}
            </button>
            <button
              type="button"
              onClick={() => onBulkSetExcludedCards(filteredProfileCardIds, true)}
              disabled={filteredProfileCardIds.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("excludeAll")}
            </button>
            <button
              type="button"
              onClick={() => setExcludedFiltersOpen((current) => !current)}
              aria-expanded={excludedFiltersOpen}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
            >
              <ListFilter className="h-4 w-4" aria-hidden="true" />
              {excludedFiltersOpen ? t("closeFilters") : t("openFilters")}
              <ChevronDown className={`h-4 w-4 transition ${excludedFiltersOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>
        {excludedFiltersOpen ? (
          <ExcludedCardFilterControls
            filter={effectiveExcludedCardFilter}
            resultCountLabel={
              profileCardEntriesReady
                ? t("count", { count: filteredProfileCardEntries.length })
                : profileCardEntriesRefreshing
                  ? t("countUpdating", { count: filteredProfileCardEntries.length })
                  : t("preparing")
            }
            bandOptions={bandOptions}
            characterOptions={characterOptions}
            bandIds={bandIds}
            characterIds={characterIds}
            onFilterChange={updateExcludedCardFilter}
            onClearFilter={() => setExcludedCardFilter({
              query: "",
              bandIds: [],
              attributes: [],
              rarities: [],
              characterIds: [],
              sortBy: "power",
              sortDirection: "desc",
            })}
          />
        ) : null}
        {profileCards.length > 0 ? (
          profileCardEntriesInitialLoading ? (
            <div className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">{t("preparingCards")}</div>
          ) : (
          <>
            {profileCardEntriesRefreshing ? (
              <div role="status" aria-live="polite" className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                {t("updatingCards")}
              </div>
            ) : null}
            <VirtualizedBandoriCardGrid
              items={filteredProfileCardEntries}
              visibleLimit={visibleExcludedProfileCardCount}
              layoutKey={excludedFiltersOpen ? "excluded-filters-open" : "excluded-filters-closed"}
              getKey={(entry) => entry.card.cardId}
              renderItem={(entry) => {
                const excluded = excludedCardIdSet.has(entry.card.cardId);
                return (
                  <TeamBuilderPreferenceCardTile
                    entry={entry}
                    assetRegion={assetRegion}
                    title={excluded ? t("restoreCard") : t("excludeCard")}
                    compact
                    muted={excluded}
                    onClick={() => onToggleExcludedCard(entry.card.cardId)}
                  />
                );
              }}
            />
            {hiddenExcludedProfileCardCount > 0 ? (
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleExcludedProfileCardState((current) => ({
                    key: excludedCardFilterKey,
                    count: Math.min(
                      (current.key === excludedCardFilterKey ? current.count : EXCLUDED_PROFILE_CARD_INITIAL_VISIBLE_COUNT)
                        + EXCLUDED_PROFILE_CARD_VISIBLE_INCREMENT,
                      filteredProfileCardEntries.length,
                    ),
                  }))}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
                >
                  {t("showMore", { count: Math.min(EXCLUDED_PROFILE_CARD_VISIBLE_INCREMENT, hiddenExcludedProfileCardCount) })}
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleExcludedProfileCardState({
                    key: excludedCardFilterKey,
                    count: filteredProfileCardEntries.length,
                  })}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
                >
                  {t("showAll")}
                </button>
              </div>
            ) : null}
            {filteredProfileCardEntries.length === 0 ? (
              <div className="rounded-xl bg-white/80 p-3 text-center text-sm font-semibold text-slate-500">
                {t("emptyFiltered")}
              </div>
            ) : null}
          </>
          )
        ) : (
          <div className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">{t("profileCardsNotLoaded")}</div>
        )}
      </div>
    </div>
  );
}
