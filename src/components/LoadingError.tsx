"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import RetryButton from "@/components/RetryButton";

export default function LoadingError({ onRetry, className }: {
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations("common");
  return (
    <div role="alert" className={cn("flex items-center justify-center gap-3 text-sm text-[var(--theme-color-text-muted)]", className)}>
      <span>{t("states.loadFailed")}</span>
      {onRetry ? <RetryButton onClick={onRetry} /> : null}
    </div>
  );
}
