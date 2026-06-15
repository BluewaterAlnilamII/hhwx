"use client";

import { Link } from "@/i18n/navigation";
import { memo, use, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  Filter,
  RotateCcw,
  Search,
} from "lucide-react";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { type AppLocale } from "@/i18n/routing";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import {
  normalizeBandoriSkillLabel,
  type BandoriSkillLabelMaster,
} from "@/lib/bandori-skill-label";
import {
  calculateBandoriCard,
  type BandoriCharacterBonusState,
  type BestdoriCardMaster,
} from "@/lib/bandori-team-calculator";
import {
  buildBandoriCharacterBonuses,
  toBandoriCharacterBonusMap,
} from "@/lib/bandori-character-bonuses";
import { pickBestdoriLocalizedName } from "@/lib/bestdori-regional-names";
import { decodeBestdoriProfile, encodeBestdoriProfile } from "@/lib/bestdori-profile-codec";
import {
  decodeCompressedGameProfilePayload,
  getGameProfileCards,
  getGameProfileCharacterMissionBonuses,
  getGameProfileCharacterPotentials,
  type CompressedGameProfilePayload,
  type UserGameProfileCardRecord,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";
import {
  isLocalGameProfileId,
  readLocalGameProfilePayload,
  updateLocalGameProfilePayload,
} from "@/lib/user-game-profile-local-store";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "@/app/[locale]/account/AccountShell";
import { getAccessToken, useLocalizedAccountProfile } from "@/app/[locale]/account/useAccountProfile";
import SharedBandoriCardThumbnail from "@/components/bandori/BandoriCardThumbnail";
import { BandoriCardHoverTooltipPortal } from "@/components/bandori/BandoriCardHoverTooltip";
import VirtualizedBandoriCardGrid from "@/components/bandori/VirtualizedBandoriCardGrid";
import GameProfileCardEditorDialog from "@/components/bandori/GameProfileCardEditorDialog";
import { cn } from "@/lib/utils";

type CardAttribute = "powerful" | "pure" | "cool" | "happy";

type BestdoriCardMetadata = {
  characterId?: number;
  skillId?: number;
  rarity?: number;
  attribute?: CardAttribute | string;
  levelLimit?: number;
  resourceSetName?: string;
  assetRegion?: BandoriAssetRegion;
  prefix?: Array<string | null>;
  releasedAt?: Array<string | number | null>;
  type?: string;
  displayName?: string | null;
  hasTrainedArt?: boolean;
  stat?: {
    training?: {
      levelLimit?: number;
    };
  } & Record<string, unknown>;
};

type CharacterRecord = {
  characterId: number;
  bandId: number;
  characterNameCn: string | null;
  characterNameTw: string | null;
  characterNameJp: string;
  characterNameEn: string;
  nicknameCn?: string | null;
  nicknameTw?: string | null;
  nicknameJp?: string | null;
  nicknameEn?: string | null;
};

type MetadataPayload = {
  cards: Record<string, BestdoriCardMetadata>;
  characters: CharacterRecord[];
  skills: Record<string, BandoriSkillLabelMaster | undefined>;
};

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

type GameProfileSectionUpdateResult = {
  profile: GameProfilePayloadResponse["profile"];
  sectionVersions: GameProfilePayloadResponse["sectionVersions"];
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
  loadCardsFailed: (status: number) => string;
  loadCharactersFailed: (status: number) => string;
  loadSkillsFailed: (status: number) => string;
};

type CardFilterState = {
  query: string;
  attribute: "all" | CardAttribute;
  rarity: "all" | string;
  training: "all" | "trained" | "untrained";
};

const CARD_METADATA_CHUNK_SIZE = 150;
const CARD_PAGE_SIZE = 60;
const DEFAULT_FILTERS: CardFilterState = {
  query: "",
  attribute: "all",
  rarity: "all",
  training: "all",
};

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value) && value > 0)));
}

function getRegionFromProfileServer(server: number | undefined): BandoriAssetRegion {
  return server === 3 ? "cn" : "jp";
}

function pickNonEmptyText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function pickCharacterName(
  character: CharacterRecord | undefined,
  characterId: number | undefined,
  locale: AppLocale,
  fallback: { unknownCharacter: string; character: (characterId: number) => string },
): string {
  const localizedName = locale === "en"
    ? pickNonEmptyText(
      character?.nicknameEn,
      character?.characterNameEn,
      character?.nicknameJp,
      character?.characterNameJp,
      character?.nicknameCn,
      character?.nicknameTw,
      character?.characterNameCn,
      character?.characterNameTw,
    )
    : pickNonEmptyText(
      character?.nicknameCn,
      character?.nicknameTw,
      character?.nicknameJp,
      character?.nicknameEn,
      character?.characterNameCn,
      character?.characterNameTw,
      character?.characterNameJp,
      character?.characterNameEn,
    );

  return localizedName ?? (characterId ? fallback.character(characterId) : fallback.unknownCharacter);
}

function pickFullCharacterName(
  character: CharacterRecord | undefined,
  characterId: number | undefined,
  locale: AppLocale,
  fallback: { unknownCharacter: string; character: (characterId: number) => string },
): string {
  return pickCharacterName(character, characterId, locale, fallback);
}

function pickCardName(
  cardId: number,
  metadata: BestdoriCardMetadata | undefined,
  locale: AppLocale,
  fallback: (cardId: number) => string,
): string {
  const localizedName = pickBestdoriLocalizedName(metadata?.prefix, locale);
  return locale === "en"
    ? localizedName ?? metadata?.displayName ?? fallback(cardId)
    : metadata?.displayName ?? localizedName ?? fallback(cardId);
}

function isKnownAttribute(value: string | undefined): value is CardAttribute {
  return value === "powerful" || value === "pure" || value === "cool" || value === "happy";
}

function getCardSkillEffectLabel(
  card: UserGameProfileCardRecord,
  metadata: BestdoriCardMetadata | undefined,
  skills: Record<string, BandoriSkillLabelMaster | undefined>,
): string {
  const skillId = Number(metadata?.skillId);
  return normalizeBandoriSkillLabel(Number.isFinite(skillId) && skillId > 0 ? skills[String(Math.trunc(skillId))] : undefined, card.skillLevel, 5);
}

function buildPayloadWithCards(
  payload: UserGameProfilePayload,
  cards: UserGameProfileCardRecord[],
): UserGameProfilePayload {
  const normalizedProfile = decodeBestdoriProfile(payload.bestdoriProfile);
  normalizedProfile.cards = cards;

  return {
    ...payload,
    bestdoriProfile: encodeBestdoriProfile(normalizedProfile),
  };
}

function getProfileApiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "success" in payload && payload.success === false && "error" in payload) {
    const error = payload.error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
      return error.message;
    }
  }

  return getApiErrorMessage(payload) || fallback;
}

async function requestProfilePayload(profileId: string, messages: CardPageMessages): Promise<LoadedProfilePayload> {
  if (isLocalGameProfileId(profileId)) {
    return {
      payload: await readLocalGameProfilePayload(profileId),
      isEditable: true,
      cardsHash: null,
    };
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error(messages.notSignedIn);
  }

  const response = await fetch(`/api/account/game-profiles/${profileId}/payload`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) || messages.requestFailed(response.status));
  }

  const data = parseApiSuccessData<GameProfilePayloadResponse>(payload);
  if (!data) {
    throw new Error(messages.emptyPayload);
  }

  return {
    payload: await decodeCompressedGameProfilePayload(data.compressed),
    isEditable: data.profile.isEditable,
    cardsHash: data.sectionVersions.cardsHash,
  };
}

async function saveProfileCards(
  profileId: string,
  cards: UserGameProfileCardRecord[],
  payload: UserGameProfilePayload,
  baseCardsHash: string | null,
  messages: CardPageMessages,
): Promise<string | null> {
  if (isLocalGameProfileId(profileId)) {
    await updateLocalGameProfilePayload(profileId, payload);
    return null;
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error(messages.notSignedIn);
  }

  if (!baseCardsHash) {
    throw new Error(messages.missingVersion);
  }

  const response = await fetch(`/api/account/game-profiles/${profileId}/cards`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ baseCardsHash, cards }),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getProfileApiErrorMessage(responsePayload, messages.saveFailed(response.status)));
  }
  const data = parseApiSuccessData<GameProfileSectionUpdateResult>(responsePayload);
  if (!data) {
    throw new Error(messages.invalidSaveResponse);
  }
  return data.sectionVersions.cardsHash;
}

async function requestCardMetadata(cardIds: number[], messages: CardPageMessages): Promise<Record<string, BestdoriCardMetadata>> {
  const chunks: number[][] = [];
  for (let index = 0; index < cardIds.length; index += CARD_METADATA_CHUNK_SIZE) {
    chunks.push(cardIds.slice(index, index + CARD_METADATA_CHUNK_SIZE));
  }

  const responses = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await fetch(`/api/bandori/cards?ids=${chunk.join(",")}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload) || messages.loadCardsFailed(response.status));
      }
      return parseApiSuccessData<{ cards?: Record<string, BestdoriCardMetadata> }>(payload)?.cards ?? {};
    }),
  );

  return Object.assign({}, ...responses);
}

async function requestMetadata(cardIds: number[], messages: CardPageMessages): Promise<MetadataPayload> {
  const [cards, charactersResponse, skillsResponse] = await Promise.all([
    requestCardMetadata(cardIds, messages),
    fetch("/api/bandori/characters"),
    fetch("/api/bandori/master/skills"),
  ]);
  const charactersPayload = await charactersResponse.json().catch(() => ({}));
  const characterData = parseApiSuccessData<{ characters?: CharacterRecord[] }>(charactersPayload);
  const skillsPayload = await skillsResponse.json().catch(() => ({}));
  const skillData = parseApiSuccessData<{ payload?: Record<string, BandoriSkillLabelMaster | undefined> }>(skillsPayload);

  if (!charactersResponse.ok) {
    throw new Error(getApiErrorMessage(charactersPayload) || messages.loadCharactersFailed(charactersResponse.status));
  }
  if (!skillsResponse.ok) {
    throw new Error(getApiErrorMessage(skillsPayload) || messages.loadSkillsFailed(skillsResponse.status));
  }

  return {
    cards,
    characters: Array.isArray(characterData?.characters) ? characterData.characters : [],
    skills: skillData?.payload ?? {},
  };
}

function CardThumbnail({
  card,
  metadata,
  bandId,
  characterBonusesById,
  region,
  alt,
  size = "tile",
}: {
  card: UserGameProfileCardRecord;
  metadata?: BestdoriCardMetadata;
  bandId: number | null;
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>;
  region: BandoriAssetRegion;
  alt: string;
  size?: "tile" | "preview";
}) {
  let totalPower: number | null = null;
  if (metadata) {
    try {
      totalPower = calculateBandoriCard(
        card,
        metadata as BestdoriCardMaster,
        metadata.characterId ? { [String(metadata.characterId)]: { bandId } } : {},
        characterBonusesById,
      ).totalPower;
    } catch {
      totalPower = null;
    }
  }

  return (
    <SharedBandoriCardThumbnail
      card={card}
      metadata={metadata}
      bandId={bandId}
      region={region}
      alt={alt}
      size={size}
      power={totalPower}
    />
  );
}
const CardTile = memo(function CardTile({
  card,
  metadata,
  locale,
  labels,
  characterName,
  skillEffectLabel,
  bandId,
  characterBonusesById,
  region,
  canEdit,
  onEdit,
}: {
  card: UserGameProfileCardRecord;
  metadata?: BestdoriCardMetadata;
  locale: AppLocale;
  labels: {
    cardFallback: (cardId: number) => string;
    editCard: (cardName: string) => string;
  };
  characterName: string;
  skillEffectLabel: string;
  bandId: number | null;
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>;
  region: BandoriAssetRegion;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const cardName = pickCardName(card.cardId, metadata, locale, labels.cardFallback);
  const tileRef = useRef<HTMLElement | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);

  return (
    <article
      ref={tileRef}
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      className="group relative h-[56px] w-[56px] overflow-visible rounded-[5px] outline outline-1 outline-white/80 transition hover:z-40 hover:-translate-y-0.5 hover:outline-2 hover:outline-sky-400 focus-within:z-40 focus-within:outline-2 focus-within:outline-sky-400 sm:h-[76px] sm:w-[76px]"
    >
      <button
        type="button"
        onClick={canEdit ? onEdit : undefined}
        disabled={!canEdit}
        className={cn(
          "relative block h-full w-full overflow-visible rounded-[5px] bg-white text-left shadow-[0_2px_7px_rgba(15,23,42,0.22)]",
          !canEdit && "cursor-default",
        )}
        aria-label={canEdit ? labels.editCard(cardName) : cardName}
      >
        <CardThumbnail card={card} metadata={metadata} bandId={bandId} characterBonusesById={characterBonusesById} region={region} alt={cardName} />
      </button>

      {hoverOpen ? (
        <BandoriCardHoverTooltipPortal
          anchorRef={tileRef}
          open={hoverOpen}
          cardName={cardName}
          characterName={characterName}
        >
          <span className="block w-full whitespace-normal break-words rounded-xl bg-slate-50 px-2 py-1 text-slate-700">
            {skillEffectLabel}
          </span>
        </BandoriCardHoverTooltipPortal>
      ) : null}
    </article>
  );
});

export default function GameProfileCardsPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = use(params);
  const locale = useLocale() as AppLocale;
  const t = useTranslations("bandori.gameProfiles.cards");
  const commonT = useTranslations("common");
  const { userId, authReady, loadingProfile, profileError } = useLocalizedAccountProfile();
  const [profilePayload, setProfilePayload] = useState<UserGameProfilePayload | null>(null);
  const [cards, setCards] = useState<UserGameProfileCardRecord[]>([]);
  const [baselineCards, setBaselineCards] = useState<UserGameProfileCardRecord[]>([]);
  const [metadata, setMetadata] = useState<MetadataPayload>({ cards: {}, characters: [], skills: {} });
  const [filters, setFilters] = useState<CardFilterState>(DEFAULT_FILTERS);
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [canEditProfile, setCanEditProfile] = useState(true);
  const [baseCardsHash, setBaseCardsHash] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(CARD_PAGE_SIZE);
  const [loadingCards, setLoadingCards] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const deferredQuery = useDeferredValue(filters.query);
  const messages = useMemo<CardPageMessages>(() => ({
    notSignedIn: t("errors.notSignedIn"),
    requestFailed: (status) => t("errors.requestFailed", { status }),
    emptyPayload: t("errors.emptyPayload"),
    missingVersion: t("errors.missingVersion"),
    saveFailed: (status) => t("errors.saveFailed", { status }),
    invalidSaveResponse: t("errors.invalidSaveResponse"),
    loadCardsFailed: (status) => t("errors.loadCardsFailed", { status }),
    loadCharactersFailed: (status) => t("errors.loadCharactersFailed", { status }),
    loadSkillsFailed: (status) => t("errors.loadSkillsFailed", { status }),
  }), [t]);
  const fallbackLabels = useMemo(() => ({
    unknownCharacter: t("labels.unknownCharacter"),
    character: (characterId: number) => t("labels.characterFallback", { characterId }),
    card: (cardId: number) => t("labels.cardFallback", { cardId }),
    editCard: (cardName: string) => t("labels.editCard", { cardName }),
  }), [t]);
  const characterBonusesById = useMemo(
    () => profilePayload
      ? toBandoriCharacterBonusMap(buildBandoriCharacterBonuses(
        getGameProfileCharacterPotentials(profilePayload),
        getGameProfileCharacterMissionBonuses(profilePayload),
      ))
      : {},
    [profilePayload],
  );

  useEffect(() => {
    if (!profileId || !userId) {
      return;
    }

    let canceled = false;
    async function loadCards() {
      setLoadingCards(true);
      try {
        const nextProfile = await requestProfilePayload(profileId, messages);
        const nextPayload = nextProfile.payload;
        const nextCards = getGameProfileCards(nextPayload);
        const nextMetadata = await requestMetadata(uniqueNumbers(nextCards.map((card) => card.cardId)), messages);
        if (!canceled) {
          setProfilePayload(nextPayload);
          setCanEditProfile(nextProfile.isEditable);
          setBaseCardsHash(nextProfile.cardsHash);
          setCards(nextCards);
          setBaselineCards(nextCards);
          setMetadata(nextMetadata);
          setEditingCardId(null);
          setVisibleCount(CARD_PAGE_SIZE);
          setError("");
          setSaveMessage("");
        }
      } catch (loadError) {
        if (!canceled) {
          setError(loadError instanceof Error ? loadError.message : t("errors.loadFailed"));
        }
      } finally {
        if (!canceled) {
          setLoadingCards(false);
        }
      }
    }

    void loadCards();
    return () => {
      canceled = true;
    };
  }, [messages, profileId, t, userId]);

  const region = useMemo(() => getRegionFromProfileServer(profilePayload?.bestdoriProfile.server), [profilePayload]);
  const charactersById = useMemo(() => new Map(metadata.characters.map((character) => [character.characterId, character])), [metadata.characters]);
  const editingCard = cards.find((card) => card.cardId === editingCardId) ?? null;

  const filteredCards = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return cards.filter((card) => {
      const cardMetadata = metadata.cards[String(card.cardId)];
      const characterName = pickCharacterName(charactersById.get(cardMetadata?.characterId ?? 0), cardMetadata?.characterId, locale, fallbackLabels).toLowerCase();
      const cardName = pickCardName(card.cardId, cardMetadata, locale, fallbackLabels.card).toLowerCase();
      const attribute = isKnownAttribute(cardMetadata?.attribute) ? cardMetadata.attribute : null;

      if (normalizedQuery && !String(card.cardId).includes(normalizedQuery) && !cardName.includes(normalizedQuery) && !characterName.includes(normalizedQuery)) {
        return false;
      }
      if (filters.attribute !== "all" && attribute !== filters.attribute) {
        return false;
      }
      if (filters.rarity !== "all" && String(cardMetadata?.rarity ?? "") !== filters.rarity) {
        return false;
      }
      if (filters.training === "trained" && !card.isTrained) {
        return false;
      }
      if (filters.training === "untrained" && card.isTrained) {
        return false;
      }
      return true;
    });
  }, [cards, charactersById, deferredQuery, fallbackLabels, filters.attribute, filters.rarity, filters.training, locale, metadata.cards]);
  const visibleCardCount = Math.min(visibleCount, filteredCards.length);
  const remainingCards = Math.max(0, filteredCards.length - visibleCardCount);

  useEffect(() => {
    setVisibleCount(CARD_PAGE_SIZE);
  }, [deferredQuery, filters.attribute, filters.rarity, filters.training]);

  async function persistCards(nextCards: UserGameProfileCardRecord[], successMessage: string) {
    if (!profilePayload || !canEditProfile) {
      return;
    }

    setSaving(true);
    setSaveMessage("");
    try {
      const nextPayload = buildPayloadWithCards(profilePayload, nextCards);
      const nextCardsHash = await saveProfileCards(profileId, nextCards, nextPayload, baseCardsHash, messages);
      const savedCards = getGameProfileCards(nextPayload);
      setProfilePayload(nextPayload);
      setBaseCardsHash(nextCardsHash);
      setCards(savedCards);
      setBaselineCards(savedCards);
      setEditingCardId(null);
      setError("");
      setSaveMessage(successMessage);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("errors.saveCardsFailed"));
    } finally {
      setSaving(false);
    }
  }

  function replaceCard(nextCard: UserGameProfileCardRecord) {
    if (!canEditProfile) {
      return;
    }

    const nextCards = cards.map((card) => (card.cardId === nextCard.cardId ? nextCard : card));
    void persistCards(nextCards, t("messages.saved"));
  }

  function deleteCard(cardId: number) {
    if (!canEditProfile) {
      return;
    }

    const nextCards = cards.filter((card) => card.cardId !== cardId);
    void persistCards(nextCards, t("messages.removed"));
  }

  return (
    <AccountShell title={t("title")} description={t("description")} backHref="/bandori/game-profiles" backLabel={t("back")}>
      {!authReady || loadingProfile ? (
        <AccountLoadingState message={commonT("states.loadingAccount")} />
      ) : !userId ? (
        <AccountSignInState nextPath={`/bandori/game-profiles/${profileId}/cards`} />
      ) : profileError || error ? (
        <AccountErrorState message={profileError || error} />
      ) : loadingCards ? (
        <AccountLoadingState message={t("loadingCards")} />
      ) : (
        <section className="mx-auto w-full max-w-[960px] overflow-visible">
          <div className="flex w-full flex-col gap-4">
            <div className="overflow-hidden rounded-[28px] border border-white/65 bg-[#fffef4] shadow-[0_22px_70px_rgba(128,91,0,0.16)]">
              <div className="flex flex-col gap-4 border-b border-amber-200/80 bg-[#fff6b8]/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">{t("workbenchTitle")}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {t("summary", {
                      total: cards.length,
                      matched: filteredCards.length,
                      loaded: visibleCardCount,
                      region: region.toUpperCase(),
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {saveMessage ? (
                    <span className="inline-flex h-10 items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {saveMessage}
                    </span>
                  ) : null}
                  <Link href="/bandori/game-profiles" className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
                    {t("manageProfiles")}
                  </Link>
                </div>
              </div>

              <div className="p-4">
                <div className="rounded-3xl border border-white/70 bg-white/78 p-3 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_140px_120px] xl:grid-cols-[minmax(220px,1fr)_140px_120px_150px_auto]">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        value={filters.query}
                        onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                        placeholder={t("searchPlaceholder")}
                      />
                    </label>
                    <select value={filters.attribute} onChange={(event) => setFilters((current) => ({ ...current, attribute: event.target.value as CardFilterState["attribute"] }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300">
                      <option value="all">{t("filters.allAttributes")}</option>
                      <option value="powerful">Powerful</option>
                      <option value="pure">Pure</option>
                      <option value="cool">Cool</option>
                      <option value="happy">Happy</option>
                    </select>
                    <select value={filters.rarity} onChange={(event) => setFilters((current) => ({ ...current, rarity: event.target.value }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300">
                      <option value="all">{t("filters.allRarities")}</option>
                      {[1, 2, 3, 4, 5].map((rarity) => <option key={rarity} value={rarity}>★{rarity}</option>)}
                    </select>
                    <select value={filters.training} onChange={(event) => setFilters((current) => ({ ...current, training: event.target.value as CardFilterState["training"] }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300">
                      <option value="all">{t("filters.allTraining")}</option>
                      <option value="trained">{t("filters.trained")}</option>
                      <option value="untrained">{t("filters.untrained")}</option>
                    </select>
                    <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      {t("actions.reset")}
                    </button>
                  </div>
                </div>

                <div className="mt-4 min-h-[420px] overflow-visible rounded-3xl border border-white/70 bg-[#fffdf1]/72 p-3 shadow-inner">
                  {filteredCards.length === 0 ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-slate-500">
                      <Filter className="h-9 w-9" aria-hidden="true" />
                      <div className="text-sm font-bold">{t("states.empty")}</div>
                    </div>
                  ) : (
                    <>
                      <VirtualizedBandoriCardGrid
                        items={filteredCards}
                        visibleLimit={visibleCount}
                        getKey={(card) => card.cardId}
                        renderItem={(card) => {
                          const cardMetadata = metadata.cards[String(card.cardId)];
                          const characterName = pickFullCharacterName(charactersById.get(cardMetadata?.characterId ?? 0), cardMetadata?.characterId, locale, fallbackLabels);
                          const skillEffectLabel = getCardSkillEffectLabel(card, cardMetadata, metadata.skills);
                          return (
                            <CardTile
                              key={card.cardId}
                              card={card}
                              metadata={cardMetadata}
                              locale={locale}
                              labels={{
                                cardFallback: fallbackLabels.card,
                                editCard: fallbackLabels.editCard,
                              }}
                              characterName={characterName}
                              skillEffectLabel={skillEffectLabel}
                              bandId={charactersById.get(cardMetadata?.characterId ?? 0)?.bandId ?? null}
                              characterBonusesById={characterBonusesById}
                              region={region}
                              canEdit={canEditProfile}
                              onEdit={() => setEditingCardId(card.cardId)}
                            />
                          );
                        }}
                      />

                      {remainingCards > 0 ? (
                        <div className="mt-4 grid gap-2 sm:mx-auto sm:max-w-xl">
                          <button type="button" onClick={() => setVisibleCount((current) => Math.min(filteredCards.length, current + CARD_PAGE_SIZE))} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
                            <span className="text-xl leading-none">+</span>
                            {t("actions.showMore", { count: Math.min(CARD_PAGE_SIZE, remainingCards) })}
                          </button>
                          <button type="button" onClick={() => setVisibleCount(filteredCards.length)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
                            <span className="text-xl leading-none">+</span>
                            {t("actions.showAll")}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {editingCard && canEditProfile ? (
            <GameProfileCardEditorDialog
              card={editingCard}
              baselineCard={baselineCards.find((card) => card.cardId === editingCard.cardId) ?? null}
              metadata={metadata.cards[String(editingCard.cardId)]}
              characterName={pickFullCharacterName(
                charactersById.get(metadata.cards[String(editingCard.cardId)]?.characterId ?? 0),
                metadata.cards[String(editingCard.cardId)]?.characterId,
                locale,
                fallbackLabels,
              )}
              bandId={charactersById.get(metadata.cards[String(editingCard.cardId)]?.characterId ?? 0)?.bandId ?? null}
              characterBonusesById={characterBonusesById}
              region={region}
              saving={saving}
              onClose={() => setEditingCardId(null)}
              onSave={replaceCard}
              onDelete={() => deleteCard(editingCard.cardId)}
            />
          ) : null}
        </section>
      )}
    </AccountShell>
  );
}
