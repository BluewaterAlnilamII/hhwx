"use client";

import { useRef, useState } from "react";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "@/components/TurnstileChallenge";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { buildAuthCallbackUrl, supabase } from "@/lib/supabase";
import { isTurnstileEnabled } from "@/lib/turnstile";
import { useAccountProfile } from "../useAccountProfile";

export default function AccountPasswordPage() {
  const { userId, userEmail, authReady, profile, loadingProfile, profileError } = useAccountProfile();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const captchaRef = useRef<TurnstileChallengeHandle | null>(null);

  const requireCaptchaToken = () => {
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setMessage("");

    const captchaToken = requireCaptchaToken();
    if (isTurnstileEnabled() && !captchaToken) {
      setSending(false);
      return;
    }

    try {
      const currentEmail = (profile?.email ?? userEmail ?? "").trim();
      if (!currentEmail) {
        setMessage("当前账号缺少可用邮箱，暂时无法发送修改邮件。");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(currentEmail, {
        captchaToken,
        redirectTo: buildAuthCallbackUrl("/account/password"),
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage("修改链接已发送到当前邮箱。请打开邮件继续设置新密码。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发送修改邮件失败");
    } finally {
      setSending(false);
      resetCaptcha();
    }
  };

  return (
    <AccountShell
      title="修改密码"
      description="我们会把修改链接发送到当前邮箱。打开邮件后，再设置新的登录密码。"
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message="正在读取账号信息..." />
      ) : !userId ? (
        <AccountSignInState nextPath="/account/password" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile ? (
        <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">发送修改邮件</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              当前接收邮箱如下。若邮箱已不可用，请先返回账号中心进入“更换邮箱”。
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            当前接收邮箱：{profile.email || userEmail || "-"}
          </div>

          {isTurnstileEnabled() && (
            <TurnstileChallenge
              ref={captchaRef}
              action="account-password-reset"
              title=""
              description=""
              variant="inline"
            />
          )}

          {message && (
            <div className={`text-sm ${message.includes("已") ? "text-emerald-600" : "text-red-500"}`}>
              {message}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sending}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "发送中..." : "发送修改邮件"}
            </button>
          </div>
        </form>
      ) : null}
    </AccountShell>
  );
}