"use client";

import { useRef, useState } from "react";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "@/components/TurnstileChallenge";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { getApiErrorMessage } from "@/lib/api-contracts";
import { formatAuthErrorMessage } from "@/lib/auth-error";
import { buildAuthCallbackUrl, getSafeSession } from "@/lib/supabase";
import { useTurnstileAvailability } from "@/hooks/useTurnstileAvailability";
import { useAccountProfile } from "../useAccountProfile";

export default function AccountPasswordPage() {
  const { userId, userEmail, authReady, profile, loadingProfile, profileError } = useAccountProfile();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const captchaRef = useRef<TurnstileChallengeHandle | null>(null);
  const { isTurnstileEnabled, isTurnstileLoading } = useTurnstileAvailability();

  const requireCaptchaToken = () => {
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
        setMessage("登录状态已失效，请重新登录后再试。");
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
          redirectTo: buildAuthCallbackUrl("/account/password"),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(getApiErrorMessage(payload) || `发送修改邮件失败（HTTP ${response.status}）`);
        return;
      }

      setMessage("重置密码邮件已发送到当前邮箱。请打开邮件继续设置新密码。");
    } catch (error) {
      setMessage(formatAuthErrorMessage(error, "发送修改邮件失败", "forgot-password"));
    } finally {
      setSending(false);
      resetCaptcha();
    }
  };

  return (
    <AccountShell
      title="修改密码"
      description="把重置密码邮件发到当前邮箱。"
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
              当前接收邮箱如下。邮箱不可用时，请先更换邮箱。
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            当前接收邮箱：{profile.email || userEmail || "-"}
          </div>

          {isTurnstileEnabled && (
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
              disabled={sending || isTurnstileLoading}
              className="hhwx-accent-button"
            >
              {sending ? "发送中..." : "发送修改邮件"}
            </button>
          </div>
        </form>
      ) : null}
    </AccountShell>
  );
}
