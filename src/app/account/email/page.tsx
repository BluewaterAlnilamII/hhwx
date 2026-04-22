"use client";

import { useEffect, useRef, useState } from "react";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "@/components/TurnstileChallenge";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { getApiErrorMessage } from "@/lib/api-contracts";
import { formatAuthErrorMessage } from "@/lib/auth-error";
import { createNativeValidationProps } from "@/lib/native-validation";
import { buildAuthCallbackUrl, getSafeSession } from "@/lib/supabase";
import { useTurnstileAvailability } from "@/lib/turnstile";
import { useAccountProfile } from "../useAccountProfile";

export default function AccountEmailPage() {
  const {
    userId,
    userEmail,
    authReady,
    profile,
    loadingProfile,
    profileError,
    loadProfile,
    syncStoreSummary,
  } = useAccountProfile();
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const emailCaptchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const resendCaptchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const emailValidationProps = createNativeValidationProps({ label: "邮箱", invalidTypeMessage: "请输入有效的邮箱地址。" });
  const { isTurnstileEnabled, isTurnstileLoading } = useTurnstileAvailability();

  useEffect(() => {
    setNewEmail(profile?.email ?? "");
  }, [profile?.email]);

  const requireCaptchaToken = (
    captchaRef: React.MutableRefObject<TurnstileChallengeHandle | null>,
    setMessage: (message: string) => void,
  ) => {
    if (isTurnstileLoading) {
      setMessage("安全验证配置加载中，请稍后再试。");
      return undefined;
    }

    if (!isTurnstileEnabled) {
      return undefined;
    }

    const token = captchaRef.current?.getToken() ?? undefined;
    if (!token) {
      setMessage("请先完成安全验证。");
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
      setEmailMessage("新邮箱需要与当前邮箱不同。");
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
        setEmailMessage("登录状态已失效，请重新登录后再试。");
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
          redirectTo: buildAuthCallbackUrl("/account/email"),
          refreshToken: session.refresh_token,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setEmailMessage(getApiErrorMessage(payload) || `提交更换邮箱失败（HTTP ${response.status}）`);
        return;
      }

      await syncStoreSummary();
      await loadProfile();
      setEmailMessage("确认邮件已发送到新邮箱。请按邮件提示完成更换。");
    } catch (error) {
      setEmailMessage(formatAuthErrorMessage(error, "提交更换邮箱失败", "email-update"));
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
        setVerificationMessage("登录状态已失效，请重新登录后再试。");
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
          redirectTo: buildAuthCallbackUrl("/account/email"),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setVerificationMessage(getApiErrorMessage(payload) || `发送验证邮件失败（HTTP ${response.status}）`);
        return;
      }

      setVerificationMessage("验证邮件已发送。请检查收件箱和垃圾邮件箱。");
    } catch (error) {
      setVerificationMessage(formatAuthErrorMessage(error, "发送验证邮件失败", "email-verify"));
    } finally {
      setResendingVerification(false);
      resetCaptcha();
    }
  };

  return (
    <AccountShell
      title="更换邮箱"
      description="新邮箱确认后才会生效。"
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message="正在读取账号信息..." />
      ) : !userId ? (
        <AccountSignInState nextPath="/account/email" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile ? (
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">当前邮箱状态</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${profile.emailVerified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {profile.emailVerified ? "已验证" : "未验证"}
              </span>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              当前邮箱：{profile.email || userEmail || "-"}
            </div>
          </section>

          {!profile.emailVerified && (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-amber-900">重新发送验证邮件</h2>
              <p className="mt-2 text-sm leading-6 text-amber-700">
                当前邮箱还未验证时，可以先重发验证邮件。
              </p>
              {isTurnstileEnabled && (
                <div className="mt-5">
                  <TurnstileChallenge
                    ref={resendCaptchaRef}
                    action="account-email-resend"
                    title=""
                    description=""
                    variant="inline"
                  />
                </div>
              )}
              {verificationMessage && (
                <div className={`mt-4 text-sm ${verificationMessage.includes("已") ? "text-emerald-600" : "text-red-500"}`}>
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
                  {resendingVerification ? "发送中..." : "重新发送验证邮件"}
                </button>
              </div>
            </section>
          )}

          <form onSubmit={handleEmailUpdate} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">提交新邮箱</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              确认完成后，新邮箱会成为新的登录邮箱。
            </p>

            <label className="mt-5 block text-sm font-medium text-slate-700">
              新邮箱
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                {...emailValidationProps}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="输入新的邮箱地址"
              />
            </label>

            {isTurnstileEnabled && (
              <div className="mt-5">
                <TurnstileChallenge
                  ref={emailCaptchaRef}
                  action="account-email-update"
                  title=""
                  description=""
                  variant="inline"
                />
              </div>
            )}

            {emailMessage && (
              <div className={`mt-4 text-sm ${emailMessage.includes("已") ? "text-emerald-600" : "text-red-500"}`}>
                {emailMessage}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={emailSaving || isTurnstileLoading || !newEmail.trim()}
                className="hhwx-accent-button"
              >
                {emailSaving ? "提交中..." : "发送确认邮件"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AccountShell>
  );
}