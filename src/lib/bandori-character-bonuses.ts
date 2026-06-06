import type { BandoriCharacterBonusState } from "@/lib/bandori-team-calculator";
import type {
  UserGameProfileMissionBonusRecord,
  UserGameProfilePotentialRecord,
} from "@/lib/user-game-profile-payload";

export function buildBandoriCharacterBonuses(
  potentials: UserGameProfilePotentialRecord[],
  missionBonuses: UserGameProfileMissionBonusRecord[],
): BandoriCharacterBonusState[] {
  const records = new Map<number, BandoriCharacterBonusState>();
  const usesDetailedCharacterBonuses = potentials.some((potential) => (
    potential.performanceLevel !== potential.techniqueLevel
    || potential.performanceLevel !== potential.visualLevel
  )) || missionBonuses.some((bonus) => (
    bonus.performance !== bonus.technique
    || bonus.performance !== bonus.visual
  ));

  potentials.forEach((potential) => {
    const record = records.get(potential.characterId) ?? { characterId: potential.characterId };
    record.potential = {
      performance: potential.performanceLevel,
      technique: potential.techniqueLevel,
      visual: potential.visualLevel,
    };
    records.set(potential.characterId, record);
  });

  missionBonuses.forEach((bonus) => {
    const record = records.get(bonus.characterId) ?? { characterId: bonus.characterId };
    const current = record.missionBonusPercent ?? {};
    const bonusType = bonus.bonusType.toUpperCase() === "TRAINING" ? "training" : "collection";
    const currentByType = record.missionBonusPercentByType ?? {};
    record.missionBonusPercent = {
      performance: (current.performance ?? 0) + bonus.performance / 10,
      technique: (current.technique ?? 0) + bonus.technique / 10,
      visual: (current.visual ?? 0) + bonus.visual / 10,
    };
    record.missionBonusPercentByType = {
      ...currentByType,
      [bonusType]: {
        performance: bonus.performance / 10,
        technique: bonus.technique / 10,
        visual: bonus.visual / 10,
      },
    };
    record.missionBonusRoundingMode = usesDetailedCharacterBonuses ? "combined" : "split-by-type";
    records.set(bonus.characterId, record);
  });

  return [...records.values()];
}

export function toBandoriCharacterBonusMap(
  bonuses: BandoriCharacterBonusState[],
): Record<string, BandoriCharacterBonusState | undefined> {
  return Object.fromEntries(bonuses.map((bonus) => [String(bonus.characterId), bonus]));
}
