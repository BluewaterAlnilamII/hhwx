import { cache } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isOurNotesCardKind } from "@/lib/ournotes/cards/api-contract";
import { readOurNotesCard } from "@/lib/ournotes/cards/api-server";
import { OURNOTES_SERVERS, ourNotesCardTitle } from "@/lib/ournotes/cards/catalog";
import { getOurNotesServerFromCode } from "@/lib/ournotes/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";
import CardDetailPageClient from "./CardDetailPageClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Props = { params: Promise<{ locale: string; kind: string; cardId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const readCard = cache(readOurNotesCard);
function validId(id: string) { return /^[1-9]\d*$/u.test(id) && Number.isSafeInteger(Number(id)); }

export async function generateMetadata({ params, searchParams }: Props) {
  const [{ locale, kind, cardId }, query] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale, namespace: "ournotes.cards" });
  const card = isOurNotesCardKind(kind) && validId(cardId) ? await readCard(kind, cardId) : null;
  const server = getOurNotesServerFromCode(query.server);
  return { title: buildSiteMetadataTitle(card && server !== null && card.serverExtensions?.[server] != null
    ? `${ourNotesCardTitle(card, server) || t("kinds." + kind)} #${cardId}` : t("title")) };
}
export default async function OurNotesCardPage({ params }: Props) {
  const { kind, cardId } = await params;
  if (!isOurNotesCardKind(kind) || !validId(cardId)) notFound();
  const card = await readCard(kind, cardId);
  if (!card || !OURNOTES_SERVERS.some((server) => card.serverExtensions?.[server] != null)) notFound();
  return <CardDetailPageClient key={`${kind}-${cardId}`} kind={kind} cardId={cardId} card={card} />;
}
