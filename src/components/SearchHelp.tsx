"use client";

import { useTranslations } from "next-intl";
import HelpPopover from "@/components/HelpPopover";

const EXAMPLE_KEYS = {
  cards: ["band", "character", "attribute", "rarity", "skillRate", "skillType", "cardType", "server", "id", "name"],
  songs: ["band", "difficulty", "difficultyRange", "level", "songType", "server", "id", "name"],
  ournotesCards: ["band", "character", "attribute", "rarity", "server", "id", "name"],
} as const;

export default function SearchHelp({ kind }: { kind: keyof typeof EXAMPLE_KEYS }) {
  const t = useTranslations(kind === "ournotesCards" ? "ournotes.cards.searchHelp"
    : kind === "cards" ? "bandori.cardFilters.searchHelp" : "bandori.songs.filters.searchHelp");
  return (
    <HelpPopover label={t("label")} title={t("title")} variant="search">
      {EXAMPLE_KEYS[kind].map((key) => (
        <p key={key}>
          {t.rich(key, {
            rate: "<=130%", difficulty: ">=hd", level: "<=26", rarityBound: ">=SR",
            code: (chunks) => (
              <code className="rounded-sm bg-[var(--theme-color-control-background-muted)] px-1.5 py-0.5 text-xs whitespace-nowrap">{chunks}</code>
            ),
          })}
        </p>
      ))}
    </HelpPopover>
  );
}
