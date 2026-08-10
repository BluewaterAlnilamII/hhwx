"use client";

import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import { Link } from "@/i18n/navigation";
import {
  BANDORI_SERVERS,
  getBandoriServerCode,
  type BandoriServer,
} from "@/lib/bandori-server";
import { cn } from "@/lib/utils";

export type BandoriCardServerSwitcherProps = {
  selectedServer: BandoriServer;
  availableServers?: readonly BandoriServer[];
  label: string;
  getHref?: (server: BandoriServer) => string;
  onChange?: (server: BandoriServer) => void;
  className?: string;
};

export default function BandoriCardServerSwitcher({
  selectedServer,
  availableServers = BANDORI_SERVERS,
  label,
  getHref,
  onChange,
  className,
}: BandoriCardServerSwitcherProps) {
  const availableSet = new Set(availableServers);

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <span className="text-sm font-black text-[var(--theme-color-text-default)] dark:text-slate-200">
        {label}
      </span>
      <div className="inline-grid grid-cols-4 overflow-hidden rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] shadow-xs dark:border-slate-700 dark:bg-slate-950/60">
        {BANDORI_SERVERS.map((server) => {
          const isAvailable = availableSet.has(server);
          const isActive = selectedServer === server;
          const code = getBandoriServerCode(server).toUpperCase();
          const controlClassName = cn(
            "group flex h-11 w-12 items-center justify-center gap-1 border-r border-[var(--theme-color-border-subtle)] text-[10px] font-black transition last:border-r-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400 dark:border-slate-700",
            isActive
              ? "bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-control-foreground-pressed)]"
              : "text-slate-600 hover:bg-[var(--theme-color-control-background-hover)] dark:text-slate-300 dark:hover:bg-slate-800",
            !isAvailable && "cursor-not-allowed opacity-35 hover:bg-transparent dark:hover:bg-transparent",
          );
          const content = (
            <>
              <BandoriServerIcon
                server={server}
                size={22}
                isDecorative
                className={cn(isActive && "ring-2 ring-sky-400 ring-offset-1")}
              />
              <span className="sr-only">{code}</span>
            </>
          );

          if (isAvailable && getHref) {
            return (
              <Link
                key={server}
                href={getHref(server)}
                aria-current={isActive ? "page" : undefined}
                aria-label={code}
                title={code}
                className={controlClassName}
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              key={server}
              type="button"
              disabled={!isAvailable}
              aria-pressed={isActive}
              aria-label={code}
              title={code}
              onClick={() => isAvailable && onChange?.(server)}
              className={controlClassName}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
