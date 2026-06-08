/*
 * Optimizer-only chart normalization.
 *
 * Offset optimization needs note type, original order, fever, and skill trigger markers, so this
 * parser keeps a richer timeline than the aggregate team-builder scorer.
 */
import type { BestdoriChartEntity } from "../core";
import { isRecord, toFiniteNumber } from "../core/utils";
import type { BandoriSongOptimizerProofJudgement } from "./types";

export type OptimizerNoteType =
  | "tap"
  | "flick"
  | "directionalFlick"
  | "longStart"
  | "longEnd"
  | "longFlick"
  | "slideStart"
  | "slideTick"
  | "slideEnd"
  | "slideFlick";

export type OptimizerNote = {
  noteIndex: number;
  sourceIndex: number;
  type: OptimizerNoteType;
  beat: number;
  frame: number;
  skill: boolean;
  fever: boolean;
};

export type OptimizerTimeline = {
  notes: OptimizerNote[];
  skillTriggerNoteIndexes: number[];
};

export type OptimizerProofHitCandidate = {
  noteIndex: number;
  offsetFrames: number;
  hitFrame: number;
  judgement: BandoriSongOptimizerProofJudgement;
};

type RawOptimizerNote = Omit<OptimizerNote, "noteIndex" | "frame" | "fever">;

type JudgementWindow = {
  perfect: readonly [number, number];
  great: readonly [number, number];
  good: readonly [number, number];
  bad: readonly [number, number];
};

const TAP_WINDOWS: JudgementWindow = {
  perfect: [-3.5, 3.5],
  great: [-6.5, 6.5],
  good: [-7.5, 7.5],
  bad: [-8.5, 8.5],
};

const LONG_END_WINDOWS: JudgementWindow = {
  perfect: [-4.5, 4.5],
  great: [-7.5, 7.5],
  good: [-8.5, 8.5],
  bad: [-9.5, 9.5],
};

const SLIDE_EDGE_WINDOWS: JudgementWindow = {
  perfect: [-3.5, 12.5],
  great: [-6.5, 12.5],
  good: [-7.5, 12.5],
  bad: [-8.5, 12.5],
};

const SLIDE_TICK_WINDOWS: JudgementWindow = {
  perfect: [0, 12.5],
  great: [0, 12.5],
  good: [0, 12.5],
  bad: [0, 12.5],
};

const SLIDE_FLICK_WINDOWS: JudgementWindow = {
  perfect: [0, 6.5],
  great: [0, 6.5],
  good: [0, 6.5],
  bad: [0, 6.5],
};

function isFlickNote(note: Record<string, unknown>): boolean {
  return note.flick === true || note.flick === 1 || "flick" in note;
}

function pushNote(notes: RawOptimizerNote[], note: unknown, type: OptimizerNoteType, sourceIndex: number): void {
  if (!isRecord(note)) {
    return;
  }
  const beat = toFiniteNumber(note.beat, Number.NaN);
  if (!Number.isFinite(beat)) {
    return;
  }
  notes.push({
    sourceIndex,
    type,
    beat,
    skill: "skill" in note,
  });
}

function parseChart(chart: BestdoriChartEntity[]): {
  notes: RawOptimizerNote[];
  bpms: Array<{ beat: number; bpm: number }>;
  feverStartBeat: number | null;
  feverEndBeat: number | null;
} {
  const notes: RawOptimizerNote[] = [];
  const bpms: Array<{ beat: number; bpm: number }> = [];
  let feverStartBeat: number | null = null;
  let feverEndBeat: number | null = null;
  let sourceIndex = 0;

  chart.forEach((entity) => {
    switch (entity.type) {
      case "Single":
        pushNote(notes, entity, isFlickNote(entity) ? "flick" : "tap", sourceIndex);
        sourceIndex += 1;
        break;
      case "Directional":
        pushNote(notes, entity, "directionalFlick", sourceIndex);
        sourceIndex += 1;
        break;
      case "Long": {
        const connections = Array.isArray(entity.connections) ? entity.connections : [];
        const first = connections[0];
        const last = connections[connections.length - 1];
        pushNote(notes, first, "longStart", sourceIndex);
        sourceIndex += 1;
        pushNote(notes, isRecord(last) && isFlickNote(last) ? last : last, isRecord(last) && isFlickNote(last) ? "longFlick" : "longEnd", sourceIndex);
        sourceIndex += 1;
        break;
      }
      case "Slide": {
        const connections = Array.isArray(entity.connections) ? entity.connections : [];
        const visible = connections.filter((connection, index) => (
          index === 0
          || index === connections.length - 1
          || !(isRecord(connection) && "hidden" in connection)
        ));
        visible.forEach((connection, index) => {
          const isLast = index === visible.length - 1;
          const type: OptimizerNoteType = index === 0
            ? "slideStart"
            : isLast
              ? isRecord(connection) && isFlickNote(connection) ? "slideFlick" : "slideEnd"
              : "slideTick";
          pushNote(notes, connection, type, sourceIndex);
          sourceIndex += 1;
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
    || left.sourceIndex - right.sourceIndex
  ));
  bpms.sort((left, right) => left.beat - right.beat);
  return { notes, bpms, feverStartBeat, feverEndBeat };
}

export function buildOptimizerTimeline(chart: BestdoriChartEntity[], useFever = true): OptimizerTimeline {
  const parsed = parseChart(chart);
  let bpmIndex = 0;
  let currentBpm = 1;
  let currentTimeSeconds = 0;
  let previousBeat = 0;
  const notes = parsed.notes.map((note, noteIndex): OptimizerNote => {
    while (bpmIndex < parsed.bpms.length && parsed.bpms[bpmIndex].beat < note.beat) {
      const bpm = parsed.bpms[bpmIndex];
      currentTimeSeconds += (bpm.beat - previousBeat) * 60 / currentBpm;
      previousBeat = bpm.beat;
      currentBpm = bpm.bpm;
      bpmIndex += 1;
    }
    if (previousBeat < note.beat) {
      currentTimeSeconds += (note.beat - previousBeat) * 60 / currentBpm;
      previousBeat = note.beat;
    }
    return {
      ...note,
      noteIndex,
      frame: currentTimeSeconds * 60,
      fever: useFever
        && parsed.feverStartBeat !== null
        && parsed.feverEndBeat !== null
        && note.beat >= parsed.feverStartBeat
        && note.beat <= parsed.feverEndBeat,
    };
  });
  return {
    notes,
    skillTriggerNoteIndexes: notes.filter((note) => note.skill).map((note) => note.noteIndex),
  };
}

function getJudgementWindow(noteType: OptimizerNoteType): JudgementWindow {
  switch (noteType) {
    case "longEnd":
    case "longFlick":
      return LONG_END_WINDOWS;
    case "slideStart":
    case "slideEnd":
      return SLIDE_EDGE_WINDOWS;
    case "slideTick":
      return SLIDE_TICK_WINDOWS;
    case "slideFlick":
      return SLIDE_FLICK_WINDOWS;
    default:
      return TAP_WINDOWS;
  }
}

function isInRange(value: number, range: readonly [number, number]): boolean {
  return value >= range[0] - 1e-9 && value <= range[1] + 1e-9;
}

function snapToStep(value: number, stepFrames: number): number {
  return Math.round(value / stepFrames) * stepFrames;
}

function addOffset(offsets: Map<string, number>, value: number, stepFrames: number): void {
  const snapped = snapToStep(value, stepFrames);
  offsets.set(snapped.toFixed(6), snapped);
}

function getBestJudgementForOffset(
  window: JudgementWindow,
  offsetFrames: number,
  includeLowJudgements: boolean,
): BandoriSongOptimizerProofJudgement | null {
  if (isInRange(offsetFrames, window.perfect)) {
    return "perfect";
  }
  if (isInRange(offsetFrames, window.great)) {
    return "great";
  }
  if (!includeLowJudgements) {
    return null;
  }
  if (isInRange(offsetFrames, window.good)) {
    return "good";
  }
  if (isInRange(offsetFrames, window.bad)) {
    return "bad";
  }
  return null;
}

export function generateJudgementCandidates(
  note: OptimizerNote,
  stepFrames: number,
  includeLowJudgements: boolean,
): OptimizerProofHitCandidate[] {
  const window = getJudgementWindow(note.type);
  const range = includeLowJudgements ? window.bad : window.great;
  const offsets = new Map<string, number>();
  for (
    let offset = snapToStep(range[0], stepFrames);
    offset <= range[1] + 1e-9;
    offset += stepFrames
  ) {
    if (isInRange(offset, range)) {
      addOffset(offsets, offset, stepFrames);
    }
  }
  [
    ...window.perfect,
    ...window.great,
    ...(includeLowJudgements ? [...window.good, ...window.bad] : []),
    0,
  ].forEach((offset) => {
    if (isInRange(offset, range)) {
      addOffset(offsets, offset, stepFrames);
    }
  });

  return [...offsets.values()]
    .map((offsetFrames): OptimizerProofHitCandidate | null => {
      const judgement = getBestJudgementForOffset(window, offsetFrames, includeLowJudgements);
      return judgement
        ? {
          noteIndex: note.noteIndex,
          offsetFrames,
          hitFrame: note.frame + offsetFrames,
          judgement,
        }
        : null;
    })
    .filter((candidate): candidate is OptimizerProofHitCandidate => candidate !== null)
    .sort((left, right) => (
      Math.abs(left.offsetFrames) - Math.abs(right.offsetFrames)
      || left.hitFrame - right.hitFrame
    ));
}
