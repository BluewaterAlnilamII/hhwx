"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { siteNavigationGroups, type SectionSidebarNavItem } from "@/lib/section-navigation";
import { cn } from "@/lib/utils";

interface SectionSidebarShellProps {
  children: ReactNode;
  isMobileDrawerOpen: boolean;
  onCloseMobileDrawer: () => void;
}

function isItemActive(pathname: string, item: SectionSidebarNavItem) {
  if (item.matchMode === "exact") {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function SectionSidebarShell({ children, isMobileDrawerOpen, onCloseMobileDrawer }: SectionSidebarShellProps) {
  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const contentWrapperClassName = isHomePage
    ? "relative h-full px-4 py-0 sm:px-6 sm:py-0 lg:px-6 lg:py-0"
    : "relative min-h-full px-4 py-5 sm:px-6 lg:px-8 lg:py-6";

  const renderNavItem = (item: SectionSidebarNavItem) => {
    const active = isItemActive(pathname, item);
    const itemClassName = cn(
      "block rounded-[14px] px-4 py-2.5 text-[15px] font-medium transition duration-200",
      active
        ? "bg-[#ff9922] text-white shadow-[0_12px_28px_rgba(255,153,34,0.24)]"
        : "text-slate-700 hover:bg-white hover:text-[#b86100] hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]",
    );

    return (
      <Link
        key={item.id}
        href={item.href}
        onClick={onCloseMobileDrawer}
        aria-current={active ? "page" : undefined}
        className={itemClassName}
      >
        {item.label}
      </Link>
    );
  };

  const sidebarContent = (
    <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="space-y-7">
        {siteNavigationGroups.map((group) => (
          <section key={group.id} className="space-y-2">
            <p className="px-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{group.label}</p>
            <div className="space-y-1">{group.items.map(renderNavItem)}</div>
          </section>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <aside className="hidden h-full w-[270px] shrink-0 border-r border-[#ffe374]/85 bg-[#ffed7a]/74 shadow-[0_18px_48px_rgba(128,91,0,0.12)] lg:flex lg:flex-col">
        {sidebarContent}
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className={contentWrapperClassName}>{children}</div>
      </div>

      <div
        aria-hidden={!isMobileDrawerOpen}
        className={cn(
          "fixed inset-0 z-[240] lg:hidden",
          isMobileDrawerOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <button
          type="button"
          aria-label="关闭页面导航"
          className={cn(
            "absolute inset-0 transition-[opacity,background-color] duration-300 ease-out",
            isMobileDrawerOpen
              ? "pointer-events-auto bg-[#fff3a3]/76 opacity-100"
              : "pointer-events-none bg-white/0 opacity-0",
          )}
          onClick={onCloseMobileDrawer}
        />
        <div
          className={cn(
            "absolute bottom-0 left-0 top-[58px] w-[286px] max-w-[88vw] overflow-hidden border-r border-[#ffe374]/85 bg-[#fff3a3]/96 shadow-[0_24px_64px_rgba(128,91,0,0.18)] transition-transform duration-300 ease-out will-change-transform",
            isMobileDrawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-end px-4 py-4">
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#ffe0b5] bg-[#fff3df] text-[#b86100]"
              aria-label="关闭页面导航"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {sidebarContent}
        </div>
      </div>
    </div>
  );
}
