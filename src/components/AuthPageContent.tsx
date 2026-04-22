"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAuthCallbackUrl,
  buildAuthPath,
  normalizeAuthMode,
  normalizeInternalPath,
  readAuthProfileSummary,
  supabase,
  type AuthViewMode,
} from "@/lib/supabase";
import { isTurnstileEnabled } from "@/lib/turnstile";
import { useGameStore } from "@/store/useGameStore";
import Toolbar from "./Toolbar";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "./TurnstileChallenge";

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function getModeTitle(mode: AuthViewMode): string {
  switch (mode) {
    case "register":
      return "创建账号";
    case "forgot-password":
      return "找回密码";
    default:
      return "登录账号";
  }
}

function getModeDescription(mode: AuthViewMode): string {
  switch (mode) {
    case "register":
      return "注册完成后，请先前往邮箱确认，再登录并使用完整的账号功能。";
    case "forgot-password":
      return "输入登录邮箱后，我们会在可用时向它发送后续操作邮件。";
    default:
      return "使用已绑定的邮箱登录，并在登录后前往账号中心管理资料和安全设置。";
  }
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

  const requireCaptchaToken = (): string | undefined => {
    if (!isTurnstileEnabled()) {
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
    const captchaToken = requireCaptchaToken();
    if (isTurnstileEnabled() && !captchaToken) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken },
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
      setError(getErrorMessage(authError, "登录失败"));
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

    if (password.length < 6) {
      setError("密码至少需要 6 位");
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    const captchaToken = requireCaptchaToken();
    if (isTurnstileEnabled() && !captchaToken) {
      setLoading(false);
      return;
    }

    try {
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .maybeSingle();

      if (existingProfileError) {
        throw new Error(`检查用户名是否可用失败：${existingProfileError.message}`);
      }

      if (existingProfile) {
        setError("该用户名已被占用");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          captchaToken,
          emailRedirectTo: buildAuthCallbackUrl("/account"),
          data: { username: normalizedUsername },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data.session && data.user?.email_confirmed_at) {
        const summary = await readAuthProfileSummary(data.session);
        if (summary) {
          setAuth({
            userId: summary.userId,
            username: summary.username,
            userEmail: summary.email,
            emailVerified: summary.emailVerified,
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
      const message = getErrorMessage(authError, "注册失败");
      if (message.includes("Database error saving new user")) {
        setError("注册失败，请更换用户名后重试。");
      } else {
        setError(message);
      }
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
    if (isTurnstileEnabled() && !captchaToken) {
      setLoading(false);
      return;
    }

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        captchaToken,
        redirectTo: buildAuthCallbackUrl("/account"),
      });

      if (resetError) {
        throw resetError;
      }

      setNotice("如果该邮箱已绑定账号，我们会向它发送修改密码邮件。");
    } catch (authError) {
      setError(getErrorMessage(authError, "发送邮件失败"));
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

  return (
    <main className="relative min-h-screen px-4 pb-16 pt-24 sm:px-6 lg:px-8">
      <Toolbar showDebugButton={false} />

      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[32px] border border-white/50 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.28),_transparent_32%),linear-gradient(145deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92))] p-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-sky-200">Account Access</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight">把登录、注册和安全操作收口到同一入口。</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-200/90">
              登录后，你可以在账号中心查看验证状态、更新公开资料、处理邮箱变更，并通过安全邮件完成密码重置。
            </p>

            <div className="mt-8 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <div className="text-sm font-semibold text-white">注册后先验证邮箱</div>
                <div className="mt-2 text-sm leading-6 text-slate-200/85">
                  未验证的账号仍可登录，但评论和活动编辑等受保护功能会继续受限。
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <div className="text-sm font-semibold text-white">密码修改统一走安全邮件</div>
                <div className="mt-2 text-sm leading-6 text-slate-200/85">
                  无论是忘记密码，还是主动更换密码，最终都会通过邮件中的页面完成设置，避免在站内直接暴露敏感操作。
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-sm">
              <Link
                href="/"
                className="rounded-full border border-white/20 px-5 py-2 font-semibold text-white transition hover:bg-white/10"
              >
                返回首页
              </Link>
              <Link
                href="/account"
                className="rounded-full bg-white px-5 py-2 font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                前往账号中心
              </Link>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/60 bg-white/85 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-500">Account</p>
                <h2 className="mt-2 text-3xl font-bold text-slate-900">{getModeTitle(mode)}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{getModeDescription(mode)}</p>
              </div>
              {authReady && userId && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  当前已登录为 {username || "当前账号"}。
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
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
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder={mode === "register" ? "设置登录密码" : "输入登录密码"}
                    minLength={6}
                    required
                  />
                </label>
              )}

              {mode === "register" && (
                <label className="block text-sm font-medium text-slate-700">
                  确认密码
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="再次输入密码"
                    minLength={6}
                    required
                  />
                </label>
              )}

              <TurnstileChallenge
                ref={captchaRef}
                action={`auth-${mode}`}
                title="人机验证"
                description="为防止恶意注册和批量请求，登录、注册和找回密码前都需要先完成一次验证。"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-sm text-slate-500">
                  {mode === "register"
                    ? "注册后请先完成邮箱验证。"
                    : mode === "forgot-password"
                      ? "邮件发送后，请在收件箱和垃圾邮件箱中查看。"
                      : "还没有账号？切换到“注册”即可创建。"}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? "处理中..."
                    : mode === "login"
                      ? "登录"
                      : mode === "register"
                        ? "注册"
                        : "发送修改密码邮件"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}