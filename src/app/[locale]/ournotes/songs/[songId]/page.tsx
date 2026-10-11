import { cache } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { readOurNotesMusicDetail } from "@/lib/ournotes/music/api-server";
import { buildOurNotesSongDetail, isOurNotesSongDifficulty } from "@/lib/ournotes/music/catalog";
import { OURNOTES_SERVERS, pickAvailableOurNotesServer } from "@/lib/ournotes/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";
import SongDetailPageClient from "./SongDetailPageClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Props = { params: Promise<{ locale: string; songId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const readSong = cache(async (id: string) => {
  const music = await readOurNotesMusicDetail(id);
  return music ? buildOurNotesSongDetail(music) : null;
});
function validId(id: string) { return /^[1-9]\d*$/u.test(id) && Number.isSafeInteger(Number(id)); }

export async function generateMetadata({ params }: Props) {
  const { locale, songId } = await params;
  const t = await getTranslations({ locale, namespace: "ournotes.songs" });
  const detail = validId(songId) ? await readSong(songId) : null;
  const server = detail ? pickAvailableOurNotesServer(OURNOTES_SERVERS.filter((slot) => detail.regions[slot] !== null), locale === "en" ? 1 : 3) : null;
  const title = server === null ? "" : detail?.regions[server]?.title;
  return { title: buildSiteMetadataTitle(title ? t("detailTitle", { title }) : t("page.title")) };
}

export default async function OurNotesSongPage({ params, searchParams }: Props) {
  const [{ songId }, query] = await Promise.all([params, searchParams]);
  if (!validId(songId)) notFound();
  const difficulty = query.difficulty;
  if (difficulty !== undefined && (typeof difficulty !== "string" || !isOurNotesSongDifficulty(difficulty))) notFound();
  const detail = await readSong(songId);
  if (!detail || !detail.regions.some(Boolean)) notFound();
  if (difficulty !== undefined && !detail.regions.some((region) => region?.charts.some((chart) => chart.difficulty === difficulty))) notFound();
  return <SongDetailPageClient key={songId} songId={Number(songId)} detail={detail} />;
}
