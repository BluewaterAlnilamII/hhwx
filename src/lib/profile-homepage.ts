import type { AccountDisplayDegreeBinding, AccountDisplayDegreeSelection } from "@/lib/account-display-degree";
import { getAccountDisplayDegreeVariants } from "@/lib/account-display-degree";
import type { BandoriDegreeCatalogItem } from "@/lib/bandori-degree-assets";
import { isBandoriServer, type BandoriServer } from "@/lib/bandori-server";
import { isValidPlayerUid } from "@/lib/bandori/player-profile";
import { eastAsianWidth } from "get-east-asian-width";

export type ProfileCard = { cardId: number; entityServer: BandoriServer | null; trainType: "normal" | "after_training" };
export type ProfileCover = ProfileCard & { x: number; y: number };
export const PROFILE_MODULES = ["cards", "events", "songs"] as const;
export const PROFILE_SIGNATURE_MAX_WIDTH = 80;
const signatureGraphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function signatureUnits(grapheme: string) {
  return /\p{Emoji_Presentation}|\uFE0F/u.test(grapheme) ? 2 : eastAsianWidth(grapheme.codePointAt(0)!);
}

// When editing in the middle, reserve the text after the caret before fitting the insertion.
export function fitProfileSignature(value: string, suffix = ""): string {
  let remaining = PROFILE_SIGNATURE_MAX_WIDTH;
  for (const { segment } of signatureGraphemes.segment(suffix)) remaining -= signatureUnits(segment);
  for (const { segment, index } of signatureGraphemes.segment(value)) {
    remaining -= signatureUnits(segment);
    if (remaining < 0) return value.slice(0, index);
  }
  return value;
}
export const DEFAULT_BINDING_VISIBILITY = { public: true, titlesPublic: false } as const;
export type ProfileModuleId = typeof PROFILE_MODULES[number];
export function profileAccountKey(account: { server: BandoriServer; gameUid: string }) {
  return `${account.server}:${account.gameUid}`;
}
export type ProfileAccountPreference = { server: BandoriServer; gameUid: string; public: boolean; titlesPublic: boolean };
export type ProfileHomepagePreferences = {
  signature: string;
  cover: ProfileCover | null;
  publicAccounts: boolean;
  allowGameIdSearch: boolean;
  modules: { id: ProfileModuleId; public: boolean }[];
  accounts: ProfileAccountPreference[];
};
export type ProfileBinding = AccountDisplayDegreeBinding & { playerName: string | null; public: boolean; titlesPublic: boolean };
export type ProfileHomepage = {
  publicUid: number; username: string; createdAt: string | null;
  avatar: ProfileCard; displayDegree: AccountDisplayDegreeSelection;
  signature: string; cover: ProfileCover | null;
  isOwner: boolean; bindings: ProfileBinding[];
  preferences: ProfileHomepagePreferences | null;
};

export function defaultHomepagePreferences(): ProfileHomepagePreferences {
  return { signature: "", cover: null, publicAccounts: true, allowGameIdSearch: true,
    modules: PROFILE_MODULES.map(id => ({ id, public: true })), accounts: [] };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseHomepagePatch(value: unknown): Partial<ProfileHomepagePreferences> | null {
  if (!record(value) || !Object.keys(value).length) return null;
  if (Object.keys(value).some(key => !Object.hasOwn(defaultHomepagePreferences(), key))) return null;
  const patch: Partial<ProfileHomepagePreferences> = {};
  if (Object.hasOwn(value, "signature")) {
    if (typeof value.signature !== "string") return null;
    patch.signature = value.signature.trim();
    if (fitProfileSignature(patch.signature) !== patch.signature) return null;
  }
  if (Object.hasOwn(value, "cover")) {
    const cover = value.cover;
    if (cover === null) patch.cover = null;
    else {
      if (!record(cover) || Object.keys(cover).sort().join() !== "cardId,entityServer,trainType,x,y"
        || !Number.isSafeInteger(cover.cardId) || (cover.cardId as number) <= 0 || (cover.cardId as number) > 2147483647
        || (cover.entityServer !== null && !isBandoriServer(cover.entityServer))
        || (cover.trainType !== "normal" && cover.trainType !== "after_training")
        || [cover.x, cover.y].some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100)) return null;
      patch.cover = cover as ProfileCover;
    }
  }
  for (const key of ["publicAccounts", "allowGameIdSearch"] as const) {
    if (!Object.hasOwn(value, key)) continue;
    if (typeof value[key] !== "boolean") return null;
    patch[key] = value[key];
  }
  if (Object.hasOwn(value, "modules")) {
    if (!Array.isArray(value.modules) || value.modules.length !== PROFILE_MODULES.length
      || value.modules.some(m => !record(m) || Object.keys(m).length !== 2 || !PROFILE_MODULES.includes(m.id as ProfileModuleId) || typeof m.public !== "boolean")
      || new Set(value.modules.map(m => m.id)).size !== PROFILE_MODULES.length) return null;
    patch.modules = value.modules;
  }
  if (Object.hasOwn(value, "accounts")) {
    if (!Array.isArray(value.accounts) || value.accounts.some(a => !record(a)
      || !["gameUid,public,server,titlesPublic", "gameUid,public,titlesPublic"].includes(Object.keys(a).sort().join())
      || (a.server !== undefined && !isBandoriServer(a.server))
      || typeof a.gameUid !== "string" || !isValidPlayerUid(a.gameUid) || /^0\d/u.test(a.gameUid)
      || typeof a.public !== "boolean" || typeof a.titlesPublic !== "boolean")
    ) return null;
    const accounts = value.accounts.map(a => ({ ...a, server: a.server ?? 3 }));
    if (new Set(accounts.map(profileAccountKey)).size !== accounts.length) return null;
    patch.accounts = accounts;
  }
  return patch;
}

// Effective visibility is shared by the API projection and the settings controls.
export function bindingVisibility(publicAccounts: boolean, account: ProfileAccountPreference) {
  const visible = publicAccounts && account.public;
  return { public: visible, titlesPublic: visible && account.titlesPublic };
}

export function projectProfileBindings(bindings: ProfileBinding[], preferences: ProfileHomepagePreferences, isOwner: boolean): ProfileBinding[] {
  const order = new Map(preferences.accounts.map((a, i) => [profileAccountKey(a), i]));
  return bindings.flatMap(binding => {
    const preference = preferences.accounts.find(a => a.server === binding.server && a.gameUid === binding.gameUid)
      ?? { server: binding.server, gameUid: binding.gameUid, ...DEFAULT_BINDING_VISIBILITY };
    const visibility = bindingVisibility(preferences.publicAccounts, preference);
    if (!isOwner && !visibility.public) return [];
    return [{ ...binding, ...visibility, playerName: binding.playerName?.trim() || null,
      ownedDegreeIds: isOwner || visibility.titlesPublic ? binding.ownedDegreeIds : [],
      ownedDegreeEffectIds: isOwner || visibility.titlesPublic ? binding.ownedDegreeEffectIds : [] }];
  }).sort((a, b) => (order.get(profileAccountKey(a)) ?? Infinity) - (order.get(profileAccountKey(b)) ?? Infinity)
    || a.gameUid.localeCompare(b.gameUid, "en", { numeric: true }));
}

export function groupProfileDegrees(account: AccountDisplayDegreeBinding, degrees: ReadonlyMap<number, BandoriDegreeCatalogItem>) {
  const variants = getAccountDisplayDegreeVariants(account, degrees);
  const groups = Array.from({ length: 5 }, () => [] as typeof variants);
  for (const variant of variants) {
    const { degree, degreeEffectId } = variant;
    const group = degreeEffectId !== null || degree.baseImageName.includes("ani_degree") ? 4
      : degree.characterId > 0 ? 1 : degree.degreeType === "event_point" ? 2
      : ["score_ranking", "try_clear"].includes(degree.degreeType) ? 3 : 0;
    groups[group].push(variant);
  }
  groups[4].sort((a, b) => Number(b.degreeEffectId !== null) - Number(a.degreeEffectId !== null)
    || a.degree.seq - b.degree.seq || a.degree.id - b.degree.id);
  return groups;
}
