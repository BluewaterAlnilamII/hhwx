import {
  getRuntimeAI,
  getRuntimeActiveSkill,
  getRuntimeBullet,
  getRuntimeBulletShooter,
  getRuntimeCharacter,
  getRuntimeBuff,
  getRuntimeDrop,
  getRuntimeEnemy,
  getRuntimeEquip,
  getRuntimeGlobalUpgrade,
  getRuntimeItem,
  getRuntimeLevel,
  getRuntimeMap,
  getRuntimeMapPrefab,
  getRuntimeMinion,
  getRuntimeWeapon,
  pickLevelStats,
  type NfoActiveSkillLevel,
  type NfoActiveSkillSpawnMinionEvent,
  type NfoAIStateData,
  type NfoAttributeData,
  type NfoBuffData,
  type NfoBulletShooterData,
  type NfoBulletShooterTimelineEvent,
  type NfoCharacterData,
  type NfoEnemyData,
  type NfoEntityStats,
  type NfoEquipData,
  type NfoFireBullet,
  type NfoGlobalUpgradeData,
  type NfoEnemySpawnData,
  type NfoLevelData,
  type NfoMapData,
  type NfoMapPrefabData,
  type NfoMinionData,
  type NfoOfflineRuntimeData,
  type NfoWeaponData,
  type NfoWeaponLevel,
} from "@/lib/nfo-offline-runtime";

const FRAME_RATE = 30;
const LEVEL_UNIT_SIZE = 96;
const DEFAULT_BULLET_LIFETIME_FRAMES = 90;
const DEFAULT_BULLET_DAMAGE_JUDGE_COOLDOWN_FRAMES = 15;
const DEFAULT_FIRE_COOLDOWN_FRAMES = 30;
const PLAYER_DAMAGE_COOLDOWN_SECONDS = 0.8;
const MAX_ACTIVE_ENEMIES = 180;
const PICKUP_COLLECT_RADIUS = 72;
const DEFAULT_PICKUP_LIFETIME_FRAMES = 600;
const TERRAIN_COLLISION_SAMPLE_RATIO = 0.7;
const DEFAULT_MINION_RADIUS = 28;
const MINION_FOLLOW_DISTANCE = 84;
const NFO_ATTRIBUTE_TYPE = {
  hp: 0,
  maxHp: 1,
  attack: 2,
  defense: 3,
  speed: 4,
  itemMagnetRange: 5,
  bulletSpeed: 6,
  bulletSize: 7,
  bulletLifeTime: 8,
  bulletCount: 9,
  coolDownReduce: 10,
  expGain: 11,
  criticalRate: 12,
  criticalDamage: 13,
  coinGain: 15,
} as const;
const NFO_BULLET_DAMAGE_JUDGE_TYPE = {
  oncePerEnemy: 0,
  multiTimes: 1,
  none: 2,
} as const;
const NFO_BULLET_HIT_TARGET_TYPE = {
  enemy: 0,
  friendly: 1,
} as const;
const NFO_BULLET_COLLIDER_TYPE = {
  circle: 0,
  rect: 1,
  ray: 2,
} as const;
const NFO_BULLET_FORCE_TYPE = {
  none: 0,
  outward: 1,
  inward: 2,
  left: 3,
  right: 4,
  up: 5,
  down: 6,
} as const;
const NFO_BULLET_COMP_ROTATE_TYPE = {
  none: 0,
  rotateBySpeed: 1,
  rotateByCoreTransform: 2,
  onlyChangeFaceDirection: 3,
} as const;
const NFO_BULLET_FIRE_DIRECTION_TYPE = {
  formationOffset: 0,
  nearestEnemy: 1,
  friendlyTarget: 2,
  ownerForward: 3,
  ownerForwardWithFormation: 4,
} as const;
const NFO_BULLET_FORMATION_TYPE = {
  default: 0,
  ownerForwardOffset: 3,
} as const;
const NFO_BULLET_SHOOTER_SPAWN_POS_TYPE = {
  owner: 0,
  friendlyTarget: 1,
  nearestEnemy: 3,
} as const;
const NFO_MINION_SPAWN_FORMATION_TYPE = {
  fallback: 0,
  ring: 1,
  ringFixedRadius: 2,
} as const;
const NFO_ENEMY_SPAWN_TYPE = {
  default: 0,
  randomAroundCenter: 1,
  ringAroundCenter: 2,
} as const;
const NFO_ENEMY_SPAWN_CENTER_TYPE = {
  player: 0,
  levelOrigin: 1,
} as const;
const NFO_LEVEL_EVENT_TYPE = {
  playerSpawn: 1,
  enemySpawn: 2,
  enemyAIStateChange: 4,
} as const;
const NFO_LEVEL_EVENT_TRIGGER_TYPE = {
  timed: 0,
  levelEvent: 2,
} as const;
const NFO_LEVEL_CLEAR_TYPE = {
  defaultTimed: 0,
  timed: 1,
  endlessOrEventDriven: 2,
} as const;
const NFO_BUFF_TYPE = {
  none: 0,
  attrChange: 1,
  stun: 2,
  freeze: 3,
  dot: 4,
  shield: 5,
  counter: 6,
  stealth: 7,
  invincible: 9,
  healPercent: 11,
  revive: 12,
  taunt: 13,
} as const;
const NFO_ACTIVE_SKILL_BUFF_TARGET_TYPE = {
  self: 0,
  playerSide: 1,
} as const;
const NFO_AI_STATE_TYPE = {
  idle: 0,
  moveToPlayer: 1,
  moveToRandomPosition: 2,
  golemRollAttack: 10,
  samuraiFlashAttack: 11,
  blackCatTeleport: 12,
  catBossAttack: 13,
  minionFollow: 20,
  minionMoveToEnemy: 21,
  minionOrbit: 22,
  cnOffsetMove: 31,
  cnOffsetLanding: 32,
  cnOffsetLaserMove: 33,
} as const;
const NFO_BUFF_DUPLICATE_TYPE = {
  none: 0,
  stack: 1,
  refresh: 2,
} as const;
const NFO_WEAPON_TYPE = {
  normal: 0,
  minion: 1,
} as const;
const NFO_ITEM_TYPE = {
  exp: 0,
  bomb: 1,
  magnet: 2,
  levelUp: 3,
  heal: 4,
  coin: 5,
} as const;
const NFO_TARGETLESS_DIRECT_WEAPON_IDS = new Set([2, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 17, 20, 21, 24]);
const NFO_CARDINAL_FORCE_DIRECTION_WEAPON_IDS = new Set([11]);
const NFO_OWNER_FORWARD_DIRECT_WEAPON_IDS = new Set([12, 13, 14]);
const NFO_OWNER_FORWARD_TARGETLESS_DIRECT_WEAPON_IDS = new Set([2, 5, 6, 9]);
const NFO_ALIGNED_DIRECT_FIRE_ENTRY_WEAPON_IDS = new Set([8]);
const NFO_DARK_ORB_WEAPON_ID = 5;
const NFO_GUARDIAN_SONG_WEAPON_ID = 6;
const NFO_GUARDIAN_SONG_ORBIT_RADIUS = 120;
const NFO_CAT_BOSS_ATTACK_BULLET_POS_Y = 520;
const NFO_CAT_BOSS_ATTACK_RANDOM_POS_RADIUS = 240;
const NFO_CAT_BOSS_ATTACK_RANDOM_ANGLE_DEGREES = 18;
const NFO_BULLET_SHOOTER_BEHAVIOR_TYPE = {
  fixed: 0,
  followOwnerPosition: 1,
} as const;

type NfoCombatTeam = "player" | "enemy";
type NfoBulletShooterOwnerType = "player" | "enemy" | "minion";
type BulletSpreadMode = "fan" | "radial";

type BulletAngleOverrideContext = {
  fireBullet: NfoFireBullet;
  origin: NfoVector;
};

type BulletMotionType = "linear" | "homingEnemy" | "playerOrbit";
type BulletMotionConfig = {
  type: BulletMotionType;
  orbitAngle?: number;
  orbitAngularSpeed?: number;
  orbitRadius?: number;
};
type BulletMotionOverrideContext = BulletAngleOverrideContext & {
  index: number;
  bulletCount: number;
  angle: number;
};

type FireBulletDataSetOptions = {
  allowTargetlessEnemyFire?: boolean;
  attackerAttack?: number;
  bulletAngleOverride?: (context: BulletAngleOverrideContext) => number | null;
  bulletCountModifier?: number;
  bulletLifeTimeModifier?: number;
  bulletMotionOverride?: (context: BulletMotionOverrideContext) => BulletMotionConfig | null;
  bulletRotateTypeOverride?: number;
  bulletSizeModifier?: number;
  bulletSpeedModifier?: number;
  bulletSpreadMode?: BulletSpreadMode;
  canDamagePlayer?: boolean;
  criticalDamage?: number;
  criticalRate?: number;
  fireBulletsByEventId?: Record<number, NfoFireBullet[]>;
  hitTargetTypeOverride?: number;
  spreadFireBulletEntries?: boolean;
  targetlessEnemyFireAngle?: (origin: NfoVector) => number;
};
type FireSourceModifierOptions = Pick<
  FireBulletDataSetOptions,
  | "attackerAttack"
  | "bulletCountModifier"
  | "bulletLifeTimeModifier"
  | "bulletSizeModifier"
  | "bulletSpeedModifier"
  | "criticalDamage"
  | "criticalRate"
>;

type AdvancedAIState = {
  state: NfoAIStateData;
  previousFrame: number;
  currentFrame: number;
};

type NfoAIStatefulEntity = {
  aiStateId?: number;
  aiStateElapsedFrames?: number;
  aiMoveTargetStateId?: number;
  aiMoveTargetX?: number;
  aiMoveTargetY?: number;
  aiOrbitStateId?: number;
  aiOrbitAngle?: number;
  aiOrbitRadius?: number;
  facingAngle?: number;
  animationName?: string;
  animationRevision?: number;
  noColliding?: boolean;
  activeBuffs?: NfoSimActiveBuff[];
  entityCommonState?: number;
};

type BuffApplicationOptions = Partial<{
  sourceX: number;
  sourceY: number;
}>;

export type NfoInputState = {
  moveX: number;
  moveY: number;
  useActiveSkill?: boolean;
};

export type NfoVector = {
  x: number;
  y: number;
};

export type NfoWorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type NfoSimTerrainTile = {
  kind: "pit";
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  size: number;
};

export type NfoSimulationTerrain = {
  pitTiles: NfoSimTerrainTile[];
  pitTileKeys: Record<string, true>;
};

export type NfoSimEnemy = NfoVector & {
  id: number;
  typeId: number;
  spawnEventId?: number;
  aiTypeId?: number;
  aiStateId?: number;
  aiStateElapsedFrames?: number;
  aiMoveTargetStateId?: number;
  aiMoveTargetX?: number;
  aiMoveTargetY?: number;
  aiOrbitStateId?: number;
  aiOrbitAngle?: number;
  aiOrbitRadius?: number;
  facingAngle?: number;
  animationName?: string;
  animationRevision?: number;
  aiFireCooldownSeconds?: number;
  noColliding?: boolean;
  entityCommonState?: number;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  radius: number;
  isBoss: boolean;
  canFly: boolean;
  canWalkThroughWall: boolean;
  dropId: number;
  activeBuffs: NfoSimActiveBuff[];
};

export type NfoSimActiveBuff = {
  id: number;
  name: string;
  type: number;
  duplicateType: number;
  level: number;
  value: number;
  stackCount: number;
  maxStackCount: number;
  remainingSeconds: number;
  dotTickSeconds: number;
  attributes: NfoAttributeData[];
  sourceX?: number;
  sourceY?: number;
};

export type NfoSimBullet = NfoVector & {
  id: number;
  bulletTypeId: number;
  dealsDamage: boolean;
  rotateType: number;
  motionType: BulletMotionType;
  angle: number;
  facingAngle: number;
  vx: number;
  vy: number;
  orbitAngle?: number;
  orbitAngularSpeed?: number;
  orbitRadius?: number;
  damage: number;
  attackerAttack: number;
  bulletCountModifier?: number;
  bulletLifeTimeModifier?: number;
  bulletSizeModifier?: number;
  bulletSpeedModifier?: number;
  criticalDamage?: number;
  criticalRate?: number;
  isCritical: boolean;
  canDamagePlayer: boolean;
  hitTargetType: number;
  radius: number;
  colliderType: number;
  colliderWidth: number;
  colliderLength: number;
  colliderForwardOffset: number;
  damageJudgeType: number;
  damageJudgeDelaySeconds: number;
  damageJudgeCooldownSeconds: number;
  forceType: number;
  force: number;
  hitBuffId: number;
  hitBuffLevel: number;
  onDestroyFireBullets: NfoFireBullet[];
  remainingSeconds: number;
  remainingHits: number;
  hasHitPlayer: boolean;
  playerHitCooldownSeconds: number;
  hitEnemyIds: number[];
  hitCooldownSecondsByEnemyId: Record<number, number>;
};

export type NfoSimMinion = NfoVector & {
  id: number;
  minionId: number;
  aiTypeId: number;
  aiStateId?: number;
  aiStateElapsedFrames?: number;
  aiMoveTargetStateId?: number;
  aiMoveTargetX?: number;
  aiMoveTargetY?: number;
  aiOrbitStateId?: number;
  aiOrbitAngle?: number;
  aiOrbitRadius?: number;
  facingAngle?: number;
  animationName?: string;
  animationRevision?: number;
  aiFireCooldownSeconds?: number;
  noColliding?: boolean;
  entityCommonState?: number;
  weaponId: number;
  weaponLevel: number;
  name: string;
  speed: number;
  radius: number;
  remainingSeconds: number;
  fireCooldownSeconds: number;
  pendingFireGroups: number;
  canFireOwnWeapon: boolean;
  activeBuffs: NfoSimActiveBuff[];
};

export type NfoSimActiveShooter = NfoVector & {
  id: number;
  shooterId: number;
  name: string;
  ageFrames: number;
  lifeTimeFrames: number;
  behaviorType: number;
  followsOwnerDirection: boolean;
  ownerFacingAngle: number;
  ownerType?: NfoBulletShooterOwnerType;
  ownerId?: number;
  ownerOffsetX: number;
  ownerOffsetY: number;
  sourceTeam: NfoCombatTeam;
  attack: number;
  bulletCountModifier?: number;
  bulletLifeTimeModifier?: number;
  bulletSizeModifier?: number;
  bulletSpeedModifier?: number;
  criticalDamage?: number;
  criticalRate?: number;
};

export type NfoSimPickup = NfoVector & {
  id: number;
  itemId: number;
  name: string;
  itemType: number;
  value: number;
  canBeMagneted: boolean;
  radius: number;
  remainingSeconds: number;
};

export type NfoSimActiveSkill = {
  id: number;
  level: number;
  chargeFrames: number;
  chargeMaxFrames: number;
  timelineFrame: number;
  timelineTotalFrames: number;
  isActive: boolean;
  triggeredEventIndexes: number[];
};

export type NfoSimulationSelection = {
  characterId: number;
  levelId: number;
  weaponId: number;
  equipIds: number[];
};

export type NfoSimulationCreationOptions = Partial<NfoSimulationSelection> & {
  paidGlobalUpgradeIds?: number[];
};

export type NfoSimulationState = {
  status: "playing" | "cleared" | "failed";
  selection: NfoSimulationSelection;
  worldBounds: NfoWorldBounds;
  terrain: NfoSimulationTerrain;
  elapsedSeconds: number;
  frame: number;
  score: number;
  defeatedEnemies: number;
  collectedExp: number;
  collectedCoin: number;
  collectedItems: Record<number, number>;
  player: NfoVector & {
    facingAngle: number;
    hp: number;
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
    baseStats: NfoEntityStats;
    radius: number;
    canFly: boolean;
    canWalkThroughWall: boolean;
    weaponLevel: number;
    expIntoLevel: number;
    expToNextLevel: number;
    equipCount: number;
    globalUpgradeCount: number;
    damageCooldownSeconds: number;
    fireCooldownSeconds: number;
    pendingFireGroups: number;
    activeBuffs: NfoSimActiveBuff[];
  };
  enemies: NfoSimEnemy[];
  minions: NfoSimMinion[];
  activeShooters: NfoSimActiveShooter[];
  bullets: NfoSimBullet[];
  pickups: NfoSimPickup[];
  activeSkill: NfoSimActiveSkill;
  spawnCursorByEvent: Record<number, number>;
  spawnedEnemyEventCountsById: Record<number, number>;
  triggeredLevelEventIds: Record<number, true>;
  levelTriggeredEnemySpawnAppliedByEventIndex: Record<number, true>;
  levelAIStateChangeAppliedByEventIndex: Record<number, true>;
  nextEntityId: number;
};

type SimulationContext = {
  character: NfoCharacterData;
  level: NfoLevelData;
  weapon: NfoWeaponData;
  equips: NfoEquipData[];
  map: NfoMapData | null;
  mapPrefab: NfoMapPrefabData | null;
};

export function createNfoSimulation(
  runtimeData: NfoOfflineRuntimeData,
  selection?: NfoSimulationCreationOptions,
): NfoSimulationState {
  const context = getSimulationContext(runtimeData, selection);
  const paidGlobalUpgrades = getPaidCharacterGlobalUpgrades(
    runtimeData,
    context.character.id,
    selection?.paidGlobalUpgradeIds ?? [],
  );
  const baseCharacterStats = normalizeEntityStats(
    applyCharacterBuildStats(
      pickLevelStats(context.character.levels, 1),
      paidGlobalUpgrades,
      context.equips,
    ),
    context.character.colliderRadius,
  );
  const initialWeaponLevel = clampWeaponLevel(
    getInitialWeaponLevel(paidGlobalUpgrades),
    context.weapon,
  );
  const characterStats = applyWeaponLevelAttributeChanges(
    baseCharacterStats,
    context.weapon,
    initialWeaponLevel,
  );
  const playerStats = characterStats ?? baseCharacterStats;
  const playerSpawn = context.level.events.find((event) => event.eventType === 1)
    ?.playerSpawn;
  const activeSkill = createInitialActiveSkillState(runtimeData, context.character.activeSkillId);

  return {
    status: "playing",
    selection: {
      characterId: context.character.id,
      levelId: context.level.id,
      weaponId: context.weapon.id,
      equipIds: context.equips.map((equip) => equip.id),
    },
    worldBounds: getLevelWorldBounds(context.level, context.mapPrefab),
    terrain: buildLevelTerrain(context.map),
    elapsedSeconds: 0,
    frame: 0,
    score: 0,
    defeatedEnemies: 0,
    collectedExp: 0,
    collectedCoin: 0,
    collectedItems: {},
    player: {
      x: (playerSpawn?.spawnX ?? 0) * LEVEL_UNIT_SIZE,
      y: (playerSpawn?.spawnY ?? 0) * LEVEL_UNIT_SIZE,
      facingAngle: 0,
      hp: playerStats.maxHp,
      maxHp: playerStats.maxHp,
      attack: playerStats.attack,
      defense: playerStats.defense,
      speed: playerStats.speed,
      itemMagnetRange: playerStats.itemMagnetRange,
      bulletSpeed: playerStats.bulletSpeed,
      bulletSize: playerStats.bulletSize,
      bulletLifeTime: playerStats.bulletLifeTime,
      bulletCount: playerStats.bulletCount,
      coolDownReduce: playerStats.coolDownReduce,
      expGain: playerStats.expGain,
      criticalRate: playerStats.criticalRate,
      criticalDamage: playerStats.criticalDamage,
      baseStats: { ...baseCharacterStats },
      radius: context.character.colliderRadius || playerStats.colliderRadius || 40,
      canFly: context.character.canFly,
      canWalkThroughWall: context.character.canWalkThroughWall,
      weaponLevel: initialWeaponLevel,
      expIntoLevel: 0,
      expToNextLevel: getPlayerExpToNextLevel(runtimeData, initialWeaponLevel, context.weapon),
      equipCount: context.equips.length,
      globalUpgradeCount: paidGlobalUpgrades.length,
      damageCooldownSeconds: 0,
      fireCooldownSeconds: 0,
      pendingFireGroups: 0,
      activeBuffs: [],
    },
    enemies: [],
    minions: [],
    activeShooters: [],
    bullets: [],
    pickups: [],
    activeSkill,
    spawnCursorByEvent: {},
    spawnedEnemyEventCountsById: {},
    triggeredLevelEventIds: {},
    levelTriggeredEnemySpawnAppliedByEventIndex: {},
    levelAIStateChangeAppliedByEventIndex: {},
    nextEntityId: 1,
  };
}

export function updateNfoSimulation(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  input: NfoInputState,
  deltaSeconds: number,
): NfoSimulationState {
  if (state.status !== "playing") {
    return state;
  }

  const context = getSimulationContext(runtimeData, state.selection);
  const next: NfoSimulationState = {
    ...state,
    elapsedSeconds: state.elapsedSeconds + deltaSeconds,
    frame: Math.floor((state.elapsedSeconds + deltaSeconds) * FRAME_RATE),
    player: {
      ...state.player,
      baseStats: { ...state.player.baseStats },
      damageCooldownSeconds: Math.max(
        0,
        state.player.damageCooldownSeconds - deltaSeconds,
      ),
      fireCooldownSeconds: Math.max(0, state.player.fireCooldownSeconds - deltaSeconds),
      activeBuffs: state.player.activeBuffs.map((buff) => ({
        ...buff,
        attributes: buff.attributes.map((attribute) => ({ ...attribute })),
      })),
    },
    enemies: state.enemies.map((enemy) => ({
      ...enemy,
      activeBuffs: enemy.activeBuffs.map((buff) => ({
        ...buff,
        attributes: buff.attributes.map((attribute) => ({ ...attribute })),
      })),
    })),
    minions: state.minions.map((minion) => ({
      ...minion,
      activeBuffs: (minion.activeBuffs ?? []).map((buff) => ({
        ...buff,
        attributes: buff.attributes.map((attribute) => ({ ...attribute })),
      })),
    })),
    activeShooters: state.activeShooters.map((shooter) => ({ ...shooter })),
    bullets: state.bullets.map((bullet) => ({
      ...bullet,
      onDestroyFireBullets: bullet.onDestroyFireBullets.map((fireBullet) => ({ ...fireBullet })),
      hitEnemyIds: [...bullet.hitEnemyIds],
      hitCooldownSecondsByEnemyId: { ...bullet.hitCooldownSecondsByEnemyId },
    })),
    pickups: state.pickups.map((pickup) => ({ ...pickup })),
    activeSkill: {
      ...state.activeSkill,
      triggeredEventIndexes: [...state.activeSkill.triggeredEventIndexes],
    },
    collectedItems: { ...state.collectedItems },
    spawnCursorByEvent: { ...state.spawnCursorByEvent },
    spawnedEnemyEventCountsById: { ...state.spawnedEnemyEventCountsById },
    triggeredLevelEventIds: { ...state.triggeredLevelEventIds },
    levelTriggeredEnemySpawnAppliedByEventIndex: {
      ...state.levelTriggeredEnemySpawnAppliedByEventIndex,
    },
    levelAIStateChangeAppliedByEventIndex: { ...state.levelAIStateChangeAppliedByEventIndex },
  };

  updatePlayerBuffs(next, deltaSeconds);
  updateActiveSkill(next, runtimeData, input, deltaSeconds);
  updateActiveShooters(next, runtimeData, deltaSeconds);
  movePlayer(next, input, deltaSeconds);
  spawnEnemies(next, runtimeData, context.level);
  applyLevelAIStateChangeEvents(next, runtimeData, context.level);
  updateEnemyBuffs(next, deltaSeconds);
  updateMinionBuffs(next, deltaSeconds);
  updateEnemies(next, runtimeData, deltaSeconds);
  updateMinions(next, runtimeData, deltaSeconds);
  updateWeaponFire(next, runtimeData, context, deltaSeconds);
  updateBullets(next, runtimeData, context.level, deltaSeconds);
  resolveCollisions(next, runtimeData, context.level, deltaSeconds);
  updatePickups(next, deltaSeconds);
  collectPickups(next, runtimeData, context.level, context.weapon);
  updateStatus(next, context.level);

  return next;
}

export function clearNfoSimulation(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
): NfoSimulationState {
  if (state.status !== "playing") {
    return state;
  }

  const level = getRuntimeLevel(runtimeData, state.selection.levelId);
  const next = { ...state };
  applyNfoClearSettlement(next, level?.clearCoin ?? 0);
  return next;
}

function getSimulationContext(
  runtimeData: NfoOfflineRuntimeData,
  selection?: Partial<NfoSimulationSelection>,
): SimulationContext {
  const character = getRuntimeCharacter(runtimeData, selection?.characterId);
  const level = getRuntimeLevel(runtimeData, selection?.levelId);

  if (!character || !level) {
    throw new Error("NFO runtime data is missing the selected character or level.");
  }

  const weapon = getRuntimeWeapon(
    runtimeData,
    selection?.weaponId ?? character.initialWeaponId,
  )
    ?? getRuntimeWeapon(runtimeData, character.initialWeaponId)
    ?? runtimeData.weapons.find((candidate) => candidate.enabled);

  if (!weapon) {
    throw new Error("NFO runtime data is missing an enabled weapon.");
  }

  return {
    character,
    level,
    weapon,
    equips: getSelectedEquips(runtimeData, character, selection?.equipIds ?? []),
    map: getRuntimeMap(runtimeData, level.mapPrefabName),
    mapPrefab: getRuntimeMapPrefab(runtimeData, level.mapPrefabName),
  };
}

function getSelectedEquips(
  runtimeData: NfoOfflineRuntimeData,
  character: NfoCharacterData,
  equipIds: number[],
): NfoEquipData[] {
  const maxEquipCount = Math.max(0, character.maxEquipCount);
  if (maxEquipCount <= 0) {
    return [];
  }

  const equips: NfoEquipData[] = [];
  for (const equipId of equipIds) {
    if (equips.some((equip) => equip.id === equipId)) {
      continue;
    }

    const equip = getRuntimeEquip(runtimeData, equipId);
    if (!equip?.enabled) {
      continue;
    }

    equips.push(equip);
    if (equips.length >= maxEquipCount) {
      break;
    }
  }

  return equips;
}

function movePlayer(
  state: NfoSimulationState,
  input: NfoInputState,
  deltaSeconds: number,
) {
  const rawLength = Math.hypot(input.moveX, input.moveY);
  const length = rawLength || 1;
  const dx = input.moveX / length;
  const dy = input.moveY / length;

  if (rawLength > 0) {
    state.player.facingAngle = Math.atan2(dy, dx);
  }

  moveEntity(
    state,
    state.player,
    dx * getPlayerEffectiveSpeed(state) * deltaSeconds,
    dy * getPlayerEffectiveSpeed(state) * deltaSeconds,
    state.player.radius,
    state.player.canFly,
  );
}

function getLevelWorldBounds(
  level: NfoLevelData,
  mapPrefab: NfoMapPrefabData | null,
): NfoWorldBounds {
  if (mapPrefab?.bounds) {
    return {
      minX: mapPrefab.bounds.minX * LEVEL_UNIT_SIZE,
      minY: mapPrefab.bounds.minY * LEVEL_UNIT_SIZE,
      maxX: (mapPrefab.bounds.maxX + 1) * LEVEL_UNIT_SIZE,
      maxY: (mapPrefab.bounds.maxY + 1) * LEVEL_UNIT_SIZE,
    };
  }

  const halfWidth = Math.max(level.sizeX, 8) * LEVEL_UNIT_SIZE * 0.5;
  const halfHeight = Math.max(level.sizeY, 8) * LEVEL_UNIT_SIZE * 0.5;
  return {
    minX: -halfWidth,
    minY: -halfHeight,
    maxX: halfWidth,
    maxY: halfHeight,
  };
}

function spawnEnemies(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  level: NfoLevelData,
) {
  if (state.enemies.length >= MAX_ACTIVE_ENEMIES) {
    return;
  }

  level.events.forEach((event, eventIndex) => {
    if (!event.enabled || event.eventType !== NFO_LEVEL_EVENT_TYPE.enemySpawn) {
      return;
    }

    const isTriggeredEnemySpawn = (
      event.triggerType === NFO_LEVEL_EVENT_TRIGGER_TYPE.levelEvent
    );
    if (isTriggeredEnemySpawn) {
      if (
        event.eventId <= 0
        || !state.triggeredLevelEventIds[event.eventId]
        || state.levelTriggeredEnemySpawnAppliedByEventIndex[eventIndex]
        || state.frame < event.startFrame
      ) {
        return;
      }
    } else {
      const windowEnd = event.totalFrames > 0
        ? event.startFrame + event.totalFrames
        : event.startFrame + 1;
      if (state.frame < event.startFrame || state.frame > windowEnd) {
        return;
      }
    }

    const nextFrame = state.spawnCursorByEvent[eventIndex] ?? event.startFrame;
    if (state.frame < nextFrame) {
      return;
    }

    const interval = Math.max(event.enemySpawn.spawnWaveIntervalFrames, 1);
    const waveCount = Math.max(event.enemySpawn.spawnWaveCount, 1);
    let spawnedEnemyCount = 0;
    for (let i = 0; i < waveCount && state.enemies.length < MAX_ACTIVE_ENEMIES; i += 1) {
      const enemy = getRuntimeEnemy(runtimeData, event.enemySpawn.enemyTypeId);
      if (enemy) {
        const dropId = event.enemySpawn.dropId || level.commonDropId;
        const spawnedEnemy = createEnemy(
          state,
          enemy,
          event.enemySpawn.enemyLevel,
          event.enemySpawn.enemyAiTypeId,
          dropId,
          event.enemySpawn,
          i,
          waveCount,
        );
        state.enemies.push(spawnedEnemy);
        recordSpawnedEnemyEvent(state, spawnedEnemy.spawnEventId ?? 0);
        spawnedEnemyCount += 1;
      }
    }
    if (spawnedEnemyCount > 0) {
      state.spawnCursorByEvent[eventIndex] = state.frame + interval;
      if (isTriggeredEnemySpawn) {
        state.levelTriggeredEnemySpawnAppliedByEventIndex[eventIndex] = true;
      }
    }
  });
}

function applyLevelAIStateChangeEvents(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  level: NfoLevelData,
) {
  level.events.forEach((event, eventIndex) => {
    if (
      !event.enabled
      || event.eventType !== NFO_LEVEL_EVENT_TYPE.enemyAIStateChange
      || state.levelAIStateChangeAppliedByEventIndex[eventIndex]
      || state.frame < event.startFrame
    ) {
      return;
    }

    const targetEnemyEventId = event.enemyAIStateChange?.enemyEventId ?? 0;
    const targetAIStateId = event.enemyAIStateChange?.aiStateId ?? 0;
    if (targetEnemyEventId <= 0 || targetAIStateId < 0) {
      return;
    }

    let changedEnemyCount = 0;
    for (const enemy of state.enemies) {
      if (
        enemy.hp <= 0
        || (enemy.spawnEventId ?? 0) !== targetEnemyEventId
        || !canEnemyEnterAIState(runtimeData, enemy, targetAIStateId)
      ) {
        continue;
      }

      applyEnemyAIStateChange(enemy, targetAIStateId);
      changedEnemyCount += 1;
    }

    if (changedEnemyCount > 0) {
      state.levelAIStateChangeAppliedByEventIndex[eventIndex] = true;
    }
  });
}

function canEnemyEnterAIState(
  runtimeData: NfoOfflineRuntimeData,
  enemy: NfoSimEnemy,
  aiStateId: number,
): boolean {
  if ((enemy.aiTypeId ?? 0) <= 0) {
    return false;
  }

  const ai = getRuntimeAI(runtimeData, enemy.aiTypeId ?? 0);
  return Boolean(ai && hasAIState(ai.states, aiStateId));
}

function applyEnemyAIStateChange(
  enemy: NfoSimEnemy,
  aiStateId: number,
) {
  enemy.aiStateId = aiStateId;
  enemy.aiStateElapsedFrames = 0;
  enemy.aiFireCooldownSeconds = 0;
  enemy.noColliding = false;
  delete enemy.aiMoveTargetStateId;
  delete enemy.aiMoveTargetX;
  delete enemy.aiMoveTargetY;
}

function recordSpawnedEnemyEvent(
  state: NfoSimulationState,
  spawnEventId: number,
) {
  if (spawnEventId <= 0) {
    return;
  }

  state.spawnedEnemyEventCountsById[spawnEventId] = (
    state.spawnedEnemyEventCountsById[spawnEventId] ?? 0
  ) + 1;
}

function createEnemy(
  state: NfoSimulationState,
  enemy: NfoEnemyData,
  enemyLevel: number,
  enemyAiTypeId: number,
  dropId: number,
  spawn: NfoEnemySpawnData,
  waveIndex: number,
  waveCount: number,
): NfoSimEnemy {
  const stats = pickLevelStats(enemy.levels, enemyLevel);
  const spawnCenter = getEnemySpawnCenter(state, spawn);
  const angle = getEnemySpawnAngle(spawn, waveIndex, waveCount);
  const hasExplicitZeroRange = spawn.spawnRangeMin <= 0 && spawn.spawnRangeMax <= 0;
  const minDistance = Math.max(spawn.spawnRangeMin, hasExplicitZeroRange ? 0 : 4) * LEVEL_UNIT_SIZE;
  const maxDistance = hasExplicitZeroRange
    ? 0
    : Math.max(spawn.spawnRangeMax, spawn.spawnRangeMin + 1, 8) * LEVEL_UNIT_SIZE;
  const distance = getEnemySpawnDistance(spawn, minDistance, maxDistance);
  const id = state.nextEntityId;
  state.nextEntityId += 1;

  return {
    id,
    typeId: enemy.id,
    spawnEventId: spawn.eventId,
    aiTypeId: enemyAiTypeId,
    aiStateId: undefined,
    aiStateElapsedFrames: 0,
    aiFireCooldownSeconds: 0,
    noColliding: false,
    entityCommonState: 0,
    name: enemy.name,
    x: spawnCenter.x + Math.cos(angle) * distance,
    y: spawnCenter.y + Math.sin(angle) * distance,
    hp: stats?.maxHp ?? 10,
    maxHp: stats?.maxHp ?? 10,
    attack: stats?.attack ?? 1,
    defense: stats?.defense ?? 0,
    speed: stats?.speed ?? 160,
    radius: stats?.colliderRadius ?? 42,
    isBoss: enemy.isBoss,
    canFly: enemy.canFly,
    canWalkThroughWall: enemy.canWalkThroughWall,
    dropId,
    activeBuffs: [],
  };
}

function getEnemySpawnAngle(
  spawn: NfoEnemySpawnData,
  waveIndex: number,
  waveCount: number,
): number {
  if (spawn.spawnType === NFO_ENEMY_SPAWN_TYPE.ringAroundCenter) {
    return (Math.PI * 2 * waveIndex) / Math.max(waveCount, 1);
  }

  return Math.random() * Math.PI * 2;
}

function getEnemySpawnDistance(
  spawn: NfoEnemySpawnData,
  minDistance: number,
  maxDistance: number,
): number {
  if (spawn.spawnType === NFO_ENEMY_SPAWN_TYPE.ringAroundCenter) {
    return (minDistance + maxDistance) * 0.5;
  }

  return minDistance + Math.random() * (maxDistance - minDistance);
}

function getEnemySpawnCenter(
  state: NfoSimulationState,
  spawn: NfoEnemySpawnData,
): NfoVector {
  const offsetX = spawn.spawnCenterOffsetX * LEVEL_UNIT_SIZE;
  const offsetY = spawn.spawnCenterOffsetY * LEVEL_UNIT_SIZE;
  if (spawn.spawnCenterType === NFO_ENEMY_SPAWN_CENTER_TYPE.levelOrigin) {
    return {
      x: offsetX,
      y: offsetY,
    };
  }

  return {
    x: state.player.x + offsetX,
    y: state.player.y + offsetY,
  };
}

function updateEnemies(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  deltaSeconds: number,
) {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }

    enemy.aiFireCooldownSeconds = Math.max(0, (enemy.aiFireCooldownSeconds ?? 0) - deltaSeconds);

    const ai = (enemy.aiTypeId ?? 0) > 0
      ? getRuntimeAI(runtimeData, enemy.aiTypeId ?? 0)
      : null;
    const currentAIState = ai ? getCurrentAIState(ai, enemy) : null;
    if (canAIStateMove(currentAIState)) {
      const movementTarget = getEnemyMovementTarget(state, enemy, currentAIState);
      const dx = movementTarget.x - enemy.x;
      const dy = movementTarget.y - enemy.y;
      const length = Math.hypot(dx, dy) || 1;
      const enemySpeed = getAIStateMovementSpeed(
        getEnemyEffectiveSpeed(enemy),
        currentAIState,
      );
      moveEntity(
        state,
        enemy,
        (dx / length) * enemySpeed * deltaSeconds,
        (dy / length) * enemySpeed * deltaSeconds,
        enemy.radius,
        enemy.canFly,
      );
    }

    updateEnemyAI(state, runtimeData, enemy, deltaSeconds);

    if (
      !enemy.noColliding
      && distanceBetween(enemy, state.player) <= enemy.radius + state.player.radius
      && state.player.damageCooldownSeconds <= 0
    ) {
      applyEnemyContactToPlayer(state, runtimeData, enemy);
    }
  }
}

function getEnemyMovementTarget(
  state: NfoSimulationState,
  enemy: NfoSimEnemy,
  aiState: NfoAIStateData | null,
): NfoVector {
  const tauntBuff = enemy.activeBuffs.find((buff) => (
    buff.type === NFO_BUFF_TYPE.taunt
    && buff.remainingSeconds > 0
    && Number.isFinite(buff.sourceX)
    && Number.isFinite(buff.sourceY)
  ));

  if (tauntBuff) {
    return {
      x: tauntBuff.sourceX ?? state.player.x,
      y: tauntBuff.sourceY ?? state.player.y,
    };
  }

  if (aiState?.stateType === NFO_AI_STATE_TYPE.moveToRandomPosition) {
    return getAIStateRandomMovementTarget(state, enemy, aiState);
  }

  if (isAIStateOffsetMovement(aiState)) {
    return getAIStateOffsetMovementTarget(state, aiState);
  }

  return state.player;
}

function getAIStateOffsetMovementTarget(
  state: NfoSimulationState,
  aiState: NfoAIStateData,
): NfoVector {
  return {
    x: state.player.x + (aiState.stateMoveOffsetX ?? 0),
    y: state.player.y + (aiState.stateMoveOffsetY ?? 0),
  };
}

function getAIStateRandomMovementTarget(
  state: NfoSimulationState,
  entity: NfoAIStatefulEntity & NfoVector & { id: number },
  aiState: NfoAIStateData,
): NfoVector {
  if (
    entity.aiMoveTargetStateId !== aiState.id
    || !Number.isFinite(entity.aiMoveTargetX)
    || !Number.isFinite(entity.aiMoveTargetY)
  ) {
    const target = createDeterministicRandomTargetAroundPlayer(state, entity, aiState);
    entity.aiMoveTargetStateId = aiState.id;
    entity.aiMoveTargetX = target.x;
    entity.aiMoveTargetY = target.y;
  }

  return {
    x: entity.aiMoveTargetX ?? state.player.x,
    y: entity.aiMoveTargetY ?? state.player.y,
  };
}

function createDeterministicRandomTargetAroundPlayer(
  state: NfoSimulationState,
  entity: NfoAIStatefulEntity & NfoVector & { id: number },
  aiState: NfoAIStateData,
): NfoVector {
  const angleDegrees = positiveModulo(
    entity.id * 53 + aiState.id * 97 + state.frame * 29,
    360,
  );
  const radius = 240 + positiveModulo(
    entity.id * 17 + aiState.id * 43 + state.frame * 13,
    4,
  ) * 80;
  const angle = toRadians(angleDegrees);

  return {
    x: clamp(
      state.player.x + Math.cos(angle) * radius,
      state.worldBounds.minX,
      state.worldBounds.maxX,
    ),
    y: clamp(
      state.player.y + Math.sin(angle) * radius,
      state.worldBounds.minY,
      state.worldBounds.maxY,
    ),
  };
}

function updateEnemyAI(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  enemy: NfoSimEnemy,
  deltaSeconds: number,
) {
  if ((enemy.aiTypeId ?? 0) <= 0) {
    return;
  }

  const ai = getRuntimeAI(runtimeData, enemy.aiTypeId ?? 0);
  const advancedAIState = ai ? advanceAIState(enemy, ai, deltaSeconds) : null;
  if (!advancedAIState) {
    return;
  }
  applyAIStateTimelineEvents(state, runtimeData, enemy, advancedAIState);
  const aiState = advancedAIState.state;
  syncAIStateFacingFromTarget(
    enemy,
    aiState,
    getEnemyMovementTarget(state, enemy, aiState),
  );
  if ((enemy.aiFireCooldownSeconds ?? 0) > 0) {
    return;
  }
  if (!isActionableAIState(aiState)) {
    return;
  }
  if (!shouldTriggerAIStateAction(advancedAIState)) {
    return;
  }

  const fireSourceModifiers = getEnemyFireSourceModifiers(enemy);
  let didFire = false;
  if (canAIStateFireDirectBullets(aiState)) {
    fireEnemyAIStateDirectBullets(
      state,
      runtimeData,
      enemy,
      advancedAIState,
      fireSourceModifiers,
    );
    didFire = true;
  }

  if (aiState.bulletShooterId > 0) {
    spawnBulletShooter(
      state,
      runtimeData,
      aiState.bulletShooterId,
      enemy,
      {
        ...fireSourceModifiers,
        ownerType: "enemy",
        sourceTeam: "enemy",
      },
    );
    didFire = true;
  }

  if (didFire) {
    enemy.aiFireCooldownSeconds = getAIActionCooldownSeconds(aiState);
  }
}

function fireEnemyAIStateDirectBullets(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  enemy: NfoSimEnemy,
  advancedAIState: AdvancedAIState,
  fireSourceModifiers: FireSourceModifierOptions,
) {
  const aiState = advancedAIState.state;
  const catBossAttack = aiState.stateType === NFO_AI_STATE_TYPE.catBossAttack
    ? createCatBossAttackShot(state, enemy, advancedAIState)
    : null;
  fireBulletDataSet(
    state,
    runtimeData,
    aiState.fireBullets,
    catBossAttack?.origin ?? enemy,
    catBossAttack?.target ?? state.player,
    state.player,
    {
      ...fireSourceModifiers,
      canDamagePlayer: true,
      hitTargetTypeOverride: NFO_BULLET_HIT_TARGET_TYPE.friendly,
    },
  );
}

function createCatBossAttackShot(
  state: NfoSimulationState,
  enemy: NfoSimEnemy,
  advancedAIState: AdvancedAIState,
): { origin: NfoVector; target: NfoVector } {
  const offsetSeed = positiveModulo(
    enemy.id * 97 + advancedAIState.currentFrame * 13,
    NFO_CAT_BOSS_ATTACK_RANDOM_POS_RADIUS * 2,
  );
  const angleSeed = positiveModulo(
    enemy.id * 31 + advancedAIState.currentFrame * 7,
    NFO_CAT_BOSS_ATTACK_RANDOM_ANGLE_DEGREES * 2,
  );
  const origin = {
    x: state.player.x + offsetSeed - NFO_CAT_BOSS_ATTACK_RANDOM_POS_RADIUS,
    y: state.player.y + NFO_CAT_BOSS_ATTACK_BULLET_POS_Y,
  };
  const baseAngle = Math.atan2(state.player.y - origin.y, state.player.x - origin.x);
  const angle = baseAngle + toRadians(angleSeed - NFO_CAT_BOSS_ATTACK_RANDOM_ANGLE_DEGREES);

  return {
    origin,
    target: targetFromAngle(origin, angle),
  };
}

function advanceAIState(
  entity: NfoAIStatefulEntity,
  ai: NonNullable<ReturnType<typeof getRuntimeAI>>,
  deltaSeconds: number,
): AdvancedAIState | null {
  const initialStateId = entity.aiStateId && hasAIState(ai.states, entity.aiStateId)
    ? entity.aiStateId
    : ai.firstStateId;
  entity.aiStateId = initialStateId;
  const previousFrame = entity.aiStateElapsedFrames ?? 0;
  entity.aiStateElapsedFrames = (entity.aiStateElapsedFrames ?? 0)
    + Math.max(deltaSeconds, 0) * FRAME_RATE;

  let aiState = getAIStateById(ai.states, entity.aiStateId) ?? ai.states[0] ?? null;
  if (!aiState) {
    return null;
  }

  if (aiState.lastFrame > 0 && (entity.aiStateElapsedFrames ?? 0) >= aiState.lastFrame) {
    const nextStateId = getDeterministicNextAIStateId(aiState);
    const nextAIState = nextStateId > 0
      ? getAIStateById(ai.states, nextStateId)
      : null;
    if (nextAIState) {
      entity.aiStateId = nextAIState.id;
      entity.aiStateElapsedFrames = 0;
      delete entity.aiMoveTargetStateId;
      delete entity.aiMoveTargetX;
      delete entity.aiMoveTargetY;
      delete entity.aiOrbitStateId;
      delete entity.aiOrbitAngle;
      delete entity.aiOrbitRadius;
      entity.noColliding = false;
      aiState = nextAIState;
      return {
        state: aiState,
        previousFrame: 0,
        currentFrame: 0,
      };
    }
  }

  return {
    state: aiState,
    previousFrame,
    currentFrame: entity.aiStateElapsedFrames ?? 0,
  };
}

function hasAIState(states: NfoAIStateData[], stateId: number): boolean {
  return states.some((state) => state.id === stateId);
}

function getAIStateById(
  states: NfoAIStateData[],
  stateId: number,
): NfoAIStateData | null {
  return states.find((state) => state.id === stateId) ?? null;
}

function getCurrentAIState(
  ai: NonNullable<ReturnType<typeof getRuntimeAI>>,
  entity: NfoAIStatefulEntity,
): NfoAIStateData | null {
  const currentStateId = typeof entity.aiStateId === "number" && hasAIState(ai.states, entity.aiStateId)
    ? entity.aiStateId
    : ai.firstStateId;
  return getAIStateById(ai.states, currentStateId) ?? ai.states[0] ?? null;
}

function canAIStateMove(aiState: NfoAIStateData | null): boolean {
  if (!aiState) {
    return true;
  }

  return aiState.stateType === NFO_AI_STATE_TYPE.moveToPlayer
    || aiState.stateType === NFO_AI_STATE_TYPE.moveToRandomPosition
    || aiState.stateType === NFO_AI_STATE_TYPE.golemRollAttack
    || aiState.stateType === NFO_AI_STATE_TYPE.minionFollow
    || aiState.stateType === NFO_AI_STATE_TYPE.minionMoveToEnemy
    || aiState.stateType === NFO_AI_STATE_TYPE.minionOrbit
    || isAIStateOffsetMovement(aiState);
}

function getAIStateMovementSpeed(
  baseSpeed: number,
  aiState: NfoAIStateData | null,
): number {
  if (
    (
      aiState?.stateType === NFO_AI_STATE_TYPE.golemRollAttack
      || isAIStateOffsetMovement(aiState)
    )
    && (aiState.stateMoveSpeed ?? 0) > 0
  ) {
    return aiState.stateMoveSpeed ?? baseSpeed;
  }

  return baseSpeed;
}

function isAIStateOffsetMovement(aiState: NfoAIStateData | null): aiState is NfoAIStateData {
  return aiState?.stateType === NFO_AI_STATE_TYPE.cnOffsetMove
    || aiState?.stateType === NFO_AI_STATE_TYPE.cnOffsetLanding
    || aiState?.stateType === NFO_AI_STATE_TYPE.cnOffsetLaserMove;
}

function getDeterministicNextAIStateId(aiState: NfoAIStateData): number {
  return aiState.nextStates.find((nextState) => nextState.stateId > 0)?.stateId ?? 0;
}

function isActionableAIState(aiState: NfoAIStateData): boolean {
  return canAIStateFireDirectBullets(aiState)
    || aiState.bulletShooterId > 0;
}

function canAIStateFireDirectBullets(aiState: NfoAIStateData): boolean {
  return aiState.fireBullets.length > 0
    && (
      aiState.isFireBullet
      || aiState.timelineEvents.some((event) => event.fireBulletNow)
    );
}

function hasAIWeaponFireGate(ai: NonNullable<ReturnType<typeof getRuntimeAI>>): boolean {
  return ai.states.some((state) => (
    state.timelineEvents.some((event) => event.fireAllWeaponNow)
  ));
}

function aiTypeUsesWeaponFireGate(
  runtimeData: NfoOfflineRuntimeData,
  aiTypeId: number,
): boolean {
  const ai = getRuntimeAI(runtimeData, aiTypeId);
  return ai ? hasAIWeaponFireGate(ai) : false;
}

function applyAIStateTimelineEvents(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  entity: NfoAIStatefulEntity & NfoVector & { id: number },
  advancedAIState: AdvancedAIState,
) {
  if (isAIStateEntryFrame(advancedAIState)) {
    applyAIStateAnimation(entity, advancedAIState.state);
    applyAIStateEntryEffects(runtimeData, entity, advancedAIState);
  }

  const triggerLevelEventId = advancedAIState.state.triggerLevelEventId ?? 0;
  if (triggerLevelEventId > 0 && isAIStateEntryFrame(advancedAIState)) {
    state.triggeredLevelEventIds[triggerLevelEventId] = true;
  }

  if (
    advancedAIState.state.stateType === NFO_AI_STATE_TYPE.samuraiFlashAttack
    && isAIStateEntryFrame(advancedAIState)
  ) {
    const target = createDeterministicRandomTargetAroundPlayer(
      state,
      entity,
      advancedAIState.state,
    );
    entity.x = target.x;
    entity.y = target.y;
  }

  for (const event of getDueAIStateTimelineEvents(advancedAIState)) {
    applyAIStateTimelineAnimation(entity, event);
    entity.noColliding = event.noColliding;
    if (
      advancedAIState.state.stateType === NFO_AI_STATE_TYPE.blackCatTeleport
      && event.name.toLowerCase() === "teleport"
    ) {
      const target = createDeterministicRandomTargetAroundPlayer(
        state,
        entity,
        advancedAIState.state,
      );
      entity.x = target.x;
      entity.y = target.y;
    }
  }
}

function applyAIStateAnimation(
  entity: NfoAIStatefulEntity,
  aiState: NfoAIStateData,
) {
  const animationName = aiState.playAnimeName?.trim() ?? "";
  if (animationName.length === 0) {
    return;
  }

  applyAIEntityAnimationName(entity, animationName, aiState.restartsAnimation ?? false);
}

function applyAIStateTimelineAnimation(
  entity: NfoAIStatefulEntity,
  event: NfoAIStateData["timelineEvents"][number],
) {
  const animationName = event.playAnimeName.trim();
  if (animationName.length === 0) {
    return;
  }

  applyAIEntityAnimationName(entity, animationName, false);
}

function applyAIEntityAnimationName(
  entity: NfoAIStatefulEntity,
  animationName: string,
  forceRestart: boolean,
) {
  if (!forceRestart && entity.animationName === animationName) {
    return;
  }

  entity.animationName = animationName;
  entity.animationRevision = (entity.animationRevision ?? 0) + 1;
}

function applyAIStateEntryEffects(
  runtimeData: NfoOfflineRuntimeData,
  entity: NfoAIStatefulEntity & NfoVector,
  advancedAIState: AdvancedAIState,
) {
  if (advancedAIState.state.changesEntityCommonState) {
    entity.entityCommonState = advancedAIState.state.entityCommonStateChangeTo ?? 0;
  }

  const buffId = advancedAIState.state.buffId ?? 0;
  if (buffId <= 0 || !entity.activeBuffs) {
    return;
  }

  applyBuffToActiveBuffs(
    runtimeData,
    buffId,
    advancedAIState.state.buffLevel ?? 1,
    entity.activeBuffs,
    {
      sourceX: entity.x,
      sourceY: entity.y,
    },
  );
}

function isAIStateEntryFrame(advancedAIState: AdvancedAIState): boolean {
  return advancedAIState.previousFrame <= 0 && advancedAIState.currentFrame > 0;
}

function shouldTriggerAIStateAction(advancedAIState: AdvancedAIState): boolean {
  const fireNowEvents = getDueAIStateTimelineEvents(advancedAIState).filter((event) => (
    event.fireBulletNow
  ));
  const hasTimelineFireGate = advancedAIState.state.timelineEvents.some((event) => (
    event.fireBulletNow
  ));
  if (!hasTimelineFireGate) {
    return true;
  }
  return fireNowEvents.length > 0;
}

function getDueAIStateTimelineEvents(advancedAIState: AdvancedAIState) {
  return advancedAIState.state.timelineEvents.filter((event) => (
    isTimelineFrameDue(event.frame, advancedAIState.previousFrame, advancedAIState.currentFrame)
  ));
}

function isTimelineFrameDue(
  eventFrame: number,
  previousFrame: number,
  currentFrame: number,
): boolean {
  const epsilon = 0.000001;
  return eventFrame > previousFrame + epsilon && eventFrame <= currentFrame + epsilon;
}

function getAIActionCooldownSeconds(aiState: NfoAIStateData): number {
  const cooldownFrames = aiState.bulletFireCooldownFrames > 0
    ? aiState.bulletFireCooldownFrames
    : aiState.lastFrame;
  return Math.max(cooldownFrames, 1) / FRAME_RATE;
}

function updateMinions(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  deltaSeconds: number,
) {
  for (const minion of state.minions) {
    if (minion.remainingSeconds <= 0) {
      continue;
    }

    minion.aiFireCooldownSeconds = Math.max(
      0,
      (minion.aiFireCooldownSeconds ?? 0) - deltaSeconds,
    );
    minion.fireCooldownSeconds = Math.max(0, minion.fireCooldownSeconds - deltaSeconds);
    const ai = getRuntimeAI(runtimeData, minion.aiTypeId);
    const advancedAIState = ai ? advanceAIState(minion, ai, deltaSeconds) : null;
    if (advancedAIState) {
      applyAIStateTimelineEvents(state, runtimeData, minion, advancedAIState);
    }
    const isAIWeaponFireGated = ai ? hasAIWeaponFireGate(ai) : false;
    const shouldFireFromAIWeaponGate = advancedAIState
      ? getDueAIStateTimelineEvents(advancedAIState).some((event) => event.fireAllWeaponNow)
      : false;

    const targetEnemy = findNearestEnemy(state, minion);
    const target = targetEnemy ?? state.player;
    const stopDistance = targetEnemy
      ? Math.max(minion.radius + targetEnemy.radius, 64)
      : MINION_FOLLOW_DISTANCE;
    const dx = target.x - minion.x;
    const dy = target.y - minion.y;
    const distance = Math.hypot(dx, dy);

    const currentAIState = advancedAIState?.state ?? null;
    const minionSpeed = getMinionEffectiveSpeed(minion);
    if (currentAIState?.stateType === NFO_AI_STATE_TYPE.minionOrbit) {
      updateMinionOrbit(state, minion, currentAIState, deltaSeconds);
    } else if (
      deltaSeconds > 0
      && distance > stopDistance
      && canAIStateMove(currentAIState)
      && minionSpeed > 0
    ) {
      const length = distance || 1;
      moveEntity(
        state,
        minion,
        (dx / length) * minionSpeed * deltaSeconds,
        (dy / length) * minionSpeed * deltaSeconds,
        minion.radius,
        true,
      );
    }

    syncAIStateFacingFromTarget(minion, currentAIState, target);

    if (advancedAIState) {
      updateMinionAIAction(state, runtimeData, minion, advancedAIState, targetEnemy);
    }

    if (Number.isFinite(minion.remainingSeconds)) {
      minion.remainingSeconds -= deltaSeconds;
    }

    if (!isAIWeaponFireGated || shouldFireFromAIWeaponGate) {
      updateMinionOwnWeaponFire(
        state,
        runtimeData,
        minion,
        targetEnemy,
        deltaSeconds,
        {
          ignoreCooldown: shouldFireFromAIWeaponGate,
          applyCooldown: !shouldFireFromAIWeaponGate,
        },
      );
    }
  }

  state.minions = state.minions.filter((minion) => minion.remainingSeconds > 0);
}

function updateMinionOrbit(
  state: NfoSimulationState,
  minion: NfoSimMinion,
  aiState: NfoAIStateData,
  deltaSeconds: number,
) {
  let didInitializeOrbit = false;
  if (
    minion.aiOrbitStateId !== aiState.id
    || !Number.isFinite(minion.aiOrbitAngle)
    || !Number.isFinite(minion.aiOrbitRadius)
  ) {
    const dx = minion.x - state.player.x;
    const dy = minion.y - state.player.y;
    const fallbackRadius = state.player.radius + minion.radius + MINION_FOLLOW_DISTANCE;
    minion.aiOrbitStateId = aiState.id;
    minion.aiOrbitAngle = Math.hypot(dx, dy) > 0
      ? Math.atan2(dy, dx)
      : minion.id * 2.399963229728653;
    minion.aiOrbitRadius = Math.max(Math.hypot(dx, dy), fallbackRadius);
    didInitializeOrbit = true;
  }

  const orbitRadius = Math.max(minion.aiOrbitRadius ?? 0, 1);
  const orbitAngularSpeed = toRadians(aiState.stateMoveSpeed ?? 0);
  const orbitAngle = didInitializeOrbit
    ? minion.aiOrbitAngle ?? 0
    : (minion.aiOrbitAngle ?? 0) + orbitAngularSpeed * Math.max(deltaSeconds, 0);
  minion.aiOrbitAngle = orbitAngle;
  minion.aiOrbitRadius = orbitRadius;
  minion.x = clamp(
    state.player.x + Math.cos(orbitAngle) * orbitRadius,
    state.worldBounds.minX + minion.radius,
    state.worldBounds.maxX - minion.radius,
  );
  minion.y = clamp(
    state.player.y + Math.sin(orbitAngle) * orbitRadius,
    state.worldBounds.minY + minion.radius,
    state.worldBounds.maxY - minion.radius,
  );
}

function updateMinionAIAction(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  minion: NfoSimMinion,
  advancedAIState: AdvancedAIState,
  targetEnemy: NfoSimEnemy | null,
) {
  if ((minion.aiFireCooldownSeconds ?? 0) > 0) {
    return;
  }

  const aiState = advancedAIState.state;
  if (!isActionableAIState(aiState) || !shouldTriggerAIStateAction(advancedAIState)) {
    return;
  }

  const fireSourceModifiers = getPlayerSideFireSourceModifiers(state, minion.activeBuffs);
  let didFire = false;
  if (canAIStateFireDirectBullets(aiState)) {
    fireBulletDataSet(
      state,
      runtimeData,
      aiState.fireBullets,
      minion,
      targetEnemy,
      state.player,
      {
        ...fireSourceModifiers,
        canDamagePlayer: false,
        hitTargetTypeOverride: NFO_BULLET_HIT_TARGET_TYPE.enemy,
      },
    );
    didFire = true;
  }

  if (aiState.bulletShooterId > 0) {
    spawnBulletShooter(
      state,
      runtimeData,
      aiState.bulletShooterId,
      minion,
      {
        ...fireSourceModifiers,
        ownerType: "minion",
        sourceTeam: "player",
      },
    );
    didFire = true;
  }

  if (didFire) {
    minion.aiFireCooldownSeconds = getAIActionCooldownSeconds(aiState);
  }
}

function createInitialActiveSkillState(
  runtimeData: NfoOfflineRuntimeData,
  activeSkillId: number,
): NfoSimActiveSkill {
  const activeSkill = getRuntimeActiveSkill(runtimeData, activeSkillId);
  const activeSkillLevel = activeSkill ? pickLevelStats(activeSkill.levels, 1) : null;

  return {
    id: activeSkill?.id ?? 0,
    level: activeSkillLevel?.level ?? 0,
    chargeFrames: 0,
    chargeMaxFrames: activeSkillLevel?.chargeCountMax ?? 0,
    timelineFrame: 0,
    timelineTotalFrames: activeSkillLevel?.timelineFrames ?? 0,
    isActive: false,
    triggeredEventIndexes: [],
  };
}

function updateActiveSkill(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  input: NfoInputState,
  deltaSeconds: number,
) {
  if (state.activeSkill.id <= 0) {
    return;
  }

  const activeSkill = getRuntimeActiveSkill(runtimeData, state.activeSkill.id);
  const activeSkillLevel = activeSkill
    ? pickLevelStats(activeSkill.levels, Math.max(state.activeSkill.level, 1))
    : null;
  if (!activeSkill || !activeSkillLevel) {
    return;
  }

  if (!state.activeSkill.isActive) {
    state.activeSkill.chargeFrames = Math.min(
      state.activeSkill.chargeMaxFrames,
      state.activeSkill.chargeFrames + deltaSeconds * FRAME_RATE,
    );
    if (input.useActiveSkill && state.activeSkill.chargeFrames >= state.activeSkill.chargeMaxFrames) {
      startActiveSkill(state, activeSkillLevel);
    }
  }

  if (state.activeSkill.isActive) {
    updateActiveSkillTimeline(state, runtimeData, activeSkillLevel, deltaSeconds);
  }
}

function startActiveSkill(
  state: NfoSimulationState,
  activeSkillLevel: NfoActiveSkillLevel,
) {
  state.activeSkill.chargeFrames = 0;
  state.activeSkill.timelineFrame = 0;
  state.activeSkill.timelineTotalFrames = activeSkillLevel.timelineFrames;
  state.activeSkill.triggeredEventIndexes = [];
  state.activeSkill.isActive = true;
}

function updateActiveSkillTimeline(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  activeSkillLevel: NfoActiveSkillLevel,
  deltaSeconds: number,
) {
  const previousTimelineFrame = state.activeSkill.timelineFrame;
  state.activeSkill.timelineFrame += deltaSeconds * FRAME_RATE;

  activeSkillLevel.events.forEach((event, eventIndex) => {
    if (
      state.activeSkill.triggeredEventIndexes.includes(eventIndex)
      || event.frame > state.activeSkill.timelineFrame
      || event.frame <= previousTimelineFrame
    ) {
      return;
    }

    state.activeSkill.triggeredEventIndexes.push(eventIndex);
    for (const buffEvent of event.buffs) {
      applyActiveSkillBuffEvent(runtimeData, buffEvent, state);
    }
    if (event.spawnMinion) {
      spawnActiveSkillMinions(state, runtimeData, event.spawnMinion);
    }
    if (event.bulletShooterId > 0) {
      spawnBulletShooter(state, runtimeData, event.bulletShooterId, state.player, {
        ownerType: "player",
      });
    }
  });

  const timelineTotalFrames = state.activeSkill.timelineTotalFrames
    || activeSkillLevel.timelineFrames;
  if (timelineTotalFrames <= 0 || state.activeSkill.timelineFrame >= timelineTotalFrames) {
    state.activeSkill.isActive = false;
    state.activeSkill.timelineFrame = 0;
    state.activeSkill.timelineTotalFrames = activeSkillLevel.timelineFrames;
    state.activeSkill.triggeredEventIndexes = [];
  }
}

function applyActiveSkillBuffEvent(
  runtimeData: NfoOfflineRuntimeData,
  buffEvent: {
    targetType: number;
    buffId: number;
    level: number;
  },
  state: NfoSimulationState,
) {
  applyBuffToPlayer(
    runtimeData,
    buffEvent.buffId,
    buffEvent.level,
    state,
  );

  if (buffEvent.targetType !== NFO_ACTIVE_SKILL_BUFF_TARGET_TYPE.playerSide) {
    return;
  }

  for (const minion of state.minions) {
    applyBuffToMinion(
      runtimeData,
      buffEvent.buffId,
      buffEvent.level,
      minion,
    );
  }
}

function spawnBulletShooter(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  bulletShooterId: number,
  origin: NfoVector,
  options: Partial<FireSourceModifierOptions & {
    attack: number;
    ownerType: NfoBulletShooterOwnerType;
    sourceTeam: NfoCombatTeam;
  }> = {},
) {
  const shooterData = getRuntimeBulletShooter(runtimeData, bulletShooterId);
  if (!shooterData || shooterData.events.length === 0) {
    return;
  }

  const position = getBulletShooterSpawnPosition(state, shooterData, origin);
  const ownerType = options.ownerType ?? "player";
  state.activeShooters.push({
    id: state.nextEntityId,
    shooterId: shooterData.id,
    name: shooterData.name,
    x: position.x,
    y: position.y,
    ageFrames: 0,
    lifeTimeFrames: shooterData.lifeTimeFrames,
    behaviorType: shooterData.behaviorType,
    followsOwnerDirection: shooterData.followsOwnerDirection,
    ownerFacingAngle: getOriginFacingAngle(origin),
    ownerType,
    ownerId: ownerType === "player" ? undefined : getOriginEntityId(origin),
    ownerOffsetX: position.x - origin.x,
    ownerOffsetY: position.y - origin.y,
    sourceTeam: options.sourceTeam ?? "player",
    attack: options.attack ?? options.attackerAttack ?? getPlayerEffectiveAttack(state),
    bulletCountModifier: options.bulletCountModifier,
    bulletLifeTimeModifier: options.bulletLifeTimeModifier,
    bulletSizeModifier: options.bulletSizeModifier,
    bulletSpeedModifier: options.bulletSpeedModifier,
    criticalDamage: options.criticalDamage,
    criticalRate: options.criticalRate,
  });
  state.nextEntityId += 1;
}

function getBulletShooterSpawnPosition(
  state: NfoSimulationState,
  shooterData: NfoBulletShooterData,
  origin: NfoVector,
): NfoVector {
  let basePosition = origin;
  if (shooterData.spawnPos === NFO_BULLET_SHOOTER_SPAWN_POS_TYPE.friendlyTarget) {
    basePosition = state.player;
  } else if (shooterData.spawnPos === NFO_BULLET_SHOOTER_SPAWN_POS_TYPE.nearestEnemy) {
    basePosition = findNearestEnemy(state, origin) ?? origin;
  }

  return {
    x: basePosition.x + shooterData.spawnPosOffsetX,
    y: basePosition.y + shooterData.spawnPosOffsetY,
  };
}

function syncActiveShooterWithOwner(
  state: NfoSimulationState,
  shooter: NfoSimActiveShooter,
) {
  const owner = getActiveShooterOwner(state, shooter);
  if (!owner) {
    return;
  }

  if (shooter.behaviorType === NFO_BULLET_SHOOTER_BEHAVIOR_TYPE.followOwnerPosition) {
    shooter.x = owner.x + shooter.ownerOffsetX;
    shooter.y = owner.y + shooter.ownerOffsetY;
  }

  if (shooter.followsOwnerDirection) {
    shooter.ownerFacingAngle = getOriginFacingAngle(owner);
  }
}

function getActiveShooterOwner(
  state: NfoSimulationState,
  shooter: NfoSimActiveShooter,
): NfoVector | null {
  if (shooter.ownerType === "player") {
    return state.player;
  }
  if (shooter.ownerType === "enemy") {
    return state.enemies.find((enemy) => enemy.id === shooter.ownerId) ?? null;
  }
  if (shooter.ownerType === "minion") {
    return state.minions.find((minion) => minion.id === shooter.ownerId) ?? null;
  }
  return null;
}

function updateActiveShooters(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  deltaSeconds: number,
) {
  for (const shooter of state.activeShooters) {
    const shooterData = getRuntimeBulletShooter(runtimeData, shooter.shooterId);
    if (!shooterData) {
      shooter.ageFrames = Number.MAX_SAFE_INTEGER;
      continue;
    }

    syncActiveShooterWithOwner(state, shooter);
    const previousAgeFrames = shooter.ageFrames;
    shooter.ageFrames += deltaSeconds * FRAME_RATE;

    for (const event of shooterData.events) {
      const dueFrameCount = getDueBulletShooterEventFrameCount(
        event,
        previousAgeFrames,
        shooter.ageFrames,
      );
      for (let index = 0; index < dueFrameCount; index += 1) {
        fireBulletShooterTimelineEvent(state, runtimeData, shooter, event);
      }
    }
  }

  state.activeShooters = state.activeShooters.filter((shooter) => (
    shooter.lifeTimeFrames <= 0 || shooter.ageFrames < shooter.lifeTimeFrames
  ));
}

function getDueBulletShooterEventFrameCount(
  event: NfoBulletShooterTimelineEvent,
  previousAgeFrames: number,
  currentAgeFrames: number,
): number {
  if (event.frame <= previousAgeFrames || event.frame > currentAgeFrames) {
    if (!event.isLoopEvent || event.loopFrameInterval <= 0) {
      return 0;
    }
  }

  if (!event.isLoopEvent || event.loopFrameInterval <= 0) {
    return event.frame > previousAgeFrames && event.frame <= currentAgeFrames ? 1 : 0;
  }

  if (currentAgeFrames < event.frame) {
    return 0;
  }

  const interval = event.loopFrameInterval;
  const firstDueIndex = Math.max(
    0,
    Math.floor((previousAgeFrames - event.frame) / interval) + 1,
  );
  const lastDueIndex = Math.floor((currentAgeFrames - event.frame) / interval);
  return Math.max(0, lastDueIndex - firstDueIndex + 1);
}

function fireBulletShooterTimelineEvent(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  shooter: NfoSimActiveShooter,
  event: NfoBulletShooterTimelineEvent,
) {
  if (event.fireBullets.length === 0) {
    return;
  }

  const origin = getBulletShooterEventOrigin(shooter, event);
  const enemyTarget = getBulletShooterEventEnemyTarget(state, shooter, event, origin);
  const bulletRotateTypeOverride = event.bulletRotationType > 0
    ? event.bulletRotationType
    : undefined;
  fireBulletDataSet(
    state,
    runtimeData,
    event.fireBullets,
    origin,
    enemyTarget,
    state.player,
    {
      attackerAttack: shooter.attack,
      bulletCountModifier: shooter.bulletCountModifier,
      bulletLifeTimeModifier: shooter.bulletLifeTimeModifier,
      bulletSizeModifier: shooter.bulletSizeModifier,
      bulletSpeedModifier: shooter.bulletSpeedModifier,
      bulletRotateTypeOverride,
      bulletSpreadMode: getBulletShooterEventSpreadMode(event),
      canDamagePlayer: shooter.sourceTeam === "enemy",
      criticalDamage: shooter.criticalDamage,
      criticalRate: shooter.criticalRate,
      fireBulletsByEventId: indexFireBulletsByEventId(event.eventFireBullets),
    },
  );
}

function getBulletShooterEventSpreadMode(
  event: NfoBulletShooterTimelineEvent,
): BulletSpreadMode {
  const hasLargeMultiBulletEntry = event.fireBullets.some((fireBullet) => (
    fireBullet.bulletCount >= 6
  ));
  if (
    event.bulletFormationType === NFO_BULLET_FORMATION_TYPE.default
    && event.bulletFormationOffsetX === 0
    && event.bulletFormationOffsetY === 0
    && hasLargeMultiBulletEntry
  ) {
    return "radial";
  }
  return "fan";
}

function getBulletShooterEventOrigin(
  shooter: NfoSimActiveShooter,
  event: NfoBulletShooterTimelineEvent,
): NfoVector {
  const offset = getBulletShooterEventFormationOffset(shooter, event);
  return {
    x: shooter.x + offset.x,
    y: shooter.y + offset.y,
  };
}

function getBulletShooterEventFormationOffset(
  shooter: NfoSimActiveShooter,
  event: NfoBulletShooterTimelineEvent,
): NfoVector {
  if (event.bulletFormationType === NFO_BULLET_FORMATION_TYPE.ownerForwardOffset) {
    return rotateVector(
      event.bulletFormationOffsetX,
      event.bulletFormationOffsetY,
      shooter.ownerFacingAngle,
    );
  }

  return {
    x: event.bulletFormationOffsetX,
    y: event.bulletFormationOffsetY,
  };
}

function getBulletShooterEventEnemyTarget(
  state: NfoSimulationState,
  shooter: NfoSimActiveShooter,
  event: NfoBulletShooterTimelineEvent,
  origin: NfoVector,
): NfoVector {
  if (event.bulletFireDirectionType === NFO_BULLET_FIRE_DIRECTION_TYPE.formationOffset) {
    const offsetAngle = getVectorAngle(
      event.bulletFormationOffsetX,
      event.bulletFormationOffsetY,
    );
    if (offsetAngle !== null) {
      return targetFromAngle(
        origin,
        offsetAngle + degreesToRadians(event.bulletFireDirectionOffsetAngle),
      );
    }
    return targetFromNearestEnemyOrForward(state, origin, event.bulletFireDirectionOffsetAngle);
  }

  if (
    event.bulletFireDirectionType === NFO_BULLET_FIRE_DIRECTION_TYPE.ownerForward
    || event.bulletFireDirectionType === NFO_BULLET_FIRE_DIRECTION_TYPE.ownerForwardWithFormation
  ) {
    return targetFromAngle(
      origin,
      shooter.ownerFacingAngle + degreesToRadians(event.bulletFireDirectionOffsetAngle),
    );
  }

  if (event.bulletFireDirectionType === NFO_BULLET_FIRE_DIRECTION_TYPE.friendlyTarget) {
    return targetFromPointWithOffset(
      origin,
      state.player,
      event.bulletFireDirectionOffsetAngle,
    );
  }

  return targetFromNearestEnemyOrForward(state, origin, event.bulletFireDirectionOffsetAngle);
}

function targetFromPointWithOffset(
  origin: NfoVector,
  target: NfoVector,
  offsetDegrees: number,
): NfoVector {
  const baseAngle = getVectorAngle(target.x - origin.x, target.y - origin.y) ?? 0;
  return targetFromAngle(origin, baseAngle + degreesToRadians(offsetDegrees));
}

function targetFromNearestEnemyOrForward(
  state: NfoSimulationState,
  origin: NfoVector,
  offsetDegrees: number,
): NfoVector {
  const nearestEnemy = findNearestEnemy(state, origin);
  const baseAngle = nearestEnemy
    ? Math.atan2(nearestEnemy.y - origin.y, nearestEnemy.x - origin.x)
    : 0;
  return targetFromAngle(origin, baseAngle + degreesToRadians(offsetDegrees));
}

function syncAIStateFacingFromTarget(
  entity: NfoAIStatefulEntity & NfoVector,
  aiState: NfoAIStateData | null,
  target: NfoVector | null,
) {
  if (!aiState?.syncDirectionFromTarget || !target) {
    return;
  }

  const targetAngle = getVectorAngle(target.x - entity.x, target.y - entity.y);
  if (targetAngle !== null) {
    entity.facingAngle = targetAngle;
  }
}

function getVectorAngle(x: number, y: number): number | null {
  if (Math.hypot(x, y) <= 0) {
    return null;
  }
  return Math.atan2(y, x);
}

function targetFromAngle(origin: NfoVector, angle: number): NfoVector {
  return {
    x: origin.x + Math.cos(angle),
    y: origin.y + Math.sin(angle),
  };
}

function rotateVector(x: number, y: number, angle: number): NfoVector {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function getOriginFacingAngle(origin: NfoVector): number {
  const facingOrigin = origin as Partial<{ facingAngle: unknown }>;
  return typeof facingOrigin.facingAngle === "number" ? facingOrigin.facingAngle : 0;
}

function getOriginEntityId(origin: NfoVector): number | undefined {
  const entityOrigin = origin as Partial<{ id: unknown }>;
  return typeof entityOrigin.id === "number" ? entityOrigin.id : undefined;
}

function isSimMinion(origin: NfoVector): origin is NfoSimMinion {
  return "minionId" in origin && "activeBuffs" in origin;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function indexFireBulletsByEventId(fireBullets: NfoFireBullet[]): Record<number, NfoFireBullet[]> {
  const fireBulletsByEventId: Record<number, NfoFireBullet[]> = {};
  for (const fireBullet of fireBullets) {
    if (fireBullet.eventBulletId <= 0) {
      continue;
    }
    fireBulletsByEventId[fireBullet.eventBulletId] ??= [];
    fireBulletsByEventId[fireBullet.eventBulletId]?.push(fireBullet);
  }
  return fireBulletsByEventId;
}

function updateWeaponFire(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  context: SimulationContext,
  deltaSeconds: number,
) {
  if (state.player.fireCooldownSeconds > 0) {
    return;
  }

  const weaponLevel = pickLevelStats(context.weapon.levels, state.player.weaponLevel);
  if (!weaponLevel) {
    return;
  }

  const bulletShooterId = weaponLevel.bulletShooterId ?? 0;
  const hasBulletShooter = bulletShooterId > 0;
  const hasSelfBuff = (weaponLevel.selfBuffId ?? 0) > 0;
  const minionId = context.weapon.minionId ?? 0;
  const isMinionWeapon = context.weapon.weaponType === NFO_WEAPON_TYPE.minion
    && minionId > 0;
  if (
    weaponLevel.fireBullets.length === 0
    && !hasBulletShooter
    && !hasSelfBuff
    && !isMinionWeapon
  ) {
    return;
  }

  const weaponMinions = isMinionWeapon
    ? ensureWeaponMinions(state, runtimeData, context.weapon, weaponLevel)
    : [];
  const shouldDeferMinionWeaponFire = weaponMinions.some((minion) => (
    minionUsesAIWeaponFireGate(runtimeData, minion)
  ));
  if (
    isMinionWeapon
    && weaponMinions.length === 0
    && weaponLevel.fireBullets.length === 0
    && !hasBulletShooter
    && !hasSelfBuff
  ) {
    return;
  }

  const firingOrigins = weaponMinions.length > 0 ? weaponMinions : [state.player];
  const target = findNearestEnemy(state, firingOrigins[0] ?? state.player);
  const fireBulletOptions = getWeaponFireBulletOptions(context.weapon);
  const requiresEnemyTarget = weaponLevel.fireBullets.some((fireBullet) => (
    getSupportedBulletHitTargetType(fireBullet.bulletHitTargetType)
      === NFO_BULLET_HIT_TARGET_TYPE.enemy
    && !canFireWithoutEnemyTarget(fireBullet, fireBulletOptions)
  ));
  if (requiresEnemyTarget && !target && !isMinionWeapon) {
    return;
  }

  if (!shouldDeferMinionWeaponFire) {
    for (const firingOrigin of firingOrigins) {
      const firingSourceModifiers = getPlayerSideFireSourceModifiers(
        state,
        isSimMinion(firingOrigin) ? firingOrigin.activeBuffs : state.player.activeBuffs,
      );
      fireBulletDataSet(
        state,
        runtimeData,
        weaponLevel.fireBullets,
        firingOrigin,
        findNearestEnemy(state, firingOrigin),
        state.player,
        {
          ...fireBulletOptions,
          ...firingSourceModifiers,
        },
      );
      if (hasBulletShooter) {
        spawnBulletShooter(state, runtimeData, bulletShooterId, firingOrigin, {
          ...firingSourceModifiers,
          ownerType: weaponMinions.length > 0 ? "minion" : "player",
        });
      }
    }

    applyWeaponSelfBuff(runtimeData, weaponLevel, state);
  }

  const fireGroupsBeforeShot = state.player.pendingFireGroups > 0
    ? state.player.pendingFireGroups
    : getWeaponGroupCount(weaponLevel.groupCount);
  const remainingFireGroups = Math.max(0, fireGroupsBeforeShot - 1);
  state.player.pendingFireGroups = remainingFireGroups;

  if (remainingFireGroups > 0) {
    state.player.fireCooldownSeconds = getCooldownSeconds(
      weaponLevel.fireGroupCooldownFrames,
      1,
      deltaSeconds,
      getPlayerEffectiveCoolDownReduce(state),
    );
    return;
  }

  const cooldownFrames = weaponLevel.fireCooldownFrames || DEFAULT_FIRE_COOLDOWN_FRAMES;
  state.player.fireCooldownSeconds = getCooldownSeconds(
    cooldownFrames,
    DEFAULT_FIRE_COOLDOWN_FRAMES,
    deltaSeconds,
    getPlayerEffectiveCoolDownReduce(state),
  );
}

function minionUsesAIWeaponFireGate(
  runtimeData: NfoOfflineRuntimeData,
  minion: NfoSimMinion,
): boolean {
  return aiTypeUsesWeaponFireGate(runtimeData, minion.aiTypeId);
}

function ensureWeaponMinions(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  weapon: NfoWeaponData,
  weaponLevel: NfoWeaponLevel,
): NfoSimMinion[] {
  const minionId = getWeaponLevelMinionId(weapon, weaponLevel);
  const minionData = getRuntimeMinion(runtimeData, minionId);
  if (!minionData) {
    return [];
  }

  const expectedCount = getWeaponLevelMinionCount(weaponLevel);
  const existingMinions = state.minions.filter((minion) => (
    minion.weaponId === weapon.id && minion.minionId === minionData.id
  ));

  for (const minion of existingMinions) {
    syncWeaponLevelMinion(state, runtimeData, minion, weaponLevel, minionData);
  }

  while (existingMinions.length < expectedCount) {
    existingMinions.push(createWeaponLevelMinion(
      state,
      runtimeData,
      weapon,
      weaponLevel,
      minionData,
      existingMinions.length,
      expectedCount,
    ));
  }

  return existingMinions.slice(0, expectedCount);
}

function getWeaponLevelMinionId(weapon: NfoWeaponData, weaponLevel: NfoWeaponLevel): number {
  return weaponLevel.spawnMinion?.minionId || weapon.minionId || 0;
}

function getWeaponLevelMinionCount(weaponLevel: NfoWeaponLevel): number {
  return Math.max(
    1,
    Math.floor(weaponLevel.spawnMinion?.spawnCount || weaponLevel.minionCount || 1),
  );
}

function createWeaponLevelMinion(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  weapon: NfoWeaponData,
  weaponLevel: NfoWeaponLevel,
  minionData: NfoMinionData,
  index: number,
  count: number,
): NfoSimMinion {
  const spawnMinion = weaponLevel.spawnMinion;
  const defaultRadius = state.player.radius + DEFAULT_MINION_RADIUS + 4;
  const position = spawnMinion
    ? getMinionSpawnPosition(
      spawnMinion,
      index,
      count,
      {
        x: state.player.x + spawnMinion.spawnCenterOffsetX,
        y: state.player.y + spawnMinion.spawnCenterOffsetY,
      },
      defaultRadius,
    )
    : undefined;
  const aiTypeId = getWeaponLevelMinionAITypeId(weaponLevel, minionData);

  return createMinion(
    state,
    minionData,
    weapon.id,
    Math.max(1, weaponLevel.level || state.player.weaponLevel),
    {
      aiTypeId,
      canFireOwnWeapon: aiTypeUsesWeaponFireGate(runtimeData, aiTypeId),
      x: position?.x,
      y: position?.y,
    },
  );
}

function syncWeaponLevelMinion(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  minion: NfoSimMinion,
  weaponLevel: NfoWeaponLevel,
  minionData: NfoMinionData,
) {
  const aiTypeId = getWeaponLevelMinionAITypeId(weaponLevel, minionData);
  if (minion.aiTypeId !== aiTypeId) {
    minion.aiStateId = undefined;
    minion.aiStateElapsedFrames = 0;
    minion.aiFireCooldownSeconds = 0;
    minion.noColliding = false;
  }
  minion.aiTypeId = aiTypeId;
  minion.weaponLevel = Math.max(1, weaponLevel.level || state.player.weaponLevel);
  minion.canFireOwnWeapon = aiTypeUsesWeaponFireGate(runtimeData, aiTypeId);
}

function getWeaponLevelMinionAITypeId(
  weaponLevel: NfoWeaponLevel,
  minionData: NfoMinionData,
): number {
  return weaponLevel.spawnMinion?.minionAiTypeId || minionData.aiTypeId;
}

function createMinion(
  state: NfoSimulationState,
  minionData: NfoMinionData,
  weaponId: number,
  weaponLevel: number,
  options: Partial<{
    aiTypeId: number;
    canFireOwnWeapon: boolean;
    x: number;
    y: number;
  }> = {},
): NfoSimMinion {
  const id = state.nextEntityId;
  state.nextEntityId += 1;
  const angle = state.minions.length * 2.4;
  const distance = state.player.radius + DEFAULT_MINION_RADIUS + 4;
  const minion = {
    id,
    minionId: minionData.id,
    aiTypeId: options.aiTypeId ?? minionData.aiTypeId,
    weaponId,
    weaponLevel,
    name: minionData.name,
    speed: Math.max(minionData.speed, 0),
    radius: DEFAULT_MINION_RADIUS,
    x: options.x ?? state.player.x + Math.cos(angle) * distance,
    y: options.y ?? state.player.y + Math.sin(angle) * distance,
    remainingSeconds: minionData.lifetimeFrames > 0
      ? minionData.lifetimeFrames / FRAME_RATE
      : Number.MAX_SAFE_INTEGER,
    aiFireCooldownSeconds: 0,
    entityCommonState: 0,
    fireCooldownSeconds: 0,
    pendingFireGroups: 0,
    canFireOwnWeapon: options.canFireOwnWeapon ?? false,
    activeBuffs: [],
  };
  state.minions.push(minion);
  return minion;
}

function updateMinionOwnWeaponFire(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  minion: NfoSimMinion,
  targetEnemy: NfoSimEnemy | null,
  deltaSeconds: number,
  options: Partial<{
    ignoreCooldown: boolean;
    applyCooldown: boolean;
  }> = {},
) {
  const shouldUseCooldown = options.ignoreCooldown !== true;
  const shouldApplyCooldown = options.applyCooldown !== false;
  if (
    !minion.canFireOwnWeapon
    || minion.weaponId <= 0
    || (shouldUseCooldown && minion.fireCooldownSeconds > 0)
  ) {
    return;
  }

  const weapon = getRuntimeWeapon(runtimeData, minion.weaponId);
  if (!weapon?.enabled) {
    return;
  }

  const weaponLevel = pickLevelStats(weapon.levels, Math.max(minion.weaponLevel, 1));
  const bulletShooterId = weaponLevel?.bulletShooterId ?? 0;
  const hasBulletShooter = bulletShooterId > 0;
  if (!weaponLevel || (weaponLevel.fireBullets.length === 0 && !hasBulletShooter)) {
    return;
  }

  const requiresEnemyTarget = weaponLevel.fireBullets.some((fireBullet) => (
    getSupportedBulletHitTargetType(fireBullet.bulletHitTargetType)
      === NFO_BULLET_HIT_TARGET_TYPE.enemy
    && !canFireWithoutEnemyTarget(fireBullet, getWeaponFireBulletOptions(weapon))
  ));
  if (requiresEnemyTarget && !targetEnemy) {
    return;
  }

  const fireSourceModifiers = getPlayerSideFireSourceModifiers(state, minion.activeBuffs);
  fireBulletDataSet(
    state,
    runtimeData,
    weaponLevel.fireBullets,
    minion,
    targetEnemy,
    state.player,
    {
      ...getWeaponFireBulletOptions(weapon),
      ...fireSourceModifiers,
    },
  );
  if (hasBulletShooter) {
    spawnBulletShooter(state, runtimeData, bulletShooterId, minion, {
      ...fireSourceModifiers,
      ownerType: "minion",
    });
  }

  const fireGroupsBeforeShot = minion.pendingFireGroups > 0
    ? minion.pendingFireGroups
    : getWeaponGroupCount(weaponLevel.groupCount);
  const remainingFireGroups = Math.max(0, fireGroupsBeforeShot - 1);
  minion.pendingFireGroups = remainingFireGroups;
  if (!shouldApplyCooldown) {
    return;
  }

  if (remainingFireGroups > 0) {
    minion.fireCooldownSeconds = getCooldownSeconds(
      weaponLevel.fireGroupCooldownFrames,
      1,
      deltaSeconds,
      getPlayerSideEffectiveCoolDownReduce(state, minion.activeBuffs),
    );
    return;
  }

  minion.fireCooldownSeconds = getCooldownSeconds(
    weaponLevel.fireCooldownFrames,
    DEFAULT_FIRE_COOLDOWN_FRAMES,
    deltaSeconds,
    getPlayerSideEffectiveCoolDownReduce(state, minion.activeBuffs),
  );
}

function spawnActiveSkillMinions(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  spawnMinion: NfoActiveSkillSpawnMinionEvent,
) {
  const minionData = getRuntimeMinion(runtimeData, spawnMinion.minionId);
  if (!minionData) {
    return;
  }

  const spawnCount = Math.max(1, Math.floor(spawnMinion.spawnCount || 1));
  const defaultRadius = state.player.radius + DEFAULT_MINION_RADIUS + 4;
  const centerX = state.player.x + spawnMinion.spawnCenterOffsetX;
  const centerY = state.player.y + spawnMinion.spawnCenterOffsetY;
  const weaponLevel = Math.max(1, spawnMinion.weaponLevel || spawnMinion.minionLevel || 1);

  for (let index = 0; index < spawnCount; index += 1) {
    const position = getMinionSpawnPosition(
      spawnMinion,
      index,
      spawnCount,
      {
        x: centerX,
        y: centerY,
      },
      defaultRadius,
    );

    createMinion(
      state,
      minionData,
      spawnMinion.weaponId,
      weaponLevel,
      {
        aiTypeId: spawnMinion.minionAiTypeId || minionData.aiTypeId,
        canFireOwnWeapon: spawnMinion.weaponId > 0,
        x: position.x,
        y: position.y,
      },
    );
  }
}

function getMinionSpawnPosition(
  spawnMinion: NfoActiveSkillSpawnMinionEvent,
  index: number,
  spawnCount: number,
  center: NfoVector,
  defaultRadius: number,
): NfoVector {
  const minRadius = Math.max(0, spawnMinion.spawnRadiusMin);
  const maxRadius = Math.max(minRadius, spawnMinion.spawnRadiusMax);
  const angle = spawnCount > 1
    ? (Math.PI * 2 * index) / spawnCount
    : 0;

  if (
    spawnMinion.spawnFormation === NFO_MINION_SPAWN_FORMATION_TYPE.ring
    || spawnMinion.spawnFormation === NFO_MINION_SPAWN_FORMATION_TYPE.ringFixedRadius
  ) {
    const distance = maxRadius > 0
      ? (minRadius + maxRadius) / 2
      : defaultRadius;
    return {
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance,
    };
  }

  const baseRadius = maxRadius > 0 ? maxRadius : defaultRadius;
  const ringOffset = spawnCount > 1 && maxRadius > minRadius
    ? (maxRadius - minRadius) * (index / Math.max(spawnCount - 1, 1))
    : 0;
  const distance = maxRadius > 0
    ? minRadius + ringOffset
    : baseRadius;

  return {
    x: center.x + Math.cos(angle) * distance,
    y: center.y + Math.sin(angle) * distance,
  };
}

function fireBulletDataSet(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  fireBullets: NfoFireBullet[],
  origin: NfoVector,
  enemyTarget: NfoVector | null,
  friendlyTarget: NfoVector,
  options: FireBulletDataSetOptions = {},
) {
  for (let fireBulletIndex = 0; fireBulletIndex < fireBullets.length; fireBulletIndex += 1) {
    const currentFireBullet = fireBullets[fireBulletIndex];
    const currentHitTargetType = getSupportedBulletHitTargetType(
      options.hitTargetTypeOverride ?? currentFireBullet.bulletHitTargetType,
    );
    const target = currentHitTargetType === NFO_BULLET_HIT_TARGET_TYPE.friendly
      ? friendlyTarget
      : enemyTarget ?? getFallbackEnemyTarget(origin, currentFireBullet, options);
    if (!target) {
      continue;
    }

    const bulletCount = getModifiedBulletCount(
      currentFireBullet.bulletCount,
      options.bulletCountModifier ?? getPlayerEffectiveBulletCount(state),
    );
    for (let bulletIndex = 0; bulletIndex < bulletCount; bulletIndex += 1) {
      state.bullets.push(createBullet(
        state,
        runtimeData,
        currentFireBullet,
        origin,
        target,
        bulletIndex,
        bulletCount,
        fireBulletIndex,
        fireBullets.length,
        getOnDestroyFireBullets(currentFireBullet, options.fireBulletsByEventId ?? {}),
        options,
      ));
    }
  }
}

function getWeaponFireBulletOptions(weapon: NfoWeaponData): FireBulletDataSetOptions {
  return {
    allowTargetlessEnemyFire: NFO_TARGETLESS_DIRECT_WEAPON_IDS.has(weapon.id),
    bulletAngleOverride: NFO_CARDINAL_FORCE_DIRECTION_WEAPON_IDS.has(weapon.id)
      ? getCardinalForceBulletAngle
      : NFO_OWNER_FORWARD_DIRECT_WEAPON_IDS.has(weapon.id)
        ? getOwnerForwardBulletAngle
        : undefined,
    bulletMotionOverride: getWeaponBulletMotionOverride(weapon),
    targetlessEnemyFireAngle: NFO_OWNER_FORWARD_TARGETLESS_DIRECT_WEAPON_IDS.has(weapon.id)
      ? getOriginFacingAngle
      : undefined,
    spreadFireBulletEntries: !NFO_ALIGNED_DIRECT_FIRE_ENTRY_WEAPON_IDS.has(weapon.id),
  };
}

function getWeaponBulletMotionOverride(
  weapon: NfoWeaponData,
): FireBulletDataSetOptions["bulletMotionOverride"] {
  if (weapon.id === NFO_DARK_ORB_WEAPON_ID) {
    return () => ({ type: "homingEnemy" });
  }

  if (weapon.id === NFO_GUARDIAN_SONG_WEAPON_ID) {
    return ({ angle }) => ({
      type: "playerOrbit",
      orbitAngle: angle,
      orbitRadius: NFO_GUARDIAN_SONG_ORBIT_RADIUS,
    });
  }

  return undefined;
}

function canFireWithoutEnemyTarget(
  _fireBullet: NfoFireBullet,
  options: FireBulletDataSetOptions = {},
): boolean {
  return options.allowTargetlessEnemyFire === true;
}

function getFallbackEnemyTarget(
  origin: NfoVector,
  fireBullet: NfoFireBullet,
  options: FireBulletDataSetOptions = {},
): NfoVector | null {
  if (!canFireWithoutEnemyTarget(fireBullet, options)) {
    return null;
  }

  return targetFromAngle(origin, options.targetlessEnemyFireAngle?.(origin) ?? 0);
}

function getCardinalForceBulletAngle({
  fireBullet,
}: BulletAngleOverrideContext): number | null {
  if (fireBullet.bulletForceType === NFO_BULLET_FORCE_TYPE.left) {
    return Math.PI;
  }
  if (fireBullet.bulletForceType === NFO_BULLET_FORCE_TYPE.right) {
    return 0;
  }
  if (fireBullet.bulletForceType === NFO_BULLET_FORCE_TYPE.up) {
    return -Math.PI / 2;
  }
  if (fireBullet.bulletForceType === NFO_BULLET_FORCE_TYPE.down) {
    return Math.PI / 2;
  }

  return null;
}

function getOwnerForwardBulletAngle({
  origin,
}: BulletAngleOverrideContext): number {
  return getOriginFacingAngle(origin);
}

function getOnDestroyFireBullets(
  fireBullet: NfoFireBullet,
  fireBulletsByEventId: Record<number, NfoFireBullet[]>,
): NfoFireBullet[] {
  if (fireBullet.onDestroyFireEventBulletId <= 0) {
    return [];
  }

  return fireBulletsByEventId[fireBullet.onDestroyFireEventBulletId] ?? [];
}

function createBullet(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  fireBullet: NfoFireBullet,
  origin: NfoVector,
  target: NfoVector,
  index: number,
  bulletCount: number,
  fireBulletIndex: number,
  fireBulletCount: number,
  onDestroyFireBullets: NfoFireBullet[] = [],
  options: FireBulletDataSetOptions = {},
): NfoSimBullet {
  const attackerAttack = options.attackerAttack ?? getPlayerEffectiveAttack(state);
  const bulletCountModifier = options.bulletCountModifier ?? getPlayerEffectiveBulletCount(state);
  const bulletLifeTimeModifier =
    options.bulletLifeTimeModifier ?? getPlayerEffectiveBulletLifeTime(state);
  const bulletSizeModifier = options.bulletSizeModifier ?? getPlayerEffectiveBulletSize(state);
  const bulletSpeedModifier = options.bulletSpeedModifier ?? getPlayerEffectiveBulletSpeed(state);
  const criticalDamage = options.criticalDamage ?? getPlayerEffectiveCriticalDamage(state);
  const criticalRate = options.criticalRate ?? getPlayerEffectiveCriticalRate(state);
  const baseAngle = Math.atan2(target.y - origin.y, target.x - origin.x);
  const angle = options.bulletAngleOverride?.({ fireBullet, origin }) ?? getBulletFireAngle(
    baseAngle,
    index,
    bulletCount,
    fireBulletIndex,
    fireBulletCount,
    options.bulletSpreadMode ?? "fan",
    options.spreadFireBulletEntries !== false,
  );
  const speed = getModifiedBulletSpeed(
    fireBullet.bulletSpeed,
    bulletSpeedModifier,
  );
  const motionConfig = options.bulletMotionOverride?.({
    fireBullet,
    origin,
    index,
    bulletCount,
    angle,
  }) ?? { type: "linear" };
  const motionType = motionConfig.type;
  const colliderType = getSupportedBulletColliderType(fireBullet.bulletColliderType);
  const colliderWidth = getModifiedBulletSize(
    fireBullet.bulletSize,
    bulletSizeModifier,
  );
  const colliderLength = getModifiedBulletSecondarySize(
    fireBullet.bulletSize2,
    colliderWidth,
    bulletSizeModifier,
  );
  const judgeCooldownFrames = fireBullet.bulletDamageJudgeCooldownFrames > 0
    ? fireBullet.bulletDamageJudgeCooldownFrames
    : DEFAULT_BULLET_DAMAGE_JUDGE_COOLDOWN_FRAMES;
  const baseDamage = fireBullet.bulletAttack + attackerAttack;
  const isCritical = rollCriticalHit(criticalRate);
  const velocity = {
    x: Math.cos(angle) * speed,
    y: Math.sin(angle) * speed,
  };
  const orbitRadius = motionType === "playerOrbit"
    ? Math.max(motionConfig.orbitRadius ?? NFO_GUARDIAN_SONG_ORBIT_RADIUS, 1)
    : undefined;
  const orbitAngle = motionType === "playerOrbit"
    ? motionConfig.orbitAngle ?? angle
    : undefined;
  const orbitAngularSpeed = motionType === "playerOrbit"
    ? motionConfig.orbitAngularSpeed ?? (speed / (orbitRadius ?? 1))
    : undefined;
  const initialPosition = motionType === "playerOrbit"
    ? {
      x: state.player.x + Math.cos(orbitAngle ?? angle) * (orbitRadius ?? 0),
      y: state.player.y + Math.sin(orbitAngle ?? angle) * (orbitRadius ?? 0),
    }
    : origin;
  const initialVelocity = motionType === "playerOrbit"
    ? {
      x: -Math.sin(orbitAngle ?? angle) * (orbitAngularSpeed ?? 0) * (orbitRadius ?? 0),
      y: Math.cos(orbitAngle ?? angle) * (orbitAngularSpeed ?? 0) * (orbitRadius ?? 0),
    }
    : velocity;
  const runtimeBulletRotateType = getRuntimeBullet(runtimeData, fireBullet.bulletTypeId)
    ?.rotateType;
  const rotateType = getSupportedBulletRotateType(
    options.bulletRotateTypeOverride
      ?? runtimeBulletRotateType
      ?? NFO_BULLET_COMP_ROTATE_TYPE.none,
  );
  const id = state.nextEntityId;
  state.nextEntityId += 1;

  return {
    id,
    bulletTypeId: fireBullet.bulletTypeId,
    dealsDamage: !fireBullet.noDamage,
    rotateType,
    motionType,
    angle,
    facingAngle: getInitialBulletFacingAngle(rotateType, angle, initialVelocity.x, initialVelocity.y),
    x: initialPosition.x,
    y: initialPosition.y,
    vx: initialVelocity.x,
    vy: initialVelocity.y,
    orbitAngle,
    orbitAngularSpeed,
    orbitRadius,
    damage: getModifiedBulletDamage(
      baseDamage,
      isCritical,
      criticalDamage,
    ),
    attackerAttack,
    bulletCountModifier,
    bulletLifeTimeModifier,
    bulletSizeModifier,
    bulletSpeedModifier,
    criticalDamage,
    criticalRate,
    isCritical,
    canDamagePlayer: options.canDamagePlayer ?? false,
    hitTargetType: getSupportedBulletHitTargetType(
      options.hitTargetTypeOverride ?? fireBullet.bulletHitTargetType,
    ),
    radius: Math.max(colliderWidth * 0.5, 8),
    colliderType,
    colliderWidth,
    colliderLength,
    colliderForwardOffset:
      colliderType === NFO_BULLET_COLLIDER_TYPE.ray ? colliderLength * 0.5 : 0,
    damageJudgeType: getSupportedDamageJudgeType(fireBullet.bulletDamageJudgeType),
    damageJudgeDelaySeconds:
      Math.max(fireBullet.bulletDamageJudgeDelayFrames, 0) / FRAME_RATE,
    damageJudgeCooldownSeconds: judgeCooldownFrames / FRAME_RATE,
    forceType: getSupportedBulletForceType(fireBullet.bulletForceType),
    force: Math.max(fireBullet.bulletForce, 0),
    hitBuffId: fireBullet.hitBuffId,
    hitBuffLevel: fireBullet.hitBuffLevel,
    onDestroyFireBullets: onDestroyFireBullets.map((eventFireBullet) => ({ ...eventFireBullet })),
    remainingSeconds:
      getModifiedBulletLifetimeFrames(
        fireBullet.bulletLifeTime,
        bulletLifeTimeModifier,
      ) / FRAME_RATE,
    remainingHits: Math.max(fireBullet.bulletHitTimes, 1),
    hasHitPlayer: false,
    playerHitCooldownSeconds: 0,
    hitEnemyIds: [],
    hitCooldownSecondsByEnemyId: {},
  };
}

function getBulletFireAngle(
  baseAngle: number,
  index: number,
  bulletCount: number,
  fireBulletIndex: number,
  fireBulletCount: number,
  spreadMode: BulletSpreadMode,
  spreadFireBulletEntries: boolean,
): number {
  if (spreadMode === "radial" && bulletCount > 1) {
    return baseAngle + (index * Math.PI * 2) / bulletCount;
  }

  const spread = bulletCount > 1 ? (index - (bulletCount - 1) / 2) * 0.12 : 0;
  const fireBulletSpread = spreadFireBulletEntries && fireBulletCount > 1
    ? (fireBulletIndex - (fireBulletCount - 1) / 2) * 0.08
    : 0;
  return baseAngle + spread + fireBulletSpread;
}

function getWeaponGroupCount(groupCount: number): number {
  return Math.max(Math.floor(groupCount), 1);
}

function getModifiedBulletCount(
  baseBulletCount: number,
  bulletCountModifier: number,
): number {
  return Math.max(1, Math.floor(baseBulletCount + bulletCountModifier));
}

function getModifiedBulletSpeed(
  baseBulletSpeed: number,
  bulletSpeedModifier: number,
): number {
  return Math.max(0, baseBulletSpeed + bulletSpeedModifier);
}

function getModifiedBulletSize(
  baseBulletSize: number,
  bulletSizeModifier: number,
): number {
  return Math.max(1, baseBulletSize + bulletSizeModifier);
}

function getModifiedBulletSecondarySize(
  baseBulletSize: number,
  colliderWidth: number,
  bulletSizeModifier: number,
): number {
  if (baseBulletSize <= 0) {
    return colliderWidth;
  }

  return Math.max(baseBulletSize + bulletSizeModifier, colliderWidth);
}

function getModifiedBulletLifetimeFrames(
  baseLifetimeFrames: number,
  lifetimeModifierFrames: number,
): number {
  const baseFrames = baseLifetimeFrames > 0
    ? baseLifetimeFrames
    : DEFAULT_BULLET_LIFETIME_FRAMES;
  return Math.max(1, baseFrames + lifetimeModifierFrames);
}

function getModifiedBulletDamage(
  baseDamage: number,
  isCritical: boolean,
  criticalDamage: number,
): number {
  if (!isCritical) {
    return Math.max(1, Math.floor(baseDamage));
  }

  return Math.max(1, Math.floor(baseDamage * Math.max(criticalDamage, 0) / 100));
}

function rollCriticalHit(criticalRate: number): boolean {
  if (criticalRate <= 0) {
    return false;
  }

  if (criticalRate >= 100) {
    return true;
  }

  return Math.random() * 100 < criticalRate;
}

function getCooldownSeconds(
  cooldownFrames: number,
  fallbackFrames: number,
  deltaSeconds: number,
  coolDownReduce: number,
): number {
  const frames = cooldownFrames > 0 ? cooldownFrames : fallbackFrames;
  const cooldownMultiplier = 1 - clamp(coolDownReduce, 0, 95) / 100;
  return Math.max((frames * cooldownMultiplier) / FRAME_RATE, deltaSeconds);
}

function getSupportedDamageJudgeType(damageJudgeType: number): number {
  if (
    damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.oncePerEnemy
    || damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.multiTimes
    || damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.none
  ) {
    return damageJudgeType;
  }

  return NFO_BULLET_DAMAGE_JUDGE_TYPE.oncePerEnemy;
}

function getSupportedBulletHitTargetType(hitTargetType: number): number {
  if (
    hitTargetType === NFO_BULLET_HIT_TARGET_TYPE.enemy
    || hitTargetType === NFO_BULLET_HIT_TARGET_TYPE.friendly
  ) {
    return hitTargetType;
  }

  return NFO_BULLET_HIT_TARGET_TYPE.enemy;
}

function getSupportedBulletColliderType(colliderType: number): number {
  if (
    colliderType === NFO_BULLET_COLLIDER_TYPE.circle
    || colliderType === NFO_BULLET_COLLIDER_TYPE.rect
    || colliderType === NFO_BULLET_COLLIDER_TYPE.ray
  ) {
    return colliderType;
  }

  return NFO_BULLET_COLLIDER_TYPE.circle;
}

function getSupportedBulletForceType(forceType: number): number {
  if (
    forceType === NFO_BULLET_FORCE_TYPE.none
    || forceType === NFO_BULLET_FORCE_TYPE.outward
    || forceType === NFO_BULLET_FORCE_TYPE.inward
    || forceType === NFO_BULLET_FORCE_TYPE.left
    || forceType === NFO_BULLET_FORCE_TYPE.right
    || forceType === NFO_BULLET_FORCE_TYPE.up
    || forceType === NFO_BULLET_FORCE_TYPE.down
  ) {
    return forceType;
  }

  return NFO_BULLET_FORCE_TYPE.none;
}

function getSupportedBulletRotateType(rotateType: number): number {
  if (
    rotateType === NFO_BULLET_COMP_ROTATE_TYPE.none
    || rotateType === NFO_BULLET_COMP_ROTATE_TYPE.rotateBySpeed
    || rotateType === NFO_BULLET_COMP_ROTATE_TYPE.rotateByCoreTransform
    || rotateType === NFO_BULLET_COMP_ROTATE_TYPE.onlyChangeFaceDirection
  ) {
    return rotateType;
  }

  return NFO_BULLET_COMP_ROTATE_TYPE.none;
}

function getInitialBulletFacingAngle(
  rotateType: number,
  coreAngle: number,
  vx: number,
  vy: number,
): number {
  if (
    rotateType === NFO_BULLET_COMP_ROTATE_TYPE.rotateBySpeed
    || rotateType === NFO_BULLET_COMP_ROTATE_TYPE.onlyChangeFaceDirection
  ) {
    return getVelocityAngle(vx, vy) ?? coreAngle;
  }

  return coreAngle;
}

function updateBullets(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  level: NfoLevelData,
  deltaSeconds: number,
) {
  const bulletBounds = getLevelBulletWorldBounds(state, level);

  for (const bullet of state.bullets) {
    const positionHandledByMotion = updateBulletMotion(state, bullet, deltaSeconds);
    updateBulletRotation(bullet);
    if (!positionHandledByMotion) {
      bullet.x += bullet.vx * deltaSeconds;
      bullet.y += bullet.vy * deltaSeconds;
    }
    bullet.damageJudgeDelaySeconds = Math.max(
      0,
      bullet.damageJudgeDelaySeconds - deltaSeconds,
    );
    bullet.remainingSeconds -= deltaSeconds;
    updateBulletHitCooldowns(bullet, deltaSeconds);
  }

  const expiredBullets: NfoSimBullet[] = [];
  state.bullets = state.bullets.filter((bullet) => {
    const isAlive = (
      bullet.remainingSeconds > 0
      && bullet.remainingHits > 0
      && isBulletInsideBounds(bullet, bulletBounds)
    );
    if (!isAlive) {
      expiredBullets.push(bullet);
    }
    return isAlive;
  });

  for (const bullet of expiredBullets) {
    fireBulletOnDestroyEvents(state, runtimeData, bullet);
  }
}

function updateBulletMotion(
  state: NfoSimulationState,
  bullet: NfoSimBullet,
  deltaSeconds: number,
): boolean {
  if (bullet.motionType === "homingEnemy") {
    const targetEnemy = findNearestEnemy(state, bullet);
    if (targetEnemy) {
      const speed = Math.hypot(bullet.vx, bullet.vy);
      const angle = Math.atan2(targetEnemy.y - bullet.y, targetEnemy.x - bullet.x);
      bullet.angle = angle;
      bullet.vx = Math.cos(angle) * speed;
      bullet.vy = Math.sin(angle) * speed;
    }
    return false;
  }

  if (bullet.motionType !== "playerOrbit") {
    return false;
  }

  const radius = Math.max(
    bullet.orbitRadius ?? distanceBetween(bullet, state.player),
    1,
  );
  const previousX = bullet.x;
  const previousY = bullet.y;
  const currentAngle = bullet.orbitAngle ?? Math.atan2(
    bullet.y - state.player.y,
    bullet.x - state.player.x,
  );
  const nextAngle = currentAngle + (bullet.orbitAngularSpeed ?? 0) * deltaSeconds;
  const nextX = state.player.x + Math.cos(nextAngle) * radius;
  const nextY = state.player.y + Math.sin(nextAngle) * radius;

  bullet.orbitAngle = nextAngle;
  bullet.orbitRadius = radius;
  bullet.angle = nextAngle;
  if (deltaSeconds > 0) {
    bullet.vx = (nextX - previousX) / deltaSeconds;
    bullet.vy = (nextY - previousY) / deltaSeconds;
  }
  bullet.x = nextX;
  bullet.y = nextY;
  return true;
}

function fireBulletOnDestroyEvents(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  bullet: NfoSimBullet,
) {
  if (bullet.onDestroyFireBullets.length === 0) {
    return;
  }

  const targetEnemy = findNearestEnemy(state, bullet) ?? bullet;
  fireBulletDataSet(
    state,
    runtimeData,
    bullet.onDestroyFireBullets,
    bullet,
    targetEnemy,
    state.player,
    {
      attackerAttack: bullet.attackerAttack,
      bulletCountModifier: bullet.bulletCountModifier,
      bulletLifeTimeModifier: bullet.bulletLifeTimeModifier,
      bulletSizeModifier: bullet.bulletSizeModifier,
      bulletSpeedModifier: bullet.bulletSpeedModifier,
      canDamagePlayer: bullet.canDamagePlayer,
      criticalDamage: bullet.criticalDamage,
      criticalRate: bullet.criticalRate,
      hitTargetTypeOverride: bullet.canDamagePlayer
        ? NFO_BULLET_HIT_TARGET_TYPE.friendly
        : undefined,
    },
  );
}

function updateBulletRotation(bullet: NfoSimBullet) {
  if (bullet.rotateType === NFO_BULLET_COMP_ROTATE_TYPE.rotateBySpeed) {
    const velocityAngle = getVelocityAngle(bullet.vx, bullet.vy);
    if (velocityAngle !== null) {
      bullet.angle = velocityAngle;
      bullet.facingAngle = velocityAngle;
    }
    return;
  }

  if (bullet.rotateType === NFO_BULLET_COMP_ROTATE_TYPE.onlyChangeFaceDirection) {
    bullet.facingAngle = getVelocityAngle(bullet.vx, bullet.vy) ?? bullet.facingAngle;
    return;
  }

  if (bullet.rotateType === NFO_BULLET_COMP_ROTATE_TYPE.rotateByCoreTransform) {
    bullet.facingAngle = bullet.angle;
  }
}

function getVelocityAngle(vx: number, vy: number): number | null {
  return Math.hypot(vx, vy) > 0 ? Math.atan2(vy, vx) : null;
}

function updateBulletHitCooldowns(
  bullet: NfoSimBullet,
  deltaSeconds: number,
) {
  bullet.playerHitCooldownSeconds = Math.max(
    0,
    bullet.playerHitCooldownSeconds - deltaSeconds,
  );

  for (const enemyId of Object.keys(bullet.hitCooldownSecondsByEnemyId)) {
    const nextCooldown = bullet.hitCooldownSecondsByEnemyId[Number(enemyId)] - deltaSeconds;
    if (nextCooldown > 0) {
      bullet.hitCooldownSecondsByEnemyId[Number(enemyId)] = nextCooldown;
    } else {
      delete bullet.hitCooldownSecondsByEnemyId[Number(enemyId)];
    }
  }
}

function getLevelBulletWorldBounds(
  state: NfoSimulationState,
  level: NfoLevelData,
): NfoWorldBounds {
  const centerX = (state.worldBounds.minX + state.worldBounds.maxX) * 0.5;
  const centerY = (state.worldBounds.minY + state.worldBounds.maxY) * 0.5;
  const worldHalfWidth = (state.worldBounds.maxX - state.worldBounds.minX) * 0.5;
  const worldHalfHeight = (state.worldBounds.maxY - state.worldBounds.minY) * 0.5;
  const boundaryHalfWidth = (
    level.bulletBoundaryX > 0 ? level.bulletBoundaryX : Math.max(level.sizeX, 8)
  ) * LEVEL_UNIT_SIZE * 0.5;
  const boundaryHalfHeight = (
    level.bulletBoundaryY > 0 ? level.bulletBoundaryY : Math.max(level.sizeY, 8)
  ) * LEVEL_UNIT_SIZE * 0.5;
  const halfWidth = Math.max(worldHalfWidth, boundaryHalfWidth);
  const halfHeight = Math.max(worldHalfHeight, boundaryHalfHeight);

  return {
    minX: centerX - halfWidth,
    minY: centerY - halfHeight,
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
  };
}

function isBulletInsideBounds(
  bullet: NfoSimBullet,
  bounds: NfoWorldBounds,
): boolean {
  const margin = Math.max(bullet.radius, bullet.colliderWidth, bullet.colliderLength);
  return (
    bullet.x >= bounds.minX - margin
    && bullet.x <= bounds.maxX + margin
    && bullet.y >= bounds.minY - margin
    && bullet.y <= bounds.maxY + margin
  );
}

function canBulletJudgeDamage(bullet: NfoSimBullet): boolean {
  return (
    bullet.damageJudgeType !== NFO_BULLET_DAMAGE_JUDGE_TYPE.none
    && bullet.damageJudgeDelaySeconds <= 0
  );
}

function canBulletHitEnemy(
  bullet: NfoSimBullet,
  enemy: NfoSimEnemy,
): boolean {
  if (
    bullet.damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.oncePerEnemy
    && bullet.hitEnemyIds.includes(enemy.id)
  ) {
    return false;
  }

  if ((bullet.hitCooldownSecondsByEnemyId[enemy.id] ?? 0) > 0) {
    return false;
  }

  return doesBulletOverlapEnemy(bullet, enemy);
}

function canBulletHitPlayer(
  bullet: NfoSimBullet,
  state: NfoSimulationState,
): boolean {
  if (
    bullet.damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.oncePerEnemy
    && bullet.hasHitPlayer
  ) {
    return false;
  }

  if (bullet.playerHitCooldownSeconds > 0) {
    return false;
  }

  return doesBulletOverlapCircleTarget(bullet, state.player);
}

function canBulletHitFriendlyMinion(
  bullet: NfoSimBullet,
  minion: NfoSimMinion,
): boolean {
  if (
    bullet.damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.oncePerEnemy
    && bullet.hitEnemyIds.includes(minion.id)
  ) {
    return false;
  }

  if ((bullet.hitCooldownSecondsByEnemyId[minion.id] ?? 0) > 0) {
    return false;
  }

  return doesBulletOverlapCircleTarget(bullet, minion);
}

function recordBulletHitEnemy(
  bullet: NfoSimBullet,
  enemy: NfoSimEnemy,
) {
  if (
    bullet.damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.oncePerEnemy
    && !bullet.hitEnemyIds.includes(enemy.id)
  ) {
    bullet.hitEnemyIds.push(enemy.id);
  }

  if (bullet.damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.multiTimes) {
    bullet.hitCooldownSecondsByEnemyId[enemy.id] = bullet.damageJudgeCooldownSeconds;
  }
}

function recordBulletHitPlayer(bullet: NfoSimBullet) {
  if (bullet.damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.oncePerEnemy) {
    bullet.hasHitPlayer = true;
  }

  if (bullet.damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.multiTimes) {
    bullet.playerHitCooldownSeconds = bullet.damageJudgeCooldownSeconds;
  }
}

function recordBulletHitFriendlyMinion(
  bullet: NfoSimBullet,
  minion: NfoSimMinion,
) {
  if (
    bullet.damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.oncePerEnemy
    && !bullet.hitEnemyIds.includes(minion.id)
  ) {
    bullet.hitEnemyIds.push(minion.id);
  }

  if (bullet.damageJudgeType === NFO_BULLET_DAMAGE_JUDGE_TYPE.multiTimes) {
    bullet.hitCooldownSecondsByEnemyId[minion.id] = bullet.damageJudgeCooldownSeconds;
  }
}

function applyHitBuffToEnemy(
  runtimeData: NfoOfflineRuntimeData,
  bullet: NfoSimBullet,
  enemy: NfoSimEnemy,
) {
  if (bullet.hitBuffId <= 0 || enemy.hp <= 0) {
    return;
  }

  applyBuffToActiveBuffs(
    runtimeData,
    bullet.hitBuffId,
    bullet.hitBuffLevel,
    enemy.activeBuffs,
    {
      sourceX: bullet.x,
      sourceY: bullet.y,
    },
  );
}

function applyHitBuffToMinion(
  runtimeData: NfoOfflineRuntimeData,
  bullet: NfoSimBullet,
  minion: NfoSimMinion,
) {
  if (bullet.hitBuffId <= 0 || minion.remainingSeconds <= 0) {
    return;
  }

  applyBuffToActiveBuffs(
    runtimeData,
    bullet.hitBuffId,
    bullet.hitBuffLevel,
    minion.activeBuffs,
    {
      sourceX: bullet.x,
      sourceY: bullet.y,
    },
  );
}

function applyEnemyContactToPlayer(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  enemy: NfoSimEnemy,
) {
  if (isPlayerInvincible(state)) {
    state.player.damageCooldownSeconds = PLAYER_DAMAGE_COOLDOWN_SECONDS;
    return;
  }

  const counterBuff = findChargeBuffByType(
    state.player.activeBuffs,
    NFO_BUFF_TYPE.counter,
  );
  if (counterBuff) {
    fireCounterBuffBullets(state, runtimeData, counterBuff, enemy);
    consumeActiveBuffCharge(counterBuff);
    state.player.damageCooldownSeconds = PLAYER_DAMAGE_COOLDOWN_SECONDS;
    filterPlayerActiveBuffs(state);
    return;
  }

  const shieldBuff = findChargeBuffByType(
    state.player.activeBuffs,
    NFO_BUFF_TYPE.shield,
  );
  if (shieldBuff) {
    consumeActiveBuffCharge(shieldBuff);
    state.player.damageCooldownSeconds = PLAYER_DAMAGE_COOLDOWN_SECONDS;
    filterPlayerActiveBuffs(state);
    return;
  }

  state.player.hp -= Math.max(
    1,
    getEnemyEffectiveAttack(enemy) - getPlayerEffectiveDefense(state),
  );
  state.player.damageCooldownSeconds = PLAYER_DAMAGE_COOLDOWN_SECONDS;
}

function fireCounterBuffBullets(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  activeBuff: NfoSimActiveBuff,
  enemy: NfoSimEnemy,
) {
  const buff = getRuntimeBuff(runtimeData, activeBuff.id);
  const buffLevel = buff ? pickLevelStats(buff.levels, activeBuff.level) : null;
  if (!buffLevel || buffLevel.fireBullets.length === 0) {
    return;
  }

  fireBulletDataSet(
    state,
    runtimeData,
    buffLevel.fireBullets,
    state.player,
    enemy,
    state.player,
  );
}

function applyHitBuffToPlayer(
  runtimeData: NfoOfflineRuntimeData,
  bullet: NfoSimBullet,
  state: NfoSimulationState,
) {
  if (bullet.hitBuffId <= 0 || state.player.hp <= 0) {
    return;
  }

  applyBuffToPlayer(
    runtimeData,
    bullet.hitBuffId,
    bullet.hitBuffLevel,
    state,
  );
}

function applyWeaponSelfBuff(
  runtimeData: NfoOfflineRuntimeData,
  weaponLevel: NfoWeaponLevel,
  state: NfoSimulationState,
) {
  const selfBuffId = weaponLevel.selfBuffId ?? 0;
  if (selfBuffId <= 0 || state.player.hp <= 0) {
    return;
  }

  applyBuffToPlayer(
    runtimeData,
    selfBuffId,
    weaponLevel.selfBuffLevel ?? 1,
    state,
  );
}

function applyBuffToPlayer(
  runtimeData: NfoOfflineRuntimeData,
  buffId: number,
  buffLevelNumber: number,
  state: NfoSimulationState,
) {
  const buff = getRuntimeBuff(runtimeData, buffId);
  if (!buff || state.player.hp <= 0) {
    return;
  }

  const buffLevel = pickLevelStats(buff.levels, Math.max(buffLevelNumber, 1));
  if (!buffLevel) {
    return;
  }

  if (buff.type === NFO_BUFF_TYPE.healPercent) {
    const healAmount = Math.max(
      1,
      Math.floor((state.player.maxHp * Math.max(buffLevel.value, 0)) / 1000),
    );
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + healAmount);
    return;
  }

  const wasApplied = applyBuffToActiveBuffs(
    runtimeData,
    buffId,
    buffLevelNumber,
    state.player.activeBuffs,
  );
  if (wasApplied && buff.type !== NFO_BUFF_TYPE.counter && buffLevel.fireBullets.length > 0) {
    firePlayerBuffApplicationBullets(state, runtimeData, buffLevel.fireBullets);
  }
}

function applyBuffToMinion(
  runtimeData: NfoOfflineRuntimeData,
  buffId: number,
  buffLevelNumber: number,
  minion: NfoSimMinion,
) {
  const buff = getRuntimeBuff(runtimeData, buffId);
  if (!buff || minion.remainingSeconds <= 0) {
    return;
  }

  if (buff.type === NFO_BUFF_TYPE.healPercent) {
    return;
  }

  applyBuffToActiveBuffs(
    runtimeData,
    buffId,
    buffLevelNumber,
    minion.activeBuffs,
  );
}

function applyBuffToActiveBuffs(
  runtimeData: NfoOfflineRuntimeData,
  buffId: number,
  buffLevelNumber: number,
  activeBuffs: NfoSimActiveBuff[],
  options: BuffApplicationOptions = {},
): boolean {
  const buff = getRuntimeBuff(runtimeData, buffId);
  if (!buff) {
    return false;
  }

  const buffLevel = pickLevelStats(buff.levels, Math.max(buffLevelNumber, 1));
  if (!buffLevel) {
    return false;
  }

  const durationSeconds = buffLevel.durationFrames > 0
    ? buffLevel.durationFrames / FRAME_RATE
    : Number.MAX_SAFE_INTEGER;
  const maxStackCount = Math.max(buffLevel.maxStackCount, 1);
  const existingBuff = activeBuffs.find((activeBuff) => activeBuff.id === buff.id);

  if (existingBuff) {
    if (buff.duplicateType === NFO_BUFF_DUPLICATE_TYPE.none) {
      return false;
    }

    existingBuff.level = buffLevel.level;
    existingBuff.value = buffLevel.value;
    existingBuff.maxStackCount = maxStackCount;
    existingBuff.attributes = buffLevel.attributes.map((attribute) => ({ ...attribute }));
    existingBuff.remainingSeconds = durationSeconds;
    applyActiveBuffSource(existingBuff, options);

    if (buff.duplicateType === NFO_BUFF_DUPLICATE_TYPE.stack) {
      existingBuff.stackCount = Math.min(existingBuff.stackCount + 1, maxStackCount);
    } else {
      existingBuff.stackCount = 1;
      existingBuff.dotTickSeconds = 0;
    }
    return true;
  }

  const activeBuff = createActiveBuff(buff, buffLevel, durationSeconds, maxStackCount);
  applyActiveBuffSource(activeBuff, options);
  activeBuffs.push(activeBuff);
  return true;
}

function firePlayerBuffApplicationBullets(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  fireBullets: NfoFireBullet[],
) {
  const target = findNearestEnemy(state, state.player);
  if (!target) {
    return;
  }

  fireBulletDataSet(
    state,
    runtimeData,
    fireBullets,
    state.player,
    target,
    state.player,
  );
}

function applyActiveBuffSource(
  activeBuff: NfoSimActiveBuff,
  options: BuffApplicationOptions,
) {
  if (
    activeBuff.type !== NFO_BUFF_TYPE.taunt
    || !Number.isFinite(options.sourceX)
    || !Number.isFinite(options.sourceY)
  ) {
    return;
  }

  activeBuff.sourceX = options.sourceX;
  activeBuff.sourceY = options.sourceY;
}

function findChargeBuffByType(
  activeBuffs: NfoSimActiveBuff[],
  buffType: number,
): NfoSimActiveBuff | undefined {
  return activeBuffs.find((activeBuff) => (
    activeBuff.type === buffType
    && activeBuff.remainingSeconds > 0
    && activeBuff.value > 0
  ));
}

function isPlayerInvincible(state: NfoSimulationState): boolean {
  return state.player.activeBuffs.some((activeBuff) => (
    activeBuff.type === NFO_BUFF_TYPE.invincible
    && activeBuff.remainingSeconds > 0
  ));
}

function consumeActiveBuffCharge(activeBuff: NfoSimActiveBuff) {
  activeBuff.value = Math.max(0, activeBuff.value - 1);
}

function filterPlayerActiveBuffs(state: NfoSimulationState) {
  state.player.activeBuffs = state.player.activeBuffs.filter(isActiveBuffRetained);
}

function isActiveBuffRetained(buff: NfoSimActiveBuff): boolean {
  if (buff.remainingSeconds <= 0) {
    return false;
  }

  if (
    (
      buff.type === NFO_BUFF_TYPE.shield
      || buff.type === NFO_BUFF_TYPE.counter
      || buff.type === NFO_BUFF_TYPE.revive
    )
    && buff.value <= 0
  ) {
    return false;
  }

  return true;
}

function createActiveBuff(
  buff: NfoBuffData,
  buffLevel: NfoBuffData["levels"][number],
  durationSeconds: number,
  maxStackCount: number,
): NfoSimActiveBuff {
  return {
    id: buff.id,
    name: buff.name,
    type: buff.type,
    duplicateType: buff.duplicateType,
    level: buffLevel.level,
    value: buffLevel.value,
    stackCount: 1,
    maxStackCount,
    remainingSeconds: durationSeconds,
    dotTickSeconds: 0,
    attributes: buffLevel.attributes.map((attribute) => ({ ...attribute })),
  };
}

function updatePlayerBuffs(
  state: NfoSimulationState,
  deltaSeconds: number,
) {
  if (deltaSeconds <= 0) {
    return;
  }

  for (const buff of state.player.activeBuffs) {
    const activeSeconds = Math.min(deltaSeconds, buff.remainingSeconds);
    if (buff.type === NFO_BUFF_TYPE.dot && activeSeconds > 0) {
      applyDotBuffTick(state.player, buff, activeSeconds);
    }
    buff.remainingSeconds = Math.max(0, buff.remainingSeconds - deltaSeconds);
  }

  filterPlayerActiveBuffs(state);
}

function updateEnemyBuffs(
  state: NfoSimulationState,
  deltaSeconds: number,
) {
  if (deltaSeconds <= 0) {
    return;
  }

  for (const enemy of state.enemies) {
    for (const buff of enemy.activeBuffs) {
      const activeSeconds = Math.min(deltaSeconds, buff.remainingSeconds);
      if (buff.type === NFO_BUFF_TYPE.dot && activeSeconds > 0) {
        applyDotBuffTick(enemy, buff, activeSeconds);
      }
      buff.remainingSeconds = Math.max(0, buff.remainingSeconds - deltaSeconds);
    }

    enemy.activeBuffs = enemy.activeBuffs.filter(isActiveBuffRetained);
  }
}

function updateMinionBuffs(
  state: NfoSimulationState,
  deltaSeconds: number,
) {
  if (deltaSeconds <= 0) {
    return;
  }

  for (const minion of state.minions) {
    for (const buff of minion.activeBuffs) {
      buff.remainingSeconds = Math.max(0, buff.remainingSeconds - deltaSeconds);
    }

    minion.activeBuffs = minion.activeBuffs.filter(isActiveBuffRetained);
  }
}

function applyDotBuffTick(
  target: { hp: number },
  buff: NfoSimActiveBuff,
  activeSeconds: number,
) {
  buff.dotTickSeconds += activeSeconds;

  while (buff.dotTickSeconds >= 1 && target.hp > 0) {
    target.hp -= Math.max(1, buff.value * buff.stackCount);
    buff.dotTickSeconds -= 1;
  }
}

function getPlayerEffectiveAttack(state: NfoSimulationState): number {
  return getPlayerSideEffectiveAttack(state, state.player.activeBuffs);
}

function getPlayerEffectiveDefense(state: NfoSimulationState): number {
  return state.player.defense + getActiveBuffAttributeValue(
    state.player.activeBuffs,
    NFO_ATTRIBUTE_TYPE.defense,
  );
}

function getPlayerEffectiveSpeed(state: NfoSimulationState): number {
  if (isActiveBuffMovementDisabled(state.player.activeBuffs)) {
    return 0;
  }

  return Math.max(
    0,
    state.player.speed + getActiveBuffAttributeValue(
      state.player.activeBuffs,
      NFO_ATTRIBUTE_TYPE.speed,
    ),
  );
}

function getPlayerEffectiveItemMagnetRange(state: NfoSimulationState): number {
  return Math.max(
    0,
    state.player.itemMagnetRange + getActiveBuffAttributeValue(
      state.player.activeBuffs,
      NFO_ATTRIBUTE_TYPE.itemMagnetRange,
    ),
  );
}

function getPlayerEffectiveBulletSpeed(state: NfoSimulationState): number {
  return getPlayerSideEffectiveBulletSpeed(state, state.player.activeBuffs);
}

function getPlayerEffectiveBulletSize(state: NfoSimulationState): number {
  return getPlayerSideEffectiveBulletSize(state, state.player.activeBuffs);
}

function getPlayerEffectiveBulletLifeTime(state: NfoSimulationState): number {
  return getPlayerSideEffectiveBulletLifeTime(state, state.player.activeBuffs);
}

function getPlayerEffectiveBulletCount(state: NfoSimulationState): number {
  return getPlayerSideEffectiveBulletCount(state, state.player.activeBuffs);
}

function getPlayerEffectiveCoolDownReduce(state: NfoSimulationState): number {
  return getPlayerSideEffectiveCoolDownReduce(state, state.player.activeBuffs);
}

function getPlayerEffectiveExpGain(state: NfoSimulationState): number {
  return state.player.expGain + getActiveBuffAttributeValue(
    state.player.activeBuffs,
    NFO_ATTRIBUTE_TYPE.expGain,
  );
}

function getPlayerEffectiveCoinGain(state: NfoSimulationState): number {
  return getActiveBuffAttributeValue(
    state.player.activeBuffs,
    NFO_ATTRIBUTE_TYPE.coinGain,
  );
}

function getPlayerEffectiveCriticalRate(state: NfoSimulationState): number {
  return getPlayerSideEffectiveCriticalRate(state, state.player.activeBuffs);
}

function getPlayerEffectiveCriticalDamage(state: NfoSimulationState): number {
  return getPlayerSideEffectiveCriticalDamage(state, state.player.activeBuffs);
}

function getPlayerSideFireSourceModifiers(
  state: NfoSimulationState,
  activeBuffs: NfoSimActiveBuff[],
): FireSourceModifierOptions {
  return {
    attackerAttack: getPlayerSideEffectiveAttack(state, activeBuffs),
    bulletCountModifier: getPlayerSideEffectiveBulletCount(state, activeBuffs),
    bulletLifeTimeModifier: getPlayerSideEffectiveBulletLifeTime(state, activeBuffs),
    bulletSizeModifier: getPlayerSideEffectiveBulletSize(state, activeBuffs),
    bulletSpeedModifier: getPlayerSideEffectiveBulletSpeed(state, activeBuffs),
    criticalDamage: getPlayerSideEffectiveCriticalDamage(state, activeBuffs),
    criticalRate: getPlayerSideEffectiveCriticalRate(state, activeBuffs),
  };
}

function getEnemyFireSourceModifiers(enemy: NfoSimEnemy): FireSourceModifierOptions {
  return {
    attackerAttack: getEnemyEffectiveAttack(enemy),
    bulletCountModifier: 0,
    bulletLifeTimeModifier: 0,
    bulletSizeModifier: 0,
    bulletSpeedModifier: 0,
    criticalDamage: 0,
    criticalRate: 0,
  };
}

function getPlayerSideEffectiveAttack(
  state: NfoSimulationState,
  activeBuffs: NfoSimActiveBuff[],
): number {
  return Math.max(
    0,
    state.player.attack + getActiveBuffAttributeValue(activeBuffs, NFO_ATTRIBUTE_TYPE.attack),
  );
}

function getPlayerSideEffectiveBulletSpeed(
  state: NfoSimulationState,
  activeBuffs: NfoSimActiveBuff[],
): number {
  return state.player.bulletSpeed
    + getActiveBuffAttributeValue(activeBuffs, NFO_ATTRIBUTE_TYPE.bulletSpeed);
}

function getPlayerSideEffectiveBulletSize(
  state: NfoSimulationState,
  activeBuffs: NfoSimActiveBuff[],
): number {
  return state.player.bulletSize
    + getActiveBuffAttributeValue(activeBuffs, NFO_ATTRIBUTE_TYPE.bulletSize);
}

function getPlayerSideEffectiveBulletLifeTime(
  state: NfoSimulationState,
  activeBuffs: NfoSimActiveBuff[],
): number {
  return state.player.bulletLifeTime
    + getActiveBuffAttributeValue(activeBuffs, NFO_ATTRIBUTE_TYPE.bulletLifeTime);
}

function getPlayerSideEffectiveBulletCount(
  state: NfoSimulationState,
  activeBuffs: NfoSimActiveBuff[],
): number {
  return state.player.bulletCount
    + getActiveBuffAttributeValue(activeBuffs, NFO_ATTRIBUTE_TYPE.bulletCount);
}

function getPlayerSideEffectiveCoolDownReduce(
  state: NfoSimulationState,
  activeBuffs: NfoSimActiveBuff[],
): number {
  return state.player.coolDownReduce
    + getActiveBuffAttributeValue(activeBuffs, NFO_ATTRIBUTE_TYPE.coolDownReduce);
}

function getPlayerSideEffectiveCriticalRate(
  state: NfoSimulationState,
  activeBuffs: NfoSimActiveBuff[],
): number {
  return state.player.criticalRate
    + getActiveBuffAttributeValue(activeBuffs, NFO_ATTRIBUTE_TYPE.criticalRate);
}

function getPlayerSideEffectiveCriticalDamage(
  state: NfoSimulationState,
  activeBuffs: NfoSimActiveBuff[],
): number {
  return state.player.criticalDamage
    + getActiveBuffAttributeValue(activeBuffs, NFO_ATTRIBUTE_TYPE.criticalDamage);
}

function getEnemyEffectiveAttack(enemy: NfoSimEnemy): number {
  return Math.max(
    0,
    enemy.attack + getActiveBuffAttributeValue(
      enemy.activeBuffs,
      NFO_ATTRIBUTE_TYPE.attack,
    ),
  );
}

function getEnemyEffectiveDefense(enemy: NfoSimEnemy): number {
  return enemy.defense + getActiveBuffAttributeValue(
    enemy.activeBuffs,
    NFO_ATTRIBUTE_TYPE.defense,
  );
}

function getEnemyEffectiveSpeed(enemy: NfoSimEnemy): number {
  if (isActiveBuffMovementDisabled(enemy.activeBuffs)) {
    return 0;
  }

  return Math.max(
    0,
    enemy.speed + getActiveBuffAttributeValue(
      enemy.activeBuffs,
      NFO_ATTRIBUTE_TYPE.speed,
    ),
  );
}

function getMinionEffectiveSpeed(minion: NfoSimMinion): number {
  if (isActiveBuffMovementDisabled(minion.activeBuffs)) {
    return 0;
  }

  return Math.max(
    0,
    minion.speed + getActiveBuffAttributeValue(
      minion.activeBuffs,
      NFO_ATTRIBUTE_TYPE.speed,
    ),
  );
}

function getActiveBuffAttributeValue(
  activeBuffs: NfoSimActiveBuff[],
  attributeType: number,
): number {
  return activeBuffs.reduce((total, buff) => {
    if (buff.remainingSeconds <= 0 || !canActiveBuffApplyAttributes(buff)) {
      return total;
    }

    const buffValue = buff.attributes.reduce((attributeTotal, attribute) => (
      attribute.attributeType === attributeType
        ? attributeTotal + attribute.value
        : attributeTotal
    ), 0);
    return total + buffValue * buff.stackCount;
  }, 0);
}

function canActiveBuffApplyAttributes(buff: NfoSimActiveBuff): boolean {
  return buff.type === NFO_BUFF_TYPE.attrChange || buff.type === NFO_BUFF_TYPE.stealth;
}

function isActiveBuffMovementDisabled(activeBuffs: NfoSimActiveBuff[]): boolean {
  return activeBuffs.some((buff) => (
    buff.type === NFO_BUFF_TYPE.stun || buff.type === NFO_BUFF_TYPE.freeze
  ));
}

function doesBulletOverlapEnemy(
  bullet: NfoSimBullet,
  enemy: NfoSimEnemy,
): boolean {
  return doesBulletOverlapCircleTarget(bullet, enemy);
}

function doesBulletOverlapCircleTarget(
  bullet: NfoSimBullet,
  target: NfoVector & { radius: number },
): boolean {
  if (bullet.colliderType === NFO_BULLET_COLLIDER_TYPE.circle) {
    return distanceBetween(bullet, target) <= bullet.radius + target.radius;
  }

  if (bullet.colliderType === NFO_BULLET_COLLIDER_TYPE.ray) {
    return isCircleTargetInsideBulletRay(bullet, target);
  }

  return isCircleTargetInsideOrientedBulletBox(bullet, target);
}

function isCircleTargetInsideBulletRay(
  bullet: NfoSimBullet,
  target: NfoVector & { radius: number },
): boolean {
  const directionX = Math.cos(bullet.angle);
  const directionY = Math.sin(bullet.angle);
  const targetX = target.x - bullet.x;
  const targetY = target.y - bullet.y;
  const projectedDistance = clamp(
    targetX * directionX + targetY * directionY,
    0,
    bullet.colliderLength,
  );
  const closestX = bullet.x + directionX * projectedDistance;
  const closestY = bullet.y + directionY * projectedDistance;
  const distanceToRay = Math.hypot(target.x - closestX, target.y - closestY);

  return distanceToRay <= bullet.colliderWidth * 0.5 + target.radius;
}

function isCircleTargetInsideOrientedBulletBox(
  bullet: NfoSimBullet,
  target: NfoVector & { radius: number },
): boolean {
  const colliderCenter = getBulletColliderCenter(bullet);
  const dx = target.x - colliderCenter.x;
  const dy = target.y - colliderCenter.y;
  const cos = Math.cos(bullet.angle);
  const sin = Math.sin(bullet.angle);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;

  return (
    Math.abs(localX) <= bullet.colliderLength * 0.5 + target.radius
    && Math.abs(localY) <= bullet.colliderWidth * 0.5 + target.radius
  );
}

function getBulletColliderCenter(bullet: NfoSimBullet): NfoVector {
  return {
    x: bullet.x + Math.cos(bullet.angle) * bullet.colliderForwardOffset,
    y: bullet.y + Math.sin(bullet.angle) * bullet.colliderForwardOffset,
  };
}

function applyBulletForce(
  state: NfoSimulationState,
  bullet: NfoSimBullet,
  enemy: NfoSimEnemy,
  deltaSeconds: number,
) {
  if (
    bullet.forceType === NFO_BULLET_FORCE_TYPE.none
    || bullet.force <= 0
    || deltaSeconds <= 0
  ) {
    return;
  }

  const direction = getBulletForceDirection(bullet, enemy);
  const forceDistance = bullet.force * LEVEL_UNIT_SIZE * deltaSeconds;
  moveEntity(
    state,
    enemy,
    direction.x * forceDistance,
    direction.y * forceDistance,
    enemy.radius,
    enemy.canFly,
  );
}

function getBulletForceDirection(
  bullet: NfoSimBullet,
  enemy: NfoSimEnemy,
): NfoVector {
  if (bullet.forceType === NFO_BULLET_FORCE_TYPE.left) {
    return { x: -1, y: 0 };
  }
  if (bullet.forceType === NFO_BULLET_FORCE_TYPE.right) {
    return { x: 1, y: 0 };
  }
  if (bullet.forceType === NFO_BULLET_FORCE_TYPE.up) {
    return { x: 0, y: -1 };
  }
  if (bullet.forceType === NFO_BULLET_FORCE_TYPE.down) {
    return { x: 0, y: 1 };
  }

  const colliderCenter = getBulletColliderCenter(bullet);
  const baseX = enemy.x - colliderCenter.x;
  const baseY = enemy.y - colliderCenter.y;
  const length = Math.hypot(baseX, baseY);
  const fallback = {
    x: Math.cos(bullet.angle),
    y: Math.sin(bullet.angle),
  };
  const outward = length > 0
    ? { x: baseX / length, y: baseY / length }
    : fallback;

  if (bullet.forceType === NFO_BULLET_FORCE_TYPE.inward) {
    return { x: -outward.x, y: -outward.y };
  }

  return outward;
}

function resolveCollisions(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  level: NfoLevelData,
  deltaSeconds: number,
) {
  for (const bullet of state.bullets) {
    const canJudgeDamage = canBulletJudgeDamage(bullet);

    if (bullet.hitTargetType === NFO_BULLET_HIT_TARGET_TYPE.friendly) {
      if (
        canJudgeDamage
        && bullet.remainingHits > 0
        && canBulletHitPlayer(bullet, state)
      ) {
        if (bullet.canDamagePlayer && bullet.dealsDamage) {
          if (!isPlayerInvincible(state)) {
            state.player.hp -= Math.max(
              1,
              bullet.damage - getPlayerEffectiveDefense(state),
            );
          }
        }
        bullet.remainingHits -= 1;
        recordBulletHitPlayer(bullet);
        applyHitBuffToPlayer(runtimeData, bullet, state);
      }
      for (const minion of state.minions) {
        if (minion.remainingSeconds <= 0 || minion.noColliding) {
          continue;
        }

        if (
          canJudgeDamage
          && bullet.remainingHits > 0
          && canBulletHitFriendlyMinion(bullet, minion)
        ) {
          bullet.remainingHits -= 1;
          recordBulletHitFriendlyMinion(bullet, minion);
          applyHitBuffToMinion(runtimeData, bullet, minion);
        }
      }
      continue;
    }

    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 || enemy.noColliding) {
        continue;
      }

      const overlaps = doesBulletOverlapEnemy(bullet, enemy);
      if (!overlaps) {
        continue;
      }

      if (
        canJudgeDamage
        && bullet.remainingHits > 0
        && canBulletHitEnemy(bullet, enemy)
      ) {
        if (bullet.dealsDamage) {
          enemy.hp -= Math.max(1, bullet.damage - getEnemyEffectiveDefense(enemy));
        }
        bullet.remainingHits -= 1;
        recordBulletHitEnemy(bullet, enemy);
        applyHitBuffToEnemy(runtimeData, bullet, enemy);
      }

      applyBulletForce(state, bullet, enemy, deltaSeconds);
    }
  }

  const defeatedEnemies = state.enemies.filter((enemy) => enemy.hp <= 0);
  for (const enemy of defeatedEnemies) {
    spawnPickupsForEnemy(state, runtimeData, enemy, level);
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  const defeated = defeatedEnemies.length;
  if (defeated > 0) {
    state.defeatedEnemies += defeated;
    state.score += defeated * 10;
  }
}

function spawnPickupsForEnemy(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  enemy: NfoSimEnemy,
  level: NfoLevelData,
) {
  const drop = getRuntimeDrop(runtimeData, enemy.dropId || level.commonDropId);
  if (!drop) {
    return;
  }

  for (const dropItem of drop.items) {
    if (dropItem.dropRate <= 0 || Math.random() * 1000 > dropItem.dropRate) {
      continue;
    }

    const item = getRuntimeItem(runtimeData, dropItem.itemId);
    if (!item) {
      continue;
    }

    const angle = Math.random() * Math.PI * 2;
    const distance = 10 + Math.random() * 28;
    const id = state.nextEntityId;
    state.nextEntityId += 1;
    state.pickups.push({
      id,
      itemId: item.id,
      name: item.name,
      itemType: item.itemType,
      value: item.value,
      canBeMagneted: item.canBeMagneted,
      x: enemy.x + Math.cos(angle) * distance,
      y: enemy.y + Math.sin(angle) * distance,
      radius: 18,
      remainingSeconds: (item.lifetimeFrames || DEFAULT_PICKUP_LIFETIME_FRAMES) / FRAME_RATE,
    });
  }
}

function updatePickups(state: NfoSimulationState, deltaSeconds: number) {
  for (const pickup of state.pickups) {
    pickup.remainingSeconds -= deltaSeconds;
  }

  state.pickups = state.pickups.filter((pickup) => pickup.remainingSeconds > 0);
}

function collectPickups(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  level: NfoLevelData,
  weapon: NfoWeaponData,
) {
  const collectRadius = Math.max(PICKUP_COLLECT_RADIUS, getPlayerEffectiveItemMagnetRange(state));
  const collectedPickupIds = new Set<number>();
  let shouldCollectMagnetedPickups = false;

  for (const pickup of state.pickups) {
    if (
      collectedPickupIds.has(pickup.id)
      || distanceBetween(pickup, state.player) > collectRadius
    ) {
      continue;
    }

    collectedPickupIds.add(pickup.id);
    shouldCollectMagnetedPickups = collectPickupEffect(
      state,
      runtimeData,
      level,
      weapon,
      pickup,
    ) || shouldCollectMagnetedPickups;
  }

  if (shouldCollectMagnetedPickups) {
    for (const pickup of state.pickups) {
      if (collectedPickupIds.has(pickup.id) || !pickup.canBeMagneted) {
        continue;
      }

      collectedPickupIds.add(pickup.id);
      collectPickupEffect(state, runtimeData, level, weapon, pickup);
    }
  }

  state.pickups = state.pickups.filter((pickup) => !collectedPickupIds.has(pickup.id));
}

function collectPickupEffect(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  level: NfoLevelData,
  weapon: NfoWeaponData,
  pickup: NfoSimPickup,
): boolean {
  state.collectedItems[pickup.itemId] = (state.collectedItems[pickup.itemId] ?? 0) + 1;
  if (pickup.itemType === NFO_ITEM_TYPE.exp) {
    const gainedExp = getModifiedExpValue(
      pickup.value,
      getPlayerEffectiveExpGain(state),
      level.playerExpRate,
    );
    state.collectedExp += gainedExp;
    addPlayerExp(state, runtimeData, weapon, gainedExp);
  } else if (pickup.itemType === NFO_ITEM_TYPE.bomb) {
    defeatEnemiesByBomb(state, runtimeData, level);
  } else if (pickup.itemType === NFO_ITEM_TYPE.magnet) {
    return true;
  } else if (pickup.itemType === NFO_ITEM_TYPE.levelUp) {
    levelUpWeapon(state, runtimeData, weapon);
  } else if (pickup.itemType === NFO_ITEM_TYPE.heal) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + pickup.value);
  } else if (pickup.itemType === NFO_ITEM_TYPE.coin) {
    state.collectedCoin += getModifiedPercentageValue(
      pickup.value,
      getPlayerEffectiveCoinGain(state),
    );
  }

  return false;
}

function defeatEnemiesByBomb(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  level: NfoLevelData,
) {
  const defeatedEnemies = state.enemies.filter((enemy) => !enemy.isBoss);
  if (defeatedEnemies.length === 0) {
    return;
  }

  for (const enemy of defeatedEnemies) {
    spawnPickupsForEnemy(state, runtimeData, enemy, level);
  }

  const defeatedIds = new Set(defeatedEnemies.map((enemy) => enemy.id));
  state.enemies = state.enemies.filter((enemy) => !defeatedIds.has(enemy.id));
  state.defeatedEnemies += defeatedEnemies.length;
  state.score += defeatedEnemies.length * 10;
}

function getModifiedExpValue(
  baseValue: number,
  expGain: number,
  levelExpRate: number,
): number {
  const expRate = levelExpRate > 0 ? levelExpRate : 100;
  return getModifiedPercentageValue(baseValue * (expRate / 100), expGain);
}

function getModifiedPercentageValue(
  baseValue: number,
  percentGain: number,
): number {
  return Math.max(0, Math.floor(baseValue * (1 + percentGain / 100)));
}

function addPlayerExp(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  weapon: NfoWeaponData,
  exp: number,
) {
  if (exp <= 0 || state.player.weaponLevel >= getMaxWeaponLevel(weapon)) {
    return;
  }

  state.player.expIntoLevel += exp;
  while (
    state.player.weaponLevel < getMaxWeaponLevel(weapon)
    && state.player.expToNextLevel > 0
    && state.player.expIntoLevel >= state.player.expToNextLevel
  ) {
    state.player.expIntoLevel -= state.player.expToNextLevel;
    levelUpWeapon(state, runtimeData, weapon);
  }
}

function levelUpWeapon(
  state: NfoSimulationState,
  runtimeData: NfoOfflineRuntimeData,
  weapon: NfoWeaponData,
) {
  const maxWeaponLevel = getMaxWeaponLevel(weapon);
  if (state.player.weaponLevel >= maxWeaponLevel) {
    state.player.expToNextLevel = 0;
    return;
  }

  state.player.weaponLevel = clampWeaponLevel(state.player.weaponLevel + 1, weapon);
  state.player.expToNextLevel = getPlayerExpToNextLevel(
    runtimeData,
    state.player.weaponLevel,
    weapon,
  );
  for (const minion of state.minions) {
    if (minion.weaponId === weapon.id) {
      minion.weaponLevel = state.player.weaponLevel;
    }
  }
  applyCurrentWeaponStatsToPlayer(state, weapon);
}

function applyCurrentWeaponStatsToPlayer(
  state: NfoSimulationState,
  weapon: NfoWeaponData,
) {
  const nextStats = applyWeaponLevelAttributeChanges(
    state.player.baseStats,
    weapon,
    state.player.weaponLevel,
  ) ?? state.player.baseStats;
  const missingHp = Math.max(0, state.player.maxHp - state.player.hp);

  state.player.maxHp = Math.max(1, nextStats.maxHp);
  state.player.hp = clamp(state.player.maxHp - missingHp, 0, state.player.maxHp);
  state.player.attack = nextStats.attack;
  state.player.defense = nextStats.defense;
  state.player.speed = nextStats.speed;
  state.player.itemMagnetRange = nextStats.itemMagnetRange;
  state.player.bulletSpeed = nextStats.bulletSpeed;
  state.player.bulletSize = nextStats.bulletSize;
  state.player.bulletLifeTime = nextStats.bulletLifeTime;
  state.player.bulletCount = nextStats.bulletCount;
  state.player.coolDownReduce = nextStats.coolDownReduce;
  state.player.expGain = nextStats.expGain;
  state.player.criticalRate = nextStats.criticalRate;
  state.player.criticalDamage = nextStats.criticalDamage;
  state.player.radius = nextStats.colliderRadius || state.player.radius;
}

function getPlayerExpToNextLevel(
  runtimeData: NfoOfflineRuntimeData,
  currentWeaponLevel: number,
  weapon: NfoWeaponData,
): number {
  if (currentWeaponLevel >= getMaxWeaponLevel(weapon)) {
    return 0;
  }

  const config = runtimeData.gameDefault.levelConfig;
  const baseExp = config.playerExpStart > 0 ? config.playerExpStart : 50;
  const expAddPerLevel = config.playerExpAddPerLevel > 0 ? config.playerExpAddPerLevel : 50;
  return Math.max(1, Math.floor(baseExp + (currentWeaponLevel - 1) * expAddPerLevel));
}

function getMaxWeaponLevel(weapon: NfoWeaponData): number {
  const maxLevelFromData = weapon.levels.reduce((maxLevel, level) => (
    level.level > maxLevel ? level.level : maxLevel
  ), 1);
  return Math.max(1, weapon.maxLevel, maxLevelFromData);
}

function clampWeaponLevel(level: number, weapon: NfoWeaponData): number {
  return clamp(Math.floor(level), 1, getMaxWeaponLevel(weapon));
}

function updateStatus(state: NfoSimulationState, level: NfoLevelData) {
  if (state.player.hp <= 0) {
    if (tryConsumePlayerRevive(state)) {
      return;
    }

    state.status = "failed";
    state.player.hp = 0;
    return;
  }

  if (shouldApplyLevelClear(state, level)) {
    applyNfoClearSettlement(state, level.clearCoin);
  }
}

function shouldApplyLevelClear(
  state: NfoSimulationState,
  level: NfoLevelData,
): boolean {
  if (level.totalFrames <= 0 || state.frame < level.totalFrames) {
    return false;
  }

  const clearEnemyEventIds = getLevelClearEnemyEventIds(level);
  if (clearEnemyEventIds.length > 0) {
    return clearEnemyEventIds.every((eventId) => (
      hasSpawnedAndClearedEnemyEvent(state, eventId)
    ));
  }

  return shouldApplyTimedLevelClear(level);
}

function getLevelClearEnemyEventIds(level: NfoLevelData): number[] {
  return [
    level.clearEnemyEventId,
    ...(level.clearMinorEnemyEventIds ?? []),
  ].filter((eventId, index, eventIds) => (
    eventId > 0 && eventIds.indexOf(eventId) === index
  ));
}

function hasSpawnedAndClearedEnemyEvent(
  state: NfoSimulationState,
  eventId: number,
): boolean {
  if ((state.spawnedEnemyEventCountsById[eventId] ?? 0) <= 0) {
    return false;
  }

  return !state.enemies.some((enemy) => (
    (enemy.spawnEventId ?? 0) === eventId
    && enemy.hp > 0
  ));
}

function shouldApplyTimedLevelClear(level: NfoLevelData): boolean {
  if (level.totalFrames <= 0) {
    return false;
  }

  return (
    level.clearType === NFO_LEVEL_CLEAR_TYPE.defaultTimed
    || level.clearType === NFO_LEVEL_CLEAR_TYPE.timed
  );
}

function applyNfoClearSettlement(
  state: NfoSimulationState,
  clearCoin: number,
) {
  state.status = "cleared";
  state.collectedCoin += Math.max(0, Math.floor(clearCoin));
}

function tryConsumePlayerRevive(state: NfoSimulationState): boolean {
  const reviveBuff = findChargeBuffByType(
    state.player.activeBuffs,
    NFO_BUFF_TYPE.revive,
  );
  if (!reviveBuff) {
    return false;
  }

  consumeActiveBuffCharge(reviveBuff);
  state.player.hp = Math.max(1, state.player.maxHp);
  state.player.damageCooldownSeconds = PLAYER_DAMAGE_COOLDOWN_SECONDS;
  filterPlayerActiveBuffs(state);
  return true;
}

function findNearestEnemy(
  state: NfoSimulationState,
  origin: NfoVector = state.player,
): NfoSimEnemy | null {
  let nearest: NfoSimEnemy | null = null;
  let nearestDistance = Infinity;

  for (const enemy of state.enemies) {
    const distance = distanceBetween(enemy, origin);
    if (distance < nearestDistance) {
      nearest = enemy;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function buildLevelTerrain(map: NfoMapData | null): NfoSimulationTerrain {
  const pitTiles: NfoSimTerrainTile[] = [];
  const pitTileKeys: Record<string, true> = {};

  for (const point of map?.terrainPits ?? []) {
    const key = terrainTileKey(point.x, point.y);
    if (pitTileKeys[key]) {
      continue;
    }

    pitTileKeys[key] = true;
    pitTiles.push({
      kind: "pit",
      tileX: point.x,
      tileY: point.y,
      x: point.x * LEVEL_UNIT_SIZE,
      y: point.y * LEVEL_UNIT_SIZE,
      size: LEVEL_UNIT_SIZE,
    });
  }

  return { pitTiles, pitTileKeys };
}

function getPaidCharacterGlobalUpgrades(
  runtimeData: NfoOfflineRuntimeData,
  characterId: number,
  paidGlobalUpgradeIds: number[],
): NfoGlobalUpgradeData[] {
  return paidGlobalUpgradeIds
    .map((upgradeId) => getRuntimeGlobalUpgrade(runtimeData, upgradeId))
    .filter((upgrade): upgrade is NfoGlobalUpgradeData => (
      upgrade !== null && upgrade.characterId === characterId
    ));
}

function applyCharacterBuildStats(
  stats: NfoEntityStats | null,
  upgrades: NfoGlobalUpgradeData[],
  equips: NfoEquipData[],
): NfoEntityStats | null {
  if (!stats) {
    return null;
  }

  const next = { ...stats };
  for (const upgrade of upgrades) {
    for (const attribute of upgrade.attributes) {
      applyAttributeToStats(next, attribute);
    }
  }

  for (const equip of equips) {
    const equipLevel = pickLevelStats(equip.levels, 1);
    for (const attribute of equipLevel?.attributes ?? []) {
      applyAttributeToStats(next, attribute);
    }
  }

  return next;
}

function normalizeEntityStats(
  stats: NfoEntityStats | null,
  fallbackColliderRadius: number,
): NfoEntityStats {
  return {
    level: stats?.level ?? 1,
    maxHp: stats?.maxHp ?? 20,
    attack: stats?.attack ?? 0,
    defense: stats?.defense ?? 0,
    speed: stats?.speed ?? 420,
    itemMagnetRange: stats?.itemMagnetRange ?? PICKUP_COLLECT_RADIUS,
    bulletSpeed: stats?.bulletSpeed ?? 0,
    bulletSize: stats?.bulletSize ?? 0,
    bulletLifeTime: stats?.bulletLifeTime ?? 0,
    bulletCount: stats?.bulletCount ?? 0,
    coolDownReduce: stats?.coolDownReduce ?? 0,
    expGain: stats?.expGain ?? 0,
    criticalRate: stats?.criticalRate ?? 0,
    criticalDamage: stats?.criticalDamage ?? 150,
    colliderRadius: (stats?.colliderRadius ?? fallbackColliderRadius) || 40,
  };
}

function applyWeaponLevelAttributeChanges(
  stats: NfoEntityStats | null,
  weapon: NfoWeaponData,
  weaponLevel: number,
): NfoEntityStats | null {
  if (!stats) {
    return null;
  }

  const next = { ...stats };
  const pickedWeaponLevel = pickLevelStats(weapon.levels, weaponLevel);
  for (const attribute of pickedWeaponLevel?.attributeChanges ?? []) {
    applyAttributeToStats(next, attribute);
  }
  return next;
}

function applyAttributeToStats(
  stats: NfoEntityStats,
  attribute: NfoAttributeData,
) {
  if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.hp) {
    stats.maxHp += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.maxHp) {
    stats.maxHp += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.attack) {
    stats.attack += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.defense) {
    stats.defense += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.speed) {
    stats.speed += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.itemMagnetRange) {
    stats.itemMagnetRange += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.bulletSpeed) {
    stats.bulletSpeed += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.bulletSize) {
    stats.bulletSize += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.bulletLifeTime) {
    stats.bulletLifeTime += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.bulletCount) {
    stats.bulletCount += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.coolDownReduce) {
    stats.coolDownReduce += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.expGain) {
    stats.expGain += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.criticalRate) {
    stats.criticalRate += attribute.value;
  } else if (attribute.attributeType === NFO_ATTRIBUTE_TYPE.criticalDamage) {
    stats.criticalDamage += attribute.value;
  }
}

function getInitialWeaponLevel(upgrades: NfoGlobalUpgradeData[]): number {
  return upgrades.reduce((level, upgrade) => (
    upgrade.initialWeaponLevelReplace > level ? upgrade.initialWeaponLevelReplace : level
  ), 1);
}

function moveEntity(
  state: NfoSimulationState,
  entity: NfoVector,
  moveX: number,
  moveY: number,
  radius: number,
  canFly: boolean,
) {
  const nextX = clamp(
    entity.x + moveX,
    state.worldBounds.minX + radius,
    state.worldBounds.maxX - radius,
  );
  if (canOccupyTerrain(state, nextX, entity.y, radius, canFly)) {
    entity.x = nextX;
  }

  const nextY = clamp(
    entity.y + moveY,
    state.worldBounds.minY + radius,
    state.worldBounds.maxY - radius,
  );
  if (canOccupyTerrain(state, entity.x, nextY, radius, canFly)) {
    entity.y = nextY;
  }
}

function canOccupyTerrain(
  state: NfoSimulationState,
  x: number,
  y: number,
  radius: number,
  canFly: boolean,
): boolean {
  if (canFly || state.terrain.pitTiles.length === 0) {
    return true;
  }

  const sampleDistance = radius * TERRAIN_COLLISION_SAMPLE_RATIO;
  return ![
    [x, y],
    [x - sampleDistance, y],
    [x + sampleDistance, y],
    [x, y - sampleDistance],
    [x, y + sampleDistance],
  ].some(([sampleX, sampleY]) => isPitTileAtWorldPosition(state, sampleX, sampleY));
}

function isPitTileAtWorldPosition(
  state: NfoSimulationState,
  x: number,
  y: number,
): boolean {
  const tileX = Math.floor(x / LEVEL_UNIT_SIZE);
  const tileY = Math.floor(y / LEVEL_UNIT_SIZE);
  return state.terrain.pitTileKeys[terrainTileKey(tileX, tileY)] === true;
}

function terrainTileKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}

function distanceBetween(a: NfoVector, b: NfoVector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
