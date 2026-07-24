import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { type BandoriServer } from "@/lib/bandori-server";

export type BandoriCardArtVariant = "normal" | "after_training";

export type BandoriCardPickerValue = {
  cardId: number;
  entityServer: BandoriServer | null;
  trainType: BandoriCardArtVariant;
};

export type BandoriCardAttribute = "powerful" | "pure" | "cool" | "happy";

export type BandoriCardCatalogEntry = {
  cardId: number;
  cardRef: string;
  entityServer: BandoriServer | null;
  characterId: number;
  skillId: number | null;
  characterName: string;
  bandId: number | null;
  rarity: number;
  attribute: BandoriCardAttribute | null;
  levelLimit: number;
  trainingLevelLimit: number;
  resourceSetName: string;
  assetRegion: BandoriAssetRegion;
  displayName: string;
  searchText: string;
  releasedAtJp: number;
  releasedAtCn: number;
  hasTrainedArt: boolean;
};

export type BandoriCardPickerSortBy = "release_jp" | "release_cn" | "id";
export type BandoriCardPickerSortDirection = "desc" | "asc";

export type BandoriCardPickerFilter = {
  query: string;
  bandIds: number[];
  attributes: BandoriCardAttribute[];
  rarities: number[];
  characterIds: number[];
  sortBy: BandoriCardPickerSortBy;
  sortDirection: BandoriCardPickerSortDirection;
};
