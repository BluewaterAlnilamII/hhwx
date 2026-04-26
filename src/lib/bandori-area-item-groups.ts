export type BandoriAreaItemGroup = {
  key: string;
  label: string;
  itemIds: number[];
};

export const BANDORI_AREA_ITEM_GROUPS: BandoriAreaItemGroup[] = [
  { key: "PoppinParty", label: "Poppin'Party 道具", itemIds: [1, 6, 11, 16, 21, 26, 31] },
  { key: "Afterglow", label: "Afterglow 道具", itemIds: [2, 7, 12, 17, 22, 27, 32] },
  { key: "HelloHappyWorld", label: "Hello, Happy World! 道具", itemIds: [5, 10, 15, 20, 25, 30, 35] },
  { key: "PastelPalettes", label: "Pastel＊Palettes 道具", itemIds: [3, 8, 13, 18, 23, 28, 33] },
  { key: "Roselia", label: "Roselia 道具", itemIds: [4, 9, 14, 19, 24, 29, 34] },
  { key: "Morfonica", label: "Morfonica 道具", itemIds: [83, 84, 85, 86, 87, 88, 89] },
  { key: "RaiseASuilen", label: "RAISE A SUILEN 道具", itemIds: [90, 91, 92, 93, 94, 95, 96] },
  { key: "MyGO", label: "MyGO!!!!! 道具", itemIds: [97, 98, 99, 100, 101, 102, 103] },
  { key: "Everyone", label: "Everyone 道具", itemIds: [73, 74, 75, 76, 77, 78, 79] },
  { key: "Magazine", label: "Magazine 道具", itemIds: [80, 81, 82] },
  { key: "Plaza", label: "Plaza 道具", itemIds: [66, 67, 69, 70] },
  { key: "Menu", label: "Menu 道具", itemIds: [56, 57, 58, 60] },
];

export const BANDORI_AREA_ITEM_IDS_BY_GROUP = Object.fromEntries(
  BANDORI_AREA_ITEM_GROUPS.map((group) => [group.key, group.itemIds]),
) as Record<string, number[]>;

export const BANDORI_AREA_ITEM_IDS = new Set(BANDORI_AREA_ITEM_GROUPS.flatMap((group) => group.itemIds));

export function orderBandoriAreaItems<T>(items: Record<string, T>): Record<string, T> {
  const orderedItems: Record<string, T> = {};
  BANDORI_AREA_ITEM_GROUPS.forEach((group) => {
    const item = items[group.key];
    if (item !== undefined) {
      orderedItems[group.key] = item;
    }
  });

  Object.entries(items).forEach(([key, item]) => {
    if (!(key in orderedItems)) {
      orderedItems[key] = item;
    }
  });

  return orderedItems;
}
