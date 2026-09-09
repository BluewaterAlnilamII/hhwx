"use client";

import Heading from "@/components/Heading";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatAuthErrorMessage } from "@/lib/auth-error";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { createNativeValidationProps } from "@/lib/native-validation";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import { getLocalizedAuthErrorMessages } from "@/lib/localized-auth-errors";
import {
  getLocalizedPasswordPolicyMessage,
  getLocalizedPasswordValidationMessage,
  getLocalizedUsernameHint,
  getLocalizedUsernameValidationMessage,
} from "@/lib/localized-validation";
import {
  buildAuthCallbackUrl,
  buildAuthPath,
  normalizeAuthMode,
  normalizeInternalPath,
  readAuthProfileSummary,
  supabase,
  type AuthFlashNotice,
  type AuthViewMode,
} from "@/lib/supabase";
import {
  normalizeUsernameValue,
} from "@/lib/username-policy";
import {
  PASSWORD_INPUT_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password-policy";
import { useTurnstileAvailability } from "@/hooks/useTurnstileAvailability";
import { useGameStore } from "@/store/useGameStore";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "./TurnstileChallenge";

function getModeMessageKey(mode: AuthViewMode): "login" | "register" | "forgotPassword" {
  return mode === "forgot-password" ? "forgotPassword" : mode;
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
  const locale = useLocale();
  const t = useTranslations("auth");
  const commonT = useTranslations("common");
  const errorT = useTranslations("errors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authReady, userId, username, setAuth } = useGameStore();

  const searchMode = useMemo(() => normalizeAuthMode(searchParams.get("mode")), [searchParams]);
  const nextPath = useMemo(() => normalizeInternalPath(searchParams.get("next"), "/account"), [searchParams]);
  const flashNotice = useMemo<AuthFlashNotice | null>(() => {
    const notice = searchParams.get("notice");
    return notice === "signup-email-sent" ? notice : null;
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const captchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const { isTurnstileEnabled, isTurnstileLoading } = useTurnstileAvailability();
  const mode = searchMode;
  const modeMessageKey = getModeMessageKey(mode);
  const shouldShowCaptcha = isTurnstileEnabled && mode !== "login";
  const passwordPolicyMessage = getLocalizedPasswordPolicyMessage(t);
  const usernameHint = getLocalizedUsernameHint(t);
  const authErrorMessages = useMemo(() => getLocalizedAuthErrorMessages(t), [t]);
  const usernameValidationProps = createNativeValidationProps({
    label: t("fields.username"),
    customValidationMessage: (value) => getLocalizedUsernameValidationMessage(value, t),
    requiredMessage: t("validation.usernameRequired"),
    minLengthMessage: usernameHint,
    maxLengthMessage: usernameHint,
    patternMessage: usernameHint,
  });
  const emailValidationProps = createNativeValidationProps({
    label: t("fields.email"),
    invalidTypeMessage: t("validation.invalidEmail"),
    requiredMessage: t("validation.required", { label: t("fields.email") }),
  });
  const passwordValidationProps = createNativeValidationProps({
    label: t("fields.password"),
    customValidationMessage: (value) => getLocalizedPasswordValidationMessage(value, t),
    requiredMessage: t("validation.required", { label: t("fields.password") }),
    minLengthMessage: passwordPolicyMessage,
    maxLengthMessage: passwordPolicyMessage,
    patternMessage: passwordPolicyMessage,
  });
  const confirmPasswordValidationProps = createNativeValidationProps({
    label: t("fields.confirmPassword"),
    customValidationMessage: (value) => getLocalizedPasswordValidationMessage(value, t),
    requiredMessage: t("validation.required", { label: t("fields.confirmPassword") }),
    minLengthMessage: passwordPolicyMessage,
    maxLengthMessage: passwordPolicyMessage,
    patternMessage: passwordPolicyMessage,
  });

  const requireCaptchaToken = (): string | undefined => {
    if (mode !== "login" && isTurnstileLoading) {
      setError(t("messages.captchaLoading"));
      return undefined;
    }

    if (!shouldShowCaptcha) {
      return undefined;
    }

    const token = captchaRef.current?.getToken() ?? undefined;
    if (!token) {
      setError(t("messages.captchaRequired"));
      return undefined;
    }

    return token;
  };

  const resetCaptcha = () => {
    captchaRef.current?.reset();
  };

  useEffect(() => {
    setNotice(flashNotice === "signup-email-sent" ? t("flash.signupEmailSent") : "");
  }, [flashNotice, t]);

  const switchMode = (nextMode: AuthViewMode) => {
    if (nextMode === mode) {
      return;
    }

    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");

    if (nextMode !== "register") {
      setUsernameInput("");
    }

    resetCaptcha();
    router.replace(buildAuthPath(nextMode, nextPath, undefined, locale));
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

      const summary = await readAuthProfileSummary(data.session, { forceRefresh: true });
      if (!summary) {
        throw new Error(t("messages.loginMissingSummary"));
      }

      setAuth({
        userId: summary.userId,
        username: summary.username,
        userEmail: summary.email,
        emailVerified: summary.emailVerified,
      });

      router.replace(nextPath);
    } catch (authError) {
      setError(formatAuthErrorMessage(authError, t("mode.login.title"), "login", authErrorMessages));
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");

    const normalizedUsername = normalizeUsernameValue(usernameInput);
    const normalizedEmail = email.trim();

    if (!normalizedUsername) {
      setError(t("validation.usernameRequired"));
      return;
    }

    const usernameValidationError = getLocalizedUsernameValidationMessage(normalizedUsername, t);
    if (usernameValidationError) {
      setError(usernameValidationError);
      return;
    }

    if (normalizedUsername !== usernameInput) {
      setUsernameInput(normalizedUsername);
    }

    const passwordValidationError = getLocalizedPasswordValidationMessage(password, t);
    if (passwordValidationError) {
      setError(passwordValidationError);
      return;
    }

    if (password !== confirmPassword) {
      setError(t("messages.passwordMismatch"));
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
          redirectTo: buildAuthCallbackUrl("/account", locale),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(getLocalizedApiErrorMessage(payload, errorT) || t("messages.registerFailed", { status: response.status }));
        return;
      }

      const result = parseApiSuccessData<SignUpResponseData>(payload);
      if (!result) {
        setError(t("messages.invalidSignupResponse"));
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

        setAuth({
          userId: result.authSummary.userId,
          username: result.authSummary.username,
          userEmail: result.authSummary.email,
          emailVerified: result.authSummary.emailVerified,
        });

        router.replace(nextPath);
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setError("");
      resetCaptcha();
      router.replace(buildAuthPath("login", nextPath, "signup-email-sent", locale));
      return;
    } catch (authError) {
      setError(formatAuthErrorMessage(authError, t("mode.register.title"), "register", authErrorMessages));
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
      setError(t("validation.invalidEmail"));
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
          redirectTo: buildAuthCallbackUrl("/account", locale),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(getLocalizedApiErrorMessage(payload, errorT) || t("messages.sendMailFailed", { status: response.status }));
        return;
      }

      setNotice(t("messages.resetEmailSent"));
    } catch (authError) {
      setError(formatAuthErrorMessage(authError, t("messages.sendMailFailed", { status: "" }), "forgot-password", authErrorMessages));
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

  return (
    <main className="relative min-h-full px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl">
        <section className="hhwx-panel border p-8">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--theme-color-border-subtle)] pb-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--theme-color-action-secondary-foreground)]">{t("section")}</p>
              <Heading as="h1" visualRole="page" className="mt-2">{t(`mode.${modeMessageKey}.title`)}</Heading>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--theme-color-text-muted)]">{t(`mode.${modeMessageKey}.description`)}</p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-2 text-sm font-semibold text-[var(--theme-color-text-default)] transition hover:border-[var(--theme-color-action-secondary-border)] hover:text-[var(--theme-color-action-secondary-foreground)]"
            >
              {t("actions.backHome")}
            </Link>
          </div>

          {authReady && userId && (
            <div className="mt-6 rounded-2xl bg-[var(--theme-color-semantic-success-background)] px-4 py-3 text-sm text-[var(--theme-color-semantic-success-foreground)]">
              {t("messages.alreadySignedIn", { username: username || t("messages.currentAccount") })}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "login" ? "bg-[var(--theme-color-action-accent-background)] text-[var(--theme-color-text-on-emphasis)]" : "bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-muted)]"}`}
            >
              {t("actions.login")}
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "register" ? "bg-[var(--theme-color-action-accent-background)] text-[var(--theme-color-text-on-emphasis)]" : "bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-muted)]"}`}
            >
              {t("actions.register")}
            </button>
            <button
              type="button"
              onClick={() => switchMode("forgot-password")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "forgot-password" ? "bg-[var(--theme-color-action-accent-background)] text-[var(--theme-color-text-on-emphasis)]" : "bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-muted)]"}`}
            >
              {t("actions.forgotPassword")}
            </button>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl bg-[var(--theme-color-semantic-danger-background)] p-4 text-sm leading-6 text-[var(--theme-color-semantic-danger-foreground)]">
              {error}
            </div>
          )}

          {notice && (
            <div className="mt-6 rounded-2xl bg-[var(--theme-color-semantic-info-background)] p-4 text-sm leading-6 text-[var(--theme-color-semantic-info-foreground)]">
              {notice}
            </div>
          )}

          <form onSubmit={mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgotPassword} className="mt-6 space-y-5">
              {mode === "register" && (
                <label className="block text-sm font-medium text-[var(--theme-color-text-default)]">
                  {t("fields.username")}
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.target.value)}
                    {...usernameValidationProps}
                    className="hhwx-control mt-2 w-full rounded-2xl border px-4 py-3 transition"
                    placeholder={t("validation.usernamePlaceholder")}
                    required
                  />
                  <span className="mt-2 block text-xs leading-5 text-[var(--theme-color-text-muted)]">
                    {usernameHint}
                  </span>
                </label>
              )}

              <label className="block text-sm font-medium text-[var(--theme-color-text-default)]">
                {t("fields.email")}
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  {...emailValidationProps}
                  className="hhwx-control mt-2 w-full rounded-2xl border px-4 py-3 transition"
                  placeholder={t("placeholders.email")}
                  required
                />
              </label>

              {mode !== "forgot-password" && (
                <label className="block text-sm font-medium text-[var(--theme-color-text-default)]">
                  {t("fields.password")}
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    {...passwordValidationProps}
                    className="hhwx-control mt-2 w-full rounded-2xl border px-4 py-3 transition"
                    placeholder={t("placeholders.password")}
                    minLength={PASSWORD_MIN_LENGTH}
                    maxLength={PASSWORD_MAX_LENGTH}
                    pattern={PASSWORD_INPUT_PATTERN}
                    required
                  />
                  {mode === "register" && (
                    <span className="mt-2 block text-xs leading-5 text-[var(--theme-color-text-muted)]">
                      {passwordPolicyMessage}
                    </span>
                  )}
                </label>
              )}

              {mode === "register" && (
                <label className="block text-sm font-medium text-[var(--theme-color-text-default)]">
                  {t("fields.confirmPassword")}
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    {...confirmPasswordValidationProps}
                    className="hhwx-control mt-2 w-full rounded-2xl border px-4 py-3 transition"
                    placeholder={t("placeholders.confirmPassword")}
                    minLength={PASSWORD_MIN_LENGTH}
                    maxLength={PASSWORD_MAX_LENGTH}
                    pattern={PASSWORD_INPUT_PATTERN}
                    required
                  />
                </label>
              )}

              {shouldShowCaptcha && (
                <TurnstileChallenge
                  ref={captchaRef}
                  action={`auth-${mode}`}
                  title={t("messages.captchaTitle")}
                  description=""
                  notConfiguredTitle={t("turnstile.notConfiguredTitle")}
                  notConfiguredDescription={t("turnstile.notConfiguredDescription")}
                  expiredMessage={t("turnstile.expired")}
                  loadFailedMessage={t("turnstile.loadFailed")}
                  variant="inline"
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-sm text-[var(--theme-color-text-muted)]">
                  {t(`mode.${modeMessageKey}.footerDescription`)}
                </div>
                <button
                  type="submit"
                  disabled={loading || (mode !== "login" && isTurnstileLoading)}
                  className="hhwx-accent-button"
                >
                  {loading
                    ? commonT("actions.loading")
                    : mode === "login"
                      ? t("actions.login")
                      : mode === "register"
                        ? t("actions.register")
                        : t("actions.sendResetEmail")}
                </button>
              </div>

              {authReady && userId && (
                <div className="pt-3 text-right">
                  <Link href="/account" className="text-sm font-semibold text-[var(--theme-color-action-secondary-foreground)] transition hover:text-[var(--theme-color-action-secondary-foreground)]">
                    {t("messages.accountCenter")}
                  </Link>
                </div>
              )}
            </form>
        </section>
      </div>
    </main>
  );
}
