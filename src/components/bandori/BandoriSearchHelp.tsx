"use client";

import { useTranslations } from "next-intl";
import BandoriHelpPopover from "@/components/bandori/BandoriHelpPopover";

const EXAMPLE_KEYS = {
  cards: ["band", "character", "attribute", "rarity", "skillRate", "skillType", "cardType", "server", "id", "name"],
  songs: ["band", "difficulty", "difficultyRange", "level", "songType", "server", "id", "name"],
} as const;

export default function BandoriSearchHelp({ kind }: { kind: keyof typeof EXAMPLE_KEYS }) {
  const t = useTranslations(kind === "cards" ? "bandori.cardFilters.searchHelp" : "bandori.songs.filters.searchHelp");
  return (
    <BandoriHelpPopover label={t("label")} title={t("title")} variant="search">
      {EXAMPLE_KEYS[kind].map((key) => (
        <p key={key}>
          {t.rich(key, {
            rate: "<=130%",
            difficulty: ">=hd",
            level: "<=26",
            code: (chunks) => (
              <code className="rounded-sm bg-[var(--theme-color-control-background-muted)] px-1.5 py-0.5 text-xs whitespace-nowrap">{chunks}</code>
            ),
          })}
        </p>
      ))}
    </BandoriHelpPopover>
  );
}
