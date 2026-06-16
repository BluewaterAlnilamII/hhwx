import {
  getRuntimeCharacter,
  getRuntimeEquip,
  getRuntimeGlobalUpgrade,
  getRuntimeLevel,
  getRuntimeWeapon,
  type NfoGlobalUpgradeData,
  type NfoOfflineRuntimeData,
} from "@/lib/nfo-offline-runtime";
import type { NfoSimulationSelection, NfoSimulationState } from "@/lib/nfo-offline-sim";

const SAVE_SCHEMA_VERSION = 4;
const STORAGE_KEY = "hhwx:nfo-offline-save:cn:Android-2.1.1";

export type NfoOfflineSaveState = {
  schemaVersion: 4;
  updatedAt: string;
  upgradeCoin: number;
  totalRuns: number;
  totalDefeatedEnemies: number;
  clearedLevelIds: number[];
  unlockedCharacterIds: number[];
  unlockedLevelIds: number[];
  unlockedWeaponIds: number[];
  unlockedEquipIds: number[];
  paidGlobalUpgradeIds: number[];
  bestLevelTimesById: Record<string, number>;
  lastSelection: NfoSimulationSelection;
};

export type NfoGlobalUpgradePurchaseState = {
  isPaid: boolean;
  hasParent: boolean;
  canAfford: boolean;
  canBuy: boolean;
};

export type NfoUnlockableKind = "character" | "level" | "weapon" | "equip";

export function createInitialNfoOfflineSave(
  runtimeData: NfoOfflineRuntimeData,
): NfoOfflineSaveState {
  const characterIds = runtimeData.characters.map((character) => character.id);
  const levelIds = runtimeData.levels.map((level) => level.id);
  const weaponIds = runtimeData.weapons.map((weapon) => weapon.id);
  const equipIds = runtimeData.equips.map((equip) => equip.id);
  const unlockedWeaponIds = defaultOrAll(
    runtimeData.gameDefault.defaultUnlockWeaponIds,
    weaponIds,
  );
  const unlockedEquipIds = filterIds(
    runtimeData.gameDefault.defaultUnlockEquipIds,
    equipIds,
  );

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    upgradeCoin: 0,
    totalRuns: 0,
    totalDefeatedEnemies: 0,
    clearedLevelIds: [],
    unlockedCharacterIds: defaultOrAll(runtimeData.gameDefault.defaultUnlockCharacterIds, characterIds),
    unlockedLevelIds: defaultOrAll(runtimeData.gameDefault.defaultUnlockLevelIds, levelIds),
    unlockedWeaponIds,
    unlockedEquipIds,
    paidGlobalUpgradeIds: [],
    bestLevelTimesById: {},
    lastSelection: {
      characterId: runtimeData.selected.characterId,
      levelId: runtimeData.selected.levelId,
      weaponId: pickDefaultWeaponId(
        runtimeData,
        runtimeData.selected.characterId,
        unlockedWeaponIds,
      ),
      equipIds: pickDefaultEquipIds(
        runtimeData,
        runtimeData.selected.characterId,
        unlockedEquipIds,
      ),
    },
  };
}

export function loadNfoOfflineSave(
  runtimeData: NfoOfflineRuntimeData,
): NfoOfflineSaveState {
  if (typeof window === "undefined") {
    return createInitialNfoOfflineSave(runtimeData);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createInitialNfoOfflineSave(runtimeData);
  }

  try {
    return normalizeSave(JSON.parse(raw), runtimeData);
  } catch {
    return createInitialNfoOfflineSave(runtimeData);
  }
}

export function writeNfoOfflineSave(save: NfoOfflineSaveState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

export function resetNfoOfflineSave(runtimeData: NfoOfflineRuntimeData): NfoOfflineSaveState {
  const save = createInitialNfoOfflineSave(runtimeData);
  writeNfoOfflineSave(save);
  return save;
}

export function unlockAllNfoOfflineContent(
  runtimeData: NfoOfflineRuntimeData,
  save: NfoOfflineSaveState,
): NfoOfflineSaveState {
  const next = {
    ...save,
    updatedAt: new Date().toISOString(),
    unlockedCharacterIds: runtimeData.characters
      .map((character) => character.id)
      .sort((left, right) => left - right),
    unlockedLevelIds: runtimeData.levels
      .map((level) => level.id)
      .sort((left, right) => left - right),
    unlockedWeaponIds: runtimeData.weapons
      .map((weapon) => weapon.id)
      .sort((left, right) => left - right),
    unlockedEquipIds: runtimeData.equips
      .map((equip) => equip.id)
      .sort((left, right) => left - right),
  };
  const normalized = {
    ...next,
    lastSelection: normalizeUnlockedSelection(next.lastSelection, next, runtimeData),
  };
  writeNfoOfflineSave(normalized);
  return normalized;
}

export function updateNfoOfflineSaveSelection(
  runtimeData: NfoOfflineRuntimeData,
  save: NfoOfflineSaveState,
  selection: NfoSimulationSelection,
): NfoOfflineSaveState {
  const next = {
    ...save,
    updatedAt: new Date().toISOString(),
    lastSelection: normalizeUnlockedSelection(selection, save, runtimeData),
  };
  writeNfoOfflineSave(next);
  return next;
}

export function getNfoGlobalUpgradePurchaseState(
  save: NfoOfflineSaveState,
  upgrade: NfoGlobalUpgradeData,
): NfoGlobalUpgradePurchaseState {
  const paid = new Set(save.paidGlobalUpgradeIds);
  const isPaid = paid.has(upgrade.id);
  const hasParent = upgrade.parentId <= 0 || paid.has(upgrade.parentId);
  const canAfford = save.upgradeCoin >= upgrade.cost;

  return {
    isPaid,
    hasParent,
    canAfford,
    canBuy: !isPaid && hasParent && canAfford,
  };
}

export function getNfoOfflineLockReason(
  runtimeData: NfoOfflineRuntimeData,
  save: NfoOfflineSaveState,
  kind: NfoUnlockableKind,
  id: number,
): string | null {
  if (isNfoOfflineContentUnlocked(save, kind, id)) {
    return null;
  }

  const reasons: string[] = [];
  const clearSource = getClearUnlockSource(runtimeData, kind, id);
  if (clearSource) {
    reasons.push(`clear ${clearSource.name}`);
  }

  const upgradeSource = getGlobalUpgradeUnlockSource(runtimeData, kind, id);
  if (upgradeSource) {
    reasons.push(describeGlobalUpgradeUnlock(save, upgradeSource));
  }

  return reasons.length > 0
    ? reasons.join(" or ")
    : "use Unlock all for testing";
}

export function buyNfoGlobalUpgrade(
  runtimeData: NfoOfflineRuntimeData,
  save: NfoOfflineSaveState,
  upgradeId: number,
): NfoOfflineSaveState {
  const upgrade = getRuntimeGlobalUpgrade(runtimeData, upgradeId);
  if (!upgrade) {
    return save;
  }

  const purchaseState = getNfoGlobalUpgradePurchaseState(save, upgrade);
  if (!purchaseState.canBuy) {
    return save;
  }

  const next = expandUnlockedContent(runtimeData, {
    ...save,
    updatedAt: new Date().toISOString(),
    upgradeCoin: save.upgradeCoin - upgrade.cost,
    paidGlobalUpgradeIds: addSortedUnique(save.paidGlobalUpgradeIds, upgrade.id),
  });
  writeNfoOfflineSave(next);
  return next;
}

export function grantNfoUpgradeCoin(
  save: NfoOfflineSaveState,
  coin: number,
): NfoOfflineSaveState {
  const next = {
    ...save,
    updatedAt: new Date().toISOString(),
    upgradeCoin: save.upgradeCoin + Math.max(0, Math.floor(coin)),
  };
  writeNfoOfflineSave(next);
  return next;
}

export function applyNfoRunResultToSave(
  runtimeData: NfoOfflineRuntimeData,
  save: NfoOfflineSaveState,
  state: NfoSimulationState,
): NfoOfflineSaveState {
  const clearedLevelIds = new Set(save.clearedLevelIds);
  const unlockedCharacterIds = new Set(save.unlockedCharacterIds);
  const unlockedLevelIds = new Set(save.unlockedLevelIds);
  const unlockedWeaponIds = new Set(save.unlockedWeaponIds);
  const unlockedEquipIds = new Set(save.unlockedEquipIds);
  const bestLevelTimesById = { ...save.bestLevelTimesById };

  if (state.status === "cleared") {
    const level = runtimeData.levels.find((candidate) => candidate.id === state.selection.levelId);
    clearedLevelIds.add(state.selection.levelId);
    unlockedLevelIds.add(state.selection.levelId);
    if (level) {
      addExistingIds(
        unlockedCharacterIds,
        level.clearUnlockCharacterIds,
        runtimeData.characters.map((character) => character.id),
      );
      addExistingIds(
        unlockedLevelIds,
        level.clearUnlockLevelIds,
        runtimeData.levels.map((candidate) => candidate.id),
      );
      addExistingIds(
        unlockedWeaponIds,
        level.clearUnlockWeaponIds,
        runtimeData.weapons.map((weapon) => weapon.id),
      );
      addExistingIds(
        unlockedEquipIds,
        level.clearUnlockEquipIds,
        runtimeData.equips.map((equip) => equip.id),
      );
    }
    const key = String(state.selection.levelId);
    const previousBest = bestLevelTimesById[key];
    if (previousBest === undefined || state.elapsedSeconds < previousBest) {
      bestLevelTimesById[key] = state.elapsedSeconds;
    }
  }

  const next = {
    ...save,
    updatedAt: new Date().toISOString(),
    upgradeCoin: save.upgradeCoin + state.collectedCoin,
    totalRuns: save.totalRuns + 1,
    totalDefeatedEnemies: save.totalDefeatedEnemies + state.defeatedEnemies,
    clearedLevelIds: Array.from(clearedLevelIds).sort((left, right) => left - right),
    unlockedCharacterIds: Array.from(unlockedCharacterIds).sort((left, right) => left - right),
    unlockedLevelIds: Array.from(unlockedLevelIds).sort((left, right) => left - right),
    unlockedWeaponIds: Array.from(unlockedWeaponIds).sort((left, right) => left - right),
    unlockedEquipIds: Array.from(unlockedEquipIds).sort((left, right) => left - right),
    bestLevelTimesById,
    lastSelection: state.selection,
  };
  writeNfoOfflineSave(next);
  return next;
}

function normalizeSave(value: unknown, runtimeData: NfoOfflineRuntimeData): NfoOfflineSaveState {
  const fallback = createInitialNfoOfflineSave(runtimeData);
  if (typeof value !== "object" || value === null) {
    return fallback;
  }

  const record = value as Partial<NfoOfflineSaveState>;
  const selection = normalizeSelection(record.lastSelection, runtimeData);
  const unlockedLevelIds = mergeDefaultIds(
    record.unlockedLevelIds,
    fallback.unlockedLevelIds,
    runtimeData.levels.map((level) => level.id),
  );
  const unlockedWeaponIds = mergeDefaultIds(
    record.unlockedWeaponIds,
    fallback.unlockedWeaponIds,
    runtimeData.weapons.map((weapon) => weapon.id),
  );
  const unlockedEquipIds = mergeDefaultIds(
    record.unlockedEquipIds,
    fallback.unlockedEquipIds,
    runtimeData.equips.map((equip) => equip.id),
  );
  const paidGlobalUpgradeIds = filterIds(
    record.paidGlobalUpgradeIds,
    runtimeData.globalUpgrades.map((upgrade) => upgrade.id),
  );

  const expanded = expandUnlockedContent(runtimeData, {
    schemaVersion: SAVE_SCHEMA_VERSION,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : fallback.updatedAt,
    upgradeCoin: readFiniteNumber(record.upgradeCoin),
    totalRuns: readFiniteNumber(record.totalRuns),
    totalDefeatedEnemies: readFiniteNumber(record.totalDefeatedEnemies),
    clearedLevelIds: filterIds(record.clearedLevelIds, runtimeData.levels.map((level) => level.id)),
    unlockedCharacterIds: mergeDefaultIds(
      record.unlockedCharacterIds,
      fallback.unlockedCharacterIds,
      runtimeData.characters.map((character) => character.id),
    ),
    unlockedLevelIds,
    unlockedWeaponIds,
    unlockedEquipIds,
    paidGlobalUpgradeIds,
    bestLevelTimesById: isRecord(record.bestLevelTimesById)
      ? Object.fromEntries(
        Object.entries(record.bestLevelTimesById).filter(([, time]) => typeof time === "number"),
      )
      : {},
    lastSelection: selection,
  });

  return {
    ...expanded,
    lastSelection: normalizeUnlockedSelection(selection, expanded, runtimeData),
  };
}

function normalizeSelection(
  selection: unknown,
  runtimeData: NfoOfflineRuntimeData,
): NfoSimulationSelection {
  if (!isRecord(selection)) {
    const characterId = runtimeData.selected.characterId;
    return {
      characterId,
      levelId: runtimeData.selected.levelId,
      weaponId: pickDefaultWeaponId(
        runtimeData,
        characterId,
        runtimeData.gameDefault.defaultUnlockWeaponIds,
      ),
      equipIds: [],
    };
  }

  const characterId = readFiniteNumber(selection.characterId);
  const levelId = readFiniteNumber(selection.levelId);
  const weaponId = readFiniteNumber(selection.weaponId);
  const normalizedCharacterId = runtimeData.characters.some((character) => character.id === characterId)
    ? characterId
    : runtimeData.selected.characterId;
  return {
    characterId: normalizedCharacterId,
    levelId: runtimeData.levels.some((level) => level.id === levelId)
      ? levelId
      : runtimeData.selected.levelId,
    weaponId: runtimeData.weapons.some((weapon) => weapon.id === weaponId)
      ? weaponId
      : pickDefaultWeaponId(
        runtimeData,
        normalizedCharacterId,
        runtimeData.gameDefault.defaultUnlockWeaponIds,
      ),
    equipIds: normalizeEquipIdsForCharacter(
      runtimeData,
      normalizedCharacterId,
      readSelectionEquipIds(selection),
    ),
  };
}

function filterIds(value: unknown, allowedIds: number[]): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowed = new Set(allowedIds);
  return Array.from(new Set(
    value.filter((id): id is number => typeof id === "number" && allowed.has(id)),
  )).sort((left, right) => left - right);
}

function normalizeUnlockedSelection(
  selection: NfoSimulationSelection,
  save: Pick<
    NfoOfflineSaveState,
    "unlockedCharacterIds" | "unlockedLevelIds" | "unlockedWeaponIds" | "unlockedEquipIds"
  >,
  runtimeData: NfoOfflineRuntimeData,
): NfoSimulationSelection {
  const characterId = save.unlockedCharacterIds.includes(selection.characterId)
    && getRuntimeCharacter(runtimeData, selection.characterId)
    ? selection.characterId
    : pickDefaultCharacterId(runtimeData, save.unlockedCharacterIds);
  const levelId = save.unlockedLevelIds.includes(selection.levelId)
    ? selection.levelId
    : save.unlockedLevelIds[0] ?? runtimeData.selected.levelId;
  const weaponId = save.unlockedWeaponIds.includes(selection.weaponId)
    ? selection.weaponId
    : pickDefaultWeaponId(runtimeData, characterId, save.unlockedWeaponIds);
  const selectedEquipIds = normalizeEquipIdsForCharacter(
    runtimeData,
    characterId,
    selection.equipIds,
  ).filter((equipId) => save.unlockedEquipIds.includes(equipId));
  const equipIds = selectedEquipIds.length > 0 || getMaxEquipCount(runtimeData, characterId) <= 0
    ? selectedEquipIds
    : pickDefaultEquipIds(runtimeData, characterId, save.unlockedEquipIds);
  return {
    ...selection,
    characterId,
    levelId,
    weaponId,
    equipIds,
  };
}

function defaultOrAll(defaultIds: number[], allowedIds: number[]): number[] {
  const filtered = filterIds(defaultIds, allowedIds);
  return filtered.length > 0 ? filtered : allowedIds;
}

function isNfoOfflineContentUnlocked(
  save: NfoOfflineSaveState,
  kind: NfoUnlockableKind,
  id: number,
): boolean {
  if (kind === "character") {
    return save.unlockedCharacterIds.includes(id);
  }
  if (kind === "level") {
    return save.unlockedLevelIds.includes(id);
  }
  if (kind === "weapon") {
    return save.unlockedWeaponIds.includes(id);
  }
  return save.unlockedEquipIds.includes(id);
}

function getClearUnlockSource(
  runtimeData: NfoOfflineRuntimeData,
  kind: NfoUnlockableKind,
  id: number,
) {
  for (const level of runtimeData.levels) {
    if (
      (kind === "character" && level.clearUnlockCharacterIds.includes(id))
      || (kind === "level" && level.clearUnlockLevelIds.includes(id))
      || (kind === "weapon" && level.clearUnlockWeaponIds.includes(id))
      || (kind === "equip" && level.clearUnlockEquipIds.includes(id))
    ) {
      return getRuntimeLevel(runtimeData, level.id) ?? level;
    }
  }
  return null;
}

function getGlobalUpgradeUnlockSource(
  runtimeData: NfoOfflineRuntimeData,
  kind: NfoUnlockableKind,
  id: number,
): NfoGlobalUpgradeData | null {
  if (kind !== "weapon" && kind !== "equip") {
    return null;
  }

  return runtimeData.globalUpgrades.find((upgrade) => (
    (kind === "weapon" && upgrade.unlockWeaponId === id)
    || (kind === "equip" && upgrade.unlockEquipId === id)
  )) ?? null;
}

function describeGlobalUpgradeUnlock(
  save: NfoOfflineSaveState,
  upgrade: NfoGlobalUpgradeData,
): string {
  const purchaseState = getNfoGlobalUpgradePurchaseState(save, upgrade);
  if (!purchaseState.hasParent) {
    return `buy prerequisite for ${upgrade.name}`;
  }
  if (!purchaseState.canAfford) {
    return `${upgrade.name} costs ${upgrade.cost} coin`;
  }
  return `buy ${upgrade.name}`;
}

function mergeDefaultIds(
  value: unknown,
  defaultIds: number[],
  allowedIds: number[],
): number[] {
  return addSortedUniqueMany(filterIds(value, allowedIds), defaultIds);
}

function expandUnlockedContent(
  runtimeData: NfoOfflineRuntimeData,
  save: NfoOfflineSaveState,
): NfoOfflineSaveState {
  let unlockedWeaponIds = save.unlockedWeaponIds;
  let unlockedEquipIds = save.unlockedEquipIds;

  for (const upgradeId of save.paidGlobalUpgradeIds) {
    const upgrade = getRuntimeGlobalUpgrade(runtimeData, upgradeId);
    if (!upgrade) {
      continue;
    }
    if (upgrade.unlockWeaponId > 0) {
      unlockedWeaponIds = addSortedUnique(unlockedWeaponIds, upgrade.unlockWeaponId);
    }
    if (upgrade.unlockEquipId > 0) {
      unlockedEquipIds = addSortedUnique(unlockedEquipIds, upgrade.unlockEquipId);
    }
  }

  return {
    ...save,
    unlockedWeaponIds,
    unlockedEquipIds,
  };
}

function addSortedUnique(values: number[], nextValue: number): number[] {
  return addSortedUniqueMany(values, [nextValue]);
}

function addSortedUniqueMany(values: number[], nextValues: number[]): number[] {
  return Array.from(new Set([...values, ...nextValues])).sort((left, right) => left - right);
}

function addExistingIds(
  target: Set<number>,
  ids: number[],
  allowedIds: number[],
): void {
  const allowed = new Set(allowedIds);
  for (const id of ids) {
    if (allowed.has(id)) {
      target.add(id);
    }
  }
}

function pickDefaultCharacterId(
  runtimeData: NfoOfflineRuntimeData,
  unlockedCharacterIds: number[],
): number {
  const firstUnlockedCharacter = unlockedCharacterIds
    .map((characterId) => getRuntimeCharacter(runtimeData, characterId))
    .find((character) => character?.enabled);
  if (firstUnlockedCharacter) {
    return firstUnlockedCharacter.id;
  }

  return runtimeData.characters.find((character) => character.enabled)?.id
    ?? runtimeData.characters[0]?.id
    ?? runtimeData.selected.characterId;
}

function pickDefaultWeaponId(
  runtimeData: NfoOfflineRuntimeData,
  characterId: number,
  unlockedWeaponIds: number[],
): number {
  const character = getRuntimeCharacter(runtimeData, characterId);
  if (
    character
    && unlockedWeaponIds.includes(character.initialWeaponId)
    && getRuntimeWeapon(runtimeData, character.initialWeaponId)
  ) {
    return character.initialWeaponId;
  }

  const firstUnlockedWeapon = unlockedWeaponIds
    .map((weaponId) => getRuntimeWeapon(runtimeData, weaponId))
    .find((weapon) => weapon?.enabled);
  if (firstUnlockedWeapon) {
    return firstUnlockedWeapon.id;
  }

  return runtimeData.weapons.find((weapon) => weapon.enabled)?.id
    ?? runtimeData.weapons[0]?.id
    ?? 0;
}

function pickDefaultEquipIds(
  runtimeData: NfoOfflineRuntimeData,
  characterId: number,
  unlockedEquipIds: number[],
): number[] {
  return normalizeEquipIdsForCharacter(
    runtimeData,
    characterId,
    unlockedEquipIds,
  );
}

function normalizeEquipIdsForCharacter(
  runtimeData: NfoOfflineRuntimeData,
  characterId: number,
  equipIds: number[],
): number[] {
  const maxEquipCount = getMaxEquipCount(runtimeData, characterId);
  if (maxEquipCount <= 0) {
    return [];
  }

  const selectedEquipIds: number[] = [];
  for (const equipId of equipIds) {
    if (selectedEquipIds.includes(equipId)) {
      continue;
    }

    const equip = getRuntimeEquip(runtimeData, equipId);
    if (!equip?.enabled) {
      continue;
    }

    selectedEquipIds.push(equip.id);
    if (selectedEquipIds.length >= maxEquipCount) {
      break;
    }
  }
  return selectedEquipIds;
}

function getMaxEquipCount(
  runtimeData: NfoOfflineRuntimeData,
  characterId: number,
): number {
  return Math.max(0, getRuntimeCharacter(runtimeData, characterId)?.maxEquipCount ?? 0);
}

function readSelectionEquipIds(selection: Record<string, unknown>): number[] {
  const value = selection.equipIds;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((equipId): equipId is number => (
    typeof equipId === "number" && Number.isFinite(equipId)
  ));
}

function readFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
