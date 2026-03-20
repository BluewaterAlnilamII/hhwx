import type { TrackingMode } from "./types";

export const EVENT_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 40000, 50000, 70000, 100000];
export const SONG_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000];
export const MONTHLY_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 500, 1000, 2000, 3000, 4000];

const INSTANT_PROJECTION_COOKIE = "eventtracker_projection_instant";
const DAY_PROJECTION_COOKIE = "eventtracker_projection_24h";

/** 根据追踪模式返回对应的可选排名档位列表。 */
export function getTiersForMode(mode: TrackingMode): number[] {
  if (mode === "event") return EVENT_TIERS;
  if (mode === "song") return SONG_TIERS;
  return MONTHLY_TIERS;
}

/** 从 cookie 读取投影开关状态（true/false/null 表示未设置过）。 */
export function readProjectionCookie(cookieName: string): boolean | null {
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

/** 将投影开关状态写入 cookie，有效期 1 年。 */
export function writeProjectionCookie(cookieName: string, value: boolean) {
  if (typeof document === "undefined") return;
  document.cookie = `${cookieName}=${value ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}

export { INSTANT_PROJECTION_COOKIE, DAY_PROJECTION_COOKIE };
