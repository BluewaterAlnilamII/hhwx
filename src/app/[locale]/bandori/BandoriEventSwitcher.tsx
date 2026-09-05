"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { History, Search, X } from "lucide-react";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import { cn } from "@/lib/utils";
import { BANDORI_SERVERS, getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";

const WIDE_EVENT_TITLE_CHARACTER_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]/u;

function getEventTitleSizeClass(title: string) {
  const visualLength = Array.from(title).reduce((length, character) => {
    if (/\s/u.test(character)) return length + 0.35;
    return length + (WIDE_EVENT_TITLE_CHARACTER_PATTERN.test(character) ? 1 : 0.62);
  }, 0);

  if (visualLength > 23) return "text-xl sm:text-[22px]";
  if (visualLength > 16) return "text-[22px] sm:text-[26px]";
  return "text-2xl sm:text-3xl";
}

export type BandoriEventSwitcherEvent = {
  id: number;
  name: string;
  startAt: number | null;
  endAt: number | null;
  hasCn?: boolean;
  hasJp?: boolean;
  typeLabel?: string;
  statusLabel?: string;
  statusTone?: "blue" | "emerald" | "muted";
};

type BandoriEventSwitcherProps = {
  title: string;
  events: BandoriEventSwitcherEvent[];
  selectedEventId: string;
  onSelectedEventIdChange: (eventId: string) => void;
  bannerUrl?: string;
  bannerAlt?: string;
  startText?: ReactNode;
  endText?: ReactNode;
  recommendedEventId?: string | null;
  recommendedLabel?: string;
  allowNoEvent?: boolean;
  noEventLabel?: string;
  loading?: boolean;
  server?: BandoriServer;
  onServerChange?: (server: BandoriServer) => void;
};

export default function BandoriEventSwitcher({
  title,
  events,
  selectedEventId,
  onSelectedEventIdChange,
  bannerUrl,
  bannerAlt,
  startText,
  endText,
  recommendedEventId,
  recommendedLabel,
  allowNoEvent = false,
  noEventLabel,
  loading = false,
  server,
  onServerChange,
}: BandoriEventSwitcherProps) {
  const t = useTranslations("bandori.eventSwitcher");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [failedBannerUrl, setFailedBannerUrl] = useState<string | null>(null);

  const effectiveBannerAlt = bannerAlt ?? t("bannerAlt");
  const effectiveRecommendedLabel = recommendedLabel ?? t("recommendedLabel");
  const effectiveNoEventLabel = noEventLabel ?? t("noEvent");

  const filteredEvents = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      return events;
    }
    return events.filter((event) => `${event.id} ${event.name}`.toLowerCase().includes(keyword));
  }, [events, searchQuery]);

  const handleSelect = (eventId: string) => {
    onSelectedEventIdChange(eventId);
    setIsPickerOpen(false);
    setSearchQuery("");
  };

  const showSkeleton = loading || (!allowNoEvent && events.length === 0);

  return (
    <div className="hhwx-panel relative z-20 grid grid-cols-1 gap-6 rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-8 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] xl:items-center xl:gap-10 dark:border-gray-800 dark:bg-[#131A2B]">
      <div className={cn(
        "flex min-w-0 flex-1 flex-col gap-4",
        server !== undefined && "sm:grid sm:grid-cols-[auto_minmax(280px,1fr)] sm:items-end sm:gap-x-4",
      )}>
        {server !== undefined && onServerChange ? (
          <div className="flex items-center justify-between gap-4 sm:col-start-1 sm:row-start-1 sm:block">
            <div className="text-sm font-black text-[var(--theme-color-text-default)] sm:mb-2 dark:text-slate-200">服务器</div>
            <div className="inline-grid grid-cols-4 overflow-hidden rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] shadow-xs dark:border-slate-700 dark:bg-slate-950/60">
              {BANDORI_SERVERS.map((option) => {
                const active = option === server;
                const serverCode = getBandoriServerCode(option).toUpperCase();
                const accessibleLabel = `切换到 ${serverCode} 服务器`;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    aria-label={accessibleLabel}
                    title={accessibleLabel}
                    onClick={() => onServerChange(option)}
                    className={cn(
                      "group flex h-11 w-11 items-center justify-center border-r border-[var(--theme-color-border-subtle)] transition first:rounded-l-[11px] last:rounded-r-[11px] last:border-r-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)] sm:h-10 dark:border-slate-700 dark:focus-visible:ring-[var(--theme-color-focus-ring-on-dark)]",
                      active
                        ? "bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-control-foreground-pressed)]"
                        : "hover:bg-[var(--theme-color-control-background-hover)] dark:hover:bg-slate-800",
                    )}
                  >
                    <BandoriServerIcon
                      server={option}
                      size={24}
                      isDecorative
                      className={cn(
                        "h-6 w-6 rounded-full object-contain shadow-[var(--theme-shadow-media)] transition-transform group-hover:scale-105",
                        active && "scale-105 ring-2 ring-[var(--theme-color-control-ring-pressed)] ring-offset-1 ring-offset-[var(--theme-color-surface-background)] dark:ring-offset-slate-900",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className={cn("min-h-13", server !== undefined && "sm:col-start-2 sm:row-start-1")}>
          {server !== undefined ? <div className="mb-2 text-sm font-black text-[var(--theme-color-text-default)] dark:text-slate-200">活动选择</div> : null}
          {!showSkeleton ? (
            <div className="grid w-full max-w-[492px] grid-cols-[minmax(0,1fr)_44px_44px] items-center gap-2">
              <select
                className="min-w-0 cursor-pointer truncate rounded-xl border border-[var(--theme-color-control-border-accent)] bg-[var(--theme-color-control-background)] px-4 py-2.5 text-sm font-bold text-[var(--theme-color-text-default)] shadow-xs outline-hidden transition-colors hover:bg-[var(--theme-color-surface-background)] focus:border-[var(--theme-color-control-border-accent)] focus:ring-2 focus:ring-[var(--theme-color-control-border-accent)] dark:border-gray-700/50 dark:bg-[#0C111C] dark:text-gray-300 dark:hover:bg-gray-800 dark:focus:border-[var(--theme-color-control-border-accent)] dark:focus:ring-[var(--theme-color-control-border-accent)]"
                value={selectedEventId}
                onChange={(event) => onSelectedEventIdChange(event.target.value)}
              >
                {allowNoEvent ? <option value="none">{effectiveNoEventLabel}</option> : <option disabled value="">{t("switchPastEvents")}</option>}
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {t("eventOption", { eventId: event.id, eventName: event.name })}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => recommendedEventId && onSelectedEventIdChange(recommendedEventId)}
                disabled={!recommendedEventId}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-action-secondary-background)] text-[var(--theme-color-action-secondary-foreground)] shadow-xs transition-all hover:bg-[var(--theme-color-action-secondary-background-hover)] disabled:cursor-not-allowed disabled:border-[var(--theme-color-control-border-disabled)] disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:opacity-60 disabled:hover:bg-[var(--theme-color-control-background-disabled)]"
                title={effectiveRecommendedLabel}
                aria-label={effectiveRecommendedLabel}
              >
                <History size={22} className="transition-transform duration-500 hover:-rotate-45" />
              </button>

              <Dialog.Root open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                <Dialog.Trigger asChild>
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] shadow-xs transition-all hover:border-[var(--theme-color-action-secondary-border)] hover:text-[var(--theme-color-action-secondary-foreground)] dark:border-gray-800 dark:bg-gray-900/50 dark:text-[var(--theme-color-text-muted-on-dark)] dark:hover:text-[var(--theme-color-action-secondary-foreground-on-dark)]"
                    title={t("searchAction")}
                    aria-label={t("searchAction")}
                  >
                    <Search size={22} />
                  </button>
                </Dialog.Trigger>

                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-100 bg-black/50 animate-in fade-in duration-200" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 z-101 flex max-h-[82vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-[var(--theme-color-surface-background)] shadow-[var(--theme-shadow-floating)] animate-in fade-in zoom-in-95 duration-200 dark:bg-[#131A2B]">
                    <div className="flex items-center justify-between border-b border-[var(--theme-color-border-subtle)] p-5 dark:border-gray-800">
                      <Dialog.Title className="text-xl font-bold text-[var(--theme-color-text-default)] dark:text-[var(--theme-color-text-default-on-dark)]">{t("pickerTitle")}</Dialog.Title>
                      <Dialog.Description className="sr-only">{t("searchPlaceholder")}</Dialog.Description>
                      <Dialog.Close asChild>
                        <button type="button" aria-label={t("closePicker")} className="rounded-full p-1 text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] dark:text-[var(--theme-color-text-muted-on-dark)] dark:hover:bg-gray-800">
                          <X size={22} />
                        </button>
                      </Dialog.Close>
                    </div>

                    <div className="flex gap-2 border-b border-[var(--theme-color-border-subtle)] p-4 dark:border-gray-800/50">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-color-action-secondary-foreground)] dark:text-[var(--theme-color-action-secondary-foreground-on-dark)]" size={18} />
                        <input
                          autoFocus
                          type="text"
                          placeholder={t("searchPlaceholder")}
                          className="w-full rounded-sm border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-control-background)] px-10 py-1.5 text-sm font-medium text-[var(--theme-color-text-default)] shadow-xs outline-hidden focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:bg-[#0C111C] dark:text-gray-200 dark:focus:ring-[var(--theme-color-focus-ring-on-dark)]"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                        />
                        {searchQuery ? (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            aria-label={t("clearSearch")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-[var(--theme-color-control-background-muted)] p-0.5 text-[var(--theme-color-text-muted)] dark:bg-gray-800 dark:text-[var(--theme-color-text-muted-on-dark)]"
                          >
                            <X size={14} />
                          </button>
                        ) : null}
                      </div>
                      <Dialog.Close asChild>
                        <button type="button" aria-label={t("closePicker")} className="rounded-lg border border-[var(--theme-color-action-secondary-border)] px-4 py-2 font-bold text-[var(--theme-color-action-secondary-foreground)] hover:bg-[var(--theme-color-action-secondary-background-hover)] dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                          <X size={18} />
                        </button>
                      </Dialog.Close>
                    </div>

                    <div className="flex-1 overflow-y-auto py-2">
                      {allowNoEvent ? (
                        <button
                          type="button"
                          onClick={() => handleSelect("none")}
                          className="flex w-full items-center justify-between px-6 py-3.5 text-left text-sm font-bold text-[var(--theme-color-text-muted)] transition-colors hover:bg-[var(--theme-color-control-background-hover)] dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          {effectiveNoEventLabel}
                        </button>
                      ) : null}
                      {filteredEvents.map((event) => {
                        const isCurrentEvent = String(event.id) === selectedEventId;
                        return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => handleSelect(String(event.id))}
                          aria-current={isCurrentEvent ? "true" : undefined}
                          className={cn(
                            "group flex w-full items-center justify-between gap-3 px-6 py-3.5 text-left transition-colors",
                            isCurrentEvent
                              ? "bg-[var(--theme-color-menu-item-background-current)]"
                              : "hover:bg-[var(--theme-color-control-background-hover)] dark:hover:bg-gray-800",
                          )}
                        >
                          <span className={cn("min-w-0 truncate text-sm font-bold", isCurrentEvent ? "text-[var(--theme-color-menu-item-foreground-current)]" : "text-[var(--theme-color-text-muted)] dark:text-gray-300")}>
                            {t("eventOption", { eventId: event.id, eventName: event.name })}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {event.typeLabel ? <span className="rounded-sm border border-[var(--theme-color-border-subtle)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--theme-color-text-muted)] dark:border-gray-700 dark:text-[var(--theme-color-text-muted-on-dark)]">{event.typeLabel}</span> : null}
                            {event.statusLabel ? (
                              <span
                                className={cn(
                                  "text-[11px] font-bold",
                                  event.statusTone === "emerald" && "text-[var(--theme-color-status-ongoing-foreground)] dark:text-[var(--theme-color-status-ongoing-foreground-on-dark)]",
                                  event.statusTone === "blue" && "text-[var(--theme-color-status-upcoming-foreground)] dark:text-[var(--theme-color-status-upcoming-foreground-on-dark)]",
                                  (!event.statusTone || event.statusTone === "muted") && "text-[var(--theme-color-text-muted)] dark:text-gray-400",
                                )}
                              >
                                {event.statusLabel}
                              </span>
                            ) : null}
                            {event.hasCn ? <span className="rounded-sm border border-[var(--theme-color-border-subtle)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--theme-color-text-muted)] transition-colors group-hover:border-[var(--theme-color-action-secondary-border)] group-hover:text-[var(--theme-color-action-secondary-foreground)] dark:border-gray-700 dark:text-[var(--theme-color-text-muted-on-dark)] dark:group-hover:text-[var(--theme-color-action-secondary-foreground-on-dark)]">CN</span> : null}
                            {event.hasJp ? <span className="rounded-sm border border-[var(--theme-color-border-subtle)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--theme-color-text-muted)] transition-colors group-hover:border-[var(--theme-color-action-secondary-border)] group-hover:text-[var(--theme-color-action-secondary-foreground)] dark:border-gray-700 dark:text-[var(--theme-color-text-muted-on-dark)] dark:group-hover:text-[var(--theme-color-action-secondary-foreground-on-dark)]">JP</span> : null}
                          </span>
                        </button>
                        );
                      })}
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          ) : (
            <div className="grid w-full max-w-[492px] grid-cols-[minmax(0,1fr)_44px_44px] items-center gap-2" aria-hidden="true">
              <div className="h-11 animate-pulse rounded-xl bg-[var(--theme-color-control-background-muted)] dark:bg-gray-800" />
              <div className="h-11 w-11 animate-pulse rounded-xl bg-[var(--theme-color-control-background-pressed)] dark:bg-gray-800" />
              <div className="h-11 w-11 animate-pulse rounded-xl bg-[var(--theme-color-control-background-muted)] dark:bg-gray-800" />
            </div>
          )}
        </div>

        <h1
          title={title}
          className={cn(
            "block h-10 min-w-0 w-full truncate whitespace-nowrap font-extrabold leading-10 tracking-[-0.02em] text-[var(--theme-color-heading-page-foreground)] dark:text-[var(--theme-color-text-default-on-dark)]",
            getEventTitleSizeClass(title),
            server !== undefined && "sm:col-span-2 sm:row-start-2",
          )}
        >
          {title}
        </h1>

        <div className={cn("min-h-12 text-sm font-medium text-[var(--theme-color-text-muted)] dark:text-gray-400", server !== undefined && "sm:col-span-2 sm:row-start-3")}>
          {startText || endText ? (
            <div className="grid gap-1">
              {startText ? (
                <p className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 leading-5 sm:block">
                  <span>{t("startLabel")}</span>
                  <span className="min-w-0 text-right tabular-nums sm:ml-1 sm:text-left">{startText}</span>
                </p>
              ) : null}
              {endText ? (
                <p className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 leading-5 sm:block">
                  <span>{t("endLabel")}</span>
                  <span className="min-w-0 text-right tabular-nums sm:ml-1 sm:text-left">{endText}</span>
                </p>
              ) : null}
            </div>
          ) : showSkeleton ? (
            <div className="flex flex-col gap-2 py-0.5" aria-hidden="true">
              <div className="h-4 w-48 animate-pulse rounded-full bg-[var(--theme-color-control-background-muted)] dark:bg-gray-800" />
              <div className="h-4 w-56 animate-pulse rounded-full bg-[var(--theme-color-control-background-muted)] dark:bg-gray-800" />
            </div>
          ) : (
            <>
              <p>{t("startLabel")} -</p>
              <p>{t("endLabel")} -</p>
            </>
          )}
        </div>
      </div>

      <div className="w-full max-w-[420px] xl:w-[420px] xl:justify-self-end">
        <div className="hhwx-panel-media relative aspect-3/1 w-full overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5">
          {bannerUrl && bannerUrl !== failedBannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt={effectiveBannerAlt}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              onError={() => setFailedBannerUrl(bannerUrl)}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 animate-pulse bg-[var(--theme-color-control-background-muted)] dark:bg-linear-to-br dark:from-gray-800 dark:via-gray-900 dark:to-gray-800" />
          )}
        </div>
      </div>
    </div>
  );
}
