"use client";

import { type EmailOtpType } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { formatAuthErrorMessage } from "@/lib/auth-error";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import { getLocalizedAuthErrorMessages } from "@/lib/localized-auth-errors";
import {
  getLocalizedPasswordPolicyMessage,
  getLocalizedPasswordValidationMessage,
} from "@/lib/localized-validation";
import { createNativeValidationProps } from "@/lib/native-validation";
import {
  buildAuthPath,
  getSafeSession,
  normalizeInternalPath,
  readAuthProfileSummary,
  supabase,
} from "@/lib/supabase";
import {
  PASSWORD_INPUT_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password-policy";
import { useGameStore } from "@/store/useGameStore";

type CallbackStatus = "verifying" | "success" | "error" | "recovery";
type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

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

function getSuccessMessage(type: string | null, t: TranslationFn): string {
  switch (type) {
    case "email_change":
      return t("newEmailComplete");
    case "magiclink":
      return t("loginComplete");
    case "invite":
      return t("inviteComplete");
    default:
      return t("emailComplete");
  }
}

function getStatusHeading(status: CallbackStatus, t: TranslationFn): string {
  switch (status) {
    case "success":
      return t("done");
    case "error":
      return t("incomplete");
    case "recovery":
      return t("resetPassword");
    default:
      return t("processing");
  }
}

function AuthConfirmPageFallback() {
  const t = useTranslations("auth.confirm");
  const commonT = useTranslations("common");

  return (
    <main className="relative min-h-full px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl rounded-[32px] border border-white/50 bg-[#fffef4] p-8 shadow-[0_20px_80px_rgba(15,23,42,0.14)]">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-500">{t("section")}</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">{t("title")}</h1>
        </div>
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-sky-100 border-t-sky-500" />
          <p className="text-sm leading-6 text-slate-600">{commonT("states.loadingPage")}</p>
        </div>
      </div>
    </main>
  );
}

function AuthConfirmPageContent() {
  const locale = useLocale();
  const t = useTranslations("auth.confirm");
  const authT = useTranslations("auth");
  const errorT = useTranslations("errors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth, logout } = useGameStore();

  const [status, setStatus] = useState<CallbackStatus>("verifying");
  const initialMessage = t("initialMessage");
  const [message, setMessage] = useState(initialMessage);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const hasHandledRef = useRef(false);
  const passwordPolicyMessage = getLocalizedPasswordPolicyMessage(authT);
  const authErrorMessages = useMemo(() => getLocalizedAuthErrorMessages(authT), [authT]);
  const passwordValidationProps = createNativeValidationProps({
    label: authT("fields.newPassword"),
    customValidationMessage: (value) => getLocalizedPasswordValidationMessage(value, authT),
    requiredMessage: authT("validation.required", { label: authT("fields.newPassword") }),
    minLengthMessage: passwordPolicyMessage,
    maxLengthMessage: passwordPolicyMessage,
    patternMessage: passwordPolicyMessage,
  });
  const confirmPasswordValidationProps = createNativeValidationProps({
    label: authT("fields.confirmNewPassword"),
    customValidationMessage: (value) => getLocalizedPasswordValidationMessage(value, authT),
    requiredMessage: authT("validation.required", { label: authT("fields.confirmNewPassword") }),
    minLengthMessage: passwordPolicyMessage,
    maxLengthMessage: passwordPolicyMessage,
    patternMessage: passwordPolicyMessage,
  });

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
        setMessage(t("passwordReady"));
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setStatus((currentStatus) => (currentStatus === "verifying" ? "success" : currentStatus));
        setMessage((currentMessage) => (
          currentMessage === initialMessage
            ? t("syncing")
            : currentMessage
        ));
      }
    });

    return () => subscription.unsubscribe();
  }, [initialMessage, t]);

  useEffect(() => {
    if (hasHandledRef.current) {
      return;
    }

    hasHandledRef.current = true;

    let active = true;

    const syncStore = async (options?: { forceRefresh?: boolean }) => {
      try {
        const summary = await readAuthProfileSummary(null, options);
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

    const confirmAccountEmail = async () => {
      const verificationToken = searchParams.get("verification_token") ?? "";
      const session = await getSafeSession();
      if (!session?.access_token) {
        throw new Error(t("expiredSession"));
      }

      const response = await fetch("/api/auth/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "confirm",
          verificationToken,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(getLocalizedApiErrorMessage(payload, errorT) || t("emailConfirmFailed", { status: response.status }));
      }
    };

    const handleSuccess = async (type: string | null) => {
      if (type === "recovery") {
        if (active) {
          setStatus("recovery");
          setMessage(t("passwordReady"));
        }
        return;
      }

      const shouldVerifyEmail = searchParams.get("verify_email") === "1" || type === "email_change";
      if (shouldVerifyEmail) {
        await confirmAccountEmail();
      }

      if (active) {
        setStatus("success");
        setMessage(getSuccessMessage(type, t));
      }

      await syncStore({ forceRefresh: shouldVerifyEmail });
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

        throw new Error(t("expiredLink"));
      } catch (error) {
        console.error("Auth confirm page error:", error);
        logout();

        if (active) {
          setStatus("error");
          setMessage(formatAuthErrorMessage(error, t("authFailed"), undefined, authErrorMessages));
        }
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [authErrorMessages, errorT, logout, searchParams, setAuth, status, t]);

  const handlePasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage("");

    const passwordValidationError = getLocalizedPasswordValidationMessage(newPassword, authT);
    if (passwordValidationError) {
      setPasswordMessage(passwordValidationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage(t("passwordMismatch"));
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordMessage(formatAuthErrorMessage(error, t("passwordSaveFailed"), "password-reset", authErrorMessages));
        return;
      }

      await readAuthProfileSummary().catch(() => null);
      setStatus("success");
      setMessage(t("passwordSaved"));
      setPasswordMessage("");
    } catch (error) {
      setPasswordMessage(getErrorMessage(error, t("passwordSaveFailed")));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <main className="relative min-h-full px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl rounded-[32px] border border-white/50 bg-[#fffef4] p-8 shadow-[0_20px_80px_rgba(15,23,42,0.14)]">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-500">{t("section")}</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">{getStatusHeading(status, t)}</h1>
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
                {authT("actions.backHome")}
              </Link>
              <Link
                href={buildAuthPath("login", nextPath, undefined, locale)}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
              >
                {authT("actions.login")}
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
              className="hhwx-accent-button"
            >
              {authT("actions.continue")}
            </button>
          </div>
        )}

        {status === "recovery" && (
          <form onSubmit={handlePasswordReset} className="space-y-5">
            <div className="rounded-2xl bg-sky-50 p-4 text-sm leading-6 text-sky-700">
              {message}
            </div>
            <label className="block text-sm font-medium text-slate-700">
              {authT("fields.newPassword")}
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                {...passwordValidationProps}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                pattern={PASSWORD_INPUT_PATTERN}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder={authT("placeholders.newPassword")}
              />
              <span className="mt-2 block text-xs leading-5 text-slate-500">
                {passwordPolicyMessage}
              </span>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              {authT("fields.confirmNewPassword")}
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                {...confirmPasswordValidationProps}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                pattern={PASSWORD_INPUT_PATTERN}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder={authT("placeholders.confirmNewPassword")}
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
                {authT("actions.backHome")}
              </Link>
              <button
                type="submit"
                disabled={savingPassword}
                className="hhwx-accent-button"
              >
                {savingPassword ? authT("actions.savingPassword") : authT("actions.setNewPassword")}
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
