"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AccountFormHeading, AccountFormPage, accountFormStyles } from "@/components/AccountForm";

export default function AuthConfirmPage() {
  const t = useTranslations("auth");
  return <AccountFormPage backHref="/auth?mode=login" backLabel={t("actions.backLogin")}>
    <AccountFormHeading title={t("otp.linkRetiredTitle")} description={t("otp.linkRetired")} />
    <div className="flex flex-col items-start gap-1">
      <Link className={accountFormStyles.secondary} href="/auth?mode=register">{t("actions.register")}</Link>
      <Link className={accountFormStyles.secondary} href="/auth?mode=forgot-password">{t("mode.forgotPassword.title")}</Link>
      <Link className={accountFormStyles.secondary} href="/account/email">{t("otp.emailSettings")}</Link>
    </div>
  </AccountFormPage>;
}
