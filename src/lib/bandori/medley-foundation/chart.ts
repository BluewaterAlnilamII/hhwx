import type { ScoringNoteV1 } from "./contracts";
import { failInput, readArray, readFiniteNumber, readRecord } from "./errors";

type SourceNote = { beat: number; isSkillTrigger: boolean; path: string };
type SourceBpm = { beat: number; bpm: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readChartNumber(value: unknown, path: string): number {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return readFiniteNumber(number, path, "INVALID_CHART");
}

function addNote(notes: SourceNote[], value: unknown, path: string): void {
  const note = readRecord(value, path, "INVALID_CHART");
  const beat = readChartNumber(note.beat, `${path}.beat`);
  notes.push({ beat, isSkillTrigger: Object.hasOwn(note, "skill"), path });
}

/** Normalize only the chart fields used by Bestdori score calculation. */
export function normalizeBestdoriScoringChart(
  value: unknown,
  path = "chart",
): ScoringNoteV1[] {
  const chart = readArray(value, path, "INVALID_CHART");
  const notes: SourceNote[] = [];
  const bpms: SourceBpm[] = [];

  chart.forEach((rawEntity, entityIndex) => {
    if (!isRecord(rawEntity)) return;
    const entityPath = `${path}[${entityIndex}]`;
    switch (rawEntity.type) {
      case "Single":
      case "Directional":
        addNote(notes, rawEntity, entityPath);
        break;
      case "Long":
      case "Slide": {
        const connectionsPath = `${entityPath}.connections`;
        const connections = readArray(rawEntity.connections, connectionsPath, "INVALID_CHART");
        if (connections.length < 2) {
          failInput("INVALID_CHART", connectionsPath, "must contain at least two endpoints");
        }
        for (const [index, connection] of connections.entries()) {
          if (
            index > 0
            && index < connections.length - 1
            && (rawEntity.type === "Long" || (isRecord(connection) && Object.hasOwn(connection, "hidden")))
          ) continue;
          addNote(notes, connection, `${connectionsPath}[${index}]`);
        }
        break;
      }
      case "BPM": {
        const beat = readChartNumber(rawEntity.beat, `${entityPath}.beat`);
        const bpm = readChartNumber(rawEntity.bpm, `${entityPath}.bpm`);
        if (bpm <= 0) failInput("INVALID_CHART", `${entityPath}.bpm`, "must be positive");
        bpms.push({ beat, bpm });
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
      failInput("INVALID_CHART", note.path, "scoring notes require a preceding BPM change");
    }
    // Bestdori anchors time at BPM changes; per-note accumulation drifts at skill endpoints.
    const timeSeconds = bpmTime + (note.beat - bpmBeat) * timePerBeat;
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || Object.is(timeSeconds, -0)) {
      failInput("INVALID_CHART", note.path, "normalized note time is invalid");
    }
    return { noteId, timeSeconds, isSkillTrigger: note.isSkillTrigger };
  });

  if (normalized.filter((note) => note.isSkillTrigger).length !== 6) {
    failInput("INVALID_CHART", path, "must contain exactly six skill-trigger notes");
  }
  return normalized;
}
