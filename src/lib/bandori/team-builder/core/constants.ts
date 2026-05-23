/*
 * Static constants used by team-search preparation and scoring.
 *
 * Keep game-rule constants here when both single and medley search need the same ordering,
 * item grouping, or score judgment lookup.
 */
import type { BandoriCardAttribute, BandoriJudge } from "@/lib/bandori-team-calculator";
import type { BandoriTeamSearchDifficulty } from "./types";
export const DIFFICULTY_INDEX: Record<BandoriTeamSearchDifficulty, string> = {
  easy: "0",
  normal: "1",
  hard: "2",
  expert: "3",
  special: "4",
};

export const BAND_AREA_ITEM_GROUP_KEYS = [
  "PoppinParty",
  "Afterglow",
  "HelloHappyWorld",
  "PastelPalettes",
  "Roselia",
  "Morfonica",
  "RaiseASuilen",
  "MyGO",
  "Everyone",
] as const;

export const ATTRIBUTE_AREA_ITEM_IDS: Record<BandoriCardAttribute, number[]> = {
  powerful: [70, 56],
  cool: [66, 57],
  happy: [67, 58],
  pure: [69, 60],
};

export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_AREA_ITEM_IDS) as BandoriCardAttribute[];

export const PARAMETER_AREA_ITEM_IDS = {
  performance: [80],
  technique: [81],
  visual: [82],
} as const;

export const PARAMETER_KEYS = ["performance", "technique", "visual"] as const;

export const JUDGE_RANK: Record<BandoriJudge, number> = {
  perfect: 0,
  great: 1,
  good: 2,
  bad: 3,
  miss: 4,
};

export const JUDGE_PERCENT: Record<BandoriJudge, number> = {
  perfect: 1.1,
  great: 0.8,
  good: 0.5,
  bad: 0,
  miss: 0,
};

export const SCORE_FLOOR_EPSILON = 1e-5;
