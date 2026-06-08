"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Download, FileJson, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import type { GameAccountBinding, GameBindChallenge } from "@/lib/game-account-binding";
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
  importBestdoriGameProfilePayload,
  type CompressedGameProfilePayload,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";
import {
  deleteLocalGameProfile,
  duplicateLocalGameProfile,
  listLocalGameProfiles,
  readLocalCompressedGameProfile,
  readLocalGameProfilePayload,
  saveLocalGameProfilePayload,
  updateLocalGameProfilePayload,
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
  localProfileId: string | null;
  isEditable: boolean;
  cardCount: number;
  syncedAt: string | null;
  updatedAt: string;
};

type ManagedProfileSummary = {
  id: string;
  name: string;
  kind: UserGameProfileKind;
  label: string;
  sourceGameUid: string | null;
  cardCount: number;
  syncAt: string | null;
  viewProfileId: string;
  localProfile: LocalGameProfileSummary | null;
  cloudProfile: CloudGameProfileSummary | null;
};

type VerifyResult = {
  gameUid: string;
  transferred: boolean;
};

type BusyAction =
  | { type: "challenge" }
  | { type: "verify" }
  | { type: "unbind"; gameUid: string }
  | { type: "create" }
  | { type: "import" }
  | { type: "copy"; profileId: string }
  | { type: "upload"; profileId: string }
  | { type: "download"; profileId: string }
  | { type: "export"; profileId: string }
  | { type: "delete"; profileId: string };

type ExportedProfilePayload = {
  profileId: string;
  label: string;
  json: string;
};

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
    return "无";
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

function profileSortTime(profile: ManagedProfileSummary): string {
  return profile.syncAt ?? profile.localProfile?.updatedAt ?? profile.cloudProfile?.updatedAt ?? "";
}

function compareGameUid(left: string | null, right: string | null): number {
  const leftNumber = left ? Number(left) : Number.POSITIVE_INFINITY;
  const rightNumber = right ? Number(right) : Number.POSITIVE_INFINITY;
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return (left ?? "").localeCompare(right ?? "");
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
  const [gameUid, setGameUid] = useState("");
  const [challenge, setChallenge] = useState<GameBindChallenge | null>(null);
  const [copiedChallenge, setCopiedChallenge] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [importText, setImportText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [syncingUid, setSyncingUid] = useState<string | null>(null);
  const [exportedPayload, setExportedPayload] = useState<ExportedProfilePayload | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = busyAction !== null;
  const writeBusy = busy || syncingUid !== null;
  const normalizedUid = useMemo(() => gameUid.trim(), [gameUid]);

  const profiles = useMemo<ManagedProfileSummary[]>(() => {
    const autoProfiles = cloudProfiles
      .filter((profile) => profile.kind === "auto")
      .map((profile) => ({
        id: `cloud:${profile.id}`,
        name: profile.name,
        kind: profile.kind,
        label: "自动同步",
        sourceGameUid: profile.sourceGameUid,
        cardCount: profile.cardCount,
        syncAt: profile.syncedAt,
        viewProfileId: profile.id,
        localProfile: null,
        cloudProfile: profile,
      }));

    const manualCloudProfiles = cloudProfiles.filter((profile) => profile.kind === "manual");
    const cloudById = new Map(manualCloudProfiles.map((profile) => [profile.id, profile]));
    const cloudByLocalId = new Map(
      manualCloudProfiles
        .filter((profile) => profile.localProfileId)
        .map((profile) => [profile.localProfileId as string, profile]),
    );
    const pairedCloudIds = new Set<string>();

    const manualProfiles = localProfiles.map((profile) => {
      const cloudProfile = (profile.cloudProfileId ? cloudById.get(profile.cloudProfileId) : undefined)
        ?? cloudByLocalId.get(profile.id)
        ?? null;
      if (cloudProfile) {
        pairedCloudIds.add(cloudProfile.id);
      }

      return {
        id: `local:${profile.id}`,
        name: profile.name,
        kind: profile.kind,
        label: "手动档案",
        sourceGameUid: null,
        cardCount: profile.cardCount,
        syncAt: cloudProfile?.updatedAt ?? null,
        viewProfileId: profile.id,
        localProfile: profile,
        cloudProfile,
      };
    }).sort((left, right) => profileSortTime(right).localeCompare(profileSortTime(left)));

    const cloudOnlyProfiles = manualCloudProfiles
      .filter((profile) => !pairedCloudIds.has(profile.id))
      .map((profile) => ({
        id: `cloud:${profile.id}`,
        name: profile.name,
        kind: profile.kind,
        label: "云端档案",
        sourceGameUid: profile.sourceGameUid,
        cardCount: profile.cardCount,
        syncAt: profile.updatedAt,
        viewProfileId: profile.id,
        localProfile: null,
        cloudProfile: profile,
      }))
      .sort((left, right) => profileSortTime(right).localeCompare(profileSortTime(left)));

    return [
      ...autoProfiles.sort((left, right) => compareGameUid(left.sourceGameUid, right.sourceGameUid)),
      ...cloudOnlyProfiles,
      ...manualProfiles,
    ];
  }, [cloudProfiles, localProfiles]);

  const profilesByUid = useMemo(() => {
    const mapped = new Map<string, CloudGameProfileSummary>();
    cloudProfiles.forEach((profile) => {
      if (profile.kind === "auto" && profile.sourceGameUid) {
        mapped.set(profile.sourceGameUid, profile);
      }
    });
    return mapped;
  }, [cloudProfiles]);

  const sortedBindings = useMemo(() => (
    [...bindings].sort((left, right) => compareGameUid(left.gameUid, right.gameUid))
  ), [bindings]);

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
      setError(loadError instanceof Error ? loadError.message : "读取游戏档案失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const createChallenge = useCallback(async () => {
    setBusyAction({ type: "challenge" });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const nextChallenge = await requestJson<GameBindChallenge>("/api/account/game-bind/challenge", {
        method: "POST",
        body: JSON.stringify({ gameUid: normalizedUid }),
      });
      setChallenge(nextChallenge);
      setCopiedChallenge(false);
      setMessage("验证码已生成，请填入游戏内个性签名。");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建验证码失败");
    } finally {
      setBusyAction(null);
    }
  }, [normalizedUid]);

  const verifyChallenge = useCallback(async () => {
    if (!challenge) {
      return;
    }

    setBusyAction({ type: "verify" });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const result = await requestJson<VerifyResult>("/api/account/game-bind/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: challenge.id }),
      });
      setMessage(result.transferred ? "绑定成功，该 UID 已从旧账号转移到当前账号。" : "绑定成功。");
      setChallenge(null);
      setCopiedChallenge(false);
      setGameUid("");
      await loadData();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "验证失败");
    } finally {
      setBusyAction(null);
    }
  }, [challenge, loadData]);

  const copyChallenge = useCallback(() => {
    if (!challenge) {
      return;
    }

    void navigator.clipboard?.writeText(challenge.challenge).then(() => {
      setCopiedChallenge(true);
      window.setTimeout(() => setCopiedChallenge(false), 1600);
    }).catch(() => undefined);
  }, [challenge]);

  const unbindGameUid = useCallback(async (targetUid: string) => {
    const profile = profilesByUid.get(targetUid);
    const confirmed = window.confirm(
      `确认解绑游戏 UID ${targetUid}？解绑会删除该 UID 与当前网页账号的绑定关系，并同时删除对应的自动同步档案${profile ? `「${profile.name}」` : ""}。`,
    );
    if (!confirmed) {
      return;
    }

    setBusyAction({ type: "unbind", gameUid: targetUid });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      await requestJson<{ gameUid: string }>(`/api/account/game-bind/bindings/${encodeURIComponent(targetUid)}`, {
        method: "DELETE",
      });
      setMessage(`UID ${targetUid} 已解绑，对应自动同步档案已删除。`);
      await loadData();
    } catch (unbindError) {
      setError(unbindError instanceof Error ? unbindError.message : "解绑失败");
    } finally {
      setBusyAction(null);
    }
  }, [loadData, profilesByUid]);

  const syncAutoProfile = useCallback(async (targetUid: string) => {
    const confirmed = window.confirm(
      "本次同步会读取该游戏 UID 的卡牌、区域道具、角色潜能和角色任务加成数据。\n\n由于游戏接口机制，同步过程中可能会导致该 UID 当前登录中的游戏客户端掉线一次。确认继续同步？",
    );
    if (!confirmed) {
      return;
    }

    setSyncingUid(targetUid);
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      await requestJson<CloudGameProfileSummary>("/api/account/game-profiles/sync", {
        method: "POST",
        body: JSON.stringify({ gameUid: targetUid }),
      });
      setMessage(`UID ${targetUid} 已同步。`);
      await loadData();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "同步游戏数据失败");
    } finally {
      setSyncingUid(null);
    }
  }, [loadData]);

  const createManualProfile = useCallback(async () => {
    setBusyAction({ type: "create" });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const name = profileName.trim() || "手动档案";
      await saveLocalGameProfilePayload(blankPayload(name), name);
      setProfileName("");
      setMessage("本地手动档案已创建。");
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建本地手动档案失败");
    } finally {
      setBusyAction(null);
    }
  }, [loadData, profileName]);

  const importProfile = useCallback(async () => {
    setBusyAction({ type: "import" });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const bestdoriProfile = parseBestdoriProfile(JSON.parse(importText));
      const payload = importBestdoriGameProfilePayload(bestdoriProfile);
      const normalizedProfile = decodeBestdoriProfile(payload.bestdoriProfile);
      await saveLocalGameProfilePayload(payload, normalizedProfile.name);
      setImportText("");
      setMessage("Bestdori 档案已导入到本地。");
      await loadData();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入 Bestdori 档案失败");
    } finally {
      setBusyAction(null);
    }
  }, [importText, loadData]);

  const copyProfile = useCallback(async (profile: ManagedProfileSummary) => {
    setBusyAction({ type: "copy", profileId: profile.id });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const name = `${profile.name} Copy`;
      if (profile.localProfile) {
        await duplicateLocalGameProfile(profile.localProfile.id, name);
      } else {
        if (!profile.cloudProfile) {
          throw new Error("档案不存在");
        }
        const payload = await decodeCompressedGameProfilePayload(await requestCloudCompressedPayload(profile.cloudProfile.id));
        payload.bestdoriProfile.name = name;
        await saveLocalGameProfilePayload(payload, name);
      }
      setMessage("档案已拷贝为本地手动档案。");
      await loadData();
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "拷贝档案失败");
    } finally {
      setBusyAction(null);
    }
  }, [loadData]);

  const uploadLocalProfile = useCallback(async (profile: LocalGameProfileSummary) => {
    setBusyAction({ type: "upload", profileId: profile.id });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const compressed = await readLocalCompressedGameProfile(profile.id);
      const uploadedProfile = await requestJson<CloudGameProfileSummary>("/api/account/game-profiles/upload", {
        method: "POST",
        body: JSON.stringify({
          name: profile.name,
          compressed,
          localProfileId: profile.id,
          cloudProfileId: profile.cloudProfileId ?? undefined,
        }),
      });
      const payload = await decodeCompressedGameProfilePayload(compressed);
      await updateLocalGameProfilePayload(profile.id, payload, { cloudProfileId: uploadedProfile.id });
      setMessage("本地档案已上传到服务器。");
      await loadData();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传档案失败");
    } finally {
      setBusyAction(null);
    }
  }, [loadData]);

  const downloadCloudProfile = useCallback(async (profile: CloudGameProfileSummary) => {
    setBusyAction({ type: "download", profileId: profile.id });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const localProfile = localProfiles.find((candidate) => (
        candidate.cloudProfileId === profile.id || candidate.id === profile.localProfileId
      ));
      if (!localProfile) {
        throw new Error("请先在本地创建或上传对应的手动档案");
      }
      const payload = await decodeCompressedGameProfilePayload(await requestCloudCompressedPayload(profile.id));
      payload.bestdoriProfile.name = profile.name;
      await updateLocalGameProfilePayload(localProfile.id, payload, { cloudProfileId: profile.id });
      setMessage("云端档案已下载到本地。");
      await loadData();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "下载档案失败");
    } finally {
      setBusyAction(null);
    }
  }, [loadData, localProfiles]);

  const exportProfile = useCallback(async (profile: ManagedProfileSummary) => {
    setBusyAction({ type: "export", profileId: profile.id });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      let exportPayload: unknown;
      if (profile.localProfile) {
        const payload = await readLocalGameProfilePayload(profile.localProfile.id);
        exportPayload = exportBestdoriGameProfilePayload(payload);
      } else {
        if (!profile.cloudProfile) {
          throw new Error("档案不存在");
        }
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("请先登录");
        }

        const response = await fetch(`/api/account/game-profiles/${profile.cloudProfile.id}/export`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload) || `请求失败（HTTP ${response.status}）`);
        }
        exportPayload = payload;
      }
      const json = JSON.stringify(exportPayload, null, 2);
      await navigator.clipboard.writeText(json);
      setExportedPayload({
        profileId: profile.id,
        label: "档案导出",
        json,
      });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出档案失败");
    } finally {
      setBusyAction(null);
    }
  }, []);

  const deleteProfile = useCallback(async (profile: ManagedProfileSummary) => {
    if (!window.confirm(`确认删除档案「${profile.name}」？`)) {
      return;
    }

    setBusyAction({ type: "delete", profileId: profile.id });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      if (profile.localProfile) {
        await deleteLocalGameProfile(profile.localProfile.id);
      }
      if (profile.cloudProfile) {
        await requestJson<{ profileId: string }>(`/api/account/game-profiles/${profile.cloudProfile.id}`, {
          method: "DELETE",
        });
      }
      setMessage("档案已删除。");
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除档案失败");
    } finally {
      setBusyAction(null);
    }
  }, [loadData]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">游戏档案管理</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            绑定 UID 后可同步游戏数据，生成完整的游戏卡牌和道具加成等档案。
          </p>
        </div>
        <div className="text-sm text-slate-500">
          已绑定 {bindings.length}/{USER_GAME_BINDING_LIMIT} · 自动 {autoProfileCount}/{USER_GAME_AUTO_PROFILE_LIMIT} · 手动 {manualProfileCount}/{USER_GAME_MANUAL_PROFILE_LIMIT}
        </div>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-base font-semibold text-slate-900">绑定新 UID</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={gameUid}
            onChange={(event) => setGameUid(event.target.value.replace(/\D/g, ""))}
            placeholder="游戏 UID"
            inputMode="numeric"
            className="h-11 rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          />
          <button
            type="button"
            onClick={createChallenge}
            disabled={writeBusy || !normalizedUid || bindings.length >= USER_GAME_BINDING_LIMIT}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            {busyAction?.type === "challenge" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {challenge ? "刷新验证码" : "生成验证码"}
          </button>
        </div>
        {bindings.length >= USER_GAME_BINDING_LIMIT && (
          <p className="mt-2 text-sm text-amber-700">已达到绑定 UID 上限，解绑后可继续绑定。</p>
        )}

        {challenge && (
          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-3 sm:p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">验证码</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code className="min-w-0 break-all rounded-xl bg-white px-3 py-2 text-base font-bold text-slate-900 shadow-sm sm:text-lg">{challenge.challenge}</code>
              <button
                type="button"
                onClick={copyChallenge}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
              >
                {copiedChallenge ? "已复制" : "复制"}
              </button>
            </div>
            <div className="mt-3 text-sm text-slate-600">有效期至 {formatDate(challenge.expiresAt)}</div>
            <button
              type="button"
              onClick={verifyChallenge}
              disabled={writeBusy}
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busyAction?.type === "verify" ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              {busyAction?.type === "verify" ? "验证中" : "我已填写，开始验证"}
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">UID 管理</h3>
          </div>
          <div className="text-sm text-slate-500">自动档案 {autoProfileCount}/{USER_GAME_AUTO_PROFILE_LIMIT}</div>
        </div>
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          同步会请求游戏接口，可能让该 UID 当前登录中的游戏客户端掉线一次。
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">正在读取...</p>
        ) : bindings.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-500">暂无已绑定 UID。绑定游戏 UID 后可以创建自动同步档案。</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {sortedBindings.map((binding) => {
              const profile = profilesByUid.get(binding.gameUid);
              const isSyncing = syncingUid === binding.gameUid;
              const isUnbinding = busyAction?.type === "unbind" && busyAction.gameUid === binding.gameUid;
              const syncLimitReached = !profile && autoProfileCount >= USER_GAME_AUTO_PROFILE_LIMIT;
              return (
                <div key={binding.gameUid} className="rounded-2xl border border-slate-200 p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-all font-semibold text-slate-900">
                          UID {binding.gameUid}{profile ? ` · ${profile.name}` : ""}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${profile ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {profile ? "已生成自动档案" : "未同步"}
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-500">
                        绑定时间：{formatDate(binding.boundAt)}
                        <br />
                        {profile ? `卡牌 ${profile.cardCount} · 最后同步：${formatDate(profile.syncedAt)}` : "自动档案：未同步"}
                      </div>
                      {syncLimitReached && (
                        <p className="mt-2 text-sm text-amber-700">自动档案已达到上限，删除旧自动档案后可继续同步生成。</p>
                      )}
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => syncAutoProfile(binding.gameUid)}
                        disabled={busy || isSyncing || syncLimitReached}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                        {isSyncing ? "同步中" : profile ? "重新同步" : "同步生成"}
                      </button>
                      <button
                        type="button"
                        onClick={() => unbindGameUid(binding.gameUid)}
                        disabled={writeBusy}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {isUnbinding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        {isUnbinding ? "解绑中" : "解绑"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(message || error) && (
        <div aria-live="polite" className={`mt-4 rounded-2xl px-4 py-3 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}

      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">手动档案</h3>
            <p className="mt-1 text-sm text-slate-500">新建本地档案，或粘贴 Bestdori JSON 导入到本地。</p>
          </div>
          <div className="text-sm text-slate-500">手动 {manualProfileCount}/{USER_GAME_MANUAL_PROFILE_LIMIT}</div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder="新建本地手动档案名称"
            className="h-11 rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          />
          <button
            type="button"
            onClick={createManualProfile}
            disabled={writeBusy || manualProfileCount >= USER_GAME_MANUAL_PROFILE_LIMIT}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            {busyAction?.type === "create" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {busyAction?.type === "create" ? "新建中" : "新建"}
          </button>
        </div>

        <div className="mt-4">
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="粘贴 Bestdori 档案 JSON"
            className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          />
          <button
            type="button"
            onClick={importProfile}
            disabled={writeBusy || !importText.trim() || manualProfileCount >= USER_GAME_MANUAL_PROFILE_LIMIT}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
          >
            {busyAction?.type === "import" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busyAction?.type === "import" ? "导入中" : "导入到本地"}
          </button>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-base font-semibold text-slate-900">档案列表</h3>
        <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
          自动同步档案由 UID 同步生成，作为服务器侧只读数据使用；手动档案默认保存在当前浏览器，可通过上传保存到云端，或从云端下载覆盖本地副本。导出会复制 Bestdori 兼容 JSON，拷贝会生成新的本地手动档案。
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">正在读取...</p>
        ) : profiles.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">暂无档案。</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {profiles.map((profile) => {
              const profileExported = exportedPayload?.profileId === profile.id;
              const isExportingProfile = busyAction?.type === "export" && busyAction.profileId === profile.id;
              const isUploading = busyAction?.type === "upload" && busyAction.profileId === profile.localProfile?.id;
              const isDownloading = busyAction?.type === "download" && busyAction.profileId === profile.cloudProfile?.id;
              const isCopying = busyAction?.type === "copy" && busyAction.profileId === profile.id;
              const isDeleting = busyAction?.type === "delete" && busyAction.profileId === profile.id;

              return (
                <div key={profile.id} className="rounded-2xl border border-slate-200 p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words font-semibold text-slate-900">{profile.name}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${profile.kind === "auto" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
                          {profile.label}
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-500">
                        {profile.sourceGameUid ? `UID ${profile.sourceGameUid} · ` : ""}
                        卡牌 {profile.cardCount}
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                      <a
                        href={`/bandori/game-profiles/${encodeURIComponent(profile.viewProfileId)}/cards`}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
                      >
                        卡牌
                      </a>
                      <a
                        href={`/bandori/game-profiles/${encodeURIComponent(profile.viewProfileId)}/items`}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
                      >
                        道具
                      </a>
                      <button
                        type="button"
                        onClick={() => exportProfile(profile)}
                        disabled={writeBusy}
                        className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${profileExported ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:text-sky-600"}`}
                      >
                        {isExportingProfile ? <RefreshCw className="h-4 w-4 animate-spin" /> : profileExported ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                        {isExportingProfile ? "导出中" : profileExported ? "导出成功" : "导出"}
                      </button>
                      {profile.localProfile ? (
                        <button
                          type="button"
                          onClick={() => uploadLocalProfile(profile.localProfile as LocalGameProfileSummary)}
                          disabled={writeBusy}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          {isUploading ? "上传中" : "上传"}
                        </button>
                      ) : null}
                      {profile.localProfile && profile.cloudProfile ? (
                        <button
                          type="button"
                          onClick={() => downloadCloudProfile(profile.cloudProfile as CloudGameProfileSummary)}
                          disabled={writeBusy}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {isDownloading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          {isDownloading ? "下载中" : "下载到本地"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => copyProfile(profile)}
                        disabled={writeBusy || manualProfileCount >= USER_GAME_MANUAL_PROFILE_LIMIT}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {isCopying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                        {isCopying ? "拷贝中" : "拷贝"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProfile(profile)}
                        disabled={writeBusy}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {isDeleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        {isDeleting ? "删除中" : "删除"}
                      </button>
                    </div>
                  </div>
                  {profile.kind === "manual" && (
                    <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <FileJson className="h-3.5 w-3.5" />
                      上次同步：{formatDate(profile.syncAt)}
                    </div>
                  )}
                  {exportedPayload?.profileId === profile.id && (
                    <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-emerald-700">
                        <span>{exportedPayload.label} payload</span>
                        <span>导出成功，已复制到剪贴板</span>
                      </div>
                      <textarea
                        readOnly
                        value={exportedPayload.json}
                        className="h-52 w-full resize-y rounded-xl border border-emerald-100 bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-700 outline-none"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
