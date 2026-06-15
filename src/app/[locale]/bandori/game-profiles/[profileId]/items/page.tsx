"use client";

import { Link } from "@/i18n/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { type AppLocale } from "@/i18n/routing";
import {
  decodeCompressedGameProfilePayload,
  compactMissionBonusRecords,
  compactPotentialRecords,
  getGameProfileAreaItems,
  getGameProfileCharacterMissionBonuses,
  getGameProfileCharacterPotentials,
  type CompressedGameProfilePayload,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";
import { decodeBestdoriProfile, encodeBestdoriProfile } from "@/lib/bestdori-profile-codec";
import { BANDORI_AREA_ITEM_GROUPS, BANDORI_AREA_ITEM_IDS } from "@/lib/bandori-area-item-groups";
import { BANDORI_CHARACTER_GROUPS, compareBandoriCharacterIds } from "@/lib/bandori-character-groups";
import {
  isLocalGameProfileId,
  readLocalGameProfilePayload,
  updateLocalGameProfilePayload,
} from "@/lib/user-game-profile-local-store";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "@/app/[locale]/account/AccountShell";
import { getAccessToken, useLocalizedAccountProfile } from "@/app/[locale]/account/useAccountProfile";

type ItemRecord = {
  itemKey: string;
  areaItemId: number | null;
  itemCount: number;
  level: number;
};

type PotentialRecord = {
  characterId: number;
  performanceLevel: number | null;
  techniqueLevel: number | null;
  visualLevel: number | null;
};

type MissionBonusRecord = {
  characterId: number;
  bonusType: string;
  performance: number;
  technique: number;
  visual: number;
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

type AreaItemMetadata = {
  areaItemId: number;
  areaItemName: Array<string | null>;
  level?: Array<number | null>;
  source?: string;
};

type ItemsPayload = {
  areaItems: ItemRecord[];
  characterPotentials: PotentialRecord[];
  characterMissionBonuses: MissionBonusRecord[];
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
  itemsHash: string | null;
};

type ItemPageMessages = {
  notSignedIn: string;
  requestFailed: (status: number) => string;
  emptyPayload: string;
  missingVersion: string;
  saveFailed: (status: number) => string;
  invalidSaveResponse: string;
};

type MetadataPayload = {
  characters: CharacterRecord[];
  areaItems: Record<string, AreaItemMetadata>;
};

type CharacterGroup = {
  bandId: number;
  label: string;
};

type CharacterBonusRow = {
  characterId: number;
  characterName: string;
  potential: PotentialRecord;
  training: MissionBonusRecord;
  collection: MissionBonusRecord;
};

const AREA_ITEM_GROUPS = BANDORI_AREA_ITEM_GROUPS;

const CHARACTER_GROUPS: CharacterGroup[] = [
  ...BANDORI_CHARACTER_GROUPS.map((group) => ({ bandId: group.bandId, label: group.label })),
];

const AREA_ITEM_IDS = BANDORI_AREA_ITEM_IDS;
const CHARACTER_GROUP_BAND_IDS = new Set(CHARACTER_GROUPS.map((group) => group.bandId));
const MAX_CHARACTER_ID = 50;
const EN_AREA_ITEM_GROUP_LABELS: Record<string, string> = {
  PoppinParty: "Poppin'Party items",
  Afterglow: "Afterglow items",
  HelloHappyWorld: "Hello, Happy World! items",
  PastelPalettes: "Pastel Palettes items",
  Roselia: "Roselia items",
  Morfonica: "Morfonica items",
  RaiseASuilen: "RAISE A SUILEN items",
  MyGO: "MyGO!!!!! items",
  Everyone: "Everyone items",
  Magazine: "Magazine items",
  Plaza: "Plaza items",
  Menu: "Menu items",
};

function emptyItems(): ItemsPayload {
  return {
    areaItems: [],
    characterPotentials: [],
    characterMissionBonuses: [],
  };
}

function itemsFromProfilePayload(payload: UserGameProfilePayload): ItemsPayload {
  return {
    areaItems: getGameProfileAreaItems(payload),
    characterPotentials: getGameProfileCharacterPotentials(payload),
    characterMissionBonuses: getGameProfileCharacterMissionBonuses(payload),
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

async function requestProfilePayload(profileId: string, messages: ItemPageMessages): Promise<LoadedProfilePayload> {
  if (isLocalGameProfileId(profileId)) {
    return {
      payload: await readLocalGameProfilePayload(profileId),
      isEditable: true,
      itemsHash: null,
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
    itemsHash: data.sectionVersions.itemsHash,
  };
}

async function requestMetadata(): Promise<MetadataPayload> {
  const [charactersResponse, areaItemsResponse] = await Promise.all([
    fetch("/api/bandori/characters"),
    fetch("/api/bandori/area-items"),
  ]);

  const [charactersPayload, areaItemsPayload] = await Promise.all([
    charactersResponse.json().catch(() => ({})),
    areaItemsResponse.json().catch(() => ({})),
  ]);

  const characterData = parseApiSuccessData<{ characters?: CharacterRecord[] }>(charactersPayload);
  const areaItemData = parseApiSuccessData<{
    areaItems?: Record<string, AreaItemMetadata>;
  }>(areaItemsPayload);

  return {
    characters: Array.isArray(characterData?.characters) ? characterData.characters : [],
    areaItems: areaItemData?.areaItems ?? {},
  };
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
  characterId: number,
  locale: AppLocale,
  fallback: (characterId: number) => string,
): string {
  const name = locale === "en"
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

  return name ?? fallback(characterId);
}

function pickAreaItemName(
  areaItem: AreaItemMetadata | undefined,
  areaItemId: number | null,
  locale: AppLocale,
  fallback: { areaItem: (areaItemId: number) => string; genericAreaItem: string },
): string {
  const name = locale === "en"
    ? pickNonEmptyText(areaItem?.areaItemName?.[1], areaItem?.areaItemName?.[0], areaItem?.areaItemName?.[3], areaItem?.areaItemName?.[2])
    : pickNonEmptyText(areaItem?.areaItemName?.[3], areaItem?.areaItemName?.[2], areaItem?.areaItemName?.[1], areaItem?.areaItemName?.[0]);

  return name ?? (areaItemId ? fallback.areaItem(areaItemId) : fallback.genericAreaItem);
}

function resolveAreaItemId(areaItemId: number | null, metadata: MetadataPayload): number | null {
  if (!areaItemId) {
    return null;
  }

  if (metadata.areaItems[String(areaItemId)]) {
    return areaItemId;
  }

  return areaItemId;
}

function getAreaItemMaxLevel(areaItem: AreaItemMetadata | undefined, currentLevel: number): number {
  const cnLevel = Number(areaItem?.level?.[3]);
  if (Number.isFinite(cnLevel) && cnLevel > 0) {
    return Math.max(cnLevel, currentLevel, 1);
  }

  const metadataMaxLevel = Math.max(
    0,
    ...(areaItem?.level ?? []).map((level) => Number(level)).filter((level) => Number.isFinite(level)),
  );
  return Math.max(metadataMaxLevel, currentLevel, 1);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(Number.isFinite(value) ? value : min)));
}

function createPotential(characterId: number): PotentialRecord {
  return {
    characterId,
    performanceLevel: 0,
    techniqueLevel: 0,
    visualLevel: 0,
  };
}

function createMissionBonus(characterId: number, bonusType: "TRAINING" | "COLLECTION"): MissionBonusRecord {
  return {
    characterId,
    bonusType,
    performance: 0,
    technique: 0,
    visual: 0,
  };
}

function normalizeMissionBonusType(value: string): "TRAINING" | "COLLECTION" {
  return value.toUpperCase() === "TRAINING" ? "TRAINING" : "COLLECTION";
}

function getAreaItemGroupLabel(group: { key: string; label: string }, locale: AppLocale): string {
  return locale === "en" ? EN_AREA_ITEM_GROUP_LABELS[group.key] ?? group.label : group.label;
}

function isSameItemsPayload(left: ItemsPayload, right: ItemsPayload): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildPayloadWithItems(payload: UserGameProfilePayload, items: ItemsPayload): UserGameProfilePayload {
  const normalizedProfile = decodeBestdoriProfile(payload.bestdoriProfile);
  const levelsByAreaItemId = new Map<number, number>();

  items.areaItems.forEach((item) => {
    if (item.areaItemId !== null) {
      levelsByAreaItemId.set(item.areaItemId, clampInteger(item.level, 0, 99));
    }
  });

  normalizedProfile.items = Object.fromEntries(
    AREA_ITEM_GROUPS.map((group) => [
      group.key,
      group.itemIds.map((areaItemId) => levelsByAreaItemId.get(areaItemId) ?? null),
    ]),
  );

  return {
    ...payload,
    bestdoriProfile: encodeBestdoriProfile(normalizedProfile),
    characterPotentials: compactPotentialRecords(items.characterPotentials),
    characterMissionBonuses: compactMissionBonusRecords(items.characterMissionBonuses),
  };
}

function LevelSelector({
  label,
  value,
  maxLevel,
  disabled,
  changed,
  onChange,
}: {
  label: string;
  value: number;
  maxLevel: number;
  disabled: boolean;
  changed: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className={`grid w-full overflow-hidden rounded-xl border text-sm sm:inline-flex sm:w-auto ${changed ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"}`}
      role="radiogroup"
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${maxLevel + 1}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: maxLevel + 1 }, (_, level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={value === level}
          disabled={disabled}
          onClick={() => onChange(level)}
          className={`h-9 min-w-0 border-r border-slate-200 px-0 text-center font-medium transition last:border-r-0 disabled:cursor-default sm:min-w-9 sm:px-3 ${
            value === level
              ? "bg-sky-600 text-white"
              : disabled
                ? "text-slate-500"
                : "text-slate-700 hover:bg-slate-50"
          }`}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

function NumberStepper({
  label,
  value,
  disabled,
  changed,
  max = 999,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  changed: boolean;
  max?: number;
  onChange: (value: number) => void;
}) {
  const normalizedValue = clampInteger(value, 0, max);
  return (
    <div className={`inline-flex h-9 items-center overflow-hidden rounded-xl border text-center text-sm tabular-nums ${changed ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"}`}>
      <span className="min-w-10 px-2 text-center text-xs font-semibold text-slate-500">{label}</span>
      <button type="button" disabled={disabled} onClick={() => onChange(normalizedValue - 1)} className="h-9 w-8 border-l border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-default disabled:text-slate-300">
        -
      </button>
      {disabled ? (
        <span className="flex h-9 w-12 items-center justify-center border-l border-slate-200 font-semibold leading-none text-slate-900">
          {normalizedValue}
        </span>
      ) : (
        <input
          aria-label={label}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={normalizedValue}
          onChange={(event) => onChange(Number(event.target.value))}
          className="flex h-9 w-12 items-center justify-center border-l border-slate-200 bg-transparent p-0 text-center font-semibold leading-none text-slate-900 outline-none"
        />
      )}
      <button type="button" disabled={disabled} onClick={() => onChange(normalizedValue + 1)} className="h-9 w-8 border-l border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-default disabled:text-slate-300">
        +
      </button>
    </div>
  );
}

function BonusFields({
  title,
  values,
  baseline,
  disabled,
  max,
  labels,
  onChange,
}: {
  title: string;
  values: { performance: number; technique: number; visual: number };
  baseline: { performance: number; technique: number; visual: number };
  disabled: boolean;
  max?: number;
  labels: { performance: string; technique: string; visual: string };
  onChange: (field: "performance" | "technique" | "visual", value: number) => void;
}) {
  return (
    <div className="min-w-0 text-center">
      <div className="mb-2 text-xs font-semibold text-slate-500">{title}</div>
      <div className="flex flex-wrap justify-center gap-2">
        <NumberStepper label={labels.performance} value={values.performance} disabled={disabled} max={max} changed={values.performance !== baseline.performance} onChange={(value) => onChange("performance", value)} />
        <NumberStepper label={labels.technique} value={values.technique} disabled={disabled} max={max} changed={values.technique !== baseline.technique} onChange={(value) => onChange("technique", value)} />
        <NumberStepper label={labels.visual} value={values.visual} disabled={disabled} max={max} changed={values.visual !== baseline.visual} onChange={(value) => onChange("visual", value)} />
      </div>
    </div>
  );
}

export default function GameProfileItemsPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = use(params);
  const locale = useLocale() as AppLocale;
  const t = useTranslations("bandori.gameProfiles.items");
  const commonT = useTranslations("common");
  const { userId, authReady, loadingProfile, profileError } = useLocalizedAccountProfile();
  const [profilePayload, setProfilePayload] = useState<UserGameProfilePayload | null>(null);
  const [items, setItems] = useState<ItemsPayload>(emptyItems);
  const [baselineItems, setBaselineItems] = useState<ItemsPayload>(emptyItems);
  const [metadata, setMetadata] = useState<MetadataPayload>({
    characters: [],
    areaItems: {},
  });
  const [activeTab, setActiveTab] = useState<"area" | "characters">("area");
  const [editing, setEditing] = useState(false);
  const [isEditableProfile, setIsEditableProfile] = useState(true);
  const [baseItemsHash, setBaseItemsHash] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const messages = useMemo<ItemPageMessages>(() => ({
    notSignedIn: t("errors.notSignedIn"),
    requestFailed: (status) => t("errors.requestFailed", { status }),
    emptyPayload: t("errors.emptyPayload"),
    missingVersion: t("errors.missingVersion"),
    saveFailed: (status) => t("errors.saveFailed", { status }),
    invalidSaveResponse: t("errors.invalidSaveResponse"),
  }), [t]);
  const labels = useMemo(() => ({
    character: (characterId: number) => t("labels.characterFallback", { characterId }),
    areaItem: (areaItemId: number) => t("labels.areaItemFallback", { areaItemId }),
    genericAreaItem: t("labels.areaItemGeneric"),
    bonusFields: {
      performance: t("labels.performanceShort"),
      technique: t("labels.techniqueShort"),
      visual: t("labels.visualShort"),
    },
  }), [t]);

  useEffect(() => {
    if (!profileId || !userId) {
      return;
    }

    let canceled = false;
    async function loadItems() {
      setLoadingItems(true);
      try {
        const [nextProfile, nextMetadata] = await Promise.all([
          requestProfilePayload(profileId, messages),
          requestMetadata(),
        ]);
        const nextPayload = nextProfile.payload;
        const nextItems = itemsFromProfilePayload(nextPayload);
        if (!canceled) {
          setProfilePayload(nextPayload);
          setIsEditableProfile(nextProfile.isEditable);
          setBaseItemsHash(nextProfile.itemsHash);
          setItems(nextItems);
          setBaselineItems(nextItems);
          setMetadata(nextMetadata);
          setEditing(false);
          setSaveMessage("");
          setError("");
        }
      } catch (loadError) {
        if (!canceled) {
          setError(loadError instanceof Error ? loadError.message : t("errors.loadFailed"));
        }
      } finally {
        if (!canceled) {
          setLoadingItems(false);
        }
      }
    }

    void loadItems();
    return () => {
      canceled = true;
    };
  }, [messages, profileId, t, userId]);

  const areaItemsById = useMemo(() => {
    const result = new Map<number, ItemRecord>();
    items.areaItems.forEach((item) => {
      const resolvedAreaItemId = resolveAreaItemId(item.areaItemId, metadata);
      if (resolvedAreaItemId !== null) {
        result.set(resolvedAreaItemId, { ...item, areaItemId: resolvedAreaItemId });
      }
    });
    return result;
  }, [items.areaItems, metadata]);

  const baselineAreaItemsById = useMemo(() => {
    const result = new Map<number, ItemRecord>();
    baselineItems.areaItems.forEach((item) => {
      const resolvedAreaItemId = resolveAreaItemId(item.areaItemId, metadata);
      if (resolvedAreaItemId !== null) {
        result.set(resolvedAreaItemId, { ...item, areaItemId: resolvedAreaItemId });
      }
    });
    return result;
  }, [baselineItems.areaItems, metadata]);

  const characterRowsByBand = useMemo(() => {
    const potentialByCharacter = new Map(items.characterPotentials.map((record) => [record.characterId, record]));
    const missionByCharacterAndType = new Map(items.characterMissionBonuses.map((record) => [`${record.characterId}:${normalizeMissionBonusType(record.bonusType)}`, record]));

    return CHARACTER_GROUPS.map((group) => {
      const rows = metadata.characters
        .filter((character) => character.bandId === group.bandId && character.characterId > 0 && character.characterId <= MAX_CHARACTER_ID)
        .sort((left, right) => compareBandoriCharacterIds(left.characterId, right.characterId))
        .map((character): CharacterBonusRow => ({
          characterId: character.characterId,
          characterName: pickCharacterName(character, character.characterId, locale, labels.character),
          potential: potentialByCharacter.get(character.characterId) ?? createPotential(character.characterId),
          training: missionByCharacterAndType.get(`${character.characterId}:TRAINING`) ?? createMissionBonus(character.characterId, "TRAINING"),
          collection: missionByCharacterAndType.get(`${character.characterId}:COLLECTION`) ?? createMissionBonus(character.characterId, "COLLECTION"),
        }));

      return { ...group, rows };
    }).filter((group) => group.rows.length > 0);
  }, [items.characterMissionBonuses, items.characterPotentials, labels, locale, metadata.characters]);

  const baselineCharacterRows = useMemo(() => {
    const potentialByCharacter = new Map(baselineItems.characterPotentials.map((record) => [record.characterId, record]));
    const missionByCharacterAndType = new Map(baselineItems.characterMissionBonuses.map((record) => [`${record.characterId}:${normalizeMissionBonusType(record.bonusType)}`, record]));
    return new Map(metadata.characters.map((character) => [
      character.characterId,
      {
        potential: potentialByCharacter.get(character.characterId) ?? createPotential(character.characterId),
        training: missionByCharacterAndType.get(`${character.characterId}:TRAINING`) ?? createMissionBonus(character.characterId, "TRAINING"),
        collection: missionByCharacterAndType.get(`${character.characterId}:COLLECTION`) ?? createMissionBonus(character.characterId, "COLLECTION"),
      },
    ]));
  }, [baselineItems.characterMissionBonuses, baselineItems.characterPotentials, metadata.characters]);

  const unknownAreaItems = useMemo(() => (
    [...areaItemsById.values()]
      .filter((item) => item.areaItemId !== null && !AREA_ITEM_IDS.has(item.areaItemId))
      .sort((left, right) => (left.areaItemId ?? 0) - (right.areaItemId ?? 0))
  ), [areaItemsById]);

  const hasChanges = useMemo(() => !isSameItemsPayload(items, baselineItems), [baselineItems, items]);

  function updateAreaItemLevel(areaItemId: number, level: number) {
    setItems((current) => ({
      ...current,
      areaItems: current.areaItems.map((item) => (
        resolveAreaItemId(item.areaItemId, metadata) === areaItemId
          ? { ...item, areaItemId, level }
          : item
      )),
    }));
  }

  function updatePotential(characterId: number, field: "performanceLevel" | "techniqueLevel" | "visualLevel", value: number) {
    setItems((current) => {
      const existing = current.characterPotentials.find((record) => record.characterId === characterId) ?? createPotential(characterId);
      const nextRecord = { ...existing, [field]: clampInteger(value, 0, 50) };
      const hasRecord = current.characterPotentials.some((record) => record.characterId === characterId);
      return {
        ...current,
        characterPotentials: (hasRecord
          ? current.characterPotentials.map((record) => (record.characterId === characterId ? nextRecord : record))
          : [...current.characterPotentials, nextRecord]
        ).sort((left, right) => compareBandoriCharacterIds(left.characterId, right.characterId)),
      };
    });
  }

  function updateMissionBonus(characterId: number, bonusType: "TRAINING" | "COLLECTION", field: "performance" | "technique" | "visual", value: number) {
    setItems((current) => {
      const key = `${characterId}:${bonusType}`;
      const existing = current.characterMissionBonuses.find((record) => `${record.characterId}:${normalizeMissionBonusType(record.bonusType)}` === key)
        ?? createMissionBonus(characterId, bonusType);
      const nextRecord = { ...existing, bonusType, [field]: clampInteger(value, 0, bonusType === "TRAINING" ? 20 : 40) };
      const hasRecord = current.characterMissionBonuses.some((record) => `${record.characterId}:${normalizeMissionBonusType(record.bonusType)}` === key);
      return {
        ...current,
        characterMissionBonuses: (hasRecord
          ? current.characterMissionBonuses.map((record) => (`${record.characterId}:${normalizeMissionBonusType(record.bonusType)}` === key ? nextRecord : record))
          : [...current.characterMissionBonuses, nextRecord]
        ).sort((left, right) => compareBandoriCharacterIds(left.characterId, right.characterId) || (normalizeMissionBonusType(left.bonusType) === "TRAINING" ? -1 : 1)),
      };
    });
  }

  async function saveItems() {
    if (!profilePayload || !isEditableProfile || !hasChanges || saving) {
      return;
    }

    setSaving(true);
    setError("");
    setSaveMessage("");
    try {
      const nextPayload = buildPayloadWithItems(profilePayload, items);
      if (isLocalGameProfileId(profileId)) {
        await updateLocalGameProfilePayload(profileId, nextPayload);
        setBaseItemsHash(null);
      } else {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error(messages.notSignedIn);
        }
        if (!baseItemsHash) {
          throw new Error(messages.missingVersion);
        }
        const response = await fetch(`/api/account/game-profiles/${profileId}/items`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            baseItemsHash,
            areaItems: items.areaItems,
            characterPotentials: items.characterPotentials,
            characterMissionBonuses: items.characterMissionBonuses,
          }),
        });
        const responsePayload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(getProfileApiErrorMessage(responsePayload, messages.saveFailed(response.status)));
        }
        const data = parseApiSuccessData<GameProfileSectionUpdateResult>(responsePayload);
        if (!data) {
          throw new Error(messages.invalidSaveResponse);
        }
        setBaseItemsHash(data.sectionVersions.itemsHash);
      }

      const savedItems = itemsFromProfilePayload(nextPayload);
      setProfilePayload(nextPayload);
      setItems(savedItems);
      setBaselineItems(savedItems);
      setEditing(false);
      setSaveMessage(t("messages.saved"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("errors.saveItemsFailed"));
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setItems(baselineItems);
    setEditing(false);
    setSaveMessage("");
  }

  return (
    <AccountShell title={t("title")} description={t("description")} backHref="/bandori/game-profiles" backLabel={t("back")}>
      {!authReady || loadingProfile ? (
        <AccountLoadingState message={commonT("states.loadingAccount")} />
      ) : !userId ? (
        <AccountSignInState nextPath={`/bandori/game-profiles/${profileId}/items`} />
      ) : profileError || error ? (
        <AccountErrorState message={profileError || error} />
      ) : loadingItems ? (
        <AccountLoadingState message={t("loadingItems")} />
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{t("heading")}</h2>
              <p className="mt-1 text-sm text-slate-500">{t("summary")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {saveMessage ? <span className="text-sm font-semibold text-emerald-600">{saveMessage}</span> : null}
              {editing ? (
                <>
                  <button type="button" onClick={cancelEditing} disabled={saving} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:text-slate-400">
                    {t("actions.cancel")}
                  </button>
                  <button type="button" onClick={saveItems} disabled={!hasChanges || saving} className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300">
                    {saving ? t("actions.saving") : t("actions.save")}
                  </button>
                </>
              ) : isEditableProfile ? (
                <>
                  <button type="button" onClick={() => setEditing(true)} className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500">
                    {t("actions.edit")}
                  </button>
                  <Link href="/bandori/game-profiles" className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
                    {t("manageProfiles")}
                  </Link>
                </>
              ) : (
                <Link href="/bandori/game-profiles" className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
                  {t("manageProfiles")}
                </Link>
              )}
            </div>
          </div>

          <div className="mt-5 flex border-b border-slate-200">
            <button type="button" onClick={() => setActiveTab("area")} className={`h-11 px-4 text-sm font-semibold transition ${activeTab === "area" ? "border-b-2 border-sky-600 text-sky-600" : "text-slate-500 hover:text-slate-900"}`}>
              {t("tabs.area")}
            </button>
            <button type="button" onClick={() => setActiveTab("characters")} className={`h-11 px-4 text-sm font-semibold transition ${activeTab === "characters" ? "border-b-2 border-sky-600 text-sky-600" : "text-slate-500 hover:text-slate-900"}`}>
              {t("tabs.characters")}
            </button>
          </div>

          {activeTab === "area" ? (
            <div className="mt-5 space-y-6">
              {AREA_ITEM_GROUPS.map((group) => {
                const groupItems = group.itemIds.map((areaItemId) => areaItemsById.get(areaItemId)).filter((item): item is ItemRecord => Boolean(item));
                if (groupItems.length === 0) {
                  return null;
                }

                return (
                  <section key={group.key}>
                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                      <h3 className="text-base font-semibold text-slate-900">{getAreaItemGroupLabel(group, locale)}</h3>
                    </div>
                    <div className="space-y-2">
                      {groupItems.map((item) => {
                        const areaItem = item.areaItemId ? metadata.areaItems[String(item.areaItemId)] : undefined;
                        const baseline = item.areaItemId ? baselineAreaItemsById.get(item.areaItemId) : undefined;
                        const maxLevel = getAreaItemMaxLevel(areaItem, item.level);
                        const areaItemName = pickAreaItemName(areaItem, item.areaItemId, locale, labels);
                        return (
                          <div key={item.itemKey} className="grid gap-2 rounded-lg border border-slate-100 px-2.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{areaItemName}</div>
                            </div>
                            <LevelSelector
                              label={t("labels.levelFor", { name: areaItemName })}
                              value={item.level}
                              maxLevel={maxLevel}
                              disabled={!editing || saving}
                              changed={baseline?.level !== item.level}
                              onChange={(level) => item.areaItemId !== null && updateAreaItemLevel(item.areaItemId, level)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {unknownAreaItems.length > 0 ? (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                    <h3 className="text-base font-semibold text-slate-900">{t("labels.unknownItems")}</h3>
                  </div>
                  <div className="space-y-2">
                    {unknownAreaItems.map((item) => {
                      const itemName = pickAreaItemName(
                        item.areaItemId ? metadata.areaItems[String(item.areaItemId)] : undefined,
                        item.areaItemId,
                        locale,
                        labels,
                      );
                      return (
                        <div key={item.itemKey} className="rounded-lg border border-slate-100 px-3 py-3 text-sm text-slate-700">
                          {t("labels.itemLevel", { name: itemName, level: item.level })}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 space-y-6">
              {characterRowsByBand.map((group) => (
                <section key={group.bandId}>
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                    <h3 className="text-base font-semibold text-slate-900">{group.label}</h3>
                  </div>
                  <div className="space-y-3">
                    {group.rows.map((row) => {
                      const baseline = baselineCharacterRows.get(row.characterId) ?? {
                        potential: createPotential(row.characterId),
                        training: createMissionBonus(row.characterId, "TRAINING"),
                        collection: createMissionBonus(row.characterId, "COLLECTION"),
                      };
                      const potentialValues = {
                        performance: row.potential.performanceLevel ?? 0,
                        technique: row.potential.techniqueLevel ?? 0,
                        visual: row.potential.visualLevel ?? 0,
                      };
                      const baselinePotentialValues = {
                        performance: baseline.potential.performanceLevel ?? 0,
                        technique: baseline.potential.techniqueLevel ?? 0,
                        visual: baseline.potential.visualLevel ?? 0,
                      };

                      return (
                        <div key={row.characterId} className="grid gap-4 rounded-lg border border-slate-100 px-3 py-4 lg:grid-cols-[minmax(9rem,0.8fr)_repeat(3,minmax(0,1fr))]">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{row.characterName}</div>
                          </div>
                          <BonusFields
                            title={t("labels.potential")}
                            values={potentialValues}
                            baseline={baselinePotentialValues}
                            disabled={!editing || saving}
                            max={50}
                            labels={labels.bonusFields}
                            onChange={(field, value) => updatePotential(row.characterId, `${field}Level` as "performanceLevel" | "techniqueLevel" | "visualLevel", value)}
                          />
                          <BonusFields
                            title={t("labels.training")}
                            values={row.training}
                            baseline={baseline.training}
                            disabled={!editing || saving}
                            max={20}
                            labels={labels.bonusFields}
                            onChange={(field, value) => updateMissionBonus(row.characterId, "TRAINING", field, value)}
                          />
                          <BonusFields
                            title={t("labels.collection")}
                            values={row.collection}
                            baseline={baseline.collection}
                            disabled={!editing || saving}
                            max={40}
                            labels={labels.bonusFields}
                            onChange={(field, value) => updateMissionBonus(row.characterId, "COLLECTION", field, value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              {metadata.characters.some((character) => character.characterId <= MAX_CHARACTER_ID && !CHARACTER_GROUP_BAND_IDS.has(character.bandId)) ? (
                <p className="text-sm text-slate-500">{t("labels.hiddenUngroupedCharacters")}</p>
              ) : null}
            </div>
          )}
        </section>
      )}
    </AccountShell>
  );
}
