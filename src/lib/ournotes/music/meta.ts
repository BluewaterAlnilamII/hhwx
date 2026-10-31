import { rankSongMetaRows, SONG_META_SORTS, type SongMetaSort } from "@/lib/song-meta";
export { formatSongMetaTime as formatOurNotesMetaTime } from "@/lib/song-meta";
import type { OurNotesSkill, OurNotesSkillCondition, OurNotesSkillConditionAtLevel, OurNotesSkillEffect, OurNotesSkillEffectAtLevel, OurNotesSkillEffectByLevel } from "../skills-contract";
import type { OurNotesBand } from "../catalogs-contract";
import type { OurNotesServer } from "../master-contract";
import { selectOurNotesSkill } from "../skills-contract";
import { OURNOTES_SERVERS } from "../server";
import type { OurNotesMusicSummary } from "./api-contract";
import { buildOurNotesSongCatalog, filterOurNotesSongs, OURNOTES_SONG_DIFFICULTIES, resolveOurNotesSong, type OurNotesSongFilter } from "./catalog";
import type { OurNotesChartMeta, OurNotesSongMeta } from "./meta-contract";

function conditionsAtLevel(groups: OurNotesSkillCondition[][] | Record<string, OurNotesSkillConditionAtLevel[][]>, level: number): OurNotesSkillConditionAtLevel[][] {
  return Array.isArray(groups) ? groups.map((group) => group.map((condition) => ({ ...condition,
    conditionType: condition.conditionType[level - 1], conditionValues: condition.conditionValues.map((value) => value[level - 1]),
  }))) : groups[String(level)];
}

function effectsAtLevel(skill: OurNotesSkill, level: number): OurNotesSkillEffectAtLevel[] {
  if (!Number.isInteger(level) || level < 1 || level > 5) return [];
  const grade = String(level) as keyof OurNotesSkillEffectByLevel;
  return skill.effects.flatMap((entry) => {
    if (!("skillEffectType" in entry)) return entry[grade] ? [entry[grade]] : [];
    const effect = entry as OurNotesSkillEffect;
    return [{ ...effect,
      effectValue: effect.effectValue[level - 1], effectExecuteLimitCount: effect.effectExecuteLimitCount[level - 1],
      effectExecuteLimitResetConditions: conditionsAtLevel(effect.effectExecuteLimitResetConditions, level),
      skillConditions: conditionsAtLevel(effect.skillConditions, level),
      skillCumulativeCondition: effect.skillCumulativeCondition === null ? null : {
        ...effect.skillCumulativeCondition, skillCumulativeConditionType: effect.skillCumulativeCondition.skillCumulativeConditionType[level - 1],
        conditionValues: effect.skillCumulativeCondition.conditionValues.map((value) => value[level - 1]),
        maxCumulativeCount: effect.skillCumulativeCondition.maxCumulativeCount[level - 1],
      },
      activationTimeSecond: effect.activationTimeSecond?.[level - 1], maxEffectValue: effect.maxEffectValue?.[level - 1],
      effectLimitCount: effect.effectLimitCount?.[level - 1], skillTriggerType: effect.skillTriggerType?.[level - 1],
      skillReleaseConditions: effect.skillReleaseConditions && conditionsAtLevel(effect.skillReleaseConditions, level),
      skillTriggerConditions: effect.skillTriggerConditions && conditionsAtLevel(effect.skillTriggerConditions, level),
    }];
  });
}

function unlimited(effect: OurNotesSkillEffectAtLevel): boolean {
  return effect.effectExecuteLimitCount === 0 && effect.effectExecuteLimitResetConditions.length === 0
    && effect.effectLimitCount === 0 && effect.maxEffectValue === 0 && effect.skillCumulativeCondition === null
    && effect.skillReleaseConditions?.length === 0 && Number.isFinite(effect.effectValue) && effect.effectValue > 0;
}
function supportedConditions(groups: OurNotesSkillConditionAtLevel[][], kind: "live" | "support"): boolean {
  return groups.every((group) => group.length > 0 && group.every((condition) => kind === "live"
    ? condition.conditionType === 2001 && condition.conditionValues.length === 1 && condition.conditionValues[0] === 700 && condition.conditionTargets.length === 0
    : condition.conditionType === 5000 && condition.conditionValues.length === 0 && condition.conditionTargets.length > 0
      && condition.conditionTargets.every((target) => target.skillTargetType === 3 && target.bandId !== undefined && Object.keys(target).length === 2)));
}
function conditionsSatisfied(groups: OurNotesSkillConditionAtLevel[][]): boolean {
  return groups.length === 0 || groups.some((group) => group.every((condition) => condition.isPositive));
}

export type OurNotesMetaLiveSkill = { duration: number; boost: number; perfectOnly: boolean };
export function resolveOurNotesMetaLiveSkill(skill: OurNotesSkill, level: number): OurNotesMetaLiveSkill | null {
  const effects = effectsAtLevel(skill, level);
  if (!effects.length || effects.some((effect) => !unlimited(effect) || !supportedConditions(effect.skillConditions, "live")
    || !(effect.activationTimeSecond! > 0) || effect.skillTriggerType !== undefined
    || (effect.skillEffectType === 2000 ? effect.skillTargets.length !== 0 : effect.skillEffectType !== 2004
      || effect.skillTargets.length !== 2 || ![5, 6].every((judgement) => effect.skillTargets.some((target) =>
        target.skillTargetType === 4 && target.judgement === judgement && Object.keys(target).length === 2))))) return null;
  const active = effects.filter((effect) => conditionsSatisfied(effect.skillConditions));
  if (active.length !== 1) return null;
  const effect = active[0];
  return { duration: effect.activationTimeSecond!, boost: effect.effectValue / 10000, perfectOnly: effect.skillEffectType === 2004 };
}

export function resolveOurNotesMetaExtension(skill: OurNotesSkill, level: number): number | null {
  const effects = effectsAtLevel(skill, level);
  if (!effects.length || effects.some((effect) => !unlimited(effect) || effect.skillEffectType !== 15000
    || effect.activationTimeSecond !== 0 || effect.skillTargets.length !== 0 || effect.skillTriggerType !== 1
    || !supportedConditions(effect.skillConditions, "support") || effect.skillTriggerConditions?.length !== 1
    || effect.skillTriggerConditions[0].length !== 1 || !effect.skillTriggerConditions[0].every((condition) =>
      condition.conditionType === 4010 && condition.isPositive && condition.conditionValues.length === 0 && condition.conditionTargets.length === 0))) return null;
  const active = effects.filter((effect) => conditionsSatisfied(effect.skillConditions));
  return active.length === 1 ? active[0].effectValue : null;
}

export function ourNotesMetaSkillOptions(skills: Record<string, OurNotesSkill>, kind: "live" | "support", server: OurNotesServer): [string, OurNotesSkill][] {
  const seen = new Set<string>();
  const resolve = kind === "live" ? resolveOurNotesMetaLiveSkill : resolveOurNotesMetaExtension;
  const regional: [string, OurNotesSkill][] = Object.entries(skills).flatMap(([id, skill]) => {
    const available = [server, ...OURNOTES_SERVERS].find((slot) => skill.serverExtensions?.[slot] !== null);
    const selected = available === undefined ? undefined : selectOurNotesSkill(skill, available);
    return selected ? [[id, selected]] : [];
  });
  return regional.filter(([, skill]) => {
    if (![1, 2, 3, 4, 5].every((level) => resolve(skill, level) !== null)) return false;
    const key = JSON.stringify([skill.effects, skill.description, skill.descriptionParameters]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ourNotesMetaDuration(baseSeconds: number, extensionMs: number): number {
  return Math.ceil(Math.fround(Math.fround(Math.fround(baseSeconds) * 1000) + Math.fround(extensionMs))) / 1000;
}

export function calculateOurNotesMeta(chart: OurNotesChartMeta, skill: OurNotesMetaLiveSkill, extensionMs: number, perfectRate: number, length: number, downtime: number) {
  const covered = chart.covered[String(ourNotesMetaDuration(skill.duration, extensionMs))];
  if (covered === undefined || perfectRate < 0 || perfectRate > 1 || !Number.isFinite(perfectRate)
    || !Number.isFinite(length) || length <= 0 || !Number.isFinite(downtime) || downtime < 0) return null;
  const judgement = perfectRate + 0.8 * (1 - perfectRate);
  const score = judgement * chart.total + (skill.perfectOnly ? perfectRate : judgement) * skill.boost * covered;
  return { score: score * 100, efficiency: score * 6000 / (length + downtime), sr: covered / chart.total * 100 };
}

export function ourNotesMetaBpm(events: { t: number; bpm: number }[], length: number): number | null {
  let longest = -1, selected: number | null = null, elapsed = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const seconds = i + 1 < events.length ? (events[i + 1].t - event.t) / 480 * 60 / event.bpm : Math.max(0, length - elapsed);
    if (seconds > longest) { longest = seconds; selected = event.bpm; }
    elapsed += seconds;
  }
  return selected;
}

export const OURNOTES_META_SORTS = SONG_META_SORTS;
export const OURNOTES_META_DEFAULT_SKILLS = { live: "5", support: "11" } as const;
export type OurNotesMetaSort = SongMetaSort;

export function buildOurNotesMetaRows(music: Record<string, OurNotesMusicSummary>, meta: OurNotesSongMeta,
  bands: Record<string, OurNotesBand>, server: OurNotesServer, filter: OurNotesSongFilter,
  skill: OurNotesMetaLiveSkill, extensionMs: number, perfectRate: number, downtime: number, sort: OurNotesMetaSort, direction: "asc" | "desc") {
  const charts = buildOurNotesSongCatalog(music, server).flatMap((entry) => entry.charts.map((chart) => ({ ...entry, charts: [chart] })));
  const visibleCharts = new Set(filterOurNotesSongs(charts, filter, bands));
  const rows = charts.flatMap((entry) => {
    const chart = entry.charts[0];
    const difficulty = OURNOTES_SONG_DIFFICULTIES.indexOf(chart.difficulty);
    const coefficients = meta.songs[String(entry.songId)]?.[String(difficulty)];
    const song = resolveOurNotesSong(music[String(entry.songId)], server)?.music;
    if (!coefficients || !song?.length) return [];
    const calculated = calculateOurNotesMeta(coefficients, skill, extensionMs, perfectRate, song.length, downtime);
    if (!calculated) return [];
    const events = song.bpm[String(difficulty)]?.events ?? [];
    return [{ entry, songId: entry.songId, title: entry.title, difficulty: chart.difficulty, level: chart.level, sortLevel: chart.sortLevel,
      length: song.length, notes: chart.combo, nps: chart.combo === null ? null : chart.combo / song.length,
      bpm: ourNotesMetaBpm(events, song.length), bpmValues: [...new Set(events.map((event) => event.bpm))], ...calculated }];
  });
  return rankSongMetaRows(rows, sort, direction).filter((row) => visibleCharts.has(row.entry));
}
