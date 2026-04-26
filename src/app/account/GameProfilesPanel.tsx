"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Download, FileJson, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import type { GameAccountBinding } from "@/lib/game-account-binding";
import {
  BESTDORI_CN_SERVER_ID,
  decodeBestdoriProfile,
  encodeBestdoriProfile,
  parseBestdoriProfile,
  type BestdoriProfile,
  type NormalizedBestdoriProfile,
} from "@/lib/bestdori-profile-codec";
import {
  decodeCompressedGameProfilePayload,
  exportBestdoriGameProfilePayload,
  exportCompactGameProfilePayload,
  type CompressedGameProfilePayload,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";
import {
  deleteLocalGameProfile,
  duplicateLocalGameProfile,
  isLocalGameProfileId,
  listLocalGameProfiles,
  readLocalCompressedGameProfile,
  readLocalGameProfilePayload,
  saveLocalGameProfilePayload,
  type LocalGameProfileSummary,
} from "@/lib/user-game-profile-local-store";
import { getAccessToken } from "./useAccountProfile";

type UserGameProfileKind = "auto" | "manual";

type CloudGameProfileSummary = {
  id: string;
  kind: UserGameProfileKind;
  name: string;
  server: number;
  sourceGameUid: string | null;
  isEditable: boolean;
  cardCount: number;
  syncedAt: string | null;
  updatedAt: string;
};

type ProfileSummary = (CloudGameProfileSummary & { location: "cloud" }) | LocalGameProfileSummary;

const USER_GAME_BINDING_LIMIT = 5;
const USER_GAME_AUTO_PROFILE_LIMIT = 5;
const USER_GAME_MANUAL_PROFILE_LIMIT = 10;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("请先登录");
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) || `请求失败（HTTP ${response.status}）`);
  }

  const data = parseApiSuccessData<T>(payload);
  if (data === null) {
    throw new Error("接口返回格式无效");
  }

  return data;
}

async function requestCloudCompressedPayload(profileId: string): Promise<CompressedGameProfilePayload> {
  return requestJson<CompressedGameProfilePayload>(`/api/account/game-profiles/${profileId}/payload`);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "尚未同步";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function profileKindLabel(profile: ProfileSummary): string {
  if (profile.location === "local") {
    return "本地手动";
  }
  return profile.kind === "auto" ? "自动同步" : "云端手动";
}

function payloadFromNormalizedProfile(
  profile: NormalizedBestdoriProfile,
  bestdoriProfile?: BestdoriProfile,
): UserGameProfilePayload {
  return {
    bestdoriProfile: bestdoriProfile ?? encodeBestdoriProfile(profile),
  };
}

function blankPayload(name: string): UserGameProfilePayload {
  return payloadFromNormalizedProfile({
    name,
    server: BESTDORI_CN_SERVER_ID,
    cards: [],
    items: {},
    potentials: [],
  });
}

export default function GameProfilesPanel() {
  const [cloudProfiles, setCloudProfiles] = useState<CloudGameProfileSummary[]>([]);
  const [localProfiles, setLocalProfiles] = useState<LocalGameProfileSummary[]>([]);
  const [bindings, setBindings] = useState<GameAccountBinding[]>([]);
  const [profileName, setProfileName] = useState("");
  const [importText, setImportText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const profiles = useMemo<ProfileSummary[]>(() => [
    ...cloudProfiles.map((profile) => ({ ...profile, location: "cloud" as const })),
    ...localProfiles,
  ], [cloudProfiles, localProfiles]);

  const profilesByUid = useMemo(() => {
    const mapped = new Map<string, CloudGameProfileSummary>();
    cloudProfiles.forEach((profile) => {
      if (profile.kind === "auto" && profile.sourceGameUid) {
        mapped.set(profile.sourceGameUid, profile);
      }
    });
    return mapped;
  }, [cloudProfiles]);

  const manualProfileCount = localProfiles.length;
  const autoProfileCount = cloudProfiles.filter((profile) => profile.kind === "auto").length;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextProfiles, nextBindings, nextLocalProfiles] = await Promise.all([
        requestJson<CloudGameProfileSummary[]>("/api/account/game-profiles"),
        requestJson<GameAccountBinding[]>("/api/account/game-bind/bindings"),
        listLocalGameProfiles(),
      ]);
      setCloudProfiles(nextProfiles);
      setBindings(nextBindings);
      setLocalProfiles(nextLocalProfiles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取游戏 Profile 失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const createManualProfile = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const name = profileName.trim() || "Manual Profile";
      await saveLocalGameProfilePayload(blankPayload(name), name);
      setProfileName("");
      setMessage("本地手动 Profile 已创建。");
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建本地手动 Profile 失败");
    } finally {
      setBusy(false);
    }
  }, [loadData, profileName]);

  const importProfile = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const bestdoriProfile = parseBestdoriProfile(JSON.parse(importText));
      const normalizedProfile = decodeBestdoriProfile(bestdoriProfile);
      await saveLocalGameProfilePayload(payloadFromNormalizedProfile(normalizedProfile, bestdoriProfile), normalizedProfile.name);
      setImportText("");
      setMessage("Bestdori Profile 已导入到本地。");
      await loadData();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入 Bestdori Profile 失败");
    } finally {
      setBusy(false);
    }
  }, [importText, loadData]);

  const syncAutoProfile = useCallback(async (gameUid: string) => {
    const confirmed = window.confirm(
      "本次同步会读取该游戏 UID 的卡牌、区域道具、角色潜能和角色任务加成数据。\n\n由于游戏接口机制，同步过程中可能会导致该 UID 当前登录中的游戏客户端掉线一次。确认继续同步？",
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestJson<CloudGameProfileSummary>("/api/account/game-profiles/sync", {
        method: "POST",
        body: JSON.stringify({ gameUid }),
      });
      setMessage(`UID ${gameUid} 已同步。`);
      await loadData();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "同步游戏数据失败");
    } finally {
      setBusy(false);
    }
  }, [loadData]);

  const copyProfile = useCallback(async (profile: ProfileSummary) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const name = `${profile.name} Copy`;
      if (profile.location === "local") {
        await duplicateLocalGameProfile(profile.id, name);
      } else {
        const payload = await decodeCompressedGameProfilePayload(await requestCloudCompressedPayload(profile.id));
        payload.bestdoriProfile.name = name;
        await saveLocalGameProfilePayload(payload, name);
      }
      setMessage("Profile 已拷贝为本地手动 Profile。");
      await loadData();
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "拷贝 Profile 失败");
    } finally {
      setBusy(false);
    }
  }, [loadData]);

  const uploadLocalProfile = useCallback(async (profile: LocalGameProfileSummary) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestJson<CloudGameProfileSummary>("/api/account/game-profiles/upload", {
        method: "POST",
        body: JSON.stringify({
          name: profile.name,
          compressed: await readLocalCompressedGameProfile(profile.id),
        }),
      });
      setMessage("本地 Profile 已上传到服务器。");
      await loadData();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传 Profile 失败");
    } finally {
      setBusy(false);
    }
  }, [loadData]);

  const downloadCloudProfile = useCallback(async (profile: CloudGameProfileSummary) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await decodeCompressedGameProfilePayload(await requestCloudCompressedPayload(profile.id));
      await saveLocalGameProfilePayload(payload, profile.name);
      setMessage("云端 Profile 已下载到本地。");
      await loadData();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "下载 Profile 失败");
    } finally {
      setBusy(false);
    }
  }, [loadData]);

  const exportProfile = useCallback(async (profile: ProfileSummary, format: "bestdori" | "full") => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (profile.location === "local") {
        const payload = await readLocalGameProfilePayload(profile.id);
        const exportPayload = format === "full"
          ? exportCompactGameProfilePayload(payload)
          : exportBestdoriGameProfilePayload(payload);
        await navigator.clipboard.writeText(JSON.stringify(exportPayload));
      } else {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("请先登录");
        }

        const response = await fetch(`/api/account/game-profiles/${profile.id}/export?format=${format}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload) || `请求失败（HTTP ${response.status}）`);
        }
        await navigator.clipboard.writeText(JSON.stringify(payload));
      }
      setMessage(format === "full" ? "完整 Profile JSON 已复制。" : "Bestdori Profile JSON 已复制。");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出 Profile 失败");
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteProfile = useCallback(async (profile: ProfileSummary) => {
    if (!window.confirm(`确认删除 Profile「${profile.name}」？`)) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (profile.location === "local") {
        await deleteLocalGameProfile(profile.id);
      } else {
        await requestJson<{ profileId: string }>(`/api/account/game-profiles/${profile.id}`, {
          method: "DELETE",
        });
      }
      setMessage("Profile 已删除。");
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除 Profile 失败");
    } finally {
      setBusy(false);
    }
  }, [loadData]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">游戏数据 Profile</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            自动 Profile 来自绑定 UID 的手动同步且不可编辑；手动 Profile 默认保存在本地，可按需上传到服务器或从服务器下载。
          </p>
        </div>
        <div className="text-sm text-slate-500">
          自动 {autoProfileCount}/{USER_GAME_AUTO_PROFILE_LIMIT} · 本地手动 {manualProfileCount}/{USER_GAME_MANUAL_PROFILE_LIMIT} · 绑定 {bindings.length}/{USER_GAME_BINDING_LIMIT}
        </div>
      </div>

      {(message || error) && (
        <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
        同步游戏数据可能导致对应 UID 当前登录中的游戏客户端掉线一次；自动同步 Profile 不允许直接编辑，可拷贝为本地手动 Profile 后修改。
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={profileName}
          onChange={(event) => setProfileName(event.target.value)}
          placeholder="新建本地手动 Profile 名称"
          className="h-11 rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
        />
        <button
          type="button"
          onClick={createManualProfile}
          disabled={busy || manualProfileCount >= USER_GAME_MANUAL_PROFILE_LIMIT}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Plus className="h-4 w-4" />
          新建
        </button>
      </div>

      <div className="mt-4">
        <textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder="粘贴 Bestdori Profile JSON"
          className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
        />
        <button
          type="button"
          onClick={importProfile}
          disabled={busy || !importText.trim() || manualProfileCount >= USER_GAME_MANUAL_PROFILE_LIMIT}
          className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <Upload className="h-4 w-4" />
          导入到本地
        </button>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-base font-semibold text-slate-900">已绑定 UID</h3>
        {bindings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">绑定游戏 UID 后可以创建自动同步 Profile。</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {bindings.map((binding) => {
              const profile = profilesByUid.get(binding.gameUid);
              return (
                <div key={binding.gameUid} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">UID {binding.gameUid}</div>
                      <div className="mt-1 text-sm text-slate-500">最后同步：{formatDate(profile?.syncedAt ?? null)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => syncAutoProfile(binding.gameUid)}
                      disabled={busy || (!profile && autoProfileCount >= USER_GAME_AUTO_PROFILE_LIMIT)}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <RefreshCw className="h-4 w-4" />
                      同步
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-base font-semibold text-slate-900">Profile 列表</h3>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">正在读取...</p>
        ) : profiles.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">暂无 Profile。</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {profiles.map((profile) => (
              <div key={profile.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{profile.name}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${profile.kind === "auto" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
                        {profileKindLabel(profile)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-500">
                      {profile.sourceGameUid ? `UID ${profile.sourceGameUid} · ` : ""}
                      卡牌 {profile.cardCount}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/account/game-profiles/${encodeURIComponent(profile.id)}/cards`}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
                    >
                      卡牌
                    </a>
                    <a
                      href={`/account/game-profiles/${encodeURIComponent(profile.id)}/items`}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
                    >
                      道具
                    </a>
                    <button
                      type="button"
                      onClick={() => exportProfile(profile, "bestdori")}
                      disabled={busy}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
                    >
                      <Download className="h-4 w-4" />
                      导出为Bestdori格式
                    </button>
                    <button
                      type="button"
                      onClick={() => exportProfile(profile, "full")}
                      disabled={busy}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <Download className="h-4 w-4" />
                      完整导出
                    </button>
                    {profile.location === "local" ? (
                      <button
                        type="button"
                        onClick={() => uploadLocalProfile(profile)}
                        disabled={busy}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <Upload className="h-4 w-4" />
                        上传
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => downloadCloudProfile(profile)}
                        disabled={busy || manualProfileCount >= USER_GAME_MANUAL_PROFILE_LIMIT}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <Download className="h-4 w-4" />
                        下载到本地
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => copyProfile(profile)}
                      disabled={busy || manualProfileCount >= USER_GAME_MANUAL_PROFILE_LIMIT}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <Copy className="h-4 w-4" />
                      拷贝
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProfile(profile)}
                      disabled={busy}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </button>
                  </div>
                </div>
                {profile.kind === "manual" && (
                  <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <FileJson className="h-3.5 w-3.5" />
                    {isLocalGameProfileId(profile.id) ? "保存在本地浏览器" : "保存在服务器"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
