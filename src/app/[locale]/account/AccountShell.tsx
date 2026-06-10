"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { type AppLocale } from "@/i18n/routing";
import { buildAuthPath } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export interface AccountShellProps {
  title: string;
  description?: string | null;
  backHref?: string | null;
  backLabel?: string;
  containerClassName?: string;
  flushTop?: boolean;
  hideEyebrow?: boolean;
  children: React.ReactNode;
}

interface AccountStateProps {
  message: string;
}

export default function AccountShell({
  title,
  description,
  backHref = "/account",
  backLabel,
  containerClassName = "max-w-full sm:max-w-4xl",
  flushTop = true,
  hideEyebrow = false,
  children,
}: AccountShellProps) {
  const t = useTranslations("account.shell");
  const resolvedBackLabel = backLabel ?? t("defaultBackLabel");

  return (
    <main
      className={cn(
        "relative min-h-full w-full min-w-0 px-0 pb-4 sm:px-6 sm:pb-10 lg:px-8",
        flushTop ? "-mt-5 pt-0 lg:-mt-6" : "pt-4 sm:pt-10",
      )}
    >
      <div className={`mx-auto w-full ${containerClassName}`}>
        <div className="w-full max-w-full border-y border-white/55 bg-[#fffef4] px-4 py-6 shadow-[0_12px_42px_rgba(15,23,42,0.08)] sm:rounded-[32px] sm:border sm:p-8 sm:shadow-[0_20px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:pb-6">
            <div className="min-w-0">
              {!hideEyebrow ? (
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-500">{t("eyebrow")}</p>
              ) : null}
              <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
              {description ? (
                <p className="mt-2 w-full max-w-[14rem] break-all text-sm leading-6 text-slate-600 min-[390px]:max-w-full sm:max-w-2xl">{description}</p>
              ) : null}
            </div>
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 sm:w-auto"
              >
                {resolvedBackLabel}
              </Link>
            ) : null}
          </div>

          <div className="mt-5 sm:mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function AccountLoadingState({ message }: AccountStateProps) {
  return <div className="py-16 text-center text-slate-500">{message}</div>;
}

export function AccountErrorState({ message }: AccountStateProps) {
  return <div className="rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-600">{message}</div>;
}

export function AccountSignInState({ nextPath }: { nextPath: string }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("account.shell");

  return (
    <div className="py-16 text-center">
      <h2 className="text-xl font-semibold text-slate-900">{t("signInTitle")}</h2>
      <p className="mt-2 text-sm text-slate-600">{t("signInDescription")}</p>
      <div className="mt-5">
        <Link
          href={buildAuthPath("login", nextPath, undefined, locale)}
          className="hhwx-accent-button"
        >
          {t("signInAction")}
        </Link>
      </div>
    </div>
  );
}
