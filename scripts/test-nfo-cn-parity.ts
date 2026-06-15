import assert from "node:assert/strict";
import { readLocalNfoRuntimeData } from "../src/lib/bandori-nfo-local-snapshot-server";
import {
  applyNfoRunResultToSave,
  createInitialNfoOfflineSave,
} from "../src/lib/nfo-offline-save";
import {
  createNfoSimulation,
  updateNfoSimulation,
  type NfoInputState,
  type NfoSimActiveShooter,
  type NfoSimBullet,
  type NfoSimEnemy,
  type NfoSimMinion,
  type NfoSimPickup,
  type NfoSimulationState,
} from "../src/lib/nfo-offline-sim";
import type {
  NfoActiveSkillTimelineEvent,
  NfoAttributeData,
  NfoOfflineRuntimeData,
} from "../src/lib/nfo-offline-runtime";
import { buildNfoCnParityFixture } from "./nfo-cn-parity-fixtures";

const NO_INPUT: NfoInputState = { moveX: 0, moveY: 0 };
const CN_LEVEL_UNIT_SIZE = 96;
const FIRST_PASS_GUARDIAN_SONG_ORBIT_RADIUS = 120;
const CN_NFO_ATTRIBUTE_TYPE = {
  attack: 2,
  bulletSize: 7,
} as const;
let fixture: ReturnType<typeof buildNfoCnParityFixture>;

async function main() {
  const runtimeData = await readLocalNfoRuntimeData();
  fixture = buildNfoCnParityFixture(runtimeData);

  assert.equal(
    runtimeData.source.runtimeDataPath,
    "public/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json",
  );
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.activeSkillShooterCount, 24);
  assert.equal(fixture.activeSkillShooterEventCount, 54);
  assert.equal(fixture.weaponLevelShooterCount, 32);
  assert.equal(fixture.selectedActiveSkillShooterSpawnCases.length, 8);
  assert.equal(fixture.selectedAIActionCases.length, 3);
  assert.equal(fixture.selectedWeaponShooterCases.length, 8);
  assert.equal(fixture.selectedWeaponDirectFireCases.length, 30);
  assert.equal(fixture.selectedActiveSkillShooterHitBuffCases.length, 3);
  assert.equal(fixture.selectedShooterOnDestroyCases.length, 2);
  assert.equal(fixture.selectedWeaponMinionCases.length, 6);
  assert.equal(fixture.selectedWeaponSelfBuffCases.length, 3);
  assert.equal(fixture.selectedActiveSkillSummonCases.length, 6);
  assert.equal(fixture.selectedAIStateTeleportCases.length, 1);
  assert.equal(fixture.selectedAIStateMovementCases.length, 10);
  assert.equal(fixture.selectedAIStateBuffCases.length, 3);
  assert.equal(fixture.selectedAIStateCommonStateCases.length, 2);
  assert.equal(fixture.selectedAIStateAnimationCases.length, 2);
  assert.equal(fixture.selectedActiveSkillBuffCases.length, 2);
  assert.equal(fixture.selectedItemCases.length, 6);
  assert.equal(fixture.selectedDropCases.length, 2);
  assert.equal(fixture.selectedLevelEnemySpawnCases.length, 3);
  assert.equal(fixture.selectedLevelClearCases.length, 5);
  assert.equal(fixture.selectedLevelEventTriggerCases.length, 1);
  assert.equal(fixture.selectedLevelAIStateChangeCases.length, 2);

  const directionZeroCase = getCase("active-shooter-direction-0-offset");
  assert.equal(directionZeroCase.shooterId, 7000);
  assert.equal(directionZeroCase.directionType, 0);
  assert.equal(directionZeroCase.formationOffsetX, 0);
  assert.equal(directionZeroCase.formationOffsetY, 100);
  assert.equal(directionZeroCase.bulletTypeId, 66);

  const directionOneCase = getCase("active-shooter-direction-1-radial-six-star");
  assert.equal(directionOneCase.shooterId, 6000);
  assert.equal(directionOneCase.shooterLifeTimeFrames, 55);
  assert.equal(directionOneCase.eventFrame, 1);
  assert.equal(directionOneCase.isLoopEvent, true);
  assert.equal(directionOneCase.loopFrameInterval, 10);
  assert.equal(directionOneCase.directionType, 1);
  assert.equal(directionOneCase.bulletTypeId, 28);
  assert.equal(directionOneCase.bulletCount, 6);
  assert.equal(directionOneCase.expectedDirectionMode, "radial-ring");

  const directionThreeCase = getCase("active-shooter-direction-3-owner-forward");
  assert.equal(directionThreeCase.shooterId, 3000);
  assert.equal(directionThreeCase.directionType, 3);
  assert.equal(directionThreeCase.noDamage, true);

  const weaponShooterCase = getWeaponShooterCase("weapon-shooter-judgement-spear-lv1");
  assert.equal(weaponShooterCase.weaponId, 31);
  assert.equal(weaponShooterCase.weaponLevel, 1);
  assert.equal(weaponShooterCase.weaponDirectFireBulletCount, 0);
  assert.equal(weaponShooterCase.shooterId, 311);
  assert.equal(weaponShooterCase.bulletTypeId, 61);
  assert.equal(weaponShooterCase.directionType, 4);
  assert.equal(weaponShooterCase.formationType, 3);
  assert.equal(weaponShooterCase.formationOffsetX, 100);
  assert.equal(weaponShooterCase.expectedDirectionMode, "owner-forward");

  const levelUpWeaponShooterCase = getWeaponShooterCase(
    "weapon-shooter-judgement-spear-level-up-lv2",
  );
  assert.equal(levelUpWeaponShooterCase.weaponId, 31);
  assert.equal(levelUpWeaponShooterCase.weaponLevel, 2);
  assert.equal(levelUpWeaponShooterCase.weaponDirectFireBulletCount, 0);
  assert.equal(levelUpWeaponShooterCase.shooterId, 312);
  assert.equal(levelUpWeaponShooterCase.bulletTypeId, 61);
  assert.equal(levelUpWeaponShooterCase.directionType, 4);
  assert.equal(levelUpWeaponShooterCase.formationType, 3);
  assert.equal(levelUpWeaponShooterCase.formationOffsetX, 100);
  assert.equal(levelUpWeaponShooterCase.bulletAttack, 80);
  assert.equal(levelUpWeaponShooterCase.bulletSize, 120);
  assert.equal(levelUpWeaponShooterCase.bulletLifeTimeFrames, 35);
  assert.equal(levelUpWeaponShooterCase.expectedDirectionMode, "owner-forward");

  const nightBladeOffsetCase = getWeaponShooterCase(
    "weapon-shooter-night-blade-offset-angle-lv1",
  );
  assert.equal(nightBladeOffsetCase.weaponId, 28);
  assert.equal(nightBladeOffsetCase.weaponLevel, 1);
  assert.equal(nightBladeOffsetCase.shooterId, 2);
  assert.equal(nightBladeOffsetCase.bulletTypeId, 24);
  assert.equal(nightBladeOffsetCase.eventFrame, 15);
  assert.equal(nightBladeOffsetCase.directionType, 1);
  assert.equal(nightBladeOffsetCase.directionOffsetAngle, 90);
  assert.equal(nightBladeOffsetCase.bulletCount, 2);
  assert.equal(nightBladeOffsetCase.bulletLifeTimeFrames, 15);
  assert.equal(nightBladeOffsetCase.expectedDirectionMode, "nearest-enemy");

  const nightBladeRadialCase = getWeaponShooterCase(
    "weapon-shooter-night-blade-all-direction-radial-lv1",
  );
  assert.equal(nightBladeRadialCase.weaponId, 28);
  assert.equal(nightBladeRadialCase.weaponLevel, 1);
  assert.equal(nightBladeRadialCase.shooterId, 2);
  assert.equal(nightBladeRadialCase.bulletTypeId, 24);
  assert.equal(nightBladeRadialCase.eventFrame, 30);
  assert.equal(nightBladeRadialCase.directionType, 1);
  assert.equal(nightBladeRadialCase.directionOffsetAngle, 0);
  assert.equal(nightBladeRadialCase.formationType, 0);
  assert.equal(nightBladeRadialCase.formationOffsetX, 0);
  assert.equal(nightBladeRadialCase.formationOffsetY, 0);
  assert.equal(nightBladeRadialCase.bulletCount, 8);
  assert.equal(nightBladeRadialCase.bulletSpeed, 600);
  assert.equal(nightBladeRadialCase.expectedDirectionMode, "radial-ring");

  const eternalSongMainCase = getWeaponShooterCase(
    "weapon-shooter-eternal-song-main-field-lv1",
  );
  assert.equal(eternalSongMainCase.weaponId, 30);
  assert.equal(eternalSongMainCase.weaponLevel, 1);
  assert.equal(eternalSongMainCase.shooterId, 301);
  assert.equal(eternalSongMainCase.shooterLifeTimeFrames, 100);
  assert.equal(eternalSongMainCase.eventFrame, 1);
  assert.equal(eternalSongMainCase.isLoopEvent, false);
  assert.equal(eternalSongMainCase.loopFrameInterval, 0);
  assert.equal(eternalSongMainCase.bulletTypeId, 60);
  assert.equal(eternalSongMainCase.bulletAttack, 20);
  assert.equal(eternalSongMainCase.bulletNoDamage, false);
  assert.equal(eternalSongMainCase.bulletHitTargetType, 0);
  assert.equal(eternalSongMainCase.bulletDamageJudgeType, 1);
  assert.equal(eternalSongMainCase.bulletColliderType, 0);
  assert.equal(eternalSongMainCase.bulletSize, 300);
  assert.equal(eternalSongMainCase.bulletLifeTimeFrames, 100);
  assert.equal(eternalSongMainCase.bulletHitTimes, 99999);
  assert.equal(eternalSongMainCase.bulletDamageJudgeDelayFrames, 0);
  assert.equal(eternalSongMainCase.bulletDamageJudgeCooldownFrames, 15);
  assert.equal(eternalSongMainCase.expectedDirectionMode, "owner-forward");

  const eternalSongBuffCase = getWeaponShooterCase(
    "weapon-shooter-eternal-song-friendly-buff-lv1",
  );
  assert.equal(eternalSongBuffCase.weaponId, 30);
  assert.equal(eternalSongBuffCase.weaponLevel, 1);
  assert.equal(eternalSongBuffCase.shooterId, 301);
  assert.equal(eternalSongBuffCase.shooterLifeTimeFrames, 100);
  assert.equal(eternalSongBuffCase.eventFrame, 1);
  assert.equal(eternalSongBuffCase.isLoopEvent, true);
  assert.equal(eternalSongBuffCase.loopFrameInterval, 30);
  assert.equal(eternalSongBuffCase.bulletTypeId, 99);
  assert.equal(eternalSongBuffCase.bulletNoDamage, true);
  assert.equal(eternalSongBuffCase.bulletHitTargetType, 1);
  assert.equal(eternalSongBuffCase.hitBuffId, 109);
  assert.equal(eternalSongBuffCase.hitBuffLevel, 1);
  assert.equal(eternalSongBuffCase.bulletDamageJudgeType, 1);
  assert.equal(eternalSongBuffCase.expectedDirectionMode, "owner-forward");

  const prayerRainSlowCase = getWeaponShooterCase(
    "weapon-shooter-prayer-rain-enemy-slow-lv1",
  );
  assert.equal(prayerRainSlowCase.weaponId, 33);
  assert.equal(prayerRainSlowCase.weaponLevel, 1);
  assert.equal(prayerRainSlowCase.weaponDirectFireBulletCount, 1);
  assert.equal(prayerRainSlowCase.shooterId, 321);
  assert.equal(prayerRainSlowCase.shooterLifeTimeFrames, 115);
  assert.equal(prayerRainSlowCase.eventFrame, 1);
  assert.equal(prayerRainSlowCase.isLoopEvent, true);
  assert.equal(prayerRainSlowCase.loopFrameInterval, 60);
  assert.equal(prayerRainSlowCase.bulletTypeId, 99);
  assert.equal(prayerRainSlowCase.bulletNoDamage, true);
  assert.equal(prayerRainSlowCase.bulletHitTargetType, 0);
  assert.equal(prayerRainSlowCase.hitBuffId, 1);
  assert.equal(prayerRainSlowCase.hitBuffLevel, 1);
  assert.equal(prayerRainSlowCase.bulletDamageJudgeType, 1);
  assert.equal(prayerRainSlowCase.expectedDirectionMode, "owner-forward");

  const prayerRainBuffCase = getWeaponShooterCase(
    "weapon-shooter-prayer-rain-friendly-buff-lv1",
  );
  assert.equal(prayerRainBuffCase.weaponId, 33);
  assert.equal(prayerRainBuffCase.weaponLevel, 1);
  assert.equal(prayerRainBuffCase.weaponDirectFireBulletCount, 1);
  assert.equal(prayerRainBuffCase.shooterId, 321);
  assert.equal(prayerRainBuffCase.bulletTypeId, 63);
  assert.equal(prayerRainBuffCase.bulletNoDamage, true);
  assert.equal(prayerRainBuffCase.bulletHitTargetType, 1);
  assert.equal(prayerRainBuffCase.hitBuffId, 111);
  assert.equal(prayerRainBuffCase.hitBuffLevel, 1);
  assert.equal(prayerRainBuffCase.bulletDamageJudgeType, 1);
  assert.equal(prayerRainBuffCase.expectedDirectionMode, "owner-forward");
  assert.equal(prayerRainBuffCase.shooterBehaviorType, 1);
  assert.equal(prayerRainBuffCase.shooterFollowsOwnerDirection, true);

  const holyShieldImpactCase = getWeaponDirectFireCase(
    "weapon-direct-holy-shield-impact-damage-judge-none-force",
  );
  assert.equal(holyShieldImpactCase.weaponId, 11);
  assert.equal(holyShieldImpactCase.weaponLevel, 1);
  assert.equal(holyShieldImpactCase.weaponDirectFireBulletCount, 5);
  assert.equal(holyShieldImpactCase.bulletTypeId, 6);
  assert.equal(holyShieldImpactCase.bulletDamageJudgeType, 2);
  assert.equal(holyShieldImpactCase.bulletForceType, 1);
  assert.equal(holyShieldImpactCase.bulletForce, 1);
  assert.equal(holyShieldImpactCase.bulletHitTargetType, 0);

  const lightSanctuaryCase = getWeaponDirectFireCase(
    "weapon-direct-light-sanctuary-targetless-multi-bullet-lv1",
  );
  assert.equal(lightSanctuaryCase.weaponId, 2);
  assert.equal(lightSanctuaryCase.weaponLevel, 1);
  assert.equal(lightSanctuaryCase.weaponDirectFireBulletCount, 1);
  assert.equal(lightSanctuaryCase.bulletTypeId, 2);
  assert.equal(lightSanctuaryCase.bulletCount, 3);
  assert.equal(lightSanctuaryCase.bulletSpeed, 600);
  assert.equal(lightSanctuaryCase.bulletDamageJudgeType, 1);
  assert.equal(lightSanctuaryCase.bulletColliderType, 0);
  assert.equal(lightSanctuaryCase.bulletSize, 100);
  assert.equal(lightSanctuaryCase.bulletDamageJudgeDelayFrames, 0);
  assert.equal(lightSanctuaryCase.bulletDamageJudgeCooldownFrames, 10);

  const fireballFanCase = getWeaponDirectFireCase(
    "weapon-direct-fireball-targeted-two-shot-lv2",
  );
  assert.equal(fireballFanCase.weaponId, 1);
  assert.equal(fireballFanCase.weaponLevel, 2);
  assert.equal(fireballFanCase.requiresEnemyTarget, true);
  assert.equal(fireballFanCase.weaponDirectFireBulletCount, 1);
  assert.equal(fireballFanCase.bulletTypeId, 11);
  assert.equal(fireballFanCase.bulletCount, 2);
  assert.equal(fireballFanCase.bulletSpeed, 600);
  assert.equal(fireballFanCase.bulletDamageJudgeType, 0);
  assert.equal(fireballFanCase.bulletColliderType, 0);
  assert.equal(fireballFanCase.bulletSize, 30);
  assert.equal(fireballFanCase.bulletHitTimes, 2);

  const apocalypseLightCase = getWeaponDirectFireCase(
    "weapon-direct-apocalypse-light-targeted-ray-lv1",
  );
  assert.equal(apocalypseLightCase.weaponId, 3);
  assert.equal(apocalypseLightCase.weaponLevel, 1);
  assert.equal(apocalypseLightCase.requiresEnemyTarget, true);
  assert.equal(apocalypseLightCase.weaponDirectFireBulletCount, 1);
  assert.equal(apocalypseLightCase.bulletTypeId, 3);
  assert.equal(apocalypseLightCase.bulletCount, 1);
  assert.equal(apocalypseLightCase.bulletSpeed, 0);
  assert.equal(apocalypseLightCase.bulletDamageJudgeType, 1);
  assert.equal(apocalypseLightCase.bulletColliderType, 2);
  assert.equal(apocalypseLightCase.bulletSize, 100);
  assert.equal(apocalypseLightCase.bulletSize2, 0);
  assert.equal(apocalypseLightCase.bulletLifeTimeFrames, 20);
  assert.equal(apocalypseLightCase.bulletHitTimes, 999);
  assert.equal(apocalypseLightCase.bulletDamageJudgeCooldownFrames, 5);

  const knightBladeCase = getWeaponDirectFireCase(
    "weapon-direct-knight-blade-targetless-field-lv1",
  );
  assert.equal(knightBladeCase.weaponId, 4);
  assert.equal(knightBladeCase.weaponLevel, 1);
  assert.equal(knightBladeCase.weaponDirectFireBulletCount, 1);
  assert.equal(knightBladeCase.weaponGroupCount, 1);
  assert.equal(knightBladeCase.weaponFireGroupCooldownFrames, 3);
  assert.equal(knightBladeCase.weaponFireCooldownFrames, 15);
  assert.equal(knightBladeCase.bulletTypeId, 4);
  assert.equal(knightBladeCase.bulletCount, 1);
  assert.equal(knightBladeCase.bulletSpeed, 0);
  assert.equal(knightBladeCase.bulletDamageJudgeType, 1);
  assert.equal(knightBladeCase.bulletColliderType, 0);
  assert.equal(knightBladeCase.bulletSize, 250);
  assert.equal(knightBladeCase.bulletLifeTimeFrames, 10);
  assert.equal(knightBladeCase.bulletHitTimes, 999);
  assert.equal(knightBladeCase.bulletDamageJudgeCooldownFrames, 120);

  const darkOrbCase = getWeaponDirectFireCase(
    "weapon-direct-dark-orb-targetless-multi-bullet-lv1",
  );
  assert.equal(darkOrbCase.weaponId, 5);
  assert.equal(darkOrbCase.weaponLevel, 1);
  assert.equal(darkOrbCase.weaponDirectFireBulletCount, 1);
  assert.equal(darkOrbCase.bulletTypeId, 5);
  assert.equal(darkOrbCase.bulletCount, 2);
  assert.equal(darkOrbCase.bulletSpeed, 800);
  assert.equal(darkOrbCase.bulletDamageJudgeType, 0);
  assert.equal(darkOrbCase.bulletColliderType, 0);
  assert.equal(darkOrbCase.bulletSize, 50);
  assert.equal(darkOrbCase.bulletDamageJudgeDelayFrames, 0);
  assert.equal(darkOrbCase.bulletDamageJudgeCooldownFrames, 120);
  assert.ok(darkOrbCase.weaponDescription.includes("追踪"));
  assert.equal(darkOrbCase.motionMode, "homingEnemy");

  const guardianSongCase = getWeaponDirectFireCase(
    "weapon-direct-guardian-song-targetless-multi-bullet-lv1",
  );
  assert.equal(guardianSongCase.weaponId, 6);
  assert.equal(guardianSongCase.weaponLevel, 1);
  assert.equal(guardianSongCase.weaponDirectFireBulletCount, 1);
  assert.equal(guardianSongCase.bulletTypeId, 16);
  assert.equal(guardianSongCase.bulletCount, 3);
  assert.equal(guardianSongCase.bulletSpeed, 800);
  assert.equal(guardianSongCase.bulletDamageJudgeType, 1);
  assert.equal(guardianSongCase.bulletColliderType, 0);
  assert.equal(guardianSongCase.bulletSize, 50);
  assert.equal(guardianSongCase.bulletDamageJudgeDelayFrames, 0);
  assert.equal(guardianSongCase.bulletDamageJudgeCooldownFrames, 10);
  assert.ok(guardianSongCase.weaponDescription.includes("围绕角色旋转"));
  assert.equal(guardianSongCase.motionMode, "playerOrbit");

  const kirakiraCase = getWeaponDirectFireCase(
    "weapon-direct-kirakira-targetless-five-shot-lv1",
  );
  assert.equal(kirakiraCase.weaponId, 9);
  assert.equal(kirakiraCase.weaponLevel, 1);
  assert.equal(kirakiraCase.weaponDirectFireBulletCount, 1);
  assert.equal(kirakiraCase.bulletTypeId, 14);
  assert.equal(kirakiraCase.bulletCount, 5);
  assert.equal(kirakiraCase.bulletSpeed, 800);
  assert.equal(kirakiraCase.bulletDamageJudgeType, 0);
  assert.equal(kirakiraCase.bulletColliderType, 0);
  assert.equal(kirakiraCase.bulletSize, 30);
  assert.equal(kirakiraCase.bulletDamageJudgeDelayFrames, 0);
  assert.equal(kirakiraCase.bulletDamageJudgeCooldownFrames, 5);

  const darkSummonCase = getWeaponDirectFireCase(
    "weapon-direct-dark-summon-targeted-projectile-lv1",
  );
  assert.equal(darkSummonCase.weaponId, 7);
  assert.equal(darkSummonCase.weaponLevel, 1);
  assert.equal(darkSummonCase.requiresEnemyTarget, true);
  assert.equal(darkSummonCase.weaponDirectFireBulletCount, 1);
  assert.equal(darkSummonCase.bulletTypeId, 17);
  assert.equal(darkSummonCase.bulletCount, 1);
  assert.equal(darkSummonCase.bulletSpeed, 800);
  assert.equal(darkSummonCase.bulletDamageJudgeType, 0);
  assert.equal(darkSummonCase.bulletColliderType, 0);
  assert.equal(darkSummonCase.bulletSize, 50);
  assert.equal(darkSummonCase.bulletLifeTimeFrames, 300);
  assert.equal(darkSummonCase.bulletHitTimes, 3);
  assert.equal(darkSummonCase.bulletDamageJudgeCooldownFrames, 5);

  const hurricaneProjectileCase = getWeaponDirectFireCase(
    "weapon-direct-hurricane-moving-projectile-lv1",
  );
  assert.equal(hurricaneProjectileCase.weaponId, 8);
  assert.equal(hurricaneProjectileCase.weaponLevel, 1);
  assert.equal(hurricaneProjectileCase.fireBulletIndex, 0);
  assert.equal(hurricaneProjectileCase.requiresEnemyTarget, true);
  assert.equal(hurricaneProjectileCase.weaponDirectFireBulletCount, 2);
  assert.equal(hurricaneProjectileCase.bulletTypeId, 15);
  assert.equal(hurricaneProjectileCase.bulletSpeed, 800);
  assert.equal(hurricaneProjectileCase.bulletDamageJudgeType, 0);
  assert.equal(hurricaneProjectileCase.bulletColliderType, 0);
  assert.equal(hurricaneProjectileCase.bulletSize, 50);
  assert.equal(hurricaneProjectileCase.bulletLifeTimeFrames, 40);
  assert.equal(hurricaneProjectileCase.bulletHitTimes, 1);

  const hurricaneFieldCase = getWeaponDirectFireCase(
    "weapon-direct-hurricane-static-field-lv1",
  );
  assert.equal(hurricaneFieldCase.weaponId, 8);
  assert.equal(hurricaneFieldCase.weaponLevel, 1);
  assert.equal(hurricaneFieldCase.fireBulletIndex, 1);
  assert.equal(hurricaneFieldCase.requiresEnemyTarget, true);
  assert.equal(hurricaneFieldCase.weaponDirectFireBulletCount, 2);
  assert.equal(hurricaneFieldCase.bulletTypeId, 15);
  assert.equal(hurricaneFieldCase.bulletSpeed, 0);
  assert.equal(hurricaneFieldCase.bulletDamageJudgeType, 1);
  assert.equal(hurricaneFieldCase.bulletColliderType, 0);
  assert.equal(hurricaneFieldCase.bulletSize, 150);
  assert.equal(hurricaneFieldCase.bulletLifeTimeFrames, 30);
  assert.equal(hurricaneFieldCase.bulletHitTimes, 99999);

  const sixStarDotCase = getWeaponDirectFireCase(
    "weapon-direct-six-star-dot-hit-buff-lv1",
  );
  assert.equal(sixStarDotCase.weaponId, 18);
  assert.equal(sixStarDotCase.weaponLevel, 1);
  assert.equal(sixStarDotCase.weaponDirectFireBulletCount, 1);
  assert.equal(sixStarDotCase.bulletTypeId, 28);
  assert.equal(sixStarDotCase.bulletCount, 1);
  assert.equal(sixStarDotCase.bulletSpeed, 700);
  assert.equal(sixStarDotCase.bulletDamageJudgeType, 0);
  assert.equal(sixStarDotCase.bulletColliderType, 0);
  assert.equal(sixStarDotCase.bulletSize, 50);
  assert.equal(sixStarDotCase.bulletHitTimes, 99999);
  assert.equal(sixStarDotCase.hitBuffId, 4);
  assert.equal(sixStarDotCase.hitBuffLevel, 1);

  const galaxyLightCase = getWeaponDirectFireCase(
    "weapon-direct-galaxy-light-grouped-field-lv1",
  );
  assert.equal(galaxyLightCase.weaponId, 20);
  assert.equal(galaxyLightCase.weaponLevel, 1);
  assert.equal(galaxyLightCase.weaponDirectFireBulletCount, 1);
  assert.equal(galaxyLightCase.weaponGroupCount, 4);
  assert.equal(galaxyLightCase.weaponFireGroupCooldownFrames, 5);
  assert.equal(galaxyLightCase.weaponFireCooldownFrames, 90);
  assert.equal(galaxyLightCase.bulletTypeId, 30);
  assert.equal(galaxyLightCase.bulletCount, 1);
  assert.equal(galaxyLightCase.bulletSpeed, 0);
  assert.equal(galaxyLightCase.bulletDamageJudgeType, 1);
  assert.equal(galaxyLightCase.bulletColliderType, 0);
  assert.equal(galaxyLightCase.bulletSize, 50);
  assert.equal(galaxyLightCase.bulletHitTimes, 99999);

  const blackHoleCase = getWeaponDirectFireCase(
    "weapon-direct-black-hole-inward-force-lv1",
  );
  assert.equal(blackHoleCase.weaponId, 21);
  assert.equal(blackHoleCase.weaponLevel, 1);
  assert.equal(blackHoleCase.weaponDirectFireBulletCount, 1);
  assert.equal(blackHoleCase.bulletTypeId, 31);
  assert.equal(blackHoleCase.bulletSpeed, 0);
  assert.equal(blackHoleCase.bulletDamageJudgeType, 1);
  assert.equal(blackHoleCase.bulletColliderType, 0);
  assert.equal(blackHoleCase.bulletSize, 300);
  assert.equal(blackHoleCase.bulletHitTimes, 99999);
  assert.equal(blackHoleCase.bulletForceType, 2);
  assert.equal(blackHoleCase.bulletForce, 5);

  const nightBladeDirectCase = getWeaponDirectFireCase(
    "weapon-direct-night-blade-dot-and-shooter-lv1",
  );
  assert.equal(nightBladeDirectCase.weaponId, 28);
  assert.equal(nightBladeDirectCase.weaponLevel, 1);
  assert.equal(nightBladeDirectCase.weaponDirectFireBulletCount, 1);
  assert.equal(nightBladeDirectCase.bulletTypeId, 5);
  assert.equal(nightBladeDirectCase.bulletCount, 10);
  assert.equal(nightBladeDirectCase.bulletSpeed, 700);
  assert.equal(nightBladeDirectCase.bulletDamageJudgeType, 0);
  assert.equal(nightBladeDirectCase.bulletColliderType, 0);
  assert.equal(nightBladeDirectCase.bulletSize, 50);
  assert.equal(nightBladeDirectCase.bulletHitTimes, 99999);
  assert.equal(nightBladeDirectCase.hitBuffId, 4);
  assert.equal(nightBladeDirectCase.hitBuffLevel, 1);

  const eternalSongDirectCase = getWeaponDirectFireCase(
    "weapon-direct-eternal-song-targeted-field-lv1",
  );
  assert.equal(eternalSongDirectCase.weaponId, 30);
  assert.equal(eternalSongDirectCase.weaponLevel, 1);
  assert.equal(eternalSongDirectCase.requiresEnemyTarget, true);
  assert.equal(eternalSongDirectCase.weaponDirectFireBulletCount, 1);
  assert.equal(eternalSongDirectCase.weaponFireCooldownFrames, 180);
  assert.equal(eternalSongDirectCase.bulletTypeId, 60);
  assert.equal(eternalSongDirectCase.bulletAttack, 20);
  assert.equal(eternalSongDirectCase.bulletSpeed, 0);
  assert.equal(eternalSongDirectCase.bulletDamageJudgeType, 1);
  assert.equal(eternalSongDirectCase.bulletHitTargetType, 0);
  assert.equal(eternalSongDirectCase.bulletColliderType, 0);
  assert.equal(eternalSongDirectCase.bulletSize, 300);
  assert.equal(eternalSongDirectCase.bulletLifeTimeFrames, 100);
  assert.equal(eternalSongDirectCase.bulletHitTimes, 99999);
  assert.equal(eternalSongDirectCase.bulletDamageJudgeDelayFrames, 0);
  assert.equal(eternalSongDirectCase.bulletDamageJudgeCooldownFrames, 10);

  const prayerRainDirectCase = getWeaponDirectFireCase(
    "weapon-direct-prayer-rain-targeted-field-lv1",
  );
  assert.equal(prayerRainDirectCase.weaponId, 33);
  assert.equal(prayerRainDirectCase.weaponLevel, 1);
  assert.equal(prayerRainDirectCase.requiresEnemyTarget, true);
  assert.equal(prayerRainDirectCase.weaponDirectFireBulletCount, 1);
  assert.equal(prayerRainDirectCase.weaponFireCooldownFrames, 210);
  assert.equal(prayerRainDirectCase.bulletTypeId, 60);
  assert.equal(prayerRainDirectCase.bulletAttack, 20);
  assert.equal(prayerRainDirectCase.bulletSpeed, 0);
  assert.equal(prayerRainDirectCase.bulletDamageJudgeType, 1);
  assert.equal(prayerRainDirectCase.bulletHitTargetType, 0);
  assert.equal(prayerRainDirectCase.bulletColliderType, 0);
  assert.equal(prayerRainDirectCase.bulletSize, 300);
  assert.equal(prayerRainDirectCase.bulletLifeTimeFrames, 100);
  assert.equal(prayerRainDirectCase.bulletHitTimes, 99999);
  assert.equal(prayerRainDirectCase.bulletDamageJudgeDelayFrames, 0);
  assert.equal(prayerRainDirectCase.bulletDamageJudgeCooldownFrames, 10);

  const dominationBuffCase = getWeaponDirectFireCase(
    "weapon-direct-domination-friendly-buff-lv1",
  );
  assert.equal(dominationBuffCase.weaponId, 27);
  assert.equal(dominationBuffCase.weaponLevel, 1);
  assert.equal(dominationBuffCase.weaponDirectFireBulletCount, 1);
  assert.equal(dominationBuffCase.bulletTypeId, 32);
  assert.equal(dominationBuffCase.bulletCount, 10);
  assert.equal(dominationBuffCase.bulletSpeed, 700);
  assert.equal(dominationBuffCase.bulletDamageJudgeType, 1);
  assert.equal(dominationBuffCase.bulletHitTargetType, 1);
  assert.equal(dominationBuffCase.bulletColliderType, 0);
  assert.equal(dominationBuffCase.bulletSize, 250);
  assert.equal(dominationBuffCase.hitBuffId, 7);
  assert.equal(dominationBuffCase.hitBuffLevel, 1);

  const holyShieldLeftCase = getWeaponDirectFireCase("weapon-direct-holy-shield-left-force");
  assert.equal(holyShieldLeftCase.weaponId, 11);
  assert.equal(holyShieldLeftCase.bulletTypeId, 7);
  assert.equal(holyShieldLeftCase.bulletSpeed, 500);
  assert.equal(holyShieldLeftCase.bulletForceType, 3);
  assert.equal(holyShieldLeftCase.bulletForce, 4);

  const holyShieldRightCase = getWeaponDirectFireCase("weapon-direct-holy-shield-right-force");
  assert.equal(holyShieldRightCase.bulletTypeId, 8);
  assert.equal(holyShieldRightCase.bulletSpeed, 500);
  assert.equal(holyShieldRightCase.bulletForceType, 4);

  const holyShieldDownCase = getWeaponDirectFireCase("weapon-direct-holy-shield-down-force");
  assert.equal(holyShieldDownCase.bulletTypeId, 9);
  assert.equal(holyShieldDownCase.bulletSpeed, 500);
  assert.equal(holyShieldDownCase.bulletForceType, 6);

  const holyShieldUpCase = getWeaponDirectFireCase("weapon-direct-holy-shield-up-force");
  assert.equal(holyShieldUpCase.bulletTypeId, 10);
  assert.equal(holyShieldUpCase.bulletSpeed, 500);
  assert.equal(holyShieldUpCase.bulletForceType, 5);

  const chainsawRayCase = getWeaponDirectFireCase(
    "weapon-direct-chainsaw-owner-forward-ray-lv1",
  );
  assert.equal(chainsawRayCase.weaponId, 12);
  assert.equal(chainsawRayCase.weaponLevel, 1);
  assert.equal(chainsawRayCase.weaponDirectFireBulletCount, 1);
  assert.equal(chainsawRayCase.bulletTypeId, 19);
  assert.equal(chainsawRayCase.bulletSpeed, 0);
  assert.equal(chainsawRayCase.bulletDamageJudgeType, 1);
  assert.equal(chainsawRayCase.bulletColliderType, 2);
  assert.equal(chainsawRayCase.bulletSize, 100);
  assert.equal(chainsawRayCase.bulletSize2, 300);

  const knightFeatherRectCase = getWeaponDirectFireCase(
    "weapon-direct-knight-feather-owner-forward-rect-lv1",
  );
  assert.equal(knightFeatherRectCase.weaponId, 13);
  assert.equal(knightFeatherRectCase.weaponLevel, 1);
  assert.equal(knightFeatherRectCase.weaponDirectFireBulletCount, 1);
  assert.equal(knightFeatherRectCase.bulletTypeId, 20);
  assert.equal(knightFeatherRectCase.bulletSpeed, 0);
  assert.equal(knightFeatherRectCase.bulletDamageJudgeType, 1);
  assert.equal(knightFeatherRectCase.bulletColliderType, 1);
  assert.equal(knightFeatherRectCase.bulletSize, 400);
  assert.equal(knightFeatherRectCase.bulletSize2, 200);

  const courageSongRayCase = getWeaponDirectFireCase(
    "weapon-direct-courage-song-ray-hit-buff-lv1",
  );
  assert.equal(courageSongRayCase.weaponId, 14);
  assert.equal(courageSongRayCase.weaponLevel, 1);
  assert.equal(courageSongRayCase.bulletTypeId, 18);
  assert.equal(courageSongRayCase.bulletDamageJudgeType, 1);
  assert.equal(courageSongRayCase.bulletColliderType, 2);
  assert.equal(courageSongRayCase.bulletSize, 50);
  assert.equal(courageSongRayCase.bulletSize2, 500);
  assert.equal(courageSongRayCase.hitBuffId, 1);
  assert.equal(courageSongRayCase.hitBuffLevel, 1);

  const blizzardFieldCase = getWeaponDirectFireCase(
    "weapon-direct-blizzard-freeze-field-lv1",
  );
  assert.equal(blizzardFieldCase.weaponId, 15);
  assert.equal(blizzardFieldCase.weaponLevel, 1);
  assert.equal(blizzardFieldCase.weaponDirectFireBulletCount, 1);
  assert.equal(blizzardFieldCase.bulletTypeId, 21);
  assert.equal(blizzardFieldCase.bulletSpeed, 0);
  assert.equal(blizzardFieldCase.bulletDamageJudgeType, 1);
  assert.equal(blizzardFieldCase.bulletColliderType, 0);
  assert.equal(blizzardFieldCase.bulletSize, 200);
  assert.equal(blizzardFieldCase.bulletDamageJudgeDelayFrames, 0);
  assert.equal(blizzardFieldCase.bulletDamageJudgeCooldownFrames, 9);
  assert.equal(blizzardFieldCase.hitBuffId, 2);
  assert.equal(blizzardFieldCase.hitBuffLevel, 1);

  const judgementFieldCase = getWeaponDirectFireCase(
    "weapon-direct-judgement-stun-field-lv1",
  );
  assert.equal(judgementFieldCase.weaponId, 17);
  assert.equal(judgementFieldCase.weaponLevel, 1);
  assert.equal(judgementFieldCase.weaponDirectFireBulletCount, 1);
  assert.equal(judgementFieldCase.bulletTypeId, 23);
  assert.equal(judgementFieldCase.bulletSpeed, 0);
  assert.equal(judgementFieldCase.bulletDamageJudgeType, 1);
  assert.equal(judgementFieldCase.bulletColliderType, 0);
  assert.equal(judgementFieldCase.bulletSize, 300);
  assert.equal(judgementFieldCase.bulletDamageJudgeDelayFrames, 15);
  assert.equal(judgementFieldCase.bulletDamageJudgeCooldownFrames, 99999);
  assert.equal(judgementFieldCase.hitBuffId, 3);
  assert.equal(judgementFieldCase.hitBuffLevel, 1);

  const dokidokiFieldCase = getWeaponDirectFireCase(
    "weapon-direct-dokidoki-self-centered-dual-field-lv1",
  );
  assert.equal(dokidokiFieldCase.weaponId, 10);
  assert.equal(dokidokiFieldCase.weaponLevel, 1);
  assert.equal(dokidokiFieldCase.weaponDirectFireBulletCount, 2);
  assert.equal(dokidokiFieldCase.bulletTypeId, 13);
  assert.equal(dokidokiFieldCase.bulletSpeed, 0);
  assert.equal(dokidokiFieldCase.bulletDamageJudgeType, 2);
  assert.equal(dokidokiFieldCase.bulletColliderType, 0);

  const weaponMinionCase = getWeaponMinionCase("weapon-minion-offensive-turret-lv1");
  assert.equal(weaponMinionCase.weaponId, 22);
  assert.equal(weaponMinionCase.weaponLevel, 1);
  assert.equal(weaponMinionCase.weaponType, 1);
  assert.equal(weaponMinionCase.weaponMinionId, 3);
  assert.equal(weaponMinionCase.minionId, 3);
  assert.equal(weaponMinionCase.weaponFireCooldownFrames, 60);
  assert.equal(weaponMinionCase.minionCount, 2);
  assert.equal(weaponMinionCase.spawnMinionId, 0);
  assert.equal(weaponMinionCase.directFireBulletCount, 1);
  assert.equal(weaponMinionCase.bulletTypeId, 33);
  assert.equal(weaponMinionCase.bulletAttack, 10);
  assert.equal(weaponMinionCase.bulletSpeed, 0);
  assert.equal(weaponMinionCase.bulletSize, 100);
  assert.equal(weaponMinionCase.bulletLifeTimeFrames, 20);
  assert.equal(weaponMinionCase.bulletHitTimes, 99999);
  assert.equal(weaponMinionCase.bulletDamageJudgeType, 1);
  assert.equal(weaponMinionCase.bulletColliderType, 2);
  assert.equal(weaponMinionCase.bulletDamageJudgeDelayFrames, 0);
  assert.equal(weaponMinionCase.bulletDamageJudgeCooldownFrames, 10);
  assert.equal(weaponMinionCase.bulletHitTargetType, 0);

  const summonMinionCase = getWeaponMinionCase("weapon-minion-summon-basic-lv1");
  assert.equal(summonMinionCase.weaponId, 16);
  assert.equal(summonMinionCase.weaponLevel, 1);
  assert.equal(summonMinionCase.weaponType, 1);
  assert.equal(summonMinionCase.weaponMinionId, 2);
  assert.equal(summonMinionCase.minionId, 2);
  assert.equal(summonMinionCase.minionCount, 1);
  assert.equal(summonMinionCase.spawnMinionId, 0);
  assert.equal(summonMinionCase.directFireBulletCount, 1);
  assert.equal(summonMinionCase.bulletTypeId, 22);
  assert.equal(summonMinionCase.bulletAttack, 14);
  assert.equal(summonMinionCase.bulletSpeed, 600);
  assert.equal(summonMinionCase.bulletSize, 50);
  assert.equal(summonMinionCase.bulletLifeTimeFrames, 60);
  assert.equal(summonMinionCase.bulletHitTimes, 9999);
  assert.equal(summonMinionCase.bulletHitTargetType, 0);

  const royalGuardMinionCase = getWeaponMinionCase("weapon-minion-royal-guard-spawn-lv1");
  assert.equal(royalGuardMinionCase.weaponId, 32);
  assert.equal(royalGuardMinionCase.weaponLevel, 1);
  assert.equal(royalGuardMinionCase.weaponType, 1);
  assert.equal(royalGuardMinionCase.weaponMinionId, 10);
  assert.equal(royalGuardMinionCase.minionId, 10);
  assert.equal(royalGuardMinionCase.minionAITypeId, 0);
  assert.equal(royalGuardMinionCase.spawnMinionId, 10);
  assert.equal(royalGuardMinionCase.spawnMinionAITypeId, 110);
  assert.equal(royalGuardMinionCase.spawnMinionCount, 1);
  assert.equal(royalGuardMinionCase.spawnMinionFormation, 1);
  assert.equal(royalGuardMinionCase.spawnRadiusMin, 4);
  assert.equal(royalGuardMinionCase.spawnRadiusMax, 5);
  assert.equal(royalGuardMinionCase.directFireBulletCount, 0);
  assert.equal(royalGuardMinionCase.aiStateShooterId, 15000);
  assert.equal(royalGuardMinionCase.aiShooterBulletTypeId, 99);
  assert.equal(royalGuardMinionCase.aiShooterBulletSize, 500);
  assert.equal(royalGuardMinionCase.aiShooterBulletNoDamage, true);
  assert.equal(royalGuardMinionCase.aiShooterBulletHitBuffId, 120);
  assert.equal(royalGuardMinionCase.aiShooterBulletHitBuffLevel, 1);

  const royalGuardLevelUpMinionCase = getWeaponMinionCase(
    "weapon-minion-royal-guard-spawn-level-up-lv2",
  );
  assert.equal(royalGuardLevelUpMinionCase.weaponId, 32);
  assert.equal(royalGuardLevelUpMinionCase.weaponLevel, 2);
  assert.equal(royalGuardLevelUpMinionCase.weaponType, 1);
  assert.equal(royalGuardLevelUpMinionCase.spawnMinionId, 10);
  assert.equal(royalGuardLevelUpMinionCase.spawnMinionAITypeId, 111);
  assert.equal(royalGuardLevelUpMinionCase.aiStateShooterId, 15001);
  assert.equal(royalGuardLevelUpMinionCase.aiShooterBulletTypeId, 99);
  assert.equal(royalGuardLevelUpMinionCase.aiShooterBulletSize, 550);
  assert.equal(royalGuardLevelUpMinionCase.aiShooterBulletNoDamage, true);
  assert.equal(royalGuardLevelUpMinionCase.aiShooterBulletHitBuffId, 120);

  const rotationCase = getShooterRotationCase("boss-shooter-rotation-type-2");
  assert.equal(rotationCase.shooterId, 2100);
  assert.equal(rotationCase.bulletTypeId, 101);
  assert.equal(rotationCase.directionType, 2);
  assert.equal(rotationCase.rotationType, 2);
  assert.equal(rotationCase.bulletDataRotationType, 2);
  assert.equal(rotationCase.bulletHitTargetType, 1);
  assert.equal(rotationCase.expectedDirectionMode, "friendly-target");
  assert.equal(rotationCase.expectedRotationType, 2);

  const onDestroyCase = getShooterOnDestroyCase("shooter-black-hole-on-destroy-event-bullet");
  assert.equal(onDestroyCase.shooterId, 4000);
  assert.equal(onDestroyCase.directionType, 3);
  assert.equal(onDestroyCase.formationOffsetX, 0);
  assert.equal(onDestroyCase.formationOffsetY, 0);
  assert.equal(onDestroyCase.parentBulletTypeId, 99);
  assert.equal(onDestroyCase.parentBulletNoDamage, true);
  assert.equal(onDestroyCase.parentOnDestroyEventBulletId, 1);
  assert.equal(onDestroyCase.childBulletTypeId, 31);
  assert.equal(onDestroyCase.childEventBulletId, 1);
  assert.equal(onDestroyCase.childBulletHitTargetType, 0);
  assert.equal(onDestroyCase.childBulletForceType, 2);
  assert.equal(onDestroyCase.childBulletForce, 5);

  const hostileOnDestroyCase = getShooterOnDestroyCase(
    "shooter-michelle-fist-hostile-on-destroy-event-bullet",
  );
  assert.equal(hostileOnDestroyCase.shooterId, 2002);
  assert.equal(hostileOnDestroyCase.directionType, 2);
  assert.equal(hostileOnDestroyCase.formationOffsetX, 20);
  assert.equal(hostileOnDestroyCase.formationOffsetY, 0);
  assert.equal(hostileOnDestroyCase.parentBulletTypeId, 54);
  assert.equal(hostileOnDestroyCase.parentBulletNoDamage, false);
  assert.equal(hostileOnDestroyCase.parentBulletSpeed, 600);
  assert.equal(hostileOnDestroyCase.parentBulletHitTargetType, 1);
  assert.equal(hostileOnDestroyCase.parentOnDestroyEventBulletId, 1);
  assert.equal(hostileOnDestroyCase.childBulletTypeId, 55);
  assert.equal(hostileOnDestroyCase.childEventBulletId, 1);
  assert.equal(hostileOnDestroyCase.childBulletNoDamage, false);
  assert.equal(hostileOnDestroyCase.childBulletAttack, 3);
  assert.equal(hostileOnDestroyCase.childBulletHitTargetType, 1);
  assert.equal(hostileOnDestroyCase.childBulletLifeTimeFrames, 20);
  assert.equal(hostileOnDestroyCase.childBulletHitTimes, 99999);

  const activeSkillShooterSpawnCase = getActiveSkillShooterSpawnCase(
    "active-skill-chainsaw-god-spawn-pos-3-nearest-enemy",
  );
  assert.equal(activeSkillShooterSpawnCase.activeSkillId, 99);
  assert.equal(activeSkillShooterSpawnCase.activeSkillLevel, 1);
  assert.equal(activeSkillShooterSpawnCase.eventFrame, 1);
  assert.equal(activeSkillShooterSpawnCase.shooterId, 8000);
  assert.equal(activeSkillShooterSpawnCase.shooterSpawnPos, 3);
  assert.equal(activeSkillShooterSpawnCase.bulletTypeId, 58);
  assert.equal(activeSkillShooterSpawnCase.bulletHitTargetType, 0);
  assert.equal(activeSkillShooterSpawnCase.bulletDamageJudgeType, 1);
  assert.equal(activeSkillShooterSpawnCase.bulletForceType, 2);
  assert.equal(activeSkillShooterSpawnCase.bulletForce, 5);

  const elementalBurstShooterCase = getActiveSkillShooterSpawnCase(
    "active-skill-elemental-burst-fan-fireballs-lv1",
  );
  const elementalBurstSnowCase = getActiveSkillShooterSpawnCase(
    "active-skill-elemental-burst-snow-field-lv1",
  );
  assert.equal(elementalBurstShooterCase.activeSkillId, 13);
  assert.equal(elementalBurstShooterCase.activeSkillLevel, 1);
  assert.equal(elementalBurstShooterCase.eventFrame, 1);
  assert.equal(elementalBurstShooterCase.shooterId, 13000);
  assert.equal(elementalBurstShooterCase.shooterSpawnPos, 3);
  assert.equal(elementalBurstShooterCase.shooterLifeTimeFrames, 60);
  assert.equal(elementalBurstShooterCase.shooterEventFrame, 1);
  assert.equal(elementalBurstShooterCase.isLoopEvent, true);
  assert.equal(elementalBurstShooterCase.loopFrameInterval, 15);
  assert.equal(elementalBurstShooterCase.directionType, 1);
  assert.equal(elementalBurstShooterCase.formationType, 0);
  assert.equal(elementalBurstShooterCase.bulletTypeId, 11);
  assert.equal(elementalBurstShooterCase.bulletCount, 4);
  assert.equal(elementalBurstShooterCase.bulletSpeed, 600);
  assert.equal(elementalBurstShooterCase.bulletHitTargetType, 0);
  assert.equal(elementalBurstSnowCase.activeSkillId, 13);
  assert.equal(elementalBurstSnowCase.activeSkillLevel, 1);
  assert.equal(elementalBurstSnowCase.shooterId, elementalBurstShooterCase.shooterId);
  assert.equal(elementalBurstSnowCase.shooterLifeTimeFrames, 60);
  assert.equal(elementalBurstSnowCase.shooterEventFrame, 1);
  assert.equal(elementalBurstSnowCase.isLoopEvent, false);
  assert.equal(elementalBurstSnowCase.loopFrameInterval, 0);
  assert.equal(elementalBurstSnowCase.directionType, 0);
  assert.equal(elementalBurstSnowCase.bulletTypeId, 21);
  assert.equal(elementalBurstSnowCase.bulletCount, 1);
  assert.equal(elementalBurstSnowCase.bulletSpeed, 0);
  assert.equal(elementalBurstSnowCase.bulletHitTargetType, 0);
  assert.equal(elementalBurstSnowCase.bulletDamageJudgeType, 1);

  const endlessStarMapShooterCase = getActiveSkillShooterSpawnCase(
    "active-skill-endless-star-map-owner-forward-field-lv1",
  );
  assert.equal(endlessStarMapShooterCase.activeSkillId, 116);
  assert.equal(endlessStarMapShooterCase.activeSkillLevel, 1);
  assert.equal(endlessStarMapShooterCase.eventFrame, 1);
  assert.equal(endlessStarMapShooterCase.shooterId, 10000);
  assert.equal(endlessStarMapShooterCase.shooterSpawnPos, 0);
  assert.equal(endlessStarMapShooterCase.shooterLifeTimeFrames, 300);
  assert.equal(endlessStarMapShooterCase.shooterEventFrame, 1);
  assert.equal(endlessStarMapShooterCase.directionType, 3);
  assert.equal(endlessStarMapShooterCase.formationType, 0);
  assert.equal(endlessStarMapShooterCase.bulletTypeId, 64);
  assert.equal(endlessStarMapShooterCase.bulletCount, 1);
  assert.equal(endlessStarMapShooterCase.bulletSpeed, 0);
  assert.equal(endlessStarMapShooterCase.bulletNoDamage, false);
  assert.equal(endlessStarMapShooterCase.bulletLifeTimeFrames, 300);
  assert.equal(endlessStarMapShooterCase.bulletAttack, 50);
  assert.equal(endlessStarMapShooterCase.bulletHitTargetType, 0);
  assert.equal(endlessStarMapShooterCase.bulletDamageJudgeType, 0);
  assert.equal(endlessStarMapShooterCase.bulletColliderType, 0);
  assert.equal(endlessStarMapShooterCase.bulletHitTimes, 999);

  const apocalypseSongDamageCase = getActiveSkillShooterSpawnCase(
    "active-skill-apocalypse-song-delayed-damage-lv1",
  );
  assert.equal(apocalypseSongDamageCase.activeSkillId, 14);
  assert.equal(apocalypseSongDamageCase.activeSkillLevel, 1);
  assert.equal(apocalypseSongDamageCase.eventFrame, 90);
  assert.equal(apocalypseSongDamageCase.shooterId, 3001);
  assert.equal(apocalypseSongDamageCase.shooterSpawnPos, 0);
  assert.equal(apocalypseSongDamageCase.shooterLifeTimeFrames, 15);
  assert.equal(apocalypseSongDamageCase.shooterEventFrame, 1);
  assert.equal(apocalypseSongDamageCase.isLoopEvent, false);
  assert.equal(apocalypseSongDamageCase.loopFrameInterval, 0);
  assert.equal(apocalypseSongDamageCase.directionType, 1);
  assert.equal(apocalypseSongDamageCase.bulletTypeId, 99);
  assert.equal(apocalypseSongDamageCase.bulletCount, 1);
  assert.equal(apocalypseSongDamageCase.bulletAttack, 200);
  assert.equal(apocalypseSongDamageCase.bulletSpeed, 0);
  assert.equal(apocalypseSongDamageCase.bulletNoDamage, false);
  assert.equal(apocalypseSongDamageCase.bulletLifeTimeFrames, 90);
  assert.equal(apocalypseSongDamageCase.bulletHitTargetType, 0);
  assert.equal(apocalypseSongDamageCase.bulletDamageJudgeType, 0);
  assert.equal(apocalypseSongDamageCase.bulletColliderType, 0);
  assert.equal(apocalypseSongDamageCase.bulletHitTimes, 999);

  const apocalypseSongStunCase = getActiveSkillShooterHitBuffCase(
    "active-skill-apocalypse-song-stun-field-lv1",
  );
  assert.equal(apocalypseSongStunCase.activeSkillId, 14);
  assert.equal(apocalypseSongStunCase.activeSkillLevel, 1);
  assert.equal(apocalypseSongStunCase.eventFrame, 1);
  assert.equal(apocalypseSongStunCase.shooterId, 3000);
  assert.equal(apocalypseSongStunCase.shooterSpawnPos, 0);
  assert.equal(apocalypseSongStunCase.shooterLifeTimeFrames, 90);
  assert.equal(apocalypseSongStunCase.shooterEventFrame, 1);
  assert.equal(apocalypseSongStunCase.directionType, 3);
  assert.equal(apocalypseSongStunCase.bulletTypeId, 56);
  assert.equal(apocalypseSongStunCase.bulletNoDamage, true);
  assert.equal(apocalypseSongStunCase.bulletHitTargetType, 0);
  assert.equal(apocalypseSongStunCase.bulletDamageJudgeType, 1);
  assert.equal(apocalypseSongStunCase.bulletColliderType, 0);
  assert.equal(apocalypseSongStunCase.bulletSize, 3000);
  assert.equal(apocalypseSongStunCase.bulletHitTimes, 999);
  assert.equal(apocalypseSongStunCase.hitBuffId, 3);
  assert.equal(apocalypseSongStunCase.hitBuffLevel, 1);
  assert.equal(apocalypseSongStunCase.buffType, 2);
  assert.equal(apocalypseSongStunCase.buffDurationFrames, 30);

  const allOutFireFrameThreeCase = getActiveSkillShooterSpawnCase(
    "active-skill-all-out-fire-shooter-frame-3-lv1",
  );
  assert.equal(allOutFireFrameThreeCase.activeSkillId, 112);
  assert.equal(allOutFireFrameThreeCase.activeSkillLevel, 1);
  assert.equal(allOutFireFrameThreeCase.eventFrame, 1);
  assert.equal(allOutFireFrameThreeCase.shooterId, 7000);
  assert.equal(allOutFireFrameThreeCase.shooterSpawnPos, 0);
  assert.equal(allOutFireFrameThreeCase.shooterLifeTimeFrames, 150);
  assert.equal(allOutFireFrameThreeCase.shooterEventFrame, 3);
  assert.equal(allOutFireFrameThreeCase.isLoopEvent, true);
  assert.equal(allOutFireFrameThreeCase.loopFrameInterval, 10);
  assert.equal(allOutFireFrameThreeCase.directionType, 0);
  assert.equal(allOutFireFrameThreeCase.formationOffsetX, 50);
  assert.equal(allOutFireFrameThreeCase.formationOffsetY, 50);
  assert.equal(allOutFireFrameThreeCase.bulletTypeId, 67);
  assert.equal(allOutFireFrameThreeCase.bulletCount, 1);
  assert.equal(allOutFireFrameThreeCase.bulletSpeed, 700);
  assert.equal(allOutFireFrameThreeCase.bulletNoDamage, false);
  assert.equal(allOutFireFrameThreeCase.bulletHitTargetType, 0);

  const allOutFireFrameSevenCase = getActiveSkillShooterSpawnCase(
    "active-skill-all-out-fire-shooter-frame-7-lv1",
  );
  assert.equal(allOutFireFrameSevenCase.activeSkillId, 112);
  assert.equal(allOutFireFrameSevenCase.activeSkillLevel, 1);
  assert.equal(allOutFireFrameSevenCase.eventFrame, 1);
  assert.equal(allOutFireFrameSevenCase.shooterId, 7000);
  assert.equal(allOutFireFrameSevenCase.shooterSpawnPos, 0);
  assert.equal(allOutFireFrameSevenCase.shooterLifeTimeFrames, 150);
  assert.equal(allOutFireFrameSevenCase.shooterEventFrame, 7);
  assert.equal(allOutFireFrameSevenCase.isLoopEvent, true);
  assert.equal(allOutFireFrameSevenCase.loopFrameInterval, 15);
  assert.equal(allOutFireFrameSevenCase.directionType, 0);
  assert.equal(allOutFireFrameSevenCase.formationOffsetX, 100);
  assert.equal(allOutFireFrameSevenCase.formationOffsetY, 0);
  assert.equal(allOutFireFrameSevenCase.bulletTypeId, 68);
  assert.equal(allOutFireFrameSevenCase.bulletCount, 1);
  assert.equal(allOutFireFrameSevenCase.bulletSpeed, 700);
  assert.equal(allOutFireFrameSevenCase.bulletNoDamage, false);
  assert.equal(allOutFireFrameSevenCase.bulletHitTargetType, 0);

  const zesshoCase = getActiveSkillShooterSpawnCase(
    "active-skill-zessho-static-field-lv1",
  );
  assert.equal(zesshoCase.activeSkillId, 114);
  assert.equal(zesshoCase.activeSkillLevel, 1);
  assert.equal(zesshoCase.eventFrame, 1);
  assert.equal(zesshoCase.shooterId, 1001);
  assert.equal(zesshoCase.shooterSpawnPos, 0);
  assert.equal(zesshoCase.shooterLifeTimeFrames, 60);
  assert.equal(zesshoCase.shooterBehaviorType, 0);
  assert.equal(zesshoCase.shooterFollowsOwnerDirection, false);
  assert.equal(zesshoCase.shooterEventFrame, 1);
  assert.equal(zesshoCase.isLoopEvent, false);
  assert.equal(zesshoCase.loopFrameInterval, 0);
  assert.equal(zesshoCase.directionType, 1);
  assert.equal(zesshoCase.bulletTypeId, 99);
  assert.equal(zesshoCase.bulletCount, 1);
  assert.equal(zesshoCase.bulletAttack, 333);
  assert.equal(zesshoCase.bulletSpeed, 0);
  assert.equal(zesshoCase.bulletNoDamage, false);
  assert.equal(zesshoCase.bulletLifeTimeFrames, 15);
  assert.equal(zesshoCase.bulletHitTargetType, 0);
  assert.equal(zesshoCase.bulletDamageJudgeType, 1);
  assert.equal(zesshoCase.bulletColliderType, 0);
  assert.equal(zesshoCase.bulletHitTimes, 99999);

  const absoluteGuardShooterCase = getActiveSkillShooterHitBuffCase(
    "active-skill-absolute-guard-shooter-friendly-invincible-buff",
  );
  assert.equal(absoluteGuardShooterCase.activeSkillId, 117);
  assert.equal(absoluteGuardShooterCase.activeSkillLevel, 1);
  assert.equal(absoluteGuardShooterCase.eventFrame, 1);
  assert.equal(absoluteGuardShooterCase.shooterId, 11000);
  assert.equal(absoluteGuardShooterCase.bulletTypeId, 65);
  assert.equal(absoluteGuardShooterCase.bulletNoDamage, true);
  assert.equal(absoluteGuardShooterCase.bulletHitTargetType, 1);
  assert.equal(absoluteGuardShooterCase.bulletDamageJudgeType, 1);
  assert.equal(absoluteGuardShooterCase.bulletColliderType, 1);
  assert.equal(absoluteGuardShooterCase.hitBuffId, 108);
  assert.equal(absoluteGuardShooterCase.hitBuffLevel, 1);
  assert.equal(absoluteGuardShooterCase.buffType, 9);
  assert.equal(absoluteGuardShooterCase.buffDurationFrames, 30);

  const dokiDokiShooterCase = getActiveSkillShooterHitBuffCase(
    "active-skill-kirakira-dokidoki-delayed-stun-field",
  );
  assert.equal(dokiDokiShooterCase.activeSkillId, 16);
  assert.equal(dokiDokiShooterCase.activeSkillLevel, 1);
  assert.equal(dokiDokiShooterCase.eventFrame, 1);
  assert.equal(dokiDokiShooterCase.shooterId, 9000);
  assert.equal(dokiDokiShooterCase.shooterSpawnPos, 0);
  assert.equal(dokiDokiShooterCase.shooterLifeTimeFrames, 60);
  assert.equal(dokiDokiShooterCase.bulletTypeId, 59);
  assert.equal(dokiDokiShooterCase.bulletNoDamage, false);
  assert.equal(dokiDokiShooterCase.bulletHitTargetType, 0);
  assert.equal(dokiDokiShooterCase.bulletDamageJudgeType, 0);
  assert.equal(dokiDokiShooterCase.bulletDamageJudgeDelayFrames, 21);
  assert.equal(dokiDokiShooterCase.bulletColliderType, 0);
  assert.equal(dokiDokiShooterCase.bulletSize, 1000);
  assert.equal(dokiDokiShooterCase.hitBuffId, 18);
  assert.equal(dokiDokiShooterCase.hitBuffLevel, 1);
  assert.equal(dokiDokiShooterCase.buffType, 2);
  assert.equal(dokiDokiShooterCase.buffDurationFrames, 150);

  const aiActionCase = getAIActionCase("ai-boss-cat-creates-shooter-2100");
  assert.equal(aiActionCase.aiTypeId, 66);
  assert.equal(aiActionCase.firstStateId, 1);
  assert.equal(aiActionCase.firstStateLastFrame, 30);
  assert.equal(aiActionCase.firstStateNextStateId, 2);
  assert.equal(aiActionCase.firstStateNextProbability, 100);
  assert.equal(aiActionCase.stateId, 2);
  assert.equal(aiActionCase.bulletFireCooldownFrames, 30);
  assert.equal(aiActionCase.fireBulletCount, 0);
  assert.equal(aiActionCase.shooterId, 2100);
  assert.equal(aiActionCase.shooterEventFrame, 7);
  assert.equal(aiActionCase.shooterDirectionType, 2);
  assert.equal(aiActionCase.shooterRotationType, 2);
  assert.equal(aiActionCase.shooterFormationOffsetX, 20);
  assert.equal(aiActionCase.shooterFormationOffsetY, 0);
  assert.equal(aiActionCase.shooterBulletTypeId, 101);
  assert.equal(aiActionCase.shooterBulletDataRotationType, 2);
  assert.equal(aiActionCase.shooterBulletHitTargetType, 1);

  const hydraActionCase = getAIActionCase(
    "ai-hydra-creates-friendly-target-fireball-shooter-2001",
  );
  assert.equal(hydraActionCase.aiTypeId, 28);
  assert.equal(hydraActionCase.firstStateId, 1);
  assert.equal(hydraActionCase.firstStateLastFrame, 30);
  assert.equal(hydraActionCase.firstStateNextStateId, 2);
  assert.equal(hydraActionCase.firstStateNextProbability, 100);
  assert.equal(hydraActionCase.stateId, 2);
  assert.equal(hydraActionCase.lastFrame, 20);
  assert.equal(hydraActionCase.bulletFireCooldownFrames, 30);
  assert.equal(hydraActionCase.fireBulletCount, 0);
  assert.equal(hydraActionCase.shooterId, 2001);
  assert.equal(hydraActionCase.shooterEventFrame, 8);
  assert.equal(hydraActionCase.shooterDirectionType, 2);
  assert.equal(hydraActionCase.shooterRotationType, 0);
  assert.equal(hydraActionCase.shooterFormationOffsetX, 250);
  assert.equal(hydraActionCase.shooterFormationOffsetY, 100);
  assert.equal(hydraActionCase.shooterBulletTypeId, 53);
  assert.equal(hydraActionCase.shooterBulletDataRotationType, 1);
  assert.equal(hydraActionCase.shooterBulletCount, 1);
  assert.equal(hydraActionCase.shooterBulletSpeed, 600);
  assert.equal(hydraActionCase.shooterBulletHitTargetType, 1);

  const longHydraActionCase = getAIActionCase(
    "ai-hydra-creates-long-timeline-fireball-shooter-2000",
  );
  assert.equal(longHydraActionCase.aiTypeId, 29);
  assert.equal(longHydraActionCase.firstStateId, 1);
  assert.equal(longHydraActionCase.firstStateLastFrame, 30);
  assert.equal(longHydraActionCase.firstStateNextStateId, 5);
  assert.equal(longHydraActionCase.firstStateNextProbability, 100);
  assert.equal(longHydraActionCase.stateId, 5);
  assert.equal(longHydraActionCase.lastFrame, 60);
  assert.equal(longHydraActionCase.bulletFireCooldownFrames, 0);
  assert.equal(longHydraActionCase.fireBulletCount, 0);
  assert.equal(longHydraActionCase.shooterId, 2000);
  assert.equal(longHydraActionCase.shooterEventCount, 11);
  assert.equal(longHydraActionCase.shooterLastEventFrame, 59);
  assert.equal(longHydraActionCase.shooterEventFrame, 8);
  assert.equal(longHydraActionCase.shooterDirectionType, 2);
  assert.equal(longHydraActionCase.shooterRotationType, 0);
  assert.equal(longHydraActionCase.shooterFormationOffsetX, 250);
  assert.equal(longHydraActionCase.shooterFormationOffsetY, 100);
  assert.equal(longHydraActionCase.shooterBulletTypeId, 53);
  assert.equal(longHydraActionCase.shooterBulletDataRotationType, 1);
  assert.equal(longHydraActionCase.shooterBulletCount, 1);
  assert.equal(longHydraActionCase.shooterBulletSpeed, 600);
  assert.equal(longHydraActionCase.shooterBulletHitTargetType, 1);

  const aiTimelineCase = getAIStateTimelineCase("ai-michelle-laser-fire-bullet-now-frame-15");
  assert.equal(aiTimelineCase.aiTypeId, 44);
  assert.equal(aiTimelineCase.stateId, 3);
  assert.equal(aiTimelineCase.fireEventFrame, 15);
  assert.equal(aiTimelineCase.fireBulletNow, true);
  assert.equal(aiTimelineCase.fireAllWeaponNow, false);
  assert.equal(aiTimelineCase.bulletTypeId, 99);
  assert.equal(aiTimelineCase.bulletHitTargetType, 1);
  assert.equal(aiTimelineCase.bulletDamageJudgeType, 1);
  assert.equal(aiTimelineCase.bulletColliderType, 2);
  assert.equal(aiTimelineCase.bulletSize, 50);
  assert.equal(aiTimelineCase.bulletSize2, 900);
  assert.equal(aiTimelineCase.bulletAttack, 1);

  const aiFireAllWeaponCase = getAIStateFireAllWeaponCase(
    "ai-leo-minion-fire-all-weapon-frame-20",
  );
  assert.equal(aiFireAllWeaponCase.aiTypeId, 103);
  assert.equal(aiFireAllWeaponCase.stateId, 2);
  assert.equal(aiFireAllWeaponCase.fireEventFrame, 20);
  assert.equal(aiFireAllWeaponCase.fireBulletNow, false);
  assert.equal(aiFireAllWeaponCase.fireAllWeaponNow, true);
  assert.equal(aiFireAllWeaponCase.stateFireBulletCount, 0);
  assert.equal(aiFireAllWeaponCase.stateShooterId, 0);
  assert.equal(aiFireAllWeaponCase.minionId, 4);
  assert.equal(aiFireAllWeaponCase.minionAITypeId, 103);
  assert.equal(aiFireAllWeaponCase.weaponId, 26);
  assert.equal(aiFireAllWeaponCase.weaponLevel, 1);
  assert.equal(aiFireAllWeaponCase.weaponFireCooldownFrames, 9999999);
  assert.equal(aiFireAllWeaponCase.bulletTypeId, 34);
  assert.equal(aiFireAllWeaponCase.bulletHitTargetType, 0);

  const aiShooterSpawnCase = getAIStateShooterSpawnCase(
    "ai-archangel-shooter-spawn-pos-1-player-laser",
  );
  assert.equal(aiShooterSpawnCase.aiTypeId, 32);
  assert.equal(aiShooterSpawnCase.stateId, 4);
  assert.equal(aiShooterSpawnCase.stateType, 30);
  assert.equal(aiShooterSpawnCase.shooterId, 1);
  assert.equal(aiShooterSpawnCase.shooterSpawnPos, 1);
  assert.equal(aiShooterSpawnCase.eventFrame, 1);
  assert.equal(aiShooterSpawnCase.directionType, 1);
  assert.equal(aiShooterSpawnCase.bulletTypeId, 52);
  assert.equal(aiShooterSpawnCase.bulletHitTargetType, 1);
  assert.equal(aiShooterSpawnCase.bulletDamageJudgeDelayFrames, 15);

  const aiNoCollidingCase = getAIStateNoCollidingCase(
    "ai-moon-cat-teleport-no-colliding-frame-1",
  );
  assert.equal(aiNoCollidingCase.aiTypeId, 26);
  assert.equal(aiNoCollidingCase.stateId, 2);
  assert.equal(aiNoCollidingCase.noCollidingEventFrame, 1);
  assert.equal(aiNoCollidingCase.noColliding, true);
  assert.equal(aiNoCollidingCase.fireBulletNow, false);

  const aiTeleportCase = getAIStateTeleportCase("ai-moon-cat-black-cat-teleport-frame-30");
  assert.equal(aiTeleportCase.aiTypeId, 26);
  assert.equal(aiTeleportCase.stateId, 2);
  assert.equal(aiTeleportCase.stateType, 12);
  assert.equal(aiTeleportCase.teleportEventFrame, 30);
  assert.equal(aiTeleportCase.teleportEventName, "teleport");
  assert.equal(aiTeleportCase.fireEventFrame, 46);
  assert.equal(aiTeleportCase.normalEventFrame, 60);
  assert.equal(aiTeleportCase.normalEventName, "normal");
  assert.equal(aiTeleportCase.nextStateId, 1);
  assert.equal(aiTeleportCase.bulletTypeId, 51);
  assert.equal(aiTeleportCase.bulletCount, 6);

  const aiRandomMovementCase = getAIStateMovementCase("ai-random-move-around-player-state");
  assert.equal(aiRandomMovementCase.aiTypeId, 5);
  assert.equal(aiRandomMovementCase.stateId, 2);
  assert.equal(aiRandomMovementCase.stateType, 2);
  assert.equal(aiRandomMovementCase.nextStateId, 1);
  assert.equal(aiRandomMovementCase.isFireBullet, true);
  assert.equal(aiRandomMovementCase.fireBulletCount, 1);
  assert.equal(aiRandomMovementCase.bulletTypeId, 51);

  const aiRollAttackCase = getAIStateMovementCase("ai-golem-roll-attack-state-speed");
  assert.equal(aiRollAttackCase.aiTypeId, 6);
  assert.equal(aiRollAttackCase.stateId, 2);
  assert.equal(aiRollAttackCase.stateType, 10);
  assert.equal(aiRollAttackCase.stateLastFrame, 30);
  assert.equal(aiRollAttackCase.stateMoveSpeed, 600);
  assert.equal(aiRollAttackCase.stateMoveSpeedRandomMax, 0);
  assert.equal(aiRollAttackCase.stateMoveOffsetX, 0);
  assert.equal(aiRollAttackCase.stateMoveOffsetY, 0);
  assert.equal(aiRollAttackCase.syncDirectionFromTarget, false);
  assert.equal(aiRollAttackCase.nextStateId, 1);
  assert.equal(aiRollAttackCase.isFireBullet, false);
  assert.equal(aiRollAttackCase.fireBulletCount, 1);
  assert.equal(aiRollAttackCase.bulletTypeId, 51);

  const aiFlashAttackCase = getAIStateMovementCase("ai-samurai-flash-attack-state");
  assert.equal(aiFlashAttackCase.aiTypeId, 7);
  assert.equal(aiFlashAttackCase.stateId, 2);
  assert.equal(aiFlashAttackCase.stateType, 11);
  assert.equal(aiFlashAttackCase.stateLastFrame, 30);
  assert.equal(aiFlashAttackCase.stateMoveSpeed, 0);
  assert.equal(aiFlashAttackCase.stateMoveSpeedRandomMax, 0);
  assert.equal(aiFlashAttackCase.stateMoveOffsetX, 0);
  assert.equal(aiFlashAttackCase.stateMoveOffsetY, 0);
  assert.equal(aiFlashAttackCase.syncDirectionFromTarget, false);
  assert.equal(aiFlashAttackCase.nextStateId, 3);
  assert.equal(aiFlashAttackCase.isFireBullet, false);
  assert.equal(aiFlashAttackCase.fireBulletCount, 1);
  assert.equal(aiFlashAttackCase.bulletTypeId, 51);

  const aiCatBossAttackCase = getAIStateMovementCase("ai-cat-boss-attack-bullet-rain-state");
  assert.equal(aiCatBossAttackCase.aiTypeId, 27);
  assert.equal(aiCatBossAttackCase.stateId, 2);
  assert.equal(aiCatBossAttackCase.stateType, 13);
  assert.equal(aiCatBossAttackCase.stateLastFrame, 60);
  assert.equal(aiCatBossAttackCase.nextStateId, 1);
  assert.equal(aiCatBossAttackCase.isFireBullet, true);
  assert.equal(aiCatBossAttackCase.fireBulletCount, 1);
  assert.equal(aiCatBossAttackCase.bulletTypeId, 51);

  const aiAncientGolemJumpUpCase = getAIStateMovementCase(
    "ai-ancient-golem-jump-up-offset-state",
  );
  assert.equal(aiAncientGolemJumpUpCase.aiTypeId, 38);
  assert.equal(aiAncientGolemJumpUpCase.stateId, 4);
  assert.equal(aiAncientGolemJumpUpCase.stateType, 31);
  assert.equal(aiAncientGolemJumpUpCase.stateLastFrame, 15);
  assert.equal(aiAncientGolemJumpUpCase.stateMoveSpeed, 2000);
  assert.equal(aiAncientGolemJumpUpCase.stateMoveOffsetX, 0);
  assert.equal(aiAncientGolemJumpUpCase.stateMoveOffsetY, 1000);
  assert.equal(aiAncientGolemJumpUpCase.nextStateId, 5);
  assert.equal(aiAncientGolemJumpUpCase.isFireBullet, false);

  const aiAncientGolemJumpLandCase = getAIStateMovementCase(
    "ai-ancient-golem-jump-land-offset-state",
  );
  assert.equal(aiAncientGolemJumpLandCase.aiTypeId, 38);
  assert.equal(aiAncientGolemJumpLandCase.stateId, 5);
  assert.equal(aiAncientGolemJumpLandCase.stateType, 32);
  assert.equal(aiAncientGolemJumpLandCase.stateLastFrame, 30);
  assert.equal(aiAncientGolemJumpLandCase.stateMoveSpeed, 2000);
  assert.equal(aiAncientGolemJumpLandCase.stateMoveOffsetX, 0);
  assert.equal(aiAncientGolemJumpLandCase.stateMoveOffsetY, 1000);
  assert.equal(aiAncientGolemJumpLandCase.nextStateId, 6);
  assert.equal(aiAncientGolemJumpLandCase.isFireBullet, false);

  const aiAncientGolemJumpLandBuffCase = getAIStateBuffCase(
    "ai-ancient-golem-jump-land-defense-debuff",
  );
  assert.equal(aiAncientGolemJumpLandBuffCase.aiTypeId, 38);
  assert.equal(aiAncientGolemJumpLandBuffCase.stateId, 5);
  assert.equal(aiAncientGolemJumpLandBuffCase.buffId, 101);
  assert.equal(aiAncientGolemJumpLandBuffCase.buffLevel, 1);
  assert.equal(aiAncientGolemJumpLandBuffCase.buffType, 1);
  assert.equal(aiAncientGolemJumpLandBuffCase.buffDurationFrames, 120);
  assert.equal(aiAncientGolemJumpLandBuffCase.buffAttributes[0]?.attributeType, 3);
  assert.equal(aiAncientGolemJumpLandBuffCase.buffAttributes[0]?.value, -500);

  const aiAncientGolemWeakBuffCase = getAIStateBuffCase(
    "ai-ancient-golem-weak-defense-debuff",
  );
  assert.equal(aiAncientGolemWeakBuffCase.aiTypeId, 38);
  assert.equal(aiAncientGolemWeakBuffCase.stateId, 6);
  assert.equal(aiAncientGolemWeakBuffCase.buffId, 101);
  assert.equal(aiAncientGolemWeakBuffCase.buffDurationFrames, 120);

  const aiTimeEyeBuffCase = getAIStateBuffCase("ai-time-eye-appearance-continuous-change");
  assert.equal(aiTimeEyeBuffCase.aiTypeId, 41);
  assert.equal(aiTimeEyeBuffCase.stateId, 1);
  assert.equal(aiTimeEyeBuffCase.buffId, 102);
  assert.equal(aiTimeEyeBuffCase.buffType, 8);
  assert.equal(aiTimeEyeBuffCase.buffDurationFrames, 6000);
  assert.equal(aiTimeEyeBuffCase.buffAttributes[0]?.attributeType, 14);
  assert.equal(aiTimeEyeBuffCase.buffAttributes[0]?.value, 1);

  const aiArchangelWaitingCommonStateCase = getAIStateCommonStateCase(
    "ai-archangel-waiting-common-state",
  );
  assert.equal(aiArchangelWaitingCommonStateCase.aiTypeId, 32);
  assert.equal(aiArchangelWaitingCommonStateCase.stateId, 1);
  assert.equal(aiArchangelWaitingCommonStateCase.changesEntityCommonState, true);
  assert.equal(aiArchangelWaitingCommonStateCase.entityCommonStateChangeTo, 1);

  const aiArchangelStartupCommonStateCase = getAIStateCommonStateCase(
    "ai-archangel-startup-common-state",
  );
  assert.equal(aiArchangelStartupCommonStateCase.aiTypeId, 32);
  assert.equal(aiArchangelStartupCommonStateCase.stateId, 2);
  assert.equal(aiArchangelStartupCommonStateCase.changesEntityCommonState, true);
  assert.equal(aiArchangelStartupCommonStateCase.entityCommonStateChangeTo, 0);

  const aiAncientGolemLandingAnimationCase = getAIStateAnimationCase(
    "ai-ancient-golem-landing-restart-animation",
  );
  assert.equal(aiAncientGolemLandingAnimationCase.aiTypeId, 38);
  assert.equal(aiAncientGolemLandingAnimationCase.stateId, 5);
  assert.equal(aiAncientGolemLandingAnimationCase.playAnimeName, "Skill1-2");
  assert.equal(aiAncientGolemLandingAnimationCase.restartsAnimation, true);

  const aiBlackCatTimelineAnimationCase = getAIStateAnimationCase(
    "ai-black-cat-teleport-timeline-animation",
  );
  assert.equal(aiBlackCatTimelineAnimationCase.aiTypeId, 26);
  assert.equal(aiBlackCatTimelineAnimationCase.stateId, 2);
  assert.equal(aiBlackCatTimelineAnimationCase.playAnimeName, "walk");
  assert.equal(aiBlackCatTimelineAnimationCase.restartsAnimation, false);
  assert.equal(aiBlackCatTimelineAnimationCase.timelineEventFrame, 1);
  assert.equal(aiBlackCatTimelineAnimationCase.timelinePlayAnimeName, "skill-miss");

  const aiMichelleOffsetMoveCase = getAIStateMovementCase(
    "ai-michelle-laser-offset-move-state",
  );
  assert.equal(aiMichelleOffsetMoveCase.aiTypeId, 44);
  assert.equal(aiMichelleOffsetMoveCase.stateId, 2);
  assert.equal(aiMichelleOffsetMoveCase.stateType, 33);
  assert.equal(aiMichelleOffsetMoveCase.stateLastFrame, 30);
  assert.equal(aiMichelleOffsetMoveCase.stateMoveSpeed, 900);
  assert.equal(aiMichelleOffsetMoveCase.stateMoveOffsetX, -300);
  assert.equal(aiMichelleOffsetMoveCase.stateMoveOffsetY, 0);
  assert.equal(aiMichelleOffsetMoveCase.nextStateId, 3);
  assert.equal(aiMichelleOffsetMoveCase.isFireBullet, false);

  const aiClawMachineOffsetMoveCase = getAIStateMovementCase(
    "ai-claw-machine-drop-offset-move-state",
  );
  assert.equal(aiClawMachineOffsetMoveCase.aiTypeId, 80);
  assert.equal(aiClawMachineOffsetMoveCase.stateId, 10);
  assert.equal(aiClawMachineOffsetMoveCase.stateType, 31);
  assert.equal(aiClawMachineOffsetMoveCase.stateLastFrame, 30);
  assert.equal(aiClawMachineOffsetMoveCase.stateMoveSpeed, 500);
  assert.equal(aiClawMachineOffsetMoveCase.stateMoveOffsetX, 0);
  assert.equal(aiClawMachineOffsetMoveCase.stateMoveOffsetY, -500);
  assert.equal(aiClawMachineOffsetMoveCase.nextStateId, 11);
  assert.equal(aiClawMachineOffsetMoveCase.syncDirectionFromTarget, true);
  assert.equal(aiClawMachineOffsetMoveCase.isFireBullet, false);

  const aiClawMachineReturnTriggerCase = getAIStateMovementCase(
    "ai-claw-machine-return-offset-trigger-state",
  );
  assert.equal(aiClawMachineReturnTriggerCase.aiTypeId, 80);
  assert.equal(aiClawMachineReturnTriggerCase.stateId, 13);
  assert.equal(aiClawMachineReturnTriggerCase.stateType, 31);
  assert.equal(aiClawMachineReturnTriggerCase.stateLastFrame, 30);
  assert.equal(aiClawMachineReturnTriggerCase.stateMoveSpeed, 500);
  assert.equal(aiClawMachineReturnTriggerCase.stateMoveOffsetX, 0);
  assert.equal(aiClawMachineReturnTriggerCase.stateMoveOffsetY, 500);
  assert.equal(aiClawMachineReturnTriggerCase.nextStateId, 1);
  assert.equal(aiClawMachineReturnTriggerCase.syncDirectionFromTarget, true);
  assert.equal(aiClawMachineReturnTriggerCase.triggerLevelEventId, 1);
  assert.equal(aiClawMachineReturnTriggerCase.isFireBullet, false);

  const aiClawMachineTypeTwoTriggerCase = getAIStateMovementCase(
    "ai-claw-machine-type-two-trigger-return-state",
  );
  assert.equal(aiClawMachineTypeTwoTriggerCase.aiTypeId, 80);
  assert.equal(aiClawMachineTypeTwoTriggerCase.stateId, 33);
  assert.equal(aiClawMachineTypeTwoTriggerCase.stateType, 31);
  assert.equal(aiClawMachineTypeTwoTriggerCase.stateLastFrame, 30);
  assert.equal(aiClawMachineTypeTwoTriggerCase.stateMoveSpeed, 500);
  assert.equal(aiClawMachineTypeTwoTriggerCase.stateMoveOffsetX, 0);
  assert.equal(aiClawMachineTypeTwoTriggerCase.stateMoveOffsetY, 500);
  assert.equal(aiClawMachineTypeTwoTriggerCase.nextStateId, 1);
  assert.equal(aiClawMachineTypeTwoTriggerCase.syncDirectionFromTarget, true);
  assert.equal(aiClawMachineTypeTwoTriggerCase.triggerLevelEventId, 3);
  assert.equal(aiClawMachineTypeTwoTriggerCase.isFireBullet, false);

  const holyMendCase = getActiveSkillBuffCase("active-skill-holy-mend-heal-invincible-revive");
  assert.equal(holyMendCase.activeSkillId, 12);
  assert.equal(holyMendCase.activeSkillLevel, 1);
  assert.equal(holyMendCase.eventFrame, 1);
  assert.deepEqual(holyMendCase.buffs.map((buff) => buff.buffId), [106, 104, 105]);
  assert.deepEqual(holyMendCase.buffs.map((buff) => buff.buffType), [12, 9, 11]);
  assert.equal(holyMendCase.buffs.find((buff) => buff.buffId === 104)?.buffDurationFrames, 60);
  assert.equal(holyMendCase.buffs.find((buff) => buff.buffId === 105)?.buffValue, 1000);
  assert.ok(holyMendCase.buffs.every((buff) => buff.targetType === 1));

  const fairyGuardCase = getActiveSkillBuffCase("active-skill-fairy-guard-targets-player-side");
  assert.equal(fairyGuardCase.activeSkillId, 15);
  assert.equal(fairyGuardCase.activeSkillLevel, 1);
  assert.equal(fairyGuardCase.eventFrame, 1);
  assert.deepEqual(fairyGuardCase.buffs.map((buff) => buff.buffId), [11, 13]);
  assert.deepEqual(fairyGuardCase.buffs.map((buff) => buff.buffType), [1, 9]);
  assert.ok(fairyGuardCase.buffs.every((buff) => buff.targetType === 1));
  assert.equal(
    fairyGuardCase.buffs.find((buff) => buff.buffId === 11)
      ?.attributes.find((attribute) => attribute.attributeType === CN_NFO_ATTRIBUTE_TYPE.bulletSize)
      ?.value,
    50,
  );

  const kingOfBeastsSummonCase = getActiveSkillSummonCase(
    "active-skill-king-of-beasts-formation-2-roar-minions-lv2",
  );
  assert.equal(kingOfBeastsSummonCase.activeSkillId, 111);
  assert.equal(kingOfBeastsSummonCase.activeSkillLevel, 2);
  assert.equal(kingOfBeastsSummonCase.eventFrame, 1);
  assert.equal(kingOfBeastsSummonCase.shooterId, 0);
  assert.equal(kingOfBeastsSummonCase.minionId, 9);
  assert.equal(kingOfBeastsSummonCase.minionAITypeId, 209);
  assert.equal(kingOfBeastsSummonCase.minionAIStateId, 0);
  assert.equal(kingOfBeastsSummonCase.minionAIStateType, 21);
  assert.equal(kingOfBeastsSummonCase.minionAIStateLastFrame, 15);
  assert.equal(kingOfBeastsSummonCase.minionAINextStateId, 1);
  assert.equal(kingOfBeastsSummonCase.minionAINextStateType, 0);
  assert.equal(kingOfBeastsSummonCase.minionAINextStateShooterId, 14001);
  assert.equal(kingOfBeastsSummonCase.minionAINextStateShooterEventFrame, 1);
  assert.equal(kingOfBeastsSummonCase.minionAINextStateShooterBulletTypeId, 34);
  assert.equal(kingOfBeastsSummonCase.minionAINextStateShooterBulletAttack, 150);
  assert.equal(kingOfBeastsSummonCase.minionAINextStateShooterBulletSpeed, 0);
  assert.equal(kingOfBeastsSummonCase.minionAINextStateShooterBulletSize, 1100);
  assert.equal(kingOfBeastsSummonCase.minionAINextStateShooterBulletHitBuffId, 3);
  assert.equal(kingOfBeastsSummonCase.spawnFormation, 2);
  assert.equal(kingOfBeastsSummonCase.spawnCount, 3);
  assert.equal(kingOfBeastsSummonCase.spawnRadiusMin, 400);
  assert.equal(kingOfBeastsSummonCase.spawnRadiusMax, 400);
  assert.equal(kingOfBeastsSummonCase.expectedFirstPassRadius, 400);

  const allOutFireSummonCase = getActiveSkillSummonCase(
    "active-skill-all-out-fire-shooter-and-minion-lv1",
  );
  assert.equal(allOutFireSummonCase.activeSkillId, 112);
  assert.equal(allOutFireSummonCase.activeSkillLevel, 1);
  assert.equal(allOutFireSummonCase.eventFrame, 1);
  assert.equal(allOutFireSummonCase.shooterId, 7000);
  assert.equal(allOutFireSummonCase.shooterSpawnPos, 0);
  assert.equal(allOutFireSummonCase.shooterLifeTimeFrames, 150);
  assert.equal(allOutFireSummonCase.shooterFollowsOwnerDirection, true);
  assert.equal(allOutFireSummonCase.shooterEventFrame, 1);
  assert.equal(allOutFireSummonCase.shooterDirectionType, 0);
  assert.equal(allOutFireSummonCase.shooterFormationOffsetY, 100);
  assert.equal(allOutFireSummonCase.shooterBulletTypeId, 66);
  assert.equal(allOutFireSummonCase.shooterBulletSpeed, 700);
  assert.equal(allOutFireSummonCase.shooterBulletHitTargetType, 0);
  assert.equal(allOutFireSummonCase.minionId, 8);
  assert.equal(allOutFireSummonCase.minionAITypeId, 205);
  assert.equal(allOutFireSummonCase.minionAIStateId, 0);
  assert.equal(allOutFireSummonCase.minionAIStateType, 22);
  assert.equal(allOutFireSummonCase.minionAIStateShooterId, 7003);
  assert.equal(allOutFireSummonCase.minionAIStateShooterEventFrame, 1);
  assert.equal(allOutFireSummonCase.minionAIStateShooterDirectionType, 0);
  assert.equal(allOutFireSummonCase.minionAIStateShooterFormationType, 0);
  assert.equal(allOutFireSummonCase.minionAIStateShooterFormationOffsetX, 0);
  assert.equal(allOutFireSummonCase.minionAIStateShooterFormationOffsetY, 0);
  assert.equal(allOutFireSummonCase.minionAIStateShooterBulletTypeId, 68);
  assert.equal(allOutFireSummonCase.minionAIStateShooterBulletSpeed, 700);
  assert.equal(allOutFireSummonCase.weaponId, 0);
  assert.equal(allOutFireSummonCase.weaponLevel, 0);
  assert.equal(allOutFireSummonCase.spawnFormation, 1);
  assert.equal(allOutFireSummonCase.spawnCount, 1);
  assert.equal(allOutFireSummonCase.spawnRadiusMin, 250);
  assert.equal(allOutFireSummonCase.spawnRadiusMax, 250);
  assert.equal(allOutFireSummonCase.expectedFirstPassRadius, 250);

  const allOutFireMiddleSummonCase = getActiveSkillSummonCase(
    "active-skill-all-out-fire-middle-minion-lv3",
  );
  assert.equal(allOutFireMiddleSummonCase.activeSkillId, 112);
  assert.equal(allOutFireMiddleSummonCase.activeSkillLevel, 3);
  assert.equal(allOutFireMiddleSummonCase.eventIndex, 1);
  assert.equal(allOutFireMiddleSummonCase.eventFrame, 1);
  assert.equal(allOutFireMiddleSummonCase.sameFrameSpawnMinionEventCount, 3);
  assert.equal(allOutFireMiddleSummonCase.shooterId, 0);
  assert.equal(allOutFireMiddleSummonCase.minionId, 8);
  assert.equal(allOutFireMiddleSummonCase.minionAITypeId, 206);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateId, 0);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateType, 22);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterId, 7004);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterLifeTimeFrames, 160);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterEventFrame, 1);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterIsLoopEvent, true);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterLoopFrameInterval, 7);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterDirectionType, 0);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterFormationType, 0);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterFormationOffsetX, 0);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterFormationOffsetY, 0);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterBulletTypeId, 69);
  assert.equal(allOutFireMiddleSummonCase.minionAIStateShooterBulletSpeed, 700);
  assert.equal(allOutFireMiddleSummonCase.spawnFormation, 1);
  assert.equal(allOutFireMiddleSummonCase.spawnCount, 1);
  assert.equal(allOutFireMiddleSummonCase.spawnCenterOffsetX, 0);
  assert.equal(allOutFireMiddleSummonCase.spawnCenterOffsetY, 0);
  assert.equal(allOutFireMiddleSummonCase.spawnRadiusMin, 250);
  assert.equal(allOutFireMiddleSummonCase.spawnRadiusMax, 250);
  assert.equal(allOutFireMiddleSummonCase.expectedFirstPassRadius, 250);

  const allOutFireOffsetSummonCase = getActiveSkillSummonCase(
    "active-skill-all-out-fire-offset-minion-lv3",
  );
  assert.equal(allOutFireOffsetSummonCase.activeSkillId, 112);
  assert.equal(allOutFireOffsetSummonCase.activeSkillLevel, 3);
  assert.equal(allOutFireOffsetSummonCase.eventIndex, 2);
  assert.equal(allOutFireOffsetSummonCase.eventFrame, 1);
  assert.equal(allOutFireOffsetSummonCase.sameFrameSpawnMinionEventCount, 3);
  assert.equal(allOutFireOffsetSummonCase.shooterId, 0);
  assert.equal(allOutFireOffsetSummonCase.minionId, 8);
  assert.equal(allOutFireOffsetSummonCase.minionAITypeId, 207);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateId, 0);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateType, 22);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterId, 7005);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterLifeTimeFrames, 160);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterEventFrame, 1);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterIsLoopEvent, true);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterLoopFrameInterval, 7);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterDirectionType, 0);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterFormationType, 0);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterFormationOffsetX, 0);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterFormationOffsetY, 0);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterBulletTypeId, 70);
  assert.equal(allOutFireOffsetSummonCase.minionAIStateShooterBulletSpeed, 700);
  assert.equal(allOutFireOffsetSummonCase.spawnFormation, 1);
  assert.equal(allOutFireOffsetSummonCase.spawnCount, 1);
  assert.equal(allOutFireOffsetSummonCase.spawnCenterOffsetX, 250);
  assert.equal(allOutFireOffsetSummonCase.spawnCenterOffsetY, 250);
  assert.equal(allOutFireOffsetSummonCase.spawnRadiusMin, 1);
  assert.equal(allOutFireOffsetSummonCase.spawnRadiusMax, 1);
  assert.equal(allOutFireOffsetSummonCase.expectedFirstPassRadius, 1);

  const galaxySummonCase = getActiveSkillSummonCase(
    "active-skill-galaxy-star-ring-summon-lv1",
  );
  assert.equal(galaxySummonCase.activeSkillId, 113);
  assert.equal(galaxySummonCase.activeSkillLevel, 1);
  assert.equal(galaxySummonCase.eventFrame, 1);
  assert.equal(galaxySummonCase.minionId, 7);
  assert.equal(galaxySummonCase.minionAITypeId, 201);
  assert.equal(galaxySummonCase.minionAIStateId, 0);
  assert.equal(galaxySummonCase.minionAIStateType, 22);
  assert.equal(galaxySummonCase.minionAIStateShooterId, 4000);
  assert.equal(galaxySummonCase.minionAIStateShooterBulletTypeId, 99);
  assert.equal(galaxySummonCase.spawnFormation, 1);
  assert.equal(galaxySummonCase.spawnCount, 3);
  assert.equal(galaxySummonCase.spawnRadiusMin, 400);
  assert.equal(galaxySummonCase.spawnRadiusMax, 600);
  assert.equal(galaxySummonCase.expectedFirstPassRadius, 500);

  const anonPhantomSummonCase = getActiveSkillSummonCase(
    "active-skill-anon-phantom-ring-summon-lv2",
  );
  assert.equal(anonPhantomSummonCase.activeSkillId, 115);
  assert.equal(anonPhantomSummonCase.activeSkillLevel, 2);
  assert.equal(anonPhantomSummonCase.eventFrame, 1);
  assert.equal(anonPhantomSummonCase.minionId, 5);
  assert.equal(anonPhantomSummonCase.minionAITypeId, 102);
  assert.equal(anonPhantomSummonCase.weaponId, 28);
  assert.equal(anonPhantomSummonCase.weaponLevel, 8);
  assert.equal(anonPhantomSummonCase.spawnFormation, 2);
  assert.equal(anonPhantomSummonCase.spawnCount, 2);
  assert.equal(anonPhantomSummonCase.spawnRadiusMin, 400);
  assert.equal(anonPhantomSummonCase.spawnRadiusMax, 400);
  assert.equal(anonPhantomSummonCase.expectedFirstPassRadius, 400);

  const itemCases = [
    ["item-exp-small", 1, 0, 10, 600, true],
    ["item-bomb", 4, 1, 0, 600, false],
    ["item-magnet", 5, 2, 0, 600, false],
    ["item-level-up", 6, 3, 0, 600, false],
    ["item-heal-small", 7, 4, 5, 999999, true],
    ["item-coin-one", 10, 5, 1, 600, true],
  ] as const;
  for (const [
    id,
    itemId,
    itemType,
    value,
    lifetimeFrames,
    canBeMagneted,
  ] of itemCases) {
    const itemCase = getItemCase(id);
    assert.equal(itemCase.itemId, itemId);
    assert.equal(itemCase.itemType, itemType);
    assert.equal(itemCase.value, value);
    assert.equal(itemCase.lifetimeFrames, lifetimeFrames);
    assert.equal(itemCase.canBeMagneted, canBeMagneted);
  }

  const minorEnemyDropCase = getDropCase("drop-minor-enemy-exp-small-coin");
  assert.equal(minorEnemyDropCase.dropId, 102);
  assert.equal(minorEnemyDropCase.dropName, "小怪掉落");
  assert.equal(minorEnemyDropCase.itemCount, 2);
  assert.deepEqual(
    minorEnemyDropCase.items.map((item) => [
      item.itemId,
      item.dropRate,
      item.itemType,
      item.itemValue,
      item.itemLifetimeFrames,
      item.itemCanBeMagneted,
    ]),
    [
      [1, 1000, 0, 10, 600, true],
      [10, 20, 5, 1, 600, true],
    ],
  );

  const commonDropCase = getDropCase("drop-common-bomb-magnet-heal");
  assert.equal(commonDropCase.dropId, 20);
  assert.equal(commonDropCase.dropName, "关卡共通默认掉落");
  assert.equal(commonDropCase.itemCount, 3);
  assert.deepEqual(
    commonDropCase.items.map((item) => [
      item.itemId,
      item.dropRate,
      item.itemType,
      item.itemValue,
      item.itemLifetimeFrames,
      item.itemCanBeMagneted,
    ]),
    [
      [4, 10, 1, 0, 600, false],
      [5, 10, 2, 0, 600, false],
      [7, 10, 4, 5, 999999, true],
    ],
  );

  const plainSlimeSpawnCase = getLevelEnemySpawnCase("level-plain-first-slime-wave");
  assert.equal(plainSlimeSpawnCase.levelId, 1);
  assert.equal(plainSlimeSpawnCase.levelName, "平原");
  assert.equal(plainSlimeSpawnCase.commonDropId, 20);
  assert.equal(plainSlimeSpawnCase.eventIndex, 1);
  assert.equal(plainSlimeSpawnCase.eventName, "刷怪 0:0-0:30 史莱姆 lv1 ");
  assert.equal(plainSlimeSpawnCase.startFrame, 5);
  assert.equal(plainSlimeSpawnCase.totalFrames, 900);
  assert.equal(plainSlimeSpawnCase.enemyTypeId, 1);
  assert.equal(plainSlimeSpawnCase.enemyName, "1_史莱姆");
  assert.equal(plainSlimeSpawnCase.enemyLevel, 1);
  assert.equal(plainSlimeSpawnCase.enemyAiTypeId, 1);
  assert.equal(plainSlimeSpawnCase.spawnType, 1);
  assert.equal(plainSlimeSpawnCase.spawnCenterType, 0);
  assert.equal(plainSlimeSpawnCase.spawnWaveCount, 5);
  assert.equal(plainSlimeSpawnCase.spawnWaveIntervalFrames, 60);
  assert.equal(plainSlimeSpawnCase.spawnRangeMin, 13);
  assert.equal(plainSlimeSpawnCase.spawnRangeMax, 20);
  assert.equal(plainSlimeSpawnCase.spawnCenterOffsetX, 0);
  assert.equal(plainSlimeSpawnCase.spawnCenterOffsetY, 0);
  assert.equal(plainSlimeSpawnCase.dropId, 1);
  assert.equal(plainSlimeSpawnCase.programControl, true);
  assert.equal(plainSlimeSpawnCase.enemyMaxHp, 10);
  assert.equal(plainSlimeSpawnCase.enemyAttack, 1);
  assert.equal(plainSlimeSpawnCase.enemyDefense, 0);
  assert.equal(plainSlimeSpawnCase.enemySpeed, 200);
  assert.equal(plainSlimeSpawnCase.enemyColliderRadius, 50);

  const anniversaryCatBossCase = getLevelEnemySpawnCase(
    "level-anniversary-stage-fixed-cat-boss",
  );
  assert.equal(anniversaryCatBossCase.levelId, 28);
  assert.equal(anniversaryCatBossCase.levelName, "周年舞台");
  assert.equal(anniversaryCatBossCase.commonDropId, 0);
  assert.equal(anniversaryCatBossCase.eventIndex, 1);
  assert.equal(anniversaryCatBossCase.eventName, "猫boss1");
  assert.equal(anniversaryCatBossCase.startFrame, 1800);
  assert.equal(anniversaryCatBossCase.totalFrames, 5);
  assert.equal(anniversaryCatBossCase.enemyTypeId, 66);
  assert.equal(anniversaryCatBossCase.enemyLevel, 1);
  assert.equal(anniversaryCatBossCase.enemyAiTypeId, 66);
  assert.equal(anniversaryCatBossCase.spawnType, 1);
  assert.equal(anniversaryCatBossCase.spawnCenterType, 1);
  assert.equal(anniversaryCatBossCase.spawnWaveCount, 1);
  assert.equal(anniversaryCatBossCase.spawnWaveIntervalFrames, 30);
  assert.equal(anniversaryCatBossCase.spawnRangeMin, 0);
  assert.equal(anniversaryCatBossCase.spawnRangeMax, 0);
  assert.equal(anniversaryCatBossCase.spawnCenterOffsetX, -3);
  assert.equal(anniversaryCatBossCase.spawnCenterOffsetY, 4);
  assert.equal(anniversaryCatBossCase.dropId, 100);
  assert.equal(anniversaryCatBossCase.programControl, false);
  assert.equal(anniversaryCatBossCase.enemyMaxHp, 60000);
  assert.equal(anniversaryCatBossCase.enemyAttack, 3);
  assert.equal(anniversaryCatBossCase.enemyDefense, 1);
  assert.equal(anniversaryCatBossCase.enemySpeed, 200);
  assert.equal(anniversaryCatBossCase.enemyColliderRadius, 200);

  const skyIslandKnightRingCase = getLevelEnemySpawnCase(
    "level-sky-island-knight-ring-wave",
  );
  assert.equal(skyIslandKnightRingCase.levelId, 15);
  assert.equal(skyIslandKnightRingCase.levelName, "天空岛");
  assert.equal(skyIslandKnightRingCase.commonDropId, 0);
  assert.equal(skyIslandKnightRingCase.eventIndex, 16);
  assert.equal(skyIslandKnightRingCase.eventName, "3:00 骑士圈lv1");
  assert.equal(skyIslandKnightRingCase.startFrame, 5400);
  assert.equal(skyIslandKnightRingCase.totalFrames, 10);
  assert.equal(skyIslandKnightRingCase.enemyTypeId, 30);
  assert.equal(skyIslandKnightRingCase.enemyName, "30_圣骑士");
  assert.equal(skyIslandKnightRingCase.enemyLevel, 1);
  assert.equal(skyIslandKnightRingCase.enemyAiTypeId, 1);
  assert.equal(skyIslandKnightRingCase.spawnType, 2);
  assert.equal(skyIslandKnightRingCase.spawnCenterType, 0);
  assert.equal(skyIslandKnightRingCase.spawnWaveCount, 20);
  assert.equal(skyIslandKnightRingCase.spawnWaveIntervalFrames, 13);
  assert.equal(skyIslandKnightRingCase.spawnRangeMin, 14);
  assert.equal(skyIslandKnightRingCase.spawnRangeMax, 15);
  assert.equal(skyIslandKnightRingCase.spawnCenterOffsetX, 0);
  assert.equal(skyIslandKnightRingCase.spawnCenterOffsetY, 0);
  assert.equal(skyIslandKnightRingCase.dropId, 101);
  assert.equal(skyIslandKnightRingCase.programControl, false);
  assert.equal(skyIslandKnightRingCase.enemyMaxHp, 1000);
  assert.equal(skyIslandKnightRingCase.enemyAttack, 6);
  assert.equal(skyIslandKnightRingCase.enemyDefense, 1);
  assert.equal(skyIslandKnightRingCase.enemySpeed, 100);
  assert.equal(skyIslandKnightRingCase.enemyColliderRadius, 100);

  const worldEndClearCase = getLevelClearCase(
    "level-world-end-clear-type-two-post-timer-spawns",
  );
  assert.equal(worldEndClearCase.levelId, 11);
  assert.equal(worldEndClearCase.clearType, 2);
  assert.equal(worldEndClearCase.totalFrames, 18000);
  assert.equal(worldEndClearCase.clearCoin, 1000);
  assert.equal(worldEndClearCase.clearEnemyEventId, 0);
  assert.deepEqual(worldEndClearCase.clearMinorEnemyEventIds, []);
  assert.deepEqual(worldEndClearCase.clearUnlockLevelIds, []);
  assert.deepEqual(worldEndClearCase.clearUnlockWeaponIds, []);
  assert.deepEqual(worldEndClearCase.clearUnlockEquipIds, []);
  assert.deepEqual(worldEndClearCase.clearUnlockCharacterIds, []);
  assert.equal(worldEndClearCase.postTotalFrameEnemyEventCount, 4);
  assert.equal(worldEndClearCase.earliestPostTotalFrameEnemyEventStartFrame, 18000);
  assert.equal(worldEndClearCase.clearEnemySpawnEventCount, 0);
  assert.equal(worldEndClearCase.earliestClearEnemySpawnStartFrame, 0);

  const pilipalaClearCase = getLevelClearCase(
    "level-pilipala-company-clear-type-two-post-timer-spawns",
  );
  assert.equal(pilipalaClearCase.levelId, 13);
  assert.equal(pilipalaClearCase.clearType, 2);
  assert.equal(pilipalaClearCase.totalFrames, 18000);
  assert.equal(pilipalaClearCase.clearCoin, 1000);
  assert.equal(pilipalaClearCase.clearEnemyEventId, 1);
  assert.deepEqual(pilipalaClearCase.clearMinorEnemyEventIds, []);
  assert.deepEqual(pilipalaClearCase.clearUnlockLevelIds, []);
  assert.deepEqual(pilipalaClearCase.clearUnlockWeaponIds, []);
  assert.deepEqual(pilipalaClearCase.clearUnlockEquipIds, []);
  assert.deepEqual(pilipalaClearCase.clearUnlockCharacterIds, []);
  assert.equal(pilipalaClearCase.postTotalFrameEnemyEventCount, 10);
  assert.equal(pilipalaClearCase.earliestPostTotalFrameEnemyEventStartFrame, 18000);
  assert.equal(pilipalaClearCase.clearEnemySpawnEventCount, 0);
  assert.equal(pilipalaClearCase.earliestClearEnemySpawnStartFrame, 0);

  for (const clearEnemyCaseId of [
    "level-sky-island-final-boss-clear-event",
    "level-claw-machine-final-boss-clear-event",
    "level-anniversary-final-boss-clear-event",
  ]) {
    const clearEnemyCase = getLevelClearCase(clearEnemyCaseId);
    assert.equal(clearEnemyCase.clearType, 1);
    assert.equal(clearEnemyCase.totalFrames, 18000);
    assert.equal(clearEnemyCase.clearCoin, 1000);
    assert.equal(clearEnemyCase.clearEnemyEventId, 1);
    assert.equal(clearEnemyCase.clearEnemySpawnEventCount, 1);
    assert.equal(clearEnemyCase.earliestClearEnemySpawnStartFrame, 18000);
    if (clearEnemyCase.id === "level-claw-machine-final-boss-clear-event") {
      assert.deepEqual(clearEnemyCase.clearMinorEnemyEventIds, [100]);
      assert.deepEqual(clearEnemyCase.clearUnlockLevelIds, [28]);
      assert.deepEqual(clearEnemyCase.clearUnlockWeaponIds, []);
      assert.deepEqual(clearEnemyCase.clearUnlockEquipIds, []);
      assert.deepEqual(clearEnemyCase.clearUnlockCharacterIds, []);
      assert.equal(clearEnemyCase.clearMinorEnemySpawnEventCount, 1);
      assert.equal(clearEnemyCase.earliestClearMinorEnemySpawnStartFrame, 2);
    } else if (clearEnemyCase.id === "level-sky-island-final-boss-clear-event") {
      assert.deepEqual(clearEnemyCase.clearMinorEnemyEventIds, []);
      assert.deepEqual(clearEnemyCase.clearUnlockLevelIds, [16]);
      assert.deepEqual(clearEnemyCase.clearUnlockWeaponIds, []);
      assert.deepEqual(clearEnemyCase.clearUnlockEquipIds, []);
      assert.deepEqual(clearEnemyCase.clearUnlockCharacterIds, [113, 114]);
      assert.equal(clearEnemyCase.clearMinorEnemySpawnEventCount, 0);
      assert.equal(clearEnemyCase.earliestClearMinorEnemySpawnStartFrame, 0);
    } else {
      assert.deepEqual(clearEnemyCase.clearMinorEnemyEventIds, []);
      assert.deepEqual(clearEnemyCase.clearUnlockLevelIds, []);
      assert.deepEqual(clearEnemyCase.clearUnlockWeaponIds, []);
      assert.deepEqual(clearEnemyCase.clearUnlockEquipIds, []);
      assert.deepEqual(clearEnemyCase.clearUnlockCharacterIds, []);
      assert.equal(clearEnemyCase.clearMinorEnemySpawnEventCount, 0);
      assert.equal(clearEnemyCase.earliestClearMinorEnemySpawnStartFrame, 0);
    }
  }

  const clawMachineTriggerCase = getLevelEventTriggerCase(
    "level-claw-machine-trigger-type-two-boss-chain",
  );
  assert.equal(clawMachineTriggerCase.levelId, 27);
  assert.equal(clawMachineTriggerCase.levelName, "娃娃机");
  assert.equal(clawMachineTriggerCase.triggerType, 2);
  assert.equal(clawMachineTriggerCase.triggerEnemyEventId, 0);
  assert.equal(clawMachineTriggerCase.triggeredEventCount, 12);
  assert.equal(clawMachineTriggerCase.firstEventIndex, 27);
  assert.equal(clawMachineTriggerCase.firstEventId, 3);
  assert.equal(clawMachineTriggerCase.firstEventStartFrame, 5400);
  assert.equal(clawMachineTriggerCase.firstEnemyTypeId, 21);
  assert.equal(clawMachineTriggerCase.lastEventIndex, 38);
  assert.equal(clawMachineTriggerCase.lastEventId, 14);
  assert.equal(clawMachineTriggerCase.lastEventStartFrame, 18000);
  assert.equal(clawMachineTriggerCase.lastEnemyTypeId, 44);

  const skyIslandAIStateChangeCase = getLevelAIStateChangeCase(
    "level-sky-island-final-boss-ai-state-change",
  );
  assert.equal(skyIslandAIStateChangeCase.levelId, 15);
  assert.equal(skyIslandAIStateChangeCase.eventIndex, 24);
  assert.equal(skyIslandAIStateChangeCase.targetSpawnEventIndex, 23);
  assert.equal(skyIslandAIStateChangeCase.startFrame, 18005);
  assert.equal(skyIslandAIStateChangeCase.totalFrames, 5);
  assert.equal(skyIslandAIStateChangeCase.targetEnemyEventId, 1);
  assert.equal(skyIslandAIStateChangeCase.targetAIStateId, 2);
  assert.equal(skyIslandAIStateChangeCase.targetEnemyTypeId, 32);
  assert.equal(skyIslandAIStateChangeCase.targetEnemyAITypeId, 32);

  const clawMachineAIStateChangeCase = getLevelAIStateChangeCase(
    "level-claw-machine-boss-ai-state-change",
  );
  assert.equal(clawMachineAIStateChangeCase.levelId, 27);
  assert.equal(clawMachineAIStateChangeCase.eventIndex, 14);
  assert.equal(clawMachineAIStateChangeCase.targetSpawnEventIndex, 11);
  assert.equal(clawMachineAIStateChangeCase.startFrame, 1800);
  assert.equal(clawMachineAIStateChangeCase.totalFrames, 2);
  assert.equal(clawMachineAIStateChangeCase.targetEnemyEventId, 100);
  assert.equal(clawMachineAIStateChangeCase.targetAIStateId, 30);
  assert.equal(clawMachineAIStateChangeCase.targetEnemyTypeId, 80);
  assert.equal(clawMachineAIStateChangeCase.targetEnemyAITypeId, 80);

  assert.equal(fixture.selectedMapCases.length, 7);
  for (const mapExpectation of [
    {
      id: "map-09-terrain-pits-and-prefab-bounds",
      levelId: 14,
      mapId: 14,
      prefabName: "Map_09",
      pitCount: 246,
      firstPit: [16, -37],
      prefabLayers: 3,
      prefabTileCount: 12866,
      prefabBounds: [-55, -50, 56, 53],
      terrainBounds: [-42, -37, 43, 42],
    },
    {
      id: "map-10-terrain-pits-and-prefab-bounds",
      levelId: 15,
      mapId: 15,
      prefabName: "Map_10",
      pitCount: 1316,
      firstPit: [29, -42],
      prefabLayers: 2,
      prefabTileCount: 20789,
      prefabBounds: [-74, -62, 76, 66],
      terrainBounds: [-54, -42, 46, 48],
    },
    {
      id: "map-11-terrain-pits-and-prefab-bounds",
      levelId: 16,
      mapId: 16,
      prefabName: "Map_11",
      pitCount: 7739,
      firstPit: [-42, -58],
      prefabLayers: 3,
      prefabTileCount: 25859,
      prefabBounds: [-66, -62, 64, 66],
      terrainBounds: [-53, -58, 59, 56],
    },
    {
      id: "map-12-terrain-pits-and-prefab-bounds",
      levelId: 17,
      mapId: 17,
      prefabName: "Map_12",
      pitCount: 1783,
      firstPit: [11, -59],
      prefabLayers: 2,
      prefabTileCount: 18682,
      prefabBounds: [-66, -62, 64, 66],
      terrainBounds: [-61, -59, 58, 63],
    },
    {
      id: "map-13-terrain-pits-and-prefab-bounds",
      levelId: 18,
      mapId: 18,
      prefabName: "Map_13",
      pitCount: 6941,
      firstPit: [-61, -58],
      prefabLayers: 2,
      prefabTileCount: 23840,
      prefabBounds: [-66, -62, 64, 66],
      terrainBounds: [-61, -58, 57, 61],
    },
    {
      id: "map-14-terrain-pits-and-prefab-bounds",
      levelId: 27,
      mapId: 27,
      prefabName: "Map_14",
      pitCount: 948,
      firstPit: [44, -61],
      prefabLayers: 2,
      prefabTileCount: 17589,
      prefabBounds: [-64, -62, 64, 66],
      terrainBounds: [-63, -61, 62, 63],
    },
    {
      id: "map-15-terrain-pits-and-prefab-bounds",
      levelId: 28,
      mapId: 28,
      prefabName: "Map_15",
      pitCount: 2146,
      firstPit: [-39, -42],
      prefabLayers: 2,
      prefabTileCount: 13332,
      prefabBounds: [-55, -48, 57, 50],
      terrainBounds: [-47, -42, 47, 50],
    },
  ] as const) {
    const mapCase = getMapCase(mapExpectation.id);
    assert.equal(mapCase.levelId, mapExpectation.levelId);
    assert.equal(mapCase.mapId, mapExpectation.mapId);
    assert.equal(mapCase.mapPrefabName, mapExpectation.prefabName);
    assert.equal(mapCase.pitCount, mapExpectation.pitCount);
    assert.equal(mapCase.wallCount, 0);
    assert.deepEqual([mapCase.firstPitX, mapCase.firstPitY], mapExpectation.firstPit);
    assert.equal(mapCase.prefabLayerCount, mapExpectation.prefabLayers);
    assert.equal(mapCase.prefabTileCount, mapExpectation.prefabTileCount);
    assert.deepEqual(
      [
        mapCase.prefabBoundsMinX,
        mapCase.prefabBoundsMinY,
        mapCase.prefabBoundsMaxX,
        mapCase.prefabBoundsMaxY,
      ],
      mapExpectation.prefabBounds,
    );
    assert.equal(mapCase.terrainLayerTileCount, mapCase.pitCount);
    assert.deepEqual(
      [
        mapCase.terrainLayerBoundsMinX,
        mapCase.terrainLayerBoundsMinY,
        mapCase.terrainLayerBoundsMaxX,
        mapCase.terrainLayerBoundsMaxY,
      ],
      mapExpectation.terrainBounds,
    );
  }

  testCnDirectionZeroShooter(runtimeData);
  testCnDirectionOneRadialShooter(runtimeData);
  testCnWeaponLevelShooter(runtimeData);
  testCnWeaponLevelUpSwitchesShooter(runtimeData);
  testCnWeaponShooterFormationTypeThreeRotatesWithOwnerDirection(runtimeData);
  testCnWeaponShooterDirectionOffsetAngle(runtimeData);
  testCnWeaponShooterAllDirectionRadial(runtimeData);
  testCnWeaponLevelFriendlyHitBuff(runtimeData);
  testCnWeaponShooterPrayerRainBuffs(runtimeData);
  testCnWeaponShooterFollowsOwnerPositionAndDirection(runtimeData);
  testCnWeaponDirectFireFireballTargetedFan(runtimeData);
  testCnWeaponDirectFireTargetlessMultiBullet(runtimeData);
  testCnWeaponDarkOrbHomingRetargetsNearestEnemy(runtimeData);
  testCnWeaponGuardianSongBulletsOrbitPlayer(runtimeData);
  testCnWeaponDirectFireTargetedRayRequiresEnemy(runtimeData);
  testCnWeaponDirectFireDarkSummonTargetedProjectile(runtimeData);
  testCnWeaponDirectFireHurricaneDualBullet(runtimeData);
  testCnWeaponDirectFireKnightBladeTargetlessField(runtimeData);
  testCnWeaponDirectFireSelfCenteredWithoutEnemyTarget(runtimeData);
  testCnWeaponDirectFireIaiDualFieldTiming(runtimeData);
  testCnWeaponDirectFireCardinalForceDirections(runtimeData);
  testCnWeaponDirectFireOwnerForwardRay(runtimeData);
  testCnWeaponDirectFireOwnerForwardRect(runtimeData);
  testCnWeaponDirectFireDamageJudgeNoneForce(runtimeData);
  testCnWeaponDirectFireRayHitBuff(runtimeData);
  testCnWeaponDirectFireFreezeField(runtimeData);
  testCnWeaponDirectFireStunField(runtimeData);
  testCnWeaponDirectFireDotHitBuff(runtimeData);
  testCnWeaponDirectFireGroupTiming(runtimeData);
  testCnWeaponDirectFireBlackHoleInwardForce(runtimeData);
  testCnWeaponDirectFireAndShooterCombined(runtimeData);
  testCnWeaponDirectFireSongFieldsWithShooters(runtimeData);
  testCnWeaponDirectFireFriendlyBuff(runtimeData);
  testCnWeaponSelfBuffFloatingShieldContactCharges(runtimeData);
  testCnWeaponSelfBuffCounterContactBullet(runtimeData);
  testCnWeaponSelfBuffStealthAttributes(runtimeData);
  testCnWeaponBasicSummonMinionFiresFromMinion(runtimeData);
  testCnWeaponFairyMinionFiresFromMinion(runtimeData);
  testCnWeaponLeoMinionWaitsForAIWeaponGate(runtimeData);
  testCnWeaponLevelMinionCount(runtimeData);
  testCnWeaponLevelSpawnMinionData(runtimeData);
  testCnWeaponSpawnMinionLevelUpSwitchesAI(runtimeData);
  testCnShooterDirectionTwoFriendlyTargetAndRotation(runtimeData);
  testCnShooterOnDestroyEventBullet(runtimeData);
  testCnActiveSkillShooterSpawnPosThreeNearestEnemy(runtimeData);
  testCnActiveSkillElementalBurstFanShooter(runtimeData);
  testCnActiveSkillApocalypseSongDelayedDamageShooter(runtimeData);
  testCnActiveSkillZesshoStaticFieldShooter(runtimeData);
  testCnActiveSkillEndlessStarMapOwnerForwardField(runtimeData);
  testCnActiveSkillAbsoluteGuardShooterFriendlyInvincibleBuff(runtimeData);
  testCnActiveSkillKiraKiraDokiDokiDelayedStunField(runtimeData);
  testCnAIDataCreatesBossShooter(runtimeData);
  testCnAIDataCreatesHydraFriendlyTargetFireballShooter(runtimeData);
  testCnAIDataCreatesLongHydraTimelineShooter(runtimeData);
  testCnAIStateTimelineFireBulletNow(runtimeData);
  testCnAIStateFireAllWeaponNow(runtimeData);
  testCnAIStateShooterSpawnPosOne(runtimeData);
  testCnAIStateNoColliding(runtimeData);
  testCnAIStateBlackCatTeleportTimeline(runtimeData);
  testCnAIStateMoveToRandomPositionAroundPlayer(runtimeData);
  testCnAIStateGolemRollAttackUsesStateMoveSpeed(runtimeData);
  testCnAIStateSamuraiFlashAttackMovesNearPlayer(runtimeData);
  testCnAIStateCatBossAttackCreatesBulletRain(runtimeData);
  testCnAIStateOffsetMovementUsesStateMoveOffset(runtimeData);
  testCnAIStateEntryBuffsApplyToEnemy(runtimeData);
  testCnAIStateCommonStateChangesApplyToEnemy(runtimeData);
  testCnAIStateAnimationMetadataAppliesToEnemy(runtimeData);
  testCnAIStateTriggerLevelEventSpawnsTriggeredLevelEvent(runtimeData);
  testCnActiveSkillHolyMendHealInvincibleAndRevive(runtimeData);
  testCnActiveSkillFairyGuardTargetsPlayerSideMinions(runtimeData);
  testCnActiveSkillKingOfBeastsMinionAITransitionShooter(runtimeData);
  testCnActiveSkillAllOutFireShooterAndMinion(runtimeData);
  testCnActiveSkillAllOutFireLevelThreeMultiSummon(runtimeData);
  testCnActiveSkillGalaxyStarRingSummon(runtimeData);
  testCnActiveSkillAnonPhantomRingSummon(runtimeData);
  testCnDropDataEnemyKillSpawnsAndCollectsExp(runtimeData);
  testCnLevelEnemySpawnWave(runtimeData);
  testCnLevelEnemySpawnCenterOffset(runtimeData);
  testCnLevelEnemySpawnTypeRing(runtimeData);
  testCnLevelClearTypeTwoDoesNotAutoSettleByTimer(runtimeData);
  testCnLevelClearEnemyEventWaitsForFinalBossDefeat(runtimeData);
  testCnLevelClearRewardsApplyToSave(runtimeData);
  testCnLevelAIStateChangeEventTargetsTaggedEnemy(runtimeData);
  testCnMapTerrainPitBlocking(runtimeData);

  console.log("ok - CN NFO parity fixture facts match frozen data");
  console.log("ok - CN active shooter direction 0 uses event offset direction");
  console.log("ok - CN active shooter direction 1 spreads radially and honors loop/lifetime");
  console.log("ok - CN weapon level BulletShooterID spawns shooter timeline bullets");
  console.log("ok - CN weapon level-up switches BulletShooterID before firing");
  console.log("ok - CN weapon shooter formation type 3 rotates with owner direction");
  console.log("ok - CN weapon shooter direction offset angle rotates nearest-enemy fire");
  console.log("ok - CN weapon Night Blade shooter frame-30 event spreads all-direction bullets");
  console.log("ok - CN weapon Eternal Song shooter applies friendly hit buff");
  console.log("ok - CN weapon Prayer Rain shooter slows enemy movement and applies friendly buffs");
  console.log("ok - CN weapon shooter BehaviorType 1 follows owner position and direction");
  console.log("ok - CN weapon Fireball level 2 fires a targeted two-shot fan");
  console.log("ok - CN player-only moving multi-bullet weapons fire without an enemy target");
  console.log("ok - CN weapon Dark Orb retargets moving orbs toward the nearest enemy");
  console.log("ok - CN weapon Guardian Song bullets orbit the player");
  console.log("ok - CN weapon Apocalypse Light targeted ray waits for an enemy target");
  console.log("ok - CN weapon Dark Summon targeted projectile waits for an enemy target");
  console.log("ok - CN weapon Hurricane dual direct bullets keep the same target direction");
  console.log("ok - CN weapon Knight Blade targetless melee field damages overlaps");
  console.log("ok - CN weapon DokiDoki self-centered fields fire without an enemy target");
  console.log("ok - CN weapon Iai fires instant and delayed targetless fields");
  console.log("ok - CN weapon Holy Shield cardinal force bullets fire without an enemy target");
  console.log("ok - CN weapon Chainsaw owner-forward ray ignores enemies behind the player");
  console.log("ok - CN weapon Knight Feather rect stays owner-forward");
  console.log("ok - CN weapon direct fire DamageJudgeType None still applies force");
  console.log("ok - CN weapon Courage Song ray fires targetless and stays owner-forward");
  console.log("ok - CN weapon Blizzard field fires targetless and applies freeze");
  console.log("ok - CN weapon Judgement field fires targetless and applies stun");
  console.log("ok - CN weapon Six Star direct fire applies DOT hit buff");
  console.log("ok - CN weapon Galaxy Light uses GroupCount and FireGroupCD timing");
  console.log("ok - CN weapon Black Hole direct field applies inward force");
  console.log("ok - CN weapon Night Blade combines direct DOT bullets and shooter timeline");
  console.log("ok - CN song weapons combine targeted field bullet 60 and shooter timelines");
  console.log("ok - CN weapon Domination direct fire applies friendly buff");
  console.log("ok - CN weapon Floating Shield self-buff absorbs contact charges");
  console.log("ok - CN weapon Counter self-buff absorbs contact and fires bullet 27");
  console.log("ok - CN weapon Stealth self-buff applies attributes and fires BuffData bullet");
  console.log("ok - CN weapon Summon creates a minion that fires from its own position");
  console.log("ok - CN weapon Fairy minion fires bullet 29 from its own position");
  console.log("ok - CN weapon Leo minion waits for AI FireAllWeaponNow before bullet 34");
  console.log("ok - CN weapon level MinionCount creates multiple firing minions");
  console.log("ok - CN weapon level spawnMinionData drives minion AI shooters");
  console.log("ok - CN weapon level-up switches spawnMinionData AI shooters");
  console.log("ok - CN shooter direction 2 targets the player side with event rotation");
  console.log("ok - CN shooter on-destroy event bullets fire follow-up bullets");
  console.log("ok - CN active skill shooter SpawnPos 3 uses the nearest enemy position");
  console.log("ok - CN active skill Elemental Burst shooter loops fireballs without repeating snow field");
  console.log("ok - CN active skill Apocalypse Song triggers delayed damage shooter at frame 90");
  console.log("ok - CN active skill Zessho creates non-following static damage field shooter");
  console.log("ok - CN active skill Endless Star Map shooter creates owner-forward field and EXP/coin gains");
  console.log("ok - CN active skill Absolute Guard shooter applies friendly invincible buff");
  console.log("ok - CN active skill KiraKiraDokiDoki delayed field applies stun hit buff");
  console.log("ok - CN AIData creates hostile boss bullet shooters");
  console.log("ok - CN AIData creates Hydra friendly-target fireball shooters");
  console.log("ok - CN AIData creates long Hydra shooter timelines");
  console.log("ok - CN AIState timeline FireBulletNow gates hostile ray damage and idle movement");
  console.log("ok - CN AIState FireAllWeaponNow gates minion weapon fire");
  console.log("ok - CN AIState shooter SpawnPos 1 uses the player position");
  console.log("ok - CN AIState timeline NoColliding suppresses contact");
  console.log("ok - CN AIState BlackCat teleport moves on the teleport event and then fires");
  console.log("ok - CN AIState MoveToRandomPosition targets around-player movement");
  console.log("ok - CN AIState Golem_RollAttack uses State_MoveSpeed");
  console.log("ok - CN AIState Samurai_FlashAttack flashes near the player");
  console.log("ok - CN AIState CatBoss_Attack creates first-pass bullet rain");
  console.log("ok - CN AIState offset movement uses State_MoveOffset and State_MoveSpeed");
  console.log("ok - CN AIState TriggerLevelEventID gates triggered level enemy spawns");
  console.log("ok - CN AIState animation metadata updates serializable enemy state");
  console.log("ok - CN active skill Holy Mend heals, applies invincibility, and revives");
  console.log("ok - CN active skill Fairy Guard buffs existing player-side minions and their fire");
  console.log("ok - CN active skill 111 minion AI transitions into roar shooter");
  console.log("ok - CN active skill All-Out Fire drives shooter 7000 frame 1/3/7 timeline and minion AI");
  console.log("ok - CN active skill All-Out Fire level 3 loops zero-offset minion shooters");
  console.log("ok - CN active skill Galaxy Star summon uses first-pass minion orbit");
  console.log("ok - CN active skill Anon Phantom summon uses formation 2 ring");
  console.log("ok - CN DropData spawns item pickups and ItemData EXP pickup is collectable");
  console.log("ok - CN LevelData enemy spawn event creates a timed enemy wave");
  console.log("ok - CN LevelData spawn center type 1 uses level-origin offsets");
  console.log("ok - CN LevelData spawn type 2 creates a first-pass enemy ring");
  console.log("ok - CN LevelData clear type 2 does not auto-settle at totalFrames");
  console.log("ok - CN LevelData clear enemy event waits for final boss defeat");
  console.log("ok - CN LevelData clear unlock rewards apply to offline save");
  console.log("ok - CN LevelData event trigger fields are preserved");
  console.log("ok - CN LevelData AI state-change events retarget tagged enemies");
  console.log("ok - CN terrain map prefab bounds and terrain pits block non-flying player/enemy movement");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function getCase(id: string) {
  const selectedCase = fixture.selectedShooterCases.find((candidate) => candidate.id === id);
  assert.ok(selectedCase, `missing parity case ${id}`);
  return selectedCase;
}

function getWeaponShooterCase(id: string) {
  const selectedCase = fixture.selectedWeaponShooterCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity weapon shooter case ${id}`);
  return selectedCase;
}

function getWeaponDirectFireCase(id: string) {
  const selectedCase = fixture.selectedWeaponDirectFireCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity weapon direct fire case ${id}`);
  return selectedCase;
}

function getWeaponMinionCase(id: string) {
  const selectedCase = fixture.selectedWeaponMinionCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity weapon minion case ${id}`);
  return selectedCase;
}

function getWeaponSelfBuffCase(id: string) {
  const selectedCase = fixture.selectedWeaponSelfBuffCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity weapon self-buff case ${id}`);
  return selectedCase;
}

function getShooterRotationCase(id: string) {
  const selectedCase = fixture.selectedShooterRotationCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity shooter rotation case ${id}`);
  return selectedCase;
}

function getShooterOnDestroyCase(id: string) {
  const selectedCase = fixture.selectedShooterOnDestroyCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity shooter on-destroy case ${id}`);
  return selectedCase;
}

function getActiveSkillShooterSpawnCase(id: string) {
  const selectedCase = fixture.selectedActiveSkillShooterSpawnCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity active skill shooter spawn case ${id}`);
  return selectedCase;
}

function getActiveSkillShooterHitBuffCase(id: string) {
  const selectedCase = fixture.selectedActiveSkillShooterHitBuffCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity active skill shooter hit-buff case ${id}`);
  return selectedCase;
}

function getAttributeValue(attributes: NfoAttributeData[], attributeType: number): number {
  return attributes
    .filter((attribute) => attribute.attributeType === attributeType)
    .reduce((total, attribute) => total + attribute.value, 0);
}

function getAIActionCase(id: string) {
  const selectedCase = fixture.selectedAIActionCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity AI action case ${id}`);
  return selectedCase;
}

function getAIStateTimelineCase(id: string) {
  const selectedCase = fixture.selectedAIStateTimelineCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity AI timeline case ${id}`);
  return selectedCase;
}

function getAIStateFireAllWeaponCase(id: string) {
  const selectedCase = fixture.selectedAIStateFireAllWeaponCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity AI FireAllWeaponNow case ${id}`);
  return selectedCase;
}

function getAIStateShooterSpawnCase(id: string) {
  const selectedCase = fixture.selectedAIStateShooterSpawnCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity AI shooter spawn case ${id}`);
  return selectedCase;
}

function getAIStateNoCollidingCase(id: string) {
  const selectedCase = fixture.selectedAIStateNoCollidingCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity AI no-colliding case ${id}`);
  return selectedCase;
}

function getAIStateTeleportCase(id: string) {
  const selectedCase = fixture.selectedAIStateTeleportCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity AI teleport case ${id}`);
  return selectedCase;
}

function getAIStateMovementCase(id: string) {
  const selectedCase = fixture.selectedAIStateMovementCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity AI movement case ${id}`);
  return selectedCase;
}

function getAIStateBuffCase(id: string) {
  const selectedCase = fixture.selectedAIStateBuffCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity AI state buff case ${id}`);
  return selectedCase;
}

function getAIStateCommonStateCase(id: string) {
  const selectedCase = fixture.selectedAIStateCommonStateCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity AI state common-state case ${id}`);
  return selectedCase;
}

function getAIStateAnimationCase(id: string) {
  const selectedCase = fixture.selectedAIStateAnimationCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity AI state animation case ${id}`);
  return selectedCase;
}

function getActiveSkillBuffCase(id: string) {
  const selectedCase = fixture.selectedActiveSkillBuffCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity active skill buff case ${id}`);
  return selectedCase;
}

function getActiveSkillSummonCase(id: string) {
  const selectedCase = fixture.selectedActiveSkillSummonCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity active skill summon case ${id}`);
  return selectedCase;
}

function getItemCase(id: string) {
  const selectedCase = fixture.selectedItemCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity item case ${id}`);
  return selectedCase;
}

function getDropCase(id: string) {
  const selectedCase = fixture.selectedDropCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity drop case ${id}`);
  return selectedCase;
}

function getLevelEnemySpawnCase(id: string) {
  const selectedCase = fixture.selectedLevelEnemySpawnCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity level enemy spawn case ${id}`);
  return selectedCase;
}

function getLevelClearCase(id: string) {
  const selectedCase = fixture.selectedLevelClearCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity level clear case ${id}`);
  return selectedCase;
}

function getLevelEventTriggerCase(id: string) {
  const selectedCase = fixture.selectedLevelEventTriggerCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity level event trigger case ${id}`);
  return selectedCase;
}

function getLevelAIStateChangeCase(id: string) {
  const selectedCase = fixture.selectedLevelAIStateChangeCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity level AI state-change case ${id}`);
  return selectedCase;
}

function getMapCase(id: string) {
  const selectedCase = fixture.selectedMapCases.find((candidate) => (
    candidate.id === id
  ));
  assert.ok(selectedCase, `missing parity map case ${id}`);
  return selectedCase;
}

function testCnDirectionZeroShooter(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForShooter(sourceRuntimeData, 7000);
  const state = createStateWithEnemy(testRuntimeData, { x: -600, y: 0 });
  const nextState = updateNfoSimulation(
    chargeActiveSkill(state),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const bullet = nextState.bullets.find((candidate) => candidate.bulletTypeId === 66);

  assert.ok(bullet, "expected CN shooter 7000 to fire bullet 66");
  assertClose(bullet.vx, 0, "CN direction 0 vx");
  assert.ok(bullet.vy > 0);
}

function testCnDirectionOneRadialShooter(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directionOneCase = getCase("active-shooter-direction-1-radial-six-star");
  const testRuntimeData = configureRuntimeForShooter(sourceRuntimeData, directionOneCase.shooterId);
  const state = createStateWithEnemy(testRuntimeData, { x: 600, y: 0 });
  const firstFireState = updateNfoSimulation(
    chargeActiveSkill(state),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const firstBullets = firstFireState.bullets.filter((candidate) => (
    candidate.bulletTypeId === directionOneCase.bulletTypeId
  ));

  assert.equal(firstBullets.length, directionOneCase.bulletCount);
  assert.equal(firstFireState.activeShooters[0]?.lifeTimeFrames, directionOneCase.shooterLifeTimeFrames);
  assertClose(
    firstFireState.activeShooters[0]?.ageFrames ?? Number.NaN,
    directionOneCase.eventFrame,
    "CN direction 1 first shooter age",
  );
  assert.ok(firstBullets.some((bullet) => bullet.vx > 0));
  assert.ok(firstBullets.some((bullet) => bullet.vx < 0));
  assert.ok(firstBullets.some((bullet) => bullet.vy > 0));
  assert.ok(firstBullets.some((bullet) => bullet.vy < 0));

  const beforeLoopState = updateNfoSimulation(
    firstFireState,
    testRuntimeData,
    NO_INPUT,
    (directionOneCase.loopFrameInterval - 1) / 30,
  );
  assert.equal(
    beforeLoopState.bullets.filter((candidate) => (
      candidate.bulletTypeId === directionOneCase.bulletTypeId
    )).length,
    directionOneCase.bulletCount,
  );

  const secondLoopState = updateNfoSimulation(beforeLoopState, testRuntimeData, NO_INPUT, 1 / 30);
  assert.equal(
    secondLoopState.bullets.filter((candidate) => (
      candidate.bulletTypeId === directionOneCase.bulletTypeId
    )).length,
    directionOneCase.bulletCount * 2,
  );
  assertClose(
    secondLoopState.activeShooters[0]?.ageFrames ?? Number.NaN,
    directionOneCase.eventFrame + directionOneCase.loopFrameInterval,
    "CN direction 1 second loop shooter age",
  );

  const expiredState = updateNfoSimulation(
    secondLoopState,
    testRuntimeData,
    NO_INPUT,
    (
      directionOneCase.shooterLifeTimeFrames
      - directionOneCase.eventFrame
      - directionOneCase.loopFrameInterval
    ) / 30,
  );
  assert.equal(
    expiredState.activeShooters.some((shooter) => shooter.shooterId === directionOneCase.shooterId),
    false,
  );
}

function testCnWeaponLevelShooter(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createStateWithEnemy(testRuntimeData, { x: -600, y: 0 }, 31);
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
  };
  const spawnedShooterState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const bullet = firedShooterState.bullets.find((candidate) => candidate.bulletTypeId === 61);

  assert.equal(spawnedShooterState.activeShooters.length, 1);
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, 311);
  assert.equal(spawnedShooterState.bullets.length, 0);
  assert.ok(bullet, "expected CN weapon 31 level 1 shooter 311 to fire bullet 61");
  assert.ok(bullet.vx > 0);
  assert.ok(bullet.x > state.player.x + 100);
  assertClose(bullet.vy, 0, "CN weapon direction 4 vy");
}

function testCnWeaponLevelUpSwitchesShooter(sourceRuntimeData: NfoOfflineRuntimeData) {
  const levelOneShooterCase = getWeaponShooterCase("weapon-shooter-judgement-spear-lv1");
  const levelTwoShooterCase = getWeaponShooterCase(
    "weapon-shooter-judgement-spear-level-up-lv2",
  );
  const levelUpItemCase = getItemCase("item-level-up");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: levelTwoShooterCase.weaponId,
  });
  const levelUpPickup: NfoSimPickup = {
    id: 9101,
    itemId: levelUpItemCase.itemId,
    name: levelUpItemCase.itemName,
    itemType: levelUpItemCase.itemType,
    value: levelUpItemCase.value,
    canBeMagneted: levelUpItemCase.canBeMagneted,
    radius: 5,
    remainingSeconds: levelUpItemCase.lifetimeFrames / 30,
    x: baseState.player.x,
    y: baseState.player.y,
  };
  const leveledState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 999,
      },
      pickups: [levelUpPickup],
    },
    testRuntimeData,
    NO_INPUT,
    0.1,
  );

  assert.equal(levelOneShooterCase.shooterId, 311);
  assert.equal(levelTwoShooterCase.shooterId, 312);
  assert.equal(leveledState.player.weaponLevel, levelTwoShooterCase.weaponLevel);
  assert.equal(leveledState.pickups.length, 0);
  assert.equal(leveledState.activeShooters.length, 0);
  assert.equal(leveledState.bullets.length, 0);

  const spawnedShooterState = updateNfoSimulation(
    {
      ...leveledState,
      player: {
        ...leveledState.player,
        fireCooldownSeconds: 0,
        facingAngle: 0,
      },
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const bullet = firedShooterState.bullets.find((candidate) => (
    candidate.bulletTypeId === levelTwoShooterCase.bulletTypeId
  ));

  assert.equal(spawnedShooterState.activeShooters.length, 1);
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, levelTwoShooterCase.shooterId);
  assert.notEqual(spawnedShooterState.activeShooters[0]?.shooterId, levelOneShooterCase.shooterId);
  assert.ok(bullet, "expected CN weapon 31 level-up to switch to shooter 312");
  assert.equal(bullet.colliderWidth, levelTwoShooterCase.bulletSize);
  assert.equal(bullet.remainingHits, 99999);
  assertClose(
    bullet.remainingSeconds,
    (levelTwoShooterCase.bulletLifeTimeFrames - 1) / 30,
    "CN weapon 31 level 2 bullet lifetime after shooter tick",
  );
  assertClose(
    bullet.x,
    spawnedShooterState.player.x
      + levelTwoShooterCase.formationOffsetX
      + levelTwoShooterCase.bulletSpeed / 30,
    "CN weapon 31 level 2 bullet x",
  );
  assertClose(bullet.y, spawnedShooterState.player.y, "CN weapon 31 level 2 bullet y");
  assertClose(bullet.vx, levelTwoShooterCase.bulletSpeed, "CN weapon 31 level 2 bullet vx");
  assertClose(bullet.vy, 0, "CN weapon 31 level 2 bullet vy");
}

function testCnWeaponShooterFormationTypeThreeRotatesWithOwnerDirection(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const weaponShooterCase = getWeaponShooterCase("weapon-shooter-judgement-spear-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createStateWithEnemy(
    testRuntimeData,
    { x: -600, y: 0 },
    weaponShooterCase.weaponId,
  );
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
  };
  const spawnedShooterState = updateNfoSimulation(
    state,
    testRuntimeData,
    { moveX: 0, moveY: 1 },
    0,
  );
  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const bullet = firedShooterState.bullets.find((candidate) => (
    candidate.bulletTypeId === weaponShooterCase.bulletTypeId
  ));

  assert.equal(weaponShooterCase.formationType, 3);
  assert.equal(weaponShooterCase.formationParam1, 50);
  assert.equal(weaponShooterCase.formationOffsetX, 100);
  assert.equal(weaponShooterCase.formationOffsetY, 0);
  assertClose(spawnedShooterState.player.facingAngle, Math.PI / 2, "CN player facing angle");
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, weaponShooterCase.shooterId);
  assertClose(
    spawnedShooterState.activeShooters[0]?.ownerFacingAngle ?? Number.NaN,
    Math.PI / 2,
    "CN shooter owner facing angle",
  );
  assert.ok(bullet, "expected CN weapon 31 shooter 311 to emit bullet 61");
  assertClose(bullet.x, state.player.x, "CN formation type 3 bullet x");
  assert.ok(bullet.y > state.player.y + weaponShooterCase.formationOffsetX);
  assertClose(bullet.vx, 0, "CN formation type 3 bullet vx");
  assert.ok(bullet.vy > 0);
}

function testCnWeaponShooterDirectionOffsetAngle(sourceRuntimeData: NfoOfflineRuntimeData) {
  const nightBladeOffsetCase = getWeaponShooterCase(
    "weapon-shooter-night-blade-offset-angle-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createStateWithEnemy(
    testRuntimeData,
    { x: 600, y: 0 },
    nightBladeOffsetCase.weaponId,
  );
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
  };
  const spawnedShooterState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const firstEventState = updateNfoSimulation(
    spawnedShooterState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const beforeOffsetState = updateNfoSimulation(
    firstEventState,
    testRuntimeData,
    NO_INPUT,
    (nightBladeOffsetCase.eventFrame - 2) / 30,
  );
  const offsetEventState = updateNfoSimulation(
    beforeOffsetState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const firstEventBullets = firstEventState.bullets.filter((candidate) => (
    candidate.bulletTypeId === nightBladeOffsetCase.bulletTypeId
  ));
  const beforeOffsetBullets = beforeOffsetState.bullets.filter((candidate) => (
    candidate.bulletTypeId === nightBladeOffsetCase.bulletTypeId
  ));
  const beforeOffsetBulletIds = new Set(beforeOffsetBullets.map((bullet) => bullet.id));
  const allNightBladeBullets = offsetEventState.bullets
    .filter((candidate) => candidate.bulletTypeId === nightBladeOffsetCase.bulletTypeId)
    .sort((a, b) => a.id - b.id);
  const offsetBullets = allNightBladeBullets.slice(-nightBladeOffsetCase.bulletCount);

  assert.equal(spawnedShooterState.activeShooters.length, 1);
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, nightBladeOffsetCase.shooterId);
  assert.equal(firstEventBullets.length, nightBladeOffsetCase.bulletCount);
  assert.equal(beforeOffsetBullets.length, nightBladeOffsetCase.bulletCount);
  assertClose(
    offsetEventState.activeShooters[0]?.ageFrames ?? Number.NaN,
    nightBladeOffsetCase.eventFrame,
    "CN weapon direction offset shooter age",
  );
  assert.equal(allNightBladeBullets.length, nightBladeOffsetCase.bulletCount);
  assert.equal(offsetBullets.length, nightBladeOffsetCase.bulletCount);
  assert.ok(offsetBullets.every((bullet) => !beforeOffsetBulletIds.has(bullet.id)));
  assert.ok(offsetBullets.every((bullet) => bullet.vy > 0));
  assert.ok(offsetBullets.every((bullet) => Math.abs(bullet.vy) > Math.abs(bullet.vx) * 5));
  assert.ok(offsetBullets.some((bullet) => bullet.vx > 0));
  assert.ok(offsetBullets.some((bullet) => bullet.vx < 0));
}

function testCnWeaponShooterAllDirectionRadial(sourceRuntimeData: NfoOfflineRuntimeData) {
  const nightBladeRadialCase = getWeaponShooterCase(
    "weapon-shooter-night-blade-all-direction-radial-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createStateWithEnemy(
    testRuntimeData,
    { x: 600, y: 0 },
    nightBladeRadialCase.weaponId,
  );
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
  };
  const spawnedShooterState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const firstEventState = updateNfoSimulation(
    spawnedShooterState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const beforeRadialState = updateNfoSimulation(
    firstEventState,
    testRuntimeData,
    NO_INPUT,
    (nightBladeRadialCase.eventFrame - 2) / 30,
  );
  const radialEventState = updateNfoSimulation(
    beforeRadialState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const radialBullets = radialEventState.bullets.filter((candidate) => (
    candidate.bulletTypeId === nightBladeRadialCase.bulletTypeId
  ));

  assert.equal(spawnedShooterState.activeShooters.length, 1);
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, nightBladeRadialCase.shooterId);
  assertClose(
    radialEventState.activeShooters[0]?.ageFrames ?? Number.NaN,
    nightBladeRadialCase.eventFrame,
    "CN Night Blade radial shooter age",
  );
  assert.equal(radialBullets.length, nightBladeRadialCase.bulletCount);
  assert.ok(radialBullets.every((bullet) => (
    Math.abs(Math.hypot(bullet.vx, bullet.vy) - nightBladeRadialCase.bulletSpeed) < 0.000001
  )));
  assert.ok(radialBullets.some((bullet) => bullet.vx > 0));
  assert.ok(radialBullets.some((bullet) => bullet.vx < 0));
  assert.ok(radialBullets.some((bullet) => bullet.vy > 0));
  assert.ok(radialBullets.some((bullet) => bullet.vy < 0));
  assertClose(
    radialBullets.reduce((sum, bullet) => sum + bullet.vx, 0),
    0,
    "CN Night Blade radial vx sum",
  );
  assertClose(
    radialBullets.reduce((sum, bullet) => sum + bullet.vy, 0),
    0,
    "CN Night Blade radial vy sum",
  );
}

function testCnWeaponLevelFriendlyHitBuff(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-eternal-song-targeted-field-lv1",
  );
  const mainFieldCase = getWeaponShooterCase(
    "weapon-shooter-eternal-song-main-field-lv1",
  );
  const weaponShooterCase = getWeaponShooterCase(
    "weapon-shooter-eternal-song-friendly-buff-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createStateWithEnemy(testRuntimeData, { x: 100, y: 0 }, weaponShooterCase.weaponId);
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
    minions: [
      {
        id: 880001,
        minionId: 50,
        aiTypeId: 0,
        weaponId: 0,
        weaponLevel: 1,
        name: "CN Friendly Buff Ally Probe",
        speed: 0,
        radius: 28,
        x: baseState.player.x,
        y: baseState.player.y,
        remainingSeconds: 10,
        aiFireCooldownSeconds: 0,
        fireCooldownSeconds: 0,
        pendingFireGroups: 0,
        canFireOwnWeapon: false,
        activeBuffs: [],
      },
    ],
  };
  const spawnedShooterState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const buffBullet = firedShooterState.bullets.find((candidate) => (
    candidate.bulletTypeId === weaponShooterCase.bulletTypeId
    && candidate.hitTargetType === weaponShooterCase.bulletHitTargetType
  ));
  const mainBullets = firedShooterState.bullets.filter((candidate) => (
    candidate.bulletTypeId === 60
    && candidate.hitTargetType === 0
  ));
  const activeBuff = firedShooterState.player.activeBuffs.find((buff) => (
    buff.id === weaponShooterCase.hitBuffId
  ));
  const minionBuff = firedShooterState.minions[0]?.activeBuffs.find((buff) => (
    buff.id === weaponShooterCase.hitBuffId
  ));

  assert.equal(spawnedShooterState.activeShooters.length, 1);
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, weaponShooterCase.shooterId);
  assert.equal(mainFieldCase.weaponId, directFireCase.weaponId);
  assert.equal(mainFieldCase.weaponId, weaponShooterCase.weaponId);
  assert.equal(mainFieldCase.shooterId, weaponShooterCase.shooterId);
  assert.ok(buffBullet, "expected CN weapon 30 shooter 301 to emit friendly buff bullet 99");
  assert.equal(buffBullet.dealsDamage, !weaponShooterCase.bulletNoDamage);
  assert.equal(buffBullet.canDamagePlayer, false);
  assert.equal(buffBullet.hitBuffId, weaponShooterCase.hitBuffId);
  assert.equal(buffBullet.hitBuffLevel, weaponShooterCase.hitBuffLevel);
  assert.equal(mainBullets.length, 2);
  const directFieldBullets = mainBullets.filter((bullet) => (
    Math.abs(
      bullet.damageJudgeCooldownSeconds
      - directFireCase.bulletDamageJudgeCooldownFrames / 30,
    ) < 0.000001
  ));
  const shooterFieldBullets = mainBullets.filter((bullet) => (
    Math.abs(
      bullet.damageJudgeCooldownSeconds
      - mainFieldCase.bulletDamageJudgeCooldownFrames / 30,
    ) < 0.000001
  ));

  assert.equal(directFieldBullets.length, 1);
  assert.equal(shooterFieldBullets.length, 1);
  assert.equal(shooterFieldBullets[0]?.damageJudgeType, mainFieldCase.bulletDamageJudgeType);
  assert.equal(shooterFieldBullets[0]?.colliderType, mainFieldCase.bulletColliderType);
  assert.equal(shooterFieldBullets[0]?.colliderWidth, mainFieldCase.bulletSize);
  assert.equal(shooterFieldBullets[0]?.remainingHits, mainFieldCase.bulletHitTimes - 1);
  assertClose(
    shooterFieldBullets[0]?.remainingSeconds ?? Number.NaN,
    (mainFieldCase.bulletLifeTimeFrames - 1) / 30,
    "CN Eternal Song shooter main field lifetime after one frame",
  );
  assert.ok(activeBuff, "expected CN Eternal Song buff bullet to apply buff 109 to the player");
  assert.equal(activeBuff.type, 1);
  assert.equal(activeBuff.value, 1);
  assert.equal(activeBuff.attributes[0]?.attributeType, 3);
  assert.equal(activeBuff.attributes[0]?.value, 1);
  assert.ok(minionBuff, "expected CN Eternal Song buff bullet to apply buff 109 to an allied minion");
  assert.equal(minionBuff.type, 1);
  assert.equal(minionBuff.value, 1);
  assert.equal(minionBuff.attributes[0]?.attributeType, 3);
  assert.equal(minionBuff.attributes[0]?.value, 1);

  const loopedShooterState = updateNfoSimulation(
    {
      ...firedShooterState,
      player: {
        ...firedShooterState.player,
        fireCooldownSeconds: 999,
      },
      bullets: [],
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    weaponShooterCase.loopFrameInterval / 30,
  );
  const loopedBuffBullets = loopedShooterState.bullets.filter((candidate) => (
    candidate.bulletTypeId === weaponShooterCase.bulletTypeId
    && candidate.hitTargetType === weaponShooterCase.bulletHitTargetType
  ));
  const loopedMainFieldBullets = loopedShooterState.bullets.filter((candidate) => (
    candidate.bulletTypeId === mainFieldCase.bulletTypeId
    && candidate.hitTargetType === mainFieldCase.bulletHitTargetType
  ));

  assert.equal(loopedBuffBullets.length, 1);
  assert.equal(loopedMainFieldBullets.length, 0);
  assertClose(
    loopedShooterState.activeShooters[0]?.ageFrames ?? Number.NaN,
    weaponShooterCase.eventFrame + weaponShooterCase.loopFrameInterval,
    "CN Eternal Song shooter second loop age",
  );

  const expiredShooterState = updateNfoSimulation(
    {
      ...loopedShooterState,
      player: {
        ...loopedShooterState.player,
        fireCooldownSeconds: 999,
      },
    },
    testRuntimeData,
    NO_INPUT,
    (
      weaponShooterCase.shooterLifeTimeFrames
      - weaponShooterCase.eventFrame
      - weaponShooterCase.loopFrameInterval
    ) / 30,
  );

  assert.equal(
    expiredShooterState.activeShooters.some((shooter) => (
      shooter.shooterId === weaponShooterCase.shooterId
    )),
    false,
  );
}

function testCnWeaponShooterPrayerRainBuffs(sourceRuntimeData: NfoOfflineRuntimeData) {
  const slowCase = getWeaponShooterCase("weapon-shooter-prayer-rain-enemy-slow-lv1");
  const friendlyBuffCase = getWeaponShooterCase(
    "weapon-shooter-prayer-rain-friendly-buff-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => candidate.id === slowCase.weaponId);
  const weaponLevel = weapon?.levels.find((candidate) => candidate.level === slowCase.weaponLevel);

  assert.ok(weapon);
  assert.ok(weaponLevel);
  weaponLevel.fireBullets = [];

  const baseState = createStateWithEnemy(testRuntimeData, { x: 100, y: 0 }, slowCase.weaponId);
  const movingTarget = baseState.enemies[0]
    ? {
      ...baseState.enemies[0],
      speed: 100,
    }
    : undefined;
  assert.ok(movingTarget);
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
    enemies: [movingTarget],
  };
  const spawnedShooterState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const slowBullet = firedShooterState.bullets.find((candidate) => (
    candidate.bulletTypeId === slowCase.bulletTypeId
    && candidate.hitTargetType === slowCase.bulletHitTargetType
  ));
  const friendlyBuffBullet = firedShooterState.bullets.find((candidate) => (
    candidate.bulletTypeId === friendlyBuffCase.bulletTypeId
    && candidate.hitTargetType === friendlyBuffCase.bulletHitTargetType
  ));
  const targetAfter = firedShooterState.enemies.find((enemy) => (
    enemy.id === baseState.enemies[0]?.id
  ));
  const slowBuff = targetAfter?.activeBuffs.find((buff) => buff.id === slowCase.hitBuffId);
  const playerBuff = firedShooterState.player.activeBuffs.find((buff) => (
    buff.id === friendlyBuffCase.hitBuffId
  ));

  assert.equal(spawnedShooterState.activeShooters.length, 1);
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, slowCase.shooterId);
  assert.equal(friendlyBuffCase.shooterId, slowCase.shooterId);
  assert.ok(slowBullet, "expected CN weapon 33 shooter 321 to emit enemy slow bullet 99");
  assert.equal(slowBullet.dealsDamage, !slowCase.bulletNoDamage);
  assert.equal(slowBullet.hitBuffId, slowCase.hitBuffId);
  assert.equal(slowBullet.hitBuffLevel, slowCase.hitBuffLevel);
  assert.ok(friendlyBuffBullet, "expected CN weapon 33 shooter 321 to emit friendly buff bullet 63");
  assert.equal(friendlyBuffBullet.dealsDamage, !friendlyBuffCase.bulletNoDamage);
  assert.equal(friendlyBuffBullet.canDamagePlayer, false);
  assert.equal(friendlyBuffBullet.hitBuffId, friendlyBuffCase.hitBuffId);
  assert.equal(friendlyBuffBullet.hitBuffLevel, friendlyBuffCase.hitBuffLevel);
  assert.ok(targetAfter, "expected CN Prayer Rain target to remain alive");
  assert.equal(targetAfter.hp, movingTarget.hp);
  assert.ok(slowBuff, "expected CN Prayer Rain no-damage bullet 99 to apply slow buff 1");
  assert.equal(slowBuff.type, 1);
  assert.equal(slowBuff.value, -80);
  assert.equal(slowBuff.attributes[0]?.attributeType, 4);
  assert.equal(slowBuff.attributes[0]?.value, -80);
  assert.ok(playerBuff, "expected CN Prayer Rain friendly bullet 63 to apply buff 111");
  assert.equal(playerBuff.type, 1);
  assert.equal(playerBuff.value, 2);
  assert.equal(playerBuff.attributes.length, 3);
  assert.equal(playerBuff.attributes[0]?.attributeType, 2);
  assert.equal(playerBuff.attributes[0]?.value, 2);
  assert.equal(playerBuff.attributes[1]?.attributeType, 12);
  assert.equal(playerBuff.attributes[1]?.value, 5);
  assert.equal(playerBuff.attributes[2]?.attributeType, 13);
  assert.equal(playerBuff.attributes[2]?.value, 10);

  const beforeLoopShooterState = updateNfoSimulation(
    {
      ...firedShooterState,
      player: {
        ...firedShooterState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [],
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    (slowCase.loopFrameInterval - 1) / 30,
  );
  const beforeLoopSlowBullets = beforeLoopShooterState.bullets.filter((candidate) => (
    candidate.bulletTypeId === slowCase.bulletTypeId
    && candidate.hitTargetType === slowCase.bulletHitTargetType
  ));

  assert.equal(beforeLoopSlowBullets.length, 0);

  const loopedShooterState = updateNfoSimulation(
    {
      ...beforeLoopShooterState,
      player: {
        ...beforeLoopShooterState.player,
        fireCooldownSeconds: 999,
      },
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const loopedSlowBullets = loopedShooterState.bullets.filter((candidate) => (
    candidate.bulletTypeId === slowCase.bulletTypeId
    && candidate.hitTargetType === slowCase.bulletHitTargetType
  ));
  const loopedFriendlyBullets = loopedShooterState.bullets.filter((candidate) => (
    candidate.bulletTypeId === friendlyBuffCase.bulletTypeId
    && candidate.hitTargetType === friendlyBuffCase.bulletHitTargetType
  ));

  assert.equal(loopedSlowBullets.length, 1);
  assert.equal(loopedFriendlyBullets.length, 0);
  assertClose(
    loopedShooterState.activeShooters[0]?.ageFrames ?? Number.NaN,
    slowCase.eventFrame + slowCase.loopFrameInterval,
    "CN Prayer Rain shooter second loop age",
  );

  const expiredShooterState = updateNfoSimulation(
    {
      ...loopedShooterState,
      player: {
        ...loopedShooterState.player,
        fireCooldownSeconds: 999,
      },
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    (
      slowCase.shooterLifeTimeFrames
      - slowCase.eventFrame
      - slowCase.loopFrameInterval
    ) / 30,
  );

  assert.equal(
    expiredShooterState.activeShooters.some((shooter) => shooter.shooterId === slowCase.shooterId),
    false,
  );

  const slowMoveDeltaSeconds = 0.5;
  const slowedMoveState = updateNfoSimulation(
    {
      ...firedShooterState,
      player: {
        ...firedShooterState.player,
        fireCooldownSeconds: 999,
      },
      enemies: targetAfter ? [targetAfter] : [],
      activeShooters: [],
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    slowMoveDeltaSeconds,
  );
  const unbuffedMoveState = updateNfoSimulation(
    {
      ...firedShooterState,
      player: {
        ...firedShooterState.player,
        fireCooldownSeconds: 999,
      },
      enemies: targetAfter
        ? [
          {
            ...targetAfter,
            activeBuffs: [],
          },
        ]
        : [],
      activeShooters: [],
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    slowMoveDeltaSeconds,
  );
  const slowedEnemy = slowedMoveState.enemies[0];
  const unbuffedEnemy = unbuffedMoveState.enemies[0];
  assert.ok(slowedEnemy, "expected slowed CN Prayer Rain target to remain active");
  assert.ok(unbuffedEnemy, "expected unbuffed CN Prayer Rain target to remain active");
  assertClose(
    targetAfter.x - (slowedEnemy?.x ?? Number.NaN),
    (movingTarget.speed + (slowBuff.attributes[0]?.value ?? 0)) * slowMoveDeltaSeconds,
    "CN Prayer Rain slowed enemy movement distance",
  );
  assertClose(
    targetAfter.x - (unbuffedEnemy?.x ?? Number.NaN),
    movingTarget.speed * slowMoveDeltaSeconds,
    "CN Prayer Rain unbuffed enemy movement distance",
  );
}

function testCnWeaponShooterFollowsOwnerPositionAndDirection(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const slowCase = getWeaponShooterCase("weapon-shooter-prayer-rain-enemy-slow-lv1");
  const friendlyBuffCase = getWeaponShooterCase(
    "weapon-shooter-prayer-rain-friendly-buff-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === friendlyBuffCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === friendlyBuffCase.weaponLevel
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  weaponLevel.fireBullets = [];

  const baseState = createStateWithEnemy(
    testRuntimeData,
    { x: 100, y: 0 },
    friendlyBuffCase.weaponId,
  );
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
      facingAngle: 0,
    },
  };
  const spawnedShooterState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const movedOwnerState = {
    ...spawnedShooterState,
    player: {
      ...spawnedShooterState.player,
      x: spawnedShooterState.player.x + 180,
      y: spawnedShooterState.player.y + 70,
      facingAngle: Math.PI / 2,
    },
  };
  const firedShooterState = updateNfoSimulation(
    movedOwnerState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const shooter = firedShooterState.activeShooters[0];
  const slowBullet = firedShooterState.bullets.find((candidate) => (
    candidate.bulletTypeId === slowCase.bulletTypeId
    && candidate.hitTargetType === slowCase.bulletHitTargetType
  ));
  const friendlyBuffBullet = firedShooterState.bullets.find((candidate) => (
    candidate.bulletTypeId === friendlyBuffCase.bulletTypeId
    && candidate.hitTargetType === friendlyBuffCase.bulletHitTargetType
  ));

  assert.equal(slowCase.shooterBehaviorType, 1);
  assert.equal(slowCase.shooterFollowsOwnerDirection, true);
  assert.equal(friendlyBuffCase.shooterBehaviorType, 1);
  assert.equal(friendlyBuffCase.shooterFollowsOwnerDirection, true);
  assert.equal(friendlyBuffCase.eventFrame, 1);
  assert.equal(friendlyBuffCase.bulletSpeed, 0);
  assert.equal(spawnedShooterState.activeShooters.length, 1);
  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, friendlyBuffCase.shooterId);
  assert.ok(slowBullet, "expected CN Prayer Rain enemy slow bullet to fire");
  assert.ok(friendlyBuffBullet, "expected CN Prayer Rain friendly buff bullet to fire");
  assertClose(shooter?.x ?? Number.NaN, movedOwnerState.player.x, "CN follow shooter x");
  assertClose(shooter?.y ?? Number.NaN, movedOwnerState.player.y, "CN follow shooter y");
  assertClose(
    shooter?.ownerFacingAngle ?? Number.NaN,
    Math.PI / 2,
    "CN follow shooter facing",
  );
  assertClose(slowBullet.x, movedOwnerState.player.x, "CN follow direction bullet x");
  assertClose(slowBullet.y, movedOwnerState.player.y, "CN follow direction bullet y");
  assertClose(slowBullet.angle, Math.PI / 2, "CN follow direction bullet angle");
  assertClose(friendlyBuffBullet.x, movedOwnerState.player.x, "CN follow bullet x");
  assertClose(friendlyBuffBullet.y, movedOwnerState.player.y, "CN follow bullet y");
}

function testCnWeaponDirectFireTargetlessMultiBullet(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const directFireCases = [
    "weapon-direct-light-sanctuary-targetless-multi-bullet-lv1",
    "weapon-direct-dark-orb-targetless-multi-bullet-lv1",
    "weapon-direct-guardian-song-targetless-multi-bullet-lv1",
    "weapon-direct-kirakira-targetless-five-shot-lv1",
  ].map((id) => getWeaponDirectFireCase(id));

  for (const directFireCase of directFireCases) {
    const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
    const weapon = testRuntimeData.weapons.find((candidate) => (
      candidate.id === directFireCase.weaponId
    ));
    const weaponLevel = weapon?.levels.find((candidate) => (
      candidate.level === directFireCase.weaponLevel
    ));
    const fireBullet = weaponLevel?.fireBullets.find((candidate) => (
      candidate.bulletTypeId === directFireCase.bulletTypeId
    ));

    assert.ok(weapon);
    assert.ok(weaponLevel);
    assert.ok(fireBullet);
    weaponLevel.fireBullets = [{ ...fireBullet }];

    const baseState = createNfoSimulation(testRuntimeData, {
      weaponId: directFireCase.weaponId,
    });
    const firedState = updateNfoSimulation(
      {
        ...baseState,
        player: {
          ...baseState.player,
          fireCooldownSeconds: 0,
        },
        enemies: [],
      },
      testRuntimeData,
      { moveX: 0, moveY: 1 },
      0,
    );
    const bullets = firedState.bullets.filter((candidate) => (
      candidate.bulletTypeId === directFireCase.bulletTypeId
    ));
    const velocitySum = bullets.reduce((sum, bullet) => ({
      x: sum.x + bullet.vx,
      y: sum.y + bullet.vy,
    }), { x: 0, y: 0 });

    assert.equal(bullets.length, directFireCase.bulletCount);
    assertClose(firedState.player.facingAngle, Math.PI / 2, `${directFireCase.id} player facing`);
    assert.ok(bullets.every((bullet) => bullet.colliderType === directFireCase.bulletColliderType));
    assert.ok(bullets.every((bullet) => bullet.colliderWidth === directFireCase.bulletSize));
    assert.ok(bullets.every((bullet) => (
      bullet.damageJudgeType === directFireCase.bulletDamageJudgeType
    )));
    assert.ok(bullets.every((bullet) => bullet.hitTargetType === directFireCase.bulletHitTargetType));
    assert.ok(bullets.every((bullet) => bullet.motionType === directFireCase.motionMode));
    assert.ok(bullets.every((bullet) => (
      Math.abs(Math.hypot(bullet.vx, bullet.vy) - directFireCase.bulletSpeed) < 0.000001
    )));
    if (directFireCase.motionMode === "playerOrbit") {
      for (const bullet of bullets) {
        assertClose(
          Math.hypot(bullet.x - firedState.player.x, bullet.y - firedState.player.y),
          FIRST_PASS_GUARDIAN_SONG_ORBIT_RADIUS,
          `${directFireCase.id} first-pass orbit radius`,
        );
      }
      continue;
    }
    assertClose(velocitySum.x, 0, `${directFireCase.id} targetless vx sum`);
    assert.ok(velocitySum.y > 0, `expected ${directFireCase.id} targetless vy sum to face upward`);
  }
}

function testCnWeaponDarkOrbHomingRetargetsNearestEnemy(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const directFireCase = getWeaponDirectFireCase("weapon-direct-dark-orb-targetless-multi-bullet-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === directFireCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === directFireCase.weaponLevel
  ));
  const fireBullet = weaponLevel?.fireBullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  assert.ok(fireBullet);
  weaponLevel.fireBullets = [{ ...fireBullet }];

  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const target = createEnemyFixture(
    baseState,
    baseState.player.x + 600,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 10,
    },
  );
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const homingBullets = firedState.bullets.filter((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));
  assert.equal(homingBullets.length, directFireCase.bulletCount);
  assert.ok(homingBullets.every((bullet) => bullet.motionType === "homingEnemy"));

  const firstBullet = homingBullets[0];
  assert.ok(firstBullet);
  const retargetedState = updateNfoSimulation(
    {
      ...firedState,
      player: {
        ...firedState.player,
        fireCooldownSeconds: 999,
      },
      enemies: firedState.enemies.map((enemy) => ({
        ...enemy,
        x: firstBullet.x,
        y: firstBullet.y + 600,
        speed: 0,
      })),
    },
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const retargetedBullets = retargetedState.bullets.filter((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.equal(retargetedBullets.length, directFireCase.bulletCount);
  assert.ok(retargetedBullets.every((bullet) => bullet.vy > 0));
  assert.ok(retargetedBullets.every((bullet) => Math.abs(bullet.vx) < directFireCase.bulletSpeed * 0.05));
  assert.ok(retargetedBullets.every((bullet) => (
    Math.abs(Math.hypot(bullet.vx, bullet.vy) - directFireCase.bulletSpeed) < 0.000001
  )));
}

function testCnWeaponGuardianSongBulletsOrbitPlayer(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const directFireCase = getWeaponDirectFireCase("weapon-direct-guardian-song-targetless-multi-bullet-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === directFireCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === directFireCase.weaponLevel
  ));
  const fireBullet = weaponLevel?.fireBullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  assert.ok(fireBullet);
  weaponLevel.fireBullets = [{ ...fireBullet }];

  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const orbitBullets = firedState.bullets.filter((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));
  assert.equal(orbitBullets.length, directFireCase.bulletCount);
  assert.ok(orbitBullets.every((bullet) => bullet.motionType === "playerOrbit"));
  for (const bullet of orbitBullets) {
    assertClose(
      Math.hypot(bullet.x - firedState.player.x, bullet.y - firedState.player.y),
      FIRST_PASS_GUARDIAN_SONG_ORBIT_RADIUS,
      "CN Guardian Song initial orbit radius",
    );
  }

  const firstBullet = orbitBullets[0];
  assert.ok(firstBullet);
  const movedState = updateNfoSimulation(
    {
      ...firedState,
      player: {
        ...firedState.player,
        fireCooldownSeconds: 999,
      },
    },
    testRuntimeData,
    { moveX: 1, moveY: 0 },
    1 / 30,
  );
  const movedBullet = movedState.bullets.find((candidate) => candidate.id === firstBullet.id);
  assert.ok(movedBullet);
  assert.equal(movedBullet.motionType, "playerOrbit");
  assertClose(
    Math.hypot(movedBullet.x - movedState.player.x, movedBullet.y - movedState.player.y),
    FIRST_PASS_GUARDIAN_SONG_ORBIT_RADIUS,
    "CN Guardian Song moved orbit radius",
  );
  assert.notEqual(movedBullet.x, firstBullet.x);
  assert.notEqual(movedBullet.y, firstBullet.y);
}

function testCnWeaponDirectFireFireballTargetedFan(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-fireball-targeted-two-shot-lv2",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseNoTargetState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const noTargetState = updateNfoSimulation(
    {
      ...baseNoTargetState,
      player: {
        ...baseNoTargetState.player,
        weaponLevel: directFireCase.weaponLevel,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );

  assert.equal(directFireCase.requiresEnemyTarget, true);
  assert.equal(
    noTargetState.bullets.some((bullet) => bullet.bulletTypeId === directFireCase.bulletTypeId),
    false,
  );

  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const target = createEnemyFixture(
    baseState,
    baseState.player.x + 260,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        weaponLevel: directFireCase.weaponLevel,
        fireCooldownSeconds: 0,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const bullets = firedState.bullets
    .filter((candidate) => candidate.bulletTypeId === directFireCase.bulletTypeId)
    .sort((left, right) => left.vy - right.vy);
  const lowerBullet = bullets[0];
  const upperBullet = bullets[1];

  assert.equal(bullets.length, directFireCase.bulletCount);
  assert.ok(lowerBullet, "expected lower CN fireball fan bullet");
  assert.ok(upperBullet, "expected upper CN fireball fan bullet");
  assert.ok(lowerBullet.vy < 0, "expected first fireball to travel below the target line");
  assert.ok(upperBullet.vy > 0, "expected second fireball to travel above the target line");
  for (const bullet of bullets) {
    assert.equal(bullet.damageJudgeType, directFireCase.bulletDamageJudgeType);
    assert.equal(bullet.colliderType, directFireCase.bulletColliderType);
    assert.equal(bullet.colliderWidth, directFireCase.bulletSize);
    assert.equal(bullet.remainingHits, directFireCase.bulletHitTimes);
    assert.equal(bullet.hitTargetType, directFireCase.bulletHitTargetType);
    assertClose(
      Math.hypot(bullet.vx, bullet.vy),
      directFireCase.bulletSpeed,
      "CN Fireball fan bullet speed",
    );
  }
  assertClose(
    lowerBullet.angle + upperBullet.angle,
    0,
    "CN Fireball fan angle symmetry",
  );
  assertClose(
    lowerBullet.vy + upperBullet.vy,
    0,
    "CN Fireball fan vertical symmetry",
  );
  assert.ok(lowerBullet.vx > 0, "expected lower fireball to move toward the target");
  assert.ok(upperBullet.vx > 0, "expected upper fireball to move toward the target");
}

function testCnWeaponDirectFireTargetedRayRequiresEnemy(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-apocalypse-light-targeted-ray-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseNoTargetState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const noTargetState = updateNfoSimulation(
    {
      ...baseNoTargetState,
      player: {
        ...baseNoTargetState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const noTargetBullet = noTargetState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.equal(directFireCase.requiresEnemyTarget, true);
  assert.equal(noTargetBullet, undefined);

  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const behindEnemy = createEnemyFixture(
    baseState,
    baseState.player.x - 160,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const forwardEnemy = {
    ...createEnemyFixture(
      baseState,
      baseState.player.x + 80,
      baseState.player.y,
      {
        hp: 999999,
        speed: 0,
        radius: 5,
      },
    ),
    id: 900002,
  };
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [behindEnemy, forwardEnemy],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const bullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));
  const behindEnemyAfter = firedState.enemies.find((enemy) => enemy.id === behindEnemy.id);
  const forwardEnemyAfter = firedState.enemies.find((enemy) => enemy.id === forwardEnemy.id);

  assert.ok(bullet, "expected CN weapon 3 to fire apocalypse light ray at a target");
  assert.ok(behindEnemyAfter, "expected behind apocalypse light target to remain alive");
  assert.ok(forwardEnemyAfter, "expected forward apocalypse light target to remain alive");
  assert.equal(bullet.colliderType, directFireCase.bulletColliderType);
  assert.equal(bullet.colliderWidth, directFireCase.bulletSize);
  assert.equal(bullet.colliderLength, directFireCase.bulletSize);
  assert.equal(bullet.damageJudgeType, directFireCase.bulletDamageJudgeType);
  assertClose(bullet.angle, 0, "CN Apocalypse Light targeted ray angle");
  assertClose(Math.hypot(bullet.vx, bullet.vy), 0, "CN Apocalypse Light ray speed");
  assert.equal(behindEnemyAfter.hp, behindEnemy.hp);
  assert.ok(forwardEnemyAfter.hp < forwardEnemy.hp);
  assert.equal(bullet.hitEnemyIds.includes(behindEnemy.id), false);
  assert.equal((bullet.hitCooldownSecondsByEnemyId[forwardEnemy.id] ?? 0) > 0, true);
}

function testCnWeaponDirectFireDarkSummonTargetedProjectile(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-dark-summon-targeted-projectile-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseNoTargetState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const noTargetState = updateNfoSimulation(
    {
      ...baseNoTargetState,
      player: {
        ...baseNoTargetState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );

  assert.equal(directFireCase.requiresEnemyTarget, true);
  assert.equal(
    noTargetState.bullets.some((bullet) => bullet.bulletTypeId === directFireCase.bulletTypeId),
    false,
  );

  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const target = createEnemyFixture(
    baseState,
    baseState.player.x + 220,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const bullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));
  const targetAfter = firedState.enemies.find((enemy) => enemy.id === target.id);

  assert.ok(bullet, "expected CN weapon 7 to fire dark summon bullet 17");
  assert.ok(targetAfter, "expected dark summon target to remain alive");
  assert.equal(bullet.damageJudgeType, directFireCase.bulletDamageJudgeType);
  assert.equal(bullet.colliderType, directFireCase.bulletColliderType);
  assert.equal(bullet.colliderWidth, directFireCase.bulletSize);
  assert.equal(bullet.remainingHits, directFireCase.bulletHitTimes);
  assert.equal(bullet.hitTargetType, directFireCase.bulletHitTargetType);
  assertClose(bullet.angle, 0, "CN Dark Summon projectile angle");
  assertClose(bullet.vx, directFireCase.bulletSpeed, "CN Dark Summon projectile vx");
  assertClose(bullet.vy, 0, "CN Dark Summon projectile vy");
  assertClose(
    bullet.remainingSeconds,
    directFireCase.bulletLifeTimeFrames / 30,
    "CN Dark Summon projectile lifetime",
  );
  assert.equal(targetAfter.hp, target.hp);
}

function testCnWeaponDirectFireHurricaneDualBullet(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const projectileCase = getWeaponDirectFireCase(
    "weapon-direct-hurricane-moving-projectile-lv1",
  );
  const fieldCase = getWeaponDirectFireCase("weapon-direct-hurricane-static-field-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseNoTargetState = createNfoSimulation(testRuntimeData, {
    weaponId: projectileCase.weaponId,
  });
  const noTargetState = updateNfoSimulation(
    {
      ...baseNoTargetState,
      player: {
        ...baseNoTargetState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );

  assert.equal(projectileCase.requiresEnemyTarget, true);
  assert.equal(fieldCase.requiresEnemyTarget, true);
  assert.equal(
    noTargetState.bullets.some((bullet) => bullet.bulletTypeId === projectileCase.bulletTypeId),
    false,
  );

  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: projectileCase.weaponId,
  });
  const target = createEnemyFixture(
    baseState,
    baseState.player.x + 220,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const hurricaneBullets = firedState.bullets.filter((candidate) => (
    candidate.bulletTypeId === projectileCase.bulletTypeId
  ));
  const projectileBullet = hurricaneBullets.find((candidate) => Math.hypot(candidate.vx, candidate.vy) > 0);
  const fieldBullet = hurricaneBullets.find((candidate) => Math.hypot(candidate.vx, candidate.vy) === 0);
  const targetAfter = firedState.enemies.find((enemy) => enemy.id === target.id);

  assert.equal(hurricaneBullets.length, projectileCase.weaponDirectFireBulletCount);
  assert.ok(projectileBullet, "expected CN weapon 8 to fire moving hurricane bullet 15");
  assert.ok(fieldBullet, "expected CN weapon 8 to fire static hurricane field bullet 15");
  assert.ok(targetAfter, "expected hurricane target to remain alive");
  assert.equal(projectileBullet.damageJudgeType, projectileCase.bulletDamageJudgeType);
  assert.equal(projectileBullet.colliderWidth, projectileCase.bulletSize);
  assert.equal(projectileBullet.remainingHits, projectileCase.bulletHitTimes);
  assertClose(projectileBullet.angle, 0, "CN Hurricane projectile angle");
  assertClose(projectileBullet.vx, projectileCase.bulletSpeed, "CN Hurricane projectile vx");
  assertClose(projectileBullet.vy, 0, "CN Hurricane projectile vy");
  assertClose(
    projectileBullet.remainingSeconds,
    projectileCase.bulletLifeTimeFrames / 30,
    "CN Hurricane projectile lifetime",
  );
  assert.equal(fieldBullet.damageJudgeType, fieldCase.bulletDamageJudgeType);
  assert.equal(fieldBullet.colliderWidth, fieldCase.bulletSize);
  assert.equal(fieldBullet.remainingHits, fieldCase.bulletHitTimes);
  assertClose(Math.hypot(fieldBullet.vx, fieldBullet.vy), 0, "CN Hurricane field speed");
  assertClose(fieldBullet.x, baseState.player.x, "CN Hurricane field x");
  assertClose(fieldBullet.y, baseState.player.y, "CN Hurricane field y");
  assertClose(
    fieldBullet.remainingSeconds,
    fieldCase.bulletLifeTimeFrames / 30,
    "CN Hurricane field lifetime",
  );
  assert.equal(targetAfter.hp, target.hp);
}

function testCnWeaponDirectFireKnightBladeTargetlessField(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-knight-blade-targetless-field-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const fieldState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const fieldBullet = fieldState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(fieldBullet, "expected CN weapon 4 to fire Knight Blade field without enemies");
  assert.equal(fieldBullet.damageJudgeType, directFireCase.bulletDamageJudgeType);
  assert.equal(fieldBullet.colliderType, directFireCase.bulletColliderType);
  assert.equal(fieldBullet.colliderWidth, directFireCase.bulletSize);
  assert.equal(fieldBullet.remainingHits, directFireCase.bulletHitTimes);
  assertClose(Math.hypot(fieldBullet.vx, fieldBullet.vy), 0, "CN Knight Blade field speed");
  assertClose(fieldBullet.x, baseState.player.x, "CN Knight Blade field x");
  assertClose(fieldBullet.y, baseState.player.y, "CN Knight Blade field y");
  assertClose(
    fieldBullet.remainingSeconds,
    directFireCase.bulletLifeTimeFrames / 30,
    "CN Knight Blade field lifetime",
  );

  const target = createEnemyFixture(
    fieldState,
    fieldBullet.x,
    fieldBullet.y,
    {
      hp: 999999,
      speed: 0,
      radius: 10,
    },
  );
  const hitState = updateNfoSimulation(
    {
      ...fieldState,
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const targetAfterHit = hitState.enemies.find((enemy) => enemy.id === target.id);
  const fieldAfterHit = hitState.bullets.find((candidate) => (
    candidate.id === fieldBullet.id
  ));
  const cooldownState = updateNfoSimulation(
    {
      ...hitState,
      player: {
        ...hitState.player,
        fireCooldownSeconds: 999,
      },
    },
    testRuntimeData,
    NO_INPUT,
    1,
  );
  const targetAfterCooldown = cooldownState.enemies.find((enemy) => enemy.id === target.id);

  assert.ok(targetAfterHit, "expected CN Knight Blade target to remain alive");
  assert.ok(fieldAfterHit, "expected CN Knight Blade field to remain active after first hit");
  assert.ok(targetAfterHit.hp < target.hp);
  assert.equal(fieldAfterHit.remainingHits, directFireCase.bulletHitTimes - 1);
  assert.ok((fieldAfterHit.hitCooldownSecondsByEnemyId[target.id] ?? 0) > 0);
  assert.ok(targetAfterCooldown, "expected CN Knight Blade target to survive cooldown probe");
  assert.equal(targetAfterCooldown.hp, targetAfterHit.hp);
}

function testCnWeaponDirectFireSelfCenteredWithoutEnemyTarget(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-dokidoki-self-centered-dual-field-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
    enemies: [],
  };
  const firedState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const guardField = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));
  const damageField = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === 12
  ));

  assert.ok(guardField, "expected CN weapon 10 to fire DokiDoki guard field bullet 13");
  assert.ok(damageField, "expected CN weapon 10 to also fire DokiDoki damage field bullet 12");
  assert.equal(firedState.bullets.length, directFireCase.weaponDirectFireBulletCount);
  assert.equal(guardField.damageJudgeType, directFireCase.bulletDamageJudgeType);
  assert.equal(guardField.colliderType, directFireCase.bulletColliderType);
  assert.equal(guardField.remainingHits, directFireCase.bulletHitTimes);
  assertClose(Math.hypot(guardField.vx, guardField.vy), 0, "CN DokiDoki guard speed");
  assertClose(Math.hypot(damageField.vx, damageField.vy), 0, "CN DokiDoki damage speed");
  assertClose(guardField.x, state.player.x, "CN DokiDoki guard x");
  assertClose(guardField.y, state.player.y, "CN DokiDoki guard y");
  assertClose(damageField.x, state.player.x, "CN DokiDoki damage x");
  assertClose(damageField.y, state.player.y, "CN DokiDoki damage y");

  const target = createEnemyFixture(
    firedState,
    firedState.player.x,
    firedState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const contactState = updateNfoSimulation(
    {
      ...firedState,
      player: {
        ...firedState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const enemyAfter = contactState.enemies.find((enemy) => enemy.id === target.id);
  const guardFieldAfter = contactState.bullets.find((candidate) => (
    candidate.id === guardField.id
  ));
  const damageFieldAfter = contactState.bullets.find((candidate) => (
    candidate.id === damageField.id
  ));

  assert.ok(enemyAfter, "expected CN DokiDoki target to remain alive");
  assert.ok(guardFieldAfter);
  assert.ok(damageFieldAfter);
  assert.equal(guardFieldAfter.remainingHits, directFireCase.bulletHitTimes);
  assert.equal(guardFieldAfter.hitEnemyIds.length, 0);
  assert.ok(enemyAfter.hp < target.hp);
  assert.ok((damageFieldAfter.hitCooldownSecondsByEnemyId[target.id] ?? 0) > 0);
  assert.equal(damageFieldAfter.remainingHits, damageField.remainingHits - 1);
}

function testCnWeaponDirectFireIaiDualFieldTiming(sourceRuntimeData: NfoOfflineRuntimeData) {
  const instantCase = getWeaponDirectFireCase("weapon-direct-iai-instant-field-lv1");
  const delayedCase = getWeaponDirectFireCase("weapon-direct-iai-delayed-field-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, { weaponId: instantCase.weaponId });
  const target = createEnemyFixture(
    baseState,
    baseState.player.x,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 10,
    },
  );
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const instantField = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === instantCase.bulletTypeId
  ));
  const delayedField = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === delayedCase.bulletTypeId
  ));
  const targetAfterInstant = firedState.enemies.find((enemy) => enemy.id === target.id);

  assert.ok(instantField, "expected CN weapon 24 to fire instant Iai field bullet 25");
  assert.ok(delayedField, "expected CN weapon 24 to fire delayed Iai field bullet 26");
  assert.equal(firedState.bullets.length, instantCase.weaponDirectFireBulletCount);
  assert.equal(delayedCase.weaponDirectFireBulletCount, instantCase.weaponDirectFireBulletCount);
  assert.equal(instantField.colliderType, instantCase.bulletColliderType);
  assert.equal(delayedField.colliderType, delayedCase.bulletColliderType);
  assert.equal(instantField.damageJudgeType, instantCase.bulletDamageJudgeType);
  assert.equal(delayedField.damageJudgeType, delayedCase.bulletDamageJudgeType);
  assert.equal(instantField.colliderWidth, instantCase.bulletSize);
  assert.equal(delayedField.colliderWidth, delayedCase.bulletSize);
  assert.equal(instantField.remainingHits, instantCase.bulletHitTimes - 1);
  assert.equal(delayedField.remainingHits, delayedCase.bulletHitTimes);
  assertClose(Math.hypot(instantField.vx, instantField.vy), 0, "CN Iai instant field speed");
  assertClose(Math.hypot(delayedField.vx, delayedField.vy), 0, "CN Iai delayed field speed");
  assertClose(instantField.x, baseState.player.x, "CN Iai instant field x");
  assertClose(instantField.y, baseState.player.y, "CN Iai instant field y");
  assertClose(delayedField.x, baseState.player.x, "CN Iai delayed field x");
  assertClose(delayedField.y, baseState.player.y, "CN Iai delayed field y");
  assertClose(
    delayedField.damageJudgeDelaySeconds,
    delayedCase.bulletDamageJudgeDelayFrames / 30,
    "CN Iai delayed field damage delay",
  );
  assert.ok(targetAfterInstant, "expected CN Iai target to remain alive after instant hit");
  assert.ok(targetAfterInstant.hp < target.hp);

  const beforeDelayState = updateNfoSimulation(
    {
      ...firedState,
      player: {
        ...firedState.player,
        fireCooldownSeconds: 999,
      },
    },
    testRuntimeData,
    NO_INPUT,
    (delayedCase.bulletDamageJudgeDelayFrames - 1) / 30,
  );
  const targetBeforeDelay = beforeDelayState.enemies.find((enemy) => enemy.id === target.id);

  assert.ok(targetBeforeDelay, "expected CN Iai target to remain alive before delayed field arms");
  assert.equal(targetBeforeDelay.hp, targetAfterInstant.hp);

  const hitState = updateNfoSimulation(
    beforeDelayState,
    testRuntimeData,
    NO_INPUT,
    2 / 30,
  );
  const targetAfterDelay = hitState.enemies.find((enemy) => enemy.id === target.id);
  const delayedFieldAfterHit = hitState.bullets.find((candidate) => (
    candidate.id === delayedField.id
  ));

  assert.ok(targetAfterDelay, "expected CN Iai target to remain alive after delayed field hit");
  assert.ok(delayedFieldAfterHit, "expected CN Iai delayed field to remain active after hit");
  assert.ok(targetAfterDelay.hp < targetBeforeDelay.hp);
  assert.equal(delayedFieldAfterHit.remainingHits, delayedCase.bulletHitTimes - 1);
}

function testCnWeaponDirectFireCardinalForceDirections(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const leftCase = getWeaponDirectFireCase("weapon-direct-holy-shield-left-force");
  const rightCase = getWeaponDirectFireCase("weapon-direct-holy-shield-right-force");
  const downCase = getWeaponDirectFireCase("weapon-direct-holy-shield-down-force");
  const upCase = getWeaponDirectFireCase("weapon-direct-holy-shield-up-force");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, { weaponId: leftCase.weaponId });
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
    enemies: [],
  };
  const firedState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const forceBullets = new Map(firedState.bullets.map((bullet) => [bullet.bulletTypeId, bullet]));
  const leftBullet = forceBullets.get(leftCase.bulletTypeId);
  const rightBullet = forceBullets.get(rightCase.bulletTypeId);
  const downBullet = forceBullets.get(downCase.bulletTypeId);
  const upBullet = forceBullets.get(upCase.bulletTypeId);

  assert.equal(firedState.bullets.length, leftCase.weaponDirectFireBulletCount);
  assert.ok(leftBullet, "expected CN weapon 11 to fire left force bullet 7 without enemies");
  assert.ok(rightBullet, "expected CN weapon 11 to fire right force bullet 8 without enemies");
  assert.ok(downBullet, "expected CN weapon 11 to fire down force bullet 9 without enemies");
  assert.ok(upBullet, "expected CN weapon 11 to fire up force bullet 10 without enemies");
  assert.equal(leftBullet.forceType, leftCase.bulletForceType);
  assert.equal(rightBullet.forceType, rightCase.bulletForceType);
  assert.equal(downBullet.forceType, downCase.bulletForceType);
  assert.equal(upBullet.forceType, upCase.bulletForceType);
  assertClose(leftBullet.vx, -leftCase.bulletSpeed, "CN Holy Shield left vx");
  assertClose(leftBullet.vy, 0, "CN Holy Shield left vy");
  assertClose(rightBullet.vx, rightCase.bulletSpeed, "CN Holy Shield right vx");
  assertClose(rightBullet.vy, 0, "CN Holy Shield right vy");
  assertClose(downBullet.vx, 0, "CN Holy Shield down vx");
  assertClose(downBullet.vy, downCase.bulletSpeed, "CN Holy Shield down vy");
  assertClose(upBullet.vx, 0, "CN Holy Shield up vx");
  assertClose(upBullet.vy, -upCase.bulletSpeed, "CN Holy Shield up vy");
}

function testCnWeaponDirectFireOwnerForwardRay(sourceRuntimeData: NfoOfflineRuntimeData) {
  const rayCase = getWeaponDirectFireCase("weapon-direct-chainsaw-owner-forward-ray-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, { weaponId: rayCase.weaponId });
  const behindEnemy = createEnemyFixture(
    baseState,
    baseState.player.x - 160,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const forwardEnemy = {
    ...createEnemyFixture(
      baseState,
      baseState.player.x + 200,
      baseState.player.y,
      {
        hp: 999999,
        speed: 0,
        radius: 5,
      },
    ),
    id: 900002,
  };
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
    enemies: [behindEnemy, forwardEnemy],
  };
  const firedState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const bullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === rayCase.bulletTypeId
  ));
  const behindEnemyAfter = firedState.enemies.find((enemy) => enemy.id === behindEnemy.id);
  const forwardEnemyAfter = firedState.enemies.find((enemy) => enemy.id === forwardEnemy.id);

  assert.ok(bullet, "expected CN weapon 12 to fire chainsaw ray bullet 19");
  assert.ok(behindEnemyAfter, "expected behind chainsaw target to remain alive");
  assert.ok(forwardEnemyAfter, "expected forward chainsaw target to remain alive");
  assert.equal(bullet.colliderType, rayCase.bulletColliderType);
  assert.equal(bullet.colliderWidth, rayCase.bulletSize);
  assert.equal(bullet.colliderLength, rayCase.bulletSize2);
  assertClose(bullet.angle, 0, "CN Chainsaw owner-forward ray angle");
  assertClose(Math.hypot(bullet.vx, bullet.vy), 0, "CN Chainsaw ray speed");
  assert.equal(behindEnemyAfter.hp, behindEnemy.hp);
  assert.ok(forwardEnemyAfter.hp < forwardEnemy.hp);
  assert.equal(bullet.hitEnemyIds.includes(behindEnemy.id), false);
  assert.equal((bullet.hitCooldownSecondsByEnemyId[forwardEnemy.id] ?? 0) > 0, true);

  const upwardBaseState = createNfoSimulation(testRuntimeData, { weaponId: rayCase.weaponId });
  const sideEnemy = createEnemyFixture(
    upwardBaseState,
    upwardBaseState.player.x + 200,
    upwardBaseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const upwardEnemy = {
    ...createEnemyFixture(
      upwardBaseState,
      upwardBaseState.player.x,
      upwardBaseState.player.y + 200,
      {
        hp: 999999,
        speed: 0,
        radius: 5,
      },
    ),
    id: 900004,
  };
  const upwardState = updateNfoSimulation(
    {
      ...upwardBaseState,
      player: {
        ...upwardBaseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [sideEnemy, upwardEnemy],
    },
    testRuntimeData,
    { moveX: 0, moveY: 1 },
    0,
  );
  const upwardBullet = upwardState.bullets.find((candidate) => (
    candidate.bulletTypeId === rayCase.bulletTypeId
  ));
  const sideEnemyAfter = upwardState.enemies.find((enemy) => enemy.id === sideEnemy.id);
  const upwardEnemyAfter = upwardState.enemies.find((enemy) => enemy.id === upwardEnemy.id);

  assert.ok(upwardBullet, "expected CN weapon 12 upward-facing ray bullet 19");
  assert.ok(sideEnemyAfter, "expected side chainsaw target to remain alive");
  assert.ok(upwardEnemyAfter, "expected upward chainsaw target to remain alive");
  assertClose(upwardState.player.facingAngle, Math.PI / 2, "CN Chainsaw player facing");
  assertClose(upwardBullet.angle, Math.PI / 2, "CN Chainsaw upward ray angle");
  assert.equal(sideEnemyAfter.hp, sideEnemy.hp);
  assert.ok(upwardEnemyAfter.hp < upwardEnemy.hp);
}

function testCnWeaponDirectFireOwnerForwardRect(sourceRuntimeData: NfoOfflineRuntimeData) {
  const rectCase = getWeaponDirectFireCase(
    "weapon-direct-knight-feather-owner-forward-rect-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === rectCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === rectCase.weaponLevel
  ));
  const fireBullet = weaponLevel?.fireBullets.find((candidate) => (
    candidate.bulletTypeId === rectCase.bulletTypeId
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  assert.ok(fireBullet);
  weaponLevel.fireBullets = [{ ...fireBullet }];

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: rectCase.weaponId });
  const behindEnemy = createEnemyFixture(
    baseState,
    baseState.player.x - 260,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
    enemies: [behindEnemy],
  };
  const firedState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const bullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === rectCase.bulletTypeId
  ));
  const behindEnemyAfter = firedState.enemies.find((enemy) => enemy.id === behindEnemy.id);

  assert.ok(bullet, "expected CN weapon 13 to fire knight feather rect bullet 20");
  assert.ok(behindEnemyAfter, "expected behind rect target to remain alive");
  assert.equal(bullet.colliderType, rectCase.bulletColliderType);
  assert.equal(bullet.colliderWidth, rectCase.bulletSize);
  assert.equal(bullet.colliderLength, Math.max(rectCase.bulletSize, rectCase.bulletSize2));
  assertClose(bullet.angle, 0, "CN Knight Feather owner-forward rect angle");
  assertClose(Math.hypot(bullet.vx, bullet.vy), 0, "CN Knight Feather rect speed");
  assert.equal(behindEnemyAfter.hp, behindEnemy.hp);
  assert.equal(bullet.hitEnemyIds.includes(behindEnemy.id), false);
}

function testCnWeaponDirectFireDamageJudgeNoneForce(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-holy-shield-impact-damage-judge-none-force",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === directFireCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === directFireCase.weaponLevel
  ));
  const fireBullet = weaponLevel?.fireBullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  assert.ok(fireBullet);
  weaponLevel.fireBullets = [{ ...fireBullet }];

  const baseState = createStateWithEnemy(
    testRuntimeData,
    { x: 90, y: 0 },
    directFireCase.weaponId,
  );
  const enemyBefore = baseState.enemies[0];
  assert.ok(enemyBefore);
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
    enemies: [
      {
        ...enemyBefore,
        hp: 999999,
        maxHp: 999999,
        attack: 0,
        speed: 0,
        radius: 10,
      },
    ],
  };
  const nextState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const bullet = nextState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));
  const enemyAfter = nextState.enemies[0];

  assert.ok(bullet, "expected CN weapon 11 to fire shield impact bullet 6");
  assert.ok(enemyAfter, "expected force-only target to remain alive");
  assert.equal(bullet.damageJudgeType, directFireCase.bulletDamageJudgeType);
  assert.equal(bullet.forceType, directFireCase.bulletForceType);
  assert.equal(bullet.force, directFireCase.bulletForce);
  assert.equal(bullet.remainingHits, directFireCase.bulletHitTimes);
  assert.equal(enemyAfter.hp, state.enemies[0]?.hp);
  assert.ok(enemyAfter.x > (state.enemies[0]?.x ?? Number.POSITIVE_INFINITY));
  assertClose(enemyAfter.y, state.enemies[0]?.y ?? Number.NaN, "CN damage-judge-none force y");
}

function testCnWeaponDirectFireRayHitBuff(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-courage-song-ray-hit-buff-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === directFireCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === directFireCase.weaponLevel
  ));
  const fireBullet = weaponLevel?.fireBullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  assert.ok(fireBullet);
  weaponLevel.fireBullets = [{ ...fireBullet }];

  const noTargetBaseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const noTargetState = updateNfoSimulation(
    {
      ...noTargetBaseState,
      player: {
        ...noTargetBaseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const noTargetBullet = noTargetState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(noTargetBullet, "expected CN weapon 14 to fire ray bullet 18 without enemies");
  assertClose(noTargetBullet.angle, 0, "CN Courage Song targetless owner-forward ray angle");
  assertClose(noTargetBullet.vx, directFireCase.bulletSpeed, "CN Courage Song targetless vx");
  assertClose(noTargetBullet.vy, 0, "CN Courage Song targetless vy");

  const upwardNoTargetBaseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const upwardNoTargetState = updateNfoSimulation(
    {
      ...upwardNoTargetBaseState,
      player: {
        ...upwardNoTargetBaseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    { moveX: 0, moveY: 1 },
    0,
  );
  const upwardNoTargetBullet = upwardNoTargetState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(upwardNoTargetBullet, "expected CN weapon 14 upward ray without enemies");
  assertClose(
    upwardNoTargetBullet.angle,
    Math.PI / 2,
    "CN Courage Song upward targetless owner-forward ray angle",
  );
  assertClose(upwardNoTargetBullet.vx, 0, "CN Courage Song upward targetless vx");
  assertClose(
    upwardNoTargetBullet.vy,
    directFireCase.bulletSpeed,
    "CN Courage Song upward targetless vy",
  );

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: directFireCase.weaponId });
  const behindEnemy = {
    ...createEnemyFixture(
      baseState,
      baseState.player.x - 80,
      baseState.player.y,
      {
        hp: 999999,
        speed: 0,
        radius: 10,
      },
    ),
    id: 900003,
  };
  const insideEnemy = createEnemyFixture(
    baseState,
    baseState.player.x + directFireCase.bulletSize2 / 2,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 10,
    },
  );
  const outsideEnemy = {
    ...createEnemyFixture(
      baseState,
      baseState.player.x + directFireCase.bulletSize2 + 150,
      baseState.player.y,
      {
        hp: 999999,
        speed: 0,
        radius: 10,
      },
    ),
    id: 900002,
  };
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
    enemies: [behindEnemy, insideEnemy, outsideEnemy],
  };
  const nextState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const bullet = nextState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));
  const hitEnemy = nextState.enemies.find((enemy) => enemy.id === insideEnemy.id);
  const missedEnemy = nextState.enemies.find((enemy) => enemy.id === outsideEnemy.id);
  const behindEnemyAfter = nextState.enemies.find((enemy) => enemy.id === behindEnemy.id);
  const hitBuff = hitEnemy?.activeBuffs.find((buff) => buff.id === directFireCase.hitBuffId);

  assert.ok(bullet, "expected CN weapon 14 to fire ray bullet 18");
  assert.ok(hitEnemy, "expected inside ray target to remain alive");
  assert.ok(missedEnemy, "expected outside ray target to remain alive");
  assert.ok(behindEnemyAfter, "expected behind ray target to remain alive");
  assert.equal(bullet.colliderType, directFireCase.bulletColliderType);
  assert.equal(bullet.colliderWidth, directFireCase.bulletSize);
  assert.equal(bullet.colliderLength, directFireCase.bulletSize2);
  assert.equal(bullet.hitBuffId, directFireCase.hitBuffId);
  assert.equal(bullet.hitBuffLevel, directFireCase.hitBuffLevel);
  assertClose(bullet.angle, 0, "CN Courage Song owner-forward ray angle");
  assertClose(bullet.vx, directFireCase.bulletSpeed, "CN Courage Song owner-forward vx");
  assertClose(bullet.vy, 0, "CN Courage Song owner-forward vy");
  assert.equal(bullet.remainingHits, directFireCase.bulletHitTimes - 1);
  assert.equal(behindEnemyAfter.hp, behindEnemy.hp);
  assert.equal(behindEnemyAfter.activeBuffs.length, 0);
  assert.ok(hitEnemy.hp < insideEnemy.hp);
  assert.ok(hitBuff, "expected CN Courage Song ray to apply slow buff 1");
  assert.equal(hitBuff.type, 1);
  assert.equal(hitBuff.value, -80);
  assert.equal(hitBuff.attributes[0]?.attributeType, 4);
  assert.equal(hitBuff.attributes[0]?.value, -80);
  assert.equal(missedEnemy.hp, outsideEnemy.hp);
  assert.equal(missedEnemy.activeBuffs.length, 0);
}

function testCnWeaponDirectFireFreezeField(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-blizzard-freeze-field-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === directFireCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === directFireCase.weaponLevel
  ));
  const fireBullet = weaponLevel?.fireBullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  assert.ok(fireBullet);
  weaponLevel.fireBullets = [{ ...fireBullet }];

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: directFireCase.weaponId });
  const noTargetState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const fieldBullet = noTargetState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(fieldBullet, "expected CN weapon 15 to fire freeze field bullet 21 without enemies");
  assert.equal(fieldBullet.colliderType, directFireCase.bulletColliderType);
  assert.equal(fieldBullet.colliderWidth, directFireCase.bulletSize);
  assert.equal(fieldBullet.hitBuffId, directFireCase.hitBuffId);
  assert.equal(fieldBullet.hitBuffLevel, directFireCase.hitBuffLevel);
  assertClose(Math.hypot(fieldBullet.vx, fieldBullet.vy), 0, "CN Blizzard field speed");
  assertClose(fieldBullet.x, baseState.player.x, "CN Blizzard field x");
  assertClose(fieldBullet.y, baseState.player.y, "CN Blizzard field y");

  const target = createEnemyFixture(
    noTargetState,
    noTargetState.player.x,
    noTargetState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 10,
    },
  );
  const hitState = updateNfoSimulation(
    {
      ...noTargetState,
      player: {
        ...noTargetState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const targetAfter = hitState.enemies.find((enemy) => enemy.id === target.id);
  const freezeBuff = targetAfter?.activeBuffs.find((buff) => (
    buff.id === directFireCase.hitBuffId
  ));

  assert.ok(targetAfter, "expected CN Blizzard field target to remain alive");
  assert.ok(targetAfter.hp < target.hp);
  assert.ok(freezeBuff, "expected CN Blizzard field to apply freeze buff 2");
  assert.equal(freezeBuff.type, 3);
  assertClose(freezeBuff.remainingSeconds, 1, "CN Blizzard freeze duration seconds");
}

function testCnWeaponLevelMinionCount(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weaponMinionCase = getWeaponMinionCase("weapon-minion-offensive-turret-lv1");
  const minionData = testRuntimeData.minions.find((candidate) => (
    candidate.id === weaponMinionCase.minionId
  ));
  assert.ok(minionData);
  minionData.speed = 0;

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: weaponMinionCase.weaponId });
  const state = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 600,
        baseState.player.y,
        {
          hp: 999999,
          speed: 0,
          radius: 5,
        },
      ),
    ],
  };
  const firedState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const minionBullets = firedState.bullets.filter((candidate) => (
    candidate.bulletTypeId === weaponMinionCase.bulletTypeId
  ));
  const minionPositions = firedState.minions.map((minion) => `${minion.x}:${minion.y}`);

  assert.equal(firedState.minions.length, weaponMinionCase.minionCount);
  assert.equal(minionBullets.length, weaponMinionCase.minionCount);
  assert.equal(new Set(minionPositions).size, weaponMinionCase.minionCount);
  assert.equal(weaponMinionCase.weaponFireCooldownFrames, 60);
  assert.ok(minionBullets.every((bullet) => bullet.hitTargetType === weaponMinionCase.bulletHitTargetType));
  for (const bullet of minionBullets) {
    const sourceMinion = firedState.minions.find((minion) => (
      Math.abs(minion.x - bullet.x) < 0.000001
      && Math.abs(minion.y - bullet.y) < 0.000001
    ));
    assert.ok(sourceMinion, "expected CN weapon 22 bullet 33 to originate at a turret minion");
    assert.equal(bullet.damageJudgeType, weaponMinionCase.bulletDamageJudgeType);
    assert.equal(bullet.colliderType, weaponMinionCase.bulletColliderType);
    assert.equal(bullet.colliderWidth, weaponMinionCase.bulletSize);
    assert.equal(bullet.remainingHits, weaponMinionCase.bulletHitTimes);
    assertClose(
      Math.hypot(bullet.vx, bullet.vy),
      weaponMinionCase.bulletSpeed,
      "CN Offensive Turret bullet 33 speed",
    );
    assertClose(
      bullet.remainingSeconds,
      weaponMinionCase.bulletLifeTimeFrames / 30,
      "CN Offensive Turret bullet 33 lifetime",
    );
    assertClose(
      bullet.damageJudgeDelaySeconds,
      weaponMinionCase.bulletDamageJudgeDelayFrames / 30,
      "CN Offensive Turret bullet 33 damage judge delay",
    );
    assertClose(
      bullet.damageJudgeCooldownSeconds,
      weaponMinionCase.bulletDamageJudgeCooldownFrames / 30,
      "CN Offensive Turret bullet 33 damage judge cooldown",
    );
  }
}

function testCnWeaponBasicSummonMinionFiresFromMinion(sourceRuntimeData: NfoOfflineRuntimeData) {
  const weaponMinionCase = getWeaponMinionCase("weapon-minion-summon-basic-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const minionData = testRuntimeData.minions.find((candidate) => (
    candidate.id === weaponMinionCase.minionId
  ));
  assert.ok(minionData);
  minionData.speed = 0;

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: weaponMinionCase.weaponId });
  const target = createEnemyFixture(
    baseState,
    baseState.player.x + 600,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const minion = firedState.minions.find((candidate) => (
    candidate.minionId === weaponMinionCase.minionId
  ));
  const bullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === weaponMinionCase.bulletTypeId
  ));

  assert.equal(firedState.minions.length, weaponMinionCase.minionCount);
  assert.ok(minion, "expected CN weapon 16 to create minion 2");
  assert.ok(bullet, "expected CN weapon 16 minion to fire bullet 22");
  assert.equal(minion.weaponId, weaponMinionCase.weaponId);
  assert.equal(minion.weaponLevel, weaponMinionCase.weaponLevel);
  assert.equal(minion.aiTypeId, weaponMinionCase.minionAITypeId);
  assertClose(bullet.x, minion.x, "CN Summon bullet x");
  assertClose(bullet.y, minion.y, "CN Summon bullet y");
  assert.equal(bullet.hitTargetType, weaponMinionCase.bulletHitTargetType);
  assert.equal(bullet.colliderWidth, weaponMinionCase.bulletSize);
  assert.equal(bullet.remainingHits, weaponMinionCase.bulletHitTimes);
  assertClose(
    Math.hypot(bullet.vx, bullet.vy),
    weaponMinionCase.bulletSpeed,
    "CN Summon bullet speed",
  );
  assertClose(
    bullet.remainingSeconds,
    weaponMinionCase.bulletLifeTimeFrames / 30,
    "CN Summon bullet lifetime",
  );
  assert.ok(bullet.vx > 0, "expected CN Summon bullet to travel toward the target");
}

function testCnWeaponFairyMinionFiresFromMinion(sourceRuntimeData: NfoOfflineRuntimeData) {
  const weaponMinionCase = getWeaponMinionCase("weapon-minion-fairy-basic-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const minionData = testRuntimeData.minions.find((candidate) => (
    candidate.id === weaponMinionCase.minionId
  ));
  assert.ok(minionData);
  minionData.speed = 0;

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: weaponMinionCase.weaponId });
  const target = createEnemyFixture(
    baseState,
    baseState.player.x + 600,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const minion = firedState.minions.find((candidate) => (
    candidate.minionId === weaponMinionCase.minionId
  ));
  const bullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === weaponMinionCase.bulletTypeId
  ));

  assert.equal(weaponMinionCase.weaponId, 19);
  assert.equal(weaponMinionCase.weaponType, 1);
  assert.equal(weaponMinionCase.weaponMinionId, 6);
  assert.equal(firedState.minions.length, weaponMinionCase.minionCount);
  assert.ok(minion, "expected CN weapon 19 to create minion 6");
  assert.ok(bullet, "expected CN weapon 19 minion to fire bullet 29");
  assert.equal(minion.aiTypeId, weaponMinionCase.minionAITypeId);
  assert.equal(minion.canFireOwnWeapon, false);
  assert.equal(bullet.hitTargetType, weaponMinionCase.bulletHitTargetType);
  assert.equal(bullet.damageJudgeType, weaponMinionCase.bulletDamageJudgeType);
  assert.equal(bullet.colliderWidth, weaponMinionCase.bulletSize);
  assert.equal(bullet.remainingHits, weaponMinionCase.bulletHitTimes);
  assertClose(bullet.x, minion.x, "CN Fairy bullet x");
  assertClose(bullet.y, minion.y, "CN Fairy bullet y");
  assertClose(
    Math.hypot(bullet.vx, bullet.vy),
    weaponMinionCase.bulletSpeed,
    "CN Fairy bullet speed",
  );
  assertClose(
    bullet.remainingSeconds,
    weaponMinionCase.bulletLifeTimeFrames / 30,
    "CN Fairy bullet lifetime",
  );
  assert.ok(bullet.vx > 0, "expected CN Fairy bullet to travel toward the target");
}

function testCnWeaponLeoMinionWaitsForAIWeaponGate(sourceRuntimeData: NfoOfflineRuntimeData) {
  const weaponMinionCase = getWeaponMinionCase("weapon-minion-leo-ai-gated-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const minionData = testRuntimeData.minions.find((candidate) => (
    candidate.id === weaponMinionCase.minionId
  ));
  assert.ok(minionData);
  minionData.speed = 0;

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: weaponMinionCase.weaponId });
  const target = createEnemyFixture(
    baseState,
    baseState.player.x + 160,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 20,
    },
  );
  const spawnState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const leoMinion = spawnState.minions.find((candidate) => (
    candidate.minionId === weaponMinionCase.minionId
  ));

  assert.equal(weaponMinionCase.weaponId, 26);
  assert.equal(weaponMinionCase.weaponType, 1);
  assert.equal(weaponMinionCase.weaponMinionId, 4);
  assert.equal(spawnState.minions.length, weaponMinionCase.minionCount);
  assert.ok(leoMinion, "expected CN weapon 26 to create Leo minion 4");
  assert.equal(leoMinion.aiTypeId, weaponMinionCase.minionAITypeId);
  assert.equal(leoMinion.canFireOwnWeapon, true);
  assert.equal(
    spawnState.bullets.some((bullet) => bullet.bulletTypeId === weaponMinionCase.bulletTypeId),
    false,
  );

  const enterMoveState = updateNfoSimulation(spawnState, testRuntimeData, NO_INPUT, 30 / 30);
  const enterRoarState = updateNfoSimulation(enterMoveState, testRuntimeData, NO_INPUT, 30 / 30);
  const beforeGateState = updateNfoSimulation(enterRoarState, testRuntimeData, NO_INPUT, 19 / 30);
  assert.equal(
    beforeGateState.bullets.some((bullet) => bullet.bulletTypeId === weaponMinionCase.bulletTypeId),
    false,
  );

  const firedState = updateNfoSimulation(beforeGateState, testRuntimeData, NO_INPUT, 2 / 30);
  const bullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === weaponMinionCase.bulletTypeId
  ));
  const minionAfterFire = firedState.minions.find((candidate) => (
    candidate.minionId === weaponMinionCase.minionId
  ));

  assert.ok(minionAfterFire, "expected CN Leo minion to remain alive after gated fire");
  assert.equal(minionAfterFire.aiStateId, 2);
  assert.ok(bullet, "expected CN Leo AI FireAllWeaponNow to fire bullet 34");
  assertClose(bullet.x, minionAfterFire.x, "CN Leo bullet x");
  assertClose(bullet.y, minionAfterFire.y, "CN Leo bullet y");
  assert.equal(bullet.hitTargetType, weaponMinionCase.bulletHitTargetType);
  assert.equal(bullet.damageJudgeType, weaponMinionCase.bulletDamageJudgeType);
  assert.equal(bullet.hitBuffId, weaponMinionCase.hitBuffId);
  assert.equal(bullet.hitBuffLevel, weaponMinionCase.hitBuffLevel);
  assert.equal(bullet.colliderWidth, weaponMinionCase.bulletSize);
  assert.equal(bullet.remainingHits, weaponMinionCase.bulletHitTimes);
  assertClose(Math.hypot(bullet.vx, bullet.vy), 0, "CN Leo bullet speed");
  assertClose(
    bullet.remainingSeconds,
    (weaponMinionCase.bulletLifeTimeFrames - 2) / 30,
    "CN Leo bullet lifetime after fire frame",
  );
  assertClose(
    bullet.damageJudgeDelaySeconds,
    (weaponMinionCase.bulletDamageJudgeDelayFrames - 2) / 30,
    "CN Leo bullet damage delay after fire frame",
  );
  assertClose(
    bullet.damageJudgeCooldownSeconds,
    weaponMinionCase.bulletDamageJudgeCooldownFrames / 30,
    "CN Leo bullet damage cooldown",
  );
}

function testCnWeaponDirectFireStunField(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-judgement-stun-field-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === directFireCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === directFireCase.weaponLevel
  ));
  const fireBullet = weaponLevel?.fireBullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  assert.ok(fireBullet);
  weaponLevel.fireBullets = [{ ...fireBullet }];

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: directFireCase.weaponId });
  const noTargetState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const fieldBullet = noTargetState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(fieldBullet, "expected CN weapon 17 to fire stun field bullet 23 without enemies");
  assert.equal(fieldBullet.colliderType, directFireCase.bulletColliderType);
  assert.equal(fieldBullet.colliderWidth, directFireCase.bulletSize);
  assert.equal(fieldBullet.hitBuffId, directFireCase.hitBuffId);
  assert.equal(fieldBullet.hitBuffLevel, directFireCase.hitBuffLevel);
  assertClose(Math.hypot(fieldBullet.vx, fieldBullet.vy), 0, "CN Judgement field speed");
  assertClose(fieldBullet.x, baseState.player.x, "CN Judgement field x");
  assertClose(fieldBullet.y, baseState.player.y, "CN Judgement field y");

  const target = createEnemyFixture(
    noTargetState,
    noTargetState.player.x,
    noTargetState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 10,
    },
  );
  const armedState = {
    ...noTargetState,
    player: {
      ...noTargetState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [target],
  };
  const beforeDelayState = updateNfoSimulation(
    armedState,
    testRuntimeData,
    NO_INPUT,
    (directFireCase.bulletDamageJudgeDelayFrames - 1) / 30,
  );
  const targetBeforeDelay = beforeDelayState.enemies.find((enemy) => enemy.id === target.id);

  assert.ok(targetBeforeDelay, "expected CN Judgement field pre-delay target to remain alive");
  assert.equal(targetBeforeDelay.hp, target.hp);
  assert.equal(
    targetBeforeDelay.activeBuffs.some((buff) => buff.id === directFireCase.hitBuffId),
    false,
  );

  const hitState = updateNfoSimulation(
    beforeDelayState,
    testRuntimeData,
    NO_INPUT,
    2 / 30,
  );
  const targetAfter = hitState.enemies.find((enemy) => enemy.id === target.id);
  const stunBuff = targetAfter?.activeBuffs.find((buff) => (
    buff.id === directFireCase.hitBuffId
  ));

  assert.ok(targetAfter, "expected CN Judgement field target to remain alive");
  assert.ok(targetAfter.hp < target.hp);
  assert.ok(stunBuff, "expected CN Judgement field to apply stun buff 3");
  assert.equal(stunBuff.type, 2);
  assertClose(stunBuff.remainingSeconds, 1, "CN Judgement stun duration seconds");
}

function testCnWeaponDirectFireDotHitBuff(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-six-star-dot-hit-buff-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === directFireCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === directFireCase.weaponLevel
  ));
  const fireBullet = weaponLevel?.fireBullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  assert.ok(fireBullet);
  weaponLevel.fireBullets = [{ ...fireBullet }];

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: directFireCase.weaponId });
  const target = createEnemyFixture(
    baseState,
    baseState.player.x + 20,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 10,
    },
  );
  const hitState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const bullet = hitState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));
  const targetAfterHit = hitState.enemies.find((enemy) => enemy.id === target.id);
  const dotBuff = targetAfterHit?.activeBuffs.find((buff) => (
    buff.id === directFireCase.hitBuffId
  ));

  assert.ok(bullet, "expected CN weapon 18 to fire Six Star bullet 28");
  assert.equal(bullet.hitBuffId, directFireCase.hitBuffId);
  assert.equal(bullet.hitBuffLevel, directFireCase.hitBuffLevel);
  assert.equal(bullet.damageJudgeType, directFireCase.bulletDamageJudgeType);
  assert.equal(bullet.remainingHits, directFireCase.bulletHitTimes - 1);
  assert.ok(targetAfterHit, "expected CN weapon 18 target to remain alive");
  assert.ok(targetAfterHit.hp < target.hp);
  assert.ok(dotBuff, "expected CN weapon 18 bullet 28 to apply DOT buff 4");
  assert.equal(dotBuff.type, 4);
  assert.equal(dotBuff.value, 1);
  assert.equal(dotBuff.stackCount, 1);
  assert.equal(dotBuff.maxStackCount, 2);
  assertClose(dotBuff.remainingSeconds, 5, "CN Six Star DOT duration seconds");

  const tickState = updateNfoSimulation(
    {
      ...hitState,
      player: {
        ...hitState.player,
        fireCooldownSeconds: 999,
      },
    },
    testRuntimeData,
    NO_INPUT,
    1,
  );
  const targetAfterTick = tickState.enemies.find((enemy) => enemy.id === target.id);
  const dotBuffAfterTick = targetAfterTick?.activeBuffs.find((buff) => (
    buff.id === directFireCase.hitBuffId
  ));

  assert.ok(targetAfterTick, "expected CN weapon 18 DOT target to remain alive");
  assert.equal(targetAfterTick.hp, (targetAfterHit?.hp ?? Number.NaN) - 1);
  assert.ok(dotBuffAfterTick, "expected CN Six Star DOT buff to remain after one tick");
  assertClose(dotBuffAfterTick.remainingSeconds, 4, "CN Six Star DOT remaining seconds");
}

function testCnWeaponDirectFireGroupTiming(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-galaxy-light-grouped-field-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const readyState = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
    enemies: [],
  };
  const groupCooldownSeconds = directFireCase.weaponFireGroupCooldownFrames / 30;
  const fullCooldownSeconds = directFireCase.weaponFireCooldownFrames / 30;

  const firstState = updateNfoSimulation(readyState, testRuntimeData, NO_INPUT, 0);
  const secondState = updateNfoSimulation(firstState, testRuntimeData, NO_INPUT, groupCooldownSeconds);
  const thirdState = updateNfoSimulation(secondState, testRuntimeData, NO_INPUT, groupCooldownSeconds);
  const fourthState = updateNfoSimulation(thirdState, testRuntimeData, NO_INPUT, groupCooldownSeconds);
  const galaxyBullets = fourthState.bullets.filter((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.equal(directFireCase.weaponGroupCount, 4);
  assert.equal(firstState.bullets.length, 1);
  assert.equal(firstState.player.pendingFireGroups, 3);
  assertClose(
    firstState.player.fireCooldownSeconds,
    groupCooldownSeconds,
    "CN Galaxy Light first group cooldown",
  );
  assert.equal(secondState.bullets.length, 2);
  assert.equal(secondState.player.pendingFireGroups, 2);
  assertClose(
    secondState.player.fireCooldownSeconds,
    groupCooldownSeconds,
    "CN Galaxy Light second group cooldown",
  );
  assert.equal(thirdState.bullets.length, 3);
  assert.equal(thirdState.player.pendingFireGroups, 1);
  assertClose(
    thirdState.player.fireCooldownSeconds,
    groupCooldownSeconds,
    "CN Galaxy Light third group cooldown",
  );
  assert.equal(galaxyBullets.length, directFireCase.weaponGroupCount);
  assert.ok(galaxyBullets.every((bullet) => bullet.bulletTypeId === directFireCase.bulletTypeId));
  assert.ok(galaxyBullets.every((bullet) => bullet.damageJudgeType === directFireCase.bulletDamageJudgeType));
  assert.ok(galaxyBullets.every((bullet) => Math.hypot(bullet.vx, bullet.vy) === directFireCase.bulletSpeed));
  assert.equal(fourthState.player.pendingFireGroups, 0);
  assertClose(
    fourthState.player.fireCooldownSeconds,
    fullCooldownSeconds,
    "CN Galaxy Light full cooldown after final group",
  );
}

function testCnWeaponDirectFireBlackHoleInwardForce(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-black-hole-inward-force-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, {
    weaponId: directFireCase.weaponId,
  });
  const fieldState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const fieldBullet = fieldState.bullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(fieldBullet, "expected CN weapon 21 to fire black-hole field without enemies");
  assert.equal(fieldBullet.forceType, directFireCase.bulletForceType);
  assert.equal(fieldBullet.force, directFireCase.bulletForce);
  assert.equal(fieldBullet.colliderType, directFireCase.bulletColliderType);
  assert.equal(fieldBullet.colliderWidth, directFireCase.bulletSize);
  assert.equal(fieldBullet.remainingHits, directFireCase.bulletHitTimes);
  assertClose(Math.hypot(fieldBullet.vx, fieldBullet.vy), 0, "CN Black Hole field speed");
  assertClose(fieldBullet.x, baseState.player.x, "CN Black Hole field x");
  assertClose(fieldBullet.y, baseState.player.y, "CN Black Hole field y");

  const target = createEnemyFixture(
    fieldState,
    fieldBullet.x + directFireCase.bulletSize / 3,
    fieldBullet.y,
    {
      hp: 999999,
      speed: 0,
      radius: 10,
    },
  );
  const pulledState = updateNfoSimulation(
    {
      ...fieldState,
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0.1,
  );
  const targetAfterPull = pulledState.enemies.find((enemy) => enemy.id === target.id);

  assert.ok(targetAfterPull, "expected CN black-hole target to remain alive");
  assert.ok(targetAfterPull.hp < target.hp);
  assert.ok(
    targetAfterPull.x < target.x,
    `expected CN black-hole force to pull target left, got ${targetAfterPull.x}`,
  );
  assertClose(targetAfterPull.y, target.y, "CN Black Hole inward force y");
}

function testCnWeaponDirectFireAndShooterCombined(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-night-blade-dot-and-shooter-lv1",
  );
  const weaponShooterCase = getWeaponShooterCase(
    "weapon-shooter-night-blade-offset-angle-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === directFireCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === directFireCase.weaponLevel
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  assert.equal(weaponShooterCase.weaponId, directFireCase.weaponId);
  assert.equal(weaponLevel.bulletShooterId, weaponShooterCase.shooterId);

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: directFireCase.weaponId });
  const target = createEnemyFixture(
    baseState,
    baseState.player.x + 20,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 10,
    },
  );
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [target],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const directBullets = firedState.bullets.filter((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));
  const targetAfterDirect = firedState.enemies.find((enemy) => enemy.id === target.id);
  const dotBuff = targetAfterDirect?.activeBuffs.find((buff) => (
    buff.id === directFireCase.hitBuffId
  ));

  assert.equal(firedState.activeShooters.length, 1);
  assert.equal(firedState.activeShooters[0]?.shooterId, weaponShooterCase.shooterId);
  assert.equal(directBullets.length, directFireCase.bulletCount);
  assert.ok(directBullets.every((bullet) => bullet.hitBuffId === directFireCase.hitBuffId));
  assert.ok(directBullets.every((bullet) => bullet.damageJudgeType === directFireCase.bulletDamageJudgeType));
  assert.ok(targetAfterDirect, "expected CN Night Blade target to remain alive");
  assert.ok(targetAfterDirect.hp < target.hp);
  assert.ok(dotBuff, "expected CN Night Blade direct bullets to apply DOT buff 4");
  assert.equal(dotBuff.type, 4);
  assert.equal(dotBuff.stackCount, 2);
  assert.equal(dotBuff.maxStackCount, 2);

  const shooterFireState = updateNfoSimulation(
    {
      ...firedState,
      player: {
        ...firedState.player,
        fireCooldownSeconds: 999,
      },
    },
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const shooterBullets = shooterFireState.bullets.filter((candidate) => (
    candidate.bulletTypeId === weaponShooterCase.bulletTypeId
  ));

  assert.equal(shooterBullets.length, weaponShooterCase.bulletCount);
  assertClose(
    shooterFireState.activeShooters[0]?.ageFrames ?? Number.NaN,
    1,
    "CN Night Blade shooter first event age",
  );
  assert.ok(shooterBullets.every((bullet) => bullet.hitTargetType === weaponShooterCase.bulletHitTargetType));
  assert.ok(shooterBullets.every((bullet) => Math.abs(Math.hypot(bullet.vx, bullet.vy) - weaponShooterCase.bulletSpeed) < 0.000001));
  assert.ok(shooterBullets.some((bullet) => bullet.vx > 0));
  assert.ok(shooterBullets.some((bullet) => bullet.vy > 0));
  assert.ok(shooterBullets.some((bullet) => bullet.vy < 0));
}

function testCnWeaponDirectFireSongFieldsWithShooters(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const songCases = [
    {
      directFireCase: getWeaponDirectFireCase("weapon-direct-eternal-song-targeted-field-lv1"),
      weaponShooterCase: getWeaponShooterCase("weapon-shooter-eternal-song-friendly-buff-lv1"),
    },
    {
      directFireCase: getWeaponDirectFireCase("weapon-direct-prayer-rain-targeted-field-lv1"),
      weaponShooterCase: getWeaponShooterCase("weapon-shooter-prayer-rain-enemy-slow-lv1"),
    },
  ];

  for (const { directFireCase, weaponShooterCase } of songCases) {
    const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
    const weapon = testRuntimeData.weapons.find((candidate) => (
      candidate.id === directFireCase.weaponId
    ));
    const weaponLevel = weapon?.levels.find((candidate) => (
      candidate.level === directFireCase.weaponLevel
    ));

    assert.ok(weapon);
    assert.ok(weaponLevel);
    assert.equal(weaponShooterCase.weaponId, directFireCase.weaponId);
    assert.equal(weaponLevel.bulletShooterId, weaponShooterCase.shooterId);

    const noTargetState = createNfoSimulation(testRuntimeData, {
      weaponId: directFireCase.weaponId,
    });
    const noTargetAfterFire = updateNfoSimulation(
      {
        ...noTargetState,
        player: {
          ...noTargetState.player,
          fireCooldownSeconds: 0,
          criticalRate: 0,
        },
        enemies: [],
      },
      testRuntimeData,
      NO_INPUT,
      0,
    );

    assert.equal(
      noTargetAfterFire.bullets.some((bullet) => bullet.bulletTypeId === directFireCase.bulletTypeId),
      false,
    );
    assert.equal(noTargetAfterFire.activeShooters.length, 0);

    const baseState = createNfoSimulation(testRuntimeData, {
      weaponId: directFireCase.weaponId,
    });
    const target = createEnemyFixture(
      baseState,
      baseState.player.x + 20,
      baseState.player.y,
      {
        hp: 999999,
        speed: 0,
        radius: 10,
        defense: 0,
      },
    );
    const firedState = updateNfoSimulation(
      {
        ...baseState,
        player: {
          ...baseState.player,
          fireCooldownSeconds: 0,
          criticalRate: 0,
        },
        enemies: [target],
      },
      testRuntimeData,
      NO_INPUT,
      0,
    );
    const directBullet = firedState.bullets.find((candidate) => (
      candidate.bulletTypeId === directFireCase.bulletTypeId
      && candidate.hitTargetType === directFireCase.bulletHitTargetType
    ));
    const targetAfterDirect = firedState.enemies.find((enemy) => enemy.id === target.id);

    assert.equal(firedState.activeShooters.length, 1);
    assert.equal(firedState.activeShooters[0]?.shooterId, weaponShooterCase.shooterId);
    assert.ok(directBullet, "expected CN song weapon to emit direct field bullet 60");
    assertClose(directBullet.x, baseState.player.x, "CN song direct field bullet x");
    assertClose(directBullet.y, baseState.player.y, "CN song direct field bullet y");
    assert.equal(directBullet.damageJudgeType, directFireCase.bulletDamageJudgeType);
    assert.equal(directBullet.colliderType, directFireCase.bulletColliderType);
    assert.equal(directBullet.colliderWidth, directFireCase.bulletSize);
    assert.equal(directBullet.remainingHits, directFireCase.bulletHitTimes - 1);
    assertClose(
      Math.hypot(directBullet.vx, directBullet.vy),
      directFireCase.bulletSpeed,
      "CN song direct field bullet speed",
    );
    assertClose(
      directBullet.remainingSeconds,
      directFireCase.bulletLifeTimeFrames / 30,
      "CN song direct field bullet lifetime",
    );
    assertClose(
      directBullet.damageJudgeDelaySeconds,
      directFireCase.bulletDamageJudgeDelayFrames / 30,
      "CN song direct field bullet damage judge delay",
    );
    assertClose(
      directBullet.damageJudgeCooldownSeconds,
      directFireCase.bulletDamageJudgeCooldownFrames / 30,
      "CN song direct field bullet damage judge cooldown",
    );
    assert.ok(targetAfterDirect, "expected CN song direct field target to remain alive");
    assert.ok(targetAfterDirect.hp < target.hp);
  }
}

function testCnWeaponDirectFireFriendlyBuff(sourceRuntimeData: NfoOfflineRuntimeData) {
  const directFireCase = getWeaponDirectFireCase(
    "weapon-direct-domination-friendly-buff-lv1",
  );
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weapon = testRuntimeData.weapons.find((candidate) => (
    candidate.id === directFireCase.weaponId
  ));
  const weaponLevel = weapon?.levels.find((candidate) => (
    candidate.level === directFireCase.weaponLevel
  ));
  const fireBullet = weaponLevel?.fireBullets.find((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));

  assert.ok(weapon);
  assert.ok(weaponLevel);
  assert.ok(fireBullet);
  weaponLevel.fireBullets = [{ ...fireBullet }];

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: directFireCase.weaponId });
  const overlappingEnemy = createEnemyFixture(
    baseState,
    baseState.player.x,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 10,
    },
  );
  const firedState = updateNfoSimulation(
    {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 0,
      },
      enemies: [overlappingEnemy],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const bullets = firedState.bullets.filter((candidate) => (
    candidate.bulletTypeId === directFireCase.bulletTypeId
  ));
  const playerBuff = firedState.player.activeBuffs.find((buff) => (
    buff.id === directFireCase.hitBuffId
  ));
  const enemyAfter = firedState.enemies.find((enemy) => enemy.id === overlappingEnemy.id);

  assert.equal(bullets.length, directFireCase.bulletCount);
  assert.ok(bullets.every((bullet) => bullet.hitTargetType === directFireCase.bulletHitTargetType));
  assert.ok(bullets.every((bullet) => bullet.hitBuffId === directFireCase.hitBuffId));
  assert.ok(bullets.every((bullet) => bullet.hitBuffLevel === directFireCase.hitBuffLevel));
  assert.ok(bullets.every((bullet) => bullet.canDamagePlayer === false));
  assert.ok(bullets.every((bullet) => bullet.colliderType === directFireCase.bulletColliderType));
  assert.ok(playerBuff, "expected CN weapon 27 direct bullet 32 to apply buff 7 to player");
  assert.equal(playerBuff.type, 1);
  assert.equal(playerBuff.value, 1);
  assertClose(playerBuff.remainingSeconds, 2, "CN Domination buff duration seconds");
  assert.equal(playerBuff.attributes.length, 2);
  assert.equal(playerBuff.attributes[0]?.attributeType, 3);
  assert.equal(playerBuff.attributes[0]?.value, 1);
  assert.equal(playerBuff.attributes[1]?.attributeType, 4);
  assert.equal(playerBuff.attributes[1]?.value, 50);
  assert.ok(enemyAfter, "expected CN weapon 27 overlapping enemy to remain alive");
  assert.equal(enemyAfter.hp, overlappingEnemy.hp);
  assert.equal(enemyAfter.activeBuffs.length, 0);
}

function testCnWeaponSelfBuffFloatingShieldContactCharges(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const selfBuffCase = getWeaponSelfBuffCase("weapon-self-buff-floating-shield-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, { weaponId: selfBuffCase.weaponId });
  const buffedState = updateNfoSimulation(
    {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 0,
    },
  },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const shieldBuff = buffedState.player.activeBuffs.find((buff) => (
    buff.id === selfBuffCase.selfBuffId
  ));

  assert.equal(selfBuffCase.weaponId, 23);
  assert.equal(selfBuffCase.selfBuffId, 5);
  assert.equal(selfBuffCase.selfBuffLevel, 1);
  assert.equal(selfBuffCase.buffType, 5);
  assert.equal(selfBuffCase.buffValue, 2);
  assert.equal(selfBuffCase.buffFireBulletTypeId, 0);
  assert.ok(shieldBuff, "expected CN weapon 23 to apply shield buff 5");
  assert.equal(shieldBuff.type, selfBuffCase.buffType);
  assert.equal(shieldBuff.value, selfBuffCase.buffValue);
  assertClose(
    shieldBuff.remainingSeconds,
    selfBuffCase.buffDurationFrames / 30,
    "CN Floating Shield buff duration",
  );

  const contactEnemy = createEnemyFixture(
    buffedState,
    buffedState.player.x,
    buffedState.player.y,
    {
      hp: 999999,
      speed: 0,
      attack: 9999,
      radius: 10,
    },
  );
  const firstContactState = updateNfoSimulation(
    {
      ...buffedState,
      enemies: [contactEnemy],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const shieldAfterFirstContact = firstContactState.player.activeBuffs.find((buff) => (
    buff.id === selfBuffCase.selfBuffId
  ));

  assert.equal(firstContactState.player.hp, buffedState.player.hp);
  assert.ok(shieldAfterFirstContact, "expected CN shield to retain one charge after first contact");
  assert.equal(shieldAfterFirstContact.value, selfBuffCase.buffValue - 1);

  const secondContactState = updateNfoSimulation(
    {
      ...firstContactState,
      player: {
        ...firstContactState.player,
        damageCooldownSeconds: 0,
      },
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );

  assert.equal(secondContactState.player.hp, buffedState.player.hp);
  assert.equal(
    secondContactState.player.activeBuffs.some((buff) => buff.id === selfBuffCase.selfBuffId),
    false,
  );
}

function testCnWeaponSelfBuffCounterContactBullet(sourceRuntimeData: NfoOfflineRuntimeData) {
  const selfBuffCase = getWeaponSelfBuffCase("weapon-self-buff-counter-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, { weaponId: selfBuffCase.weaponId });
  const buffedState = updateNfoSimulation(
    {
    ...baseState,
    player: {
      ...baseState.player,
      criticalRate: 0,
      fireCooldownSeconds: 0,
    },
  },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const counterBuff = buffedState.player.activeBuffs.find((buff) => (
    buff.id === selfBuffCase.selfBuffId
  ));

  assert.equal(selfBuffCase.weaponId, 25);
  assert.equal(selfBuffCase.selfBuffId, 6);
  assert.equal(selfBuffCase.selfBuffLevel, 1);
  assert.equal(selfBuffCase.buffType, 6);
  assert.equal(selfBuffCase.buffValue, 1);
  assert.equal(selfBuffCase.buffFireBulletTypeId, 27);
  assert.ok(counterBuff, "expected CN weapon 25 to apply counter buff 6");
  assert.equal(counterBuff.type, selfBuffCase.buffType);
  assert.equal(counterBuff.value, selfBuffCase.buffValue);

  const contactEnemy = createEnemyFixture(
    buffedState,
    buffedState.player.x,
    buffedState.player.y,
    {
      hp: 999999,
      speed: 0,
      attack: 9999,
      radius: 10,
    },
  );
  const counterState = updateNfoSimulation(
    {
      ...buffedState,
      enemies: [contactEnemy],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const counterBullet = counterState.bullets.find((bullet) => (
    bullet.bulletTypeId === selfBuffCase.buffFireBulletTypeId
  ));

  assert.equal(counterState.player.hp, buffedState.player.hp);
  assert.equal(
    counterState.player.activeBuffs.some((buff) => buff.id === selfBuffCase.selfBuffId),
    false,
  );
  assert.ok(counterBullet, "expected CN counter buff 6 to fire bullet 27 on contact");
  assert.equal(counterBullet.damage, buffedState.player.attack + selfBuffCase.buffFireBulletAttack);
  assert.equal(counterBullet.colliderWidth, selfBuffCase.buffFireBulletSize);
  assert.equal(counterBullet.remainingHits, selfBuffCase.buffFireBulletHitTimes);
  assertClose(
    Math.hypot(counterBullet.vx, counterBullet.vy),
    selfBuffCase.buffFireBulletSpeed,
    "CN counter bullet speed",
  );
  assertClose(
    counterBullet.remainingSeconds,
    selfBuffCase.buffFireBulletLifeTimeFrames / 30,
    "CN counter bullet lifetime",
  );
  assertClose(
    counterBullet.damageJudgeDelaySeconds,
    selfBuffCase.buffFireBulletDamageJudgeDelayFrames / 30,
    "CN counter bullet damage delay",
  );
  assertClose(
    counterBullet.damageJudgeCooldownSeconds,
    selfBuffCase.buffFireBulletDamageJudgeCooldownFrames / 30,
    "CN counter bullet damage cooldown",
  );
}

function testCnWeaponSelfBuffStealthAttributes(sourceRuntimeData: NfoOfflineRuntimeData) {
  const selfBuffCase = getWeaponSelfBuffCase("weapon-self-buff-stealth-attribute-lv1");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const state = createStateWithEnemy(
    testRuntimeData,
    { x: 700, y: 0 },
    selfBuffCase.weaponId,
  );
  const startState = {
    ...state,
    worldBounds: {
      minX: -10000,
      minY: -10000,
      maxX: 10000,
      maxY: 10000,
    },
    player: {
      ...state.player,
      x: 1000,
      y: 1000,
      fireCooldownSeconds: 0,
    },
  };
  const buffedState = updateNfoSimulation(
    startState,
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const movedState = updateNfoSimulation(
    buffedState,
    testRuntimeData,
    { moveX: 1, moveY: 0 },
    0.1,
  );
  const stealthBuff = buffedState.player.activeBuffs.find((buff) => (
    buff.id === selfBuffCase.selfBuffId
  ));
  const speedAttribute = selfBuffCase.buffAttributes.find((attribute) => (
    attribute.attributeType === 4
  ));
  const stealthBullet = buffedState.bullets.find((bullet) => (
    bullet.bulletTypeId === selfBuffCase.buffFireBulletTypeId
  ));

  assert.equal(selfBuffCase.weaponId, 29);
  assert.equal(selfBuffCase.weaponLevel, 1);
  assert.equal(selfBuffCase.selfBuffId, 8);
  assert.equal(selfBuffCase.selfBuffLevel, 1);
  assert.equal(selfBuffCase.buffType, 7);
  assert.equal(speedAttribute?.value, 500);
  assert.ok(stealthBuff, "expected CN weapon 29 to apply stealth buff 8");
  assert.equal(stealthBuff.type, selfBuffCase.buffType);
  assert.equal(stealthBuff.attributes.length, selfBuffCase.buffAttributes.length);
  assert.ok(stealthBullet, "expected CN weapon 29 buff 8 to fire BuffData bullet 15");
  assert.equal(stealthBullet.damage, startState.player.attack + selfBuffCase.buffFireBulletAttack);
  assert.equal(stealthBullet.colliderWidth, selfBuffCase.buffFireBulletSize);
  assert.equal(stealthBullet.remainingHits, selfBuffCase.buffFireBulletHitTimes);
  assertClose(
    Math.hypot(stealthBullet.vx, stealthBullet.vy),
    selfBuffCase.buffFireBulletSpeed,
    "CN stealth buff bullet speed",
  );
  assertClose(
    stealthBullet.remainingSeconds,
    selfBuffCase.buffFireBulletLifeTimeFrames / 30,
    "CN stealth buff bullet lifetime",
  );
  assertClose(
    stealthBullet.damageJudgeDelaySeconds,
    selfBuffCase.buffFireBulletDamageJudgeDelayFrames / 30,
    "CN stealth buff bullet damage delay",
  );
  assertClose(
    stealthBullet.damageJudgeCooldownSeconds,
    selfBuffCase.buffFireBulletDamageJudgeCooldownFrames / 30,
    "CN stealth buff bullet damage cooldown",
  );
  assertClose(
    movedState.player.x,
    startState.player.x + (startState.player.speed + (speedAttribute?.value ?? 0)) * 0.1,
    "CN stealth buff movement x",
  );
  assertClose(movedState.player.y, startState.player.y, "CN stealth buff movement y");
}

function testCnWeaponLevelSpawnMinionData(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const weaponMinionCase = getWeaponMinionCase("weapon-minion-royal-guard-spawn-lv1");
  const minionData = testRuntimeData.minions.find((candidate) => (
    candidate.id === weaponMinionCase.minionId
  ));
  assert.ok(minionData);
  minionData.speed = 0;

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: weaponMinionCase.weaponId });
  const spawnState = updateNfoSimulation(baseState, testRuntimeData, NO_INPUT, 0);
  const minion = spawnState.minions.find((candidate) => (
    candidate.minionId === weaponMinionCase.minionId
  ));
  assert.ok(minion, "expected CN weapon 32 to spawn minion 10");
  assert.equal(spawnState.minions.length, weaponMinionCase.minionCount);
  assert.equal(minion.aiTypeId, weaponMinionCase.spawnMinionAITypeId);
  assert.equal(minion.weaponId, weaponMinionCase.weaponId);
  assert.equal(minion.weaponLevel, weaponMinionCase.weaponLevel);
  assert.equal(minion.canFireOwnWeapon, false);
  assert.equal(spawnState.bullets.length, 0);
  assert.equal(spawnState.activeShooters.length, 0);
  assertClose(
    Math.hypot(minion.x - baseState.player.x, minion.y - baseState.player.y),
    (weaponMinionCase.spawnRadiusMin + weaponMinionCase.spawnRadiusMax) / 2,
    "CN weapon 32 spawn radius",
  );

  const shooterState = updateNfoSimulation(spawnState, testRuntimeData, NO_INPUT, 0);
  const shooter = shooterState.activeShooters.find((candidate) => (
    candidate.shooterId === weaponMinionCase.aiStateShooterId
  ));
  assert.ok(shooter, "expected CN weapon 32 minion AI to create shooter 15000");
  assert.equal(shooter.sourceTeam, "player");
  assertClose(shooter.x, minion.x, "CN weapon 32 shooter x");
  assertClose(shooter.y, minion.y, "CN weapon 32 shooter y");
  assertClose(
    shooter.ownerFacingAngle,
    Math.atan2(shooterState.player.y - minion.y, shooterState.player.x - minion.x),
    "CN weapon 32 syncDirectionFromTarget owner-facing angle",
  );

  const firedState = updateNfoSimulation(shooterState, testRuntimeData, NO_INPUT, 1 / 30);
  const bullet = firedState.bullets.find((candidate) => candidate.bulletTypeId === 99);
  assert.ok(bullet, "expected CN shooter 15000 to emit taunt bullet 99");
  assert.equal(bullet.canDamagePlayer, false);
  assert.equal(bullet.dealsDamage, false);
  assert.equal(bullet.hitBuffId, 120);

  const tauntedState = updateNfoSimulation(
    {
      ...firedState,
      enemies: [
        createEnemyFixture(
          firedState,
          bullet.x,
          bullet.y,
          {
            hp: 999999,
            speed: 0,
            radius: 5,
          },
        ),
      ],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const tauntBuff = tauntedState.enemies[0]?.activeBuffs.find((buff) => buff.id === 120);
  assert.ok(tauntBuff, "expected CN taunt bullet to apply buff 120");
  assert.equal(tauntBuff.type, 13);
  assertClose(tauntBuff.sourceX ?? Number.NaN, bullet.x, "CN taunt source x");
  assertClose(tauntBuff.sourceY ?? Number.NaN, bullet.y, "CN taunt source y");
}

function testCnWeaponSpawnMinionLevelUpSwitchesAI(sourceRuntimeData: NfoOfflineRuntimeData) {
  const levelOneCase = getWeaponMinionCase("weapon-minion-royal-guard-spawn-lv1");
  const levelTwoCase = getWeaponMinionCase("weapon-minion-royal-guard-spawn-level-up-lv2");
  const levelUpItemCase = getItemCase("item-level-up");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const minionData = testRuntimeData.minions.find((candidate) => (
    candidate.id === levelOneCase.minionId
  ));
  assert.ok(minionData);
  minionData.speed = 0;

  const baseState = createNfoSimulation(testRuntimeData, { weaponId: levelOneCase.weaponId });
  const spawnState = updateNfoSimulation(baseState, testRuntimeData, NO_INPUT, 0);
  const spawnedMinion = spawnState.minions.find((candidate) => (
    candidate.minionId === levelOneCase.minionId
  ));
  assert.ok(spawnedMinion, "expected CN weapon 32 level 1 to spawn minion 10");
  assert.equal(spawnedMinion.aiTypeId, levelOneCase.spawnMinionAITypeId);
  assert.equal(spawnedMinion.weaponLevel, levelOneCase.weaponLevel);

  const levelUpPickup: NfoSimPickup = {
    id: 9102,
    itemId: levelUpItemCase.itemId,
    name: levelUpItemCase.itemName,
    itemType: levelUpItemCase.itemType,
    value: levelUpItemCase.value,
    canBeMagneted: levelUpItemCase.canBeMagneted,
    radius: 5,
    remainingSeconds: levelUpItemCase.lifetimeFrames / 30,
    x: spawnState.player.x,
    y: spawnState.player.y,
  };
  const leveledState = updateNfoSimulation(
    {
      ...spawnState,
      player: {
        ...spawnState.player,
        fireCooldownSeconds: 999,
      },
      minions: spawnState.minions.map((minion) => (
        minion.id === spawnedMinion.id
          ? {
            ...minion,
            aiFireCooldownSeconds: 999,
          }
          : minion
      )),
      pickups: [levelUpPickup],
    },
    testRuntimeData,
    NO_INPUT,
    0.1,
  );
  const leveledMinion = leveledState.minions.find((candidate) => (
    candidate.id === spawnedMinion.id
  ));
  assert.ok(leveledMinion, "expected CN weapon 32 minion to survive level-up");
  assert.equal(leveledState.player.weaponLevel, levelTwoCase.weaponLevel);
  assert.equal(leveledState.pickups.length, 0);
  assert.equal(leveledMinion.weaponLevel, levelTwoCase.weaponLevel);
  assert.equal(leveledMinion.aiTypeId, levelOneCase.spawnMinionAITypeId);
  assert.equal(leveledState.activeShooters.length, 0);

  const syncedState = updateNfoSimulation(
    {
      ...leveledState,
      player: {
        ...leveledState.player,
        fireCooldownSeconds: 0,
      },
      activeShooters: [],
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const syncedMinion = syncedState.minions.find((candidate) => candidate.id === spawnedMinion.id);
  assert.ok(syncedMinion, "expected CN weapon 32 minion to survive level sync");
  assert.equal(syncedMinion.weaponLevel, levelTwoCase.weaponLevel);
  assert.equal(syncedMinion.aiTypeId, levelTwoCase.spawnMinionAITypeId);
  assert.equal(syncedMinion.aiFireCooldownSeconds, 0);
  assert.equal(syncedState.activeShooters.length, 0);

  const shooterState = updateNfoSimulation(
    {
      ...syncedState,
      player: {
        ...syncedState.player,
        fireCooldownSeconds: 999,
      },
      activeShooters: [],
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const shooter = shooterState.activeShooters.find((candidate) => (
    candidate.shooterId === levelTwoCase.aiStateShooterId
  ));
  assert.ok(shooter, "expected CN weapon 32 level 2 minion AI to create shooter 15001");
  assert.equal(
    shooterState.activeShooters.some((candidate) => (
      candidate.shooterId === levelOneCase.aiStateShooterId
    )),
    false,
  );
  assert.equal(shooter.sourceTeam, "player");
  assertClose(shooter.x, syncedMinion.x, "CN weapon 32 level 2 shooter x");
  assertClose(shooter.y, syncedMinion.y, "CN weapon 32 level 2 shooter y");

  const firedState = updateNfoSimulation(shooterState, testRuntimeData, NO_INPUT, 1 / 30);
  const bullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === levelTwoCase.aiShooterBulletTypeId
  ));
  assert.ok(bullet, "expected CN shooter 15001 to emit taunt bullet 99");
  assert.equal(bullet.canDamagePlayer, false);
  assert.equal(bullet.dealsDamage, false);
  assert.equal(bullet.colliderWidth, levelTwoCase.aiShooterBulletSize);
  assert.equal(bullet.hitBuffId, levelTwoCase.aiShooterBulletHitBuffId);
  assert.equal(bullet.hitBuffLevel, levelTwoCase.aiShooterBulletHitBuffLevel);
}

function testCnShooterDirectionTwoFriendlyTargetAndRotation(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const testRuntimeData = configureRuntimeForShooter(sourceRuntimeData, 2100);
  const state = createStateWithoutEnemies(testRuntimeData);
  const nextState = updateNfoSimulation(
    chargeActiveSkill(state),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    7 / 30,
  );
  const bullet = nextState.bullets.find((candidate) => candidate.bulletTypeId === 101);

  assert.ok(bullet, "expected CN shooter 2100 to fire bullet 101");
  assert.equal(bullet.rotateType, 2);
  assert.equal(bullet.hitTargetType, 1);
  assert.ok(bullet.vx < 0);
  assertClose(bullet.vy, 0, "CN direction 2 vy");
}

function testCnShooterOnDestroyEventBullet(sourceRuntimeData: NfoOfflineRuntimeData) {
  const onDestroyCase = getShooterOnDestroyCase("shooter-black-hole-on-destroy-event-bullet");
  const testRuntimeData = configureRuntimeForShooter(sourceRuntimeData, onDestroyCase.shooterId);
  const state = createStateWithoutEnemies(testRuntimeData);
  const firedState = updateNfoSimulation(
    chargeActiveSkill(state),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const parentBullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === onDestroyCase.parentBulletTypeId
  ));

  assert.ok(parentBullet, "expected CN shooter 4000 to emit parent black-hole trigger bullet");
  assert.equal(parentBullet.dealsDamage, false);
  assert.equal(parentBullet.onDestroyFireBullets.length, 1);
  assert.equal(
    parentBullet.onDestroyFireBullets[0]?.bulletTypeId,
    onDestroyCase.childBulletTypeId,
  );
  assert.equal(
    firedState.bullets.some((candidate) => candidate.bulletTypeId === onDestroyCase.childBulletTypeId),
    false,
  );

  const followUpState = updateNfoSimulation(
    {
      ...firedState,
      activeShooters: [],
    },
    testRuntimeData,
    NO_INPUT,
    onDestroyCase.parentBulletLifeTimeFrames / 30,
  );
  const childBullet = followUpState.bullets.find((candidate) => (
    candidate.bulletTypeId === onDestroyCase.childBulletTypeId
  ));

  assert.equal(
    followUpState.bullets.some((candidate) => (
      candidate.bulletTypeId === onDestroyCase.parentBulletTypeId
    )),
    false,
  );
  assert.ok(childBullet, "expected expired CN black-hole trigger to emit event bullet 31");
  assert.equal(childBullet.dealsDamage, true);
  assert.equal(childBullet.hitTargetType, onDestroyCase.childBulletHitTargetType);
  assert.equal(childBullet.forceType, onDestroyCase.childBulletForceType);
  assert.equal(childBullet.force, onDestroyCase.childBulletForce);
  assert.equal(childBullet.remainingHits, onDestroyCase.childBulletHitTimes);
  assertClose(childBullet.x, parentBullet.x, "CN on-destroy child bullet x");
  assertClose(childBullet.y, parentBullet.y, "CN on-destroy child bullet y");

  const hostileOnDestroyCase = getShooterOnDestroyCase(
    "shooter-michelle-fist-hostile-on-destroy-event-bullet",
  );
  const hostileRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const hostileBaseState = createStateWithoutEnemies(hostileRuntimeData);
  const hostileShooterData = hostileRuntimeData.bulletShooters.find((candidate) => (
    candidate.id === hostileOnDestroyCase.shooterId
  ));
  assert.ok(hostileShooterData, "expected CN shooter 2002 data to be present");

  const hostileShooterX = hostileBaseState.player.x + 1200;
  const hostileShooterY = hostileBaseState.player.y;
  const hostileShooter: NfoSimActiveShooter = {
    id: 920002,
    shooterId: hostileOnDestroyCase.shooterId,
    name: hostileOnDestroyCase.shooterName,
    x: hostileShooterX,
    y: hostileShooterY,
    ageFrames: 0,
    lifeTimeFrames: hostileShooterData.lifeTimeFrames,
    behaviorType: hostileShooterData.behaviorType,
    followsOwnerDirection: hostileShooterData.followsOwnerDirection,
    ownerFacingAngle: Math.PI,
    ownerOffsetX: 0,
    ownerOffsetY: 0,
    sourceTeam: "enemy",
    attack: 2,
  };
  const hostileState: NfoSimulationState = {
    ...hostileBaseState,
    player: {
      ...hostileBaseState.player,
      hp: 999999,
      maxHp: 999999,
      fireCooldownSeconds: 999,
    },
    worldBounds: {
      minX: hostileBaseState.player.x - 5000,
      minY: hostileBaseState.player.y - 5000,
      maxX: hostileBaseState.player.x + 5000,
      maxY: hostileBaseState.player.y + 5000,
    },
    activeShooters: [hostileShooter],
    bullets: [],
    enemies: [],
    minions: [],
  };
  const hostileWaitingState = updateNfoSimulation(
    hostileState,
    hostileRuntimeData,
    NO_INPUT,
    (hostileOnDestroyCase.eventFrame - 1) / 30,
  );
  assert.equal(
    hostileWaitingState.bullets.some((candidate) => (
      candidate.bulletTypeId === hostileOnDestroyCase.parentBulletTypeId
    )),
    false,
  );

  const hostileFiredState = updateNfoSimulation(
    hostileWaitingState,
    hostileRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const hostileParentBullet = hostileFiredState.bullets.find((candidate) => (
    candidate.bulletTypeId === hostileOnDestroyCase.parentBulletTypeId
  ));
  assert.ok(hostileParentBullet, "expected CN shooter 2002 to emit parent fist bullet 54");

  const expectedParentOriginX = hostileShooterX + hostileOnDestroyCase.formationOffsetX;
  const expectedParentOriginY = hostileShooterY + hostileOnDestroyCase.formationOffsetY;
  const expectedParentAngle = Math.atan2(
    hostileBaseState.player.y - expectedParentOriginY,
    hostileBaseState.player.x - expectedParentOriginX,
  );
  assert.equal(hostileParentBullet.canDamagePlayer, true);
  assert.equal(hostileParentBullet.dealsDamage, !hostileOnDestroyCase.parentBulletNoDamage);
  assert.equal(hostileParentBullet.hitTargetType, hostileOnDestroyCase.parentBulletHitTargetType);
  assert.equal(hostileParentBullet.onDestroyFireBullets.length, 1);
  assert.equal(
    hostileParentBullet.onDestroyFireBullets[0]?.bulletTypeId,
    hostileOnDestroyCase.childBulletTypeId,
  );
  assertClose(
    hostileParentBullet.x - hostileParentBullet.vx / 30,
    expectedParentOriginX,
    "CN hostile on-destroy parent origin x",
  );
  assertClose(
    hostileParentBullet.y - hostileParentBullet.vy / 30,
    expectedParentOriginY,
    "CN hostile on-destroy parent origin y",
  );
  assertClose(
    hostileParentBullet.vx,
    Math.cos(expectedParentAngle) * hostileOnDestroyCase.parentBulletSpeed,
    "CN hostile on-destroy parent vx",
  );
  assertClose(
    hostileParentBullet.vy,
    Math.sin(expectedParentAngle) * hostileOnDestroyCase.parentBulletSpeed,
    "CN hostile on-destroy parent vy",
  );

  const hostileFollowUpState = updateNfoSimulation(
    {
      ...hostileFiredState,
      activeShooters: [],
    },
    hostileRuntimeData,
    NO_INPUT,
    hostileParentBullet.remainingSeconds,
  );
  const hostileChildBullet = hostileFollowUpState.bullets.find((candidate) => (
    candidate.bulletTypeId === hostileOnDestroyCase.childBulletTypeId
  ));
  assert.ok(hostileChildBullet, "expected expired CN fist bullet 54 to emit explosion bullet 55");
  assert.equal(hostileChildBullet.canDamagePlayer, true);
  assert.equal(hostileChildBullet.dealsDamage, !hostileOnDestroyCase.childBulletNoDamage);
  assert.equal(hostileChildBullet.hitTargetType, hostileOnDestroyCase.childBulletHitTargetType);
  assert.equal(hostileChildBullet.forceType, hostileOnDestroyCase.childBulletForceType);
  assert.equal(hostileChildBullet.force, hostileOnDestroyCase.childBulletForce);
  assert.equal(hostileChildBullet.remainingHits, hostileOnDestroyCase.childBulletHitTimes);
  assertClose(
    hostileChildBullet.remainingSeconds,
    hostileOnDestroyCase.childBulletLifeTimeFrames / 30,
    "CN hostile on-destroy child lifetime",
  );
  assertClose(
    hostileChildBullet.x,
    hostileParentBullet.x + hostileParentBullet.vx * hostileParentBullet.remainingSeconds,
    "CN hostile on-destroy child x",
  );
  assertClose(
    hostileChildBullet.y,
    hostileParentBullet.y + hostileParentBullet.vy * hostileParentBullet.remainingSeconds,
    "CN hostile on-destroy child y",
  );
  assertClose(hostileChildBullet.vx, 0, "CN hostile on-destroy child vx");
  assertClose(hostileChildBullet.vy, 0, "CN hostile on-destroy child vy");
}

function testCnActiveSkillShooterSpawnPosThreeNearestEnemy(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const spawnCase = getActiveSkillShooterSpawnCase(
    "active-skill-chainsaw-god-spawn-pos-3-nearest-enemy",
  );
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    spawnCase.activeSkillId,
  );
  const baseState = createNfoSimulation(testRuntimeData);
  const farEnemy = createEnemyFixture(
    baseState,
    baseState.player.x - 700,
    baseState.player.y,
    {
      hp: 999999,
      speed: 0,
      radius: 5,
    },
  );
  const nearEnemy = {
    ...createEnemyFixture(
      baseState,
      baseState.player.x + 120,
      baseState.player.y + 40,
      {
        hp: 999999,
        speed: 0,
        radius: 5,
      },
    ),
    id: 900002,
  };
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [farEnemy, nearEnemy],
  };

  const nextState = updateNfoSimulation(
    chargeActiveSkill(state),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const shooter = nextState.activeShooters.find((candidate) => (
    candidate.shooterId === spawnCase.shooterId
  ));
  const bullet = nextState.bullets.find((candidate) => (
    candidate.bulletTypeId === spawnCase.bulletTypeId
  ));

  assert.ok(shooter, "expected CN active skill 99 to create shooter 8000");
  assertClose(shooter.x, nearEnemy.x, "CN SpawnPos 3 shooter x");
  assertClose(shooter.y, nearEnemy.y, "CN SpawnPos 3 shooter y");
  assert.ok(bullet, "expected CN SpawnPos 3 shooter to emit bullet 58");
  assert.equal(bullet.hitTargetType, spawnCase.bulletHitTargetType);
  assert.equal(bullet.damageJudgeType, spawnCase.bulletDamageJudgeType);
  assert.equal(bullet.forceType, spawnCase.bulletForceType);
  assert.equal(bullet.force, spawnCase.bulletForce);
  assertClose(bullet.x, nearEnemy.x, "CN SpawnPos 3 bullet x");
  assertClose(bullet.y, nearEnemy.y, "CN SpawnPos 3 bullet y");
}

function testCnActiveSkillElementalBurstFanShooter(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const fanCase = getActiveSkillShooterSpawnCase(
    "active-skill-elemental-burst-fan-fireballs-lv1",
  );
  const snowCase = getActiveSkillShooterSpawnCase(
    "active-skill-elemental-burst-snow-field-lv1",
  );
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    fanCase.activeSkillId,
  );
  const baseState = createNfoSimulation(testRuntimeData);
  const targetEnemy = createEnemyFixture(
    baseState,
    baseState.player.x + 200,
    baseState.player.y,
    {
      hp: 999999,
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
    enemies: [targetEnemy],
  };

  const nextState = updateNfoSimulation(
    chargeActiveSkill(state),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const shooter = nextState.activeShooters.find((candidate) => (
    candidate.shooterId === fanCase.shooterId
  ));
  const fireballs = nextState.bullets.filter((candidate) => (
    candidate.bulletTypeId === fanCase.bulletTypeId
  ));
  const snowField = nextState.bullets.find((candidate) => (
    candidate.bulletTypeId === snowCase.bulletTypeId
  ));

  assert.ok(shooter, "expected CN active skill 13 to create shooter 13000");
  assert.equal(fanCase.shooterId, snowCase.shooterId);
  assert.equal(fanCase.shooterLifeTimeFrames, snowCase.shooterLifeTimeFrames);
  assert.equal(fanCase.isLoopEvent, true);
  assert.equal(fanCase.loopFrameInterval, 15);
  assert.equal(snowCase.isLoopEvent, false);
  assert.equal(snowCase.loopFrameInterval, 0);
  assertClose(shooter.x, targetEnemy.x, "CN Elemental Burst shooter x");
  assertClose(shooter.y, targetEnemy.y, "CN Elemental Burst shooter y");
  assert.ok(snowField, "expected CN Elemental Burst shooter to emit snow-field bullet 21");
  assertClose(snowField.x, shooter.x, "CN Elemental Burst snow-field x");
  assertClose(snowField.y, shooter.y, "CN Elemental Burst snow-field y");
  assertClose(Math.hypot(snowField.vx, snowField.vy), 0, "CN Elemental Burst snow-field speed");
  assert.equal(fireballs.length, fanCase.bulletCount);
  for (const fireball of fireballs) {
    assert.equal(fireball.hitTargetType, fanCase.bulletHitTargetType);
    assertClose(
      Math.hypot(fireball.vx, fireball.vy),
      fanCase.bulletSpeed,
      "CN Elemental Burst fireball speed",
    );
    assert.ok(
      fireball.x > shooter.x,
      "expected CN Elemental Burst fireball fan to move forward",
    );
  }

  const sortedFireballs = [...fireballs].sort((left, right) => left.vy - right.vy);
  assert.ok(sortedFireballs[0]?.vy < 0, "expected lower half of fireball fan");
  assert.ok(
    sortedFireballs[sortedFireballs.length - 1]?.vy > 0,
    "expected upper half of fireball fan",
  );
  assertClose(
    fireballs.reduce((sum, fireball) => sum + fireball.vy, 0),
    0,
    "CN Elemental Burst fireball fan vertical symmetry",
  );

  const secondLoopState = updateNfoSimulation(
    {
      ...nextState,
      activeSkill: {
        ...nextState.activeSkill,
        isActive: false,
        timelineFrame: 0,
        triggeredEventIndexes: [],
      },
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    fanCase.loopFrameInterval / 30,
  );
  const secondLoopFireballs = secondLoopState.bullets.filter((candidate) => (
    candidate.bulletTypeId === fanCase.bulletTypeId
  ));
  const secondLoopSnowFields = secondLoopState.bullets.filter((candidate) => (
    candidate.bulletTypeId === snowCase.bulletTypeId
  ));

  assert.equal(secondLoopFireballs.length, fanCase.bulletCount);
  assert.equal(secondLoopSnowFields.length, 0);
  assertClose(
    secondLoopState.activeShooters[0]?.ageFrames ?? Number.NaN,
    fanCase.shooterEventFrame + fanCase.loopFrameInterval,
    "CN Elemental Burst shooter second loop age",
  );

  const expiredShooterState = updateNfoSimulation(
    {
      ...secondLoopState,
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    (
      fanCase.shooterLifeTimeFrames
      - fanCase.shooterEventFrame
      - fanCase.loopFrameInterval
      + 1
    ) / 30,
  );
  const remainingElementalBurstShooters = expiredShooterState.activeShooters.filter((candidate) => (
    candidate.shooterId === fanCase.shooterId
  ));

  assert.equal(
    remainingElementalBurstShooters.length,
    0,
    `expected CN Elemental Burst shooter to expire, remaining: ${
      JSON.stringify(remainingElementalBurstShooters)
    }`,
  );
}

function testCnActiveSkillApocalypseSongDelayedDamageShooter(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const stunCase = getActiveSkillShooterHitBuffCase(
    "active-skill-apocalypse-song-stun-field-lv1",
  );
  const damageCase = getActiveSkillShooterSpawnCase(
    "active-skill-apocalypse-song-delayed-damage-lv1",
  );
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    stunCase.activeSkillId,
  );
  const baseState = createStateWithEnemy(testRuntimeData, { x: 100, y: 0 });
  const firstFrameState = updateNfoSimulation(
    chargeActiveSkill(baseState),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const stunShooter = firstFrameState.activeShooters.find((candidate) => (
    candidate.shooterId === stunCase.shooterId
  ));
  const stunBullet = firstFrameState.bullets.find((candidate) => (
    candidate.bulletTypeId === stunCase.bulletTypeId
  ));
  const targetAfterStun = firstFrameState.enemies.find((enemy) => (
    enemy.id === baseState.enemies[0]?.id
  ));
  const stunBuff = targetAfterStun?.activeBuffs.find((buff) => (
    buff.id === stunCase.hitBuffId
  ));

  assert.equal(stunCase.activeSkillId, damageCase.activeSkillId);
  assert.ok(stunShooter, "expected CN active skill 14 to create stun shooter 3000");
  assert.ok(stunBullet, "expected CN active skill 14 stun shooter to emit bullet 56");
  assert.ok(targetAfterStun, "expected CN Apocalypse Song target to survive stun field");
  assert.ok(stunBuff, "expected CN Apocalypse Song stun field to apply buff 3");
  assert.equal(stunBullet.dealsDamage, !stunCase.bulletNoDamage);
  assert.equal(stunBullet.hitTargetType, stunCase.bulletHitTargetType);
  assert.equal(stunBullet.hitBuffId, stunCase.hitBuffId);
  assert.equal(stunBuff.type, stunCase.buffType);
  assertClose(
    stunBuff.remainingSeconds,
    stunCase.buffDurationFrames / 30,
    "CN Apocalypse Song stun duration",
  );

  const beforeDelayedDamageState = updateNfoSimulation(
    {
      ...firstFrameState,
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    (damageCase.eventFrame - stunCase.eventFrame - 1) / 30,
  );

  assert.equal(
    beforeDelayedDamageState.activeShooters.some((candidate) => (
      candidate.shooterId === damageCase.shooterId
    )),
    false,
  );
  assert.equal(
    beforeDelayedDamageState.bullets.some((candidate) => (
      candidate.bulletTypeId === damageCase.bulletTypeId
    )),
    false,
  );

  const delayedDamageState = updateNfoSimulation(
    {
      ...beforeDelayedDamageState,
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const damageShooter = delayedDamageState.activeShooters.find((candidate) => (
    candidate.shooterId === damageCase.shooterId
  ));
  const damageBullet = delayedDamageState.bullets.find((candidate) => (
    candidate.bulletTypeId === damageCase.bulletTypeId
  ));
  const targetAfterDamage = delayedDamageState.enemies.find((enemy) => (
    enemy.id === baseState.enemies[0]?.id
  ));

  assert.ok(damageShooter, "expected CN active skill 14 frame-90 shooter 3001");
  assert.ok(damageBullet, "expected CN active skill 14 frame-90 shooter to emit bullet 99");
  assert.ok(targetAfterDamage, "expected CN Apocalypse Song target to survive damage field");
  assert.equal(damageShooter.lifeTimeFrames, damageCase.shooterLifeTimeFrames);
  assertClose(
    damageShooter.ageFrames,
    damageCase.shooterEventFrame,
    "CN Apocalypse Song delayed damage shooter age",
  );
  assert.equal(damageBullet.dealsDamage, !damageCase.bulletNoDamage);
  assert.equal(damageBullet.hitTargetType, damageCase.bulletHitTargetType);
  assert.equal(damageBullet.damageJudgeType, damageCase.bulletDamageJudgeType);
  assert.equal(damageBullet.colliderType, damageCase.bulletColliderType);
  assert.equal(damageBullet.remainingHits, damageCase.bulletHitTimes - 1);
  assert.ok(targetAfterDamage.hp < (targetAfterStun?.hp ?? 0));
}

function testCnActiveSkillZesshoStaticFieldShooter(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const zesshoCase = getActiveSkillShooterSpawnCase(
    "active-skill-zessho-static-field-lv1",
  );
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    zesshoCase.activeSkillId,
  );
  const baseState = createStateWithEnemy(testRuntimeData, { x: 100, y: 0 });
  const firstFrameState = updateNfoSimulation(
    chargeActiveSkill(baseState),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const shooter = firstFrameState.activeShooters.find((candidate) => (
    candidate.shooterId === zesshoCase.shooterId
  ));
  const fieldBullet = firstFrameState.bullets.find((candidate) => (
    candidate.bulletTypeId === zesshoCase.bulletTypeId
  ));
  const targetAfterField = firstFrameState.enemies.find((enemy) => (
    enemy.id === baseState.enemies[0]?.id
  ));

  assert.ok(shooter, "expected CN active skill 114 to create shooter 1001");
  assert.ok(fieldBullet, "expected CN active skill 114 shooter to emit bullet 99");
  assert.ok(targetAfterField, "expected CN Zessho target to survive the static field");
  assert.equal(shooter.behaviorType, zesshoCase.shooterBehaviorType);
  assert.equal(shooter.followsOwnerDirection, zesshoCase.shooterFollowsOwnerDirection);
  assert.equal(shooter.lifeTimeFrames, zesshoCase.shooterLifeTimeFrames);
  assertClose(shooter.x, baseState.player.x, "CN Zessho shooter x");
  assertClose(shooter.y, baseState.player.y, "CN Zessho shooter y");
  assert.equal(fieldBullet.dealsDamage, !zesshoCase.bulletNoDamage);
  assert.equal(fieldBullet.hitTargetType, zesshoCase.bulletHitTargetType);
  assert.equal(fieldBullet.damageJudgeType, zesshoCase.bulletDamageJudgeType);
  assert.equal(fieldBullet.colliderType, zesshoCase.bulletColliderType);
  assert.equal(fieldBullet.remainingHits, zesshoCase.bulletHitTimes - 1);
  assertClose(fieldBullet.x, baseState.player.x, "CN Zessho field x");
  assertClose(fieldBullet.y, baseState.player.y, "CN Zessho field y");
  assertClose(Math.hypot(fieldBullet.vx, fieldBullet.vy), 0, "CN Zessho field speed");
  assertClose(
    fieldBullet.remainingSeconds,
    (zesshoCase.bulletLifeTimeFrames - 1) / 30,
    "CN Zessho field lifetime after first frame",
  );
  assert.ok(targetAfterField.hp < (baseState.enemies[0]?.hp ?? 0));

  const movedOwnerState = updateNfoSimulation(
    {
      ...firstFrameState,
      player: {
        ...firstFrameState.player,
        x: firstFrameState.player.x + 120,
        y: firstFrameState.player.y + 80,
        facingAngle: Math.PI / 2,
      },
      bullets: [],
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const staticShooter = movedOwnerState.activeShooters.find((candidate) => (
    candidate.shooterId === zesshoCase.shooterId
  ));

  assert.ok(staticShooter, "expected CN Zessho shooter to remain active after owner moves");
  assertClose(staticShooter.x, shooter.x, "CN Zessho non-following shooter x");
  assertClose(staticShooter.y, shooter.y, "CN Zessho non-following shooter y");
  assertClose(staticShooter.ownerFacingAngle, shooter.ownerFacingAngle, "CN Zessho shooter facing");
}

function testCnActiveSkillEndlessStarMapOwnerForwardField(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const fieldCase = getActiveSkillShooterSpawnCase(
    "active-skill-endless-star-map-owner-forward-field-lv1",
  );
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    fieldCase.activeSkillId,
  );
  const starMapBuff = testRuntimeData.buffs.find((candidate) => candidate.id === 107);
  const starMapBuffLevel = starMapBuff?.levels[0];
  assert.ok(starMapBuffLevel, "expected CN active skill 116 buff 107");
  const expGainBuff = getAttributeValue(starMapBuffLevel.attributes, 11);
  const magnetRangeBuff = getAttributeValue(starMapBuffLevel.attributes, 5);
  const coinGainBuff = getAttributeValue(starMapBuffLevel.attributes, 15);
  assert.equal(expGainBuff, 100);
  assert.equal(magnetRangeBuff, 1000);
  assert.equal(coinGainBuff, 100);

  const initialState = createStateWithEnemy(testRuntimeData, { x: 100, y: 0 });
  const selectedLevel = testRuntimeData.levels.find((level) => (
    level.id === initialState.selection.levelId
  ));
  assert.ok(selectedLevel);
  const pickupValue = 10;
  const expectedGainedExp = Math.floor(
    pickupValue
      * ((selectedLevel.playerExpRate || 100) / 100)
      * (1 + (initialState.player.expGain + expGainBuff) / 100),
  );
  const expectedGainedCoin = Math.floor(10 * (1 + coinGainBuff / 100));
  const baseState = {
    ...initialState,
    pickups: [
      {
        id: 990116,
        itemId: 990116,
        name: "CN Star Map EXP",
        itemType: 0,
        value: pickupValue,
        canBeMagneted: true,
        radius: 5,
        remainingSeconds: 10,
        x: initialState.player.x + initialState.player.itemMagnetRange + 400,
        y: initialState.player.y,
      },
      {
        id: 990117,
        itemId: 990117,
        name: "CN Star Map Coin",
        itemType: 5,
        value: 10,
        canBeMagneted: true,
        radius: 5,
        remainingSeconds: 10,
        x: initialState.player.x + initialState.player.itemMagnetRange + 400,
        y: initialState.player.y,
      },
    ],
  };
  const nextState = updateNfoSimulation(
    chargeActiveSkill(baseState),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const shooter = nextState.activeShooters.find((candidate) => (
    candidate.shooterId === fieldCase.shooterId
  ));
  const fieldBullet = nextState.bullets.find((candidate) => (
    candidate.bulletTypeId === fieldCase.bulletTypeId
  ));
  const targetAfter = nextState.enemies.find((enemy) => (
    enemy.id === baseState.enemies[0]?.id
  ));

  assert.ok(shooter, "expected CN active skill 116 to create shooter 10000");
  assert.ok(fieldBullet, "expected CN shooter 10000 to emit field bullet 64");
  assert.ok(targetAfter, "expected CN Endless Star Map target to survive the field");
  assert.equal(shooter.sourceTeam, "player");
  assert.equal(shooter.shooterId, fieldCase.shooterId);
  assertClose(shooter.x, baseState.player.x, "CN Endless Star Map shooter x");
  assertClose(shooter.y, baseState.player.y, "CN Endless Star Map shooter y");
  assertClose(shooter.ageFrames, fieldCase.shooterEventFrame, "CN Endless Star Map shooter age");
  assert.equal(fieldBullet.hitTargetType, fieldCase.bulletHitTargetType);
  assert.equal(fieldBullet.damageJudgeType, fieldCase.bulletDamageJudgeType);
  assert.equal(fieldBullet.colliderType, fieldCase.bulletColliderType);
  assert.equal(fieldBullet.dealsDamage, !fieldCase.bulletNoDamage);
  assert.equal(fieldBullet.remainingHits, fieldCase.bulletHitTimes - 1);
  assertClose(fieldBullet.x, baseState.player.x, "CN Endless Star Map field x");
  assertClose(fieldBullet.y, baseState.player.y, "CN Endless Star Map field y");
  assertClose(Math.hypot(fieldBullet.vx, fieldBullet.vy), 0, "CN Endless Star Map field speed");
  assertClose(fieldBullet.angle, 0, "CN Endless Star Map owner-forward angle");
  assertClose(
    fieldBullet.remainingSeconds,
    (fieldCase.bulletLifeTimeFrames - 1) / 30,
    "CN Endless Star Map field lifetime after first frame",
  );
  assert.ok(targetAfter.hp < (baseState.enemies[0]?.hp ?? 0));
  assert.equal(targetAfter.activeBuffs.length, 0);
  assert.ok(nextState.player.activeBuffs.some((buff) => buff.id === starMapBuff.id));
  assert.equal(nextState.collectedItems[990116], 1);
  assert.equal(nextState.collectedItems[990117], 1);
  assert.equal(nextState.collectedExp, expectedGainedExp);
  assert.equal(nextState.collectedCoin, expectedGainedCoin);
  assert.equal(nextState.pickups.some((pickup) => pickup.id === 990116), false);
  assert.equal(nextState.pickups.some((pickup) => pickup.id === 990117), false);
}

function testCnActiveSkillAbsoluteGuardShooterFriendlyInvincibleBuff(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const hitBuffCase = getActiveSkillShooterHitBuffCase(
    "active-skill-absolute-guard-shooter-friendly-invincible-buff",
  );
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    hitBuffCase.activeSkillId,
  );
  const state = createStateWithoutEnemies(testRuntimeData);
  const nextState = updateNfoSimulation(
    chargeActiveSkill(state),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const shooter = nextState.activeShooters.find((candidate) => (
    candidate.shooterId === hitBuffCase.shooterId
  ));
  const bullet = nextState.bullets.find((candidate) => (
    candidate.bulletTypeId === hitBuffCase.bulletTypeId
  ));
  const activeBuff = nextState.player.activeBuffs.find((buff) => (
    buff.id === hitBuffCase.hitBuffId
  ));

  assert.ok(shooter, "expected CN active skill 117 to create shooter 11000");
  assert.ok(bullet, "expected CN shooter 11000 to emit friendly invincible bullet 65");
  assert.ok(activeBuff, "expected CN Absolute Guard bullet to apply buff 108 to the player");
  assert.equal(shooter.sourceTeam, "player");
  assert.equal(shooter.shooterId, hitBuffCase.shooterId);
  assert.equal(bullet.canDamagePlayer, false);
  assert.equal(bullet.dealsDamage, !hitBuffCase.bulletNoDamage);
  assert.equal(bullet.hitTargetType, hitBuffCase.bulletHitTargetType);
  assert.equal(bullet.damageJudgeType, hitBuffCase.bulletDamageJudgeType);
  assert.equal(bullet.colliderType, hitBuffCase.bulletColliderType);
  assert.equal(bullet.hitBuffId, hitBuffCase.hitBuffId);
  assert.equal(bullet.hitBuffLevel, hitBuffCase.hitBuffLevel);
  assert.equal(bullet.remainingHits, hitBuffCase.bulletHitTimes - 1);
  assert.equal(activeBuff.type, hitBuffCase.buffType);
  assert.equal(activeBuff.value, hitBuffCase.buffValue);
  assertClose(
    activeBuff.remainingSeconds,
    hitBuffCase.buffDurationFrames / 30,
    "CN Absolute Guard buff duration",
  );
}

function testCnActiveSkillKiraKiraDokiDokiDelayedStunField(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const hitBuffCase = getActiveSkillShooterHitBuffCase(
    "active-skill-kirakira-dokidoki-delayed-stun-field",
  );
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    hitBuffCase.activeSkillId,
  );
  const baseState = createStateWithEnemy(testRuntimeData, { x: 100, y: 0 });
  const firstFrameState = updateNfoSimulation(
    chargeActiveSkill(baseState),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );
  const shooter = firstFrameState.activeShooters.find((candidate) => (
    candidate.shooterId === hitBuffCase.shooterId
  ));
  const fieldBullet = firstFrameState.bullets.find((candidate) => (
    candidate.bulletTypeId === hitBuffCase.bulletTypeId
  ));
  const targetBeforeDelay = firstFrameState.enemies.find((enemy) => (
    enemy.id === baseState.enemies[0]?.id
  ));

  assert.ok(shooter, "expected CN active skill 16 to create shooter 9000");
  assert.ok(fieldBullet, "expected CN shooter 9000 to emit DokiDoki field bullet 59");
  assert.ok(targetBeforeDelay, "expected CN DokiDoki target to remain before delay");
  assert.equal(shooter.sourceTeam, "player");
  assertClose(shooter.x, baseState.player.x, "CN DokiDoki shooter x");
  assertClose(shooter.y, baseState.player.y, "CN DokiDoki shooter y");
  assert.equal(fieldBullet.hitTargetType, hitBuffCase.bulletHitTargetType);
  assert.equal(fieldBullet.damageJudgeType, hitBuffCase.bulletDamageJudgeType);
  assert.equal(fieldBullet.colliderType, hitBuffCase.bulletColliderType);
  assert.equal(fieldBullet.hitBuffId, hitBuffCase.hitBuffId);
  assert.equal(fieldBullet.hitBuffLevel, hitBuffCase.hitBuffLevel);
  assert.equal(fieldBullet.dealsDamage, !hitBuffCase.bulletNoDamage);
  assertClose(fieldBullet.x, baseState.player.x, "CN DokiDoki field x");
  assertClose(fieldBullet.y, baseState.player.y, "CN DokiDoki field y");
  assertClose(Math.hypot(fieldBullet.vx, fieldBullet.vy), 0, "CN DokiDoki field speed");
  assertClose(
    fieldBullet.damageJudgeDelaySeconds,
    (hitBuffCase.bulletDamageJudgeDelayFrames - 1) / 30,
    "CN DokiDoki field delay after first frame",
  );
  assert.equal(targetBeforeDelay.hp, baseState.enemies[0]?.hp);
  assert.equal(targetBeforeDelay.activeBuffs.length, 0);

  const afterDelayState = updateNfoSimulation(
    firstFrameState,
    testRuntimeData,
    NO_INPUT,
    (hitBuffCase.bulletDamageJudgeDelayFrames - 1) / 30,
  );
  const targetAfterDelay = afterDelayState.enemies.find((enemy) => (
    enemy.id === baseState.enemies[0]?.id
  ));
  const stunBuff = targetAfterDelay?.activeBuffs.find((buff) => (
    buff.id === hitBuffCase.hitBuffId
  ));

  assert.ok(targetAfterDelay, "expected CN DokiDoki target to survive the delayed field");
  assert.ok(targetAfterDelay.hp < (baseState.enemies[0]?.hp ?? 0));
  assert.ok(stunBuff, "expected CN DokiDoki field to apply stun buff 18");
  assert.equal(stunBuff.type, hitBuffCase.buffType);
  assert.equal(stunBuff.value, hitBuffCase.buffValue);
  assertClose(
    stunBuff.remainingSeconds,
    hitBuffCase.buffDurationFrames / 30,
    "CN DokiDoki stun duration",
  );
}

function testCnAIDataCreatesBossShooter(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForShooter(sourceRuntimeData, 2100);
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const state = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 100,
        baseState.player.y,
        {
          aiTypeId: 66,
          attack: 2,
          speed: 0,
          radius: 5,
        },
      ),
    ],
  };
  const idleState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 0);
  assert.equal(idleState.activeShooters.length, 0);
  assert.equal(idleState.enemies[0]?.aiStateId, 1);

  const aiActionCase = getAIActionCase("ai-boss-cat-creates-shooter-2100");
  const spawnedShooterState = updateNfoSimulation(
    idleState,
    testRuntimeData,
    NO_INPUT,
    aiActionCase.firstStateLastFrame / 30,
  );
  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    testRuntimeData,
    NO_INPUT,
    7 / 30,
  );
  const bullet = firedShooterState.bullets.find((candidate) => candidate.bulletTypeId === 101);

  assert.equal(spawnedShooterState.activeShooters[0]?.shooterId, 2100);
  assert.equal(spawnedShooterState.activeShooters[0]?.sourceTeam, "enemy");
  assert.equal(spawnedShooterState.enemies[0]?.aiStateId, aiActionCase.stateId);
  assert.ok(bullet, "expected CN AI 66 shooter 2100 to fire bullet 101");
  assert.equal(bullet.canDamagePlayer, true);
  assert.equal(bullet.rotateType, 2);
  assert.equal(bullet.hitTargetType, 1);
}

function testCnAIDataCreatesHydraFriendlyTargetFireballShooter(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const hydraActionCase = getAIActionCase(
    "ai-hydra-creates-friendly-target-fireball-shooter-2001",
  );
  const hydraEnemy = createEnemyFixture(
    baseState,
    baseState.player.x + 120,
    baseState.player.y,
    {
      aiTypeId: hydraActionCase.aiTypeId,
      attack: 2,
      speed: 0,
      radius: 5,
    },
  );
  const state = {
    ...baseState,
    enemies: [hydraEnemy],
  };

  const spawnedShooterState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    hydraActionCase.firstStateLastFrame / 30,
  );
  const waitingShooterState = updateNfoSimulation(
    spawnedShooterState,
    testRuntimeData,
    NO_INPUT,
    (hydraActionCase.shooterEventFrame - 1) / 30,
  );
  assert.equal(
    waitingShooterState.bullets.some((candidate) => (
      candidate.bulletTypeId === hydraActionCase.shooterBulletTypeId
    )),
    false,
  );
  const firedShooterState = updateNfoSimulation(
    waitingShooterState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const shooter = spawnedShooterState.activeShooters.find((candidate) => (
    candidate.shooterId === hydraActionCase.shooterId
  ));
  const bullet = firedShooterState.bullets.find((candidate) => (
    candidate.bulletTypeId === hydraActionCase.shooterBulletTypeId
  ));

  assert.ok(shooter, "expected CN AI 28 to create shooter 2001");
  assert.equal(shooter.sourceTeam, "enemy");
  assert.equal(spawnedShooterState.enemies[0]?.aiStateId, hydraActionCase.stateId);
  assert.ok(bullet, "expected CN AI 28 shooter 2001 to fire bullet 53");
  assert.equal(bullet.canDamagePlayer, true);
  assert.equal(hydraActionCase.shooterRotationType, 0);
  assert.equal(bullet.rotateType, hydraActionCase.shooterBulletDataRotationType);
  assert.equal(bullet.hitTargetType, hydraActionCase.shooterBulletHitTargetType);
  const expectedOriginX = hydraEnemy.x + hydraActionCase.shooterFormationOffsetX;
  const expectedOriginY = hydraEnemy.y + hydraActionCase.shooterFormationOffsetY;
  const expectedDirectionX = baseState.player.x - expectedOriginX;
  const expectedDirectionY = baseState.player.y - expectedOriginY;
  const expectedDirectionLength = Math.hypot(expectedDirectionX, expectedDirectionY);
  const inferredOriginX = bullet.x - bullet.vx / 30;
  const inferredOriginY = bullet.y - bullet.vy / 30;
  assertClose(inferredOriginX, expectedOriginX, "CN Hydra fireball event-offset origin x");
  assertClose(inferredOriginY, expectedOriginY, "CN Hydra fireball event-offset origin y");
  assertClose(
    Math.hypot(bullet.vx, bullet.vy),
    hydraActionCase.shooterBulletSpeed,
    "CN Hydra fireball speed",
  );
  assertClose(
    bullet.vx,
    (expectedDirectionX / expectedDirectionLength) * hydraActionCase.shooterBulletSpeed,
    "CN Hydra fireball event-offset target vx",
  );
  assertClose(
    bullet.vy,
    (expectedDirectionY / expectedDirectionLength) * hydraActionCase.shooterBulletSpeed,
    "CN Hydra fireball event-offset target vy",
  );
  assert.ok(bullet.vx < 0, "expected CN Hydra fireball to travel toward the player");
  assert.ok(bullet.vy < 0, "expected CN Hydra fireball to use event Y offset");
}

function testCnAIDataCreatesLongHydraTimelineShooter(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const longHydraActionCase = getAIActionCase(
    "ai-hydra-creates-long-timeline-fireball-shooter-2000",
  );
  const hydraEnemy = createEnemyFixture(
    baseState,
    baseState.player.x + 120,
    baseState.player.y,
    {
      aiTypeId: longHydraActionCase.aiTypeId,
      aiStateId: longHydraActionCase.stateId,
      aiStateElapsedFrames: 0,
      attack: 2,
      speed: 0,
      radius: 5,
      isBoss: true,
    },
  );
  const state = {
    ...baseState,
    player: {
      ...baseState.player,
      hp: 999999,
      maxHp: 999999,
    },
    enemies: [hydraEnemy],
  };

  const spawnedShooterState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 0);
  const shooter = spawnedShooterState.activeShooters.find((candidate) => (
    candidate.shooterId === longHydraActionCase.shooterId
  ));
  assert.ok(shooter, "expected CN AI 29 state 5 to create shooter 2000");
  assert.equal(shooter.sourceTeam, "enemy");
  assert.equal(spawnedShooterState.enemies[0]?.aiStateId, longHydraActionCase.stateId);
  assert.equal(longHydraActionCase.shooterEvents.length, longHydraActionCase.shooterEventCount);

  let firedShooterState = spawnedShooterState;
  let previousEventFrame = 0;
  for (const event of longHydraActionCase.shooterEvents) {
    assert.equal(event.directionType, longHydraActionCase.shooterDirectionType);
    assert.equal(event.rotationType, longHydraActionCase.shooterRotationType);
    assert.equal(event.bulletTypeId, longHydraActionCase.shooterBulletTypeId);
    assert.equal(event.bulletSpeed, longHydraActionCase.shooterBulletSpeed);
    assert.equal(event.bulletHitTargetType, longHydraActionCase.shooterBulletHitTargetType);

    const framesBeforeEvent = event.eventFrame - previousEventFrame - 1;
    assert.ok(framesBeforeEvent >= 0, "expected long Hydra events to be ordered by increasing frame");
    if (framesBeforeEvent > 0) {
      firedShooterState = updateNfoSimulation(
        firedShooterState,
        testRuntimeData,
        NO_INPUT,
        framesBeforeEvent / 30,
      );
    }
    const beforeBulletIds = new Set(firedShooterState.bullets.map((bullet) => bullet.id));
    firedShooterState = updateNfoSimulation(
      firedShooterState,
      testRuntimeData,
      NO_INPUT,
      1 / 30,
    );
    const newFireballs = firedShooterState.bullets
      .filter((candidate) => (
        !beforeBulletIds.has(candidate.id)
        && candidate.bulletTypeId === longHydraActionCase.shooterBulletTypeId
      ))
      .sort((a, b) => a.id - b.id);
    assert.equal(newFireballs.length, event.bulletCount);

    const expectedOriginX = hydraEnemy.x + event.formationOffsetX;
    const expectedOriginY = hydraEnemy.y + event.formationOffsetY;
    const expectedDirectionAngle = Math.atan2(
      baseState.player.y - expectedOriginY,
      baseState.player.x - expectedOriginX,
    ) + degreesToRadians(event.directionOffsetAngle);
    for (const fireball of newFireballs) {
      const inferredOriginX = fireball.x - fireball.vx / 30;
      const inferredOriginY = fireball.y - fireball.vy / 30;
      assertClose(
        inferredOriginX,
        expectedOriginX,
        `CN long Hydra event ${event.eventFrame} origin x`,
      );
      assertClose(
        inferredOriginY,
        expectedOriginY,
        `CN long Hydra event ${event.eventFrame} origin y`,
      );
      assertClose(
        fireball.vx,
        Math.cos(expectedDirectionAngle) * event.bulletSpeed,
        `CN long Hydra event ${event.eventFrame} vx`,
      );
      assertClose(
        fireball.vy,
        Math.sin(expectedDirectionAngle) * event.bulletSpeed,
        `CN long Hydra event ${event.eventFrame} vy`,
      );
    }
    previousEventFrame = event.eventFrame;
  }
  const fireballs = firedShooterState.bullets.filter((candidate) => (
    candidate.bulletTypeId === longHydraActionCase.shooterBulletTypeId
  ));
  assert.equal(fireballs.length, longHydraActionCase.shooterEventCount);
  assert.equal(
    firedShooterState.activeShooters.some((candidate) => (
      candidate.shooterId === longHydraActionCase.shooterId
    )),
    true,
  );
  for (const fireball of fireballs) {
    assert.equal(fireball.canDamagePlayer, true);
    assert.equal(fireball.rotateType, longHydraActionCase.shooterBulletDataRotationType);
    assert.equal(fireball.hitTargetType, longHydraActionCase.shooterBulletHitTargetType);
    assertClose(
      Math.hypot(fireball.vx, fireball.vy),
      longHydraActionCase.shooterBulletSpeed,
      "CN long Hydra fireball speed",
    );
  }

  const expiredShooterState = updateNfoSimulation(
    firedShooterState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  assert.equal(
    expiredShooterState.activeShooters.some((candidate) => (
      candidate.shooterId === longHydraActionCase.shooterId
    )),
    false,
  );
}

function testCnAIStateTimelineFireBulletNow(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const aiTimelineCase = getAIStateTimelineCase("ai-michelle-laser-fire-bullet-now-frame-15");
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const state = createStateWithAI44Enemy(
    baseState,
    aiTimelineCase.bulletSize2 - 300,
    aiTimelineCase,
    240,
  );
  const outsideState = createStateWithAI44Enemy(
    baseState,
    aiTimelineCase.bulletSize2 + 100,
    aiTimelineCase,
    240,
  );
  const waitingState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    (aiTimelineCase.fireEventFrame - 1) / 30,
  );
  const firedState = updateNfoSimulation(waitingState, testRuntimeData, NO_INPUT, 2 / 30);
  const outsideFiredState = updateNfoSimulation(
    updateNfoSimulation(
      outsideState,
      testRuntimeData,
      NO_INPUT,
      (aiTimelineCase.fireEventFrame - 1) / 30,
    ),
    testRuntimeData,
    NO_INPUT,
    2 / 30,
  );
  const bullet = firedState.bullets.find((candidate) => candidate.bulletTypeId === 99);
  const outsideBullet = outsideFiredState.bullets.find((candidate) => candidate.bulletTypeId === 99);

  assert.equal(waitingState.bullets.some((candidate) => candidate.bulletTypeId === 99), false);
  assert.equal(waitingState.enemies[0]?.x, state.enemies[0]?.x);
  assert.equal(waitingState.enemies[0]?.y, state.enemies[0]?.y);
  assert.equal(firedState.enemies[0]?.x, state.enemies[0]?.x);
  assert.equal(firedState.enemies[0]?.y, state.enemies[0]?.y);
  assert.ok(bullet, "expected CN AI 44 state 3 FireBulletNow to emit bullet 99");
  assert.ok(outsideBullet, "expected outside-range CN AI 44 state 3 to emit bullet 99");
  assert.equal(bullet.canDamagePlayer, true);
  assert.equal(bullet.hitTargetType, aiTimelineCase.bulletHitTargetType);
  assert.equal(bullet.damageJudgeType, aiTimelineCase.bulletDamageJudgeType);
  assert.equal(bullet.colliderType, aiTimelineCase.bulletColliderType);
  assert.equal(bullet.colliderWidth, aiTimelineCase.bulletSize);
  assert.equal(bullet.colliderLength, aiTimelineCase.bulletSize2);
  assert.equal(bullet.remainingHits, aiTimelineCase.bulletHitTimes - 1);
  assert.equal(firedState.player.hp, state.player.hp - bullet.damage);
  assert.equal(outsideBullet.remainingHits, aiTimelineCase.bulletHitTimes);
  assert.equal(outsideFiredState.player.hp, outsideState.player.hp);
}

function createStateWithAI44Enemy(
  baseState: NfoSimulationState,
  enemyOffsetX: number,
  aiTimelineCase: ReturnType<typeof getAIStateTimelineCase>,
  enemySpeed = 0,
): NfoSimulationState {
  return {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + enemyOffsetX,
        baseState.player.y,
        {
          aiTypeId: aiTimelineCase.aiTypeId,
          aiStateId: aiTimelineCase.stateId,
          aiStateElapsedFrames: 0,
          attack: 2,
          speed: enemySpeed,
          radius: 5,
        },
      ),
    ],
  };
}

function testCnAIStateFireAllWeaponNow(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData, { weaponId: 26 });
  const state = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 600,
        baseState.player.y,
        {
          hp: 999999,
          speed: 0,
          radius: 5,
        },
      ),
    ],
  };

  const spawnState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 0);
  const minion = spawnState.minions.find((candidate) => candidate.minionId === 4);
  assert.ok(minion, "expected CN weapon 26 to spawn minion 4");
  assert.equal(minion.aiTypeId, 103);
  assert.equal(minion.weaponId, 26);
  assert.equal(minion.canFireOwnWeapon, true);
  assert.equal(spawnState.bullets.some((candidate) => candidate.bulletTypeId === 34), false);

  const enterMoveState = updateNfoSimulation(spawnState, testRuntimeData, NO_INPUT, 30 / 30);
  assert.equal(enterMoveState.minions[0]?.aiStateId, 1);
  assert.equal(enterMoveState.bullets.some((candidate) => candidate.bulletTypeId === 34), false);

  const enterRoarState = updateNfoSimulation(enterMoveState, testRuntimeData, NO_INPUT, 30 / 30);
  assert.equal(enterRoarState.minions[0]?.aiStateId, 2);
  assert.equal(enterRoarState.bullets.some((candidate) => candidate.bulletTypeId === 34), false);

  const waitingState = updateNfoSimulation(enterRoarState, testRuntimeData, NO_INPUT, 19 / 30);
  assert.equal(waitingState.bullets.some((candidate) => candidate.bulletTypeId === 34), false);

  const firedState = updateNfoSimulation(waitingState, testRuntimeData, NO_INPUT, 2 / 30);
  const bullet = firedState.bullets.find((candidate) => candidate.bulletTypeId === 34);

  assert.ok(bullet, "expected CN AI 103 FireAllWeaponNow to emit Leo bullet 34");
  assert.equal(bullet.hitTargetType, 0);
  assert.equal(bullet.canDamagePlayer, false);
}

function testCnAIStateShooterSpawnPosOne(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const aiShooterSpawnCase = getAIStateShooterSpawnCase(
    "ai-archangel-shooter-spawn-pos-1-player-laser",
  );
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const state = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 600,
        baseState.player.y,
        {
          aiTypeId: aiShooterSpawnCase.aiTypeId,
          aiStateId: aiShooterSpawnCase.stateId,
          aiStateElapsedFrames: 0,
          attack: 2,
          speed: 0,
          radius: 5,
        },
      ),
    ],
  };

  const spawnedShooterState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 0);
  const shooter = spawnedShooterState.activeShooters.find((candidate) => (
    candidate.shooterId === aiShooterSpawnCase.shooterId
  ));
  assert.ok(shooter, "expected CN AI 32 state 4 to create shooter 1");
  assert.equal(shooter.sourceTeam, "enemy");
  assertClose(shooter.x, baseState.player.x, "CN AI shooter spawnPos 1 x");
  assertClose(shooter.y, baseState.player.y, "CN AI shooter spawnPos 1 y");

  const firedShooterState = updateNfoSimulation(
    spawnedShooterState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const bullet = firedShooterState.bullets.find((candidate) => (
    candidate.bulletTypeId === aiShooterSpawnCase.bulletTypeId
  ));
  assert.ok(bullet, "expected CN shooter 1 to emit bullet 52");
  assert.equal(bullet.canDamagePlayer, true);
  assert.equal(bullet.hitTargetType, 1);
  assertClose(bullet.x, baseState.player.x, "CN AI shooter spawnPos 1 bullet x");
  assertClose(bullet.y, baseState.player.y, "CN AI shooter spawnPos 1 bullet y");
}

function testCnAIStateNoColliding(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const state = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x,
        baseState.player.y,
        {
          aiTypeId: 26,
          aiStateId: 2,
          aiStateElapsedFrames: 0,
          attack: 5,
          speed: 0,
          radius: 20,
        },
      ),
    ],
  };
  const noCollidingState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 1 / 30);

  assert.equal(noCollidingState.enemies[0]?.noColliding, true);
  assert.equal(noCollidingState.player.hp, baseState.player.hp);
}

function testCnAIStateBlackCatTeleportTimeline(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const teleportCase = getAIStateTeleportCase("ai-moon-cat-black-cat-teleport-frame-30");
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const state = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 300,
        baseState.player.y,
        {
          aiTypeId: teleportCase.aiTypeId,
          aiStateId: teleportCase.stateId,
          aiStateElapsedFrames: 0,
          attack: 2,
          speed: 120,
          radius: 5,
        },
      ),
    ],
  };
  const startEnemy = state.enemies[0];
  assert.ok(startEnemy);

  const waitingState = updateNfoSimulation(
    state,
    testRuntimeData,
    NO_INPUT,
    (teleportCase.teleportEventFrame - 1) / 30,
  );
  const waitingEnemy = waitingState.enemies[0];
  assert.ok(waitingEnemy);
  assert.equal(waitingEnemy.x, startEnemy.x);
  assert.equal(waitingEnemy.y, startEnemy.y);
  assert.equal(waitingEnemy.noColliding, true);
  assert.equal(waitingState.bullets.length, 0);

  const teleportedState = updateNfoSimulation(waitingState, testRuntimeData, NO_INPUT, 2 / 30);
  const teleportedEnemy = teleportedState.enemies[0];
  assert.ok(teleportedEnemy);
  assert.notDeepEqual(
    { x: teleportedEnemy.x, y: teleportedEnemy.y },
    { x: startEnemy.x, y: startEnemy.y },
  );
  assert.equal(teleportedEnemy.noColliding, true);
  assert.equal(teleportedState.bullets.length, 0);

  const firedState = updateNfoSimulation(
    teleportedState,
    testRuntimeData,
    NO_INPUT,
    (teleportCase.fireEventFrame - (teleportCase.teleportEventFrame + 1)) / 30,
  );
  const bullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === teleportCase.bulletTypeId
  ));
  assert.ok(bullet, "expected CN AI 26 teleport state to fire bullet 51 at frame 46");
  assert.equal(bullet.canDamagePlayer, true);

  const normalState = updateNfoSimulation(
    firedState,
    testRuntimeData,
    NO_INPUT,
    (teleportCase.normalEventFrame - teleportCase.fireEventFrame) / 30,
  );
  assert.equal(normalState.enemies[0]?.aiStateId, teleportCase.nextStateId);
  assert.equal(normalState.enemies[0]?.noColliding, false);
}

function testCnAIStateMoveToRandomPositionAroundPlayer(sourceRuntimeData: NfoOfflineRuntimeData) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const movementCase = getAIStateMovementCase("ai-random-move-around-player-state");
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const state = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 120,
        baseState.player.y,
        {
          aiTypeId: movementCase.aiTypeId,
          aiStateId: movementCase.stateId,
          aiStateElapsedFrames: 0,
          attack: 2,
          speed: 120,
          radius: 5,
        },
      ),
    ],
  };
  const startEnemy = state.enemies[0];
  assert.ok(startEnemy);

  const movedState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 0.2);
  const movedEnemy = movedState.enemies[0];

  assert.ok(movedEnemy);
  assert.equal(movementCase.stateType, 2);
  assert.equal(movementCase.nextStateId, 1);
  assert.equal(movementCase.bulletTypeId, 51);
  assert.equal(movedEnemy.aiStateId, movementCase.stateId);
  assert.equal(movedEnemy.aiMoveTargetStateId, movementCase.stateId);
  assert.notEqual(movedEnemy.y, startEnemy.y);
  assert.equal(
    movedState.bullets.some((candidate) => candidate.bulletTypeId === movementCase.bulletTypeId),
    true,
  );
}

function testCnAIStateGolemRollAttackUsesStateMoveSpeed(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const rollCase = getAIStateMovementCase("ai-golem-roll-attack-state-speed");
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const state = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 500,
        baseState.player.y,
        {
          aiTypeId: rollCase.aiTypeId,
          aiStateId: rollCase.stateId,
          aiStateElapsedFrames: 0,
          attack: 0,
          speed: 0,
          radius: 5,
        },
      ),
    ],
  };
  const startEnemy = state.enemies[0];
  assert.ok(startEnemy);

  const halfRollState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 0.5);
  const halfRollEnemy = halfRollState.enemies[0];

  assert.ok(halfRollEnemy);
  assert.equal(rollCase.stateType, 10);
  assert.equal(rollCase.stateMoveSpeed, 600);
  assert.equal(rollCase.isFireBullet, false);
  assert.equal(rollCase.fireBulletCount, 1);
  assert.equal(halfRollEnemy.aiStateId, rollCase.stateId);
  assert.equal(halfRollState.bullets.length, 0);
  assertClose(
    halfRollEnemy.x,
    startEnemy.x - rollCase.stateMoveSpeed * 0.5,
    "CN Golem_RollAttack state-speed x",
  );
  assertClose(halfRollEnemy.y, startEnemy.y, "CN Golem_RollAttack state-speed y");

  const transitionedState = updateNfoSimulation(
    halfRollState,
    testRuntimeData,
    NO_INPUT,
    0.5,
  );
  assert.equal(transitionedState.enemies[0]?.aiStateId, rollCase.nextStateId);
}

function testCnAIStateSamuraiFlashAttackMovesNearPlayer(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const flashCase = getAIStateMovementCase("ai-samurai-flash-attack-state");
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const state = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 900,
        baseState.player.y,
        {
          aiTypeId: flashCase.aiTypeId,
          aiStateId: flashCase.stateId,
          aiStateElapsedFrames: 0,
          attack: 0,
          speed: 0,
          radius: 5,
        },
      ),
    ],
  };
  const startEnemy = state.enemies[0];
  assert.ok(startEnemy);

  const flashedState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 1 / 30);
  const flashedEnemy = flashedState.enemies[0];

  assert.ok(flashedEnemy);
  assert.equal(flashCase.stateType, 11);
  assert.equal(flashCase.isFireBullet, false);
  assert.equal(flashCase.fireBulletCount, 1);
  assert.equal(flashedEnemy.aiStateId, flashCase.stateId);
  assert.notDeepEqual(
    { x: flashedEnemy.x, y: flashedEnemy.y },
    { x: startEnemy.x, y: startEnemy.y },
  );
  assert.ok(
    Math.hypot(
      flashedEnemy.x - flashedState.player.x,
      flashedEnemy.y - flashedState.player.y,
    ) <= 480,
    "expected CN Samurai_FlashAttack to move near the player",
  );
  assert.equal(flashedState.bullets.length, 0);

  const transitionedState = updateNfoSimulation(
    flashedState,
    testRuntimeData,
    NO_INPUT,
    (flashCase.stateLastFrame - 1) / 30,
  );
  assert.equal(transitionedState.enemies[0]?.aiStateId, flashCase.nextStateId);
}

function testCnAIStateCatBossAttackCreatesBulletRain(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const catBossCase = getAIStateMovementCase("ai-cat-boss-attack-bullet-rain-state");
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const bossX = baseState.player.x + 900;
  const bossY = baseState.player.y - 120;
  const state = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        bossX,
        bossY,
        {
          aiTypeId: catBossCase.aiTypeId,
          aiStateId: catBossCase.stateId,
          aiStateElapsedFrames: 0,
          attack: 2,
          speed: 0,
          radius: 200,
        },
      ),
    ],
  };

  const firedState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 1 / 30);
  const bullet = firedState.bullets.find((candidate) => (
    candidate.bulletTypeId === catBossCase.bulletTypeId
  ));
  const boss = firedState.enemies[0];

  assert.ok(boss);
  assert.ok(bullet, "expected CN CatBoss_Attack to create bullet 51 rain");
  assert.equal(catBossCase.stateType, 13);
  assert.equal(catBossCase.isFireBullet, true);
  assert.equal(catBossCase.fireBulletCount, 1);
  assert.equal(bullet.canDamagePlayer, true);
  assert.notDeepEqual({ x: bullet.x, y: bullet.y }, { x: boss.x, y: boss.y });
  assert.ok(
    Math.abs(bullet.x - firedState.player.x) <= 240,
    "expected CatBoss bullet rain x to spawn near the player",
  );
  assert.ok(
    bullet.y > firedState.player.y + 320,
    "expected CatBoss bullet rain y to spawn above the player",
  );
  assert.ok(bullet.vy < 0, "expected CatBoss bullet rain to travel downward toward the player");
  assert.ok(
    Math.hypot(bullet.vx, bullet.vy) > 0,
    "expected CatBoss bullet rain to have velocity",
  );

  const transitionedState = updateNfoSimulation(
    firedState,
    testRuntimeData,
    NO_INPUT,
    (catBossCase.stateLastFrame - 1) / 30,
  );
  assert.equal(transitionedState.enemies[0]?.aiStateId, catBossCase.nextStateId);
}

function testCnAIStateOffsetMovementUsesStateMoveOffset(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const baseState = {
    ...createStateWithoutEnemies(testRuntimeData),
    worldBounds: {
      minX: -4000,
      minY: -4000,
      maxX: 4000,
      maxY: 4000,
    },
  };

  const michelleCase = getAIStateMovementCase("ai-michelle-laser-offset-move-state");
  const michelleTarget = {
    x: baseState.player.x + michelleCase.stateMoveOffsetX,
    y: baseState.player.y + michelleCase.stateMoveOffsetY,
  };
  const michelleState = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 900,
        baseState.player.y,
        {
          aiTypeId: michelleCase.aiTypeId,
          aiStateId: michelleCase.stateId,
          aiStateElapsedFrames: 0,
          attack: 0,
          speed: 0,
          radius: 5,
        },
      ),
    ],
  };
  const michelleMovedState = updateNfoSimulation(
    michelleState,
    testRuntimeData,
    NO_INPUT,
    0.5,
  );
  const michelleMoved = michelleMovedState.enemies[0];
  assert.ok(michelleMoved);
  assert.equal(michelleCase.stateType, 33);
  assert.equal(michelleMoved.aiStateId, michelleCase.stateId);
  assertClose(
    michelleMoved.x,
    (michelleState.enemies[0]?.x ?? Number.NaN) - michelleCase.stateMoveSpeed * 0.5,
    "CN Michelle laser offset x",
  );
  assertClose(michelleMoved.y, michelleTarget.y, "CN Michelle laser offset y");
  assert.ok(
    Math.abs(michelleMoved.x - michelleTarget.x)
      < Math.abs((michelleState.enemies[0]?.x ?? 0) - michelleTarget.x),
    "expected CN Michelle laser offset state to move toward player plus offset",
  );
  const michelleTransitionedState = updateNfoSimulation(
    michelleMovedState,
    testRuntimeData,
    NO_INPUT,
    0.5,
  );
  assert.equal(michelleTransitionedState.enemies[0]?.aiStateId, michelleCase.nextStateId);

  const clawCase = getAIStateMovementCase("ai-claw-machine-drop-offset-move-state");
  const clawTarget = {
    x: baseState.player.x + clawCase.stateMoveOffsetX,
    y: baseState.player.y + clawCase.stateMoveOffsetY,
  };
  const clawState = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x,
        baseState.player.y + 500,
        {
          aiTypeId: clawCase.aiTypeId,
          aiStateId: clawCase.stateId,
          aiStateElapsedFrames: 0,
          attack: 0,
          speed: 0,
          radius: 5,
        },
      ),
    ],
  };
  const clawMovedState = updateNfoSimulation(
    clawState,
    testRuntimeData,
    NO_INPUT,
    0.5,
  );
  const clawMoved = clawMovedState.enemies[0];
  assert.ok(clawMoved);
  assert.equal(clawCase.stateType, 31);
  assert.equal(clawMoved.aiStateId, clawCase.stateId);
  assertClose(clawMoved.x, clawTarget.x, "CN Claw Machine offset x");
  assertClose(
    clawMoved.y,
    (clawState.enemies[0]?.y ?? Number.NaN) - clawCase.stateMoveSpeed * 0.5,
    "CN Claw Machine offset y",
  );
  assert.ok(
    Math.abs(clawMoved.y - clawTarget.y)
      < Math.abs((clawState.enemies[0]?.y ?? 0) - clawTarget.y),
    "expected CN Claw Machine offset state to move toward player plus offset",
  );

  const golemLandCase = getAIStateMovementCase("ai-ancient-golem-jump-land-offset-state");
  const golemLandTarget = {
    x: baseState.player.x + golemLandCase.stateMoveOffsetX,
    y: baseState.player.y + golemLandCase.stateMoveOffsetY,
  };
  const golemLandState = {
    ...baseState,
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x,
        baseState.player.y - 200,
        {
          aiTypeId: golemLandCase.aiTypeId,
          aiStateId: golemLandCase.stateId,
          aiStateElapsedFrames: 0,
          attack: 0,
          speed: 0,
          radius: 5,
        },
      ),
    ],
  };
  const golemLandMovedState = updateNfoSimulation(
    golemLandState,
    testRuntimeData,
    NO_INPUT,
    0.25,
  );
  const golemLandMoved = golemLandMovedState.enemies[0];
  assert.ok(golemLandMoved);
  assert.equal(golemLandCase.stateType, 32);
  assert.equal(golemLandMoved.aiStateId, golemLandCase.stateId);
  assertClose(golemLandMoved.x, golemLandTarget.x, "CN Ancient Golem landing offset x");
  assertClose(
    golemLandMoved.y,
    (golemLandState.enemies[0]?.y ?? Number.NaN) + golemLandCase.stateMoveSpeed * 0.25,
    "CN Ancient Golem landing offset y",
  );
  assert.ok(
    Math.abs(golemLandMoved.y - golemLandTarget.y)
      < Math.abs((golemLandState.enemies[0]?.y ?? 0) - golemLandTarget.y),
    "expected CN Ancient Golem landing state to move toward player plus offset",
  );
}

function testCnAIStateEntryBuffsApplyToEnemy(sourceRuntimeData: NfoOfflineRuntimeData) {
  assertCnAIStateEntryBuffApplies(
    sourceRuntimeData,
    getAIStateBuffCase("ai-ancient-golem-jump-land-defense-debuff"),
  );
  assertCnAIStateEntryBuffApplies(
    sourceRuntimeData,
    getAIStateBuffCase("ai-ancient-golem-weak-defense-debuff"),
  );
  assertCnAIStateEntryBuffApplies(
    sourceRuntimeData,
    getAIStateBuffCase("ai-time-eye-appearance-continuous-change"),
  );
}

function assertCnAIStateEntryBuffApplies(
  sourceRuntimeData: NfoOfflineRuntimeData,
  buffCase: ReturnType<typeof getAIStateBuffCase>,
) {
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData);
  const state: NfoSimulationState = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 300,
        baseState.player.y,
        {
          aiTypeId: buffCase.aiTypeId,
          aiStateId: buffCase.stateId,
          aiStateElapsedFrames: 0,
          isBoss: true,
          speed: 0,
        },
      ),
    ],
  };

  const buffedState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 1 / 30);
  const activeBuff = buffedState.enemies[0]?.activeBuffs.find((buff) => (
    buff.id === buffCase.buffId
  ));
  assert.ok(
    activeBuff,
    `expected CN AI ${buffCase.aiTypeId} state ${buffCase.stateId} to apply buff ${buffCase.buffId}`,
  );
  assert.equal(activeBuff.level, buffCase.buffLevel);
  assert.equal(activeBuff.type, buffCase.buffType);
  assert.equal(activeBuff.value, buffCase.buffValue);
  assert.equal(activeBuff.maxStackCount, buffCase.buffMaxStackCount);
  assertClose(
    activeBuff.remainingSeconds,
    buffCase.buffDurationFrames / 30,
    `CN AI state buff ${buffCase.buffId} duration`,
  );
  for (const expectedAttribute of buffCase.buffAttributes) {
    const activeAttribute: NfoAttributeData | undefined = activeBuff.attributes.find((attribute) => (
      attribute.attributeType === expectedAttribute.attributeType
    ));
    assert.ok(activeAttribute);
    assert.equal(activeAttribute.value, expectedAttribute.value);
  }

  const repeatedState = updateNfoSimulation(buffedState, testRuntimeData, NO_INPUT, 1 / 30);
  const repeatedBuffs = repeatedState.enemies[0]?.activeBuffs.filter((buff) => (
    buff.id === buffCase.buffId
  )) ?? [];
  assert.equal(repeatedBuffs.length, 1);
}

function testCnAIStateCommonStateChangesApplyToEnemy(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  assertCnAIStateCommonStateChangeApplies(
    sourceRuntimeData,
    getAIStateCommonStateCase("ai-archangel-waiting-common-state"),
    0,
  );
  assertCnAIStateCommonStateChangeApplies(
    sourceRuntimeData,
    getAIStateCommonStateCase("ai-archangel-startup-common-state"),
    1,
  );
}

function assertCnAIStateCommonStateChangeApplies(
  sourceRuntimeData: NfoOfflineRuntimeData,
  commonStateCase: ReturnType<typeof getAIStateCommonStateCase>,
  initialCommonState: number,
) {
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData);
  const state: NfoSimulationState = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 300,
        baseState.player.y,
        {
          aiTypeId: commonStateCase.aiTypeId,
          aiStateId: commonStateCase.stateId,
          aiStateElapsedFrames: 0,
          entityCommonState: initialCommonState,
          isBoss: true,
          speed: 0,
        },
      ),
    ],
  };

  const changedState = updateNfoSimulation(state, testRuntimeData, NO_INPUT, 1 / 30);
  assert.equal(
    changedState.enemies[0]?.entityCommonState,
    commonStateCase.entityCommonStateChangeTo,
  );
}

function testCnAIStateAnimationMetadataAppliesToEnemy(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const landingCase = getAIStateAnimationCase("ai-ancient-golem-landing-restart-animation");
  const timelineCase = getAIStateAnimationCase("ai-black-cat-teleport-timeline-animation");
  const testRuntimeData = configureRuntimeForAI(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData);

  const landingState: NfoSimulationState = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 300,
        baseState.player.y,
        {
          aiTypeId: landingCase.aiTypeId,
          aiStateId: landingCase.stateId,
          aiStateElapsedFrames: 0,
          isBoss: true,
          speed: 0,
        },
      ),
    ],
  };
  const animatedLandingState = updateNfoSimulation(
    landingState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  assert.equal(animatedLandingState.enemies[0]?.animationName, landingCase.playAnimeName);
  assert.equal(animatedLandingState.enemies[0]?.animationRevision, 1);

  const stableLandingState = updateNfoSimulation(
    animatedLandingState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  assert.equal(stableLandingState.enemies[0]?.animationName, landingCase.playAnimeName);
  assert.equal(stableLandingState.enemies[0]?.animationRevision, 1);

  const timelineState: NfoSimulationState = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x + 300,
        baseState.player.y,
        {
          aiTypeId: timelineCase.aiTypeId,
          aiStateId: timelineCase.stateId,
          aiStateElapsedFrames: 0,
          isBoss: true,
          speed: 0,
        },
      ),
    ],
  };
  const animatedTimelineState = updateNfoSimulation(
    timelineState,
    testRuntimeData,
    NO_INPUT,
    timelineCase.timelineEventFrame / 30,
  );
  assert.equal(animatedTimelineState.enemies[0]?.animationName, timelineCase.timelinePlayAnimeName);
  assert.equal(animatedTimelineState.enemies[0]?.animationRevision, 2);
}

function testCnAIStateTriggerLevelEventSpawnsTriggeredLevelEvent(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const levelTriggerCase = getLevelEventTriggerCase(
    "level-claw-machine-trigger-type-two-boss-chain",
  );
  const aiTriggerCase = getAIStateMovementCase(
    "ai-claw-machine-type-two-trigger-return-state",
  );
  const testRuntimeData = structuredClone(sourceRuntimeData);
  testRuntimeData.selected.levelId = levelTriggerCase.levelId;
  const level = testRuntimeData.levels.find((candidate) => (
    candidate.id === levelTriggerCase.levelId
  ));
  assert.ok(level);
  level.totalFrames = 999999;

  const triggeredSpawnEvent = level.events[levelTriggerCase.firstEventIndex];
  assert.ok(triggeredSpawnEvent);
  assert.equal(triggeredSpawnEvent.eventId, aiTriggerCase.triggerLevelEventId);
  assert.equal(triggeredSpawnEvent.triggerType, levelTriggerCase.triggerType);
  assert.equal(triggeredSpawnEvent.enemySpawn.enemyTypeId, levelTriggerCase.firstEnemyTypeId);

  const baseState = createNfoSimulation(testRuntimeData, {
    levelId: levelTriggerCase.levelId,
  });
  const spawnCursorByEvent = Object.fromEntries(
    level.events.map((_, eventIndex) => [
      eventIndex,
      eventIndex === levelTriggerCase.firstEventIndex
        ? triggeredSpawnEvent.startFrame
        : triggeredSpawnEvent.startFrame + 999999,
    ]),
  );
  const aiTriggerState: NfoSimulationState = {
    ...baseState,
    elapsedSeconds: triggeredSpawnEvent.startFrame / 30,
    frame: triggeredSpawnEvent.startFrame,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [
      createEnemyFixture(
        baseState,
        baseState.player.x,
        baseState.player.y + 600,
        {
          aiTypeId: aiTriggerCase.aiTypeId,
          aiStateId: aiTriggerCase.stateId,
          aiStateElapsedFrames: 0,
          speed: 0,
        },
      ),
    ],
    minions: [],
    bullets: [],
    activeShooters: [],
    pickups: [],
    spawnCursorByEvent,
    triggeredLevelEventIds: {},
    levelTriggeredEnemySpawnAppliedByEventIndex: {},
  };

  const untriggeredState = updateNfoSimulation(aiTriggerState, testRuntimeData, NO_INPUT, 0);
  assert.equal(
    untriggeredState.enemies.some((enemy) => (
      enemy.spawnEventId === triggeredSpawnEvent.enemySpawn.eventId
    )),
    false,
  );

  const triggeredState = updateNfoSimulation(aiTriggerState, testRuntimeData, NO_INPUT, 1 / 30);
  assert.equal(triggeredState.triggeredLevelEventIds[triggeredSpawnEvent.eventId], true);
  assert.equal(
    triggeredState.enemies.some((enemy) => (
      enemy.spawnEventId === triggeredSpawnEvent.enemySpawn.eventId
    )),
    false,
  );

  const spawnedState = updateNfoSimulation(triggeredState, testRuntimeData, NO_INPUT, 0);
  const spawnedEnemy = spawnedState.enemies.find((enemy) => (
    enemy.spawnEventId === triggeredSpawnEvent.enemySpawn.eventId
    && enemy.typeId === triggeredSpawnEvent.enemySpawn.enemyTypeId
  ));
  assert.ok(spawnedEnemy);
  assert.equal(spawnedEnemy.aiTypeId, triggeredSpawnEvent.enemySpawn.enemyAiTypeId);
  assert.equal(
    spawnedState.levelTriggeredEnemySpawnAppliedByEventIndex[levelTriggerCase.firstEventIndex],
    true,
  );

  const repeatedState = updateNfoSimulation(
    {
      ...spawnedState,
      enemies: spawnedState.enemies.filter((enemy) => enemy.id !== spawnedEnemy.id),
    },
    testRuntimeData,
    NO_INPUT,
    10,
  );
  assert.equal(
    repeatedState.enemies.some((enemy) => (
      enemy.spawnEventId === triggeredSpawnEvent.enemySpawn.eventId
      && enemy.typeId === triggeredSpawnEvent.enemySpawn.enemyTypeId
    )),
    false,
  );
}

function testCnActiveSkillHolyMendHealInvincibleAndRevive(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const testRuntimeData = configureRuntimeForActiveSkill(sourceRuntimeData, 12);
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const damagedState = {
    ...baseState,
    player: {
      ...baseState.player,
      hp: Math.max(1, baseState.player.maxHp - 10),
    },
  };
  const activeState = updateNfoSimulation(
    chargeActiveSkill(damagedState),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(activeState.player.hp, baseState.player.maxHp);
  assert.ok(activeState.player.activeBuffs.some((buff) => buff.id === 104 && buff.type === 9));
  assert.ok(activeState.player.activeBuffs.some((buff) => buff.id === 106 && buff.type === 12));
  assert.equal(activeState.player.activeBuffs.some((buff) => buff.id === 105), false);

  const contactState = {
    ...activeState,
    enemies: [
      createEnemyFixture(
        activeState,
        activeState.player.x,
        activeState.player.y,
        {
          attack: 999,
          speed: 0,
          radius: 20,
        },
      ),
    ],
  };
  const protectedState = updateNfoSimulation(contactState, testRuntimeData, NO_INPUT, 0);

  assert.equal(protectedState.player.hp, baseState.player.maxHp);

  const revivedState = updateNfoSimulation(
    {
      ...activeState,
      player: {
        ...activeState.player,
        hp: 0,
      },
      enemies: [],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );

  assert.equal(revivedState.status, "playing");
  assert.equal(revivedState.player.hp, baseState.player.maxHp);
  assert.equal(revivedState.player.activeBuffs.some((buff) => buff.id === 106), false);
}

function testCnActiveSkillFairyGuardTargetsPlayerSideMinions(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const fairyGuardCase = getActiveSkillBuffCase("active-skill-fairy-guard-targets-player-side");
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    fairyGuardCase.activeSkillId,
  );
  const minionWeapon = testRuntimeData.weapons.find((weapon) => weapon.id === 16);
  const minionWeaponLevel = minionWeapon?.levels.find((level) => level.level === 1);
  const minionFireBullet = minionWeaponLevel?.fireBullets.find((bullet) => (
    bullet.bulletTypeId === 22
  ));
  assert.ok(minionWeapon);
  assert.ok(minionWeaponLevel);
  assert.ok(minionFireBullet);

  const fairyGuardStatBuff = fairyGuardCase.buffs.find((buff) => buff.buffId === 11);
  assert.ok(fairyGuardStatBuff);
  const bulletSizeModifier = fairyGuardStatBuff.attributes.find((attribute) => (
    attribute.attributeType === CN_NFO_ATTRIBUTE_TYPE.bulletSize
  ))?.value ?? 0;
  const attackModifier = fairyGuardStatBuff.attributes.find((attribute) => (
    attribute.attributeType === CN_NFO_ATTRIBUTE_TYPE.attack
  ))?.value ?? 0;

  const baseState = createStateWithoutEnemies(testRuntimeData);
  const enemyProbe = createEnemyFixture(
    baseState,
    baseState.player.x + 500,
    baseState.player.y,
    {
      speed: 0,
    },
  );
  const activeState = updateNfoSimulation(
    {
      ...chargeActiveSkill(baseState),
      player: {
        ...baseState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [enemyProbe],
      minions: [
        createFriendlyMinionProbe({
          minionId: 2,
          weaponId: minionWeapon.id,
          weaponLevel: minionWeaponLevel.level,
          canFireOwnWeapon: true,
          speed: 0,
          x: baseState.player.x,
          y: baseState.player.y,
        }),
      ],
    },
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  for (const buffCase of fairyGuardCase.buffs) {
    assert.ok(
      activeState.player.activeBuffs.some((buff) => (
        buff.id === buffCase.buffId && buff.type === buffCase.buffType
      )),
      `expected Fairy Guard buff ${buffCase.buffId} on player`,
    );
    assert.ok(
      activeState.minions[0]?.activeBuffs.some((buff) => (
        buff.id === buffCase.buffId && buff.type === buffCase.buffType
      )),
      `expected Fairy Guard buff ${buffCase.buffId} on player-side minion`,
    );
  }
  assert.equal(
    activeState.enemies[0]?.activeBuffs.some((buff) => (
      buff.id === 11 || buff.id === 13
    )),
    false,
  );
  const minionBullet = activeState.bullets.find((bullet) => (
    bullet.bulletTypeId === minionFireBullet.bulletTypeId
  ));
  assert.ok(minionBullet);
  assert.equal(minionBullet.colliderWidth, minionFireBullet.bulletSize + bulletSizeModifier);
  assert.equal(
    minionBullet.damage,
    minionFireBullet.bulletAttack + baseState.player.attack + attackModifier,
  );
}

function testCnActiveSkillKingOfBeastsMinionAITransitionShooter(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const summonCase = getActiveSkillSummonCase(
    "active-skill-king-of-beasts-formation-2-roar-minions-lv2",
  );
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    summonCase.activeSkillId,
  );
  const minionData = testRuntimeData.minions.find((candidate) => (
    candidate.id === summonCase.minionId
  ));
  assert.ok(minionData);
  minionData.speed = 0;

  const initialState = createStateWithoutEnemies(testRuntimeData);
  const baseState = {
    ...initialState,
    activeSkill: {
      ...initialState.activeSkill,
      level: summonCase.activeSkillLevel,
    },
    worldBounds: {
      minX: -2000,
      minY: -2000,
      maxX: 2000,
      maxY: 2000,
    },
  };
  const summonedState = updateNfoSimulation(
    chargeActiveSkill(baseState),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(summonedState.minions.length, summonCase.spawnCount);
  assert.ok(summonedState.minions.every((candidate) => candidate.minionId === summonCase.minionId));
  assert.ok(
    summonedState.minions.every((candidate) => candidate.aiTypeId === summonCase.minionAITypeId),
  );
  assert.ok(
    summonedState.minions.every((candidate) => candidate.aiStateId === summonCase.minionAIStateId),
  );
  assert.ok(
    summonedState.minions.every((candidate) => (
      Math.round(Math.hypot(candidate.x - baseState.player.x, candidate.y - baseState.player.y))
        === summonCase.expectedFirstPassRadius
    )),
  );
  assertClose(
    summonedState.minions[0]?.x ?? Number.NaN,
    baseState.player.x + summonCase.expectedFirstPassRadius,
    "CN skill 111 minion 0 x",
  );
  assertClose(summonedState.minions[0]?.y ?? Number.NaN, baseState.player.y, "CN skill 111 minion 0 y");
  assertClose(
    summonedState.minions[1]?.x ?? Number.NaN,
    baseState.player.x - summonCase.expectedFirstPassRadius / 2,
    "CN skill 111 minion 1 x",
  );
  assert.ok((summonedState.minions[1]?.y ?? 0) > baseState.player.y);
  assertClose(
    summonedState.minions[2]?.x ?? Number.NaN,
    baseState.player.x - summonCase.expectedFirstPassRadius / 2,
    "CN skill 111 minion 2 x",
  );
  assert.ok((summonedState.minions[2]?.y ?? 0) < baseState.player.y);
  assert.equal(
    summonedState.activeShooters.some((candidate) => (
      candidate.shooterId === summonCase.minionAINextStateShooterId
    )),
    false,
  );

  const transitionState = updateNfoSimulation(
    summonedState,
    testRuntimeData,
    NO_INPUT,
    (summonCase.minionAIStateLastFrame - 1) / 30,
  );
  const transitionedMinion = transitionState.minions[0];
  assert.ok(transitionedMinion);
  assert.equal(transitionedMinion.aiStateId, summonCase.minionAINextStateId);
  const roarShooter = transitionState.activeShooters.find((candidate) => (
    candidate.shooterId === summonCase.minionAINextStateShooterId
  ));
  assert.ok(roarShooter, "expected CN skill 111 minion AI to create shooter 14001");
  assert.equal(roarShooter.sourceTeam, "player");
  assertClose(roarShooter.x, transitionedMinion.x, "CN skill 111 roar shooter x");
  assertClose(roarShooter.y, transitionedMinion.y, "CN skill 111 roar shooter y");
  assert.equal(
    transitionState.bullets.some((candidate) => (
      candidate.bulletTypeId === summonCase.minionAINextStateShooterBulletTypeId
    )),
    false,
  );

  const roarBulletState = updateNfoSimulation(
    transitionState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const roarBullet = roarBulletState.bullets.find((candidate) => (
    candidate.bulletTypeId === summonCase.minionAINextStateShooterBulletTypeId
  ));
  assert.ok(roarBullet, "expected CN shooter 14001 to emit roar bullet 34");
  assert.equal(roarBullet.canDamagePlayer, false);
  assert.equal(roarBullet.hitTargetType, 0);
  assert.equal(roarBullet.hitBuffId, summonCase.minionAINextStateShooterBulletHitBuffId);
  assert.equal(roarBullet.colliderWidth, summonCase.minionAINextStateShooterBulletSize);
  assertClose(Math.hypot(roarBullet.vx, roarBullet.vy), 0, "CN skill 111 roar bullet speed");
  assertClose(roarBullet.x, roarShooter.x, "CN skill 111 roar bullet x");
  assertClose(roarBullet.y, roarShooter.y, "CN skill 111 roar bullet y");
}

function testCnActiveSkillAllOutFireShooterAndMinion(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const summonCase = getActiveSkillSummonCase(
    "active-skill-all-out-fire-shooter-and-minion-lv1",
  );
  const frameThreeCase = getActiveSkillShooterSpawnCase(
    "active-skill-all-out-fire-shooter-frame-3-lv1",
  );
  const frameSevenCase = getActiveSkillShooterSpawnCase(
    "active-skill-all-out-fire-shooter-frame-7-lv1",
  );
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    summonCase.activeSkillId,
  );
  const minionData = testRuntimeData.minions.find((candidate) => (
    candidate.id === summonCase.minionId
  ));
  assert.ok(minionData);
  minionData.speed = 0;

  const baseState = createStateWithoutEnemies(testRuntimeData);
  const nextState = updateNfoSimulation(
    chargeActiveSkill(baseState),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  const summonedMinion = nextState.minions.find((candidate) => (
    candidate.minionId === summonCase.minionId
  ));
  assert.ok(summonedMinion, "expected CN active skill 112 to summon minion 8");
  assert.equal(summonedMinion.aiTypeId, summonCase.minionAITypeId);
  assert.equal(summonedMinion.weaponId, summonCase.weaponId);
  assert.equal(summonedMinion.weaponLevel, Math.max(1, summonCase.weaponLevel));
  assertClose(
    Math.hypot(summonedMinion.x - baseState.player.x, summonedMinion.y - baseState.player.y),
    summonCase.expectedFirstPassRadius,
    "CN All-Out Fire minion radius",
  );
  assertClose(
    summonedMinion.x,
    baseState.player.x + summonCase.expectedFirstPassRadius,
    "CN All-Out Fire minion x",
  );
  assertClose(summonedMinion.y, baseState.player.y, "CN All-Out Fire minion y");

  const activeSkillShooter = nextState.activeShooters.find((candidate) => (
    candidate.shooterId === summonCase.shooterId
  ));
  assert.ok(activeSkillShooter, "expected CN active skill 112 to create shooter 7000");
  assert.equal(activeSkillShooter.sourceTeam, "player");
  assertClose(activeSkillShooter.x, baseState.player.x, "CN All-Out Fire shooter x");
  assertClose(activeSkillShooter.y, baseState.player.y, "CN All-Out Fire shooter y");

  const allOutBullet = nextState.bullets.find((candidate) => (
    candidate.bulletTypeId === summonCase.shooterBulletTypeId
  ));
  assert.ok(allOutBullet, "expected CN shooter 7000 to emit bullet 66");
  assert.equal(allOutBullet.canDamagePlayer, false);
  assert.equal(allOutBullet.hitTargetType, summonCase.shooterBulletHitTargetType);
  const shooterBulletFrameTravel = summonCase.shooterBulletSpeed / 30;
  assertClose(
    allOutBullet.x,
    baseState.player.x + summonCase.shooterFormationOffsetX,
    "CN All-Out Fire bullet 66 x",
  );
  assertClose(
    allOutBullet.y,
    baseState.player.y + summonCase.shooterFormationOffsetY + shooterBulletFrameTravel,
    "CN All-Out Fire bullet 66 y",
  );
  assertClose(allOutBullet.vx, 0, "CN All-Out Fire bullet 66 vx");
  assertClose(
    allOutBullet.vy,
    summonCase.shooterBulletSpeed,
    "CN All-Out Fire bullet 66 vy",
  );
  assert.equal(frameThreeCase.activeSkillId, summonCase.activeSkillId);
  assert.equal(frameSevenCase.activeSkillId, summonCase.activeSkillId);
  assert.equal(frameThreeCase.shooterId, summonCase.shooterId);
  assert.equal(frameSevenCase.shooterId, summonCase.shooterId);

  const activeSkillShooterOnlyState = {
    ...nextState,
    activeSkill: {
      ...nextState.activeSkill,
      isActive: false,
      timelineFrame: 0,
      triggeredEventIndexes: [],
    },
    activeShooters: nextState.activeShooters.filter((candidate) => (
      candidate.shooterId === summonCase.shooterId
    )),
    bullets: [],
    enemies: [],
    minions: [],
  };
  const beforeFrameThreeState = updateNfoSimulation(
    activeSkillShooterOnlyState,
    testRuntimeData,
    NO_INPUT,
    (frameThreeCase.shooterEventFrame - summonCase.shooterEventFrame - 1) / 30,
  );

  assert.equal(
    beforeFrameThreeState.bullets.some((candidate) => (
      candidate.bulletTypeId === frameThreeCase.bulletTypeId
    )),
    false,
  );

  const frameThreeState = updateNfoSimulation(
    beforeFrameThreeState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const frameThreeBullet = frameThreeState.bullets.find((candidate) => (
    candidate.bulletTypeId === frameThreeCase.bulletTypeId
  ));
  const frameThreeDirectionLength = Math.hypot(
    frameThreeCase.formationOffsetX,
    frameThreeCase.formationOffsetY,
  );
  const frameThreeVx = (
    frameThreeCase.formationOffsetX / frameThreeDirectionLength
  ) * frameThreeCase.bulletSpeed;
  const frameThreeVy = (
    frameThreeCase.formationOffsetY / frameThreeDirectionLength
  ) * frameThreeCase.bulletSpeed;

  assert.ok(frameThreeBullet, "expected CN shooter 7000 to emit bullet 67 at frame 3");
  assertClose(
    frameThreeState.activeShooters[0]?.ageFrames ?? Number.NaN,
    frameThreeCase.shooterEventFrame,
    "CN All-Out Fire shooter frame-3 age",
  );
  assert.equal(frameThreeBullet.canDamagePlayer, false);
  assert.equal(frameThreeBullet.hitTargetType, frameThreeCase.bulletHitTargetType);
  assertClose(frameThreeBullet.vx, frameThreeVx, "CN All-Out Fire bullet 67 vx");
  assertClose(frameThreeBullet.vy, frameThreeVy, "CN All-Out Fire bullet 67 vy");
  assertClose(
    frameThreeBullet.x,
    baseState.player.x + frameThreeCase.formationOffsetX + frameThreeVx / 30,
    "CN All-Out Fire bullet 67 x",
  );
  assertClose(
    frameThreeBullet.y,
    baseState.player.y + frameThreeCase.formationOffsetY + frameThreeVy / 30,
    "CN All-Out Fire bullet 67 y",
  );

  const beforeFrameSevenState = updateNfoSimulation(
    {
      ...frameThreeState,
      bullets: [],
    },
    testRuntimeData,
    NO_INPUT,
    (frameSevenCase.shooterEventFrame - frameThreeCase.shooterEventFrame - 1) / 30,
  );

  assert.equal(
    beforeFrameSevenState.bullets.some((candidate) => (
      candidate.bulletTypeId === frameSevenCase.bulletTypeId
    )),
    false,
  );

  const frameSevenState = updateNfoSimulation(
    beforeFrameSevenState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const frameSevenBullet = frameSevenState.bullets.find((candidate) => (
    candidate.bulletTypeId === frameSevenCase.bulletTypeId
  ));

  assert.ok(frameSevenBullet, "expected CN shooter 7000 to emit bullet 68 at frame 7");
  assertClose(
    frameSevenState.activeShooters[0]?.ageFrames ?? Number.NaN,
    frameSevenCase.shooterEventFrame,
    "CN All-Out Fire shooter frame-7 age",
  );
  assert.equal(frameSevenBullet.canDamagePlayer, false);
  assert.equal(frameSevenBullet.hitTargetType, frameSevenCase.bulletHitTargetType);
  assertClose(frameSevenBullet.vx, frameSevenCase.bulletSpeed, "CN All-Out Fire bullet 68 vx");
  assertClose(frameSevenBullet.vy, 0, "CN All-Out Fire bullet 68 vy");
  assertClose(
    frameSevenBullet.x,
    baseState.player.x + frameSevenCase.formationOffsetX + frameSevenCase.bulletSpeed / 30,
    "CN All-Out Fire bullet 68 x",
  );
  assertClose(
    frameSevenBullet.y,
    baseState.player.y + frameSevenCase.formationOffsetY,
    "CN All-Out Fire bullet 68 y",
  );

  const minionShooter = nextState.activeShooters.find((candidate) => (
    candidate.shooterId === summonCase.minionAIStateShooterId
  ));
  assert.ok(minionShooter, "expected CN active skill 112 minion AI to create shooter 7003");
  assert.equal(minionShooter.sourceTeam, "player");
  assertClose(minionShooter.x, summonedMinion.x, "CN All-Out Fire minion shooter x");
  assertClose(minionShooter.y, summonedMinion.y, "CN All-Out Fire minion shooter y");
  assert.equal(
    nextState.bullets.some((candidate) => (
      candidate.bulletTypeId === summonCase.minionAIStateShooterBulletTypeId
    )),
    false,
  );

  const minionShooterFireState = updateNfoSimulation(
    nextState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const minionBullet = minionShooterFireState.bullets.find((candidate) => (
    candidate.bulletTypeId === summonCase.minionAIStateShooterBulletTypeId
  ));
  assert.ok(minionBullet, "expected CN shooter 7003 to emit bullet 68 on the next frame");
  assert.equal(minionBullet.canDamagePlayer, false);
  assert.equal(summonCase.minionAIStateShooterDirectionType, 0);
  assert.equal(summonCase.minionAIStateShooterFormationType, 0);
  assert.equal(summonCase.minionAIStateShooterFormationOffsetX, 0);
  assert.equal(summonCase.minionAIStateShooterFormationOffsetY, 0);
  const minionBulletFrameTravel = summonCase.minionAIStateShooterBulletSpeed / 30;
  assertClose(
    minionBullet.x,
    minionShooter.x + minionBulletFrameTravel,
    "CN All-Out Fire bullet 68 x",
  );
  assertClose(minionBullet.y, minionShooter.y, "CN All-Out Fire bullet 68 y");
  assertClose(
    Math.hypot(minionBullet.vx, minionBullet.vy),
    summonCase.minionAIStateShooterBulletSpeed,
    "CN All-Out Fire bullet 68 speed",
  );
  assertClose(
    minionBullet.vx,
    summonCase.minionAIStateShooterBulletSpeed,
    "CN All-Out Fire zero-offset shooter vx",
  );
  assertClose(minionBullet.vy, 0, "CN All-Out Fire zero-offset shooter vy");
}

function testCnActiveSkillAllOutFireLevelThreeMultiSummon(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const middleSummonCase = getActiveSkillSummonCase(
    "active-skill-all-out-fire-middle-minion-lv3",
  );
  const offsetSummonCase = getActiveSkillSummonCase(
    "active-skill-all-out-fire-offset-minion-lv3",
  );
  const testRuntimeData = configureRuntimeForActiveSkill(
    sourceRuntimeData,
    offsetSummonCase.activeSkillId,
  );
  const minionData = testRuntimeData.minions.find((candidate) => (
    candidate.id === offsetSummonCase.minionId
  ));
  assert.ok(minionData);
  minionData.speed = 0;

  const initialState = createStateWithoutEnemies(testRuntimeData);
  const baseState = {
    ...initialState,
    activeSkill: {
      ...initialState.activeSkill,
      level: offsetSummonCase.activeSkillLevel,
    },
    worldBounds: {
      minX: -2000,
      minY: -2000,
      maxX: 2000,
      maxY: 2000,
    },
  };
  const summonedState = updateNfoSimulation(
    chargeActiveSkill(baseState),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(summonedState.minions.length, offsetSummonCase.sameFrameSpawnMinionEventCount);
  const minionAITypeIds = summonedState.minions.map((candidate) => candidate.aiTypeId);
  assert.deepEqual(minionAITypeIds, [205, 206, 207]);
  const middleMinion = summonedState.minions.find((candidate) => (
    candidate.aiTypeId === middleSummonCase.minionAITypeId
  ));
  assert.ok(middleMinion, "expected CN skill 112 level 3 to summon AI 206 minion");
  assertClose(
    middleMinion.x,
    baseState.player.x
      + middleSummonCase.spawnCenterOffsetX
      + middleSummonCase.expectedFirstPassRadius,
    "CN All-Out Fire level 3 middle minion x",
  );
  assertClose(
    middleMinion.y,
    baseState.player.y + middleSummonCase.spawnCenterOffsetY,
    "CN All-Out Fire level 3 middle minion y",
  );
  const offsetMinion = summonedState.minions.find((candidate) => (
    candidate.aiTypeId === offsetSummonCase.minionAITypeId
  ));
  assert.ok(offsetMinion, "expected CN skill 112 level 3 to summon AI 207 minion");
  assertClose(
    offsetMinion.x,
    baseState.player.x
      + offsetSummonCase.spawnCenterOffsetX
      + offsetSummonCase.expectedFirstPassRadius,
    "CN All-Out Fire level 3 offset minion x",
  );
  assertClose(
    offsetMinion.y,
    baseState.player.y + offsetSummonCase.spawnCenterOffsetY,
    "CN All-Out Fire level 3 offset minion y",
  );

  const sameFrameShooterIds = new Set(summonedState.activeShooters.map((candidate) => (
    candidate.shooterId
  )));
  assert.ok(sameFrameShooterIds.has(7000));
  assert.ok(sameFrameShooterIds.has(7003));
  assert.ok(sameFrameShooterIds.has(7004));
  assert.ok(sameFrameShooterIds.has(offsetSummonCase.minionAIStateShooterId));
  assert.equal(
    summonedState.bullets.some((candidate) => candidate.bulletTypeId === 69),
    false,
  );
  assert.equal(
    summonedState.bullets.some((candidate) => candidate.bulletTypeId === 70),
    false,
  );

  const minionShooterFireState = updateNfoSimulation(
    summonedState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  const minionShooterBullets = minionShooterFireState.bullets
    .filter((candidate) => [68, 69, 70].includes(candidate.bulletTypeId))
    .map((candidate) => candidate.bulletTypeId)
    .sort((left, right) => left - right);
  assert.deepEqual(minionShooterBullets, [68, 69, 70]);
  const middleBullet = minionShooterFireState.bullets.find((candidate) => (
    candidate.bulletTypeId === middleSummonCase.minionAIStateShooterBulletTypeId
  ));
  assert.ok(middleBullet, "expected CN shooter 7004 to emit bullet 69");
  assert.equal(middleBullet.canDamagePlayer, false);
  assert.equal(middleSummonCase.minionAIStateShooterDirectionType, 0);
  assert.equal(middleSummonCase.minionAIStateShooterFormationType, 0);
  assert.equal(middleSummonCase.minionAIStateShooterFormationOffsetX, 0);
  assert.equal(middleSummonCase.minionAIStateShooterFormationOffsetY, 0);
  const middleBulletFrameTravel = middleSummonCase.minionAIStateShooterBulletSpeed / 30;
  assertClose(
    middleBullet.x,
    middleMinion.x + middleBulletFrameTravel,
    "CN All-Out Fire level 3 bullet 69 x",
  );
  assertClose(middleBullet.y, middleMinion.y, "CN All-Out Fire level 3 bullet 69 y");
  assertClose(
    middleBullet.vx,
    middleSummonCase.minionAIStateShooterBulletSpeed,
    "CN All-Out Fire level 3 middle zero-offset shooter vx",
  );
  assertClose(middleBullet.vy, 0, "CN All-Out Fire level 3 middle zero-offset shooter vy");

  const offsetBullet = minionShooterFireState.bullets.find((candidate) => (
    candidate.bulletTypeId === offsetSummonCase.minionAIStateShooterBulletTypeId
  ));
  assert.ok(offsetBullet, "expected CN shooter 7005 to emit bullet 70");
  assert.equal(offsetBullet.canDamagePlayer, false);
  assert.equal(offsetSummonCase.minionAIStateShooterDirectionType, 0);
  assert.equal(offsetSummonCase.minionAIStateShooterFormationType, 0);
  assert.equal(offsetSummonCase.minionAIStateShooterFormationOffsetX, 0);
  assert.equal(offsetSummonCase.minionAIStateShooterFormationOffsetY, 0);
  const offsetBulletFrameTravel = offsetSummonCase.minionAIStateShooterBulletSpeed / 30;
  assertClose(
    offsetBullet.x,
    offsetMinion.x + offsetBulletFrameTravel,
    "CN All-Out Fire level 3 bullet 70 x",
  );
  assertClose(
    Math.hypot(offsetBullet.vx, offsetBullet.vy),
    offsetSummonCase.minionAIStateShooterBulletSpeed,
    "CN All-Out Fire level 3 bullet 70 speed",
  );
  assertClose(
    offsetBullet.y,
    offsetMinion.y,
    "CN All-Out Fire level 3 bullet 70 y",
  );
  assertClose(
    offsetBullet.vx,
    offsetSummonCase.minionAIStateShooterBulletSpeed,
    "CN All-Out Fire level 3 zero-offset shooter vx",
  );
  assertClose(offsetBullet.vy, 0, "CN All-Out Fire level 3 zero-offset shooter vy");

  const beforeLoopState = updateNfoSimulation(
    minionShooterFireState,
    testRuntimeData,
    NO_INPUT,
    (offsetSummonCase.minionAIStateShooterLoopFrameInterval - 1) / 30,
  );
  assert.equal(
    beforeLoopState.bullets.filter((candidate) => (
      candidate.bulletTypeId === offsetSummonCase.minionAIStateShooterBulletTypeId
    )).length,
    1,
  );
  assert.equal(
    beforeLoopState.bullets.filter((candidate) => (
      candidate.bulletTypeId === middleSummonCase.minionAIStateShooterBulletTypeId
    )).length,
    1,
  );

  const secondLoopState = updateNfoSimulation(
    beforeLoopState,
    testRuntimeData,
    NO_INPUT,
    1 / 30,
  );
  assert.equal(
    secondLoopState.bullets.filter((candidate) => (
      candidate.bulletTypeId === offsetSummonCase.minionAIStateShooterBulletTypeId
    )).length,
    2,
  );
  assert.equal(
    secondLoopState.bullets.filter((candidate) => (
      candidate.bulletTypeId === middleSummonCase.minionAIStateShooterBulletTypeId
    )).length,
    2,
  );
  const middleShooterAfterLoop = secondLoopState.activeShooters.find((candidate) => (
    candidate.shooterId === middleSummonCase.minionAIStateShooterId
  ));
  assert.ok(middleShooterAfterLoop, "expected CN shooter 7004 to remain active after second loop");
  assertClose(
    middleShooterAfterLoop.ageFrames,
    middleSummonCase.minionAIStateShooterEventFrame
      + middleSummonCase.minionAIStateShooterLoopFrameInterval,
    "CN All-Out Fire level 3 shooter 7004 second loop age",
  );
  const offsetShooterAfterLoop = secondLoopState.activeShooters.find((candidate) => (
    candidate.shooterId === offsetSummonCase.minionAIStateShooterId
  ));
  assert.ok(offsetShooterAfterLoop, "expected CN shooter 7005 to remain active after second loop");
  assertClose(
    offsetShooterAfterLoop.ageFrames,
    offsetSummonCase.minionAIStateShooterEventFrame
      + offsetSummonCase.minionAIStateShooterLoopFrameInterval,
    "CN All-Out Fire level 3 shooter 7005 second loop age",
  );
}

function testCnActiveSkillGalaxyStarRingSummon(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const testRuntimeData = configureRuntimeForActiveSkill(sourceRuntimeData, 113);
  const minion = testRuntimeData.minions.find((candidate) => candidate.id === 7);
  assert.ok(minion);
  minion.speed = 0;
  const baseState = createStateWithoutEnemies(testRuntimeData);
  const nextState = updateNfoSimulation(
    chargeActiveSkill(baseState),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(nextState.minions.length, 3);
  assert.ok(nextState.minions.every((candidate) => candidate.minionId === 7));
  const distances = nextState.minions.map((candidate) => (
    Math.round(Math.hypot(candidate.x - baseState.player.x, candidate.y - baseState.player.y))
  ));
  assert.deepEqual(distances, [500, 500, 500]);
  assertClose(nextState.minions[0]?.x ?? Number.NaN, baseState.player.x + 500, "Galaxy minion 0 x");
  assertClose(nextState.minions[0]?.y ?? Number.NaN, baseState.player.y, "Galaxy minion 0 y");

  const movedPlayerState = {
    ...nextState,
    player: {
      ...nextState.player,
      x: baseState.player.x + 80,
      y: baseState.player.y + 30,
    },
  };
  const orbitedState = updateNfoSimulation(
    movedPlayerState,
    testRuntimeData,
    NO_INPUT,
    1,
  );
  const movedMinion = orbitedState.minions[0];
  assert.ok(movedMinion);
  const orbitAngle = degreesToRadians(40);
  assertClose(
    Math.hypot(
      movedMinion.x - movedPlayerState.player.x,
      movedMinion.y - movedPlayerState.player.y,
    ),
    500,
    "Galaxy minion orbit radius after player movement",
  );
  assertClose(
    movedMinion.x,
    movedPlayerState.player.x + Math.cos(orbitAngle) * 500,
    "Galaxy minion orbit x after one second",
  );
  assertClose(
    movedMinion.y,
    movedPlayerState.player.y + Math.sin(orbitAngle) * 500,
    "Galaxy minion orbit y after one second",
  );
}

function testCnActiveSkillAnonPhantomRingSummon(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const testRuntimeData = configureRuntimeForActiveSkill(sourceRuntimeData, 115);
  const minion = testRuntimeData.minions.find((candidate) => candidate.id === 5);
  assert.ok(minion);
  minion.speed = 0;
  const initialState = createStateWithoutEnemies(testRuntimeData);
  const baseState = {
    ...initialState,
    activeSkill: {
      ...initialState.activeSkill,
      level: 2,
    },
    worldBounds: {
      minX: -2000,
      minY: -2000,
      maxX: 2000,
      maxY: 2000,
    },
  };
  const nextState = updateNfoSimulation(
    chargeActiveSkill(baseState),
    testRuntimeData,
    { ...NO_INPUT, useActiveSkill: true },
    1 / 30,
  );

  assert.equal(nextState.minions.length, 2);
  assert.ok(nextState.minions.every((candidate) => candidate.minionId === 5));
  assert.ok(nextState.minions.every((candidate) => candidate.aiTypeId === 102));
  assert.ok(nextState.minions.every((candidate) => candidate.weaponId === 28));
  assert.ok(nextState.minions.every((candidate) => candidate.weaponLevel === 8));
  const distances = nextState.minions.map((candidate) => (
    Math.round(Math.hypot(candidate.x - baseState.player.x, candidate.y - baseState.player.y))
  ));
  assert.deepEqual(distances, [400, 400]);
  assertClose(nextState.minions[0]?.x ?? Number.NaN, baseState.player.x + 400, "Anon minion 0 x");
  assertClose(nextState.minions[0]?.y ?? Number.NaN, baseState.player.y, "Anon minion 0 y");
  assertClose(nextState.minions[1]?.x ?? Number.NaN, baseState.player.x - 400, "Anon minion 1 x");
  assertClose(nextState.minions[1]?.y ?? Number.NaN, baseState.player.y, "Anon minion 1 y");
}

function testCnDropDataEnemyKillSpawnsAndCollectsExp(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  const dropCase = getDropCase("drop-minor-enemy-exp-small-coin");
  const expItemCase = getItemCase("item-exp-small");
  const testRuntimeData = configureRuntimeForWeapon(sourceRuntimeData);
  const baseState = createNfoSimulation(testRuntimeData);
  const level = testRuntimeData.levels.find((candidate) => (
    candidate.id === baseState.selection.levelId
  ));
  assert.ok(level);

  const enemy = createEnemyFixture(
    baseState,
    baseState.player.x + 600,
    baseState.player.y,
    {
      hp: 1,
      maxHp: 1,
      radius: 12,
      speed: 0,
      dropId: dropCase.dropId,
    },
  );
  const stateWithEnemy = {
    ...baseState,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [enemy],
    bullets: [createEnemyKillingBullet(baseState, enemy)],
    pickups: [],
  };

  const droppedState = withMockedRandom([0.5, 0.25, 0.25, 0.5], () => (
    updateNfoSimulation(stateWithEnemy, testRuntimeData, NO_INPUT, 0)
  ));
  const spawnedPickup = droppedState.pickups[0];
  assert.equal(droppedState.defeatedEnemies, 1);
  assert.equal(droppedState.score, 10);
  assert.equal(droppedState.enemies.length, 0);
  assert.equal(droppedState.pickups.length, 1);
  assert.ok(spawnedPickup);
  assert.equal(spawnedPickup.itemId, expItemCase.itemId);
  assert.equal(spawnedPickup.name, expItemCase.itemName);
  assert.equal(spawnedPickup.itemType, expItemCase.itemType);
  assert.equal(spawnedPickup.value, expItemCase.value);
  assert.equal(spawnedPickup.canBeMagneted, expItemCase.canBeMagneted);
  assertClose(
    spawnedPickup.remainingSeconds,
    expItemCase.lifetimeFrames / 30,
    "CN drop EXP pickup lifetime",
  );

  const collectedState = updateNfoSimulation(
    {
      ...droppedState,
      bullets: [],
      player: {
        ...droppedState.player,
        fireCooldownSeconds: 999,
      },
      pickups: [
        {
          ...spawnedPickup,
          x: droppedState.player.x,
          y: droppedState.player.y,
        },
      ],
    },
    testRuntimeData,
    NO_INPUT,
    0,
  );
  const expectedExp = Math.floor(
    expItemCase.value
      * ((level.playerExpRate || 100) / 100)
      * (1 + droppedState.player.expGain / 100),
  );
  assert.equal(collectedState.collectedItems[expItemCase.itemId], 1);
  assert.equal(collectedState.collectedExp, expectedExp);
  assert.equal(collectedState.pickups.length, 0);
}

function testCnLevelEnemySpawnWave(sourceRuntimeData: NfoOfflineRuntimeData) {
  const spawnCase = getLevelEnemySpawnCase("level-plain-first-slime-wave");
  const testRuntimeData = structuredClone(sourceRuntimeData);
  testRuntimeData.selected.levelId = spawnCase.levelId;
  const baseState = createNfoSimulation(testRuntimeData, { levelId: spawnCase.levelId });
  const primedState: NfoSimulationState = {
    ...baseState,
    elapsedSeconds: spawnCase.startFrame / 30,
    frame: spawnCase.startFrame,
    player: {
      ...baseState.player,
      fireCooldownSeconds: 999,
    },
    enemies: [],
    bullets: [],
    activeShooters: [],
    spawnCursorByEvent: {},
  };
  const spawnRandomValues = Array
    .from({ length: spawnCase.spawnWaveCount }, () => [0, 0.5])
    .flat();
  const spawnedState = withMockedRandom(spawnRandomValues, () => (
    updateNfoSimulation(primedState, testRuntimeData, NO_INPUT, 0)
  ));
  const expectedDistance = (
    spawnCase.spawnRangeMin
    + (spawnCase.spawnRangeMax - spawnCase.spawnRangeMin) * 0.5
  ) * CN_LEVEL_UNIT_SIZE;

  assert.equal(spawnedState.enemies.length, spawnCase.spawnWaveCount);
  assert.equal(
    spawnedState.spawnCursorByEvent[spawnCase.eventIndex],
    spawnCase.startFrame + spawnCase.spawnWaveIntervalFrames,
  );
  for (const enemy of spawnedState.enemies) {
    assert.equal(enemy.typeId, spawnCase.enemyTypeId);
    assert.equal(enemy.name, spawnCase.enemyName);
    assert.equal(enemy.aiTypeId, spawnCase.enemyAiTypeId);
    assert.equal(enemy.hp, spawnCase.enemyMaxHp);
    assert.equal(enemy.maxHp, spawnCase.enemyMaxHp);
    assert.equal(enemy.attack, spawnCase.enemyAttack);
    assert.equal(enemy.defense, spawnCase.enemyDefense);
    assert.equal(enemy.speed, spawnCase.enemySpeed);
    assert.equal(enemy.radius, spawnCase.enemyColliderRadius);
    assert.equal(enemy.dropId, spawnCase.dropId);
    assertClose(
      enemy.x,
      baseState.player.x + expectedDistance,
      "CN level 1 first slime spawn x",
    );
    assertClose(enemy.y, baseState.player.y, "CN level 1 first slime spawn y");
  }
}

function testCnLevelEnemySpawnCenterOffset(sourceRuntimeData: NfoOfflineRuntimeData) {
  const spawnCase = getLevelEnemySpawnCase("level-anniversary-stage-fixed-cat-boss");
  const testRuntimeData = structuredClone(sourceRuntimeData);
  testRuntimeData.selected.levelId = spawnCase.levelId;
  const baseState = createNfoSimulation(testRuntimeData, { levelId: spawnCase.levelId });
  const primedState: NfoSimulationState = {
    ...baseState,
    elapsedSeconds: spawnCase.startFrame / 30,
    frame: spawnCase.startFrame,
    player: {
      ...baseState.player,
      x: 1200,
      y: -800,
      fireCooldownSeconds: 999,
    },
    enemies: [],
    bullets: [],
    activeShooters: [],
    spawnCursorByEvent: {},
  };
  const spawnedState = withMockedRandom([0.25, 0.75], () => (
    updateNfoSimulation(primedState, testRuntimeData, NO_INPUT, 0)
  ));
  const enemy = spawnedState.enemies.find((candidate) => (
    candidate.typeId === spawnCase.enemyTypeId
  ));

  assert.ok(spawnedState.enemies.length >= spawnCase.spawnWaveCount);
  assert.ok(enemy, "expected CN level 28 first cat boss to spawn");
  assert.equal(enemy.typeId, spawnCase.enemyTypeId);
  assert.equal(enemy.name, spawnCase.enemyName);
  assert.equal(enemy.aiTypeId, spawnCase.enemyAiTypeId);
  assert.equal(enemy.hp, spawnCase.enemyMaxHp);
  assert.equal(enemy.maxHp, spawnCase.enemyMaxHp);
  assert.equal(enemy.attack, spawnCase.enemyAttack);
  assert.equal(enemy.defense, spawnCase.enemyDefense);
  assert.equal(enemy.speed, spawnCase.enemySpeed);
  assert.equal(enemy.radius, spawnCase.enemyColliderRadius);
  assert.equal(enemy.dropId, spawnCase.dropId);
  assertClose(
    enemy.x,
    spawnCase.spawnCenterOffsetX * CN_LEVEL_UNIT_SIZE,
    "CN spawn center type 1 enemy x",
  );
  assertClose(
    enemy.y,
    spawnCase.spawnCenterOffsetY * CN_LEVEL_UNIT_SIZE,
    "CN spawn center type 1 enemy y",
  );
  assert.equal(
    spawnedState.spawnCursorByEvent[spawnCase.eventIndex],
    spawnCase.startFrame + spawnCase.spawnWaveIntervalFrames,
  );
}

function testCnLevelEnemySpawnTypeRing(sourceRuntimeData: NfoOfflineRuntimeData) {
  const spawnCase = getLevelEnemySpawnCase("level-sky-island-knight-ring-wave");
  const testRuntimeData = structuredClone(sourceRuntimeData);
  testRuntimeData.selected.levelId = spawnCase.levelId;
  const level = testRuntimeData.levels.find((candidate) => candidate.id === spawnCase.levelId);
  assert.ok(level);
  const baseState = createNfoSimulation(testRuntimeData, { levelId: spawnCase.levelId });
  const spawnCursorByEvent = Object.fromEntries(
    level.events.map((_, eventIndex) => [
      eventIndex,
      spawnCase.startFrame + spawnCase.spawnWaveIntervalFrames,
    ]),
  );
  delete spawnCursorByEvent[spawnCase.eventIndex];
  const playerX = 1000;
  const playerY = -400;
  const primedState: NfoSimulationState = {
    ...baseState,
    elapsedSeconds: spawnCase.startFrame / 30,
    frame: spawnCase.startFrame,
    player: {
      ...baseState.player,
      x: playerX,
      y: playerY,
      fireCooldownSeconds: 999,
    },
    enemies: [],
    bullets: [],
    activeShooters: [],
    spawnCursorByEvent,
  };
  const spawnedState = updateNfoSimulation(primedState, testRuntimeData, NO_INPUT, 0);
  const ringEnemies = spawnedState.enemies.filter((enemy) => (
    enemy.typeId === spawnCase.enemyTypeId
  ));
  const expectedRadius = (
    spawnCase.spawnRangeMin
    + (spawnCase.spawnRangeMax - spawnCase.spawnRangeMin) * 0.5
  ) * CN_LEVEL_UNIT_SIZE;

  assert.equal(ringEnemies.length, spawnCase.spawnWaveCount);
  assert.equal(
    spawnedState.spawnCursorByEvent[spawnCase.eventIndex],
    spawnCase.startFrame + spawnCase.spawnWaveIntervalFrames,
  );
  for (const enemy of ringEnemies) {
    assert.equal(enemy.name, spawnCase.enemyName);
    assert.equal(enemy.aiTypeId, spawnCase.enemyAiTypeId);
    assert.equal(enemy.hp, spawnCase.enemyMaxHp);
    assert.equal(enemy.maxHp, spawnCase.enemyMaxHp);
    assert.equal(enemy.attack, spawnCase.enemyAttack);
    assert.equal(enemy.defense, spawnCase.enemyDefense);
    assert.equal(enemy.speed, spawnCase.enemySpeed);
    assert.equal(enemy.radius, spawnCase.enemyColliderRadius);
    assert.equal(enemy.dropId, spawnCase.dropId);
    assertClose(
      Math.hypot(enemy.x - playerX, enemy.y - playerY),
      expectedRadius,
      "CN spawn type 2 ring radius",
    );
  }
  const first = ringEnemies[0];
  const quarter = ringEnemies[5];
  const half = ringEnemies[10];
  const threeQuarter = ringEnemies[15];
  assert.ok(first);
  assert.ok(quarter);
  assert.ok(half);
  assert.ok(threeQuarter);
  assertClose(first.x, playerX + expectedRadius, "CN spawn type 2 first x");
  assertClose(first.y, playerY, "CN spawn type 2 first y");
  assertClose(quarter.x, playerX, "CN spawn type 2 quarter x");
  assertClose(quarter.y, playerY + expectedRadius, "CN spawn type 2 quarter y");
  assertClose(half.x, playerX - expectedRadius, "CN spawn type 2 half x");
  assertClose(half.y, playerY, "CN spawn type 2 half y");
  assertClose(threeQuarter.x, playerX, "CN spawn type 2 three-quarter x");
  assertClose(threeQuarter.y, playerY - expectedRadius, "CN spawn type 2 three-quarter y");
}

function testCnLevelClearTypeTwoDoesNotAutoSettleByTimer(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  for (const clearCaseId of [
    "level-world-end-clear-type-two-post-timer-spawns",
    "level-pilipala-company-clear-type-two-post-timer-spawns",
  ]) {
    const clearCase = getLevelClearCase(clearCaseId);
    const testRuntimeData = structuredClone(sourceRuntimeData);
    testRuntimeData.selected.levelId = clearCase.levelId;
    const baseState = createNfoSimulation(testRuntimeData, { levelId: clearCase.levelId });
    const primedState: NfoSimulationState = {
      ...baseState,
      elapsedSeconds: clearCase.totalFrames / 30,
      frame: clearCase.totalFrames,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [],
      bullets: [],
      activeShooters: [],
      pickups: [],
      spawnCursorByEvent: {},
    };

    const nextState = updateNfoSimulation(primedState, testRuntimeData, NO_INPUT, 0);

    assert.equal(nextState.status, "playing", `${clearCase.id} should remain playing`);
    assert.equal(nextState.collectedCoin, 0, `${clearCase.id} should not award clear coin`);
    assert.ok(
      clearCase.postTotalFrameEnemyEventCount > 0,
      `${clearCase.id} should keep post-total-frame enemy events in CN data`,
    );
    assert.equal(
      clearCase.earliestPostTotalFrameEnemyEventStartFrame,
      clearCase.totalFrames,
    );
  }
}

function testCnLevelClearEnemyEventWaitsForFinalBossDefeat(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  for (const clearCaseId of [
    "level-sky-island-final-boss-clear-event",
    "level-claw-machine-final-boss-clear-event",
    "level-anniversary-final-boss-clear-event",
  ]) {
    const clearCase = getLevelClearCase(clearCaseId);
    const testRuntimeData = structuredClone(sourceRuntimeData);
    testRuntimeData.selected.levelId = clearCase.levelId;
    const level = testRuntimeData.levels.find((candidate) => candidate.id === clearCase.levelId);
    assert.ok(level);
    const clearEnemyEventIndexes = level.events
      .map((event, eventIndex) => (
        event.enabled
        && event.eventType === 2
        && event.enemySpawn.eventId === clearCase.clearEnemyEventId
          ? eventIndex
          : -1
      ))
      .filter((eventIndex) => eventIndex >= 0);
    const spawnCursorByEvent = Object.fromEntries(
      level.events.map((_, eventIndex) => [
        eventIndex,
        clearCase.totalFrames + 999999,
      ]),
    );
    for (const eventIndex of clearEnemyEventIndexes) {
      delete spawnCursorByEvent[eventIndex];
    }
    const triggeredLevelEventIds: Record<number, true> = Object.fromEntries(
      clearEnemyEventIndexes
        .map((eventIndex) => level.events[eventIndex])
        .filter((event) => event?.triggerType === 2 && event.eventId > 0)
        .map((event) => [event.eventId, true as const]),
    );

    const baseState = createNfoSimulation(testRuntimeData, { levelId: clearCase.levelId });
    const primedState: NfoSimulationState = {
      ...baseState,
      elapsedSeconds: clearCase.totalFrames / 30,
      frame: clearCase.totalFrames,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [],
      bullets: [],
      activeShooters: [],
      pickups: [],
      spawnCursorByEvent,
      spawnedEnemyEventCountsById: {},
      triggeredLevelEventIds,
    };
    const spawnedState = updateNfoSimulation(primedState, testRuntimeData, NO_INPUT, 0);
    const clearEnemies = spawnedState.enemies.filter((enemy) => (
      enemy.spawnEventId === clearCase.clearEnemyEventId
    ));
    const spawnedStateWithMinorEnemies: NfoSimulationState = {
      ...spawnedState,
      enemies: [
        ...spawnedState.enemies,
        ...clearCase.clearMinorEnemyEventIds.map((eventId, index) => (
          createEnemyFixture(
            spawnedState,
            spawnedState.player.x - 500 - index * 50,
            spawnedState.player.y,
            {
              spawnEventId: eventId,
              hp: 1000,
              maxHp: 1000,
              radius: 80,
            },
          )
        )),
      ],
      spawnedEnemyEventCountsById: {
        ...spawnedState.spawnedEnemyEventCountsById,
        ...Object.fromEntries(clearCase.clearMinorEnemyEventIds.map((eventId) => [eventId, 1])),
      },
    };

    assert.equal(spawnedState.status, "playing", `${clearCase.id} should wait for boss kill`);
    assert.equal(spawnedState.collectedCoin, 0, `${clearCase.id} should not award early coin`);
    assert.equal(clearEnemies.length, clearCase.clearEnemySpawnEventCount);
    assert.equal(
      spawnedState.spawnedEnemyEventCountsById[clearCase.clearEnemyEventId],
      clearCase.clearEnemySpawnEventCount,
    );
    for (const eventId of clearCase.clearMinorEnemyEventIds) {
      assert.equal(
        spawnedStateWithMinorEnemies.spawnedEnemyEventCountsById[eventId],
        1,
        `${clearCase.id} should track clear minor enemy event ${eventId}`,
      );
    }

    const bossDefeatedState: NfoSimulationState = {
      ...spawnedStateWithMinorEnemies,
      enemies: spawnedStateWithMinorEnemies.enemies.map((enemy) => (
        enemy.spawnEventId === clearCase.clearEnemyEventId
          ? { ...enemy, hp: 0 }
          : enemy
      )),
    };
    const bossDefeatedNextState = updateNfoSimulation(
      bossDefeatedState,
      testRuntimeData,
      NO_INPUT,
      0,
    );
    let clearedState = bossDefeatedNextState;

    if (clearCase.clearMinorEnemyEventIds.length > 0) {
      assert.equal(
        bossDefeatedNextState.status,
        "playing",
        `${clearCase.id} should wait for clear minor enemies`,
      );
      assert.equal(bossDefeatedNextState.collectedCoin, 0);

      const allRequiredEnemiesDefeatedState: NfoSimulationState = {
        ...bossDefeatedNextState,
        enemies: bossDefeatedNextState.enemies.map((enemy) => (
          clearCase.clearMinorEnemyEventIds.includes(enemy.spawnEventId ?? 0)
            ? { ...enemy, hp: 0 }
            : enemy
        )),
      };
      clearedState = updateNfoSimulation(
        allRequiredEnemiesDefeatedState,
        testRuntimeData,
        NO_INPUT,
        0,
      );
    }

    assert.equal(clearedState.status, "cleared", `${clearCase.id} should clear after required event kills`);
    assert.equal(clearedState.collectedCoin, clearCase.clearCoin);
    assert.equal(
      clearedState.enemies.some((enemy) => (
        enemy.spawnEventId === clearCase.clearEnemyEventId
      )),
      false,
    );
    for (const eventId of clearCase.clearMinorEnemyEventIds) {
      assert.equal(
        clearedState.enemies.some((enemy) => enemy.spawnEventId === eventId),
        false,
      );
    }
  }
}

function testCnLevelClearRewardsApplyToSave(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  for (const rewardCase of [
    {
      levelId: 1,
      expectedClearUnlockLevelIds: [2],
      expectedClearUnlockWeaponIds: [],
      expectedClearUnlockEquipIds: [],
      expectedClearUnlockCharacterIds: [12],
    },
    {
      levelId: 15,
      expectedClearUnlockLevelIds: [16],
      expectedClearUnlockWeaponIds: [],
      expectedClearUnlockEquipIds: [],
      expectedClearUnlockCharacterIds: [113, 114],
    },
    {
      levelId: 27,
      expectedClearUnlockLevelIds: [28],
      expectedClearUnlockWeaponIds: [],
      expectedClearUnlockEquipIds: [],
      expectedClearUnlockCharacterIds: [],
    },
  ]) {
    const level = sourceRuntimeData.levels.find((candidate) => candidate.id === rewardCase.levelId);
    assert.ok(level, `expected CN level ${rewardCase.levelId} to exist`);
    assert.deepEqual(level.clearUnlockLevelIds, rewardCase.expectedClearUnlockLevelIds);
    assert.deepEqual(level.clearUnlockWeaponIds, rewardCase.expectedClearUnlockWeaponIds);
    assert.deepEqual(level.clearUnlockEquipIds, rewardCase.expectedClearUnlockEquipIds);
    assert.deepEqual(level.clearUnlockCharacterIds, rewardCase.expectedClearUnlockCharacterIds);

    const initialSave = createInitialNfoOfflineSave(sourceRuntimeData);
    for (const levelId of rewardCase.expectedClearUnlockLevelIds) {
      assert.equal(initialSave.unlockedLevelIds.includes(levelId), false);
    }
    for (const characterId of rewardCase.expectedClearUnlockCharacterIds) {
      assert.equal(initialSave.unlockedCharacterIds.includes(characterId), false);
    }
    for (const weaponId of rewardCase.expectedClearUnlockWeaponIds) {
      assert.equal(initialSave.unlockedWeaponIds.includes(weaponId), false);
    }
    for (const equipId of rewardCase.expectedClearUnlockEquipIds) {
      assert.equal(initialSave.unlockedEquipIds.includes(equipId), false);
    }

    const baseState = createNfoSimulation(sourceRuntimeData, { levelId: rewardCase.levelId });
    const clearedState: NfoSimulationState = {
      ...baseState,
      status: "cleared",
      elapsedSeconds: 123,
      frame: Math.max(baseState.frame, level.totalFrames),
      collectedCoin: level.clearCoin,
      defeatedEnemies: 7,
      enemies: [],
      bullets: [],
      activeShooters: [],
      pickups: [],
    };
    const nextSave = applyNfoRunResultToSave(sourceRuntimeData, initialSave, clearedState);

    assert.equal(nextSave.upgradeCoin, initialSave.upgradeCoin + level.clearCoin);
    assert.equal(nextSave.totalRuns, initialSave.totalRuns + 1);
    assert.equal(nextSave.totalDefeatedEnemies, initialSave.totalDefeatedEnemies + 7);
    assert.equal(nextSave.clearedLevelIds.includes(rewardCase.levelId), true);
    assert.equal(nextSave.unlockedLevelIds.includes(rewardCase.levelId), true);
    for (const levelId of rewardCase.expectedClearUnlockLevelIds) {
      assert.equal(nextSave.unlockedLevelIds.includes(levelId), true);
    }
    for (const characterId of rewardCase.expectedClearUnlockCharacterIds) {
      assert.equal(nextSave.unlockedCharacterIds.includes(characterId), true);
    }
    for (const weaponId of rewardCase.expectedClearUnlockWeaponIds) {
      assert.equal(nextSave.unlockedWeaponIds.includes(weaponId), true);
    }
    for (const equipId of rewardCase.expectedClearUnlockEquipIds) {
      assert.equal(nextSave.unlockedEquipIds.includes(equipId), true);
    }
    assert.equal(nextSave.bestLevelTimesById[String(rewardCase.levelId)], 123);
  }
}

function testCnLevelAIStateChangeEventTargetsTaggedEnemy(
  sourceRuntimeData: NfoOfflineRuntimeData,
) {
  for (const caseId of [
    "level-sky-island-final-boss-ai-state-change",
    "level-claw-machine-boss-ai-state-change",
  ]) {
    const aiStateChangeCase = getLevelAIStateChangeCase(caseId);
    const testRuntimeData = structuredClone(sourceRuntimeData);
    testRuntimeData.selected.levelId = aiStateChangeCase.levelId;
    const level = testRuntimeData.levels.find((candidate) => (
      candidate.id === aiStateChangeCase.levelId
    ));
    assert.ok(level);
    const targetSpawnEvent = level.events[aiStateChangeCase.targetSpawnEventIndex];
    assert.ok(targetSpawnEvent);
    const targetEnemy = testRuntimeData.enemies.find((candidate) => (
      candidate.id === aiStateChangeCase.targetEnemyTypeId
    ));
    assert.ok(targetEnemy);
    const targetStats = targetEnemy.levels.find((candidate) => (
      candidate.level === targetSpawnEvent.enemySpawn.enemyLevel
    )) ?? targetEnemy.levels[0];
    assert.ok(targetStats);

    const baseState = createNfoSimulation(testRuntimeData, {
      levelId: aiStateChangeCase.levelId,
    });
    const spawnCursorByEvent = Object.fromEntries(
      level.events.map((_, eventIndex) => [
        eventIndex,
        aiStateChangeCase.startFrame + 999999,
      ]),
    );
    const targetEnemyState: NfoSimEnemy = {
      id: 990000 + aiStateChangeCase.levelId,
      typeId: aiStateChangeCase.targetEnemyTypeId,
      spawnEventId: aiStateChangeCase.targetEnemyEventId,
      aiTypeId: aiStateChangeCase.targetEnemyAITypeId,
      aiStateId: undefined,
      aiStateElapsedFrames: 17,
      aiFireCooldownSeconds: 3,
      noColliding: true,
      name: aiStateChangeCase.targetEnemyName,
      x: baseState.player.x + 300,
      y: baseState.player.y,
      hp: targetStats.maxHp,
      maxHp: targetStats.maxHp,
      attack: targetStats.attack,
      defense: targetStats.defense,
      speed: targetStats.speed,
      radius: targetStats.colliderRadius,
      isBoss: targetEnemy.isBoss,
      canFly: targetEnemy.canFly,
      canWalkThroughWall: targetEnemy.canWalkThroughWall,
      dropId: targetSpawnEvent.enemySpawn.dropId,
      activeBuffs: [],
    };
    const primedState: NfoSimulationState = {
      ...baseState,
      elapsedSeconds: aiStateChangeCase.startFrame / 30,
      frame: aiStateChangeCase.startFrame,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [targetEnemyState],
      bullets: [],
      activeShooters: [],
      pickups: [],
      spawnCursorByEvent,
      levelAIStateChangeAppliedByEventIndex: {},
    };

    const changedState = updateNfoSimulation(primedState, testRuntimeData, NO_INPUT, 0);
    const targetAfter = changedState.enemies.find((enemy) => (
      enemy.spawnEventId === aiStateChangeCase.targetEnemyEventId
    ));

    assert.ok(targetAfter, `${aiStateChangeCase.id} target enemy should remain alive`);
    assert.equal(targetAfter.aiStateId, aiStateChangeCase.targetAIStateId);
    assert.equal(targetAfter.aiStateElapsedFrames, 0);
    assert.equal(targetAfter.noColliding, false);
    assert.equal(
      changedState.levelAIStateChangeAppliedByEventIndex[aiStateChangeCase.eventIndex],
      true,
    );

    const secondState = updateNfoSimulation(changedState, testRuntimeData, NO_INPUT, 0);
    assert.equal(
      secondState.levelAIStateChangeAppliedByEventIndex[aiStateChangeCase.eventIndex],
      true,
    );
  }
}

function testCnMapTerrainPitBlocking(sourceRuntimeData: NfoOfflineRuntimeData) {
  for (const mapCase of fixture.selectedMapCases) {
    const testRuntimeData = configureRuntimeForMap(sourceRuntimeData, mapCase.levelId);
    const baseState = createNfoSimulation(testRuntimeData, { levelId: mapCase.levelId });
    const sampleDistance = baseState.player.radius * 0.7;
    const pitWorldX = mapCase.firstPitX * CN_LEVEL_UNIT_SIZE;
    const pitWorldY = mapCase.firstPitY * CN_LEVEL_UNIT_SIZE + CN_LEVEL_UNIT_SIZE / 2;
    const safeX = pitWorldX - sampleDistance - 2;
    const moveDistance = sampleDistance + 4;
    const moveSeconds = moveDistance / baseState.player.speed;
    const label = `CN ${mapCase.mapPrefabName}`;
    const walkingState: NfoSimulationState = {
      ...baseState,
      player: {
        ...baseState.player,
        x: safeX,
        y: pitWorldY,
        canFly: false,
        fireCooldownSeconds: 999,
      },
      enemies: [],
      bullets: [],
      activeShooters: [],
    };
    const blockedState = updateNfoSimulation(
      walkingState,
      testRuntimeData,
      { ...NO_INPUT, moveX: 1 },
      moveSeconds,
    );
    const flyingState: NfoSimulationState = {
      ...walkingState,
      player: {
        ...walkingState.player,
        canFly: true,
      },
    };
    const flyingNextState = updateNfoSimulation(
      flyingState,
      testRuntimeData,
      { ...NO_INPUT, moveX: 1 },
      moveSeconds,
    );
    const terrainEnemyRadius = baseState.player.radius;
    const terrainEnemySampleDistance = terrainEnemyRadius * 0.7;
    const terrainEnemyStartX = pitWorldX - terrainEnemySampleDistance - 2;
    const terrainEnemyMoveDistance = terrainEnemySampleDistance + 4;
    const terrainEnemySpeed = 240;
    const terrainEnemyMoveSeconds = terrainEnemyMoveDistance / terrainEnemySpeed;
    const enemyPitTargetX = pitWorldX + CN_LEVEL_UNIT_SIZE * 2;
    const enemyPitBaseState: NfoSimulationState = {
      ...baseState,
      player: {
        ...baseState.player,
        x: enemyPitTargetX,
        y: pitWorldY,
        fireCooldownSeconds: 999,
      },
      bullets: [],
      activeShooters: [],
    };
    const walkingEnemyState: NfoSimulationState = {
      ...enemyPitBaseState,
      enemies: [
        createEnemyFixture(
          baseState,
          terrainEnemyStartX,
          pitWorldY,
          {
            speed: terrainEnemySpeed,
            radius: terrainEnemyRadius,
            canFly: false,
          },
        ),
      ],
      minions: [],
    };
    const walkingEnemyBlockedState = updateNfoSimulation(
      walkingEnemyState,
      testRuntimeData,
      NO_INPUT,
      terrainEnemyMoveSeconds,
    );
    const flyingEnemyState: NfoSimulationState = {
      ...walkingEnemyState,
      enemies: walkingEnemyState.enemies.map((enemy) => ({
        ...enemy,
        canFly: true,
      })),
    };
    const flyingEnemyNextState = updateNfoSimulation(
      flyingEnemyState,
      testRuntimeData,
      NO_INPUT,
      terrainEnemyMoveSeconds,
    );
    const enemyRadius = baseState.player.radius + 20;
    const enemyBoundaryState: NfoSimulationState = {
      ...baseState,
      player: {
        ...baseState.player,
        x: baseState.worldBounds.maxX - baseState.player.radius,
        fireCooldownSeconds: 999,
      },
      enemies: [
        createEnemyFixture(
          baseState,
          baseState.worldBounds.maxX - enemyRadius - 2,
          baseState.player.y,
          {
            speed: 1000,
            radius: enemyRadius,
          },
        ),
      ],
      minions: [],
      bullets: [],
      activeShooters: [],
    };
    const enemyClampedState = updateNfoSimulation(
      enemyBoundaryState,
      testRuntimeData,
      NO_INPUT,
      1,
    );
    const minionRadius = 28;
    const minionBoundaryTarget = createEnemyFixture(
      baseState,
      baseState.worldBounds.maxX - 5,
      baseState.player.y,
      {
        speed: 0,
        radius: 5,
      },
    );
    const minionBoundaryProbe: NfoSimMinion = {
      id: 910001,
      minionId: 50,
      aiTypeId: 0,
      weaponId: 0,
      weaponLevel: 1,
      name: "CN boundary minion probe",
      speed: 1000,
      radius: minionRadius,
      x: baseState.worldBounds.maxX - 120,
      y: baseState.player.y,
      remainingSeconds: 10,
      aiFireCooldownSeconds: 0,
      fireCooldownSeconds: 0,
      pendingFireGroups: 0,
      canFireOwnWeapon: false,
      activeBuffs: [],
    };
    const minionBoundaryState: NfoSimulationState = {
      ...baseState,
      player: {
        ...baseState.player,
        fireCooldownSeconds: 999,
      },
      enemies: [minionBoundaryTarget],
      minions: [minionBoundaryProbe],
      bullets: [],
      activeShooters: [],
    };
    const minionClampedState = updateNfoSimulation(
      minionBoundaryState,
      testRuntimeData,
      NO_INPUT,
      1,
    );

    assert.equal(baseState.terrain.pitTiles.length, mapCase.pitCount);
    assert.equal(baseState.terrain.pitTileKeys[`${mapCase.firstPitX},${mapCase.firstPitY}`], true);
    assertClose(baseState.terrain.pitTiles[0]?.x ?? Number.NaN, pitWorldX, `${label} first pit x`);
    assertClose(
      baseState.terrain.pitTiles[0]?.y ?? Number.NaN,
      mapCase.firstPitY * CN_LEVEL_UNIT_SIZE,
      `${label} first pit y`,
    );
    assertClose(baseState.worldBounds.minX, mapCase.prefabBoundsMinX * CN_LEVEL_UNIT_SIZE, `${label} minX`);
    assertClose(baseState.worldBounds.minY, mapCase.prefabBoundsMinY * CN_LEVEL_UNIT_SIZE, `${label} minY`);
    assertClose(
      baseState.worldBounds.maxX,
      (mapCase.prefabBoundsMaxX + 1) * CN_LEVEL_UNIT_SIZE,
      `${label} maxX`,
    );
    assertClose(
      baseState.worldBounds.maxY,
      (mapCase.prefabBoundsMaxY + 1) * CN_LEVEL_UNIT_SIZE,
      `${label} maxY`,
    );
    assertClose(blockedState.player.x, safeX, `${label} pit blocks non-flying x`);
    assertClose(blockedState.player.y, pitWorldY, `${label} pit blocks non-flying y`);
    assert.ok(flyingNextState.player.x > pitWorldX);
    assertClose(flyingNextState.player.y, pitWorldY, `${label} flying y`);
    assertClose(
      walkingEnemyBlockedState.enemies[0]?.x ?? Number.NaN,
      terrainEnemyStartX,
      `${label} pit blocks non-flying enemy x`,
    );
    assertClose(
      walkingEnemyBlockedState.enemies[0]?.y ?? Number.NaN,
      pitWorldY,
      `${label} pit blocks non-flying enemy y`,
    );
    assert.ok((flyingEnemyNextState.enemies[0]?.x ?? 0) > pitWorldX);
    assertClose(
      flyingEnemyNextState.enemies[0]?.y ?? Number.NaN,
      pitWorldY,
      `${label} flying enemy y`,
    );
    assertClose(
      enemyClampedState.enemies[0]?.x ?? Number.NaN,
      baseState.worldBounds.maxX - enemyRadius,
      `${label} enemy maxX clamp`,
    );
    assertClose(
      minionClampedState.minions[0]?.x ?? Number.NaN,
      baseState.worldBounds.maxX - minionRadius,
      `${label} minion maxX clamp`,
    );
  }
}

function configureRuntimeForShooter(
  sourceRuntimeData: NfoOfflineRuntimeData,
  bulletShooterId: number,
): NfoOfflineRuntimeData {
  const runtimeData = structuredClone(sourceRuntimeData);
  const character = runtimeData.characters[0];
  const level = runtimeData.levels[0];
  const activeSkill = character
    ? runtimeData.activeSkills.find((candidate) => candidate.id === character.activeSkillId)
      ?? runtimeData.activeSkills[0]
    : null;
  const activeSkillLevel = activeSkill?.levels[0];

  assert.ok(character);
  assert.ok(level);
  assert.ok(activeSkill);
  assert.ok(activeSkillLevel);

  runtimeData.selected.characterId = character.id;
  runtimeData.selected.levelId = level.id;
  level.events = [];
  level.totalFrames = 999999;
  character.activeSkillId = activeSkill.id;
  activeSkillLevel.chargeCountMax = 1;
  activeSkillLevel.timelineFrames = 30;
  activeSkillLevel.events = [createActiveSkillShooterEvent(bulletShooterId)];

  return runtimeData;
}

function configureRuntimeForActiveSkill(
  sourceRuntimeData: NfoOfflineRuntimeData,
  activeSkillId: number,
): NfoOfflineRuntimeData {
  const runtimeData = structuredClone(sourceRuntimeData);
  const character = runtimeData.characters[0];
  const level = runtimeData.levels[0];
  const activeSkill = runtimeData.activeSkills.find((candidate) => (
    candidate.id === activeSkillId
  ));
  const activeSkillLevel = activeSkill?.levels[0];

  assert.ok(character);
  assert.ok(level);
  assert.ok(activeSkill);
  assert.ok(activeSkillLevel);

  runtimeData.selected.characterId = character.id;
  runtimeData.selected.levelId = level.id;
  level.events = [];
  level.totalFrames = 999999;
  character.activeSkillId = activeSkill.id;
  activeSkillLevel.chargeCountMax = 1;

  return runtimeData;
}

function configureRuntimeForAI(
  sourceRuntimeData: NfoOfflineRuntimeData,
): NfoOfflineRuntimeData {
  const runtimeData = structuredClone(sourceRuntimeData);
  const level = runtimeData.levels[0];

  assert.ok(level);

  runtimeData.selected.levelId = level.id;
  level.events = [];
  level.totalFrames = 999999;

  return runtimeData;
}

function configureRuntimeForMap(
  sourceRuntimeData: NfoOfflineRuntimeData,
  levelId: number,
): NfoOfflineRuntimeData {
  const runtimeData = structuredClone(sourceRuntimeData);
  const level = runtimeData.levels.find((candidate) => candidate.id === levelId);

  assert.ok(level);

  runtimeData.selected.levelId = level.id;
  level.events = [];
  level.totalFrames = 999999;

  return runtimeData;
}

function configureRuntimeForWeapon(
  sourceRuntimeData: NfoOfflineRuntimeData,
): NfoOfflineRuntimeData {
  const runtimeData = structuredClone(sourceRuntimeData);
  const level = runtimeData.levels[0];

  assert.ok(level);

  runtimeData.selected.levelId = level.id;
  level.events = [];
  level.totalFrames = 999999;

  return runtimeData;
}

function createActiveSkillShooterEvent(bulletShooterId: number): NfoActiveSkillTimelineEvent {
  return {
    name: `Parity shooter ${bulletShooterId}`,
    frame: 1,
    bulletShooterId,
    fullScreenEffectName: "",
    buffs: [],
    spawnMinion: null,
  };
}

function createStateWithEnemy(
  runtimeData: NfoOfflineRuntimeData,
  enemyOffset: { x: number; y: number },
  weaponId?: number,
): NfoSimulationState {
  const state = createNfoSimulation(runtimeData, weaponId ? { weaponId } : {});
  return {
    ...state,
    player: {
      ...state.player,
      fireCooldownSeconds: 999,
    },
    enemies: [
      createEnemyFixture(
        state,
        state.player.x + enemyOffset.x,
        state.player.y + enemyOffset.y,
      ),
    ],
  };
}

function createStateWithoutEnemies(runtimeData: NfoOfflineRuntimeData): NfoSimulationState {
  const state = createNfoSimulation(runtimeData);
  return {
    ...state,
    player: {
      ...state.player,
      fireCooldownSeconds: 999,
    },
    enemies: [],
  };
}

function createEnemyFixture(
  state: NfoSimulationState,
  x: number,
  y: number,
  overrides: Partial<NfoSimEnemy> = {},
): NfoSimEnemy {
  return {
    id: 900001,
    typeId: 900001,
    spawnEventId: overrides.spawnEventId ?? 0,
    aiTypeId: overrides.aiTypeId,
    aiStateId: overrides.aiStateId,
    aiStateElapsedFrames: overrides.aiStateElapsedFrames,
    aiFireCooldownSeconds: overrides.aiFireCooldownSeconds,
    name: "CN parity target",
    x,
    y,
    hp: overrides.hp ?? 999999,
    maxHp: overrides.maxHp ?? overrides.hp ?? 999999,
    attack: overrides.attack ?? 0,
    defense: overrides.defense ?? 0,
    speed: overrides.speed ?? 0,
    radius: overrides.radius ?? 20,
    isBoss: overrides.isBoss ?? false,
    canFly: overrides.canFly ?? false,
    canWalkThroughWall: overrides.canWalkThroughWall ?? false,
    dropId: overrides.dropId ?? 0,
    activeBuffs: overrides.activeBuffs ?? [],
  };
}

function createEnemyKillingBullet(
  state: NfoSimulationState,
  enemy: NfoSimEnemy,
): NfoSimBullet {
  return {
    id: 990102,
    bulletTypeId: 990102,
    dealsDamage: true,
    rotateType: 0,
    motionType: "linear",
    angle: 0,
    facingAngle: 0,
    vx: 0,
    vy: 0,
    damage: enemy.hp + enemy.defense + 1,
    attackerAttack: state.player.attack,
    isCritical: false,
    canDamagePlayer: false,
    hitTargetType: 0,
    radius: enemy.radius + 2,
    colliderType: 0,
    colliderWidth: enemy.radius * 2,
    colliderLength: enemy.radius * 2,
    colliderForwardOffset: 0,
    damageJudgeType: 0,
    damageJudgeDelaySeconds: 0,
    damageJudgeCooldownSeconds: 0,
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
    x: enemy.x,
    y: enemy.y,
  };
}

function withMockedRandom<T>(values: number[], callback: () => T): T {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0;
    index += 1;
    return value;
  };

  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

function chargeActiveSkill(state: NfoSimulationState): NfoSimulationState {
  return {
    ...state,
    activeSkill: {
      ...state.activeSkill,
      chargeFrames: state.activeSkill.chargeMaxFrames,
    },
  };
}

function createFriendlyMinionProbe(
  overrides: Partial<NfoSimMinion> = {},
): NfoSimMinion {
  return {
    id: 930001,
    minionId: 50,
    aiTypeId: 0,
    weaponId: 0,
    weaponLevel: 1,
    name: "CN player-side buff minion probe",
    speed: 300,
    radius: 28,
    x: 96,
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

function assertClose(actual: number, expected: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    `expected ${label} ${actual} to be close to ${expected}`,
  );
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
