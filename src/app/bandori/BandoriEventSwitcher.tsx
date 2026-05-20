"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { History, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
};

export default function BandoriEventSwitcher({
  title,
  events,
  selectedEventId,
  onSelectedEventIdChange,
  bannerUrl,
  bannerAlt = "活动横幅",
  startText,
  endText,
  recommendedEventId,
  recommendedLabel = "最新活动",
  allowNoEvent = false,
  noEventLabel = "无活动",
  loading = false,
}: BandoriEventSwitcherProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
    <div className="relative z-20 grid grid-cols-1 gap-6 rounded-3xl border border-[#ffe16c]/95 bg-[#fffef0]/96 p-4 shadow-[0_26px_68px_rgba(232,176,0,0.18),0_4px_18px_rgba(88,69,0,0.08)] dark:border-gray-800 dark:bg-[#131A2B] dark:shadow-blue-500/10 sm:p-8 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] xl:items-center xl:gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <h1 className="block min-h-[4rem] w-full text-3xl font-extrabold leading-tight text-[#f43f5e] md:min-h-[3rem]">
          {title}
        </h1>

        <div className="min-h-[3.25rem]">
          {!showSkeleton ? (
            <div className="grid w-full max-w-[492px] grid-cols-[minmax(0,1fr)_44px_44px] items-center gap-2">
              <select
                className="min-w-0 cursor-pointer truncate rounded-xl border border-[#ff3b6b] bg-white/90 px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm outline-none transition-colors hover:bg-white focus:ring-2 focus:ring-[#f43f5e] dark:border-gray-700/50 dark:bg-[#0C111C] dark:text-gray-300 dark:hover:bg-gray-800"
                value={selectedEventId}
                onChange={(event) => onSelectedEventIdChange(event.target.value)}
              >
                {allowNoEvent ? <option value="none">{noEventLabel}</option> : <option disabled value="">切换往期活动...</option>}
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.id}期 : {event.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => recommendedEventId && onSelectedEventIdChange(recommendedEventId)}
                disabled={!recommendedEventId}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200/50 bg-blue-50 text-blue-600 shadow-sm transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
                title={recommendedLabel}
                aria-label={recommendedLabel}
              >
                <History size={22} className="transition-transform duration-500 hover:rotate-[-45deg]" />
              </button>

              <Dialog.Root open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                <Dialog.Trigger asChild>
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500 shadow-sm transition-all hover:border-blue-300 hover:text-blue-500 dark:border-gray-800 dark:bg-gray-900/50"
                    title="搜索活动"
                    aria-label="搜索活动"
                  >
                    <Search size={22} />
                  </button>
                </Dialog.Trigger>

                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/50 animate-in fade-in duration-200" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] flex max-h-[82vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 dark:bg-[#131A2B]">
                    <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-gray-800">
                      <Dialog.Title className="text-xl font-bold text-gray-800 dark:text-white">选择活动</Dialog.Title>
                      <Dialog.Close asChild>
                        <button type="button" className="rounded-full p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                          <X size={22} />
                        </button>
                      </Dialog.Close>
                    </div>

                    <div className="flex gap-2 border-b border-gray-50 p-4 dark:border-gray-800/50">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" size={18} />
                        <input
                          autoFocus
                          type="text"
                          placeholder="搜索活动名或 ID"
                          className="w-full rounded border border-blue-400 bg-white px-10 py-1.5 text-sm font-medium text-gray-700 shadow-[0_0_8px_rgba(59,130,246,0.3)] outline-none dark:border-blue-500 dark:bg-[#0C111C] dark:text-gray-200"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                        />
                        {searchQuery ? (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-gray-200 p-0.5 text-gray-500 dark:bg-gray-800"
                          >
                            <X size={14} />
                          </button>
                        ) : null}
                      </div>
                      <Dialog.Close asChild>
                        <button type="button" className="rounded-lg border border-gray-200 px-4 py-2 font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                          <X size={18} />
                        </button>
                      </Dialog.Close>
                    </div>

                    <div className="flex-1 overflow-y-auto py-2">
                      {allowNoEvent ? (
                        <button
                          type="button"
                          onClick={() => handleSelect("none")}
                          className="flex w-full items-center justify-between px-6 py-3.5 text-left text-sm font-bold text-gray-600 transition-colors hover:bg-blue-50/50 dark:text-gray-300 dark:hover:bg-blue-500/5"
                        >
                          {noEventLabel}
                        </button>
                      ) : null}
                      {filteredEvents.map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => handleSelect(String(event.id))}
                          className="group flex w-full items-center justify-between gap-3 px-6 py-3.5 text-left transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-500/5"
                        >
                          <span className={cn("min-w-0 truncate text-sm font-bold", String(event.id) === selectedEventId ? "text-blue-500" : "text-gray-600 dark:text-gray-300")}>
                            {event.id}期 : {event.name}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {event.typeLabel ? <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-400 dark:border-gray-700">{event.typeLabel}</span> : null}
                            {event.statusLabel ? (
                              <span
                                className={cn(
                                  "text-[11px] font-bold",
                                  event.statusTone === "emerald" && "text-emerald-500",
                                  event.statusTone === "blue" && "text-blue-500",
                                  (!event.statusTone || event.statusTone === "muted") && "text-gray-400",
                                )}
                              >
                                {event.statusLabel}
                              </span>
                            ) : null}
                            {event.hasCn ? <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-400 transition-colors group-hover:border-blue-200 group-hover:text-blue-500 dark:border-gray-700">CN</span> : null}
                            {event.hasJp ? <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-400 transition-colors group-hover:border-blue-200 group-hover:text-blue-500 dark:border-gray-700">JP</span> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          ) : (
            <div className="grid w-full max-w-[492px] grid-cols-[minmax(0,1fr)_44px_44px] items-center gap-2" aria-hidden="true">
              <div className="h-11 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
              <div className="h-11 w-11 animate-pulse rounded-xl bg-blue-50 dark:bg-blue-900/20" />
              <div className="h-11 w-11 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
            </div>
          )}
        </div>

        <div className="min-h-[3rem] text-sm font-medium text-gray-500 dark:text-gray-400">
          {startText || endText ? (
            <>
              {startText ? <p>开始: {startText}</p> : null}
              {endText ? <p>结束: {endText}</p> : null}
            </>
          ) : showSkeleton ? (
            <div className="flex flex-col gap-2 py-0.5" aria-hidden="true">
              <div className="h-4 w-48 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-56 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
            </div>
          ) : (
            <>
              <p>开始: -</p>
              <p>结束: -</p>
            </>
          )}
        </div>
      </div>

      <div className="w-full max-w-[420px] xl:w-[420px] xl:justify-self-end">
        <div className="relative aspect-[3/1] w-full overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt={bannerAlt}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-100 via-gray-50 to-gray-200 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800" />
          )}
        </div>
      </div>
    </div>
  );
}
