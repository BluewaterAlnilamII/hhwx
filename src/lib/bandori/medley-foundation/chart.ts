import type { ScoringNoteV1 } from "./contracts";
import { failInput, readArray } from "./errors";

type SourceNote = { beat: number; isSkillTrigger: boolean };
type SourceBpm = { beat: number; bpm: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback = Number.NaN): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function addNote(notes: SourceNote[], value: unknown): void {
  if (!isRecord(value)) return;
  const beat = toFiniteNumber(value.beat);
  if (!Number.isFinite(beat)) return;
  notes.push({ beat, isSkillTrigger: Object.hasOwn(value, "skill") });
}

/** Normalize only the chart fields used by Bestdori score calculation. */
export function normalizeBestdoriScoringChart(
  value: unknown,
  path = "chart",
): ScoringNoteV1[] {
  const chart = readArray(value, path, "INVALID_CHART");
  const notes: SourceNote[] = [];
  const bpms: SourceBpm[] = [];

  chart.forEach((rawEntity) => {
    if (!isRecord(rawEntity)) return;
    switch (rawEntity.type) {
      case "Single":
      case "Directional":
        addNote(notes, rawEntity);
        break;
      case "Long": {
        const connections = Array.isArray(rawEntity.connections) ? rawEntity.connections : [];
        addNote(notes, connections[0]);
        addNote(notes, connections[connections.length - 1]);
        break;
      }
      case "Slide": {
        const connections = Array.isArray(rawEntity.connections) ? rawEntity.connections : [];
        connections.forEach((connection, index) => {
          if (
            index > 0
            && index < connections.length - 1
            && isRecord(connection)
            && Object.hasOwn(connection, "hidden")
          ) return;
          addNote(notes, connection);
        });
        break;
      }
      case "BPM": {
        const beat = toFiniteNumber(rawEntity.beat);
        const bpm = toFiniteNumber(rawEntity.bpm);
        if (Number.isFinite(beat) && Number.isFinite(bpm) && bpm > 0) bpms.push({ beat, bpm });
        break;
      }
      default:
        break;
    }
  });

  notes.sort((left, right) => left.beat - right.beat || Number(right.isSkillTrigger) - Number(left.isSkillTrigger));
  bpms.sort((left, right) => left.beat - right.beat);
  if (notes.length === 0) failInput("INVALID_CHART", path, "must contain scoring notes");

  let bpmIndex = 0;
  let bpmBeat = 0;
  let bpmTime = 0;
  let timePerBeat = 0;
  const normalized = notes.map((note, noteId) => {
    while (bpmIndex < bpms.length && bpms[bpmIndex].beat <= note.beat) {
      const bpm = bpms[bpmIndex];
      bpmTime += (bpm.beat - bpmBeat) * timePerBeat;
      bpmBeat = bpm.beat;
      timePerBeat = 60 / bpm.bpm;
      bpmIndex += 1;
    }
    if (bpmIndex === 0) {
      failInput("INVALID_CHART", `${path}[${noteId}]`, "scoring notes require a preceding BPM change");
    }
    // Bestdori anchors time at BPM changes; per-note accumulation drifts at skill endpoints.
    const timeSeconds = bpmTime + (note.beat - bpmBeat) * timePerBeat;
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || Object.is(timeSeconds, -0)) {
      failInput("INVALID_CHART", `${path}[${noteId}]`, "normalized note time is invalid");
    }
    return { noteId, timeSeconds, isSkillTrigger: note.isSkillTrigger };
  });

  if (normalized.filter((note) => note.isSkillTrigger).length !== 6) {
    failInput("INVALID_CHART", path, "must contain exactly six skill-trigger notes");
  }
  return normalized;
}
