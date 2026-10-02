"use client";

import {
  parseBandoriCardsAssetIndex,
  parseBandoriCostumesAssetIndex,
  parseBandoriLiveSdAssetIndex,
  parseBandoriDegreesAssetIndex,
  parseBandoriEventsAssetIndex,
  parseBandoriMusicAssetIndex,
  parseBandoriStampsAssetIndex,
  type BandoriCardsAssetIndex,
  type BandoriDegreesAssetIndex,
  type BandoriEventsAssetIndex,
  type BandoriMusicAssetIndex,
  type BandoriStampsAssetIndex,
} from "@/lib/bandori-public-asset-index";

import { createPublicAssetIndexStore as createBandoriPublicAssetIndexStore } from "@/lib/public-asset-index-client";
export { createPublicAssetIndexStore as createBandoriPublicAssetIndexStore, type PublicAssetIndexStore as BandoriPublicAssetIndexStore, type PublicAssetIndexStoreState as BandoriPublicAssetIndexStoreState } from "@/lib/public-asset-index-client";

export const bandoriCardsAssetIndexStore = createBandoriPublicAssetIndexStore<BandoriCardsAssetIndex>({
  parse: parseBandoriCardsAssetIndex,
});

export const bandoriCostumesAssetIndexStore = createBandoriPublicAssetIndexStore({
  parse: parseBandoriCostumesAssetIndex,
});

export const bandoriLiveSdAssetIndexStore = createBandoriPublicAssetIndexStore({
  parse: parseBandoriLiveSdAssetIndex,
});

export const bandoriDegreesAssetIndexStore = createBandoriPublicAssetIndexStore<BandoriDegreesAssetIndex>({
  parse: parseBandoriDegreesAssetIndex,
});

export const bandoriEventsAssetIndexStore = createBandoriPublicAssetIndexStore<BandoriEventsAssetIndex>({
  parse: parseBandoriEventsAssetIndex,
});

export const bandoriMusicAssetIndexStore = createBandoriPublicAssetIndexStore<BandoriMusicAssetIndex>({
  parse: parseBandoriMusicAssetIndex,
});

export const bandoriStampsAssetIndexStore = createBandoriPublicAssetIndexStore<BandoriStampsAssetIndex>({
  parse: parseBandoriStampsAssetIndex,
});
