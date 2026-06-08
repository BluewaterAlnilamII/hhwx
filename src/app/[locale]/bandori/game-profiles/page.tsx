"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "@/app/[locale]/account/AccountShell";
import GameProfilesPanel from "@/app/[locale]/account/GameProfilesPanel";
import { useLocalizedAccountProfile } from "@/app/[locale]/account/useAccountProfile";

export default function BandoriGameProfilesPage() {
  const accountT = useTranslations("account");
  const commonT = useTranslations("common");
  const { userId, authReady, profile, loadingProfile, profileError } = useLocalizedAccountProfile();

  return (
    <AccountShell
      title={accountT("home.entries.gameProfiles.title")}
      description={accountT("home.entries.gameProfiles.description")}
      backHref="/account"
      backLabel={accountT("gameProfiles.backAccount")}
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message={commonT("states.loadingAccount")} />
      ) : !userId ? (
        <AccountSignInState nextPath="/bandori/game-profiles" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile?.emailVerified ? (
        <GameProfilesPanel />
      ) : (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-amber-900">{accountT("gameProfiles.verifyTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-amber-700">
            {accountT("gameProfiles.verifyDescription")}
          </p>
          <div className="mt-5">
            <Link href="/account/email" className="hhwx-accent-button">
              {accountT("gameProfiles.verifyAction")}
            </Link>
          </div>
        </section>
      )}
    </AccountShell>
  );
}
