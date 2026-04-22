"use client";

import Link from "next/link";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "./AccountShell";
import { useAccountProfile } from "./useAccountProfile";

export default function AccountPage() {
  const { userId, userEmail, authReady, profile, loadingProfile, profileError } = useAccountProfile();

  return (
    <AccountShell
      title="账号中心"
      description="查看账号状态，处理资料、密码和邮箱。"
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
        <div className="space-y-6">
          <section className="rounded-3xl bg-[#006699] p-6 text-white shadow-lg">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-xl font-bold">
                {(profile.username || "U")[0].toUpperCase()}
              </div>
              <div>
                <div className="text-2xl font-bold">{profile.username}</div>
                <div className="mt-1 text-sm text-slate-300">{profile.email || userEmail || "-"}</div>
              </div>
              <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${profile.emailVerified ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
                {profile.emailVerified ? "邮箱已验证" : "邮箱未验证"}
              </span>
            </div>

            {!profile.emailVerified && (
              <div className="mt-5 rounded-2xl bg-amber-400/15 px-4 py-3 text-sm leading-6 text-amber-100">
                邮箱尚未验证。完成验证后可使用全部账号功能。
              </div>
            )}
          </section>

          <div className="space-y-4">
            <Link
              href="/account/profile"
              className="group flex items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-sky-200 hover:shadow-[0_12px_36px_rgba(14,165,233,0.08)]"
            >
              <div>
                <h2 className="text-xl font-semibold text-slate-900">编辑资料</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">修改用户名等公开信息。</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition group-hover:border-sky-200 group-hover:text-sky-600">
                进入
              </span>
            </Link>

            <Link
              href="/account/password"
              className="group flex items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-sky-200 hover:shadow-[0_12px_36px_rgba(14,165,233,0.08)]"
            >
              <div>
                <h2 className="text-xl font-semibold text-slate-900">修改密码</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">向当前邮箱发送改密链接。</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition group-hover:border-sky-200 group-hover:text-sky-600">
                进入
              </span>
            </Link>

            <Link
              href="/account/email"
              className="group flex items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-sky-200 hover:shadow-[0_12px_36px_rgba(14,165,233,0.08)]"
            >
              <div>
                <h2 className="text-xl font-semibold text-slate-900">更换邮箱</h2>
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