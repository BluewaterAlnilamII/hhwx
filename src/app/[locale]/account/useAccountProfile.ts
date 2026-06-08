"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import { getSafeSession, readAuthProfileSummary } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

export type AccountProfile = {
  userId: string;
  publicUid: number;
  email: string | null;
  emailVerified: boolean;
  username: string;
  avatarCardId: number;
  avatarCardTrainType: "normal" | "after_training";
  createdAt: string | null;
  updatedAt: string | null;
  roles: string[];
};

export async function getAccessToken(): Promise<string | null> {
  const session = await getSafeSession();
  return session?.access_token ?? null;
}

export interface AccountProfileMessages {
  notSignedIn: string;
  httpLoadFailed: (status: number) => string;
  invalidResponse: string;
  loadFailed: string;
  apiErrorMessage?: (payload: unknown) => string | null;
}

const defaultAccountProfileMessages: AccountProfileMessages = {
  notSignedIn: "请先登录",
  httpLoadFailed: (status) => `读取账号资料失败（HTTP ${status}）`,
  invalidResponse: "账号资料返回格式无效",
  loadFailed: "读取账号资料失败",
};

export function useAccountProfile(messages: AccountProfileMessages = defaultAccountProfileMessages) {
  const {
    userId,
    username,
    userEmail,
    authReady,
    setAuth,
    logout,
  } = useGameStore();

  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");

  const syncStoreSummary = useCallback(async () => {
    const summary = await readAuthProfileSummary();
    if (!summary) {
      logout();
      return;
    }

    setAuth({
      userId: summary.userId,
      username: summary.username,
      userEmail: summary.email,
      emailVerified: summary.emailVerified,
    });
  }, [logout, setAuth]);

  const loadProfile = useCallback(async () => {
    if (!authReady) {
      return;
    }

    if (!userId) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }

    setLoadingProfile(true);
    setProfileError("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setProfile(null);
        setProfileError(messages.notSignedIn);
        return;
      }

      const response = await fetch("/api/account/profile", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setProfileError(messages.apiErrorMessage?.(payload) || getApiErrorMessage(payload) || messages.httpLoadFailed(response.status));
        return;
      }

      const accountProfile = parseApiSuccessData<AccountProfile>(payload);
      if (!accountProfile) {
        setProfileError(messages.invalidResponse);
        return;
      }

      setProfile(accountProfile);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : messages.loadFailed);
    } finally {
      setLoadingProfile(false);
    }
  }, [authReady, messages, userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  return {
    userId,
    username,
    userEmail,
    authReady,
    profile,
    setProfile,
    loadingProfile,
    profileError,
    syncStoreSummary,
    loadProfile,
    setAuth,
  };
}

export function useLocalizedAccountProfile() {
  const profileT = useTranslations("account.profile");
  const errorT = useTranslations("errors");
  const messages = useMemo<AccountProfileMessages>(() => ({
    notSignedIn: profileT("loadNotSignedIn"),
    httpLoadFailed: (status) => profileT("httpLoadFailed", { status }),
    invalidResponse: profileT("invalidResponse"),
    loadFailed: profileT("loadFailed"),
    apiErrorMessage: (payload) => getLocalizedApiErrorMessage(payload, errorT),
  }), [errorT, profileT]);

  return useAccountProfile(messages);
}
