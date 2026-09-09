"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "./AccountShell";
import AccountAvatarCardControl from "./AccountAvatarCardControl";
import AccountDisplayDegreeControl from "./AccountDisplayDegreeControl";
import { useLocalizedAccountProfile } from "./useAccountProfile";

type AccountEntry = {
  href: string;
  titleKey: string;
  descriptionKey: string;
};

const accountEntries: AccountEntry[] = [
  {
    href: "/account/profile",
    titleKey: "home.entries.profile.title",
    descriptionKey: "home.entries.profile.description",
  },
  {
    href: "/account/password",
    titleKey: "home.entries.password.title",
    descriptionKey: "home.entries.password.description",
  },
  {
    href: "/account/email",
    titleKey: "home.entries.email.title",
    descriptionKey: "home.entries.email.description",
  },
  {
    href: "/bandori/game-profiles",
    titleKey: "home.entries.gameProfiles.title",
    descriptionKey: "home.entries.gameProfiles.description",
  },
];

function AccountEntryLink({ href, titleKey, descriptionKey }: AccountEntry) {
  const t = useTranslations("account");
  const commonT = useTranslations("common");

  return (
    <Link
      href={href}
      className="hhwx-control group flex items-start justify-between gap-3 rounded-2xl border p-4 shadow-xs transition hover:shadow-[var(--theme-shadow-surface-raised)] sm:gap-4 sm:rounded-3xl sm:p-6"
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-[var(--theme-color-text-default)] sm:text-xl">{t(titleKey)}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-color-text-muted)]">{t(descriptionKey)}</p>
      </div>
      <span className="shrink-0 rounded-full border border-[var(--theme-color-border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--theme-color-text-default)] transition group-hover:border-[var(--theme-color-action-secondary-border)] group-hover:text-[var(--theme-color-action-secondary-foreground)]">
        {commonT("actions.enter")}
      </span>
    </Link>
  );
}

export default function AccountPage() {
  const t = useTranslations("account");
  const commonT = useTranslations("common");
  const { userId, userEmail, authReady, profile, setProfile, loadingProfile, profileError } = useLocalizedAccountProfile();

  return (
    <AccountShell
      title={t("home.title")}
      description={t("home.description")}
      backHref="/"
      backLabel={commonT("actions.backHome")}
    >
      {!authReady || loadingProfile ? (
        <AccountLoadingState message={commonT("states.loadingAccount")} />
      ) : !userId ? (
        <AccountSignInState nextPath="/account" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : profile ? (
        <div className="space-y-4 sm:space-y-6">
          <section className="rounded-2xl bg-[var(--theme-color-profile-banner-background)] p-4 text-[var(--theme-color-profile-banner-foreground)] shadow-lg sm:rounded-3xl sm:p-6">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <AccountAvatarCardControl profile={profile} onProfileChange={setProfile} />
              <div className="min-w-0 flex-1">
                <div className="wrap-break-word text-xl font-bold sm:text-2xl">{profile.username}</div>
                <div className="mt-1 break-all text-sm text-[var(--theme-color-profile-banner-foreground)]/80">{profile.email || userEmail || "-"}</div>
                <Link
                  href={`/u/${profile.publicUid}`}
                  className="mt-2 inline-flex rounded-full bg-[var(--theme-color-control-background)] px-3 py-1 text-xs font-semibold text-[var(--theme-color-action-secondary-foreground)] transition hover:bg-[var(--theme-color-control-background-hover)]"
                >
                  UID {profile.publicUid}
                </Link>
                <AccountDisplayDegreeControl profile={profile} onProfileChange={setProfile} />
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold sm:ml-auto ${profile.emailVerified ? "bg-[var(--theme-color-semantic-success-background)] text-[var(--theme-color-semantic-success-foreground)]" : "bg-[var(--theme-color-semantic-warning-background)] text-[var(--theme-color-semantic-warning-foreground)]"}`}>
                {profile.emailVerified ? t("home.emailVerified") : t("home.emailUnverified")}
              </span>
            </div>

            {!profile.emailVerified && (
              <div className="mt-4 rounded-2xl bg-[var(--theme-color-semantic-warning-background)] px-4 py-3 text-sm leading-6 text-[var(--theme-color-semantic-warning-foreground)] sm:mt-5">
                {t("home.emailWarning")}
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
