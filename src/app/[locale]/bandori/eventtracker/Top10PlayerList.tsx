"use client";

import { ImageOff } from "lucide-react";

import BandoriCardThumbnail from "@/components/bandori/BandoriCardThumbnail";
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
      <div className="grid grid-cols-[2.25rem_4rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200 px-2 pb-2 text-xs font-bold tracking-[0.08em] text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:grid-cols-[3rem_5rem_minmax(0,1fr)_minmax(9rem,auto)] sm:px-3">
        <span className="text-center">排名</span>
        <span className="sr-only">头像</span>
        <span>玩家</span>
        <span className="text-right">分数</span>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-700/80">
        {players.map((player) => {
          const metadata = cards?.[String(player.avatarCardId)];
          const bandId = resolveBandoriCardBandId(metadata, characters ?? {});

          return (
            <div
              key={player.uid}
              className="grid grid-cols-[2.25rem_4rem_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 sm:grid-cols-[3rem_5rem_minmax(0,1fr)_minmax(9rem,auto)] sm:px-3 sm:py-4"
            >
              <div className="flex items-center justify-center">
                <span className="text-lg font-black tabular-nums text-slate-700 dark:text-slate-100">
                  {player.position}
                </span>
              </div>

              <div className="aspect-square w-16 overflow-hidden rounded-[7px] shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:w-20">
                {player.avatarCardId > 0 ? (
                  <BandoriCardThumbnail
                    card={{
                      cardId: player.avatarCardId,
                      level: 1,
                      masterRank: 0,
                      skillLevel: 1,
                      isTrained: player.isAvatarTrained,
                      hasTrainedArt: metadata?.hasTrainedArt,
                    }}
                    metadata={metadata ?? undefined}
                    bandId={bandId}
                    alt={player.name || String(player.uid)}
                    loading="lazy"
                    showLevel={false}
                    showPower={false}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    <ImageOff className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[10px] font-semibold">无头像</span>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="min-w-0 whitespace-pre-line break-words text-sm font-bold leading-5 text-slate-800 dark:text-slate-100 sm:text-base">
                  {player.name || "—"}
                </div>
                <div className="mt-1 whitespace-nowrap text-[10px] font-medium tabular-nums text-slate-500 dark:text-slate-400 sm:text-xs">
                  {player.uid}
                </div>
              </div>

              <div className="text-right">
                <span className="block text-sm font-black tabular-nums text-slate-800 dark:text-slate-100 sm:text-lg">
                  {player.score.toLocaleString("zh-CN")}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 sm:text-xs">P</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
