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
  const difficulties = ["easy", "normal", "hard", "expert", "special"];
  const ranks = (key: "score" | "efficiency") => new Map([...rows]
    .sort((a, b) => b[key] - a[key] || a.songId - b.songId || difficulties.indexOf(a.difficulty) - difficulties.indexOf(b.difficulty))
    .map((row, index) => [`${row.songId}:${row.difficulty}`, index + 1]));
  const maxScore = rows.reduce((max, row) => Math.max(max, row.score), 0);
  const maxEfficiency = rows.reduce((max, row) => Math.max(max, row.efficiency), 0);
  const scoreRanks = ranks("score"), efficiencyRanks = ranks("efficiency");
  return rows.map((row) => ({ ...row, scoreRank: scoreRanks.get(`${row.songId}:${row.difficulty}`)!,
    efficiencyRank: efficiencyRanks.get(`${row.songId}:${row.difficulty}`)!,
    scorePercent: maxScore > 0 ? row.score / maxScore * 100 : null,
    efficiencyPercent: maxEfficiency > 0 ? row.efficiency / maxEfficiency * 100 : null })).sort((a, b) => {
    const left = sort === "level" ? a.sortLevel : a[sort], right = sort === "level" ? b.sortLevel : b[sort];
    if (left === null || right === null) return left === right ? a.songId - b.songId : left === null ? 1 : -1;
    const difference = typeof left === "string" && typeof right === "string" ? left.localeCompare(right) : Number(left) - Number(right);
    return difference * (direction === "asc" ? 1 : -1) || a.songId - b.songId || difficulties.indexOf(a.difficulty) - difficulties.indexOf(b.difficulty);
  });
}
