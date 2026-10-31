import type { BandoriChartDifficulty } from "./bandori-master-contract";

export const SONG_META_SORTS = ["score", "efficiency", "title", "level", "length", "bpm", "notes", "nps", "sr"] as const;
export type SongMetaSort = typeof SONG_META_SORTS[number];
export type SongMetaRow = {
  songId: number; title: string; difficulty: BandoriChartDifficulty; level: number | null; sortLevel: number | null;
  score: number; efficiency: number; length: number; bpm: number | null; bpmValues: number[];
  notes: number | null; nps: number | null; sr: number;
};

export function formatSongMetaTime(seconds: number): string {
  const milliseconds = Math.round(seconds * 1000);
  return `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

export function rankSongMetaRows<T extends SongMetaRow>(rows: T[], sort: SongMetaSort, direction: "asc" | "desc") {
  const topCount = Math.ceil(rows.length * 0.05);
  const threshold = (key: "score" | "efficiency") => rows.map((row) => row[key]).sort((a, b) => b - a)[topCount - 1] ?? Infinity;
  const scoreThreshold = threshold("score"), efficiencyThreshold = threshold("efficiency");
  const difficulties = ["easy", "normal", "hard", "expert", "special"];
  return rows.map((row) => ({ ...row, topScore: row.score >= scoreThreshold, topEfficiency: row.efficiency >= efficiencyThreshold })).sort((a, b) => {
    const left = sort === "level" ? a.sortLevel : a[sort], right = sort === "level" ? b.sortLevel : b[sort];
    if (left === null || right === null) return left === right ? a.songId - b.songId : left === null ? 1 : -1;
    const difference = typeof left === "string" && typeof right === "string" ? left.localeCompare(right) : Number(left) - Number(right);
    return difference * (direction === "asc" ? 1 : -1) || a.songId - b.songId || difficulties.indexOf(a.difficulty) - difficulties.indexOf(b.difficulty);
  });
}
