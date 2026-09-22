import { calculateBandoriCardEventBonus, calculateBandoriSupportCardEventBonus, type BandoriEventBonus } from "@/lib/bandori-team-calculator";
import { resolveBandoriTeamSearchEventMode, resolveBandoriTeamSearchUseFever } from "@/lib/bandori/team-builder/core/events";
import type { BandoriTeamSearchSettings } from "@/lib/bandori/team-builder/core/types";
import type { CalculatedProfileCardV1, ExactProbabilityV1, Five, MedleySongV1, ResolvedScoreSkillV1, SearchCardV1, CalculatedAreaItemV1, AreaItemConfigurationV1, FixedSongSourceSelectionV1 } from "../medley-foundation/contracts";
import { buildSearchRoster } from "../medley-foundation/search-source";
import { normalizeSingleScoringChart } from "../medley-foundation/chart";
import { parsePerfectRatePercent, parseSongIdText } from "../medley-foundation/numeric";
import { readSourceDifficulty, readSourcePlayLevel, requireSourceMaster } from "../medley-foundation/source-masters";
import { resolveBestdoriScoreSkill } from "../medley-foundation/skills";
import { failInput, readRecord } from "../medley-foundation/errors";

export const SINGLE_SEARCH_INPUT_VERSION = "hhwx-single-search-input-v1" as const;
export const SINGLE_SCORING_RULES_VERSION = "hhwx-single-medley-foundation-v4" as const;

export type SingleEventRuleV1 = { kind: "none" } | { kind: "normal"; base: number; divisor: number; formula: number } | { kind: "challenge"; modern: boolean };
export type SingleSearchInputV1 = {
  schemaVersion: typeof SINGLE_SEARCH_INPUT_VERSION;
  scoringRulesVersion: typeof SINGLE_SCORING_RULES_VERSION;
  perfectRate: ExactProbabilityV1;
  cards: SearchCardV1[];
  areaItems: CalculatedAreaItemV1[];
  areaConfigurations: AreaItemConfigurationV1[];
  song: MedleySongV1;
  fever: boolean[];
  pointBonusRates: number[];
  supportPowers: number[];
  missionSupport: boolean;
  eventRule: SingleEventRuleV1;
  target: "score" | "event_point";
  otherSkills: [ResolvedScoreSkillV1, ResolvedScoreSkillV1, ResolvedScoreSkillV1, ResolvedScoreSkillV1] | null;
  encoreActor: number;
  otherPlayersPower: number;
  minLeaderScoreUpPercent: number;
  minTotalPower: number;
  resultLimit: number;
};

export type SingleSearchSolutionV1 = {
  configurationIndex: number;
  memberInstanceIds: Five<number>;
  // Room positions contain zero-based player identities (self = 0), not card IDs.
  playerFormation: Five<number> | null;
  averageScore: number;
  targetValue: number;
  roomScore: number | null;
  eventPointBase: number | null;
  cardPower: number;
  areaItemPower: number;
  eventPower: number;
  totalPower: number;
  pointBonusRate: number;
  supportPower: number;
  supportInstanceIds: number[];
};
export type SingleScoreDetailsV1 = {
  minimumScore: number;
  maximumScore: number;
  peakMemberInstanceIds: Five<number>;
  peakPlayerFormation: Five<number> | null;
  peakActivationOrder: Five<number>;
  peakAverageScore: number;
  maximumProbabilityNumerator: number;
  maximumProbabilityDenominator: number;
  currentMaximumProbabilityNumerator: number;
};
export type SingleSearchRunV1 = {
  outcome: {
    status: "exact" | "incomplete";
    reason?: string;
    best?: SingleSearchSolutionV1 | null;
    bestSoFar?: SingleSearchSolutionV1 | null;
    discovered: SingleSearchSolutionV1[];
    diagnostics: { partialNodes: number; prunedNodes: number; evaluatedTeams: number; configurationsCompleted: number; unknownBounds: number; estimatedSearchStorageBytes: number };
  };
  details: SingleScoreDetailsV1[];
};

export type SingleSettings = BandoriTeamSearchSettings;

function nonnegative(value: unknown, path: string, fallback = 0): number {
  if (value !== undefined && value !== null && typeof value !== "number" && typeof value !== "string") failInput("INVALID_PARAMETER", path, "expected a number");
  const number = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(number) || number < 0) failInput("INVALID_PARAMETER", path, "must be finite and non-negative");
  return number;
}

function eventRule(settings: SingleSettings): SingleEventRuleV1 {
  const formula = settings.eventFormula ?? 0;
  if (![0, 1, 2].includes(formula)) failInput("INVALID_PARAMETER", "eventFormula", "must be 0, 1, or 2");
  if (settings.eventType === "challenge" && settings.liveType === "challenge") return { kind: "challenge", modern: formula === 2 };
  const modern = formula === 2;
  const configs = { story: [50, 10000], challenge: modern ? [70, 50000] : [20, 25000], live_try: modern ? [130, 26000] : [40, 13000], mission_live: modern ? [120, 15000] : [40, 10000] };
  const config = configs[settings.eventType as keyof typeof configs];
  return config ? { kind: "normal", base: config[0], divisor: config[1], formula } : { kind: "none" };
}

/** Uses the same raw profile/master normalization as medley, without dummy songs. */
export function buildSingleSearchInput(source: {
  profilePayload: unknown;
  cardsById: Record<string, unknown>;
  charactersById: Record<string, unknown>;
  skillsById: Record<string, unknown>;
  areaItemsById: Record<string, unknown>;
  songsById: Record<string, unknown>;
  eventBonus: BandoriEventBonus | null;
  perfectRatePercentText: string;
  song: FixedSongSourceSelectionV1;
  settings: SingleSettings;
}): { input: SingleSearchInputV1; calculatedCards: CalculatedProfileCardV1[] } {
  const path = "sourceInput";
  const roster = buildSearchRoster(source, path);
  const settings = source.settings;
  for (const [key, allowed] of [
    ["eventType", ["none", "story", "challenge", "versus", "live_try", "mission_live", "festival"]],
    ["liveType", ["free", "multi", "challenge", "versus"]],
    ["target", ["score", "eventPoint"]],
    ["encoreSkillSource", ["self", "other1", "other2", "other3", "other4"]],
  ] as const) {
    const value = settings[key];
    if (value !== undefined && !(allowed as readonly string[]).includes(value)) failInput("INVALID_PARAMETER", key, "unsupported single-song setting");
  }
  const mode = resolveBandoriTeamSearchEventMode(settings.eventType, settings.liveType);
  const songId = parseSongIdText(source.song.songIdText);
  const difficulty = readSourceDifficulty(source.song.difficulty, "song.difficulty");
  const { notes, fever } = normalizeSingleScoringChart(source.song.chart, resolveBandoriTeamSearchUseFever(settings));
  const eventCards = roster.calculatedCards.map(card => ({ ...card, baseParam: card.baseParameter, characterParam: card.characterParameter }));
  const multi = settings.liveType === "multi";
  const external = settings.otherPlayerSkills ?? [];
  if (multi && external.length !== 4) failInput("INVALID_PARAMETER", "otherPlayerSkills", "five-player cooperative calculation requires four external skills");
  const otherSkills = multi ? external.map((value, i) => {
    if (value.conditionSatisfied !== undefined && typeof value.conditionSatisfied !== "boolean") failInput("INVALID_PARAMETER", `otherPlayerSkills[${i}].conditionSatisfied`, "expected a boolean");
    const master = requireSourceMaster(source.skillsById, value.skillId, "skillsById");
    const activation = readRecord(master.activationEffect, `otherPlayerSkills[${i}].activationEffect`, "INVALID_SKILL");
    const band = Number(activation.unificationActivateConditionBandId) || null;
    const attribute = typeof activation.unificationActivateConditionType === "string" ? activation.unificationActivateConditionType.toLowerCase() as SearchCardV1["attribute"] : null;
    return resolveBestdoriScoreSkill({ skillId: value.skillId, skillLevel: value.skillLevel, skillMaster: master,
      context: { sameBandId: value.conditionSatisfied ? band : null,
        sameAttribute: value.conditionSatisfied ? attribute : null },
      server: roster.profile.server, path: `otherPlayerSkills[${i}]` });
  }) as SingleSearchInputV1["otherSkills"] : null;
  const input: SingleSearchInputV1 = {
    schemaVersion: SINGLE_SEARCH_INPUT_VERSION, scoringRulesVersion: SINGLE_SCORING_RULES_VERSION,
    perfectRate: parsePerfectRatePercent(source.perfectRatePercentText),
    cards: roster.cards.map(card => ({ ...card, eventParameter: mode === "parameterPower" ? card.eventParameter : [0, 0, 0] })),
    areaItems: roster.areaItems, areaConfigurations: roster.areaConfigurations,
    song: { slot: 0, songId, difficulty, playLevel: readSourcePlayLevel(source.songsById[String(songId)], songId, difficulty), notes }, fever,
    pointBonusRates: eventCards.map(card => mode === "pointBonus" ? calculateBandoriCardEventBonus(card, source.eventBonus).pointBonusRate : 0),
    supportPowers: eventCards.map(card => calculateBandoriSupportCardEventBonus(card, source.eventBonus).supportPower),
    missionSupport: settings.eventType === "mission_live" && settings.target === "eventPoint",
    eventRule: eventRule(settings), target: settings.target === "eventPoint" ? "event_point" : "score", otherSkills,
    encoreActor: multi && settings.encoreSkillSource?.startsWith("other") ? Number(settings.encoreSkillSource.slice(5)) : 0,
    otherPlayersPower: multi ? 4 * Math.trunc(nonnegative(settings.otherPlayersAveragePower ?? settings.roomPower, "otherPlayersAveragePower")) : 0,
    minLeaderScoreUpPercent: nonnegative(settings.constraints?.minLeaderScoreUpPercent, "minLeaderScoreUpPercent"),
    minTotalPower: nonnegative(settings.constraints?.minTotalPower, "minTotalPower"),
    resultLimit: Math.min(50, Math.max(1, Math.trunc(nonnegative(settings.resultLimit, "resultLimit", 10)))),
  };
  return { input, calculatedCards: roster.calculatedCards };
}
