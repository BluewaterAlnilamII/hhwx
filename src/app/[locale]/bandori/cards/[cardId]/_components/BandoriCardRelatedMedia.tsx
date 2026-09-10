"use client";

import { Suspense, use, useState } from "react";
import { ImageOff, Images, Shirt } from "lucide-react";
import { useTranslations } from "next-intl";
import Heading from "@/components/Heading";
import { useBandoriCharactersMaster } from "@/hooks/useBandoriCharactersMaster";
import { useBandoriCardsAssetIndex, useBandoriCostumesAssetIndex, useBandoriLiveSdAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { useRouter } from "@/i18n/navigation";
import { pickBandoriCharacterDisplayName } from "@/lib/bandori/cards/master";
import type { BandoriCostume } from "@/lib/bandori/costumes/api-contract";
import { getBandoriServerCode, readBandoriRegionalTextAt, type BandoriServer } from "@/lib/bandori-server";
import { buildBandoriPublicAssetUrl, lookupBandoriCardImage, lookupBandoriCostumeImage, type BandoriCardAssetVariant } from "@/lib/bandori-public-asset-index";
import BandoriImageViewer from "./BandoriImageViewer";

export type BandoriCardCostumeResult = {
  costume: Pick<BandoriCostume, "characterId" | "assetBundleName" | "description"> | null;
  costumeLoadFailed: boolean;
};

function MediaImage({ src, alt, loading, error, refresh, onOpen }: {
  src: string | null;
  alt: string;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  onOpen?: () => void;
}) {
  const t = useTranslations("bandori.cards");
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src && failedSrc === src);
  if (!src || failed) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 text-center text-xs leading-4 text-[var(--theme-color-text-muted)]" role={loading ? "status" : undefined} aria-busy={loading}>
        {!error && !failed ? <ImageOff className="h-4 w-4" aria-hidden="true" /> : null}
        <span>{loading ? t("detail.mediaLoading") : error || failed ? t("detail.mediaLoadFailed") : t("detail.mediaUnavailable")}</span>
        {error || failed ? (
          <button type="button" className="hhwx-control rounded-full border px-2 py-1 text-xs" onClick={() => { setFailedSrc(null); refresh(); }}>
            {t("detail.retryMedia")}
          </button>
        ) : null}
      </div>
    );
  }
  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" decoding="async" className="block aspect-square w-full rounded-lg object-contain" onError={() => setFailedSrc(src)} />
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} aria-label={t("detail.openMediaOriginal", { label: alt })} className="block w-full cursor-zoom-in rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]">
      {image}
    </button>
  ) : image;
}

function CostumeDetails({ costumeId, result, selectedServer }: {
  costumeId: number;
  result: Promise<BandoriCardCostumeResult>;
  selectedServer: BandoriServer;
}) {
  const { costume, costumeLoadFailed } = use(result);
  const t = useTranslations("bandori.cards");
  const router = useRouter();
  const characters = useBandoriCharactersMaster(Boolean(costume));
  const costumeIndex = useBandoriCostumesAssetIndex(Boolean(costume));
  const costumeName = readBandoriRegionalTextAt(costume?.description, selectedServer) ?? t("common.noInformation");
  const characterName = pickBandoriCharacterDisplayName(
    costume ? characters.data?.[String(costume.characterId)] : null,
    selectedServer, selectedServer, t("common.noInformation"),
  );
  const costumeSrc = buildBandoriPublicAssetUrl(lookupBandoriCostumeImage(costumeIndex.value, costume?.assetBundleName, getBandoriServerCode(selectedServer)));
  return costume ? (
    <figure className="mt-4 w-32 rounded-lg border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] p-3" data-costume-id={costumeId}>
      <div className="mx-auto w-24">
        <MediaImage src={costumeSrc} alt={costumeName} loading={costumeIndex.loading} error={costumeIndex.error} refresh={costumeIndex.refresh} />
      </div>
      <figcaption className="mt-2 text-center">
        <p className="wrap-break-word text-sm font-bold text-[var(--theme-color-text-default)]">{costumeName}</p>
        <p className="mt-1 wrap-break-word text-xs font-semibold text-[var(--theme-color-text-muted)]">{characterName}</p>
      </figcaption>
    </figure>
  ) : (
    <div className="mt-4 flex items-center gap-3 text-sm text-[var(--theme-color-text-muted)]">
      <span>{costumeLoadFailed ? t("detail.costumeLoadFailed") : t("detail.costumeUnavailable")}</span>
      {costumeLoadFailed ? <button type="button" className="hhwx-control rounded-full border px-3 py-1" onClick={() => router.refresh()}>{t("detail.retryMedia")}</button> : null}
    </div>
  );
}

export default function BandoriCardRelatedMedia({ resourceSetName, artItems, costumeId, costumeResult, sdResourceName, selectedServer }: {
  resourceSetName: string;
  artItems: { variant: BandoriCardAssetVariant; label: string }[];
  costumeId?: number;
  costumeResult: Promise<BandoriCardCostumeResult>;
  sdResourceName?: string;
  selectedServer: BandoriServer;
}) {
  const t = useTranslations("bandori.cards");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const cardIndex = useBandoriCardsAssetIndex();
  const sdIndex = useBandoriLiveSdAssetIndex(Boolean(sdResourceName));
  const server = getBandoriServerCode(selectedServer);
  // Card SD identity is independent of the associated costume's SD identity.
  const sdSrc = buildBandoriPublicAssetUrl(lookupBandoriCostumeImage(sdIndex.value, sdResourceName, server));
  const cardResources = (["thumb", "trim"] as const).flatMap((role) => artItems.map((item) => ({
    key: `${role}-${item.variant}`,
    label: t(role === "thumb" ? "detail.thumbnailAlt" : "detail.transparentArtAlt", { label: item.label }),
    src: buildBandoriPublicAssetUrl(lookupBandoriCardImage(cardIndex.value, resourceSetName, item.variant, role)),
  })));
  const viewerResources = [
    ...cardResources,
    ...(sdResourceName ? [{ key: "live-sd", label: t("detail.liveSdTitle"), src: sdSrc }] : []),
  ].filter((resource) => resource.src);
  const activeIndex = viewerResources.findIndex((resource) => resource.key === activeKey);
  const activeResource = viewerResources[activeIndex];
  const activeImageIndex = activeKey === "live-sd" ? sdIndex : cardIndex;
  const changeActiveIndex = (offset: number) => {
    setActiveKey(viewerResources[(activeIndex + offset + viewerResources.length) % viewerResources.length].key);
  };

  return (
    <>
      <section className="mt-6 border-t border-[var(--theme-color-border-subtle)] pt-6" aria-labelledby="card-resources-title">
        <Heading id="card-resources-title" as="h2" visualRole="section" accentSlot="c" icon={<Images className="h-5 w-5" />}>
          {t("detail.resourcesTitle")}
        </Heading>
        <div className="mt-4 flex flex-wrap items-start justify-center gap-x-1.5 gap-y-4 sm:gap-5">
          {cardResources.map((resource) => (
            <figure key={resource.key} className="w-[min(6rem,calc((100%_-_1.125rem)/4))] sm:w-36" data-card-resource={resource.key}>
              <MediaImage src={resource.src} alt={resource.label} loading={cardIndex.loading} error={cardIndex.error} refresh={cardIndex.refresh} onOpen={() => setActiveKey(resource.key)} />
              <figcaption className="mt-2 text-center text-xs font-semibold leading-5 text-[var(--theme-color-text-muted)]">{resource.label}</figcaption>
            </figure>
          ))}
          {sdResourceName ? (
            <figure className="w-[min(6rem,calc((100%_-_1.125rem)/4))] sm:w-36" data-card-sd-resource={sdResourceName}>
              <MediaImage src={sdSrc} alt={t("detail.liveSdTitle")} loading={sdIndex.loading} error={sdIndex.error} refresh={sdIndex.refresh} onOpen={() => setActiveKey("live-sd")} />
              <figcaption className="mt-2 text-center text-xs font-semibold leading-5 text-[var(--theme-color-text-muted)]">{t("detail.liveSdTitle")}</figcaption>
            </figure>
          ) : null}
        </div>
      </section>
      {costumeId ? (
        <section className="mt-6 border-t border-[var(--theme-color-border-subtle)] pt-6" aria-labelledby="card-live2d-title">
          <Heading id="card-live2d-title" as="h2" visualRole="section" accentSlot="b" icon={<Shirt className="h-5 w-5" />}>
            {t("detail.live2dTitle")}
          </Heading>
          <Suspense fallback={<p className="mt-4 text-sm text-[var(--theme-color-text-muted)]" role="status">{t("detail.costumeLoading")}</p>}>
            <CostumeDetails costumeId={costumeId} result={costumeResult} selectedServer={selectedServer} />
          </Suspense>
        </section>
      ) : null}
      {activeResource ? (
        <BandoriImageViewer
          src={activeResource.src}
          label={activeResource.label}
          labels={{
            close: t("detail.closeViewer"), instructions: t("detail.viewerInstructions"),
            previous: t("detail.previousMedia"), next: t("detail.nextMedia"),
            imageLoading: t("detail.mediaLoading"), imageUnavailable: t("detail.mediaLoadFailed"), retry: t("detail.retryMedia"),
          }}
          loading={activeImageIndex.loading}
          onRetry={activeImageIndex.refresh}
          onClose={() => setActiveKey(null)}
          onPrevious={viewerResources.length > 1 ? () => changeActiveIndex(-1) : undefined}
          onNext={viewerResources.length > 1 ? () => changeActiveIndex(1) : undefined}
        />
      ) : null}
    </>
  );
}
