"use client";

import { useEffect, useState } from "react";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { type AccountProfile, getAccessToken, useAccountProfile } from "../useAccountProfile";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";

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

  useEffect(() => {
    setUsernameInput(profile?.username ?? "");
  }, [profile?.username]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

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
        body: JSON.stringify({ username: usernameInput }),
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
      description="更新公开显示的用户名。修改后会同步应用到账号相关展示区域。"
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message="正在读取资料..." />
      ) : !userId ? (
        <AccountSignInState nextPath="/account/profile" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile ? (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-lg">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-xl font-bold">
                {(profile.username || "U")[0].toUpperCase()}
              </div>
              <div>
                <div className="text-2xl font-bold">{profile.username}</div>
                <div className="mt-1 text-sm text-slate-300">{profile.email || userEmail || "-"}</div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">公开用户名</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              这个名称会显示在账号相关页面，以及未来需要展示用户名的区域。
            </p>

            <label className="mt-5 block text-sm font-medium text-slate-700">
              用户名
              <input
                type="text"
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="输入新的用户名"
              />
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
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
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