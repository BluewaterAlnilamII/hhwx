/*
 * Static constants used by team-search preparation and scoring.
 *
 * Keep game-rule constants here when both single and medley search need the same ordering,
 * item grouping, or score judgment lookup.
 */
import type { BandoriCardAttribute } from "@/lib/bandori-team-calculator";
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


export const PARAMETER_AREA_ITEM_IDS = {
  performance: [80],
  technique: [81],
  visual: [82],
} as const;
