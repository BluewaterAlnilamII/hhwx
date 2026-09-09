"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  pickAvailableBandoriServer,
  type BandoriServer,
} from "@/lib/bandori-server";
import { buildBandoriCardDetailHref } from "@/lib/bandori/cards/detail-url";
import { isKnownBandoriCardEntityCollision } from "@/lib/bandori/cards/regional-extensions";
import { useBandoriPreferencesStore } from "@/store/useBandoriPreferencesStore";
import BandoriPageShell from "../../BandoriPageShell";

type CardDetailPreferredServerResolverProps = {
  cardId: number;
  availableServers: readonly BandoriServer[];
};

export default function CardDetailPreferredServerResolver({
  cardId,
  availableServers,
}: CardDetailPreferredServerResolverProps) {
  const router = useRouter();
  const preferredServer = useBandoriPreferencesStore((state) => state.preferredServer);
  const hydrated = useBandoriPreferencesStore((state) => state.hydrated);
  const hydratePreferredServer = useBandoriPreferencesStore(
    (state) => state.hydratePreferredServer,
  );
  const selectedServer = pickAvailableBandoriServer(availableServers, preferredServer);

  useEffect(() => {
    if (!hydrated) {
      hydratePreferredServer();
    }
  }, [hydratePreferredServer, hydrated]);

  useEffect(() => {
    if (!hydrated || selectedServer === null) {
      return;
    }
    router.replace(
      buildBandoriCardDetailHref(`/bandori/cards/${cardId}`, {
        server: selectedServer,
        commentPage: isKnownBandoriCardEntityCollision(cardId) ? null : undefined,
        commentId: isKnownBandoriCardEntityCollision(cardId) ? null : undefined,
      }),
    );
  }, [cardId, hydrated, router, selectedServer]);

  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <article
        aria-busy="true"
        className="hhwx-panel min-h-96 animate-pulse border p-4 sm:p-6"
      >
        <div className="h-5 w-32 rounded-lg bg-[var(--theme-color-control-background-muted)]" />
        <div className="mt-7 h-9 w-full max-w-xl rounded-xl bg-[var(--theme-color-control-background)]" />
        <div className="mt-8 h-64 rounded-2xl bg-[var(--theme-color-control-background-muted)]" />
      </article>
    </BandoriPageShell>
  );
}
