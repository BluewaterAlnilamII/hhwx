import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  NfoAIData,
  NfoActiveSkillBuffEvent,
  NfoActiveSkillData,
  NfoActiveSkillLevel,
  NfoActiveSkillSpawnMinionEvent,
  NfoActiveSkillTimelineEvent,
  NfoBuffData,
  NfoBulletShooterData,
  NfoBulletShooterTimelineEvent,
  NfoBulletData,
  NfoCharacterData,
  NfoDropData,
  NfoEnemyData,
  NfoEntityStats,
  NfoEquipData,
  NfoEquipLevel,
  NfoFireBullet,
  NfoGameDefaultData,
  NfoGlobalUpgradeData,
  NfoItemData,
  NfoLevelData,
  NfoLevelEventData,
  NfoMapData,
  NfoMapPrefabData,
  NfoMinionData,
  NfoOfflineRuntimeData,
  NfoTileBounds,
  NfoTileVector,
  NfoWeaponData,
  NfoWeaponLevel,
} from "@/lib/nfo-offline-runtime";

type RawRuntimeData = {
  region: string;
  resourceVersion: string;
  datasetCounts?: Record<string, number>;
  mapPrefabs?: unknown;
  datasets?: Record<string, unknown>;
};

type RawRecord = Record<string, unknown>;

const LOCAL_SNAPSHOT_DIR = "temp/nfo-offline/cn/Android-2.1.1";
const LOCAL_RUNTIME_DATA_PATH = `${LOCAL_SNAPSHOT_DIR}/runtime-data/master-data.json`;
const DEPLOYABLE_RUNTIME_DATA_PATH =
  "public/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json";
const DEPLOYABLE_RUNTIME_DATA_FILE_PATH = path.join(
  process.cwd(),
  "public",
  "res",
  "bandori",
  "nfo",
  "cn",
  "Android-2.1.1",
  "runtime-data",
  "master-data.json",
);
const LOCAL_RUNTIME_DATA_FILE_PATH = path.join(
  process.cwd(),
  "temp",
  "nfo-offline",
  "cn",
  "Android-2.1.1",
  "runtime-data",
  "master-data.json",
);

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null;
}

function readString(record: RawRecord, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function readNumber(record: RawRecord, key: string, fallback = 0): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBooleanNumber(record: RawRecord, key: string): boolean {
  return readNumber(record, key, 0) !== 0;
}

function readRecordArray(record: RawRecord, key: string): RawRecord[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readRawRecordArray(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readNumberArray(record: RawRecord, key: string): number[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
}

function mapStats(record: RawRecord): NfoEntityStats {
  return {
    level: readNumber(record, "level", 1),
    maxHp: readNumber(record, "MaxHP", 1),
    attack: readNumber(record, "Attack", 0),
    defense: readNumber(record, "Defense", 0),
    speed: readNumber(record, "Speed", 0),
    itemMagnetRange: readNumber(record, "ItemMagnetRange"),
    bulletSpeed: readNumber(record, "BulletSpeed"),
    bulletSize: readNumber(record, "BulletSize"),
    bulletLifeTime: readNumber(record, "BulletLifeTime"),
    bulletCount: readNumber(record, "BulletCount"),
    coolDownReduce: readNumber(record, "CoolDownReduce"),
    expGain: readNumber(record, "ExpGain"),
    criticalRate: readNumber(record, "CriticalRate"),
    criticalDamage: readNumber(record, "CriticalDamage", 150),
    colliderRadius: readNumber(record, "ColliderRadius", readNumber(record, "colliderRadius", 40)),
  };
}

function mapCharacter(record: RawRecord): NfoCharacterData {
  return {
    id: readNumber(record, "characterID"),
    name: readString(record, "characterName"),
    enabled: readBooleanNumber(record, "Enable"),
    prefab: readString(record, "characterPrefabRes"),
    upgradedPrefab: readString(record, "characterPrefabUpgradedRes"),
    thumbnail: readString(record, "characterThumbnailRes"),
    upgradedThumbnail: readString(record, "characterThumbnailUpgradedRes"),
    initialWeaponId: readNumber(record, "initialWeaponID"),
    colliderRadius: readNumber(record, "colliderRadius", 40),
    maxWeaponCount: readNumber(record, "maxWeaponCount"),
    maxEquipCount: readNumber(record, "maxEquipCount"),
    canFly: readBooleanNumber(record, "canFly"),
    canWalkThroughWall: readBooleanNumber(record, "canWalkThroughWall"),
    activeSkillId: readNumber(record, "ActiveSkillID"),
    levels: readRecordArray(record, "levelDatas").map(mapStats),
  };
}

function mapEnemy(record: RawRecord): NfoEnemyData {
  return {
    id: readNumber(record, "enemyID"),
    name: readString(record, "enemyName"),
    enabled: true,
    prefab: readString(record, "prefabRes"),
    isBoss: readBooleanNumber(record, "isBoss"),
    canFly: readBooleanNumber(record, "canFly"),
    canWalkThroughWall: readBooleanNumber(record, "canWalkThroughWall"),
    levels: readRecordArray(record, "levelDatas").map(mapStats),
  };
}

function mapFireBullet(record: RawRecord): NfoFireBullet {
  return {
    bulletTypeId: readNumber(record, "BulletTypeID"),
    eventBulletId: readNumber(record, "EventBulletID"),
    onDestroyFireEventBulletId: readNumber(record, "OnDestoryFireEventBulletID"),
    bulletCount: readNumber(record, "BulletCount", 1),
    bulletAttack: readNumber(record, "BulletAttack", 1),
    bulletSpeed: readNumber(record, "BulletSpeed", 500),
    noDamage: readBooleanNumber(record, "NoDamage"),
    bulletDamageJudgeType: readNumber(record, "BulletDamageJudgeType"),
    bulletHitTargetType: readNumber(record, "BulletHitTargetType"),
    bulletSize: readNumber(record, "BulletSize", 30),
    bulletSize2: readNumber(record, "BulletSize2"),
    bulletLifeTime: readNumber(record, "BulletLifeTime", 0),
    bulletHitTimes: readNumber(record, "BulletHitTimes", 1),
    bulletDamageJudgeDelayFrames: readNumber(record, "BulletDamageJudgeDelay"),
    bulletDamageJudgeCooldownFrames: readNumber(record, "BulletDamageJudgeCD"),
    bulletColliderType: readNumber(record, "BulletColliderType"),
    bulletForceType: readNumber(record, "BulletForceType"),
    bulletForce: readNumber(record, "BulletForce"),
    hitBuffId: readNumber(record, "HitBuffID"),
    hitBuffLevel: readNumber(record, "HitBuffLevel"),
  };
}

function mapBulletShooterTimelineEvent(record: RawRecord): NfoBulletShooterTimelineEvent {
  const fireBulletData = isRecord(record.fireBulletData) ? [mapFireBullet(record.fireBulletData)] : [];

  return {
    name: readString(record, "EventName"),
    frame: readNumber(record, "Frame"),
    isLoopEvent: readBooleanNumber(record, "IsLoopEvent"),
    loopFrameInterval: readNumber(record, "LoopFrameInterval"),
    bulletFormationType: readNumber(record, "bulletFormationType"),
    bulletFormationParam1: readNumber(record, "bulletFormationParam1"),
    bulletFormationOffsetX: readNumber(record, "bulletFormationOffsetX"),
    bulletFormationOffsetY: readNumber(record, "bulletFormationOffsetY"),
    bulletFireDirectionType: readNumber(record, "bulletFireDirectionType"),
    bulletRotationType: readNumber(record, "bulletRotationType"),
    bulletFireDirectionOffsetAngle: readNumber(record, "bulletFireDirectionOffsetAngle"),
    fireBullets: fireBulletData.filter((fireBullet) => fireBullet.bulletTypeId > 0),
    eventFireBullets: readRecordArray(record, "eventFireBulletDatas").map(mapFireBullet),
  };
}

function mapBulletShooter(record: RawRecord): NfoBulletShooterData {
  return {
    id: readNumber(record, "TypeID"),
    name: readString(record, "Name"),
    lifeTimeFrames: readNumber(record, "LifeTime"),
    spawnPos: readNumber(record, "SpawnPos"),
    spawnPosOffsetX: readNumber(record, "SpawnPosOffsetX"),
    spawnPosOffsetY: readNumber(record, "SpawnPosOffsetY"),
    behaviorType: readNumber(record, "BehaviorType"),
    followsOwnerDirection: readBooleanNumber(record, "IsFollowOwnerDirection"),
    events: readRecordArray(record, "TimeLineEvents").map(mapBulletShooterTimelineEvent),
  };
}

function mapAINextState(record: RawRecord): NfoAIData["states"][number]["nextStates"][number] {
  return {
    stateId: readNumber(record, "NextStateID"),
    probability: readNumber(record, "Probability"),
  };
}

function mapAIStateTimelineEvent(
  record: RawRecord,
): NfoAIData["states"][number]["timelineEvents"][number] {
  return {
    frame: readNumber(record, "Frame"),
    name: readString(record, "EventName"),
    playAnimeName: readString(record, "PlayAnimeName"),
    noColliding: readBooleanNumber(record, "NoColliding"),
    fireBulletNow: readBooleanNumber(record, "FireBulletNow"),
    fireAllWeaponNow: readBooleanNumber(record, "FireAllWeaponNow"),
  };
}

function mapAIState(record: RawRecord): NfoAIData["states"][number] {
  return {
    id: readNumber(record, "StateID"),
    name: readString(record, "StateName"),
    stateType: readNumber(record, "StateType"),
    lastFrame: readNumber(record, "LastFrame"),
    stateMoveSpeed: readNumber(record, "State_MoveSpeed"),
    stateMoveSpeedRandomMax: readNumber(record, "State_MoveSpeed_RandomMax"),
    stateMoveOffsetX: readNumber(record, "State_MoveOffsetX"),
    stateMoveOffsetY: readNumber(record, "State_MoveOffsetY"),
    syncDirectionFromTarget: readBooleanNumber(record, "syncDirectionFromTarget"),
    playAnimeName: readString(record, "playAnimeName"),
    restartsAnimation: readBooleanNumber(record, "isRestartPlayAnime"),
    triggerLevelEventId: readNumber(record, "TriggerLevelEventID"),
    buffId: readNumber(record, "buffID"),
    buffLevel: readNumber(record, "buffLevel"),
    changesEntityCommonState: readBooleanNumber(record, "IsChangeEntityCommonState"),
    entityCommonStateChangeTo: readNumber(record, "EntityCommonStateChangeTo"),
    isFireBullet: readBooleanNumber(record, "IsFireBullet"),
    bulletFireCooldownFrames: readNumber(record, "BulletFireCD"),
    fireBullets: readRecordArray(record, "FireBulletDatas").map(mapFireBullet),
    bulletShooterId: readNumber(record, "CreateBulletShooterTypeID"),
    nextStates: readRecordArray(record, "NextStateDatas").map(mapAINextState),
    timelineEvents: readRecordArray(record, "TimeLineEvents").map(mapAIStateTimelineEvent),
  };
}

function mapAI(record: RawRecord): NfoAIData {
  return {
    id: readNumber(record, "TypeID"),
    name: readString(record, "Name"),
    firstStateId: readNumber(record, "FirstStateID"),
    states: readRecordArray(record, "AIStateDatas").map(mapAIState),
  };
}

function mapWeaponLevel(record: RawRecord): NfoWeaponLevel {
  return {
    level: readNumber(record, "level", 1),
    fireCooldownFrames: readNumber(record, "FireCD", 30),
    fireGroupCooldownFrames: readNumber(record, "FireGroupCD"),
    groupCount: readNumber(record, "GroupCount"),
    bulletShooterId: readNumber(record, "BulletShooterID"),
    selfBuffId: readNumber(record, "SelfBuffID"),
    selfBuffLevel: readNumber(record, "SelfBuffLevel"),
    minionCount: readNumber(record, "MinionCount"),
    spawnMinion: mapSpawnMinionData(record.spawnMinionData),
    fireBullets: readRecordArray(record, "fireBullets").map(mapFireBullet),
    attributeChanges: readRecordArray(record, "attrChanges").map(mapWeaponAttributeChange),
  };
}

function mapWeapon(record: RawRecord): NfoWeaponData {
  return {
    id: readNumber(record, "TypeID"),
    name: readString(record, "Name"),
    description: readString(record, "Description"),
    enabled: readBooleanNumber(record, "Enable"),
    iconSpriteName: readString(record, "IconSpriteName"),
    maxLevel: readNumber(record, "maxLevel"),
    fireSound: readString(record, "weaponFireSE"),
    weaponType: readNumber(record, "weaponType"),
    minionId: readNumber(record, "minionID"),
    levels: readRecordArray(record, "levelDatas").map(mapWeaponLevel),
  };
}

function mapEquipLevel(record: RawRecord): NfoEquipLevel {
  return {
    level: readNumber(record, "level", 1),
    attributes: readRecordArray(record, "buffData").map(mapAttribute),
  };
}

function mapEquip(record: RawRecord): NfoEquipData {
  return {
    id: readNumber(record, "TypeID"),
    name: readString(record, "Name"),
    enabled: readBooleanNumber(record, "Enable"),
    description: readString(record, "Description"),
    iconSpriteName: readString(record, "IconSpriteName"),
    maxLevel: readNumber(record, "maxLevel"),
    levels: readRecordArray(record, "levelDatas").map(mapEquipLevel),
  };
}

function mapAttribute(record: RawRecord) {
  return {
    attributeType: readNumber(record, "attributeType", readNumber(record, "attrType")),
    value: readNumber(record, "value"),
  };
}

function mapWeaponAttributeChange(record: RawRecord) {
  return {
    attributeType: readNumber(record, "AttrType"),
    value: readNumber(record, "Value"),
  };
}

function mapBuffLevel(record: RawRecord): NfoBuffData["levels"][number] {
  return {
    level: readNumber(record, "Level", 1),
    durationFrames: readNumber(record, "Duration"),
    value: readNumber(record, "Value"),
    maxStackCount: readNumber(record, "MaxStackCount"),
    fireBullets: readRecordArray(record, "FireBulletDatas").map(mapFireBullet),
    attributes: readRecordArray(record, "AttributeDatas").map(mapAttribute),
  };
}

function mapBuff(record: RawRecord): NfoBuffData {
  return {
    id: readNumber(record, "TypeID"),
    name: readString(record, "Name"),
    effectPrefabName: readString(record, "effectPrefabName"),
    effectEntitySubAnime: readString(record, "effectEntitySubAnime"),
    type: readNumber(record, "Type"),
    attrType: readNumber(record, "AttrType"),
    duplicateType: readNumber(record, "DuplicateType"),
    maxLevel: readNumber(record, "MaxLevel"),
    levels: readRecordArray(record, "LevelDatas").map(mapBuffLevel),
  };
}

function mapActiveSkillBuffEvent(record: RawRecord): NfoActiveSkillBuffEvent {
  return {
    targetType: readNumber(record, "TargetType"),
    buffId: readNumber(record, "BuffID"),
    level: readNumber(record, "Level", 1),
  };
}

function mapSpawnMinionData(value: unknown): NfoActiveSkillSpawnMinionEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const minionId = readNumber(value, "MinionID");
  if (minionId <= 0) {
    return null;
  }

  const spawnPosSelector: RawRecord = isRecord(value.spawnPosSelector)
    ? value.spawnPosSelector
    : {};

  return {
    minionId,
    minionLevel: readNumber(value, "MinionLevel", 1),
    minionAiTypeId: readNumber(value, "MinionAITypeID"),
    weaponId: readNumber(value, "WeaponID"),
    weaponLevel: readNumber(value, "WeaponLevel", 1),
    spawnCount: readNumber(spawnPosSelector, "spawnNum", 1),
    spawnCenterType: readNumber(spawnPosSelector, "spawnCenterType"),
    spawnCenterOffsetX: readNumber(spawnPosSelector, "SpawnCenterOffsetX"),
    spawnCenterOffsetY: readNumber(spawnPosSelector, "SpawnCenterOffsetY"),
    spawnFormation: readNumber(spawnPosSelector, "spawnFormation"),
    spawnRadiusMin: readNumber(spawnPosSelector, "SpawnRadiusMin"),
    spawnRadiusMax: readNumber(spawnPosSelector, "SpawnRadiusMax"),
  };
}

function mapActiveSkillSpawnMinion(value: unknown): NfoActiveSkillSpawnMinionEvent | null {
  return mapSpawnMinionData(value);
}

function mapActiveSkillTimelineEvent(record: RawRecord): NfoActiveSkillTimelineEvent {
  return {
    name: readString(record, "EventName"),
    frame: readNumber(record, "Frame"),
    bulletShooterId: readNumber(record, "BulletShooterID"),
    fullScreenEffectName: readString(record, "FullScreenEffectName"),
    buffs: readRecordArray(record, "AddBuffDatas").map(mapActiveSkillBuffEvent),
    spawnMinion: mapActiveSkillSpawnMinion(record.SpawnMinionData),
  };
}

function mapActiveSkillLevel(record: RawRecord): NfoActiveSkillLevel {
  return {
    level: readNumber(record, "Level", 1),
    chargeCountMax: readNumber(record, "ChargeCountMax"),
    timelineFrames: readNumber(record, "TimeLineFrameCount"),
    events: readRecordArray(record, "TimeLineEvents").map(mapActiveSkillTimelineEvent),
  };
}

function mapActiveSkill(record: RawRecord): NfoActiveSkillData {
  return {
    id: readNumber(record, "TypeID"),
    name: readString(record, "Name"),
    icon: readString(record, "Icon"),
    description: readString(record, "Description"),
    levels: readRecordArray(record, "LevelDatas").map(mapActiveSkillLevel),
  };
}

function mapGlobalUpgrade(record: RawRecord): NfoGlobalUpgradeData {
  return {
    id: readNumber(record, "ID"),
    characterId: readNumber(record, "CharacterID"),
    name: readString(record, "Name"),
    description: readString(record, "Description"),
    cost: readNumber(record, "Cost"),
    parentId: readNumber(record, "parentID"),
    iconSpriteName: readString(record, "IconSpriteName"),
    posX: readNumber(record, "posX"),
    posY: readNumber(record, "posY"),
    attributes: readRecordArray(record, "Attributes").map(mapAttribute),
    initialWeaponLevelReplace: readNumber(record, "initialWeaponLevelReplace"),
    unlockWeaponId: readNumber(record, "unlockWeaponID"),
    unlockEquipId: readNumber(record, "unlockEquipID"),
  };
}

function mapGameDefault(record: RawRecord): NfoGameDefaultData {
  const levelConfig = isRecord(record.globalDifficutyControlData)
    ? record.globalDifficutyControlData
    : {};
  return {
    gameVersion: readString(record, "GameVersion"),
    defaultUnlockCharacterIds: readNumberArray(record, "defaultUnlockCharacterID"),
    defaultUnlockWeaponIds: readNumberArray(record, "defaultUnlockWeaponID"),
    defaultUnlockEquipIds: readNumberArray(record, "defaultUnlockEquipID"),
    defaultUnlockLevelIds: readNumberArray(record, "defaultUnlockLevelID"),
    levelConfig: {
      playerExpStart: readNumber(levelConfig, "playerExpStart", 50),
      playerExpAddPerLevel: readNumber(levelConfig, "playerExpAddPreLevel", 50),
      playerLevelOn10: readNumber(levelConfig, "playerLevelOn10", 70),
      playerDpsPerLevel: readNumber(levelConfig, "playerDpsPreLevel"),
      fastStartRate: readNumber(levelConfig, "fastStartRate"),
      fastStartSpeed: readNumber(levelConfig, "fastStartSpeed"),
    },
  };
}

function mapBullet(record: RawRecord): NfoBulletData {
  return {
    id: readNumber(record, "TypeID"),
    name: readString(record, "Name"),
    prefab: readString(record, "PrefabRes"),
    rotateType: readNumber(record, "bulletCompRotateType"),
  };
}

function mapMinion(record: RawRecord): NfoMinionData {
  return {
    id: readNumber(record, "ID"),
    name: readString(record, "Name"),
    description: readString(record, "Description"),
    prefab: readString(record, "Prefab"),
    aiTypeId: readNumber(record, "AITypeID"),
    speed: readNumber(record, "MinionSpeed"),
    lifetimeFrames: readNumber(record, "LifeTimeFrame"),
  };
}

function mapDrop(record: RawRecord): NfoDropData {
  return {
    id: readNumber(record, "dropID"),
    name: readString(record, "dropName"),
    items: readRecordArray(record, "DropItemList").map((item) => ({
      itemId: readNumber(item, "itemID"),
      dropRate: readNumber(item, "dropRate"),
    })),
  };
}

function mapItem(record: RawRecord): NfoItemData {
  return {
    id: readNumber(record, "itemID"),
    name: readString(record, "name"),
    description: readString(record, "description"),
    prefab: readString(record, "prefabRes"),
    iconSpriteName: readString(record, "iconSpriteName"),
    itemType: readNumber(record, "itemType"),
    value: readNumber(record, "value"),
    lifetimeFrames: readNumber(record, "lastFrameTime"),
    getSound: readString(record, "itemGetSE"),
    canBeMagneted: readBooleanNumber(record, "canBeMagneted"),
  };
}

function mapLevelEvent(record: RawRecord): NfoLevelEventData {
  const playerSpawn = isRecord(record.playerSpawnData) ? record.playerSpawnData : {};
  const enemySpawn = isRecord(record.enemySpawnData) ? record.enemySpawnData : {};
  const enemyAIStateChange = isRecord(record.enemyAIStateChangeData)
    ? record.enemyAIStateChangeData
    : {};

  return {
    name: readString(record, "eventName"),
    eventId: readNumber(record, "eventID"),
    enabled: readBooleanNumber(record, "Enable"),
    triggerType: readNumber(record, "eventTriggerType"),
    triggerEnemyEventId: readNumber(record, "eventTriggerEnemyEventID"),
    startFrame: readNumber(record, "eventStartFrame"),
    totalFrames: readNumber(record, "eventTotalFrame"),
    eventType: readNumber(record, "levelEventType"),
    playerSpawn: {
      characterId: readNumber(playerSpawn, "characterID"),
      spawnX: readNumber(playerSpawn, "spawnX"),
      spawnY: readNumber(playerSpawn, "spawnY"),
    },
    enemySpawn: {
      enemyTypeId: readNumber(enemySpawn, "EnemyTypeID"),
      enemyLevel: readNumber(enemySpawn, "EnemyLevel", 1),
      enemyAiTypeId: readNumber(enemySpawn, "EnemyAITypeID"),
      spawnType: readNumber(enemySpawn, "SpawnType"),
      spawnCenterType: readNumber(enemySpawn, "SpawnCenterType"),
      spawnWaveCount: readNumber(enemySpawn, "SpawnWaveCount", 1),
      spawnWaveIntervalFrames: readNumber(enemySpawn, "SpawnWaveIntervalTime", 30),
      spawnRangeMin: readNumber(enemySpawn, "SpawnRangeMin"),
      spawnRangeMax: readNumber(enemySpawn, "SpawnRangeMax"),
      spawnCenterOffsetX: readNumber(enemySpawn, "SpawnCenterOfferX"),
      spawnCenterOffsetY: readNumber(enemySpawn, "SpawnCenterOfferY"),
      eventId: readNumber(enemySpawn, "EventID"),
      dropId: readNumber(enemySpawn, "dropID"),
      programControl: readBooleanNumber(enemySpawn, "ProgramControl"),
    },
    enemyAIStateChange: {
      enemyEventId: readNumber(enemyAIStateChange, "EnemyEventID"),
      aiStateId: readNumber(enemyAIStateChange, "AIStateID"),
    },
  };
}

function mapLevel(record: RawRecord): NfoLevelData {
  return {
    id: readNumber(record, "levelID"),
    name: readString(record, "levelName"),
    enabled: readBooleanNumber(record, "Enable"),
    singlePlayEnabled: readBooleanNumber(record, "SinglePlayEnable"),
    description: readString(record, "levelDescription"),
    mapPrefabName: readString(record, "levelMapPrefabName"),
    sizeX: readNumber(record, "levelSizeX", 10),
    sizeY: readNumber(record, "levelSizeY", 10),
    bulletBoundaryX: readNumber(record, "levelBulletBondaryX"),
    bulletBoundaryY: readNumber(record, "levelBulletBondaryY"),
    bgm: readString(record, "levelBGM"),
    commonDropId: readNumber(record, "levelCommonDrop"),
    playerExpRate: readNumber(record, "playerExpRate", 100),
    clearCoin: readNumber(record, "levelClearCoin"),
    clearType: readNumber(record, "levelClearType"),
    totalFrames: readNumber(record, "levelTotalFrame"),
    clearEnemyEventId: readNumber(record, "levelClearEnemyEventID"),
    clearMinorEnemyEventIds: readNumberArray(record, "levelClearMinorEnemyEventIDs"),
    clearUnlockLevelIds: readNumberArray(record, "levelClearUnlockLevelID"),
    clearUnlockWeaponIds: readNumberArray(record, "levelClearUnlockWeaponID"),
    clearUnlockEquipIds: readNumberArray(record, "levelClearUnlockEquipID"),
    clearUnlockCharacterIds: readNumberArray(record, "levelClearUnlockCharacterID"),
    events: readRecordArray(record, "levelEventDatas").map(mapLevelEvent),
  };
}

function mapTerrainPoints(record: RawRecord, key: string): Array<{ x: number; y: number }> {
  return readRecordArray(record, key).map((point) => ({
    x: readNumber(point, "x"),
    y: readNumber(point, "y"),
  }));
}

function mapMap(record: RawRecord): NfoMapData {
  return {
    id: readNumber(record, "mapID"),
    name: readString(record, "mapName"),
    prefabName: readString(record, "mapPrefabName"),
    sizeX: readNumber(record, "mapSizeX"),
    sizeY: readNumber(record, "mapSizeY"),
    terrainPits: mapTerrainPoints(record, "terrainPits"),
    terrainWalls: mapTerrainPoints(record, "terrainWalls"),
  };
}

function mapTileBounds(value: unknown): NfoTileBounds | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    minX: readNumber(value, "minX"),
    minY: readNumber(value, "minY"),
    maxX: readNumber(value, "maxX"),
    maxY: readNumber(value, "maxY"),
  };
}

function mapTileVector(value: unknown): NfoTileVector {
  const record = isRecord(value) ? value : {};
  return {
    x: readNumber(record, "x"),
    y: readNumber(record, "y"),
    z: readNumber(record, "z"),
  };
}

function mapMapPrefabLayer(record: RawRecord): NfoMapPrefabData["layers"][number] | null {
  const bounds = mapTileBounds(record.bounds);
  if (!bounds) {
    return null;
  }

  return {
    name: readString(record, "name"),
    gameObjectPathId: readNumber(record, "gameObjectPathId"),
    tilemapPathId: readNumber(record, "tilemapPathId"),
    tileCount: readNumber(record, "tileCount"),
    bounds,
    origin: mapTileVector(record.origin),
    size: mapTileVector(record.size),
  };
}

function mapMapPrefab(record: RawRecord): NfoMapPrefabData {
  return {
    name: readString(record, "name"),
    gameObjectPathId: readNumber(record, "gameObjectPathId"),
    layerCount: readNumber(record, "layerCount"),
    tileCount: readNumber(record, "tileCount"),
    bounds: mapTileBounds(record.bounds),
    layers: readRecordArray(record, "layers").map(mapMapPrefabLayer).filter(
      (layer): layer is NfoMapPrefabData["layers"][number] => layer !== null,
    ),
  };
}

function getDataset(data: RawRuntimeData, key: string): RawRecord[] {
  const value = data.datasets?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getDatasetRecord(data: RawRuntimeData, key: string): RawRecord {
  const value = data.datasets?.[key];
  return isRecord(value) ? value : {};
}

async function readRuntimeDataFile(): Promise<{
  raw: RawRuntimeData;
  runtimeDataPath: string;
}> {
  try {
    return {
      raw: JSON.parse(
        await readFile(DEPLOYABLE_RUNTIME_DATA_FILE_PATH, "utf8"),
      ) as RawRuntimeData,
      runtimeDataPath: DEPLOYABLE_RUNTIME_DATA_PATH,
    };
  } catch (error) {
    if (!isNodeFileNotFoundError(error)) {
      throw error;
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `NFO deployable runtime data not found. Run npm run nfo:runtime-data. Checked: ${DEPLOYABLE_RUNTIME_DATA_PATH}`,
      );
    }
  }

  try {
    return {
      raw: JSON.parse(await readFile(LOCAL_RUNTIME_DATA_FILE_PATH, "utf8")) as RawRuntimeData,
      runtimeDataPath: LOCAL_RUNTIME_DATA_PATH,
    };
  } catch (error) {
    if (!isNodeFileNotFoundError(error)) {
      throw error;
    }

    throw new Error(
      `NFO runtime data not found. Run npm run nfo:runtime-data. Checked: ${DEPLOYABLE_RUNTIME_DATA_PATH}, ${LOCAL_RUNTIME_DATA_PATH}`,
    );
  }
}

function isNodeFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "ENOENT"
  );
}

export async function readLocalNfoRuntimeData(): Promise<NfoOfflineRuntimeData> {
  const { raw, runtimeDataPath } = await readRuntimeDataFile();

  const characters = getDataset(raw, "characterData").map(mapCharacter);
  const enabledCharacters = characters.filter((character) => character.enabled);
  const levels = getDataset(raw, "levelData").map(mapLevel);
  const enabledLevels = levels.filter((level) => level.enabled && level.singlePlayEnabled);
  const selectedCharacter = enabledCharacters[0] ?? characters[0];
  const selectedLevel = enabledLevels[0] ?? levels[0];

  return {
    region: "cn",
    resourceVersion: raw.resourceVersion,
    createdAt: new Date().toISOString(),
    source: {
      manifestPath: `${LOCAL_SNAPSHOT_DIR}/snapshot-manifest.json`,
      runtimeDataPath,
    },
    counts: raw.datasetCounts ?? {},
    selected: {
      characterId: selectedCharacter?.id ?? 0,
      levelId: selectedLevel?.id ?? 0,
    },
    characters: enabledCharacters,
    enemies: getDataset(raw, "enemyData").map(mapEnemy),
    weapons: getDataset(raw, "weaponData").map(mapWeapon).filter((weapon) => weapon.enabled),
    equips: getDataset(raw, "equipData").map(mapEquip).filter((equip) => equip.enabled),
    buffs: getDataset(raw, "buffData").map(mapBuff),
    ais: getDataset(raw, "aiData").map(mapAI),
    activeSkills: getDataset(raw, "activeSkillData").map(mapActiveSkill),
    bulletShooters: getDataset(raw, "bulletShooterData").map(mapBulletShooter),
    globalUpgrades: getDataset(raw, "globalUpgradeData").map(mapGlobalUpgrade),
    bullets: getDataset(raw, "bulletData").map(mapBullet),
    minions: getDataset(raw, "minionData").map(mapMinion),
    drops: getDataset(raw, "dropData").map(mapDrop),
    items: getDataset(raw, "itemData").map(mapItem),
    levels: enabledLevels,
    maps: getDataset(raw, "mapData").map(mapMap),
    mapPrefabs: readRawRecordArray(raw.mapPrefabs).map(mapMapPrefab),
    gameDefault: mapGameDefault(getDatasetRecord(raw, "gameDefaultData")),
  };
}
