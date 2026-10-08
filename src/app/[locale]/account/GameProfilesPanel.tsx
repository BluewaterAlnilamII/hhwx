"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, Download, FileJson, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import LoadingIndicator, { LoadingSpinner } from "@/components/LoadingIndicator";
import { Link } from "@/i18n/navigation";
import { type AppLocale } from "@/i18n/routing";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import { ApiRouteError, getApiErrorCode, getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { normalizeBandoriServer, type BandoriServer } from "@/lib/bandori-server";
import { getLocalizedApiErrorMessage, isLocalizedApiErrorCode } from "@/lib/localized-api-errors";
import { formatLocalizedDateTime } from "@/lib/localized-format";
import { GAME_PROFILE_SYNC_ENABLED, type GameProfileLoginTask } from "@/lib/user-game-profile-sync";
import BandoriCnExclusiveNotice from "@/app/[locale]/bandori/BandoriCnExclusiveNotice";
import type { GameAccountBinding, GameBindChallenge } from "@/lib/game-account-binding";
import {
  decodeCompressedGameProfilePayload,
  exportBestdoriGameProfilePayload,
} from "@/lib/user-game-profile-payload";
import {
  deleteLocalGameProfile,
  listLocalGameProfiles,
  readLocalCompressedGameProfile,
  readLocalGameProfilePayload,
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
  server: BandoriServer;
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
  | { type: "export"; profileId: string }
  | { type: "delete"; profileId: string };

type ExportedProfilePayload = {
  profileId: string;
  label: string;
  json: string;
};

type RequestJsonMessages = {
  notSignedIn: string;
  requestFailed: (status: number) => string;
  invalidResponse: string;
  apiError: (payload: unknown) => string | null;
};

const USER_GAME_BINDING_LIMIT = 5;
const USER_GAME_AUTO_PROFILE_LIMIT = 5;
const USER_GAME_MANUAL_PROFILE_LIMIT = 10;
const SYNC_ERROR_MESSAGE_KEYS = new Map([
  ["INVALID_JSON", "uidManagement.loginInvalidJson"],
  ["TRACKER_SERVICE_FAILED", "uidManagement.syncServiceFailed"],
  ["TRACKER_SERVICE_NOT_CONFIGURED", "uidManagement.syncServiceNotConfigured"],
  ["TRACKER_SERVICE_INVALID_RESPONSE", "uidManagement.syncServiceInvalidResponse"],
]);

async function requestJson<T>(path: string, init: RequestInit | undefined, messages: RequestJsonMessages): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error(messages.notSignedIn);
  }

  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiRouteError(response.status, getApiErrorCode(payload) ?? "REQUEST_FAILED", messages.apiError(payload) || messages.requestFailed(response.status));
  }

  const data = parseApiSuccessData<T>(payload);
  if (data === null) {
    throw new Error(messages.invalidResponse);
  }

  return data;
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

export default function GameProfilesPanel() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("bandori.gameProfiles.panel");
  const termsT = useTranslations("bandori.terms");
  const errorT = useTranslations("errors");
  const cnExclusiveT = useTranslations("bandori.notices.cnExclusive");
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
  const [syncConsent, setSyncConsent] = useState(false);
  const syncConsentId = useId();
  const [loginTask, setLoginTask] = useState<(GameProfileLoginTask & { expiresAt: number }) | null>(null);
  const [syncNotice, setSyncNotice] = useState<{ gameUid: string; message: string; kind: "success" | "error" } | null>(null);
  const loginAction = useRef<AbortController | null>(null);
  const loginWindow = useRef<Window | null>(null);
  const loginWindowNavigated = useRef(false);
  const closeLoginWindow = useCallback(() => {
    // After detaching the opener, browsers may deny closing the cross-origin page.
    if (!loginWindowNavigated.current) loginWindow.current?.close();
    loginWindow.current = null;
    loginWindowNavigated.current = false;
  }, []);
  useEffect(() => () => {
    loginAction.current?.abort();
    closeLoginWindow();
  }, [closeLoginWindow]);
  const [exportedPayload, setExportedPayload] = useState<ExportedProfilePayload | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = busyAction !== null;
  const writeBusy = busy || syncingUid !== null;
  const normalizedUid = useMemo(() => gameUid.trim(), [gameUid]);
  const requestMessages = useMemo<RequestJsonMessages>(() => ({
    notSignedIn: t("errors.notSignedIn"),
    requestFailed: (status) => t("errors.requestFailed", { status }),
    invalidResponse: t("errors.invalidResponse"),
    apiError: (payload) => getLocalizedApiErrorMessage(payload, errorT),
  }), [errorT, t]);
  const requestGameJson = useCallback(<T,>(path: string, init?: RequestInit) => requestJson<T>(path, init, requestMessages), [requestMessages]);
  const formatDate = useCallback(
    (value: string | null) => formatLocalizedDateTime(value, locale, termsT("none")),
    [locale, termsT],
  );

  const profiles = useMemo<ManagedProfileSummary[]>(() => {
    const autoProfiles = cloudProfiles
      .filter((profile) => profile.kind === "auto")
      .map((profile) => ({
        id: `cloud:${profile.id}`,
        name: profile.name,
        server: normalizeBandoriServer(profile.server) ?? 0,
        kind: profile.kind,
        label: t("profileKinds.auto"),
        sourceGameUid: profile.sourceGameUid,
        cardCount: profile.cardCount,
        syncAt: profile.syncedAt,
        viewProfileId: profile.id,
        localProfile: null,
        cloudProfile: profile,
      }));

    const manualCloudProfiles = cloudProfiles.filter((profile) => profile.kind === "manual");
    const cloudByLocalId = new Map(manualCloudProfiles
      .filter((profile) => profile.localProfileId)
      .map((profile) => [profile.localProfileId as string, profile]));

    const cloudManualProfiles = manualCloudProfiles
      .map((profile) => ({
        id: `cloud:${profile.id}`,
        name: profile.name,
        server: normalizeBandoriServer(profile.server) ?? 0,
        kind: profile.kind,
        label: t("profileKinds.cloudManual"),
        sourceGameUid: profile.sourceGameUid,
        cardCount: profile.cardCount,
        syncAt: profile.updatedAt,
        viewProfileId: profile.id,
        localProfile: null,
        cloudProfile: profile,
      }))
      .sort((left, right) => profileSortTime(right).localeCompare(profileSortTime(left)));

    const localMigrationProfiles = localProfiles.map((profile) => {
      const cloudProfile = (profile.cloudProfileId ? manualCloudProfiles.find((candidate) => candidate.id === profile.cloudProfileId) : undefined)
        ?? cloudByLocalId.get(profile.id)
        ?? null;
      return {
        id: `local:${profile.id}`,
        name: profile.name,
        server: normalizeBandoriServer(profile.server) ?? 0,
        kind: profile.kind,
        label: cloudProfile ? t("profileKinds.localCopy") : t("profileKinds.localPendingMigration"),
        sourceGameUid: null,
        cardCount: profile.cardCount,
        syncAt: cloudProfile?.updatedAt ?? null,
        viewProfileId: profile.id,
        localProfile: profile,
        cloudProfile,
      };
    }).sort((left, right) => profileSortTime(right).localeCompare(profileSortTime(left)));

    return [
      ...autoProfiles.sort((left, right) => compareGameUid(left.sourceGameUid, right.sourceGameUid)),
      ...cloudManualProfiles,
      ...localMigrationProfiles,
    ];
  }, [cloudProfiles, localProfiles, t]);

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

  const manualProfileCount = cloudProfiles.filter((profile) => profile.kind === "manual").length;
  const autoProfileCount = cloudProfiles.filter((profile) => profile.kind === "auto").length;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextProfiles, nextBindings, nextLocalProfiles] = await Promise.all([
        requestGameJson<CloudGameProfileSummary[]>("/api/account/game-profiles"),
        requestGameJson<GameAccountBinding[]>("/api/account/game-bind/bindings"),
        listLocalGameProfiles(),
      ]);
      setCloudProfiles(nextProfiles);
      setBindings(nextBindings);
      setLocalProfiles(nextLocalProfiles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [requestGameJson, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const createChallenge = useCallback(async () => {
    setBusyAction({ type: "challenge" });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const nextChallenge = await requestGameJson<GameBindChallenge>("/api/account/game-bind/challenge", {
        method: "POST",
        body: JSON.stringify({ gameUid: normalizedUid }),
      });
      setChallenge(nextChallenge);
      setCopiedChallenge(false);
      setMessage(t("messages.challengeCreated"));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("errors.createChallengeFailed"));
    } finally {
      setBusyAction(null);
    }
  }, [normalizedUid, requestGameJson, t]);

  const verifyChallenge = useCallback(async () => {
    if (!challenge) {
      return;
    }

    setBusyAction({ type: "verify" });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const result = await requestGameJson<VerifyResult>("/api/account/game-bind/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: challenge.id }),
      });
      setMessage(result.transferred ? t("messages.transferred") : t("messages.bound"));
      setChallenge(null);
      setCopiedChallenge(false);
      setGameUid("");
      await loadData();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : t("errors.verifyFailed"));
    } finally {
      setBusyAction(null);
    }
  }, [challenge, loadData, requestGameJson, t]);

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
      t("confirm.unbind", {
        uid: targetUid,
        profileName: profile ? t("confirm.profileNameSuffix", { profileName: profile.name }) : "",
      }),
    );
    if (!confirmed) {
      return;
    }

    setBusyAction({ type: "unbind", gameUid: targetUid });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      await requestGameJson<{ gameUid: string }>(`/api/account/game-bind/bindings/${encodeURIComponent(targetUid)}`, {
        method: "DELETE",
      });
      setMessage(t("messages.unbound", { uid: targetUid }));
      await loadData();
    } catch (unbindError) {
      setError(unbindError instanceof Error ? unbindError.message : t("errors.unbindFailed"));
    } finally {
      setBusyAction(null);
    }
  }, [loadData, profilesByUid, requestGameJson, t]);

  const finishLogin = useCallback((gameUid: string, message = "") => {
    closeLoginWindow();
    setLoginTask(null);
    setSyncingUid(null);
    setSyncNotice(message ? { gameUid, message, kind: "error" } : null);
  }, [closeLoginWindow]);

  const syncAutoProfile = useCallback(async (targetUid: string) => {
    if (!GAME_PROFILE_SYNC_ENABLED || !syncConsent || busy || loginTask || loginAction.current) return;
    finishLogin(targetUid);
    const controller = new AbortController();
    loginAction.current = controller;
    setSyncingUid(targetUid);
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const popup = window.open("", "_blank", "popup,width=520,height=720");
      if (!popup) throw new ApiRouteError(400, "LOGIN_POPUP_BLOCKED", t("uidManagement.loginPopupBlocked"));
      loginWindow.current = popup;
      popup.opener = null;
      const task = await requestGameJson<GameProfileLoginTask>("/api/account/game-profiles/sync", {
        method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]),
        body: JSON.stringify({ action: "start", gameUid: targetUid }),
      });
      if (controller.signal.aborted) return;
      // This check covers only the same-origin blank window, before official navigation.
      if (popup.closed) throw new ApiRouteError(400, "LOGIN_WINDOW_CLOSED", t("uidManagement.loginWindowClosed"));
      const link = popup.document.createElement("a");
      link.href = task.loginUrl;
      link.target = "_self";
      link.rel = "noreferrer";
      link.referrerPolicy = "no-referrer";
      popup.document.body.append(link);
      loginWindowNavigated.current = true;
      link.click();
      setLoginTask({ ...task, expiresAt: Date.now() + task.expiresIn * 1000 });
    } catch (syncError) {
      if (!controller.signal.aborted) {
        const messageKey = syncError instanceof ApiRouteError ? SYNC_ERROR_MESSAGE_KEYS.get(syncError.code) : undefined;
        finishLogin(targetUid, messageKey ? t(messageKey)
          : syncError instanceof ApiRouteError ? syncError.message : t("errors.syncFailed"));
      }
    } finally {
      if (loginAction.current === controller) {
        loginAction.current = null;
        if (!controller.signal.aborted) setSyncingUid(null);
      }
    }
  }, [busy, finishLogin, loginTask, requestGameJson, syncConsent, t]);

  const confirmLogin = useCallback(async () => {
    if (!loginTask || !syncConsent || busy || loginAction.current) return;
    const controller = new AbortController();
    loginAction.current = controller;
    setSyncingUid(loginTask.gameUid);
    setSyncNotice(null);
    try {
      const profile = await requestGameJson<CloudGameProfileSummary>("/api/account/game-profiles/sync", {
        method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]),
        body: JSON.stringify({ action: "confirm", gameUid: loginTask.gameUid, taskId: loginTask.taskId }),
      });
      if (controller.signal.aborted) return;
      setCloudProfiles((current) => [...current.filter((item) => item.id !== profile.id), profile]);
      finishLogin(loginTask.gameUid);
      setSyncNotice({ gameUid: loginTask.gameUid, message: t("messages.synced", { uid: loginTask.gameUid }), kind: "success" });
    } catch (syncError) {
      if (!controller.signal.aborted) {
        const code = syncError instanceof ApiRouteError ? syncError.code : "";
        if (["LOGIN_TASK_BUSY", "LOGIN_NOT_COMPLETED", "LOGIN_TASK_ACTIVE"].includes(code)) {
          setSyncNotice({ gameUid: loginTask.gameUid, message: (syncError as Error).message, kind: "error" });
        } else {
          const messageKey = SYNC_ERROR_MESSAGE_KEYS.get(code);
          const message = messageKey ? t(messageKey)
            : syncError instanceof ApiRouteError && isLocalizedApiErrorCode(code)
              ? syncError.message : t("errors.syncFailed");
          finishLogin(loginTask.gameUid, message);
        }
      }
    } finally {
      if (loginAction.current === controller) {
        loginAction.current = null;
        if (!controller.signal.aborted) setSyncingUid(null);
      }
    }
  }, [busy, finishLogin, loginTask, requestGameJson, syncConsent, t]);

  useEffect(() => {
    if (!loginTask || syncingUid !== null) return;
    const timer = window.setTimeout(() => finishLogin(loginTask.gameUid, t("uidManagement.loginExpired")),
      Math.max(0, loginTask.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [finishLogin, loginTask, syncingUid, t]);

  const createManualProfile = useCallback(async () => {
    setBusyAction({ type: "create" });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const name = profileName.trim() || t("manual.defaultName");
      await requestGameJson<CloudGameProfileSummary>("/api/account/game-profiles", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setProfileName("");
      setMessage(t("messages.manualCreated"));
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("errors.createFailed"));
    } finally {
      setBusyAction(null);
    }
  }, [loadData, profileName, requestGameJson, t]);

  const importProfile = useCallback(async () => {
    setBusyAction({ type: "import" });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      await requestGameJson<CloudGameProfileSummary>("/api/account/game-profiles/import", {
        method: "POST",
        body: JSON.stringify({ profile: JSON.parse(importText) }),
      });
      setImportText("");
      setMessage(t("messages.imported"));
      await loadData();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t("errors.importFailed"));
    } finally {
      setBusyAction(null);
    }
  }, [importText, loadData, requestGameJson, t]);

  const copyProfile = useCallback(async (profile: ManagedProfileSummary) => {
    setBusyAction({ type: "copy", profileId: profile.id });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const name = `${profile.name} Copy`;
      if (!profile.cloudProfile) {
        throw new Error(t("errors.profileNotFound"));
      }
      await requestGameJson<CloudGameProfileSummary>(`/api/account/game-profiles/${profile.cloudProfile.id}/copy`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setMessage(t("messages.copiedToCloud"));
      await loadData();
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : t("errors.copyFailed"));
    } finally {
      setBusyAction(null);
    }
  }, [loadData, requestGameJson, t]);

  const migrateLocalProfile = useCallback(async (profile: LocalGameProfileSummary) => {
    setBusyAction({ type: "upload", profileId: profile.id });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      const compressed = await readLocalCompressedGameProfile(profile.id);
      const uploadedProfile = await requestGameJson<CloudGameProfileSummary>("/api/account/game-profiles/upload", {
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
      setMessage(t("messages.migrated"));
      await loadData();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("errors.migrateFailed"));
    } finally {
      setBusyAction(null);
    }
  }, [loadData, requestGameJson, t]);

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
          throw new Error(t("errors.profileNotFound"));
        }
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error(t("errors.notSignedIn"));
        }

        const response = await fetch(`/api/account/game-profiles/${profile.cloudProfile.id}/export`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload) || t("errors.requestFailed", { status: response.status }));
        }
        exportPayload = payload;
      }
      const json = JSON.stringify(exportPayload, null, 2);
      await navigator.clipboard.writeText(json);
      setExportedPayload({
        profileId: profile.id,
        label: t("list.exportLabel"),
        json,
      });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : t("errors.exportFailed"));
    } finally {
      setBusyAction(null);
    }
  }, [t]);

  const deleteProfile = useCallback(async (profile: ManagedProfileSummary) => {
    if (!window.confirm(t("confirm.delete", { profileName: profile.name }))) {
      return;
    }

    setBusyAction({ type: "delete", profileId: profile.id });
    setError("");
    setMessage("");
    setExportedPayload(null);
    try {
      if (profile.localProfile) {
        await deleteLocalGameProfile(profile.localProfile.id);
      } else if (profile.cloudProfile) {
        await requestGameJson<{ profileId: string }>(`/api/account/game-profiles/${profile.cloudProfile.id}`, {
          method: "DELETE",
        });
      }
      setMessage(t("messages.deleted"));
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("errors.deleteFailed"));
    } finally {
      setBusyAction(null);
    }
  }, [loadData, requestGameJson, t]);

  return (
    <section className="rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] p-4 shadow-xs sm:rounded-3xl sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--theme-color-text-default)] sm:text-xl">{t("title")}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-color-text-muted)]">
            {t("description")}
          </p>
        </div>
        <div className="text-sm text-[var(--theme-color-text-muted)]">
          {t("quotaSummary", {
            bindings: bindings.length,
            bindingLimit: USER_GAME_BINDING_LIMIT,
            autoProfiles: autoProfileCount,
            autoLimit: USER_GAME_AUTO_PROFILE_LIMIT,
            manualProfiles: manualProfileCount,
            manualLimit: USER_GAME_MANUAL_PROFILE_LIMIT,
          })}
        </div>
      </div>

      <div className="mt-6 border-t border-[var(--theme-color-border-subtle)] pt-5">
        <h3 className="text-base font-semibold text-[var(--theme-color-text-default)]">{t("bind.title")}</h3>
        <BandoriCnExclusiveNotice
          label={cnExclusiveT("label")}
          description={cnExclusiveT("gameProfileBindingDescription")}
          className="mt-3"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={gameUid}
            onChange={(event) => setGameUid(event.target.value.replace(/\D/g, ""))}
            placeholder={t("bind.uidPlaceholder")}
            inputMode="numeric"
            className="hhwx-control h-11 rounded-2xl border px-4 text-sm transition"
          />
          <button
            type="button"
            onClick={createChallenge}
            disabled={writeBusy || !normalizedUid || bindings.length >= USER_GAME_BINDING_LIMIT}
            className="hhwx-action-accent inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition sm:w-auto"
          >
            {busyAction?.type === "challenge" ? <LoadingSpinner className="text-current" /> : <Plus className="h-4 w-4" />}
            {challenge ? t("bind.refreshChallenge") : t("bind.createChallenge")}
          </button>
        </div>
        {bindings.length >= USER_GAME_BINDING_LIMIT && (
          <p className="mt-2 text-sm text-[var(--theme-color-semantic-warning-foreground)]">{t("bind.limitReached")}</p>
        )}

        {challenge && (
          <div className="mt-4 rounded-2xl border border-[var(--theme-color-semantic-info-border)] bg-[var(--theme-color-semantic-info-background)] p-3 sm:p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-color-semantic-info-foreground)]">{t("bind.challengeLabel")}</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code className="min-w-0 break-all rounded-xl bg-[var(--theme-color-panel-background)] px-3 py-2 text-base font-bold text-[var(--theme-color-text-default)] shadow-xs sm:text-lg">{challenge.challenge}</code>
              <button
                type="button"
                onClick={copyChallenge}
                className="hhwx-control rounded-xl border px-3 py-2 text-sm font-semibold transition"
              >
                {copiedChallenge ? t("bind.copied") : t("bind.copy")}
              </button>
            </div>
            <div className="mt-3 text-sm text-[var(--theme-color-text-muted)]">{t("bind.expiresAt", { date: formatDate(challenge.expiresAt) })}</div>
            <button
              type="button"
              onClick={verifyChallenge}
              disabled={writeBusy}
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[var(--theme-color-action-success-background)] px-5 text-sm font-semibold text-[var(--theme-color-action-success-foreground)] transition hover:bg-[var(--theme-color-action-success-background)] disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)]"
            >
              {busyAction?.type === "verify" ? <LoadingSpinner className="text-current" /> : null}
              {busyAction?.type === "verify" ? t("bind.verifying") : t("bind.verify")}
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-[var(--theme-color-border-subtle)] pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--theme-color-text-default)]">{t("uidManagement.title")}</h3>
          </div>
          <div className="text-sm text-[var(--theme-color-text-muted)]">{t("uidManagement.quota", { count: autoProfileCount, limit: USER_GAME_AUTO_PROFILE_LIMIT })}</div>
        </div>
        <div className="mt-3 rounded-2xl border border-[var(--theme-color-semantic-warning-border)] bg-[var(--theme-color-semantic-warning-background)] px-4 py-3 text-sm leading-6 text-[var(--theme-color-semantic-warning-foreground)]">
          {GAME_PROFILE_SYNC_ENABLED ? (
            <>
              <ul className="space-y-2">
                <li className="flex gap-2"><span aria-hidden="true">·</span><span>{t("uidManagement.syncWarning")}</span></li>
                <li className="flex gap-2"><span aria-hidden="true">·</span><span>{t("uidManagement.syncAuthorization")}</span></li>
                <li className="flex gap-2"><span aria-hidden="true">·</span><span>{t("uidManagement.syncDisclaimer")}</span></li>
              </ul>
              <div className="mt-2 flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  id={syncConsentId}
                  aria-label={t("uidManagement.syncConsent")}
                  checked={syncConsent}
                  onChange={(event) => setSyncConsent(event.target.checked)}
                  disabled={syncingUid !== null}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--theme-color-selection-strong-background)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-color-focus-ring)] disabled:cursor-not-allowed"
                />
                <label htmlFor={syncConsentId} className={syncingUid === null ? "cursor-pointer" : "cursor-not-allowed"}>{t("uidManagement.syncConsent")}</label>
              </div>
            </>
          ) : t("uidManagement.syncUnavailable")}
        </div>
        {loading ? (
          <LoadingIndicator compact label={t("uidManagement.loading")} className="mt-3 justify-start" />
        ) : bindings.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-4 text-sm text-[var(--theme-color-text-muted)]">{t("uidManagement.empty")}</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {sortedBindings.map((binding) => {
              const profile = profilesByUid.get(binding.gameUid);
              const isSyncing = syncingUid === binding.gameUid;
              const rowTask = loginTask?.gameUid === binding.gameUid ? loginTask : null;
              const rowNotice = syncNotice?.gameUid === binding.gameUid ? syncNotice : null;
              const isUnbinding = busyAction?.type === "unbind" && busyAction.gameUid === binding.gameUid;
              const syncLimitReached = !profile && autoProfileCount >= USER_GAME_AUTO_PROFILE_LIMIT;
              return (
                <div key={binding.gameUid} className="rounded-2xl border border-[var(--theme-color-border-subtle)] p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <BandoriServerIcon
                            server={normalizeBandoriServer(profile?.server) ?? 3}
                            className="h-5 w-5 shadow-[0_1px_3px_rgba(15,23,42,0.18)]"
                          />
                          <span className="min-w-0 break-all font-semibold text-[var(--theme-color-text-default)]">
                            UID {binding.gameUid}{profile ? ` / ${profile.name}` : ""}
                          </span>
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${profile ? "bg-[var(--theme-color-semantic-success-background)] text-[var(--theme-color-semantic-success-foreground)]" : "bg-[var(--theme-color-panel-background)] text-[var(--theme-color-text-muted)]"}`}>
                          {profile ? t("uidManagement.generated") : t("uidManagement.notSynced")}
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[var(--theme-color-text-muted)]">
                        {t("uidManagement.boundAt", { date: formatDate(binding.boundAt) })}
                        <br />
                        {profile
                          ? t("uidManagement.profileStatus", { cardCount: profile.cardCount, date: formatDate(profile.syncedAt) })
                          : t("uidManagement.missingProfile")}
                      </div>
                      {syncLimitReached && (
                        <p className="mt-2 text-sm text-[var(--theme-color-semantic-warning-foreground)]">{t("uidManagement.syncLimitReached")}</p>
                      )}
                      {rowNotice && (
                        <p role={rowNotice.kind === "error" ? "alert" : "status"} className={`mt-2 text-sm ${rowNotice.kind === "error" ? "text-[var(--theme-color-semantic-danger-foreground)]" : "text-[var(--theme-color-semantic-success-foreground)]"}`}>{rowNotice.message}</p>
                      )}
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap">
                      {rowTask ? (
                        <>
                          <button type="button" onClick={confirmLogin} disabled={!syncConsent || writeBusy}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[var(--theme-color-action-success-background)] px-4 text-sm font-semibold text-[var(--theme-color-action-success-foreground)] transition hover:bg-[var(--theme-color-action-success-background)] disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)]">
                            {isSyncing && <LoadingSpinner className="text-current" />}
                            {isSyncing ? t("uidManagement.syncing") : t("uidManagement.confirmLogin")}
                          </button>
                          <button type="button" onClick={() => {
                            if (!loginAction.current) finishLogin(binding.gameUid);
                          }} disabled={writeBusy}
                            className="hhwx-control inline-flex h-10 items-center justify-center rounded-2xl border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                            {t("uidManagement.cancelLogin")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => syncAutoProfile(binding.gameUid)}
                            disabled={!GAME_PROFILE_SYNC_ENABLED || !syncConsent || writeBusy || loginTask !== null || syncLimitReached}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[var(--theme-color-action-success-background)] px-4 text-sm font-semibold text-[var(--theme-color-action-success-foreground)] transition hover:bg-[var(--theme-color-action-success-background)] disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)]"
                          >
                            {isSyncing ? <LoadingSpinner className="text-current" /> : <RefreshCw className="h-4 w-4" />}
                            {!GAME_PROFILE_SYNC_ENABLED ? t("uidManagement.syncPaused") : isSyncing ? t("uidManagement.generatingLoginLink") : profile ? t("uidManagement.resync") : t("uidManagement.sync")}
                          </button>
                          <button
                            type="button"
                            onClick={() => unbindGameUid(binding.gameUid)}
                            disabled={writeBusy}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-control-background)] px-4 text-sm font-semibold text-[var(--theme-color-semantic-danger-foreground)] transition hover:bg-[var(--theme-color-semantic-danger-background)] disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)]"
                          >
                            {isUnbinding ? <LoadingSpinner className="text-current" /> : <Trash2 className="h-4 w-4" />}
                            {isUnbinding ? t("uidManagement.unbinding") : t("uidManagement.unbind")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(message || error) && (
        <div aria-live="polite" className={`mt-4 rounded-2xl px-4 py-3 text-sm ${error ? "bg-[var(--theme-color-semantic-danger-background)] text-[var(--theme-color-semantic-danger-foreground)]" : "bg-[var(--theme-color-semantic-success-background)] text-[var(--theme-color-semantic-success-foreground)]"}`}>
          {error || message}
        </div>
      )}

      <div className="mt-6 border-t border-[var(--theme-color-border-subtle)] pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--theme-color-text-default)]">{t("manual.title")}</h3>
            <p className="mt-1 text-sm text-[var(--theme-color-text-muted)]">{t("manual.description")}</p>
          </div>
          <div className="text-sm text-[var(--theme-color-text-muted)]">{t("manual.quota", { count: manualProfileCount, limit: USER_GAME_MANUAL_PROFILE_LIMIT })}</div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder={t("manual.namePlaceholder")}
            className="hhwx-control h-11 rounded-2xl border px-4 text-sm transition"
          />
          <button
            type="button"
            onClick={createManualProfile}
            disabled={writeBusy || manualProfileCount >= USER_GAME_MANUAL_PROFILE_LIMIT}
            className="hhwx-action-accent inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition sm:w-auto"
          >
            {busyAction?.type === "create" ? <LoadingSpinner className="text-current" /> : <Plus className="h-4 w-4" />}
            {busyAction?.type === "create" ? t("manual.creating") : t("manual.create")}
          </button>
        </div>

        <div className="mt-4">
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder={t("manual.jsonPlaceholder")}
            className="hhwx-control min-h-28 w-full rounded-2xl border px-4 py-3 text-sm transition"
          />
          <button
            type="button"
            onClick={importProfile}
            disabled={writeBusy || !importText.trim() || manualProfileCount >= USER_GAME_MANUAL_PROFILE_LIMIT}
            className="hhwx-control mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] sm:w-auto"
          >
            {busyAction?.type === "import" ? <LoadingSpinner className="text-current" /> : <Upload className="h-4 w-4" />}
            {busyAction?.type === "import" ? t("manual.importing") : t("manual.import")}
          </button>
        </div>
      </div>

      <div className="mt-6 border-t border-[var(--theme-color-border-subtle)] pt-5">
        <h3 className="text-base font-semibold text-[var(--theme-color-text-default)]">{t("list.title")}</h3>
        <div className="mt-2 rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-3 text-sm leading-6 text-[var(--theme-color-text-muted)]">
          {t("list.description")}
        </div>
        {loading ? (
          <LoadingIndicator label={t("list.loading")} className="min-h-40" />
        ) : profiles.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--theme-color-text-muted)]">{t("list.empty")}</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {profiles.map((profile) => {
              const profileExported = exportedPayload?.profileId === profile.id;
              const isExportingProfile = busyAction?.type === "export" && busyAction.profileId === profile.id;
              const isUploading = busyAction?.type === "upload" && busyAction.profileId === profile.localProfile?.id;
              const isCopying = busyAction?.type === "copy" && busyAction.profileId === profile.id;
              const isDeleting = busyAction?.type === "delete" && busyAction.profileId === profile.id;
              const localProfileCanMigrate = Boolean(profile.localProfile) && (Boolean(profile.cloudProfile) || manualProfileCount < USER_GAME_MANUAL_PROFILE_LIMIT);

              return (
                <div key={profile.id} className="rounded-2xl border border-[var(--theme-color-border-subtle)] p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <BandoriServerIcon
                            server={profile.server}
                            className="h-5 w-5 shadow-[0_1px_3px_rgba(15,23,42,0.18)]"
                          />
                          <span className="min-w-0 wrap-break-word font-semibold text-[var(--theme-color-text-default)]">{profile.name}</span>
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${profile.kind === "auto" ? "bg-[var(--theme-color-semantic-success-background)] text-[var(--theme-color-semantic-success-foreground)]" : "bg-[var(--theme-color-semantic-info-background)] text-[var(--theme-color-semantic-info-foreground)]"}`}>
                          {profile.label}
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[var(--theme-color-text-muted)]">
                        {profile.sourceGameUid ? `UID ${profile.sourceGameUid} / ` : ""}
                        {t("list.cardCount", { count: profile.cardCount })}
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                      <Link
                        href={`/bandori/game-profiles/${encodeURIComponent(profile.viewProfileId)}/cards`}
                        className="hhwx-control inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition"
                      >
                        {t("list.cards")}
                      </Link>
                      <Link
                        href={`/bandori/game-profiles/${encodeURIComponent(profile.viewProfileId)}/items`}
                        className="hhwx-control inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition"
                      >
                        {t("list.items")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => exportProfile(profile)}
                        disabled={writeBusy}
                        className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] ${profileExported ? "border-[var(--theme-color-semantic-success-border)] bg-[var(--theme-color-semantic-success-background)] text-[var(--theme-color-semantic-success-foreground)]" : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-default)] hover:border-[var(--theme-color-action-secondary-border)] hover:text-[var(--theme-color-action-secondary-foreground)]"}`}
                      >
                        {isExportingProfile ? <LoadingSpinner className="text-current" /> : profileExported ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                        {isExportingProfile ? t("list.exporting") : profileExported ? t("list.exported") : t("list.export")}
                      </button>
                      {profile.localProfile ? (
                        <button
                          type="button"
                          onClick={() => migrateLocalProfile(profile.localProfile as LocalGameProfileSummary)}
                          disabled={writeBusy || !localProfileCanMigrate}
                          className="hhwx-control inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)]"
                        >
                          {isUploading ? <LoadingSpinner className="text-current" /> : <Upload className="h-4 w-4" />}
                          {isUploading ? t("list.migrating") : profile.cloudProfile ? t("list.updateCloud") : t("list.migrate")}
                        </button>
                      ) : null}
                      {profile.cloudProfile ? (
                        <button
                          type="button"
                          onClick={() => copyProfile(profile)}
                          disabled={writeBusy || manualProfileCount >= USER_GAME_MANUAL_PROFILE_LIMIT}
                          className="hhwx-control inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)]"
                        >
                          {isCopying ? <LoadingSpinner className="text-current" /> : <Copy className="h-4 w-4" />}
                          {isCopying ? t("list.copying") : t("list.copy")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => deleteProfile(profile)}
                        disabled={writeBusy}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-control-background)] px-3 text-sm font-semibold text-[var(--theme-color-semantic-danger-foreground)] transition hover:bg-[var(--theme-color-semantic-danger-background)] disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)]"
                      >
                        {isDeleting ? <LoadingSpinner className="text-current" /> : <Trash2 className="h-4 w-4" />}
                        {isDeleting ? t("list.deleting") : t("list.delete")}
                      </button>
                    </div>
                  </div>
                  {profile.kind === "manual" && (
                    <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--theme-color-text-muted)]">
                      <FileJson className="h-3.5 w-3.5" />
                      {t("list.lastSynced", { date: formatDate(profile.syncAt) })}
                    </div>
                  )}
                  {exportedPayload?.profileId === profile.id && (
                    <div className="mt-4 rounded-2xl border border-[var(--theme-color-semantic-success-border)] bg-[var(--theme-color-semantic-success-background)] p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-[var(--theme-color-semantic-success-foreground)]">
                        <span>{exportedPayload.label} payload</span>
                        <span>{t("list.exportCopied")}</span>
                      </div>
                      <textarea
                        readOnly
                        value={exportedPayload.json}
                        className="hhwx-control h-52 w-full resize-y rounded-xl border px-3 py-2 font-mono text-xs leading-5"
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
