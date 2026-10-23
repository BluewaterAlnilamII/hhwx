"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Session } from "@supabase/supabase-js";
import { LoadingSpinner } from "@/components/LoadingIndicator";
import { AccountField, AccountFormError, AccountFormHeading, AccountFormResult, EmailCodeField, accountFormStyles } from "@/components/AccountForm";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "@/components/TurnstileChallenge";
import { useTurnstileAvailability } from "@/hooks/useTurnstileAvailability";
import { clearAuthProfileSummaryCache, createEmailFlowClient, readAuthProfileSummary, supabase } from "@/lib/supabase";
import { EMAIL_RESEND_INTERVAL_SECONDS, isAccountRegistrationComplete } from "@/lib/account-registration";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import { formatAuthErrorMessage } from "@/lib/auth-error";
import { getLocalizedAuthErrorMessages } from "@/lib/localized-auth-errors";
import { getLocalizedPasswordValidationMessage, getLocalizedUsernameValidationMessage } from "@/lib/localized-validation";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_INPUT_PATTERN } from "@/lib/password-policy";
import { normalizeUsernameValue } from "@/lib/username-policy";
import { useGameStore } from "@/store/useGameStore";

export default function EmailOtpFlow({ kind, initialEmail = "", title, loginHref = "/auth?mode=login" }: {
  kind: "register" | "recovery"; initialEmail?: string; title?: string; loginHref?: string;
}) {
  const t = useTranslations("auth");
  const errorT = useTranslations("errors");
  const [client] = useState(createEmailFlowClient);
  const [step, setStep] = useState<"email" | "code" | "details" | "done">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAction, setPendingAction] = useState<"send" | "verify" | "finish" | null>(null);
  const busy = pendingAction !== null;
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [resendAfter, setResendAfter] = useState(0);
  const [now, setNow] = useState(0);
  const [registered, setRegistered] = useState(false);
  const alive = useRef(true);
  const captchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const { isTurnstileEnabled, isTurnstileLoading } = useTurnstileAvailability();
  const remaining = Math.max(0, Math.ceil((resendAfter - now) / 1000));
  const needsRegistration = Boolean(session && !isAccountRegistrationComplete(session.user));
  const fieldId = `auth-${kind}`;
  const passwordLabel = t(kind === "register" || needsRegistration ? "fields.password" : "fields.newPassword");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (step !== "code") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  function showError(value: unknown) {
    const messages = getLocalizedAuthErrorMessages(t);
    const message = formatAuthErrorMessage(value, t("otp.failed"), undefined, messages);
    const field = message === messages.invalidCode ? "code"
      : message === messages.invalidEmail ? "email"
      : message === messages.weakPassword || message === messages.samePassword ? "password" : null;
    if (field) setFieldError({ field, message });
    else setError(message);
  }

  function clearFieldError(field: string) {
    if (fieldError?.field === field) setFieldError(null);
  }

  async function sendCode() {
    if (busy || isTurnstileLoading || remaining > 0) return;
    if (kind === "register" && step === "email") {
      const passwordError = getLocalizedPasswordValidationMessage(password, t);
      if (passwordError) {
        setFieldError({ field: "password", message: passwordError }); return;
      }
    }
    setPendingAction("send"); setError(""); setFieldError(null);
    try {
      const captchaToken = (step === "code" ? await captchaRef.current?.waitForToken() : captchaRef.current?.getToken()) || undefined;
      if (!alive.current) return;
      if (isTurnstileEnabled && !captchaToken) { setError(t("messages.captchaRequired")); return; }
      const address = email.trim().toLowerCase();
      const result = kind === "register"
        ? await client.auth.signInWithOtp({ email: address, options: {
          shouldCreateUser: true, captchaToken,
          emailRedirectTo: new URL("/auth?mode=register", process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).href,
        } })
        : await client.auth.resetPasswordForEmail(address, { captchaToken });
      if (!alive.current) return;
      if (result.error) throw result.error;
      setEmail(address); setStep("code"); setCode("");
      setNow(Date.now()); setResendAfter(Date.now() + EMAIL_RESEND_INTERVAL_SECONDS * 1000);
    } catch (value) { if (alive.current) showError(value); }
    finally { if (alive.current) { setPendingAction(null); captchaRef.current?.reset(); } }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setPendingAction("verify"); setError(""); setFieldError(null);
    try {
      const { data, error: verifyError } = await client.auth.verifyOtp({
        email, token: code.trim(), type: kind === "register" ? "email" : "recovery",
      });
      if (!alive.current) return;
      if (verifyError) throw verifyError;
      if (!data.session) { setError(t("otp.failed")); return; }
      if (kind === "register" && isAccountRegistrationComplete(data.session.user)) {
        setPassword(""); setStep("done"); return;
      }
      setSession(data.session);
      if (!isAccountRegistrationComplete(data.session.user)) {
        const response = await fetch("/api/account/profile", { headers: { Authorization: `Bearer ${data.session.access_token}` } }).catch(() => null);
        const profile = response?.ok ? parseApiSuccessData<{ username: string }>(await response.json()) : null;
        if (!alive.current) return;
        setUsername(profile?.username === `user_${data.session.user.id.slice(0, 8)}` ? "" : profile?.username || "");
      }
      setCode(""); setStep("details");
    } catch (value) { if (alive.current) showError(value); }
    finally { if (alive.current) setPendingAction(null); }
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !session) return;
    const passwordError = getLocalizedPasswordValidationMessage(password, t);
    const nameError = needsRegistration ? getLocalizedUsernameValidationMessage(username, t) : null;
    if (passwordError || nameError || (needsRegistration && !username.trim())) {
      setFieldError({ field: passwordError ? "password" : "username", message: passwordError || nameError || t("validation.usernameRequired") }); return;
    }
    setPendingAction("finish"); setError(""); setFieldError(null);
    try {
      if (needsRegistration) {
        const response = await fetch("/api/auth/signup", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ username: normalizeUsernameValue(username), password }),
        });
        const payload = await response.json();
        if (!alive.current) return;
        if (!response.ok) { setError(getLocalizedApiErrorMessage(payload, errorT) || t("otp.failed")); return; }
        setRegistered(true);
      } else {
        const { error: updateError } = await client.auth.updateUser({ password });
        if (updateError) throw updateError;
        const { data } = await client.auth.getSession();
        if (!alive.current) return;
        if (data.session) {
          clearAuthProfileSummaryCache();
          const { error: establishError } = await supabase.auth.setSession(data.session);
          if (establishError) throw establishError;
          const summary = await readAuthProfileSummary(data.session);
          if (summary && alive.current) useGameStore.getState().setAuth({
            userId: summary.userId, username: summary.username, userEmail: summary.email, emailVerified: summary.emailVerified,
          });
        }
        if (!alive.current) return;
      }
      setPassword(""); setSession(null); setStep("done");
    } catch (value) { if (alive.current) showError(value); }
    finally { if (alive.current) setPendingAction(null); }
  }

  const flowTitle = title || t(kind === "register" ? "mode.register.title" : "mode.forgotPassword.title");
  const heading = step === "email" ? flowTitle : step === "code" ? t("otp.verifyTitle")
    : t(needsRegistration ? kind === "register" ? "otp.usernameTitle" : "otp.setupTitle" : "actions.setNewPassword");
  const captcha = isTurnstileEnabled && <TurnstileChallenge ref={captchaRef} action={`auth-${kind}`} appearance={step === "code" ? "interaction-only" : "always"} title="" description="" notConfiguredTitle={t("turnstile.notConfiguredTitle")} notConfiguredDescription={t("turnstile.notConfiguredDescription")} expiredMessage={t("turnstile.expired")} loadFailedMessage={t("turnstile.loadFailed")} variant="inline" />;
  const passwordField = <AccountField id={`${fieldId}-password`} name="password" label={passwordLabel}
    type="password" autoComplete="new-password" value={password}
    onChange={(event) => { setPassword(event.target.value); clearFieldError("password"); }}
    hint={t("otp.passwordHint", { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })}
    error={fieldError?.field === "password" ? fieldError.message : ""}
    validate={(value) => getLocalizedPasswordValidationMessage(value, t)}
    minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} pattern={PASSWORD_INPUT_PATTERN}
    required readOnly={kind === "register" && step !== "email"} disabled={busy} />;

  if (step === "done") return <AccountFormResult
    title={t(registered ? "otp.registeredTitle" : kind === "register" ? "otp.existingTitle" : "otp.passwordSavedTitle")}
    success={registered || kind !== "register"}
    detail={!registered && kind === "register" ? email : undefined}
    actionHref={registered || kind === "register" ? loginHref : "/account"}
    actionLabel={t(registered || kind === "register" ? "actions.login" : "messages.accountCenter")}
  />;

  return <div className="space-y-6">
    <AccountFormHeading title={heading} />
    <form id={`${fieldId}-form`} name={`${kind}-form`} method="post" onSubmit={(event) => {
      event.preventDefault();
      if (step === "email") void sendCode();
      else if (step === "code") void verifyCode(event);
      else void finish(event);
    }} className="space-y-5" aria-busy={busy}>
      {/* Keep the original account fields mounted across steps for password managers. */}
      <div hidden={step !== "email"} className="space-y-5">
        {initialEmail && <p className="break-all text-sm font-medium">{email}</p>}
        <div hidden={Boolean(initialEmail)}>
          <AccountField id={`${fieldId}-email`} name="email" label={t("fields.email")} type="email" autoComplete="username"
            autoCapitalize="none" spellCheck={false} value={email}
            onChange={(event) => { setEmail(event.target.value); clearFieldError("email"); }}
            error={fieldError?.field === "email" ? fieldError.message : ""}
            required maxLength={254} readOnly={Boolean(initialEmail) || step !== "email"} disabled={busy} />
        </div>
        {kind === "register" && passwordField}
      </div>
      {step === "code" && <>
        <p role="status" className={accountFormStyles.hint}>{t("otp.sent")}<strong className="block break-all font-medium text-[var(--theme-color-text-default)]">{email}</strong></p>
        <div>
          <EmailCodeField label={t("otp.code")} value={code} onChange={(value) => { setCode(value); clearFieldError("code"); }} disabled={busy} error={fieldError?.field === "code" ? fieldError.message : ""} />
          <button className={accountFormStyles.secondary} type="button" disabled={busy || remaining > 0 || isTurnstileLoading} onClick={() => void sendCode()}>{pendingAction === "send" && <LoadingSpinner className="text-current" />}{remaining > 0 ? t("otp.resendWait", { seconds: remaining }) : t("otp.resend")}</button>
        </div>
      </>}
      {step === "details" && <>
        <p className={`${accountFormStyles.hint} break-all`}>{email}</p>
        {needsRegistration && <AccountField id={`${fieldId}-username`} name="display-name" label={t("fields.username")}
          value={username} onChange={(event) => { setUsername(event.target.value); clearFieldError("username"); }}
          error={fieldError?.field === "username" ? fieldError.message : ""} autoComplete="nickname" required disabled={busy} />}
        {kind === "recovery" && passwordField}
      </>}
      {step !== "details" && captcha}
      <AccountFormError message={error} />
      <button className={accountFormStyles.primary} type="submit" disabled={busy || (step === "email" && isTurnstileLoading)}>
        {busy && <LoadingSpinner className="text-current" />}{t(step === "email" ? "otp.send" : step === "code" ? "otp.verify" : needsRegistration ? "otp.complete" : "actions.savePassword")}
      </button>
    </form>
  </div>;
}
