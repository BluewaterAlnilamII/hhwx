import type { BandoriCardAssetVariant } from "@/lib/bandori-public-asset-index";
import { type BandoriServer } from "@/lib/bandori-server";

export type { BandoriCardAttribute } from "@/lib/bandori/cards/filter";

export type BandoriCardArtVariant = BandoriCardAssetVariant;

export type BandoriCardPickerValue = {
  cardId: number;
  entityServer: BandoriServer | null;
  trainType: BandoriCardArtVariant;
};
