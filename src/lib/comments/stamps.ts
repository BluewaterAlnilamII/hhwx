import type { BandoriStampCatalogItem, BandoriStampRegion } from "@/lib/bandori-stamp-assets";

export type CommentStampRegion = BandoriStampRegion;
export type CommentStamp = BandoriStampCatalogItem;

export const COMMENT_STAMP_DEFAULT_REGION: CommentStampRegion = "cn";
export const COMMENT_STAMP_REGIONS = [
  "cn",
  "jp",
  "en",
  "tw",
] as const satisfies readonly CommentStampRegion[];
export const COMMENT_STAMP_REGION_LABELS: Record<CommentStampRegion, string> = {
  cn: "CN",
  jp: "JP",
  en: "EN",
  tw: "TW",
};

export function isCommentStampRegion(value: string): value is CommentStampRegion {
  return value === "jp" || value === "en" || value === "tw" || value === "cn";
}
