"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { FilterRow, SelectionButton } from "@/components/FilterControls";
import LoadingIndicator from "@/components/LoadingIndicator";
import SongMetaTable from "@/components/SongMetaTable";
import { useBandoriMusicMaster } from "@/hooks/useBandoriMusicMaster";
import { useBandoriSkillsMaster } from "@/hooks/useBandoriSkillsMaster";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { SESSION_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import { useBandoriPreferencesStore, useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import { parseBandoriSongsPageFilter, updateBandoriSongsQuery } from "@/lib/bandori/songs/catalog";
import { bandoriMetaSkillDescription, bandoriMetaSkillOptions, buildBandoriMetaRows, parseBandoriSongMetaResponse } from "@/lib/bandori/songs/meta";
import { bandoriMetaPreferencesQuery, readBandoriMetaPreferences, resolveBandoriMetaPreferences, writeBandoriMetaPreferences, type BandoriMetaPreferences } from "@/lib/bandori/songs/meta-preferences";
import BandoriSongFilterControls from "./BandoriSongFilterControls";

const subscribeToHydration = () => () => {};
function navigate(query: string) {
  window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
}

export default function BandoriSongMeta() {
  const t = useTranslations("bandori.songs.meta"), commonT = useTranslations("common");
  const server = useBandoriPreferredServer(), hydrated = useBandoriPreferencesStore((state) => state.hydrated);
  const clientReady = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [preferences, setPreferences] = useState(readBandoriMetaPreferences), preferencesRef = useRef(preferences);
  const query = useSearchParams().toString(), deferredQuery = useDeferredValue(query);
  const music = useBandoriMusicMaster(), skills = useBandoriSkillsMaster();
  const meta = useCachedFetch("bandori-song-meta-v2", "/api/bandori/master/music/meta", parseBandoriSongMetaResponse, SESSION_CLIENT_CACHE_POLICY);
  const options = useMemo(() => bandoriMetaSkillOptions(skills.data ?? {}, server), [skills.data, server]);
  const settings = useMemo(() => resolveBandoriMetaPreferences(query, preferences, options.map(({ id }) => id)), [query, preferences, options]);
  const deferredSettings = useDeferredValue(settings);
  const { liveLevel, perfect, downtime, metaSort: sort, metaDirection: direction } = settings;
  const selected = options.find(({ id }) => id === settings.liveSkill), skill = selected?.levels[liveLevel - 1];
  const unsupported = !!meta.data && (!skill || !meta.data.durations.includes(skill.duration));
  const rows = useMemo(() => {
    const live = options.find(({ id }) => id === deferredSettings.liveSkill)?.levels[deferredSettings.liveLevel - 1];
    if (!music.music || !meta.data || !live) return [];
    return buildBandoriMetaRows(music.music, meta.data, server, parseBandoriSongsPageFilter(new URLSearchParams(deferredQuery)), live,
      deferredSettings.fever, deferredSettings.perfect / 100, deferredSettings.downtime, deferredSettings.metaSort, deferredSettings.metaDirection);
  }, [deferredQuery, deferredSettings, options, music.music, meta.data, server]);
  const ready = clientReady && hydrated && music.music !== null && skills.data !== null && meta.data !== null;
  useEffect(() => {
    if (!ready || new URLSearchParams(window.location.search).toString() !== query) return;
    const next = bandoriMetaPreferencesQuery(query, settings);
    if (next !== query) navigate(next);
  }, [ready, query, settings]);
  const requests = [music, skills, meta], failed = requests.some((request) => request.error);
  function update(change: Partial<BandoriMetaPreferences> | ((current: BandoriMetaPreferences) => Partial<BandoriMetaPreferences>)) {
    // A blur and the following click can commit before React renders the previous edit.
    const current = resolveBandoriMetaPreferences(window.location.search, preferencesRef.current, options.map(({ id }) => id));
    const patch = typeof change === "function" ? change(current) : change;
    const next = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    writeBandoriMetaPreferences(next);
    setPreferences(next);
    navigate(bandoriMetaPreferencesQuery(window.location.search, { ...current, ...patch }));
  }
  function numberInput(key: "perfect" | "downtime", value: number, max: number) {
    return <input key={value} type="number" inputMode="decimal" min={0} max={max} step="any" defaultValue={value} aria-label={t(key)}
      className="hhwx-control h-9 w-20 rounded-xl border px-3 text-sm sm:h-10 sm:w-24" onBlur={(event) => {
        const next = event.currentTarget.valueAsNumber;
        if (Number.isFinite(next) && next >= 0 && next <= max) { if (next !== value) update({ [key]: next }); }
        else event.currentTarget.value = String(value);
      }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
  }
  return <>
    {failed ? <div role="alert" className="hhwx-catalog-error rounded-2xl border p-5 text-sm font-bold">
      {commonT(ready ? "states.refreshFailed" : "states.loadFailed")}{" "}<button type="button" className="hhwx-text-link"
        onClick={() => requests.forEach((request) => { if (request.error) request.refresh(); })}>{commonT("actions.retry")}</button>
    </div> : null}
    {!ready && !failed ? <LoadingIndicator label={t("loading")} className="hhwx-panel min-h-64 border" /> : null}
    {ready ? <>
      <div>
        <BandoriSongFilterControls filter={parseBandoriSongsPageFilter(new URLSearchParams(query))} resultCountLabel={t("resultCount", { count: rows.length })}
          showSort={false} onFilterChange={(patch) => navigate(updateBandoriSongsQuery(window.location.search, patch))}
          onClearFilter={() => navigate(updateBandoriSongsQuery(window.location.search, parseBandoriSongsPageFilter(new URLSearchParams())))} />
        <section aria-label={t("parameters")} className="hhwx-panel border border-t-0 p-3 sm:p-4">
          <div className="flex flex-col gap-3">
            <FilterRow label={t("fever")} inlineOnMobile>
              {[true, false].map((value) => <SelectionButton key={String(value)} isSelected={settings.fever === value}
                title={t(value ? "enabled" : "disabled")} onClick={() => update({ fever: value })} className="px-2 text-xs sm:px-3">
                {t(value ? "enabled" : "disabled")}
              </SelectionButton>)}
            </FilterRow>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-start sm:gap-2">
              <div className="hhwx-filter-label text-[13px] leading-5 font-medium text-[var(--theme-color-text-muted)] sm:pt-2 sm:text-sm">{t("liveSkill")}</div>
              <select aria-label={t("liveSkill")} value={selected?.id ?? ""} onChange={(event) => update({ liveSkill: event.target.value })}
                className="hhwx-control col-span-2 row-start-2 h-9 w-full min-w-0 rounded-xl border px-3 text-sm sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:h-10">
                {options.map((option) => <option key={option.id} value={option.id}>{bandoriMetaSkillDescription(option, liveLevel, server)}</option>)}
              </select>
              <div role="group" aria-label={t("skillLevel", { skill: t("liveSkill") })} className="col-start-2 row-start-1 flex gap-1 sm:col-start-3">
                {[1, 2, 3, 4, 5].map((value) => <SelectionButton key={value} isSelected={liveLevel === value} title={t("level", { level: value })}
                  onClick={() => update({ liveLevel: value })}>{value}</SelectionButton>)}
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 sm:contents">
              <FilterRow label={t("perfect")}>{numberInput("perfect", perfect, 100)}<span className="text-sm">%</span></FilterRow>
              <FilterRow label={t("downtime")}>{numberInput("downtime", downtime, 3600)}<span className="text-sm">{t("seconds")}</span></FilterRow>
            </div>
          </div>
        </section>
      </div>
      {unsupported ? <div role="alert" className="hhwx-panel border p-6 text-sm">{t("unsupported")}</div> :
        <SongMetaTable game="bandori" rows={rows} sort={sort} direction={direction} busy={query !== deferredQuery || settings !== deferredSettings}
          onSort={(key) => update((current) => ({ metaSort: key,
            metaDirection: current.metaSort === key ? current.metaDirection === "desc" ? "asc" : "desc" : key === "title" ? "asc" : "desc" }))} />}
    </> : null}
  </>;
}
