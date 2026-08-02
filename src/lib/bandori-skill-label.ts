import type { BestdoriSkillMaster } from "@/lib/bandori-team-calculator";
import {
  DEFAULT_BANDORI_PREFERRED_SERVER,
  getBandoriServerLanguageTag,
  pickBandoriRegionalTextWithServer,
  type BandoriServer,
  type BandoriServerLanguageTag,
} from "@/lib/bandori-server";

export type BandoriSkillLabelMaster = BestdoriSkillMaster & {
  description?: Array<string | null>;
  simpleDescription?: Array<string | null>;
  onceEffect?: {
    onceEffectValue?: unknown;
  };
};

export type ResolvedBandoriSkillLabel = {
  label: string;
  languageTag: BandoriServerLanguageTag;
};

function resolveRegionalText(
  value: unknown,
  preferredServer: BandoriServer,
  contextServer?: BandoriServer | null,
): { text: string; server: BandoriServer } | null {
  if (Array.isArray(value)) {
    return pickBandoriRegionalTextWithServer(value, preferredServer, contextServer);
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return {
    text: value.trim(),
    server: contextServer ?? preferredServer,
  };
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

export function resolveBandoriSkillLabel(
  skill: BandoriSkillLabelMaster | undefined,
  skillLevel: unknown,
  fallbackLevel = 1,
  preferredServer: BandoriServer = DEFAULT_BANDORI_PREFERRED_SERVER,
  contextServer?: BandoriServer | null,
  fallbackLabel = "",
): ResolvedBandoriSkillLabel {
  const descriptionSelection = resolveRegionalText(skill?.description, preferredServer, contextServer)
    ?? resolveRegionalText(skill?.simpleDescription, preferredServer, contextServer)
    ?? { text: "", server: contextServer ?? preferredServer };
  const description = descriptionSelection.text;
  const duration = getSkillDurationByLevel(skill, skillLevel, fallbackLevel);
  const onceEffectValue = getSkillOnceEffectValueByLevel(skill, skillLevel, fallbackLevel);
  const durationValueText = duration !== null ? formatSkillNumber(duration) : "";
  const onceEffectValueText = onceEffectValue !== null ? formatSkillNumber(onceEffectValue) : "";
  const usesSecondaryPlaceholder = description.includes("{1}");
  const primaryValueText = usesSecondaryPlaceholder ? onceEffectValueText : durationValueText;
  const resolvedDescription = description
    .replace(/\{1\}/g, durationValueText)
    .replace(/\{0\}/g, primaryValueText)
    .replace(/\s+/g, " ")
    .trim();
  return {
    label: resolvedDescription || fallbackLabel,
    languageTag: getBandoriServerLanguageTag(descriptionSelection.server),
  };
}

export function normalizeBandoriSkillLabel(
  skill: BandoriSkillLabelMaster | undefined,
  skillLevel: unknown,
  fallbackLevel = 1,
  preferredServer: BandoriServer = DEFAULT_BANDORI_PREFERRED_SERVER,
  contextServer?: BandoriServer | null,
  fallbackLabel = "",
): string {
  return resolveBandoriSkillLabel(
    skill,
    skillLevel,
    fallbackLevel,
    preferredServer,
    contextServer,
    fallbackLabel,
  ).label;
}
