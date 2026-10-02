"use client";

import type { ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useTranslations } from "next-intl";
import { CatalogSearchToolbar, FilterRow, SelectionButton, ToggleAllButton } from "@/components/FilterControls";
import ServerIcon from "@/components/ServerIcon";
import SearchHelp from "@/components/SearchHelp";
import { OURNOTES_SLOTS, type OurNotesServer } from "@/lib/ournotes/master-contract";
import { pickOurNotesRegionalText } from "@/lib/ournotes/server";
import { ourNotesAttributeIcon, ourNotesBandIcon, ourNotesCharacterIcon } from "@/lib/ournotes/cards/assets";
import { OURNOTES_SERVERS, OURNOTES_ATTRIBUTES, OURNOTES_SORTS, OURNOTES_RARITY_NAMES,
  type OurNotesCardFilter, type OurNotesFilterOptions, type OurNotesBands, type OurNotesCharacters } from "@/lib/ournotes/cards/catalog";

export default function OurNotesCardFilterControls({ filter, options, bands, characters, server, count, onChange, onClear }: {
  filter: OurNotesCardFilter; options: OurNotesFilterOptions; bands: OurNotesBands; characters: OurNotesCharacters;
  server: OurNotesServer; count: number; onChange: (patch: Partial<OurNotesCardFilter>) => void; onClear: () => void;
}) {
  const t = useTranslations("ournotes.cards");
  const icon = (src: string | null, className = "h-6 w-6") => src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" className={`${className} object-contain`} loading="lazy" /> : null;
  function row(field: "servers" | "bandIds" | "attributes" | "rarities" | "characterIds", values: readonly number[], label: string, name: (id: number) => string, content: (id: number) => ReactNode) {
    const selected = filter[field];
    const all = values.every((id) => selected.includes(id));
    return <FilterRow label={label}>
      {values.map((id) => <SelectionButton key={id} title={name(id)} ariaLabel={name(id)} className={field === "servers" ? "gap-1.5 px-2.5" : undefined} isSelected={selected.includes(id)}
        onClick={() => onChange({ [field]: selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id] })}>
        {content(id)}
      </SelectionButton>)}
      <ToggleAllButton isSelected={all} allLabel={t("actions.all")} selectAllLabel={t("actions.selectAll", { group: label })}
        clearAllLabel={t("actions.clearAll", { group: label })} onClick={() => onChange({ [field]: all ? [] : [...values] })} />
    </FilterRow>;
  }
  return <div className="hhwx-panel border p-4">
    <CatalogSearchToolbar query={filter.query} placeholder={t("searchPlaceholder")} searchLabel={t("actions.search")} clearLabel={t("actions.clear")}
      resultCountLabel={t("resultCount", { count })} help={<SearchHelp kind="ournotesCards" />} onQueryChange={(query) => onChange({ query })} onClear={onClear} />
    <div className="mt-4 space-y-3">
      {row("servers", OURNOTES_SERVERS, t("filters.servers"), (id) => t(`servers.${OURNOTES_SLOTS[id]}`), (id) => <><ServerIcon code={OURNOTES_SLOTS[id]} size={22} isDecorative /><span className="text-xs font-black">{t(`servers.${OURNOTES_SLOTS[id]}`)}</span></>)}
      {row("bandIds", options.bandIds, t("filters.bands"), (id) => pickOurNotesRegionalText(bands[id]?.bandName, server) || `#${id}`, (id) => icon(ourNotesBandIcon(id)))}
      {row("attributes", OURNOTES_ATTRIBUTES, t("filters.attributes"), (id) => t(`attributes.${id}`), (id) => icon(ourNotesAttributeIcon(id)))}
      {row("rarities", options.rarities, t("filters.rarities"), (id) => OURNOTES_RARITY_NAMES[id] ?? `#${id}`, (id) => <span className="px-1 text-xs font-black">{OURNOTES_RARITY_NAMES[id] ?? `#${id}`}</span>)}
      {row("characterIds", options.characterIds, t("filters.characters"), (id) => pickOurNotesRegionalText(characters[id]?.characterName, server) || `#${id}`, (id) => icon(ourNotesCharacterIcon(id), "h-6 w-6 rounded-full"))}
      <FilterRow label={t("filters.sort")}>
        <select aria-label={t("filters.sort")} value={filter.sortBy} onChange={(event) => onChange({ sortBy: event.target.value as OurNotesCardFilter["sortBy"] })} className="hhwx-control h-10 min-w-64 rounded-xl border px-3 text-sm transition">
          {OURNOTES_SORTS.map((sort) => <option value={sort} key={sort}>{t(`sort.${sort}`)}</option>)}
        </select>
        <button type="button" className="hhwx-control inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold" onClick={() => onChange({ direction: filter.direction === "desc" ? "asc" : "desc" })}>
          {filter.direction === "desc" ? <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" /> : <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" />}{t(`sort.${filter.direction}`)}
        </button>
      </FilterRow>
    </div>
  </div>;
}
