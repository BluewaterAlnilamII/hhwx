import { getEventPointMultiplier } from "@/lib/bandori/team-builder/core/events";

export const FLAME_COSTS = [1, 2, 3] as const;
export const CP_COSTS = [200, 400, 800, 1600] as const;
export type FlameCost = typeof FLAME_COSTS[number];
export type CpCost = typeof CP_COSTS[number];

export const DEFAULT_CALCULATOR_DRAFT = {
  currentPt: "", currentCp: "", storedFlames: "", smallDrinks: "", largeDrinks: "",
  wastedFlames: "", flamePt: "", cpPt: "", measuredFlames: "3", measuredCp: "1600",
  flameCost: "3", cpCost: "1600", minutesPerGame: "", targetPt: "",
};
export type CalculatorDraft = typeof DEFAULT_CALCULATOR_DRAFT;
export const CALCULATOR_FIELD_DEFAULTS: Partial<Record<keyof CalculatorDraft, string>> = {
  currentPt: "0", currentCp: "0", storedFlames: "0", smallDrinks: "0", largeDrinks: "0",
  wastedFlames: "0", minutesPerGame: "2.73",
};

export type EventPtInput = {
  challenge: boolean;
  currentPt: number;
  currentCp: number;
  storedFlames: number;
  smallDrinks: number;
  largeDrinks: number;
  wastedFlames: number;
  flamePt: number;
  cpPt: number;
  measuredFlames: 0 | FlameCost;
  measuredCp: CpCost;
  flameCost: FlameCost;
  cpCost: CpCost;
  minutesPerGame: number;
  targetPt: number | null;
};

export function parseCalculatorDraft(draft: CalculatorDraft, challenge: boolean): EventPtInput | null {
  const numbers = Object.fromEntries(Object.entries(draft).map(([key, value]) => [
    key, Number(value.trim() === "" ? CALCULATOR_FIELD_DEFAULTS[key as keyof CalculatorDraft] ?? value : value),
  ]));
  const ignored = new Set(["targetPt", ...(!challenge ? ["currentCp", "cpPt", "measuredCp", "cpCost"] : [])]);
  for (const [key, value] of Object.entries(numbers)) {
    if (ignored.has(key)) continue;
    if (draft[key as keyof CalculatorDraft].trim() === "" && CALCULATOR_FIELD_DEFAULTS[key as keyof CalculatorDraft] === undefined) return null;
    if (!Number.isFinite(value) || value < 0) return null;
    if (key !== "minutesPerGame" && !Number.isSafeInteger(value)) return null;
  }
  if (numbers.flamePt <= 0 || numbers.minutesPerGame <= 0) return null;
  if (![0, ...FLAME_COSTS].includes(numbers.measuredFlames) || !FLAME_COSTS.includes(numbers.flameCost as FlameCost)) return null;
  if (challenge && (
    !Number.isSafeInteger(numbers.currentCp) || numbers.currentCp < 0
    || !Number.isSafeInteger(numbers.cpPt) || numbers.cpPt <= 0
    || !CP_COSTS.includes(numbers.measuredCp as CpCost) || !CP_COSTS.includes(numbers.cpCost as CpCost)
  )) return null;
  const targetPt = draft.targetPt.trim() === "" ? null : numbers.targetPt;
  if (targetPt !== null && (!Number.isSafeInteger(targetPt) || targetPt < 0)) return null;
  return { ...numbers, challenge, targetPt, currentCp: challenge ? numbers.currentCp : 0,
    ...(!challenge ? { cpPt: 0, measuredCp: 200, cpCost: 200 } : {}),
  } as EventPtInput;
}

export function getCalculatorBaselineAt(startAt: number, endAt: number, now: number): number {
  return now >= startAt && now < endAt ? now : startAt;
}

export function getNaturalFlames(startAt: number, endAt: number, baselineAt: number): number {
  return Math.floor(Math.max(0, endAt - Math.max(startAt, baselineAt)) / (30 * 60_000));
}

export function getPlayDurationParts(minutes: number) {
  const tenths = Math.round(minutes * 10);
  return [
    { unit: "durationDays" as const, count: Math.floor(tenths / 14_400) },
    { unit: "durationHours" as const, count: Math.floor(tenths % 14_400 / 600) },
    { unit: "durationMinutes" as const, count: tenths % 600 / 10 },
  ].filter(part => part.count > 0 || (tenths === 0 && part.unit === "durationMinutes"));
}

export type EventPtPlan = {
  normalGames: number;
  challengeGames: number;
  totalGames: number;
  minutes: number;
  finalPt: number;
  spentFlames: number;
  spentDrinkFlames: number;
  remainingDrinkFlames: number;
  remainingFlames: number;
  remainingCp: number;
  missingFlames: number;
};

export function calculateEventPt(input: EventPtInput, naturalFlames: number, remainingMs: number) {
  const millisecondsPerGame = Math.round(input.minutesPerGame * 60_000);
  if (!Number.isSafeInteger(millisecondsPerGame) || millisecondsPerGame <= 0) return null;
  const flameMultiplier = (cost: 0 | FlameCost) => getEventPointMultiplier({ eventType: "challenge", liveType: "multi", liveBoostCount: cost });
  const cpMultiplier = (cost: CpCost) => getEventPointMultiplier({ eventType: "challenge", liveType: "challenge", challengeCpCost: cost });
  const normalPt = Math.floor(input.flamePt * flameMultiplier(input.flameCost) / flameMultiplier(input.measuredFlames));
  const challengePt = input.challenge ? Math.floor(input.cpPt * cpMultiplier(input.cpCost) / cpMultiplier(input.measuredCp)) : 0;
  if (normalPt <= 0 || (input.challenge && challengePt <= 0)) return null;
  const cpPerGame = input.challenge ? Math.floor(normalPt / 20) : 0;
  const initialCp = input.challenge ? input.currentCp : 0;
  const drinkFlames = input.smallDrinks + input.largeDrinks * 10;
  const recoveredFlames = Math.max(0, naturalFlames - input.wastedFlames);
  const storedFlames = input.storedFlames + drinkFlames;
  const availableFlames = storedFlames + recoveredFlames;
  const availableChallenges = (normalGames: number) => input.challenge
    ? Math.floor((initialCp + normalGames * cpPerGame) / input.cpCost) : 0;
  const score = (normalGames: number, challengeGames = availableChallenges(normalGames)) =>
    input.currentPt + normalGames * normalPt + challengeGames * challengePt;
  const plan = (normalGames: number, challengeGames: number): EventPtPlan => {
    const spentFlames = normalGames * input.flameCost;
    const spentDrinkFlames = Math.min(drinkFlames, Math.max(0, spentFlames - input.storedFlames - recoveredFlames));
    return {
      normalGames, challengeGames, totalGames: normalGames + challengeGames,
      minutes: (normalGames + challengeGames) * input.minutesPerGame,
      finalPt: score(normalGames, challengeGames), spentFlames,
      spentDrinkFlames,
      remainingDrinkFlames: drinkFlames - spentDrinkFlames,
      remainingFlames: Math.max(0, availableFlames - spentFlames),
      remainingCp: initialCp + normalGames * cpPerGame - challengeGames * input.cpCost,
      missingFlames: Math.max(0, spentFlames - availableFlames),
    };
  };
  const maxGames = Math.floor(Math.max(0, remainingMs) / millisecondsPerGame);
  // Each challenge replaces one normal song and therefore also its CP income.
  const limitChallenges = input.challenge ? Math.min(maxGames,
    Math.floor((initialCp + maxGames * cpPerGame) / (input.cpCost + cpPerGame))) : 0;
  const limitNormals = maxGames - limitChallenges;
  const limitPt = score(limitNormals, limitChallenges);
  const budgetGames = Math.floor(availableFlames / input.flameCost);
  const budgetChallenges = availableChallenges(budgetGames);
  const budget = budgetGames + budgetChallenges > maxGames
    ? plan(limitNormals, limitChallenges) : plan(budgetGames, budgetChallenges);
  let target: EventPtPlan | null = null;
  if (input.targetPt !== null) {
    const goal = input.targetPt;
    let low = 0;
    let high = Math.max(0, Math.ceil((goal - input.currentPt) / normalPt));
    // Find the first ordinary game after which the CP-first sequence can reach the goal.
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (score(mid) >= goal) high = mid;
      else low = mid + 1;
    }
    const alreadyPlayedChallenges = low > 0 ? availableChallenges(low - 1) : 0;
    const neededChallenges = input.challenge ? Math.max(0, Math.ceil((goal - input.currentPt - low * normalPt) / challengePt)) : 0;
    target = plan(low, Math.max(alreadyPlayedChallenges, neededChallenges));
  }
  const timeExceeded = target !== null && target.totalGames > maxGames;
  const result = { storedFlames, availableFlames, normalPt, cpPerGame, challengePt, budget, target, maxGames, limitPt, timeExceeded };
  if (![storedFlames, availableFlames, maxGames, limitPt, budget.finalPt, budget.totalGames, target?.finalPt ?? 0, target?.totalGames ?? 0].every(Number.isSafeInteger)) return null;
  if (![budget.minutes, target?.minutes ?? 0].every(Number.isFinite)) return null;
  return result;
}

export type EventPtResult = NonNullable<ReturnType<typeof calculateEventPt>>;
export type EventPtProjection = { baselineAt: number; endAt: number; currentPt: number; finalPt: number; targetPt: number | null; limitPt: number | null };
