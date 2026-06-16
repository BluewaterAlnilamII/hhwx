export type NfoEntityStats = {
  level: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  itemMagnetRange: number;
  bulletSpeed: number;
  bulletSize: number;
  bulletLifeTime: number;
  bulletCount: number;
  coolDownReduce: number;
  expGain: number;
  criticalRate: number;
  criticalDamage: number;
  colliderRadius: number;
};

export type NfoFireBullet = {
  bulletTypeId: number;
  eventBulletId: number;
  onDestroyFireEventBulletId: number;
  bulletCount: number;
  bulletAttack: number;
  bulletSpeed: number;
  noDamage: boolean;
  bulletDamageJudgeType: number;
  bulletHitTargetType: number;
  bulletSize: number;
  bulletSize2: number;
  bulletLifeTime: number;
  bulletHitTimes: number;
  bulletDamageJudgeDelayFrames: number;
  bulletDamageJudgeCooldownFrames: number;
  bulletColliderType: number;
  bulletForceType: number;
  bulletForce: number;
  hitBuffId: number;
  hitBuffLevel: number;
};

export type NfoBulletShooterTimelineEvent = {
  name: string;
  frame: number;
  isLoopEvent: boolean;
  loopFrameInterval: number;
  bulletFormationType: number;
  bulletFormationParam1: number;
  bulletFormationOffsetX: number;
  bulletFormationOffsetY: number;
  bulletFireDirectionType: number;
  bulletRotationType: number;
  bulletFireDirectionOffsetAngle: number;
  fireBullets: NfoFireBullet[];
  eventFireBullets: NfoFireBullet[];
};

export type NfoBulletShooterData = {
  id: number;
  name: string;
  lifeTimeFrames: number;
  spawnPos: number;
  spawnPosOffsetX: number;
  spawnPosOffsetY: number;
  behaviorType: number;
  followsOwnerDirection: boolean;
  events: NfoBulletShooterTimelineEvent[];
};

export type NfoAINextStateData = {
  stateId: number;
  probability: number;
};

export type NfoAIStateTimelineEvent = {
  frame: number;
  name: string;
  playAnimeName: string;
  noColliding: boolean;
  fireBulletNow: boolean;
  fireAllWeaponNow: boolean;
};

export type NfoAIStateData = {
  id: number;
  name: string;
  stateType: number;
  lastFrame: number;
  stateMoveSpeed?: number;
  stateMoveSpeedRandomMax?: number;
  stateMoveOffsetX?: number;
  stateMoveOffsetY?: number;
  syncDirectionFromTarget?: boolean;
  playAnimeName?: string;
  restartsAnimation?: boolean;
  triggerLevelEventId?: number;
  buffId?: number;
  buffLevel?: number;
  changesEntityCommonState?: boolean;
  entityCommonStateChangeTo?: number;
  isFireBullet: boolean;
  bulletFireCooldownFrames: number;
  fireBullets: NfoFireBullet[];
  bulletShooterId: number;
  nextStates: NfoAINextStateData[];
  timelineEvents: NfoAIStateTimelineEvent[];
};

export type NfoAIData = {
  id: number;
  name: string;
  firstStateId: number;
  states: NfoAIStateData[];
};

export type NfoWeaponLevel = {
  level: number;
  fireCooldownFrames: number;
  fireGroupCooldownFrames: number;
  groupCount: number;
  bulletShooterId?: number;
  selfBuffId?: number;
  selfBuffLevel?: number;
  minionCount?: number;
  spawnMinion?: NfoSpawnMinionData | null;
  fireBullets: NfoFireBullet[];
  attributeChanges?: NfoAttributeData[];
};

export type NfoWeaponData = {
  id: number;
  name: string;
  description?: string;
  enabled: boolean;
  iconSpriteName: string;
  maxLevel: number;
  fireSound: string;
  weaponType?: number;
  minionId?: number;
  levels: NfoWeaponLevel[];
};

export type NfoAttributeData = {
  attributeType: number;
  value: number;
};

export type NfoEquipLevel = {
  level: number;
  attributes: NfoAttributeData[];
};

export type NfoEquipData = {
  id: number;
  name: string;
  enabled: boolean;
  description: string;
  iconSpriteName: string;
  maxLevel: number;
  levels: NfoEquipLevel[];
};

export type NfoBuffLevel = {
  level: number;
  durationFrames: number;
  value: number;
  maxStackCount: number;
  fireBullets: NfoFireBullet[];
  attributes: NfoAttributeData[];
};

export type NfoBuffData = {
  id: number;
  name: string;
  effectPrefabName: string;
  effectEntitySubAnime: string;
  type: number;
  attrType: number;
  duplicateType: number;
  maxLevel: number;
  levels: NfoBuffLevel[];
};

export type NfoActiveSkillBuffEvent = {
  targetType: number;
  buffId: number;
  level: number;
};

export type NfoSpawnMinionData = {
  minionId: number;
  minionLevel: number;
  minionAiTypeId: number;
  weaponId: number;
  weaponLevel: number;
  spawnCount: number;
  spawnCenterType: number;
  spawnCenterOffsetX: number;
  spawnCenterOffsetY: number;
  spawnFormation: number;
  spawnRadiusMin: number;
  spawnRadiusMax: number;
};

export type NfoActiveSkillSpawnMinionEvent = NfoSpawnMinionData;

export type NfoActiveSkillTimelineEvent = {
  name: string;
  frame: number;
  bulletShooterId: number;
  fullScreenEffectName: string;
  buffs: NfoActiveSkillBuffEvent[];
  spawnMinion: NfoActiveSkillSpawnMinionEvent | null;
};

export type NfoActiveSkillLevel = {
  level: number;
  chargeCountMax: number;
  timelineFrames: number;
  events: NfoActiveSkillTimelineEvent[];
};

export type NfoActiveSkillData = {
  id: number;
  name: string;
  icon: string;
  description: string;
  levels: NfoActiveSkillLevel[];
};

export type NfoGlobalUpgradeData = {
  id: number;
  characterId: number;
  name: string;
  description: string;
  cost: number;
  parentId: number;
  iconSpriteName: string;
  posX: number;
  posY: number;
  attributes: NfoAttributeData[];
  initialWeaponLevelReplace: number;
  unlockWeaponId: number;
  unlockEquipId: number;
};

export type NfoPlayerLevelConfig = {
  playerExpStart: number;
  playerExpAddPerLevel: number;
  playerLevelOn10: number;
  playerDpsPerLevel: number;
  fastStartRate: number;
  fastStartSpeed: number;
};

export type NfoGameDefaultData = {
  gameVersion: string;
  defaultUnlockCharacterIds: number[];
  defaultUnlockWeaponIds: number[];
  defaultUnlockEquipIds: number[];
  defaultUnlockLevelIds: number[];
  levelConfig: NfoPlayerLevelConfig;
};

export type NfoCharacterData = {
  id: number;
  name: string;
  enabled: boolean;
  prefab: string;
  upgradedPrefab: string;
  thumbnail: string;
  upgradedThumbnail: string;
  initialWeaponId: number;
  colliderRadius: number;
  maxWeaponCount: number;
  maxEquipCount: number;
  canFly: boolean;
  canWalkThroughWall: boolean;
  activeSkillId: number;
  levels: NfoEntityStats[];
};

export type NfoEnemyData = {
  id: number;
  name: string;
  enabled: boolean;
  prefab: string;
  isBoss: boolean;
  canFly: boolean;
  canWalkThroughWall: boolean;
  immuneBuffIds: number[];
  levels: NfoEntityStats[];
};

export type NfoBulletData = {
  id: number;
  name: string;
  prefab: string;
  rotateType: number;
};

export type NfoMinionData = {
  id: number;
  name: string;
  description: string;
  prefab: string;
  aiTypeId: number;
  speed: number;
  lifetimeFrames: number;
};

export type NfoDropItemData = {
  itemId: number;
  dropRate: number;
};

export type NfoDropData = {
  id: number;
  name: string;
  items: NfoDropItemData[];
};

export type NfoItemData = {
  id: number;
  name: string;
  description: string;
  prefab: string;
  iconSpriteName: string;
  itemType: number;
  value: number;
  lifetimeFrames: number;
  getSound: string;
  canBeMagneted: boolean;
};

export type NfoEnemySpawnData = {
  enemyTypeId: number;
  enemyLevel: number;
  enemyAiTypeId: number;
  spawnType: number;
  spawnCenterType: number;
  spawnWaveCount: number;
  spawnWaveIntervalFrames: number;
  spawnRangeMin: number;
  spawnRangeMax: number;
  spawnCenterOffsetX: number;
  spawnCenterOffsetY: number;
  eventId: number;
  dropId: number;
  programControl: boolean;
};

export type NfoPlayerSpawnData = {
  characterId: number;
  spawnX: number;
  spawnY: number;
};

export type NfoEnemyAIStateChangeData = {
  enemyEventId: number;
  aiStateId: number;
};

export type NfoLevelEventData = {
  name: string;
  eventId: number;
  enabled: boolean;
  triggerType: number;
  triggerEnemyEventId: number;
  startFrame: number;
  totalFrames: number;
  eventType: number;
  playerSpawn: NfoPlayerSpawnData;
  enemySpawn: NfoEnemySpawnData;
  enemyAIStateChange?: NfoEnemyAIStateChangeData;
};

export type NfoLevelData = {
  id: number;
  name: string;
  enabled: boolean;
  singlePlayEnabled: boolean;
  description: string;
  mapPrefabName: string;
  sizeX: number;
  sizeY: number;
  bulletBoundaryX: number;
  bulletBoundaryY: number;
  bgm: string;
  commonDropId: number;
  playerExpRate: number;
  clearCoin: number;
  clearType: number;
  totalFrames: number;
  clearEnemyEventId: number;
  clearMinorEnemyEventIds: number[];
  clearUnlockLevelIds: number[];
  clearUnlockWeaponIds: number[];
  clearUnlockEquipIds: number[];
  clearUnlockCharacterIds: number[];
  events: NfoLevelEventData[];
};

export type NfoMapData = {
  id: number;
  name: string;
  prefabName: string;
  sizeX: number;
  sizeY: number;
  terrainPits: Array<{ x: number; y: number }>;
  terrainWalls: Array<{ x: number; y: number }>;
};

export type NfoTileBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type NfoTileVector = {
  x: number;
  y: number;
  z: number;
};

export type NfoMapPrefabLayerData = {
  name: string;
  gameObjectPathId: number;
  tilemapPathId: number;
  tileCount: number;
  bounds: NfoTileBounds;
  origin: NfoTileVector;
  size: NfoTileVector;
};

export type NfoMapPrefabData = {
  name: string;
  gameObjectPathId: number;
  layerCount: number;
  tileCount: number;
  bounds: NfoTileBounds | null;
  layers: NfoMapPrefabLayerData[];
};

export type NfoOfflineRuntimeData = {
  region: "cn";
  resourceVersion: string;
  createdAt: string;
  source: {
    manifestPath: string;
    runtimeDataPath: string;
  };
  counts: Record<string, number>;
  selected: {
    characterId: number;
    levelId: number;
  };
  characters: NfoCharacterData[];
  enemies: NfoEnemyData[];
  weapons: NfoWeaponData[];
  equips: NfoEquipData[];
  buffs: NfoBuffData[];
  ais: NfoAIData[];
  activeSkills: NfoActiveSkillData[];
  bulletShooters: NfoBulletShooterData[];
  globalUpgrades: NfoGlobalUpgradeData[];
  bullets: NfoBulletData[];
  minions: NfoMinionData[];
  drops: NfoDropData[];
  items: NfoItemData[];
  levels: NfoLevelData[];
  maps: NfoMapData[];
  mapPrefabs: NfoMapPrefabData[];
  gameDefault: NfoGameDefaultData;
};

export function pickLevelStats<T extends { level: number }>(
  levels: T[],
  requestedLevel: number,
): T | null {
  if (levels.length === 0) {
    return null;
  }

  let picked = levels[0];
  for (const level of levels) {
    if (level.level <= requestedLevel && level.level >= picked.level) {
      picked = level;
    }
  }
  return picked;
}

export function getRuntimeCharacter(
  runtimeData: NfoOfflineRuntimeData,
  characterId = runtimeData.selected.characterId,
): NfoCharacterData | null {
  return runtimeData.characters.find((character) => character.id === characterId) ?? null;
}

export function getRuntimeLevel(
  runtimeData: NfoOfflineRuntimeData,
  levelId = runtimeData.selected.levelId,
): NfoLevelData | null {
  return runtimeData.levels.find((level) => level.id === levelId) ?? null;
}

export function getRuntimeWeapon(
  runtimeData: NfoOfflineRuntimeData,
  weaponId: number,
): NfoWeaponData | null {
  return runtimeData.weapons.find((weapon) => weapon.id === weaponId) ?? null;
}

export function getRuntimeEquip(
  runtimeData: NfoOfflineRuntimeData,
  equipId: number,
): NfoEquipData | null {
  return runtimeData.equips.find((equip) => equip.id === equipId) ?? null;
}

export function getRuntimeBuff(
  runtimeData: NfoOfflineRuntimeData,
  buffId: number,
): NfoBuffData | null {
  return runtimeData.buffs.find((buff) => buff.id === buffId) ?? null;
}

export function getRuntimeActiveSkill(
  runtimeData: NfoOfflineRuntimeData,
  activeSkillId: number,
): NfoActiveSkillData | null {
  return runtimeData.activeSkills.find((activeSkill) => activeSkill.id === activeSkillId) ?? null;
}

export function getRuntimeAI(
  runtimeData: NfoOfflineRuntimeData,
  aiTypeId: number,
): NfoAIData | null {
  return runtimeData.ais.find((ai) => ai.id === aiTypeId) ?? null;
}

export function getRuntimeBulletShooter(
  runtimeData: NfoOfflineRuntimeData,
  bulletShooterId: number,
): NfoBulletShooterData | null {
  return runtimeData.bulletShooters.find((shooter) => shooter.id === bulletShooterId) ?? null;
}

export function getRuntimeBullet(
  runtimeData: NfoOfflineRuntimeData,
  bulletId: number,
): NfoBulletData | null {
  return runtimeData.bullets.find((bullet) => bullet.id === bulletId) ?? null;
}

export function getRuntimeMinion(
  runtimeData: NfoOfflineRuntimeData,
  minionId: number,
): NfoMinionData | null {
  return runtimeData.minions.find((minion) => minion.id === minionId) ?? null;
}

export function getRuntimeGlobalUpgrade(
  runtimeData: NfoOfflineRuntimeData,
  upgradeId: number,
): NfoGlobalUpgradeData | null {
  return runtimeData.globalUpgrades.find((upgrade) => upgrade.id === upgradeId) ?? null;
}

export function getRuntimeGlobalUpgradesForCharacter(
  runtimeData: NfoOfflineRuntimeData,
  characterId: number,
): NfoGlobalUpgradeData[] {
  return runtimeData.globalUpgrades.filter((upgrade) => upgrade.characterId === characterId);
}

export function getRuntimeEnemy(
  runtimeData: NfoOfflineRuntimeData,
  enemyId: number,
): NfoEnemyData | null {
  return runtimeData.enemies.find((enemy) => enemy.id === enemyId) ?? null;
}

export function getRuntimeDrop(
  runtimeData: NfoOfflineRuntimeData,
  dropId: number,
): NfoDropData | null {
  return runtimeData.drops.find((drop) => drop.id === dropId) ?? null;
}

export function getRuntimeItem(
  runtimeData: NfoOfflineRuntimeData,
  itemId: number,
): NfoItemData | null {
  return runtimeData.items.find((item) => item.id === itemId) ?? null;
}

export function getRuntimeMapPrefab(
  runtimeData: NfoOfflineRuntimeData,
  prefabName: string,
): NfoMapPrefabData | null {
  return runtimeData.mapPrefabs.find((prefab) => prefab.name === prefabName) ?? null;
}

export function getRuntimeMap(
  runtimeData: NfoOfflineRuntimeData,
  prefabName: string,
): NfoMapData | null {
  return runtimeData.maps.find((map) => map.prefabName === prefabName) ?? null;
}
