import { redirect } from "next/navigation";
import CardDetailPageClient from "./CardDetailPageClient";
import CardDetailPreferredServerResolver from "./CardDetailPreferredServerResolver";
import { buildLocalizedPathname, normalizeLocale } from "@/i18n/routing";
import {
  isKnownBandoriCardEntityCollision,
  materializeBandoriCardForServer,
} from "@/lib/bandori/cards/regional-extensions";
import { readBandoriCardApiDetail } from "@/lib/bandori/cards/api-server";
import {
  BANDORI_SERVERS,
  getBandoriServerCode,
  getBandoriServerFromCode,
  type BandoriServer,
} from "@/lib/bandori-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BandoriCardDetailPageProps = {
  params: Promise<{ locale: string; cardId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildCardsIndexPath(locale: string, cardId: string): string {
  const path = buildLocalizedPathname("/bandori/cards", normalizeLocale(locale));
  return `${path}?id=${encodeURIComponent(cardId)}`;
}

function buildCardDetailPath(locale: string, cardId: string, server: BandoriServer): string {
  const path = buildLocalizedPathname(`/bandori/cards/${cardId}`, normalizeLocale(locale));
  return `${path}?server=${getBandoriServerCode(server)}`;
}

export default async function BandoriCardDetailPage({
  params,
  searchParams,
}: BandoriCardDetailPageProps) {
  const [{ locale, cardId }, query] = await Promise.all([params, searchParams]);
  if (!/^[1-9]\d*$/u.test(cardId)) {
    redirect(buildCardsIndexPath(locale, cardId));
  }

  const canonicalCard = await readBandoriCardApiDetail(cardId);
  if (!canonicalCard) {
    redirect(buildCardsIndexPath(locale, cardId));
  }

  const rawServer = typeof query.server === "string" ? query.server : null;
  const requestedServer = getBandoriServerFromCode(rawServer);
  const isCollision = isKnownBandoriCardEntityCollision(cardId);
  if (isCollision && requestedServer !== 1 && requestedServer !== 3) {
    redirect(buildCardsIndexPath(locale, cardId));
  }

  const availableServers = isCollision
    ? [requestedServer as BandoriServer]
    : BANDORI_SERVERS.filter(
        (server) => materializeBandoriCardForServer(canonicalCard, server) !== null,
      );
  if (availableServers.length === 0) {
    redirect(buildCardsIndexPath(locale, cardId));
  }
  if (requestedServer === null || !availableServers.includes(requestedServer)) {
    return (
      <CardDetailPreferredServerResolver
        cardId={Number(cardId)}
        availableServers={availableServers}
      />
    );
  }

  const selectedServer = requestedServer;
  if (rawServer !== getBandoriServerCode(selectedServer)) {
    redirect(buildCardDetailPath(locale, cardId, selectedServer));
  }

  const currentCard = materializeBandoriCardForServer(canonicalCard, selectedServer);
  const jpCard = selectedServer === 0
    ? currentCard
    : materializeBandoriCardForServer(canonicalCard, 0);
  if (!currentCard) {
    redirect(buildCardsIndexPath(locale, cardId));
  }

  return (
    <CardDetailPageClient
      cardId={Number(cardId)}
      currentCard={currentCard}
      jpCard={jpCard}
      selectedServer={selectedServer}
      availableServers={availableServers}
    />
  );
}
