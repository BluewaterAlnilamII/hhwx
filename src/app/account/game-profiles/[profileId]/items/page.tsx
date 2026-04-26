"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import {
  decodeCompressedGameProfilePayload,
  getGameProfileAreaItems,
  getGameProfileCharacterMissionBonuses,
  getGameProfileCharacterPotentials,
  type CompressedGameProfilePayload,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";
import { isLocalGameProfileId, readLocalGameProfilePayload } from "@/lib/user-game-profile-local-store";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "@/app/account/AccountShell";
import { getAccessToken, useAccountProfile } from "@/app/account/useAccountProfile";

type ItemRecord = {
  itemKey: string;
  areaItemId: number | null;
  itemCount: number;
  level: number;
};

type PotentialRecord = {
  characterId: number;
  level: number;
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
  source?: string;
};

type ItemsPayload = {
  areaItems: ItemRecord[];
  characterPotentials: PotentialRecord[];
  characterMissionBonuses: MissionBonusRecord[];
};

type MetadataPayload = {
  characters: CharacterRecord[];
  areaItems: Record<string, AreaItemMetadata>;
  gameAreaItemResourceAliases: Record<string, number>;
};

function itemsFromProfilePayload(payload: UserGameProfilePayload): ItemsPayload {
  return {
    areaItems: getGameProfileAreaItems(payload),
    characterPotentials: getGameProfileCharacterPotentials(payload),
    characterMissionBonuses: getGameProfileCharacterMissionBonuses(payload),
  };
}

const clientGameAreaItemResourceAliases: Record<string, number> = {
  "295": 59,
  "340": 68,
  "477": 72,
  "478": 72,
  "479": 72,
  "480": 72,
  "481": 72,
  "697": 56,
  "698": 57,
  "699": 58,
  "700": 60,
};

for (let resourceId = 1; resourceId <= 35; resourceId += 1) {
  clientGameAreaItemResourceAliases[String(348 + resourceId * 5)] = resourceId;
}

for (let resourceId = 56; resourceId <= 60; resourceId += 1) {
  clientGameAreaItemResourceAliases[String(291 + (resourceId - 56) * 5)] = resourceId;
}

for (let resourceId = 66; resourceId <= 70; resourceId += 1) {
  clientGameAreaItemResourceAliases[String(331 + (resourceId - 66) * 5)] = resourceId;
}

for (let resourceId = 73; resourceId <= 103; resourceId += 1) {
  clientGameAreaItemResourceAliases[String(138 + resourceId * 5)] = resourceId;
}

for (let resourceId = 73; resourceId <= 77; resourceId += 1) {
  clientGameAreaItemResourceAliases[String(656 + (resourceId - 73) * 3)] = resourceId;
}

for (let resourceId = 83; resourceId <= 87; resourceId += 1) {
  clientGameAreaItemResourceAliases[String(750 + (resourceId - 83))] = resourceId;
}

for (let resourceId = 90; resourceId <= 94; resourceId += 1) {
  clientGameAreaItemResourceAliases[String(755 + (resourceId - 90))] = resourceId;
}

for (let resourceId = 97; resourceId <= 101; resourceId += 1) {
  clientGameAreaItemResourceAliases[String(760 + (resourceId - 97))] = resourceId;
}

Object.assign(clientGameAreaItemResourceAliases, {
  "765": 66,
  "766": 67,
  "767": 69,
  "768": 70,
  "769": 80,
  "770": 81,
  "771": 82,
  "772": 26,
  "773": 27,
  "774": 28,
  "775": 29,
  "776": 30,
  "777": 88,
  "778": 95,
  "779": 78,
  "780": 102,
  "781": 31,
  "782": 32,
  "783": 33,
  "784": 34,
  "785": 35,
  "786": 89,
  "787": 96,
  "788": 79,
  "789": 103,
});

async function requestItems(profileId: string): Promise<ItemsPayload> {
  if (isLocalGameProfileId(profileId)) {
    return itemsFromProfilePayload(await readLocalGameProfilePayload(profileId));
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("请先登录");
  }

  const response = await fetch(`/api/account/game-profiles/${profileId}/payload`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) || `请求失败（HTTP ${response.status}）`);
  }

  const compressed = parseApiSuccessData<CompressedGameProfilePayload>(payload);
  if (!compressed) {
    return {
      areaItems: [],
      characterPotentials: [],
      characterMissionBonuses: [],
    };
  }

  return itemsFromProfilePayload(await decodeCompressedGameProfilePayload(compressed));
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
    gameAreaItemResourceAliases?: Record<string, number>;
  }>(areaItemsPayload);

  return {
    characters: Array.isArray(characterData?.characters) ? characterData.characters : [],
    areaItems: areaItemData?.areaItems ?? {},
    gameAreaItemResourceAliases: areaItemData?.gameAreaItemResourceAliases ?? {},
  };
}

function pickCharacterName(character: CharacterRecord | undefined, characterId: number): string {
  return character?.nicknameCn
    ?? character?.nicknameTw
    ?? character?.nicknameJp
    ?? character?.nicknameEn
    ?? character?.characterNameCn
    ?? character?.characterNameTw
    ?? character?.characterNameJp
    ?? character?.characterNameEn
    ?? `角色 ${characterId}`;
}

function pickAreaItemName(areaItem: AreaItemMetadata | undefined, areaItemId: number | null): string {
  const name = areaItem?.areaItemName?.[3]
    ?? areaItem?.areaItemName?.[2]
    ?? areaItem?.areaItemName?.[1]
    ?? areaItem?.areaItemName?.[0];

  if (name?.trim()) {
    return `${name.trim()}${areaItemId ? ` #${areaItemId}` : ""}`;
  }

  return areaItemId ? `区域道具 ${areaItemId}` : "区域道具";
}

function resolveAreaItemId(areaItemId: number | null, metadata: MetadataPayload): number | null {
  if (!areaItemId) {
    return null;
  }

  const directAreaItem = metadata.areaItems[String(areaItemId)];
  if (directAreaItem) {
    return areaItemId;
  }

  return metadata.gameAreaItemResourceAliases[String(areaItemId)]
    ?? clientGameAreaItemResourceAliases[String(areaItemId)]
    ?? areaItemId;
}

function translateBonusType(value: string): string {
  if (value === "COLLECTION") {
    return "收集";
  }
  if (value === "TRAINING") {
    return "培养";
  }
  if (value === "bestdori_import") {
    return "Bestdori 导入";
  }
  return value;
}

function bonusSortOrder(value: string): number {
  if (value === "COLLECTION") {
    return 0;
  }
  if (value === "TRAINING") {
    return 1;
  }
  return 2;
}

export default function GameProfileItemsPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = use(params);
  const { userId, authReady, loadingProfile, profileError } = useAccountProfile();
  const [items, setItems] = useState<ItemsPayload>({
    areaItems: [],
    characterPotentials: [],
    characterMissionBonuses: [],
  });
  const [metadata, setMetadata] = useState<MetadataPayload>({
    characters: [],
    areaItems: {},
    gameAreaItemResourceAliases: {},
  });
  const [loadingItems, setLoadingItems] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profileId || !userId) {
      return;
    }

    let canceled = false;
    async function loadItems() {
      try {
        const [nextItems, nextMetadata] = await Promise.all([
          requestItems(profileId),
          requestMetadata(),
        ]);
        if (!canceled) {
          setItems(nextItems);
          setMetadata(nextMetadata);
          setError("");
        }
      } catch (loadError) {
        if (!canceled) {
          setError(loadError instanceof Error ? loadError.message : "读取道具失败");
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
  }, [profileId, userId]);

  const characterNameById = useMemo(() => new Map(
    metadata.characters.map((character) => [
      character.characterId,
      pickCharacterName(character, character.characterId),
    ]),
  ), [metadata.characters]);

  const sortedMissionBonuses = useMemo(() => [...items.characterMissionBonuses].sort((left, right) => (
    left.characterId - right.characterId
      || bonusSortOrder(left.bonusType) - bonusSortOrder(right.bonusType)
      || left.bonusType.localeCompare(right.bonusType)
  )), [items.characterMissionBonuses]);

  return (
    <AccountShell title="Profile 道具" description="查看当前 Profile 的区域道具、潜能解放和角色任务加成。" backHref="/account" backLabel="返回账号中心">
      {!authReady || loadingProfile ? (
        <AccountLoadingState message="正在读取账号信息..." />
      ) : !userId ? (
        <AccountSignInState nextPath={`/account/game-profiles/${profileId}/items`} />
      ) : profileError || error ? (
        <AccountErrorState message={profileError || error} />
      ) : loadingItems ? (
        <AccountLoadingState message="正在读取道具..." />
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">道具</h2>
            <Link href="/account" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
              Profile 管理
            </Link>
          </div>
          <h3 className="mt-5 text-base font-semibold text-slate-900">区域道具</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {items.areaItems.map((item) => {
              const resolvedAreaItemId = resolveAreaItemId(item.areaItemId, metadata);
              const areaItem = resolvedAreaItemId ? metadata.areaItems[String(resolvedAreaItemId)] : undefined;
              return (
                <div key={item.itemKey} className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-semibold text-slate-900">{pickAreaItemName(areaItem, resolvedAreaItemId)}</div>
                  <div className="mt-2 text-sm text-slate-500">等级 {item.level}</div>
                </div>
              );
            })}
          </div>
          <h3 className="mt-6 text-base font-semibold text-slate-900">潜能解放</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {items.characterPotentials.map((item) => (
              <div key={item.characterId} className="rounded-2xl border border-slate-200 p-4">
                <div className="font-semibold text-slate-900">{characterNameById.get(item.characterId) ?? `角色 ${item.characterId}`}</div>
                <div className="mt-2 text-sm text-slate-500">
                  等级 {item.level}
                  {item.performanceLevel !== null && ` · 演出 ${item.performanceLevel} / 技巧 ${item.techniqueLevel} / 形象 ${item.visualLevel}`}
                </div>
              </div>
            ))}
          </div>
          <h3 className="mt-6 text-base font-semibold text-slate-900">角色任务加成</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {sortedMissionBonuses.map((item) => (
              <div key={`${item.characterId}:${item.bonusType}`} className="rounded-2xl border border-slate-200 p-4">
                <div className="font-semibold text-slate-900">{characterNameById.get(item.characterId) ?? `角色 ${item.characterId}`}</div>
                <div className="mt-2 text-sm text-slate-500">
                  {translateBonusType(item.bonusType)} · 演出 {item.performance} / 技巧 {item.technique} / 形象 {item.visual}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </AccountShell>
  );
}
