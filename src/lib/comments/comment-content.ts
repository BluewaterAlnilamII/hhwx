import {
  getBandoriStampCatalogItemsForRegion,
  type BandoriStampCatalog,
} from "@/lib/bandori-stamp-assets";
import {
  COMMENT_STAMP_REGIONS,
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comments/stamps";
import { truncateCommentContent } from "@/lib/comments/comment-contract";

export type CommentStampLookup = ReadonlyMap<string, CommentStamp>;

function commentStampLookupKey(
  region: CommentStampRegion,
  stampId: number,
  kind: CommentStamp["kind"],
): string {
  return `${region}:${stampId}:${kind}`;
}

export function buildCommentStampLookup(catalog: BandoriStampCatalog | null): CommentStampLookup {
  const lookup = new Map<string, CommentStamp>();
  for (const region of COMMENT_STAMP_REGIONS) {
    for (const stamp of getBandoriStampCatalogItemsForRegion(catalog, region)) {
      lookup.set(commentStampLookupKey(region, stamp.id, stamp.kind), stamp);
    }
  }
  return lookup;
}

export function resolveCommentStamp(
  stampLookup: CommentStampLookup,
  region: CommentStampRegion,
  id: number,
  kind: CommentStamp["kind"],
): CommentStamp | null {
  return stampLookup.get(commentStampLookupKey(region, id, kind)) ?? null;
}

export function insertCommentShortcode(
  value: string,
  shortcode: string,
  start: number,
  end: number,
): { nextValue: string; nextCursor: number } {
  const prefix = start > 0 && !/\s/.test(value[start - 1] ?? "") ? " " : "";
  const suffix = !/\s/.test(value[end] ?? "") ? " " : "";
  const nextValue = truncateCommentContent(
    `${value.slice(0, start)}${prefix}${shortcode}${suffix}${value.slice(end)}`,
  );
  const nextCursor = Math.min(start + prefix.length + shortcode.length + suffix.length, nextValue.length);

  return { nextValue, nextCursor };
}

export function buildEmojiShortcode(name: string): string {
  return `:${name}:`;
}

export function buildStampShortcode(stamp: CommentStamp): string {
  return `:stamp-${stamp.region}-${stamp.id}${stamp.kind === "changed" ? "-changed" : ""}:`;
}
