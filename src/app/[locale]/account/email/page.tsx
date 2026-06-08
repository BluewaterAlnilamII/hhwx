"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "@/components/TurnstileChallenge";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { formatAuthErrorMessage } from "@/lib/auth-error";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import { getLocalizedAuthErrorMessages } from "@/lib/localized-auth-errors";
import { createNativeValidationProps } from "@/lib/native-validation";
import { buildEmailVerificationCallbackUrl, getSafeSession } from "@/lib/supabase";
import { useTurnstileAvailability } from "@/hooks/useTurnstileAvailability";
import { useLocalizedAccountProfile } from "../useAccountProfile";

export default function AccountEmailPage() {
  const locale = useLocale();
  const t = useTranslations("account.email");
  const authT = useTranslations("auth");
  const commonT = useTranslations("common");
  const errorT = useTranslations("errors");
  const authErrorMessages = getLocalizedAuthErrorMessages(authT);
  const {
    userId,
    userEmail,
    authReady,
    profile,
    loadingProfile,
    profileError,
    loadProfile,
    syncStoreSummary,
  } = useLocalizedAccountProfile();
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const emailCaptchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const resendCaptchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const emailValidationProps = createNativeValidationProps({ label: authT("fields.email"), invalidTypeMessage: authT("validation.invalidEmail") });
  const { isTurnstileEnabled, isTurnstileLoading } = useTurnstileAvailability();

  useEffect(() => {
    setNewEmail(profile?.email ?? "");
  }, [profile?.email]);

  const requireCaptchaToken = (
    captchaRef: React.MutableRefObject<TurnstileChallengeHandle | null>,
    setMessage: (message: string) => void,
  ) => {
    if (isTurnstileLoading) {
      setMessage(authT("messages.captchaLoading"));
      return undefined;
    }

    if (!isTurnstileEnabled) {
      return undefined;
    }

    const token = captchaRef.current?.getToken() ?? undefined;
    if (!token) {
      setMessage(authT("messages.captchaRequired"));
      return undefined;
    }

    return token;
  };

  const resetCaptcha = () => {
    emailCaptchaRef.current?.reset();
    resendCaptchaRef.current?.reset();
  };

  const handleEmailUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailSaving(true);
    setEmailMessage("");

    const normalizedNewEmail = newEmail.trim().toLowerCase();
    const currentEmail = (profile?.email ?? userEmail ?? "").trim().toLowerCase();
    if (normalizedNewEmail && currentEmail && normalizedNewEmail === currentEmail) {
      setEmailSaving(false);
      setEmailMessage(t("sameEmail"));
      return;
    }

    const captchaToken = requireCaptchaToken(emailCaptchaRef, setEmailMessage);
    if (isTurnstileEnabled && !captchaToken) {
      setEmailSaving(false);
      return;
    }

    try {
      const session = await getSafeSession();
      if (!session?.access_token || !session.refresh_token) {
        setEmailMessage(t("sessionExpired"));
        return;
      }

      const response = await fetch("/api/auth/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "update",
          newEmail: newEmail.trim(),
          captchaToken,
          redirectTo: buildEmailVerificationCallbackUrl("/account/email", locale),
          refreshToken: session.refresh_token,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setEmailMessage(getLocalizedApiErrorMessage(payload, errorT) || t("httpUpdateFailed", { status: response.status }));
        return;
      }

      await syncStoreSummary();
      await loadProfile();
      setEmailMessage(t("updateSent"));
    } catch (error) {
      setEmailMessage(formatAuthErrorMessage(error, t("updateFailed"), "email-update", authErrorMessages));
    } finally {
      setEmailSaving(false);
      resetCaptcha();
    }
  };

  const handleResendVerificationEmail = async () => {
    setVerificationMessage("");
    setResendingVerification(true);

    const captchaToken = requireCaptchaToken(resendCaptchaRef, setVerificationMessage);
    if (isTurnstileEnabled && !captchaToken) {
      setResendingVerification(false);
      return;
    }

    try {
      const session = await getSafeSession();
      if (!session?.access_token) {
        setVerificationMessage(t("sessionExpired"));
        return;
      }

      const response = await fetch("/api/auth/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "resend-verification",
          captchaToken,
          redirectTo: buildEmailVerificationCallbackUrl("/account/email", locale),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setVerificationMessage(getLocalizedApiErrorMessage(payload, errorT) || t("httpVerificationFailed", { status: response.status }));
        return;
      }

      setVerificationMessage(t("verificationSent"));
    } catch (error) {
      setVerificationMessage(formatAuthErrorMessage(error, t("verificationFailed"), "email-verify", authErrorMessages));
    } finally {
      setResendingVerification(false);
      resetCaptcha();
    }
  };

  return (
    <AccountShell
      title={t("title")}
      description={t("description")}
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message={commonT("states.loadingAccount")} />
      ) : !userId ? (
        <AccountSignInState nextPath="/account/email" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile ? (
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">{t("currentStatus")}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${profile.emailVerified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {profile.emailVerified ? t("verified") : t("unverified")}
              </span>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              {t("currentEmail", { email: profile.email || userEmail || "-" })}
            </div>
          </section>

          {!profile.emailVerified && (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-amber-900">{t("resendTitle")}</h2>
              <p className="mt-2 text-sm leading-6 text-amber-700">
                {t("resendDescription")}
              </p>
              {isTurnstileEnabled && (
                <div className="mt-5">
                  <TurnstileChallenge
                    ref={resendCaptchaRef}
                    action="account-email-resend"
                    title=""
                    description=""
                    notConfiguredTitle={authT("turnstile.notConfiguredTitle")}
                    notConfiguredDescription={authT("turnstile.notConfiguredDescription")}
                    expiredMessage={authT("turnstile.expired")}
                    loadFailedMessage={authT("turnstile.loadFailed")}
                    variant="inline"
                  />
                </div>
              )}
              {verificationMessage && (
                <div className={`mt-4 text-sm ${verificationMessage === t("verificationSent") ? "text-emerald-600" : "text-red-500"}`}>
                  {verificationMessage}
                </div>
              )}
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={handleResendVerificationEmail}
                  disabled={resendingVerification || isTurnstileLoading}
                  className="hhwx-accent-button"
                >
                  {resendingVerification ? commonT("actions.sending") : t("resendAction")}
                </button>
              </div>
            </section>
          )}

          <form onSubmit={handleEmailUpdate} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">{t("submitTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("submitDescription")}
            </p>

            <label className="mt-5 block text-sm font-medium text-slate-700">
              {t("newEmail")}
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                {...emailValidationProps}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder={t("newEmailPlaceholder")}
              />
            </label>

            {isTurnstileEnabled && (
              <div className="mt-5">
                <TurnstileChallenge
                  ref={emailCaptchaRef}
                  action="account-email-update"
                  title=""
                  description=""
                  notConfiguredTitle={authT("turnstile.notConfiguredTitle")}
                  notConfiguredDescription={authT("turnstile.notConfiguredDescription")}
                  expiredMessage={authT("turnstile.expired")}
                  loadFailedMessage={authT("turnstile.loadFailed")}
                  variant="inline"
                />
              </div>
            )}

            {emailMessage && (
              <div className={`mt-4 text-sm ${emailMessage === t("updateSent") ? "text-emerald-600" : "text-red-500"}`}>
                {emailMessage}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={emailSaving || isTurnstileLoading || !newEmail.trim()}
                className="hhwx-accent-button"
              >
                {emailSaving ? t("submitting") : t("submitAction")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AccountShell>
  );
}
