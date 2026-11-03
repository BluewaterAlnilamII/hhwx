import assert from "node:assert/strict";
import test from "node:test";
import { calculateEventPt, DEFAULT_CALCULATOR_DRAFT, getCalculatorBaselineAt, getNaturalFlames, getPlayDurationParts, parseCalculatorDraft } from "../src/app/[locale]/bandori/events/_tracker/event-pt-calculator.ts";

const remainingMs = 30 * 24 * 3_600_000;

const input = (overrides = {}) => ({
  challenge: true, currentPt: 200000, currentCp: 3400, storedFlames: 0, smallDrinks: 2, largeDrinks: 1,
  wastedFlames: 6, flamePt: 9000, cpPt: 48000, measuredFlames: 3, measuredCp: 1600,
  flameCost: 3, cpCost: 1600, minutesPerGame: 2.73, targetPt: null, ...overrides,
});

test("play duration uses days, hours and minutes without zero units or rounding overflow", () => {
  const cases = [
    [0, [["durationMinutes", 0]]],
    [2.73, [["durationMinutes", 2.7]]],
    [327, [["durationHours", 5], ["durationMinutes", 27]]],
    [327.6, [["durationHours", 5], ["durationMinutes", 27.6]]],
    [59.99, [["durationHours", 1]]],
    [1439.99, [["durationDays", 1]]],
    [2947, [["durationDays", 2], ["durationHours", 1], ["durationMinutes", 7]]],
  ];
  for (const [minutes, expected] of cases) {
    assert.deepEqual(getPlayDurationParts(minutes).map(({ unit, count }) => [unit, count]), expected);
  }
});

test("calculator uses the event start outside its window, and the frozen current time while active", () => {
  const start = 1_000_000;
  const end = start + 48 * 3_600_000;
  for (const now of [start - 1, start, end, end + 1]) {
    const baseline = getCalculatorBaselineAt(start, end, now);
    assert.equal(baseline, start);
    assert.equal(end - baseline, 48 * 3_600_000);
    assert.equal(getNaturalFlames(start, end, baseline), 96);
  }
  const active = start + 12 * 3_600_000;
  assert.equal(getCalculatorBaselineAt(start, end, active), active);
  assert.equal(getNaturalFlames(start, end, getCalculatorBaselineAt(start, end, active)), 72);
  assert.equal(getCalculatorBaselineAt(start, end, end - 1), end - 1);
});

test("natural recovery uses complete 30-minute intervals, within the event window", () => {
  const start = 1_000_000;
  const end = start + 48 * 3_600_000;
  assert.equal(getNaturalFlames(start, end, start), 96);
  assert.equal(getNaturalFlames(start, end, end - 1_800_000), 1);
  assert.equal(getNaturalFlames(start, end, end - 1_799_999), 0);
  assert.equal(getNaturalFlames(start, end, end + 1), 0);
  assert.equal(getNaturalFlames(start, end, start - 1), 96);
  const result = calculateEventPt(input(), 90, remainingMs);
  assert.equal(result.storedFlames, 12);
  assert.equal(result.availableFlames, 96);
  assert.equal(calculateEventPt(input({ wastedFlames: 999 }), 90, remainingMs).availableFlames, 12);
});

test("measured and planned tiers convert independently, including 0 boost and 1600 CP", () => {
  for (const [measuredFlames, multiplier] of [1, 5, 10, 15].entries()) {
    for (const flameCost of [1, 2, 3]) {
      for (const measuredCp of [200, 400, 800, 1600]) {
        for (const cpCost of [200, 400, 800, 1600]) {
          const result = calculateEventPt(input({ measuredFlames, flamePt: 600 * multiplier, flameCost, measuredCp, cpPt: 6000 * measuredCp / 200, cpCost }), 0, remainingMs);
          assert.equal(result.normalPt, 600 * flameCost * 5);
          assert.equal(result.challengePt, 6000 * cpCost / 200);
        }
      }
    }
  }
});

test("CP is floored for each normal live, and unused tier remainders stay in the budget", () => {
  const result = calculateEventPt(input({ currentPt: 0, currentCp: 0, flamePt: 9015, storedFlames: 7, smallDrinks: 0, largeDrinks: 0, wastedFlames: 0 }), 0, remainingMs);
  assert.equal(result.cpPerGame, 450);
  assert.equal(result.budget.normalGames, 2);
  assert.equal(result.budget.challengeGames, 0);
  assert.equal(result.budget.remainingCp, 900);
  assert.equal(result.budget.remainingFlames, 1);
  assert.equal(result.budget.finalPt, 18030);
});

test("CP comes first, even when a normal live alone would meet the goal in fewer games", () => {
  const config = input({ currentPt: 0, currentCp: 1600, cpPt: 100, flamePt: 1000, targetPt: 1000 });
  const result = calculateEventPt(config, 0, remainingMs);
  assert.equal(result.target.normalGames, 1);
  assert.equal(result.target.challengeGames, 1);
  assert.equal(result.target.finalPt, 1100);
  const cpOnly = calculateEventPt({ ...config, targetPt: 100 }, 0, remainingMs).target;
  assert.equal(cpOnly.spentFlames, 0);
  assert.equal(cpOnly.totalGames, 1);
  assert.equal(calculateEventPt({ ...config, currentPt: 1000 }, 0, remainingMs).target.totalGames, 0);
});

test("reachable Pt uses the full resource budget independently of target costs", () => {
  const config = input({ currentPt: 0, currentCp: 0, flamePt: 10000, cpPt: 90000,
    smallDrinks: 50, largeDrinks: 0, wastedFlames: 0, targetPt: 6500000 });
  const result = calculateEventPt(config, 447, remainingMs);
  assert.equal(result.budget.finalPt, 6240000);
  assert.equal(result.target.finalPt, 6500000);
  assert.equal(result.target.spentFlames, 519);
  assert.equal(result.target.spentDrinkFlames, 50);
  assert.equal(result.target.missingFlames, 22);
  const enough = calculateEventPt({ ...config, storedFlames: 22 }, 447, remainingMs);
  assert.equal(enough.budget.finalPt, 6590000);
  assert.equal(enough.target.finalPt, 6500000);
  assert.equal(enough.target.missingFlames, 0);
  assert.equal(enough.target.spentDrinkFlames, 50);
  const noTarget = calculateEventPt({ ...config, targetPt: null }, 447, remainingMs);
  assert.equal(noTarget.budget.finalPt, 6240000);
  assert.equal(noTarget.budget.spentDrinkFlames, 48);
  for (const targetPt of [0, 6000000, 6500000]) {
    assert.deepEqual(calculateEventPt({ ...config, targetPt }, 447, remainingMs).budget, noTarget.budget);
  }
  const lowerTarget = calculateEventPt({ ...config, targetPt: 6000000 }, 447, remainingMs).target;
  assert.equal(lowerTarget.finalPt, 6000000);
  assert.equal(lowerTarget.spentFlames, 477);
  assert.equal(lowerTarget.remainingFlames, 20);
});

test("remaining boost flames exclude current flames and natural recovery", () => {
  const config = input({ currentPt: 0, currentCp: 0, storedFlames: 25, smallDrinks: 50,
    largeDrinks: 5, flamePt: 10000, cpPt: 80000, wastedFlames: 0, targetPt: 2200000 });
  const untouched = calculateEventPt(config, 447, remainingMs).target;
  assert.equal(untouched.spentFlames, 192);
  assert.equal(untouched.remainingFlames, 380);
  assert.equal(untouched.spentDrinkFlames, 0);
  assert.equal(untouched.remainingDrinkFlames, 100);
  const partial = calculateEventPt({ ...config, targetPt: 6000000 }, 447, remainingMs).target;
  assert.equal(partial.spentDrinkFlames, 47);
  assert.equal(partial.remainingDrinkFlames, 53);
  const insufficient = calculateEventPt({ ...config, targetPt: 9200000 }, 447, remainingMs).target;
  assert.equal(insufficient.spentDrinkFlames, 100);
  assert.equal(insufficient.remainingDrinkFlames, 0);
  assert.equal(insufficient.missingFlames, 220);
  const reached = calculateEventPt({ ...config, currentPt: 2200000 }, 447, remainingMs).target;
  assert.equal(reached.spentDrinkFlames, 0);
  assert.equal(reached.remainingDrinkFlames, 100);
  const noBoosts = calculateEventPt({ ...config, smallDrinks: 0, largeDrinks: 0 }, 447, remainingMs).target;
  assert.equal(noBoosts.remainingDrinkFlames, 0);
});

test("current and recovered boosts cover consumption before equivalent drink boosts", () => {
  const config = input({ challenge: false, currentPt: 0, flamePt: 1000, storedFlames: 1,
    smallDrinks: 1, largeDrinks: 1, wastedFlames: 2, targetPt: 2000 });
  const free = calculateEventPt(config, 7, remainingMs);
  assert.equal(free.target.spentDrinkFlames, 0);
  assert.equal(free.target.finalPt, 2000);
  assert.equal(free.budget.finalPt, 5000);
  const partial = calculateEventPt({ ...config, targetPt: 3500 }, 7, remainingMs);
  assert.equal(partial.target.spentDrinkFlames, 6);
  assert.equal(partial.target.remainingFlames, 5);
  assert.equal(partial.target.finalPt, 4000);
  assert.equal(partial.budget.finalPt, 5000);
  assert.equal(calculateEventPt({ ...config, wastedFlames: 99 }, 7, remainingMs).target.spentDrinkFlames, 5);
  assert.equal(calculateEventPt({ ...config, currentPt: 2000 }, 7, remainingMs).target.spentDrinkFlames, 0);
  assert.equal(calculateEventPt(input({ targetPt: 248000, currentCp: 1600 }), 0, remainingMs).target.spentDrinkFlames, 0);
});

// Independent, literal play order checks the closed-form/binary-search calculation.
function simulate(config, natural, target, maxGames = 10000) {
  const normalPt = Math.floor(config.flamePt * [1, 5, 10, 15][config.flameCost] / [1, 5, 10, 15][config.measuredFlames]);
  const challengePt = Math.floor(config.cpPt * config.cpCost / config.measuredCp);
  let pt = config.currentPt, cp = config.challenge ? config.currentCp : 0, normal = 0, challenge = 0;
  const available = config.storedFlames + config.smallDrinks + config.largeDrinks * 10 + Math.max(0, natural - config.wastedFlames);
  for (let guard = 0; guard < maxGames; guard++) {
    if (target !== null && pt >= target) break;
    if (config.challenge && cp >= config.cpCost) {
      cp -= config.cpCost;
      pt += challengePt;
      challenge++;
    } else {
      if (target === null && (normal + 1) * config.flameCost > available) break;
      normal++;
      pt += normalPt;
      if (config.challenge) cp += Math.floor(normalPt / 20);
    }
  }
  return { pt, cp, normal, challenge, spent: normal * config.flameCost, available };
}

test("budget and target results match CP-first play across stocks, tiers and overshoots", () => {
  for (let i = 0; i < 400; i++) {
    const config = input({
      challenge: i % 5 !== 0, currentPt: i % 17 * 60, currentCp: i % 31 * 113,
      storedFlames: i % 29, smallDrinks: i % 7, largeDrinks: i % 3, wastedFlames: i % 13,
      flamePt: 601 + i % 19 * 41, cpPt: 100 + i % 23 * 167,
      measuredFlames: i % 4, measuredCp: [200, 400, 800, 1600][i % 4],
      flameCost: 1 + i % 3, cpCost: [1600, 800, 400, 200][i % 4], targetPt: i % 37 * 999,
    });
    const result = calculateEventPt(config, 42, remainingMs);
    for (const [plan, goal] of [[result.budget, null], [result.target, config.targetPt]]) {
      const expected = simulate(config, 42, goal);
      assert.deepEqual([plan.finalPt, plan.remainingCp, plan.normalGames, plan.challengeGames, plan.spentFlames], [expected.pt, expected.cp, expected.normal, expected.challenge, expected.spent], `case ${i}, target ${goal}`);
      assert.equal(plan.remainingFlames, Math.max(0, expected.available - expected.spent));
      assert.equal(plan.missingFlames, Math.max(0, expected.spent - expected.available));
      assert.equal(plan.minutes, (expected.normal + expected.challenge) * 2.73);
      const freeFlames = Math.min(plan.spentFlames, config.storedFlames + Math.max(0, 42 - config.wastedFlames));
      assert.equal(freeFlames + plan.spentDrinkFlames + plan.missingFlames, plan.spentFlames);
      assert.ok(plan.spentDrinkFlames >= 0 && plan.spentDrinkFlames <= config.smallDrinks + 10 * config.largeDrinks);
      assert.equal(plan.remainingDrinkFlames + plan.spentDrinkFlames, config.smallDrinks + 10 * config.largeDrinks);
    }
  }
});

test("blank resource and time fields use defaults without filling the draft or optional target", () => {
  const draft = { ...DEFAULT_CALCULATOR_DRAFT, flamePt: "9000", cpPt: "48000" };
  const explicitZero = { ...draft, currentPt: "0", currentCp: "0", storedFlames: "0", smallDrinks: "0", largeDrinks: "0", wastedFlames: "0", minutesPerGame: "2.73" };
  const parsed = parseCalculatorDraft(draft, true);
  assert.deepEqual(parsed, parseCalculatorDraft(explicitZero, true));
  assert.equal(parsed.targetPt, null);
  for (const key of ["currentPt", "currentCp", "storedFlames", "smallDrinks", "largeDrinks", "wastedFlames"]) {
    assert.equal(draft[key], "");
    assert.equal(parsed[key], 0);
  }
  assert.equal(draft.minutesPerGame, "");
  assert.equal(parsed.minutesPerGame, 2.73);
  assert.equal(parseCalculatorDraft({ ...draft, minutesPerGame: "3.5" }, true).minutesPerGame, 3.5);
  assert.deepEqual(calculateEventPt(parsed, 90, remainingMs), calculateEventPt(parseCalculatorDraft(explicitZero, true), 90, remainingMs));
  assert.equal(parseCalculatorDraft({ ...draft, storedFlames: "25", smallDrinks: "50" }, true).storedFlames, 25);
});

test("partial/invalid drafts do not create results; blank target and non-challenge mode work", () => {
  const draft = { ...DEFAULT_CALCULATOR_DRAFT, flamePt: "9000", cpPt: "48000" };
  assert.ok(parseCalculatorDraft(draft, true));
  assert.equal(parseCalculatorDraft(draft, true).targetPt, null);
  for (const patch of [{ flamePt: "" }, { storedFlames: "-1" }, { smallDrinks: "1.5" }, { targetPt: "NaN" }, { cpCost: "600" }, { flameCost: "0" }, { minutesPerGame: "0" }, { currentPt: "Infinity" }]) {
    assert.equal(parseCalculatorDraft({ ...draft, ...patch }, true), null);
  }
  assert.ok(parseCalculatorDraft({ ...draft, cpPt: "", currentCp: "" }, false));
});

test("large impossible goals retain the required plan without a loop per game", () => {
  const result = calculateEventPt(input({ targetPt: 1_000_000_000_000, minutesPerGame: 10000 }), 0, remainingMs);
  assert.ok(result.target.finalPt >= 1_000_000_000_000);
  assert.ok(result.target.missingFlames > 0);
  assert.ok(result.target.minutes > 1_000_000);
  assert.equal(result.timeExceeded, true);
});

test("time ceiling ignores flames, boosts and wasted recovery, while reachable Pt respects both limits", () => {
  const config = input({ currentPt: 0, currentCp: 0, flamePt: 10000, cpPt: 80000,
    storedFlames: 0, smallDrinks: 1000, largeDrinks: 0, wastedFlames: 0, targetPt: 200000000 });
  const time = 226 * 3_600_000;
  const result = calculateEventPt(config, 451, time);
  assert.equal(result.maxGames, 4967);
  assert.equal(result.limitPt, 132410000);
  assert.equal(result.budget.finalPt, 16830000);
  assert.equal(result.target.totalGames, 7502);
  assert.equal(result.timeExceeded, true);
  for (const patch of [{ storedFlames: 100000 }, { largeDrinks: 10000 }, { wastedFlames: 9999 }]) {
    assert.equal(calculateEventPt({ ...config, ...patch }, 451, time).limitPt, result.limitPt);
  }
  const rich = calculateEventPt({ ...config, smallDrinks: 100000, targetPt: null }, 451, time);
  assert.equal(rich.budget.finalPt, result.limitPt);
  assert.equal(rich.budget.totalGames, result.maxGames);
  assert.deepEqual([rich.budget.normalGames, rich.budget.challengeGames], [3785, 1182]);
  assert.equal(rich.timeExceeded, false);
  assert.ok(rich.budget.minutes <= time / 60000);
});

test("time ceiling and capped budget match literal CP-first play including CP-only starts and short tails", () => {
  for (let i = 0; i < 400; i++) {
    const config = input({ challenge: i % 5 !== 0, currentPt: i * 23, currentCp: i % 17 * 719,
      flamePt: 19 + i % 29 * 351, cpPt: 100 + i % 23 * 167,
      measuredFlames: i % 4, measuredCp: [200, 400, 800, 1600][i % 4],
      flameCost: 1 + i % 3, cpCost: [1600, 800, 400, 200][i % 4], targetPt: i * 499,
      storedFlames: i % 11, smallDrinks: i % 9, largeDrinks: i % 3, wastedFlames: i % 13 });
    const slots = i % 43;
    const time = (slots + 0.5) * config.minutesPerGame * 60000;
    const result = calculateEventPt(config, 12, time);
    const limit = simulate({ ...config, storedFlames: 10000 }, 12, null, slots);
    const budget = simulate(config, 12, null, slots);
    assert.equal(result.limitPt, limit.pt, `limit case ${i}`);
    assert.equal(result.maxGames, slots);
    assert.deepEqual([result.budget.finalPt, result.budget.normalGames, result.budget.challengeGames, result.budget.remainingCp],
      [budget.pt, budget.normal, budget.challenge, budget.cp], `budget case ${i}`);
    assert.equal(result.timeExceeded, config.targetPt > result.limitPt);
    assert.ok(result.budget.finalPt <= result.limitPt);
  }
});

test("time feasibility uses complete songs and exact timestamps, including exact fits", () => {
  for (const minutesPerGame of [0.07, 2.73, 3.33]) {
    const config = input({ challenge: false, currentPt: 100, flamePt: 1000,
      storedFlames: 99, targetPt: 1100, minutesPerGame });
    const time = Math.round(minutesPerGame * 60000);
    const exact = calculateEventPt(config, 0, time);
    assert.equal(exact.maxGames, 1);
    assert.equal(exact.timeExceeded, false);
    assert.equal(exact.limitPt, 1100);
    for (const short of [time - 1, 0, -1]) {
      const result = calculateEventPt(config, 0, short);
      assert.equal(result.maxGames, 0);
      assert.equal(result.timeExceeded, true);
      assert.equal(result.limitPt, 100);
      assert.equal(result.budget.totalGames, 0);
    }
    const reached = calculateEventPt({ ...config, targetPt: 100 }, 0, 0);
    assert.equal(reached.timeExceeded, false);
  }
});

test("decimal song durations preserve exact fits without granting a missing millisecond", () => {
  for (const [minutesPerGame, millisecondsPerGame] of [[1.07, 64200], [1.08, 64800], [2.14, 128400], [4.28, 256800]]) {
    for (const songs of [1, 100]) {
      const config = input({ challenge: false, currentPt: 0, flamePt: 10000,
        storedFlames: songs * 3, targetPt: songs * 10000, minutesPerGame });
      const remaining = songs * millisecondsPerGame;
      const exact = calculateEventPt(config, 0, remaining);
      assert.equal(exact.maxGames, songs);
      assert.equal(exact.limitPt, config.targetPt);
      assert.equal(exact.budget.finalPt, config.targetPt);
      assert.equal(exact.timeExceeded, false);
      const short = calculateEventPt(config, 0, remaining - 1);
      assert.equal(short.maxGames, songs - 1);
      assert.equal(short.limitPt, (songs - 1) * 10000);
      assert.equal(short.timeExceeded, true);
    }
  }
  assert.equal(calculateEventPt(input({ minutesPerGame: 0.000001 }), 0, remainingMs), null);
});
