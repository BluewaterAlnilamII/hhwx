import "server-only";

import { ApiRouteError } from "@/lib/api-contracts";
import { getBandoriBackendToken } from "@/lib/hhwx-bandori-backend-server";
import type { GameProfileLoginTask } from "@/lib/user-game-profile-sync";

export type TrackerUserSnapshotPayload = {
  gameUid?: string;
  fetchedAt?: string;
  summary?: unknown;
  snapshot?: {
    profile?: unknown;
    suite_user?: unknown;
    [key: string]: unknown;
  };
};

type LoginAction = "start" | "confirm";
const ERROR_MESSAGES: Record<string, string> = {
  USER_SNAPSHOT_UNAVAILABLE: "游戏档案自动同步暂不可用",
  LOGIN_TASK_ACTIVE: "同步服务繁忙，请稍后再试",
  LOGIN_TASK_BUSY: "同步服务繁忙，请稍后再试",
  LOGIN_ACCOUNT_BUSY: "该 Bilibili 账号正在同步，请稍后再试",
  LOGIN_TASK_NOT_FOUND: "登录任务已失效，请重新开始",
  LOGIN_TASK_EXPIRED: "登录任务已过期，请重新开始",
  LOGIN_TARGET_MISMATCH: "登录的 Bilibili 账号与目标游戏 UID 不匹配",
  LOGIN_GAME_MAINTENANCE: "游戏暂不可用，请稍后重新同步",
  LOGIN_VERIFICATION_FAILED: "登录验证或游戏数据读取失败，请重新开始",
  LOGIN_UPSTREAM_UNAVAILABLE: "官方登录服务暂不可用，请稍后再试",
  LOGIN_NOT_COMPLETED: "请先完成登录",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Both sides of this small JSON protocol are bounded before parsing.
export async function readSnapshotLoginJson(message: Request | Response, limit = 4096): Promise<unknown> {
  const reader = message.body?.getReader();
  if (!reader) throw new Error("Missing login payload");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Login payload too large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } finally {
    await reader.cancel();
  }
}

async function requestLogin(action: LoginAction, ownerId: string, gameUid: string, taskId?: string) {
  const baseUrl = process.env.HHWX_USER_FETCHER_BASE_URL?.trim();
  const token = getBandoriBackendToken();
  let endpoint: string;
  try {
    if (!baseUrl || !token) throw new Error();
    const base = new URL(baseUrl);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
    endpoint = `${base.href.replace(/\/+$/u, "")}/internal/hhwx-user-fetcher/user-snapshot`;
  } catch {
    throw new ApiRouteError(503, "TRACKER_SERVICE_NOT_CONFIGURED", "游戏账号同步服务尚未配置");
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ownerId, gameUid, ...(taskId ? { taskId } : {}) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(action === "start" ? 45_000 : 150_000),
    });
    payload = await readSnapshotLoginJson(response, action === "confirm" ? 16 * 1024 * 1024 : 16_384);
  } catch {
    throw new ApiRouteError(502, "TRACKER_SERVICE_FAILED", "同步游戏档案失败");
  }
  if (!response.ok) {
    const code = isRecord(payload) && typeof payload.code === "string" && Object.hasOwn(ERROR_MESSAGES, payload.code)
      ? payload.code : "TRACKER_SERVICE_FAILED";
    throw new ApiRouteError(response.status >= 500 ? 502 : response.status, code, ERROR_MESSAGES[code] ?? "游戏账号同步失败");
  }
  if (!isRecord(payload)) throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "同步服务返回格式无效");
  return payload;
}

export async function requestGameProfileLogin(ownerId: string, gameUid: string): Promise<GameProfileLoginTask> {
  const payload = await requestLogin("start", ownerId, gameUid);
  if (typeof payload.taskId !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(payload.taskId)
    || payload.gameUid !== gameUid || payload.status !== "waiting"
    || !Number.isInteger(payload.expiresIn) || (payload.expiresIn as number) <= 0
    || (payload.expiresIn as number) > 300) {
    throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "登录任务返回格式无效");
  }
  let loginUrl: string;
  try {
    if (typeof payload.loginUrl !== "string" || payload.loginUrl.length > 2048) throw new Error();
    const link = new URL(payload.loginUrl);
    if (link.origin !== "https://passport.bilibili.com" || link.username || link.password
      || link.pathname !== "/x/passport-tv-login/h5/qrcode/auth") throw new Error();
    loginUrl = link.href;
  } catch {
    throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "官方登录链接无效");
  }
  return { taskId: payload.taskId, gameUid, status: "waiting", loginUrl, expiresIn: payload.expiresIn as number };
}

export async function fetchGameUserSnapshot(ownerId: string, gameUid: string, taskId: string): Promise<TrackerUserSnapshotPayload> {
  const payload = await requestLogin("confirm", ownerId, gameUid, taskId);
  if (payload.gameUid !== gameUid || !isRecord(payload.snapshot)
    || !isRecord(payload.snapshot.profile) || !isRecord(payload.snapshot.suite_user)) {
    throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "游戏数据返回格式无效");
  }
  return { gameUid, snapshot: { profile: payload.snapshot.profile, suite_user: payload.snapshot.suite_user } };
}
