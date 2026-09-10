"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import LoadingIndicator from "@/components/LoadingIndicator";
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
  const t = useTranslations("common");
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
      <LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-96 border p-4 sm:p-6" />
    </BandoriPageShell>
  );
}
