// Real-chart scoring only. Main measures throughput; original Bestdori measures accuracy.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { buildFixedMedleyEvaluationInput } from "../src/lib/bandori/medley-foundation/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: {
  main: { type: "string" },
  archive: { type: "string", default: join(root, "temp/medley-regression-fixtures") },
  teams: { type: "string", default: "2026-08-31T01-34-50.319Z" },
} });
assert(values.main, "pass --main <clean main worktree>");
const mainRoot = resolve(values.main);
const archive = resolve(values.archive);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const measuredSources = [
  [root, "crates/bandori-medley-search/src/exact_score.rs"],
  [mainRoot, "src/lib/bandori/team-builder/core/scoring.ts"],
  [mainRoot, "src/lib/bandori/team-builder/core/chart.ts"],
].map(([cwd, path]) => ({ implementation: cwd === root ? "greenfield" : "main", path, sha256: hash(readFileSync(join(cwd, path))) }));
assert.equal(git(mainRoot, ["diff", "HEAD", "--", "src/lib/bandori/team-builder/core", "src/lib/bandori-team-calculator.ts"]), "");
assert.equal(git(mainRoot, ["rev-parse", "HEAD"]), git(mainRoot, ["rev-parse", "main"]));
const mainScoring = await import(pathToFileURL(join(mainRoot, "src/lib/bandori/team-builder/core/scoring.ts")).href);
const mainEvaluation = await import(pathToFileURL(join(mainRoot, "src/lib/bandori/team-builder/core/team-evaluation.ts")).href);

const manifest = readJson(join(archive, "manifest.json"));
const snapshot = manifest.dataSnapshots.find((entry) => entry.id === "main");
const usedFiles = new Map();
function readArchived(path) {
  const bytes = readFileSync(join(archive, path));
  const sha256 = hash(bytes);
  assert.equal(sha256, manifest.files.find((file) => file.path === path)?.sha256, path);
  usedFiles.set(path, { path, sha256 });
  return JSON.parse(bytes.toString("utf8"));
}
const asset = (name) => readArchived(snapshot.assets.find((entry) => entry.name === name).path);
const source = {
  schemaVersion: "hhwx-medley-foundation-source-v1",
  cardsById: asset("cards-all-5.json"), charactersById: asset("characters-main-3.json"),
  skillsById: asset("skills-all-10.json"), areaItemsById: asset("areaItems-main-5.json"),
  songsById: asset("songs-all-7.json"), eventBonus: null, perfectRatePercentText: "100",
};
const cases = [];
for (const count of [119, 961]) {
  const profile = manifest.profiles.find((entry) => entry.aliases.includes(`sample-${count}`));
  const oldInput = readJson(join(archive, "runs", values.teams, `${count}-no-event.input.json`));
  const selected = readJson(join(archive, "runs", values.teams, `${count}-no-event.result.json`)).native.outcome.bestSoFar;
  const base = {
    ...source, profilePayload: readArchived(profile.path), selectedAreaItemIds: selected.selectedAreaItemIds,
    songs: oldInput.songs.map((song) => ({ songIdText: String(song.songId), difficulty: song.difficulty, chart: asset(`chart-${song.songId}-${song.difficulty}.json`) })),
    teams: selected.teams.map((team) => ({ memberCardIds: team.memberInstanceIds.map((id) => oldInput.cards[id].masterCardId) })),
  };
  const variants = [{ name: "retained", input: base, slots: [0, 1, 2] }];
  if (count === 961) {
    // Owned real cards, unchanged levels/effects; only make two legal test teams.
    for (const [name, position, cardId] of [["overlap-8s", 4, 10037], ["rate-up", 0, 1347]]) {
      const input = structuredClone(base);
      input.teams[2].memberCardIds[position] = cardId;
      variants.push({ name, input, slots: [2] });
    }
  }
  for (const variant of variants) {
    const { scoringInput: input } = buildFixedMedleyEvaluationInput(variant.input);
    for (const slot of variant.slots) {
      const team = input.teams[slot];
      const song = input.songs[slot];
      const carry = input.songs.slice(0, slot).reduce((sum, item) => sum + item.notes.length, 0);
      for (const startCombo of new Set([0, carry])) {
        for (const perfectRate of [1, 0.95]) {
          cases.push({
            label: `${count}/${song.songId}/${variant.name}/p${perfectRate}/combo${startCombo}`,
            song, skills: team.memberInstanceIds.map((id) => input.cards[id].skill),
            deckTotalParameter: team.deckTotalParameter, perfectRate, startCombo,
            masterCardIds: variant.input.teams[slot].memberCardIds,
          });
        }
      }
    }
  }
}

const runDirectory = join(root, "temp/medley-score-benchmark", new Date().toISOString().replaceAll(":", "-"));
mkdirSync(runDirectory, { recursive: true });
const save = (name, value) => writeFileSync(join(runDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
const bestdoriUrl = "https://bestdori.com/js/app.d390adb1.js";
const bundle = await (await fetch(bestdoriUrl)).text();
assert.equal(hash(bundle), "ac84605d7889e53c0144ab7c41e379c174b94b8dc31edae07f3483b8a0610778");
// Extract only the five audited functions, never execute the application bundle.
function extractFunction(name, from) {
  const start = bundle.indexOf(`function ${name}(`, from);
  assert(start >= 0, `missing original ${name}`);
  let end = bundle.indexOf("{", start), depth = 1;
  while (depth) { end += 1; if (bundle[end] === "{") depth += 1; if (bundle[end] === "}") depth -= 1; }
  return { source: bundle.slice(start, end + 1), end };
}
let cursor = bundle.indexOf("function st(t,e,n,o,i){if(t.activationEffect");
assert(cursor >= 0);
const functions = ["st", "mt", "ut", "lt", "ct"].map((name) => {
  const extracted = extractFunction(name, cursor);
  cursor = extracted.end;
  return extracted.source;
}).join("\n");
writeFileSync(join(runDirectory, "bestdori-functions.js"), functions);
const bestdori = new Function(`${functions}; return {st, ut, ct};`)();

function effectRows(skill) {
  const value = skill.behavior;
  const row = (type, percent, condition = "none") => [type, { activateEffectValue: [percent], activateCondition: condition }];
  let rows;
  switch (value.kind) {
    case "neutral": rows = []; break;
    case "score": rows = [row("score", value.scoreUpPercent)]; break;
    case "score_on_perfect": rows = [row("score", value.scoreUpPercent, "perfect")]; break;
    case "continued_perfect": rows = [row("score_continued_note_judge", value.activeScoreUpPercent, "perfect"), row("score", value.fallbackScoreUpPercent)]; break;
    case "great_or_worse_half": rows = [row("score_under_great_half", value.scoreUpPercent)]; break;
    default: throw new Error(`not supported by original Bestdori: ${value.kind}`);
  }
  if (skill.isRateUpWithPerfect) rows.push(row("score_rate_up_with_perfect", 0));
  return rows;
}
const permutations = (items) => items.length === 0 ? [[]] : items.flatMap((item, i) => (
  permutations(items.filter((_, j) => j !== i)).map((tail) => [item, ...tail])
));
const orders = permutations([0, 1, 2, 3, 4]);
function medleyCombo(combo) {
  if (combo <= 20) return 1;
  if (combo <= 50) return 1.01;
  if (combo <= 100) return 1.02;
  if (combo <= 300) return 1.01 + Math.floor((combo - 1) / 50) * 0.01;
  return combo <= 3000 ? 1.04 + Math.floor((combo - 1) / 100) * 0.01 : 1.34;
}
function compareBestdori(testCase) {
  const { song, skills, perfectRate: p, deckTotalParameter: power, startCombo } = testCase;
  const masters = Object.fromEntries(skills.map((skill, member) => [member + 1, {
    duration: [skill.durationSeconds], activationEffect: { activateEffectTypes: Object.fromEntries(effectRows(skill)) },
  }]));
  const notes = song.notes.map((note) => ({ time: note.timeSeconds, skill: note.isSkillTrigger, fever: false }));
  const originalScores = skills.map((_, leader) => bestdori.ct(
    masters, 0, [leader, ...skills.map((_, i) => i).filter((i) => i !== leader)].map((i) => i + 1),
    [0, 0, 0, 0, 0], notes, song.playLevel, p, false, power,
  ).avgScore);
  const triggers = notes.flatMap((note, i) => note.skill ? [i] : []);
  const judge = 1.1 * p + 0.8 * (1 - p);
  const coefficient = (3 + 0.03 * (song.playLevel - 5)) / notes.length;
  const base = notes.map((_, i) => Math.floor((power * coefficient * medleyCombo(startCombo + i + 1)) * judge));
  const multipliers = triggers.map((trigger) => skills.map((skill, member) => notes.map((note, i) => (
    i > trigger && note.time <= notes[trigger].time + skill.durationSeconds
      ? bestdori.st(masters[member + 1], 0, p, judge, i - trigger) : 1
  ))));
  const overlappingNotes = notes.flatMap((_, i) => {
    const active = triggers.filter((trigger) => i > trigger && notes[i].time <= notes[trigger].time + Math.max(...skills.map((skill) => skill.durationSeconds))).length;
    return active > 1 ? [i] : [];
  });
  const independentScores = [], jointScores = [];
  for (let leader = 0; leader < 5; leader += 1) {
    let independentSum = 0, jointSum = 0;
    for (const order of orders) {
      for (let i = 0; i < notes.length; i += 1) {
        let score = base[i], combined = 1;
        for (let slot = 0; slot < 6; slot += 1) {
          const multiplier = multipliers[slot][slot === 5 ? leader : order[slot]][i];
          score += Math.floor(base[i] * multiplier) - base[i];
          combined += multiplier - 1;
        }
        independentSum += score;
        jointSum += Math.floor(base[i] * Math.max(0, combined));
      }
    }
    independentScores.push(independentSum / 120);
    jointScores.push(jointSum / 120);
  }
  const hasOrdinaryCombo = base.every((_, i) => medleyCombo(startCombo + i + 1) === bestdori.ut(i));
  return { originalScores, independentScores, jointScores, overlappingNotes, directlyComparable: hasOrdinaryCombo && overlappingNotes.length === 0 };
}
function timeMain(testCase) {
  const { song, perfectRate, startCombo, deckTotalParameter } = testCase;
  const chart = {
    notes: song.notes.map((note) => ({ beat: 0, time: note.timeSeconds, skill: note.isSkillTrigger, fever: false })),
    notesCount: song.notes.length, playLevel: song.playLevel,
    skillStartNotes: song.notes.flatMap((note, index) => note.isSkillTrigger ? [index + 1] : []),
    skillTriggerTimes: song.notes.filter((note) => note.isSkillTrigger).map((note) => note.timeSeconds),
  };
  const skills = testCase.skills.map((skill) => ({
    durationSeconds: skill.durationSeconds, hasRateUpWithPerfect: skill.isRateUpWithPerfect, cacheKey: JSON.stringify(skill),
    scoreEffects: effectRows(skill).map(([type, row]) => ({ type, valuePercent: row.activateEffectValue[0], condition: row.activateCondition, conditionLife: null, isUnifiedValue: false })),
  }));
  const cache = mainEvaluation.createScoreCalculationCache();
  // Keep chart and skill-formula preparation; do not time a memoized answer.
  delete cache.baseScoresByChart;
  delete cache.skillWindowContributionsByChart;
  const combo = { startCombo, useMedleyCombo: true };
  const score = () => mainScoring.calculateBestScoreForNonOverlappingSkillWindowsTargetOnly(chart, deckTotalParameter, skills, perfectRate, cache, combo).averageScore;
  let checksum = 0;
  for (let i = 0; i < 2000; i += 1) checksum += score();
  const samplesNs = [];
  for (let round = 0; round < 7; round += 1) {
    const start = performance.now();
    for (let i = 0; i < 10000; i += 1) checksum += score();
    samplesNs.push((performance.now() - start) * 1e6 / 10000);
  }
  samplesNs.sort((a, b) => a - b);
  assert(Number.isFinite(checksum));
  return { medianNs: samplesNs[3], samplesNs };
}

save("input.json", cases);
console.log(`Retaining real-chart scoring measurements in ${runDirectory}`);
const nativeRun = spawnSync("cargo", ["test", "--release", "--locked", "-p", "bandori-medley-search", "--lib", "benchmark_real_song_scores", "--", "--ignored", "--nocapture"], {
  cwd: root, env: { ...process.env, HHWX_MEDLEY_SCORE_BENCHMARK_INPUT: join(runDirectory, "input.json") },
  encoding: "utf8", windowsHide: true,
});
writeFileSync(join(runDirectory, "native.log"), nativeRun.stdout + nativeRun.stderr);
assert.equal(nativeRun.status, 0, nativeRun.stderr);
const nativeRows = nativeRun.stdout.split(/\r?\n/u).filter((line) => line.startsWith("MEDLEY_SCORE_BENCH:")).map((line) => JSON.parse(line.slice("MEDLEY_SCORE_BENCH:".length)));
assert.equal(nativeRows.length, cases.length);
const rows = cases.map((testCase, i) => {
  const native = nativeRows[i];
  assert.equal(native.label, testCase.label);
  const accuracy = compareBestdori(testCase);
  assert.deepEqual(native.scores, accuracy.independentScores, `${testCase.label}: unchanged upstream skill formulas + agreed medley rules`);
  if (accuracy.directlyComparable) assert.deepEqual(native.scores, accuracy.originalScores, `${testCase.label}: original Bestdori ct`);
  const main = timeMain(testCase);
  const row = { label: testCase.label, songId: testCase.song.songId, noteCount: testCase.song.notes.length,
    native, main, speedup: main.medianNs / native.medianNs, ...accuracy,
    originalDifferences: native.scores.map((score, leader) => score - accuracy.originalScores[leader]),
    jointFloorDifferences: native.scores.map((score, leader) => score - accuracy.jointScores[leader]),
  };
  console.log(`${row.label}: ${native.medianNs.toFixed(0)} ns vs main ${main.medianNs.toFixed(0)} ns (${row.speedup.toFixed(2)}x), Bestdori comparable=${accuracy.directlyComparable}`);
  return row;
});
save("report.json", {
  generatedAt: new Date().toISOString(), sourceCommit: git(root, ["rev-parse", "HEAD"]), sourceChanges: git(root, ["diff", "--stat"]),
  scoringRulesVersion: "hhwx-medley-bestdori-v2", mainCommit: git(mainRoot, ["rev-parse", "HEAD"]),
  bestdori: { url: bestdoriUrl, bundleSha256: hash(bundle), functionsSha256: hash(functions) },
  runtime: { node: process.version, rust: execFileSync("rustc", ["--version"], { encoding: "utf8" }).trim(), cpu: cpus()[0]?.model },
  method: "Native release Rust vs main TypeScript/Node, 2000 warmups + median of 7x10000 evaluations. Identical normalized chart, one fixed power value and resolved real skills; same five-member set with best leader. Chart and parameter preparation excluded, main chart/skill formula caches warm, computed-score caches disabled. Not a browser/WASM or full-search speed claim; leader-dependent power variants are not timed. All five leader scores checked, no historical score threshold and no search run.",
  precision: "originalScores execute unchanged Bestdori ct (ordinary combo, one active window); independentScores use unchanged st with agreed medley combo/independent windows; jointScores use unchanged st with medley combo and sum multipliers before flooring, isolating the approved overlap-rounding tradeoff. All consume the same normalized real note array; no chart-preprocessor comparison is claimed.",
  measuredSources, files: [...usedFiles.values()], rows,
});
console.log(`All ${rows.length * 5} leader-score comparisons passed. Report: ${join(runDirectory, "report.json")}`);
