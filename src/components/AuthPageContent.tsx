"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { AccountField, AccountFormError, AccountFormHeading, AccountFormPage, accountFormStyles } from "@/components/AccountForm";
import { LoadingSpinner } from "@/components/LoadingIndicator";
import EmailOtpFlow from "@/components/EmailOtpFlow";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "@/components/TurnstileChallenge";
import { useTurnstileAvailability } from "@/hooks/useTurnstileAvailability";
import { buildAuthPath, clearAuthProfileSummaryCache, normalizeAuthMode, normalizeInternalPath, readAuthProfileSummary, supabase, type AuthViewMode } from "@/lib/supabase";
import { formatAuthErrorMessage } from "@/lib/auth-error";
import { getLocalizedAuthErrorMessages } from "@/lib/localized-auth-errors";
import { useGameStore } from "@/store/useGameStore";

export default function AuthPageContent() {
  const params = useSearchParams();
  const mode = normalizeAuthMode(params.get("mode"));
  const nextPath = normalizeInternalPath(params.get("next"), "/account");
  return <AuthModeContent key={mode} mode={mode} nextPath={nextPath} />;
}

function AuthModeContent({ mode, nextPath }: { mode: AuthViewMode; nextPath: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [credentialError, setCredentialError] = useState("");
  const [busy, setBusy] = useState(false);
  const captchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const { isTurnstileEnabled, isTurnstileLoading } = useTurnstileAvailability();

  async function login(event: React.FormEvent) {
    event.preventDefault();
    const captchaToken = captchaRef.current?.getToken() || undefined;
    if (busy || isTurnstileLoading) return;
    if (isTurnstileEnabled && !captchaToken) { setError(t("messages.captchaRequired")); return; }
    setBusy(true); setError(""); setCredentialError("");
    clearAuthProfileSummaryCache();
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(), password, options: { captchaToken },
      });
      if (signInError) throw signInError;
      const summary = await readAuthProfileSummary(data.session);
      if (!summary) { setError(t("messages.loginMissingSummary")); return; }
      useGameStore.getState().setAuth({ userId: summary.userId, username: summary.username, userEmail: summary.email, emailVerified: summary.emailVerified });
      router.replace(summary.emailVerified ? nextPath : "/account/email");
    } catch (value) {
      const message = formatAuthErrorMessage(value, t("otp.failed"), "login", getLocalizedAuthErrorMessages(t));
      if (message === t("errors.invalidCredentials")) setCredentialError(message);
      else setError(message);
    } finally { setBusy(false); captchaRef.current?.reset(); }
  }

  const loginHref = buildAuthPath("login", nextPath);
  return <AccountFormPage backHref={mode === "login" ? "/" : loginHref} backLabel={t(mode === "login" ? "actions.backHome" : "actions.backLogin")}>
    {mode !== "login" ? <EmailOtpFlow key={mode} kind={mode === "register" ? "register" : "recovery"} loginHref={loginHref} /> : <>
      <AccountFormHeading title={t("mode.login.title")} />
      <form id="login-form" name="login-form" method="post" onSubmit={login} className="space-y-5" aria-busy={busy}>
        <AccountField id="login-email" name="email" label={t("fields.email")} type="email" autoComplete="username"
          autoCapitalize="none" spellCheck={false} value={email}
          onChange={(event) => { setEmail(event.target.value); setCredentialError(""); }} required maxLength={254} disabled={busy} />
        <div>
          <AccountField id="login-password" name="password" label={t("fields.password")} type="password" autoComplete="current-password"
            value={password} onChange={(event) => { setPassword(event.target.value); setCredentialError(""); }}
            error={credentialError} required disabled={busy} />
          <div className="mt-1 flex justify-end">
            <Link href={buildAuthPath("forgot-password", nextPath)} className={accountFormStyles.secondary}>{t("actions.forgotPassword")}</Link>
          </div>
        </div>
        {isTurnstileEnabled && <TurnstileChallenge ref={captchaRef} action="auth-login" title="" variant="inline" notConfiguredTitle={t("turnstile.notConfiguredTitle")} notConfiguredDescription={t("turnstile.notConfiguredDescription")} expiredMessage={t("turnstile.expired")} loadFailedMessage={t("turnstile.loadFailed")} />}
        <AccountFormError message={error} />
        <button className={accountFormStyles.primary} disabled={busy || isTurnstileLoading} type="submit">{busy && <LoadingSpinner className="text-current" />}{t("actions.login")}</button>
      </form>
      <p className="border-t border-[var(--theme-color-border-subtle)] pt-4 text-center text-sm text-[var(--theme-color-text-muted)]">
        {t("messages.noAccount")} <Link className={accountFormStyles.secondary} href={buildAuthPath("register", nextPath)}>{t("actions.register")}</Link>
      </p>
    </>}
  </AccountFormPage>;
}
