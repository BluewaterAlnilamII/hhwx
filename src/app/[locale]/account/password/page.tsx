"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "@/components/TurnstileChallenge";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { formatAuthErrorMessage } from "@/lib/auth-error";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import { getLocalizedAuthErrorMessages } from "@/lib/localized-auth-errors";
import { buildAuthCallbackUrl, getSafeSession } from "@/lib/supabase";
import { useTurnstileAvailability } from "@/hooks/useTurnstileAvailability";
import { useLocalizedAccountProfile } from "../useAccountProfile";

export default function AccountPasswordPage() {
  const locale = useLocale();
  const t = useTranslations("account.password");
  const authT = useTranslations("auth");
  const commonT = useTranslations("common");
  const errorT = useTranslations("errors");
  const authErrorMessages = getLocalizedAuthErrorMessages(authT);
  const { userId, userEmail, authReady, profile, loadingProfile, profileError } = useLocalizedAccountProfile();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const captchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const { isTurnstileEnabled, isTurnstileLoading } = useTurnstileAvailability();

  const requireCaptchaToken = () => {
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
    captchaRef.current?.reset();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setMessage("");

    const captchaToken = requireCaptchaToken();
    if (isTurnstileEnabled && !captchaToken) {
      setSending(false);
      return;
    }

    try {
      const session = await getSafeSession();
      if (!session?.access_token) {
        setMessage(t("sessionExpired"));
        return;
      }

      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          captchaToken,
          redirectTo: buildAuthCallbackUrl("/account/password", locale),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(getLocalizedApiErrorMessage(payload, errorT) || t("httpSendFailed", { status: response.status }));
        return;
      }

      setMessage(t("emailSent"));
    } catch (error) {
      setMessage(formatAuthErrorMessage(error, t("sendFailed"), "forgot-password", authErrorMessages));
    } finally {
      setSending(false);
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
        <AccountSignInState nextPath="/account/password" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile ? (
        <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{t("sectionTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("sectionDescription")}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            {t("currentEmail", { email: profile.email || userEmail || "-" })}
          </div>

          {isTurnstileEnabled && (
            <TurnstileChallenge
              ref={captchaRef}
              action="account-password-reset"
              title=""
              description=""
              notConfiguredTitle={authT("turnstile.notConfiguredTitle")}
              notConfiguredDescription={authT("turnstile.notConfiguredDescription")}
              expiredMessage={authT("turnstile.expired")}
              loadFailedMessage={authT("turnstile.loadFailed")}
              variant="inline"
            />
          )}

          {message && (
            <div className={`text-sm ${message === t("emailSent") ? "text-emerald-600" : "text-red-500"}`}>
              {message}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sending || isTurnstileLoading}
              className="hhwx-accent-button"
            >
              {sending ? commonT("actions.sending") : t("action")}
            </button>
          </div>
        </form>
      ) : null}
    </AccountShell>
  );
}
