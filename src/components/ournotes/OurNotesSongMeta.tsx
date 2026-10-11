"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { FilterRow, SelectionButton } from "@/components/FilterControls";
import HelpPopover from "@/components/HelpPopover";
import LoadingIndicator from "@/components/LoadingIndicator";
import { SONG_DIFFICULTY_CLASSES } from "@/components/SongDifficultyStrip";
import OurNotesSongFilterControls from "./OurNotesSongFilterControls";
import { useOurNotesMaster } from "@/hooks/useOurNotesMaster";
import { useOurNotesPreferencesStore, useOurNotesPreferredServer } from "@/store/useServerPreferencesStore";
import { ourNotesSkillDescription } from "@/lib/ournotes/cards/catalog";
import { ourNotesSongBandFilters, parseOurNotesSongFilter, updateOurNotesSongsQuery } from "@/lib/ournotes/music/catalog";
import { buildOurNotesMetaRows, formatOurNotesMetaTime, ourNotesMetaDuration, ourNotesMetaSkillOptions, resolveOurNotesMetaExtension, resolveOurNotesMetaLiveSkill } from "@/lib/ournotes/music/meta";
import { ourNotesMetaPreferencesQuery, readOurNotesMetaPreferences, resolveOurNotesMetaPreferences, writeOurNotesMetaPreferences, type OurNotesMetaPreferences } from "@/lib/ournotes/music/meta-preferences";
import type { OurNotesSkill } from "@/lib/ournotes/skills-contract";

const subscribeToHydration = () => () => {};
function navigate(query: string) {
  window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
}

export default function OurNotesSongMeta() {
  const t = useTranslations("ournotes.songs.meta"), songsT = useTranslations("ournotes.songs"), commonT = useTranslations("common");
  const locale = useLocale(), server = useOurNotesPreferredServer();
  const hydrated = useOurNotesPreferencesStore((state) => state.hydrated);
  const clientReady = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [preferences, setPreferences] = useState(readOurNotesMetaPreferences);
  const preferencesRef = useRef(preferences);
  const query = useSearchParams().toString(), deferredQuery = useDeferredValue(query);
  const music = useOurNotesMaster("music"), bands = useOurNotesMaster("bands"), skills = useOurNotesMaster("skills"), meta = useOurNotesMaster("music/meta");
  const options = useMemo(() => ourNotesSongBandFilters(bands.data ?? {}), [bands.data]);
  const liveSkills = useMemo(() => ourNotesMetaSkillOptions(skills.data?.live ?? {}, "live", server), [skills.data, server]);
  const supportSkills = useMemo(() => ourNotesMetaSkillOptions(skills.data?.support ?? {}, "support", server), [skills.data, server]);
  const settings = useMemo(() => resolveOurNotesMetaPreferences(query, preferences, liveSkills.map(([id]) => id), supportSkills.map(([id]) => id)),
    [query, preferences, liveSkills, supportSkills]);
  const deferredSettings = useDeferredValue(settings);
  const { liveLevel, supportLevel, perfect, downtime, metaSort: sort, metaDirection: direction } = settings;
  const live = liveSkills.find(([id]) => id === settings.liveSkill);
  const support = supportSkills.find(([id]) => id === settings.supportSkill);
  const skill = live && resolveOurNotesMetaLiveSkill(live[1], liveLevel);
  const extension = support ? resolveOurNotesMetaExtension(support[1], supportLevel) : 0;
  const duration = skill && extension !== null ? ourNotesMetaDuration(skill.duration, extension) : null;
  const unsupported = !!meta.data && (duration === null || !meta.data.durations.includes(duration));
  const rows = useMemo(() => {
    const selected = liveSkills.find(([id]) => id === deferredSettings.liveSkill);
    const liveSkill = selected && resolveOurNotesMetaLiveSkill(selected[1], deferredSettings.liveLevel);
    const selectedSupport = supportSkills.find(([id]) => id === deferredSettings.supportSkill);
    const extra = selectedSupport ? resolveOurNotesMetaExtension(selectedSupport[1], deferredSettings.supportLevel) : 0;
    if (!music.data || !meta.data || !bands.data || !liveSkill || extra === null) return [];
    return buildOurNotesMetaRows(music.data, meta.data, bands.data, server, parseOurNotesSongFilter(deferredQuery, options), liveSkill, extra,
      deferredSettings.perfect / 100, deferredSettings.downtime, deferredSettings.metaSort, deferredSettings.metaDirection);
  }, [deferredQuery, deferredSettings, liveSkills, supportSkills, music.data, meta.data, bands.data, server, options]);
  const ready = clientReady && hydrated && music.data !== null && bands.data !== null && skills.data !== null && meta.data !== null;
  useEffect(() => {
    if (!ready || new URLSearchParams(window.location.search).toString() !== query) return;
    const next = ourNotesMetaPreferencesQuery(query, settings);
    if (next !== query) navigate(next);
  }, [ready, query, settings]);
  const requests = [music, bands, skills, meta], failed = requests.some((request) => request.error);
  const format = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [locale]);
  const bpmFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
  function update(change: Partial<OurNotesMetaPreferences> | ((current: OurNotesMetaPreferences) => Partial<OurNotesMetaPreferences>)) {
    // A blur and the following click can commit before React renders the previous edit.
    const current = resolveOurNotesMetaPreferences(window.location.search, preferencesRef.current, liveSkills.map(([id]) => id), supportSkills.map(([id]) => id));
    const patch = typeof change === "function" ? change(current) : change;
    const next = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    writeOurNotesMetaPreferences(next);
    setPreferences(next);
    navigate(ourNotesMetaPreferencesQuery(window.location.search, { ...current, ...patch }));
  }
  function description(skill: OurNotesSkill, level: number) {
    const slot = skill.description[server] ? server : skill.description.findIndex(Boolean);
    return ourNotesSkillDescription(skill, slot < 0 ? server : slot as typeof server, level).replace(/\s+/gu, " ");
  }
  function skillRow(kind: "live" | "support", choices: [string, OurNotesSkill][], selected: string, level: number) {
    const label = t(kind === "live" ? "liveSkill" : "supportSkill");
    return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-start sm:gap-2">
      <div className="hhwx-filter-label text-[13px] leading-5 font-medium text-[var(--theme-color-text-muted)] sm:pt-2 sm:text-sm">{label}</div>
      <select aria-label={label} value={selected} onChange={(event) => update({ [`${kind}Skill`]: event.target.value })}
        className="hhwx-control col-span-2 row-start-2 h-9 w-full min-w-0 rounded-xl border px-3 text-sm sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:h-10">
        {kind === "support" ? <option value="none">{t("none")}</option> : null}
        {choices.map(([id, skill]) => <option key={id} value={id}>{description(skill, level)}</option>)}
      </select>
      <div role="group" aria-label={t("skillLevel", { skill: label })} className="col-start-2 row-start-1 flex gap-1 sm:col-start-3">
        {[1, 2, 3, 4, 5].map((value) => <SelectionButton key={value} isSelected={level === value} title={t("level", { level: value })}
          onClick={() => update({ [`${kind}Level`]: value })}>{value}</SelectionButton>)}
      </div>
    </div>;
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
    {ready && bands.data ? <>
      <div>
        <OurNotesSongFilterControls filter={parseOurNotesSongFilter(query, options)} resultCountLabel={t("resultCount", { count: rows.length })}
          bands={bands.data} server={server} showSort={false} onFilterChange={(patch) => navigate(updateOurNotesSongsQuery(window.location.search, patch, options))}
          onClearFilter={() => navigate(updateOurNotesSongsQuery(window.location.search, parseOurNotesSongFilter("", options), options))} />
        <section aria-label={t("parameters")} className="hhwx-panel border border-t-0 p-3 sm:p-4">
          <div className="flex flex-col gap-3">
            <FilterRow label={t("mode")} inlineOnMobile>
              <SelectionButton isSelected title={t("free")} onClick={() => update({ mode: "free" })} className="px-2 text-xs sm:px-3">{t("free")}</SelectionButton>
              <SelectionButton isSelected={false} disabled title={t("gekisou")} className="px-2 text-xs sm:px-3">{t("gekisou")}</SelectionButton>
            </FilterRow>
            {skillRow("live", liveSkills, live?.[0] ?? "", liveLevel)}
            {skillRow("support", supportSkills, support?.[0] ?? "none", supportLevel)}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 sm:contents">
              <FilterRow label={t("perfect")}>{numberInput("perfect", perfect, 100)}<span className="text-sm">%</span></FilterRow>
              <FilterRow label={t("downtime")}>{numberInput("downtime", downtime, 3600)}<span className="text-sm">{t("seconds")}</span></FilterRow>
            </div>
          </div>
        </section>
      </div>
      {unsupported ? <div role="alert" className="hhwx-panel border p-6 text-sm">{t("unsupported")}</div> :
        <div className="hhwx-panel overflow-x-auto border" role="region" aria-label={t("tableLabel")} tabIndex={0} aria-busy={query !== deferredQuery || settings !== deferredSettings}>
          <table className="w-full min-w-192 border-collapse text-[13px] leading-5 tabular-nums sm:min-w-240 sm:text-sm">
            <caption className="sr-only">{t("tableLabel")}</caption>
            <thead><tr className="border-b border-[var(--theme-color-border-subtle)] text-[var(--theme-color-text-muted)]">
              <th scope="col" className="w-px min-w-9 whitespace-nowrap px-1 py-2 text-center sm:min-w-11 sm:px-2 sm:py-3">{t("rank")}</th>
              {(["title", "level", "score", "efficiency", "length", "bpm", "notes", "nps", "sr"] as const).map((key) => {
                const hasHelp = ["score", "efficiency", "bpm", "notes", "nps", "sr"].includes(key);
                return <th key={key} scope="col" aria-sort={sort === key ? direction === "asc" ? "ascending" : "descending" : "none"}
                  className={key === "title" ? "w-full min-w-30 pl-2 pr-5 text-left sm:min-w-41 sm:pl-3 sm:pr-7" : "w-px px-3.5 text-center sm:px-4"}>
                  <div className="relative inline-flex items-center gap-0.5 sm:gap-1">
                    <button type="button" className="hhwx-text-link min-w-6 whitespace-nowrap py-2 font-bold sm:py-3" onClick={() => update((current) => ({
                      metaSort: key, metaDirection: current.metaSort === key ? current.metaDirection === "desc" ? "asc" : "desc" : key === "title" ? "asc" : "desc",
                    }))}>{t(`columns.${key}`)}<span className="absolute top-1/2 left-full ml-0.5 h-3 w-3 -translate-y-1/2 sm:ml-1" aria-hidden="true">
                      {sort === key ? direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
                    </span></button>
                    {hasHelp ? <div className="flex text-left">
                      <HelpPopover label={t("helpLabel", { column: t(`columns.${key}`) })} preferredPlacement="above">
                        {t(`help.${key}`)}
                      </HelpPopover>
                    </div> : null}
                  </div>
                </th>;
              })}
            </tr></thead>
            <tbody>{rows.map((row, index) => <tr key={`${row.songId}:${row.difficulty}`} className="h-10 border-b border-[var(--theme-color-border-subtle)] last:border-0 sm:h-auto">
              <td className="px-1 py-1.5 text-center text-[var(--theme-color-text-muted)] sm:px-2 sm:py-3">{index + 1}</td>
              <th scope="row" className="max-w-0 px-2 py-1.5 text-left font-semibold sm:px-3 sm:py-3"><Link prefetch={false} href={`/ournotes/songs/${row.songId}`} className="hhwx-text-link line-clamp-2 break-words sm:line-clamp-none">{row.title || songsT("unknownTitle", { songId: row.songId })}</Link></th>
              <td className="px-2 py-1.5 text-center sm:px-3 sm:py-3"><span className={`${SONG_DIFFICULTY_CLASSES[row.difficulty]} inline-flex min-w-8 items-center justify-center rounded-lg border px-2 py-1 text-xs font-black`}
                title={songsT(`difficulties.${row.difficulty}`)} aria-label={`${songsT(`difficulties.${row.difficulty}`)} ${row.level ?? "—"}`}>{row.level ?? "—"}</span></td>
              <td className={`whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3${row.topScore ? " font-bold" : ""}`}>{format.format(row.score)}%</td>
              <td className={`whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3${row.topEfficiency ? " font-bold" : ""}`}>{format.format(row.efficiency)}%</td>
              <td className="min-w-20 whitespace-nowrap px-2 py-1.5 text-center sm:min-w-22 sm:px-3 sm:py-3">{formatOurNotesMetaTime(row.length)}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3" title={row.bpmValues.map((value) => bpmFormat.format(value)).join(" / ")}>{row.bpm === null ? "—" : bpmFormat.format(row.bpm)}{row.bpmValues.length > 1 ? "*" : ""}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{row.notes ?? "—"}</td><td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{row.nps === null ? "—" : format.format(row.nps)}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{format.format(row.sr)}%</td>
            </tr>)}</tbody>
          </table>
          {rows.length === 0 ? <p className="p-8 text-center text-sm text-[var(--theme-color-text-muted)]">{t("empty")}</p> : null}
        </div>}
    </> : null}
  </>;
}
