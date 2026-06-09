"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance, type TurnstileTheme } from "@marsidev/react-turnstile";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile-public";

export interface TurnstileChallengeHandle {
  getToken: () => string | null;
  reset: () => void;
}

interface TurnstileChallengeProps {
  title?: string;
  description?: string;
  notConfiguredTitle?: string;
  notConfiguredDescription?: string;
  expiredMessage?: string;
  loadFailedMessage?: string;
  action: string;
  theme?: TurnstileTheme;
  className?: string;
  variant?: "card" | "inline";
}

const baseClassName = "rounded-3xl border border-slate-200 bg-slate-50 p-4";
const inlineClassName = "flex w-full max-w-full flex-col items-start gap-2";

const TurnstileChallenge = forwardRef<TurnstileChallengeHandle, TurnstileChallengeProps>(function TurnstileChallenge(
  {
    title = "安全验证",
    description = "",
    notConfiguredTitle = "未配置安全验证",
    notConfiguredDescription = "当前环境暂时无法渲染安全验证组件，请补齐对应配置后再试。",
    expiredMessage = "验证已过期，请重新完成。",
    loadFailedMessage = "验证加载失败，请刷新后重试。",
    action,
    theme = "light",
    className = "",
    variant = "card",
  },
  ref,
) {
  const widgetRef = useRef<TurnstileInstance | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  useImperativeHandle(ref, () => ({
    getToken: () => widgetRef.current?.getResponse() ?? null,
    reset: () => {
      widgetRef.current?.reset();
      setStatusMessage("");
    },
  }), []);

  const containerClassName = `${variant === "inline" ? inlineClassName : baseClassName} ${className}`.trim();
  const widgetClassName = variant === "inline"
    ? "w-full max-w-full overflow-x-auto overflow-y-hidden rounded-none border-0 bg-transparent p-0"
    : `overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 ${title || description ? "mt-4" : ""}`.trim();

  if (!TURNSTILE_SITE_KEY) {
    return (
      <div className={containerClassName}>
        <div className="text-sm font-semibold text-amber-700">{notConfiguredTitle}</div>
        <p className="mt-2 text-sm leading-6 text-amber-700/90">
          {notConfiguredDescription}
        </p>
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      {title && <div className="text-sm font-semibold text-slate-900">{title}</div>}
      {description && <p className="text-sm leading-6 text-slate-600">{description}</p>}
      <div className={widgetClassName}>
        <div className="min-w-[300px] sm:min-w-0">
          <Turnstile
            ref={widgetRef}
            siteKey={TURNSTILE_SITE_KEY}
            options={{
              action,
              theme,
              size: "flexible",
            }}
            onSuccess={() => setStatusMessage("")}
            onExpire={() => setStatusMessage(expiredMessage)}
            onError={() => setStatusMessage(loadFailedMessage)}
          />
        </div>
      </div>
      {statusMessage && (
        <div className="mt-3 text-sm text-red-500">{statusMessage}</div>
      )}
    </div>
  );
});

export default TurnstileChallenge;
