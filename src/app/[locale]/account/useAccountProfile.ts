"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  AccountProfileRequestError,
  type AccountProfile,
} from "@/lib/account-profile-store";
import { getApiErrorMessage } from "@/lib/api-contracts";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import {
  getSafeSession,
  readAuthProfileSummary,
  writeAuthProfileSummaryCache,
} from "@/lib/supabase";
import { useAccountProfileStore } from "@/store/useAccountProfileStore";
import { useGameStore } from "@/store/useGameStore";

export type { AccountProfile } from "@/lib/account-profile-store";

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
  notSignedIn: "Please sign in first",
  httpLoadFailed: (status) => `Failed to load the account profile (HTTP ${status})`,
  invalidResponse: "The account profile response is invalid",
  loadFailed: "Failed to load the account profile",
};

function getProfileErrorMessage(
  error: AccountProfileRequestError | null,
  messages: AccountProfileMessages,
): string {
  if (!error) {
    return "";
  }
  if (error.reason === "unauthenticated") {
    return messages.notSignedIn;
  }
  if (error.reason === "invalid-response") {
    return messages.invalidResponse;
  }
  if (error.payload !== undefined) {
    const apiMessage = messages.apiErrorMessage?.(error.payload) || getApiErrorMessage(error.payload);
    if (apiMessage) {
      return apiMessage;
    }
  }
  if (error.status !== null) {
    return messages.httpLoadFailed(error.status);
  }
  return error.message || messages.loadFailed;
}

export function useAccountProfile(messages: AccountProfileMessages = defaultAccountProfileMessages) {
  const {
    userId,
    username,
    userEmail,
    authReady,
    setAuth,
    logout,
  } = useGameStore();
  const storedUserId = useAccountProfileStore((state) => state.userId);
  const storedProfile = useAccountProfileStore((state) => state.profile);
  const profileStatus = useAccountProfileStore((state) => state.status);
  const profileRequestError = useAccountProfileStore((state) => state.error);
  const loadStoredProfile = useAccountProfileStore((state) => state.loadProfile);
  const setStoredProfile = useAccountProfileStore((state) => state.setProfile);
  const clearStoredProfile = useAccountProfileStore((state) => state.clearProfile);
  const profile = storedUserId === userId ? storedProfile : null;
  const profileError = storedUserId === userId
    ? getProfileErrorMessage(profileRequestError, messages)
    : "";
  const loadingProfile = !authReady || Boolean(
    userId
    && (
      storedUserId !== userId
      || profileStatus === "idle"
      || profileStatus === "loading"
    )
    && !profile
  );

  const syncStoreSummary = useCallback(async () => {
    const summary = await readAuthProfileSummary(null, { forceRefresh: true });
    if (!summary) {
      clearStoredProfile();
      logout();
      return;
    }

    setAuth({
      userId: summary.userId,
      username: summary.username,
      userEmail: summary.email,
      emailVerified: summary.emailVerified,
    });
  }, [clearStoredProfile, logout, setAuth]);

  const loadProfile = useCallback(async () => {
    if (!authReady || !userId) {
      return null;
    }
    return loadStoredProfile(userId, { force: true });
  }, [authReady, loadStoredProfile, userId]);

  const setProfile = useCallback((nextProfile: AccountProfile) => {
    setStoredProfile(nextProfile);
    writeAuthProfileSummaryCache({
      userId: nextProfile.userId,
      username: nextProfile.username,
      email: nextProfile.email,
      emailVerified: nextProfile.emailVerified,
    });
    setAuth({
      userId: nextProfile.userId,
      username: nextProfile.username,
      userEmail: nextProfile.email,
      emailVerified: nextProfile.emailVerified,
    });
  }, [setAuth, setStoredProfile]);

  useEffect(() => {
    if (!authReady) {
      return;
    }
    if (!userId) {
      clearStoredProfile();
      return;
    }
    void loadStoredProfile(userId).catch(() => undefined);
  }, [authReady, clearStoredProfile, loadStoredProfile, userId]);

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
