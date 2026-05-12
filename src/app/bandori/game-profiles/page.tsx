"use client";

import Link from "next/link";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "@/app/account/AccountShell";
import GameProfilesPanel from "@/app/account/GameProfilesPanel";
import { useAccountProfile } from "@/app/account/useAccountProfile";

export default function BandoriGameProfilesPage() {
  const { userId, authReady, profile, loadingProfile, profileError } = useAccountProfile();

  return (
    <AccountShell
      title="游戏档案"
      description="绑定游戏 UID，管理本地和云端游戏数据档案。"
      backHref="/account"
      backLabel="返回账号中心"
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message="正在读取账号信息..." />
      ) : !userId ? (
        <AccountSignInState nextPath="/bandori/game-profiles" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile?.emailVerified ? (
        <GameProfilesPanel />
      ) : (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-amber-900">邮箱验证后解锁游戏档案</h2>
          <p className="mt-2 text-sm leading-6 text-amber-700">
            完成邮箱验证后，可以使用游戏账号绑定、云端档案、评论和排期编辑等功能。
          </p>
          <div className="mt-5">
            <Link href="/account/email" className="hhwx-accent-button">
              前往验证邮箱
            </Link>
          </div>
        </section>
      )}
    </AccountShell>
  );
}
