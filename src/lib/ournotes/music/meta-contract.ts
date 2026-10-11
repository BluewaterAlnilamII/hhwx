import { ourNotesHash, ourNotesId, ourNotesRecord, requireOurNotes } from "../master-contract";

export type OurNotesChartMeta = { total: number; covered: Record<string, number> };
export type OurNotesSongMeta = { durations: number[]; songs: Record<string, Record<string, OurNotesChartMeta>> };

function exactKeys(row: Record<string, unknown>, keys: string[]) {
  requireOurNotes(Object.keys(row).length === keys.length && keys.every((key) => Object.hasOwn(row, key)));
}
function coefficient(value: unknown): number {
  requireOurNotes(typeof value === "number" && Number.isFinite(value) && value >= 0);
  return value;
}

export function parseOurNotesSongMeta(raw: unknown): OurNotesSongMeta & { musicIndexSha256: string } {
  const root = ourNotesRecord(raw);
  exactKeys(root, ["schema", "updatedAt", "musicIndexSha256", "durations", "songs"]);
  requireOurNotes(root.schema === "ournotes-music-meta-v1" && typeof root.updatedAt === "string" && Number.isFinite(Date.parse(root.updatedAt)));
  const musicIndexSha256 = ourNotesHash(root.musicIndexSha256);
  requireOurNotes(Array.isArray(root.durations) && root.durations.length > 0 && root.durations.length <= 64);
  const durations = root.durations.map(coefficient);
  requireOurNotes(durations.every((value, index) => value > (durations[index - 1] ?? 0)));
  const durationKeys = durations.map(String);
  const entries = Object.entries(ourNotesRecord(root.songs));
  requireOurNotes(entries.length <= 10_000);
  const songs = Object.fromEntries(entries.map(([id, rawCharts]) => {
    requireOurNotes(ourNotesId(id));
    const charts = Object.entries(ourNotesRecord(rawCharts));
    requireOurNotes(charts.length > 0 && charts.length <= 4);
    return [id, Object.fromEntries(charts.map(([difficulty, value]) => {
      requireOurNotes(/^[0-3]$/u.test(difficulty));
      const row = ourNotesRecord(value);
      exactKeys(row, ["total", "covered"]);
      const total = coefficient(row.total);
      requireOurNotes(total > 0);
      const rawCovered = ourNotesRecord(row.covered);
      exactKeys(rawCovered, durationKeys);
      // Overlapping activations contribute independently, so coverage can exceed total.
      const covered = Object.fromEntries(durationKeys.map((key) => [key, coefficient(rawCovered[key])]));
      return [difficulty, { total, covered }];
    }))];
  }));
  return { musicIndexSha256, durations, songs };
}
