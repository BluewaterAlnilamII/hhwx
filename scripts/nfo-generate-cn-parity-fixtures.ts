import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { readLocalNfoRuntimeData } from "../src/lib/bandori-nfo-local-snapshot-server";
import {
  buildNfoCnParityFixture,
  NFO_CN_PARITY_FIXTURE_PATH,
} from "./nfo-cn-parity-fixtures";

async function main() {
  const runtimeData = await readLocalNfoRuntimeData();
  const fixture = buildNfoCnParityFixture(runtimeData);

  await mkdir(dirname(NFO_CN_PARITY_FIXTURE_PATH), { recursive: true });
  await writeFile(
    NFO_CN_PARITY_FIXTURE_PATH,
    `${JSON.stringify(fixture, null, 2)}\n`,
    "utf8",
  );

  console.log(`Wrote ${NFO_CN_PARITY_FIXTURE_PATH}`);
  console.log(`Active skill shooter cases: ${fixture.selectedShooterCases.length}`);
  console.log(`Weapon level shooter cases: ${fixture.selectedWeaponShooterCases.length}`);
  console.log(`Weapon direct fire cases: ${fixture.selectedWeaponDirectFireCases.length}`);
  console.log(`Weapon minion cases: ${fixture.selectedWeaponMinionCases.length}`);
  console.log(`Weapon self-buff cases: ${fixture.selectedWeaponSelfBuffCases.length}`);
  console.log(`Shooter rotation cases: ${fixture.selectedShooterRotationCases.length}`);
  console.log(`Shooter on-destroy cases: ${fixture.selectedShooterOnDestroyCases.length}`);
  console.log(`Active skill shooter spawn cases: ${fixture.selectedActiveSkillShooterSpawnCases.length}`);
  console.log(`Active skill shooter hit-buff cases: ${fixture.selectedActiveSkillShooterHitBuffCases.length}`);
  console.log(`AI action cases: ${fixture.selectedAIActionCases.length}`);
  console.log(`AI timeline cases: ${fixture.selectedAIStateTimelineCases.length}`);
  console.log(`AI FireAllWeaponNow cases: ${fixture.selectedAIStateFireAllWeaponCases.length}`);
  console.log(`AI shooter spawn cases: ${fixture.selectedAIStateShooterSpawnCases.length}`);
  console.log(`AI no-colliding cases: ${fixture.selectedAIStateNoCollidingCases.length}`);
  console.log(`AI teleport cases: ${fixture.selectedAIStateTeleportCases.length}`);
  console.log(`AI movement cases: ${fixture.selectedAIStateMovementCases.length}`);
  console.log(`Active skill buff cases: ${fixture.selectedActiveSkillBuffCases.length}`);
  console.log(`Active skill summon cases: ${fixture.selectedActiveSkillSummonCases.length}`);
  console.log(`Item cases: ${fixture.selectedItemCases.length}`);
  console.log(`Drop cases: ${fixture.selectedDropCases.length}`);
  console.log(`Level enemy spawn cases: ${fixture.selectedLevelEnemySpawnCases.length}`);
  console.log(`Level clear cases: ${fixture.selectedLevelClearCases.length}`);
  console.log(`Level event trigger cases: ${fixture.selectedLevelEventTriggerCases.length}`);
  console.log(`Level AI state-change cases: ${fixture.selectedLevelAIStateChangeCases.length}`);
  console.log(`Map cases: ${fixture.selectedMapCases.length}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
