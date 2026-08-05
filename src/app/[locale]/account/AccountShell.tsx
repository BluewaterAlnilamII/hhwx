"use client";

import { useLocale, useTranslations } from "next-intl";
import Heading from "@/components/Heading";
import { Link } from "@/i18n/navigation";
import { type AppLocale } from "@/i18n/routing";
import { buildAuthPath } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export interface AccountShellProps {
  title: string;
  description?: string | null;
  backHref?: string | null;
  backLabel?: string;
  onBack?: () => void;
  isBackDisabled?: boolean;
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
  onBack,
  isBackDisabled = false,
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
        <div className="w-full max-w-full border-y border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] px-4 py-6 shadow-[0_12px_42px_rgba(15,23,42,0.08)] sm:rounded-[32px] sm:border sm:p-8 sm:shadow-[0_20px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-4 border-b border-[var(--theme-color-border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:pb-6">
            <div className="min-w-0">
              {!hideEyebrow ? (
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--theme-color-action-secondary-foreground)]">{t("eyebrow")}</p>
              ) : null}
              <Heading as="h1" visualRole="page" className="mt-2">{title}</Heading>
              {description ? (
                <p className="mt-2 w-full max-w-56 break-all text-sm leading-6 text-[var(--theme-color-text-muted)] min-[390px]:max-w-full sm:max-w-2xl">{description}</p>
              ) : null}
            </div>
            {backHref ? (
              onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  disabled={isBackDisabled}
                  className="inline-flex w-full items-center justify-center rounded-full border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-action-secondary-background)] px-5 py-2 text-sm font-semibold text-[var(--theme-color-action-secondary-foreground)] transition hover:bg-[var(--theme-color-action-secondary-background-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {resolvedBackLabel}
                </button>
              ) : (
                <Link
                  href={backHref}
                  className="inline-flex w-full items-center justify-center rounded-full border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-action-secondary-background)] px-5 py-2 text-sm font-semibold text-[var(--theme-color-action-secondary-foreground)] transition hover:bg-[var(--theme-color-action-secondary-background-hover)] sm:w-auto"
                >
                  {resolvedBackLabel}
                </Link>
              )
            ) : null}
          </div>

          <div className="mt-5 sm:mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function AccountLoadingState({ message }: AccountStateProps) {
  return <div className="py-16 text-center text-[var(--theme-color-text-muted)]">{message}</div>;
}

export function AccountErrorState({ message }: AccountStateProps) {
  return (
    <div className="rounded-2xl border border-[var(--theme-color-feedback-error-border)] bg-[var(--theme-color-feedback-error-background)] p-4 text-sm leading-6 text-[var(--theme-color-feedback-error-foreground)]">
      {message}
    </div>
  );
}

export function AccountSignInState({ nextPath }: { nextPath: string }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("account.shell");

  return (
    <div className="py-16 text-center">
      <Heading as="h2" visualRole="section" className="font-semibold">{t("signInTitle")}</Heading>
      <p className="mt-2 text-sm text-[var(--theme-color-text-muted)]">{t("signInDescription")}</p>
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
