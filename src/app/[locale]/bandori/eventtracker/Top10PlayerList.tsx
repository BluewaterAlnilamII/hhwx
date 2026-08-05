"use client";

import { ImageOff } from "lucide-react";

import BandoriCardTile from "@/components/bandori/BandoriCardTile";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriCharactersMaster } from "@/hooks/useBandoriCharactersMaster";
import { resolveBandoriCardBandId } from "@/lib/bandori-card-master";
import type { BandoriServer } from "@/lib/bandori-server";
import type { BandoriTop10Player } from "@/lib/bandori-top10-view";

type Top10PlayerListProps = {
  players: BandoriTop10Player[];
  server: BandoriServer;
};

export function Top10PlayerList({ players, server }: Top10PlayerListProps) {
  const shouldLoadCards = players.some((player) => player.avatarCardId > 0);
  const { data: cards } = useBandoriCardsMaster(server, shouldLoadCards, "regional");
  const { data: characters } = useBandoriCharactersMaster(shouldLoadCards);

  return (
    <section className="mt-7" aria-label="TOP10 玩家排名">
      <div className="grid grid-cols-[2.25rem_4rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--theme-color-border-subtle)] px-2 pb-2 text-xs font-bold tracking-[0.08em] text-[var(--theme-color-text-muted)] sm:grid-cols-[3rem_5rem_minmax(0,1fr)_minmax(9rem,auto)] sm:px-3 dark:border-slate-700 dark:text-slate-400">
        <span className="text-center">排名</span>
        <span className="sr-only">头像</span>
        <span>玩家</span>
        <span className="text-right">分数</span>
      </div>

      <div className="divide-y divide-[var(--theme-color-border-subtle)] dark:divide-slate-700/80">
        {players.map((player) => {
          const metadata = cards?.[String(player.avatarCardId)];
          const bandId = resolveBandoriCardBandId(metadata, characters ?? {});

          return (
            <div
              key={player.uid}
              className="grid grid-cols-[2.25rem_4rem_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 sm:grid-cols-[3rem_5rem_minmax(0,1fr)_minmax(9rem,auto)] sm:px-3 sm:py-4"
            >
              <div className="flex items-center justify-center">
                <span className="text-lg font-black tabular-nums text-[var(--theme-color-text-default)] dark:text-slate-100">
                  {player.position}
                </span>
              </div>

              <div className="flex items-center justify-center">
                {player.avatarCardId > 0 ? (
                  <BandoriCardTile
                    card={{
                      cardId: player.avatarCardId,
                      level: 1,
                      masterRank: 0,
                      skillLevel: 1,
                      isTrained: player.isAvatarTrained,
                      hasTrainedArt: metadata?.hasTrainedArt,
                      bandId,
                      totalPower: null,
                    }}
                    metadata={metadata ?? undefined}
                    cardName={player.name || String(player.uid)}
                    isPresentationOnly
                    size="compact"
                    showLevel={false}
                    showPower={false}
                  />
                ) : (
                  <div className="flex h-14 w-14 flex-col items-center justify-center gap-1 overflow-hidden rounded-[5px] bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] shadow-[0_2px_7px_rgba(15,23,42,0.22)] outline-solid outline-1 outline-[var(--theme-color-border-subtle)] sm:h-[76px] sm:w-[76px] dark:bg-slate-800 dark:text-slate-500">
                    <ImageOff className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[10px] font-semibold">无头像</span>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="min-w-0 whitespace-pre-line break-words text-sm font-bold leading-5 text-[var(--theme-color-text-default)] sm:text-base dark:text-slate-100">
                  {player.name || "—"}
                </div>
                <div className="mt-1 whitespace-nowrap text-[10px] font-medium tabular-nums text-[var(--theme-color-text-muted)] sm:text-xs dark:text-slate-400">
                  {player.uid}
                </div>
              </div>

              <div className="text-right">
                <span className="block text-sm font-black tabular-nums text-[var(--theme-color-text-default)] sm:text-lg dark:text-slate-100">
                  {player.score.toLocaleString("zh-CN")}
                </span>
                <span className="text-[10px] font-semibold text-[var(--theme-color-text-muted)] opacity-70 sm:text-xs">P</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
