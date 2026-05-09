"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { getSafeSession, readAuthProfileSummary } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

export type AccountProfile = {
  userId: string;
  publicUid: number;
  email: string | null;
  emailVerified: boolean;
  username: string;
  createdAt: string | null;
  updatedAt: string | null;
  roles: string[];
};

export async function getAccessToken(): Promise<string | null> {
  const session = await getSafeSession();
  return session?.access_token ?? null;
}

export function useAccountProfile() {
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
        setProfileError("请先登录");
        return;
      }

      const response = await fetch("/api/account/profile", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setProfileError(getApiErrorMessage(payload) || `读取账号资料失败（HTTP ${response.status}）`);
        return;
      }

      const accountProfile = parseApiSuccessData<AccountProfile>(payload);
      if (!accountProfile) {
        setProfileError("账号资料返回格式无效");
        return;
      }

      setProfile(accountProfile);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "读取账号资料失败");
    } finally {
      setLoadingProfile(false);
    }
  }, [authReady, userId]);

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
