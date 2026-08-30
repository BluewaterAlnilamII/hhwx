import type {
  BandoriCardAttribute,
  BandoriServer,
  CalculatedProfileCardV1,
  Five,
  FixedTeamSkillContextV1,
  ResolvedScoreSkillV1,
  SkillBehaviorV1,
} from "./contracts";
import { failInput } from "./errors";
import { regionalNumber } from "./parameters";

const SCORE_EFFECT_TYPES = new Set([
  "score",
  "score_over_life",
  "score_under_life",
  "score_continued_note_judge",
  "score_under_great_half",
  "score_only_perfect",
]);
const RATE_UP_EFFECT_TYPE = "score_rate_up_with_perfect";

type RawScoreEffect = {
  type: string;
  valuePercent: number;
  condition: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSkillLevel(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 5) {
    failInput("INVALID_SKILL", path, "must be an integer from 1 through 5");
  }
  return value;
}

function readDuration(
  skill: Record<string, unknown>,
  skillLevel: number,
  server: BandoriServer,
  path: string,
): number {
  const durationSource = Array.isArray(skill.duration)
    ? skill.duration[skillLevel - 1]
    : skill.duration;
  const duration = regionalNumber(durationSource, server);
  if (duration === null || duration <= 0) {
    failInput("INVALID_SKILL", `${path}.duration[${skillLevel - 1}]`, "must resolve to a positive number");
  }
  return duration;
}

function readRawScoreEffects(
  effectTypes: Record<string, unknown>,
  server: BandoriServer,
  path: string,
): RawScoreEffect[] {
  const effects: RawScoreEffect[] = [];
  for (const [type, rawEffect] of Object.entries(effectTypes)) {
    if (!SCORE_EFFECT_TYPES.has(type) || !isRecord(rawEffect)) continue;
    const valuePercent = regionalNumber(rawEffect.activateEffectValue, server);
    if (valuePercent === null || valuePercent === 0) continue;
    if (valuePercent < 0) {
      failInput("INVALID_SKILL", `${path}.${type}.activateEffectValue`, "must be non-negative");
    }
    effects.push({
      type,
      valuePercent,
      condition: typeof rawEffect.activateCondition === "string"
        ? rawEffect.activateCondition.toLowerCase()
        : null,
    });
  }
  return effects;
}

function resolvesUnifiedValue(
  activationEffect: Record<string, unknown>,
  context: FixedTeamSkillContextV1,
): boolean {
  const requiredBandId = finiteNumber(activationEffect.unificationActivateConditionBandId);
  const requiredAttribute = typeof activationEffect.unificationActivateConditionType === "string"
    ? activationEffect.unificationActivateConditionType.toLowerCase()
    : null;
  return (requiredBandId !== null && context.sameBandId === requiredBandId)
    || (requiredAttribute !== null && context.sameAttribute === requiredAttribute);
}

function resolveBehavior(primary: RawScoreEffect, fallback: RawScoreEffect | null): SkillBehaviorV1 {
  switch (primary.type) {
    case "score_continued_note_judge":
      if (fallback === null) {
        failInput(
          "INVALID_SKILL",
          "activationEffect.activateEffectTypes.score_continued_note_judge",
          "continued score effects require a later ordinary fallback effect",
        );
      }
      return {
        kind: "continued_perfect",
        activeScoreUpPercent: primary.valuePercent,
        fallbackScoreUpPercent: fallback.valuePercent,
      };
    case "score_under_great_half":
      return { kind: "great_or_worse_half", scoreUpPercent: primary.valuePercent };
    case "score_only_perfect":
      return { kind: "perfect_only", scoreUpPercent: primary.valuePercent };
    default:
      return primary.condition === "perfect"
        ? { kind: "score_on_perfect", scoreUpPercent: primary.valuePercent }
        : { kind: "score", scoreUpPercent: primary.valuePercent };
  }
}

/** Resolve the only team context that Bestdori conditional score values use. */
export function buildFixedTeamSkillContext(
  cards: Five<CalculatedProfileCardV1>,
): FixedTeamSkillContextV1 {
  const firstBandId = cards[0].bandId;
  const sameBandId = firstBandId !== null && cards.every((card) => card.bandId === firstBandId)
    ? firstBandId
    : null;
  const firstAttribute = cards[0].attribute;
  const sameAttribute = cards.every((card) => card.attribute === firstAttribute)
    ? firstAttribute
    : null;
  return { sameBandId, sameAttribute };
}

/**
 * Normalize one raw skill master to the Bestdori-compatible P/G score model.
 * Source fields that describe a life threshold are deliberately never read.
 */
export function resolveBestdoriScoreSkill(options: {
  skillId: number;
  skillLevel: number;
  skillMaster: unknown;
  context: FixedTeamSkillContextV1;
  server: BandoriServer;
  path?: string;
}): ResolvedScoreSkillV1 {
  const path = options.path ?? `skillsById.${options.skillId}`;
  if (!Number.isSafeInteger(options.skillId) || options.skillId <= 0) {
    failInput("INVALID_SKILL", path, "skill ID must be a positive safe integer");
  }
  const skillLevel = readSkillLevel(options.skillLevel, `${path}.skillLevel`);
  const skill = isRecord(options.skillMaster)
    ? options.skillMaster
    : failInput("INVALID_SKILL", path, "skill master is missing");
  const durationSeconds = readDuration(skill, skillLevel, options.server, path);
  const activationEffect = isRecord(skill.activationEffect) ? skill.activationEffect : {};
  const effectTypes = isRecord(activationEffect.activateEffectTypes)
    ? activationEffect.activateEffectTypes
    : {};
  const scoreEffects = readRawScoreEffects(
    effectTypes,
    options.server,
    `${path}.activationEffect.activateEffectTypes`,
  );
  const primary = scoreEffects[0] ?? null;
  const fallback = primary?.type === "score_continued_note_judge"
    ? scoreEffects.slice(1).find((effect) => effect.type !== "score_continued_note_judge") ?? null
    : null;

  let behavior: SkillBehaviorV1 = { kind: "neutral" };
  let baseScoreUpPercent = 0;
  if (primary !== null) {
    const unifiedValue = regionalNumber(activationEffect.unificationActivateEffectValue, options.server);
    const resolvedPrimary = unifiedValue !== null
      && unifiedValue >= 0
      && resolvesUnifiedValue(activationEffect, options.context)
      ? { ...primary, valuePercent: unifiedValue }
      : primary;
    behavior = resolveBehavior(resolvedPrimary, fallback);
    baseScoreUpPercent = resolvedPrimary.valuePercent;
  }

  const hasRateUpWithPerfect = Object.hasOwn(effectTypes, RATE_UP_EFFECT_TYPE);
  if (hasRateUpWithPerfect && behavior.kind !== "score") {
    failInput(
      "INVALID_SKILL",
      `${path}.activationEffect.activateEffectTypes.${RATE_UP_EFFECT_TYPE}`,
      "PERFECT rate-up requires an unconditional score effect",
    );
  }
  const maximumScoreUpPercent = baseScoreUpPercent + 50;
  if (hasRateUpWithPerfect && !Number.isFinite(maximumScoreUpPercent)) {
    failInput("INVALID_SKILL", path, "resolved score percentages must remain finite");
  }

  return {
    masterSkillId: options.skillId,
    skillLevel,
    durationSeconds,
    behavior,
    rateUpWithPerfect: hasRateUpWithPerfect
      ? {
          stackPercent: 0.5,
          maxScoreUpPercent: maximumScoreUpPercent,
        }
      : null,
  };
}

export type { FixedTeamSkillContextV1 } from "./contracts";
