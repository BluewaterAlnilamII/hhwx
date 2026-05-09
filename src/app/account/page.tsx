"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { getUsernameAvatarLabel } from "@/lib/username-policy";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "./AccountShell";
import GameAccountBindingPanel from "./GameAccountBindingPanel";
import GameProfilesPanel from "./GameProfilesPanel";
import { useAccountProfile } from "./useAccountProfile";

export default function AccountPage() {
  const { userId, userEmail, authReady, profile, loadingProfile, profileError } = useAccountProfile();
  const [gameBindingsRefreshSignal, setGameBindingsRefreshSignal] = useState(0);

  const handleGameBindingsChange = useCallback(() => {
    setGameBindingsRefreshSignal((value) => value + 1);
  }, []);

  return (
    <AccountShell
      title="账号中心"
      description="查看账号状态，处理资料、密码、邮箱和游戏账号绑定。"
      backHref="/"
      backLabel="返回首页"
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message="正在读取账号信息..." />
      ) : !userId ? (
        <AccountSignInState nextPath="/account" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile ? (
        <div className="space-y-4 sm:space-y-6">
          <section className="rounded-2xl bg-[#006699] p-4 text-white shadow-lg sm:rounded-3xl sm:p-6">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-lg font-bold sm:h-14 sm:w-14 sm:text-xl">
                {getUsernameAvatarLabel(profile.username)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="break-words text-xl font-bold sm:text-2xl">{profile.username}</div>
                <div className="mt-1 break-all text-sm text-slate-300">{profile.email || userEmail || "-"}</div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold sm:ml-auto ${profile.emailVerified ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
                {profile.emailVerified ? "邮箱已验证" : "邮箱未验证"}
              </span>
            </div>

            {!profile.emailVerified && (
              <div className="mt-4 rounded-2xl bg-amber-400/15 px-4 py-3 text-sm leading-6 text-amber-100 sm:mt-5">
                邮箱尚未验证。完成验证后可使用全部账号功能。
              </div>
            )}
          </section>

          {profile.emailVerified ? (
            <>
              <GameAccountBindingPanel onBindingsChange={handleGameBindingsChange} />
              <GameProfilesPanel refreshSignal={gameBindingsRefreshSignal} />
            </>
          ) : (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-amber-900">邮箱验证后解锁更多功能</h2>
              <p className="mt-2 text-sm leading-6 text-amber-700">
                完成邮箱验证后，可以使用游戏账号绑定、云端 Profile、评论和排期编辑等功能。
              </p>
              <div className="mt-5">
                <Link href="/account/email" className="hhwx-accent-button">
                  前往验证邮箱
                </Link>
              </div>
            </section>
          )}

          <div className="space-y-4">
            <Link
              href="/account/profile"
              className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-[0_12px_36px_rgba(14,165,233,0.08)] sm:gap-4 sm:rounded-3xl sm:p-6"
            >
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">编辑资料</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">修改公开用户名。</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition group-hover:border-sky-200 group-hover:text-sky-600">
                进入
              </span>
            </Link>

            <Link
              href="/account/password"
              className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-[0_12px_36px_rgba(14,165,233,0.08)] sm:gap-4 sm:rounded-3xl sm:p-6"
            >
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">修改密码</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">向当前邮箱发送重置密码邮件。</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition group-hover:border-sky-200 group-hover:text-sky-600">
                进入
              </span>
            </Link>

            <Link
              href="/account/email"
              className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-[0_12px_36px_rgba(14,165,233,0.08)] sm:gap-4 sm:rounded-3xl sm:p-6"
            >
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">更换邮箱</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">检查验证状态并更换登录邮箱。</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition group-hover:border-sky-200 group-hover:text-sky-600">
                进入
              </span>
            </Link>
          </div>
        </div>
      ) : null}
    </AccountShell>
  );
}
