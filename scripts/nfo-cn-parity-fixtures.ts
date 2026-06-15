import type {
  NfoActiveSkillSpawnMinionEvent,
  NfoAttributeData,
  NfoBulletShooterData,
  NfoBulletShooterTimelineEvent,
  NfoOfflineRuntimeData,
} from "../src/lib/nfo-offline-runtime";

export const NFO_CN_PARITY_FIXTURE_PATH =
  "temp/nfo-offline/cn/Android-2.1.1/runtime-data/cn-parity-fixtures.json";

type DirectionMode =
  | "formation-offset-radial"
  | "radial-ring"
  | "nearest-enemy"
  | "friendly-target"
  | "owner-forward";
type ProjectileMotionMode = "linear" | "homingEnemy" | "playerOrbit";

type ShooterCaseSpec = {
  id: string;
  shooterId: number;
  bulletTypeId: number;
  expectedDirectionMode: DirectionMode;
};

type WeaponShooterCaseSpec = {
  id: string;
  weaponId: number;
  weaponLevel: number;
  shooterId: number;
  bulletTypeId: number;
  expectedDirectionMode: DirectionMode;
  expectedEventFrame?: number;
  expectedIsLoopEvent?: boolean;
  expectedLoopFrameInterval?: number;
  expectedDirectionOffsetAngle?: number;
  expectedHitTargetType?: number;
  expectedNoDamage?: boolean;
  expectedHitBuffId?: number;
};

type WeaponDirectFireCaseSpec = {
  id: string;
  weaponId: number;
  weaponLevel: number;
  bulletTypeId: number;
  fireBulletIndex?: number;
  expectedRequiresEnemyTarget?: boolean;
  expectedDirectFireBulletCount?: number;
  expectedWeaponGroupCount?: number;
  expectedWeaponFireGroupCooldownFrames?: number;
  expectedBulletSpeed?: number;
  expectedDamageJudgeType?: number;
  expectedColliderType?: number;
  expectedHitBuffId?: number;
  expectedForceType?: number;
  expectedForce?: number;
  expectedMotionMode?: ProjectileMotionMode;
  expectedWeaponDescriptionIncludes?: string;
};

type WeaponMinionCaseSpec = {
  id: string;
  weaponId: number;
  weaponLevel: number;
  expectedMinionId: number;
  expectedMinionCount: number;
  expectedBulletTypeId?: number;
  expectedSpawnMinionAITypeId?: number;
  expectedSpawnMinionFormation?: number;
  expectedSpawnRadiusMin?: number;
  expectedSpawnRadiusMax?: number;
  expectedAIStateShooterId?: number;
  expectedAIStateShooterBulletTypeId?: number;
  expectedAIStateShooterBulletSize?: number;
  expectedAIStateShooterHitBuffId?: number;
  expectedBulletDamageJudgeType?: number;
  expectedBulletColliderType?: number;
  expectedBulletDamageJudgeDelayFrames?: number;
  expectedBulletDamageJudgeCooldownFrames?: number;
  expectedHitBuffId?: number;
};

type WeaponSelfBuffCaseSpec = {
  id: string;
  weaponId: number;
  weaponLevel: number;
  expectedSelfBuffId: number;
  expectedSelfBuffLevel: number;
  expectedBuffType: number;
  expectedAttributes: Array<{
    attributeType: number;
    value: number;
  }>;
  expectedBuffFireBulletTypeId?: number;
  expectedBuffFireBulletAttack?: number;
  expectedBuffFireBulletSpeed?: number;
  expectedBuffFireBulletSize?: number;
  expectedBuffFireBulletLifeTimeFrames?: number;
  expectedBuffFireBulletHitTimes?: number;
  expectedBuffFireBulletDamageJudgeDelayFrames?: number;
  expectedBuffFireBulletDamageJudgeCooldownFrames?: number;
};

type ShooterRotationCaseSpec = {
  id: string;
  shooterId: number;
  bulletTypeId: number;
  expectedDirectionMode: DirectionMode;
  expectedRotationType: number;
};

type ShooterOnDestroyCaseSpec = {
  id: string;
  shooterId: number;
  parentBulletTypeId: number;
  expectedOnDestroyEventBulletId: number;
  expectedChildBulletTypeId: number;
};

type ActiveSkillShooterSpawnCaseSpec = {
  id: string;
  activeSkillId: number;
  activeSkillLevel: number;
  expectedEventFrame: number;
  expectedShooterId: number;
  expectedSpawnPos: number;
  expectedBulletTypeId: number;
  expectedShooterBehaviorType?: number;
  expectedShooterFollowsOwnerDirection?: boolean;
  expectedIsLoopEvent?: boolean;
  expectedLoopFrameInterval?: number;
};

type ActiveSkillShooterHitBuffCaseSpec = {
  id: string;
  activeSkillId: number;
  activeSkillLevel: number;
  expectedEventFrame: number;
  expectedShooterId: number;
  expectedBulletTypeId: number;
  expectedHitBuffId: number;
  expectedBuffType: number;
  expectedDamageJudgeDelayFrames?: number;
  expectedHitTargetType?: number;
  expectedNoDamage?: boolean;
};

type AIActionCaseSpec = {
  id: string;
  aiTypeId: number;
  expectedShooterId: number;
  expectedShooterBulletTypeId?: number;
  expectedShooterDirectionType?: number;
  expectedShooterRotationType?: number;
  expectedShooterEventCount?: number;
  expectedShooterLastEventFrame?: number;
};

type AIStateTimelineCaseSpec = {
  id: string;
  aiTypeId: number;
  stateId: number;
  expectedFireFrame: number;
  expectedBulletTypeId: number;
  expectedColliderType?: number;
  expectedDamageJudgeType?: number;
};

type AIStateFireAllWeaponCaseSpec = {
  id: string;
  aiTypeId: number;
  stateId: number;
  expectedFireFrame: number;
  expectedMinionId: number;
  expectedWeaponId: number;
  expectedWeaponLevel: number;
  expectedBulletTypeId: number;
};

type AIStateShooterSpawnCaseSpec = {
  id: string;
  aiTypeId: number;
  stateId: number;
  expectedShooterId: number;
  expectedSpawnPos: number;
  expectedBulletTypeId: number;
};

type AIStateNoCollidingCaseSpec = {
  id: string;
  aiTypeId: number;
  stateId: number;
  expectedNoCollidingFrame: number;
};

type AIStateTeleportCaseSpec = {
  id: string;
  aiTypeId: number;
  stateId: number;
  expectedStateType: number;
  expectedTeleportFrame: number;
  expectedFireFrame: number;
  expectedNormalFrame: number;
  expectedNextStateId: number;
  expectedBulletTypeId: number;
};

type AIStateMovementCaseSpec = {
  id: string;
  aiTypeId: number;
  stateId: number;
  expectedStateType: number;
  expectedNextStateId: number;
  expectedFallbackNextStateId?: number;
  expectedFallbackNextStateProbability?: number;
  expectedStateMoveSpeed?: number;
  expectedIsFireBullet?: boolean;
  expectedFireBulletCount?: number;
  expectedBulletTypeId?: number;
  expectedTriggerLevelEventId?: number;
};

type AIStateBuffCaseSpec = {
  id: string;
  aiTypeId: number;
  stateId: number;
  expectedBuffId: number;
  expectedBuffLevel: number;
  expectedBuffType: number;
  expectedBuffDurationFrames: number;
  expectedAttributeType: number;
  expectedAttributeValue: number;
};

type AIStateCommonStateCaseSpec = {
  id: string;
  aiTypeId: number;
  stateId: number;
  expectedChangesEntityCommonState: boolean;
  expectedEntityCommonStateChangeTo: number;
};

type AIStateAnimationCaseSpec = {
  id: string;
  aiTypeId: number;
  stateId: number;
  expectedPlayAnimeName: string;
  expectedRestartsAnimation: boolean;
  expectedTimelineEventFrame?: number;
  expectedTimelinePlayAnimeName?: string;
};

type LevelAIStateChangeCaseSpec = {
  id: string;
  levelId: number;
  eventIndex: number;
  targetSpawnEventIndex: number;
  expectedStartFrame: number;
  expectedTotalFrames: number;
  expectedTargetEnemyEventId: number;
  expectedTargetAIStateId: number;
  expectedTargetEnemyTypeId: number;
  expectedTargetEnemyAITypeId: number;
};

type ActiveSkillBuffCaseSpec = {
  id: string;
  activeSkillId: number;
  activeSkillLevel: number;
  expectedEventFrame: number;
  expectedBuffIds: number[];
};

type ActiveSkillSummonCaseSpec = {
  id: string;
  activeSkillId: number;
  activeSkillLevel: number;
  expectedEventIndex?: number;
  expectedEventFrame: number;
  expectedShooterId?: number;
  expectedShooterBulletTypeId?: number;
  expectedMinionId: number;
  expectedMinionAITypeId?: number;
  expectedSpawnFormation: number;
  expectedSpawnCount: number;
  expectedSpawnCenterOffsetX?: number;
  expectedSpawnCenterOffsetY?: number;
  expectedSpawnRadiusMin?: number;
  expectedSpawnRadiusMax?: number;
  expectedSameFrameSpawnMinionEventCount?: number;
  expectedMinionAIStateType?: number;
  expectedMinionAIStateShooterId?: number;
  expectedMinionAIStateShooterBulletTypeId?: number;
  expectedMinionAINextStateId?: number;
  expectedMinionAINextStateShooterId?: number;
  expectedMinionAINextStateShooterBulletTypeId?: number;
};

type ItemCaseSpec = {
  id: string;
  itemId: number;
  expectedItemType: number;
  expectedValue: number;
  expectedLifetimeFrames: number;
  expectedCanBeMagneted: boolean;
};

type DropCaseSpec = {
  id: string;
  dropId: number;
  expectedDropName: string;
  expectedItems: Array<{
    itemId: number;
    dropRate: number;
    itemType: number;
    value: number;
    lifetimeFrames: number;
    canBeMagneted: boolean;
  }>;
};

type LevelEnemySpawnCaseSpec = {
  id: string;
  levelId: number;
  eventIndex: number;
  expectedLevelName: string;
  expectedCommonDropId: number;
  expectedEventName: string;
  expectedStartFrame: number;
  expectedTotalFrames: number;
  expectedEnemyTypeId: number;
  expectedEnemyLevel: number;
  expectedEnemyAiTypeId: number;
  expectedSpawnType: number;
  expectedSpawnCenterType: number;
  expectedSpawnWaveCount: number;
  expectedSpawnWaveIntervalFrames: number;
  expectedSpawnRangeMin: number;
  expectedSpawnRangeMax: number;
  expectedSpawnCenterOffsetX: number;
  expectedSpawnCenterOffsetY: number;
  expectedDropId: number;
  expectedProgramControl: boolean;
  expectedEnemyMaxHp: number;
  expectedEnemyAttack: number;
  expectedEnemyDefense: number;
  expectedEnemySpeed: number;
  expectedEnemyColliderRadius: number;
};

type LevelEventTriggerCaseSpec = {
  id: string;
  levelId: number;
  expectedLevelName: string;
  expectedTriggerType: number;
  expectedTriggerEnemyEventId: number;
  expectedTriggeredEventCount: number;
  expectedFirstEventIndex: number;
  expectedFirstEventName: string;
  expectedFirstEventId: number;
  expectedFirstEventStartFrame: number;
  expectedFirstEnemyTypeId: number;
  expectedLastEventIndex: number;
  expectedLastEventName: string;
  expectedLastEventId: number;
  expectedLastEventStartFrame: number;
  expectedLastEnemyTypeId: number;
};

type LevelClearCaseSpec = {
  id: string;
  levelId: number;
  expectedClearType: number;
  expectedTotalFrames: number;
  expectedClearCoin: number;
  expectedClearEnemyEventId: number;
  expectedClearMinorEnemyEventIds: number[];
  expectedClearUnlockLevelIds: number[];
  expectedClearUnlockWeaponIds: number[];
  expectedClearUnlockEquipIds: number[];
  expectedClearUnlockCharacterIds: number[];
  expectedPostTotalFrameEnemyEventCount: number;
  expectedEarliestPostTotalFrameEnemyEventStartFrame: number;
  expectedClearEnemySpawnEventCount: number;
  expectedEarliestClearEnemySpawnStartFrame: number;
  expectedClearMinorEnemySpawnEventCount: number;
  expectedEarliestClearMinorEnemySpawnStartFrame: number;
};

type MapCaseSpec = {
  id: string;
  mapPrefabName: string;
  expectedLevelId: number;
  expectedPitCount: number;
  expectedTerrainLayerTileCount: number;
};

export type NfoCnParityShooterCase = {
  id: string;
  shooterId: number;
  shooterName: string;
  shooterLifeTimeFrames: number;
  eventIndex: number;
  eventName: string;
  eventFrame: number;
  spawnPos: number;
  directionType: number;
  rotationType: number;
  formationType: number;
  formationOffsetX: number;
  formationOffsetY: number;
  directionOffsetAngle: number;
  isLoopEvent: boolean;
  loopFrameInterval: number;
  bulletTypeId: number;
  bulletCount: number;
  bulletSpeed: number;
  noDamage: boolean;
  expectedDirectionMode: DirectionMode;
};

export type NfoCnParityWeaponShooterCase = {
  id: string;
  weaponId: number;
  weaponName: string;
  weaponLevel: number;
  weaponFireCooldownFrames: number;
  weaponDirectFireBulletCount: number;
  shooterId: number;
  shooterName: string;
  shooterLifeTimeFrames: number;
  shooterBehaviorType: number;
  shooterFollowsOwnerDirection: boolean;
  eventIndex: number;
  eventName: string;
  eventFrame: number;
  isLoopEvent: boolean;
  loopFrameInterval: number;
  directionType: number;
  formationType: number;
  formationParam1: number;
  formationOffsetX: number;
  formationOffsetY: number;
  directionOffsetAngle: number;
  bulletTypeId: number;
  bulletCount: number;
  bulletSpeed: number;
  bulletSize: number;
  bulletLifeTimeFrames: number;
  bulletHitTimes: number;
  bulletAttack: number;
  bulletNoDamage: boolean;
  bulletDamageJudgeType: number;
  bulletDamageJudgeDelayFrames: number;
  bulletDamageJudgeCooldownFrames: number;
  bulletHitTargetType: number;
  bulletColliderType: number;
  hitBuffId: number;
  hitBuffLevel: number;
  expectedDirectionMode: DirectionMode;
};

export type NfoCnParityWeaponDirectFireCase = {
  id: string;
  weaponId: number;
  weaponName: string;
  weaponDescription: string;
  weaponLevel: number;
  fireBulletIndex: number;
  requiresEnemyTarget: boolean;
  weaponFireCooldownFrames: number;
  weaponFireGroupCooldownFrames: number;
  weaponGroupCount: number;
  weaponDirectFireBulletCount: number;
  bulletTypeId: number;
  bulletCount: number;
  bulletAttack: number;
  bulletSpeed: number;
  bulletNoDamage: boolean;
  bulletDamageJudgeType: number;
  bulletHitTargetType: number;
  bulletSize: number;
  bulletSize2: number;
  bulletLifeTimeFrames: number;
  bulletHitTimes: number;
  bulletDamageJudgeDelayFrames: number;
  bulletDamageJudgeCooldownFrames: number;
  bulletColliderType: number;
  bulletForceType: number;
  bulletForce: number;
  hitBuffId: number;
  hitBuffLevel: number;
  motionMode: ProjectileMotionMode;
};

export type NfoCnParityWeaponMinionCase = {
  id: string;
  weaponId: number;
  weaponName: string;
  weaponLevel: number;
  weaponType: number;
  weaponMinionId: number;
  minionId: number;
  minionName: string;
  minionAITypeId: number;
  weaponFireCooldownFrames: number;
  minionCount: number;
  spawnMinionId: number;
  spawnMinionAITypeId: number;
  spawnMinionCount: number;
  spawnMinionFormation: number;
  spawnRadiusMin: number;
  spawnRadiusMax: number;
  aiStateShooterId: number;
  aiStateName: string;
  aiShooterBulletTypeId: number;
  aiShooterBulletSize: number;
  aiShooterBulletNoDamage: boolean;
  aiShooterBulletHitBuffId: number;
  aiShooterBulletHitBuffLevel: number;
  directFireBulletCount: number;
  bulletTypeId: number;
  bulletAttack: number;
  bulletSpeed: number;
  bulletSize: number;
  bulletLifeTimeFrames: number;
  bulletHitTimes: number;
  bulletDamageJudgeType: number;
  bulletColliderType: number;
  bulletDamageJudgeDelayFrames: number;
  bulletDamageJudgeCooldownFrames: number;
  bulletHitTargetType: number;
  hitBuffId: number;
  hitBuffLevel: number;
};

export type NfoCnParityWeaponSelfBuffCase = {
  id: string;
  weaponId: number;
  weaponName: string;
  weaponLevel: number;
  weaponFireCooldownFrames: number;
  selfBuffId: number;
  selfBuffLevel: number;
  buffId: number;
  buffName: string;
  buffType: number;
  buffDuplicateType: number;
  buffDurationFrames: number;
  buffValue: number;
  buffMaxStackCount: number;
  buffAttributes: NfoAttributeData[];
  buffFireBulletTypeId: number;
  buffFireBulletAttack: number;
  buffFireBulletSpeed: number;
  buffFireBulletSize: number;
  buffFireBulletLifeTimeFrames: number;
  buffFireBulletHitTimes: number;
  buffFireBulletDamageJudgeDelayFrames: number;
  buffFireBulletDamageJudgeCooldownFrames: number;
};

export type NfoCnParityShooterRotationCase = {
  id: string;
  shooterId: number;
  shooterName: string;
  eventIndex: number;
  eventName: string;
  eventFrame: number;
  directionType: number;
  rotationType: number;
  bulletDataRotationType: number;
  bulletTypeId: number;
  bulletHitTargetType: number;
  bulletSpeed: number;
  bulletColliderType: number;
  expectedDirectionMode: DirectionMode;
  expectedRotationType: number;
};

export type NfoCnParityShooterOnDestroyCase = {
  id: string;
  shooterId: number;
  shooterName: string;
  eventIndex: number;
  eventName: string;
  eventFrame: number;
  directionType: number;
  formationOffsetX: number;
  formationOffsetY: number;
  parentBulletTypeId: number;
  parentBulletNoDamage: boolean;
  parentBulletSpeed: number;
  parentBulletAttack: number;
  parentBulletHitTargetType: number;
  parentBulletLifeTimeFrames: number;
  parentOnDestroyEventBulletId: number;
  childBulletTypeId: number;
  childEventBulletId: number;
  childBulletNoDamage: boolean;
  childBulletCount: number;
  childBulletAttack: number;
  childBulletSpeed: number;
  childBulletSize: number;
  childBulletHitTargetType: number;
  childBulletLifeTimeFrames: number;
  childBulletForceType: number;
  childBulletForce: number;
  childBulletHitTimes: number;
};

export type NfoCnParityActiveSkillShooterSpawnCase = {
  id: string;
  activeSkillId: number;
  activeSkillName: string;
  activeSkillLevel: number;
  eventIndex: number;
  eventName: string;
  eventFrame: number;
  shooterId: number;
  shooterName: string;
  shooterSpawnPos: number;
  shooterLifeTimeFrames: number;
  shooterBehaviorType: number;
  shooterFollowsOwnerDirection: boolean;
  shooterEventFrame: number;
  isLoopEvent: boolean;
  loopFrameInterval: number;
  directionType: number;
  formationType: number;
  formationOffsetX: number;
  formationOffsetY: number;
  bulletTypeId: number;
  bulletCount: number;
  bulletSpeed: number;
  bulletAttack: number;
  bulletNoDamage: boolean;
  bulletLifeTimeFrames: number;
  bulletHitTargetType: number;
  bulletDamageJudgeType: number;
  bulletColliderType: number;
  bulletHitTimes: number;
  bulletForceType: number;
  bulletForce: number;
};

export type NfoCnParityActiveSkillShooterHitBuffCase = {
  id: string;
  activeSkillId: number;
  activeSkillName: string;
  activeSkillLevel: number;
  eventIndex: number;
  eventName: string;
  eventFrame: number;
  shooterId: number;
  shooterName: string;
  shooterSpawnPos: number;
  shooterLifeTimeFrames: number;
  shooterEventFrame: number;
  directionType: number;
  bulletTypeId: number;
  bulletNoDamage: boolean;
  bulletHitTargetType: number;
  bulletDamageJudgeType: number;
  bulletDamageJudgeDelayFrames: number;
  bulletColliderType: number;
  bulletSize: number;
  bulletSize2: number;
  bulletHitTimes: number;
  hitBuffId: number;
  hitBuffLevel: number;
  buffName: string;
  buffType: number;
  buffDurationFrames: number;
  buffValue: number;
};

export type NfoCnParityAIActionShooterEvent = {
  eventIndex: number;
  eventName: string;
  eventFrame: number;
  directionType: number;
  rotationType: number;
  formationOffsetX: number;
  formationOffsetY: number;
  directionOffsetAngle: number;
  bulletTypeId: number;
  bulletCount: number;
  bulletSpeed: number;
  bulletHitTargetType: number;
};

export type NfoCnParityAIActionCase = {
  id: string;
  aiTypeId: number;
  aiName: string;
  firstStateId: number;
  firstStateLastFrame: number;
  firstStateNextStateId: number;
  firstStateNextProbability: number;
  stateId: number;
  stateName: string;
  stateType: number;
  lastFrame: number;
  bulletFireCooldownFrames: number;
  fireBulletCount: number;
  shooterId: number;
  shooterName: string;
  shooterEventCount: number;
  shooterLastEventFrame: number;
  shooterEventIndex: number;
  shooterEventName: string;
  shooterEventFrame: number;
  shooterDirectionType: number;
  shooterRotationType: number;
  shooterFormationOffsetX: number;
  shooterFormationOffsetY: number;
  shooterDirectionOffsetAngle: number;
  shooterBulletTypeId: number;
  shooterBulletDataRotationType: number;
  shooterBulletCount: number;
  shooterBulletSpeed: number;
  shooterBulletHitTargetType: number;
  shooterEvents: NfoCnParityAIActionShooterEvent[];
};

export type NfoCnParityAIStateTimelineCase = {
  id: string;
  aiTypeId: number;
  aiName: string;
  stateId: number;
  stateName: string;
  stateLastFrame: number;
  fireEventFrame: number;
  fireEventName: string;
  fireBulletNow: boolean;
  fireAllWeaponNow: boolean;
  fireBulletCount: number;
  bulletTypeId: number;
  bulletAttack: number;
  bulletDamageJudgeType: number;
  bulletHitTargetType: number;
  bulletColliderType: number;
  bulletSize: number;
  bulletSize2: number;
  bulletHitTimes: number;
  bulletDamageJudgeCooldownFrames: number;
};

export type NfoCnParityAIStateFireAllWeaponCase = {
  id: string;
  aiTypeId: number;
  aiName: string;
  stateId: number;
  stateName: string;
  stateLastFrame: number;
  fireEventFrame: number;
  fireEventName: string;
  fireBulletNow: boolean;
  fireAllWeaponNow: boolean;
  stateFireBulletCount: number;
  stateShooterId: number;
  minionId: number;
  minionName: string;
  minionAITypeId: number;
  weaponId: number;
  weaponName: string;
  weaponLevel: number;
  weaponFireCooldownFrames: number;
  weaponDirectFireBulletCount: number;
  bulletTypeId: number;
  bulletHitTargetType: number;
};

export type NfoCnParityAIStateShooterSpawnCase = {
  id: string;
  aiTypeId: number;
  aiName: string;
  stateId: number;
  stateName: string;
  stateType: number;
  stateLastFrame: number;
  shooterId: number;
  shooterName: string;
  shooterSpawnPos: number;
  shooterLifeTimeFrames: number;
  eventIndex: number;
  eventName: string;
  eventFrame: number;
  directionType: number;
  bulletTypeId: number;
  bulletHitTargetType: number;
  bulletDamageJudgeDelayFrames: number;
};

export type NfoCnParityAIStateNoCollidingCase = {
  id: string;
  aiTypeId: number;
  aiName: string;
  stateId: number;
  stateName: string;
  stateLastFrame: number;
  noCollidingEventFrame: number;
  noCollidingEventName: string;
  noColliding: boolean;
  fireBulletNow: boolean;
};

export type NfoCnParityAIStateTeleportCase = {
  id: string;
  aiTypeId: number;
  aiName: string;
  stateId: number;
  stateName: string;
  stateType: number;
  stateLastFrame: number;
  teleportEventFrame: number;
  teleportEventName: string;
  fireEventFrame: number;
  fireBulletNow: boolean;
  normalEventFrame: number;
  normalEventName: string;
  nextStateId: number;
  bulletTypeId: number;
  bulletHitTargetType: number;
  bulletCount: number;
};

export type NfoCnParityAIStateMovementCase = {
  id: string;
  aiTypeId: number;
  aiName: string;
  stateId: number;
  stateName: string;
  stateType: number;
  stateLastFrame: number;
  stateMoveSpeed: number;
  stateMoveSpeedRandomMax: number;
  stateMoveOffsetX: number;
  stateMoveOffsetY: number;
  syncDirectionFromTarget: boolean;
  triggerLevelEventId: number;
  isFireBullet: boolean;
  nextStateId: number;
  nextStateProbability: number;
  fallbackNextStateId: number;
  fallbackNextStateProbability: number;
  fireBulletCount: number;
  bulletTypeId: number;
  bulletHitTargetType: number;
};

export type NfoCnParityAIStateBuffCase = {
  id: string;
  aiTypeId: number;
  aiName: string;
  stateId: number;
  stateName: string;
  stateType: number;
  stateLastFrame: number;
  buffId: number;
  buffLevel: number;
  buffName: string;
  buffType: number;
  buffValue: number;
  buffDurationFrames: number;
  buffMaxStackCount: number;
  buffAttributes: NfoAttributeData[];
};

export type NfoCnParityAIStateCommonStateCase = {
  id: string;
  aiTypeId: number;
  aiName: string;
  stateId: number;
  stateName: string;
  stateType: number;
  stateLastFrame: number;
  changesEntityCommonState: boolean;
  entityCommonStateChangeTo: number;
};

export type NfoCnParityAIStateAnimationCase = {
  id: string;
  aiTypeId: number;
  aiName: string;
  stateId: number;
  stateName: string;
  stateType: number;
  stateLastFrame: number;
  playAnimeName: string;
  restartsAnimation: boolean;
  timelineEventFrame: number;
  timelinePlayAnimeName: string;
};

export type NfoCnParityActiveSkillBuff = {
  targetType: number;
  buffId: number;
  buffLevel: number;
  buffName: string;
  buffType: number;
  buffValue: number;
  buffDurationFrames: number;
  attributes: NfoAttributeData[];
};

export type NfoCnParityActiveSkillBuffCase = {
  id: string;
  activeSkillId: number;
  activeSkillName: string;
  activeSkillLevel: number;
  chargeCountMax: number;
  timelineFrames: number;
  eventIndex: number;
  eventName: string;
  eventFrame: number;
  buffs: NfoCnParityActiveSkillBuff[];
};

export type NfoCnParityActiveSkillSummonCase = {
  id: string;
  activeSkillId: number;
  activeSkillName: string;
  activeSkillLevel: number;
  chargeCountMax: number;
  timelineFrames: number;
  eventIndex: number;
  eventName: string;
  eventFrame: number;
  sameFrameSpawnMinionEventCount: number;
  shooterId: number;
  shooterName: string;
  shooterSpawnPos: number;
  shooterLifeTimeFrames: number;
  shooterFollowsOwnerDirection: boolean;
  shooterEventFrame: number;
  shooterDirectionType: number;
  shooterFormationType: number;
  shooterFormationOffsetX: number;
  shooterFormationOffsetY: number;
  shooterBulletTypeId: number;
  shooterBulletCount: number;
  shooterBulletSpeed: number;
  shooterBulletHitTargetType: number;
  minionId: number;
  minionLevel: number;
  minionAITypeId: number;
  minionAIStateId: number;
  minionAIStateName: string;
  minionAIStateType: number;
  minionAIStateLastFrame: number;
  minionAIStateShooterId: number;
  minionAIStateShooterName: string;
  minionAIStateShooterLifeTimeFrames: number;
  minionAIStateShooterEventFrame: number;
  minionAIStateShooterIsLoopEvent: boolean;
  minionAIStateShooterLoopFrameInterval: number;
  minionAIStateShooterDirectionType: number;
  minionAIStateShooterFormationType: number;
  minionAIStateShooterFormationOffsetX: number;
  minionAIStateShooterFormationOffsetY: number;
  minionAIStateShooterBulletTypeId: number;
  minionAIStateShooterBulletSpeed: number;
  minionAINextStateId: number;
  minionAINextStateName: string;
  minionAINextStateType: number;
  minionAINextStateShooterId: number;
  minionAINextStateShooterName: string;
  minionAINextStateShooterEventFrame: number;
  minionAINextStateShooterBulletTypeId: number;
  minionAINextStateShooterBulletAttack: number;
  minionAINextStateShooterBulletSpeed: number;
  minionAINextStateShooterBulletSize: number;
  minionAINextStateShooterBulletHitBuffId: number;
  weaponId: number;
  weaponLevel: number;
  spawnCount: number;
  spawnCenterType: number;
  spawnCenterOffsetX: number;
  spawnCenterOffsetY: number;
  spawnFormation: number;
  spawnRadiusMin: number;
  spawnRadiusMax: number;
  expectedFirstPassRadius: number;
};

export type NfoCnParityMapCase = {
  id: string;
  levelId: number;
  levelName: string;
  mapId: number;
  mapName: string;
  mapPrefabName: string;
  mapSizeX: number;
  mapSizeY: number;
  pitCount: number;
  wallCount: number;
  firstPitX: number;
  firstPitY: number;
  prefabLayerCount: number;
  prefabTileCount: number;
  prefabBoundsMinX: number;
  prefabBoundsMinY: number;
  prefabBoundsMaxX: number;
  prefabBoundsMaxY: number;
  terrainLayerTileCount: number;
  terrainLayerBoundsMinX: number;
  terrainLayerBoundsMinY: number;
  terrainLayerBoundsMaxX: number;
  terrainLayerBoundsMaxY: number;
};

export type NfoCnParityItemCase = {
  id: string;
  itemId: number;
  itemName: string;
  itemType: number;
  value: number;
  lifetimeFrames: number;
  canBeMagneted: boolean;
  prefab: string;
  iconSpriteName: string;
};

export type NfoCnParityDropCase = {
  id: string;
  dropId: number;
  dropName: string;
  itemCount: number;
  items: Array<{
    itemId: number;
    itemName: string;
    dropRate: number;
    itemType: number;
    itemValue: number;
    itemLifetimeFrames: number;
    itemCanBeMagneted: boolean;
  }>;
};

export type NfoCnParityLevelEnemySpawnCase = {
  id: string;
  levelId: number;
  levelName: string;
  commonDropId: number;
  eventIndex: number;
  eventName: string;
  eventId: number;
  startFrame: number;
  totalFrames: number;
  enemyTypeId: number;
  enemyName: string;
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
  dropId: number;
  programControl: boolean;
  enemyMaxHp: number;
  enemyAttack: number;
  enemyDefense: number;
  enemySpeed: number;
  enemyColliderRadius: number;
};

export type NfoCnParityLevelClearCase = {
  id: string;
  levelId: number;
  levelName: string;
  clearType: number;
  totalFrames: number;
  clearCoin: number;
  clearEnemyEventId: number;
  clearMinorEnemyEventIds: number[];
  clearUnlockLevelIds: number[];
  clearUnlockWeaponIds: number[];
  clearUnlockEquipIds: number[];
  clearUnlockCharacterIds: number[];
  postTotalFrameEnemyEventCount: number;
  earliestPostTotalFrameEnemyEventStartFrame: number;
  clearEnemySpawnEventCount: number;
  earliestClearEnemySpawnStartFrame: number;
  clearMinorEnemySpawnEventCount: number;
  earliestClearMinorEnemySpawnStartFrame: number;
};

export type NfoCnParityLevelEventTriggerCase = {
  id: string;
  levelId: number;
  levelName: string;
  triggerType: number;
  triggerEnemyEventId: number;
  triggeredEventCount: number;
  firstEventIndex: number;
  firstEventName: string;
  firstEventId: number;
  firstEventStartFrame: number;
  firstEnemyTypeId: number;
  lastEventIndex: number;
  lastEventName: string;
  lastEventId: number;
  lastEventStartFrame: number;
  lastEnemyTypeId: number;
};

export type NfoCnParityLevelAIStateChangeCase = {
  id: string;
  levelId: number;
  levelName: string;
  eventIndex: number;
  eventName: string;
  startFrame: number;
  totalFrames: number;
  targetSpawnEventIndex: number;
  targetEnemyEventId: number;
  targetAIStateId: number;
  targetEnemyTypeId: number;
  targetEnemyName: string;
  targetEnemyAITypeId: number;
  targetAIName: string;
};

export type NfoCnParityFixture = {
  schemaVersion: 1;
  purpose: "cn-nfo-offline-parity-fixtures";
  resourceVersion: string;
  activeSkillShooterCount: number;
  activeSkillShooterEventCount: number;
  weaponLevelShooterCount: number;
  selectedShooterCases: NfoCnParityShooterCase[];
  selectedWeaponShooterCases: NfoCnParityWeaponShooterCase[];
  selectedWeaponDirectFireCases: NfoCnParityWeaponDirectFireCase[];
  selectedWeaponMinionCases: NfoCnParityWeaponMinionCase[];
  selectedWeaponSelfBuffCases: NfoCnParityWeaponSelfBuffCase[];
  selectedShooterRotationCases: NfoCnParityShooterRotationCase[];
  selectedShooterOnDestroyCases: NfoCnParityShooterOnDestroyCase[];
  selectedActiveSkillShooterSpawnCases: NfoCnParityActiveSkillShooterSpawnCase[];
  selectedActiveSkillShooterHitBuffCases: NfoCnParityActiveSkillShooterHitBuffCase[];
  selectedAIActionCases: NfoCnParityAIActionCase[];
  selectedAIStateTimelineCases: NfoCnParityAIStateTimelineCase[];
  selectedAIStateFireAllWeaponCases: NfoCnParityAIStateFireAllWeaponCase[];
  selectedAIStateShooterSpawnCases: NfoCnParityAIStateShooterSpawnCase[];
  selectedAIStateNoCollidingCases: NfoCnParityAIStateNoCollidingCase[];
  selectedAIStateTeleportCases: NfoCnParityAIStateTeleportCase[];
  selectedAIStateMovementCases: NfoCnParityAIStateMovementCase[];
  selectedAIStateBuffCases: NfoCnParityAIStateBuffCase[];
  selectedAIStateCommonStateCases: NfoCnParityAIStateCommonStateCase[];
  selectedAIStateAnimationCases: NfoCnParityAIStateAnimationCase[];
  selectedActiveSkillBuffCases: NfoCnParityActiveSkillBuffCase[];
  selectedActiveSkillSummonCases: NfoCnParityActiveSkillSummonCase[];
  selectedItemCases: NfoCnParityItemCase[];
  selectedDropCases: NfoCnParityDropCase[];
  selectedLevelEnemySpawnCases: NfoCnParityLevelEnemySpawnCase[];
  selectedLevelClearCases: NfoCnParityLevelClearCase[];
  selectedLevelEventTriggerCases: NfoCnParityLevelEventTriggerCase[];
  selectedLevelAIStateChangeCases: NfoCnParityLevelAIStateChangeCase[];
  selectedMapCases: NfoCnParityMapCase[];
};

const SHOOTER_CASE_SPECS: ShooterCaseSpec[] = [
  {
    id: "active-shooter-direction-0-offset",
    shooterId: 7000,
    bulletTypeId: 66,
    expectedDirectionMode: "formation-offset-radial",
  },
  {
    id: "active-shooter-direction-1-radial-six-star",
    shooterId: 6000,
    bulletTypeId: 28,
    expectedDirectionMode: "radial-ring",
  },
  {
    id: "active-shooter-direction-3-owner-forward",
    shooterId: 3000,
    bulletTypeId: 56,
    expectedDirectionMode: "owner-forward",
  },
];

const WEAPON_SHOOTER_CASE_SPECS: WeaponShooterCaseSpec[] = [
  {
    id: "weapon-shooter-judgement-spear-lv1",
    weaponId: 31,
    weaponLevel: 1,
    shooterId: 311,
    bulletTypeId: 61,
    expectedDirectionMode: "owner-forward",
  },
  {
    id: "weapon-shooter-judgement-spear-level-up-lv2",
    weaponId: 31,
    weaponLevel: 2,
    shooterId: 312,
    bulletTypeId: 61,
    expectedDirectionMode: "owner-forward",
  },
  {
    id: "weapon-shooter-night-blade-offset-angle-lv1",
    weaponId: 28,
    weaponLevel: 1,
    shooterId: 2,
    bulletTypeId: 24,
    expectedDirectionMode: "nearest-enemy",
    expectedEventFrame: 15,
    expectedDirectionOffsetAngle: 90,
  },
  {
    id: "weapon-shooter-night-blade-all-direction-radial-lv1",
    weaponId: 28,
    weaponLevel: 1,
    shooterId: 2,
    bulletTypeId: 24,
    expectedDirectionMode: "radial-ring",
    expectedEventFrame: 30,
  },
  {
    id: "weapon-shooter-eternal-song-main-field-lv1",
    weaponId: 30,
    weaponLevel: 1,
    shooterId: 301,
    bulletTypeId: 60,
    expectedDirectionMode: "owner-forward",
    expectedEventFrame: 1,
    expectedIsLoopEvent: false,
    expectedLoopFrameInterval: 0,
    expectedHitTargetType: 0,
    expectedNoDamage: false,
  },
  {
    id: "weapon-shooter-eternal-song-friendly-buff-lv1",
    weaponId: 30,
    weaponLevel: 1,
    shooterId: 301,
    bulletTypeId: 99,
    expectedDirectionMode: "owner-forward",
    expectedIsLoopEvent: true,
    expectedLoopFrameInterval: 30,
    expectedHitTargetType: 1,
    expectedNoDamage: true,
    expectedHitBuffId: 109,
  },
  {
    id: "weapon-shooter-prayer-rain-enemy-slow-lv1",
    weaponId: 33,
    weaponLevel: 1,
    shooterId: 321,
    bulletTypeId: 99,
    expectedDirectionMode: "owner-forward",
    expectedIsLoopEvent: true,
    expectedLoopFrameInterval: 60,
    expectedHitTargetType: 0,
    expectedNoDamage: true,
    expectedHitBuffId: 1,
  },
  {
    id: "weapon-shooter-prayer-rain-friendly-buff-lv1",
    weaponId: 33,
    weaponLevel: 1,
    shooterId: 321,
    bulletTypeId: 63,
    expectedDirectionMode: "owner-forward",
    expectedHitTargetType: 1,
    expectedNoDamage: true,
    expectedHitBuffId: 111,
  },
];

const WEAPON_DIRECT_FIRE_CASE_SPECS: WeaponDirectFireCaseSpec[] = [
  {
    id: "weapon-direct-fireball-targeted-two-shot-lv2",
    weaponId: 1,
    weaponLevel: 2,
    bulletTypeId: 11,
    expectedRequiresEnemyTarget: true,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 600,
    expectedDamageJudgeType: 0,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-light-sanctuary-targetless-multi-bullet-lv1",
    weaponId: 2,
    weaponLevel: 1,
    bulletTypeId: 2,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 600,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-apocalypse-light-targeted-ray-lv1",
    weaponId: 3,
    weaponLevel: 1,
    bulletTypeId: 3,
    expectedRequiresEnemyTarget: true,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 2,
  },
  {
    id: "weapon-direct-knight-blade-targetless-field-lv1",
    weaponId: 4,
    weaponLevel: 1,
    bulletTypeId: 4,
    expectedDirectFireBulletCount: 1,
    expectedWeaponGroupCount: 1,
    expectedWeaponFireGroupCooldownFrames: 3,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-dark-orb-targetless-multi-bullet-lv1",
    weaponId: 5,
    weaponLevel: 1,
    bulletTypeId: 5,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 800,
    expectedDamageJudgeType: 0,
    expectedColliderType: 0,
    expectedMotionMode: "homingEnemy",
    expectedWeaponDescriptionIncludes: "追踪",
  },
  {
    id: "weapon-direct-guardian-song-targetless-multi-bullet-lv1",
    weaponId: 6,
    weaponLevel: 1,
    bulletTypeId: 16,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 800,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
    expectedMotionMode: "playerOrbit",
    expectedWeaponDescriptionIncludes: "围绕角色旋转",
  },
  {
    id: "weapon-direct-kirakira-targetless-five-shot-lv1",
    weaponId: 9,
    weaponLevel: 1,
    bulletTypeId: 14,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 800,
    expectedDamageJudgeType: 0,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-dark-summon-targeted-projectile-lv1",
    weaponId: 7,
    weaponLevel: 1,
    bulletTypeId: 17,
    expectedRequiresEnemyTarget: true,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 800,
    expectedDamageJudgeType: 0,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-hurricane-moving-projectile-lv1",
    weaponId: 8,
    weaponLevel: 1,
    bulletTypeId: 15,
    fireBulletIndex: 0,
    expectedRequiresEnemyTarget: true,
    expectedDirectFireBulletCount: 2,
    expectedBulletSpeed: 800,
    expectedDamageJudgeType: 0,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-hurricane-static-field-lv1",
    weaponId: 8,
    weaponLevel: 1,
    bulletTypeId: 15,
    fireBulletIndex: 1,
    expectedRequiresEnemyTarget: true,
    expectedDirectFireBulletCount: 2,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-dokidoki-self-centered-dual-field-lv1",
    weaponId: 10,
    weaponLevel: 1,
    bulletTypeId: 13,
    expectedDirectFireBulletCount: 2,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 2,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-holy-shield-impact-damage-judge-none-force",
    weaponId: 11,
    weaponLevel: 1,
    bulletTypeId: 6,
    expectedDamageJudgeType: 2,
    expectedForceType: 1,
    expectedForce: 1,
  },
  {
    id: "weapon-direct-holy-shield-left-force",
    weaponId: 11,
    weaponLevel: 1,
    bulletTypeId: 7,
    expectedDirectFireBulletCount: 5,
    expectedBulletSpeed: 500,
    expectedDamageJudgeType: 0,
    expectedForceType: 3,
    expectedForce: 4,
  },
  {
    id: "weapon-direct-holy-shield-right-force",
    weaponId: 11,
    weaponLevel: 1,
    bulletTypeId: 8,
    expectedDirectFireBulletCount: 5,
    expectedBulletSpeed: 500,
    expectedDamageJudgeType: 0,
    expectedForceType: 4,
    expectedForce: 4,
  },
  {
    id: "weapon-direct-holy-shield-down-force",
    weaponId: 11,
    weaponLevel: 1,
    bulletTypeId: 9,
    expectedDirectFireBulletCount: 5,
    expectedBulletSpeed: 500,
    expectedDamageJudgeType: 0,
    expectedForceType: 6,
    expectedForce: 4,
  },
  {
    id: "weapon-direct-holy-shield-up-force",
    weaponId: 11,
    weaponLevel: 1,
    bulletTypeId: 10,
    expectedDirectFireBulletCount: 5,
    expectedBulletSpeed: 500,
    expectedDamageJudgeType: 0,
    expectedForceType: 5,
    expectedForce: 4,
  },
  {
    id: "weapon-direct-chainsaw-owner-forward-ray-lv1",
    weaponId: 12,
    weaponLevel: 1,
    bulletTypeId: 19,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 2,
  },
  {
    id: "weapon-direct-knight-feather-owner-forward-rect-lv1",
    weaponId: 13,
    weaponLevel: 1,
    bulletTypeId: 20,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 1,
  },
  {
    id: "weapon-direct-courage-song-ray-hit-buff-lv1",
    weaponId: 14,
    weaponLevel: 1,
    bulletTypeId: 18,
    expectedDamageJudgeType: 1,
    expectedColliderType: 2,
    expectedHitBuffId: 1,
  },
  {
    id: "weapon-direct-blizzard-freeze-field-lv1",
    weaponId: 15,
    weaponLevel: 1,
    bulletTypeId: 21,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
    expectedHitBuffId: 2,
  },
  {
    id: "weapon-direct-judgement-stun-field-lv1",
    weaponId: 17,
    weaponLevel: 1,
    bulletTypeId: 23,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
    expectedHitBuffId: 3,
  },
  {
    id: "weapon-direct-six-star-dot-hit-buff-lv1",
    weaponId: 18,
    weaponLevel: 1,
    bulletTypeId: 28,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 700,
    expectedDamageJudgeType: 0,
    expectedColliderType: 0,
    expectedHitBuffId: 4,
  },
  {
    id: "weapon-direct-galaxy-light-grouped-field-lv1",
    weaponId: 20,
    weaponLevel: 1,
    bulletTypeId: 30,
    expectedDirectFireBulletCount: 1,
    expectedWeaponGroupCount: 4,
    expectedWeaponFireGroupCooldownFrames: 5,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-black-hole-inward-force-lv1",
    weaponId: 21,
    weaponLevel: 1,
    bulletTypeId: 31,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
    expectedForceType: 2,
    expectedForce: 5,
  },
  {
    id: "weapon-direct-iai-instant-field-lv1",
    weaponId: 24,
    weaponLevel: 1,
    bulletTypeId: 25,
    fireBulletIndex: 0,
    expectedDirectFireBulletCount: 2,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-iai-delayed-field-lv1",
    weaponId: 24,
    weaponLevel: 1,
    bulletTypeId: 26,
    fireBulletIndex: 1,
    expectedDirectFireBulletCount: 2,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-night-blade-dot-and-shooter-lv1",
    weaponId: 28,
    weaponLevel: 1,
    bulletTypeId: 5,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 700,
    expectedDamageJudgeType: 0,
    expectedColliderType: 0,
    expectedHitBuffId: 4,
  },
  {
    id: "weapon-direct-eternal-song-targeted-field-lv1",
    weaponId: 30,
    weaponLevel: 1,
    bulletTypeId: 60,
    expectedRequiresEnemyTarget: true,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-prayer-rain-targeted-field-lv1",
    weaponId: 33,
    weaponLevel: 1,
    bulletTypeId: 60,
    expectedRequiresEnemyTarget: true,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 0,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
  },
  {
    id: "weapon-direct-domination-friendly-buff-lv1",
    weaponId: 27,
    weaponLevel: 1,
    bulletTypeId: 32,
    expectedDirectFireBulletCount: 1,
    expectedBulletSpeed: 700,
    expectedDamageJudgeType: 1,
    expectedColliderType: 0,
    expectedHitBuffId: 7,
  },
];

const WEAPON_MINION_CASE_SPECS: WeaponMinionCaseSpec[] = [
  {
    id: "weapon-minion-summon-basic-lv1",
    weaponId: 16,
    weaponLevel: 1,
    expectedMinionId: 2,
    expectedMinionCount: 1,
    expectedBulletTypeId: 22,
  },
  {
    id: "weapon-minion-fairy-basic-lv1",
    weaponId: 19,
    weaponLevel: 1,
    expectedMinionId: 6,
    expectedMinionCount: 1,
    expectedBulletTypeId: 29,
    expectedBulletDamageJudgeType: 0,
  },
  {
    id: "weapon-minion-offensive-turret-lv1",
    weaponId: 22,
    weaponLevel: 1,
    expectedMinionId: 3,
    expectedMinionCount: 2,
    expectedBulletTypeId: 33,
    expectedBulletDamageJudgeType: 1,
    expectedBulletColliderType: 2,
    expectedBulletDamageJudgeDelayFrames: 0,
    expectedBulletDamageJudgeCooldownFrames: 10,
  },
  {
    id: "weapon-minion-leo-ai-gated-lv1",
    weaponId: 26,
    weaponLevel: 1,
    expectedMinionId: 4,
    expectedMinionCount: 1,
    expectedBulletTypeId: 34,
    expectedBulletDamageJudgeType: 1,
    expectedBulletDamageJudgeDelayFrames: 10,
    expectedBulletDamageJudgeCooldownFrames: 20,
    expectedHitBuffId: 3,
  },
  {
    id: "weapon-minion-royal-guard-spawn-lv1",
    weaponId: 32,
    weaponLevel: 1,
    expectedMinionId: 10,
    expectedMinionCount: 1,
    expectedSpawnMinionAITypeId: 110,
    expectedSpawnMinionFormation: 1,
    expectedSpawnRadiusMin: 4,
    expectedSpawnRadiusMax: 5,
    expectedAIStateShooterId: 15000,
    expectedAIStateShooterBulletTypeId: 99,
    expectedAIStateShooterBulletSize: 500,
    expectedAIStateShooterHitBuffId: 120,
  },
  {
    id: "weapon-minion-royal-guard-spawn-level-up-lv2",
    weaponId: 32,
    weaponLevel: 2,
    expectedMinionId: 10,
    expectedMinionCount: 1,
    expectedSpawnMinionAITypeId: 111,
    expectedSpawnMinionFormation: 1,
    expectedSpawnRadiusMin: 4,
    expectedSpawnRadiusMax: 5,
    expectedAIStateShooterId: 15001,
    expectedAIStateShooterBulletTypeId: 99,
    expectedAIStateShooterBulletSize: 550,
    expectedAIStateShooterHitBuffId: 120,
  },
];

const WEAPON_SELF_BUFF_CASE_SPECS: WeaponSelfBuffCaseSpec[] = [
  {
    id: "weapon-self-buff-floating-shield-lv1",
    weaponId: 23,
    weaponLevel: 1,
    expectedSelfBuffId: 5,
    expectedSelfBuffLevel: 1,
    expectedBuffType: 5,
    expectedAttributes: [],
  },
  {
    id: "weapon-self-buff-counter-lv1",
    weaponId: 25,
    weaponLevel: 1,
    expectedSelfBuffId: 6,
    expectedSelfBuffLevel: 1,
    expectedBuffType: 6,
    expectedAttributes: [],
    expectedBuffFireBulletTypeId: 27,
    expectedBuffFireBulletAttack: 100,
    expectedBuffFireBulletSpeed: 0,
    expectedBuffFireBulletSize: 300,
    expectedBuffFireBulletLifeTimeFrames: 30,
    expectedBuffFireBulletHitTimes: 9999,
    expectedBuffFireBulletDamageJudgeDelayFrames: 10,
    expectedBuffFireBulletDamageJudgeCooldownFrames: 9999,
  },
  {
    id: "weapon-self-buff-stealth-attribute-lv1",
    weaponId: 29,
    weaponLevel: 1,
    expectedSelfBuffId: 8,
    expectedSelfBuffLevel: 1,
    expectedBuffType: 7,
    expectedAttributes: [
      {
        attributeType: 3,
        value: 2,
      },
      {
        attributeType: 4,
        value: 500,
      },
    ],
    expectedBuffFireBulletTypeId: 15,
    expectedBuffFireBulletAttack: 1,
    expectedBuffFireBulletSpeed: 700,
    expectedBuffFireBulletSize: 200,
    expectedBuffFireBulletLifeTimeFrames: 30,
    expectedBuffFireBulletHitTimes: 9999,
    expectedBuffFireBulletDamageJudgeDelayFrames: 10,
    expectedBuffFireBulletDamageJudgeCooldownFrames: 9999,
  },
];

const SHOOTER_ROTATION_CASE_SPECS: ShooterRotationCaseSpec[] = [
  {
    id: "boss-shooter-rotation-type-2",
    shooterId: 2100,
    bulletTypeId: 101,
    expectedDirectionMode: "friendly-target",
    expectedRotationType: 2,
  },
];

const SHOOTER_ON_DESTROY_CASE_SPECS: ShooterOnDestroyCaseSpec[] = [
  {
    id: "shooter-black-hole-on-destroy-event-bullet",
    shooterId: 4000,
    parentBulletTypeId: 99,
    expectedOnDestroyEventBulletId: 1,
    expectedChildBulletTypeId: 31,
  },
  {
    id: "shooter-michelle-fist-hostile-on-destroy-event-bullet",
    shooterId: 2002,
    parentBulletTypeId: 54,
    expectedOnDestroyEventBulletId: 1,
    expectedChildBulletTypeId: 55,
  },
];

const ACTIVE_SKILL_SHOOTER_SPAWN_CASE_SPECS: ActiveSkillShooterSpawnCaseSpec[] = [
  {
    id: "active-skill-chainsaw-god-spawn-pos-3-nearest-enemy",
    activeSkillId: 99,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 8000,
    expectedSpawnPos: 3,
    expectedBulletTypeId: 58,
  },
  {
    id: "active-skill-elemental-burst-fan-fireballs-lv1",
    activeSkillId: 13,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 13000,
    expectedSpawnPos: 3,
    expectedBulletTypeId: 11,
    expectedIsLoopEvent: true,
    expectedLoopFrameInterval: 15,
  },
  {
    id: "active-skill-elemental-burst-snow-field-lv1",
    activeSkillId: 13,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 13000,
    expectedSpawnPos: 3,
    expectedBulletTypeId: 21,
    expectedIsLoopEvent: false,
    expectedLoopFrameInterval: 0,
  },
  {
    id: "active-skill-endless-star-map-owner-forward-field-lv1",
    activeSkillId: 116,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 10000,
    expectedSpawnPos: 0,
    expectedBulletTypeId: 64,
  },
  {
    id: "active-skill-apocalypse-song-delayed-damage-lv1",
    activeSkillId: 14,
    activeSkillLevel: 1,
    expectedEventFrame: 90,
    expectedShooterId: 3001,
    expectedSpawnPos: 0,
    expectedBulletTypeId: 99,
    expectedIsLoopEvent: false,
    expectedLoopFrameInterval: 0,
  },
  {
    id: "active-skill-all-out-fire-shooter-frame-3-lv1",
    activeSkillId: 112,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 7000,
    expectedSpawnPos: 0,
    expectedBulletTypeId: 67,
    expectedIsLoopEvent: true,
    expectedLoopFrameInterval: 10,
  },
  {
    id: "active-skill-all-out-fire-shooter-frame-7-lv1",
    activeSkillId: 112,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 7000,
    expectedSpawnPos: 0,
    expectedBulletTypeId: 68,
    expectedIsLoopEvent: true,
    expectedLoopFrameInterval: 15,
  },
  {
    id: "active-skill-zessho-static-field-lv1",
    activeSkillId: 114,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 1001,
    expectedSpawnPos: 0,
    expectedBulletTypeId: 99,
    expectedShooterBehaviorType: 0,
    expectedShooterFollowsOwnerDirection: false,
    expectedIsLoopEvent: false,
    expectedLoopFrameInterval: 0,
  },
];

const ACTIVE_SKILL_SHOOTER_HIT_BUFF_CASE_SPECS: ActiveSkillShooterHitBuffCaseSpec[] = [
  {
    id: "active-skill-apocalypse-song-stun-field-lv1",
    activeSkillId: 14,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 3000,
    expectedBulletTypeId: 56,
    expectedHitBuffId: 3,
    expectedBuffType: 2,
    expectedHitTargetType: 0,
    expectedNoDamage: true,
  },
  {
    id: "active-skill-absolute-guard-shooter-friendly-invincible-buff",
    activeSkillId: 117,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 11000,
    expectedBulletTypeId: 65,
    expectedHitBuffId: 108,
    expectedBuffType: 9,
  },
  {
    id: "active-skill-kirakira-dokidoki-delayed-stun-field",
    activeSkillId: 16,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 9000,
    expectedBulletTypeId: 59,
    expectedHitBuffId: 18,
    expectedBuffType: 2,
    expectedDamageJudgeDelayFrames: 21,
    expectedHitTargetType: 0,
    expectedNoDamage: false,
  },
];

const AI_ACTION_CASE_SPECS: AIActionCaseSpec[] = [
  {
    id: "ai-boss-cat-creates-shooter-2100",
    aiTypeId: 66,
    expectedShooterId: 2100,
    expectedShooterBulletTypeId: 101,
    expectedShooterDirectionType: 2,
    expectedShooterRotationType: 2,
  },
  {
    id: "ai-hydra-creates-friendly-target-fireball-shooter-2001",
    aiTypeId: 28,
    expectedShooterId: 2001,
    expectedShooterBulletTypeId: 53,
    expectedShooterDirectionType: 2,
    expectedShooterRotationType: 0,
  },
  {
    id: "ai-hydra-creates-long-timeline-fireball-shooter-2000",
    aiTypeId: 29,
    expectedShooterId: 2000,
    expectedShooterBulletTypeId: 53,
    expectedShooterDirectionType: 2,
    expectedShooterRotationType: 0,
    expectedShooterEventCount: 11,
    expectedShooterLastEventFrame: 59,
  },
];

const AI_STATE_TIMELINE_CASE_SPECS: AIStateTimelineCaseSpec[] = [
  {
    id: "ai-michelle-laser-fire-bullet-now-frame-15",
    aiTypeId: 44,
    stateId: 3,
    expectedFireFrame: 15,
    expectedBulletTypeId: 99,
    expectedColliderType: 2,
    expectedDamageJudgeType: 1,
  },
];

const AI_STATE_FIRE_ALL_WEAPON_CASE_SPECS: AIStateFireAllWeaponCaseSpec[] = [
  {
    id: "ai-leo-minion-fire-all-weapon-frame-20",
    aiTypeId: 103,
    stateId: 2,
    expectedFireFrame: 20,
    expectedMinionId: 4,
    expectedWeaponId: 26,
    expectedWeaponLevel: 1,
    expectedBulletTypeId: 34,
  },
];

const AI_STATE_SHOOTER_SPAWN_CASE_SPECS: AIStateShooterSpawnCaseSpec[] = [
  {
    id: "ai-archangel-shooter-spawn-pos-1-player-laser",
    aiTypeId: 32,
    stateId: 4,
    expectedShooterId: 1,
    expectedSpawnPos: 1,
    expectedBulletTypeId: 52,
  },
];

const AI_STATE_NO_COLLIDING_CASE_SPECS: AIStateNoCollidingCaseSpec[] = [
  {
    id: "ai-moon-cat-teleport-no-colliding-frame-1",
    aiTypeId: 26,
    stateId: 2,
    expectedNoCollidingFrame: 1,
  },
];

const AI_STATE_TELEPORT_CASE_SPECS: AIStateTeleportCaseSpec[] = [
  {
    id: "ai-moon-cat-black-cat-teleport-frame-30",
    aiTypeId: 26,
    stateId: 2,
    expectedStateType: 12,
    expectedTeleportFrame: 30,
    expectedFireFrame: 46,
    expectedNormalFrame: 60,
    expectedNextStateId: 1,
    expectedBulletTypeId: 51,
  },
];

const AI_STATE_MOVEMENT_CASE_SPECS: AIStateMovementCaseSpec[] = [
  {
    id: "ai-special-random-transition-state",
    aiTypeId: 4,
    stateId: 1,
    expectedStateType: 1,
    expectedNextStateId: 2,
    expectedFallbackNextStateId: 1,
    expectedFallbackNextStateProbability: 100,
    expectedIsFireBullet: false,
    expectedFireBulletCount: 0,
  },
  {
    id: "ai-random-move-around-player-state",
    aiTypeId: 5,
    stateId: 2,
    expectedStateType: 2,
    expectedNextStateId: 1,
    expectedIsFireBullet: true,
    expectedBulletTypeId: 51,
  },
  {
    id: "ai-golem-roll-attack-state-speed",
    aiTypeId: 6,
    stateId: 2,
    expectedStateType: 10,
    expectedNextStateId: 1,
    expectedStateMoveSpeed: 600,
    expectedIsFireBullet: false,
    expectedFireBulletCount: 1,
    expectedBulletTypeId: 51,
  },
  {
    id: "ai-samurai-flash-attack-state",
    aiTypeId: 7,
    stateId: 2,
    expectedStateType: 11,
    expectedNextStateId: 3,
    expectedStateMoveSpeed: 0,
    expectedIsFireBullet: false,
    expectedFireBulletCount: 1,
    expectedBulletTypeId: 51,
  },
  {
    id: "ai-cat-boss-attack-bullet-rain-state",
    aiTypeId: 27,
    stateId: 2,
    expectedStateType: 13,
    expectedNextStateId: 1,
    expectedIsFireBullet: true,
    expectedFireBulletCount: 1,
    expectedBulletTypeId: 51,
  },
  {
    id: "ai-ancient-golem-jump-up-offset-state",
    aiTypeId: 38,
    stateId: 4,
    expectedStateType: 31,
    expectedNextStateId: 5,
    expectedStateMoveSpeed: 2000,
    expectedIsFireBullet: false,
  },
  {
    id: "ai-ancient-golem-jump-land-offset-state",
    aiTypeId: 38,
    stateId: 5,
    expectedStateType: 32,
    expectedNextStateId: 6,
    expectedStateMoveSpeed: 2000,
    expectedIsFireBullet: false,
  },
  {
    id: "ai-michelle-laser-offset-move-state",
    aiTypeId: 44,
    stateId: 2,
    expectedStateType: 33,
    expectedNextStateId: 3,
    expectedStateMoveSpeed: 900,
    expectedIsFireBullet: false,
  },
  {
    id: "ai-claw-machine-drop-offset-move-state",
    aiTypeId: 80,
    stateId: 10,
    expectedStateType: 31,
    expectedNextStateId: 11,
    expectedStateMoveSpeed: 500,
    expectedIsFireBullet: false,
  },
  {
    id: "ai-claw-machine-return-offset-trigger-state",
    aiTypeId: 80,
    stateId: 13,
    expectedStateType: 31,
    expectedNextStateId: 1,
    expectedStateMoveSpeed: 500,
    expectedIsFireBullet: false,
    expectedTriggerLevelEventId: 1,
  },
  {
    id: "ai-claw-machine-type-two-trigger-return-state",
    aiTypeId: 80,
    stateId: 33,
    expectedStateType: 31,
    expectedNextStateId: 1,
    expectedStateMoveSpeed: 500,
    expectedIsFireBullet: false,
    expectedTriggerLevelEventId: 3,
  },
];

const AI_STATE_BUFF_CASE_SPECS: AIStateBuffCaseSpec[] = [
  {
    id: "ai-ancient-golem-jump-land-defense-debuff",
    aiTypeId: 38,
    stateId: 5,
    expectedBuffId: 101,
    expectedBuffLevel: 1,
    expectedBuffType: 1,
    expectedBuffDurationFrames: 120,
    expectedAttributeType: 3,
    expectedAttributeValue: -500,
  },
  {
    id: "ai-ancient-golem-weak-defense-debuff",
    aiTypeId: 38,
    stateId: 6,
    expectedBuffId: 101,
    expectedBuffLevel: 1,
    expectedBuffType: 1,
    expectedBuffDurationFrames: 120,
    expectedAttributeType: 3,
    expectedAttributeValue: -500,
  },
  {
    id: "ai-time-eye-appearance-continuous-change",
    aiTypeId: 41,
    stateId: 1,
    expectedBuffId: 102,
    expectedBuffLevel: 1,
    expectedBuffType: 8,
    expectedBuffDurationFrames: 6000,
    expectedAttributeType: 14,
    expectedAttributeValue: 1,
  },
];

const AI_STATE_COMMON_STATE_CASE_SPECS: AIStateCommonStateCaseSpec[] = [
  {
    id: "ai-archangel-waiting-common-state",
    aiTypeId: 32,
    stateId: 1,
    expectedChangesEntityCommonState: true,
    expectedEntityCommonStateChangeTo: 1,
  },
  {
    id: "ai-archangel-startup-common-state",
    aiTypeId: 32,
    stateId: 2,
    expectedChangesEntityCommonState: true,
    expectedEntityCommonStateChangeTo: 0,
  },
];

const AI_STATE_ANIMATION_CASE_SPECS: AIStateAnimationCaseSpec[] = [
  {
    id: "ai-ancient-golem-landing-restart-animation",
    aiTypeId: 38,
    stateId: 5,
    expectedPlayAnimeName: "Skill1-2",
    expectedRestartsAnimation: true,
  },
  {
    id: "ai-black-cat-teleport-timeline-animation",
    aiTypeId: 26,
    stateId: 2,
    expectedPlayAnimeName: "walk",
    expectedRestartsAnimation: false,
    expectedTimelineEventFrame: 1,
    expectedTimelinePlayAnimeName: "skill-miss",
  },
];

const ACTIVE_SKILL_BUFF_CASE_SPECS: ActiveSkillBuffCaseSpec[] = [
  {
    id: "active-skill-holy-mend-heal-invincible-revive",
    activeSkillId: 12,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedBuffIds: [106, 104, 105],
  },
  {
    id: "active-skill-fairy-guard-targets-player-side",
    activeSkillId: 15,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedBuffIds: [11, 13],
  },
];

const ACTIVE_SKILL_SUMMON_CASE_SPECS: ActiveSkillSummonCaseSpec[] = [
  {
    id: "active-skill-king-of-beasts-formation-2-roar-minions-lv2",
    activeSkillId: 111,
    activeSkillLevel: 2,
    expectedEventFrame: 1,
    expectedMinionId: 9,
    expectedSpawnFormation: 2,
    expectedSpawnCount: 3,
    expectedMinionAIStateType: 21,
    expectedMinionAINextStateId: 1,
    expectedMinionAINextStateShooterId: 14001,
    expectedMinionAINextStateShooterBulletTypeId: 34,
  },
  {
    id: "active-skill-all-out-fire-shooter-and-minion-lv1",
    activeSkillId: 112,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedShooterId: 7000,
    expectedShooterBulletTypeId: 66,
    expectedMinionId: 8,
    expectedSpawnFormation: 1,
    expectedSpawnCount: 1,
    expectedMinionAIStateType: 22,
    expectedMinionAIStateShooterId: 7003,
    expectedMinionAIStateShooterBulletTypeId: 68,
  },
  {
    id: "active-skill-all-out-fire-middle-minion-lv3",
    activeSkillId: 112,
    activeSkillLevel: 3,
    expectedEventIndex: 1,
    expectedEventFrame: 1,
    expectedMinionId: 8,
    expectedMinionAITypeId: 206,
    expectedSpawnFormation: 1,
    expectedSpawnCount: 1,
    expectedSpawnCenterOffsetX: 0,
    expectedSpawnCenterOffsetY: 0,
    expectedSpawnRadiusMin: 250,
    expectedSpawnRadiusMax: 250,
    expectedSameFrameSpawnMinionEventCount: 3,
    expectedMinionAIStateType: 22,
    expectedMinionAIStateShooterId: 7004,
    expectedMinionAIStateShooterBulletTypeId: 69,
  },
  {
    id: "active-skill-all-out-fire-offset-minion-lv3",
    activeSkillId: 112,
    activeSkillLevel: 3,
    expectedEventIndex: 2,
    expectedEventFrame: 1,
    expectedMinionId: 8,
    expectedMinionAITypeId: 207,
    expectedSpawnFormation: 1,
    expectedSpawnCount: 1,
    expectedSpawnCenterOffsetX: 250,
    expectedSpawnCenterOffsetY: 250,
    expectedSpawnRadiusMin: 1,
    expectedSpawnRadiusMax: 1,
    expectedSameFrameSpawnMinionEventCount: 3,
    expectedMinionAIStateType: 22,
    expectedMinionAIStateShooterId: 7005,
    expectedMinionAIStateShooterBulletTypeId: 70,
  },
  {
    id: "active-skill-galaxy-star-ring-summon-lv1",
    activeSkillId: 113,
    activeSkillLevel: 1,
    expectedEventFrame: 1,
    expectedMinionId: 7,
    expectedSpawnFormation: 1,
    expectedSpawnCount: 3,
    expectedMinionAITypeId: 201,
    expectedMinionAIStateType: 22,
    expectedMinionAIStateShooterId: 4000,
    expectedMinionAIStateShooterBulletTypeId: 99,
  },
  {
    id: "active-skill-anon-phantom-ring-summon-lv2",
    activeSkillId: 115,
    activeSkillLevel: 2,
    expectedEventFrame: 1,
    expectedMinionId: 5,
    expectedSpawnFormation: 2,
    expectedSpawnCount: 2,
  },
];

const ITEM_CASE_SPECS: ItemCaseSpec[] = [
  {
    id: "item-exp-small",
    itemId: 1,
    expectedItemType: 0,
    expectedValue: 10,
    expectedLifetimeFrames: 600,
    expectedCanBeMagneted: true,
  },
  {
    id: "item-bomb",
    itemId: 4,
    expectedItemType: 1,
    expectedValue: 0,
    expectedLifetimeFrames: 600,
    expectedCanBeMagneted: false,
  },
  {
    id: "item-magnet",
    itemId: 5,
    expectedItemType: 2,
    expectedValue: 0,
    expectedLifetimeFrames: 600,
    expectedCanBeMagneted: false,
  },
  {
    id: "item-level-up",
    itemId: 6,
    expectedItemType: 3,
    expectedValue: 0,
    expectedLifetimeFrames: 600,
    expectedCanBeMagneted: false,
  },
  {
    id: "item-heal-small",
    itemId: 7,
    expectedItemType: 4,
    expectedValue: 5,
    expectedLifetimeFrames: 999999,
    expectedCanBeMagneted: true,
  },
  {
    id: "item-coin-one",
    itemId: 10,
    expectedItemType: 5,
    expectedValue: 1,
    expectedLifetimeFrames: 600,
    expectedCanBeMagneted: true,
  },
];

const DROP_CASE_SPECS: DropCaseSpec[] = [
  {
    id: "drop-minor-enemy-exp-small-coin",
    dropId: 102,
    expectedDropName: "小怪掉落",
    expectedItems: [
      {
        itemId: 1,
        dropRate: 1000,
        itemType: 0,
        value: 10,
        lifetimeFrames: 600,
        canBeMagneted: true,
      },
      {
        itemId: 10,
        dropRate: 20,
        itemType: 5,
        value: 1,
        lifetimeFrames: 600,
        canBeMagneted: true,
      },
    ],
  },
  {
    id: "drop-common-bomb-magnet-heal",
    dropId: 20,
    expectedDropName: "关卡共通默认掉落",
    expectedItems: [
      {
        itemId: 4,
        dropRate: 10,
        itemType: 1,
        value: 0,
        lifetimeFrames: 600,
        canBeMagneted: false,
      },
      {
        itemId: 5,
        dropRate: 10,
        itemType: 2,
        value: 0,
        lifetimeFrames: 600,
        canBeMagneted: false,
      },
      {
        itemId: 7,
        dropRate: 10,
        itemType: 4,
        value: 5,
        lifetimeFrames: 999999,
        canBeMagneted: true,
      },
    ],
  },
];

const LEVEL_ENEMY_SPAWN_CASE_SPECS: LevelEnemySpawnCaseSpec[] = [
  {
    id: "level-plain-first-slime-wave",
    levelId: 1,
    eventIndex: 1,
    expectedLevelName: "平原",
    expectedCommonDropId: 20,
    expectedEventName: "刷怪 0:0-0:30 史莱姆 lv1 ",
    expectedStartFrame: 5,
    expectedTotalFrames: 900,
    expectedEnemyTypeId: 1,
    expectedEnemyLevel: 1,
    expectedEnemyAiTypeId: 1,
    expectedSpawnType: 1,
    expectedSpawnCenterType: 0,
    expectedSpawnWaveCount: 5,
    expectedSpawnWaveIntervalFrames: 60,
    expectedSpawnRangeMin: 13,
    expectedSpawnRangeMax: 20,
    expectedSpawnCenterOffsetX: 0,
    expectedSpawnCenterOffsetY: 0,
    expectedDropId: 1,
    expectedProgramControl: true,
    expectedEnemyMaxHp: 10,
    expectedEnemyAttack: 1,
    expectedEnemyDefense: 0,
    expectedEnemySpeed: 200,
    expectedEnemyColliderRadius: 50,
  },
  {
    id: "level-anniversary-stage-fixed-cat-boss",
    levelId: 28,
    eventIndex: 1,
    expectedLevelName: "周年舞台",
    expectedCommonDropId: 0,
    expectedEventName: "猫boss1",
    expectedStartFrame: 1800,
    expectedTotalFrames: 5,
    expectedEnemyTypeId: 66,
    expectedEnemyLevel: 1,
    expectedEnemyAiTypeId: 66,
    expectedSpawnType: 1,
    expectedSpawnCenterType: 1,
    expectedSpawnWaveCount: 1,
    expectedSpawnWaveIntervalFrames: 30,
    expectedSpawnRangeMin: 0,
    expectedSpawnRangeMax: 0,
    expectedSpawnCenterOffsetX: -3,
    expectedSpawnCenterOffsetY: 4,
    expectedDropId: 100,
    expectedProgramControl: false,
    expectedEnemyMaxHp: 60000,
    expectedEnemyAttack: 3,
    expectedEnemyDefense: 1,
    expectedEnemySpeed: 200,
    expectedEnemyColliderRadius: 200,
  },
  {
    id: "level-sky-island-knight-ring-wave",
    levelId: 15,
    eventIndex: 16,
    expectedLevelName: "天空岛",
    expectedCommonDropId: 0,
    expectedEventName: "3:00 骑士圈lv1",
    expectedStartFrame: 5400,
    expectedTotalFrames: 10,
    expectedEnemyTypeId: 30,
    expectedEnemyLevel: 1,
    expectedEnemyAiTypeId: 1,
    expectedSpawnType: 2,
    expectedSpawnCenterType: 0,
    expectedSpawnWaveCount: 20,
    expectedSpawnWaveIntervalFrames: 13,
    expectedSpawnRangeMin: 14,
    expectedSpawnRangeMax: 15,
    expectedSpawnCenterOffsetX: 0,
    expectedSpawnCenterOffsetY: 0,
    expectedDropId: 101,
    expectedProgramControl: false,
    expectedEnemyMaxHp: 1000,
    expectedEnemyAttack: 6,
    expectedEnemyDefense: 1,
    expectedEnemySpeed: 100,
    expectedEnemyColliderRadius: 100,
  },
];

const LEVEL_CLEAR_CASE_SPECS: LevelClearCaseSpec[] = [
  {
    id: "level-world-end-clear-type-two-post-timer-spawns",
    levelId: 11,
    expectedClearType: 2,
    expectedTotalFrames: 18000,
    expectedClearCoin: 1000,
    expectedClearEnemyEventId: 0,
    expectedClearMinorEnemyEventIds: [],
    expectedClearUnlockLevelIds: [],
    expectedClearUnlockWeaponIds: [],
    expectedClearUnlockEquipIds: [],
    expectedClearUnlockCharacterIds: [],
    expectedPostTotalFrameEnemyEventCount: 4,
    expectedEarliestPostTotalFrameEnemyEventStartFrame: 18000,
    expectedClearEnemySpawnEventCount: 0,
    expectedEarliestClearEnemySpawnStartFrame: 0,
    expectedClearMinorEnemySpawnEventCount: 0,
    expectedEarliestClearMinorEnemySpawnStartFrame: 0,
  },
  {
    id: "level-pilipala-company-clear-type-two-post-timer-spawns",
    levelId: 13,
    expectedClearType: 2,
    expectedTotalFrames: 18000,
    expectedClearCoin: 1000,
    expectedClearEnemyEventId: 1,
    expectedClearMinorEnemyEventIds: [],
    expectedClearUnlockLevelIds: [],
    expectedClearUnlockWeaponIds: [],
    expectedClearUnlockEquipIds: [],
    expectedClearUnlockCharacterIds: [],
    expectedPostTotalFrameEnemyEventCount: 10,
    expectedEarliestPostTotalFrameEnemyEventStartFrame: 18000,
    expectedClearEnemySpawnEventCount: 0,
    expectedEarliestClearEnemySpawnStartFrame: 0,
    expectedClearMinorEnemySpawnEventCount: 0,
    expectedEarliestClearMinorEnemySpawnStartFrame: 0,
  },
  {
    id: "level-sky-island-final-boss-clear-event",
    levelId: 15,
    expectedClearType: 1,
    expectedTotalFrames: 18000,
    expectedClearCoin: 1000,
    expectedClearEnemyEventId: 1,
    expectedClearMinorEnemyEventIds: [],
    expectedClearUnlockLevelIds: [16],
    expectedClearUnlockWeaponIds: [],
    expectedClearUnlockEquipIds: [],
    expectedClearUnlockCharacterIds: [113, 114],
    expectedPostTotalFrameEnemyEventCount: 5,
    expectedEarliestPostTotalFrameEnemyEventStartFrame: 18000,
    expectedClearEnemySpawnEventCount: 1,
    expectedEarliestClearEnemySpawnStartFrame: 18000,
    expectedClearMinorEnemySpawnEventCount: 0,
    expectedEarliestClearMinorEnemySpawnStartFrame: 0,
  },
  {
    id: "level-claw-machine-final-boss-clear-event",
    levelId: 27,
    expectedClearType: 1,
    expectedTotalFrames: 18000,
    expectedClearCoin: 1000,
    expectedClearEnemyEventId: 1,
    expectedClearMinorEnemyEventIds: [100],
    expectedClearUnlockLevelIds: [28],
    expectedClearUnlockWeaponIds: [],
    expectedClearUnlockEquipIds: [],
    expectedClearUnlockCharacterIds: [],
    expectedPostTotalFrameEnemyEventCount: 1,
    expectedEarliestPostTotalFrameEnemyEventStartFrame: 18000,
    expectedClearEnemySpawnEventCount: 1,
    expectedEarliestClearEnemySpawnStartFrame: 18000,
    expectedClearMinorEnemySpawnEventCount: 1,
    expectedEarliestClearMinorEnemySpawnStartFrame: 2,
  },
  {
    id: "level-anniversary-final-boss-clear-event",
    levelId: 28,
    expectedClearType: 1,
    expectedTotalFrames: 18000,
    expectedClearCoin: 1000,
    expectedClearEnemyEventId: 1,
    expectedClearMinorEnemyEventIds: [],
    expectedClearUnlockLevelIds: [],
    expectedClearUnlockWeaponIds: [],
    expectedClearUnlockEquipIds: [],
    expectedClearUnlockCharacterIds: [],
    expectedPostTotalFrameEnemyEventCount: 1,
    expectedEarliestPostTotalFrameEnemyEventStartFrame: 18000,
    expectedClearEnemySpawnEventCount: 1,
    expectedEarliestClearEnemySpawnStartFrame: 18000,
    expectedClearMinorEnemySpawnEventCount: 0,
    expectedEarliestClearMinorEnemySpawnStartFrame: 0,
  },
];

const LEVEL_EVENT_TRIGGER_CASE_SPECS: LevelEventTriggerCaseSpec[] = [
  {
    id: "level-claw-machine-trigger-type-two-boss-chain",
    levelId: 27,
    expectedLevelName: "娃娃机",
    expectedTriggerType: 2,
    expectedTriggerEnemyEventId: 0,
    expectedTriggeredEventCount: 12,
    expectedFirstEventIndex: 27,
    expectedFirstEventName: "id3 哥布林王 lv1",
    expectedFirstEventId: 3,
    expectedFirstEventStartFrame: 5400,
    expectedFirstEnemyTypeId: 21,
    expectedLastEventIndex: 38,
    expectedLastEventName: "10:00 米歇尔机器人 lv4",
    expectedLastEventId: 14,
    expectedLastEventStartFrame: 18000,
    expectedLastEnemyTypeId: 44,
  },
];

const LEVEL_AI_STATE_CHANGE_CASE_SPECS: LevelAIStateChangeCaseSpec[] = [
  {
    id: "level-sky-island-final-boss-ai-state-change",
    levelId: 15,
    eventIndex: 24,
    targetSpawnEventIndex: 23,
    expectedStartFrame: 18005,
    expectedTotalFrames: 5,
    expectedTargetEnemyEventId: 1,
    expectedTargetAIStateId: 2,
    expectedTargetEnemyTypeId: 32,
    expectedTargetEnemyAITypeId: 32,
  },
  {
    id: "level-claw-machine-boss-ai-state-change",
    levelId: 27,
    eventIndex: 14,
    targetSpawnEventIndex: 11,
    expectedStartFrame: 1800,
    expectedTotalFrames: 2,
    expectedTargetEnemyEventId: 100,
    expectedTargetAIStateId: 30,
    expectedTargetEnemyTypeId: 80,
    expectedTargetEnemyAITypeId: 80,
  },
];

const MAP_CASE_SPECS: MapCaseSpec[] = [
  {
    id: "map-09-terrain-pits-and-prefab-bounds",
    mapPrefabName: "Map_09",
    expectedLevelId: 14,
    expectedPitCount: 246,
    expectedTerrainLayerTileCount: 246,
  },
  {
    id: "map-10-terrain-pits-and-prefab-bounds",
    mapPrefabName: "Map_10",
    expectedLevelId: 15,
    expectedPitCount: 1316,
    expectedTerrainLayerTileCount: 1316,
  },
  {
    id: "map-11-terrain-pits-and-prefab-bounds",
    mapPrefabName: "Map_11",
    expectedLevelId: 16,
    expectedPitCount: 7739,
    expectedTerrainLayerTileCount: 7739,
  },
  {
    id: "map-12-terrain-pits-and-prefab-bounds",
    mapPrefabName: "Map_12",
    expectedLevelId: 17,
    expectedPitCount: 1783,
    expectedTerrainLayerTileCount: 1783,
  },
  {
    id: "map-13-terrain-pits-and-prefab-bounds",
    mapPrefabName: "Map_13",
    expectedLevelId: 18,
    expectedPitCount: 6941,
    expectedTerrainLayerTileCount: 6941,
  },
  {
    id: "map-14-terrain-pits-and-prefab-bounds",
    mapPrefabName: "Map_14",
    expectedLevelId: 27,
    expectedPitCount: 948,
    expectedTerrainLayerTileCount: 948,
  },
  {
    id: "map-15-terrain-pits-and-prefab-bounds",
    mapPrefabName: "Map_15",
    expectedLevelId: 28,
    expectedPitCount: 2146,
    expectedTerrainLayerTileCount: 2146,
  },
];

export function buildNfoCnParityFixture(
  runtimeData: NfoOfflineRuntimeData,
): NfoCnParityFixture {
  const activeSkillShooterIds = getActiveSkillShooterIds(runtimeData);
  const activeSkillShooterEventCount = getActiveSkillShooterEventCount(runtimeData);
  const weaponLevelShooterCount = getWeaponLevelShooterCount(runtimeData);

  return {
    schemaVersion: 1,
    purpose: "cn-nfo-offline-parity-fixtures",
    resourceVersion: runtimeData.resourceVersion,
    activeSkillShooterCount: activeSkillShooterIds.size,
    activeSkillShooterEventCount,
    weaponLevelShooterCount,
    selectedShooterCases: SHOOTER_CASE_SPECS.map((spec) => (
      buildShooterCase(runtimeData, activeSkillShooterIds, spec)
    )),
    selectedWeaponShooterCases: WEAPON_SHOOTER_CASE_SPECS.map((spec) => (
      buildWeaponShooterCase(runtimeData, spec)
    )),
    selectedWeaponDirectFireCases: WEAPON_DIRECT_FIRE_CASE_SPECS.map((spec) => (
      buildWeaponDirectFireCase(runtimeData, spec)
    )),
    selectedWeaponMinionCases: WEAPON_MINION_CASE_SPECS.map((spec) => (
      buildWeaponMinionCase(runtimeData, spec)
    )),
    selectedWeaponSelfBuffCases: WEAPON_SELF_BUFF_CASE_SPECS.map((spec) => (
      buildWeaponSelfBuffCase(runtimeData, spec)
    )),
    selectedShooterRotationCases: SHOOTER_ROTATION_CASE_SPECS.map((spec) => (
      buildShooterRotationCase(runtimeData, spec)
    )),
    selectedShooterOnDestroyCases: SHOOTER_ON_DESTROY_CASE_SPECS.map((spec) => (
      buildShooterOnDestroyCase(runtimeData, spec)
    )),
    selectedActiveSkillShooterSpawnCases: ACTIVE_SKILL_SHOOTER_SPAWN_CASE_SPECS.map((spec) => (
      buildActiveSkillShooterSpawnCase(runtimeData, spec)
    )),
    selectedActiveSkillShooterHitBuffCases: ACTIVE_SKILL_SHOOTER_HIT_BUFF_CASE_SPECS.map((spec) => (
      buildActiveSkillShooterHitBuffCase(runtimeData, spec)
    )),
    selectedAIActionCases: AI_ACTION_CASE_SPECS.map((spec) => (
      buildAIActionCase(runtimeData, spec)
    )),
    selectedAIStateTimelineCases: AI_STATE_TIMELINE_CASE_SPECS.map((spec) => (
      buildAIStateTimelineCase(runtimeData, spec)
    )),
    selectedAIStateFireAllWeaponCases: AI_STATE_FIRE_ALL_WEAPON_CASE_SPECS.map((spec) => (
      buildAIStateFireAllWeaponCase(runtimeData, spec)
    )),
    selectedAIStateShooterSpawnCases: AI_STATE_SHOOTER_SPAWN_CASE_SPECS.map((spec) => (
      buildAIStateShooterSpawnCase(runtimeData, spec)
    )),
    selectedAIStateNoCollidingCases: AI_STATE_NO_COLLIDING_CASE_SPECS.map((spec) => (
      buildAIStateNoCollidingCase(runtimeData, spec)
    )),
    selectedAIStateTeleportCases: AI_STATE_TELEPORT_CASE_SPECS.map((spec) => (
      buildAIStateTeleportCase(runtimeData, spec)
    )),
    selectedAIStateMovementCases: AI_STATE_MOVEMENT_CASE_SPECS.map((spec) => (
      buildAIStateMovementCase(runtimeData, spec)
    )),
    selectedAIStateBuffCases: AI_STATE_BUFF_CASE_SPECS.map((spec) => (
      buildAIStateBuffCase(runtimeData, spec)
    )),
    selectedAIStateCommonStateCases: AI_STATE_COMMON_STATE_CASE_SPECS.map((spec) => (
      buildAIStateCommonStateCase(runtimeData, spec)
    )),
    selectedAIStateAnimationCases: AI_STATE_ANIMATION_CASE_SPECS.map((spec) => (
      buildAIStateAnimationCase(runtimeData, spec)
    )),
    selectedActiveSkillBuffCases: ACTIVE_SKILL_BUFF_CASE_SPECS.map((spec) => (
      buildActiveSkillBuffCase(runtimeData, spec)
    )),
    selectedActiveSkillSummonCases: ACTIVE_SKILL_SUMMON_CASE_SPECS.map((spec) => (
      buildActiveSkillSummonCase(runtimeData, spec)
    )),
    selectedItemCases: ITEM_CASE_SPECS.map((spec) => (
      buildItemCase(runtimeData, spec)
    )),
    selectedDropCases: DROP_CASE_SPECS.map((spec) => (
      buildDropCase(runtimeData, spec)
    )),
    selectedLevelEnemySpawnCases: LEVEL_ENEMY_SPAWN_CASE_SPECS.map((spec) => (
      buildLevelEnemySpawnCase(runtimeData, spec)
    )),
    selectedLevelClearCases: LEVEL_CLEAR_CASE_SPECS.map((spec) => (
      buildLevelClearCase(runtimeData, spec)
    )),
    selectedLevelEventTriggerCases: LEVEL_EVENT_TRIGGER_CASE_SPECS.map((spec) => (
      buildLevelEventTriggerCase(runtimeData, spec)
    )),
    selectedLevelAIStateChangeCases: LEVEL_AI_STATE_CHANGE_CASE_SPECS.map((spec) => (
      buildLevelAIStateChangeCase(runtimeData, spec)
    )),
    selectedMapCases: MAP_CASE_SPECS.map((spec) => (
      buildMapCase(runtimeData, spec)
    )),
  };
}

function getActiveSkillShooterIds(runtimeData: NfoOfflineRuntimeData): Set<number> {
  const activeSkillShooterIds = new Set<number>();
  for (const activeSkill of runtimeData.activeSkills) {
    for (const level of activeSkill.levels) {
      for (const event of level.events) {
        if (event.bulletShooterId > 0) {
          activeSkillShooterIds.add(event.bulletShooterId);
        }
      }
    }
  }
  return activeSkillShooterIds;
}

function getActiveSkillShooterEventCount(runtimeData: NfoOfflineRuntimeData): number {
  let count = 0;
  for (const activeSkill of runtimeData.activeSkills) {
    for (const level of activeSkill.levels) {
      for (const event of level.events) {
        if (event.bulletShooterId > 0) {
          count += 1;
        }
      }
    }
  }
  return count;
}

function getWeaponLevelShooterCount(runtimeData: NfoOfflineRuntimeData): number {
  let count = 0;
  for (const weapon of runtimeData.weapons) {
    for (const level of weapon.levels) {
      if ((level.bulletShooterId ?? 0) > 0) {
        count += 1;
      }
    }
  }
  return count;
}

function buildShooterCase(
  runtimeData: NfoOfflineRuntimeData,
  activeSkillShooterIds: Set<number>,
  spec: ShooterCaseSpec,
): NfoCnParityShooterCase {
  if (!activeSkillShooterIds.has(spec.shooterId)) {
    throw new Error(`Shooter ${spec.shooterId} is not referenced by activeSkillData.`);
  }

  const shooter = runtimeData.bulletShooters.find((candidate) => candidate.id === spec.shooterId);
  if (!shooter) {
    throw new Error(`Shooter ${spec.shooterId} is missing from BulletShooterData.`);
  }

  const eventIndex = shooter.events.findIndex((event) => (
    event.fireBullets.some((fireBullet) => fireBullet.bulletTypeId === spec.bulletTypeId)
  ));
  const event = eventIndex >= 0 ? shooter.events[eventIndex] : null;
  if (!event) {
    throw new Error(`Shooter ${spec.shooterId} is missing bullet ${spec.bulletTypeId}.`);
  }

  return createShooterCase(spec, shooter, event, eventIndex);
}

function buildWeaponShooterCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: WeaponShooterCaseSpec,
): NfoCnParityWeaponShooterCase {
  const weapon = runtimeData.weapons.find((candidate) => candidate.id === spec.weaponId);
  if (!weapon) {
    throw new Error(`Weapon ${spec.weaponId} is missing from WeaponData.`);
  }

  const weaponLevel = weapon.levels.find((candidate) => candidate.level === spec.weaponLevel);
  if (!weaponLevel) {
    throw new Error(`Weapon ${spec.weaponId} is missing level ${spec.weaponLevel}.`);
  }

  if ((weaponLevel.bulletShooterId ?? 0) !== spec.shooterId) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected shooter `
      + `${spec.shooterId}, got ${weaponLevel.bulletShooterId ?? 0}.`,
    );
  }

  const shooter = runtimeData.bulletShooters.find((candidate) => candidate.id === spec.shooterId);
  if (!shooter) {
    throw new Error(`Shooter ${spec.shooterId} is missing from BulletShooterData.`);
  }

  const eventIndex = shooter.events.findIndex((event) => (
    event.fireBullets.some((fireBullet) => fireBullet.bulletTypeId === spec.bulletTypeId)
    && (
      spec.expectedEventFrame === undefined
      || event.frame === spec.expectedEventFrame
    )
    && (
      spec.expectedDirectionOffsetAngle === undefined
      || event.bulletFireDirectionOffsetAngle === spec.expectedDirectionOffsetAngle
    )
  ));
  const event = eventIndex >= 0 ? shooter.events[eventIndex] : null;
  if (!event) {
    throw new Error(`Shooter ${spec.shooterId} is missing bullet ${spec.bulletTypeId}.`);
  }

  const fireBullet = event.fireBullets.find((candidate) => (
    candidate.bulletTypeId === spec.bulletTypeId
  ));
  if (!fireBullet) {
    throw new Error(`Weapon shooter case ${spec.id} is missing its selected fire bullet.`);
  }
  if (
    spec.expectedEventFrame !== undefined
    && event.frame !== spec.expectedEventFrame
  ) {
    throw new Error(
      `Weapon shooter case ${spec.id} expected event frame `
      + `${spec.expectedEventFrame}, got ${event.frame}.`,
    );
  }
  if (
    spec.expectedDirectionOffsetAngle !== undefined
    && event.bulletFireDirectionOffsetAngle !== spec.expectedDirectionOffsetAngle
  ) {
    throw new Error(
      `Weapon shooter case ${spec.id} expected direction offset angle `
      + `${spec.expectedDirectionOffsetAngle}, got ${event.bulletFireDirectionOffsetAngle}.`,
    );
  }
  if (
    spec.expectedIsLoopEvent !== undefined
    && event.isLoopEvent !== spec.expectedIsLoopEvent
  ) {
    throw new Error(
      `Weapon shooter case ${spec.id} expected loop event `
      + `${spec.expectedIsLoopEvent}, got ${event.isLoopEvent}.`,
    );
  }
  if (
    spec.expectedLoopFrameInterval !== undefined
    && event.loopFrameInterval !== spec.expectedLoopFrameInterval
  ) {
    throw new Error(
      `Weapon shooter case ${spec.id} expected loop interval `
      + `${spec.expectedLoopFrameInterval}, got ${event.loopFrameInterval}.`,
    );
  }
  if (
    spec.expectedHitTargetType !== undefined
    && fireBullet.bulletHitTargetType !== spec.expectedHitTargetType
  ) {
    throw new Error(
      `Weapon shooter case ${spec.id} expected hit target `
      + `${spec.expectedHitTargetType}, got ${fireBullet.bulletHitTargetType}.`,
    );
  }
  if (
    spec.expectedNoDamage !== undefined
    && fireBullet.noDamage !== spec.expectedNoDamage
  ) {
    throw new Error(
      `Weapon shooter case ${spec.id} expected noDamage `
      + `${spec.expectedNoDamage}, got ${fireBullet.noDamage}.`,
    );
  }
  if (
    spec.expectedHitBuffId !== undefined
    && fireBullet.hitBuffId !== spec.expectedHitBuffId
  ) {
    throw new Error(
      `Weapon shooter case ${spec.id} expected hit buff `
      + `${spec.expectedHitBuffId}, got ${fireBullet.hitBuffId}.`,
    );
  }

  return {
    id: spec.id,
    weaponId: weapon.id,
    weaponName: weapon.name,
    weaponLevel: weaponLevel.level,
    weaponFireCooldownFrames: weaponLevel.fireCooldownFrames,
    weaponDirectFireBulletCount: weaponLevel.fireBullets.length,
    shooterId: shooter.id,
    shooterName: shooter.name,
    shooterLifeTimeFrames: shooter.lifeTimeFrames,
    shooterBehaviorType: shooter.behaviorType,
    shooterFollowsOwnerDirection: shooter.followsOwnerDirection,
    eventIndex,
    eventName: event.name,
    eventFrame: event.frame,
    isLoopEvent: event.isLoopEvent,
    loopFrameInterval: event.loopFrameInterval,
    directionType: event.bulletFireDirectionType,
    formationType: event.bulletFormationType,
    formationParam1: event.bulletFormationParam1,
    formationOffsetX: event.bulletFormationOffsetX,
    formationOffsetY: event.bulletFormationOffsetY,
    directionOffsetAngle: event.bulletFireDirectionOffsetAngle,
    bulletTypeId: fireBullet.bulletTypeId,
    bulletCount: fireBullet.bulletCount,
    bulletSpeed: fireBullet.bulletSpeed,
    bulletSize: fireBullet.bulletSize,
    bulletLifeTimeFrames: fireBullet.bulletLifeTime,
    bulletHitTimes: fireBullet.bulletHitTimes,
    bulletAttack: fireBullet.bulletAttack,
    bulletNoDamage: fireBullet.noDamage,
    bulletDamageJudgeType: fireBullet.bulletDamageJudgeType,
    bulletDamageJudgeDelayFrames: fireBullet.bulletDamageJudgeDelayFrames,
    bulletDamageJudgeCooldownFrames: fireBullet.bulletDamageJudgeCooldownFrames,
    bulletHitTargetType: fireBullet.bulletHitTargetType,
    bulletColliderType: fireBullet.bulletColliderType,
    hitBuffId: fireBullet.hitBuffId,
    hitBuffLevel: fireBullet.hitBuffLevel,
    expectedDirectionMode: spec.expectedDirectionMode,
  };
}

function buildWeaponDirectFireCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: WeaponDirectFireCaseSpec,
): NfoCnParityWeaponDirectFireCase {
  const weapon = runtimeData.weapons.find((candidate) => candidate.id === spec.weaponId);
  if (!weapon) {
    throw new Error(`Weapon ${spec.weaponId} is missing from WeaponData.`);
  }

  const weaponLevel = weapon.levels.find((candidate) => candidate.level === spec.weaponLevel);
  if (!weaponLevel) {
    throw new Error(`Weapon ${spec.weaponId} is missing level ${spec.weaponLevel}.`);
  }

  const fireBulletIndex = spec.fireBulletIndex ?? weaponLevel.fireBullets.findIndex((candidate) => (
    candidate.bulletTypeId === spec.bulletTypeId
  ));
  const fireBullet = weaponLevel.fireBullets[fireBulletIndex];
  if (!fireBullet) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} is missing bullet `
      + `${spec.bulletTypeId}.`,
    );
  }
  if (fireBullet.bulletTypeId !== spec.bulletTypeId) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected bullet index ${fireBulletIndex} `
      + `to be type ${spec.bulletTypeId}, got ${fireBullet.bulletTypeId}.`,
    );
  }
  if (
    spec.expectedDirectFireBulletCount !== undefined
    && weaponLevel.fireBullets.length !== spec.expectedDirectFireBulletCount
  ) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected direct fire bullet count `
      + `${spec.expectedDirectFireBulletCount}, got ${weaponLevel.fireBullets.length}.`,
    );
  }
  if (
    spec.expectedWeaponGroupCount !== undefined
    && weaponLevel.groupCount !== spec.expectedWeaponGroupCount
  ) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected group count `
      + `${spec.expectedWeaponGroupCount}, got ${weaponLevel.groupCount}.`,
    );
  }
  if (
    spec.expectedWeaponFireGroupCooldownFrames !== undefined
    && weaponLevel.fireGroupCooldownFrames !== spec.expectedWeaponFireGroupCooldownFrames
  ) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected fire group cooldown `
      + `${spec.expectedWeaponFireGroupCooldownFrames}, got ${weaponLevel.fireGroupCooldownFrames}.`,
    );
  }
  if (
    spec.expectedBulletSpeed !== undefined
    && fireBullet.bulletSpeed !== spec.expectedBulletSpeed
  ) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected bullet speed `
      + `${spec.expectedBulletSpeed}, got ${fireBullet.bulletSpeed}.`,
    );
  }
  if (
    spec.expectedDamageJudgeType !== undefined
    && fireBullet.bulletDamageJudgeType !== spec.expectedDamageJudgeType
  ) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected damage judge `
      + `${spec.expectedDamageJudgeType}, got ${fireBullet.bulletDamageJudgeType}.`,
    );
  }
  if (
    spec.expectedColliderType !== undefined
    && fireBullet.bulletColliderType !== spec.expectedColliderType
  ) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected collider type `
      + `${spec.expectedColliderType}, got ${fireBullet.bulletColliderType}.`,
    );
  }
  if (
    spec.expectedHitBuffId !== undefined
    && fireBullet.hitBuffId !== spec.expectedHitBuffId
  ) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected hit buff `
      + `${spec.expectedHitBuffId}, got ${fireBullet.hitBuffId}.`,
    );
  }
  if (
    spec.expectedForceType !== undefined
    && fireBullet.bulletForceType !== spec.expectedForceType
  ) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected force type `
      + `${spec.expectedForceType}, got ${fireBullet.bulletForceType}.`,
    );
  }
  if (
    spec.expectedForce !== undefined
    && fireBullet.bulletForce !== spec.expectedForce
  ) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected force `
      + `${spec.expectedForce}, got ${fireBullet.bulletForce}.`,
    );
  }
  if (
    spec.expectedWeaponDescriptionIncludes !== undefined
    && !(weapon.description ?? "").includes(spec.expectedWeaponDescriptionIncludes)
  ) {
    throw new Error(
      `Weapon direct fire case ${spec.id} expected description to include `
      + `${spec.expectedWeaponDescriptionIncludes}.`,
    );
  }

  return {
    id: spec.id,
    weaponId: weapon.id,
    weaponName: weapon.name,
    weaponDescription: weapon.description ?? "",
    weaponLevel: weaponLevel.level,
    fireBulletIndex,
    requiresEnemyTarget: spec.expectedRequiresEnemyTarget ?? false,
    weaponFireCooldownFrames: weaponLevel.fireCooldownFrames,
    weaponFireGroupCooldownFrames: weaponLevel.fireGroupCooldownFrames,
    weaponGroupCount: weaponLevel.groupCount,
    weaponDirectFireBulletCount: weaponLevel.fireBullets.length,
    bulletTypeId: fireBullet.bulletTypeId,
    bulletCount: fireBullet.bulletCount,
    bulletAttack: fireBullet.bulletAttack,
    bulletSpeed: fireBullet.bulletSpeed,
    bulletNoDamage: fireBullet.noDamage,
    bulletDamageJudgeType: fireBullet.bulletDamageJudgeType,
    bulletHitTargetType: fireBullet.bulletHitTargetType,
    bulletSize: fireBullet.bulletSize,
    bulletSize2: fireBullet.bulletSize2,
    bulletLifeTimeFrames: fireBullet.bulletLifeTime,
    bulletHitTimes: fireBullet.bulletHitTimes,
    bulletDamageJudgeDelayFrames: fireBullet.bulletDamageJudgeDelayFrames,
    bulletDamageJudgeCooldownFrames: fireBullet.bulletDamageJudgeCooldownFrames,
    bulletColliderType: fireBullet.bulletColliderType,
    bulletForceType: fireBullet.bulletForceType,
    bulletForce: fireBullet.bulletForce,
    hitBuffId: fireBullet.hitBuffId,
    hitBuffLevel: fireBullet.hitBuffLevel,
    motionMode: spec.expectedMotionMode ?? "linear",
  };
}

function buildWeaponMinionCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: WeaponMinionCaseSpec,
): NfoCnParityWeaponMinionCase {
  const weapon = runtimeData.weapons.find((candidate) => candidate.id === spec.weaponId);
  if (!weapon) {
    throw new Error(`Weapon ${spec.weaponId} is missing from WeaponData.`);
  }

  const weaponLevel = weapon.levels.find((candidate) => candidate.level === spec.weaponLevel);
  if (!weaponLevel) {
    throw new Error(`Weapon ${spec.weaponId} is missing level ${spec.weaponLevel}.`);
  }

  const weaponMinionId = weaponLevel.spawnMinion?.minionId || weapon.minionId || 0;
  if (weaponMinionId !== spec.expectedMinionId) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected minion `
      + `${spec.expectedMinionId}, got ${weaponMinionId}.`,
    );
  }

  const minionCount = weaponLevel.spawnMinion?.spawnCount || weaponLevel.minionCount || 0;
  if (minionCount !== spec.expectedMinionCount) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected minion count `
      + `${spec.expectedMinionCount}, got ${minionCount}.`,
    );
  }

  const fireBullet = spec.expectedBulletTypeId
    ? weaponLevel.fireBullets.find((candidate) => (
      candidate.bulletTypeId === spec.expectedBulletTypeId
    ))
    : null;
  if (spec.expectedBulletTypeId && !fireBullet) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} is missing bullet `
      + `${spec.expectedBulletTypeId}.`,
    );
  }

  const minion = runtimeData.minions.find((candidate) => candidate.id === weaponMinionId);
  if (!minion) {
    throw new Error(`Minion ${weaponMinionId} is missing from MinionData.`);
  }

  const spawnMinionAITypeId = weaponLevel.spawnMinion?.minionAiTypeId ?? 0;
  if (
    spec.expectedSpawnMinionAITypeId !== undefined
    && spawnMinionAITypeId !== spec.expectedSpawnMinionAITypeId
  ) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected spawn AI `
      + `${spec.expectedSpawnMinionAITypeId}, got ${spawnMinionAITypeId}.`,
    );
  }

  const spawnMinionFormation = weaponLevel.spawnMinion?.spawnFormation ?? 0;
  if (
    spec.expectedSpawnMinionFormation !== undefined
    && spawnMinionFormation !== spec.expectedSpawnMinionFormation
  ) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected spawn formation `
      + `${spec.expectedSpawnMinionFormation}, got ${spawnMinionFormation}.`,
    );
  }

  const spawnRadiusMin = weaponLevel.spawnMinion?.spawnRadiusMin ?? 0;
  if (
    spec.expectedSpawnRadiusMin !== undefined
    && spawnRadiusMin !== spec.expectedSpawnRadiusMin
  ) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected spawn min radius `
      + `${spec.expectedSpawnRadiusMin}, got ${spawnRadiusMin}.`,
    );
  }

  const spawnRadiusMax = weaponLevel.spawnMinion?.spawnRadiusMax ?? 0;
  if (
    spec.expectedSpawnRadiusMax !== undefined
    && spawnRadiusMax !== spec.expectedSpawnRadiusMax
  ) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected spawn max radius `
      + `${spec.expectedSpawnRadiusMax}, got ${spawnRadiusMax}.`,
    );
  }

  const effectiveAITypeId = spawnMinionAITypeId || minion.aiTypeId;
  const ai = runtimeData.ais.find((candidate) => candidate.id === effectiveAITypeId);
  const aiState = ai
    ? ai.states.find((candidate) => candidate.id === ai.firstStateId) ?? ai.states[0] ?? null
    : null;
  const aiStateShooterId = aiState?.bulletShooterId ?? 0;
  if (
    spec.expectedAIStateShooterId !== undefined
    && aiStateShooterId !== spec.expectedAIStateShooterId
  ) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected AI shooter `
      + `${spec.expectedAIStateShooterId}, got ${aiStateShooterId}.`,
    );
  }

  const aiShooter = aiStateShooterId > 0
    ? runtimeData.bulletShooters.find((candidate) => candidate.id === aiStateShooterId)
    : null;
  const aiShooterBullet = spec.expectedAIStateShooterBulletTypeId
    ? aiShooter?.events
      .flatMap((event) => event.fireBullets)
      .find((candidate) => candidate.bulletTypeId === spec.expectedAIStateShooterBulletTypeId)
    : null;
  if (spec.expectedAIStateShooterBulletTypeId && !aiShooterBullet) {
    throw new Error(
      `AI shooter ${aiStateShooterId} is missing bullet `
      + `${spec.expectedAIStateShooterBulletTypeId}.`,
    );
  }
  if (
    spec.expectedAIStateShooterBulletSize !== undefined
    && (aiShooterBullet?.bulletSize ?? 0) !== spec.expectedAIStateShooterBulletSize
  ) {
    throw new Error(
      `AI shooter ${aiStateShooterId} expected bullet size `
      + `${spec.expectedAIStateShooterBulletSize}, got ${aiShooterBullet?.bulletSize ?? 0}.`,
    );
  }
  if (
    spec.expectedAIStateShooterHitBuffId !== undefined
    && (aiShooterBullet?.hitBuffId ?? 0) !== spec.expectedAIStateShooterHitBuffId
  ) {
    throw new Error(
      `AI shooter ${aiStateShooterId} expected hit buff `
      + `${spec.expectedAIStateShooterHitBuffId}, got ${aiShooterBullet?.hitBuffId ?? 0}.`,
    );
  }
  if (
    spec.expectedBulletDamageJudgeType !== undefined
    && (fireBullet?.bulletDamageJudgeType ?? 0) !== spec.expectedBulletDamageJudgeType
  ) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected bullet damage judge `
      + `${spec.expectedBulletDamageJudgeType}, got ${fireBullet?.bulletDamageJudgeType ?? 0}.`,
    );
  }
  if (
    spec.expectedBulletColliderType !== undefined
    && (fireBullet?.bulletColliderType ?? 0) !== spec.expectedBulletColliderType
  ) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected bullet collider `
      + `${spec.expectedBulletColliderType}, got ${fireBullet?.bulletColliderType ?? 0}.`,
    );
  }
  if (
    spec.expectedBulletDamageJudgeDelayFrames !== undefined
    && (fireBullet?.bulletDamageJudgeDelayFrames ?? 0) !== spec.expectedBulletDamageJudgeDelayFrames
  ) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected bullet damage delay `
      + `${spec.expectedBulletDamageJudgeDelayFrames}, got `
      + `${fireBullet?.bulletDamageJudgeDelayFrames ?? 0}.`,
    );
  }
  if (
    spec.expectedBulletDamageJudgeCooldownFrames !== undefined
    && (fireBullet?.bulletDamageJudgeCooldownFrames ?? 0)
      !== spec.expectedBulletDamageJudgeCooldownFrames
  ) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected bullet damage cooldown `
      + `${spec.expectedBulletDamageJudgeCooldownFrames}, got `
      + `${fireBullet?.bulletDamageJudgeCooldownFrames ?? 0}.`,
    );
  }
  if (
    spec.expectedHitBuffId !== undefined
    && (fireBullet?.hitBuffId ?? 0) !== spec.expectedHitBuffId
  ) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected hit buff `
      + `${spec.expectedHitBuffId}, got ${fireBullet?.hitBuffId ?? 0}.`,
    );
  }

  return {
    id: spec.id,
    weaponId: weapon.id,
    weaponName: weapon.name,
    weaponLevel: weaponLevel.level,
    weaponType: weapon.weaponType ?? 0,
    weaponMinionId: weapon.minionId ?? 0,
    minionId: minion.id,
    minionName: minion.name,
    minionAITypeId: minion.aiTypeId,
    weaponFireCooldownFrames: weaponLevel.fireCooldownFrames,
    minionCount,
    spawnMinionId: weaponLevel.spawnMinion?.minionId ?? 0,
    spawnMinionAITypeId,
    spawnMinionCount: weaponLevel.spawnMinion?.spawnCount ?? 0,
    spawnMinionFormation,
    spawnRadiusMin,
    spawnRadiusMax,
    aiStateShooterId,
    aiStateName: aiState?.name ?? "",
    aiShooterBulletTypeId: aiShooterBullet?.bulletTypeId ?? 0,
    aiShooterBulletSize: aiShooterBullet?.bulletSize ?? 0,
    aiShooterBulletNoDamage: aiShooterBullet?.noDamage ?? false,
    aiShooterBulletHitBuffId: aiShooterBullet?.hitBuffId ?? 0,
    aiShooterBulletHitBuffLevel: aiShooterBullet?.hitBuffLevel ?? 0,
    directFireBulletCount: weaponLevel.fireBullets.length,
    bulletTypeId: fireBullet?.bulletTypeId ?? 0,
    bulletAttack: fireBullet?.bulletAttack ?? 0,
    bulletSpeed: fireBullet?.bulletSpeed ?? 0,
    bulletSize: fireBullet?.bulletSize ?? 0,
    bulletLifeTimeFrames: fireBullet?.bulletLifeTime ?? 0,
    bulletHitTimes: fireBullet?.bulletHitTimes ?? 0,
    bulletDamageJudgeType: fireBullet?.bulletDamageJudgeType ?? 0,
    bulletColliderType: fireBullet?.bulletColliderType ?? 0,
    bulletDamageJudgeDelayFrames: fireBullet?.bulletDamageJudgeDelayFrames ?? 0,
    bulletDamageJudgeCooldownFrames: fireBullet?.bulletDamageJudgeCooldownFrames ?? 0,
    bulletHitTargetType: fireBullet?.bulletHitTargetType ?? 0,
    hitBuffId: fireBullet?.hitBuffId ?? 0,
    hitBuffLevel: fireBullet?.hitBuffLevel ?? 0,
  };
}

function buildWeaponSelfBuffCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: WeaponSelfBuffCaseSpec,
): NfoCnParityWeaponSelfBuffCase {
  const weapon = runtimeData.weapons.find((candidate) => candidate.id === spec.weaponId);
  if (!weapon) {
    throw new Error(`Weapon ${spec.weaponId} is missing from WeaponData.`);
  }

  const weaponLevel = weapon.levels.find((candidate) => candidate.level === spec.weaponLevel);
  if (!weaponLevel) {
    throw new Error(`Weapon ${spec.weaponId} is missing level ${spec.weaponLevel}.`);
  }
  if ((weaponLevel.selfBuffId ?? 0) !== spec.expectedSelfBuffId) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected self buff `
      + `${spec.expectedSelfBuffId}, got ${weaponLevel.selfBuffId ?? 0}.`,
    );
  }
  if ((weaponLevel.selfBuffLevel ?? 1) !== spec.expectedSelfBuffLevel) {
    throw new Error(
      `Weapon ${spec.weaponId} level ${spec.weaponLevel} expected self buff level `
      + `${spec.expectedSelfBuffLevel}, got ${weaponLevel.selfBuffLevel ?? 1}.`,
    );
  }

  const buff = runtimeData.buffs.find((candidate) => candidate.id === spec.expectedSelfBuffId);
  if (!buff) {
    throw new Error(`Buff ${spec.expectedSelfBuffId} is missing from BuffData.`);
  }
  if (buff.type !== spec.expectedBuffType) {
    throw new Error(
      `Buff ${buff.id} expected type ${spec.expectedBuffType}, got ${buff.type}.`,
    );
  }

  const buffLevel = buff.levels.find((candidate) => (
    candidate.level === spec.expectedSelfBuffLevel
  ));
  if (!buffLevel) {
    throw new Error(`Buff ${buff.id} is missing level ${spec.expectedSelfBuffLevel}.`);
  }

  for (const expectedAttribute of spec.expectedAttributes) {
    const attribute = buffLevel.attributes.find((candidate) => (
      candidate.attributeType === expectedAttribute.attributeType
    ));
    if (!attribute || attribute.value !== expectedAttribute.value) {
      throw new Error(
        `Buff ${buff.id} expected attribute ${expectedAttribute.attributeType} `
        + `value ${expectedAttribute.value}, got ${attribute?.value ?? "missing"}.`,
      );
    }
  }

  const buffFireBullet = buffLevel.fireBullets[0] ?? null;
  const expectedBuffFireBulletFields: Array<[string, number | undefined, number]> = [
    ["bulletTypeId", spec.expectedBuffFireBulletTypeId, buffFireBullet?.bulletTypeId ?? 0],
    ["bulletAttack", spec.expectedBuffFireBulletAttack, buffFireBullet?.bulletAttack ?? 0],
    ["bulletSpeed", spec.expectedBuffFireBulletSpeed, buffFireBullet?.bulletSpeed ?? 0],
    ["bulletSize", spec.expectedBuffFireBulletSize, buffFireBullet?.bulletSize ?? 0],
    [
      "bulletLifeTimeFrames",
      spec.expectedBuffFireBulletLifeTimeFrames,
      buffFireBullet?.bulletLifeTime ?? 0,
    ],
    ["bulletHitTimes", spec.expectedBuffFireBulletHitTimes, buffFireBullet?.bulletHitTimes ?? 0],
    [
      "bulletDamageJudgeDelayFrames",
      spec.expectedBuffFireBulletDamageJudgeDelayFrames,
      buffFireBullet?.bulletDamageJudgeDelayFrames ?? 0,
    ],
    [
      "bulletDamageJudgeCooldownFrames",
      spec.expectedBuffFireBulletDamageJudgeCooldownFrames,
      buffFireBullet?.bulletDamageJudgeCooldownFrames ?? 0,
    ],
  ];
  for (const [fieldName, expected, actual] of expectedBuffFireBulletFields) {
    if (expected !== undefined && actual !== expected) {
      throw new Error(
        `Buff ${buff.id} expected FireBulletDatas ${fieldName} ${expected}, got ${actual}.`,
      );
    }
  }

  return {
    id: spec.id,
    weaponId: weapon.id,
    weaponName: weapon.name,
    weaponLevel: weaponLevel.level,
    weaponFireCooldownFrames: weaponLevel.fireCooldownFrames,
    selfBuffId: weaponLevel.selfBuffId ?? 0,
    selfBuffLevel: weaponLevel.selfBuffLevel ?? 1,
    buffId: buff.id,
    buffName: buff.name,
    buffType: buff.type,
    buffDuplicateType: buff.duplicateType,
    buffDurationFrames: buffLevel.durationFrames,
    buffValue: buffLevel.value,
    buffMaxStackCount: buffLevel.maxStackCount,
    buffAttributes: buffLevel.attributes.map((attribute) => ({ ...attribute })),
    buffFireBulletTypeId: buffFireBullet?.bulletTypeId ?? 0,
    buffFireBulletAttack: buffFireBullet?.bulletAttack ?? 0,
    buffFireBulletSpeed: buffFireBullet?.bulletSpeed ?? 0,
    buffFireBulletSize: buffFireBullet?.bulletSize ?? 0,
    buffFireBulletLifeTimeFrames: buffFireBullet?.bulletLifeTime ?? 0,
    buffFireBulletHitTimes: buffFireBullet?.bulletHitTimes ?? 0,
    buffFireBulletDamageJudgeDelayFrames: buffFireBullet?.bulletDamageJudgeDelayFrames ?? 0,
    buffFireBulletDamageJudgeCooldownFrames:
      buffFireBullet?.bulletDamageJudgeCooldownFrames ?? 0,
  };
}

function buildShooterRotationCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: ShooterRotationCaseSpec,
): NfoCnParityShooterRotationCase {
  const shooter = runtimeData.bulletShooters.find((candidate) => candidate.id === spec.shooterId);
  if (!shooter) {
    throw new Error(`Shooter ${spec.shooterId} is missing from BulletShooterData.`);
  }

  const eventIndex = shooter.events.findIndex((event) => (
    event.fireBullets.some((fireBullet) => fireBullet.bulletTypeId === spec.bulletTypeId)
  ));
  const event = eventIndex >= 0 ? shooter.events[eventIndex] : null;
  if (!event) {
    throw new Error(`Shooter ${spec.shooterId} is missing bullet ${spec.bulletTypeId}.`);
  }

  const fireBullet = event.fireBullets.find((candidate) => (
    candidate.bulletTypeId === spec.bulletTypeId
  ));
  if (!fireBullet) {
    throw new Error(`Shooter rotation case ${spec.id} is missing its selected fire bullet.`);
  }

  const bulletData = runtimeData.bullets.find((candidate) => candidate.id === spec.bulletTypeId);

  return {
    id: spec.id,
    shooterId: shooter.id,
    shooterName: shooter.name,
    eventIndex,
    eventName: event.name,
    eventFrame: event.frame,
    directionType: event.bulletFireDirectionType,
    rotationType: event.bulletRotationType,
    bulletDataRotationType: bulletData?.rotateType ?? 0,
    bulletTypeId: fireBullet.bulletTypeId,
    bulletHitTargetType: fireBullet.bulletHitTargetType,
    bulletSpeed: fireBullet.bulletSpeed,
    bulletColliderType: fireBullet.bulletColliderType,
    expectedDirectionMode: spec.expectedDirectionMode,
    expectedRotationType: spec.expectedRotationType,
  };
}

function buildShooterOnDestroyCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: ShooterOnDestroyCaseSpec,
): NfoCnParityShooterOnDestroyCase {
  const shooter = runtimeData.bulletShooters.find((candidate) => candidate.id === spec.shooterId);
  if (!shooter) {
    throw new Error(`Shooter ${spec.shooterId} is missing from BulletShooterData.`);
  }

  const eventIndex = shooter.events.findIndex((event) => (
    event.fireBullets.some((fireBullet) => (
      fireBullet.bulletTypeId === spec.parentBulletTypeId
      && fireBullet.onDestroyFireEventBulletId === spec.expectedOnDestroyEventBulletId
    ))
  ));
  const event = eventIndex >= 0 ? shooter.events[eventIndex] : null;
  if (!event) {
    throw new Error(
      `Shooter ${spec.shooterId} is missing parent bullet ${spec.parentBulletTypeId} `
      + `with on-destroy event ${spec.expectedOnDestroyEventBulletId}.`,
    );
  }

  const parentBullet = event.fireBullets.find((candidate) => (
    candidate.bulletTypeId === spec.parentBulletTypeId
    && candidate.onDestroyFireEventBulletId === spec.expectedOnDestroyEventBulletId
  ));
  if (!parentBullet) {
    throw new Error(`Shooter on-destroy case ${spec.id} is missing its parent bullet.`);
  }

  const childBullet = event.eventFireBullets.find((candidate) => (
    candidate.eventBulletId === spec.expectedOnDestroyEventBulletId
    && candidate.bulletTypeId === spec.expectedChildBulletTypeId
  ));
  if (!childBullet) {
    throw new Error(
      `Shooter ${spec.shooterId} is missing event bullet ${spec.expectedChildBulletTypeId} `
      + `for EventBulletID ${spec.expectedOnDestroyEventBulletId}.`,
    );
  }

  return {
    id: spec.id,
    shooterId: shooter.id,
    shooterName: shooter.name,
    eventIndex,
    eventName: event.name,
    eventFrame: event.frame,
    directionType: event.bulletFireDirectionType,
    formationOffsetX: event.bulletFormationOffsetX,
    formationOffsetY: event.bulletFormationOffsetY,
    parentBulletTypeId: parentBullet.bulletTypeId,
    parentBulletNoDamage: parentBullet.noDamage,
    parentBulletSpeed: parentBullet.bulletSpeed,
    parentBulletAttack: parentBullet.bulletAttack,
    parentBulletHitTargetType: parentBullet.bulletHitTargetType,
    parentBulletLifeTimeFrames: parentBullet.bulletLifeTime,
    parentOnDestroyEventBulletId: parentBullet.onDestroyFireEventBulletId,
    childBulletTypeId: childBullet.bulletTypeId,
    childEventBulletId: childBullet.eventBulletId,
    childBulletNoDamage: childBullet.noDamage,
    childBulletCount: childBullet.bulletCount,
    childBulletAttack: childBullet.bulletAttack,
    childBulletSpeed: childBullet.bulletSpeed,
    childBulletSize: childBullet.bulletSize,
    childBulletHitTargetType: childBullet.bulletHitTargetType,
    childBulletLifeTimeFrames: childBullet.bulletLifeTime,
    childBulletForceType: childBullet.bulletForceType,
    childBulletForce: childBullet.bulletForce,
    childBulletHitTimes: childBullet.bulletHitTimes,
  };
}

function buildActiveSkillShooterSpawnCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: ActiveSkillShooterSpawnCaseSpec,
): NfoCnParityActiveSkillShooterSpawnCase {
  const activeSkill = runtimeData.activeSkills.find((candidate) => (
    candidate.id === spec.activeSkillId
  ));
  if (!activeSkill) {
    throw new Error(`Active skill ${spec.activeSkillId} is missing from activeSkillData.`);
  }

  const activeSkillLevel = activeSkill.levels.find((candidate) => (
    candidate.level === spec.activeSkillLevel
  ));
  if (!activeSkillLevel) {
    throw new Error(
      `Active skill ${activeSkill.id} is missing level ${spec.activeSkillLevel}.`,
    );
  }

  const eventIndex = activeSkillLevel.events.findIndex((event) => (
    event.frame === spec.expectedEventFrame
    && event.bulletShooterId === spec.expectedShooterId
  ));
  const activeSkillEvent = eventIndex >= 0 ? activeSkillLevel.events[eventIndex] : null;
  if (!activeSkillEvent) {
    throw new Error(
      `Active skill ${activeSkill.id} level ${activeSkillLevel.level} is missing shooter `
      + `${spec.expectedShooterId} at frame ${spec.expectedEventFrame}.`,
    );
  }

  const shooter = runtimeData.bulletShooters.find((candidate) => (
    candidate.id === spec.expectedShooterId
  ));
  if (!shooter) {
    throw new Error(`Shooter ${spec.expectedShooterId} is missing from BulletShooterData.`);
  }
  if (shooter.spawnPos !== spec.expectedSpawnPos) {
    throw new Error(
      `Shooter ${shooter.id} expected spawnPos ${spec.expectedSpawnPos}, got ${shooter.spawnPos}.`,
    );
  }
  if (
    spec.expectedShooterBehaviorType !== undefined
    && shooter.behaviorType !== spec.expectedShooterBehaviorType
  ) {
    throw new Error(
      `Active skill shooter spawn case ${spec.id} expected behavior type `
      + `${spec.expectedShooterBehaviorType}, got ${shooter.behaviorType}.`,
    );
  }
  if (
    spec.expectedShooterFollowsOwnerDirection !== undefined
    && shooter.followsOwnerDirection !== spec.expectedShooterFollowsOwnerDirection
  ) {
    throw new Error(
      `Active skill shooter spawn case ${spec.id} expected follow-owner-direction `
      + `${spec.expectedShooterFollowsOwnerDirection}, got ${shooter.followsOwnerDirection}.`,
    );
  }

  const shooterEvent = shooter.events.find((event) => (
    event.fireBullets.some((fireBullet) => fireBullet.bulletTypeId === spec.expectedBulletTypeId)
  ));
  if (!shooterEvent) {
    throw new Error(`Shooter ${shooter.id} is missing bullet ${spec.expectedBulletTypeId}.`);
  }

  const fireBullet = shooterEvent.fireBullets.find((candidate) => (
    candidate.bulletTypeId === spec.expectedBulletTypeId
  ));
  if (!fireBullet) {
    throw new Error(`Shooter spawn case ${spec.id} is missing its selected fire bullet.`);
  }
  if (
    spec.expectedIsLoopEvent !== undefined
    && shooterEvent.isLoopEvent !== spec.expectedIsLoopEvent
  ) {
    throw new Error(
      `Active skill shooter spawn case ${spec.id} expected loop event `
      + `${spec.expectedIsLoopEvent}, got ${shooterEvent.isLoopEvent}.`,
    );
  }
  if (
    spec.expectedLoopFrameInterval !== undefined
    && shooterEvent.loopFrameInterval !== spec.expectedLoopFrameInterval
  ) {
    throw new Error(
      `Active skill shooter spawn case ${spec.id} expected loop interval `
      + `${spec.expectedLoopFrameInterval}, got ${shooterEvent.loopFrameInterval}.`,
    );
  }

  return {
    id: spec.id,
    activeSkillId: activeSkill.id,
    activeSkillName: activeSkill.name,
    activeSkillLevel: activeSkillLevel.level,
    eventIndex,
    eventName: activeSkillEvent.name,
    eventFrame: activeSkillEvent.frame,
    shooterId: shooter.id,
    shooterName: shooter.name,
    shooterSpawnPos: shooter.spawnPos,
    shooterLifeTimeFrames: shooter.lifeTimeFrames,
    shooterBehaviorType: shooter.behaviorType,
    shooterFollowsOwnerDirection: shooter.followsOwnerDirection,
    shooterEventFrame: shooterEvent.frame,
    isLoopEvent: shooterEvent.isLoopEvent,
    loopFrameInterval: shooterEvent.loopFrameInterval,
    directionType: shooterEvent.bulletFireDirectionType,
    formationType: shooterEvent.bulletFormationType,
    formationOffsetX: shooterEvent.bulletFormationOffsetX,
    formationOffsetY: shooterEvent.bulletFormationOffsetY,
    bulletTypeId: fireBullet.bulletTypeId,
    bulletCount: fireBullet.bulletCount,
    bulletSpeed: fireBullet.bulletSpeed,
    bulletAttack: fireBullet.bulletAttack,
    bulletNoDamage: fireBullet.noDamage,
    bulletLifeTimeFrames: fireBullet.bulletLifeTime,
    bulletHitTargetType: fireBullet.bulletHitTargetType,
    bulletDamageJudgeType: fireBullet.bulletDamageJudgeType,
    bulletColliderType: fireBullet.bulletColliderType,
    bulletHitTimes: fireBullet.bulletHitTimes,
    bulletForceType: fireBullet.bulletForceType,
    bulletForce: fireBullet.bulletForce,
  };
}

function buildActiveSkillShooterHitBuffCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: ActiveSkillShooterHitBuffCaseSpec,
): NfoCnParityActiveSkillShooterHitBuffCase {
  const activeSkill = runtimeData.activeSkills.find((candidate) => (
    candidate.id === spec.activeSkillId
  ));
  if (!activeSkill) {
    throw new Error(`Active skill ${spec.activeSkillId} is missing from activeSkillData.`);
  }

  const activeSkillLevel = activeSkill.levels.find((candidate) => (
    candidate.level === spec.activeSkillLevel
  ));
  if (!activeSkillLevel) {
    throw new Error(
      `Active skill ${activeSkill.id} is missing level ${spec.activeSkillLevel}.`,
    );
  }

  const eventIndex = activeSkillLevel.events.findIndex((event) => (
    event.frame === spec.expectedEventFrame
    && event.bulletShooterId === spec.expectedShooterId
  ));
  const activeSkillEvent = eventIndex >= 0 ? activeSkillLevel.events[eventIndex] : null;
  if (!activeSkillEvent) {
    throw new Error(
      `Active skill ${activeSkill.id} level ${activeSkillLevel.level} is missing shooter `
      + `${spec.expectedShooterId} at frame ${spec.expectedEventFrame}.`,
    );
  }

  const shooter = runtimeData.bulletShooters.find((candidate) => (
    candidate.id === spec.expectedShooterId
  ));
  if (!shooter) {
    throw new Error(`Shooter ${spec.expectedShooterId} is missing from BulletShooterData.`);
  }

  const shooterEvent = shooter.events.find((event) => (
    event.fireBullets.some((fireBullet) => (
      fireBullet.bulletTypeId === spec.expectedBulletTypeId
      && fireBullet.hitBuffId === spec.expectedHitBuffId
    ))
  ));
  if (!shooterEvent) {
    throw new Error(
      `Shooter ${shooter.id} is missing bullet ${spec.expectedBulletTypeId} `
      + `with hit buff ${spec.expectedHitBuffId}.`,
    );
  }

  const fireBullet = shooterEvent.fireBullets.find((candidate) => (
    candidate.bulletTypeId === spec.expectedBulletTypeId
    && candidate.hitBuffId === spec.expectedHitBuffId
  ));
  if (!fireBullet) {
    throw new Error(`Active skill shooter hit-buff case ${spec.id} is missing its bullet.`);
  }

  const buff = runtimeData.buffs.find((candidate) => candidate.id === spec.expectedHitBuffId);
  if (!buff) {
    throw new Error(`Buff ${spec.expectedHitBuffId} is missing from BuffData.`);
  }
  if (buff.type !== spec.expectedBuffType) {
    throw new Error(
      `Buff ${buff.id} expected type ${spec.expectedBuffType}, got ${buff.type}.`,
    );
  }
  if (
    spec.expectedDamageJudgeDelayFrames !== undefined
    && fireBullet.bulletDamageJudgeDelayFrames !== spec.expectedDamageJudgeDelayFrames
  ) {
    throw new Error(
      `Active skill shooter hit-buff case ${spec.id} expected damage judge delay `
      + `${spec.expectedDamageJudgeDelayFrames}, got ${fireBullet.bulletDamageJudgeDelayFrames}.`,
    );
  }
  if (
    spec.expectedHitTargetType !== undefined
    && fireBullet.bulletHitTargetType !== spec.expectedHitTargetType
  ) {
    throw new Error(
      `Active skill shooter hit-buff case ${spec.id} expected hit target `
      + `${spec.expectedHitTargetType}, got ${fireBullet.bulletHitTargetType}.`,
    );
  }
  if (
    spec.expectedNoDamage !== undefined
    && fireBullet.noDamage !== spec.expectedNoDamage
  ) {
    throw new Error(
      `Active skill shooter hit-buff case ${spec.id} expected noDamage `
      + `${spec.expectedNoDamage}, got ${fireBullet.noDamage}.`,
    );
  }

  const buffLevel = buff.levels.find((candidate) => (
    candidate.level === Math.max(fireBullet.hitBuffLevel, 1)
  ));
  if (!buffLevel) {
    throw new Error(`Buff ${buff.id} is missing level ${fireBullet.hitBuffLevel}.`);
  }

  return {
    id: spec.id,
    activeSkillId: activeSkill.id,
    activeSkillName: activeSkill.name,
    activeSkillLevel: activeSkillLevel.level,
    eventIndex,
    eventName: activeSkillEvent.name,
    eventFrame: activeSkillEvent.frame,
    shooterId: shooter.id,
    shooterName: shooter.name,
    shooterSpawnPos: shooter.spawnPos,
    shooterLifeTimeFrames: shooter.lifeTimeFrames,
    shooterEventFrame: shooterEvent.frame,
    directionType: shooterEvent.bulletFireDirectionType,
    bulletTypeId: fireBullet.bulletTypeId,
    bulletNoDamage: fireBullet.noDamage,
    bulletHitTargetType: fireBullet.bulletHitTargetType,
    bulletDamageJudgeType: fireBullet.bulletDamageJudgeType,
    bulletDamageJudgeDelayFrames: fireBullet.bulletDamageJudgeDelayFrames,
    bulletColliderType: fireBullet.bulletColliderType,
    bulletSize: fireBullet.bulletSize,
    bulletSize2: fireBullet.bulletSize2,
    bulletHitTimes: fireBullet.bulletHitTimes,
    hitBuffId: fireBullet.hitBuffId,
    hitBuffLevel: fireBullet.hitBuffLevel,
    buffName: buff.name,
    buffType: buff.type,
    buffDurationFrames: buffLevel.durationFrames,
    buffValue: buffLevel.value,
  };
}

function buildAIActionCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: AIActionCaseSpec,
): NfoCnParityAIActionCase {
  const ai = runtimeData.ais.find((candidate) => candidate.id === spec.aiTypeId);
  if (!ai) {
    throw new Error(`AI ${spec.aiTypeId} is missing from AIData.`);
  }

  const firstState = ai.states.find((candidate) => candidate.id === ai.firstStateId);
  if (!firstState) {
    throw new Error(`AI ${spec.aiTypeId} is missing first state ${ai.firstStateId}.`);
  }

  const state = ai.states.find((candidate) => (
    candidate.bulletShooterId === spec.expectedShooterId
  ));
  if (!state) {
    throw new Error(`AI ${spec.aiTypeId} is missing shooter ${spec.expectedShooterId}.`);
  }
  const transition = firstState.nextStates.find((candidate) => candidate.stateId === state.id);
  if (!transition) {
    throw new Error(`AI ${spec.aiTypeId} first state does not transition to state ${state.id}.`);
  }

  const shooter = runtimeData.bulletShooters.find((candidate) => (
    candidate.id === spec.expectedShooterId
  ));
  if (!shooter) {
    throw new Error(`Shooter ${spec.expectedShooterId} is missing from BulletShooterData.`);
  }

  const shooterEventIndex = shooter.events.findIndex((event) => (
    event.fireBullets.some((fireBullet) => (
      spec.expectedShooterBulletTypeId === undefined
      || fireBullet.bulletTypeId === spec.expectedShooterBulletTypeId
    ))
  ));
  const shooterEvent = shooterEventIndex >= 0 ? shooter.events[shooterEventIndex] : null;
  if (!shooterEvent) {
    throw new Error(`Shooter ${shooter.id} has no event for AI action case ${spec.id}.`);
  }

  const shooterBullet = shooterEvent.fireBullets.find((fireBullet) => (
    spec.expectedShooterBulletTypeId === undefined
    || fireBullet.bulletTypeId === spec.expectedShooterBulletTypeId
  ));
  if (!shooterBullet) {
    throw new Error(`Shooter ${shooter.id} has no bullet for AI action case ${spec.id}.`);
  }
  const shooterEvents = shooter.events.map((event, eventIndex) => {
    const eventBullet = event.fireBullets.find((fireBullet) => (
      spec.expectedShooterBulletTypeId === undefined
      || fireBullet.bulletTypeId === spec.expectedShooterBulletTypeId
    ));
    if (!eventBullet) {
      throw new Error(
        `Shooter ${shooter.id} event ${eventIndex} has no selected bullet `
        + `for AI action case ${spec.id}.`,
      );
    }
    if (
      spec.expectedShooterDirectionType !== undefined
      && event.bulletFireDirectionType !== spec.expectedShooterDirectionType
    ) {
      throw new Error(
        `AI action case ${spec.id} event ${eventIndex} expected shooter direction `
        + `${spec.expectedShooterDirectionType}, got ${event.bulletFireDirectionType}.`,
      );
    }
    if (
      spec.expectedShooterRotationType !== undefined
      && event.bulletRotationType !== spec.expectedShooterRotationType
    ) {
      throw new Error(
        `AI action case ${spec.id} event ${eventIndex} expected shooter rotation `
        + `${spec.expectedShooterRotationType}, got ${event.bulletRotationType}.`,
      );
    }

    return {
      eventIndex,
      eventName: event.name,
      eventFrame: event.frame,
      directionType: event.bulletFireDirectionType,
      rotationType: event.bulletRotationType,
      formationOffsetX: event.bulletFormationOffsetX,
      formationOffsetY: event.bulletFormationOffsetY,
      directionOffsetAngle: event.bulletFireDirectionOffsetAngle,
      bulletTypeId: eventBullet.bulletTypeId,
      bulletCount: eventBullet.bulletCount,
      bulletSpeed: eventBullet.bulletSpeed,
      bulletHitTargetType: eventBullet.bulletHitTargetType,
    };
  });
  if (
    spec.expectedShooterDirectionType !== undefined
    && shooterEvent.bulletFireDirectionType !== spec.expectedShooterDirectionType
  ) {
    throw new Error(
      `AI action case ${spec.id} expected shooter direction `
      + `${spec.expectedShooterDirectionType}, got ${shooterEvent.bulletFireDirectionType}.`,
    );
  }
  if (
    spec.expectedShooterRotationType !== undefined
    && shooterEvent.bulletRotationType !== spec.expectedShooterRotationType
  ) {
    throw new Error(
      `AI action case ${spec.id} expected shooter rotation `
      + `${spec.expectedShooterRotationType}, got ${shooterEvent.bulletRotationType}.`,
    );
  }
  const shooterLastEventFrame = Math.max(
    ...shooter.events.map((event) => event.frame),
  );
  if (
    spec.expectedShooterEventCount !== undefined
    && shooter.events.length !== spec.expectedShooterEventCount
  ) {
    throw new Error(
      `AI action case ${spec.id} expected shooter event count `
      + `${spec.expectedShooterEventCount}, got ${shooter.events.length}.`,
    );
  }
  if (
    spec.expectedShooterLastEventFrame !== undefined
    && shooterLastEventFrame !== spec.expectedShooterLastEventFrame
  ) {
    throw new Error(
      `AI action case ${spec.id} expected shooter last event frame `
      + `${spec.expectedShooterLastEventFrame}, got ${shooterLastEventFrame}.`,
    );
  }
  const shooterBulletData = runtimeData.bullets.find((candidate) => (
    candidate.id === shooterBullet.bulletTypeId
  ));

  return {
    id: spec.id,
    aiTypeId: ai.id,
    aiName: ai.name,
    firstStateId: ai.firstStateId,
    firstStateLastFrame: firstState.lastFrame,
    firstStateNextStateId: transition.stateId,
    firstStateNextProbability: transition.probability,
    stateId: state.id,
    stateName: state.name,
    stateType: state.stateType,
    lastFrame: state.lastFrame,
    bulletFireCooldownFrames: state.bulletFireCooldownFrames,
    fireBulletCount: state.fireBullets.length,
    shooterId: state.bulletShooterId,
    shooterName: shooter.name,
    shooterEventCount: shooter.events.length,
    shooterLastEventFrame,
    shooterEventIndex,
    shooterEventName: shooterEvent.name,
    shooterEventFrame: shooterEvent.frame,
    shooterDirectionType: shooterEvent.bulletFireDirectionType,
    shooterRotationType: shooterEvent.bulletRotationType,
    shooterFormationOffsetX: shooterEvent.bulletFormationOffsetX,
    shooterFormationOffsetY: shooterEvent.bulletFormationOffsetY,
    shooterDirectionOffsetAngle: shooterEvent.bulletFireDirectionOffsetAngle,
    shooterBulletTypeId: shooterBullet.bulletTypeId,
    shooterBulletDataRotationType: shooterBulletData?.rotateType ?? 0,
    shooterBulletCount: shooterBullet.bulletCount,
    shooterBulletSpeed: shooterBullet.bulletSpeed,
    shooterBulletHitTargetType: shooterBullet.bulletHitTargetType,
    shooterEvents,
  };
}

function buildAIStateTimelineCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: AIStateTimelineCaseSpec,
): NfoCnParityAIStateTimelineCase {
  const ai = runtimeData.ais.find((candidate) => candidate.id === spec.aiTypeId);
  if (!ai) {
    throw new Error(`AI ${spec.aiTypeId} is missing from AIData.`);
  }

  const state = ai.states.find((candidate) => candidate.id === spec.stateId);
  if (!state) {
    throw new Error(`AI ${spec.aiTypeId} is missing state ${spec.stateId}.`);
  }

  const event = state.timelineEvents.find((candidate) => (
    candidate.frame === spec.expectedFireFrame
    && candidate.fireBulletNow
  ));
  if (!event) {
    throw new Error(
      `AI ${spec.aiTypeId} state ${spec.stateId} is missing FireBulletNow frame ${spec.expectedFireFrame}.`,
    );
  }

  const fireBullet = state.fireBullets.find((candidate) => (
    candidate.bulletTypeId === spec.expectedBulletTypeId
  ));
  if (!fireBullet) {
    throw new Error(
      `AI ${spec.aiTypeId} state ${spec.stateId} is missing bullet ${spec.expectedBulletTypeId}.`,
    );
  }
  if (
    spec.expectedColliderType !== undefined
    && fireBullet.bulletColliderType !== spec.expectedColliderType
  ) {
    throw new Error(
      `AI timeline case ${spec.id} expected collider type `
      + `${spec.expectedColliderType}, got ${fireBullet.bulletColliderType}.`,
    );
  }
  if (
    spec.expectedDamageJudgeType !== undefined
    && fireBullet.bulletDamageJudgeType !== spec.expectedDamageJudgeType
  ) {
    throw new Error(
      `AI timeline case ${spec.id} expected damage judge `
      + `${spec.expectedDamageJudgeType}, got ${fireBullet.bulletDamageJudgeType}.`,
    );
  }

  return {
    id: spec.id,
    aiTypeId: ai.id,
    aiName: ai.name,
    stateId: state.id,
    stateName: state.name,
    stateLastFrame: state.lastFrame,
    fireEventFrame: event.frame,
    fireEventName: event.name,
    fireBulletNow: event.fireBulletNow,
    fireAllWeaponNow: event.fireAllWeaponNow,
    fireBulletCount: state.fireBullets.length,
    bulletTypeId: fireBullet.bulletTypeId,
    bulletAttack: fireBullet.bulletAttack,
    bulletDamageJudgeType: fireBullet.bulletDamageJudgeType,
    bulletHitTargetType: fireBullet.bulletHitTargetType,
    bulletColliderType: fireBullet.bulletColliderType,
    bulletSize: fireBullet.bulletSize,
    bulletSize2: fireBullet.bulletSize2,
    bulletHitTimes: fireBullet.bulletHitTimes,
    bulletDamageJudgeCooldownFrames: fireBullet.bulletDamageJudgeCooldownFrames,
  };
}

function buildAIStateFireAllWeaponCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: AIStateFireAllWeaponCaseSpec,
): NfoCnParityAIStateFireAllWeaponCase {
  const ai = runtimeData.ais.find((candidate) => candidate.id === spec.aiTypeId);
  if (!ai) {
    throw new Error(`AI ${spec.aiTypeId} is missing from AIData.`);
  }

  const state = ai.states.find((candidate) => candidate.id === spec.stateId);
  if (!state) {
    throw new Error(`AI ${spec.aiTypeId} is missing state ${spec.stateId}.`);
  }

  const event = state.timelineEvents.find((candidate) => (
    candidate.frame === spec.expectedFireFrame
    && candidate.fireAllWeaponNow
  ));
  if (!event) {
    throw new Error(
      `AI ${spec.aiTypeId} state ${spec.stateId} is missing FireAllWeaponNow frame ${spec.expectedFireFrame}.`,
    );
  }

  const minion = runtimeData.minions.find((candidate) => (
    candidate.id === spec.expectedMinionId
  ));
  if (!minion) {
    throw new Error(`Minion ${spec.expectedMinionId} is missing from MinionData.`);
  }
  if (minion.aiTypeId !== ai.id) {
    throw new Error(
      `Minion ${minion.id} expected AI ${ai.id}, got ${minion.aiTypeId}.`,
    );
  }

  const weapon = runtimeData.weapons.find((candidate) => (
    candidate.id === spec.expectedWeaponId
    && (candidate.minionId ?? 0) === minion.id
  ));
  if (!weapon) {
    throw new Error(
      `Weapon ${spec.expectedWeaponId} is missing or is not bound to minion ${minion.id}.`,
    );
  }

  const weaponLevel = weapon.levels.find((candidate) => (
    candidate.level === spec.expectedWeaponLevel
  ));
  if (!weaponLevel) {
    throw new Error(
      `Weapon ${weapon.id} is missing level ${spec.expectedWeaponLevel}.`,
    );
  }

  const fireBullet = weaponLevel.fireBullets.find((candidate) => (
    candidate.bulletTypeId === spec.expectedBulletTypeId
  ));
  if (!fireBullet) {
    throw new Error(
      `Weapon ${weapon.id} level ${weaponLevel.level} is missing bullet ${spec.expectedBulletTypeId}.`,
    );
  }

  return {
    id: spec.id,
    aiTypeId: ai.id,
    aiName: ai.name,
    stateId: state.id,
    stateName: state.name,
    stateLastFrame: state.lastFrame,
    fireEventFrame: event.frame,
    fireEventName: event.name,
    fireBulletNow: event.fireBulletNow,
    fireAllWeaponNow: event.fireAllWeaponNow,
    stateFireBulletCount: state.fireBullets.length,
    stateShooterId: state.bulletShooterId,
    minionId: minion.id,
    minionName: minion.name,
    minionAITypeId: minion.aiTypeId,
    weaponId: weapon.id,
    weaponName: weapon.name,
    weaponLevel: weaponLevel.level,
    weaponFireCooldownFrames: weaponLevel.fireCooldownFrames,
    weaponDirectFireBulletCount: weaponLevel.fireBullets.length,
    bulletTypeId: fireBullet.bulletTypeId,
    bulletHitTargetType: fireBullet.bulletHitTargetType,
  };
}

function buildAIStateShooterSpawnCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: AIStateShooterSpawnCaseSpec,
): NfoCnParityAIStateShooterSpawnCase {
  const ai = runtimeData.ais.find((candidate) => candidate.id === spec.aiTypeId);
  if (!ai) {
    throw new Error(`AI ${spec.aiTypeId} is missing from AIData.`);
  }

  const state = ai.states.find((candidate) => candidate.id === spec.stateId);
  if (!state) {
    throw new Error(`AI ${spec.aiTypeId} is missing state ${spec.stateId}.`);
  }
  if (state.bulletShooterId !== spec.expectedShooterId) {
    throw new Error(
      `AI ${spec.aiTypeId} state ${spec.stateId} expected shooter `
      + `${spec.expectedShooterId}, got ${state.bulletShooterId}.`,
    );
  }

  const shooter = runtimeData.bulletShooters.find((candidate) => (
    candidate.id === spec.expectedShooterId
  ));
  if (!shooter) {
    throw new Error(`Shooter ${spec.expectedShooterId} is missing from BulletShooterData.`);
  }
  if (shooter.spawnPos !== spec.expectedSpawnPos) {
    throw new Error(
      `Shooter ${shooter.id} expected spawnPos ${spec.expectedSpawnPos}, got ${shooter.spawnPos}.`,
    );
  }

  const eventIndex = shooter.events.findIndex((event) => (
    event.fireBullets.some((fireBullet) => fireBullet.bulletTypeId === spec.expectedBulletTypeId)
  ));
  const event = eventIndex >= 0 ? shooter.events[eventIndex] : null;
  if (!event) {
    throw new Error(`Shooter ${shooter.id} is missing bullet ${spec.expectedBulletTypeId}.`);
  }

  const fireBullet = event.fireBullets.find((candidate) => (
    candidate.bulletTypeId === spec.expectedBulletTypeId
  ));
  if (!fireBullet) {
    throw new Error(`Shooter spawn case ${spec.id} is missing its selected fire bullet.`);
  }

  return {
    id: spec.id,
    aiTypeId: ai.id,
    aiName: ai.name,
    stateId: state.id,
    stateName: state.name,
    stateType: state.stateType,
    stateLastFrame: state.lastFrame,
    shooterId: shooter.id,
    shooterName: shooter.name,
    shooterSpawnPos: shooter.spawnPos,
    shooterLifeTimeFrames: shooter.lifeTimeFrames,
    eventIndex,
    eventName: event.name,
    eventFrame: event.frame,
    directionType: event.bulletFireDirectionType,
    bulletTypeId: fireBullet.bulletTypeId,
    bulletHitTargetType: fireBullet.bulletHitTargetType,
    bulletDamageJudgeDelayFrames: fireBullet.bulletDamageJudgeDelayFrames,
  };
}

function buildAIStateNoCollidingCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: AIStateNoCollidingCaseSpec,
): NfoCnParityAIStateNoCollidingCase {
  const ai = runtimeData.ais.find((candidate) => candidate.id === spec.aiTypeId);
  if (!ai) {
    throw new Error(`AI ${spec.aiTypeId} is missing from AIData.`);
  }

  const state = ai.states.find((candidate) => candidate.id === spec.stateId);
  if (!state) {
    throw new Error(`AI ${spec.aiTypeId} is missing state ${spec.stateId}.`);
  }

  const event = state.timelineEvents.find((candidate) => (
    candidate.frame === spec.expectedNoCollidingFrame
    && candidate.noColliding
  ));
  if (!event) {
    throw new Error(
      `AI ${spec.aiTypeId} state ${spec.stateId} is missing NoColliding frame ${spec.expectedNoCollidingFrame}.`,
    );
  }

  return {
    id: spec.id,
    aiTypeId: ai.id,
    aiName: ai.name,
    stateId: state.id,
    stateName: state.name,
    stateLastFrame: state.lastFrame,
    noCollidingEventFrame: event.frame,
    noCollidingEventName: event.name,
    noColliding: event.noColliding,
    fireBulletNow: event.fireBulletNow,
  };
}

function buildAIStateTeleportCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: AIStateTeleportCaseSpec,
): NfoCnParityAIStateTeleportCase {
  const ai = runtimeData.ais.find((candidate) => candidate.id === spec.aiTypeId);
  if (!ai) {
    throw new Error(`AI ${spec.aiTypeId} is missing from AIData.`);
  }

  const state = ai.states.find((candidate) => candidate.id === spec.stateId);
  if (!state) {
    throw new Error(`AI ${spec.aiTypeId} is missing state ${spec.stateId}.`);
  }
  if (state.stateType !== spec.expectedStateType) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected stateType ${spec.expectedStateType}, got ${state.stateType}.`,
    );
  }

  const teleportEvent = state.timelineEvents.find((candidate) => (
    candidate.frame === spec.expectedTeleportFrame
    && candidate.name.toLowerCase() === "teleport"
  ));
  if (!teleportEvent) {
    throw new Error(
      `AI ${ai.id} state ${state.id} is missing teleport event frame ${spec.expectedTeleportFrame}.`,
    );
  }

  const fireEvent = state.timelineEvents.find((candidate) => (
    candidate.frame === spec.expectedFireFrame
    && candidate.fireBulletNow
  ));
  if (!fireEvent) {
    throw new Error(
      `AI ${ai.id} state ${state.id} is missing FireBulletNow frame ${spec.expectedFireFrame}.`,
    );
  }

  const normalEvent = state.timelineEvents.find((candidate) => (
    candidate.frame === spec.expectedNormalFrame
    && candidate.name.toLowerCase() === "normal"
  ));
  if (!normalEvent) {
    throw new Error(
      `AI ${ai.id} state ${state.id} is missing normal event frame ${spec.expectedNormalFrame}.`,
    );
  }

  const nextState = state.nextStates.find((candidate) => (
    candidate.stateId === spec.expectedNextStateId
  ));
  if (!nextState) {
    throw new Error(
      `AI ${ai.id} state ${state.id} is missing next state ${spec.expectedNextStateId}.`,
    );
  }
  const fireBullet = state.fireBullets.find((candidate) => (
    candidate.bulletTypeId === spec.expectedBulletTypeId
  ));
  if (!fireBullet) {
    throw new Error(
      `AI ${ai.id} state ${state.id} is missing bullet ${spec.expectedBulletTypeId}.`,
    );
  }

  return {
    id: spec.id,
    aiTypeId: ai.id,
    aiName: ai.name,
    stateId: state.id,
    stateName: state.name,
    stateType: state.stateType,
    stateLastFrame: state.lastFrame,
    teleportEventFrame: teleportEvent.frame,
    teleportEventName: teleportEvent.name,
    fireEventFrame: fireEvent.frame,
    fireBulletNow: fireEvent.fireBulletNow,
    normalEventFrame: normalEvent.frame,
    normalEventName: normalEvent.name,
    nextStateId: nextState.stateId,
    bulletTypeId: fireBullet.bulletTypeId,
    bulletHitTargetType: fireBullet.bulletHitTargetType,
    bulletCount: fireBullet.bulletCount,
  };
}

function buildAIStateMovementCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: AIStateMovementCaseSpec,
): NfoCnParityAIStateMovementCase {
  const ai = runtimeData.ais.find((candidate) => candidate.id === spec.aiTypeId);
  if (!ai) {
    throw new Error(`AI ${spec.aiTypeId} is missing from AIData.`);
  }

  const state = ai.states.find((candidate) => candidate.id === spec.stateId);
  if (!state) {
    throw new Error(`AI ${spec.aiTypeId} is missing state ${spec.stateId}.`);
  }
  if (state.stateType !== spec.expectedStateType) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected stateType ${spec.expectedStateType}, got ${state.stateType}.`,
    );
  }

  const nextState = state.nextStates.find((candidate) => (
    candidate.stateId === spec.expectedNextStateId
  ));
  if (!nextState) {
    throw new Error(
      `AI ${ai.id} state ${state.id} is missing next state ${spec.expectedNextStateId}.`,
    );
  }
  const fallbackNextState = spec.expectedFallbackNextStateId === undefined
    ? null
    : state.nextStates.find((candidate) => (
      candidate.stateId === spec.expectedFallbackNextStateId
    ));
  if (spec.expectedFallbackNextStateId !== undefined && !fallbackNextState) {
    throw new Error(
      `AI ${ai.id} state ${state.id} is missing fallback next state `
      + `${spec.expectedFallbackNextStateId}.`,
    );
  }
  if (
    spec.expectedFallbackNextStateProbability !== undefined
    && fallbackNextState?.probability !== spec.expectedFallbackNextStateProbability
  ) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected fallback probability `
      + `${spec.expectedFallbackNextStateProbability}, got ${fallbackNextState?.probability}.`,
    );
  }

  if (
    spec.expectedStateMoveSpeed !== undefined
    && (state.stateMoveSpeed ?? 0) !== spec.expectedStateMoveSpeed
  ) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected State_MoveSpeed `
      + `${spec.expectedStateMoveSpeed}, got ${state.stateMoveSpeed ?? 0}.`,
    );
  }
  if (
    spec.expectedFireBulletCount !== undefined
    && state.fireBullets.length !== spec.expectedFireBulletCount
  ) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected ${spec.expectedFireBulletCount} fire bullets, `
      + `got ${state.fireBullets.length}.`,
    );
  }
  if (
    spec.expectedIsFireBullet !== undefined
    && state.isFireBullet !== spec.expectedIsFireBullet
  ) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected IsFireBullet `
      + `${spec.expectedIsFireBullet}, got ${state.isFireBullet}.`,
    );
  }
  if (
    spec.expectedTriggerLevelEventId !== undefined
    && (state.triggerLevelEventId ?? 0) !== spec.expectedTriggerLevelEventId
  ) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected TriggerLevelEventID `
      + `${spec.expectedTriggerLevelEventId}, got ${state.triggerLevelEventId ?? 0}.`,
    );
  }
  const fireBullet = spec.expectedBulletTypeId !== undefined
    ? state.fireBullets.find((candidate) => (
      candidate.bulletTypeId === spec.expectedBulletTypeId
    ))
    : null;
  if (spec.expectedBulletTypeId !== undefined && !fireBullet) {
    throw new Error(
      `AI ${ai.id} state ${state.id} is missing bullet ${spec.expectedBulletTypeId}.`,
    );
  }

  return {
    id: spec.id,
    aiTypeId: ai.id,
    aiName: ai.name,
    stateId: state.id,
    stateName: state.name,
    stateType: state.stateType,
    stateLastFrame: state.lastFrame,
    stateMoveSpeed: state.stateMoveSpeed ?? 0,
    stateMoveSpeedRandomMax: state.stateMoveSpeedRandomMax ?? 0,
    stateMoveOffsetX: state.stateMoveOffsetX ?? 0,
    stateMoveOffsetY: state.stateMoveOffsetY ?? 0,
    syncDirectionFromTarget: state.syncDirectionFromTarget ?? false,
    triggerLevelEventId: state.triggerLevelEventId ?? 0,
    isFireBullet: state.isFireBullet,
    nextStateId: nextState.stateId,
    nextStateProbability: nextState.probability,
    fallbackNextStateId: fallbackNextState?.stateId ?? 0,
    fallbackNextStateProbability: fallbackNextState?.probability ?? 0,
    fireBulletCount: state.fireBullets.length,
    bulletTypeId: fireBullet?.bulletTypeId ?? 0,
    bulletHitTargetType: fireBullet?.bulletHitTargetType ?? 0,
  };
}

function buildAIStateBuffCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: AIStateBuffCaseSpec,
): NfoCnParityAIStateBuffCase {
  const ai = runtimeData.ais.find((candidate) => candidate.id === spec.aiTypeId);
  if (!ai) {
    throw new Error(`AI ${spec.aiTypeId} is missing from AIData.`);
  }

  const state = ai.states.find((candidate) => candidate.id === spec.stateId);
  if (!state) {
    throw new Error(`AI ${spec.aiTypeId} is missing state ${spec.stateId}.`);
  }
  if ((state.buffId ?? 0) !== spec.expectedBuffId) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected buffID `
      + `${spec.expectedBuffId}, got ${state.buffId ?? 0}.`,
    );
  }
  if ((state.buffLevel ?? 0) !== spec.expectedBuffLevel) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected buffLevel `
      + `${spec.expectedBuffLevel}, got ${state.buffLevel ?? 0}.`,
    );
  }

  const buff = runtimeData.buffs.find((candidate) => candidate.id === spec.expectedBuffId);
  if (!buff) {
    throw new Error(`Buff ${spec.expectedBuffId} is missing from BuffData.`);
  }
  if (buff.type !== spec.expectedBuffType) {
    throw new Error(
      `Buff ${buff.id} expected type ${spec.expectedBuffType}, got ${buff.type}.`,
    );
  }

  const buffLevel = buff.levels.find((candidate) => (
    candidate.level === spec.expectedBuffLevel
  ));
  if (!buffLevel) {
    throw new Error(`Buff ${buff.id} is missing level ${spec.expectedBuffLevel}.`);
  }
  if (buffLevel.durationFrames !== spec.expectedBuffDurationFrames) {
    throw new Error(
      `Buff ${buff.id} expected duration ${spec.expectedBuffDurationFrames}, `
      + `got ${buffLevel.durationFrames}.`,
    );
  }

  const expectedAttribute = buffLevel.attributes.find((attribute) => (
    attribute.attributeType === spec.expectedAttributeType
  ));
  if (!expectedAttribute || expectedAttribute.value !== spec.expectedAttributeValue) {
    throw new Error(
      `Buff ${buff.id} expected attribute ${spec.expectedAttributeType} `
      + `value ${spec.expectedAttributeValue}.`,
    );
  }

  return {
    id: spec.id,
    aiTypeId: ai.id,
    aiName: ai.name,
    stateId: state.id,
    stateName: state.name,
    stateType: state.stateType,
    stateLastFrame: state.lastFrame,
    buffId: state.buffId ?? 0,
    buffLevel: state.buffLevel ?? 0,
    buffName: buff.name,
    buffType: buff.type,
    buffValue: buffLevel.value,
    buffDurationFrames: buffLevel.durationFrames,
    buffMaxStackCount: buffLevel.maxStackCount,
    buffAttributes: buffLevel.attributes.map((attribute) => ({ ...attribute })),
  };
}

function buildAIStateCommonStateCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: AIStateCommonStateCaseSpec,
): NfoCnParityAIStateCommonStateCase {
  const ai = runtimeData.ais.find((candidate) => candidate.id === spec.aiTypeId);
  if (!ai) {
    throw new Error(`AI ${spec.aiTypeId} is missing from AIData.`);
  }

  const state = ai.states.find((candidate) => candidate.id === spec.stateId);
  if (!state) {
    throw new Error(`AI ${spec.aiTypeId} is missing state ${spec.stateId}.`);
  }
  if ((state.changesEntityCommonState ?? false) !== spec.expectedChangesEntityCommonState) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected IsChangeEntityCommonState `
      + `${spec.expectedChangesEntityCommonState}, got ${state.changesEntityCommonState ?? false}.`,
    );
  }
  if ((state.entityCommonStateChangeTo ?? 0) !== spec.expectedEntityCommonStateChangeTo) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected EntityCommonStateChangeTo `
      + `${spec.expectedEntityCommonStateChangeTo}, got ${state.entityCommonStateChangeTo ?? 0}.`,
    );
  }

  return {
    id: spec.id,
    aiTypeId: ai.id,
    aiName: ai.name,
    stateId: state.id,
    stateName: state.name,
    stateType: state.stateType,
    stateLastFrame: state.lastFrame,
    changesEntityCommonState: state.changesEntityCommonState ?? false,
    entityCommonStateChangeTo: state.entityCommonStateChangeTo ?? 0,
  };
}

function buildAIStateAnimationCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: AIStateAnimationCaseSpec,
): NfoCnParityAIStateAnimationCase {
  const ai = runtimeData.ais.find((candidate) => candidate.id === spec.aiTypeId);
  if (!ai) {
    throw new Error(`AI ${spec.aiTypeId} is missing from AIData.`);
  }

  const state = ai.states.find((candidate) => candidate.id === spec.stateId);
  if (!state) {
    throw new Error(`AI ${spec.aiTypeId} is missing state ${spec.stateId}.`);
  }
  if ((state.playAnimeName ?? "") !== spec.expectedPlayAnimeName) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected playAnimeName `
      + `${spec.expectedPlayAnimeName}, got ${state.playAnimeName ?? ""}.`,
    );
  }
  if ((state.restartsAnimation ?? false) !== spec.expectedRestartsAnimation) {
    throw new Error(
      `AI ${ai.id} state ${state.id} expected isRestartPlayAnime `
      + `${spec.expectedRestartsAnimation}, got ${state.restartsAnimation ?? false}.`,
    );
  }

  const timelineEvent = spec.expectedTimelineEventFrame !== undefined
    ? state.timelineEvents.find((event) => (
      event.frame === spec.expectedTimelineEventFrame
      && event.playAnimeName === spec.expectedTimelinePlayAnimeName
    )) ?? null
    : null;
  if (spec.expectedTimelineEventFrame !== undefined && !timelineEvent) {
    throw new Error(
      `AI ${ai.id} state ${state.id} is missing timeline PlayAnimeName `
      + `${spec.expectedTimelinePlayAnimeName ?? ""} at frame `
      + `${spec.expectedTimelineEventFrame}.`,
    );
  }

  return {
    id: spec.id,
    aiTypeId: ai.id,
    aiName: ai.name,
    stateId: state.id,
    stateName: state.name,
    stateType: state.stateType,
    stateLastFrame: state.lastFrame,
    playAnimeName: state.playAnimeName ?? "",
    restartsAnimation: state.restartsAnimation ?? false,
    timelineEventFrame: timelineEvent?.frame ?? 0,
    timelinePlayAnimeName: timelineEvent?.playAnimeName ?? "",
  };
}

function buildActiveSkillBuffCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: ActiveSkillBuffCaseSpec,
): NfoCnParityActiveSkillBuffCase {
  const activeSkill = runtimeData.activeSkills.find((candidate) => (
    candidate.id === spec.activeSkillId
  ));
  if (!activeSkill) {
    throw new Error(`Active skill ${spec.activeSkillId} is missing from activeSkillData.`);
  }

  const activeSkillLevel = activeSkill.levels.find((candidate) => (
    candidate.level === spec.activeSkillLevel
  ));
  if (!activeSkillLevel) {
    throw new Error(
      `Active skill ${activeSkill.id} is missing level ${spec.activeSkillLevel}.`,
    );
  }

  const eventIndex = activeSkillLevel.events.findIndex((event) => (
    event.frame === spec.expectedEventFrame
    && spec.expectedBuffIds.every((buffId) => (
      event.buffs.some((buff) => buff.buffId === buffId)
    ))
  ));
  const event = eventIndex >= 0 ? activeSkillLevel.events[eventIndex] : null;
  if (!event) {
    throw new Error(
      `Active skill ${activeSkill.id} level ${activeSkillLevel.level} is missing `
      + `buff event at frame ${spec.expectedEventFrame}.`,
    );
  }

  return {
    id: spec.id,
    activeSkillId: activeSkill.id,
    activeSkillName: activeSkill.name,
    activeSkillLevel: activeSkillLevel.level,
    chargeCountMax: activeSkillLevel.chargeCountMax,
    timelineFrames: activeSkillLevel.timelineFrames,
    eventIndex,
    eventName: event.name,
    eventFrame: event.frame,
    buffs: event.buffs.map((buffEvent) => {
      const buff = runtimeData.buffs.find((candidate) => candidate.id === buffEvent.buffId);
      if (!buff) {
        throw new Error(`Buff ${buffEvent.buffId} is missing from BuffData.`);
      }
      const buffLevel = buff.levels.find((candidate) => candidate.level === buffEvent.level);
      if (!buffLevel) {
        throw new Error(`Buff ${buff.id} is missing level ${buffEvent.level}.`);
      }

      return {
        targetType: buffEvent.targetType,
        buffId: buff.id,
        buffLevel: buffLevel.level,
        buffName: buff.name,
        buffType: buff.type,
        buffValue: buffLevel.value,
        buffDurationFrames: buffLevel.durationFrames,
        attributes: buffLevel.attributes.map((attribute) => ({ ...attribute })),
      };
    }),
  };
}

function buildActiveSkillSummonCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: ActiveSkillSummonCaseSpec,
): NfoCnParityActiveSkillSummonCase {
  const activeSkill = runtimeData.activeSkills.find((candidate) => (
    candidate.id === spec.activeSkillId
  ));
  if (!activeSkill) {
    throw new Error(`Active skill ${spec.activeSkillId} is missing from activeSkillData.`);
  }

  const activeSkillLevel = activeSkill.levels.find((candidate) => (
    candidate.level === spec.activeSkillLevel
  ));
  if (!activeSkillLevel) {
    throw new Error(
      `Active skill ${activeSkill.id} is missing level ${spec.activeSkillLevel}.`,
    );
  }

  const eventIndex = activeSkillLevel.events.findIndex((event, candidateEventIndex) => (
    (
      spec.expectedEventIndex === undefined
      || candidateEventIndex === spec.expectedEventIndex
    )
    &&
    event.frame === spec.expectedEventFrame
    && (
      spec.expectedShooterId === undefined
      || event.bulletShooterId === spec.expectedShooterId
    )
    && event.spawnMinion?.minionId === spec.expectedMinionId
    && (
      spec.expectedMinionAITypeId === undefined
      || event.spawnMinion.minionAiTypeId === spec.expectedMinionAITypeId
    )
    && event.spawnMinion.spawnFormation === spec.expectedSpawnFormation
    && event.spawnMinion.spawnCount === spec.expectedSpawnCount
    && (
      spec.expectedSpawnCenterOffsetX === undefined
      || event.spawnMinion.spawnCenterOffsetX === spec.expectedSpawnCenterOffsetX
    )
    && (
      spec.expectedSpawnCenterOffsetY === undefined
      || event.spawnMinion.spawnCenterOffsetY === spec.expectedSpawnCenterOffsetY
    )
    && (
      spec.expectedSpawnRadiusMin === undefined
      || event.spawnMinion.spawnRadiusMin === spec.expectedSpawnRadiusMin
    )
    && (
      spec.expectedSpawnRadiusMax === undefined
      || event.spawnMinion.spawnRadiusMax === spec.expectedSpawnRadiusMax
    )
  ));
  const event = eventIndex >= 0 ? activeSkillLevel.events[eventIndex] : null;
  const spawnMinion = event?.spawnMinion ?? null;
  if (!event || !spawnMinion) {
    throw new Error(
      `Active skill ${activeSkill.id} level ${activeSkillLevel.level} is missing `
      + `summon event at frame ${spec.expectedEventFrame}.`,
    );
  }
  const sameFrameSpawnMinionEventCount = activeSkillLevel.events.filter((candidate) => (
    candidate.frame === event.frame
    && candidate.spawnMinion
  )).length;
  if (
    spec.expectedSameFrameSpawnMinionEventCount !== undefined
    && sameFrameSpawnMinionEventCount !== spec.expectedSameFrameSpawnMinionEventCount
  ) {
    throw new Error(
      `Active skill summon case ${spec.id} expected `
      + `${spec.expectedSameFrameSpawnMinionEventCount} same-frame summon events, `
      + `got ${sameFrameSpawnMinionEventCount}.`,
    );
  }
  if (
    spec.expectedShooterId !== undefined
    && event.bulletShooterId !== spec.expectedShooterId
  ) {
    throw new Error(
      `Active skill summon case ${spec.id} expected shooter ${spec.expectedShooterId}, `
      + `got ${event.bulletShooterId}.`,
    );
  }

  const shooter = event.bulletShooterId > 0
    ? runtimeData.bulletShooters.find((candidate) => candidate.id === event.bulletShooterId)
    : null;
  if (event.bulletShooterId > 0 && !shooter) {
    throw new Error(`Shooter ${event.bulletShooterId} is missing from BulletShooterData.`);
  }
  const shooterEvent = shooter
    ? spec.expectedShooterBulletTypeId !== undefined
      ? shooter.events.find((candidate) => (
        candidate.fireBullets.some((fireBullet) => (
          fireBullet.bulletTypeId === spec.expectedShooterBulletTypeId
        ))
      ))
      : shooter.events[0] ?? null
    : null;
  const shooterFireBullet = shooterEvent
    ? spec.expectedShooterBulletTypeId !== undefined
      ? shooterEvent.fireBullets.find((candidate) => (
        candidate.bulletTypeId === spec.expectedShooterBulletTypeId
      )) ?? null
      : shooterEvent.fireBullets[0] ?? null
    : null;
  if (spec.expectedShooterBulletTypeId !== undefined && !shooterFireBullet) {
    throw new Error(
      `Shooter ${event.bulletShooterId} is missing bullet `
      + `${spec.expectedShooterBulletTypeId}.`,
    );
  }

  const minion = runtimeData.minions.find((candidate) => (
    candidate.id === spawnMinion.minionId
  ));
  if (!minion) {
    throw new Error(`Minion ${spawnMinion.minionId} is missing from MinionData.`);
  }
  const minionAITypeId = spawnMinion.minionAiTypeId || minion.aiTypeId;
  const minionAI = runtimeData.ais.find((candidate) => candidate.id === minionAITypeId);
  const minionAIState = minionAI
    ? minionAI.states.find((candidate) => candidate.id === minionAI.firstStateId)
      ?? minionAI.states[0]
      ?? null
    : null;
  if (
    spec.expectedMinionAIStateType !== undefined
    && (minionAIState?.stateType ?? 0) !== spec.expectedMinionAIStateType
  ) {
    throw new Error(
      `Active skill summon case ${spec.id} expected minion AI state type `
      + `${spec.expectedMinionAIStateType}, got ${minionAIState?.stateType ?? 0}.`,
    );
  }
  const minionAIStateShooterId = minionAIState?.bulletShooterId ?? 0;
  if (
    spec.expectedMinionAIStateShooterId !== undefined
    && minionAIStateShooterId !== spec.expectedMinionAIStateShooterId
  ) {
    throw new Error(
      `Active skill summon case ${spec.id} expected minion AI shooter `
      + `${spec.expectedMinionAIStateShooterId}, got ${minionAIStateShooterId}.`,
    );
  }
  const minionAIStateShooter = minionAIStateShooterId > 0
    ? runtimeData.bulletShooters.find((candidate) => candidate.id === minionAIStateShooterId)
    : null;
  if (minionAIStateShooterId > 0 && !minionAIStateShooter) {
    throw new Error(`Shooter ${minionAIStateShooterId} is missing from BulletShooterData.`);
  }
  const minionAIStateShooterEvent = minionAIStateShooter
    ? spec.expectedMinionAIStateShooterBulletTypeId !== undefined
      ? minionAIStateShooter.events.find((candidate) => (
        candidate.fireBullets.some((fireBullet) => (
          fireBullet.bulletTypeId === spec.expectedMinionAIStateShooterBulletTypeId
        ))
      ))
      : minionAIStateShooter.events[0] ?? null
    : null;
  const minionAIStateShooterFireBullet = minionAIStateShooterEvent
    ? spec.expectedMinionAIStateShooterBulletTypeId !== undefined
      ? minionAIStateShooterEvent.fireBullets.find((candidate) => (
        candidate.bulletTypeId === spec.expectedMinionAIStateShooterBulletTypeId
      )) ?? null
      : minionAIStateShooterEvent.fireBullets[0] ?? null
    : null;
  if (
    spec.expectedMinionAIStateShooterBulletTypeId !== undefined
    && !minionAIStateShooterFireBullet
  ) {
    throw new Error(
      `Minion AI shooter ${minionAIStateShooterId} is missing bullet `
      + `${spec.expectedMinionAIStateShooterBulletTypeId}.`,
    );
  }

  const minionAINextStateId = minionAIState?.nextStates.find((candidate) => (
    candidate.stateId > 0
  ))?.stateId ?? 0;
  const minionAINextState = minionAI && minionAINextStateId > 0
    ? minionAI.states.find((candidate) => candidate.id === minionAINextStateId) ?? null
    : null;
  if (
    spec.expectedMinionAINextStateId !== undefined
    && minionAINextStateId !== spec.expectedMinionAINextStateId
  ) {
    throw new Error(
      `Active skill summon case ${spec.id} expected minion AI next state `
      + `${spec.expectedMinionAINextStateId}, got ${minionAINextStateId}.`,
    );
  }

  const minionAINextStateShooterId = minionAINextState?.bulletShooterId ?? 0;
  if (
    spec.expectedMinionAINextStateShooterId !== undefined
    && minionAINextStateShooterId !== spec.expectedMinionAINextStateShooterId
  ) {
    throw new Error(
      `Active skill summon case ${spec.id} expected minion AI next-state shooter `
      + `${spec.expectedMinionAINextStateShooterId}, got ${minionAINextStateShooterId}.`,
    );
  }
  const minionAINextStateShooter = minionAINextStateShooterId > 0
    ? runtimeData.bulletShooters.find((candidate) => candidate.id === minionAINextStateShooterId)
    : null;
  if (minionAINextStateShooterId > 0 && !minionAINextStateShooter) {
    throw new Error(`Shooter ${minionAINextStateShooterId} is missing from BulletShooterData.`);
  }
  const minionAINextStateShooterEvent = minionAINextStateShooter
    ? spec.expectedMinionAINextStateShooterBulletTypeId !== undefined
      ? minionAINextStateShooter.events.find((candidate) => (
        candidate.fireBullets.some((fireBullet) => (
          fireBullet.bulletTypeId === spec.expectedMinionAINextStateShooterBulletTypeId
        ))
      ))
      : minionAINextStateShooter.events[0] ?? null
    : null;
  const minionAINextStateShooterFireBullet = minionAINextStateShooterEvent
    ? spec.expectedMinionAINextStateShooterBulletTypeId !== undefined
      ? minionAINextStateShooterEvent.fireBullets.find((candidate) => (
        candidate.bulletTypeId === spec.expectedMinionAINextStateShooterBulletTypeId
      )) ?? null
      : minionAINextStateShooterEvent.fireBullets[0] ?? null
    : null;
  if (
    spec.expectedMinionAINextStateShooterBulletTypeId !== undefined
    && !minionAINextStateShooterFireBullet
  ) {
    throw new Error(
      `Minion AI next-state shooter ${minionAINextStateShooterId} is missing bullet `
      + `${spec.expectedMinionAINextStateShooterBulletTypeId}.`,
    );
  }

  return {
    id: spec.id,
    activeSkillId: activeSkill.id,
    activeSkillName: activeSkill.name,
    activeSkillLevel: activeSkillLevel.level,
    chargeCountMax: activeSkillLevel.chargeCountMax,
    timelineFrames: activeSkillLevel.timelineFrames,
    eventIndex,
    eventName: event.name,
    eventFrame: event.frame,
    sameFrameSpawnMinionEventCount,
    shooterId: event.bulletShooterId,
    shooterName: shooter?.name ?? "",
    shooterSpawnPos: shooter?.spawnPos ?? 0,
    shooterLifeTimeFrames: shooter?.lifeTimeFrames ?? 0,
    shooterFollowsOwnerDirection: shooter?.followsOwnerDirection ?? false,
    shooterEventFrame: shooterEvent?.frame ?? 0,
    shooterDirectionType: shooterEvent?.bulletFireDirectionType ?? 0,
    shooterFormationType: shooterEvent?.bulletFormationType ?? 0,
    shooterFormationOffsetX: shooterEvent?.bulletFormationOffsetX ?? 0,
    shooterFormationOffsetY: shooterEvent?.bulletFormationOffsetY ?? 0,
    shooterBulletTypeId: shooterFireBullet?.bulletTypeId ?? 0,
    shooterBulletCount: shooterFireBullet?.bulletCount ?? 0,
    shooterBulletSpeed: shooterFireBullet?.bulletSpeed ?? 0,
    shooterBulletHitTargetType: shooterFireBullet?.bulletHitTargetType ?? 0,
    minionAIStateId: minionAIState?.id ?? 0,
    minionAIStateName: minionAIState?.name ?? "",
    minionAIStateType: minionAIState?.stateType ?? 0,
    minionAIStateLastFrame: minionAIState?.lastFrame ?? 0,
    minionAIStateShooterId,
    minionAIStateShooterName: minionAIStateShooter?.name ?? "",
    minionAIStateShooterLifeTimeFrames: minionAIStateShooter?.lifeTimeFrames ?? 0,
    minionAIStateShooterEventFrame: minionAIStateShooterEvent?.frame ?? 0,
    minionAIStateShooterIsLoopEvent: minionAIStateShooterEvent?.isLoopEvent ?? false,
    minionAIStateShooterLoopFrameInterval: minionAIStateShooterEvent?.loopFrameInterval ?? 0,
    minionAIStateShooterDirectionType: minionAIStateShooterEvent?.bulletFireDirectionType ?? 0,
    minionAIStateShooterFormationType: minionAIStateShooterEvent?.bulletFormationType ?? 0,
    minionAIStateShooterFormationOffsetX: minionAIStateShooterEvent?.bulletFormationOffsetX ?? 0,
    minionAIStateShooterFormationOffsetY: minionAIStateShooterEvent?.bulletFormationOffsetY ?? 0,
    minionAIStateShooterBulletTypeId: minionAIStateShooterFireBullet?.bulletTypeId ?? 0,
    minionAIStateShooterBulletSpeed: minionAIStateShooterFireBullet?.bulletSpeed ?? 0,
    minionAINextStateId,
    minionAINextStateName: minionAINextState?.name ?? "",
    minionAINextStateType: minionAINextState?.stateType ?? 0,
    minionAINextStateShooterId,
    minionAINextStateShooterName: minionAINextStateShooter?.name ?? "",
    minionAINextStateShooterEventFrame: minionAINextStateShooterEvent?.frame ?? 0,
    minionAINextStateShooterBulletTypeId: minionAINextStateShooterFireBullet?.bulletTypeId ?? 0,
    minionAINextStateShooterBulletAttack: minionAINextStateShooterFireBullet?.bulletAttack ?? 0,
    minionAINextStateShooterBulletSpeed: minionAINextStateShooterFireBullet?.bulletSpeed ?? 0,
    minionAINextStateShooterBulletSize: minionAINextStateShooterFireBullet?.bulletSize ?? 0,
    minionAINextStateShooterBulletHitBuffId: minionAINextStateShooterFireBullet?.hitBuffId ?? 0,
    ...createActiveSkillSummonPayload(spawnMinion),
  };
}

function createActiveSkillSummonPayload(
  spawnMinion: NfoActiveSkillSpawnMinionEvent,
): Omit<
  NfoCnParityActiveSkillSummonCase,
  | "id"
  | "activeSkillId"
  | "activeSkillName"
  | "activeSkillLevel"
  | "chargeCountMax"
  | "timelineFrames"
  | "eventIndex"
  | "eventName"
  | "eventFrame"
  | "sameFrameSpawnMinionEventCount"
  | "shooterId"
  | "shooterName"
  | "shooterSpawnPos"
  | "shooterLifeTimeFrames"
  | "shooterFollowsOwnerDirection"
  | "shooterEventFrame"
  | "shooterDirectionType"
  | "shooterFormationType"
  | "shooterFormationOffsetX"
  | "shooterFormationOffsetY"
  | "shooterBulletTypeId"
  | "shooterBulletCount"
  | "shooterBulletSpeed"
  | "shooterBulletHitTargetType"
  | "minionAIStateId"
  | "minionAIStateName"
  | "minionAIStateType"
  | "minionAIStateLastFrame"
  | "minionAIStateShooterId"
  | "minionAIStateShooterName"
  | "minionAIStateShooterLifeTimeFrames"
  | "minionAIStateShooterEventFrame"
  | "minionAIStateShooterIsLoopEvent"
  | "minionAIStateShooterLoopFrameInterval"
  | "minionAIStateShooterDirectionType"
  | "minionAIStateShooterFormationType"
  | "minionAIStateShooterFormationOffsetX"
  | "minionAIStateShooterFormationOffsetY"
  | "minionAIStateShooterBulletTypeId"
  | "minionAIStateShooterBulletSpeed"
  | "minionAINextStateId"
  | "minionAINextStateName"
  | "minionAINextStateType"
  | "minionAINextStateShooterId"
  | "minionAINextStateShooterName"
  | "minionAINextStateShooterEventFrame"
  | "minionAINextStateShooterBulletTypeId"
  | "minionAINextStateShooterBulletAttack"
  | "minionAINextStateShooterBulletSpeed"
  | "minionAINextStateShooterBulletSize"
  | "minionAINextStateShooterBulletHitBuffId"
> {
  return {
    minionId: spawnMinion.minionId,
    minionLevel: spawnMinion.minionLevel,
    minionAITypeId: spawnMinion.minionAiTypeId,
    weaponId: spawnMinion.weaponId,
    weaponLevel: spawnMinion.weaponLevel,
    spawnCount: spawnMinion.spawnCount,
    spawnCenterType: spawnMinion.spawnCenterType,
    spawnCenterOffsetX: spawnMinion.spawnCenterOffsetX,
    spawnCenterOffsetY: spawnMinion.spawnCenterOffsetY,
    spawnFormation: spawnMinion.spawnFormation,
    spawnRadiusMin: spawnMinion.spawnRadiusMin,
    spawnRadiusMax: spawnMinion.spawnRadiusMax,
    expectedFirstPassRadius: (
      Math.max(0, spawnMinion.spawnRadiusMin)
      + Math.max(Math.max(0, spawnMinion.spawnRadiusMin), spawnMinion.spawnRadiusMax)
    ) / 2,
  };
}

function buildItemCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: ItemCaseSpec,
): NfoCnParityItemCase {
  const item = runtimeData.items.find((candidate) => candidate.id === spec.itemId);
  if (!item) {
    throw new Error(`Item case ${spec.id} is missing item ${spec.itemId}.`);
  }
  if (item.itemType !== spec.expectedItemType) {
    throw new Error(
      `Item case ${spec.id} expected type ${spec.expectedItemType}, got ${item.itemType}.`,
    );
  }
  if (item.value !== spec.expectedValue) {
    throw new Error(
      `Item case ${spec.id} expected value ${spec.expectedValue}, got ${item.value}.`,
    );
  }
  if (item.lifetimeFrames !== spec.expectedLifetimeFrames) {
    throw new Error(
      `Item case ${spec.id} expected lifetime ${spec.expectedLifetimeFrames}, `
      + `got ${item.lifetimeFrames}.`,
    );
  }
  if (item.canBeMagneted !== spec.expectedCanBeMagneted) {
    throw new Error(
      `Item case ${spec.id} expected canBeMagneted ${spec.expectedCanBeMagneted}, `
      + `got ${item.canBeMagneted}.`,
    );
  }

  return {
    id: spec.id,
    itemId: item.id,
    itemName: item.name,
    itemType: item.itemType,
    value: item.value,
    lifetimeFrames: item.lifetimeFrames,
    canBeMagneted: item.canBeMagneted,
    prefab: item.prefab,
    iconSpriteName: item.iconSpriteName,
  };
}

function buildDropCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: DropCaseSpec,
): NfoCnParityDropCase {
  const drop = runtimeData.drops.find((candidate) => candidate.id === spec.dropId);
  if (!drop) {
    throw new Error(`Drop case ${spec.id} is missing drop ${spec.dropId}.`);
  }
  if (drop.name !== spec.expectedDropName) {
    throw new Error(
      `Drop case ${spec.id} expected name ${spec.expectedDropName}, got ${drop.name}.`,
    );
  }
  if (drop.items.length !== spec.expectedItems.length) {
    throw new Error(
      `Drop case ${spec.id} expected ${spec.expectedItems.length} items, `
      + `got ${drop.items.length}.`,
    );
  }

  const items = spec.expectedItems.map((expectedItem) => {
    const dropItem = drop.items.find((candidate) => candidate.itemId === expectedItem.itemId);
    if (!dropItem) {
      throw new Error(
        `Drop case ${spec.id} is missing drop item ${expectedItem.itemId}.`,
      );
    }
    if (dropItem.dropRate !== expectedItem.dropRate) {
      throw new Error(
        `Drop case ${spec.id} item ${expectedItem.itemId} expected dropRate `
        + `${expectedItem.dropRate}, got ${dropItem.dropRate}.`,
      );
    }

    const item = runtimeData.items.find((candidate) => candidate.id === expectedItem.itemId);
    if (!item) {
      throw new Error(
        `Drop case ${spec.id} item ${expectedItem.itemId} is missing item data.`,
      );
    }
    if (item.itemType !== expectedItem.itemType) {
      throw new Error(
        `Drop case ${spec.id} item ${expectedItem.itemId} expected itemType `
        + `${expectedItem.itemType}, got ${item.itemType}.`,
      );
    }
    if (item.value !== expectedItem.value) {
      throw new Error(
        `Drop case ${spec.id} item ${expectedItem.itemId} expected value `
        + `${expectedItem.value}, got ${item.value}.`,
      );
    }
    if (item.lifetimeFrames !== expectedItem.lifetimeFrames) {
      throw new Error(
        `Drop case ${spec.id} item ${expectedItem.itemId} expected lifetime `
        + `${expectedItem.lifetimeFrames}, got ${item.lifetimeFrames}.`,
      );
    }
    if (item.canBeMagneted !== expectedItem.canBeMagneted) {
      throw new Error(
        `Drop case ${spec.id} item ${expectedItem.itemId} expected canBeMagneted `
        + `${expectedItem.canBeMagneted}, got ${item.canBeMagneted}.`,
      );
    }

    return {
      itemId: item.id,
      itemName: item.name,
      dropRate: dropItem.dropRate,
      itemType: item.itemType,
      itemValue: item.value,
      itemLifetimeFrames: item.lifetimeFrames,
      itemCanBeMagneted: item.canBeMagneted,
    };
  });

  return {
    id: spec.id,
    dropId: drop.id,
    dropName: drop.name,
    itemCount: drop.items.length,
    items,
  };
}

function buildLevelEnemySpawnCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: LevelEnemySpawnCaseSpec,
): NfoCnParityLevelEnemySpawnCase {
  const level = runtimeData.levels.find((candidate) => candidate.id === spec.levelId);
  if (!level) {
    throw new Error(`Level spawn case ${spec.id} is missing level ${spec.levelId}.`);
  }
  if (level.name !== spec.expectedLevelName) {
    throw new Error(
      `Level spawn case ${spec.id} expected level name ${spec.expectedLevelName}, `
      + `got ${level.name}.`,
    );
  }
  if (level.commonDropId !== spec.expectedCommonDropId) {
    throw new Error(
      `Level spawn case ${spec.id} expected commonDropId ${spec.expectedCommonDropId}, `
      + `got ${level.commonDropId}.`,
    );
  }

  const event = level.events[spec.eventIndex];
  if (!event) {
    throw new Error(
      `Level spawn case ${spec.id} is missing event index ${spec.eventIndex}.`,
    );
  }
  if (event.name !== spec.expectedEventName) {
    throw new Error(
      `Level spawn case ${spec.id} expected event name ${spec.expectedEventName}, `
      + `got ${event.name}.`,
    );
  }
  if (event.startFrame !== spec.expectedStartFrame) {
    throw new Error(
      `Level spawn case ${spec.id} expected startFrame ${spec.expectedStartFrame}, `
      + `got ${event.startFrame}.`,
    );
  }
  if (event.totalFrames !== spec.expectedTotalFrames) {
    throw new Error(
      `Level spawn case ${spec.id} expected totalFrames ${spec.expectedTotalFrames}, `
      + `got ${event.totalFrames}.`,
    );
  }

  const spawn = event.enemySpawn;
  const expectedSpawnFields = [
    ["enemyTypeId", spawn.enemyTypeId, spec.expectedEnemyTypeId],
    ["enemyLevel", spawn.enemyLevel, spec.expectedEnemyLevel],
    ["enemyAiTypeId", spawn.enemyAiTypeId, spec.expectedEnemyAiTypeId],
    ["spawnType", spawn.spawnType, spec.expectedSpawnType],
    ["spawnCenterType", spawn.spawnCenterType, spec.expectedSpawnCenterType],
    ["spawnWaveCount", spawn.spawnWaveCount, spec.expectedSpawnWaveCount],
    ["spawnWaveIntervalFrames", spawn.spawnWaveIntervalFrames, spec.expectedSpawnWaveIntervalFrames],
    ["spawnRangeMin", spawn.spawnRangeMin, spec.expectedSpawnRangeMin],
    ["spawnRangeMax", spawn.spawnRangeMax, spec.expectedSpawnRangeMax],
    ["spawnCenterOffsetX", spawn.spawnCenterOffsetX, spec.expectedSpawnCenterOffsetX],
    ["spawnCenterOffsetY", spawn.spawnCenterOffsetY, spec.expectedSpawnCenterOffsetY],
    ["dropId", spawn.dropId, spec.expectedDropId],
  ] as const;
  for (const [fieldName, actual, expected] of expectedSpawnFields) {
    if (actual !== expected) {
      throw new Error(
        `Level spawn case ${spec.id} expected ${fieldName} ${expected}, got ${actual}.`,
      );
    }
  }
  if (spawn.programControl !== spec.expectedProgramControl) {
    throw new Error(
      `Level spawn case ${spec.id} expected programControl `
      + `${spec.expectedProgramControl}, got ${spawn.programControl}.`,
    );
  }

  const enemy = runtimeData.enemies.find((candidate) => candidate.id === spawn.enemyTypeId);
  if (!enemy) {
    throw new Error(
      `Level spawn case ${spec.id} is missing enemy ${spawn.enemyTypeId}.`,
    );
  }
  const enemyStats = enemy.levels.find((candidate) => candidate.level === spawn.enemyLevel);
  if (!enemyStats) {
    throw new Error(
      `Level spawn case ${spec.id} is missing enemy ${spawn.enemyTypeId} `
      + `level ${spawn.enemyLevel}.`,
    );
  }
  const expectedEnemyFields = [
    ["enemyMaxHp", enemyStats.maxHp, spec.expectedEnemyMaxHp],
    ["enemyAttack", enemyStats.attack, spec.expectedEnemyAttack],
    ["enemyDefense", enemyStats.defense, spec.expectedEnemyDefense],
    ["enemySpeed", enemyStats.speed, spec.expectedEnemySpeed],
    ["enemyColliderRadius", enemyStats.colliderRadius, spec.expectedEnemyColliderRadius],
  ] as const;
  for (const [fieldName, actual, expected] of expectedEnemyFields) {
    if (actual !== expected) {
      throw new Error(
        `Level spawn case ${spec.id} expected ${fieldName} ${expected}, got ${actual}.`,
      );
    }
  }

  return {
    id: spec.id,
    levelId: level.id,
    levelName: level.name,
    commonDropId: level.commonDropId,
    eventIndex: spec.eventIndex,
    eventName: event.name,
    eventId: event.eventId,
    startFrame: event.startFrame,
    totalFrames: event.totalFrames,
    enemyTypeId: spawn.enemyTypeId,
    enemyName: enemy.name,
    enemyLevel: spawn.enemyLevel,
    enemyAiTypeId: spawn.enemyAiTypeId,
    spawnType: spawn.spawnType,
    spawnCenterType: spawn.spawnCenterType,
    spawnWaveCount: spawn.spawnWaveCount,
    spawnWaveIntervalFrames: spawn.spawnWaveIntervalFrames,
    spawnRangeMin: spawn.spawnRangeMin,
    spawnRangeMax: spawn.spawnRangeMax,
    spawnCenterOffsetX: spawn.spawnCenterOffsetX,
    spawnCenterOffsetY: spawn.spawnCenterOffsetY,
    dropId: spawn.dropId,
    programControl: spawn.programControl,
    enemyMaxHp: enemyStats.maxHp,
    enemyAttack: enemyStats.attack,
    enemyDefense: enemyStats.defense,
    enemySpeed: enemyStats.speed,
    enemyColliderRadius: enemyStats.colliderRadius,
  };
}

function buildLevelClearCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: LevelClearCaseSpec,
): NfoCnParityLevelClearCase {
  const level = runtimeData.levels.find((candidate) => candidate.id === spec.levelId);
  if (!level) {
    throw new Error(`Level ${spec.levelId} is missing from levelData.`);
  }

  const expectedLevelFields = [
    ["clearType", level.clearType, spec.expectedClearType],
    ["totalFrames", level.totalFrames, spec.expectedTotalFrames],
    ["clearCoin", level.clearCoin, spec.expectedClearCoin],
    ["clearEnemyEventId", level.clearEnemyEventId, spec.expectedClearEnemyEventId],
  ] as const;
  for (const [fieldName, actual, expected] of expectedLevelFields) {
    if (actual !== expected) {
      throw new Error(
        `Level clear case ${spec.id} expected ${fieldName} ${expected}, got ${actual}.`,
      );
    }
  }
  if (level.clearMinorEnemyEventIds.join(",") !== spec.expectedClearMinorEnemyEventIds.join(",")) {
    throw new Error(
      `Level clear case ${spec.id} expected clearMinorEnemyEventIds `
      + `${spec.expectedClearMinorEnemyEventIds.join(",")}, got `
      + `${level.clearMinorEnemyEventIds.join(",")}.`,
    );
  }
  const expectedArrayFields = [
    ["clearUnlockLevelIds", level.clearUnlockLevelIds, spec.expectedClearUnlockLevelIds],
    ["clearUnlockWeaponIds", level.clearUnlockWeaponIds, spec.expectedClearUnlockWeaponIds],
    ["clearUnlockEquipIds", level.clearUnlockEquipIds, spec.expectedClearUnlockEquipIds],
    ["clearUnlockCharacterIds", level.clearUnlockCharacterIds, spec.expectedClearUnlockCharacterIds],
  ] as const;
  for (const [fieldName, actual, expected] of expectedArrayFields) {
    if (actual.join(",") !== expected.join(",")) {
      throw new Error(
        `Level clear case ${spec.id} expected ${fieldName} ${expected.join(",")}, `
        + `got ${actual.join(",")}.`,
      );
    }
  }

  const postTotalFrameEnemyEvents = level.events.filter((event) => (
    event.enabled
    && event.eventType === 2
    && event.startFrame >= level.totalFrames
  ));
  const earliestPostTotalFrameEnemyEventStartFrame = postTotalFrameEnemyEvents.reduce(
    (earliestStartFrame, event) => Math.min(earliestStartFrame, event.startFrame),
    Number.POSITIVE_INFINITY,
  );
  const clearEnemySpawnEvents = level.clearEnemyEventId > 0
    ? level.events.filter((event) => (
      event.enabled
      && event.eventType === 2
      && event.enemySpawn.eventId === level.clearEnemyEventId
    ))
    : [];
  const earliestClearEnemySpawnStartFrame = clearEnemySpawnEvents.length > 0
    ? clearEnemySpawnEvents.reduce(
      (earliestStartFrame, event) => Math.min(earliestStartFrame, event.startFrame),
      Number.POSITIVE_INFINITY,
    )
    : 0;
  const clearMinorEnemySpawnEvents = level.clearMinorEnemyEventIds.length > 0
    ? level.events.filter((event) => (
      event.enabled
      && event.eventType === 2
      && level.clearMinorEnemyEventIds.includes(event.enemySpawn.eventId)
    ))
    : [];
  const earliestClearMinorEnemySpawnStartFrame = clearMinorEnemySpawnEvents.length > 0
    ? clearMinorEnemySpawnEvents.reduce(
      (earliestStartFrame, event) => Math.min(earliestStartFrame, event.startFrame),
      Number.POSITIVE_INFINITY,
    )
    : 0;
  if (postTotalFrameEnemyEvents.length !== spec.expectedPostTotalFrameEnemyEventCount) {
    throw new Error(
      `Level clear case ${spec.id} expected `
      + `${spec.expectedPostTotalFrameEnemyEventCount} post-total-frame enemy events, `
      + `got ${postTotalFrameEnemyEvents.length}.`,
    );
  }
  if (
    earliestPostTotalFrameEnemyEventStartFrame
    !== spec.expectedEarliestPostTotalFrameEnemyEventStartFrame
  ) {
    throw new Error(
      `Level clear case ${spec.id} expected earliest post-total-frame enemy event at `
      + `${spec.expectedEarliestPostTotalFrameEnemyEventStartFrame}, got `
      + `${earliestPostTotalFrameEnemyEventStartFrame}.`,
    );
  }
  if (clearEnemySpawnEvents.length !== spec.expectedClearEnemySpawnEventCount) {
    throw new Error(
      `Level clear case ${spec.id} expected `
      + `${spec.expectedClearEnemySpawnEventCount} clear enemy spawn events, `
      + `got ${clearEnemySpawnEvents.length}.`,
    );
  }
  if (earliestClearEnemySpawnStartFrame !== spec.expectedEarliestClearEnemySpawnStartFrame) {
    throw new Error(
      `Level clear case ${spec.id} expected earliest clear enemy spawn at `
      + `${spec.expectedEarliestClearEnemySpawnStartFrame}, got `
      + `${earliestClearEnemySpawnStartFrame}.`,
    );
  }
  if (clearMinorEnemySpawnEvents.length !== spec.expectedClearMinorEnemySpawnEventCount) {
    throw new Error(
      `Level clear case ${spec.id} expected `
      + `${spec.expectedClearMinorEnemySpawnEventCount} clear minor enemy spawn events, `
      + `got ${clearMinorEnemySpawnEvents.length}.`,
    );
  }
  if (
    earliestClearMinorEnemySpawnStartFrame
    !== spec.expectedEarliestClearMinorEnemySpawnStartFrame
  ) {
    throw new Error(
      `Level clear case ${spec.id} expected earliest clear minor enemy spawn at `
      + `${spec.expectedEarliestClearMinorEnemySpawnStartFrame}, got `
      + `${earliestClearMinorEnemySpawnStartFrame}.`,
    );
  }

  return {
    id: spec.id,
    levelId: level.id,
    levelName: level.name,
    clearType: level.clearType,
    totalFrames: level.totalFrames,
    clearCoin: level.clearCoin,
    clearEnemyEventId: level.clearEnemyEventId,
    clearMinorEnemyEventIds: level.clearMinorEnemyEventIds,
    clearUnlockLevelIds: level.clearUnlockLevelIds,
    clearUnlockWeaponIds: level.clearUnlockWeaponIds,
    clearUnlockEquipIds: level.clearUnlockEquipIds,
    clearUnlockCharacterIds: level.clearUnlockCharacterIds,
    postTotalFrameEnemyEventCount: postTotalFrameEnemyEvents.length,
    earliestPostTotalFrameEnemyEventStartFrame,
    clearEnemySpawnEventCount: clearEnemySpawnEvents.length,
    earliestClearEnemySpawnStartFrame,
    clearMinorEnemySpawnEventCount: clearMinorEnemySpawnEvents.length,
    earliestClearMinorEnemySpawnStartFrame,
  };
}

function buildLevelEventTriggerCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: LevelEventTriggerCaseSpec,
): NfoCnParityLevelEventTriggerCase {
  const level = runtimeData.levels.find((candidate) => candidate.id === spec.levelId);
  if (!level) {
    throw new Error(`Level event trigger case ${spec.id} is missing level ${spec.levelId}.`);
  }
  if (level.name !== spec.expectedLevelName) {
    throw new Error(
      `Level event trigger case ${spec.id} expected level name ${spec.expectedLevelName}, `
      + `got ${level.name}.`,
    );
  }

  const triggeredEvents = level.events
    .map((event, eventIndex) => ({ event, eventIndex }))
    .filter(({ event }) => event.triggerType === spec.expectedTriggerType);
  if (triggeredEvents.length !== spec.expectedTriggeredEventCount) {
    throw new Error(
      `Level event trigger case ${spec.id} expected `
      + `${spec.expectedTriggeredEventCount} triggered events, got ${triggeredEvents.length}.`,
    );
  }
  for (const { event, eventIndex } of triggeredEvents) {
    if (event.triggerEnemyEventId !== spec.expectedTriggerEnemyEventId) {
      throw new Error(
        `Level event trigger case ${spec.id} expected triggerEnemyEventId `
        + `${spec.expectedTriggerEnemyEventId} at event index ${eventIndex}, `
        + `got ${event.triggerEnemyEventId}.`,
      );
    }
  }

  const first = triggeredEvents[0];
  const last = triggeredEvents[triggeredEvents.length - 1];
  if (!first || !last) {
    throw new Error(`Level event trigger case ${spec.id} has no triggered events.`);
  }
  const expectedEventFields = [
    ["firstEventIndex", first.eventIndex, spec.expectedFirstEventIndex],
    ["firstEventName", first.event.name, spec.expectedFirstEventName],
    ["firstEventId", first.event.eventId, spec.expectedFirstEventId],
    ["firstEventStartFrame", first.event.startFrame, spec.expectedFirstEventStartFrame],
    ["firstEnemyTypeId", first.event.enemySpawn.enemyTypeId, spec.expectedFirstEnemyTypeId],
    ["lastEventIndex", last.eventIndex, spec.expectedLastEventIndex],
    ["lastEventName", last.event.name, spec.expectedLastEventName],
    ["lastEventId", last.event.eventId, spec.expectedLastEventId],
    ["lastEventStartFrame", last.event.startFrame, spec.expectedLastEventStartFrame],
    ["lastEnemyTypeId", last.event.enemySpawn.enemyTypeId, spec.expectedLastEnemyTypeId],
  ] as const;
  for (const [fieldName, actual, expected] of expectedEventFields) {
    if (actual !== expected) {
      throw new Error(
        `Level event trigger case ${spec.id} expected ${fieldName} ${expected}, got ${actual}.`,
      );
    }
  }

  return {
    id: spec.id,
    levelId: level.id,
    levelName: level.name,
    triggerType: spec.expectedTriggerType,
    triggerEnemyEventId: spec.expectedTriggerEnemyEventId,
    triggeredEventCount: triggeredEvents.length,
    firstEventIndex: first.eventIndex,
    firstEventName: first.event.name,
    firstEventId: first.event.eventId,
    firstEventStartFrame: first.event.startFrame,
    firstEnemyTypeId: first.event.enemySpawn.enemyTypeId,
    lastEventIndex: last.eventIndex,
    lastEventName: last.event.name,
    lastEventId: last.event.eventId,
    lastEventStartFrame: last.event.startFrame,
    lastEnemyTypeId: last.event.enemySpawn.enemyTypeId,
  };
}

function buildLevelAIStateChangeCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: LevelAIStateChangeCaseSpec,
): NfoCnParityLevelAIStateChangeCase {
  const level = runtimeData.levels.find((candidate) => candidate.id === spec.levelId);
  if (!level) {
    throw new Error(`Level ${spec.levelId} is missing from levelData.`);
  }

  const event = level.events[spec.eventIndex];
  if (!event) {
    throw new Error(`Level AI state-change case ${spec.id} is missing event index ${spec.eventIndex}.`);
  }
  const targetSpawnEvent = level.events[spec.targetSpawnEventIndex];
  if (!targetSpawnEvent) {
    throw new Error(
      `Level AI state-change case ${spec.id} is missing target spawn event index `
      + `${spec.targetSpawnEventIndex}.`,
    );
  }

  const expectedEventFields = [
    ["startFrame", event.startFrame, spec.expectedStartFrame],
    ["totalFrames", event.totalFrames, spec.expectedTotalFrames],
    ["targetEnemyEventId", event.enemyAIStateChange?.enemyEventId ?? 0, spec.expectedTargetEnemyEventId],
    ["targetAIStateId", event.enemyAIStateChange?.aiStateId ?? 0, spec.expectedTargetAIStateId],
    ["targetEnemyTypeId", targetSpawnEvent.enemySpawn.enemyTypeId, spec.expectedTargetEnemyTypeId],
    ["targetEnemyAITypeId", targetSpawnEvent.enemySpawn.enemyAiTypeId, spec.expectedTargetEnemyAITypeId],
    ["targetSpawnEventId", targetSpawnEvent.enemySpawn.eventId, spec.expectedTargetEnemyEventId],
  ] as const;
  for (const [fieldName, actual, expected] of expectedEventFields) {
    if (actual !== expected) {
      throw new Error(
        `Level AI state-change case ${spec.id} expected ${fieldName} ${expected}, got ${actual}.`,
      );
    }
  }

  const targetEnemy = runtimeData.enemies.find((candidate) => (
    candidate.id === targetSpawnEvent.enemySpawn.enemyTypeId
  ));
  if (!targetEnemy) {
    throw new Error(
      `Level AI state-change case ${spec.id} is missing enemy `
      + `${targetSpawnEvent.enemySpawn.enemyTypeId}.`,
    );
  }
  const targetAI = runtimeData.ais.find((candidate) => (
    candidate.id === targetSpawnEvent.enemySpawn.enemyAiTypeId
  ));
  if (!targetAI) {
    throw new Error(
      `Level AI state-change case ${spec.id} is missing AI `
      + `${targetSpawnEvent.enemySpawn.enemyAiTypeId}.`,
    );
  }
  if (!targetAI.states.some((state) => state.id === spec.expectedTargetAIStateId)) {
    throw new Error(
      `Level AI state-change case ${spec.id} expected AI ${targetAI.id} `
      + `to contain state ${spec.expectedTargetAIStateId}.`,
    );
  }

  return {
    id: spec.id,
    levelId: level.id,
    levelName: level.name,
    eventIndex: spec.eventIndex,
    eventName: event.name,
    startFrame: event.startFrame,
    totalFrames: event.totalFrames,
    targetSpawnEventIndex: spec.targetSpawnEventIndex,
    targetEnemyEventId: event.enemyAIStateChange?.enemyEventId ?? 0,
    targetAIStateId: event.enemyAIStateChange?.aiStateId ?? 0,
    targetEnemyTypeId: targetEnemy.id,
    targetEnemyName: targetEnemy.name,
    targetEnemyAITypeId: targetAI.id,
    targetAIName: targetAI.name,
  };
}

function buildMapCase(
  runtimeData: NfoOfflineRuntimeData,
  spec: MapCaseSpec,
): NfoCnParityMapCase {
  const level = runtimeData.levels.find((candidate) => (
    candidate.id === spec.expectedLevelId
  ));
  if (!level) {
    throw new Error(`Level ${spec.expectedLevelId} is missing from levelData.`);
  }
  if (level.mapPrefabName !== spec.mapPrefabName) {
    throw new Error(
      `Level ${level.id} expected map prefab ${spec.mapPrefabName}, `
      + `got ${level.mapPrefabName}.`,
    );
  }

  const map = runtimeData.maps.find((candidate) => (
    candidate.prefabName === spec.mapPrefabName
  ));
  if (!map) {
    throw new Error(`Map ${spec.mapPrefabName} is missing from mapData.`);
  }
  if (map.terrainPits.length !== spec.expectedPitCount) {
    throw new Error(
      `Map ${spec.mapPrefabName} expected ${spec.expectedPitCount} terrain pits, `
      + `got ${map.terrainPits.length}.`,
    );
  }

  const firstPit = map.terrainPits[0];
  if (!firstPit) {
    throw new Error(`Map ${spec.mapPrefabName} has no terrain pit sample.`);
  }

  const prefab = runtimeData.mapPrefabs.find((candidate) => (
    candidate.name === spec.mapPrefabName
  ));
  if (!prefab?.bounds) {
    throw new Error(`Map prefab ${spec.mapPrefabName} is missing prefab bounds.`);
  }

  const terrainLayer = prefab.layers.find((layer) => layer.name === "Terrain");
  if (!terrainLayer) {
    throw new Error(`Map prefab ${spec.mapPrefabName} is missing Terrain layer.`);
  }
  if (terrainLayer.tileCount !== spec.expectedTerrainLayerTileCount) {
    throw new Error(
      `Map prefab ${spec.mapPrefabName} expected Terrain tile count `
      + `${spec.expectedTerrainLayerTileCount}, got ${terrainLayer.tileCount}.`,
    );
  }
  if (terrainLayer.tileCount !== map.terrainPits.length) {
    throw new Error(
      `Map prefab ${spec.mapPrefabName} Terrain tile count ${terrainLayer.tileCount} `
      + `does not match terrain pit count ${map.terrainPits.length}.`,
    );
  }

  return {
    id: spec.id,
    levelId: level.id,
    levelName: level.name,
    mapId: map.id,
    mapName: map.name,
    mapPrefabName: map.prefabName,
    mapSizeX: map.sizeX,
    mapSizeY: map.sizeY,
    pitCount: map.terrainPits.length,
    wallCount: map.terrainWalls.length,
    firstPitX: firstPit.x,
    firstPitY: firstPit.y,
    prefabLayerCount: prefab.layerCount,
    prefabTileCount: prefab.tileCount,
    prefabBoundsMinX: prefab.bounds.minX,
    prefabBoundsMinY: prefab.bounds.minY,
    prefabBoundsMaxX: prefab.bounds.maxX,
    prefabBoundsMaxY: prefab.bounds.maxY,
    terrainLayerTileCount: terrainLayer.tileCount,
    terrainLayerBoundsMinX: terrainLayer.bounds.minX,
    terrainLayerBoundsMinY: terrainLayer.bounds.minY,
    terrainLayerBoundsMaxX: terrainLayer.bounds.maxX,
    terrainLayerBoundsMaxY: terrainLayer.bounds.maxY,
  };
}

function createShooterCase(
  spec: ShooterCaseSpec,
  shooter: NfoBulletShooterData,
  event: NfoBulletShooterTimelineEvent,
  eventIndex: number,
): NfoCnParityShooterCase {
  const fireBullet = event.fireBullets.find((candidate) => (
    candidate.bulletTypeId === spec.bulletTypeId
  ));
  if (!fireBullet) {
    throw new Error(`Shooter case ${spec.id} is missing its selected fire bullet.`);
  }

  return {
    id: spec.id,
    shooterId: shooter.id,
    shooterName: shooter.name,
    shooterLifeTimeFrames: shooter.lifeTimeFrames,
    eventIndex,
    eventName: event.name,
    eventFrame: event.frame,
    spawnPos: shooter.spawnPos,
    directionType: event.bulletFireDirectionType,
    rotationType: event.bulletRotationType,
    formationType: event.bulletFormationType,
    formationOffsetX: event.bulletFormationOffsetX,
    formationOffsetY: event.bulletFormationOffsetY,
    directionOffsetAngle: event.bulletFireDirectionOffsetAngle,
    isLoopEvent: event.isLoopEvent,
    loopFrameInterval: event.loopFrameInterval,
    bulletTypeId: fireBullet.bulletTypeId,
    bulletCount: fireBullet.bulletCount,
    bulletSpeed: fireBullet.bulletSpeed,
    noDamage: fireBullet.noDamage,
    expectedDirectionMode: spec.expectedDirectionMode,
  };
}
