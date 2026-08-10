import {
  type BandoriCardAttribute,
  type BandoriCardFilterState,
  type BandoriCardPickerSortBy as SharedBandoriCardPickerSortBy,
} from "@/lib/bandori-card-filter";
import { type BandoriServer } from "@/lib/bandori-server";

export type { BandoriCardAttribute } from "@/lib/bandori-card-filter";

export type BandoriCardArtVariant = "normal" | "after_training";

export type BandoriCardPickerValue = {
  cardId: number;
  entityServer: BandoriServer | null;
  trainType: BandoriCardArtVariant;
};

export type BandoriCardCatalogEntry = {
  cardId: number;
  cardRef: string;
  entityServer: BandoriServer | null;
  availableServers: readonly BandoriServer[];
  characterId: number;
  skillId: number | null;
  characterName: string;
  bandId: number | null;
  rarity: number;
  attribute: BandoriCardAttribute | null;
  levelLimit: number;
  trainingLevelLimit: number;
  resourceSetName: string;
  type?: string;
  displayName: string;
  searchText: string;
  releaseTimestamps: readonly [number, number, number, number];
  availableArtVariants: readonly BandoriCardArtVariant[];
  hasTrainedArt: boolean;
};

export type BandoriCardPickerSortBy = SharedBandoriCardPickerSortBy;
export type BandoriCardPickerSortDirection = "desc" | "asc";

export type BandoriCardPickerFilter = BandoriCardFilterState<BandoriCardPickerSortBy>;
