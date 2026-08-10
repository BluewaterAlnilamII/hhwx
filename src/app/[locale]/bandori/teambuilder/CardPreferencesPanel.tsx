"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ListFilter, Plus, Sparkles, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import BandoriCardFilterControls from "@/components/bandori/BandoriCardFilterControls";
import BandoriCardTile from "@/components/bandori/BandoriCardTile";
import VirtualizedBandoriCardGrid from "@/components/bandori/VirtualizedBandoriCardGrid";
import { useBandoriProfileCardEntries } from "@/hooks/useBandoriProfileCardEntries";
import { useBandoriProfileCardFilter } from "@/hooks/useBandoriProfileCardFilter";
import { type AppLocale } from "@/i18n/routing";
import { type BandoriCharacterMaster, type BandoriSkillMaster } from "@/lib/bandori-card-master";
import { buildBandoriCardSortValues } from "@/lib/bandori-card-filter";
import { type GameProfileCardMetadata } from "@/lib/bandori-game-profile-card";
import { type BandoriServer } from "@/lib/bandori-server";
import { type BandoriCharacterBonusState } from "@/lib/bandori-team-calculator";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import {
  buildBandoriProfileCardEntry,
} from "@/lib/bandori-profile-card-collection";
import {
  CARD_PARAMETER_RARITY_THRESHOLD_OPTIONS,
  DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES,
  normalizeRarityThreshold,
  type OwnedCardParameterPreferences,
  type TeamBuilderCardPreferences,
} from "./card-preferences";

const EXCLUDED_PROFILE_CARD_INITIAL_VISIBLE_COUNT = 60;
const EXCLUDED_PROFILE_CARD_VISIBLE_INCREMENT = 60;
export type TeamBuilderCardPreferencesPanelProps = {
  cacheScopeKey: string;
  profileCards: UserGameProfileCardRecord[];
  preferences: TeamBuilderCardPreferences;
  cardMetadata: Record<string, GameProfileCardMetadata | undefined>;
  characters: Record<string, BandoriCharacterMaster | undefined>;
  skills: Record<string, BandoriSkillMaster | undefined>;
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>;
  displayServer: BandoriServer;
  currentEventBonusCardCount: number;
  temporaryCardActionNotice: string;
  onAddTemporary: () => void;
  onAddCurrentEventCards: () => void;
  onEditTemporary: (instanceId: string) => void;
  onClearTemporaryCards: () => void;
  onUpdateOwnedCardParameters: (patch: Partial<OwnedCardParameterPreferences>) => void;
  onToggleExcludedCard: (cardId: number) => void;
  onBulkSetExcludedCards: (cardIds: number[], isExcluded: boolean) => void;
};

export default function TeamBuilderCardPreferencesPanel({
  cacheScopeKey,
  profileCards,
  preferences,
  cardMetadata,
  characters,
  skills,
  characterBonusesById,
  displayServer,
  currentEventBonusCardCount,
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
  const preferredServer = useBandoriPreferredServer();
  const t = useTranslations("bandori.teamBuilder.preferences");
  const filterT = useTranslations("bandori.cardFilters");
  const termsT = useTranslations("bandori.terms");
  const excludedCardIdSet = useMemo(
    () => new Set(preferences.excludedCardIds),
    [preferences.excludedCardIds],
  );
  const [isExcludedFilterPanelOpen, setIsExcludedFilterPanelOpen] = useState(false);
  const [visibleExcludedProfileCardState, setVisibleExcludedProfileCardState] = useState({
    key: "",
    count: EXCLUDED_PROFILE_CARD_INITIAL_VISIBLE_COUNT,
  });
  const excludedSortValues = useMemo(
    () => buildBandoriCardSortValues({ shouldIncludePower: true, contextServer: displayServer }),
    [displayServer],
  );
  const excludedSortOptions = useMemo(
    () => excludedSortValues.map((value) => ({
      value,
      label: filterT(`sort.${value}`),
    })),
    [excludedSortValues, filterT],
  );

  const {
    entries: profileCardEntries,
    isReady: isProfileCardEntryCollectionReady,
  } = useBandoriProfileCardEntries({
    cacheScopeKey,
    isEnabled: true,
    locale,
    profileCards,
    cardMetadata,
    characters,
    skills,
    characterBonusesById,
    displayServer,
    unknownSkillLabel: termsT("unknownSkill"),
  });

  const temporaryCardEntries = useMemo(() => preferences.temporaryCards.map((card) => ({
    ...buildBandoriProfileCardEntry(
      card,
      cardMetadata,
      characters,
      skills,
      characterBonusesById,
      locale,
      preferredServer,
      displayServer,
      termsT("unknownSkill"),
    ),
    card,
  })), [
    cardMetadata,
    characterBonusesById,
    characters,
    displayServer,
    locale,
    preferences.temporaryCards,
    preferredServer,
    skills,
    termsT,
  ]);

  const getBandFilterLabel = useCallback(
    (bandId: number) => filterT("bandFallback", { bandId }),
    [filterT],
  );
  const getCharacterFilterLabel = useCallback(
    (characterId: number) => filterT("characterFallback", { characterId }),
    [filterT],
  );

  const {
    filter: effectiveExcludedCardFilter,
    filteredEntries: filteredProfileCardEntries,
    filterKey: excludedCardFilterKey,
    bandOptions,
    characterOptions,
    bandIds,
    characterIds,
    updateFilter: updateExcludedCardFilter,
    resetFilter: resetExcludedCardFilter,
  } = useBandoriProfileCardFilter({
    entries: profileCardEntries,
    characters,
    preferredServer,
    contextServer: displayServer,
    unknownMetadataPolicy: "exclude",
    getBandLabel: getBandFilterLabel,
    getCharacterLabel: getCharacterFilterLabel,
    sortValues: excludedSortValues,
  });
  const filteredProfileCardIds = useMemo(
    () => filteredProfileCardEntries.map((entry) => entry.card.cardId),
    [filteredProfileCardEntries],
  );
  const visibleExcludedProfileCardCount = visibleExcludedProfileCardState.key === excludedCardFilterKey
    ? visibleExcludedProfileCardState.count
    : EXCLUDED_PROFILE_CARD_INITIAL_VISIBLE_COUNT;
  const visibleExcludedProfileCardCountClamped = Math.min(visibleExcludedProfileCardCount, filteredProfileCardEntries.length);
  const hiddenExcludedProfileCardCount = Math.max(0, filteredProfileCardEntries.length - visibleExcludedProfileCardCountClamped);
  const isInitialProfileCardEntryLoad = !isProfileCardEntryCollectionReady && profileCardEntries.length === 0;
  const isProfileCardEntryCollectionRefreshing = !isProfileCardEntryCollectionReady && profileCardEntries.length > 0;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
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
        <label className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 rounded-xl bg-white p-2 text-sm font-semibold text-slate-700 shadow-xs">
          <input
            type="checkbox"
            checked={preferences.ownedCardParameters.maxLevelEpisodeTraining}
            onChange={(event) => onUpdateOwnedCardParameters({ maxLevelEpisodeTraining: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded-sm border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span className="min-w-0 leading-5">
            {t("maxOwnedCards")}
          </span>
        </label>
        <label className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 rounded-xl bg-white p-2 text-sm font-semibold text-slate-700 shadow-xs">
          <input
            type="checkbox"
            checked={preferences.ownedCardParameters.maxMasterRank}
            onChange={(event) => onUpdateOwnedCardParameters({ maxMasterRank: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded-sm border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span className="flex min-w-0 flex-wrap items-center gap-2 leading-5">
            <span>{t("maxMasterRank")}</span>
            <select
              value={preferences.ownedCardParameters.maxMasterRankRarityThreshold}
              onChange={(event) => onUpdateOwnedCardParameters({
                maxMasterRankRarityThreshold: normalizeRarityThreshold(event.target.value, 4),
              })}
              disabled={!preferences.ownedCardParameters.maxMasterRank}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-hidden transition focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {CARD_PARAMETER_RARITY_THRESHOLD_OPTIONS.map((rarity) => (
                <option key={rarity} value={rarity}>{t("rarityAndBelow", { rarity })}</option>
              ))}
            </select>
          </span>
        </label>
        <label className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 rounded-xl bg-white p-2 text-sm font-semibold text-slate-700 shadow-xs">
          <input
            type="checkbox"
            checked={preferences.ownedCardParameters.maxSkillLevel}
            onChange={(event) => onUpdateOwnedCardParameters({ maxSkillLevel: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded-sm border-slate-300 text-sky-600 focus:ring-sky-500"
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
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-hidden transition focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
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
              disabled={currentEventBonusCardCount === 0}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-amber-200 bg-white px-4 text-sm font-bold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("addCurrentEventCards")}
            </button>
            <button type="button" onClick={onClearTemporaryCards} disabled={preferences.temporaryCards.length === 0} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("clearTemporary")}
            </button>
          </div>
        </div>
        {temporaryCardActionNotice ? (
          <div role="status" aria-live="polite" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-700">{temporaryCardActionNotice}</div>
        ) : null}
        {temporaryCardEntries.length > 0 ? (
          <div className="grid justify-center gap-[6px] grid-cols-[repeat(auto-fill,56px)] sm:grid-cols-[repeat(auto-fill,76px)]">
            {temporaryCardEntries.map((entry) => (
              <BandoriCardTile
                interaction={{
                  kind: "action",
                  label: t("editTemporaryCard"),
                  onAction: () => onEditTemporary(entry.card.instanceId),
                }}
                key={entry.card.instanceId}
                card={{ ...entry.card, bandId: entry.bandId, totalPower: entry.totalPower }}
                metadata={entry.metadata}
                cardName={entry.cardName}
                server={displayServer}
                characterName={entry.characterName}
                skillEffectLabel={entry.skillEffectLabel}
                skillEffectLanguageTag={entry.skillEffectLanguageTag}
                size="compact"
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
              onClick={() => setIsExcludedFilterPanelOpen((current) => !current)}
              aria-expanded={isExcludedFilterPanelOpen}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
            >
              <ListFilter className="h-4 w-4" aria-hidden="true" />
              {isExcludedFilterPanelOpen ? t("closeFilters") : t("openFilters")}
              <ChevronDown className={`h-4 w-4 transition ${isExcludedFilterPanelOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>
        {isExcludedFilterPanelOpen ? (
          <BandoriCardFilterControls
            filter={effectiveExcludedCardFilter}
            resultCountLabel={
              isProfileCardEntryCollectionReady
                ? t("count", { count: filteredProfileCardEntries.length })
                : isProfileCardEntryCollectionRefreshing
                  ? t("countUpdating", { count: filteredProfileCardEntries.length })
                  : t("preparing")
            }
            bandOptions={bandOptions}
            characterOptions={characterOptions}
            availableBandIds={bandIds}
            availableCharacterIds={characterIds}
            availableServers={[displayServer]}
            sortOptions={excludedSortOptions}
            onFilterChange={updateExcludedCardFilter}
            onClearFilter={resetExcludedCardFilter}
          />
        ) : null}
        {profileCards.length > 0 ? (
          isInitialProfileCardEntryLoad ? (
            <div className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">{t("preparingCards")}</div>
          ) : (
          <>
            {isProfileCardEntryCollectionRefreshing ? (
              <div role="status" aria-live="polite" className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                {t("updatingCards")}
              </div>
            ) : null}
            <VirtualizedBandoriCardGrid
              items={filteredProfileCardEntries}
              visibleLimit={visibleExcludedProfileCardCount}
              layoutKey={isExcludedFilterPanelOpen ? "excluded-filters-open" : "excluded-filters-closed"}
              getKey={(entry) => entry.card.cardId}
              renderItem={(entry) => {
                const isExcluded = excludedCardIdSet.has(entry.card.cardId);
                return (
                  <BandoriCardTile
                    interaction={{
                      kind: "action",
                      label: isExcluded ? t("restoreCard") : t("excludeCard"),
                      onAction: () => onToggleExcludedCard(entry.card.cardId),
                    }}
                    card={{ ...entry.card, bandId: entry.bandId, totalPower: entry.totalPower }}
                    metadata={entry.metadata}
                    cardName={entry.cardName}
                    server={displayServer}
                    characterName={entry.characterName}
                    skillEffectLabel={entry.skillEffectLabel}
                    skillEffectLanguageTag={entry.skillEffectLanguageTag}
                    size="compact"
                    isMuted={isExcluded}
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
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-xs transition hover:border-blue-300 hover:text-blue-600"
                >
                  {t("showMore", { count: Math.min(EXCLUDED_PROFILE_CARD_VISIBLE_INCREMENT, hiddenExcludedProfileCardCount) })}
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleExcludedProfileCardState({
                    key: excludedCardFilterKey,
                    count: filteredProfileCardEntries.length,
                  })}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-xs transition hover:border-blue-300 hover:text-blue-600"
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
