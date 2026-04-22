"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "@/components/TurnstileChallenge";
import Toolbar from "@/components/Toolbar";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { buildAuthCallbackUrl, buildAuthPath, getSafeSession, readAuthProfileSummary, supabase } from "@/lib/supabase";
import { isTurnstileEnabled } from "@/lib/turnstile";
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

  const [passwordResetSending, setPasswordResetSending] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const captchaRef = useRef<TurnstileChallengeHandle | null>(null);

  const requireCaptchaToken = (setMessage: (message: string) => void): string | undefined => {
    if (!isTurnstileEnabled()) {
      return undefined;
    }

    const token = captchaRef.current?.getToken() ?? undefined;
    if (!token) {
      setMessage("请先完成人机验证。");
      return undefined;
    }

    return token;
  };

  const resetCaptcha = () => {
    captchaRef.current?.reset();
  };

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

  const handlePasswordResetRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordResetSending(true);
    setPasswordMessage("");
    const captchaToken = requireCaptchaToken(setPasswordMessage);
    if (isTurnstileEnabled() && !captchaToken) {
      setPasswordResetSending(false);
      return;
    }

    try {
      const currentEmail = (profile?.email ?? userEmail ?? "").trim();
      if (!currentEmail) {
        setPasswordMessage("当前账号缺少可用邮箱，暂时无法发送重置邮件。");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(currentEmail, {
        captchaToken,
        redirectTo: buildAuthCallbackUrl("/account"),
      });

      if (error) {
        setPasswordMessage(error.message);
        return;
      }

      setPasswordMessage("修改密码邮件已发送，请前往当前邮箱继续操作。");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "发送修改密码邮件失败");
    } finally {
      setPasswordResetSending(false);
      resetCaptcha();
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
      setEmailMessage("确认邮件已发送到新邮箱，请按邮件提示完成更换。");
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : "提交更换邮箱失败");
    } finally {
      setEmailSaving(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    setVerificationMessage("");
    setResendingVerification(true);
    const captchaToken = requireCaptchaToken(setVerificationMessage);
    if (isTurnstileEnabled() && !captchaToken) {
      setResendingVerification(false);
      return;
    }

    try {
      const currentEmail = (profile?.email ?? userEmail ?? "").trim();
      if (!currentEmail) {
        setVerificationMessage("当前账号缺少邮箱信息，无法重发验证邮件。");
        return;
      }

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: currentEmail,
        options: {
          captchaToken,
          emailRedirectTo: buildAuthCallbackUrl("/account"),
        },
      });

      if (error) {
        setVerificationMessage(error.message);
        return;
      }

      setVerificationMessage("验证邮件已发送到当前邮箱，请检查收件箱和垃圾邮件箱。");
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : "重发验证邮件失败");
    } finally {
      setResendingVerification(false);
      resetCaptcha();
    }
  };

  const handleDeleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setDeleteLoading(true);
    setDeleteMessage("");
    const captchaToken = requireCaptchaToken(setDeleteMessage);
    if (isTurnstileEnabled() && !captchaToken) {
      setDeleteLoading(false);
      return;
    }

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
        options: { captchaToken },
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
      resetCaptcha();
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
              <div className="mt-5">
                <Link
                  href={buildAuthPath("login", "/account")}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  前往登录页
                </Link>
              </div>
            </div>
          ) : profileError ? (
            <div className="mt-8 rounded-2xl bg-red-50 p-4 text-sm text-red-600">{profileError}</div>
          ) : profile ? (
            <div className="mt-8 space-y-6">
              <TurnstileChallenge
                ref={captchaRef}
                action="account-security"
                title="账户安全验证"
                description="为防止恶意请求，重发验证邮件、发送修改密码邮件和删除账号前，请先完成一次人机验证。"
              />

              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
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
                      <p>你当前仍可访问账号中心，但评论和活动排期编辑等受保护功能需要先完成邮箱验证。</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleResendVerificationEmail}
                          disabled={resendingVerification}
                          className="rounded-full bg-white/15 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {resendingVerification ? "发送中..." : "重发验证邮件"}
                        </button>
                        {verificationMessage && (
                          <span className="text-xs text-amber-50">{verificationMessage}</span>
                        )}
                      </div>
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
                <form id="security" onSubmit={handlePasswordResetRequest} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-slate-900">修改密码</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    如果你想更换登录密码，我们会向当前邮箱发送一封安全邮件。打开邮件里的页面后，再设置新的登录密码。
                  </p>
                  <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    当前接收邮箱：{profile.email || userEmail || "-"}
                  </div>
                  {passwordMessage && (
                    <div className={`mt-3 text-sm ${passwordMessage.includes("已") ? "text-emerald-600" : "text-red-500"}`}>
                      {passwordMessage}
                    </div>
                  )}
                  <div className="mt-5 flex justify-end">
                    <button
                      type="submit"
                      disabled={passwordResetSending}
                      className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {passwordResetSending ? "发送中..." : "发送修改密码邮件"}
                    </button>
                  </div>
                </form>

                <form onSubmit={handleEmailUpdate} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-slate-900">更换登录邮箱</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">提交后，我们会向新邮箱发送一封确认邮件。按邮件里的提示完成操作后，新的登录邮箱才会正式生效。</p>
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
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}