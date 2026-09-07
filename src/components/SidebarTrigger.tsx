"use client";

import type { ReactNode } from "react";
import { Trigger } from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";

export default function SidebarTrigger({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  const t = useTranslations("navigation.toolbar");

  return (
    <Trigger type="button" className={className} aria-label={`${label} · ${t("openNavigation")}`}>
      {children}
    </Trigger>
  );
}
