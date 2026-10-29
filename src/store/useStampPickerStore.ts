"use client";

import { create } from "zustand";
import { BANDORI_CHARACTER_GROUPS } from "@/lib/bandori-character-groups";
import { buildStampShortcode } from "@/lib/comments/comment-content";
import { COMMENT_STAMP_DEFAULT_REGION, isCommentStampRegion, type CommentStamp, type CommentStampRegion } from "@/lib/comments/stamps";

export const STAMP_FAVORITES_STORAGE_KEY = "hhwx:stamp-favorites:v1";
export const STAMP_PICKER_SESSION_KEY = "hhwx:stamp-picker:v1";
export const STAMP_CATEGORIES = ["all", "favorites", ...BANDORI_CHARACTER_GROUPS.map((band) => band.key), "other"];
const stampKeyPattern = /^:stamp-(cn|jp|en|tw)-[1-9]\d{0,5}(?:-changed)?:$/u;
const characterBands = new Map(BANDORI_CHARACTER_GROUPS.flatMap((band) => band.characterIds.map((id) => [id, band.key] as const)));

export function selectStampPickerItems(stamps: readonly CommentStamp[], category: string, favorites: readonly string[]): readonly CommentStamp[] {
  if (category === "all") return stamps;
  if (category === "favorites") {
    const favoriteKeys = new Set(favorites);
    return stamps.filter((stamp) => favoriteKeys.has(buildStampShortcode(stamp)));
  }
  return stamps.filter((stamp) => (characterBands.get(stamp.characterId ?? 0) ?? "other") === category);
}

export type StampPickerPosition = { stampKey: string; offset: number; scrollTop: number };
type PickerSession = {
  region: CommentStampRegion;
  category: string;
  positions: Record<string, StampPickerPosition>;
  categoryScroll: { horizontal: number; vertical: number };
};

function readStorage(storage: "localStorage" | "sessionStorage", key: string): unknown {
  try { return JSON.parse(window[storage].getItem(key) ?? "null"); }
  catch { return undefined; }
}

function writeStorage(storage: "localStorage" | "sessionStorage", key: string, value: unknown) {
  try { window[storage].setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

function parseFavorites(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((key): key is string => typeof key === "string" && stampKeyPattern.test(key)))] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseSession(value: unknown): PickerSession {
  const session: PickerSession = { region: COMMENT_STAMP_DEFAULT_REGION, category: "all", positions: {}, categoryScroll: { horizontal: 0, vertical: 0 } };
  if (!isRecord(value)) return session;
  if (typeof value.region === "string" && isCommentStampRegion(value.region)) session.region = value.region;
  if (typeof value.category === "string" && STAMP_CATEGORIES.includes(value.category)) session.category = value.category;
  if (isRecord(value.positions)) {
    for (const [key, position] of Object.entries(value.positions)) {
      const [region, category, extra] = key.split(":");
      if (!isCommentStampRegion(region) || !STAMP_CATEGORIES.includes(category) || extra !== undefined || !isRecord(position)) continue;
      if (typeof position.stampKey !== "string" || !stampKeyPattern.test(position.stampKey) || !isOffset(position.offset) || !isOffset(position.scrollTop)) continue;
      session.positions[key] = { stampKey: position.stampKey, offset: position.offset, scrollTop: position.scrollTop };
    }
  }
  if (isRecord(value.categoryScroll)) {
    for (const axis of ["horizontal", "vertical"] as const) {
      if (isOffset(value.categoryScroll[axis])) session.categoryScroll[axis] = value.categoryScroll[axis];
    }
  }
  return session;
}

type StampPickerStore = PickerSession & {
  hydrated: boolean;
  favorites: string[];
  pendingFavorites: Record<string, boolean>;
  hydrate: () => void;
  syncFavorites: () => void;
  setRegion: (region: CommentStampRegion) => void;
  setCategory: (category: string) => void;
  toggleFavorite: (stamp: CommentStamp) => void;
  rememberPosition: (key: string, position: StampPickerPosition) => void;
  rememberCategoryScroll: (axis: "horizontal" | "vertical", offset: number) => void;
  persistSession: () => void;
};

export const useStampPickerStore = create<StampPickerStore>((set, get) => ({
  ...parseSession(null), hydrated: false, favorites: [], pendingFavorites: {},
  hydrate: () => {
    if (get().hydrated) { get().syncFavorites(); return; }
    set({ ...parseSession(readStorage("sessionStorage", STAMP_PICKER_SESSION_KEY)), favorites: parseFavorites(readStorage("localStorage", STAMP_FAVORITES_STORAGE_KEY)), hydrated: true });
  },
  syncFavorites: () => {
    const value = readStorage("localStorage", STAMP_FAVORITES_STORAGE_KEY);
    if (value === undefined) return;
    const favorites = new Set(parseFavorites(value));
    // Failed writes remain local edits, even when another tab updates storage.
    for (const [key, favorite] of Object.entries(get().pendingFavorites)) {
      if (favorite) favorites.add(key);
      else favorites.delete(key);
    }
    set({ favorites: [...favorites] });
  },
  setRegion: (region) => { set({ region }); get().persistSession(); },
  setCategory: (category) => {
    if (category === get().category) return;
    set({ category, positions: {} });
    get().persistSession();
  },
  toggleFavorite: (stamp) => {
    const key = buildStampShortcode(stamp);
    const favorite = !get().favorites.includes(key);
    get().syncFavorites();
    const keys = new Set(get().favorites);
    if (favorite) keys.add(key);
    else keys.delete(key);
    const favorites = [...keys];
    const saved = writeStorage("localStorage", STAMP_FAVORITES_STORAGE_KEY, favorites);
    set({ favorites, pendingFavorites: saved ? {} : { ...get().pendingFavorites, [key]: favorite } });
  },
  rememberPosition: (key, position) => set((state) => ({ positions: { ...state.positions, [key]: position } })),
  rememberCategoryScroll: (axis, offset) => set((state) => ({ categoryScroll: { ...state.categoryScroll, [axis]: offset } })),
  persistSession: () => {
    const { region, category, positions, categoryScroll, hydrated } = get();
    if (hydrated) writeStorage("sessionStorage", STAMP_PICKER_SESSION_KEY, { region, category, positions, categoryScroll });
  },
}));
