"use client";

import Link from "next/link";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "./AccountShell";
import AccountAvatarCardControl from "./AccountAvatarCardControl";
import { useAccountProfile } from "./useAccountProfile";

type AccountEntry = {
  href: string;
  title: string;
  description: string;
};

const accountEntries: AccountEntry[] = [
  {
    href: "/account/profile",
    title: "编辑资料",
    description: "修改公开用户名。",
  },
  {
    href: "/account/password",
    title: "修改密码",
    description: "向当前邮箱发送重置密码邮件。",
  },
  {
    href: "/account/email",
    title: "更换邮箱",
    description: "检查验证状态并更换登录邮箱。",
  },
  {
    href: "/bandori/game-profiles",
    title: "游戏档案",
    description: "绑定游戏账号，管理本地和云端游戏数据档案。",
  },
];

function AccountEntryLink({ href, title, description }: AccountEntry) {
  return (
    <Link
      href={href}
      className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-[0_12px_36px_rgba(14,165,233,0.08)] sm:gap-4 sm:rounded-3xl sm:p-6"
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <span className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition group-hover:border-sky-200 group-hover:text-sky-600">
        进入
      </span>
    </Link>
  );
}

export default function AccountPage() {
  const { userId, userEmail, authReady, profile, setProfile, loadingProfile, profileError } = useAccountProfile();

  return (
    <AccountShell
      title="账号中心"
      description="查看账号状态，处理资料、密码和邮箱设置。"
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
              <AccountAvatarCardControl profile={profile} onProfileChange={setProfile} />
              <div className="min-w-0 flex-1">
                <div className="break-words text-xl font-bold sm:text-2xl">{profile.username}</div>
                <div className="mt-1 break-all text-sm text-slate-300">{profile.email || userEmail || "-"}</div>
                <Link
                  href={`/u/${profile.publicUid}`}
                  className="mt-2 inline-flex rounded-full bg-white/12 px-3 py-1 text-xs font-semibold text-sky-100 transition hover:bg-white/20"
                >
                  UID {profile.publicUid}
                </Link>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold sm:ml-auto ${profile.emailVerified ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
                {profile.emailVerified ? "邮箱已验证" : "邮箱未验证"}
              </span>
            </div>

            {!profile.emailVerified && (
              <div className="mt-4 rounded-2xl bg-amber-400/15 px-4 py-3 text-sm leading-6 text-amber-100 sm:mt-5">
                邮箱尚未验证。完成验证后可使用游戏档案、评论和排期编辑等功能。
              </div>
            )}
          </section>

          <div className="space-y-4">
            {accountEntries.map((entry) => (
              <AccountEntryLink key={entry.href} {...entry} />
            ))}
          </div>
        </div>
      ) : null}
    </AccountShell>
  );
}
