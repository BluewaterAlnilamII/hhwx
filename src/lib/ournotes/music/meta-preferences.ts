import { OURNOTES_META_DEFAULT_SKILLS, OURNOTES_META_SORTS, type OurNotesMetaSort } from "./meta";

export type OurNotesMetaPreferences = {
  mode: "free";
  liveSkill: string;
  liveLevel: number;
  supportSkill: string;
  supportLevel: number;
  perfect: number;
  downtime: number;
  metaSort: OurNotesMetaSort;
  metaDirection: "asc" | "desc";
};

export const OURNOTES_META_PREFERENCES_KEY = "hhwx:ournotes:song-meta-preferences:v1";
export const OURNOTES_META_DEFAULT_PREFERENCES: OurNotesMetaPreferences = {
  mode: "free", liveSkill: OURNOTES_META_DEFAULT_SKILLS.live, liveLevel: 5,
  supportSkill: OURNOTES_META_DEFAULT_SKILLS.support, supportLevel: 5,
  perfect: 100, downtime: 30, metaSort: "score", metaDirection: "desc",
};

function validPreferences(value: unknown): Partial<OurNotesMetaPreferences> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>, result: Partial<OurNotesMetaPreferences> = {};
  if (raw.mode === "free") result.mode = raw.mode;
  for (const key of ["liveSkill", "supportSkill"] as const) {
    const id = raw[key];
    if (typeof id === "string" && (/^[1-9]\d*$/u.test(id) && Number.isSafeInteger(Number(id))
      || key === "supportSkill" && id === "none")) result[key] = id;
  }
  for (const [key, minimum, maximum, integer] of [
    ["liveLevel", 1, 5, true], ["supportLevel", 1, 5, true], ["perfect", 0, 100, false], ["downtime", 0, 3600, false],
  ] as const) {
    const input = raw[key];
    const number = typeof input === "number" ? input : typeof input === "string" && input.trim() ? Number(input) : NaN;
    if (Number.isFinite(number) && number >= minimum && number <= maximum && (!integer || Number.isInteger(number))) result[key] = number;
  }
  if (OURNOTES_META_SORTS.includes(raw.metaSort as OurNotesMetaSort)) result.metaSort = raw.metaSort as OurNotesMetaSort;
  if (raw.metaDirection === "asc" || raw.metaDirection === "desc") result.metaDirection = raw.metaDirection;
  return result;
}

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
function browserStorage(): PreferenceStorage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function readOurNotesMetaPreferences(storage: PreferenceStorage | null = browserStorage()): OurNotesMetaPreferences {
  try {
    return { ...OURNOTES_META_DEFAULT_PREFERENCES, ...validPreferences(JSON.parse(storage?.getItem(OURNOTES_META_PREFERENCES_KEY) ?? "null")) };
  } catch { return { ...OURNOTES_META_DEFAULT_PREFERENCES }; }
}

export function writeOurNotesMetaPreferences(preferences: OurNotesMetaPreferences, storage: PreferenceStorage | null = browserStorage()): void {
  try {
    storage?.setItem(OURNOTES_META_PREFERENCES_KEY, JSON.stringify({ ...OURNOTES_META_DEFAULT_PREFERENCES, ...validPreferences(preferences) }));
  } catch {
    // Optional persistence must not interrupt the current Meta configuration.
  }
}

export function resolveOurNotesMetaPreferences(query: string, preferences: OurNotesMetaPreferences,
  liveSkillIds: readonly string[], supportSkillIds: readonly string[]): OurNotesMetaPreferences {
  const explicit = validPreferences(Object.fromEntries(new URLSearchParams(query)));
  const settings = { ...preferences, ...explicit };
  settings.liveSkill = [explicit.liveSkill, preferences.liveSkill, OURNOTES_META_DEFAULT_SKILLS.live]
    .find((id) => id !== undefined && liveSkillIds.includes(id)) ?? OURNOTES_META_DEFAULT_SKILLS.live;
  settings.supportSkill = [explicit.supportSkill, preferences.supportSkill, OURNOTES_META_DEFAULT_SKILLS.support]
    .find((id) => id !== undefined && (id === "none" || supportSkillIds.includes(id))) ?? "none";
  return settings;
}

export function ourNotesMetaPreferencesQuery(query: string, settings: OurNotesMetaPreferences): string {
  const params = new URLSearchParams(query);
  for (const key of Object.keys(OURNOTES_META_DEFAULT_PREFERENCES) as (keyof OurNotesMetaPreferences)[]) params.set(key, String(settings[key]));
  return params.toString();
}
