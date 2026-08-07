export const BANDORI_MASTER_DATASETS = {
  cards: "cards",
  songs: "songs",
  events: "events",
  areaItems: "areaItems",
  skills: "skills",
  bands: "bands",
  characters: "characters",
} as const;

export type BandoriMasterDatasetKey = keyof typeof BANDORI_MASTER_DATASETS;

export const BANDORI_MASTER_DATASET_ALIASES = {
  "area-items": "areaItems",
} as const satisfies Record<string, BandoriMasterDatasetKey>;

export const BANDORI_CHART_DIFFICULTIES = [
  "easy",
  "normal",
  "hard",
  "expert",
  "special",
] as const;

export type BandoriChartDifficulty = typeof BANDORI_CHART_DIFFICULTIES[number];

export function isBandoriChartDifficulty(value: string): value is BandoriChartDifficulty {
  return (BANDORI_CHART_DIFFICULTIES as readonly string[]).includes(value);
}
