"use client";

import { useEffect, useRef, useState } from "react";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "@/components/TurnstileChallenge";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { buildAuthCallbackUrl, supabase } from "@/lib/supabase";
import { isTurnstileEnabled } from "@/lib/turnstile";
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
  const captchaRef = useRef<TurnstileChallengeHandle | null>(null);

  useEffect(() => {
    setNewEmail(profile?.email ?? "");
  }, [profile?.email]);

  const requireCaptchaToken = (setMessage: (message: string) => void) => {
    if (!isTurnstileEnabled()) {
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
    captchaRef.current?.reset();
  };

  const handleEmailUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailSaving(true);
    setEmailMessage("");

    const captchaToken = requireCaptchaToken(setEmailMessage);
    if (isTurnstileEnabled() && !captchaToken) {
      setEmailSaving(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() }, {
        emailRedirectTo: buildAuthCallbackUrl("/account/email"),
      });
      if (error) {
        setEmailMessage(error.message);
        return;
      }

      await syncStoreSummary();
      await loadProfile();
      setEmailMessage("确认邮件已发送到新邮箱。请按邮件提示完成更换。");
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : "提交更换邮箱失败");
    } finally {
      setEmailSaving(false);
      resetCaptcha();
    }
  };

  const handleResendVerificationEmail = async () => {
    setVerificationMessage("");
    setResendingVerification(true);

    const captchaToken = requireCaptchaToken(setVerificationMessage);
    if (isTurnstileEnabled() && !captchaToken) {
      setResendingVerification(false);
      return;
    }

    try {
      const currentEmail = (profile?.email ?? userEmail ?? "").trim();
      if (!currentEmail) {
        setVerificationMessage("当前账号缺少邮箱信息，无法发送验证邮件。");
        return;
      }

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: currentEmail,
        options: {
          captchaToken,
          emailRedirectTo: buildAuthCallbackUrl("/account/email"),
        },
      });

      if (error) {
        setVerificationMessage(error.message);
        return;
      }

      setVerificationMessage("验证邮件已发送。请检查收件箱和垃圾邮件箱。");
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : "发送验证邮件失败");
    } finally {
      setResendingVerification(false);
      resetCaptcha();
    }
  };

  return (
    <AccountShell
      title="更换邮箱"
      description="新邮箱确认后才会生效。若当前邮箱尚未验证，也可以在这里重新发送验证邮件。"
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

          {isTurnstileEnabled() && (
            <TurnstileChallenge
              ref={captchaRef}
              action="account-email"
              title=""
              description=""
              variant="inline"
            />
          )}

          {!profile.emailVerified && (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-amber-900">重新发送验证邮件</h2>
              <p className="mt-2 text-sm leading-6 text-amber-700">
                若当前邮箱还没有完成验证，可以先重新发送一封验证邮件。
              </p>
              {verificationMessage && (
                <div className={`mt-4 text-sm ${verificationMessage.includes("已") ? "text-emerald-600" : "text-red-500"}`}>
                  {verificationMessage}
                </div>
              )}
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={handleResendVerificationEmail}
                  disabled={resendingVerification}
                  className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resendingVerification ? "发送中..." : "重新发送验证邮件"}
                </button>
              </div>
            </section>
          )}

          <form onSubmit={handleEmailUpdate} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">提交新邮箱</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              新邮箱确认完成后，才会成为新的登录邮箱。
            </p>

            <label className="mt-5 block text-sm font-medium text-slate-700">
              新邮箱
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="输入新的邮箱地址"
              />
            </label>

            {emailMessage && (
              <div className={`mt-4 text-sm ${emailMessage.includes("已") ? "text-emerald-600" : "text-red-500"}`}>
                {emailMessage}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={emailSaving || !newEmail.trim()}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
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