"use client";

import Link from "next/link";
import { memo, use, useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Filter,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { pickBestdoriCnThenJpName } from "@/lib/bestdori-regional-names";
import { decodeBestdoriProfile, encodeBestdoriProfile } from "@/lib/bestdori-profile-codec";
import {
  decodeCompressedGameProfilePayload,
  encodeCompressedGameProfilePayload,
  getGameProfileCards,
  type CompressedGameProfilePayload,
  type UserGameProfileCardRecord,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";
import {
  isLocalGameProfileId,
  readLocalGameProfilePayload,
  updateLocalGameProfilePayload,
} from "@/lib/user-game-profile-local-store";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "@/app/account/AccountShell";
import { getAccessToken, useAccountProfile } from "@/app/account/useAccountProfile";
import SharedBandoriCardThumbnail from "@/app/bandori/BandoriCardThumbnail";
import { cn } from "@/lib/utils";

type CardAttribute = "powerful" | "pure" | "cool" | "happy";

type BestdoriCardMetadata = {
  characterId?: number;
  rarity?: number;
  attribute?: CardAttribute | string;
  levelLimit?: number;
  resourceSetName?: string;
  prefix?: Array<string | null>;
  releasedAt?: Array<string | null>;
  type?: string;
  displayName?: string | null;
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
};

type CardFilterState = {
  query: string;
  attribute: "all" | CardAttribute;
  rarity: "all" | string;
  training: "all" | "trained" | "untrained";
};

type EditableCardField = keyof Pick<
  UserGameProfileCardRecord,
  "level" | "masterRank" | "skillLevel" | "episodeCount" | "isTrained" | "hasTrainedArt"
>;

const CARD_METADATA_CHUNK_SIZE = 150;
const CARD_PAGE_SIZE = 36;
const ATTRIBUTE_LABELS: Record<CardAttribute, string> = {
  powerful: "Powerful",
  pure: "Pure",
  cool: "Cool",
  happy: "Happy",
};
const ATTRIBUTE_CLASSES: Record<CardAttribute, string> = {
  powerful: "border-rose-300 bg-rose-50 text-rose-600",
  pure: "border-emerald-300 bg-emerald-50 text-emerald-600",
  cool: "border-sky-300 bg-sky-50 text-sky-600",
  happy: "border-orange-300 bg-orange-50 text-orange-600",
};
const DEFAULT_FILTERS: CardFilterState = {
  query: "",
  attribute: "all",
  rarity: "all",
  training: "all",
};

function clampInteger(value: number, min: number, max: number): number {
  const normalizedValue = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, normalizedValue));
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value) && value > 0)));
}

function getRegionFromProfileServer(server: number | undefined): BandoriAssetRegion {
  return server === 3 ? "cn" : "jp";
}

function pickCharacterName(character: CharacterRecord | undefined, characterId: number | undefined): string {
  return character?.nicknameCn
    ?? character?.nicknameTw
    ?? character?.nicknameJp
    ?? character?.nicknameEn
    ?? character?.characterNameCn
    ?? character?.characterNameTw
    ?? character?.characterNameJp
    ?? character?.characterNameEn
    ?? (characterId ? `角色 ${characterId}` : "未知角色");
}

function pickCardName(cardId: number, metadata?: BestdoriCardMetadata): string {
  return metadata?.displayName
    ?? pickBestdoriCnThenJpName(metadata?.prefix)
    ?? `卡牌 ${cardId}`;
}

function isKnownAttribute(value: string | undefined): value is CardAttribute {
  return value === "powerful" || value === "pure" || value === "cool" || value === "happy";
}

function getCardLevelLimit(card: UserGameProfileCardRecord, metadata?: BestdoriCardMetadata): number {
  const baseLevelLimit = Math.max(1, Math.trunc(Number(metadata?.levelLimit) || card.level || 60));
  const trainingLevelLimit = Math.max(0, Math.trunc(Number(metadata?.stat?.training?.levelLimit) || 0));
  const trainedLimit = card.isTrained ? baseLevelLimit + trainingLevelLimit : baseLevelLimit;
  return Math.max(trainedLimit, card.level, 1);
}

function hasCardChanged(left: UserGameProfileCardRecord, right: UserGameProfileCardRecord): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
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

async function requestProfilePayload(profileId: string): Promise<UserGameProfilePayload> {
  if (isLocalGameProfileId(profileId)) {
    return readLocalGameProfilePayload(profileId);
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("请先登录");
  }

  const response = await fetch(`/api/account/game-profiles/${profileId}/payload`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) || `请求失败（HTTP ${response.status}）`);
  }

  const compressed = parseApiSuccessData<CompressedGameProfilePayload>(payload);
  if (!compressed) {
    throw new Error("档案数据为空");
  }

  return decodeCompressedGameProfilePayload(compressed);
}

async function requestProfileEditable(profileId: string): Promise<boolean> {
  return isLocalGameProfileId(profileId);
}

async function saveProfilePayload(profileId: string, payload: UserGameProfilePayload): Promise<void> {
  if (isLocalGameProfileId(profileId)) {
    await updateLocalGameProfilePayload(profileId, payload);
    return;
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("请先登录");
  }

  const response = await fetch(`/api/account/game-profiles/${profileId}/payload`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ compressed: await encodeCompressedGameProfilePayload(payload) }),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(responsePayload) || `保存失败（HTTP ${response.status}）`);
  }
}

async function requestCardMetadata(cardIds: number[]): Promise<Record<string, BestdoriCardMetadata>> {
  const chunks: number[][] = [];
  for (let index = 0; index < cardIds.length; index += CARD_METADATA_CHUNK_SIZE) {
    chunks.push(cardIds.slice(index, index + CARD_METADATA_CHUNK_SIZE));
  }

  const responses = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await fetch(`/api/bandori/cards?ids=${chunk.join(",")}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload) || `读取卡牌资料失败（HTTP ${response.status}）`);
      }
      return parseApiSuccessData<{ cards?: Record<string, BestdoriCardMetadata> }>(payload)?.cards ?? {};
    }),
  );

  return Object.assign({}, ...responses);
}

async function requestMetadata(cardIds: number[]): Promise<MetadataPayload> {
  const [cards, charactersResponse] = await Promise.all([
    requestCardMetadata(cardIds),
    fetch("/api/bandori/characters"),
  ]);
  const charactersPayload = await charactersResponse.json().catch(() => ({}));
  const characterData = parseApiSuccessData<{ characters?: CharacterRecord[] }>(charactersPayload);

  if (!charactersResponse.ok) {
    throw new Error(getApiErrorMessage(charactersPayload) || `读取角色资料失败（HTTP ${charactersResponse.status}）`);
  }

  return {
    cards,
    characters: Array.isArray(characterData?.characters) ? characterData.characters : [],
  };
}

function SegmentedControl<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-center">
      <div className="text-sm font-semibold text-slate-600 sm:text-right">{label}</div>
      <div className="inline-flex w-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={Object.is(option.value, value)}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-w-10 border-r border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition last:border-r-0 hover:bg-sky-50 hover:text-sky-700",
              Object.is(option.value, value) && "bg-sky-600 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] hover:bg-sky-600 hover:text-white",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CardThumbnail({
  card,
  metadata,
  bandId,
  region,
  alt,
  size = "tile",
}: {
  card: UserGameProfileCardRecord;
  metadata?: BestdoriCardMetadata;
  bandId: number | null;
  region: BandoriAssetRegion;
  alt: string;
  size?: "tile" | "preview";
}) {
  return (
    <SharedBandoriCardThumbnail
      card={card}
      metadata={metadata}
      bandId={bandId}
      region={region}
      alt={alt}
      size={size}
    />
  );
}
function CardEditorDialog({
  card,
  baselineCard,
  metadata,
  characterName,
  bandId,
  region,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  card: UserGameProfileCardRecord;
  baselineCard: UserGameProfileCardRecord | null;
  metadata?: BestdoriCardMetadata;
  characterName: string;
  bandId: number | null;
  region: BandoriAssetRegion;
  saving: boolean;
  onClose: () => void;
  onSave: (card: UserGameProfileCardRecord) => void;
  onDelete: (cardId: number) => void;
}) {
  const [draft, setDraft] = useState(card);
  const levelLimit = getCardLevelLimit(draft, metadata);
  const cardName = pickCardName(draft.cardId, metadata);
  const hasChanges = baselineCard ? hasCardChanged(draft, baselineCard) : hasCardChanged(draft, card);

  function updateDraft(field: EditableCardField, value: number | boolean) {
    setDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
        [field]: value,
      };
      if (field === "isTrained" && value === false) {
        nextDraft.hasTrainedArt = false;
      }
      if (field === "isTrained" && value === true) {
        nextDraft.hasTrainedArt = true;
      }
      return {
        ...nextDraft,
        level: clampInteger(nextDraft.level, 1, getCardLevelLimit(nextDraft, metadata)),
        masterRank: clampInteger(nextDraft.masterRank, 0, 4),
        skillLevel: clampInteger(nextDraft.skillLevel, 1, 5),
        episodeCount: clampInteger(nextDraft.episodeCount, 0, 2),
      };
    });
  }

  const dialog = (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/72 px-0 py-0 backdrop-blur-md sm:items-center sm:px-4 sm:py-8" role="dialog" aria-modal="true" aria-labelledby="card-editor-title">
      <div className="flex max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-white/90 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.42)] sm:rounded-[28px]">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 id="card-editor-title" className="text-xl font-bold text-slate-900">编辑卡牌资料</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Card #{draft.cardId}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-500" aria-label="关闭编辑器">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-5 lg:grid-cols-[132px_minmax(0,1fr)]">
            <div className="mx-auto flex w-full max-w-[132px] flex-col items-center">
              <div className="h-[112px] w-[112px] overflow-hidden rounded-[8px] border border-white/80 bg-white shadow-[0_14px_32px_rgba(15,23,42,0.18)]">
                <CardThumbnail card={draft} metadata={metadata} bandId={bandId} region={region} alt={`${cardName} 缩略图`} size="preview" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/80 to-rose-50/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-2xl font-bold text-slate-900">{cardName}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{characterName}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {metadata?.rarity ? <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-amber-600">★{metadata.rarity}</span> : null}
                    {isKnownAttribute(metadata?.attribute) ? (
                      <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", ATTRIBUTE_CLASSES[metadata.attribute])}>
                        {ATTRIBUTE_LABELS[metadata.attribute]}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-semibold text-slate-600 sm:text-right">等级</span>
                  <select
                    value={draft.level}
                    onChange={(event) => updateDraft("level", Number(event.target.value))}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  >
                    {Array.from({ length: levelLimit }, (_, index) => index + 1).map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </label>

                <SegmentedControl label="星光等级" value={draft.masterRank} options={[0, 1, 2, 3, 4].map((value) => ({ value, label: String(value) }))} onChange={(value) => updateDraft("masterRank", value)} />
                <SegmentedControl label="技能等级" value={draft.skillLevel} options={[1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))} onChange={(value) => updateDraft("skillLevel", value)} />
                <SegmentedControl label="故事" value={draft.episodeCount} options={[0, 1, 2].map((value) => ({ value, label: String(value) }))} onChange={(value) => updateDraft("episodeCount", value)} />
                <SegmentedControl label="特训" value={draft.isTrained} options={[{ value: false, label: "否" }, { value: true, label: "是" }]} onChange={(value) => updateDraft("isTrained", value)} />
                <SegmentedControl label="特训后图" value={draft.hasTrainedArt} options={[{ value: false, label: "否" }, { value: true, label: "是" }]} onChange={(value) => updateDraft("hasTrainedArt", value)} />
              </div>
            </div>
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/82 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <button type="button" onClick={() => onDelete(draft.cardId)} disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            删除
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            <X className="h-4 w-4" aria-hidden="true" />
            取消
          </button>
          <button type="button" onClick={() => onSave(draft)} disabled={saving || !hasChanges} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.26)] transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "保存中..." : "保存"}
          </button>
        </footer>
      </div>
    </div>
  );

  const portalRoot = typeof document === "undefined" ? null : document.body;
  if (!portalRoot) {
    return null;
  }

  return createPortal(dialog, portalRoot);
}

const CardTile = memo(function CardTile({
  card,
  metadata,
  characterName,
  bandId,
  region,
  canEdit,
  onEdit,
}: {
  card: UserGameProfileCardRecord;
  metadata?: BestdoriCardMetadata;
  characterName: string;
  bandId: number | null;
  region: BandoriAssetRegion;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const cardName = pickCardName(card.cardId, metadata);

  return (
    <article
      className="group relative h-[74px] w-[74px] overflow-visible rounded-[5px] outline outline-1 outline-white/80 transition hover:z-40 hover:-translate-y-0.5 hover:outline-2 hover:outline-sky-400 focus-within:z-40 focus-within:outline-2 focus-within:outline-sky-400 sm:h-[76px] sm:w-[76px]"
    >
      <button
        type="button"
        onClick={canEdit ? onEdit : undefined}
        disabled={!canEdit}
        className={cn(
          "relative block h-full w-full overflow-hidden rounded-[5px] bg-white text-left shadow-[0_2px_7px_rgba(15,23,42,0.22)]",
          !canEdit && "cursor-default",
        )}
        aria-label={canEdit ? `编辑 ${cardName}` : cardName}
      >
        <CardThumbnail card={card} metadata={metadata} bandId={bandId} region={region} alt={cardName} />
      </button>

      <div className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 hidden w-56 -translate-x-1/2 rounded-[18px] border border-white/90 bg-white p-3 text-center shadow-[0_18px_48px_rgba(15,23,42,0.22)] ring-1 ring-slate-950/5 group-hover:block group-focus-within:block">
        <div className="truncate text-sm font-black text-slate-900">{cardName}</div>
        <div className="mt-1 truncate text-xs font-semibold text-slate-500">{characterName}</div>
        <div className="mt-2 flex justify-center gap-2 text-[11px] font-black">
          <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-amber-700">★{metadata?.rarity ?? "-"}</span>
          <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-sky-700">星光 {card.masterRank}</span>
          <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-1 text-rose-700">技能 {card.skillLevel}</span>
        </div>
      </div>
    </article>
  );
});

export default function GameProfileCardsPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = use(params);
  const { userId, authReady, loadingProfile, profileError } = useAccountProfile();
  const [profilePayload, setProfilePayload] = useState<UserGameProfilePayload | null>(null);
  const [cards, setCards] = useState<UserGameProfileCardRecord[]>([]);
  const [baselineCards, setBaselineCards] = useState<UserGameProfileCardRecord[]>([]);
  const [metadata, setMetadata] = useState<MetadataPayload>({ cards: {}, characters: [] });
  const [filters, setFilters] = useState<CardFilterState>(DEFAULT_FILTERS);
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [canEditProfile, setCanEditProfile] = useState(true);
  const [visibleCount, setVisibleCount] = useState(CARD_PAGE_SIZE);
  const [loadingCards, setLoadingCards] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => {
    if (!profileId || !userId) {
      return;
    }

    let canceled = false;
    async function loadCards() {
      setLoadingCards(true);
      try {
        const [nextPayload, nextCanEditProfile] = await Promise.all([
          requestProfilePayload(profileId),
          requestProfileEditable(profileId),
        ]);
        const nextCards = getGameProfileCards(nextPayload);
        const nextMetadata = await requestMetadata(uniqueNumbers(nextCards.map((card) => card.cardId)));
        if (!canceled) {
          setProfilePayload(nextPayload);
          setCanEditProfile(nextCanEditProfile);
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
          setError(loadError instanceof Error ? loadError.message : "读取卡牌失败");
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
  }, [profileId, userId]);

  const region = useMemo(() => getRegionFromProfileServer(profilePayload?.bestdoriProfile.server), [profilePayload]);
  const charactersById = useMemo(() => new Map(metadata.characters.map((character) => [character.characterId, character])), [metadata.characters]);
  const editingCard = cards.find((card) => card.cardId === editingCardId) ?? null;

  const filteredCards = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return cards.filter((card) => {
      const cardMetadata = metadata.cards[String(card.cardId)];
      const characterName = pickCharacterName(charactersById.get(cardMetadata?.characterId ?? 0), cardMetadata?.characterId).toLowerCase();
      const cardName = pickCardName(card.cardId, cardMetadata).toLowerCase();
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
  }, [cards, charactersById, deferredQuery, filters.attribute, filters.rarity, filters.training, metadata.cards]);
  const visibleCards = useMemo(() => filteredCards.slice(0, visibleCount), [filteredCards, visibleCount]);
  const remainingCards = Math.max(0, filteredCards.length - visibleCards.length);

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
      await saveProfilePayload(profileId, nextPayload);
      const savedCards = getGameProfileCards(nextPayload);
      setProfilePayload(nextPayload);
      setCards(savedCards);
      setBaselineCards(savedCards);
      setEditingCardId(null);
      setError("");
      setSaveMessage(successMessage);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存卡牌失败");
    } finally {
      setSaving(false);
    }
  }

  function replaceCard(nextCard: UserGameProfileCardRecord) {
    if (!canEditProfile) {
      return;
    }

    const nextCards = cards.map((card) => (card.cardId === nextCard.cardId ? nextCard : card));
    void persistCards(nextCards, "卡牌资料已保存");
  }

  function deleteCard(cardId: number) {
    if (!canEditProfile) {
      return;
    }

    const nextCards = cards.filter((card) => card.cardId !== cardId);
    void persistCards(nextCards, "卡牌已移除");
  }

  return (
    <AccountShell title="档案卡牌" description="查看、筛选并编辑当前档案的卡牌资料。" backHref="/bandori/game-profiles" backLabel="返回游戏档案">
      {!authReady || loadingProfile ? (
        <AccountLoadingState message="正在读取账号信息..." />
      ) : !userId ? (
        <AccountSignInState nextPath={`/bandori/game-profiles/${profileId}/cards`} />
      ) : profileError || error ? (
        <AccountErrorState message={profileError || error} />
      ) : loadingCards ? (
        <AccountLoadingState message="正在读取卡牌..." />
      ) : (
        <section className="mx-auto w-full max-w-[960px] overflow-visible">
          <div className="flex w-full flex-col gap-4">
            <div className="overflow-hidden rounded-[28px] border border-white/65 bg-white/76 shadow-[0_22px_70px_rgba(128,91,0,0.16)] backdrop-blur-xl">
              <div className="flex flex-col gap-4 border-b border-amber-200/80 bg-[#fff6b8]/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">卡牌资料工作台</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    共 {cards.length} 张卡牌 · 匹配 {filteredCards.length} 张 · 已加载 {visibleCards.length} 张 · 资源区服 {region.toUpperCase()}
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
                    档案管理
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
                        placeholder="搜索卡牌 ID、名称、角色"
                      />
                    </label>
                    <select value={filters.attribute} onChange={(event) => setFilters((current) => ({ ...current, attribute: event.target.value as CardFilterState["attribute"] }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300">
                      <option value="all">全部属性</option>
                      <option value="powerful">Powerful</option>
                      <option value="pure">Pure</option>
                      <option value="cool">Cool</option>
                      <option value="happy">Happy</option>
                    </select>
                    <select value={filters.rarity} onChange={(event) => setFilters((current) => ({ ...current, rarity: event.target.value }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300">
                      <option value="all">全部星级</option>
                      {[1, 2, 3, 4, 5].map((rarity) => <option key={rarity} value={rarity}>★{rarity}</option>)}
                    </select>
                    <select value={filters.training} onChange={(event) => setFilters((current) => ({ ...current, training: event.target.value as CardFilterState["training"] }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300">
                      <option value="all">全部训练</option>
                      <option value="trained">已特训</option>
                      <option value="untrained">未特训</option>
                    </select>
                    <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      重置
                    </button>
                  </div>
                </div>

                <div className="mt-4 min-h-[420px] overflow-visible rounded-3xl border border-white/70 bg-[#fffdf1]/72 p-3 shadow-inner">
                  {filteredCards.length === 0 ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-slate-500">
                      <Filter className="h-9 w-9" aria-hidden="true" />
                      <div className="text-sm font-bold">没有符合条件的卡牌</div>
                    </div>
                  ) : (
                    <>
                      <div className="grid justify-center gap-[6px] [grid-template-columns:repeat(auto-fill,74px)] sm:[grid-template-columns:repeat(auto-fill,76px)]">
                        {visibleCards.map((card) => {
                          const cardMetadata = metadata.cards[String(card.cardId)];
                          const characterName = pickCharacterName(charactersById.get(cardMetadata?.characterId ?? 0), cardMetadata?.characterId);
                          return (
                            <CardTile
                              key={card.cardId}
                              card={card}
                              metadata={cardMetadata}
                              characterName={characterName}
                              bandId={charactersById.get(cardMetadata?.characterId ?? 0)?.bandId ?? null}
                              region={region}
                              canEdit={canEditProfile}
                              onEdit={() => setEditingCardId(card.cardId)}
                            />
                          );
                        })}
                      </div>

                      {remainingCards > 0 ? (
                        <div className="mt-4 grid gap-2 sm:mx-auto sm:max-w-xl">
                          <button type="button" onClick={() => setVisibleCount((current) => Math.min(filteredCards.length, current + CARD_PAGE_SIZE))} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
                            <span className="text-xl leading-none">+</span>
                            显示更多（{remainingCards}）
                          </button>
                          <button type="button" onClick={() => setVisibleCount(filteredCards.length)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
                            <span className="text-xl leading-none">+</span>
                            显示全部
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
            <CardEditorDialog
              card={editingCard}
              baselineCard={baselineCards.find((card) => card.cardId === editingCard.cardId) ?? null}
              metadata={metadata.cards[String(editingCard.cardId)]}
              characterName={pickCharacterName(charactersById.get(metadata.cards[String(editingCard.cardId)]?.characterId ?? 0), metadata.cards[String(editingCard.cardId)]?.characterId)}
              bandId={charactersById.get(metadata.cards[String(editingCard.cardId)]?.characterId ?? 0)?.bandId ?? null}
              region={region}
              saving={saving}
              onClose={() => setEditingCardId(null)}
              onSave={replaceCard}
              onDelete={deleteCard}
            />
          ) : null}
        </section>
      )}
    </AccountShell>
  );
}
