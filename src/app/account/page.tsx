"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Toolbar from "@/components/Toolbar";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { buildAuthCallbackUrl, getSafeSession, readAuthProfileSummary, supabase } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

type AccountProfile = {
  userId: string;
  email: string | null;
  emailVerified: boolean;
  username: string;
  createdAt: string | null;
  updatedAt: string | null;
  roles: string[];
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function getAccessToken(): Promise<string | null> {
  const session = await getSafeSession();
  return session?.access_token ?? null;
}

export default function AccountPage() {
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

  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameMessage, setUsernameMessage] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

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
      setUsernameInput(accountProfile.username);
      setNewEmail(accountProfile.email ?? "");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "读取账号资料失败");
    } finally {
      setLoadingProfile(false);
    }
  }, [authReady, userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleUsernameSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setUsernameSaving(true);
    setUsernameMessage("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setUsernameMessage("请先登录");
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
        setUsernameMessage(getApiErrorMessage(payload) || `保存失败（HTTP ${response.status}）`);
        return;
      }

      const updatedProfile = parseApiSuccessData<AccountProfile>(payload);
      if (!updatedProfile) {
        setUsernameMessage("账号资料返回格式无效");
        return;
      }

      setProfile(updatedProfile);
      setUsernameInput(updatedProfile.username);
      setAuth({
        userId: updatedProfile.userId,
        username: updatedProfile.username,
        userEmail: updatedProfile.email,
        emailVerified: updatedProfile.emailVerified,
      });
      setUsernameMessage("用户名已更新");
    } catch (error) {
      setUsernameMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setUsernameSaving(false);
    }
  };

  const handlePasswordUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordSaving(true);
    setPasswordMessage("");

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordMessage(error.message);
        return;
      }

      setNewPassword("");
      setPasswordMessage("密码已更新");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "更新密码失败");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleEmailUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailSaving(true);
    setEmailMessage("");

    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() }, {
        emailRedirectTo: buildAuthCallbackUrl("/account"),
      });
      if (error) {
        setEmailMessage(error.message);
        return;
      }

      await syncStoreSummary();
      await loadProfile();
      setEmailMessage("更换邮箱请求已提交，请查收新邮箱并完成验证");
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : "提交更换邮箱失败");
    } finally {
      setEmailSaving(false);
    }
  };

  const handleDeleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setDeleteLoading(true);
    setDeleteMessage("");

    try {
      if (deleteConfirmation !== "DELETE") {
        setDeleteMessage("请输入 DELETE 以确认删除账号");
        return;
      }

      if (!userEmail) {
        setDeleteMessage("当前账号缺少邮箱信息，无法完成二次确认");
        return;
      }

      const reAuthResult = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: deletePassword,
      });

      if (reAuthResult.error) {
        setDeleteMessage(`二次确认失败：${reAuthResult.error.message}`);
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setDeleteMessage("请重新登录后再试");
        return;
      }

      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ confirmationText: deleteConfirmation }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setDeleteMessage(getApiErrorMessage(payload) || `删除账号失败（HTTP ${response.status}）`);
        return;
      }

      await supabase.auth.signOut();
      logout();
      window.location.href = "/";
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "删除账号失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen px-4 pb-16 pt-24 sm:px-6 lg:px-8">
      <Toolbar showDebugButton={false} />

      <div className="mx-auto max-w-5xl">
        <div className="rounded-[32px] border border-white/40 bg-white/75 p-8 shadow-[0_20px_80px_rgba(31,41,55,0.12)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-500">Account Center</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">账号中心</h1>
              <p className="mt-2 text-sm text-slate-600">
                管理公开用户名、邮箱验证状态和账号安全设置。
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
            >
              返回首页
            </Link>
          </div>

          {!authReady || loadingProfile ? (
            <div className="py-16 text-center text-slate-500">正在读取账号信息...</div>
          ) : !userId ? (
            <div className="py-16 text-center">
              <h2 className="text-xl font-semibold text-slate-900">请先登录</h2>
              <p className="mt-2 text-sm text-slate-600">登录后即可查看和管理个人账号设置。</p>
            </div>
          ) : profileError ? (
            <div className="mt-8 rounded-2xl bg-red-50 p-4 text-sm text-red-600">{profileError}</div>
          ) : profile ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="space-y-6">
                <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-lg">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-xl font-bold">
                      {(profile.username || username || "U")[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{profile.username}</div>
                      <div className="mt-1 text-sm text-slate-300">{profile.email || userEmail || "-"}</div>
                    </div>
                    <div className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${profile.emailVerified ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
                      {profile.emailVerified ? "邮箱已验证" : "邮箱未验证"}
                    </div>
                  </div>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/10 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-300">注册时间</div>
                      <div className="mt-2 text-sm font-medium text-white">{formatDateTime(profile.createdAt)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-300">最近更新</div>
                      <div className="mt-2 text-sm font-medium text-white">{formatDateTime(profile.updatedAt)}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(profile.roles.length > 0 ? profile.roles : ["member"]).map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                  {!profile.emailVerified && (
                    <div className="mt-4 rounded-2xl bg-amber-400/15 p-4 text-sm text-amber-100">
                      你当前仍可访问账号中心，但评论和活动排期编辑等受保护功能需要先完成邮箱验证。
                    </div>
                  )}
                </div>

                <form onSubmit={handleUsernameSave} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-slate-900">公开资料</h2>
                  <p className="mt-2 text-sm text-slate-600">用户名会作为公开展示名，用于评论区和其他社区功能。</p>
                  <label className="mt-5 block text-sm font-medium text-slate-700">
                    用户名
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(event) => setUsernameInput(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="输入新的公开用户名"
                    />
                  </label>
                  {usernameMessage && (
                    <div className={`mt-3 text-sm ${usernameMessage.includes("已") ? "text-emerald-600" : "text-red-500"}`}>
                      {usernameMessage}
                    </div>
                  )}
                  <div className="mt-5 flex justify-end">
                    <button
                      type="submit"
                      disabled={usernameSaving}
                      className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {usernameSaving ? "保存中..." : "保存用户名"}
                    </button>
                  </div>
                </form>
              </section>

              <section className="space-y-6">
                <form onSubmit={handlePasswordUpdate} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-slate-900">修改密码</h2>
                  <p className="mt-2 text-sm text-slate-600">请输入新的登录密码，长度至少为 6 位。</p>
                  <label className="mt-5 block text-sm font-medium text-slate-700">
                    新密码
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      minLength={6}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="输入新的密码"
                    />
                  </label>
                  {passwordMessage && (
                    <div className={`mt-3 text-sm ${passwordMessage.includes("已") ? "text-emerald-600" : "text-red-500"}`}>
                      {passwordMessage}
                    </div>
                  )}
                  <div className="mt-5 flex justify-end">
                    <button
                      type="submit"
                      disabled={passwordSaving || newPassword.length < 6}
                      className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {passwordSaving ? "更新中..." : "更新密码"}
                    </button>
                  </div>
                </form>

                <form onSubmit={handleEmailUpdate} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-slate-900">更换登录邮箱</h2>
                  <p className="mt-2 text-sm text-slate-600">提交后会由 Supabase 发起邮箱确认流程，请到新邮箱完成验证。</p>
                  <label className="mt-5 block text-sm font-medium text-slate-700">
                    新邮箱
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(event) => setNewEmail(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="输入新的邮箱地址"
                    />
                  </label>
                  {emailMessage && (
                    <div className={`mt-3 text-sm ${emailMessage.includes("已") || emailMessage.includes("提交") ? "text-emerald-600" : "text-red-500"}`}>
                      {emailMessage}
                    </div>
                  )}
                  <div className="mt-5 flex justify-end">
                    <button
                      type="submit"
                      disabled={emailSaving || !newEmail.trim()}
                      className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {emailSaving ? "提交中..." : "提交更换邮箱"}
                    </button>
                  </div>
                </form>

                <form onSubmit={handleDeleteAccount} className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-red-700">删除账号</h2>
                  <p className="mt-2 text-sm text-red-600">
                    此操作不可撤销。系统会尝试删除你的认证账号以及与之关联的资料数据。
                  </p>
                  <label className="mt-5 block text-sm font-medium text-red-700">
                    当前密码
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(event) => setDeletePassword(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-red-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100"
                      placeholder="输入当前密码进行二次确认"
                    />
                  </label>
                  <label className="mt-4 block text-sm font-medium text-red-700">
                    输入 DELETE 确认
                    <input
                      type="text"
                      value={deleteConfirmation}
                      onChange={(event) => setDeleteConfirmation(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-red-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100"
                      placeholder="DELETE"
                    />
                  </label>
                  {deleteMessage && <div className="mt-3 text-sm text-red-600">{deleteMessage}</div>}
                  <div className="mt-5 flex justify-end">
                    <button
                      type="submit"
                      disabled={deleteLoading || !deletePassword || deleteConfirmation !== "DELETE"}
                      className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deleteLoading ? "删除中..." : "永久删除账号"}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}