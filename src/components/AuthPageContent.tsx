"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatAuthErrorMessage } from "@/lib/auth-error";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { createNativeValidationProps } from "@/lib/native-validation";
import {
  buildAuthCallbackUrl,
  buildAuthPath,
  normalizeAuthMode,
  normalizeInternalPath,
  readAuthProfileSummary,
  supabase,
  type AuthViewMode,
} from "@/lib/supabase";
import { PASSWORD_POLICY_MESSAGE, isPasswordStrongEnough } from "@/lib/password-policy";
import { isTurnstileEnabled } from "@/lib/turnstile";
import { useGameStore } from "@/store/useGameStore";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "./TurnstileChallenge";

function getModeTitle(mode: AuthViewMode): string {
  switch (mode) {
    case "register":
      return "创建账号";
    case "forgot-password":
      return "重置密码";
    default:
      return "登录";
  }
}

function getModeDescription(mode: AuthViewMode): string {
  switch (mode) {
    case "register":
      return "注册后需完成邮箱确认，才能使用完整功能。";
    case "forgot-password":
      return "我们会把重置链接发送到你的邮箱。";
    default:
      return "使用邮箱登录。";
  }
}

interface SignUpResponseData {
  requiresEmailVerification: boolean;
  session: {
    accessToken: string;
    refreshToken: string;
  } | null;
  authSummary: {
    userId: string;
    username: string;
    email: string | null;
    emailVerified: boolean;
  } | null;
}

export default function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authReady, userId, username, setAuth } = useGameStore();

  const searchMode = useMemo(() => normalizeAuthMode(searchParams.get("mode")), [searchParams]);
  const nextPath = useMemo(() => normalizeInternalPath(searchParams.get("next"), "/account"), [searchParams]);

  const [mode, setMode] = useState<AuthViewMode>(searchMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const captchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const shouldShowCaptcha = isTurnstileEnabled() && mode !== "login";
  const usernameValidationProps = createNativeValidationProps({ label: "用户名" });
  const emailValidationProps = createNativeValidationProps({ label: "邮箱", invalidTypeMessage: "请输入有效的邮箱地址。" });
  const passwordValidationProps = createNativeValidationProps({ label: "密码", minLengthMessage: PASSWORD_POLICY_MESSAGE });
  const confirmPasswordValidationProps = createNativeValidationProps({ label: "确认密码", minLengthMessage: PASSWORD_POLICY_MESSAGE });

  const requireCaptchaToken = (): string | undefined => {
    if (!shouldShowCaptcha) {
      return undefined;
    }

    const token = captchaRef.current?.getToken() ?? undefined;
    if (!token) {
      setError("请先完成人机验证。");
      return undefined;
    }

    return token;
  };

  const resetCaptcha = () => {
    captchaRef.current?.reset();
  };

  useEffect(() => {
    if (searchMode === mode) {
      return;
    }

    setMode(searchMode);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");

    if (searchMode !== "register") {
      setUsernameInput("");
    }

    resetCaptcha();
  }, [mode, searchMode]);

  const switchMode = (nextMode: AuthViewMode) => {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");

    if (nextMode !== "register") {
      setUsernameInput("");
    }

    resetCaptcha();
    router.replace(buildAuthPath(nextMode, nextPath));
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        throw signInError;
      }

      const summary = await readAuthProfileSummary(data.session);
      if (!summary) {
        throw new Error("登录后未能读取账号信息");
      }

      setAuth({
        userId: summary.userId,
        username: summary.username,
        userEmail: summary.email,
        emailVerified: summary.emailVerified,
      });

      router.replace(nextPath);
    } catch (authError) {
      setError(formatAuthErrorMessage(authError, "登录失败", "login"));
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");

    const normalizedUsername = usernameInput.trim();
    const normalizedEmail = email.trim();

    if (!normalizedUsername) {
      setError("请输入用户名");
      return;
    }

    if (!isPasswordStrongEnough(password)) {
      setError(PASSWORD_POLICY_MESSAGE);
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    const captchaToken = requireCaptchaToken();
    if (shouldShowCaptcha && !captchaToken) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: normalizedUsername,
          email: normalizedEmail,
          password,
          captchaToken,
          redirectTo: buildAuthCallbackUrl("/account"),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(getApiErrorMessage(payload) || `注册失败（HTTP ${response.status}）`);
        return;
      }

      const result = parseApiSuccessData<SignUpResponseData>(payload);
      if (!result) {
        setError("注册返回格式无效");
        return;
      }

      if (result.session && result.authSummary) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: result.session.accessToken,
          refresh_token: result.session.refreshToken,
        });

        if (setSessionError) {
          throw setSessionError;
        }

        if (result.authSummary.emailVerified) {
          setAuth({
            userId: result.authSummary.userId,
            username: result.authSummary.username,
            userEmail: result.authSummary.email,
            emailVerified: result.authSummary.emailVerified,
          });

          router.replace(nextPath);
          return;
        }
      }

      setMode("login");
      setPassword("");
      setConfirmPassword("");
      router.replace(buildAuthPath("login", nextPath));
      setNotice("注册成功，请先前往邮箱完成验证，然后再登录。");
    } catch (authError) {
      setError(formatAuthErrorMessage(authError, "注册失败", "register"));
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("请输入邮箱地址");
      return;
    }

    setLoading(true);
    const captchaToken = requireCaptchaToken();
    if (shouldShowCaptcha && !captchaToken) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          captchaToken,
          redirectTo: buildAuthCallbackUrl("/account"),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(getApiErrorMessage(payload) || `发送邮件失败（HTTP ${response.status}）`);
        return;
      }

      setNotice("如果该邮箱已绑定账号，我们会向它发送重置链接。");
    } catch (authError) {
      setError(formatAuthErrorMessage(authError, "发送邮件失败", "forgot-password"));
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

  return (
    <main className="relative min-h-full px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl">
        <section className="rounded-[32px] border border-white/60 bg-white/85 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-500">Account</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">{getModeTitle(mode)}</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{getModeDescription(mode)}</p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
            >
              返回首页
            </Link>
          </div>

          {authReady && userId && (
            <div className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              当前已登录为 {username || "当前账号"}。如需管理资料，请直接前往账号中心。
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "login" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "register" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              注册
            </button>
            <button
              type="button"
              onClick={() => switchMode("forgot-password")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "forgot-password" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              忘记密码
            </button>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-600">
              {error}
            </div>
          )}

          {notice && (
            <div className="mt-6 rounded-2xl bg-sky-50 p-4 text-sm leading-6 text-sky-700">
              {notice}
            </div>
          )}

          <form onSubmit={mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgotPassword} className="mt-6 space-y-5">
              {mode === "register" && (
                <label className="block text-sm font-medium text-slate-700">
                  用户名
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.target.value)}
                    {...usernameValidationProps}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="输入你的公开用户名"
                    required
                  />
                </label>
              )}

              <label className="block text-sm font-medium text-slate-700">
                邮箱
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  {...emailValidationProps}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="输入登录邮箱"
                  required
                />
              </label>

              {mode !== "forgot-password" && (
                <label className="block text-sm font-medium text-slate-700">
                  密码
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    {...passwordValidationProps}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder={mode === "register" ? "设置登录密码" : "输入登录密码"}
                    minLength={8}
                    required
                  />
                  {mode === "register" && (
                    <span className="mt-2 block text-xs leading-5 text-slate-500">
                      {PASSWORD_POLICY_MESSAGE}
                    </span>
                  )}
                </label>
              )}

              {mode === "register" && (
                <label className="block text-sm font-medium text-slate-700">
                  确认密码
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    {...confirmPasswordValidationProps}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="再次输入密码"
                    minLength={8}
                    required
                  />
                </label>
              )}

              {shouldShowCaptcha && (
                <TurnstileChallenge
                  ref={captchaRef}
                  action={`auth-${mode}`}
                  title="安全验证"
                  description={mode === "register" ? "创建账号前，请先完成安全验证。" : "发送重置链接前，请先完成安全验证。"}
                  variant="inline"
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-sm text-slate-500">
                  {mode === "register"
                    ? "注册后需完成邮箱确认。"
                    : mode === "forgot-password"
                      ? "发送完成后，请到邮箱中继续。"
                      : "还没有账号？切换到“注册”即可创建。"}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="hhwx-accent-button"
                >
                  {loading
                    ? "处理中..."
                    : mode === "login"
                      ? "登录"
                      : mode === "register"
                        ? "注册"
                        : "发送重置链接"}
                </button>
              </div>

              {authReady && userId && (
                <div className="pt-3 text-right">
                  <Link href="/account" className="text-sm font-semibold text-sky-600 transition hover:text-sky-500">
                    前往账号中心
                  </Link>
                </div>
              )}
            </form>
        </section>
      </div>
    </main>
  );
}