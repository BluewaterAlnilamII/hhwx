"use client";

import { useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { X } from "lucide-react";
import { siteNavigationGroups, type SectionSidebarNavItem } from "@/lib/section-navigation";
import { cn } from "@/lib/utils";

interface SectionSidebarShellProps {
  children: ReactNode;
  onCloseMobileDrawer: () => void;
}

function isItemActive(pathname: string, item: SectionSidebarNavItem) {
  if (item.matchMode === "exact") {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function SectionSidebarShell({ children, onCloseMobileDrawer }: SectionSidebarShellProps) {
  const pathname = usePathname();
  const t = useTranslations("navigation");
  const [prefetchIntents, setPrefetchIntents] = useState<Record<string, boolean>>({});
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isOthelloPage = pathname === "/othello";
  const contentWrapperClassName = isOthelloPage
    ? "relative h-[calc(100svh-58px)] min-h-[calc(100svh-58px)] px-2 py-0 sm:px-6 sm:py-0 lg:px-6 lg:py-0"
    : "relative min-h-full px-2 py-5 sm:px-6 lg:px-8 lg:py-6";

  const requestPrefetch = (href: string) => {
    setPrefetchIntents((currentValue) => {
      if (currentValue[href]) {
        return currentValue;
      }

      return {
        ...currentValue,
        [href]: true,
      };
    });
  };

  const renderNavItem = (item: SectionSidebarNavItem) => {
    const active = isItemActive(pathname, item);
    const shouldPrefetch = !active && prefetchIntents[item.href];
    const itemClassName = cn(
      "hhwx-navigation-item block px-4 py-2.5 text-[15px] transition duration-200",
      active
        ? "bg-[var(--theme-color-shell-navigation-item-background-current)] text-[var(--theme-color-shell-navigation-item-foreground-current)] shadow-[var(--theme-shadow-navigation-current)]"
        : "text-[var(--theme-color-shell-navigation-item-foreground)] hover:bg-[var(--theme-color-shell-navigation-item-background-hover)] hover:text-[var(--theme-color-shell-navigation-item-foreground-hover)] hover:shadow-[var(--theme-shadow-navigation-hover)]",
    );

    return (
      <Link
        key={item.id}
        href={item.href}
        prefetch={shouldPrefetch ? null : false}
        onPointerEnter={() => requestPrefetch(item.href)}
        onFocus={() => requestPrefetch(item.href)}
        onClick={onCloseMobileDrawer}
        aria-current={active ? "page" : undefined}
        className={itemClassName}
      >
        {t(item.labelKey)}
      </Link>
    );
  };

  const sidebarContent = (
    <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="space-y-7">
        {siteNavigationGroups.map((group) => (
          <section key={group.id} className="space-y-2">
            <p className="px-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--theme-color-shell-navigation-group-foreground)]">{t(group.labelKey)}</p>
            <div className="space-y-1">{group.items.map(renderNavItem)}</div>
          </section>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="relative flex flex-1">
      <aside className="hhwx-desktop-sidebar sticky top-[58px] hidden h-[calc(100svh-58px)] w-[270px] shrink-0 border-r border-[var(--theme-color-shell-sidebar-border)] bg-transparent shadow-[var(--theme-shadow-shell-sidebar)] lg:flex lg:flex-col">
        {sidebarContent}
      </aside>

      <div className="min-w-0 flex-1">
        <div className={contentWrapperClassName}>{children}</div>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-260 bg-[var(--theme-color-shell-sidebar-backdrop)] lg:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 top-[58px] z-260 flex h-[calc(100svh-58px)] min-h-[calc(100svh-58px)] w-[286px] max-w-[88vw] flex-col overflow-hidden border-r border-[var(--theme-color-shell-sidebar-border)] bg-[var(--theme-color-shell-sidebar-background)] shadow-[var(--theme-shadow-shell-sidebar-overlay)] lg:hidden"
          onOpenAutoFocus={() => {
            returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">{t("toolbar.openNavigation")}</Dialog.Title>
          <div className="flex items-center justify-end px-4 py-4">
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--theme-color-shell-sidebar-border)] bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-shell-navigation-item-foreground-hover)]"
              aria-label={t("toolbar.closeNavigation")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {sidebarContent}
        </Dialog.Content>
      </Dialog.Portal>
    </div>
  );
}
