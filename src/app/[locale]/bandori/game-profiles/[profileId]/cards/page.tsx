"use client";

import dynamic from "next/dynamic";
import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Filter, ListFilter, Loader2, Plus, RotateCcw, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import AccountShell, {
  AccountErrorState,
  AccountLoadingState,
  AccountSignInState,
} from "@/app/[locale]/account/AccountShell";
import { getAccessToken, useLocalizedAccountProfile } from "@/app/[locale]/account/useAccountProfile";
import BandoriCardFilterControls from "@/components/bandori/BandoriCardFilterControls";
import { type BandoriCardPickerDialogProps } from "@/components/bandori/card-picker/BandoriCardPickerDialog";
import BandoriCardTile from "@/components/bandori/BandoriCardTile";
import { type GameProfileCardEditorDialogProps } from "@/components/bandori/GameProfileCardEditorDialog";
import VirtualizedBandoriCardGrid from "@/components/bandori/VirtualizedBandoriCardGrid";
import { type BandoriCardPickerValue } from "@/components/bandori/card-picker/types";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriCharactersMaster } from "@/hooks/useBandoriCharactersMaster";
import { useBandoriProfileCardEntries } from "@/hooks/useBandoriProfileCardEntries";
import { useBandoriProfileCardFilter } from "@/hooks/useBandoriProfileCardFilter";
import { useBandoriSkillsMaster } from "@/hooks/useBandoriSkillsMaster";
import { useRouter } from "@/i18n/navigation";
import { type AppLocale } from "@/i18n/routing";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { buildBandoriCharacterBonuses, toBandoriCharacterBonusMap } from "@/lib/bandori-character-bonuses";
import { buildBandoriCardSortValues } from "@/lib/bandori/cards/filter";
import { materializeBandoriCardsMasterForServer } from "@/lib/bandori/cards/api-client";
import { createDefaultOwnedGameProfileCard } from "@/lib/bandori/cards/game-profile-card";
import { type BandoriCharacterMaster, type BandoriSkillMaster } from "@/lib/bandori/cards/master";
import { type GameProfileCardMetadata } from "@/lib/bandori/cards/game-profile-card";
import {
  buildBandoriProfileCardEntry,
} from "@/lib/bandori/cards/profile-card-collection";
import { getBandoriServerCode, normalizeBandoriServer, type BandoriServer } from "@/lib/bandori-server";
import {
  decodeCompressedGameProfilePayload,
  decodeCompactMissionBonusRecords,
  decodeCompactPotentialRecords,
  getGameProfileCards,
  replaceGameProfileCards,
  type CompressedGameProfilePayload,
  type UserGameProfileCardRecord,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";
import {
  patchUserGameProfileCards,
  UserGameProfileCardsPatchError,
} from "@/lib/bandori/cards/profile-cards-client";
import {
  isLocalGameProfileId,
  LocalGameProfileNotFoundError,
  readLocalGameProfilePayload,
  updateLocalGameProfileCards,
} from "@/lib/user-game-profile-local-store";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import { useGameProfileCardDraft } from "./useGameProfileCardDraft";

const CARD_PAGE_SIZE = 60;

type GameProfilePayloadResponse = {
  compressed: CompressedGameProfilePayload;
  profile: {
    id: string;
    kind: "auto" | "manual";
    name: string;
    isEditable: boolean;
    updatedAt: string;
  };
  sectionVersions: {
    cardsHash: string;
    itemsHash: string;
  };
};

type LoadedProfilePayload = {
  payload: UserGameProfilePayload;
  isEditable: boolean;
  cardsHash: string | null;
};

type CardPageMessages = {
  notSignedIn: string;
  requestFailed: (status: number) => string;
  emptyPayload: string;
  missingVersion: string;
  saveFailed: (status: number) => string;
  invalidSaveResponse: string;
};

type SaveState = "idle" | "saving" | "success" | "error" | "conflict";

type CardEditorState = {
  mode: "add" | "edit";
  card: UserGameProfileCardRecord;
  baselineCard: UserGameProfileCardRecord | null;
} | null;

function CardPickerLoading() {
  const t = useTranslations("bandori.gameProfiles.cards");
  return (
    <div className="fixed inset-0 z-1000 flex h-dvh items-center justify-center bg-slate-950/55 p-4">
      <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-2xl">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("picker.loading")}
      </div>
    </div>
  );
}

const DynamicBandoriCardPickerDialog = dynamic<BandoriCardPickerDialogProps>(
  () => import("@/components/bandori/card-picker/BandoriCardPickerDialog"),
  { ssr: false, loading: CardPickerLoading },
);

const DynamicGameProfileCardEditorDialog = dynamic<GameProfileCardEditorDialogProps>(
  () => import("@/components/bandori/GameProfileCardEditorDialog"),
  { ssr: false },
);

async function requestProfilePayload(
  profileId: string,
  messages: CardPageMessages,
  signal?: AbortSignal,
): Promise<LoadedProfilePayload> {
  if (isLocalGameProfileId(profileId)) {
    const payload = await readLocalGameProfilePayload(profileId);
    if (signal?.aborted) throw new DOMException("Profile load aborted", "AbortError");
    return {
      payload,
      isEditable: true,
      cardsHash: null,
    };
  }

  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error(messages.notSignedIn);

  const response = await fetch(`/api/account/game-profiles/${profileId}/payload`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(responsePayload) || messages.requestFailed(response.status));
  }
  const data = parseApiSuccessData<GameProfilePayloadResponse>(responsePayload);
  if (!data) throw new Error(messages.emptyPayload);
  return {
    payload: await decodeCompressedGameProfilePayload(data.compressed),
    isEditable: data.profile.isEditable,
    cardsHash: data.sectionVersions.cardsHash,
  };
}

async function saveProfileCards(
  profileId: string,
  cards: UserGameProfileCardRecord[],
  basePayload: UserGameProfilePayload,
  baseCardsHash: string | null,
  messages: CardPageMessages,
): Promise<{ cardsHash: string | null; payload: UserGameProfilePayload }> {
  if (isLocalGameProfileId(profileId)) {
    return {
      cardsHash: null,
      payload: await updateLocalGameProfileCards(profileId, cards),
    };
  }

  const payload = replaceGameProfileCards(basePayload, cards);

  const accessToken = await getAccessToken();
  if (!accessToken) throw new UserGameProfileCardsPatchError(messages.notSignedIn, null);
  if (!baseCardsHash) throw new UserGameProfileCardsPatchError(messages.missingVersion, null);
  const cardsHash = await patchUserGameProfileCards({
    profileId,
    cards,
    baseCardsHash,
    accessToken,
    saveFailedMessage: messages.saveFailed,
    invalidResponseMessage: messages.invalidSaveResponse,
  });
  return { cardsHash, payload };
}

function compactMasterMap<T>(
  map: Record<string, T | null | undefined> | null,
): Record<string, T | undefined> {
  if (!map) return {};
  return Object.fromEntries(
    Object.entries(map).filter((entry): entry is [string, T] => entry[1] !== null && entry[1] !== undefined),
  );
}

export default function GameProfileCardsPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = use(params);
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const preferredServer = useBandoriPreferredServer();
  const t = useTranslations("bandori.gameProfiles.cards");
  const cardPickerT = useTranslations("bandori.cardPicker");
  const filterT = useTranslations("bandori.cardFilters");
  const termsT = useTranslations("bandori.terms");
  const commonT = useTranslations("common");
  const { userId, authReady, loadingProfile, profileError } = useLocalizedAccountProfile();
  const isMasterEnabled = Boolean(profileId && userId);
  const cardsMaster = useBandoriCardsMaster(undefined, isMasterEnabled);
  const charactersMaster = useBandoriCharactersMaster(isMasterEnabled);
  const skillsMaster = useBandoriSkillsMaster(isMasterEnabled);
  const {
    draftCards,
    pendingChanges,
    hasUnsavedChanges,
    resetCards,
    applyCard,
    removeCard,
    discardChanges,
    markCardsSaved,
  } = useGameProfileCardDraft();
  const [profilePayload, setProfilePayload] = useState<UserGameProfilePayload | null>(null);
  const [canEditProfile, setCanEditProfile] = useState(false);
  const [baseCardsHash, setBaseCardsHash] = useState<string | null>(null);
  const [cardEditorState, setCardEditorState] = useState<CardEditorState>(null);
  const [isCardPickerOpen, setIsCardPickerOpen] = useState(false);
  const [cardPickerValue, setCardPickerValue] = useState<BandoriCardPickerValue | null>(null);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [isLoadingCards, setIsLoadingCards] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [visibleState, setVisibleState] = useState({ key: "", count: CARD_PAGE_SIZE });
  const cardPickerScrollRef = useRef<HTMLDivElement | null>(null);
  const profileLoadGenerationRef = useRef(0);
  const profileLoadRequestRef = useRef<{
    key: string;
    controller: AbortController;
    promise: Promise<LoadedProfilePayload>;
  } | null>(null);

  const messages = useMemo<CardPageMessages>(() => ({
    notSignedIn: t("errors.notSignedIn"),
    requestFailed: (status) => t("errors.requestFailed", { status }),
    emptyPayload: t("errors.emptyPayload"),
    missingVersion: t("errors.missingVersion"),
    saveFailed: (status) => t("errors.saveFailed", { status }),
    invalidSaveResponse: t("errors.invalidSaveResponse"),
  }), [t]);

  const loadProfile = useCallback(async () => {
    const generation = profileLoadGenerationRef.current + 1;
    profileLoadGenerationRef.current = generation;
    const requestKey = `${userId}:${profileId}`;
    let request = profileLoadRequestRef.current;
    if (!request || request.key !== requestKey) {
      request?.controller.abort();
      const controller = new AbortController();
      request = {
        key: requestKey,
        controller,
        promise: requestProfilePayload(profileId, messages, controller.signal),
      };
      profileLoadRequestRef.current = request;
    }
    setIsLoadingCards(true);
    setLoadError("");
    try {
      const loaded = await request.promise;
      if (generation !== profileLoadGenerationRef.current) return;
      const nextCards = getGameProfileCards(loaded.payload);
      setProfilePayload(loaded.payload);
      setCanEditProfile(loaded.isEditable);
      setBaseCardsHash(loaded.cardsHash);
      resetCards(nextCards);
      setCardEditorState(null);
      setCardPickerValue(null);
      setSaveError("");
      setSaveNotice("");
      setSaveState("idle");
      setVisibleState({ key: "", count: CARD_PAGE_SIZE });
    } catch (error) {
      if (generation !== profileLoadGenerationRef.current || request.controller.signal.aborted) return;
      setLoadError(error instanceof Error ? error.message : t("errors.loadFailed"));
    } finally {
      if (profileLoadRequestRef.current === request) profileLoadRequestRef.current = null;
      if (generation === profileLoadGenerationRef.current) setIsLoadingCards(false);
    }
  }, [messages, profileId, resetCards, t, userId]);

  useEffect(() => {
    if (!profileId || !userId) return;
    void loadProfile();
    return () => {
      profileLoadGenerationRef.current += 1;
      profileLoadRequestRef.current?.controller.abort();
      profileLoadRequestRef.current = null;
    };
  }, [loadProfile, profileId, userId]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const profileServer = useMemo<BandoriServer>(
    () => normalizeBandoriServer(profilePayload?.bestdoriProfile.server) ?? 0,
    [profilePayload?.bestdoriProfile.server],
  );
  const draftCardIdSet = useMemo(
    () => new Set(draftCards.map((card) => card.cardId)),
    [draftCards],
  );
  const sortValues = useMemo(
    () => buildBandoriCardSortValues({ shouldIncludePower: true, contextServer: profileServer }),
    [profileServer],
  );
  const sortOptions = useMemo(
    () => sortValues.map((value) => ({
      value,
      label: filterT(`sort.${value}`),
    })),
    [filterT, sortValues],
  );
  const isProfileLoaded = profilePayload !== null;
  const cardMetadata = useMemo<Record<string, GameProfileCardMetadata | undefined>>(() => {
    if (!cardsMaster.canonicalData || !isProfileLoaded) return {};
    // The Cards response parser rejects null records, so reuse the cached materialized map without another full copy.
    return materializeBandoriCardsMasterForServer(
      cardsMaster.canonicalData,
      profileServer,
    ) as Record<string, GameProfileCardMetadata | undefined>;
  }, [cardsMaster.canonicalData, isProfileLoaded, profileServer]);
  const characters = useMemo<Record<string, BandoriCharacterMaster | undefined>>(
    () => compactMasterMap(charactersMaster.data),
    [charactersMaster.data],
  );
  const skills = useMemo<Record<string, BandoriSkillMaster | undefined>>(
    () => compactMasterMap(skillsMaster.data),
    [skillsMaster.data],
  );
  const profileCharacterPotentials = profilePayload?.characterPotentials;
  const profileCharacterMissionBonuses = profilePayload?.characterMissionBonuses;
  const characterBonusesById = useMemo(
    () => isProfileLoaded
      ? toBandoriCharacterBonusMap(buildBandoriCharacterBonuses(
        profileCharacterPotentials ? decodeCompactPotentialRecords(profileCharacterPotentials) : [],
        profileCharacterMissionBonuses ? decodeCompactMissionBonusRecords(profileCharacterMissionBonuses) : [],
      ))
      : {},
    [isProfileLoaded, profileCharacterMissionBonuses, profileCharacterPotentials],
  );
  const isMasterDataReady = Boolean(cardsMaster.canonicalData && charactersMaster.data && skillsMaster.data);
  const { entries, isReady: areEntriesReady } = useBandoriProfileCardEntries({
    cacheScopeKey: profileId,
    isEnabled: Boolean(profilePayload && isMasterDataReady),
    locale,
    profileCards: draftCards,
    cardMetadata,
    characters,
    skills,
    characterBonusesById,
    displayServer: profileServer,
    unknownSkillLabel: termsT("unknownSkill"),
  });

  const getBandFilterLabel = useCallback(
    (bandId: number) => filterT("bandFallback", { bandId }),
    [filterT],
  );
  const getCharacterFilterLabel = useCallback(
    (characterId: number) => filterT("characterFallback", { characterId }),
    [filterT],
  );
  const {
    filter: effectiveFilter,
    filteredEntries,
    filterKey,
    bandOptions,
    characterOptions,
    bandIds,
    characterIds,
    updateFilter,
    resetFilter,
  } = useBandoriProfileCardFilter({
    entries,
    characters,
    preferredServer,
    contextServer: profileServer,
    unknownMetadataPolicy: "include-when-unfiltered",
    getBandLabel: getBandFilterLabel,
    getCharacterLabel: getCharacterFilterLabel,
    sortValues,
  });
  const visibleCount = visibleState.key === filterKey ? visibleState.count : CARD_PAGE_SIZE;
  const remainingCards = Math.max(0, filteredEntries.length - Math.min(visibleCount, filteredEntries.length));
  const editorEntry = useMemo(() => cardEditorState ? buildBandoriProfileCardEntry(
    cardEditorState.card,
    cardMetadata,
    characters,
    skills,
    characterBonusesById,
    locale,
    preferredServer,
    profileServer,
    termsT("unknownSkill"),
  ) : null, [
    cardEditorState,
    cardMetadata,
    characterBonusesById,
    characters,
    locale,
    preferredServer,
    profileServer,
    skills,
    termsT,
  ]);
  const masterDataError = cardsMaster.error ?? charactersMaster.error ?? skillsMaster.error;

  const confirmDiscardChanges = useCallback(() => (
    !hasUnsavedChanges || window.confirm(t("draftConfirm.discardChanges"))
  ), [hasUnsavedChanges, t]);

  const handleBack = useCallback(() => {
    if (!confirmDiscardChanges()) return;
    router.push("/bandori/game-profiles");
  }, [confirmDiscardChanges, router]);

  const handleDiscardChanges = useCallback(() => {
    if (!confirmDiscardChanges()) return;
    if (saveState === "conflict") {
      void loadProfile();
      return;
    }
    discardChanges();
    setCardEditorState(null);
    setCardPickerValue(null);
    setSaveError("");
    setSaveNotice("");
    setSaveState("idle");
  }, [confirmDiscardChanges, discardChanges, loadProfile, saveState]);

  const handleReloadLatest = useCallback(() => {
    if (!confirmDiscardChanges()) return;
    void loadProfile();
  }, [confirmDiscardChanges, loadProfile]);

  const openCardPicker = useCallback(() => {
    setSaveNotice("");
    setCardPickerValue(null);
    setIsCardPickerOpen(true);
  }, []);

  const handleCardPickerValueChange = useCallback((value: BandoriCardPickerValue | null) => {
    setCardPickerValue(value);
    if (!value) return;
    const existingCard = draftCards.find((card) => card.cardId === value.cardId);
    if (existingCard) {
      setCardEditorState({ mode: "edit", card: existingCard, baselineCard: existingCard });
    } else {
      setCardEditorState({
        mode: "add",
        card: createDefaultOwnedGameProfileCard(value.cardId, cardMetadata[String(value.cardId)]),
        baselineCard: null,
      });
    }
  }, [cardMetadata, draftCards]);

  const handleApplyCard = useCallback((card: UserGameProfileCardRecord) => {
    applyCard(card);
    setCardEditorState(null);
    setCardPickerValue(null);
    if (saveState !== "conflict") setSaveError("");
    setSaveNotice("");
    setSaveState((current) => current === "conflict" ? current : "idle");
  }, [applyCard, saveState]);

  const handleDeleteCard = useCallback(() => {
    if (!cardEditorState) return;
    removeCard(cardEditorState.card.cardId);
    setCardEditorState(null);
    setCardPickerValue(null);
    if (saveState !== "conflict") setSaveError("");
    setSaveNotice("");
    setSaveState((current) => current === "conflict" ? current : "idle");
  }, [cardEditorState, removeCard, saveState]);

  const handleSaveChanges = useCallback(async () => {
    if (!profilePayload || !canEditProfile || !hasUnsavedChanges || isSavingChanges || saveState === "conflict") return;
    const cardsSnapshot = draftCards;
    setIsSavingChanges(true);
    setSaveState("saving");
    setSaveError("");
    setSaveNotice("");
    try {
      const saved = await saveProfileCards(
        profileId,
        cardsSnapshot,
        profilePayload,
        baseCardsHash,
        messages,
      );
      setProfilePayload(saved.payload);
      setBaseCardsHash(saved.cardsHash);
      markCardsSaved(cardsSnapshot);
      setSaveState("success");
      setSaveNotice(t("draftMessages.savedAll"));
    } catch (error) {
      const isConflict = error instanceof UserGameProfileCardsPatchError && error.code === "GAME_PROFILE_CONFLICT";
      setSaveState(isConflict ? "conflict" : "error");
      setSaveError(error instanceof LocalGameProfileNotFoundError
        ? t("errors.localProfileNotFound")
        : error instanceof Error ? error.message : t("errors.saveCardsFailed"));
    } finally {
      setIsSavingChanges(false);
    }
  }, [
    baseCardsHash,
    canEditProfile,
    draftCards,
    hasUnsavedChanges,
    isSavingChanges,
    markCardsSaved,
    messages,
    profileId,
    profilePayload,
    saveState,
    t,
  ]);

  const pageError = profileError || loadError || (masterDataError ? t("draftErrors.loadMasterFailed") : "");
  const isPageLoading = isLoadingCards
    || cardsMaster.loading
    || charactersMaster.loading
    || skillsMaster.loading
    || Boolean(profilePayload && isMasterDataReady && !areEntriesReady && entries.length === 0);

  return (
    <AccountShell
      title={t("title")}
      description={t("description")}
      backHref="/bandori/game-profiles"
      backLabel={t("back")}
      onBack={handleBack}
      isBackDisabled={isSavingChanges}
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message={commonT("states.loadingAccount")} />
      ) : !userId ? (
        <AccountSignInState nextPath={`/bandori/game-profiles/${profileId}/cards`} />
      ) : pageError ? (
        <AccountErrorState message={pageError} />
      ) : isPageLoading ? (
        <AccountLoadingState message={t("loadingCards")} />
      ) : (
        <section className="mx-auto w-full max-w-[960px] overflow-visible rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_55px_rgba(15,23,42,0.09)] sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">{t("heading")}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {t("collectionSummary", {
                    total: draftCards.length,
                    matched: filteredEntries.length,
                    server: getBandoriServerCode(profileServer).toUpperCase(),
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {canEditProfile ? (
                  <button
                    type="button"
                    onClick={openCardPicker}
                    disabled={isSavingChanges}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t("draftActions.addCard")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsFilterPanelOpen((current) => !current)}
                  aria-expanded={isFilterPanelOpen}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-sky-300 hover:text-sky-600"
                >
                  <ListFilter className="h-4 w-4" aria-hidden="true" />
                  {isFilterPanelOpen ? t("draftActions.closeFilters") : t("draftActions.openFilters")}
                  <ChevronDown className={`h-4 w-4 transition ${isFilterPanelOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
              </div>
            </div>

            {!canEditProfile ? (
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
                {t("collectionStates.readOnly")}
              </div>
            ) : null}

            {canEditProfile && hasUnsavedChanges ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-bold text-amber-800">
                  {t("pendingChanges", {
                    added: pendingChanges.added,
                    updated: pendingChanges.updated,
                    removed: pendingChanges.removed,
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDiscardChanges}
                    disabled={isSavingChanges}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 text-sm font-bold text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t("draftActions.discardChanges")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveChanges()}
                    disabled={isSavingChanges || saveState === "conflict"}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSavingChanges ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    {isSavingChanges ? t("draftActions.saving") : t("draftActions.saveAll")}
                  </button>
                </div>
              </div>
            ) : null}

            {saveNotice ? (
              <div role="status" aria-live="polite" className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                <Check className="h-4 w-4" aria-hidden="true" />
                {saveNotice}
              </div>
            ) : null}
            {saveError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                <div role="alert">{saveError}</div>
                {saveState === "conflict" ? (
                  <button type="button" onClick={handleReloadLatest} className="mt-2 rounded-xl border border-rose-300 bg-white px-3 py-2 font-bold text-rose-700">
                    {t("draftActions.reloadLatest")}
                  </button>
                ) : null}
              </div>
            ) : null}

            {isFilterPanelOpen ? (
              <BandoriCardFilterControls
                filter={effectiveFilter}
                resultCountLabel={t("matchedCount", { count: filteredEntries.length })}
                bandOptions={bandOptions}
                characterOptions={characterOptions}
                availableBandIds={bandIds}
                availableCharacterIds={characterIds}
                availableServers={[profileServer]}
                sortOptions={sortOptions}
                onFilterChange={updateFilter}
                onClearFilter={resetFilter}
              />
            ) : null}

            <div className="min-h-[420px] overflow-visible rounded-2xl border border-slate-100 bg-[#fffdf1]/72 p-3 shadow-inner">
              {!areEntriesReady && entries.length > 0 ? (
                <div role="status" className="mb-3 rounded-xl bg-white p-3 text-sm font-semibold text-slate-500">{t("collectionStates.updatingCards")}</div>
              ) : null}
              {filteredEntries.length === 0 ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-slate-500">
                  <Filter className="h-9 w-9" aria-hidden="true" />
                  <div className="text-sm font-bold">{t("states.empty")}</div>
                </div>
              ) : (
                <>
                  <VirtualizedBandoriCardGrid
                    items={filteredEntries}
                    visibleLimit={visibleCount}
                    layoutKey={isFilterPanelOpen ? "profile-filters-open" : "profile-filters-closed"}
                    getKey={(entry) => entry.card.cardId}
                    renderItem={(entry) => (
                      <BandoriCardTile
                        interaction={canEditProfile ? {
                          kind: "action",
                          label: t("labels.editCard", { cardName: entry.cardName }),
                          onAction: () => setCardEditorState({
                            mode: "edit",
                            card: entry.card,
                            baselineCard: entry.card,
                          }),
                          disabled: isSavingChanges,
                        } : { kind: "information" }}
                        card={{ ...entry.card, bandId: entry.bandId, totalPower: entry.totalPower }}
                        metadata={entry.metadata}
                        cardName={entry.cardName}
                        server={profileServer}
                        characterName={entry.characterName}
                        skillEffectLabel={entry.skillEffectLabel}
                        skillEffectLanguageTag={entry.skillEffectLanguageTag}
                        size="compact"
                      />
                    )}
                  />
                  {remainingCards > 0 ? (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVisibleState({
                          key: filterKey,
                          count: Math.min(visibleCount + CARD_PAGE_SIZE, filteredEntries.length),
                        })}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:border-sky-300 hover:text-sky-600"
                      >
                        {t("actions.showMore", { count: Math.min(CARD_PAGE_SIZE, remainingCards) })}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisibleState({ key: filterKey, count: filteredEntries.length })}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:border-sky-300 hover:text-sky-600"
                      >
                        {t("actions.showAll")}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {isCardPickerOpen && !cardEditorState ? (
            <DynamicBandoriCardPickerDialog
              isOpen={isCardPickerOpen}
              title={t("picker.title")}
              closeLabel={t("picker.close")}
              value={cardPickerValue}
              server={profileServer}
              missingCardFallback="none"
              cardMetadata={cardMetadata}
              scrollElementRef={cardPickerScrollRef}
              characters={characters}
              skills={skills}
              mutedCardIds={draftCardIdSet}
              onValueChange={handleCardPickerValueChange}
              onClose={() => {
                if (cardEditorState) return;
                setIsCardPickerOpen(false);
                setCardPickerValue(null);
              }}
            />
          ) : null}

          {cardEditorState && canEditProfile ? (
            <DynamicGameProfileCardEditorDialog
              key={`${cardEditorState.mode}:${cardEditorState.card.cardId}:${cardEditorState.card.level}:${cardEditorState.card.masterRank}:${cardEditorState.card.skillLevel}`}
              card={cardEditorState.card}
              cardIdLabel={cardPickerT("cardFallback", { cardId: cardEditorState.card.cardId })}
              baselineCard={cardEditorState.baselineCard}
              metadata={cardMetadata[String(cardEditorState.card.cardId)]}
              characterName={editorEntry?.characterName || t("labels.unknownCharacter")}
              bandId={editorEntry?.bandId ?? null}
              characterBonusesById={characterBonusesById}
              displayServer={profileServer}
              isBusy={isSavingChanges}
              title={cardEditorState.mode === "add" ? t("draftEditor.addTitle") : t("draftEditor.editTitle")}
              applyLabel={cardEditorState.mode === "add" ? t("draftActions.add") : t("draftActions.apply")}
              applyDisabledReason={cardPickerValue && cardEditorState.mode === "edit"
                ? t("draftEditor.noChangesHint")
                : undefined}
              deleteLabel={t("draftActions.delete")}
              showDeleteButton={cardEditorState.mode === "edit"}
              canApplyWithoutChanges={cardEditorState.mode === "add"}
              onClose={() => {
                setCardEditorState(null);
                setCardPickerValue(null);
              }}
              onApply={handleApplyCard}
              onDelete={handleDeleteCard}
            />
          ) : null}
        </section>
      )}
    </AccountShell>
  );
}
