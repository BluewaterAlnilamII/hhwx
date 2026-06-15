import assert from "node:assert/strict";
import {
  applyNfoRunResultToSave,
  buyNfoGlobalUpgrade,
  createInitialNfoOfflineSave,
  unlockAllNfoOfflineContent,
  updateNfoOfflineSaveSelection,
} from "../src/lib/nfo-offline-save";
import {
  clearNfoSimulation,
  createNfoSimulation,
  updateNfoSimulation,
  type NfoInputState,
  type NfoSimBullet,
  type NfoSimMinion,
  type NfoSimulationState,
} from "../src/lib/nfo-offline-sim";
import type {
  NfoActiveSkillData,
  NfoAIData,
  NfoBuffData,
  NfoBulletShooterData,
  NfoEnemySpawnData,
  NfoFireBullet,
  NfoLevelData,
  NfoOfflineRuntimeData,
  NfoPlayerSpawnData,
} from "../src/lib/nfo-offline-runtime";

const NO_INPUT: NfoInputState = { moveX: 0, moveY: 0 };
const TESTS: Array<{ name: string; run: () => void }> = [
  {
    name: "natural clear awards clear coin and unlocks LevelData rewards",
    run: testNaturalClearSettlement,
  },
  {
    name: "clear enemy event waits for tagged enemy defeat",
    run: testClearEnemyEventSettlementWaitsForTaggedEnemyDefeat,
  },
  {
    name: "level AI state-change events retarget tagged enemies",
    run: testLevelAIStateChangeEventTargetsTaggedEnemy,
  },
  {
    name: "AI TriggerLevelEventID gates triggered enemy spawn events",
    run: testAIStateTriggerLevelEventGatesEnemySpawn,
  },
  {
    name: "AI state entry buffs apply once to active enemies",
    run: testAIStateEntryBuffAppliesOnceToEnemy,
  },
  {
    name: "AI state entry common-state changes apply to active enemies",
    run: testAIStateEntryCommonStateAppliesToEnemy,
  },
  {
    name: "AI syncDirectionFromTarget aims owner-forward shooters at the target",
    run: testAIStateSyncDirectionAimsOwnerForwardShooter,
  },
  {
    name: "AI state animation metadata updates active enemies",
    run: testAIStateAnimationMetadataAppliesToEnemy,
  },
  {
    name: "endless or event-driven clear types do not auto settle by timer",
    run: testEndlessOrEventDrivenClearTypeDoesNotAutoSettleByTimer,
  },
  {
    name: "quick clear uses the same reward and does not double settle",
    run: testQuickClearSettlement,
  },
  {
    name: "failed runs do not mark clear or unlock LevelData rewards",
    run: testFailedRunSettlement,
  },
  {
    name: "weapon selection respects unlock gates",
    run: testWeaponSelectionUnlockGate,
  },
  {
    name: "character selection respects unlock gates",
    run: testCharacterSelectionUnlockGate,
  },
  {
    name: "equip selection respects unlock gates and character slot limits",
    run: testEquipSelectionUnlockGate,
  },
  {
    name: "debug unlock all exposes every local level weapon and equip",
    run: testDebugUnlockAllContent,
  },
  {
    name: "selected equip attributes apply to player stats",
    run: testSelectedEquipAttributes,
  },
  {
    name: "selected equip weapon modifiers affect bullet fire",
    run: testSelectedEquipWeaponModifiers,
  },
  {
    name: "selected equip pickup modifiers affect magnet and EXP gain",
    run: testSelectedEquipPickupModifiers,
  },
  {
    name: "selected equip critical modifiers affect bullet damage",
    run: testSelectedEquipCriticalModifiers,
  },
  {
    name: "active skill attribute buffs affect pickup modifiers",
    run: testActiveSkillAttributeBuffPickupModifiers,
  },
  {
    name: "active skill coin gain buffs affect coin pickups",
    run: testActiveSkillCoinGainBuffAffectsCoinPickups,
  },
  {
    name: "active skill attribute buffs affect weapon modifiers",
    run: testActiveSkillAttributeBuffWeaponModifiers,
  },
  {
    name: "selected weapon data drives simulated fire behavior",
    run: testSelectedWeaponFireBehavior,
  },
  {
    name: "selected weapon attribute changes apply to player stats",
    run: testSelectedWeaponAttributeChanges,
  },
  {
    name: "collected EXP levels the weapon and changes fire behavior",
    run: testCollectedExpLevelsWeaponAndChangesFireBehavior,
  },
  {
    name: "level-up pickups raise the weapon level without EXP",
    run: testLevelUpPickupRaisesWeaponLevel,
  },
  {
    name: "magnet pickups collect all magnetable pickups",
    run: testMagnetPickupCollectsMagnetablePickups,
  },
  {
    name: "bomb pickups defeat active non-boss enemies",
    run: testBombPickupDefeatsActiveNonBossEnemies,
  },
  {
    name: "enemy AI fire bullets can damage the player",
    run: testEnemyAIFireBulletsDamagePlayer,
  },
  {
    name: "enemy AI idle state does not chase while firing",
    run: testEnemyAIIdleStateDoesNotChaseWhileFiring,
  },
  {
    name: "enemy AI random movement state targets an around-player point while firing",
    run: testEnemyAIRandomMovementStateTargetsAroundPlayerPoint,
  },
  {
    name: "enemy AI teleport timeline does not chase before teleporting and firing",
    run: testEnemyAITeleportTimelineDoesNotChaseBeforeTeleportingAndFiring,
  },
  {
    name: "enemy AI timeline FireBulletNow gates firing",
    run: testEnemyAITimelineFireBulletNow,
  },
  {
    name: "enemy AI timeline NoColliding suppresses contact and bullet hits",
    run: testEnemyAITimelineNoColliding,
  },
  {
    name: "enemy AI can create hostile bullet shooters",
    run: testEnemyAICreatesHostileBulletShooter,
  },
  {
    name: "enemy AI bullet shooter spawn position 1 uses the player position",
    run: testEnemyAIShooterSpawnPosOneUsesPlayerPosition,
  },
  {
    name: "bullet rotate type is loaded from BulletData",
    run: testBulletRotateTypeLoadedFromBulletData,
  },
  {
    name: "rotate-by-speed bullets resynchronize collider direction",
    run: testRotateBySpeedBulletDirection,
  },
  {
    name: "face-direction bullets keep collider direction separate",
    run: testOnlyChangeFaceDirectionBullet,
  },
  {
    name: "owner-forward direct weapons use player facing direction",
    run: testOwnerForwardDirectWeaponUsesPlayerFacingDirection,
  },
  {
    name: "targetless direct weapons use player facing direction and keep spread",
    run: testTargetlessDirectWeaponUsesPlayerFacingDirection,
  },
  {
    name: "friendly-target bullets apply hit buffs to the player",
    run: testFriendlyTargetBulletAppliesPlayerBuff,
  },
  {
    name: "friendly-target bullets apply hit buffs to allied minions",
    run: testFriendlyTargetBulletAppliesMinionBuff,
  },
  {
    name: "weapon self buffs apply to the player without enemy targets",
    run: testWeaponSelfBuffAppliesWithoutEnemyTargets,
  },
  {
    name: "non-attribute-change buffs with attributes affect player movement",
    run: testNonAttributeChangeBuffAttributesAffectPlayerMovement,
  },
  {
    name: "non-counter self buffs fire BuffData bullets on application",
    run: testNonCounterSelfBuffFiresBuffBulletsOnApplication,
  },
  {
    name: "active skill timeline buffs apply to the player",
    run: testActiveSkillTimelineBuffAppliesToPlayer,
  },
  {
    name: "active skill player-side buffs target existing minions",
    run: testActiveSkillPlayerSideBuffTargetsExistingMinions,
  },
  {
    name: "active skill player-side buffs target same-frame spawned minions",
    run: testActiveSkillPlayerSideBuffTargetsSameFrameSpawnedMinions,
  },
  {
    name: "active skill player-side buffs modify minion weapon fire",
    run: testActiveSkillPlayerSideBuffModifiesMinionWeaponFire,
  },
  {
    name: "active skill heal-percent buffs restore player HP immediately",
    run: testActiveSkillHealPercentBuffRestoresPlayerHp,
  },
  {
    name: "invincible buffs prevent player damage from contact and bullets",
    run: testInvincibleBuffPreventsPlayerDamage,
  },
  {
    name: "revive buffs prevent failure and restore player HP",
    run: testReviveBuffPreventsFailureAndRestoresPlayerHp,
  },
  {
    name: "active skill timeline spawns minions",
    run: testActiveSkillTimelineSpawnsMinions,
  },
  {
    name: "active skill summon ring formation uses the radius midpoint",
    run: testActiveSkillSummonRingFormationUsesRadiusMidpoint,
  },
  {
    name: "active skill spawned minions fire assigned weapons",
    run: testActiveSkillSpawnedMinionsFireAssignedWeapons,
  },
  {
    name: "active skill bullet shooters fire timeline bullets",
    run: testActiveSkillBulletShooterFiresTimelineBullets,
  },
  {
    name: "active skill same-frame buffs snapshot shooter source modifiers",
    run: testActiveSkillSameFrameBuffSnapshotsShooterSourceModifiers,
  },
  {
    name: "active skill bullet shooter spawn position 3 uses nearest enemy",
    run: testActiveSkillBulletShooterSpawnPosThreeUsesNearestEnemy,
  },
  {
    name: "active skill bullet shooters honor loop intervals",
    run: testActiveSkillBulletShooterLoopInterval,
  },
  {
    name: "active skill bullet shooter direction 0 uses formation offsets",
    run: testActiveSkillBulletShooterDirectionZeroUsesFormationOffset,
  },
  {
    name: "active skill bullet shooter direction 1 aims at nearest enemy",
    run: testActiveSkillBulletShooterDirectionOneAimsNearestEnemy,
  },
  {
    name: "active skill bullet shooter large multi-bullet events spread radially",
    run: testActiveSkillBulletShooterLargeMultiBulletRadialSpread,
  },
  {
    name: "active skill bullet shooter direction 2 targets the player side",
    run: testActiveSkillBulletShooterDirectionTwoTargetsPlayer,
  },
  {
    name: "active skill bullet shooter direction 3 uses owner direction",
    run: testActiveSkillBulletShooterDirectionThreeUsesOwnerDirection,
  },
  {
    name: "bullet shooter behavior type 1 follows owner position and direction",
    run: testBulletShooterBehaviorTypeOneFollowsOwnerPositionAndDirection,
  },
  {
    name: "weapon level bullet shooters spawn timeline bullets",
    run: testWeaponLevelBulletShooterSpawnsTimelineBullets,
  },
  {
    name: "weapon shooter direction 4 uses owner direction",
    run: testWeaponShooterDirectionFourUsesOwnerDirection,
  },
  {
    name: "weapon shooter formation type 3 rotates with owner direction",
    run: testWeaponShooterFormationTypeThreeRotatesWithOwnerDirection,
  },
  {
    name: "bullet shooter event rotation overrides BulletData rotate type",
    run: testBulletShooterEventRotationOverridesBulletData,
  },
  {
    name: "bullet shooter on-destroy event bullets fire when parent expires",
    run: testBulletShooterOnDestroyEventBullet,
  },
  {
    name: "on-destroy event bullets inherit parent source modifiers",
    run: testOnDestroyEventBulletsInheritParentSourceModifiers,
  },
  {
    name: "shield buffs absorb contact damage and consume charges",
    run: testShieldBuffAbsorbsContactDamage,
  },
  {
    name: "counter buffs fire BuffData bullets on contact",
    run: testCounterBuffFiresBuffBulletsOnContact,
  },
  {
    name: "minion weapons create minions and fire from minion positions",
    run: testMinionWeaponCreatesAndFiresFromMinionPosition,
  },
  {
    name: "minion weapons honor weapon-level minion count",
    run: testMinionWeaponHonorsWeaponLevelMinionCount,
  },
  {
    name: "weapon-level spawn minion data controls minion AI and shooter actions",
    run: testWeaponLevelSpawnMinionDataControlsMinionAIAndShooterActions,
  },
  {
    name: "minion AI idle state does not follow while creating shooters",
    run: testMinionAIIdleStateDoesNotFollowWhileCreatingShooter,
  },
  {
    name: "minion AI FireAllWeaponNow gates own weapon fire",
    run: testMinionAIFireAllWeaponNowGatesOwnWeapon,
  },
  {
    name: "weapon fire groups use group cooldown before full cooldown",
    run: testWeaponFireGroupCooldown,
  },
  {
    name: "bullet damage judge delay and cooldown gate repeated hits",
    run: testBulletDamageJudgeDelayAndCooldown,
  },
  {
    name: "once-per-enemy bullets only damage the same enemy once",
    run: testOncePerEnemyBulletDamage,
  },
  {
    name: "rect bullet colliders use the secondary size as length",
    run: testRectBulletCollider,
  },
  {
    name: "ray bullet colliders use the secondary size as segment length",
    run: testRayBulletCollider,
  },
  {
    name: "bullets expire outside the level bullet boundary",
    run: testBulletBoundaryExpiry,
  },
  {
    name: "bullet outward force moves overlapping enemies without damage",
    run: testBulletOutwardForce,
  },
  {
    name: "bullet inward force pulls overlapping enemies toward the bullet",
    run: testBulletInwardForce,
  },
  {
    name: "hit buffs apply temporary enemy speed attributes",
    run: testHitBuffSpeedAttribute,
  },
  {
    name: "hit buffs apply DOT damage ticks",
    run: testHitBuffDotDamage,
  },
  {
    name: "taunt hit buffs redirect enemy movement to the bullet source",
    run: testTauntHitBuffRedirectsEnemyMovement,
  },
];

for (const test of TESTS) {
  test.run();
  console.log(`ok - ${test.name}`);
}

function testNaturalClearSettlement() {
  const runtimeData = createRuntimeFixture();
  const initialSave = createInitialNfoOfflineSave(runtimeData);
  const baseState = createNfoSimulation(runtimeData);

  const clearedState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 1);
  assert.equal(clearedState.status, "cleared");
  assert.equal(clearedState.collectedCoin, 1000);

  const stableClearedState = updateNfoSimulation(
    clearedState,
    runtimeData,
    NO_INPUT,
    1,
  );
  assert.equal(stableClearedState, clearedState);
  assert.equal(stableClearedState.collectedCoin, 1000);

  const nextSave = applyNfoRunResultToSave(runtimeData, initialSave, clearedState);
  assert.equal(nextSave.upgradeCoin, 1000);
  assert.equal(nextSave.totalRuns, 1);
  assert.deepEqual(nextSave.clearedLevelIds, [1]);
  assert.deepEqual(nextSave.unlockedCharacterIds, [10, 20]);
  assert.deepEqual(nextSave.unlockedLevelIds, [1, 2]);
  assert.deepEqual(nextSave.unlockedWeaponIds, [100, 200]);
  assert.deepEqual(nextSave.unlockedEquipIds, [1, 2, 3]);
  assert.equal(nextSave.bestLevelTimesById["1"], 1);
}

function testClearEnemyEventSettlementWaitsForTaggedEnemyDefeat() {
  const runtimeData = createRuntimeFixture();
  const level = runtimeData.levels[0];
  assert.ok(level);
  runtimeData.enemies.push({
    id: 800,
    name: "Fixture Final Boss",
    enabled: true,
    prefab: "",
    isBoss: true,
    canFly: false,
    canWalkThroughWall: false,
    levels: [
      {
        level: 1,
        maxHp: 50,
        attack: 0,
        defense: 0,
        speed: 0,
        itemMagnetRange: 0,
        bulletSpeed: 0,
        bulletSize: 0,
        bulletLifeTime: 0,
        bulletCount: 0,
        coolDownReduce: 0,
        expGain: 0,
        criticalRate: 0,
        criticalDamage: 150,
        colliderRadius: 60,
      },
    ],
  });
  level.clearType = 1;
  level.totalFrames = 30;
  level.clearEnemyEventId = 1;
  level.clearCoin = 1000;
  level.events.push({
    name: "Fixture Final Boss Spawn",
    eventId: 1,
    enabled: true,
    triggerType: 0,
    triggerEnemyEventId: 0,
    startFrame: 30,
    totalFrames: 1,
    eventType: 2,
    playerSpawn: createPlayerSpawnFixture(),
    enemySpawn: {
      ...createEnemySpawnFixture(),
      enemyTypeId: 800,
      enemyLevel: 1,
      spawnWaveCount: 1,
      spawnWaveIntervalFrames: 30,
      spawnRangeMin: 0,
      spawnRangeMax: 0,
      eventId: 1,
    },
  });
  const baseState = createNfoSimulation(runtimeData);

  const bossSpawnedState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 1);
  assert.equal(bossSpawnedState.status, "playing");
  assert.equal(bossSpawnedState.collectedCoin, 0);
  assert.equal(bossSpawnedState.enemies.length, 1);
  assert.equal(bossSpawnedState.enemies[0]?.spawnEventId, 1);
  assert.equal(bossSpawnedState.spawnedEnemyEventCountsById[1], 1);

  const bossDefeatedState: NfoSimulationState = {
    ...bossSpawnedState,
    enemies: bossSpawnedState.enemies.map((enemy) => (
      enemy.spawnEventId === 1 ? { ...enemy, hp: 0 } : enemy
    )),
  };
  const clearedState = updateNfoSimulation(bossDefeatedState, runtimeData, NO_INPUT, 0);
  assert.equal(clearedState.status, "cleared");
  assert.equal(clearedState.collectedCoin, 1000);
  assert.equal(clearedState.enemies.length, 0);
}

function testLevelAIStateChangeEventTargetsTaggedEnemy() {
  const runtimeData = createRuntimeFixture();
  const level = runtimeData.levels[0];
  assert.ok(level);
  runtimeData.ais.push({
    id: 990,
    name: "Fixture Level Event AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Before Event",
        stateType: 1,
        lastFrame: 0,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [],
      },
      {
        id: 2,
        name: "Fixture After Event",
        stateType: 0,
        lastFrame: 0,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  });
  level.totalFrames = 999999;
  const eventIndex = level.events.length;
  level.events.push({
    name: "Fixture Level AI State Change",
    eventId: 990,
    enabled: true,
    triggerType: 0,
    triggerEnemyEventId: 0,
    startFrame: 60,
    totalFrames: 2,
    eventType: 4,
    playerSpawn: createPlayerSpawnFixture(),
    enemySpawn: createEnemySpawnFixture(),
    enemyAIStateChange: {
      enemyEventId: 77,
      aiStateId: 2,
    },
  });
  const baseState = createStateWithEnemy(
    runtimeData,
    100,
    {
      spawnEventId: 77,
      aiTypeId: 990,
      aiStateId: 1,
      aiStateElapsedFrames: 12,
      aiFireCooldownSeconds: 3,
    },
  );
  const primedState: NfoSimulationState = {
    ...baseState,
    elapsedSeconds: 60 / 30,
    frame: 60,
  };

  const changedState = updateNfoSimulation(primedState, runtimeData, NO_INPUT, 0);

  assert.equal(changedState.enemies[0]?.aiStateId, 2);
  assert.equal(changedState.enemies[0]?.aiStateElapsedFrames, 0);
  assert.equal(changedState.enemies[0]?.aiFireCooldownSeconds, 0);
  assert.equal(changedState.levelAIStateChangeAppliedByEventIndex[eventIndex], true);
}

function testAIStateTriggerLevelEventGatesEnemySpawn() {
  const runtimeData = createRuntimeFixture();
  const level = runtimeData.levels[0];
  assert.ok(level);
  runtimeData.enemies.push({
    id: 880,
    name: "Fixture Trigger Spawn Enemy",
    enabled: true,
    prefab: "",
    isBoss: false,
    canFly: false,
    canWalkThroughWall: false,
    levels: [
      {
        level: 1,
        maxHp: 10,
        attack: 0,
        defense: 0,
        speed: 0,
        itemMagnetRange: 0,
        bulletSpeed: 0,
        bulletSize: 0,
        bulletLifeTime: 0,
        bulletCount: 0,
        coolDownReduce: 0,
        expGain: 0,
        criticalRate: 0,
        criticalDamage: 150,
        colliderRadius: 20,
      },
    ],
  });
  const enemy = runtimeData.enemies[0];
  assert.ok(enemy);

  level.totalFrames = 999999;
  level.events = [
    {
      name: "Fixture Player Spawn",
      eventId: 0,
      enabled: true,
      triggerType: 0,
      triggerEnemyEventId: 0,
      startFrame: 1,
      totalFrames: 0,
      eventType: 1,
      playerSpawn: createPlayerSpawnFixture(),
      enemySpawn: createEnemySpawnFixture(),
    },
    {
      name: "Fixture Triggered Enemy Spawn",
      eventId: 88,
      enabled: true,
      triggerType: 2,
      triggerEnemyEventId: 0,
      startFrame: 30,
      totalFrames: 2,
      eventType: 2,
      playerSpawn: createPlayerSpawnFixture(),
      enemySpawn: {
        enemyTypeId: enemy.id,
        enemyLevel: 1,
        enemyAiTypeId: 0,
        spawnType: 0,
        spawnCenterType: 1,
        spawnWaveCount: 1,
        spawnWaveIntervalFrames: 30,
        spawnRangeMin: 0,
        spawnRangeMax: 0,
        spawnCenterOffsetX: 0,
        spawnCenterOffsetY: 0,
        eventId: 222,
        dropId: 0,
        programControl: false,
      },
    },
  ];
  runtimeData.ais.push({
    id: 991,
    name: "Fixture Trigger Level Event AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Trigger Level Event",
        stateType: 0,
        lastFrame: 0,
        triggerLevelEventId: 88,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  });

  const baseState = createNfoSimulation(runtimeData);
  const untriggeredState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 1);
  assert.equal(untriggeredState.frame, 30);
  assert.equal(untriggeredState.enemies.some((candidate) => candidate.spawnEventId === 222), false);
  assert.equal(untriggeredState.spawnedEnemyEventCountsById[222] ?? 0, 0);

  const triggeredBeforeStartState = createStateWithEnemy(
    runtimeData,
    100,
    {
      aiTypeId: 991,
      aiStateId: 1,
      aiStateElapsedFrames: 0,
      speed: 0,
    },
  );
  const beforeStartState = updateNfoSimulation(
    triggeredBeforeStartState,
    runtimeData,
    NO_INPUT,
    0.5,
  );
  assert.equal(beforeStartState.triggeredLevelEventIds[88], true);
  assert.equal(beforeStartState.enemies.some((candidate) => candidate.spawnEventId === 222), false);

  const spawnedState = updateNfoSimulation(beforeStartState, runtimeData, NO_INPUT, 0.5);
  assert.equal(spawnedState.frame, 30);
  assert.equal(spawnedState.enemies.filter((candidate) => candidate.spawnEventId === 222).length, 1);
  assert.equal(spawnedState.spawnedEnemyEventCountsById[222], 1);
  assert.equal(spawnedState.levelTriggeredEnemySpawnAppliedByEventIndex[1], true);

  const repeatedState = updateNfoSimulation(
    {
      ...spawnedState,
      enemies: spawnedState.enemies.filter((candidate) => candidate.spawnEventId !== 222),
    },
    runtimeData,
    NO_INPUT,
    10,
  );
  assert.equal(repeatedState.enemies.some((candidate) => candidate.spawnEventId === 222), false);
  assert.equal(repeatedState.spawnedEnemyEventCountsById[222], 1);
}

function testAIStateEntryBuffAppliesOnceToEnemy() {
  const runtimeData = createRuntimeFixture();
  runtimeData.buffs.push(
    createBuffFixture({
      id: 130,
      name: "Fixture AI State Entry Stack Buff",
      duplicateType: 1,
      levels: [
        {
          level: 2,
          durationFrames: 90,
          value: 1,
          maxStackCount: 5,
          fireBullets: [],
          attributes: [
            {
              attributeType: 3,
              value: -50,
            },
          ],
        },
      ],
    }),
  );
  runtimeData.ais.push({
    id: 992,
    name: "Fixture AI State Entry Buff AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture AI State Entry Buff",
        stateType: 0,
        lastFrame: 0,
        buffId: 130,
        buffLevel: 2,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  });

  const baseState = createStateWithEnemy(
    runtimeData,
    100,
    {
      aiTypeId: 992,
      aiStateId: 1,
      aiStateElapsedFrames: 0,
      speed: 0,
    },
  );
  const buffedState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 1 / 30);
  const activeBuff = buffedState.enemies[0]?.activeBuffs[0];
  assert.ok(activeBuff, "expected AI state entry buff to apply to the enemy");
  assert.equal(activeBuff.id, 130);
  assert.equal(activeBuff.level, 2);
  assert.equal(activeBuff.stackCount, 1);
  assert.equal(activeBuff.remainingSeconds, 3);
  assert.equal(activeBuff.attributes[0]?.attributeType, 3);
  assert.equal(activeBuff.attributes[0]?.value, -50);

  const repeatedState = updateNfoSimulation(buffedState, runtimeData, NO_INPUT, 1 / 30);
  const repeatedBuff = repeatedState.enemies[0]?.activeBuffs[0];
  assert.ok(repeatedBuff, "expected AI state entry buff to remain active");
  assert.equal(repeatedState.enemies[0]?.activeBuffs.length, 1);
  assert.equal(repeatedBuff.stackCount, 1);
  assertClose(repeatedBuff.remainingSeconds, 3 - (1 / 30), "AI state entry buff duration");
}

function testAIStateEntryCommonStateAppliesToEnemy() {
  const runtimeData = createRuntimeFixture();
  runtimeData.ais.push({
    id: 993,
    name: "Fixture AI State Common State AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture AI State Common State",
        stateType: 0,
        lastFrame: 0,
        changesEntityCommonState: true,
        entityCommonStateChangeTo: 7,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  });

  const baseState = createStateWithEnemy(
    runtimeData,
    100,
    {
      aiTypeId: 993,
      aiStateId: 1,
      aiStateElapsedFrames: 0,
      speed: 0,
    },
  );
  const changedState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 1 / 30);

  assert.equal(changedState.enemies[0]?.entityCommonState, 7);
}

function testAIStateSyncDirectionAimsOwnerForwardShooter() {
  const runtimeData = createRuntimeFixture();
  runtimeData.bulletShooters.push(createBulletShooterFixture({
    id: 9960,
    name: "Fixture Synced Owner-Forward Shooter",
    followsOwnerDirection: true,
    events: [
      createBulletShooterEventFixture({
        bulletFireDirectionType: 3,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 9961,
            bulletSpeed: 300,
            bulletLifeTime: 30,
          }),
        ],
      }),
    ],
  }));
  runtimeData.ais.push({
    id: 994,
    name: "Fixture Sync Direction AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Sync Direction",
        stateType: 0,
        lastFrame: 0,
        syncDirectionFromTarget: true,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 9960,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  });

  const baseState = createStateWithEnemy(
    runtimeData,
    100,
    {
      aiTypeId: 994,
      aiStateId: 1,
      aiStateElapsedFrames: 0,
      x: 0,
      y: -300,
      speed: 0,
      radius: 5,
    },
  );
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
  };

  const shooterState = updateNfoSimulation(state, runtimeData, NO_INPUT, 0);
  const shooter = shooterState.activeShooters.find((candidate) => candidate.shooterId === 9960);
  assert.ok(shooter, "expected synced AI to create owner-forward shooter");
  assertClose(
    shooterState.enemies[0]?.facingAngle ?? Number.NaN,
    Math.PI / 2,
    "synced enemy facing angle",
  );
  assertClose(shooter.ownerFacingAngle, Math.PI / 2, "synced shooter owner-facing angle");

  const firedState = updateNfoSimulation(shooterState, runtimeData, NO_INPUT, 1 / 30);
  const bullet = firedState.bullets.find((candidate) => candidate.bulletTypeId === 9961);
  assert.ok(bullet, "expected synced owner-forward shooter to fire");
  assertClose(bullet.vx, 0, "synced owner-forward bullet vx");
  assert.ok(bullet.vy > 0, `expected synced owner-forward bullet to travel upward, got ${bullet.vy}`);
}

function testAIStateAnimationMetadataAppliesToEnemy() {
  const runtimeData = createRuntimeFixture();
  runtimeData.ais.push({
    id: 995,
    name: "Fixture AI State Animation AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Animated State",
        stateType: 0,
        lastFrame: 0,
        playAnimeName: "Windup",
        restartsAnimation: true,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [
          {
            frame: 2,
            name: "Fixture Release Animation",
            playAnimeName: "Release",
            noColliding: false,
            fireBulletNow: false,
            fireAllWeaponNow: false,
          },
        ],
      },
    ],
  });

  const baseState = createStateWithEnemy(
    runtimeData,
    100,
    {
      aiTypeId: 995,
      aiStateId: 1,
      aiStateElapsedFrames: 0,
      speed: 0,
    },
  );

  const entryState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 1 / 30);
  assert.equal(entryState.enemies[0]?.animationName, "Windup");
  assert.equal(entryState.enemies[0]?.animationRevision, 1);

  const timelineState = updateNfoSimulation(entryState, runtimeData, NO_INPUT, 1 / 30);
  assert.equal(timelineState.enemies[0]?.animationName, "Release");
  assert.equal(timelineState.enemies[0]?.animationRevision, 2);

  const stableState = updateNfoSimulation(timelineState, runtimeData, NO_INPUT, 1 / 30);
  assert.equal(stableState.enemies[0]?.animationName, "Release");
  assert.equal(stableState.enemies[0]?.animationRevision, 2);
}

function testEndlessOrEventDrivenClearTypeDoesNotAutoSettleByTimer() {
  const runtimeData = createRuntimeFixture();
  const level = runtimeData.levels[0];
  assert.ok(level);
  level.clearType = 2;
  level.totalFrames = 1;
  level.clearCoin = 1000;
  const baseState = createNfoSimulation(runtimeData);

  const nextState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 1);

  assert.equal(nextState.status, "playing");
  assert.equal(nextState.collectedCoin, 0);
  assert.equal(nextState.frame, 30);
}

function testQuickClearSettlement() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData);

  const clearedState = clearNfoSimulation(baseState, runtimeData);
  assert.equal(clearedState.status, "cleared");
  assert.equal(clearedState.collectedCoin, 1000);

  const stableClearedState = clearNfoSimulation(clearedState, runtimeData);
  assert.equal(stableClearedState, clearedState);
  assert.equal(stableClearedState.collectedCoin, 1000);
}

function testFailedRunSettlement() {
  const runtimeData = createRuntimeFixture();
  const initialSave = createInitialNfoOfflineSave(runtimeData);
  const failedState = {
    ...createNfoSimulation(runtimeData),
    status: "failed" as const,
    collectedCoin: 25,
  };

  const nextSave = applyNfoRunResultToSave(runtimeData, initialSave, failedState);
  assert.equal(nextSave.upgradeCoin, 25);
  assert.equal(nextSave.totalRuns, 1);
  assert.deepEqual(nextSave.clearedLevelIds, []);
  assert.deepEqual(nextSave.unlockedCharacterIds, [10]);
  assert.deepEqual(nextSave.unlockedLevelIds, [1]);
  assert.deepEqual(nextSave.unlockedWeaponIds, [100]);
  assert.deepEqual(nextSave.unlockedEquipIds, [1, 3]);
  assert.deepEqual(nextSave.bestLevelTimesById, {});
}

function testWeaponSelectionUnlockGate() {
  const runtimeData = createRuntimeFixture();
  const initialSave = createInitialNfoOfflineSave(runtimeData);
  assert.equal(initialSave.lastSelection.weaponId, 100);
  assert.deepEqual(initialSave.unlockedWeaponIds, [100]);
  assert.deepEqual(initialSave.lastSelection.equipIds, [1, 3]);

  const lockedWeaponSelection = updateNfoOfflineSaveSelection(runtimeData, initialSave, {
    ...initialSave.lastSelection,
    weaponId: 200,
  });
  assert.equal(lockedWeaponSelection.lastSelection.weaponId, 100);

  const upgradedSave = buyNfoGlobalUpgrade(runtimeData, initialSave, 900);
  assert.deepEqual(upgradedSave.unlockedWeaponIds, [100, 200]);

  const selectedWeaponSave = updateNfoOfflineSaveSelection(runtimeData, upgradedSave, {
    ...upgradedSave.lastSelection,
    weaponId: 200,
  });
  assert.equal(selectedWeaponSave.lastSelection.weaponId, 200);
}

function testCharacterSelectionUnlockGate() {
  const runtimeData = createRuntimeFixture();
  const initialSave = createInitialNfoOfflineSave(runtimeData);
  assert.deepEqual(initialSave.unlockedCharacterIds, [10]);
  assert.equal(initialSave.lastSelection.characterId, 10);

  const lockedCharacterSelection = updateNfoOfflineSaveSelection(runtimeData, initialSave, {
    ...initialSave.lastSelection,
    characterId: 20,
    weaponId: 200,
    equipIds: [2],
  });
  assert.equal(lockedCharacterSelection.lastSelection.characterId, 10);
  assert.equal(lockedCharacterSelection.lastSelection.weaponId, 100);
  assert.deepEqual(lockedCharacterSelection.lastSelection.equipIds, [1, 3]);

  const clearedState = updateNfoSimulation(createNfoSimulation(runtimeData), runtimeData, NO_INPUT, 1);
  const unlockedSave = applyNfoRunResultToSave(runtimeData, initialSave, clearedState);
  const unlockedCharacterSelection = updateNfoOfflineSaveSelection(runtimeData, unlockedSave, {
    ...unlockedSave.lastSelection,
    characterId: 20,
    weaponId: 200,
    equipIds: [2],
  });

  assert.equal(unlockedCharacterSelection.lastSelection.characterId, 20);
  assert.equal(unlockedCharacterSelection.lastSelection.weaponId, 200);
  assert.deepEqual(unlockedCharacterSelection.lastSelection.equipIds, [2]);
}

function testEquipSelectionUnlockGate() {
  const runtimeData = createRuntimeFixture();
  const initialSave = createInitialNfoOfflineSave(runtimeData);
  assert.deepEqual(initialSave.unlockedEquipIds, [1, 3]);
  assert.deepEqual(initialSave.lastSelection.equipIds, [1, 3]);

  const lockedEquipSelection = updateNfoOfflineSaveSelection(runtimeData, initialSave, {
    ...initialSave.lastSelection,
    equipIds: [2, 1, 3],
  });
  assert.deepEqual(lockedEquipSelection.lastSelection.equipIds, [1]);

  const upgradedSave = buyNfoGlobalUpgrade(runtimeData, initialSave, 901);
  assert.deepEqual(upgradedSave.unlockedEquipIds, [1, 2, 3]);

  const selectedEquipSave = updateNfoOfflineSaveSelection(runtimeData, upgradedSave, {
    ...upgradedSave.lastSelection,
    equipIds: [2, 1, 3],
  });
  assert.deepEqual(selectedEquipSave.lastSelection.equipIds, [2, 1]);
}

function testDebugUnlockAllContent() {
  const runtimeData = createRuntimeFixture();
  const initialSave = createInitialNfoOfflineSave(runtimeData);

  const lockedSelection = updateNfoOfflineSaveSelection(runtimeData, initialSave, {
    ...initialSave.lastSelection,
    levelId: 2,
    weaponId: 200,
    equipIds: [2, 1],
  });
  assert.equal(lockedSelection.lastSelection.levelId, 1);
  assert.equal(lockedSelection.lastSelection.weaponId, 100);
  assert.deepEqual(lockedSelection.lastSelection.equipIds, [1]);

  const unlockedSave = unlockAllNfoOfflineContent(runtimeData, initialSave);
  assert.deepEqual(
    unlockedSave.unlockedCharacterIds,
    runtimeData.characters
      .map((character) => character.id)
      .sort((left, right) => left - right),
  );
  assert.deepEqual(
    unlockedSave.unlockedLevelIds,
    runtimeData.levels
      .map((level) => level.id)
      .sort((left, right) => left - right),
  );
  assert.deepEqual(
    unlockedSave.unlockedWeaponIds,
    runtimeData.weapons
      .map((weapon) => weapon.id)
      .sort((left, right) => left - right),
  );
  assert.deepEqual(
    unlockedSave.unlockedEquipIds,
    runtimeData.equips
      .map((equip) => equip.id)
      .sort((left, right) => left - right),
  );

  const selectedSave = updateNfoOfflineSaveSelection(runtimeData, unlockedSave, {
    ...unlockedSave.lastSelection,
    levelId: 2,
    weaponId: 200,
    equipIds: [2, 1],
  });
  assert.equal(selectedSave.lastSelection.levelId, 2);
  assert.equal(selectedSave.lastSelection.weaponId, 200);
  assert.deepEqual(selectedSave.lastSelection.equipIds, [2, 1]);
}

function testSelectedEquipAttributes() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData, { equipIds: [] });
  const equippedState = createNfoSimulation(runtimeData, { equipIds: [1, 2, 3] });

  assert.deepEqual(equippedState.selection.equipIds, [1, 2]);
  assert.equal(equippedState.player.equipCount, 2);
  assert.equal(equippedState.player.maxHp, baseState.player.maxHp + 3);
  assert.equal(equippedState.player.hp, baseState.player.hp + 3);
  assert.equal(equippedState.player.attack, baseState.player.attack + 5);
  assert.equal(equippedState.player.speed, baseState.player.speed + 50);
  assert.equal(equippedState.player.defense, baseState.player.defense);
}

function testSelectedEquipWeaponModifiers() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(
    runtimeData,
    1300,
    {
      x: 200,
      y: 0,
      hp: 1000,
      radius: 5,
    },
    { equipIds: [4] },
  );

  const nextState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0);
  assert.equal(nextState.bullets.length, 3);
  assertCooldown(
    Math.hypot(nextState.bullets[0]?.vx ?? 0, nextState.bullets[0]?.vy ?? 0),
    150,
  );
  assert.equal(nextState.bullets[0]?.colliderWidth, 30);
  assert.equal(nextState.bullets[0]?.colliderLength, 50);
  assert.equal(nextState.bullets[0]?.remainingSeconds, 1.5);
  assertCooldown(nextState.player.fireCooldownSeconds, 0.5);
}

function testSelectedEquipPickupModifiers() {
  const runtimeData = createRuntimeFixture();
  const baseState = createStateWithPickup(runtimeData, [], {
    x: 120,
    value: 10,
  });
  const baseNextState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 0.1);
  assert.equal(baseNextState.collectedExp, 0);
  assert.equal(baseNextState.pickups.length, 1);

  const equippedState = createStateWithPickup(runtimeData, [5], {
    x: 120,
    value: 10,
  });
  const equippedNextState = updateNfoSimulation(equippedState, runtimeData, NO_INPUT, 0.1);
  assert.equal(equippedNextState.collectedExp, 15);
  assert.equal(equippedNextState.pickups.length, 0);
}

function testSelectedEquipCriticalModifiers() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(
    runtimeData,
    1400,
    {
      x: 0,
      y: 0,
      hp: 100,
      radius: 5,
    },
    { equipIds: [6] },
  );

  const nextState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(nextState.bullets[0]?.isCritical, true);
  assert.equal(nextState.bullets[0]?.damage, 20);
  assert.equal(nextState.enemies[0]?.hp, 80);
}

function testActiveSkillAttributeBuffPickupModifiers() {
  const runtimeData = createRuntimeFixture();
  addPlayerAttributeBuffFixture(runtimeData);
  setActiveSkillToBuffsOnly(runtimeData, [{ buffId: 121, level: 1 }]);

  const pickupState = createStateWithPickup(runtimeData, [], {
    x: 120,
    value: 10,
  });
  const nextState = updateNfoSimulation(
    chargeActiveSkill(pickupState),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(nextState.collectedExp, 15);
  assert.equal(nextState.pickups.length, 0);
  assert.ok(nextState.player.activeBuffs.some((buff) => buff.id === 121));
}

function testActiveSkillCoinGainBuffAffectsCoinPickups() {
  const runtimeData = createRuntimeFixture();
  addPlayerAttributeBuffFixture(runtimeData);
  setActiveSkillToBuffsOnly(runtimeData, [{ buffId: 121, level: 1 }]);

  const pickupState = createStateWithPickup(runtimeData, [], {
    itemType: 5,
    value: 10,
  });
  const nextState = updateNfoSimulation(
    chargeActiveSkill(pickupState),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(nextState.collectedCoin, 20);
  assert.equal(nextState.collectedExp, 0);
  assert.equal(nextState.pickups.length, 0);
  assert.ok(nextState.player.activeBuffs.some((buff) => buff.id === 121));
}

function testActiveSkillAttributeBuffWeaponModifiers() {
  const runtimeData = createRuntimeFixture();
  addPlayerAttributeBuffFixture(runtimeData);
  setActiveSkillToBuffsOnly(runtimeData, [{ buffId: 121, level: 1 }]);

  const stateWithEnemy = createStateWithEnemy(
    runtimeData,
    1300,
    {
      x: 200,
      y: 0,
      hp: 1000,
      radius: 5,
    },
  );
  const nextState = updateNfoSimulation(
    chargeActiveSkill(stateWithEnemy),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(nextState.bullets.length, 3);
  assertCooldown(
    Math.hypot(nextState.bullets[0]?.vx ?? 0, nextState.bullets[0]?.vy ?? 0),
    150,
  );
  assert.equal(nextState.bullets[0]?.colliderWidth, 30);
  assert.equal(nextState.bullets[0]?.colliderLength, 50);
  assert.ok((nextState.bullets[0]?.remainingSeconds ?? 0) > 1);
  assert.equal(nextState.bullets[0]?.isCritical, true);
  assert.equal(nextState.bullets[0]?.damage, 2);
  assertCooldown(nextState.player.fireCooldownSeconds, 0.5);
}

function testSelectedWeaponFireBehavior() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 200);

  const nextState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(nextState.selection.weaponId, 200);
  assert.equal(nextState.bullets.length, 3);
  assert.equal(nextState.bullets[0]?.bulletTypeId, 2);
  assert.equal(nextState.bullets[1]?.bulletTypeId, 2);
  assert.equal(nextState.bullets[2]?.bulletTypeId, 3);
  assert.equal(nextState.bullets[0]?.damage, 9);
  assert.equal(nextState.bullets[1]?.damage, 9);
  assert.equal(nextState.bullets[2]?.damage, 4);
}

function testSelectedWeaponAttributeChanges() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData, { weaponId: 100 });
  const weaponState = createNfoSimulation(runtimeData, { weaponId: 1800 });

  assert.equal(weaponState.player.attack, baseState.player.attack + 3);
  assert.equal(weaponState.player.defense, baseState.player.defense + 2);
  assert.equal(weaponState.player.speed, baseState.player.speed + 40);
}

function testCollectedExpLevelsWeaponAndChangesFireBehavior() {
  const runtimeData = createRuntimeFixture();
  const pickupState = {
    ...createStateWithEnemy(
      runtimeData,
      2200,
      {
        x: 500,
        y: 0,
        hp: 1000,
        radius: 5,
      },
    ),
    player: {
      ...createNfoSimulation(runtimeData, { weaponId: 2200 }).player,
      fireCooldownSeconds: 999,
    },
    pickups: [
      {
        id: 9100,
        itemId: 1,
        name: "Fixture EXP",
        itemType: 0,
        value: 50,
        canBeMagneted: true,
        radius: 5,
        remainingSeconds: 10,
        x: 0,
        y: 0,
      },
    ],
  };

  const leveledState = updateNfoSimulation(pickupState, runtimeData, NO_INPUT, 0.1);
  assert.equal(leveledState.collectedExp, 50);
  assert.equal(leveledState.player.weaponLevel, 2);
  assert.equal(leveledState.player.expIntoLevel, 0);
  assert.equal(leveledState.player.expToNextLevel, 100);
  assert.equal(leveledState.player.attack, 4);
  assert.equal(leveledState.bullets.length, 0);

  const firedState = updateNfoSimulation(
    {
      ...leveledState,
      player: {
        ...leveledState.player,
        fireCooldownSeconds: 0,
      },
    },
    runtimeData,
    NO_INPUT,
    0,
  );
  assert.equal(firedState.bullets.length, 2);
  assert.equal(firedState.bullets[0]?.bulletTypeId, 22);
  assert.equal(firedState.bullets[0]?.damage, 10);
}

function testLevelUpPickupRaisesWeaponLevel() {
  const runtimeData = createRuntimeFixture();
  const pickupState = createStateWithPickup(runtimeData, [], {
    itemType: 3,
    value: 0,
  });
  const selectedState = createNfoSimulation(runtimeData, { weaponId: 2200 });
  const nextState = updateNfoSimulation(
    {
      ...selectedState,
      player: {
        ...selectedState.player,
        fireCooldownSeconds: 999,
      },
      pickups: pickupState.pickups,
    },
    runtimeData,
    NO_INPUT,
    0.1,
  );

  assert.equal(nextState.collectedExp, 0);
  assert.equal(nextState.player.weaponLevel, 2);
  assert.equal(nextState.player.expIntoLevel, 0);
}

function testMagnetPickupCollectsMagnetablePickups() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData, { weaponId: 100, equipIds: [] });
  const nextState = updateNfoSimulation(
    {
      ...baseState,
      pickups: [
        {
          id: 9200,
          itemId: 5,
          name: "Fixture Magnet",
          itemType: 2,
          value: 0,
          canBeMagneted: false,
          radius: 5,
          remainingSeconds: 10,
          x: 0,
          y: 0,
        },
        {
          id: 9201,
          itemId: 1,
          name: "Far EXP",
          itemType: 0,
          value: 10,
          canBeMagneted: true,
          radius: 5,
          remainingSeconds: 10,
          x: 500,
          y: 0,
        },
        {
          id: 9202,
          itemId: 4,
          name: "Far Bomb",
          itemType: 1,
          value: 0,
          canBeMagneted: false,
          radius: 5,
          remainingSeconds: 10,
          x: 500,
          y: 20,
        },
      ],
    },
    runtimeData,
    NO_INPUT,
    0.1,
  );

  assert.equal(nextState.collectedItems[5], 1);
  assert.equal(nextState.collectedItems[1], 1);
  assert.equal(nextState.collectedItems[4], undefined);
  assert.equal(nextState.collectedExp, 10);
  assert.equal(nextState.pickups.length, 1);
  assert.equal(nextState.pickups[0]?.itemId, 4);
}

function testBombPickupDefeatsActiveNonBossEnemies() {
  const runtimeData = createRuntimeFixture();
  const baseState = createStateWithEnemy(
    runtimeData,
    100,
    {
      x: 300,
      y: 0,
      hp: 10,
      radius: 5,
    },
  );
  const nextState = updateNfoSimulation(
    {
      ...baseState,
      enemies: [
        baseState.enemies[0],
        {
          ...baseState.enemies[0],
          id: 2,
          name: "Fixture Boss",
          isBoss: true,
          hp: 50,
          maxHp: 50,
        },
      ],
      pickups: [
        {
          id: 9300,
          itemId: 4,
          name: "Fixture Bomb",
          itemType: 1,
          value: 0,
          canBeMagneted: false,
          radius: 5,
          remainingSeconds: 10,
          x: 0,
          y: 0,
        },
      ],
    },
    runtimeData,
    NO_INPUT,
    0.1,
  );

  assert.equal(nextState.collectedItems[4], 1);
  assert.equal(nextState.defeatedEnemies, 1);
  assert.equal(nextState.score, 10);
  assert.equal(nextState.enemies.length, 1);
  assert.equal(nextState.enemies[0]?.isBoss, true);
  assert.equal(nextState.enemies[0]?.hp, 50);
}

function testEnemyAIFireBulletsDamagePlayer() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData);
  const state = addAIEnemyToState(baseState, {
    aiTypeId: 900,
    attack: 3,
    x: baseState.player.x + 60,
    y: baseState.player.y,
  });
  const nextState = updateNfoSimulation(
    {
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    },
    runtimeData,
    NO_INPUT,
    0.2,
  );

  assert.equal(nextState.bullets[0]?.bulletTypeId, 30);
  assert.equal(nextState.bullets[0]?.canDamagePlayer, true);
  assert.equal(nextState.player.hp, baseState.player.hp - 7);
  assertCooldown(nextState.enemies[0]?.aiFireCooldownSeconds ?? 0, 1);
}

function testEnemyAIIdleStateDoesNotChaseWhileFiring() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData);
  const state = addAIEnemyToState(baseState, {
    aiTypeId: 907,
    attack: 3,
    speed: 120,
    x: baseState.player.x + 120,
    y: baseState.player.y,
  });
  const nextState = updateNfoSimulation(
    {
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    },
    runtimeData,
    NO_INPUT,
    0.2,
  );

  assert.equal(nextState.enemies[0]?.x, state.enemies[0]?.x);
  assert.equal(nextState.enemies[0]?.y, state.enemies[0]?.y);
  assert.equal(nextState.bullets[0]?.bulletTypeId, 30);
  assert.equal(nextState.bullets[0]?.canDamagePlayer, true);
  assertCooldown(nextState.enemies[0]?.aiFireCooldownSeconds ?? 0, 1);
}

function testEnemyAIRandomMovementStateTargetsAroundPlayerPoint() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData);
  const state = addAIEnemyToState(baseState, {
    aiTypeId: 908,
    attack: 3,
    speed: 120,
    x: baseState.player.x + 120,
    y: baseState.player.y,
  });
  const nextState = updateNfoSimulation(
    {
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    },
    runtimeData,
    NO_INPUT,
    0.2,
  );
  const enemy = nextState.enemies[0];
  const startEnemy = state.enemies[0];

  assert.ok(enemy);
  assert.ok(startEnemy);
  assert.notEqual(enemy.y, startEnemy.y);
  assert.equal(enemy.aiMoveTargetStateId, 1);
  assert.notEqual(enemy.aiMoveTargetY, baseState.player.y);
  assert.equal(nextState.bullets[0]?.bulletTypeId, 30);
  assert.equal(nextState.bullets[0]?.canDamagePlayer, true);
}

function testEnemyAITeleportTimelineDoesNotChaseBeforeTeleportingAndFiring() {
  const runtimeData = createRuntimeFixture();
  const level = runtimeData.levels[0];
  assert.ok(level);
  level.totalFrames = 999999;
  const baseState = createNfoSimulation(runtimeData);
  const state = addAIEnemyToState(baseState, {
    aiTypeId: 909,
    attack: 3,
    speed: 120,
    x: baseState.player.x + 300,
    y: baseState.player.y,
  });
  const armedState = {
    ...state,
    player: {
      ...state.player,
      fireCooldownSeconds: 999,
    },
  };
  const waitingState = updateNfoSimulation(armedState, runtimeData, NO_INPUT, 29 / 30);
  const teleportState = updateNfoSimulation(waitingState, runtimeData, NO_INPUT, 2 / 30);
  const firedState = updateNfoSimulation(teleportState, runtimeData, NO_INPUT, 15 / 30);
  const normalState = updateNfoSimulation(firedState, runtimeData, NO_INPUT, 14 / 30);
  const startEnemy = state.enemies[0];
  const waitingEnemy = waitingState.enemies[0];
  const teleportEnemy = teleportState.enemies[0];

  assert.ok(startEnemy);
  assert.ok(waitingEnemy);
  assert.ok(teleportEnemy);
  assert.equal(waitingEnemy.x, startEnemy.x);
  assert.equal(waitingEnemy.y, startEnemy.y);
  assert.equal(waitingEnemy.noColliding, true);
  assert.equal(waitingState.bullets.length, 0);
  assert.notDeepEqual(
    { x: teleportEnemy.x, y: teleportEnemy.y },
    { x: startEnemy.x, y: startEnemy.y },
  );
  assert.equal(teleportEnemy.noColliding, true);
  assert.equal(teleportState.bullets.length, 0);
  assert.equal(firedState.bullets[0]?.bulletTypeId, 30);
  assert.equal(firedState.bullets[0]?.canDamagePlayer, true);
  assert.equal(normalState.enemies[0]?.aiStateId, 2);
  assert.equal(normalState.enemies[0]?.noColliding, false);
}

function testEnemyAITimelineFireBulletNow() {
  const runtimeData = createRuntimeFixture();
  const level = runtimeData.levels[0];
  assert.ok(level);
  level.totalFrames = 999999;
  const baseState = createNfoSimulation(runtimeData);
  const state = addAIEnemyToState(baseState, {
    aiTypeId: 902,
    attack: 3,
    speed: 0,
    x: baseState.player.x + 60,
    y: baseState.player.y,
  });
  const waitingState = updateNfoSimulation(
    {
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    },
    runtimeData,
    NO_INPUT,
    14 / 30,
  );
  const firedState = updateNfoSimulation(waitingState, runtimeData, NO_INPUT, 2 / 30);

  assert.equal(waitingState.bullets.length, 0);
  assert.equal(waitingState.player.hp, baseState.player.hp);
  assert.equal(firedState.bullets[0]?.bulletTypeId, 32);
  assert.equal(firedState.bullets[0]?.canDamagePlayer, true);
  assert.equal(firedState.player.hp, baseState.player.hp - 8);
}

function testEnemyAITimelineNoColliding() {
  const runtimeData = createRuntimeFixture();
  const level = runtimeData.levels[0];
  assert.ok(level);
  level.totalFrames = 999999;
  const baseState = createNfoSimulation(runtimeData, { weaponId: 100 });
  const state = addAIEnemyToState(baseState, {
    aiTypeId: 903,
    attack: 3,
    hp: 99,
    speed: 0,
    x: baseState.player.x + 20,
    y: baseState.player.y,
  });
  const noCollidingState = updateNfoSimulation(state, runtimeData, NO_INPUT, 1 / 30);
  const collidingState = updateNfoSimulation(
    {
      ...noCollidingState,
      player: {
        ...noCollidingState.player,
        fireCooldownSeconds: 999,
      },
    },
    runtimeData,
    NO_INPUT,
    1,
  );

  assert.equal(noCollidingState.enemies[0]?.noColliding, true);
  assert.equal(noCollidingState.player.hp, baseState.player.hp);
  assert.equal(noCollidingState.enemies[0]?.hp, 99);
  assert.equal(collidingState.enemies[0]?.noColliding, false);
  assert.equal(collidingState.player.hp, baseState.player.hp - 3);
}

function testEnemyAICreatesHostileBulletShooter() {
  const runtimeData = createRuntimeFixture();
  const level = runtimeData.levels[0];
  assert.ok(level);
  level.totalFrames = 999999;
  const baseState = createNfoSimulation(runtimeData);
  const state = addAIEnemyToState(baseState, {
    aiTypeId: 901,
    attack: 2,
    x: baseState.player.x + 200,
    y: baseState.player.y,
  });
  const idleState = updateNfoSimulation(
    {
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    },
    runtimeData,
    NO_INPUT,
    0,
  );
  assert.equal(idleState.activeShooters.length, 0);
  assert.equal(idleState.enemies[0]?.aiStateId, 1);

  const spawnedShooterState = updateNfoSimulation(
    idleState,
    runtimeData,
    NO_INPUT,
    1,
  );
  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    runtimeData,
    NO_INPUT,
    2 / 30,
  );
  const bullet = firedShooterState.bullets[0];
  const hitState = updateNfoSimulation(
    firedShooterState,
    runtimeData,
    NO_INPUT,
    0.6,
  );
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, 4800);
  assert.equal(spawnedShooterState.activeShooters[0]?.sourceTeam, "enemy");
  assert.equal(spawnedShooterState.enemies[0]?.aiStateId, 2);
  assert.equal(bullet?.bulletTypeId, 31);
  assert.equal(bullet?.canDamagePlayer, true);
  assert.ok((bullet?.vx ?? 0) < 0);
  assert.equal(hitState.player.hp, baseState.player.hp - 7);
}

function testEnemyAIShooterSpawnPosOneUsesPlayerPosition() {
  const runtimeData = createRuntimeFixture();
  const level = runtimeData.levels[0];
  assert.ok(level);
  level.totalFrames = 999999;
  const baseState = createNfoSimulation(runtimeData);
  const state = addAIEnemyToState(baseState, {
    aiTypeId: 906,
    attack: 2,
    x: baseState.player.x + 200,
    y: baseState.player.y,
  });

  const spawnedShooterState = updateNfoSimulation(
    {
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    },
    runtimeData,
    NO_INPUT,
    0,
  );
  const shooter = spawnedShooterState.activeShooters[0];
  assert.ok(shooter);
  assert.equal(shooter.shooterId, 4900);
  assert.equal(shooter.sourceTeam, "enemy");
  assertClose(shooter.x, baseState.player.x, "spawnPos 1 shooter x");
  assertClose(shooter.y, baseState.player.y, "spawnPos 1 shooter y");

  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    runtimeData,
    NO_INPUT,
    1 / 30,
  );
  const bullet = firedShooterState.bullets.find((candidate) => candidate.bulletTypeId === 31);
  assert.ok(bullet);
  assert.equal(bullet.canDamagePlayer, true);
  assertClose(bullet.x, baseState.player.x, "spawnPos 1 bullet x");
  assertClose(bullet.y, baseState.player.y, "spawnPos 1 bullet y");
}

function testBulletRotateTypeLoadedFromBulletData() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 1500, {
    x: 200,
    y: 0,
    hp: 1000,
    radius: 5,
  });

  const nextState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0);
  assert.equal(nextState.bullets[0]?.bulletTypeId, 16);
  assert.equal(nextState.bullets[0]?.rotateType, 1);
  assertClose(nextState.bullets[0]?.angle ?? -1, 0, "bullet angle");
  assertClose(nextState.bullets[0]?.facingAngle ?? -1, 0, "bullet facing angle");
}

function testRotateBySpeedBulletDirection() {
  const runtimeData = createRuntimeFixture();
  const firedState = updateNfoSimulation(
    createStateWithEnemy(runtimeData, 1500, {
      x: 200,
      y: 0,
      hp: 1000,
      radius: 5,
    }),
    runtimeData,
    NO_INPUT,
    0,
  );
  const firedBullet = firedState.bullets[0];
  assert.ok(firedBullet);

  const driftedState = {
    ...firedState,
    player: {
      ...firedState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [],
    bullets: [
      {
        ...firedBullet,
        angle: Math.PI / 2,
        facingAngle: Math.PI / 2,
        vx: 100,
        vy: 0,
      },
    ],
  };

  const nextState = updateNfoSimulation(driftedState, runtimeData, NO_INPUT, 0.1);
  const nextBullet = nextState.bullets[0];
  assert.ok(nextBullet);
  assertClose(nextBullet.angle, 0, "rotate-by-speed collider angle");
  assertClose(nextBullet.facingAngle, 0, "rotate-by-speed facing angle");
  assertClose(nextBullet.x, 10, "rotate-by-speed x");
  assertClose(nextBullet.y, 0, "rotate-by-speed y");
}

function testOnlyChangeFaceDirectionBullet() {
  const runtimeData = createRuntimeFixture();
  const firedState = updateNfoSimulation(
    createStateWithEnemy(runtimeData, 1600, {
      x: 200,
      y: 0,
      hp: 1000,
      radius: 5,
    }),
    runtimeData,
    NO_INPUT,
    0,
  );
  const firedBullet = firedState.bullets[0];
  assert.ok(firedBullet);

  const driftedState = {
    ...firedState,
    player: {
      ...firedState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [],
    bullets: [
      {
        ...firedBullet,
        angle: Math.PI / 2,
        facingAngle: Math.PI / 2,
        vx: 100,
        vy: 0,
      },
    ],
  };

  const nextState = updateNfoSimulation(driftedState, runtimeData, NO_INPUT, 0.1);
  const nextBullet = nextState.bullets[0];
  assert.ok(nextBullet);
  assertClose(nextBullet.angle, Math.PI / 2, "face-direction collider angle");
  assertClose(nextBullet.facingAngle, 0, "face-direction facing angle");
  assertClose(nextBullet.x, 10, "face-direction x");
  assertClose(nextBullet.y, 0, "face-direction y");
}

function testOwnerForwardDirectWeaponUsesPlayerFacingDirection() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 12, {
    x: 600,
    y: 0,
    hp: 1000,
    radius: 5,
  });
  const nextState = updateNfoSimulation(
    {
      ...stateWithEnemy,
      player: {
        ...stateWithEnemy.player,
        fireCooldownSeconds: 0,
      },
    },
    runtimeData,
    { moveX: 0, moveY: 1 },
    0,
  );
  const bullet = nextState.bullets[0];

  assertClose(nextState.player.facingAngle, Math.PI / 2, "owner-forward player facing");
  assert.equal(bullet?.bulletTypeId, 19);
  assertClose(bullet?.angle ?? Number.NaN, Math.PI / 2, "owner-forward angle");
  assertClose(bullet?.vx ?? Number.NaN, 0, "owner-forward vx");
  assertClose(bullet?.vy ?? Number.NaN, 100, "owner-forward vy");
}

function testTargetlessDirectWeaponUsesPlayerFacingDirection() {
  const runtimeData = createRuntimeFixture();
  runtimeData.weapons.push({
    id: 2,
    name: "Fixture Targetless Player Direction",
    enabled: true,
    iconSpriteName: "",
    maxLevel: 1,
    fireSound: "",
    levels: [
      {
        level: 1,
        fireCooldownFrames: 30,
        fireGroupCooldownFrames: 0,
        groupCount: 1,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 2,
            bulletCount: 3,
            bulletAttack: 1,
            bulletSpeed: 100,
            bulletSize: 20,
            bulletLifeTime: 90,
            bulletHitTimes: 1,
          }),
        ],
      },
    ],
  });
  const baseState = createNfoSimulation(runtimeData, { weaponId: 2 });
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    runtimeData,
    { moveX: 0, moveY: 1 },
    0,
  );
  const bullets = firedState.bullets.filter((bullet) => bullet.bulletTypeId === 2);

  assert.equal(bullets.length, 3);
  assertClose(firedState.player.facingAngle, Math.PI / 2, "targetless player facing");
  assertClose(bullets[0]?.angle ?? Number.NaN, Math.PI / 2 - 0.12, "targetless first angle");
  assertClose(bullets[1]?.angle ?? Number.NaN, Math.PI / 2, "targetless center angle");
  assertClose(bullets[2]?.angle ?? Number.NaN, Math.PI / 2 + 0.12, "targetless last angle");
  assertClose(bullets[1]?.vx ?? Number.NaN, 0, "targetless center vx");
  assertClose(bullets[1]?.vy ?? Number.NaN, 100, "targetless center vy");
}

function testFriendlyTargetBulletAppliesPlayerBuff() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 1700, {
    x: 40,
    y: 0,
    hp: 100,
    radius: 5,
  });

  const hitState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0);
  assert.equal(hitState.enemies[0]?.hp, 100);
  assert.equal(hitState.player.activeBuffs[0]?.id, 7);
  assert.equal(hitState.player.activeBuffs[0]?.attributes.length, 2);

  const movedState = updateNfoSimulation(
    {
      ...hitState,
      player: {
        ...hitState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [],
      bullets: [],
    },
    runtimeData,
    { moveX: 1, moveY: 0 },
    0.1,
  );
  assertClose(movedState.player.x, 55, "friendly buff movement speed");

  const expiredState = updateNfoSimulation(
    {
      ...movedState,
      player: {
        ...movedState.player,
        fireCooldownSeconds: 999,
      },
    },
    runtimeData,
    NO_INPUT,
    2,
  );
  assert.equal(expiredState.player.activeBuffs.length, 0);
}

function testFriendlyTargetBulletAppliesMinionBuff() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData, { weaponId: 100 });
  const minion = {
    id: 7000,
    minionId: 50,
    aiTypeId: 0,
    weaponId: 0,
    weaponLevel: 1,
    name: "Fixture Allied Minion",
    speed: 300,
    radius: 28,
    x: 100,
    y: 0,
    remainingSeconds: 10,
    aiFireCooldownSeconds: 0,
    fireCooldownSeconds: 0,
    pendingFireGroups: 0,
    canFireOwnWeapon: false,
    activeBuffs: [],
  };
  const hitState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 999,
      },
      minions: [minion],
      bullets: [
        createSimBulletFixture({
          id: 7001,
          bulletTypeId: 18,
          dealsDamage: false,
          x: minion.x,
          y: minion.y,
          radius: 50,
          colliderWidth: 100,
          colliderLength: 100,
          hitTargetType: 1,
          hitBuffId: 7,
          hitBuffLevel: 1,
          remainingHits: 1,
        }),
      ],
    },
    runtimeData,
    NO_INPUT,
    0,
  );
  const minionBuff = hitState.minions[0]?.activeBuffs.find((buff) => buff.id === 7);

  assert.equal(hitState.player.activeBuffs.length, 0);
  assert.ok(minionBuff, "expected friendly hit buff to apply to the allied minion");
  assert.equal(minionBuff.type, 1);
  assert.equal(minionBuff.attributes[1]?.attributeType, 4);
  assert.equal(minionBuff.attributes[1]?.value, 50);

  const movedState = updateNfoSimulation(
    {
      ...hitState,
      player: {
        ...hitState.player,
        fireCooldownSeconds: 999,
      },
      bullets: [],
      enemies: [
        {
          id: 7002,
          typeId: 300,
          name: "Fixture Minion Target",
          x: 1000,
          y: 0,
          hp: 100,
          maxHp: 100,
          attack: 0,
          defense: 0,
          speed: 0,
          radius: 5,
          isBoss: false,
          canFly: false,
          canWalkThroughWall: false,
          dropId: 0,
          activeBuffs: [],
        },
      ],
    },
    runtimeData,
    NO_INPUT,
    0.1,
  );

  assertClose(movedState.minions[0]?.x ?? Number.NaN, 135, "buffed minion x");
  assertClose(movedState.minions[0]?.y ?? Number.NaN, 0, "buffed minion y");
}

function testWeaponSelfBuffAppliesWithoutEnemyTargets() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData, { weaponId: 1900 });
  assert.equal(baseState.enemies.length, 0);

  const firedState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 0);
  assert.equal(firedState.bullets.length, 0);
  assert.equal(firedState.player.activeBuffs.length, 1);
  assert.equal(firedState.player.activeBuffs[0]?.id, 8);
  assert.equal(firedState.player.activeBuffs[0]?.level, 2);
  assert.equal(firedState.player.activeBuffs[0]?.value, 4);
  assertCooldown(firedState.player.fireCooldownSeconds, 1);

  const repeatedState = updateNfoSimulation(
    {
      ...firedState,
      player: {
        ...firedState.player,
        fireCooldownSeconds: 0,
      },
    },
    runtimeData,
    NO_INPUT,
    0,
  );
  assert.equal(repeatedState.player.activeBuffs.length, 1);
  assert.equal(repeatedState.player.activeBuffs[0]?.id, 8);
  assert.equal(repeatedState.player.activeBuffs[0]?.level, 2);
  assert.equal(repeatedState.player.activeBuffs[0]?.value, 4);
}

function testNonAttributeChangeBuffAttributesAffectPlayerMovement() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData, { weaponId: 2050 });
  const state = {
    ...baseState,
    worldBounds: {
      minX: -10000,
      minY: -10000,
      maxX: 10000,
      maxY: 10000,
    },
    player: {
      ...baseState.player,
      x: 1000,
      y: 1000,
    },
  };
  const buffedState = updateNfoSimulation(state, runtimeData, NO_INPUT, 0);
  const movedState = updateNfoSimulation(
    buffedState,
    runtimeData,
    { moveX: 1, moveY: 0 },
    0.1,
  );

  assert.equal(buffedState.player.activeBuffs[0]?.id, 122);
  assert.equal(buffedState.player.activeBuffs[0]?.type, 7);
  assertClose(
    movedState.player.x,
    state.player.x + (state.player.speed + 500) * 0.1,
    "non-attr-change buffed player x",
  );
  assertClose(movedState.player.y, state.player.y, "non-attr-change buffed player y");
}

function testNonCounterSelfBuffFiresBuffBulletsOnApplication() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(
    runtimeData,
    2050,
    {
      x: 700,
      y: 0,
      hp: 1000,
      radius: 5,
    },
  );
  const nextState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0);
  const buffBullet = nextState.bullets.find((bullet) => bullet.bulletTypeId === 1220);

  assert.ok(nextState.player.activeBuffs.some((buff) => buff.id === 122));
  assert.ok(buffBullet, "expected non-counter self buff to fire its BuffData bullet");
  assert.equal(buffBullet.hitTargetType, 0);
  assert.equal(buffBullet.damageJudgeType, 1);
  assert.equal(buffBullet.colliderWidth, 80);
  assert.equal(buffBullet.remainingHits, 9999);
  assertCooldown(Math.hypot(buffBullet.vx, buffBullet.vy), 500);
}

function testActiveSkillTimelineBuffAppliesToPlayer() {
  const runtimeData = createRuntimeFixture();
  const state = createNfoSimulation(runtimeData);
  const chargedState = {
    ...state,
    activeSkill: {
      ...state.activeSkill,
      chargeFrames: state.activeSkill.chargeMaxFrames,
    },
  };

  const nextState = updateNfoSimulation(
    chargedState,
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  const activeBuff = nextState.player.activeBuffs.find((buff) => buff.id === 7);
  assert.equal(nextState.activeSkill.id, 3000);
  assert.equal(nextState.activeSkill.isActive, true);
  assert.equal(nextState.activeSkill.chargeFrames, 0);
  assert.deepEqual(nextState.activeSkill.triggeredEventIndexes, [0]);
  assert.equal(activeBuff?.level, 1);
  assert.equal(activeBuff?.remainingSeconds, 2);
}

function testActiveSkillPlayerSideBuffTargetsExistingMinions() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToBuffsOnly(runtimeData, [{ buffId: 7, level: 1, targetType: 1 }]);
  const state = createNfoSimulation(runtimeData);
  const playerSideState = updateNfoSimulation(
    {
      ...chargeActiveSkill(state),
      minions: [createSimMinionFixture()],
    },
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.ok(playerSideState.player.activeBuffs.some((buff) => buff.id === 7));
  assert.equal(playerSideState.minions[0]?.activeBuffs.find((buff) => buff.id === 7)?.level, 1);
  assert.equal(
    playerSideState.enemies.some((enemy) => enemy.activeBuffs.some((buff) => buff.id === 7)),
    false,
  );

  const selfOnlyRuntimeData = createRuntimeFixture();
  setActiveSkillToBuffsOnly(selfOnlyRuntimeData, [{ buffId: 7, level: 1, targetType: 0 }]);
  const selfOnlyState = createNfoSimulation(selfOnlyRuntimeData);
  const selfOnlyBuffState = updateNfoSimulation(
    {
      ...chargeActiveSkill(selfOnlyState),
      minions: [createSimMinionFixture()],
    },
    selfOnlyRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.ok(selfOnlyBuffState.player.activeBuffs.some((buff) => buff.id === 7));
  assert.equal(selfOnlyBuffState.minions[0]?.activeBuffs.some((buff) => buff.id === 7), false);
}

function testActiveSkillPlayerSideBuffTargetsSameFrameSpawnedMinions() {
  const runtimeData = createRuntimeFixture();
  const activeSkillEvent = runtimeData.activeSkills[0]?.levels[0]?.events[0];
  assert.ok(activeSkillEvent?.spawnMinion);
  activeSkillEvent.buffs = [{ targetType: 1, buffId: 7, level: 1 }];
  const playerSideState = updateNfoSimulation(
    chargeActiveSkill(createNfoSimulation(runtimeData)),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(playerSideState.minions.length, 2);
  assert.ok(playerSideState.player.activeBuffs.some((buff) => buff.id === 7));
  assert.ok(playerSideState.minions.every((minion) => (
    minion.activeBuffs.some((buff) => buff.id === 7 && buff.level === 1)
  )));

  const selfOnlyRuntimeData = createRuntimeFixture();
  const selfOnlyActiveSkillEvent = selfOnlyRuntimeData.activeSkills[0]?.levels[0]?.events[0];
  assert.ok(selfOnlyActiveSkillEvent?.spawnMinion);
  selfOnlyActiveSkillEvent.buffs = [{ targetType: 0, buffId: 7, level: 1 }];
  const selfOnlyState = updateNfoSimulation(
    chargeActiveSkill(createNfoSimulation(selfOnlyRuntimeData)),
    selfOnlyRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(selfOnlyState.minions.length, 2);
  assert.ok(selfOnlyState.player.activeBuffs.some((buff) => buff.id === 7));
  assert.ok(selfOnlyState.minions.every((minion) => (
    !minion.activeBuffs.some((buff) => buff.id === 7)
  )));
}

function testActiveSkillPlayerSideBuffModifiesMinionWeaponFire() {
  const runtimeData = createRuntimeFixture();
  addPlayerAttributeBuffFixture(runtimeData);
  setActiveSkillToBuffsOnly(runtimeData, [{ buffId: 121, level: 1, targetType: 1 }]);
  const state = addContactEnemyToState(createNfoSimulation(runtimeData), {
    x: 1000,
    y: 0,
    speed: 0,
  });
  const playerSideState = updateNfoSimulation(
    {
      ...chargeActiveSkill(state),
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
      minions: [
        createSimMinionFixture({
          weaponId: 2100,
          weaponLevel: 1,
          canFireOwnWeapon: true,
          speed: 0,
          x: 0,
          y: 0,
        }),
      ],
    },
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const buffedBullets = playerSideState.bullets.filter((bullet) => bullet.bulletTypeId === 21);
  assert.equal(buffedBullets.length, 3);
  assert.ok(buffedBullets.every((bullet) => Math.hypot(bullet.vx, bullet.vy) === 150));
  assert.ok(buffedBullets.every((bullet) => bullet.colliderWidth === 100));

  const selfOnlyRuntimeData = createRuntimeFixture();
  addPlayerAttributeBuffFixture(selfOnlyRuntimeData);
  setActiveSkillToBuffsOnly(selfOnlyRuntimeData, [{ buffId: 121, level: 1, targetType: 0 }]);
  const selfOnlyBaseState = addContactEnemyToState(createNfoSimulation(selfOnlyRuntimeData), {
    x: 1000,
    y: 0,
    speed: 0,
  });
  const selfOnlyState = updateNfoSimulation(
    {
      ...chargeActiveSkill(selfOnlyBaseState),
      player: {
        ...selfOnlyBaseState.player,
        fireCooldownSeconds: 999,
      },
      minions: [
        createSimMinionFixture({
          weaponId: 2100,
          weaponLevel: 1,
          canFireOwnWeapon: true,
          speed: 0,
          x: 0,
          y: 0,
        }),
      ],
    },
    selfOnlyRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const selfOnlyBullets = selfOnlyState.bullets.filter((bullet) => bullet.bulletTypeId === 21);
  assert.equal(selfOnlyBullets.length, 1);
  assert.equal(Math.hypot(selfOnlyBullets[0]?.vx ?? 0, selfOnlyBullets[0]?.vy ?? 0), 100);
  assert.equal(selfOnlyBullets[0]?.colliderWidth, 90);
}

function testActiveSkillHealPercentBuffRestoresPlayerHp() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToBuffsOnly(runtimeData, [{ buffId: 105, level: 1 }]);
  const state = createNfoSimulation(runtimeData);
  const damagedState = {
    ...state,
    player: {
      ...state.player,
      hp: Math.max(1, state.player.maxHp - 15),
    },
  };
  const healedState = updateNfoSimulation(
    chargeActiveSkill(damagedState),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(healedState.player.hp, state.player.maxHp);
  assert.equal(healedState.player.activeBuffs.some((buff) => buff.id === 105), false);
}

function testInvincibleBuffPreventsPlayerDamage() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToBuffsOnly(runtimeData, [{ buffId: 13, level: 1 }]);
  const state = createNfoSimulation(runtimeData);
  const invincibleState = updateNfoSimulation(
    chargeActiveSkill(state),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const activeBuff = invincibleState.player.activeBuffs.find((buff) => buff.id === 13);
  assert.ok(activeBuff);
  assert.equal(activeBuff.type, 9);

  const contactState = addContactEnemyToState(invincibleState, {
    attack: 999,
    hp: 100,
    radius: 5,
  });
  const contactProtectedState = updateNfoSimulation(contactState, runtimeData, NO_INPUT, 0);
  assert.equal(contactProtectedState.player.hp, state.player.hp);

  const hostileBulletState = updateNfoSimulation(
    {
      ...contactProtectedState,
      player: {
        ...contactProtectedState.player,
        damageCooldownSeconds: 0,
      },
      enemies: [],
      bullets: [
        {
          id: 900001,
          bulletTypeId: 99,
          dealsDamage: true,
          rotateType: 0,
          motionType: "linear",
          angle: 0,
          facingAngle: 0,
          x: contactProtectedState.player.x,
          y: contactProtectedState.player.y,
          vx: 0,
          vy: 0,
          damage: 999,
          attackerAttack: 999,
          isCritical: false,
          canDamagePlayer: true,
          hitTargetType: 1,
          radius: 100,
          colliderType: 0,
          colliderWidth: 200,
          colliderLength: 200,
          colliderForwardOffset: 0,
          damageJudgeType: 0,
          damageJudgeDelaySeconds: 0,
          damageJudgeCooldownSeconds: 0.5,
          forceType: 0,
          force: 0,
          hitBuffId: 0,
          hitBuffLevel: 0,
          onDestroyFireBullets: [],
          remainingSeconds: 1,
          remainingHits: 1,
          hasHitPlayer: false,
          playerHitCooldownSeconds: 0,
          hitEnemyIds: [],
          hitCooldownSecondsByEnemyId: {},
        },
      ],
    },
    runtimeData,
    NO_INPUT,
    0,
  );

  assert.equal(hostileBulletState.player.hp, state.player.hp);
}

function testReviveBuffPreventsFailureAndRestoresPlayerHp() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToBuffsOnly(runtimeData, [{ buffId: 106, level: 1 }]);
  const state = createNfoSimulation(runtimeData);
  const activeState = updateNfoSimulation(
    chargeActiveSkill(state),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const activeBuff = activeState.player.activeBuffs.find((buff) => buff.id === 106);
  assert.ok(activeBuff);
  assert.equal(activeBuff.type, 12);

  const contactState = addContactEnemyToState(activeState, {
    attack: state.player.maxHp + state.player.defense + 999,
    hp: 100,
    radius: 5,
  });
  const revivedState = updateNfoSimulation(contactState, runtimeData, NO_INPUT, 0);

  assert.equal(revivedState.status, "playing");
  assert.equal(revivedState.player.hp, state.player.maxHp);
  assert.equal(revivedState.player.activeBuffs.some((buff) => buff.id === 106), false);
  assertCooldown(revivedState.player.damageCooldownSeconds, 0.8);

  const failedState = updateNfoSimulation(
    {
      ...revivedState,
      player: {
        ...revivedState.player,
        hp: 0,
        damageCooldownSeconds: 0,
      },
      enemies: [],
    },
    runtimeData,
    NO_INPUT,
    0,
  );

  assert.equal(failedState.status, "failed");
}

function testActiveSkillTimelineSpawnsMinions() {
  const runtimeData = createRuntimeFixture();
  const state = createNfoSimulation(runtimeData);
  const nextState = updateNfoSimulation(
    {
      ...state,
      activeSkill: {
        ...state.activeSkill,
        chargeFrames: state.activeSkill.chargeMaxFrames,
      },
    },
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(nextState.minions.length, 2);
  assert.equal(nextState.nextEntityId, 3);
  assert.equal(nextState.minions[0]?.minionId, 50);
  assert.equal(nextState.minions[0]?.aiTypeId, 202);
  assert.equal(nextState.minions[0]?.weaponId, 2100);
  assert.equal(nextState.minions[0]?.weaponLevel, 4);
  assert.equal(nextState.minions[0]?.canFireOwnWeapon, true);
  assert.equal(nextState.minions[0]?.fireCooldownSeconds, 0);
  assert.equal(nextState.minions[0]?.x, 80);
  assert.equal(nextState.minions[0]?.y, 20);
  assert.equal(nextState.minions[1]?.x, -60);
  assert.equal(Math.round(nextState.minions[1]?.y ?? 0), 20);
}

function testActiveSkillSummonRingFormationUsesRadiusMidpoint() {
  const runtimeData = createRuntimeFixture();
  const minion = runtimeData.minions.find((candidate) => candidate.id === 50);
  assert.ok(minion);
  minion.speed = 0;
  setActiveSkillToSpawnMinionOnly(runtimeData, {
    spawnCount: 3,
    spawnFormation: 1,
    spawnCenterOffsetX: 0,
    spawnCenterOffsetY: 0,
    spawnRadiusMin: 400,
    spawnRadiusMax: 600,
  });
  const state = {
    ...createNfoSimulation(runtimeData),
    worldBounds: {
      minX: -2000,
      minY: -2000,
      maxX: 2000,
      maxY: 2000,
    },
  };
  const nextState = updateNfoSimulation(
    chargeActiveSkill(state),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(nextState.minions.length, 3);
  const distances = nextState.minions.map((minion) => (
    Math.round(Math.hypot(minion.x - state.player.x, minion.y - state.player.y))
  ));
  assert.deepEqual(distances, [500, 500, 500]);
  assertClose(nextState.minions[0]?.x ?? Number.NaN, state.player.x + 500, "ring minion 0 x");
  assertClose(nextState.minions[0]?.y ?? Number.NaN, state.player.y, "ring minion 0 y");
}

function testActiveSkillSpawnedMinionsFireAssignedWeapons() {
  const runtimeData = createRuntimeFixture();
  const state = createNfoSimulation(runtimeData);
  const spawnState = updateNfoSimulation(
    {
      ...state,
      activeSkill: {
        ...state.activeSkill,
        chargeFrames: state.activeSkill.chargeMaxFrames,
      },
    },
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const firstMinion = spawnState.minions[0];
  assert.ok(firstMinion);

  const fireState = updateNfoSimulation(
    {
      ...spawnState,
      player: {
        ...spawnState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [
        {
          id: 9000,
          typeId: 300,
          name: "Fixture Skill Minion Target",
          x: firstMinion.x,
          y: firstMinion.y,
          hp: 100,
          maxHp: 100,
          attack: 0,
          defense: 0,
          speed: 0,
          radius: 5,
          isBoss: false,
          canFly: false,
          canWalkThroughWall: false,
          dropId: 0,
          activeBuffs: [],
        },
      ],
    },
    runtimeData,
    NO_INPUT,
    0,
  );

  assert.equal(fireState.bullets.length, 2);
  assert.equal(fireState.bullets[0]?.bulletTypeId, 21);
  assertClose(fireState.bullets[0]?.x ?? Number.NaN, firstMinion.x, "active minion bullet x");
  assertClose(fireState.bullets[0]?.y ?? Number.NaN, firstMinion.y, "active minion bullet y");
  assertCooldown(fireState.minions[0]?.fireCooldownSeconds ?? 0, 1);
  assertCooldown(fireState.minions[1]?.fireCooldownSeconds ?? 0, 1);
  assert.equal(fireState.enemies[0]?.hp, 89);
}

function testActiveSkillBulletShooterFiresTimelineBullets() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 4000);
  const state = createStateWithEnemy(runtimeData, 100, { x: 70, hp: 100 });
  const nextState = updateNfoSimulation(
    chargeActiveSkill({
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(nextState.activeShooters.length, 1);
  assert.equal(nextState.activeShooters[0]?.shooterId, 4000);
  assert.equal(nextState.bullets.length, 1);
  assert.equal(nextState.bullets[0]?.bulletTypeId, 23);
  assert.equal(nextState.bullets[0]?.x, state.player.x);
  assert.equal(nextState.bullets[0]?.y, state.player.y);
  assert.equal(nextState.enemies[0]?.hp, 88);
}

function testActiveSkillSameFrameBuffSnapshotsShooterSourceModifiers() {
  const runtimeData = createRuntimeFixture();
  addPlayerAttributeBuffFixture(runtimeData);
  const shortBuffLevel = runtimeData.buffs.find((buff) => buff.id === 121)?.levels[0];
  assert.ok(shortBuffLevel);
  shortBuffLevel.durationFrames = 1;
  const activeSkillLevel = runtimeData.activeSkills[0]?.levels[0];
  assert.ok(activeSkillLevel);
  activeSkillLevel.events = [
    {
      name: "Fixture Same-Frame Shooter Before Buff",
      frame: 1,
      bulletShooterId: 4000,
      fullScreenEffectName: "",
      buffs: [],
      spawnMinion: null,
    },
    {
      name: "Fixture Same-Frame Buff",
      frame: 1,
      bulletShooterId: 0,
      fullScreenEffectName: "",
      buffs: [{ targetType: 0, buffId: 121, level: 1 }],
      spawnMinion: null,
    },
  ];
  const state = createNfoSimulation(runtimeData);
  const firstFireState = updateNfoSimulation(
    chargeActiveSkill({
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const shooter = firstFireState.activeShooters[0];

  assert.ok(shooter);
  assert.equal(shooter.bulletCountModifier, 2);
  assert.equal(shooter.bulletLifeTimeModifier, 15);
  assert.equal(shooter.bulletSizeModifier, 10);
  assert.equal(shooter.bulletSpeedModifier, 50);
  assert.equal(firstFireState.bullets.filter((bullet) => bullet.bulletTypeId === 23).length, 3);

  const secondLoopState = updateNfoSimulation(
    {
      ...firstFireState,
      bullets: [],
    },
    runtimeData,
    NO_INPUT,
    10 / 30,
  );
  const secondLoopBullets = secondLoopState.bullets.filter((bullet) => bullet.bulletTypeId === 23);

  assert.equal(
    secondLoopState.player.activeBuffs.some((buff) => buff.id === 121),
    false,
  );
  assert.equal(secondLoopBullets.length, 3);
  assert.ok(secondLoopBullets.every((bullet) => bullet.colliderWidth === 130));
  assert.ok(secondLoopBullets.every((bullet) => bullet.attackerAttack === shooter.attack));
}

function testActiveSkillBulletShooterSpawnPosThreeUsesNearestEnemy() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 5100);
  const baseState = createStateWithEnemy(runtimeData, 100, {
    x: 640,
    y: 0,
    hp: 100,
    radius: 5,
  });
  const nearEnemy = {
    ...baseState.enemies[0],
    id: 2,
    x: 80,
    y: 40,
  };
  const farEnemy = {
    ...baseState.enemies[0],
    id: 1,
    x: -640,
    y: 0,
  };
  const nextState = updateNfoSimulation(
    chargeActiveSkill({
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [farEnemy, nearEnemy],
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const shooter = nextState.activeShooters.find((candidate) => candidate.shooterId === 5100);
  const bullet = nextState.bullets.find((candidate) => candidate.bulletTypeId === 34);

  assert.ok(shooter);
  assertClose(shooter.x, nearEnemy.x, "SpawnPos 3 shooter x");
  assertClose(shooter.y, nearEnemy.y, "SpawnPos 3 shooter y");
  assert.ok(bullet);
  assertClose(bullet.x, nearEnemy.x, "SpawnPos 3 bullet x");
  assertClose(bullet.y, nearEnemy.y, "SpawnPos 3 bullet y");
}

function testActiveSkillBulletShooterLoopInterval() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 4000);
  const state = createStateWithEnemy(runtimeData, 100, { x: 70, hp: 100 });
  const firstShotState = updateNfoSimulation(
    chargeActiveSkill({
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const beforeLoopState = updateNfoSimulation(firstShotState, runtimeData, NO_INPUT, 9 / 30);
  const loopedState = updateNfoSimulation(beforeLoopState, runtimeData, NO_INPUT, 1 / 30);

  assert.equal(firstShotState.bullets.length, 1);
  assert.equal(beforeLoopState.bullets.length, 1);
  assert.equal(loopedState.bullets.length, 2);
  assert.equal(loopedState.activeShooters[0]?.ageFrames, 11);
  assert.equal(loopedState.enemies[0]?.hp, 76);
}

function testActiveSkillBulletShooterDirectionZeroUsesFormationOffset() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 4100);
  const state = createStateWithEnemy(runtimeData, 100, { x: -600, y: 0, hp: 100 });
  const nextState = updateNfoSimulation(
    chargeActiveSkill({
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const bullet = nextState.bullets[0];

  assert.equal(nextState.bullets.length, 1);
  assert.equal(bullet?.bulletTypeId, 24);
  assertClose(bullet?.x ?? Number.NaN, state.player.x, "direction 0 x");
  assert.ok((bullet?.y ?? 0) > state.player.y + 100);
  assertClose(bullet?.vx ?? Number.NaN, 0, "direction 0 vx");
  assert.ok((bullet?.vy ?? 0) > 0);
}

function testActiveSkillBulletShooterDirectionOneAimsNearestEnemy() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 4200);
  const state = createStateWithEnemy(runtimeData, 100, { x: 600, y: 0, hp: 100 });
  const nextState = updateNfoSimulation(
    chargeActiveSkill({
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const bullet = nextState.bullets[0];

  assert.equal(nextState.bullets.length, 1);
  assert.equal(bullet?.bulletTypeId, 25);
  assert.ok((bullet?.vx ?? 0) > 0);
  assert.ok((bullet?.vy ?? 0) < 0);
}

function testActiveSkillBulletShooterLargeMultiBulletRadialSpread() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 4210);
  const state = createStateWithEnemy(runtimeData, 100, { x: 600, y: 0, hp: 100 });
  const nextState = updateNfoSimulation(
    chargeActiveSkill({
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const bullets = nextState.bullets.filter((bullet) => bullet.bulletTypeId === 25);

  assert.equal(bullets.length, 6);
  assert.ok(bullets.some((bullet) => bullet.vx > 0));
  assert.ok(bullets.some((bullet) => bullet.vx < 0));
  assert.ok(bullets.some((bullet) => bullet.vy > 0));
  assert.ok(bullets.some((bullet) => bullet.vy < 0));
}

function testActiveSkillBulletShooterDirectionTwoTargetsPlayer() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 4700);
  const state = createNfoSimulation(runtimeData);
  const nextState = updateNfoSimulation(
    chargeActiveSkill({
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const bullet = nextState.bullets[0];

  assert.equal(state.enemies.length, 0);
  assert.equal(nextState.bullets.length, 1);
  assert.equal(bullet?.bulletTypeId, 29);
  assert.ok((bullet?.x ?? 0) > state.player.x);
  assert.ok((bullet?.vx ?? 0) < 0);
  assertClose(bullet?.vy ?? Number.NaN, 0, "direction 2 vy");
}

function testActiveSkillBulletShooterDirectionThreeUsesOwnerDirection() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 4300);
  const state = createStateWithEnemy(runtimeData, 100, { x: 600, y: 0, hp: 100 });
  const nextState = updateNfoSimulation(
    chargeActiveSkill({
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const bullet = nextState.bullets[0];

  assert.equal(nextState.bullets.length, 1);
  assert.equal(bullet?.bulletTypeId, 26);
  assertClose(bullet?.vx ?? Number.NaN, 0, "direction 3 vx");
  assert.ok((bullet?.vy ?? 0) > 0);
}

function testBulletShooterBehaviorTypeOneFollowsOwnerPositionAndDirection() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 4350);
  const state = createNfoSimulation(runtimeData);
  const spawnedShooterState = updateNfoSimulation(
    chargeActiveSkill({
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const movedOwnerState = {
    ...spawnedShooterState,
    player: {
      ...spawnedShooterState.player,
      x: spawnedShooterState.player.x + 240,
      y: spawnedShooterState.player.y + 80,
      facingAngle: Math.PI / 2,
    },
  };
  const firedShooterState = updateNfoSimulation(
    movedOwnerState,
    runtimeData,
    NO_INPUT,
    9 / 30,
  );
  const shooter = firedShooterState.activeShooters[0];
  const bullet = firedShooterState.bullets[0];

  assert.equal(spawnedShooterState.bullets.length, 0);
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, 4350);
  assertClose(shooter?.x ?? Number.NaN, movedOwnerState.player.x + 30, "follow shooter x");
  assertClose(shooter?.y ?? Number.NaN, movedOwnerState.player.y + 4, "follow shooter y");
  assertClose(
    shooter?.ownerFacingAngle ?? Number.NaN,
    Math.PI / 2,
    "follow shooter owner direction",
  );
  assert.equal(firedShooterState.bullets.length, 1);
  assert.equal(bullet?.bulletTypeId, 35);
  assertClose(bullet?.x ?? Number.NaN, movedOwnerState.player.x + 30, "follow bullet x");
  assertClose(bullet?.y ?? Number.NaN, movedOwnerState.player.y + 4, "follow bullet y");
  assertClose(bullet?.angle ?? Number.NaN, Math.PI / 2, "follow bullet angle");
}

function testWeaponLevelBulletShooterSpawnsTimelineBullets() {
  const runtimeData = createRuntimeFixture();
  const state = createStateWithEnemy(runtimeData, 4400, { x: 70, hp: 100 });
  const spawnedShooterState = updateNfoSimulation(state, runtimeData, NO_INPUT, 0);
  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    runtimeData,
    NO_INPUT,
    1 / 30,
  );

  assert.equal(spawnedShooterState.activeShooters.length, 1);
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, 4000);
  assert.equal(spawnedShooterState.bullets.length, 0);
  assert.equal(firedShooterState.bullets.length, 1);
  assert.equal(firedShooterState.bullets[0]?.bulletTypeId, 23);
  assert.equal(firedShooterState.enemies[0]?.hp, 88);
}

function testWeaponShooterDirectionFourUsesOwnerDirection() {
  const runtimeData = createRuntimeFixture();
  const state = createStateWithEnemy(runtimeData, 4500, { x: -600, y: 0, hp: 100 });
  const spawnedShooterState = updateNfoSimulation(state, runtimeData, NO_INPUT, 0);
  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    runtimeData,
    NO_INPUT,
    1 / 30,
  );
  const bullet = firedShooterState.bullets[0];

  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, 4500);
  assert.equal(firedShooterState.bullets.length, 1);
  assert.equal(bullet?.bulletTypeId, 27);
  assert.ok((bullet?.x ?? 0) > state.player.x + 100);
  assert.ok((bullet?.vx ?? 0) > 0);
  assertClose(bullet?.vy ?? Number.NaN, 0, "direction 4 vy");
}

function testWeaponShooterFormationTypeThreeRotatesWithOwnerDirection() {
  const runtimeData = createRuntimeFixture();
  const state = createStateWithEnemy(runtimeData, 4500, { x: -600, y: 0, hp: 100 });
  const spawnedShooterState = updateNfoSimulation(
    state,
    runtimeData,
    { moveX: 0, moveY: 1 },
    0,
  );
  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    runtimeData,
    NO_INPUT,
    1 / 30,
  );
  const bullet = firedShooterState.bullets[0];

  assertClose(spawnedShooterState.player.facingAngle, Math.PI / 2, "player facing angle");
  assertClose(
    spawnedShooterState.activeShooters[0]?.ownerFacingAngle ?? Number.NaN,
    Math.PI / 2,
    "shooter owner facing angle",
  );
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, 4500);
  assert.equal(firedShooterState.bullets.length, 1);
  assert.equal(bullet?.bulletTypeId, 27);
  assertClose(bullet?.x ?? Number.NaN, state.player.x, "formation type 3 x");
  assert.ok((bullet?.y ?? 0) > state.player.y + 100);
  assertClose(bullet?.vx ?? Number.NaN, 0, "formation type 3 vx");
  assert.ok((bullet?.vy ?? 0) > 0);
}

function testBulletShooterEventRotationOverridesBulletData() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 4600);
  const runtimeBullet = runtimeData.bullets.find((candidate) => candidate.id === 28);
  const state = createStateWithEnemy(runtimeData, 100, { x: 600, y: 0, hp: 100 });
  const nextState = updateNfoSimulation(
    chargeActiveSkill({
      ...state,
      player: {
        ...state.player,
        fireCooldownSeconds: 999,
      },
    }),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const bullet = nextState.bullets[0];

  assert.equal(runtimeBullet?.rotateType, 1);
  assert.equal(nextState.bullets.length, 1);
  assert.equal(bullet?.bulletTypeId, 28);
  assert.equal(bullet?.rotateType, 2);
}

function testBulletShooterOnDestroyEventBullet() {
  const runtimeData = createRuntimeFixture();
  setActiveSkillToShooterOnly(runtimeData, 5000);
  const state = createNfoSimulation(runtimeData);
  const firedState = updateNfoSimulation(
    chargeActiveSkill(state),
    runtimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const parentBullet = firedState.bullets.find((candidate) => candidate.bulletTypeId === 32);

  assert.ok(parentBullet);
  assert.equal(parentBullet.dealsDamage, false);
  assert.equal(parentBullet.onDestroyFireBullets.length, 1);
  assert.equal(parentBullet.onDestroyFireBullets[0]?.bulletTypeId, 33);
  assert.equal(firedState.bullets.some((candidate) => candidate.bulletTypeId === 33), false);

  const followUpState = updateNfoSimulation(
    {
      ...firedState,
      activeShooters: [],
    },
    runtimeData,
    NO_INPUT,
    1 / 30,
  );
  const childBullet = followUpState.bullets.find((candidate) => candidate.bulletTypeId === 33);

  assert.equal(followUpState.bullets.some((candidate) => candidate.bulletTypeId === 32), false);
  assert.ok(childBullet);
  assert.equal(childBullet.dealsDamage, true);
  assert.equal(childBullet.damageJudgeType, 1);
  assert.equal(childBullet.remainingHits, 9999);
  assertClose(childBullet.x, parentBullet.x, "on-destroy child bullet x");
  assertClose(childBullet.y, parentBullet.y, "on-destroy child bullet y");
}

function testOnDestroyEventBulletsInheritParentSourceModifiers() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData);
  const parentBullet = createSimBulletFixture({
    bulletTypeId: 9901,
    attackerAttack: 50,
    bulletCountModifier: 2,
    bulletLifeTimeModifier: 15,
    bulletSizeModifier: 10,
    bulletSpeedModifier: 25,
    criticalDamage: 250,
    criticalRate: 100,
    onDestroyFireBullets: [
      createFireBulletFixture({
        bulletTypeId: 9902,
        bulletAttack: 3,
        bulletCount: 1,
        bulletLifeTime: 30,
        bulletSize: 20,
        bulletSpeed: 100,
        bulletHitTimes: 5,
      }),
    ],
    remainingSeconds: 0,
  });
  const state: NfoSimulationState = {
    ...baseState,
    nextEntityId: 990100,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
    activeShooters: [],
    bullets: [parentBullet],
    enemies: [],
    minions: [],
  };

  const followUpState = updateNfoSimulation(state, runtimeData, NO_INPUT, 0);
  const childBullets = followUpState.bullets.filter((candidate) => (
    candidate.bulletTypeId === 9902
  ));

  assert.equal(followUpState.bullets.some((candidate) => candidate.bulletTypeId === 9901), false);
  assert.equal(childBullets.length, 3);
  for (const childBullet of childBullets) {
    assert.equal(childBullet.attackerAttack, 50);
    assert.equal(childBullet.isCritical, true);
    assert.equal(childBullet.damage, 132);
    assert.equal(childBullet.colliderWidth, 30);
    assertClose(Math.hypot(childBullet.vx, childBullet.vy), 125, "on-destroy child speed");
    assertClose(childBullet.remainingSeconds, 1.5, "on-destroy child lifetime");
    assert.equal(childBullet.remainingHits, 5);
  }
}

function testShieldBuffAbsorbsContactDamage() {
  const runtimeData = createRuntimeFixture();
  const armedState = updateNfoSimulation(
    createNfoSimulation(runtimeData, { weaponId: 1900 }),
    runtimeData,
    NO_INPUT,
    0,
  );
  const contactState = addContactEnemyToState(armedState, {
    attack: 7,
    hp: 100,
  });

  const absorbedState = updateNfoSimulation(contactState, runtimeData, NO_INPUT, 0);
  assert.equal(absorbedState.player.hp, armedState.player.hp);
  assert.equal(absorbedState.player.activeBuffs[0]?.id, 8);
  assert.equal(absorbedState.player.activeBuffs[0]?.value, 3);
  assertCooldown(absorbedState.player.damageCooldownSeconds, 0.8);

  const oneChargeState = {
    ...contactState,
    player: {
      ...contactState.player,
      activeBuffs: contactState.player.activeBuffs.map((buff) => ({
        ...buff,
        value: buff.id === 8 ? 1 : buff.value,
      })),
      damageCooldownSeconds: 0,
    },
  };
  const consumedState = updateNfoSimulation(oneChargeState, runtimeData, NO_INPUT, 0);
  assert.equal(consumedState.player.hp, armedState.player.hp);
  assert.equal(consumedState.player.activeBuffs.some((buff) => buff.id === 8), false);
}

function testCounterBuffFiresBuffBulletsOnContact() {
  const runtimeData = createRuntimeFixture();
  const armedState = updateNfoSimulation(
    createNfoSimulation(runtimeData, { weaponId: 2000 }),
    runtimeData,
    NO_INPUT,
    0,
  );
  const contactState = addContactEnemyToState(armedState, {
    attack: 7,
    hp: 100,
    radius: 5,
  });

  const counterState = updateNfoSimulation(contactState, runtimeData, NO_INPUT, 0);
  assert.equal(counterState.player.hp, armedState.player.hp);
  assert.equal(counterState.player.activeBuffs.some((buff) => buff.id === 9), false);
  assert.equal(counterState.bullets[0]?.bulletTypeId, 20);
  assert.equal(counterState.enemies[0]?.hp, 88);
  assertCooldown(counterState.player.damageCooldownSeconds, 0.8);
}

function testMinionWeaponCreatesAndFiresFromMinionPosition() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData, { weaponId: 2100 });

  const spawnState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 0);
  const minion = spawnState.minions[0];
  assert.ok(minion);
  assert.equal(minion.minionId, 50);
  assert.equal(minion.weaponId, 2100);
  assert.equal(minion.canFireOwnWeapon, false);
  assert.equal(spawnState.bullets.length, 0);
  assertCooldown(spawnState.player.fireCooldownSeconds, 1);

  const fireReadyState = {
    ...spawnState,
    player: {
      ...spawnState.player,
      fireCooldownSeconds: 0,
    },
    enemies: [
      {
        id: 1,
        typeId: 300,
        name: "Fixture Enemy",
        x: minion.x,
        y: minion.y,
        hp: 100,
        maxHp: 100,
        attack: 0,
        defense: 0,
        speed: 0,
        radius: 5,
        isBoss: false,
        canFly: false,
        canWalkThroughWall: false,
        dropId: 0,
        activeBuffs: [],
      },
    ],
  };

  const fireState = updateNfoSimulation(fireReadyState, runtimeData, NO_INPUT, 0);
  assert.equal(fireState.minions.length, 1);
  assert.equal(fireState.minions[0]?.id, minion.id);
  assert.equal(fireState.bullets[0]?.bulletTypeId, 21);
  assertClose(fireState.bullets[0]?.x ?? Number.NaN, minion.x, "minion bullet x");
  assertClose(fireState.bullets[0]?.y ?? Number.NaN, minion.y, "minion bullet y");
  assert.equal(fireState.enemies[0]?.hp, 89);
}

function testMinionWeaponHonorsWeaponLevelMinionCount() {
  const runtimeData = createRuntimeFixture();
  const weapon = runtimeData.weapons.find((candidate) => candidate.id === 2100);
  const weaponLevel = weapon?.levels[0];
  assert.ok(weaponLevel);
  weaponLevel.minionCount = 2;

  const baseState = createNfoSimulation(runtimeData, { weaponId: 2100 });
  const spawnState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 0);

  assert.equal(spawnState.minions.length, 2);
  assert.ok(spawnState.minions.every((minion) => minion.minionId === 50));
  assert.ok(spawnState.minions.every((minion) => minion.weaponId === 2100));
  assert.equal(spawnState.bullets.length, 0);

  const fireReadyState = {
    ...spawnState,
    player: {
      ...spawnState.player,
      fireCooldownSeconds: 0,
    },
    enemies: [
      {
        id: 900,
        typeId: 300,
        name: "Fixture Multi Minion Target",
        x: 600,
        y: 0,
        hp: 100,
        maxHp: 100,
        attack: 0,
        defense: 0,
        speed: 0,
        radius: 5,
        isBoss: false,
        canFly: false,
        canWalkThroughWall: false,
        dropId: 0,
        activeBuffs: [],
      },
    ],
  };

  const fireState = updateNfoSimulation(fireReadyState, runtimeData, NO_INPUT, 0);
  const bullets = fireState.bullets.filter((bullet) => bullet.bulletTypeId === 21);

  assert.equal(fireState.minions.length, 2);
  assert.equal(bullets.length, 2);
  assertClose(bullets[0]?.x ?? Number.NaN, fireState.minions[0]?.x ?? Number.NaN, "minion 0 bullet x");
  assertClose(bullets[0]?.y ?? Number.NaN, fireState.minions[0]?.y ?? Number.NaN, "minion 0 bullet y");
  assertClose(bullets[1]?.x ?? Number.NaN, fireState.minions[1]?.x ?? Number.NaN, "minion 1 bullet x");
  assertClose(bullets[1]?.y ?? Number.NaN, fireState.minions[1]?.y ?? Number.NaN, "minion 1 bullet y");
}

function testWeaponLevelSpawnMinionDataControlsMinionAIAndShooterActions() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData, { weaponId: 2400 });
  const spawnState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 0);
  const minion = spawnState.minions[0];

  assert.ok(minion);
  assert.equal(spawnState.minions.length, 1);
  assert.equal(minion.minionId, 52);
  assert.equal(minion.weaponId, 2400);
  assert.equal(minion.weaponLevel, 1);
  assert.equal(minion.aiTypeId, 905);
  assert.equal(minion.canFireOwnWeapon, false);
  assertClose(minion.x, baseState.player.x + 15, "spawn data minion x");
  assertClose(minion.y, baseState.player.y - 5, "spawn data minion y");
  assert.equal(spawnState.activeShooters.length, 0);

  const shooterState = updateNfoSimulation(spawnState, runtimeData, NO_INPUT, 0);
  const shooter = shooterState.activeShooters[0];
  assert.ok(shooter);
  assert.equal(shooter.shooterId, 4500);
  assert.equal(shooter.sourceTeam, "player");
  assertClose(shooter.x, minion.x, "minion AI shooter x");
  assertClose(shooter.y, minion.y, "minion AI shooter y");

  const firedState = updateNfoSimulation(shooterState, runtimeData, NO_INPUT, 1 / 30);
  const bullet = firedState.bullets.find((candidate) => candidate.bulletTypeId === 27);
  assert.ok(bullet, "expected minion AI shooter to emit a player-team bullet");
  assert.equal(bullet.canDamagePlayer, false);
  assert.ok(bullet.vx > 0);
}

function testMinionAIIdleStateDoesNotFollowWhileCreatingShooter() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData, { weaponId: 2400 });
  const spawnState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 0);
  const minion = spawnState.minions[0];
  assert.ok(minion);
  assert.equal(minion.aiTypeId, 905);
  assert.ok(minion.speed > 0);

  const armedState = {
    ...spawnState,
    player: {
      ...spawnState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [
      {
        id: 1,
        typeId: 300,
        name: "Fixture Idle Minion Target",
        x: minion.x + 300,
        y: minion.y,
        hp: 100,
        maxHp: 100,
        attack: 0,
        defense: 0,
        speed: 0,
        radius: 5,
        isBoss: false,
        canFly: false,
        canWalkThroughWall: false,
        dropId: 0,
        activeBuffs: [],
      },
    ],
  };
  const nextState = updateNfoSimulation(armedState, runtimeData, NO_INPUT, 0.2);

  assert.equal(nextState.minions[0]?.x, minion.x);
  assert.equal(nextState.minions[0]?.y, minion.y);
  assert.equal(nextState.activeShooters[0]?.shooterId, 4500);
  assert.equal(nextState.activeShooters[0]?.sourceTeam, "player");
}

function testMinionAIFireAllWeaponNowGatesOwnWeapon() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData, { weaponId: 2300 });
  const spawnState = updateNfoSimulation(baseState, runtimeData, NO_INPUT, 0);
  const minion = spawnState.minions[0];
  assert.ok(minion);
  assert.equal(minion.minionId, 51);
  assert.equal(minion.aiTypeId, 904);
  assert.equal(minion.canFireOwnWeapon, true);
  assert.equal(spawnState.bullets.length, 0);

  const armedState = {
    ...spawnState,
    player: {
      ...spawnState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [
      {
        id: 1,
        typeId: 300,
        name: "Fixture FireAll Target",
        x: minion.x + 100,
        y: minion.y,
        hp: 100,
        maxHp: 100,
        attack: 0,
        defense: 0,
        speed: 0,
        radius: 5,
        isBoss: false,
        canFly: false,
        canWalkThroughWall: false,
        dropId: 0,
        activeBuffs: [],
      },
    ],
  };

  const waitingState = updateNfoSimulation(armedState, runtimeData, NO_INPUT, 9 / 30);
  assert.equal(waitingState.bullets.some((bullet) => bullet.bulletTypeId === 21), false);
  assert.equal(waitingState.minions[0]?.aiStateId, 1);

  const firedState = updateNfoSimulation(waitingState, runtimeData, NO_INPUT, 2 / 30);
  const bullet = firedState.bullets.find((candidate) => candidate.bulletTypeId === 21);
  assert.ok(bullet, "expected FireAllWeaponNow to trigger the minion weapon bullet");
  assert.equal(firedState.minions[0]?.aiStateId, 1);
  assert.equal(firedState.minions[0]?.fireCooldownSeconds, 0);
  assert.equal(firedState.enemies[0]?.hp, 89);
}

function testWeaponFireGroupCooldown() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 300);

  const firstState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(firstState.bullets.length, 1);
  assert.equal(firstState.player.pendingFireGroups, 2);
  assertCooldown(firstState.player.fireCooldownSeconds, 0.1);

  const secondState = updateNfoSimulation(firstState, runtimeData, NO_INPUT, 0.1);
  assert.equal(secondState.bullets.length, 2);
  assert.equal(secondState.player.pendingFireGroups, 1);
  assertCooldown(secondState.player.fireCooldownSeconds, 0.1);

  const thirdState = updateNfoSimulation(secondState, runtimeData, NO_INPUT, 0.1);
  assert.equal(thirdState.bullets.length, 3);
  assert.equal(thirdState.player.pendingFireGroups, 0);
  assertCooldown(thirdState.player.fireCooldownSeconds, 1);
}

function testBulletDamageJudgeDelayAndCooldown() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 400, {
    x: 0,
    y: 0,
    hp: 100,
    radius: 8,
  });

  const delayedState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(delayedState.enemies[0]?.hp, 100);
  assert.equal(delayedState.bullets[0]?.remainingHits, 3);

  const firstHitState = updateNfoSimulation(delayedState, runtimeData, NO_INPUT, 0.1);
  assert.equal(firstHitState.enemies[0]?.hp, 95);
  assert.equal(firstHitState.bullets[0]?.remainingHits, 2);

  const cooldownState = updateNfoSimulation(firstHitState, runtimeData, NO_INPUT, 0.1);
  assert.equal(cooldownState.enemies[0]?.hp, 95);
  assert.equal(cooldownState.bullets[0]?.remainingHits, 2);

  const secondHitState = updateNfoSimulation(cooldownState, runtimeData, NO_INPUT, 0.4);
  assert.equal(secondHitState.enemies[0]?.hp, 90);
  assert.equal(secondHitState.bullets[0]?.remainingHits, 1);
}

function testOncePerEnemyBulletDamage() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 500, {
    x: 0,
    y: 0,
    hp: 100,
    radius: 8,
  });

  const firstHitState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(firstHitState.enemies[0]?.hp, 95);
  assert.equal(firstHitState.bullets[0]?.remainingHits, 2);

  const repeatedOverlapState = updateNfoSimulation(firstHitState, runtimeData, NO_INPUT, 0.2);
  assert.equal(repeatedOverlapState.enemies[0]?.hp, 95);
  assert.equal(repeatedOverlapState.bullets[0]?.remainingHits, 2);
}

function testRectBulletCollider() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 600, {
    x: 40,
    y: 20,
    hp: 100,
    radius: 5,
  });

  const nextState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(nextState.enemies[0]?.hp, 93);
}

function testRayBulletCollider() {
  const runtimeData = createRuntimeFixture();
  const stateInsideRay = createStateWithEnemy(runtimeData, 1200, {
    x: 98,
    y: 8,
    hp: 100,
    radius: 5,
  });

  const hitState = updateNfoSimulation(stateInsideRay, runtimeData, NO_INPUT, 0.1);
  assert.equal(hitState.enemies[0]?.hp, 93);

  const statePastRayEnd = createStateWithEnemy(runtimeData, 1200, {
    x: 111,
    y: 0,
    hp: 100,
    radius: 5,
  });

  const missedState = updateNfoSimulation(statePastRayEnd, runtimeData, NO_INPUT, 0.1);
  assert.equal(missedState.enemies[0]?.hp, 100);
}

function testBulletBoundaryExpiry() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 700, {
    x: 600,
    y: 0,
    hp: 100,
    radius: 8,
  });

  const nextState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(nextState.bullets.length, 0);
}

function testBulletOutwardForce() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 800, {
    x: 40,
    y: 0,
    hp: 100,
    radius: 5,
  });

  const nextState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(nextState.enemies[0]?.hp, 100);
  assert.ok(
    (nextState.enemies[0]?.x ?? 0) > 49,
    `expected outward force to push x beyond 49, got ${nextState.enemies[0]?.x}`,
  );
}

function testBulletInwardForce() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 900, {
    x: 40,
    y: 0,
    hp: 100,
    radius: 5,
  });

  const nextState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(nextState.enemies[0]?.hp, 100);
  assert.ok(
    (nextState.enemies[0]?.x ?? 0) < 31,
    `expected inward force to pull x below 31, got ${nextState.enemies[0]?.x}`,
  );
}

function testHitBuffSpeedAttribute() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 1000, {
    x: 40,
    y: 0,
    hp: 100,
    speed: 500,
    radius: 5,
  });

  const hitState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(hitState.enemies[0]?.hp, 99);
  assert.equal(hitState.enemies[0]?.activeBuffs[0]?.id, 1);
  const xAfterHit = hitState.enemies[0]?.x ?? 0;

  const slowedState = updateNfoSimulation(hitState, runtimeData, NO_INPUT, 0.2);
  assert.equal(slowedState.enemies[0]?.x, xAfterHit);
  assert.equal(slowedState.enemies[0]?.activeBuffs[0]?.id, 1);

  const expiredState = updateNfoSimulation(slowedState, runtimeData, NO_INPUT, 1);
  assert.equal(expiredState.enemies[0]?.activeBuffs.length, 0);
  assert.ok(
    (expiredState.enemies[0]?.x ?? 0) > xAfterHit,
    `expected enemy to move again after speed buff expiration, got ${expiredState.enemies[0]?.x}`,
  );
}

function testHitBuffDotDamage() {
  const runtimeData = createRuntimeFixture();
  const stateWithEnemy = createStateWithEnemy(runtimeData, 1100, {
    x: 0,
    y: 0,
    hp: 100,
    speed: 0,
    radius: 5,
  });

  const hitState = updateNfoSimulation(stateWithEnemy, runtimeData, NO_INPUT, 0.1);
  assert.equal(hitState.enemies[0]?.hp, 99);
  assert.equal(hitState.enemies[0]?.activeBuffs[0]?.id, 4);

  const dotState = updateNfoSimulation(hitState, runtimeData, NO_INPUT, 1);
  assert.equal(dotState.enemies[0]?.hp, 97);
}

function testTauntHitBuffRedirectsEnemyMovement() {
  const runtimeData = createRuntimeFixture();
  const baseState = createNfoSimulation(runtimeData);
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [
      {
        id: 1,
        typeId: 300,
        name: "Fixture Taunt Target",
        x: 220,
        y: 0,
        hp: 100,
        maxHp: 100,
        attack: 0,
        defense: 0,
        speed: 100,
        radius: 5,
        isBoss: false,
        canFly: false,
        canWalkThroughWall: false,
        dropId: 0,
        activeBuffs: [],
      },
    ],
    bullets: [
      createSimBulletFixture({
        x: 300,
        y: 0,
        radius: 120,
        colliderWidth: 240,
        colliderLength: 240,
        dealsDamage: false,
        hitBuffId: 120,
        hitBuffLevel: 1,
      }),
    ],
  };

  const tauntedState = updateNfoSimulation(state, runtimeData, NO_INPUT, 0);
  const tauntedEnemy = tauntedState.enemies[0];
  const tauntBuff = tauntedEnemy?.activeBuffs.find((buff) => buff.id === 120);
  assert.ok(tauntedEnemy);
  assert.ok(tauntBuff);
  assert.equal(tauntBuff.type, 13);
  assertClose(tauntBuff.sourceX ?? Number.NaN, 300, "taunt source x");
  assertClose(tauntBuff.sourceY ?? Number.NaN, 0, "taunt source y");

  const movedState = updateNfoSimulation(
    {
      ...tauntedState,
      player: {
        ...tauntedState.player,
        fireCooldownSeconds: 999,
      },
      bullets: [],
    },
    runtimeData,
    NO_INPUT,
    0.1,
  );
  assert.ok(
    (movedState.enemies[0]?.x ?? 0) > tauntedEnemy.x,
    `expected taunted enemy to move toward bullet source, got ${movedState.enemies[0]?.x}`,
  );
}

type EnemyFixtureOverrides = Partial<{
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  spawnEventId: number;
  aiTypeId: number;
  aiStateId: number;
  aiStateElapsedFrames: number;
  aiFireCooldownSeconds: number;
  attack: number;
  defense: number;
  speed: number;
  radius: number;
}>;

type StateFixtureOptions = Partial<{
  equipIds: number[];
}>;

function createStateWithEnemy(
  runtimeData: NfoOfflineRuntimeData,
  weaponId: number,
  enemyOverrides: EnemyFixtureOverrides = {},
  options: StateFixtureOptions = {},
) {
  const baseState = createNfoSimulation(runtimeData, {
    weaponId,
    equipIds: options.equipIds ?? [],
  });
  const hp = enemyOverrides.hp ?? 999;
  return {
    ...baseState,
    nextEntityId: 100,
    enemies: [
      {
        id: 1,
        typeId: 300,
        spawnEventId: enemyOverrides.spawnEventId ?? 0,
        aiTypeId: enemyOverrides.aiTypeId,
        aiStateId: enemyOverrides.aiStateId,
        aiStateElapsedFrames: enemyOverrides.aiStateElapsedFrames,
        aiFireCooldownSeconds: enemyOverrides.aiFireCooldownSeconds,
        name: "Fixture Enemy",
        x: enemyOverrides.x ?? 600,
        y: enemyOverrides.y ?? 0,
        hp,
        maxHp: enemyOverrides.maxHp ?? hp,
        attack: enemyOverrides.attack ?? 0,
        defense: enemyOverrides.defense ?? 0,
        speed: enemyOverrides.speed ?? 0,
        radius: enemyOverrides.radius ?? 20,
        isBoss: false,
        canFly: false,
        canWalkThroughWall: false,
        dropId: 0,
        activeBuffs: [],
      },
    ],
  };
}

function chargeActiveSkill(state: ReturnType<typeof createNfoSimulation>) {
  return {
    ...state,
    activeSkill: {
      ...state.activeSkill,
      chargeFrames: state.activeSkill.chargeMaxFrames,
    },
  };
}

function setActiveSkillToShooterOnly(
  runtimeData: NfoOfflineRuntimeData,
  bulletShooterId: number,
) {
  const activeSkillLevel = runtimeData.activeSkills[0]?.levels[0];
  assert.ok(activeSkillLevel);
  activeSkillLevel.events = [
    {
      name: "Fixture Shooter Event",
      frame: 1,
      bulletShooterId,
      fullScreenEffectName: "",
      buffs: [],
      spawnMinion: null,
    },
  ];
}

function setActiveSkillToBuffsOnly(
  runtimeData: NfoOfflineRuntimeData,
  buffs: Array<{ buffId: number; level: number; targetType?: number }>,
) {
  const activeSkillLevel = runtimeData.activeSkills[0]?.levels[0];
  assert.ok(activeSkillLevel);
  activeSkillLevel.events = [
    {
      name: "Fixture Buff Event",
      frame: 1,
      bulletShooterId: 0,
      fullScreenEffectName: "",
      buffs: buffs.map((buff) => ({
        targetType: buff.targetType ?? 1,
        buffId: buff.buffId,
        level: buff.level,
      })),
      spawnMinion: null,
    },
  ];
}

function addPlayerAttributeBuffFixture(runtimeData: NfoOfflineRuntimeData) {
  runtimeData.buffs.push(
    createBuffFixture({
      id: 121,
      name: "Fixture Active Attribute Buff",
      type: 1,
      duplicateType: 2,
      levels: [
        {
          level: 1,
          durationFrames: 60,
          value: 1,
          maxStackCount: 1,
          fireBullets: [],
          attributes: [
            {
              attributeType: 5,
              value: 100,
            },
            {
              attributeType: 6,
              value: 50,
            },
            {
              attributeType: 7,
              value: 10,
            },
            {
              attributeType: 8,
              value: 15,
            },
            {
              attributeType: 9,
              value: 2,
            },
            {
              attributeType: 10,
              value: 50,
            },
            {
              attributeType: 11,
              value: 50,
            },
            {
              attributeType: 12,
              value: 100,
            },
            {
              attributeType: 13,
              value: 50,
            },
            {
              attributeType: 15,
              value: 100,
            },
          ],
        },
      ],
    }),
  );
}

function setActiveSkillToSpawnMinionOnly(
  runtimeData: NfoOfflineRuntimeData,
  spawnOverrides: Partial<NonNullable<NfoActiveSkillData["levels"][number]["events"][number]["spawnMinion"]>>,
) {
  const activeSkillLevel = runtimeData.activeSkills[0]?.levels[0];
  const baseSpawnMinion = activeSkillLevel?.events[0]?.spawnMinion;
  assert.ok(activeSkillLevel);
  assert.ok(baseSpawnMinion);
  activeSkillLevel.events = [
    {
      name: "Fixture Spawn Minion Event",
      frame: 1,
      bulletShooterId: 0,
      fullScreenEffectName: "",
      buffs: [],
      spawnMinion: {
        ...baseSpawnMinion,
        ...spawnOverrides,
      },
    },
  ];
}

function addContactEnemyToState(
  state: ReturnType<typeof createNfoSimulation>,
  enemyOverrides: EnemyFixtureOverrides = {},
) {
  const hp = enemyOverrides.hp ?? 999;
  return {
    ...state,
    nextEntityId: 100,
    enemies: [
      {
        id: 1,
        typeId: 300,
        name: "Fixture Contact Enemy",
        x: enemyOverrides.x ?? state.player.x,
        y: enemyOverrides.y ?? state.player.y,
        hp,
        maxHp: enemyOverrides.maxHp ?? hp,
        attack: enemyOverrides.attack ?? 0,
        defense: enemyOverrides.defense ?? 0,
        speed: enemyOverrides.speed ?? 0,
        radius: enemyOverrides.radius ?? 20,
        isBoss: false,
        canFly: false,
        canWalkThroughWall: false,
        dropId: 0,
        activeBuffs: [],
      },
    ],
  };
}

function addAIEnemyToState(
  state: ReturnType<typeof createNfoSimulation>,
  enemyOverrides: EnemyFixtureOverrides & { aiTypeId: number } = { aiTypeId: 0 },
) {
  const hp = enemyOverrides.hp ?? 999;
  return {
    ...state,
    nextEntityId: 100,
    enemies: [
      {
        id: 1,
        typeId: 301,
        aiTypeId: enemyOverrides.aiTypeId,
        aiFireCooldownSeconds: 0,
        name: "Fixture AI Enemy",
        x: enemyOverrides.x ?? state.player.x,
        y: enemyOverrides.y ?? state.player.y,
        hp,
        maxHp: enemyOverrides.maxHp ?? hp,
        attack: enemyOverrides.attack ?? 0,
        defense: enemyOverrides.defense ?? 0,
        speed: enemyOverrides.speed ?? 0,
        radius: enemyOverrides.radius ?? 5,
        isBoss: false,
        canFly: false,
        canWalkThroughWall: false,
        dropId: 0,
        activeBuffs: [],
      },
    ],
  };
}

function createStateWithPickup(
  runtimeData: NfoOfflineRuntimeData,
  equipIds: number[],
  pickupOverrides: Partial<{
    x: number;
    y: number;
    value: number;
    itemType: number;
    canBeMagneted: boolean;
  }> = {},
) {
  const baseState = createNfoSimulation(runtimeData, { equipIds });
  return {
    ...baseState,
    pickups: [
      {
        id: 9000,
        itemId: 900,
        name: "Fixture EXP",
        itemType: pickupOverrides.itemType ?? 0,
        value: pickupOverrides.value ?? 10,
        canBeMagneted: pickupOverrides.canBeMagneted ?? true,
        radius: 5,
        remainingSeconds: 10,
        x: pickupOverrides.x ?? 0,
        y: pickupOverrides.y ?? 0,
      },
    ],
  };
}

function assertCooldown(actual: number, expected: number) {
  assertClose(actual, expected, "cooldown");
}

function assertClose(actual: number, expected: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    `expected ${label} ${actual} to be close to ${expected}`,
  );
}

function createSimBulletFixture(
  overrides: Partial<NfoSimBullet> = {},
): NfoSimBullet {
  return {
    id: 900001,
    bulletTypeId: 99,
    dealsDamage: true,
    rotateType: 0,
    motionType: "linear",
    angle: 0,
    facingAngle: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    damage: 1,
    attackerAttack: 1,
    isCritical: false,
    canDamagePlayer: false,
    hitTargetType: 0,
    radius: 10,
    colliderType: 0,
    colliderWidth: 20,
    colliderLength: 20,
    colliderForwardOffset: 0,
    damageJudgeType: 0,
    damageJudgeDelaySeconds: 0,
    damageJudgeCooldownSeconds: 0.5,
    forceType: 0,
    force: 0,
    hitBuffId: 0,
    hitBuffLevel: 0,
    onDestroyFireBullets: [],
    remainingSeconds: 1,
    remainingHits: 1,
    hasHitPlayer: false,
    playerHitCooldownSeconds: 0,
    hitEnemyIds: [],
    hitCooldownSecondsByEnemyId: {},
    ...overrides,
  };
}

function createSimMinionFixture(
  overrides: Partial<NfoSimMinion> = {},
): NfoSimMinion {
  return {
    id: 900101,
    minionId: 50,
    aiTypeId: 0,
    weaponId: 0,
    weaponLevel: 1,
    name: "Fixture Allied Minion",
    speed: 300,
    radius: 28,
    x: 100,
    y: 0,
    remainingSeconds: 10,
    aiFireCooldownSeconds: 0,
    fireCooldownSeconds: 0,
    pendingFireGroups: 0,
    canFireOwnWeapon: false,
    activeBuffs: [],
    ...overrides,
  };
}

function createFireBulletFixture(
  overrides: Partial<NfoFireBullet> = {},
): NfoFireBullet {
  return {
    bulletTypeId: 1,
    eventBulletId: 0,
    onDestroyFireEventBulletId: 0,
    bulletCount: 1,
    bulletAttack: 1,
    bulletSpeed: 500,
    noDamage: false,
    bulletDamageJudgeType: 0,
    bulletHitTargetType: 0,
    bulletSize: 20,
    bulletSize2: 0,
    bulletLifeTime: 90,
    bulletHitTimes: 1,
    bulletDamageJudgeDelayFrames: 0,
    bulletDamageJudgeCooldownFrames: 0,
    bulletColliderType: 0,
    bulletForceType: 0,
    bulletForce: 0,
    hitBuffId: 0,
    hitBuffLevel: 0,
    ...overrides,
  };
}

function createBulletShooterEventFixture(
  overrides: Partial<NfoBulletShooterData["events"][number]> = {},
): NfoBulletShooterData["events"][number] {
  return {
    name: "Fixture Shooter Event",
    frame: 1,
    isLoopEvent: false,
    loopFrameInterval: 0,
    bulletFormationType: 0,
    bulletFormationParam1: 0,
    bulletFormationOffsetX: 0,
    bulletFormationOffsetY: 0,
    bulletFireDirectionType: 1,
    bulletRotationType: 0,
    bulletFireDirectionOffsetAngle: 0,
    fireBullets: [
      createFireBulletFixture({
        bulletTypeId: 23,
        bulletAttack: 1,
        bulletSpeed: 300,
        bulletSize: 20,
        bulletLifeTime: 90,
      }),
    ],
    eventFireBullets: [],
    ...overrides,
  };
}

function createBulletShooterFixture(
  overrides: Partial<NfoBulletShooterData> = {},
): NfoBulletShooterData {
  return {
    id: 4000,
    name: "Fixture Active Shooter",
    lifeTimeFrames: 30,
    spawnPos: 0,
    spawnPosOffsetX: 0,
    spawnPosOffsetY: 0,
    behaviorType: 0,
    followsOwnerDirection: false,
    events: [createBulletShooterEventFixture()],
    ...overrides,
  };
}

function createBuffFixture(
  overrides: Partial<NfoBuffData> = {},
): NfoBuffData {
  return {
    id: 1,
    name: "Fixture Buff",
    effectPrefabName: "",
    effectEntitySubAnime: "",
    type: 1,
    attrType: 0,
    duplicateType: 2,
    maxLevel: 1,
    levels: [
      {
        level: 1,
        durationFrames: 30,
        value: 1,
        maxStackCount: 1,
        fireBullets: [],
        attributes: [],
      },
    ],
    ...overrides,
  };
}

function createRuntimeFixture(): NfoOfflineRuntimeData {
  const activeSkillFixture: NfoActiveSkillData = {
    id: 3000,
    name: "Fixture Active Skill",
    icon: "",
    description: "",
    levels: [
      {
        level: 1,
        chargeCountMax: 1,
        timelineFrames: 30,
        events: [
          {
            name: "Fixture Buff Event",
            frame: 1,
            bulletShooterId: 0,
            fullScreenEffectName: "",
            buffs: [
              {
                targetType: 0,
                buffId: 7,
                level: 1,
              },
            ],
            spawnMinion: {
              minionId: 50,
              minionLevel: 1,
              minionAiTypeId: 202,
              weaponId: 2100,
              weaponLevel: 4,
              spawnCount: 2,
              spawnCenterType: 0,
              spawnCenterOffsetX: 10,
              spawnCenterOffsetY: 20,
              spawnFormation: 1,
              spawnRadiusMin: 70,
              spawnRadiusMax: 70,
            },
          },
        ],
      },
    ],
  };
  const bulletShooterFixture: NfoBulletShooterData = {
    id: 4000,
    name: "Fixture Active Shooter",
    lifeTimeFrames: 30,
    spawnPos: 0,
    spawnPosOffsetX: 0,
    spawnPosOffsetY: 0,
    behaviorType: 0,
    followsOwnerDirection: false,
    events: [
      {
        name: "Fixture Shooter Pulse",
        frame: 1,
        isLoopEvent: true,
        loopFrameInterval: 10,
        bulletFormationType: 0,
        bulletFormationParam1: 0,
        bulletFormationOffsetX: 0,
        bulletFormationOffsetY: 0,
        bulletFireDirectionType: 1,
        bulletRotationType: 0,
        bulletFireDirectionOffsetAngle: 0,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 23,
            bulletAttack: 12,
            bulletSpeed: 0,
            bulletDamageJudgeType: 1,
            bulletSize: 120,
            bulletLifeTime: 30,
            bulletHitTimes: 9999,
            bulletDamageJudgeCooldownFrames: 15,
          }),
        ],
        eventFireBullets: [],
      },
    ],
  };
  const directionZeroShooterFixture = createBulletShooterFixture({
    id: 4100,
    name: "Fixture Direction Zero Shooter",
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Offset Radial",
        bulletFormationOffsetX: 0,
        bulletFormationOffsetY: 100,
        bulletFireDirectionType: 0,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 24,
            bulletAttack: 1,
            bulletSpeed: 300,
            bulletSize: 20,
            bulletLifeTime: 90,
          }),
        ],
      }),
    ],
  });
  const directionOneShooterFixture = createBulletShooterFixture({
    id: 4200,
    name: "Fixture Direction One Shooter",
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Nearest Target",
        bulletFormationOffsetX: 0,
        bulletFormationOffsetY: 100,
        bulletFireDirectionType: 1,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 25,
            bulletAttack: 1,
            bulletSpeed: 300,
            bulletSize: 20,
            bulletLifeTime: 90,
          }),
        ],
      }),
    ],
  });
  const radialShooterFixture = createBulletShooterFixture({
    id: 4210,
    name: "Fixture Radial Direction One Shooter",
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Six-Way Ring",
        bulletFormationOffsetX: 0,
        bulletFormationOffsetY: 0,
        bulletFireDirectionType: 1,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 25,
            bulletCount: 6,
            bulletAttack: 1,
            bulletSpeed: 300,
            bulletSize: 20,
            bulletLifeTime: 90,
          }),
        ],
      }),
    ],
  });
  const directionThreeShooterFixture = createBulletShooterFixture({
    id: 4300,
    name: "Fixture Direction Three Shooter",
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Owner Direction",
        bulletFireDirectionType: 3,
        bulletFireDirectionOffsetAngle: 90,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 26,
            bulletAttack: 1,
            bulletSpeed: 300,
            bulletSize: 20,
            bulletLifeTime: 90,
          }),
        ],
      }),
    ],
  });
  const followOwnerShooterFixture = createBulletShooterFixture({
    id: 4350,
    name: "Fixture Follow Owner Shooter",
    lifeTimeFrames: 30,
    spawnPosOffsetX: 30,
    spawnPosOffsetY: 4,
    behaviorType: 1,
    followsOwnerDirection: true,
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Delayed Owner-Follow Shot",
        frame: 10,
        bulletFireDirectionType: 3,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 35,
            bulletAttack: 1,
            bulletSpeed: 0,
            bulletDamageJudgeType: 1,
            bulletSize: 20,
            bulletLifeTime: 90,
          }),
        ],
      }),
    ],
  });
  const directionFourShooterFixture = createBulletShooterFixture({
    id: 4500,
    name: "Fixture Direction Four Shooter",
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Forward Formation",
        bulletFormationType: 3,
        bulletFormationParam1: 50,
        bulletFormationOffsetX: 100,
        bulletFormationOffsetY: 0,
        bulletFireDirectionType: 4,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 27,
            bulletAttack: 1,
            bulletSpeed: 300,
            bulletSize: 20,
            bulletLifeTime: 90,
          }),
        ],
      }),
    ],
  });
  const rotationOverrideShooterFixture = createBulletShooterFixture({
    id: 4600,
    name: "Fixture Rotation Override Shooter",
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Rotation Override",
        bulletRotationType: 2,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 28,
            bulletAttack: 1,
            bulletSpeed: 300,
            bulletSize: 20,
            bulletLifeTime: 90,
          }),
        ],
      }),
    ],
  });
  const directionTwoShooterFixture = createBulletShooterFixture({
    id: 4700,
    name: "Fixture Direction Two Shooter",
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Player Target",
        bulletFormationOffsetX: 20,
        bulletFormationOffsetY: 0,
        bulletFireDirectionType: 2,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 29,
            bulletAttack: 1,
            bulletSpeed: 300,
            bulletSize: 20,
            bulletLifeTime: 90,
          }),
        ],
      }),
    ],
  });
  const hostileShooterFixture = createBulletShooterFixture({
    id: 4800,
    name: "Fixture Hostile AI Shooter",
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Hostile Shot",
        bulletFormationOffsetX: 0,
        bulletFormationOffsetY: 0,
        bulletFireDirectionType: 2,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 31,
            bulletAttack: 5,
            bulletSpeed: 300,
            bulletHitTargetType: 1,
            bulletSize: 30,
            bulletLifeTime: 90,
          }),
        ],
      }),
    ],
  });
  const hostilePlayerSpawnShooterFixture = createBulletShooterFixture({
    id: 4900,
    name: "Fixture Hostile Player Spawn Shooter",
    spawnPos: 1,
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Player Spawn Shot",
        bulletFormationOffsetX: 0,
        bulletFormationOffsetY: 0,
        bulletFireDirectionType: 2,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 31,
            bulletAttack: 5,
            bulletSpeed: 0,
            bulletHitTargetType: 1,
            bulletSize: 30,
            bulletLifeTime: 90,
            noDamage: true,
          }),
        ],
      }),
    ],
  });
  const onDestroyShooterFixture = createBulletShooterFixture({
    id: 5000,
    name: "Fixture On-Destroy Shooter",
    events: [
      createBulletShooterEventFixture({
        name: "Fixture On-Destroy Parent",
        bulletFireDirectionType: 3,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 32,
            onDestroyFireEventBulletId: 1,
            bulletAttack: 1,
            bulletSpeed: 0,
            noDamage: true,
            bulletSize: 20,
            bulletLifeTime: 2,
            bulletHitTimes: 9999,
          }),
        ],
        eventFireBullets: [
          createFireBulletFixture({
            bulletTypeId: 33,
            eventBulletId: 1,
            bulletAttack: 20,
            bulletSpeed: 0,
            bulletDamageJudgeType: 1,
            bulletSize: 80,
            bulletLifeTime: 30,
            bulletHitTimes: 9999,
          }),
        ],
      }),
    ],
  });
  const nearestEnemySpawnShooterFixture = createBulletShooterFixture({
    id: 5100,
    name: "Fixture Nearest Enemy Spawn Shooter",
    spawnPos: 3,
    events: [
      createBulletShooterEventFixture({
        name: "Fixture Spawn On Nearest Enemy",
        bulletFireDirectionType: 0,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 34,
            bulletAttack: 1,
            bulletSpeed: 0,
            bulletDamageJudgeType: 1,
            bulletSize: 120,
            bulletLifeTime: 30,
            bulletHitTimes: 9999,
          }),
        ],
      }),
    ],
  });
  const aiDirectFireFixture: NfoAIData = {
    id: 900,
    name: "Fixture Direct Fire AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Direct Fire",
        stateType: 1,
        lastFrame: 30,
        isFireBullet: true,
        bulletFireCooldownFrames: 30,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 30,
            bulletAttack: 4,
            bulletSpeed: 300,
            bulletHitTargetType: 0,
            bulletSize: 30,
            bulletLifeTime: 90,
          }),
        ],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  };
  const aiShooterFixture: NfoAIData = {
    id: 901,
    name: "Fixture Shooter AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Idle",
        stateType: 1,
        lastFrame: 30,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [
          {
            stateId: 2,
            probability: 100,
          },
        ],
        timelineEvents: [],
      },
      {
        id: 2,
        name: "Fixture Shooter",
        stateType: 0,
        lastFrame: 30,
        isFireBullet: false,
        bulletFireCooldownFrames: 30,
        fireBullets: [],
        bulletShooterId: 4800,
        nextStates: [
          {
            stateId: 1,
            probability: 100,
          },
        ],
        timelineEvents: [],
      },
    ],
  };
  const aiIdleFireFixture: NfoAIData = {
    id: 907,
    name: "Fixture Idle Fire AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Idle Fire",
        stateType: 0,
        lastFrame: 30,
        isFireBullet: true,
        bulletFireCooldownFrames: 30,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 30,
            bulletAttack: 4,
            bulletSpeed: 300,
            bulletHitTargetType: 0,
            bulletSize: 30,
            bulletLifeTime: 90,
          }),
        ],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  };
  const aiRandomMoveFixture: NfoAIData = {
    id: 908,
    name: "Fixture Random Move AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Random Move",
        stateType: 2,
        lastFrame: 30,
        isFireBullet: true,
        bulletFireCooldownFrames: 30,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 30,
            bulletAttack: 4,
            bulletSpeed: 0,
            bulletHitTargetType: 0,
            bulletSize: 30,
            bulletLifeTime: 90,
          }),
        ],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  };
  const aiPlayerSpawnShooterFixture: NfoAIData = {
    id: 906,
    name: "Fixture Player Spawn Shooter AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Player Spawn Shooter",
        stateType: 0,
        lastFrame: 30,
        isFireBullet: false,
        bulletFireCooldownFrames: 30,
        fireBullets: [],
        bulletShooterId: 4900,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  };
  const aiTeleportFixture: NfoAIData = {
    id: 909,
    name: "Fixture Teleport AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Teleport",
        stateType: 12,
        lastFrame: 60,
        isFireBullet: true,
        bulletFireCooldownFrames: 30,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 30,
            bulletAttack: 4,
            bulletSpeed: 0,
            bulletHitTargetType: 0,
            bulletSize: 30,
            bulletLifeTime: 90,
          }),
        ],
        bulletShooterId: 0,
        nextStates: [
          {
            stateId: 2,
            probability: 100,
          },
        ],
        timelineEvents: [
          {
            frame: 1,
            name: "",
            playAnimeName: "skill-miss",
            noColliding: true,
            fireBulletNow: false,
            fireAllWeaponNow: false,
          },
          {
            frame: 30,
            name: "teleport",
            playAnimeName: "",
            noColliding: true,
            fireBulletNow: false,
            fireAllWeaponNow: false,
          },
          {
            frame: 31,
            name: "",
            playAnimeName: "skill",
            noColliding: true,
            fireBulletNow: false,
            fireAllWeaponNow: false,
          },
          {
            frame: 46,
            name: "",
            playAnimeName: "skill2",
            noColliding: true,
            fireBulletNow: true,
            fireAllWeaponNow: false,
          },
          {
            frame: 60,
            name: "normal",
            playAnimeName: "Walk",
            noColliding: false,
            fireBulletNow: false,
            fireAllWeaponNow: false,
          },
        ],
      },
      {
        id: 2,
        name: "Fixture Post Teleport",
        stateType: 0,
        lastFrame: 0,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  };
  const aiTimelineFireFixture: NfoAIData = {
    id: 902,
    name: "Fixture Timeline Fire AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture Timeline Fire",
        stateType: 0,
        lastFrame: 60,
        isFireBullet: true,
        bulletFireCooldownFrames: 30,
        fireBullets: [
          createFireBulletFixture({
            bulletTypeId: 32,
            bulletAttack: 5,
            bulletSpeed: 300,
            bulletHitTargetType: 0,
            bulletSize: 30,
            bulletLifeTime: 90,
          }),
        ],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [
          {
            frame: 15,
            name: "Fixture Fire Now",
            playAnimeName: "",
            noColliding: false,
            fireBulletNow: true,
            fireAllWeaponNow: false,
          },
        ],
      },
    ],
  };
  const aiTimelineNoCollidingFixture: NfoAIData = {
    id: 903,
    name: "Fixture Timeline NoColliding AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture NoColliding",
        stateType: 0,
        lastFrame: 30,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [
          {
            stateId: 2,
            probability: 100,
          },
        ],
        timelineEvents: [
          {
            frame: 1,
            name: "Fixture Disable Collision",
            playAnimeName: "",
            noColliding: true,
            fireBulletNow: false,
            fireAllWeaponNow: false,
          },
        ],
      },
      {
        id: 2,
        name: "Fixture Normal",
        stateType: 0,
        lastFrame: 0,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  };
  const aiTimelineFireAllWeaponFixture: NfoAIData = {
    id: 904,
    name: "Fixture Timeline FireAllWeapon AI",
    firstStateId: 1,
    states: [
      {
        id: 1,
        name: "Fixture FireAllWeapon",
        stateType: 20,
        lastFrame: 60,
        isFireBullet: false,
        bulletFireCooldownFrames: 0,
        fireBullets: [],
        bulletShooterId: 0,
        nextStates: [],
        timelineEvents: [
          {
            frame: 10,
            name: "Fixture FireAllWeapon Now",
            playAnimeName: "",
            noColliding: false,
            fireBulletNow: false,
            fireAllWeaponNow: true,
          },
        ],
      },
    ],
  };
  const aiMinionShooterFixture: NfoAIData = {
    id: 905,
    name: "Fixture Minion Shooter AI",
    firstStateId: 0,
    states: [
      {
        id: 0,
        name: "Fixture Persistent Shooter",
        stateType: 0,
        lastFrame: 0,
        isFireBullet: false,
        bulletFireCooldownFrames: 30,
        fireBullets: [],
        bulletShooterId: 4500,
        nextStates: [],
        timelineEvents: [],
      },
    ],
  };

  return {
    region: "cn",
    resourceVersion: "test-cn-nfo",
    createdAt: "2026-06-14T00:00:00.000Z",
    source: {
      manifestPath: "fixture/Android-2.1.1",
      runtimeDataPath: "fixture/master-data.json",
    },
    counts: {},
    selected: {
      characterId: 10,
      levelId: 1,
    },
    characters: [
      {
        id: 10,
        name: "Fixture Ako",
        enabled: true,
        prefab: "",
        upgradedPrefab: "",
        thumbnail: "",
        upgradedThumbnail: "",
        initialWeaponId: 100,
        colliderRadius: 32,
        maxWeaponCount: 1,
        maxEquipCount: 2,
        canFly: false,
        canWalkThroughWall: false,
        activeSkillId: 3000,
        levels: [
          {
            level: 1,
            maxHp: 20,
            attack: 0,
            defense: 0,
            speed: 500,
            itemMagnetRange: 72,
            bulletSpeed: 0,
            bulletSize: 0,
            bulletLifeTime: 0,
            bulletCount: 0,
            coolDownReduce: 0,
            expGain: 0,
            criticalRate: 0,
            criticalDamage: 150,
            colliderRadius: 32,
          },
        ],
      },
      {
        id: 20,
        name: "Fixture Rinko",
        enabled: true,
        prefab: "",
        upgradedPrefab: "",
        thumbnail: "",
        upgradedThumbnail: "",
        initialWeaponId: 200,
        colliderRadius: 30,
        maxWeaponCount: 1,
        maxEquipCount: 1,
        canFly: false,
        canWalkThroughWall: false,
        activeSkillId: 3000,
        levels: [
          {
            level: 1,
            maxHp: 18,
            attack: 0,
            defense: 0,
            speed: 480,
            itemMagnetRange: 72,
            bulletSpeed: 0,
            bulletSize: 0,
            bulletLifeTime: 0,
            bulletCount: 0,
            coolDownReduce: 0,
            expGain: 0,
            criticalRate: 0,
            criticalDamage: 150,
            colliderRadius: 30,
          },
        ],
      },
    ],
    enemies: [],
    ais: [
      aiDirectFireFixture,
      aiShooterFixture,
      aiIdleFireFixture,
      aiRandomMoveFixture,
      aiPlayerSpawnShooterFixture,
      aiTeleportFixture,
      aiTimelineFireFixture,
      aiTimelineNoCollidingFixture,
      aiTimelineFireAllWeaponFixture,
      aiMinionShooterFixture,
    ],
    minions: [
      {
        id: 50,
        name: "Fixture Minion",
        description: "",
        prefab: "Minion_fixture",
        aiTypeId: 101,
        speed: 300,
        lifetimeFrames: 0,
      },
      {
        id: 51,
        name: "Fixture FireAll Minion",
        description: "",
        prefab: "Minion_fire_all_fixture",
        aiTypeId: 904,
        speed: 300,
        lifetimeFrames: 0,
      },
      {
        id: 52,
        name: "Fixture Spawn Data Minion",
        description: "",
        prefab: "Minion_spawn_data_fixture",
        aiTypeId: 0,
        speed: 300,
        lifetimeFrames: 0,
      },
    ],
    weapons: [
      {
        id: 100,
        name: "Fixture Wand",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 1,
                bulletCount: 1,
                bulletAttack: 1,
                bulletSpeed: 500,
                bulletSize: 20,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 4400,
        name: "Fixture Shooter Lance",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            bulletShooterId: 4000,
            fireBullets: [],
          },
        ],
      },
      {
        id: 4500,
        name: "Fixture Forward Shooter Lance",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            bulletShooterId: 4500,
            fireBullets: [],
          },
        ],
      },
      {
        id: 200,
        name: "Fixture Bow",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 2,
                bulletCount: 2,
                bulletAttack: 9,
                bulletSpeed: 700,
                bulletSize: 20,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
              createFireBulletFixture({
                bulletTypeId: 3,
                bulletCount: 1,
                bulletAttack: 4,
                bulletSpeed: 650,
                bulletSize: 18,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 300,
        name: "Fixture Burst",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 3,
            groupCount: 3,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 4,
                bulletCount: 1,
                bulletAttack: 6,
                bulletSpeed: 700,
                bulletSize: 20,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 400,
        name: "Fixture Delay Orb",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 5,
                bulletAttack: 5,
                bulletSpeed: 1,
                bulletDamageJudgeType: 1,
                bulletSize: 20,
                bulletLifeTime: 90,
                bulletHitTimes: 3,
                bulletDamageJudgeDelayFrames: 6,
                bulletDamageJudgeCooldownFrames: 15,
              }),
            ],
          },
        ],
      },
      {
        id: 500,
        name: "Fixture Once Orb",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 6,
                bulletAttack: 5,
                bulletSpeed: 1,
                bulletDamageJudgeType: 0,
                bulletSize: 20,
                bulletLifeTime: 90,
                bulletHitTimes: 3,
              }),
            ],
          },
        ],
      },
      {
        id: 600,
        name: "Fixture Rect Beam",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 7,
                bulletAttack: 7,
                bulletSpeed: 1,
                bulletSize: 40,
                bulletSize2: 100,
                bulletColliderType: 1,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 700,
        name: "Fixture Boundary Shot",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 8,
                bulletAttack: 1,
                bulletSpeed: 10000,
                bulletSize: 20,
                bulletLifeTime: 900,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 1200,
        name: "Fixture Ray Shot",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 13,
                bulletAttack: 7,
                bulletSpeed: 1,
                bulletSize: 10,
                bulletSize2: 100,
                bulletColliderType: 2,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 800,
        name: "Fixture Outward Field",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 9,
                bulletAttack: 20,
                bulletSpeed: 1,
                bulletDamageJudgeType: 2,
                bulletSize: 90,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
                bulletForceType: 1,
                bulletForce: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 900,
        name: "Fixture Inward Field",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 10,
                bulletAttack: 20,
                bulletSpeed: 1,
                bulletDamageJudgeType: 2,
                bulletSize: 90,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
                bulletForceType: 2,
                bulletForce: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 1000,
        name: "Fixture Slow Hit",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 999,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 11,
                bulletAttack: 1,
                bulletSpeed: 1,
                bulletSize: 90,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
                hitBuffId: 1,
                hitBuffLevel: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 1100,
        name: "Fixture Dot Hit",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 999,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 12,
                bulletAttack: 1,
                bulletSpeed: 1,
                bulletSize: 90,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
                hitBuffId: 4,
                hitBuffLevel: 2,
              }),
            ],
          },
        ],
      },
      {
        id: 12,
        name: "Fixture Owner Ray",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 999,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 19,
                bulletAttack: 1,
                bulletSpeed: 100,
                bulletSize: 10,
                bulletSize2: 100,
                bulletColliderType: 2,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 1300,
        name: "Fixture Modifier Shot",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 14,
                bulletCount: 1,
                bulletAttack: 1,
                bulletSpeed: 100,
                bulletSize: 20,
                bulletSize2: 40,
                bulletLifeTime: 30,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 1400,
        name: "Fixture Critical Shot",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 999,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 15,
                bulletAttack: 10,
                bulletSpeed: 1,
                bulletSize: 90,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 1500,
        name: "Fixture Rotate Speed Shot",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 999,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 16,
                bulletAttack: 1,
                bulletSpeed: 100,
                bulletSize: 20,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 1600,
        name: "Fixture Face Direction Shot",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 999,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 17,
                bulletAttack: 1,
                bulletSpeed: 100,
                bulletSize: 20,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 1700,
        name: "Fixture Friendly Banner",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 999,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 18,
                bulletAttack: 1,
                bulletSpeed: 0,
                bulletDamageJudgeType: 0,
                bulletHitTargetType: 1,
                bulletSize: 100,
                bulletLifeTime: 60,
                bulletHitTimes: 1,
                hitBuffId: 7,
                hitBuffLevel: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 1800,
        name: "Fixture Attribute Feather",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 19,
                bulletAttack: 1,
                bulletSpeed: 100,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
            attributeChanges: [
              {
                attributeType: 2,
                value: 3,
              },
              {
                attributeType: 3,
                value: 2,
              },
              {
                attributeType: 4,
                value: 40,
              },
            ],
          },
        ],
      },
      {
        id: 1900,
        name: "Fixture Self Shield",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            selfBuffId: 8,
            selfBuffLevel: 2,
            fireBullets: [],
          },
        ],
      },
      {
        id: 2000,
        name: "Fixture Counter Stance",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            selfBuffId: 9,
            selfBuffLevel: 1,
            fireBullets: [],
          },
        ],
      },
      {
        id: 2050,
        name: "Fixture Stealth Stance",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            selfBuffId: 122,
            selfBuffLevel: 1,
            fireBullets: [],
          },
        ],
      },
      {
        id: 2100,
        name: "Fixture Minion Call",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        weaponType: 1,
        minionId: 50,
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 21,
                bulletAttack: 11,
                bulletSpeed: 100,
                bulletSize: 90,
                bulletLifeTime: 30,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 2200,
        name: "Fixture Leveling Staff",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 3,
        fireSound: "",
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 22,
                bulletAttack: 1,
                bulletSpeed: 100,
                bulletSize: 20,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
          {
            level: 2,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 22,
                bulletCount: 2,
                bulletAttack: 6,
                bulletSpeed: 100,
                bulletSize: 20,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
            attributeChanges: [
              {
                attributeType: 2,
                value: 4,
              },
            ],
          },
          {
            level: 3,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 22,
                bulletCount: 3,
                bulletAttack: 8,
                bulletSpeed: 100,
                bulletSize: 20,
                bulletLifeTime: 90,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 2300,
        name: "Fixture FireAll Minion Call",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        weaponType: 1,
        minionId: 51,
        levels: [
          {
            level: 1,
            fireCooldownFrames: 999999,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 21,
                bulletAttack: 11,
                bulletSpeed: 100,
                bulletSize: 90,
                bulletLifeTime: 30,
                bulletHitTimes: 1,
              }),
            ],
          },
        ],
      },
      {
        id: 2400,
        name: "Fixture Spawn Data Minion Call",
        enabled: true,
        iconSpriteName: "",
        maxLevel: 1,
        fireSound: "",
        weaponType: 1,
        minionId: 52,
        levels: [
          {
            level: 1,
            fireCooldownFrames: 30,
            fireGroupCooldownFrames: 0,
            groupCount: 1,
            minionCount: 1,
            spawnMinion: {
              minionId: 52,
              minionLevel: 1,
              minionAiTypeId: 905,
              weaponId: 0,
              weaponLevel: 0,
              spawnCount: 1,
              spawnCenterType: 0,
              spawnCenterOffsetX: 3,
              spawnCenterOffsetY: -5,
              spawnFormation: 1,
              spawnRadiusMin: 10,
              spawnRadiusMax: 14,
            },
            fireBullets: [],
          },
        ],
      },
    ],
    equips: [
      {
        id: 1,
        name: "Fixture Attack Charm",
        enabled: true,
        description: "",
        iconSpriteName: "",
        maxLevel: 1,
        levels: [
          {
            level: 1,
            attributes: [
              {
                attributeType: 1,
                value: 3,
              },
              {
                attributeType: 2,
                value: 5,
              },
            ],
          },
        ],
      },
      {
        id: 2,
        name: "Fixture Speed Boots",
        enabled: true,
        description: "",
        iconSpriteName: "",
        maxLevel: 1,
        levels: [
          {
            level: 1,
            attributes: [
              {
                attributeType: 4,
                value: 50,
              },
            ],
          },
        ],
      },
      {
        id: 3,
        name: "Fixture Shield",
        enabled: true,
        description: "",
        iconSpriteName: "",
        maxLevel: 1,
        levels: [
          {
            level: 1,
            attributes: [
              {
                attributeType: 3,
                value: 2,
              },
            ],
          },
        ],
      },
      {
        id: 4,
        name: "Fixture Bullet Kit",
        enabled: true,
        description: "",
        iconSpriteName: "",
        maxLevel: 1,
        levels: [
          {
            level: 1,
            attributes: [
              {
                attributeType: 6,
                value: 50,
              },
              {
                attributeType: 7,
                value: 10,
              },
              {
                attributeType: 8,
                value: 15,
              },
              {
                attributeType: 9,
                value: 2,
              },
              {
                attributeType: 10,
                value: 50,
              },
            ],
          },
        ],
      },
      {
        id: 5,
        name: "Fixture Pickup Kit",
        enabled: true,
        description: "",
        iconSpriteName: "",
        maxLevel: 1,
        levels: [
          {
            level: 1,
            attributes: [
              {
                attributeType: 5,
                value: 100,
              },
              {
                attributeType: 11,
                value: 50,
              },
            ],
          },
        ],
      },
      {
        id: 6,
        name: "Fixture Critical Kit",
        enabled: true,
        description: "",
        iconSpriteName: "",
        maxLevel: 1,
        levels: [
          {
            level: 1,
            attributes: [
              {
                attributeType: 12,
                value: 100,
              },
              {
                attributeType: 13,
                value: 50,
              },
            ],
          },
        ],
      },
    ],
    buffs: [
      createBuffFixture({
        id: 1,
        name: "Fixture Slow",
        type: 1,
        duplicateType: 2,
        levels: [
          {
            level: 1,
            durationFrames: 30,
            value: -500,
            maxStackCount: 1,
            fireBullets: [],
            attributes: [
              {
                attributeType: 4,
                value: -500,
              },
            ],
          },
        ],
      }),
      createBuffFixture({
        id: 4,
        name: "Fixture DOT",
        type: 4,
        duplicateType: 1,
        maxLevel: 8,
        levels: [
          {
            level: 1,
            durationFrames: 150,
            value: 1,
            maxStackCount: 2,
            fireBullets: [],
            attributes: [],
          },
          {
            level: 2,
            durationFrames: 150,
            value: 2,
            maxStackCount: 2,
            fireBullets: [],
            attributes: [],
          },
        ],
      }),
      createBuffFixture({
        id: 7,
        name: "Fixture Friendly Speed",
        type: 1,
        duplicateType: 2,
        levels: [
          {
            level: 1,
            durationFrames: 60,
            value: 1,
            maxStackCount: 1,
            fireBullets: [],
            attributes: [
              {
                attributeType: 3,
                value: 1,
              },
              {
                attributeType: 4,
                value: 50,
              },
            ],
          },
        ],
      }),
      createBuffFixture({
        id: 8,
        name: "Fixture Self Shield",
        type: 5,
        duplicateType: 2,
        maxLevel: 2,
        levels: [
          {
            level: 1,
            durationFrames: 60,
            value: 2,
            maxStackCount: 1,
            fireBullets: [],
            attributes: [],
          },
          {
            level: 2,
            durationFrames: 60,
            value: 4,
            maxStackCount: 1,
            fireBullets: [],
            attributes: [],
          },
        ],
      }),
      createBuffFixture({
        id: 9,
        name: "Fixture Counter Stance",
        type: 6,
        duplicateType: 2,
        levels: [
          {
            level: 1,
            durationFrames: 999999,
            value: 1,
            maxStackCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 20,
                bulletAttack: 12,
                bulletSpeed: 0,
                bulletDamageJudgeType: 1,
                bulletHitTargetType: 0,
                bulletSize: 90,
                bulletLifeTime: 30,
                bulletHitTimes: 9999,
              }),
            ],
            attributes: [],
          },
        ],
      }),
      createBuffFixture({
        id: 122,
        name: "Fixture Stealth",
        type: 7,
        duplicateType: 2,
        levels: [
          {
            level: 1,
            durationFrames: 60,
            value: 1,
            maxStackCount: 1,
            fireBullets: [
              createFireBulletFixture({
                bulletTypeId: 1220,
                bulletAttack: 1,
                bulletSpeed: 500,
                bulletDamageJudgeType: 1,
                bulletHitTargetType: 0,
                bulletSize: 80,
                bulletLifeTime: 30,
                bulletHitTimes: 9999,
              }),
            ],
            attributes: [
              {
                attributeType: 4,
                value: 500,
              },
            ],
          },
        ],
      }),
      createBuffFixture({
        id: 13,
        name: "Fixture Invincible",
        type: 9,
        duplicateType: 2,
        levels: [
          {
            level: 1,
            durationFrames: 60,
            value: 1,
            maxStackCount: 1,
            fireBullets: [],
            attributes: [],
          },
        ],
      }),
      createBuffFixture({
        id: 105,
        name: "Fixture Heal Percent",
        type: 11,
        duplicateType: 2,
        levels: [
          {
            level: 1,
            durationFrames: 1,
            value: 1000,
            maxStackCount: 1,
            fireBullets: [],
            attributes: [],
          },
        ],
      }),
      createBuffFixture({
        id: 106,
        name: "Fixture Revive",
        type: 12,
        duplicateType: 2,
        levels: [
          {
            level: 1,
            durationFrames: 1,
            value: 1,
            maxStackCount: 1,
            fireBullets: [],
            attributes: [],
          },
        ],
      }),
      createBuffFixture({
        id: 120,
        name: "Fixture Taunt",
        type: 13,
        duplicateType: 2,
        levels: [
          {
            level: 1,
            durationFrames: 30,
            value: 1,
            maxStackCount: 1,
            fireBullets: [],
            attributes: [],
          },
        ],
      }),
    ],
    activeSkills: [activeSkillFixture],
    bulletShooters: [
      bulletShooterFixture,
      directionZeroShooterFixture,
      directionOneShooterFixture,
      radialShooterFixture,
      directionThreeShooterFixture,
      followOwnerShooterFixture,
      directionFourShooterFixture,
      rotationOverrideShooterFixture,
      directionTwoShooterFixture,
      hostileShooterFixture,
      hostilePlayerSpawnShooterFixture,
      onDestroyShooterFixture,
      nearestEnemySpawnShooterFixture,
    ],
    globalUpgrades: [
      {
        id: 900,
        characterId: 10,
        name: "Unlock Fixture Bow",
        description: "",
        cost: 0,
        parentId: 0,
        iconSpriteName: "",
        posX: 0,
        posY: 0,
        attributes: [],
        initialWeaponLevelReplace: 0,
        unlockWeaponId: 200,
        unlockEquipId: 0,
      },
      {
        id: 901,
        characterId: 10,
        name: "Unlock Fixture Speed Boots",
        description: "",
        cost: 0,
        parentId: 0,
        iconSpriteName: "",
        posX: 1,
        posY: 0,
        attributes: [],
        initialWeaponLevelReplace: 0,
        unlockWeaponId: 0,
        unlockEquipId: 2,
      },
    ],
    bullets: [
      {
        id: 16,
        name: "Fixture Rotate Speed Bullet",
        prefab: "Bullet_16_fixture",
        rotateType: 1,
      },
      {
        id: 17,
        name: "Fixture Face Direction Bullet",
        prefab: "Bullet_17_fixture",
        rotateType: 3,
      },
      {
        id: 18,
        name: "Fixture Friendly Banner Bullet",
        prefab: "Bullet_18_fixture",
        rotateType: 3,
      },
      {
        id: 19,
        name: "Fixture Attribute Bullet",
        prefab: "Bullet_19_fixture",
        rotateType: 1,
      },
      {
        id: 20,
        name: "Fixture Counter Bullet",
        prefab: "Bullet_20_fixture",
        rotateType: 3,
      },
      {
        id: 21,
        name: "Fixture Minion Bullet",
        prefab: "Bullet_21_fixture",
        rotateType: 1,
      },
      {
        id: 22,
        name: "Fixture Level Bullet",
        prefab: "Bullet_22_fixture",
        rotateType: 0,
      },
      {
        id: 23,
        name: "Fixture Shooter Bullet",
        prefab: "Bullet_23_fixture",
        rotateType: 0,
      },
      {
        id: 24,
        name: "Fixture Direction Zero Bullet",
        prefab: "Bullet_24_fixture",
        rotateType: 0,
      },
      {
        id: 25,
        name: "Fixture Direction One Bullet",
        prefab: "Bullet_25_fixture",
        rotateType: 0,
      },
      {
        id: 26,
        name: "Fixture Direction Three Bullet",
        prefab: "Bullet_26_fixture",
        rotateType: 0,
      },
      {
        id: 27,
        name: "Fixture Direction Four Bullet",
        prefab: "Bullet_27_fixture",
        rotateType: 0,
      },
      {
        id: 28,
        name: "Fixture Rotation Override Bullet",
        prefab: "Bullet_28_fixture",
        rotateType: 1,
      },
      {
        id: 29,
        name: "Fixture Direction Two Bullet",
        prefab: "Bullet_29_fixture",
        rotateType: 0,
      },
      {
        id: 30,
        name: "Fixture AI Bullet",
        prefab: "Bullet_30_fixture",
        rotateType: 0,
      },
      {
        id: 31,
        name: "Fixture Hostile Shooter Bullet",
        prefab: "Bullet_31_fixture",
        rotateType: 0,
      },
      {
        id: 32,
        name: "Fixture On-Destroy Parent Bullet",
        prefab: "Bullet_32_fixture",
        rotateType: 0,
      },
      {
        id: 33,
        name: "Fixture On-Destroy Child Bullet",
        prefab: "Bullet_33_fixture",
        rotateType: 0,
      },
      {
        id: 34,
        name: "Fixture Nearest Enemy Spawn Bullet",
        prefab: "Bullet_34_fixture",
        rotateType: 0,
      },
    ],
    drops: [],
    items: [],
    levels: [
      createLevelFixture(1, "Fixture Plain", 1000, {
        clearUnlockCharacterIds: [20],
        clearUnlockLevelIds: [2],
        clearUnlockWeaponIds: [200],
        clearUnlockEquipIds: [2],
      }),
      createLevelFixture(2, "Fixture Mine", 2000),
    ],
    maps: [],
    mapPrefabs: [],
    gameDefault: {
      gameVersion: "test",
      defaultUnlockCharacterIds: [10],
      defaultUnlockWeaponIds: [100],
      defaultUnlockEquipIds: [1, 3],
      defaultUnlockLevelIds: [1],
      levelConfig: {
        playerExpStart: 50,
        playerExpAddPerLevel: 50,
        playerLevelOn10: 70,
        playerDpsPerLevel: 50,
        fastStartRate: 30,
        fastStartSpeed: 80,
      },
    },
  };
}

function createLevelFixture(
  id: number,
  name: string,
  clearCoin: number,
  unlocks: Partial<Pick<
    NfoLevelData,
    "clearUnlockCharacterIds" | "clearUnlockLevelIds" | "clearUnlockWeaponIds" | "clearUnlockEquipIds"
  >> = {},
): NfoLevelData {
  return {
    id,
    name,
    enabled: true,
    singlePlayEnabled: true,
    description: "",
    mapPrefabName: `FixtureMap_${id}`,
    sizeX: 8,
    sizeY: 8,
    bulletBoundaryX: 8,
    bulletBoundaryY: 8,
    bgm: "",
    commonDropId: 0,
    playerExpRate: 100,
    clearCoin,
    clearType: 0,
    totalFrames: 30,
    clearEnemyEventId: 0,
    clearMinorEnemyEventIds: [],
    clearUnlockCharacterIds: unlocks.clearUnlockCharacterIds ?? [],
    clearUnlockLevelIds: unlocks.clearUnlockLevelIds ?? [],
    clearUnlockWeaponIds: unlocks.clearUnlockWeaponIds ?? [],
    clearUnlockEquipIds: unlocks.clearUnlockEquipIds ?? [],
    events: [
      {
        name: "PlayerSpawn",
        eventId: id * 100,
        enabled: true,
        triggerType: 0,
        triggerEnemyEventId: 0,
        startFrame: 0,
        totalFrames: 0,
        eventType: 1,
        playerSpawn: createPlayerSpawnFixture(),
        enemySpawn: createEnemySpawnFixture(),
      },
    ],
  };
}

function createPlayerSpawnFixture(): NfoPlayerSpawnData {
  return {
    characterId: 10,
    spawnX: 0,
    spawnY: 0,
  };
}

function createEnemySpawnFixture(): NfoEnemySpawnData {
  return {
    enemyTypeId: 0,
    enemyLevel: 0,
    enemyAiTypeId: 0,
    spawnType: 0,
    spawnCenterType: 0,
    spawnWaveCount: 0,
    spawnWaveIntervalFrames: 0,
    spawnRangeMin: 0,
    spawnRangeMax: 0,
    spawnCenterOffsetX: 0,
    spawnCenterOffsetY: 0,
    eventId: 0,
    dropId: 0,
    programControl: false,
  };
}
