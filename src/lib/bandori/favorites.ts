import type { ProfileModuleId } from "@/lib/profile-homepage";
import { getBandoriServerCode, parseBandoriServerParam, type BandoriServer } from "@/lib/bandori-server";
import { isKnownBandoriCardEntityCollision } from "@/lib/bandori/cards/regional-extensions";

export type FavoriteItem = { target: string; normalArt: boolean };
export type FavoriteGroup = { kind: ProfileModuleId; items: FavoriteItem[]; previewCount?: number };
export type FavoriteChange = { kind: ProfileModuleId; target: string; selected: boolean };
export type FavoriteCardLayout = { targets: string[]; previewCount: number };
export const CARD_PREVIEW_MAX = 6;
export const CARD_PREVIEW_DIVIDER = "preview-divider";
const EVENT_PREVIEW_MAX = 4;

export function favoritePreviewLimit(group: FavoriteGroup) {
  return group.kind === "cards" ? group.previewCount ?? CARD_PREVIEW_MAX : group.kind === "songs" ? 10 : EVENT_PREVIEW_MAX;
}

export function cardPreviewLimit(visible: number, total: number) {
  return visible >= total ? CARD_PREVIEW_MAX : visible;
}

export function applyFavoriteChange(groups: FavoriteGroup[], { kind, target, selected }: FavoriteChange): FavoriteGroup[] {
  const group = groups.find(entry => entry.kind === kind);
  if (Boolean(group?.items.some(item => item.target === target)) === selected) return groups;
  const items = selected
    ? [...(group?.items ?? []), { target, normalArt: false }]
    : group!.items.filter(item => item.target !== target);
  if (!items.length) return groups.filter(entry => entry !== group);
  const updated: FavoriteGroup = { ...group, kind, items };
  if (kind === "cards") updated.previewCount = cardPreviewLimit(group?.previewCount ?? CARD_PREVIEW_MAX, items.length);
  return group ? groups.map(entry => entry === group ? updated : entry) : [...groups, updated];
}

// The divider moves with cards that cross it. A full preview yields its last place to an incoming card.
export function favoriteCardDrop(sorted: string[], moved: string): FavoriteCardLayout {
  const boundary = sorted.indexOf(CARD_PREVIEW_DIVIDER);
  const targets = sorted.filter(id => id !== CARD_PREVIEW_DIVIDER);
  const count = Math.max(1, Math.min(CARD_PREVIEW_MAX, boundary));
  if (moved !== CARD_PREVIEW_DIVIDER && boundary > count && targets[count] === moved) {
    [targets[count - 1], targets[count]] = [targets[count], targets[count - 1]];
  } else if (moved !== CARD_PREVIEW_DIVIDER && boundary === 0 && targets[0] === moved && targets.length > 1) {
    [targets[0], targets[1]] = [targets[1], targets[0]];
  }
  return { targets, previewCount: cardPreviewLimit(count, targets.length) };
}

export function favoriteKey(kind: ProfileModuleId, id: string | number, server?: BandoriServer | null) {
  const regional = kind === "events" || (kind === "cards" && isKnownBandoriCardEntityCollision(id));
  return [kind, ...(regional && server != null ? [getBandoriServerCode(server)] : []), id].join(":");
}

export function parseFavoriteKey(key: string) {
  const match = /^(cards|events|songs):(?:(jp|en|tw|cn):)?([1-9]\d{0,8})$/u.exec(key);
  if (!match) return null;
  const [, kind, code, id] = match;
  if (kind === "events" && !code || kind === "songs" && code) return null;
  if (kind === "cards" && (isKnownBandoriCardEntityCollision(id) ? code !== "en" && code !== "cn" : Boolean(code))) return null;
  return { kind: kind as ProfileModuleId, id, server: code ? parseBandoriServerParam(code) : null, target: code ? code + ":" + id : id };
}

// The timeline supplies dated events chronologically, followed by pending events in ID order.
export function eventPreview<T extends { end: number }>(items: T[], now: number) {
  const past = items.filter(item => item.end < now);
  const upcoming = items.filter(item => item.end >= now);
  const pastCount = Math.min(past.length, Math.max(1, EVENT_PREVIEW_MAX - upcoming.length));
  return [...past.slice(past.length - pastCount), ...upcoming.slice(0, EVENT_PREVIEW_MAX - pastCount)];
}
