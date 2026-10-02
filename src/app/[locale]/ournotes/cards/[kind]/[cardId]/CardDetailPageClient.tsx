"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Images, Sparkles } from "lucide-react";
import PageShell from "@/components/PageShell";
import Heading from "@/components/Heading";
import LoadingIndicator from "@/components/LoadingIndicator";
import { DetailColumns, DetailHeader, DetailRow, DetailStats, RegionalDetailRow } from "@/components/DetailLayout";
import { SelectionButton } from "@/components/FilterControls";
import ServerSwitcher from "@/components/ServerSwitcher";
import OurNotesCardArt from "@/components/ournotes/OurNotesCardArt";
import { useOurNotesMaster, useOurNotesCardsAssetIndex } from "@/hooks/useOurNotesMaster";
import { OURNOTES_SLOTS, type OurNotesServer } from "@/lib/ournotes/master-contract";
import { useRouter } from "@/i18n/navigation";
import { useOurNotesPreferencesStore, useOurNotesPreferredServer } from "@/store/useServerPreferencesStore";
import { DEFAULT_OURNOTES_PREFERRED_SERVER, OURNOTES_SERVER_CODES, getOurNotesServerFromCode, pickAvailableOurNotesServer } from "@/lib/ournotes/server";
import type { OurNotesCardKind, OurNotesCardDetail } from "@/lib/ournotes/cards/api-contract";
import { ourNotesImageUrl, ourNotesCharacterIcon, ourNotesBandIcon, ourNotesAttributeIcon } from "@/lib/ournotes/cards/assets";
import { OURNOTES_SERVERS, OURNOTES_RARITY_NAMES, ourNotesCardCharacters, ourNotesCardName, ourNotesCardTitle,
  ourNotesCardSkills, ourNotesSkillDescription, ourNotesCardsListHref, ourNotesCardStats } from "@/lib/ournotes/cards/catalog";

const ImageViewer = dynamic(() => import("@/components/ImageViewer"), { ssr: false });

export default function CardDetailPageClient({ kind, cardId, card }: { kind: OurNotesCardKind; cardId: string; card: OurNotesCardDetail }) {
  const t = useTranslations("ournotes.cards");
  const locale = useLocale();
  const params = useSearchParams();
  const router = useRouter();
  const preferredServer = useOurNotesPreferredServer();
  const hydrated = useOurNotesPreferencesStore((state) => state.hydrated);
  const serverCode = params.get("server");
  const requestedServer = getOurNotesServerFromCode(serverCode);
  const available = OURNOTES_SERVERS.filter((slot) => card.serverExtensions?.[slot] != null);
  const explicitServer = requestedServer !== null && available.includes(requestedServer) ? requestedServer : null;
  const resolvedServer = explicitServer ?? (hydrated ? pickAvailableOurNotesServer(available, preferredServer) : null);
  const server = resolvedServer ?? DEFAULT_OURNOTES_PREFERRED_SERVER;
  const navigateServer = useCallback((slot: OurNotesServer) => {
    const query = new URLSearchParams(window.location.search);
    query.set("server", OURNOTES_SLOTS[slot]);
    router.replace(`/ournotes/cards/${kind}/${cardId}?${query}${window.location.hash}`, { scroll: false });
  }, [router, kind, cardId]);
  useEffect(() => {
    if (resolvedServer !== null && serverCode !== OURNOTES_SLOTS[resolvedServer]) navigateServer(resolvedServer);
  }, [resolvedServer, serverCode, navigateServer]);
  const characters = useOurNotesMaster("characters");
  const bands = useOurNotesMaster("bands");
  const skills = useOurNotesMaster("skills");
  const images = useOurNotesCardsAssetIndex();
  const [level, setLevel] = useState(5);
  const [viewerOpen, setViewerOpen] = useState(false);
  const dependencies = [characters, bands, skills];
  const failed = dependencies.some((item) => item.error) || images.error;
  const ready = dependencies.every((item) => item.data !== null) && images.value !== null;
  const title = ourNotesCardTitle(card, server);
  const name = ourNotesCardName(card, characters.data ?? {}, server);
  const jpTitle = server !== 0 ? ourNotesCardTitle(card, 0) : "";
  const characterIds = ourNotesCardCharacters(card);
  const bandIds = [...new Set(characterIds.flatMap((id) => characters.data?.[id] ? [characters.data[id].bandId] : []))];
  const fullImage = ourNotesImageUrl(images.value, kind, card.assetId, "full");
  const missing = t("states.textUnavailable");
  const displayName = [name, title].filter(Boolean).join(" - ") || missing;
  const references = ourNotesCardSkills(card);
  const attributeIcon = ourNotesAttributeIcon(card.cardType);

  if (resolvedServer === null || serverCode !== OURNOTES_SLOTS[resolvedServer]) {
    return <PageShell contentClassName="max-w-6xl"><LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-64 border" /></PageShell>;
  }

  return <PageShell contentClassName="max-w-6xl">
    <article className="hhwx-panel border p-4 sm:p-6">
      <DetailHeader backHref={ourNotesCardsListHref(params.get("list") ?? "", kind)} backLabel={t("actions.back")}
        title={displayName} id={cardId} reference={jpTitle}
        serverSwitcher={<ServerSwitcher servers={OURNOTES_SERVERS} getCode={(slot) => OURNOTES_SERVER_CODES[slot]}
          selectedServer={server} availableServers={available} label={t("filters.displayServer")}
          onChange={navigateServer} />} />
      {failed ? <div role="alert" className="mt-5 text-sm text-[var(--theme-color-semantic-danger-foreground)]">
        {t("states.loadFailed")}{" "}<button type="button" className="hhwx-text-link" onClick={() => {
          dependencies.forEach((item) => { if (item.error) item.refresh(); });
          if (images.error) images.refresh();
        }}>{t("actions.retry")}</button>
      </div> : null}
      {!ready && !failed ? <LoadingIndicator label={t("states.loading")} className="min-h-64" /> : null}
      {ready ? <>
        <section className="@container mt-6 border-t border-[var(--theme-color-border-subtle)] pt-6" aria-labelledby="ournotes-art-title">
          <Heading as="h2" visualRole="section" accentSlot="c" icon={<Images className="h-5 w-5" />} id="ournotes-art-title">{t("sections.art")}</Heading>
          <div className="mt-4 flex justify-center p-3 sm:p-5">
            <button type="button" disabled={!fullImage} aria-label={t("actions.viewImage")} onClick={() => setViewerOpen(true)}
              className={kind === "member" ? "w-full max-w-72 cursor-zoom-in disabled:cursor-default" : "w-full max-w-2xl cursor-zoom-in disabled:cursor-default"}>
              <OurNotesCardArt kind={kind} card={card} src={fullImage} alt={displayName} className="w-full" eager framed={false} />
            </button>
          </div>
        </section>
        <section className="@container mt-6 border-t border-[var(--theme-color-border-subtle)] pt-6" aria-labelledby="ournotes-info-title">
          <Heading as="h2" visualRole="section" accentSlot="a" icon={<ClipboardList className="h-5 w-5" />} id="ournotes-info-title">{t("sections.info")}</Heading>
          <div className="mt-4">
            <DetailColumns left={<dl>
              <DetailRow label={t("detail.id")}>{cardId}</DetailRow>
              <RegionalDetailRow label={t("detail.title")} currentValue={title || missing} jpValue={jpTitle} />
              <DetailRow label={t("filters.characters")} alignment="center">
                {characterIds.map((id) => <span key={id} className="inline-flex items-center justify-end gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ourNotesCharacterIcon(id)} alt="" aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-[var(--theme-color-border-subtle)]" />
                  <span>{characters.data?.[id]?.characterName[server] || missing}</span>
                </span>)}
              </DetailRow>
              <DetailRow label={t("filters.bands")} alignment="center">
                {bandIds.map((id) => <span key={id} className="inline-flex items-center justify-end gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ourNotesBandIcon(id)} alt="" aria-hidden="true" className="h-7 w-7 shrink-0 object-contain" />
                  <span>{bands.data?.[id]?.bandName[server] || missing}</span>
                </span>)}
              </DetailRow>
            </dl>} right={<dl className="mt-2 pt-2 @min-[54rem]:mt-0 @min-[54rem]:pt-0">
              <DetailRow label={t("filters.attributes")} alignment="center">
                <span className="inline-flex items-center justify-end gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {attributeIcon ? <img src={attributeIcon} alt="" aria-hidden="true" className="h-7 w-7 shrink-0 object-contain" /> : null}
                  <span>{t(`attributes.${card.cardType}`)}</span>
                </span>
              </DetailRow>
              <DetailRow label={t("filters.rarities")}>{OURNOTES_RARITY_NAMES[card.rarity] ?? card.rarity}</DetailRow>
            </dl>} />
          </div>
          <DetailStats items={ourNotesCardStats(card, locale).map(({ key, value }) => ({ label: t(`power.${key}`), value }))} />
        </section>
        <section className="@container mt-6 border-t border-[var(--theme-color-border-subtle)] pt-6" aria-labelledby="ournotes-skills-title">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Heading as="h2" visualRole="section" accentSlot="c" icon={<Sparkles className="h-5 w-5" />} id="ournotes-skills-title">{t("sections.skills")}</Heading>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("skillLevel")}>
              <span className="text-sm font-black text-[var(--theme-color-text-default)]">{t("skillLevel")}</span>
              {[1, 2, 3, 4, 5].map((value) => <SelectionButton key={value} title={`Lv. ${value}`} isSelected={level === value} onClick={() => setLevel(value)}>{value}</SelectionButton>)}
            </div>
          </div>
          {references.length === 0 ? <p className="mt-4 text-sm text-[var(--theme-color-text-muted)]">{t("states.noSkills")}</p> : null}
          <div className="mt-4 divide-y divide-[var(--theme-color-border-subtle)]" aria-live="polite">
            {references.map((ref) => {
              const skill = skills.data?.[ref.kind]?.[ref.id];
              return <DetailColumns key={ref.slot} stackedDivider={false} left={<dl>
                <DetailRow label={t(`skillKinds.${ref.kind}`)} className="@max-[54rem]:pb-2">{skill?.skillName[server] || missing}</DetailRow>
              </dl>} right={<dl>
                <DetailRow label={t("detail.skillEffect")} className="@max-[54rem]:grid-cols-1 @max-[54rem]:gap-0 @max-[54rem]:pt-0 @max-[54rem]:[&>dt]:sr-only">
                  {ourNotesSkillDescription(skill, server, level) || t("states.skillUnavailable")}
                </DetailRow>
              </dl>} />;
            })}
          </div>
        </section>
      </> : null}
    </article>
    {viewerOpen ? <ImageViewer src={fullImage} alt={displayName} label={displayName} onClose={() => setViewerOpen(false)}
      labels={{ close: t("viewer.close"), instructions: t("viewer.instructions"), previous: t("viewer.previous"), next: t("viewer.next"), imageLoading: t("states.imageLoading") }} /> : null}
  </PageShell>;
}
