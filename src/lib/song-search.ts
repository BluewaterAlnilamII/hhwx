export const SONG_DIFFICULTY_ALIASES = {
  easy: ["easy", "ez", "简单", "簡單", "イージー"],
  normal: ["normal", "nm", "普通", "ノーマル"],
  hard: ["hard", "hd", "困难", "困難", "ハード"],
  expert: ["expert", "ex", "专家", "專家", "エキスパート"],
  special: ["special", "sp", "特殊", "スペシャル"],
} as const;

export function parseSongPositiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
