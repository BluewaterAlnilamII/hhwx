"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LoadingSpinner } from "@/components/LoadingIndicator";
import EmailOtpFlow from "@/components/EmailOtpFlow";
import { AccountField, AccountFormError, AccountFormHeading, AccountFormPage, AccountFormResult, EmailCodeField, accountFormStyles } from "@/components/AccountForm";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "@/components/TurnstileChallenge";
import { useTurnstileAvailability } from "@/hooks/useTurnstileAvailability";
import { createEmailFlowClient, getSafeSession, supabase } from "@/lib/supabase";
import { EMAIL_RESEND_INTERVAL_SECONDS } from "@/lib/account-registration";
import { emailChangeProofExpiresAt } from "@/lib/account-email-change";
import { formatAuthErrorMessage } from "@/lib/auth-error";
import { getLocalizedAuthErrorMessages } from "@/lib/localized-auth-errors";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import { getApiErrorCode, parseApiSuccessData } from "@/lib/api-contracts";
import { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { useGameStore } from "@/store/useGameStore";
import { useLocalizedAccountProfile } from "../useAccountProfile";

type PendingChange = { currentEmail: string; newEmail: string };
type Proof = { token: string; expiresAt: number };

export default function AccountEmailPage() {
  const userId = useGameStore((state) => state.userId);
  return <AccountEmailContent key={userId || "signed-out"} />;
}

function AccountEmailContent() {
  const t = useTranslations("account.email");
  const authT = useTranslations("auth");
  const commonT = useTranslations("common");
  const errorT = useTranslations("errors");
  const shellT = useTranslations("account.shell");
  const { userId, authReady, profile, loadingProfile, profileError, loadProfile, syncStoreSummary } = useLocalizedAccountProfile();
  const [client] = useState(createEmailFlowClient);
  const [step, setStep] = useState<"current" | "newEmail" | "newCode" | "done">("current");
  const [currentCodeSent, setCurrentCodeSent] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [code, setCode] = useState("");
  const [pendingAction, setPendingAction] = useState<"send" | "verify" | null>(null);
  const busy = pendingAction !== null;
  const [error, setError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [currentResendAfter, setCurrentResendAfter] = useState(0);
  const [newResendAfter, setNewResendAfter] = useState(0);
  const [now, setNow] = useState(0);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const captchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const { isTurnstileEnabled, isTurnstileLoading } = useTurnstileAvailability();
  const currentRemaining = Math.max(0, Math.ceil((currentResendAfter - now) / 1000));
  const newRemaining = Math.max(0, Math.ceil((newResendAfter - now) / 1000));
  const proofExpired = !proof || proof.expiresAt <= now;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function run(operation: "send" | "verify", action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingAction(operation); setError(""); setCodeError(""); setEmailError("");
    try { await action(); }
    catch (value) {
      if (alive.current) {
        const message = formatAuthErrorMessage(value, t("updateFailed"), undefined, getLocalizedAuthErrorMessages(authT));
        if (message === authT("otp.invalidCode")) setCodeError(message);
        else if (step === "newEmail" && ["invalidEmail", "emailTaken", "emailUnchanged"].some((key) => message === authT(`errors.${key}`))) setEmailError(message);
        else setError(message);
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setPendingAction(null);
    }
  }

  async function sendCurrentCode() {
    if (currentRemaining > 0 || isTurnstileLoading || !profile?.email) return;
    await run("send", async () => {
      try {
        const captchaToken = (currentCodeSent ? await captchaRef.current?.waitForToken() : captchaRef.current?.getToken()) || undefined;
        if (!alive.current) return;
        if (isTurnstileEnabled && !captchaToken) { setError(authT("messages.captchaRequired")); return; }
        const result = await client.auth.signInWithOtp({ email: profile.email!, options: { shouldCreateUser: false, captchaToken } });
        if (!alive.current) return;
        if (result.error) throw result.error;
        setCurrentCodeSent(true); setCode("");
        setNow(Date.now()); setCurrentResendAfter(Date.now() + EMAIL_RESEND_INTERVAL_SECONDS * 1000);
      } finally { if (alive.current) captchaRef.current?.reset(); }
    });
  }

  async function verifyCurrent(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.email) return;
    await run("verify", async () => {
      const result = await client.auth.verifyOtp({ email: profile.email!, token: code, type: "email" });
      if (!alive.current) return;
      if (result.error) throw result.error;
      const session = result.data.session;
      if (!session || result.data.user?.id !== userId || result.data.user.email?.toLowerCase() !== profile.email!.toLowerCase()) {
        setError(t("sessionExpired")); return;
      }
      const verified = await client.auth.getClaims(session.access_token);
      if (!alive.current) return;
      const expiresAt = verified.data?.claims ? emailChangeProofExpiresAt(verified.data.claims) : null;
      if (verified.error || !expiresAt || expiresAt <= Date.now()) { setError(t("otp.proofExpired")); return; }
      setProof({ token: session.access_token, expiresAt }); setCode(""); setNow(Date.now());
      setStep(pending ? "newCode" : "newEmail");
    });
  }

  async function sendNewCode(event: React.FormEvent) {
    event.preventDefault();
    if (newRemaining > 0 || isTurnstileLoading) return;
    if (!proof || proof.expiresAt <= Date.now()) { setError(t("otp.proofExpired")); return; }
    await run("send", async () => {
      try {
        const captchaToken = (step === "newCode" ? await captchaRef.current?.waitForToken() : captchaRef.current?.getToken()) || undefined;
        if (!alive.current) return;
        if (isTurnstileEnabled && !captchaToken) { setError(authT("messages.captchaRequired")); return; }
        const session = await getSafeSession();
        if (!alive.current) return;
        if (!session || session.user.id !== userId) { setError(t("sessionExpired")); return; }
        const response = await fetch("/api/auth/email", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: "update", newEmail: step === "newCode" ? pending?.newEmail : newEmail, proofToken: proof.token, captchaToken }),
        });
        const payload = await response.json();
        if (!alive.current) return;
        if (!response.ok) {
          if (getApiErrorCode(payload) === "EMAIL_CHANGE_PROOF_REQUIRED") setProof(null);
          if (response.status === 429) { setNow(Date.now()); setNewResendAfter(Date.now() + EMAIL_RESEND_INTERVAL_SECONDS * 1000); }
          setError(getLocalizedApiErrorMessage(payload, errorT) || t("updateFailed")); return;
        }
        const change = parseApiSuccessData<PendingChange>(payload);
        if (!change?.currentEmail || !change.newEmail) { setError(t("updateFailed")); return; }
        setPending(change); setNewEmail(change.newEmail); setCode(""); setStep("newCode");
        setNow(Date.now()); setNewResendAfter(Date.now() + EMAIL_RESEND_INTERVAL_SECONDS * 1000);
      } finally { if (alive.current) captchaRef.current?.reset(); }
    });
  }

  async function verifyNew(event: React.FormEvent) {
    event.preventDefault();
    if (!pending) return;
    await run("verify", async () => {
      // An already-authorized change remains valid after the 15-minute proof window.
      const result = await client.auth.verifyOtp({ email: pending.newEmail, token: code, type: "email_change" });
      if (!alive.current) return;
      if (result.error) throw result.error;
      if (!result.data.session || result.data.user?.id !== userId || result.data.user.email?.toLowerCase() !== pending.newEmail.toLowerCase()) {
        setError(t("otp.restartRequired")); return;
      }
      const established = await supabase.auth.setSession(result.data.session);
      if (!alive.current) return;
      if (established.error) throw established.error;
      setProof(null); setPending(null); setCode(""); setStep("done");
      await syncStoreSummary(); await loadProfile();
    });
  }

  function reverifyCurrent() {
    setProof(null); setStep("current"); setCurrentCodeSent(false); setCode(""); setError(""); setCodeError(""); setEmailError("");
  }

  const captcha = isTurnstileEnabled && <TurnstileChallenge ref={captchaRef} action="account-email-verify" appearance={step === "newCode" || (step === "current" && currentCodeSent) ? "interaction-only" : "always"} title="" description="" notConfiguredTitle={authT("turnstile.notConfiguredTitle")} notConfiguredDescription={authT("turnstile.notConfiguredDescription")} expiredMessage={authT("turnstile.expired")} loadFailedMessage={authT("turnstile.loadFailed")} variant="inline" />;
  const heading = step === "done" ? t("otp.completeTitle") : step === "current" ? t("otp.currentTitle") : t(step === "newEmail" ? "otp.newEmailTitle" : "otp.newCodeTitle");
  const sendCurrentButton = <button className={currentCodeSent ? accountFormStyles.secondary : accountFormStyles.primary} type="button" onClick={() => void sendCurrentCode()} disabled={busy || isTurnstileLoading || currentRemaining > 0}>
    {pendingAction === "send" && <LoadingSpinner className="text-current" />}{currentRemaining > 0 ? authT("otp.resendWait", { seconds: currentRemaining }) : authT(currentCodeSent ? "otp.resend" : "otp.send")}
  </button>;

  return <AccountFormPage backHref="/account" backLabel={shellT("defaultBackLabel")}>
    {(!authReady || loadingProfile || !userId || profileError || !profile) && <AccountFormHeading title={t("title")} />}
    {!authReady || loadingProfile ? <AccountLoadingState message={commonT("states.loadingAccount")} />
      : !userId ? <AccountSignInState nextPath="/account/email" />
      : profileError ? <AccountErrorState message={profileError} />
      : profile ? <>
        {!profile.emailVerified ? <EmailOtpFlow kind="recovery" initialEmail={profile.email || ""} title={t("otp.finishRegistration")} /> : <>
          {step !== "done" && <AccountFormHeading title={heading} />}
          {step === "current" && <>
            <p role={currentCodeSent ? "status" : undefined} className={accountFormStyles.hint}>{currentCodeSent ? authT("otp.sent") : authT("fields.email")}<strong className="block break-all font-medium text-[var(--theme-color-text-default)]">{profile.email}</strong></p>
            {currentCodeSent ? <>
              <form method="post" onSubmit={verifyCurrent} className="space-y-5" aria-busy={busy}>
                <div>
                  <EmailCodeField label={authT("otp.code")} value={code} onChange={(value) => { setCode(value); setCodeError(""); }} disabled={busy} error={codeError} />
                  {sendCurrentButton}
                  {captcha}
                </div>
                <AccountFormError message={error} />
                <button className={accountFormStyles.primary} type="submit" disabled={busy}>{pendingAction === "verify" && <LoadingSpinner className="text-current" />}{authT("otp.verify")}</button>
              </form>
            </> : <>{captcha}<AccountFormError message={error} />{sendCurrentButton}</>}
          </>}
          {(step === "newEmail" || step === "newCode") && <>
            {step === "newEmail" && <>
              {proofExpired && <AccountFormError message={t("otp.proofExpired")} />}
              {!proofExpired ? <form method="post" onSubmit={sendNewCode} className="space-y-5" aria-busy={busy}>
                <AccountField id="account-new-email" name="email" label={t("newEmail")} type="email" value={newEmail}
                  onChange={(event) => { setNewEmail(event.target.value); setEmailError(""); }} error={emailError}
                  autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={busy} />
                {captcha}
                <AccountFormError message={error} />
                <button className={accountFormStyles.primary} type="submit" disabled={busy || isTurnstileLoading || newRemaining > 0}>
                  {busy && <LoadingSpinner className="text-current" />}{newRemaining > 0 ? authT("otp.resendWait", { seconds: newRemaining }) : authT("otp.send")}
                </button>
              </form> : <button className={accountFormStyles.primary} type="button" disabled={busy} onClick={reverifyCurrent}>{t("otp.reverifyCurrent")}</button>}
            </>}
            {step === "newCode" && pending && <>
              <p role="status" className={accountFormStyles.hint}>{authT("otp.sent")}<strong className="block break-all font-medium text-[var(--theme-color-text-default)]">{pending.newEmail}</strong></p>
              <form method="post" onSubmit={verifyNew} className="space-y-5" aria-busy={busy}>
                <div>
                  <EmailCodeField label={authT("otp.code")} value={code} onChange={(value) => { setCode(value); setCodeError(""); }} disabled={busy} error={codeError} />
                  {proofExpired
                    ? <button className={accountFormStyles.secondary} type="button" disabled={busy} onClick={reverifyCurrent}>{t("otp.reverifyCurrent")}</button>
                    : <button className={accountFormStyles.secondary} type="button" disabled={busy || isTurnstileLoading || newRemaining > 0} onClick={(event) => void sendNewCode(event)}>{pendingAction === "send" && <LoadingSpinner className="text-current" />}{newRemaining > 0 ? authT("otp.resendWait", { seconds: newRemaining }) : authT("otp.resend")}</button>}
                  {proofExpired ? <p className={accountFormStyles.hint}>{t("otp.resendProofExpired")}</p> : captcha}
                </div>
                <AccountFormError message={error} />
                <button className={accountFormStyles.primary} type="submit" disabled={busy}>{pendingAction === "verify" && <LoadingSpinner className="text-current" />}{t("otp.finishChange")}</button>
              </form>
            </>}
          </>}
          {step === "done" && <AccountFormResult title={t("otp.completeTitle")} detail={newEmail} actionHref="/account" actionLabel={shellT("defaultBackLabel")} />}
        </>}
      </> : null}
  </AccountFormPage>;
}
