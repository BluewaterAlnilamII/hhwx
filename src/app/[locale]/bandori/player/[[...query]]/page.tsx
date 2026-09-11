import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";
import { getBandoriServerFromCode } from "@/lib/bandori-server";
import PlayerSearchClient from "../PlayerSearchClient";

type Props = { params: Promise<{ locale: string; query?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bandori.player" });
  return { title: buildSiteMetadataTitle(t("title")), robots: { index: false, follow: true } };
}

export default async function PlayerSearchPage({ params }: Props) {
  const { query = [] } = await params;
  if (query.length && (query.length !== 2 || getBandoriServerFromCode(query[0]) === null)) notFound();
  return <PlayerSearchClient key={query.join("/")} initialServer={getBandoriServerFromCode(query[0]) ?? 3} initialUid={query[1] ?? ""} />;
}
