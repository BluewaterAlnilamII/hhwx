import { SONG_META_SORTS, type SongMetaSort } from "@/lib/song-meta";

export type BandoriMetaPreferences = {
  fever: boolean;
  liveSkill: string;
  liveLevel: number;
  perfect: number;
  downtime: number;
  metaSort: SongMetaSort;
  metaDirection: "asc" | "desc";
};

export const BANDORI_META_PREFERENCES_KEY = "hhwx:bandori:song-meta-preferences:v1";
export const BANDORI_META_DEFAULT_PREFERENCES: BandoriMetaPreferences = {
  fever: true, liveSkill: "69", liveLevel: 5,
  perfect: 100, downtime: 30, metaSort: "score", metaDirection: "desc",
};

function validPreferences(value: unknown): Partial<BandoriMetaPreferences> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>, result: Partial<BandoriMetaPreferences> = {};
  if (raw.fever === true || raw.fever === "true") result.fever = true;
  if (raw.fever === false || raw.fever === "false") result.fever = false;
  const id = raw.liveSkill;
  if (typeof id === "string" && /^[1-9]\d*$/u.test(id) && Number.isSafeInteger(Number(id))) result.liveSkill = id;
  for (const [key, minimum, maximum, integer] of [
    ["liveLevel", 1, 5, true], ["perfect", 0, 100, false], ["downtime", 0, 3600, false],
  ] as const) {
    const input = raw[key];
    const number = typeof input === "number" ? input : typeof input === "string" && input.trim() ? Number(input) : NaN;
    if (Number.isFinite(number) && number >= minimum && number <= maximum && (!integer || Number.isInteger(number))) result[key] = number;
  }
  if (SONG_META_SORTS.includes(raw.metaSort as SongMetaSort)) result.metaSort = raw.metaSort as SongMetaSort;
  if (raw.metaDirection === "asc" || raw.metaDirection === "desc") result.metaDirection = raw.metaDirection;
  return result;
}

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
function browserStorage(): PreferenceStorage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function readBandoriMetaPreferences(storage: PreferenceStorage | null = browserStorage()): BandoriMetaPreferences {
  try {
    return { ...BANDORI_META_DEFAULT_PREFERENCES, ...validPreferences(JSON.parse(storage?.getItem(BANDORI_META_PREFERENCES_KEY) ?? "null")) };
  } catch { return { ...BANDORI_META_DEFAULT_PREFERENCES }; }
}

export function writeBandoriMetaPreferences(preferences: BandoriMetaPreferences, storage: PreferenceStorage | null = browserStorage()): void {
  try {
    storage?.setItem(BANDORI_META_PREFERENCES_KEY, JSON.stringify({ ...BANDORI_META_DEFAULT_PREFERENCES, ...validPreferences(preferences) }));
  } catch {
    // Optional persistence must not interrupt the current Meta configuration.
  }
}

export function resolveBandoriMetaPreferences(query: string, preferences: BandoriMetaPreferences,
  liveSkillIds: readonly string[]): BandoriMetaPreferences {
  const explicit = validPreferences(Object.fromEntries(new URLSearchParams(query)));
  const settings = { ...preferences, ...explicit };
  settings.liveSkill = [explicit.liveSkill, preferences.liveSkill, BANDORI_META_DEFAULT_PREFERENCES.liveSkill]
    .find((id) => id !== undefined && liveSkillIds.includes(id)) ?? BANDORI_META_DEFAULT_PREFERENCES.liveSkill;
  return settings;
}

export function bandoriMetaPreferencesQuery(query: string, settings: BandoriMetaPreferences): string {
  const params = new URLSearchParams(query);
  params.delete("server");
  for (const key of Object.keys(BANDORI_META_DEFAULT_PREFERENCES) as (keyof BandoriMetaPreferences)[]) params.set(key, String(settings[key]));
  return params.toString();
}
