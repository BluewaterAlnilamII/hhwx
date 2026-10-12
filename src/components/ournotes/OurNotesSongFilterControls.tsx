"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FilterRow, SelectionButton, ToggleAllButton } from "@/components/FilterControls";
import SongFilterControls from "@/components/SongFilterControls";
import SearchHelp from "@/components/SearchHelp";
import ServerIcon from "@/components/ServerIcon";
import { OURNOTES_SERVERS, OURNOTES_SERVER_CODES, pickOurNotesRegionalText } from "@/lib/ournotes/server";
import type { OurNotesServer } from "@/lib/ournotes/master-contract";
import type { OurNotesBand } from "@/lib/ournotes/catalogs-contract";
import { ourNotesAttributeIcon, ourNotesBandIcon } from "@/lib/ournotes/cards/assets";
import { OURNOTES_ATTRIBUTES } from "@/lib/ournotes/cards/catalog";
import { OURNOTES_SONG_CATEGORIES, OURNOTES_SONG_DIFFICULTIES, OURNOTES_SONG_GEKISOU_TYPES, OURNOTES_SONG_SORTS,
  ourNotesSongBandFilters, type OurNotesSongFilter } from "@/lib/ournotes/music/catalog";

export default function OurNotesSongFilterControls({ filter, resultCountLabel, bands, server, onFilterChange, onClearFilter, showSort = true }: {
  filter: OurNotesSongFilter; resultCountLabel: string; bands: Record<string, OurNotesBand>; server: OurNotesServer;
  onFilterChange: (patch: Partial<OurNotesSongFilter>) => void; onClearFilter: () => void;
  showSort?: boolean;
}) {
  const t = useTranslations("ournotes.songs.filters");
  const cardT = useTranslations("ournotes.cards");
  function row<T extends string | number>(label: string, values: readonly T[], selected: readonly T[], name: (value: T) => string,
    content: (value: T) => ReactNode, onChange: (values: T[]) => void, className?: string) {
    const all = values.every((value) => selected.includes(value));
    return <FilterRow label={label}>
      {values.map((value) => <SelectionButton key={value} title={name(value)} ariaLabel={name(value)} isSelected={selected.includes(value)} className={className}
        onClick={() => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])}>{content(value)}</SelectionButton>)}
      <ToggleAllButton isSelected={all} allLabel={t("actions.all")} selectAllLabel={t("actions.selectAll", { group: label })}
        clearAllLabel={t("actions.clearAll", { group: label })} onClick={() => onChange(all ? [] : [...values])} />
    </FilterRow>;
  }
  return <SongFilterControls filter={filter} resultCountLabel={resultCountLabel} onFilterChange={onFilterChange} onClearFilter={onClearFilter}
    help={<SearchHelp kind="ournotesSongs" />} sortOptions={showSort ? OURNOTES_SONG_SORTS.map((value) => ({ value, label: t(`sort.${value}`) })) : []}
    labels={{ searchPlaceholder: t("searchPlaceholder"), search: t("actions.search"), clear: t("actions.clear"),
      level: t("rows.level"), min: t("levelMin"), max: t("levelMax"), sort: t("rows.sort"), asc: t("sortDirection.asc"), desc: t("sortDirection.desc"),
      directionTitle: t(`sortDirection.${filter.sortDirection}Title`), directionAria: t(`sortDirection.${filter.sortDirection}Aria`) }}>
    {row(t("rows.serverAvailability"), OURNOTES_SERVERS, filter.servers, (slot) => t("serverAvailabilityAria", { server: OURNOTES_SERVER_CODES[slot].toUpperCase() }),
      (slot) => <><ServerIcon code={OURNOTES_SERVER_CODES[slot]} size={22} isDecorative /><span className="text-xs font-black">{OURNOTES_SERVER_CODES[slot].toUpperCase()}</span></>,
      (servers) => onFilterChange({ servers }), "gap-1 px-2 sm:gap-1.5 sm:px-2.5")}
    {row(t("rows.band"), ourNotesSongBandFilters(bands), filter.bands,
      (id) => id === "other" ? t("otherBand") : pickOurNotesRegionalText(bands[String(id)]?.bandName, server) || `#${id}`,
      (id) => id === "other" ? <span className="px-1 text-xs">{t("otherBand")}</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={ourNotesBandIcon(id)} alt={pickOurNotesRegionalText(bands[String(id)]?.bandName, server) || `#${id}`} loading="lazy" decoding="async" className="h-6 w-6 object-contain sm:h-7 sm:w-7" />,
      (bands) => onFilterChange({ bands }))}
    {row(cardT("filters.attributes"), OURNOTES_ATTRIBUTES, filter.attributes, (id) => cardT(`attributes.${id}`),
      // eslint-disable-next-line @next/next/no-img-element
      (id) => <img src={ourNotesAttributeIcon(id)!} alt={cardT(`attributes.${id}`)} loading="lazy" decoding="async" className="h-6 w-6 object-contain sm:h-7 sm:w-7" />,
      (attributes) => onFilterChange({ attributes }))}
    {row(t("rows.gekisou"), OURNOTES_SONG_GEKISOU_TYPES, filter.gekisou, (value) => t(`gekisou.${value}`), (value) => t(`gekisou.${value}`),
      (gekisou) => onFilterChange({ gekisou }), "px-2 text-xs sm:px-3")}
    {row(t("rows.type"), OURNOTES_SONG_CATEGORIES, filter.types, (value) => t(`types.${value}`), (value) => t(`types.${value}`), (types) => onFilterChange({ types }), "px-2 text-xs sm:px-3")}
    {row(t("rows.difficulty"), OURNOTES_SONG_DIFFICULTIES, filter.difficulties, (value) => t(`difficulties.${value}`), (value) => t(`difficulties.${value}`),
      (difficulties) => onFilterChange({ difficulties }), "px-2 text-xs sm:px-3")}
  </SongFilterControls>;
}
