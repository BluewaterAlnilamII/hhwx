"use client";

import { useTranslations } from "next-intl";
import { FilterRow, SelectionButton, ToggleAllButton as SharedToggleAllButton } from "@/components/FilterControls";
import SongFilterControls from "@/components/SongFilterControls";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import BandoriSearchHelp from "@/components/bandori/BandoriSearchHelp";
import { buildBandoriCardBandIconUrl } from "@/lib/bandori-builtin-resources";
import { BANDORI_CHARACTER_GROUPS } from "@/lib/bandori-character-groups";
import {
  BANDORI_SONG_BAND_FILTERS,
  BANDORI_SONG_DIFFICULTY_FILTERS,
  BANDORI_SONG_SORTS,
  BANDORI_SONG_TYPES,
  type BandoriSongBandFilter,
  type BandoriSongType,
  type BandoriSongsPageFilter,
} from "@/lib/bandori/songs/catalog";
import { BANDORI_SERVERS, getBandoriServerCode } from "@/lib/bandori-server";

function toggleSelection<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
function areAllSelected<T>(selected: readonly T[], available: readonly T[]): boolean {
  return available.length > 0 && available.every((value) => selected.includes(value));
}
function ToggleAllButton({ isSelected, label, onClick }: { isSelected: boolean; label: string; onClick: () => void }) {
  const t = useTranslations("bandori.songs.filters");
  return <SharedToggleAllButton isSelected={isSelected} allLabel={t("actions.all")}
    selectAllLabel={t("actions.selectAll", { group: label })} clearAllLabel={t("actions.clearAll", { group: label })} onClick={onClick} />;
}
export default function BandoriSongFilterControls({ filter, resultCountLabel, onFilterChange, onClearFilter }: {
  filter: BandoriSongsPageFilter; resultCountLabel: string;
  onFilterChange: (patch: Partial<BandoriSongsPageFilter>) => void; onClearFilter: () => void;
}) {
  const t = useTranslations("bandori.songs.filters");
  const searchT = useTranslations("bandori.cardFilters.actions");
  const bandLabel = t("rows.band");
  const typeLabel = t("rows.type");
  const serverLabel = t("rows.serverAvailability");
  return <SongFilterControls filter={filter} resultCountLabel={resultCountLabel} onFilterChange={onFilterChange} onClearFilter={onClearFilter}
    help={<BandoriSearchHelp kind="songs" />} sortOptions={BANDORI_SONG_SORTS.map((value) => ({ value, label: t(`sort.${value}`) }))}
    labels={{ searchPlaceholder: t("searchPlaceholder"), search: searchT("search"), clear: t("actions.clear"),
      level: t("rows.level"), min: t("levelMin"), max: t("levelMax"), sort: t("rows.sort"), asc: t("sortDirection.asc"), desc: t("sortDirection.desc"),
      directionTitle: t(`sortDirection.${filter.sortDirection}Title`), directionAria: t(`sortDirection.${filter.sortDirection}Aria`) }}>
        <FilterRow label={serverLabel}>
          {BANDORI_SERVERS.map((server) => {
            const code = getBandoriServerCode(server).toUpperCase();
            return (
              <SelectionButton
                key={server}
                title={t("serverAvailabilityAria", { server: code })}
                isSelected={filter.servers.includes(server)}
                onClick={() => onFilterChange({
                  servers: toggleSelection(filter.servers, server),
                })}
                className="gap-1 px-2 sm:gap-1.5 sm:px-2.5"
              >
                <BandoriServerIcon server={server} size={22} isDecorative />
                <span className="text-xs font-black">{code}</span>
              </SelectionButton>
            );
          })}
          <ToggleAllButton
            isSelected={areAllSelected(filter.servers, BANDORI_SERVERS)}
            label={serverLabel}
            onClick={() => onFilterChange({
              servers: areAllSelected(filter.servers, BANDORI_SERVERS)
                ? []
                : [...BANDORI_SERVERS],
            })}
          />
        </FilterRow>

        <FilterRow label={bandLabel}>
          {BANDORI_CHARACTER_GROUPS.map((group) => (
            <SelectionButton
              key={group.bandId}
              title={group.label}
              isSelected={filter.bands.includes(group.bandId)}
              onClick={() => onFilterChange({
                bands: toggleSelection<BandoriSongBandFilter>(filter.bands, group.bandId),
              })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={buildBandoriCardBandIconUrl(group.bandId) ?? undefined}
                alt={group.label}
                loading="lazy"
                decoding="async"
                className="h-6 w-6 object-contain sm:h-7 sm:w-7"
              />
            </SelectionButton>
          ))}
          <SelectionButton
            title={t("otherBand")}
            isSelected={filter.bands.includes("other")}
            onClick={() => onFilterChange({
              bands: toggleSelection<BandoriSongBandFilter>(filter.bands, "other"),
            })}
            className="px-2 text-xs sm:px-3"
          >
            {t("otherBand")}
          </SelectionButton>
          <ToggleAllButton
            isSelected={areAllSelected(filter.bands, BANDORI_SONG_BAND_FILTERS)}
            label={bandLabel}
            onClick={() => onFilterChange({
              bands: areAllSelected(filter.bands, BANDORI_SONG_BAND_FILTERS)
                ? []
                : [...BANDORI_SONG_BAND_FILTERS],
            })}
          />
        </FilterRow>

        <FilterRow label={typeLabel}>
          {BANDORI_SONG_TYPES.map((type) => (
            <SelectionButton
              key={type}
              title={t(`types.${type}`)}
              isSelected={filter.types.includes(type)}
              onClick={() => onFilterChange({
                types: toggleSelection<BandoriSongType>(filter.types, type),
              })}
              className="px-2 text-xs sm:px-3"
            >
              {t(`types.${type}`)}
            </SelectionButton>
          ))}
          <ToggleAllButton
            isSelected={areAllSelected(filter.types, BANDORI_SONG_TYPES)}
            label={typeLabel}
            onClick={() => onFilterChange({
              types: areAllSelected(filter.types, BANDORI_SONG_TYPES)
                ? []
                : [...BANDORI_SONG_TYPES],
            })}
          />
        </FilterRow>

        <FilterRow label={t("rows.difficulty")}>
          {BANDORI_SONG_DIFFICULTY_FILTERS.map((difficulty) => (
            <SelectionButton
              key={difficulty}
              title={t(`difficulties.${difficulty}`)}
              isSelected={filter.difficulties.includes(difficulty)}
              onClick={() => onFilterChange({ difficulties: toggleSelection(filter.difficulties, difficulty) })}
              className="px-2 text-xs sm:px-3"
            >
              {t(`difficulties.${difficulty}`)}
            </SelectionButton>
          ))}
          <ToggleAllButton
            isSelected={areAllSelected(filter.difficulties, BANDORI_SONG_DIFFICULTY_FILTERS)}
            label={t("rows.difficulty")}
            onClick={() => onFilterChange({
              difficulties: areAllSelected(filter.difficulties, BANDORI_SONG_DIFFICULTY_FILTERS)
                ? []
                : [...BANDORI_SONG_DIFFICULTY_FILTERS],
            })}
          />
        </FilterRow>

  </SongFilterControls>;
}
