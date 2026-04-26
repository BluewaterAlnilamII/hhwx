"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import type { GameAccountBinding, GameBindChallenge } from "@/lib/game-account-binding";
import { getAccessToken } from "./useAccountProfile";

type VerifyResult = {
  gameUid: string;
  transferred: boolean;
};

const USER_GAME_BINDING_LIMIT = 5;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("请先登录");
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) || `请求失败（HTTP ${response.status}）`);
  }

  const data = parseApiSuccessData<T>(payload);
  if (data === null) {
    throw new Error("接口返回格式无效");
  }

  return data;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type GameAccountBindingPanelProps = {
  onBindingsChange?: () => void;
};

export default function GameAccountBindingPanel({ onBindingsChange }: GameAccountBindingPanelProps) {
  const [gameUid, setGameUid] = useState("");
  const [challenge, setChallenge] = useState<GameBindChallenge | null>(null);
  const [bindings, setBindings] = useState<GameAccountBinding[]>([]);
  const [loadingBindings, setLoadingBindings] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copiedChallenge, setCopiedChallenge] = useState(false);

  const normalizedUid = useMemo(() => gameUid.trim(), [gameUid]);

  const loadBindings = useCallback(async () => {
    setLoadingBindings(true);
    setError("");
    try {
      setBindings(await requestJson<GameAccountBinding[]>("/api/account/game-bind/bindings"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取已绑定游戏账号失败");
    } finally {
      setLoadingBindings(false);
    }
  }, []);

  useEffect(() => {
    void loadBindings();
  }, [loadBindings]);

  const createChallenge = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const nextChallenge = await requestJson<GameBindChallenge>("/api/account/game-bind/challenge", {
        method: "POST",
        body: JSON.stringify({ gameUid: normalizedUid }),
      });
      setChallenge(nextChallenge);
      setCopiedChallenge(false);
      setMessage("验证码已生成，请填入游戏内个性签名。");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建验证码失败");
    } finally {
      setBusy(false);
    }
  }, [normalizedUid]);

  const verifyChallenge = useCallback(async () => {
    if (!challenge) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await requestJson<VerifyResult>("/api/account/game-bind/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: challenge.id }),
      });
      setMessage(result.transferred ? "绑定成功，该 UID 已从旧账号转移到当前账号。" : "绑定成功。");
      setChallenge(null);
      setCopiedChallenge(false);
      setGameUid("");
      await loadBindings();
      onBindingsChange?.();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "验证失败");
    } finally {
      setBusy(false);
    }
  }, [challenge, loadBindings, onBindingsChange]);

  const unbindGameUid = useCallback(async (targetUid: string) => {
    if (!window.confirm(`确认解绑游戏 UID ${targetUid}？解绑会删除该 UID 与当前网页账号关联的数据。`)) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestJson<{ gameUid: string }>(`/api/account/game-bind/bindings/${encodeURIComponent(targetUid)}`, {
        method: "DELETE",
      });
      setMessage("已解绑游戏账号。");
      await loadBindings();
      onBindingsChange?.();
    } catch (unbindError) {
      setError(unbindError instanceof Error ? unbindError.message : "解绑失败");
    } finally {
      setBusy(false);
    }
  }, [loadBindings, onBindingsChange]);

  const copyChallenge = useCallback(() => {
    if (!challenge) {
      return;
    }

    void navigator.clipboard?.writeText(challenge.challenge).then(() => {
      setCopiedChallenge(true);
      window.setTimeout(() => setCopiedChallenge(false), 1600);
    }).catch(() => undefined);
  }, [challenge]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">绑定游戏账号</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">输入游戏 UID，生成验证码后填入游戏内个性签名，再返回这里验证。</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={gameUid}
          onChange={(event) => setGameUid(event.target.value.replace(/\D/g, ""))}
          placeholder="游戏 UID"
          inputMode="numeric"
          className="h-11 rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
        />
        <button
          type="button"
          onClick={createChallenge}
          disabled={busy || !normalizedUid || bindings.length >= USER_GAME_BINDING_LIMIT}
          className="h-11 rounded-2xl bg-sky-600 px-5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {challenge ? "刷新验证码" : "生成验证码"}
        </button>
      </div>

      {challenge && (
        <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">验证码</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="rounded-xl bg-white px-3 py-2 text-lg font-bold text-slate-900 shadow-sm">{challenge.challenge}</code>
            <button
              type="button"
              onClick={copyChallenge}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
            >
              {copiedChallenge ? "已复制" : "复制"}
            </button>
          </div>
          <div className="mt-3 text-sm text-slate-600">有效期至 {formatDate(challenge.expiresAt)}</div>
          <button
            type="button"
            onClick={verifyChallenge}
            disabled={busy}
            className="mt-4 h-10 rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            我已填写，开始验证
          </button>
        </div>
      )}

      {(message || error) && (
        <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-base font-semibold text-slate-900">已绑定账号 {bindings.length}/{USER_GAME_BINDING_LIMIT}</h3>
        {loadingBindings ? (
          <p className="mt-3 text-sm text-slate-500">正在读取...</p>
        ) : bindings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">暂无已绑定的游戏账号。</p>
        ) : (
          <div className="mt-3 space-y-3">
            {bindings.map((binding) => (
              <div key={binding.gameUid} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <div className="font-semibold text-slate-900">UID {binding.gameUid}</div>
                  <div className="mt-1 text-xs text-slate-500">绑定时间：{formatDate(binding.boundAt)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => unbindGameUid(binding.gameUid)}
                  disabled={busy}
                  className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  解绑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
