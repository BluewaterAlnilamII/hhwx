import { parseApiSuccessData } from "@/lib/api-contracts";
import type { BandoriSongMetaDataset } from "@/lib/bandori-song-meta-server";
import type { BandoriMusicMasterMap } from "@/lib/bandori-music-api-client";
import type { BandoriServer } from "@/lib/bandori-server";
import { resolveBandoriSkillLabel, type BandoriSkillLabelMaster } from "@/lib/bandori-skill-label";
import { rankSongMetaRows, type SongMetaSort } from "@/lib/song-meta";
import { resolveBestdoriScoreSkill } from "../medley-foundation/skills";
import { MedleyFoundationInputError } from "../medley-foundation/errors";
import type { BandoriCardAttribute } from "../medley-foundation/contracts";
import { BANDORI_SONG_DIFFICULTY_FILTERS, buildBandoriSongCatalog, filterBandoriSongCatalog, type BandoriSongsPageFilter } from "./catalog";

export type BandoriMetaSkill = { duration: number; perfectMultiplier: number; greatMultiplier: number };
export type BandoriMetaSkillOption = { id: string; skill: BandoriSkillLabelMaster; levels: BandoriMetaSkill[] };

export function bandoriMetaSkillOptions(skills: Record<string, BandoriSkillLabelMaster | null | undefined>, server: BandoriServer): BandoriMetaSkillOption[] {
  return Object.entries(skills).flatMap(([id, skill]) => {
    if (!skill) return [];
    const activation = skill.activationEffect;
    const effects = activation?.activateEffectTypes ?? {};
    // Aggregate coverage cannot retain the note order needed by either effect.
    if ("score_continued_note_judge" in effects || "score_rate_up_with_perfect" in effects) return [];
    const attribute = activation?.unificationActivateConditionType;
    const context = {
      sameBandId: Number(activation?.unificationActivateConditionBandId) || null,
      sameAttribute: typeof attribute === "string" && ["powerful", "cool", "happy", "pure"].includes(attribute)
        ? attribute as BandoriCardAttribute : null,
    };
    try {
      const levels = [1, 2, 3, 4, 5].map((skillLevel): BandoriMetaSkill | null => {
        const resolved = resolveBestdoriScoreSkill({ skillId: Number(id), skillLevel, skillMaster: skill, context, server });
        const behavior = resolved.behavior;
        if (behavior.kind === "neutral" || behavior.kind === "continued_perfect") return null;
        const perfectMultiplier = 1 + behavior.scoreUpPercent / 100;
        const greatMultiplier = behavior.kind === "perfect_only" ? 0 : behavior.kind === "great_or_worse_half" ? 0.5
          : behavior.kind === "score_on_perfect" ? 1 : perfectMultiplier;
        return { duration: resolved.durationSeconds, perfectMultiplier, greatMultiplier };
      });
      return levels.every((level) => level !== null) ? [{ id, skill, levels }] : [];
    } catch (error) {
      if (error instanceof MedleyFoundationInputError) return [];
      throw error;
    }
  });
}

export function bandoriMetaSkillDescription(option: BandoriMetaSkillOption, level: number, server: BandoriServer): string {
  return resolveBandoriSkillLabel({ ...option.skill, duration: option.levels.map((value) => value.duration) }, level, 5, server, server, option.id).label;
}

export function parseBandoriSongMetaResponse(raw: unknown): BandoriSongMetaDataset {
  const data = parseApiSuccessData<BandoriSongMetaDataset>(raw);
  if (!data || !Array.isArray(data.durations) || !data.durations.length
    || !data.durations.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    || !data.songs || typeof data.songs !== "object" || Array.isArray(data.songs)) {
    throw new Error("Bandori Meta API returned an invalid dataset");
  }
  return data;
}

export function calculateBandoriMeta(chart: BandoriSongMetaDataset["songs"][string][string], skill: BandoriMetaSkill,
  fever: boolean, perfectRate: number, length: number, downtime: number) {
  const slot = fever ? 1 : 0, total = chart.total[slot], covered = chart.covered[String(skill.duration)]?.[slot];
  if (covered === undefined || !Number.isFinite(total) || total <= 0 || !Number.isFinite(covered) || covered < 0 || covered > total
    || !Number.isFinite(perfectRate) || perfectRate < 0 || perfectRate > 1 || !Number.isFinite(length) || length <= 0
    || !Number.isFinite(downtime) || downtime < 0) return null;
  const judgement = 1.1 * perfectRate + 0.8 * (1 - perfectRate);
  const activeJudgement = 1.1 * perfectRate * skill.perfectMultiplier + 0.8 * (1 - perfectRate) * skill.greatMultiplier;
  const score = judgement * (total - covered) + activeJudgement * covered;
  return { score: score * 100, efficiency: score * 6000 / (length + downtime), sr: covered / total * 100 };
}

export function buildBandoriMetaRows(music: BandoriMusicMasterMap, meta: BandoriSongMetaDataset, server: BandoriServer,
  filter: BandoriSongsPageFilter, skill: BandoriMetaSkill, fever: boolean, perfectRate: number, downtime: number,
  sort: SongMetaSort, direction: "asc" | "desc") {
  const charts = buildBandoriSongCatalog(music, server, { unknownTitle: (id) => String(id), unknownBand: "" }).flatMap((entry) =>
    BANDORI_SONG_DIFFICULTY_FILTERS.flatMap((difficulty) => {
      const level = entry.difficultyLevels[difficulty];
      return level === undefined ? [] : [{ ...entry, difficulty, level, difficultyLevels: { [difficulty]: level } }];
    }));
  const visible = new Set(filterBandoriSongCatalog(charts, filter));
  const rows = charts.flatMap((entry) => {
    const difficultyId = String(BANDORI_SONG_DIFFICULTY_FILTERS.indexOf(entry.difficulty));
    const coefficients = meta.songs[String(entry.songId)]?.[difficultyId], song = music[String(entry.songId)];
    if (!coefficients || !song?.length) return [];
    const calculated = calculateBandoriMeta(coefficients, skill, fever, perfectRate, song.length, downtime);
    if (!calculated) return [];
    const events = song.bpm?.[difficultyId] ?? [];
    const longest = events.reduce<(typeof events)[number] | null>((best, event) =>
      best === null || event.end - event.start > best.end - best.start ? event : best, null);
    const notes = song.notes?.[difficultyId] ?? null;
    return [{ entry, songId: entry.songId, title: entry.title, difficulty: entry.difficulty, level: entry.level, sortLevel: entry.level,
      length: song.length, notes, nps: notes === null ? null : notes / song.length,
      bpm: longest?.bpm ?? null, bpmValues: [...new Set(events.map((event) => event.bpm))], ...calculated }];
  });
  return rankSongMetaRows(rows, sort, direction).filter((row) => visible.has(row.entry));
}
