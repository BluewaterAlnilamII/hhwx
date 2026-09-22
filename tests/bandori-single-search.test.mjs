import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSingleSearchInput } from "../src/lib/bandori/team-builder/single-source.ts";
import { normalizeSingleScoringChart, normalizeBestdoriScoringChart } from "../src/lib/bandori/medley-foundation/chart.ts";
import { calculateEventPointBeforeMultiplier, calculateChallengeLiveEventPointBase, createEventPointOptions } from "../src/lib/bandori/team-builder/core/events.ts";
import { getGameProfileCards, replaceGameProfileCards } from "../src/lib/user-game-profile-payload.ts";
import { initSync, runSingleSearchJson } from "../src/lib/bandori/medley-wasm/pkg/bandori_medley.js";
import { getBandoriPowerDisplayValue, getBandoriTotalPowerDisplayValue } from "../src/lib/bandori/power-display.ts";

initSync({ module: readFileSync(new URL("../src/lib/bandori/medley-wasm/pkg/bandori_medley_bg.wasm", import.meta.url)) });
const fixture = JSON.parse(readFileSync(new URL("./fixtures/bandori-medley-foundation-source-v1.json", import.meta.url), "utf8"));
function source(settings = {}) {
  return { ...structuredClone(fixture), song: fixture.songs[0], settings: { resultLimit: 1, ...settings } };
}
function run(input, stop = () => undefined, budget = 64 * 1024 * 1024, incumbent = () => {}) {
  return JSON.parse(runSingleSearchJson(JSON.stringify(input), budget, stop, incumbent, () => {}));
}
function small(settings = {}) {
  const { input } = buildSingleSearchInput(source(settings));
  input.cards = input.cards.slice(0, 6);
  input.pointBonusRates = input.pointBonusRates.slice(0, 6);
  input.supportPowers = input.supportPowers.slice(0, 6);
  return input;
}
function permutations(values) {
  return values.length ? values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest])) : [[]];
}
const formations = permutations([0, 1, 2, 3, 4]);
// Independent enumeration of the audited client's five remove/insert choices.
const orderCounts = new Map();
for (let path = 0; path < 1024; path++) {
  let choice = path;
  const order = [0, 1, 2, 3, 4];
  for (let i = 0; i < 5; i++, choice = Math.floor(choice / 4)) order.splice(choice % 4, 0, order.splice(i, 1)[0]);
  const key = order.join(",");
  orderCounts.set(key, (orderCounts.get(key) ?? 0) + 1);
}
const orders = [...orderCounts].map(([key, count]) => [key.split(",").map(Number), count]);
const formationIndexes = new Map(formations.map((formation, index) => [formation.join(","), index]));
const weightedRoomOrders = formations.map(formation => orders.map(([order, weight]) =>
  [formationIndexes.get(order.map(position => formation[position]).join(",")), weight]));

function multiplier(skill, count, p) {
  const b = skill.behavior;
  const weighted = (a, g) => (1.1 * p * a + 0.8 * (1 - p) * g) / (1.1 * p + 0.8 * (1 - p));
  switch (b.kind) {
    case "neutral": return 1;
    case "score": return 1 + (b.scoreUpPercent + (skill.isRateUpWithPerfect ? 0.5 * Math.min(count, 100) * p : 0)) / 100;
    case "score_on_perfect": return weighted(1 + b.scoreUpPercent / 100, 1);
    case "perfect_only": return weighted(1 + b.scoreUpPercent / 100, 0);
    case "great_or_worse_half": return weighted(1 + b.scoreUpPercent / 100, 0.5);
    case "continued_perfect": {
      const active = 1 + b.activeScoreUpPercent / 100, fallback = 1 + b.fallbackScoreUpPercent / 100;
      return fallback + p ** count * (active - fallback);
    }
    default: throw new Error(b.kind);
  }
}
function combo(n) {
  const ends = [20, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, Infinity];
  return [1, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.09, 1.1, 1.11][ends.findIndex(end => n <= end)];
}
function teamFacts(input, ids) {
  const cards = ids.map(i => input.cards[i]);
  const sameBand = cards.every(c => c.bandId === cards[0].bandId), sameAttribute = cards.every(c => c.attribute === cards[0].attribute);
  const context = sameBand ? (sameAttribute ? "sameBandAndAttribute" : "sameBand") : (sameAttribute ? "sameAttribute" : "mixed");
  const skills = cards.map(c => c.skillContexts[context]);
  assert.deepEqual(input.areaConfigurations, [{ selectedAreaItemIds: [] }], "this note oracle uses no area items; Rust enumerates area configurations separately");
  const powers = ids.map(leader => {
    const other = ids.filter(id => id !== leader);
    const ordered = [other[0], other[1], leader, other[2], other[3]].map(id => input.cards[id]);
    return ordered.reduce((sum, c) => sum + c.characterParameter.reduce((a, b) => a + b, 0), 0)
      + ordered.reduce((sum, c) => sum + c.eventParameter.reduce((a, b) => a + b, 0), 0);
  });
  return { skills, power: powers[2], powers };
}
function lex(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function peakVariant(variants) {
  return variants.toSorted((a, b) => b.maximum - a.maximum || b.count - a.count || b.average - a.average || lex(a.members, b.members) || lex(a.playerFormation ?? [], b.playerFormation ?? []))[0];
}
// Note-by-note oracle: no production window scorer, matching DP, or search bound.
function oracle(input, ids) {
  const { skills, power, powers } = teamFacts(input, ids);
  const p = input.perfectRate.numerator / 10 ** input.perfectRate.decimalScale;
  const coefficient = (3 + 0.03 * (input.song.playLevel - 5)) / input.song.notes.length;
  const bases = powers.map(power => input.song.notes.map((_, n) => Math.floor(((power * coefficient * combo(n + 1)) * (1.1 * p + 0.8 * (1 - p))) * (input.fever[n] ? 2 : 1))));
  const triggers = input.song.notes.flatMap((note, i) => note.isSkillTrigger ? [i] : []);
  const cached = new Map();
  const scoreOrder = (order, leader) => {
    const key = [...order, leader].join(",");
    if (cached.has(key)) return cached.get(key);
    const base = bases[leader];
    let score = base.reduce((a, b) => a + b, 0), previousEnd = -Infinity;
    [...order, leader].forEach((actor, w) => {
      const skill = skills[actor], trigger = triggers[w];
      const start = Math.max(input.song.notes[trigger].timeSeconds, previousEnd + 0.75);
      const end = start + skill.durationSeconds;
      let count = 0;
      for (let n = trigger + 1; n < base.length; n++) {
        const time = input.song.notes[n].timeSeconds;
        if (time >= start && time <= end) score += Math.floor(base[n] * multiplier(skill, ++count, p)) - base[n];
      }
      previousEnd = end;
    });
    cached.set(key, score);
    return score;
  };
  const variants = formations.map(formation => {
    const scores = orders.map(([o, weight]) => [scoreOrder(o.map(pos => formation[pos]), formation[2]), weight]);
    const maximum = Math.max(...scores.map(([score]) => score));
    return { members: formation.map(i => ids[i]), power: powers[formation[2]], average: scores.reduce((sum, [score, weight]) => sum + score * weight, 0) / 1024,
      maximum, minimum: Math.min(...scores.map(([score]) => score)), count: scores.filter(([score]) => score === maximum).reduce((sum, [, weight]) => sum + weight, 0) };
  });
  const expected = variants.toSorted((a, b) => b.average - a.average || lex(a.members, b.members))[0];
  const peak = peakVariant(variants);
  return { expected, peak, variants, power, scoreOrder: (order, leader) => scoreOrder(order.map(id => ids.indexOf(id)), ids.indexOf(leader)) };
}

// Score every room order note by note, independently of the WASM contribution matrices.
function cooperativeOracle(input, ids) {
  const { skills: own, power, powers } = teamFacts(input, ids);
  const p = input.perfectRate.numerator / 10 ** input.perfectRate.decimalScale;
  const judge = 1.1 * p + 0.8 * (1 - p), notes = input.song.notes;
  const coefficient = (3 + 0.03 * (input.song.playLevel - 5)) / notes.length;
  const triggers = notes.flatMap((note, i) => note.isSkillTrigger ? [i] : []);
  const variants = ids.flatMap((leader, index) => {
    const power = powers[index];
    const others = ids.filter(id => id !== leader);
    const members = [others[0], others[1], leader, others[2], others[3]];
    const skills = [own[index], ...input.otherSkills];
    const roomRates = [];
    const scores = formations.map(order => {
      let total = 0, roomRate = 0;
      const actors = [...order, input.encoreActor];
      let previousEnd = -Infinity;
      const starts = actors.map((actor, w) => {
        const start = Math.max(notes[triggers[w]].timeSeconds, previousEnd + 0.75);
        previousEnd = start + skills[actor].durationSeconds;
        return start;
      });
      const covered = Array(6).fill(0);
      notes.forEach((note, n) => {
        const alpha = coefficient * combo(n + 1) * judge * (input.fever[n] ? 2 : 1);
        const inner = Math.floor(((power * coefficient * combo(n + 1)) * judge) * (input.fever[n] ? 2 : 1));
        let score = inner, rate = alpha;
        actors.forEach((actor, w) => {
          const start = triggers[w], skill = skills[actor];
          if (n > start && note.timeSeconds >= starts[w] && note.timeSeconds <= starts[w] + skill.durationSeconds) {
            const m = multiplier(skill, ++covered[w], p);
            score += Math.floor(inner * m) - inner;
            rate += alpha * (m - 1);
          }
        });
        total += score;
        roomRate += rate;
      });
      roomRates.push(roomRate);
      return total;
    });
    return formations.map((playerFormation, f) => {
      const weighted = weightedRoomOrders[f];
      const average = weighted.reduce((sum, [order, weight]) => sum + scores[order] * weight, 0) / 1024;
      const roomRate = weighted.reduce((sum, [order, weight]) => sum + roomRates[order] * weight, 0) / 1024;
      const maximum = Math.max(...weighted.map(([order]) => scores[order]));
      return { members, playerFormation, power, average, maximum,
        minimum: Math.min(...weighted.map(([order]) => scores[order])),
        count: weighted.reduce((sum, [order, weight]) => sum + (scores[order] === maximum ? weight : 0), 0),
        roomScore: Math.floor(average + roomRate * input.otherPlayersPower + 1e-5), scores };
    });
  });
  return { variants, power, peak: peakVariant(variants) };
}

function combinations(values, count) {
  if (!count) return [[]];
  return values.flatMap((id, i) => combinations(values.slice(i + 1), count - 1).map(rest => [id, ...rest]));
}
function referenceSupport(input, ids) {
  if (!input.missionSupport) return { power: 0, ids: [] };
  const available = input.cards.filter(c => !c.isExcluded && !ids.includes(c.instanceId));
  const count = Math.min(5, new Set(available.map(c => c.characterId)).size);
  return combinations(available, count).filter(cards => new Set(cards.map(c => c.characterId)).size === count)
    .map(cards => ({ power: cards.reduce((sum, c) => sum + input.supportPowers[c.instanceId], 0), ids: cards.map(c => c.instanceId) }))
    .toSorted((a, b) => b.power - a.power || lex(a.ids, b.ids))[0];
}
function leaderStrength(skill) {
  const b = skill.behavior;
  return b.kind === "neutral" ? 0 : b.kind === "continued_perfect"
    ? Math.max(b.activeScoreUpPercent, b.fallbackScoreUpPercent)
    : b.scoreUpPercent + (skill.isRateUpWithPerfect ? 50 : 0);
}
function referenceSearch(input, settings) {
  const teams = combinations(input.cards.filter(c => !c.isExcluded), 5)
    .filter(cards => new Set(cards.map(c => c.characterId)).size === 5);
  const results = teams.flatMap(cards => {
    const ids = cards.map(c => c.instanceId);
    const scored = input.otherSkills ? cooperativeOracle(input, ids) : oracle(input, ids);
    const { skills } = teamFacts(input, ids);
    const bonus = Math.round(ids.reduce((sum, id) => sum + input.pointBonusRates[id], 0) * 100) / 100;
    const support = referenceSupport(input, ids);
    return scored.variants.filter(v => v.power >= input.minTotalPower
      && leaderStrength(skills[ids.indexOf(v.members[2])]) >= input.minLeaderScoreUpPercent).map(variant => {
      const points = settings.eventType === "challenge" && settings.liveType === "challenge"
        ? calculateChallengeLiveEventPointBase(variant.average, settings)
        : calculateEventPointBeforeMultiplier(variant.average, variant.roomScore ?? null, bonus, settings, support.power);
      return { ...variant, bonus, support, points,
        target: settings.target === "eventPoint" ? points ?? variant.average : variant.average };
    });
  });
  return results.toSorted((a, b) => b.target - a.target || b.average - a.average || b.power - a.power || lex(a.members, b.members) || lex(a.playerFormation ?? [], b.playerFormation ?? []))[0];
}

test("actual single WASM agrees with independent weighted formation and note enumeration", () => {
  assert.equal(orders.length, 96);
  const input = small();
  const kinds = ["score", "score_on_perfect", "continued_perfect", "perfect_only", "great_or_worse_half", "neutral"];
  input.song.notes = Array.from({ length: 721 }, (_, noteId) => ({ noteId, timeSeconds: Math.floor(noteId / 2) / 10, isSkillTrigger: [0, 118, 238, 358, 478, 598].includes(noteId) }));
  input.fever = input.song.notes.map((_, n) => n >= 450 && n <= 610);
  input.cards.forEach((card, i) => {
    for (const [c, skill] of Object.entries(card.skillContexts)) {
      skill.durationSeconds = 3.17 + i / 5;
      skill.behavior = kinds[i] === "neutral" ? { kind: "neutral" } : kinds[i] === "continued_perfect"
        ? { kind: kinds[i], activeScoreUpPercent: 155, fallbackScoreUpPercent: 70 }
        : { kind: kinds[i], scoreUpPercent: 100 + i * 9 + (c === "sameAttribute" ? 15 : 0) };
      skill.isRateUpWithPerfect = i === 0;
    }
  });
  for (const probability of [{ numerator: 0, decimalScale: 0 }, { numerator: 73, decimalScale: 2 }, { numerator: 1, decimalScale: 0 }]) {
    input.perfectRate = probability;
    const reference = input.cards.map((_, skipped) => oracle(input, input.cards.map(c => c.instanceId).filter(i => i !== skipped)));
    const bestScore = Math.max(...reference.map(r => r.expected.average));
    const result = run(input);
    assert.equal(result.outcome.status, "exact");
    const best = result.outcome.best, details = result.details[0];
    assert.equal(best.averageScore, bestScore);
    const { expected, peak, scoreOrder } = oracle(input, best.memberInstanceIds.toSorted((a, b) => a - b));
    assert.deepEqual(best.memberInstanceIds, expected.members);
    assert.equal(details.minimumScore, expected.minimum);
    assert.equal(details.maximumScore, peak.maximum);
    assert.deepEqual(details.peakMemberInstanceIds, peak.members);
    assert.equal(details.peakAverageScore, peak.average);
    assert.equal(details.maximumProbabilityNumerator, peak.count);
    assert.equal(details.currentMaximumProbabilityNumerator, expected.maximum === peak.maximum ? expected.count : 0);
    assert.equal(details.maximumProbabilityDenominator, 1024);
    assert.equal(scoreOrder(details.peakActivationOrder, details.peakMemberInstanceIds[2]), peak.maximum);
    assert.ok(orderCounts.has(details.peakActivationOrder.map(id => details.peakMemberInstanceIds.indexOf(id)).join(",")));
  }
});

test("single scheduling covers the wait boundary, equal durations, encore-only and recursive queues", () => {
  const cases = [
    { name: "exactly 0.75 seconds is sufficient", triggers: [0, 2, 4, 6, 8, 10], durations: [1.25, 1.25, 1.25, 1.25, 1.25] },
    { name: "equal durations shift every later activation", triggers: [0, 2, 4, 6, 8, 10], durations: [1.5, 1.5, 1.5, 1.5, 1.5] },
    { name: "only encore depends on the fifth actor", triggers: [0, 5, 10, 15, 20, 22], durations: [1, 1.25, 1.5, 2, 2.5] },
    { name: "different durations recursively shift early activations", triggers: [0, 2, 4, 6, 8, 10], durations: [0.25, 1.25, 1.5, 2, 2.5] },
    { name: "queued skills can start after the last scoring note", triggers: [0, 1, 2, 3, 4, 5], durations: [7, 8, 9, 10, 11] },
  ];
  for (const scenario of cases) for (const multi of [false, true]) {
    const input = small(multi ? { liveType: "multi", otherPlayersAveragePower: 360000,
      otherPlayerSkills: Array(4).fill({ skillId: 1, skillLevel: 1 }) } : {});
    input.cards.pop(); input.pointBonusRates.pop(); input.supportPowers.pop();
    const rows = scenario.triggers.map(timeSeconds => ({ timeSeconds, isSkillTrigger: true }));
    for (let timeSeconds = 0; timeSeconds <= 27; timeSeconds += 0.25) {
      rows.push({ timeSeconds, isSkillTrigger: false }, { timeSeconds, isSkillTrigger: false });
      if (timeSeconds === 2.25 || timeSeconds === 3.75) rows.push({ timeSeconds: timeSeconds + 0.000001, isSkillTrigger: false });
    }
    rows.sort((a, b) => a.timeSeconds - b.timeSeconds || Number(b.isSkillTrigger) - Number(a.isSkillTrigger));
    input.song.notes = rows.map((row, noteId) => ({ ...row, noteId })); input.fever = rows.map((_, n) => n > 40 && n < 90);
    input.perfectRate = { numerator: 73, decimalScale: 2 };
    input.cards.forEach((card, i) => Object.values(card.skillContexts).forEach(skill => {
      skill.durationSeconds = scenario.durations[i];
      skill.behavior = i === 4 ? { kind: "neutral" } : i === 1
        ? { kind: "continued_perfect", activeScoreUpPercent: 140, fallbackScoreUpPercent: 50 }
        : { kind: "score", scoreUpPercent: 80 + i * 11 };
      skill.isRateUpWithPerfect = i === 0;
    }));
    if (multi) input.otherSkills = input.cards.slice(1).map(c => c.skillContexts.mixed);
    for (const encore of multi ? [0, 1, 2, 3, 4] : [0]) {
      input.encoreActor = encore;
      const reference = referenceSearch(input, { eventType: "none", target: "score" });
      const { outcome, details: [detail] } = run(input);
      assert.equal(outcome.status, "exact", scenario.name);
      assert.equal(outcome.best.averageScore, reference.average, scenario.name);
      assert.deepEqual(outcome.best.memberInstanceIds, reference.members, scenario.name);
      assert.deepEqual(outcome.best.playerFormation, reference.playerFormation ?? null, scenario.name);
      if (multi) assert.equal(outcome.best.roomScore, reference.roomScore, scenario.name);
      const peak = (multi ? cooperativeOracle : oracle)(input, [0, 1, 2, 3, 4]).peak;
      assert.equal(detail.maximumScore, peak.maximum, scenario.name);
      assert.equal(detail.maximumProbabilityNumerator, peak.count, scenario.name);
      assert.equal(detail.currentMaximumProbabilityNumerator, reference.maximum === peak.maximum ? reference.count : 0, scenario.name);
      assert.deepEqual(detail.peakMemberInstanceIds, peak.members, scenario.name);
      assert.deepEqual(detail.peakPlayerFormation, peak.playerFormation ?? null, scenario.name);
      assert.equal(detail.peakAverageScore, peak.average, scenario.name);
    }
  }
});

test("current formation probability targets the team's maximum, not its own lower peak", () => {
  const input = small(); input.cards.pop(); input.pointBonusRates.pop(); input.supportPowers.pop();
  input.song.notes = Array.from({ length: 121 }, (_, noteId) => ({ noteId, timeSeconds: noteId / 4,
    isSkillTrigger: noteId < 120 && noteId % 20 === 0 }));
  input.fever = input.song.notes.map(() => false);
  input.perfectRate = { numerator: 73, decimalScale: 2 };
  const skills = [[0.25, 35], [7.75, 184], [7, 189], [1.25, 177], [3.75, 202]];
  input.cards.forEach((card, i) => Object.values(card.skillContexts).forEach(skill => {
    skill.durationSeconds = skills[i][0]; skill.behavior = { kind: "score", scoreUpPercent: skills[i][1] };
    skill.isRateUpWithPerfect = false;
  }));
  const { expected, peak } = oracle(input, [0, 1, 2, 3, 4]);
  assert.ok(expected.maximum < peak.maximum);
  assert.ok(expected.count > 0, "the lower local peak has nonzero probability");
  const { outcome, details: [detail] } = run(input);
  assert.deepEqual(outcome.best.memberInstanceIds, expected.members);
  assert.equal(detail.maximumScore, peak.maximum);
  assert.equal(detail.maximumProbabilityNumerator, peak.count);
  assert.equal(detail.currentMaximumProbabilityNumerator, 0);
});

test("single chart uses medley timing, includes simultaneous notes, and keeps Fever as metadata", () => {
  const chart = [{ type: "BPM", beat: 0, bpm: 120 }, ...Array.from({ length: 6 }, (_, i) => ({ type: "Single", beat: i * 10, skill: true })),
    { type: "Single", beat: 0 }, { type: "Single", beat: 2 }, { type: "Single", beat: 2.000001 },
    { type: "System", beat: 0, data: "cmd_fever_start.wav" }, { type: "System", beat: 2, data: "cmd_fever_end.wav" }];
  const { notes, fever } = normalizeSingleScoringChart(chart, true);
  assert.deepEqual(notes, normalizeBestdoriScoringChart(chart));
  assert.deepEqual(notes.slice(0, 4).map(n => n.timeSeconds), [0, 0, 1, 1.0000005]);
  assert.deepEqual(fever.slice(0, 4), [true, true, true, false]);
  const input = small(); input.cards = input.cards.slice(0, 5); input.pointBonusRates.pop(); input.supportPowers.pop();
  input.song.notes = notes; input.fever = fever;
  for (const card of input.cards) for (const skill of Object.values(card.skillContexts)) { skill.durationSeconds = 1; skill.behavior = { kind: "score", scoreUpPercent: 100 }; }
  assert.equal(run(input).outcome.best.averageScore, oracle(input, [0, 1, 2, 3, 4]).expected.average);
});

test("cooperative expected and peak formations, room scores and tied probabilities match all room orders", () => {
  const input = small({ liveType: "multi", otherPlayersAveragePower: 380000,
    otherPlayerSkills: Array(4).fill({ skillId: 1, skillLevel: 1 }) });
  input.otherSkills.forEach((skill, i) => {
    skill.durationSeconds = 2.4 + i;
    skill.behavior = { kind: ["score", "perfect_only", "great_or_worse_half", "score_on_perfect"][i], scoreUpPercent: 70 + 11 * i };
  });
  input.perfectRate = { numerator: 73, decimalScale: 2 };
  for (const c of input.cards) for (const skill of Object.values(c.skillContexts)) {
    skill.durationSeconds = 0.8 + c.instanceId * 0.7;
    skill.behavior = { kind: "score", scoreUpPercent: 220 - c.instanceId * 25 };
  }
  for (const encore of [0, 1, 2, 3, 4]) {
    input.encoreActor = encore;
    const { outcome, details: [detail] } = run(input);
    const best = outcome.best;
    const reference = referenceSearch(input, { eventType: "none", target: "score" });
    assert.equal(outcome.status, "exact");
    assert.equal(best.averageScore, reference.average);
    assert.deepEqual(best.memberInstanceIds, reference.members);
    assert.deepEqual(best.playerFormation, reference.playerFormation);
    assert.equal(best.roomScore, reference.roomScore);
    const { peak } = cooperativeOracle(input, best.memberInstanceIds.toSorted((a, b) => a - b));
    assert.equal(detail.minimumScore, reference.minimum);
    assert.equal(detail.maximumScore, peak.maximum);
    assert.deepEqual(detail.peakMemberInstanceIds, peak.members);
    assert.deepEqual(detail.peakPlayerFormation, peak.playerFormation);
    assert.equal(detail.peakAverageScore, peak.average);
    assert.equal(detail.maximumProbabilityNumerator, peak.count);
    assert.equal(detail.currentMaximumProbabilityNumerator, reference.maximum === peak.maximum ? reference.count : 0);
    assert.equal(detail.maximumProbabilityDenominator, 1024);
    assert.equal(peak.scores[formations.findIndex(order => lex(order, detail.peakActivationOrder) === 0)], peak.maximum);
    assert.ok(orderCounts.has(detail.peakActivationOrder.map(actor => detail.peakPlayerFormation.indexOf(actor)).join(",")));
    assert.ok(reference.average > reference.scores.reduce((sum, score) => sum + score, 0) / 120,
      "optimized room positions must improve on the old uniform mean for these distinct skills");
  }
  // Identical skills make every random order a maximum, including ties across leaders.
  const identical = input.cards[0].skillContexts.mixed;
  input.cards.forEach(c => { for (const key of Object.keys(c.skillContexts)) c.skillContexts[key] = structuredClone(identical); });
  input.otherSkills = Array.from({ length: 4 }, () => structuredClone(identical));
  const tied = run(input).details[0];
  assert.equal(tied.maximumProbabilityNumerator, 1024);
  assert.equal(tied.currentMaximumProbabilityNumerator, 1024);
  assert.deepEqual(tied.peakMemberInstanceIds, [0, 1, 2, 3, 4]);
  assert.deepEqual(tied.peakPlayerFormation, [0, 1, 2, 3, 4]);
});

// Explicit page-legal combinations; festival intentionally uses the self-team versus live type.
const legalModes = Object.entries({ none: ["free", "multi"], story: ["free", "multi"], challenge: ["free", "multi", "challenge"],
  versus: ["versus"], live_try: ["free", "multi"], mission_live: ["free", "multi"], festival: ["versus"] })
  .flatMap(([eventType, lives]) => lives.map(liveType => ({ eventType, liveType })));

function eventSource(settings) {
  const s = source(settings);
  s.profilePayload = replaceGameProfileCards(s.profilePayload, getGameProfileCards(s.profilePayload).slice(0, 6));
  s.perfectRatePercentText = "97";
  for (let id = 1; id <= 6; id++) {
    const card = s.cardsById[id];
    card.attribute = id <= 4 ? "powerful" : "cool";
    card.stat[1] = { performance: 27000 + id * 3000, technique: 27000 + id * 3000, visual: 27000 + id * 3000 };
    s.skillsById[id].duration.fill(0.7 + id * 0.4);
    s.skillsById[id].activationEffect.activateEffectTypes.score.activateEffectValue = 180 - id * 15;
  }
  s.eventBonus = settings.eventType === "none" ? null : {
    attributes: [{ attribute: "powerful", percent: 30 }], characters: [{ characterId: 1, percent: 20 }, { characterId: 6, percent: 20 }],
    members: [{ situationId: 2, percent: 15 }], limitBreaks: [{ rarity: 1, rank: 0, percent: 10 }],
    parameterPercent: 50, pointPercent: 25, performancePercent: 40, techniquePercent: 10, visualPercent: 0,
  };
  s.song = { ...s.song, chart: [{ type: "BPM", beat: 0, bpm: 120 }, ...Array.from({ length: 61 }, (_, beat) => (
    beat < 60 && beat % 10 === 0 ? { type: "Single", beat, skill: true } : { type: "Single", beat }
  )), { type: "System", beat: 20, data: "cmd_fever_start.wav" }, { type: "System", beat: 42, data: "cmd_fever_end.wav" }] };
  return s;
}

// Independent cumulative-tier reference for the retained Pt display contract.
function tieredPoints(score, divisor, ends) {
  let previous = 0;
  return Math.floor(ends.reduce((sum, end, i) => {
    const part = Math.max(0, Math.min(score, end) - previous);
    previous = end;
    return sum + Math.floor(part / divisor / (i + 1) * 100);
  }, 0) / 100);
}
function assertPointOptions(score, base, settings) {
  const actual = createEventPointOptions(score, base, settings);
  const expected = [];
  const add = (key, eventPointBase, multiplier, extra) => expected.push({ key, ...extra, eventPointBase, multiplier, eventPoint: eventPointBase * multiplier });
  const { eventType, eventFormula, liveType } = settings;
  let mode = "none", defaultKey = null;
  if (eventType === "challenge" && liveType === "challenge") {
    mode = "challengeCp"; defaultKey = `cp-${settings.challengeCpCost}`;
    const point = eventFormula === 2 ? 3250 + Math.floor(score / 450)
      : 1000 + tieredPoints(score, 300, [2100000, 2250000, 2500000, Infinity]);
    [200, 400, 800, 1600].forEach((challengeCpCost, i) => add(`cp-${challengeCpCost}`, point, 2 ** i, { challengeCpCost }));
  } else if (eventType === "versus" || eventType === "festival") {
    mode = eventType;
    defaultKey = `liveBoost-${settings.liveBoostCount}-${eventType === "festival" ? "win-" : ""}rank-1`;
    [1, 5, 10, 15].forEach((multiplier, liveBoostCount) => {
      for (const festivalResult of eventType === "festival" ? ["win", "lose"] : [null]) for (const placement of [1, 2, 3, 4, 5]) {
        const modern = eventFormula === 2, festival = eventType === "festival";
        const scorePart = modern ? Math.floor(score / 6500) : tieredPoints(score, 5500, festival ? [2625000, 2812500, 3125000, Infinity] : [2100000, 2250000, 2500000, Infinity]);
        const ranks = festival ? (modern ? [125, 117, 110, 105, 100] : [50, 47, 44, 42, 40]) : (modern ? [200, 173, 146, 123, 100] : [60, 52, 44, 37, 30]);
        const point = scorePart + ranks[placement - 1] + (festival ? (modern ? 50 : 20) + (festivalResult === "win" ? (modern ? 125 : 50) : 0) : 0);
        add(`liveBoost-${liveBoostCount}-${festival ? `${festivalResult}-` : ""}rank-${placement}`, point, multiplier,
          { liveBoostCount, ...(festival ? { festivalResult } : {}), placement });
      }
    });
  } else if (base !== null) {
    mode = "liveBoost"; defaultKey = `liveBoost-${settings.liveBoostCount}`;
    [1, 5, 10, 15].forEach((multiplier, liveBoostCount) => add(`liveBoost-${liveBoostCount}`, base, multiplier, { liveBoostCount }));
  }
  assert.deepEqual(actual, { mode, defaultKey, options: expected });
}

test("all 13 legal event/live modes and both targets match exhaustive search for formulas 0/1/2", () => {
  assert.equal(legalModes.length, 13);
  let cases = 0, targetChanges = 0;
  for (const mode of legalModes) for (const eventFormula of [0, 1, 2]) {
    const winners = [];
    for (const target of ["score", "eventPoint"]) {
      const settings = { ...mode, eventFormula, target, liveBoostCount: 2, challengeCpCost: 800,
        otherPlayersAveragePower: 350000, otherPlayerSkills: Array.from({ length: 4 }, (_, i) => ({ skillId: i + 1, skillLevel: 1 })) };
      const s = eventSource(settings), { input } = buildSingleSearchInput(s);
      const parameterMode = ["versus", "festival"].includes(mode.eventType) || mode.liveType === "challenge";
      const pointMode = mode.eventType !== "none" && !parameterMode;
      const additive = [0.6, 0.55, 0.4, 0.4, 0.1, 0.3];
      const pointRates = [0.85, 0.55, 0.4, 0.4, 0.1, 0.3];
      for (const [i, card] of input.cards.entries()) {
        const raw = 30000 + i * 3000;
        assert.deepEqual(card.characterParameter, [raw, raw, raw]);
        const base = additive[i] + (i === 0 ? 0.5 : 0);
        const rates = i === 0 ? [base + 0.4, base + 0.1, base] : [base, base, base];
        rates.forEach((rate, axis) => assert.ok(Math.abs(card.eventParameter[axis] - (parameterMode ? raw * rate : 0)) < 1e-8));
        assert.ok(Math.abs(input.pointBonusRates[i] - (pointMode ? pointRates[i] : 0)) < 1e-12);
        assert.ok(Math.abs(input.supportPowers[i] - raw * 3 * (1 + (mode.eventType === "none" ? 0 : additive[i]))) < 1e-8);
      }
      assert.equal(input.otherSkills !== null, mode.liveType === "multi");
      assert.deepEqual(input.fever, input.song.notes.map(n => (mode.liveType === "multi" || mode.eventType === "festival") && n.noteId >= 20 && n.noteId <= 42));
      assert.equal(input.missionSupport, mode.eventType === "mission_live" && target === "eventPoint");
      const reference = referenceSearch(input, settings), { outcome, details } = run(input);
      const best = outcome.best, label = `${mode.eventType}/${mode.liveType}/${eventFormula}/${target}`;
      assert.equal(outcome.status, "exact", label);
      assert.equal(best.targetValue, reference.target, label);
      assert.equal(best.averageScore, reference.average, label);
      assert.equal(best.totalPower, reference.power, label);
      assert.deepEqual(best.memberInstanceIds, reference.members, label);
      assert.deepEqual(best.playerFormation, reference.playerFormation ?? null, label);
      assert.equal(best.roomScore, reference.roomScore ?? null, label);
      assert.equal(best.eventPointBase, reference.points, label);
      assert.equal(best.supportPower, reference.support.power, label);
      assert.deepEqual(best.supportInstanceIds.toSorted((a, b) => a - b), reference.support.ids, label);
      assert.equal(details[0].maximumProbabilityDenominator, 1024, label);
      assertPointOptions(best.averageScore, best.eventPointBase, settings);
      winners.push(best.memberInstanceIds.toSorted((a, b) => a - b).join(","));
      cases++;
    }
    if (winners[0] !== winners[1]) targetChanges++;
  }
  assert.equal(cases, 78);
  assert.ok(targetChanges > 0, "the matrix must exercise a real score versus Pt team tradeoff");
});

test("external skill conditions are independent and strictly validated", () => {
  const s = source({ liveType: "multi", otherPlayerSkills: Array.from({ length: 4 }, () => ({ skillId: 1, skillLevel: 1 })) });
  const effect = s.skillsById[1].activationEffect;
  effect.unificationActivateConditionBandId = 1; effect.unificationActivateEffectValue = [190, null, null, null];
  const baseline = buildSingleSearchInput(s).input.otherSkills[0];
  s.settings.otherPlayerSkills[0].conditionSatisfied = true;
  assert.equal(buildSingleSearchInput(s).input.otherSkills[0].behavior.scoreUpPercent, 190);
  assert.notEqual(baseline.behavior.scoreUpPercent, 190);
  assert.deepEqual(buildSingleSearchInput(s).input.otherSkills[1], baseline);
  effect.unificationActivateConditionType = "powerful";
  assert.equal(buildSingleSearchInput(s).input.otherSkills[0].behavior.scoreUpPercent, 190);
  s.settings.otherPlayerSkills[0].conditionSatisfied = "true"; assert.throws(() => buildSingleSearchInput(s), /expected a boolean/);
  s.settings.otherPlayerSkills[0].conditionSatisfied = true;
  s.settings.otherPlayerSkills.pop(); assert.throws(() => buildSingleSearchInput(s), /four external/);
});

test("Pt options retain every boost, CP, rank and result across score thresholds", () => {
  const boundaries = [1600000, 1750000, 2000000, 2100000, 2250000, 2500000, 2625000, 2812500, 3125000];
  for (const score of [0, ...boundaries.flatMap(value => [value - 0.25, value, value + 0.25])]) {
    for (const eventFormula of [0, 1, 2]) for (const eventType of ["none", "story", "challenge", "versus", "festival"]) {
      assertPointOptions(score, eventType === "story" ? 237 : null,
        { eventType, eventFormula, liveType: eventType === "challenge" ? "challenge" : ["versus", "festival"].includes(eventType) ? "versus" : "free", liveBoostCount: 2, challengeCpCost: 800 });
    }
  }
});

test("mission Pt jointly selects the main team and five remaining distinct-character supports", () => {
  const settings = { eventType: "mission_live", liveType: "multi", eventFormula: 0, target: "eventPoint",
    otherPlayersAveragePower: 1000000, otherPlayerSkills: Array(4).fill({ skillId: 1, skillLevel: 1 }) };
  const input = small(settings), template = structuredClone(input.cards[0]);
  input.cards = Array.from({ length: 11 }, (_, i) => {
    const c = structuredClone(template);
    c.instanceId = i; c.masterCardId = i + 1; c.characterId = i === 10 ? 6 : i % 5 + 1;
    c.isExcluded = i === 10;
    c.characterParameter = [i === 10 ? 9000000 : i < 5 ? 110000 : 100000, 0, 0]; c.eventParameter = [0, 0, 0];
    for (const skill of Object.values(c.skillContexts)) { skill.behavior = { kind: "neutral" }; skill.isRateUpWithPerfect = false; }
    return c;
  });
  input.pointBonusRates = input.cards.map(() => 0);
  input.supportPowers = input.cards.map(c => c.characterParameter[0]);
  input.otherSkills = Array.from({ length: 4 }, () => structuredClone(input.cards[0].skillContexts.mixed));
  input.perfectRate = { numerator: 1, decimalScale: 0 };
  const verify = () => {
    const expected = referenceSearch(input, settings), { outcome } = run(input), best = outcome.best;
    assert.equal(outcome.status, "exact");
    assert.equal(best.targetValue, expected.target);
    assert.deepEqual(best.memberInstanceIds, expected.members);
    assert.equal(best.supportPower, expected.support.power);
    assert.deepEqual(best.supportInstanceIds.toSorted((a, b) => a - b), expected.support.ids);
    assert.ok(!best.memberInstanceIds.includes(10) && !best.supportInstanceIds.includes(10));
    return best;
  };
  const pt = verify();
  assert.deepEqual(pt.memberInstanceIds, [5, 6, 7, 8, 9]);
  assert.deepEqual(pt.supportInstanceIds, [0, 1, 2, 3, 4]);
  assert.equal(new Set(pt.supportInstanceIds.map(id => input.cards[id].characterId)).size, 5);
  input.target = "score"; input.missionSupport = false;
  const score = run(input).outcome.best;
  assert.deepEqual(score.memberInstanceIds, [0, 1, 2, 3, 4]);
  assert.ok(score.averageScore > pt.averageScore);
  const scoreSupports = referenceSupport({ ...input, missionSupport: true }, score.memberInstanceIds);
  assert.ok(pt.eventPointBase > calculateEventPointBeforeMultiplier(score.averageScore, score.roomScore, 0, settings, scoreSupports.power));
  input.target = "event_point"; input.missionSupport = true;
  input.minTotalPower = 530000;
  const constrained = verify();
  assert.ok(constrained.totalPower >= 530000);
  input.minTotalPower = 0;
  input.cards[5].isExcluded = true;
  const excluded = verify();
  assert.ok(!excluded.memberInstanceIds.includes(5) && !excluded.supportInstanceIds.includes(5));
  assert.equal(excluded.supportInstanceIds.length, 4);
});

test("power display preserves fractional scoring inputs and native display conversion boundaries", () => {
  assert.equal(getBandoriPowerDisplayValue(396739.59), 396739);
  assert.equal(getBandoriPowerDisplayValue(300.999999), 301);
  const powers = [100.5, 200.5, 300.5];
  assert.deepEqual(powers.map(getBandoriPowerDisplayValue), [100, 200, 300]);
  assert.equal(getBandoriTotalPowerDisplayValue(powers), 601);
  assert.deepEqual(powers, [100.5, 200.5, 300.5]);
  assert.equal(getBandoriTotalPowerDisplayValue([100.499999, 200.499999, 300]), 601);
  assert.equal(getBandoriTotalPowerDisplayValue([100.5, 200.5, Math.fround(300.99997)]), 602);
});

test("single WASM rejects obsolete parameter and fixed-window rules before search", () => {
  const input = small();
  assert.equal(input.scoringRulesVersion, "hhwx-single-medley-foundation-v4");
  for (const scoringRulesVersion of ["hhwx-single-medley-foundation-v1", "hhwx-single-medley-foundation-v2", "hhwx-single-medley-foundation-v3", "unsupported"]) {
    assert.throws(() => run({ ...input, scoringRulesVersion }), /unsupported single-song input or scoring version/);
  }
});

test("single WASM reports interruptions and rejects malformed data without false exact", () => {
  const input = small();
  for (const reason of ["cancelled", "timed_out", "memory_exhausted"]) {
    const r = run(input, () => reason, reason === "memory_exhausted" ? 0 : undefined);
    assert.equal(r.outcome.status, "incomplete"); assert.equal(r.outcome.reason, reason);
    assert.equal(r.outcome.bestSoFar, null);
  }
  const large = buildSingleSearchInput(source()).input;
  let improved = false;
  const r = run(large, () => improved ? "timed_out" : undefined, undefined, () => { improved = true; });
  assert.equal(r.outcome.status, "incomplete"); assert.ok(r.outcome.bestSoFar); assert.ok(r.details.length);
  for (const constraint of ["minLeaderScoreUpPercent", "minTotalPower"]) {
    const impossible = structuredClone(input); impossible[constraint] = 1e12;
    const result = run(impossible);
    assert.equal(result.outcome.status, "exact"); assert.equal(result.outcome.best, null);
    assert.equal(result.outcome.diagnostics.evaluatedTeams, 0);
  }
  input.cards.forEach(c => { c.isExcluded = true; });
  assert.equal(run(input).outcome.best, null);
  assert.throws(() => buildSingleSearchInput(source({ target: "maximum" })), /unsupported single-song/);
  input.fever.pop(); assert.throws(() => run(input), /parallel arrays/);
  assert.throws(() => buildSingleSearchInput(source({ otherPlayersAveragePower: true, liveType: "multi", otherPlayerSkills: Array(4).fill({ skillId: 1, skillLevel: 1 }) })), /expected a number/);
});

test("constrained WASM winners match exhaustive rosters, leaders and weighted formations", () => {
  let state = 0x4b1d2026;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  let feasible = 0, infeasible = 0;
  for (let seed = 0; seed < 8; seed++) for (const multi of [false, true]) {
    const settings = { eventType: seed % 2 ? "mission_live" : "story", liveType: multi ? "multi" : "free",
      eventFormula: seed % 3, otherPlayersAveragePower: 380000,
      otherPlayerSkills: Array(4).fill({ skillId: 1, skillLevel: 1 }) };
    const input = small(settings);
    input.cards.push({ ...structuredClone(input.cards[0]), instanceId: 6, masterCardId: 10001 });
    const triggers = seed % 4 === 0 ? [0, 5, 10, 15, 20, 25] : seed % 4 === 1 ? [0, 2, 4, 6, 8, 10]
      : seed % 4 === 2 ? [0, 5, 10, 15, 20, 21] : [0, 1, 2, 3, 4, 5];
    const rows = triggers.map(timeSeconds => ({ timeSeconds, isSkillTrigger: true }));
    for (let quarter = 0; quarter <= 128; quarter++) rows.push({ timeSeconds: quarter / 4, isSkillTrigger: false });
    rows.sort((a, b) => a.timeSeconds - b.timeSeconds || Number(b.isSkillTrigger) - Number(a.isSkillTrigger));
    input.song.notes = rows.map((row, noteId) => ({ ...row, noteId }));
    input.fever = rows.map((_, i) => multi && i >= 35 && i <= 95);
    input.perfectRate = [{ numerator: 0, decimalScale: 0 }, { numerator: 1, decimalScale: 2 },
      { numerator: 73, decimalScale: 2 }, { numerator: 1, decimalScale: 0 }][seed % 4];
    const kinds = ["score", "score_on_perfect", "perfect_only", "continued_perfect", "great_or_worse_half", "neutral"];
    input.cards.forEach((card, i) => {
      card.characterId = i === 6 ? 1 : i + 1;
      card.bandId = seed % 4 === 1 || seed % 4 === 3 ? 1 : (card.characterId % 2) + 1;
      card.attribute = seed % 4 >= 2 ? "powerful" : card.characterId % 2 ? "powerful" : "cool";
      card.isExcluded = seed === 5 && i === 5;
      card.characterParameter = [20000 + Math.floor(random() * 50000), 19000.375 + random(), 13000.625 + random()];
      card.eventParameter = [random() * 8000, random() * 6000, 0];
      Object.values(card.skillContexts).forEach((skill, context) => {
        const kind = kinds[(i + seed) % kinds.length];
        skill.durationSeconds = seed % 4 === 0 ? 0.25 + i / 4 : seed % 4 === 1 ? 2 : 0.75 + i / 4;
        skill.behavior = kind === "neutral" ? { kind } : kind === "continued_perfect"
          ? { kind, activeScoreUpPercent: 70 + context * 20 + i * 7, fallbackScoreUpPercent: 125 - i * 8 }
          : { kind, scoreUpPercent: 55 + context * 15 + i * 13 };
        skill.isRateUpWithPerfect = kind === "score" && i % 2 === 0;
      });
    });
    input.pointBonusRates = input.cards.map((_, i) => [0, 0.03125, 0.03499, 0.035, 0.1, 0.2, 0.81][(i + seed) % 7]);
    input.supportPowers = input.cards.map((_, i) => 150000 + i * 17000 + random());
    if (multi) input.otherSkills = input.cards.slice(1, 5).map(c => structuredClone(c.skillContexts.mixed));
    input.encoreActor = multi ? seed % 5 : 0;
    input.minLeaderScoreUpPercent = seed === 7 ? 1000 : seed % 3 === 0 ? 0 : 120;
    const firstPower = teamFacts(input, [0, 1, 2, 3, 4]).power;
    input.minTotalPower = seed % 3 === 0 ? 0 : firstPower + (seed % 3 === 1 ? 0 : 1e-8);
    for (const target of ["score", "eventPoint"]) {
      settings.target = target;
      input.target = target === "score" ? "score" : "event_point";
      input.missionSupport = settings.eventType === "mission_live" && target === "eventPoint";
      const expected = referenceSearch(input, settings), label = `seed=${seed} multi=${multi} target=${target}`;
      for (const resultLimit of [1, 5]) {
        const { outcome, details } = run({ ...input, resultLimit });
        assert.equal(outcome.status, "exact", label);
        if (!expected) { assert.equal(outcome.best, null, label); assert.equal(details.length, 0, label); continue; }
        const best = outcome.best;
        assert.equal(best.targetValue, expected.target, label);
        assert.equal(best.averageScore, expected.average, label);
        assert.equal(best.totalPower, expected.power, label);
        assert.equal(best.roomScore, expected.roomScore ?? null, label);
        assert.deepEqual(best.memberInstanceIds, expected.members, label);
        assert.deepEqual(best.playerFormation, expected.playerFormation ?? null, label);
        assert.equal(best.supportPower, expected.support.power, label);
        assert.deepEqual(best.supportInstanceIds.toSorted((a, b) => a - b), expected.support.ids, label);
      }
      if (expected) feasible++; else infeasible++;
    }
  }
  assert.ok(feasible > 0 && infeasible > 0, "cover both feasible and proved-infeasible requests");
});

test("arithmetic failure in auxiliary Pt cannot become an exact score result", () => {
  const input = small();
  input.eventRule = { kind: "normal", base: 50, divisor: 1e-320, formula: 2 };
  for (const target of ["score", "event_point"]) {
    const { outcome, details } = run({ ...input, target });
    assert.equal(outcome.status, "incomplete", target);
    assert.equal(outcome.reason, "arithmetic_overflow", target);
    assert.equal(outcome.bestSoFar, null, target);
    assert.equal(details.length, 0, target);
  }
});

test("finite extreme inputs either score safely or report incomplete arithmetic", () => {
  const mutations = [
    input => { input.cards.forEach(c => { c.characterParameter = [1e308, 0, 0]; }); },
    input => { input.cards.forEach(c => Object.values(c.skillContexts).forEach(s => {
      s.behavior = { kind: "score", scoreUpPercent: 1e308 }; s.isRateUpWithPerfect = false;
    })); },
    input => { input.cards.forEach(c => Object.values(c.skillContexts).forEach(s => { s.durationSeconds = Number.MAX_VALUE; })); },
    input => { input.otherSkills = Array(4).fill(input.cards[0].skillContexts.mixed); input.otherPlayersPower = 1e308; },
    input => { input.pointBonusRates.fill(1e308); },
  ];
  mutations.forEach((mutate, i) => {
    const input = small(); mutate(input);
    const { outcome } = run(input);
    assert.equal(outcome.status, "incomplete", `extreme mutation ${i}`);
    assert.equal(outcome.reason, "arithmetic_overflow", `extreme mutation ${i}`);
  });
  const tiny = small();
  tiny.cards.forEach(c => { c.characterParameter = [Number.MIN_VALUE, 0, 0]; c.eventParameter = [0, 0, 0]; });
  const { outcome, details } = run(tiny);
  assert.equal(outcome.status, "exact");
  assert.equal(outcome.best.averageScore, 0);
  assert.equal(details[0].maximumProbabilityNumerator, 1024);

  // Impossible contexts may make a relaxed bound unsafe, but must not delete
  // valid mixed-band candidates or prevent their exact evaluation.
  const mixed = small();
  mixed.cards.forEach((card, i) => { card.bandId = i + 1; });
  const baseline = run(mixed).outcome.best;
  mixed.cards.forEach(card => {
    card.skillContexts.sameBand.behavior = { kind: "score", scoreUpPercent: 1e308 };
    card.skillContexts.sameBand.isRateUpWithPerfect = false;
  });
  const unsafe = run(mixed).outcome;
  assert.equal(unsafe.status, "exact");
  assert.deepEqual(unsafe.best, baseline);
  assert.ok(unsafe.diagnostics.unknownBounds > 0);
});

test("malformed normalized inputs fail closed before any exact result", () => {
  const mutations = [
    input => { input.perfectRate = { numerator: 0, decimalScale: 1 }; },
    input => { input.perfectRate = { numerator: 101, decimalScale: 2 }; },
    input => { input.cards[1].instanceId = 0; },
    input => { input.cards[1].masterCardId = input.cards[0].masterCardId; },
    input => { input.cards[0].characterParameter[1] = -1; },
    input => { input.cards[0].isExcluded = "false"; },
    input => { input.cards[0].skillContexts.sameBand.durationSeconds += 1; },
    input => { input.cards[0].skillContexts.mixed.skillLevel = 0; },
    input => { input.cards[0].skillContexts.mixed.behavior = { kind: "score", scoreUpPercent: -1 }; },
    input => { input.cards[0].skillContexts.mixed.behavior = { kind: "neutral" }; input.cards[0].skillContexts.mixed.isRateUpWithPerfect = true; },
    input => { input.song.slot = 1; },
    input => { input.song.notes[1].noteId = 0; },
    input => { input.song.notes[1].timeSeconds = -1; },
    input => { input.song.notes.find(n => n.isSkillTrigger).isSkillTrigger = false; },
    input => { input.song.notes.push({ ...input.song.notes[0], noteId: input.song.notes.length }); },
    input => { input.fever.pop(); },
    input => { input.pointBonusRates.pop(); },
    input => { input.supportPowers[0] = -1; },
    input => { input.pointBonusRates[0] = null; },
    input => { input.areaConfigurations[0].selectedAreaItemIds = [999999]; },
    input => { input.areaConfigurations = []; },
    input => { input.resultLimit = 0; },
    input => { input.resultLimit = 51; },
    input => { input.encoreActor = 5; },
    input => { input.otherPlayersPower = 1; },
    input => { input.otherSkills = Array(3).fill(input.cards[0].skillContexts.mixed); },
    input => { input.eventRule = { kind: "normal", base: 50, divisor: 0, formula: 2 }; },
    input => { input.eventRule = { kind: "normal", base: 50, divisor: 1300, formula: 3 }; },
    input => { input.minLeaderScoreUpPercent = -1; },
    input => { input.minTotalPower = -1; },
    input => { input.target = "maximum"; },
    input => { input.unrecognizedField = true; },
  ];
  mutations.forEach((mutate, i) => {
    const input = small(); mutate(input);
    assert.throws(() => run(input), undefined, `invalid mutation ${i}`);
  });
});
