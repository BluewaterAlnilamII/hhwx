"use client";

import Link from "next/link";
import { type EmailOtpType } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAuthPath,
  getSafeSession,
  normalizeInternalPath,
  readAuthProfileSummary,
  supabase,
} from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

type CallbackStatus = "verifying" | "success" | "error" | "recovery";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function getSuccessMessage(type: string | null): string {
  switch (type) {
    case "email_change":
      return "新邮箱已验证，正在返回账号中心。";
    case "magiclink":
      return "登录已确认，正在继续。";
    case "invite":
      return "邀请已确认，正在继续。";
    default:
      return "邮箱验证成功，正在继续。";
  }
}

function getStatusHeading(status: CallbackStatus): string {
  switch (status) {
    case "success":
      return "认证成功";
    case "error":
      return "认证未完成";
    case "recovery":
      return "设置新密码";
    default:
      return "认证处理中";
  }
}

function AuthConfirmPageFallback() {
  return (
    <main className="relative min-h-screen px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl rounded-[32px] border border-white/50 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-500">Auth Callback</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">认证处理中</h1>
        </div>
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-sky-100 border-t-sky-500" />
          <p className="text-sm leading-6 text-slate-600">正在处理认证结果，请稍候...</p>
        </div>
      </div>
    </main>
  );
}

function AuthConfirmPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth, logout } = useGameStore();

  const [status, setStatus] = useState<CallbackStatus>("verifying");
  const [message, setMessage] = useState("正在处理认证结果，请稍候...");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const hasHandledRef = useRef(false);

  const nextPath = useMemo(() => {
    return normalizeInternalPath(searchParams.get("next"), "/account");
  }, [searchParams]);

  useEffect(() => {
    if (status !== "success") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      router.replace(nextPath);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [nextPath, router, status]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStatus("recovery");
        setMessage("认证已完成，请设置一个新密码。");
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setStatus((currentStatus) => (currentStatus === "verifying" ? "success" : currentStatus));
        setMessage((currentMessage) => (
          currentMessage === "正在处理认证结果，请稍候..."
            ? "邮箱验证成功，正在同步账号信息..."
            : currentMessage
        ));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (hasHandledRef.current) {
      return;
    }

    hasHandledRef.current = true;

    let active = true;

    const syncStore = async () => {
      try {
        const summary = await readAuthProfileSummary();
        if (!summary) {
          logout();
          return null;
        }

        setAuth({
          userId: summary.userId,
          username: summary.username,
          userEmail: summary.email,
          emailVerified: summary.emailVerified,
        });

        return summary;
      } catch (error) {
        console.error("Auth confirm sync error:", error);
        return null;
      }
    };

    const handleSuccess = async (type: string | null) => {
      if (type === "recovery") {
        if (active) {
          setStatus("recovery");
          setMessage("认证已完成，请设置一个新密码。");
        }
        return;
      }

      if (active) {
        setStatus("success");
        setMessage(getSuccessMessage(type));
      }

      await syncStore();
    };

    const run = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const tokenHash = searchParams.get("token_hash");
        const searchType = searchParams.get("type");
        const hashType = hashParams.get("type");
        const type = searchType ?? hashType;
        const errorDescription = searchParams.get("error_description")
          ?? hashParams.get("error_description")
          ?? searchParams.get("error")
          ?? hashParams.get("error");

        if (window.location.hash) {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        }

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (tokenHash && type && EMAIL_OTP_TYPES.has(type as EmailOtpType)) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as EmailOtpType,
          });
          if (error) {
            throw error;
          }

          await handleSuccess(type);
          return;
        }

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }

          await handleSuccess(type);
          return;
        }

        const session = await getSafeSession();
        if (session) {
          await handleSuccess(type);
          return;
        }

        throw new Error("认证链接缺少必要参数，可能已失效或已被使用。");
      } catch (error) {
        console.error("Auth confirm page error:", error);
        logout();

        if (active) {
          setStatus("error");
          setMessage(getErrorMessage(error, "认证失败，请重新请求邮件。"));
        }
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [logout, searchParams, setAuth, status]);

  const handlePasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage("");

    if (newPassword.length < 6) {
      setPasswordMessage("新密码至少需要 6 位。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("两次输入的新密码不一致。");
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordMessage(error.message);
        return;
      }

      await readAuthProfileSummary().catch(() => null);
      setStatus("success");
      setMessage("新密码已设置成功，正在返回账号中心。");
      setPasswordMessage("");
    } catch (error) {
      setPasswordMessage(getErrorMessage(error, "设置新密码失败"));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <main className="relative min-h-screen px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl rounded-[32px] border border-white/50 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-500">Auth Callback</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">{getStatusHeading(status)}</h1>
        </div>

        {status === "verifying" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-sky-100 border-t-sky-500" />
            <p className="text-sm leading-6 text-slate-600">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-600">
              {message}
            </div>
            <div className="flex justify-center gap-3">
              <Link
                href="/"
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                返回首页
              </Link>
              <Link
                href={buildAuthPath("login", nextPath)}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
              >
                前往登录页
              </Link>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
              ✓
            </div>
            <p className="text-sm leading-6 text-slate-600">{message}</p>
            <button
              type="button"
              onClick={() => router.replace(nextPath)}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              立即继续
            </button>
          </div>
        )}

        {status === "recovery" && (
          <form onSubmit={handlePasswordReset} className="space-y-5">
            <div className="rounded-2xl bg-sky-50 p-4 text-sm leading-6 text-sky-700">
              {message}
            </div>
            <label className="block text-sm font-medium text-slate-700">
              新密码
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={6}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="输入新密码"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              确认新密码
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={6}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="再次输入新密码"
              />
            </label>
            {passwordMessage && (
              <div className="text-sm text-red-500">{passwordMessage}</div>
            )}
            <div className="flex justify-end gap-3">
              <Link
                href="/"
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
              >
                返回首页
              </Link>
              <button
                type="submit"
                disabled={savingPassword}
                className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPassword ? "保存中..." : "设置新密码"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<AuthConfirmPageFallback />}>
      <AuthConfirmPageContent />
    </Suspense>
  );
}