export {
  EVENT_TIERS,
  getTiersForMode,
  MONTHLY_TIERS,
  SONG_TIERS,
} from "@/lib/bandori-tracker-tiers";

const INSTANT_PROJECTION_STORAGE_KEY = "eventtracker_projection_instant";
const DAY_PROJECTION_STORAGE_KEY = "eventtracker_projection_24h";

/** 根据追踪模式返回对应的可选排名档位列表。 */
function readLegacyProjectionCookie(cookieName: string): boolean | null {
  if (typeof document === "undefined") return null;

  const found = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));

  if (!found) return null;
  const rawValue = found.slice(cookieName.length + 1).toLowerCase();
  if (rawValue === "1" || rawValue === "true") return true;
  if (rawValue === "0" || rawValue === "false") return false;
  return null;
}

function clearLegacyProjectionCookie(cookieName: string) {
  if (typeof document === "undefined") return;

  document.cookie = `${cookieName}=; path=/; max-age=0; samesite=lax`;
}

/** 从 localStorage 读取投影开关状态（true/false/null 表示未设置过），并兼容迁移旧 cookie。 */
export function readProjectionPreference(storageKey: string): boolean | null {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(storageKey)?.toLowerCase() ?? null;
    if (rawValue === "1" || rawValue === "true") {
      return true;
    }
    if (rawValue === "0" || rawValue === "false") {
      return false;
    }
  } catch {
    return null;
  }

  const legacyValue = readLegacyProjectionCookie(storageKey);
  if (legacyValue !== null) {
    writeProjectionPreference(storageKey, legacyValue);
    clearLegacyProjectionCookie(storageKey);
  }

  return legacyValue;
}

/** 将投影开关状态写入 localStorage；这类纯前端偏好不再占用 cookie。 */
export function writeProjectionPreference(storageKey: string, value: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, value ? "1" : "0");
  } catch {
    return;
  }

  clearLegacyProjectionCookie(storageKey);
}

export { INSTANT_PROJECTION_STORAGE_KEY, DAY_PROJECTION_STORAGE_KEY };
