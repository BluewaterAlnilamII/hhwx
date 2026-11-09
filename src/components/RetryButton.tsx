"use client";

import type { ButtonHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export default function RetryButton({ className, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const t = useTranslations("common");
  return <button {...props} type="button" className={cn(
    "hhwx-control relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-3 py-1 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-50 after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
    className,
  )}>{t("actions.retry")}</button>;
}
