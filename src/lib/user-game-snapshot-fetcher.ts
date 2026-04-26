import { ApiRouteError } from "@/lib/api-contracts";

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

export async function fetchGameUserSnapshot(gameUid: string): Promise<TrackerUserSnapshotPayload> {
  const baseUrl = process.env.HHWX_USER_FETCHER_BASE_URL?.trim();
  const token = process.env.HHWX_USER_FETCHER_TOKEN?.trim();

  if (!baseUrl || !token) {
    throw new ApiRouteError(500, "TRACKER_SERVICE_NOT_CONFIGURED", "游戏账号同步服务尚未配置");
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/internal/hhwx-user-fetcher/user-snapshot`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ gameUid }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as TrackerUserSnapshotPayload | { error?: unknown; details?: unknown } | null;

  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiRouteError(503, "TRACKER_SERVICE_BUSY", "游戏账号同步服务繁忙，请稍后再试", payload);
    }

    throw new ApiRouteError(response.status >= 500 ? 502 : 400, "TRACKER_SERVICE_FAILED", "读取游戏账号数据失败", payload);
  }

  if (!payload || typeof payload !== "object" || !("snapshot" in payload)) {
    throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "游戏账号同步服务返回格式无效");
  }

  return payload as TrackerUserSnapshotPayload;
}
