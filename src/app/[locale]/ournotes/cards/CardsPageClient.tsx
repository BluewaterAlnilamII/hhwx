"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import CardCatalogRow from "@/components/CardCatalogRow";
import Heading from "@/components/Heading";
import PageShell from "@/components/PageShell";
import LoadingIndicator from "@/components/LoadingIndicator";
import OurNotesCardArt from "@/components/ournotes/OurNotesCardArt";
import OurNotesCardFilterControls from "@/components/ournotes/OurNotesCardFilterControls";
import { useOurNotesMaster, useOurNotesCardsAssetIndex } from "@/hooks/useOurNotesMaster";
import { OURNOTES_SLOTS } from "@/lib/ournotes/master-contract";
import type { OurNotesCardKind } from "@/lib/ournotes/cards/api-contract";
import { ourNotesImageUrl } from "@/lib/ournotes/cards/assets";
import { useOurNotesPreferencesStore, useOurNotesPreferredServer } from "@/store/useServerPreferencesStore";
import { buildOurNotesCardCatalog, filterOurNotesCards, ourNotesCardRarities, OURNOTES_RARITY_NAMES,
  parseOurNotesCardFilter, updateOurNotesCardsQuery, switchOurNotesCardsKind, type OurNotesCardFilter } from "@/lib/ournotes/cards/catalog";

export default function CardsPageClient() {
  const t = useTranslations("ournotes.cards");
  const query = useSearchParams().toString();
  const kind: OurNotesCardKind = new URLSearchParams(query).get("kind") === "support" ? "support" : "member";
  const server = useOurNotesPreferredServer();
  const hydrated = useOurNotesPreferencesStore((state) => state.hydrated);
  useEffect(() => {
    const params = new URLSearchParams(query);
    if (!params.has("server")) return;
    params.delete("server");
    window.history.replaceState(null, "", window.location.pathname + (params.size ? `?${params}` : "") + window.location.hash);
  }, [query]);
  const cards = useOurNotesMaster(`cards/${kind}`);
  const characters = useOurNotesMaster("characters");
  const bands = useOurNotesMaster("bands");
  const skills = useOurNotesMaster("skills");
  const images = useOurNotesCardsAssetIndex();
  const [pagination, setPagination] = useState({ query, count: 40 });
  const deferredQuery = useDeferredValue(query);
  const count = pagination.query === deferredQuery ? pagination.count : 40;
  const entries = useMemo(() => cards.data && characters.data && bands.data && skills.data
    ? buildOurNotesCardCatalog(cards.data, kind, characters.data, bands.data, skills.data, server) : [],
  [cards.data, characters.data, bands.data, skills.data, kind, server]);
  const options = useMemo(() => ({
    bandIds: Object.keys(bands.data ?? {}).map(Number).sort((a, b) => a - b),
    characterIds: Object.keys(characters.data ?? {}).map(Number).sort((a, b) => a - b),
    rarities: ourNotesCardRarities(kind),
  }), [kind, bands.data, characters.data]);
  const filter = useMemo(() => parseOurNotesCardFilter(deferredQuery, options), [deferredQuery, options]);
  const results = useMemo(() => filterOurNotesCards(entries, filter, bands.data ?? {}, characters.data ?? {}), [entries, filter, bands.data, characters.data]);
  const dependencies = [cards, characters, bands, skills];
  const ready = hydrated && dependencies.every((item) => item.data !== null) && images.value !== null;
  const failed = dependencies.some((item) => item.error) || images.error;
  function navigate(next: string, push = false) {
    const url = window.location.pathname + (next ? `?${next}` : "") + window.location.hash;
    if (push) window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
  }
  function update(patch: Partial<OurNotesCardFilter>) { navigate(updateOurNotesCardsQuery(window.location.search, patch, options)); }
  function retry() { dependencies.forEach((item) => { if (item.error) item.refresh(); }); if (images.error) images.refresh(); }
  return <PageShell contentClassName="max-w-6xl">
    <Heading as="h1" visualRole="page" className="sr-only">{t("title")}</Heading>
    <Tabs.Root value={kind} onValueChange={(value) => navigate(switchOurNotesCardsKind(query, value as OurNotesCardKind), true)}>
      <Tabs.List aria-label={t("kindLabel")} className="hhwx-panel grid grid-cols-2 overflow-hidden border">
        {(["member", "support"] as const).map((value) => <Tabs.Trigger key={value} value={value}
          className="relative h-14 text-base font-black text-[var(--theme-color-tab-foreground)] outline-hidden transition first:border-r first:border-[var(--theme-color-border-subtle)] hover:bg-[var(--theme-color-tab-background-hover)] hover:text-[var(--theme-color-tab-foreground-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)] data-[state=active]:text-[var(--theme-color-tab-foreground-selected)] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-[var(--theme-color-tab-indicator-selected)]">
          {t(`kinds.${value}`)}
        </Tabs.Trigger>)}
      </Tabs.List>
      <Tabs.Content value={kind} className="mt-4 space-y-4 lg:mt-8 lg:space-y-8">
        {failed ? <div role="alert" className="hhwx-panel flex flex-wrap items-center justify-center gap-3 border p-6 text-sm">
          <span>{t("states.loadFailed")}</span><button type="button" onClick={retry} className="hhwx-control rounded-xl border px-4 py-2 font-semibold">{t("actions.retry")}</button>
        </div> : null}
        {!ready && !failed ? <LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-64 border" /> : null}
        {ready && characters.data && bands.data ? <>
          <OurNotesCardFilterControls filter={parseOurNotesCardFilter(query, options)} options={options} characters={characters.data} bands={bands.data} server={server} count={results.length}
            onChange={update} onClear={() => navigate(kind === "support" ? "kind=support" : "")} />
          <div aria-busy={query !== deferredQuery} className="space-y-3">
            {results.length === 0 ? <div className="hhwx-panel flex min-h-64 flex-col items-center justify-center gap-3 border text-center text-[var(--theme-color-text-muted)]"><SearchX className="h-9 w-9" aria-hidden="true" /><p className="text-sm font-bold">{t("states.empty")}</p></div> : null}
            {results.slice(0, count).map((entry) => {
              const detailQuery = new URLSearchParams({ server: OURNOTES_SLOTS[entry.displayServer], list: query });
              return <CardCatalogRow key={`${kind}-${entry.id}`} prefetch={false} href={`/ournotes/cards/${kind}/${entry.id}?${detailQuery}`} mobileDescriptionBelow
                id={entry.id} title={entry.title || entry.name || t("states.textUnavailable")} subtitle={entry.name || t("states.textUnavailable")}
                preview={<OurNotesCardArt kind={kind} card={entry.card} src={ourNotesImageUrl(images.value, kind, entry.card.assetId, "thumbnail")} alt="" className={kind === "member" ? "w-16 sm:w-22" : "w-32 sm:w-40"} />}
                metadata={<><span>{OURNOTES_RARITY_NAMES[entry.card.rarity]}</span><span>{t(`attributes.${entry.card.cardType}`)}</span></>}
                description={entry.summaries.map((description) => description || t("states.skillUnavailable"))} />;
            })}
            {count < results.length ? <button type="button" className="hhwx-panel hhwx-catalog-action h-12 w-full border text-sm font-black transition" onClick={() => setPagination({ query, count: count + 40 })}>{t("actions.more", { count: Math.min(40, results.length - count) })}</button> : null}
          </div>
        </> : null}
      </Tabs.Content>
    </Tabs.Root>
  </PageShell>;
}
