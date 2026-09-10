"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ImageOff } from "lucide-react";

import BandoriCardTile from "@/components/bandori/BandoriCardTile";
import LoadingPlaceholder from "@/components/LoadingPlaceholder";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriCharactersMaster } from "@/hooks/useBandoriCharactersMaster";
import { resolveBandoriCardBandId } from "@/lib/bandori/cards/master";
import type { BandoriServer } from "@/lib/bandori-server";
import type { BandoriTop10Player } from "@/lib/bandori/event-tracker/top10-view";

type Top10PlayerListProps = {
  players: BandoriTop10Player[];
  server: BandoriServer;
};

export function Top10PlayerList({ players, server }: Top10PlayerListProps) {
  const locale = useLocale();
  const t = useTranslations("bandori.events.tracker.top10");
  const commonT = useTranslations("common");
  const scoreFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const shouldLoadCards = players.some((player) => player.avatarCardId > 0);
  const cardsRequest = useBandoriCardsMaster(server, shouldLoadCards, "regional");
  const charactersRequest = useBandoriCharactersMaster(shouldLoadCards);
  const { data: cards } = cardsRequest;
  const { data: characters } = charactersRequest;
  const avatarLoading = cardsRequest.loading || charactersRequest.loading;

  return (
    <section className="mt-7" aria-label={t("ranking")}>
      <div className="grid grid-cols-[2.25rem_4rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--theme-color-border-subtle)] px-2 pb-2 text-xs font-bold tracking-[0.08em] text-[var(--theme-color-text-muted)] sm:grid-cols-[3rem_5rem_minmax(0,1fr)_minmax(9rem,auto)] sm:px-3">
        <span className="text-center">{t("rank")}</span>
        <span className="sr-only">{t("avatar")}</span>
        <span>{t("player")}</span>
        <span className="text-right">{t("score")}</span>
      </div>

      <div className="divide-y divide-[var(--theme-color-border-subtle)]">
        {players.map((player) => {
          const metadata = cards?.[String(player.avatarCardId)];
          const bandId = resolveBandoriCardBandId(metadata, characters ?? {});

          return (
            <div
              key={player.uid}
              className="grid grid-cols-[2.25rem_4rem_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 sm:grid-cols-[3rem_5rem_minmax(0,1fr)_minmax(9rem,auto)] sm:px-3 sm:py-4"
            >
              <div className="flex items-center justify-center">
                <span className="text-lg font-black tabular-nums text-[var(--theme-color-text-default)]">
                  {player.position}
                </span>
              </div>

              <div className="flex items-center justify-center">
                {player.avatarCardId > 0 && avatarLoading ? (
                  <LoadingPlaceholder
                    label={commonT("states.loading")}
                    className="h-14 w-14 rounded-[5px] sm:h-[76px] sm:w-[76px]"
                  />
                ) : player.avatarCardId > 0 && metadata && characters ? (
                  <BandoriCardTile
                    interaction={{ kind: "presentation" }}
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
                    size="compact"
                    showLevel={false}
                    showPower={false}
                  />
                ) : (
                  <div className="flex h-14 w-14 flex-col items-center justify-center gap-1 overflow-hidden rounded-[5px] bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] shadow-[var(--theme-shadow-media)] outline-solid outline-1 outline-[color:var(--theme-color-border-subtle)] sm:h-[76px] sm:w-[76px]">
                    <ImageOff className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[10px] font-semibold">
                      {commonT("states.imageUnavailable")}
                    </span>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="min-w-0 whitespace-pre-line break-words text-sm font-bold leading-5 text-[var(--theme-color-text-default)] sm:text-base">
                  {player.name || "—"}
                </div>
                <div className="mt-1 whitespace-nowrap text-[10px] font-medium tabular-nums text-[var(--theme-color-text-muted)] sm:text-xs">
                  {player.uid}
                </div>
              </div>

              <div className="text-right">
                <span className="block text-sm font-black tabular-nums text-[var(--theme-color-text-default)] sm:text-lg">
                  {scoreFormatter.format(player.score)}
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
