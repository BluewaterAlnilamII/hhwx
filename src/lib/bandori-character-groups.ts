export type BandoriCharacterGroup = {
  key: string;
  label: string;
  bandId: number;
  characterIds: number[];
};

export const BANDORI_CHARACTER_GROUPS: BandoriCharacterGroup[] = [
  { key: "ppp", label: "Poppin'Party", bandId: 1, characterIds: [1, 2, 3, 4, 5] },
  { key: "ag", label: "Afterglow", bandId: 2, characterIds: [6, 7, 8, 9, 10] },
  { key: "hhw", label: "Hello, Happy World!", bandId: 3, characterIds: [21, 22, 23, 24, 25] },
  { key: "pp", label: "Pastel＊Palettes", bandId: 4, characterIds: [11, 12, 13, 14, 15] },
  { key: "roselia", label: "Roselia", bandId: 5, characterIds: [16, 17, 18, 19, 20] },
  { key: "morfonica", label: "Morfonica", bandId: 21, characterIds: [26, 27, 28, 29, 30] },
  { key: "ras", label: "RAISE A SUILEN", bandId: 18, characterIds: [31, 32, 33, 34, 35] },
  { key: "mygo", label: "MyGO!!!!!", bandId: 45, characterIds: [45, 46, 47, 48, 49] },
];

const BANDORI_CHARACTER_SORT_ORDER = new Map<number, number>();

BANDORI_CHARACTER_GROUPS.forEach((group, groupIndex) => {
  group.characterIds.forEach((characterId, characterIndex) => {
    BANDORI_CHARACTER_SORT_ORDER.set(characterId, groupIndex * 100 + characterIndex);
  });
});

export function compareBandoriCharacterIds(left: number, right: number): number {
  const leftOrder = BANDORI_CHARACTER_SORT_ORDER.get(left) ?? 10000 + left;
  const rightOrder = BANDORI_CHARACTER_SORT_ORDER.get(right) ?? 10000 + right;
  return leftOrder - rightOrder || left - right;
}
