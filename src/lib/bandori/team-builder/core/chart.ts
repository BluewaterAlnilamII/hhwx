/*
 * Bestdori chart normalization and chart-level caches.
 *
 * Search code works with PreparedChart so score functions can use note times, skill windows,
 * fever flags, and combo offsets without parsing raw chart entities in hot paths.
 */
import { DIFFICULTY_INDEX } from "./constants";
import { isRecord, toFiniteNumber, toPositiveInteger } from "./utils";
import { resolveBandoriTeamSearchUseFever } from "./events";
import type { BandoriTeamSearchDifficulty, BandoriTeamSearchInput, BestdoriChartEntity, BestdoriSongMaster, PreparedChart, PreparedNote, ScoreComboOptions } from "./types";

const PREPARED_CHART_CACHE_LIMIT = 64;
const preparedChartCache = new Map<string, PreparedChart>();
function getComboMultiplier(combo: number): number {
  if (combo <= 20) {
    return 1;
  }
  if (combo <= 50) {
    return 1.01;
  }
  if (combo <= 100) {
    return 1.02;
  }
  if (combo <= 150) {
    return 1.03;
  }
  if (combo <= 200) {
    return 1.04;
  }
  if (combo <= 250) {
    return 1.05;
  }
  if (combo <= 300) {
    return 1.06;
  }
  if (combo <= 400) {
    return 1.07;
  }
  if (combo <= 500) {
    return 1.08;
  }
  if (combo <= 600) {
    return 1.09;
  }
  if (combo <= 700) {
    return 1.1;
  }
  return 1.11;
}

function getMedleyComboMultiplier(combo: number): number {
  if (combo <= 20) {
    return 1;
  }
  if (combo <= 50) {
    return 1.01;
  }
  if (combo <= 100) {
    return 1.02;
  }
  if (combo <= 300) {
    return 1.01 + Math.floor((combo - 1) / 50) * 0.01;
  }
  if (combo <= 3000) {
    return 1.04 + Math.floor((combo - 1) / 100) * 0.01;
  }
  return 1.34;
}

export function getScoreComboMultiplier(noteIndex: number, options?: ScoreComboOptions): number {
  const combo = (options?.startCombo ?? 0) + noteIndex + 1;
  return options?.useMedleyCombo ? getMedleyComboMultiplier(combo) : getComboMultiplier(combo);
}

function getSongPlayLevel(song: BestdoriSongMaster, difficulty: BandoriTeamSearchDifficulty): number {
  return toPositiveInteger(song.difficulty?.[DIFFICULTY_INDEX[difficulty]]?.playLevel, 1);
}

function addChartNote(notes: Array<{ beat: number; skill: boolean }>, note: unknown): void {
  if (!isRecord(note)) {
    return;
  }

  const beat = toFiniteNumber(note.beat, Number.NaN);
  if (!Number.isFinite(beat)) {
    return;
  }

  notes.push({
    beat,
    skill: "skill" in note,
  });
}

// Bestdori chart entities are loose; extract only the notes, BPM changes, and fever markers needed for scoring.
function parseChartNotes(chart: BestdoriChartEntity[]): {
  notes: Array<{ beat: number; skill: boolean }>;
  bpms: Array<{ beat: number; bpm: number }>;
  feverStartBeat: number | null;
  feverEndBeat: number | null;
} {
  const notes: Array<{ beat: number; skill: boolean }> = [];
  const bpms: Array<{ beat: number; bpm: number }> = [];
  let feverStartBeat: number | null = null;
  let feverEndBeat: number | null = null;

  chart.forEach((entity) => {
    switch (entity.type) {
      case "Single":
      case "Directional":
        addChartNote(notes, entity);
        break;
      case "Long": {
        const connections = Array.isArray(entity.connections) ? entity.connections : [];
        addChartNote(notes, connections[0]);
        addChartNote(notes, connections[connections.length - 1]);
        break;
      }
      case "Slide": {
        const connections = Array.isArray(entity.connections) ? entity.connections : [];
        connections.forEach((connection, index) => {
          if (index > 0 && index < connections.length - 1 && isRecord(connection) && "hidden" in connection) {
            return;
          }
          addChartNote(notes, connection);
        });
        break;
      }
      case "BPM": {
        const beat = toFiniteNumber(entity.beat, Number.NaN);
        const bpm = toFiniteNumber(entity.bpm, Number.NaN);
        if (Number.isFinite(beat) && Number.isFinite(bpm) && bpm > 0) {
          bpms.push({ beat, bpm });
        }
        break;
      }
      case "System":
        if (entity.data === "cmd_fever_start.wav") {
          feverStartBeat = toFiniteNumber(entity.beat, 0);
        } else if (entity.data === "cmd_fever_end.wav") {
          feverEndBeat = toFiniteNumber(entity.beat, 0);
        }
        break;
      default:
        break;
    }
  });

  notes.sort((left, right) => (
    left.beat - right.beat
    || Number(right.skill) - Number(left.skill)
  ));

  bpms.sort((left, right) => left.beat - right.beat);
  return { notes, bpms, feverStartBeat, feverEndBeat };
}

export function prepareBandoriChart(
  chart: BestdoriChartEntity[],
  song: BestdoriSongMaster,
  difficulty: BandoriTeamSearchDifficulty,
): PreparedChart {
  // Convert beats to seconds so skill durations can locate their ending note by binary search.
  const parsed = parseChartNotes(chart);
  let bpmIndex = 0;
  let currentBpm = 1;
  let currentTime = 0;
  let previousBeat = 0;
  const preparedNotes: PreparedNote[] = [];

  parsed.notes.forEach((note) => {
    while (bpmIndex < parsed.bpms.length && parsed.bpms[bpmIndex].beat < note.beat) {
      const bpm = parsed.bpms[bpmIndex];
      currentTime += (bpm.beat - previousBeat) * 60 / currentBpm;
      previousBeat = bpm.beat;
      currentBpm = bpm.bpm;
      bpmIndex += 1;
    }

    if (previousBeat < note.beat) {
      currentTime += (note.beat - previousBeat) * 60 / currentBpm;
      previousBeat = note.beat;
    }

    preparedNotes.push({
      beat: note.beat,
      time: currentTime,
      skill: note.skill,
      fever: parsed.feverStartBeat !== null
        && parsed.feverEndBeat !== null
        && note.beat >= parsed.feverStartBeat
        && note.beat <= parsed.feverEndBeat,
    });
  });

  const skillStartNotes: number[] = [];
  const skillTriggerTimes: number[] = [];
  preparedNotes.forEach((note, index) => {
    if (!note.skill) {
      return;
    }

    skillStartNotes.push(index + 1);
    skillTriggerTimes.push(note.time);
  });

  return {
    notes: preparedNotes,
    playLevel: getSongPlayLevel(song, difficulty),
    notesCount: preparedNotes.length,
    skillStartNotes,
    skillTriggerTimes,
  };
}

function setPreparedChartFeverEnabled(chart: PreparedChart, enabled: boolean): PreparedChart {
  if (enabled) {
    return chart;
  }

  return {
    ...chart,
    notes: chart.notes.map((note) => ({
      ...note,
      fever: false,
    })),
  };
}

export function getCachedPreparedChart(input: BandoriTeamSearchInput): PreparedChart {
  const useFever = resolveBandoriTeamSearchUseFever(input);
  const cacheKey = input.chartCacheKey
    ? `${input.chartCacheKey}:fever=${useFever ? "1" : "0"}`
    : null;
  if (cacheKey) {
    const cached = preparedChartCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const chart = setPreparedChartFeverEnabled(
    prepareBandoriChart(input.chart, input.song, input.difficulty),
    useFever,
  );
  if (cacheKey) {
    preparedChartCache.set(cacheKey, chart);
    if (preparedChartCache.size > PREPARED_CHART_CACHE_LIMIT) {
      const oldestKey = preparedChartCache.keys().next().value;
      if (oldestKey) {
        preparedChartCache.delete(oldestKey);
      }
    }
  }
  return chart;
}
