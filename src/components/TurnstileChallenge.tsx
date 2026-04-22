"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance, type TurnstileTheme } from "@marsidev/react-turnstile";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile";

export interface TurnstileChallengeHandle {
  getToken: () => string | null;
  reset: () => void;
}

interface TurnstileChallengeProps {
  title?: string;
  description: string;
  action: string;
  theme?: TurnstileTheme;
  className?: string;
}

const baseClassName = "rounded-3xl border border-slate-200 bg-slate-50 p-4";

const TurnstileChallenge = forwardRef<TurnstileChallengeHandle, TurnstileChallengeProps>(function TurnstileChallenge(
  {
    title = "安全验证",
    description,
    action,
    theme = "light",
    className = "",
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

  if (!TURNSTILE_SITE_KEY) {
    return (
      <div className={`${baseClassName} ${className}`.trim()}>
        <div className="text-sm font-semibold text-amber-700">未配置安全验证</div>
        <p className="mt-2 text-sm leading-6 text-amber-700/90">
          当前环境缺少 NEXT_PUBLIC_TURNSTILE_SITE_KEY，无法渲染人机验证组件。部署前请补齐该公开站点 key。
        </p>
      </div>
    );
  }

  return (
    <div className={`${baseClassName} ${className}`.trim()}>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
        <Turnstile
          ref={widgetRef}
          siteKey={TURNSTILE_SITE_KEY}
          options={{
            action,
            theme,
            size: "flexible",
          }}
          onSuccess={() => setStatusMessage("")}
          onExpire={() => setStatusMessage("验证已过期，请重新完成。")}
          onError={() => setStatusMessage("验证加载失败，请刷新后重试。")}
        />
      </div>
      {statusMessage && (
        <div className="mt-3 text-sm text-red-500">{statusMessage}</div>
      )}
    </div>
  );
});

export default TurnstileChallenge;