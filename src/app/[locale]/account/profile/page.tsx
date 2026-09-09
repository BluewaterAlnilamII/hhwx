"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { type AccountProfile, getAccessToken, useLocalizedAccountProfile } from "../useAccountProfile";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { createNativeValidationProps } from "@/lib/native-validation";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import { getLocalizedUsernameHint, getLocalizedUsernameValidationMessage } from "@/lib/localized-validation";
import {
  normalizeUsernameValue,
} from "@/lib/username-policy";
import AccountAvatarCardControl from "../AccountAvatarCardControl";

export default function AccountProfilePage() {
  const t = useTranslations("account.profile");
  const commonT = useTranslations("common");
  const authT = useTranslations("auth");
  const errorT = useTranslations("errors");
  const {
    userId,
    userEmail,
    authReady,
    profile,
    setProfile,
    loadingProfile,
    profileError,
  } = useLocalizedAccountProfile();
  const [usernameInput, setUsernameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const usernameHint = getLocalizedUsernameHint(authT);
  const usernameValidationProps = createNativeValidationProps({
    label: t("usernameLabel"),
    customValidationMessage: (value) => getLocalizedUsernameValidationMessage(value, authT),
    requiredMessage: authT("validation.usernameRequired"),
    minLengthMessage: usernameHint,
    maxLengthMessage: usernameHint,
    patternMessage: usernameHint,
  });

  useEffect(() => {
    setUsernameInput(profile?.username ?? "");
  }, [profile?.username]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");

    const normalizedUsername = normalizeUsernameValue(usernameInput);
    if (!normalizedUsername) {
      setMessage(authT("validation.usernameRequired"));
      return;
    }

    const usernameValidationError = getLocalizedUsernameValidationMessage(normalizedUsername, authT);
    if (usernameValidationError) {
      setMessage(usernameValidationError);
      return;
    }

    if (normalizedUsername !== usernameInput) {
      setUsernameInput(normalizedUsername);
    }

    setSaving(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setMessage(t("notSignedIn"));
        return;
      }

      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ username: normalizedUsername }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(getLocalizedApiErrorMessage(payload, errorT) || t("httpSaveFailed", { status: response.status }));
        return;
      }

      const updatedProfile = parseApiSuccessData<AccountProfile>(payload);
      if (!updatedProfile) {
        setMessage(t("invalidResponse"));
        return;
      }

      setProfile(updatedProfile);
      setMessage(t("saveSuccess"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountShell
      title={t("title")}
      description={t("description")}
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message={commonT("states.loadingProfile")} />
      ) : !userId ? (
        <AccountSignInState nextPath="/account/profile" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile ? (
        <div className="space-y-6">
          <div className="rounded-3xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-profile-banner-background)] p-6 text-[var(--theme-color-profile-banner-foreground)] shadow-lg">
            <div className="flex flex-wrap items-center gap-4">
              <AccountAvatarCardControl profile={profile} onProfileChange={setProfile} />
              <div>
                <div className="text-2xl font-bold">{profile.username}</div>
                <div className="mt-1 text-sm text-[var(--theme-color-profile-banner-foreground)]/80">{profile.email || userEmail || "-"}</div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-3xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] p-6 shadow-xs">
            <h2 className="text-xl font-semibold text-[var(--theme-color-text-default)]">{t("usernameLabel")}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--theme-color-text-muted)]">
              {t("usernameDescription")}
            </p>

            <label className="mt-5 block text-sm font-medium text-[var(--theme-color-text-default)]">
              {t("usernameLabel")}
              <input
                type="text"
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                {...usernameValidationProps}
                className="hhwx-control mt-2 w-full rounded-2xl border px-4 py-3 transition"
                placeholder={t("usernamePlaceholder")}
              />
              <span className="mt-2 block text-xs leading-5 text-[var(--theme-color-text-muted)]">
                {usernameHint}
              </span>
            </label>

            {message && (
              <div className={`mt-4 text-sm ${message === t("saveSuccess") ? "text-[var(--theme-color-semantic-success-foreground)]" : "text-[var(--theme-color-semantic-danger-foreground)]"}`}>
                {message}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={saving || !usernameInput.trim()}
                className="hhwx-accent-button"
              >
                {saving ? commonT("actions.saving") : commonT("actions.save")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AccountShell>
  );
}
