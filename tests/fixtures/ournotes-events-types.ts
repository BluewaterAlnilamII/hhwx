import type { OurNotesEventDetail, OurNotesEventSummary } from "../../src/lib/ournotes/events/api-contract";

type SummaryExtension = Exclude<NonNullable<OurNotesEventSummary["serverExtensions"]>[number], null>;
type DetailExtension = Exclude<NonNullable<OurNotesEventDetail["serverExtensions"]>[number], null>;

export function summaryMusicIds(event: OurNotesEventSummary, server: 0 | 1 | 2 | 3 | 4): number[] | null {
  const extension = event.serverExtensions?.[server];
  if (extension === null) return null;
  return extension?.musics ?? event.musics;
}

export function detailMusics(event: OurNotesEventDetail, server: 0 | 1 | 2 | 3 | 4): OurNotesEventDetail["musics"] | null {
  const extension = event.serverExtensions?.[server];
  if (extension === null) return null;
  return extension?.musics ?? event.musics;
}

export function extensionTypes(detail: OurNotesEventDetail) {
  // @ts-expect-error Summary overrides contain music IDs, not detail objects.
  const wrongMusic: SummaryExtension = { musics: detail.musics };
  // @ts-expect-error Stories belong to detail overrides only.
  const wrongStories: SummaryExtension = { stories: detail.stories };
  // @ts-expect-error Event rewards belong to detail overrides only.
  const wrongRewards: SummaryExtension = { pointRewards: detail.pointRewards };
  // @ts-expect-error Detail overrides contain full music objects, not IDs.
  const wrongDetail: DetailExtension = { musics: [19] };
  const validDetail: DetailExtension = { musics: detail.musics, stories: detail.stories,
    pointRewards: detail.pointRewards, pointLoopRewards: detail.pointLoopRewards, rankingRewards: detail.rankingRewards,
    imageAsset: "", logoAsset: "logo", backgroundAsset: "", bannerAsset: "Banner_1" };
  const validSummary: SummaryExtension = { imageAsset: "", logoAsset: "logo", backgroundAsset: "", bannerAsset: "Banner_1" };
  // @ts-expect-error Asset overrides preserve strings, including empty strings, but never null.
  const wrongAsset: SummaryExtension = { bannerAsset: null };
  return [wrongMusic, wrongStories, wrongRewards, wrongDetail, validDetail, validSummary, wrongAsset];
}
