import type { Metadata } from "next";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import SongDetailPageClient, {
  type SongDetailDifficultyOption,
  type SongDetailRegionalTextSlots,
} from "./SongDetailPageClient";
import {
  BANDORI_CHART_DIFFICULTIES,
  isBandoriChartDifficulty,
  type BandoriChartDifficulty,
} from "@/lib/bandori-master-contract";
import { readBandoriMusicApiDetail } from "@/lib/bandori-music-api-server";
import { readBandoriMusicIndex } from "@/lib/bandori-music-assets";
import {
  buildBandoriPublicAssetUrl,
  type BandoriMusicDifficultyIndex,
} from "@/lib/bandori-public-asset-index";
import { pickBandoriRegionalText, type BandoriServer } from "@/lib/bandori-server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BandoriSongDetailPageProps = {
  params: Promise<{ locale: string; songId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type UnknownRecord = Record<string, unknown>;
const SONG_ID_PATTERN = /^[1-9]\d*$/u;
const readSongDetail = cache(readBandoriMusicApiDetail);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSongId(value: string): number | null {
  if (!SONG_ID_PATTERN.test(value)) return null;
  const songId = Number(value);
  return Number.isSafeInteger(songId) ? songId : null;
}

function difficultyIndex(difficulty: BandoriChartDifficulty): BandoriMusicDifficultyIndex {
  return String(BANDORI_CHART_DIFFICULTIES.indexOf(difficulty)) as BandoriMusicDifficultyIndex;
}

function regionalTextSlots(value: unknown): SongDetailRegionalTextSlots {
  const values = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((index) => (
    typeof values[index] === "string" && values[index].trim() ? values[index].trim() : null
  )) as SongDetailRegionalTextSlots;
}

function difficultyRecord(
  music: UnknownRecord,
  difficulty: BandoriChartDifficulty,
  server?: BandoriServer,
): UnknownRecord | null {
  const index = difficultyIndex(difficulty);
  const base = isRecord(music.difficulty) && isRecord(music.difficulty[index])
    ? music.difficulty[index]
    : null;
  if (server === undefined || !Array.isArray(music.serverExtensions)) return base;
  const extension = music.serverExtensions[server];
  const regional = isRecord(extension) && isRecord(extension.difficulty)
    ? extension.difficulty[index]
    : null;
  return isRecord(regional) ? regional : base;
}

function playLevelSlots(
  music: UnknownRecord,
  difficulty: BandoriChartDifficulty,
): SongDetailDifficultyOption["playLevels"] {
  return [0, 1, 2, 3].map((server) => {
    const value = difficultyRecord(music, difficulty, server as BandoriServer)?.playLevel;
    return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null;
  }) as SongDetailDifficultyOption["playLevels"];
}

function preferredMetadataServer(locale: string): BandoriServer {
  return locale === "en" ? 1 : 3;
}

export async function generateMetadata({
  params,
}: Pick<BandoriSongDetailPageProps, "params">): Promise<Metadata> {
  const { locale, songId: rawSongId } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.songs" });
  const songId = parseSongId(rawSongId);
  if (songId === null) return { title: buildSiteMetadataTitle(t("title")) };
  const song = await readSongDetail(String(songId));
  const songTitle = pickBandoriRegionalText(
    Array.isArray(song?.musicTitle) ? song.musicTitle : null,
    preferredMetadataServer(locale),
  );
  return {
    title: buildSiteMetadataTitle(songTitle ? t("detailTitle", { songTitle }) : t("title")),
  };
}

export default async function BandoriSongDetailPage({
  params,
  searchParams,
}: BandoriSongDetailPageProps) {
  const [{ songId: rawSongId }, query] = await Promise.all([params, searchParams]);
  const songId = parseSongId(rawSongId);
  if (songId === null) notFound();
  const rawDifficulty = query.difficulty;
  if (
    rawDifficulty !== undefined
    && (typeof rawDifficulty !== "string" || !isBandoriChartDifficulty(rawDifficulty))
  ) {
    notFound();
  }

  const [music, musicIndex] = await Promise.all([
    readSongDetail(String(songId)),
    readBandoriMusicIndex(),
  ]);
  const assets = musicIndex.songs[String(songId)];
  if (!music || !assets) notFound();

  const difficulties = BANDORI_CHART_DIFFICULTIES.flatMap((difficulty) => {
    const index = difficultyIndex(difficulty);
    const chart = assets.files.charts[index];
    if (!chart || !difficultyRecord(music, difficulty)) return [];
    const notes = assets.notes[index];
    const bpmSegments = assets.bpm[index];
    if (!Number.isSafeInteger(notes) || !Array.isArray(bpmSegments) || bpmSegments.length === 0) {
      throw new Error(`Bandori song detail metadata is inconsistent: ${songId}:${difficulty}`);
    }
    return [{
      difficulty,
      playLevels: playLevelSlots(music, difficulty),
      notes: notes as number,
      bpmValues: [...new Set(bpmSegments.map((segment) => segment.bpm))],
    } satisfies SongDetailDifficultyOption];
  });
  if (difficulties.length === 0) notFound();

  const selectedDifficulty: BandoriChartDifficulty | undefined =
    typeof rawDifficulty === "string" ? rawDifficulty : difficulties.at(-1)?.difficulty;
  const selected = difficulties.find((option) => option.difficulty === selectedDifficulty);
  if (!selectedDifficulty || !selected) notFound();

  return (
    <SongDetailPageClient
      songId={songId}
      titleSlots={regionalTextSlots(music.musicTitle)}
      bandNameSlots={regionalTextSlots(music.bandName)}
      artworkUrl={buildBandoriPublicAssetUrl(assets.files.jacket)}
      difficulties={difficulties}
      selectedDifficulty={selectedDifficulty}
      simulator={{
        songId,
        difficulties: difficulties.map(({ difficulty, notes }) => ({
          difficulty,
          chartUrl: `/api/bandori/charts/${songId}/${difficulty}`,
          expectedCombo: notes,
        })),
        audioUrl: buildBandoriPublicAssetUrl(assets.files.audio),
        durationSeconds: assets.length,
      }}
    />
  );
}
