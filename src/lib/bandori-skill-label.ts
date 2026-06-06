import type { BestdoriSkillMaster } from "@/lib/bandori-team-calculator";

export type BandoriSkillLabelMaster = BestdoriSkillMaster & {
  description?: Array<string | null>;
  simpleDescription?: Array<string | null>;
  onceEffect?: {
    onceEffectValue?: unknown;
  };
};

function pickRegionalText(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[3] ?? value[2] ?? value[1] ?? value[0] ?? value[4] ?? "").trim();
  }
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeBandoriSkillLevel(skillLevel: unknown, fallback = 1): number {
  return Math.min(5, Math.max(1, Math.trunc(Number(skillLevel) || fallback)));
}

function pickSkillLevelNumber(value: unknown, skillLevel: unknown, fallbackLevel: number): number | null {
  const level = normalizeBandoriSkillLevel(skillLevel, fallbackLevel);
  const rawValue = Array.isArray(value) ? value[level - 1] : value;
  const numeric = Number(rawValue);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatSkillNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function getSkillDurationByLevel(
  skill: BandoriSkillLabelMaster | undefined,
  skillLevel: unknown,
  fallbackLevel: number,
): number | null {
  return pickSkillLevelNumber(skill?.duration, skillLevel, fallbackLevel);
}

function getSkillOnceEffectValueByLevel(
  skill: BandoriSkillLabelMaster | undefined,
  skillLevel: unknown,
  fallbackLevel: number,
): number | null {
  return pickSkillLevelNumber(skill?.onceEffect?.onceEffectValue, skillLevel, fallbackLevel);
}

export function normalizeBandoriSkillLabel(
  skill: BandoriSkillLabelMaster | undefined,
  skillLevel: unknown,
  fallbackLevel = 1,
): string {
  const description = pickRegionalText(skill?.description) || pickRegionalText(skill?.simpleDescription);
  const duration = getSkillDurationByLevel(skill, skillLevel, fallbackLevel);
  const onceEffectValue = getSkillOnceEffectValueByLevel(skill, skillLevel, fallbackLevel);
  const durationText = duration !== null ? `${formatSkillNumber(duration)}秒` : "";
  const onceEffectText = onceEffectValue !== null ? formatSkillNumber(onceEffectValue) : "";
  const usesSecondaryPlaceholder = description.includes("{1}");
  const primaryText = usesSecondaryPlaceholder ? onceEffectText : durationText;
  const resolvedDescription = description
    .replace(/\{1\}秒/g, durationText)
    .replace(/\{1\}/g, durationText)
    .replace(/\{0\}秒/g, usesSecondaryPlaceholder && primaryText ? `${primaryText}秒` : primaryText)
    .replace(/\{0\}/g, primaryText)
    .replace(/\s+/g, " ")
    .trim();
  return resolvedDescription || "未知技能";
}
