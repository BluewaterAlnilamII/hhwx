"use client";

import { useTranslations } from "next-intl";
import EmailOtpFlow from "@/components/EmailOtpFlow";
import { AccountFormHeading, AccountFormPage } from "@/components/AccountForm";
import { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { useLocalizedAccountProfile } from "../useAccountProfile";

export default function AccountPasswordPage() {
  const t = useTranslations("account.password");
  const commonT = useTranslations("common");
  const shellT = useTranslations("account.shell");
  const { userId, authReady, profile, loadingProfile, profileError } = useLocalizedAccountProfile();
  return <AccountFormPage backHref="/account" backLabel={shellT("defaultBackLabel")}>
    {(!authReady || loadingProfile || !userId || profileError || !profile) && <AccountFormHeading title={t("title")} />}
    {!authReady || loadingProfile ? <AccountLoadingState message={commonT("states.loadingAccount")} />
      : !userId ? <AccountSignInState nextPath="/account/password" />
      : profileError ? <AccountErrorState message={profileError} />
      : profile ? <EmailOtpFlow key={profile.email} kind="recovery" initialEmail={profile.email || ""} title={t("title")} /> : null}
  </AccountFormPage>;
}
