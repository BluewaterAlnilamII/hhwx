"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import Heading from "@/components/Heading";
import type { MusicPlayerItem } from "@/lib/music-player-contract";
import { primeMusicPlayerLoopAudio } from "@/lib/music-player-loop-audio";
import { useMusicPlayerStore } from "@/store/useMusicPlayerStore";

const SAMPLE_RATE = 48_000;
const FALCOM_MUSIC_BASE_URL = "https://cdn.hhwx.org/hhwx/music/falcom-sound-team-jdk";
const FALCOM_ARTIST = "Falcom Sound Team jdk";
const COMPOSER_CREDITS: Record<string, string> = {
  ed6210: "宇仁菅孝宏",
  ed6304: "石橋渡 / 古口駿太郎",
  ed6305: "石橋渡 / 神藤由東大 / 宇仁菅孝宏",
  ed6425: "宇仁菅孝宏",
  ed6550: "石橋渡 / 神藤由東大 / 宇仁菅孝宏",
  ed6105: "園田隼人",
};
const TRACKS: MusicPlayerItem[] = [
  {
    id: "falcom:ed6210",
    provider: "falcom",
    providerTrackId: "ed6210",
    title: "空を見上げて",
    artist: FALCOM_ARTIST,
    sourceUrl: `${FALCOM_MUSIC_BASE_URL}/${encodeURIComponent("ed6210_空を見上げて_v2.mp3")}`,
    artworkUrl: null,
    durationSeconds: 160.709021,
    loop: { startSeconds: 1_012_726 / SAMPLE_RATE, endSeconds: 6_895_279 / SAMPLE_RATE },
  },
  {
    id: "falcom:ed6304",
    provider: "falcom",
    providerTrackId: "ed6304",
    title: "レイストン要塞",
    artist: FALCOM_ARTIST,
    sourceUrl: `${FALCOM_MUSIC_BASE_URL}/${encodeURIComponent("ed6304_レイストン要塞_v1.mp3")}`,
    artworkUrl: null,
    durationSeconds: 149.252042,
    loop: { startSeconds: 372_713 / SAMPLE_RATE, endSeconds: 6_575_880 / SAMPLE_RATE },
  },
  {
    id: "falcom:ed6305",
    provider: "falcom",
    providerTrackId: "ed6305",
    title: "虚ろなる光の封土",
    artist: FALCOM_ARTIST,
    sourceUrl: `${FALCOM_MUSIC_BASE_URL}/${encodeURIComponent("ed6305_虚ろなる光の封土_v1.mp3")}`,
    artworkUrl: null,
    durationSeconds: 297.797625,
    loop: { startSeconds: 560_513 / SAMPLE_RATE, endSeconds: 13_575_535 / SAMPLE_RATE },
  },
  {
    id: "falcom:ed6425",
    provider: "falcom",
    providerTrackId: "ed6425",
    title: "Fateful confrontation",
    artist: FALCOM_ARTIST,
    sourceUrl: `${FALCOM_MUSIC_BASE_URL}/${encodeURIComponent("ed6425_Fateful confrontation_v1.mp3")}`,
    artworkUrl: null,
    durationSeconds: 171.947563,
    loop: { startSeconds: 516_132 / SAMPLE_RATE, endSeconds: 7_432_452 / SAMPLE_RATE },
  },
  {
    id: "falcom:ed6550",
    provider: "falcom",
    providerTrackId: "ed6550",
    title: "銀の意志 Super Arrange Ver.",
    artist: FALCOM_ARTIST,
    sourceUrl: `${FALCOM_MUSIC_BASE_URL}/${encodeURIComponent("ed6550_銀の意志 Super Arrange Ver._v2.mp3")}`,
    artworkUrl: null,
    durationSeconds: 181.12,
    loop: { startSeconds: 2_163_672 / SAMPLE_RATE, endSeconds: 8_252_796 / SAMPLE_RATE },
  },
  {
    id: "falcom:ed6105",
    provider: "falcom",
    providerTrackId: "ed6105",
    title: "陽だまりにて和む猫(Original)",
    artist: FALCOM_ARTIST,
    sourceUrl: `${FALCOM_MUSIC_BASE_URL}/${encodeURIComponent("ed6105_陽だまりにて和む猫(Original)_v1.mp3")}`,
    artworkUrl: null,
    durationSeconds: 167.2275,
    loop: { startSeconds: 362_976 / SAMPLE_RATE, endSeconds: 7_491_584 / SAMPLE_RATE },
  },
];

export default function TestFeaturesPanel() {
  const t = useTranslations("testFeatures");
  const playerT = useTranslations("navigation.toolbar.player");
  const playQueueFromStart = useMusicPlayerStore((state) => state.playQueueFromStart);

  return (
    <section className="hhwx-panel border px-4 py-5 sm:p-6" aria-labelledby="test-features-title">
      <Heading as="h1" visualRole="page" id="test-features-title">{t("title")}</Heading>

      <section className="mt-5" aria-labelledby="seamless-loop-title">
        <Heading as="h2" visualRole="section" id="seamless-loop-title" className="mb-2 break-words">
          {t("seamlessLoopTitle")}
        </Heading>
        <p className="mb-4 text-sm text-[var(--theme-color-text-muted)]">{t("instruction")}</p>
        <div className="divide-y divide-[var(--theme-color-border-subtle)]">
          {TRACKS.map((track, index) => (
            <div key={track.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="text-base font-semibold text-[var(--theme-color-text-default)]">{track.title}</div>
                <div className="mt-1 text-sm text-[var(--theme-color-text-muted)]">
                  {t("composer", { name: `${FALCOM_ARTIST} / ${COMPOSER_CREDITS[track.providerTrackId]}` })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  primeMusicPlayerLoopAudio();
                  playQueueFromStart(TRACKS, index);
                }}
                aria-label={playerT("playSong", { title: track.title })}
                className="hhwx-action-accent inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm transition hover:scale-105"
              >
                <Play className="ml-px h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
