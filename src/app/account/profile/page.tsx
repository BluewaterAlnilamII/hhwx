"use client";

import { useEffect, useState } from "react";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { type AccountProfile, getAccessToken, useAccountProfile } from "../useAccountProfile";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { createNativeValidationProps } from "@/lib/native-validation";
import {
  PUBLIC_USERNAME_DESCRIPTION,
  PUBLIC_USERNAME_HINT,
  PUBLIC_USERNAME_LABEL,
  PUBLIC_USERNAME_PLACEHOLDER,
  USERNAME_REQUIRED_MESSAGE,
  normalizeUsernameValue,
  validateUsernameValue,
} from "@/lib/username-policy";
import AccountAvatarCardControl from "../AccountAvatarCardControl";

export default function AccountProfilePage() {
  const {
    userId,
    userEmail,
    authReady,
    profile,
    setProfile,
    loadingProfile,
    profileError,
    setAuth,
  } = useAccountProfile();
  const [usernameInput, setUsernameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const usernameValidationProps = createNativeValidationProps({ label: PUBLIC_USERNAME_LABEL });

  useEffect(() => {
    setUsernameInput(profile?.username ?? "");
  }, [profile?.username]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");

    const normalizedUsername = normalizeUsernameValue(usernameInput);
    if (!normalizedUsername) {
      setMessage(USERNAME_REQUIRED_MESSAGE);
      return;
    }

    const usernameValidationError = validateUsernameValue(normalizedUsername);
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
        setMessage("请先登录");
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
        setMessage(getApiErrorMessage(payload) || `保存失败（HTTP ${response.status}）`);
        return;
      }

      const updatedProfile = parseApiSuccessData<AccountProfile>(payload);
      if (!updatedProfile) {
        setMessage("账号资料返回格式无效");
        return;
      }

      setProfile(updatedProfile);
      setAuth({
        userId: updatedProfile.userId,
        username: updatedProfile.username,
        userEmail: updatedProfile.email,
        emailVerified: updatedProfile.emailVerified,
      });
      setMessage("资料已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountShell
      title="编辑资料"
      description="修改公开用户名。"
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message="正在读取资料..." />
      ) : !userId ? (
        <AccountSignInState nextPath="/account/profile" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile ? (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-[#006699] p-6 text-white shadow-lg">
            <div className="flex flex-wrap items-center gap-4">
              <AccountAvatarCardControl profile={profile} onProfileChange={setProfile} />
              <div>
                <div className="text-2xl font-bold">{profile.username}</div>
                <div className="mt-1 text-sm text-slate-300">{profile.email || userEmail || "-"}</div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">{PUBLIC_USERNAME_LABEL}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {PUBLIC_USERNAME_DESCRIPTION}
            </p>

            <label className="mt-5 block text-sm font-medium text-slate-700">
              {PUBLIC_USERNAME_LABEL}
              <input
                type="text"
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                {...usernameValidationProps}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder={PUBLIC_USERNAME_PLACEHOLDER}
              />
              <span className="mt-2 block text-xs leading-5 text-slate-500">
                {PUBLIC_USERNAME_HINT}
              </span>
            </label>

            {message && (
              <div className={`mt-4 text-sm ${message.includes("已") ? "text-emerald-600" : "text-red-500"}`}>
                {message}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={saving || !usernameInput.trim()}
                className="hhwx-accent-button"
              >
                {saving ? "保存中..." : "保存资料"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AccountShell>
  );
}
