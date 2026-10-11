"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import PageShell from "@/components/PageShell";
import LoadingIndicator from "@/components/LoadingIndicator";
import { DetailRow } from "@/components/DetailLayout";
import { SongDetailHeader, SongDetailTabs, SongStatistics, SongDifficultyControls } from "@/components/SongDetailLayout";
import { useOurNotesMusicAssetIndex } from "@/hooks/useOurNotesMaster";
import { useOurNotesPreferencesStore, useOurNotesPreferredServer } from "@/store/useServerPreferencesStore";
import { OURNOTES_SERVERS, pickAvailableOurNotesServer } from "@/lib/ournotes/server";
import { ourNotesMusicImageUrl } from "@/lib/ournotes/music/assets";
import { buildOurNotesMusicPlayerItem } from "@/lib/ournotes-music-player";
import { ourNotesAttributeIcon } from "@/lib/ournotes/cards/assets";
import { CARD_TYPES, GEKISOU_MISSION_TYPES } from "@/lib/ournotes/api-enums";
import type { OurNotesSongDetail } from "@/lib/ournotes/music/catalog";

export default function SongDetailPageClient({ songId, detail }: { songId: number; detail: OurNotesSongDetail }) {
  const t = useTranslations("ournotes.songs");
  const commonT = useTranslations("common");
  const cardT = useTranslations("ournotes.cards");
  const query = useSearchParams().toString();
  const preferred = useOurNotesPreferredServer();
  const hydrated = useOurNotesPreferencesStore((state) => state.hydrated);
  const images = useOurNotesMusicAssetIndex();
  const server = pickAvailableOurNotesServer(OURNOTES_SERVERS.filter((slot) => detail.regions[slot] !== null), preferred);
  const region = server === null ? null : detail.regions[server];
  const selected = region?.charts.find((chart) => chart.difficulty === new URLSearchParams(query).get("difficulty")) ?? region?.charts.at(-1);
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(query);
    const previous = params.toString();
    params.delete("server"); params.delete("view");
    if (params.has("difficulty")) {
      if (selected) params.set("difficulty", selected.difficulty); else params.delete("difficulty");
    }
    if (params.toString() !== previous) window.history.replaceState(null, "", window.location.pathname + (params.size ? `?${params}` : "") + window.location.hash);
  }, [hydrated, query, selected]);
  if (!hydrated || !region) return <PageShell contentClassName="max-w-6xl"><LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-64 border" /></PageShell>;
  const title = region.title || t("unknownTitle", { songId });
  const attributeId = CARD_TYPES.findIndex((value) => value === region.attribute);
  const attributeIcon = ourNotesAttributeIcon(attributeId);
  const attributeLabel = attributeId > 0 ? cardT(`attributes.${attributeId}`) : region.attribute === null ? "—"
    : region.attribute === "None" || region.attribute === "All" ? t(`missions.${region.attribute}`) : t("unknownValue", { value: String(region.attribute) });
  return <PageShell contentClassName="max-w-6xl">
    <SongDetailHeader title={title} bandName={region.bandName || t("unknownBand")} idLabel={t("songId", { songId })}
      artworkUrl={ourNotesMusicImageUrl(images.value, songId, "jacket")} artworkLoading={images.loading}
      track={buildOurNotesMusicPlayerItem({ songId, title, artist: region.bandName, assetIndex: images.value })} playbackLoading={images.loading}
      difficulties={region.charts.map((chart) => ({ difficulty: chart.difficulty, label: t(`difficulties.${chart.difficulty}`), level: chart.level }))}
      labels={{ artwork: t("artworkAlt", { title }), unavailable: commonT("states.imageUnavailable"), loading: t("states.loading") }} />
    {images.error ? <div role="alert" className="hhwx-catalog-error rounded-2xl border p-5 text-sm font-bold">
      {commonT(images.value ? "states.refreshFailed" : "states.loadFailed")}{" "}<button type="button" className="hhwx-text-link" onClick={images.refresh}>{commonT("actions.retry")}</button>
    </div> : null}
    <SongDetailTabs value="info" simulatorDisabled labels={{ label: t("detail.view.label"), info: t("detail.view.info"), simulator: t("detail.view.simulator"), unavailable: t("detail.simulatorUnavailable") }} />
    <div id="song-panel-info" role="tabpanel" aria-labelledby="song-tab-info">
      <section className="hhwx-panel border p-4 sm:p-6">
        {region.charts.length ? <div className="mb-4 flex max-w-full items-center gap-2">
          <SongDifficultyControls label={t("difficultyLabel")} value={selected?.difficulty ?? null}
            options={region.charts.map((chart) => ({ difficulty: chart.difficulty, label: t(`difficulties.${chart.difficulty}`) }))}
            onChange={(difficulty) => {
              const params = new URLSearchParams(window.location.search); params.set("difficulty", difficulty);
              window.history.replaceState(null, "", `${window.location.pathname}?${params}${window.location.hash}`);
            }} />
        </div> : null}
        <SongStatistics level={selected?.level ?? null} notes={selected?.combo ?? null} bpmValues={selected?.bpmValues ?? []} durationSeconds={detail.durationSeconds}
          labels={{ level: t("stats.level"), notes: t("stats.notes"), bpm: t("stats.bpm"), duration: t("stats.duration") }} />
        <dl className="mt-4">
          <DetailRow label={t("detail.attribute")} alignment="center"><span className="inline-flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {attributeIcon ? <img src={attributeIcon} alt="" className="h-7 w-7 object-contain" /> : null}{attributeLabel}
          </span></DetailRow>
          {region.missions.map((mission, index) => <DetailRow key={index} label={t("detail.mission", { slot: index + 1 })}>
            {mission === null ? "—" : (GEKISOU_MISSION_TYPES as readonly (string | number)[]).includes(mission)
              ? t(`missions.${mission}`) : t("unknownValue", { value: String(mission) })}
          </DetailRow>)}
        </dl>
      </section>
    </div>
    <div id="song-panel-simulator" role="tabpanel" aria-labelledby="song-tab-simulator" hidden />
  </PageShell>;
}
