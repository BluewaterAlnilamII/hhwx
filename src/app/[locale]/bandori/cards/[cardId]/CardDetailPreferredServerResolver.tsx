"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  getBandoriServerCode,
  pickAvailableBandoriServer,
  type BandoriServer,
} from "@/lib/bandori-server";
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
      `/bandori/cards/${cardId}?server=${getBandoriServerCode(selectedServer)}`,
    );
  }, [cardId, hydrated, router, selectedServer]);

  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <article
        aria-busy="true"
        className="min-h-96 animate-pulse rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-6 dark:border-slate-700 dark:bg-[#111827]"
      >
        <div className="h-5 w-32 rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="mt-7 h-9 w-full max-w-xl rounded-xl bg-slate-200 dark:bg-slate-700" />
        <div className="mt-8 h-64 rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </article>
    </BandoriPageShell>
  );
}
