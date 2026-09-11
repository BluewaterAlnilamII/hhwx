import { buildBandoriDeckRankSpriteUrls } from "@/lib/bandori-builtin-resources";

type Rect = readonly [x: number, y: number, width: number, height: number];

// JP 10.1.3 MenuAtlas/RankNumberAtlas: trimmed PNG rectangles on the original canvas.
const SYMBOL_RECTS: Record<string, Rect> = {
  hyphen: [39, 41, 23, 17],
  c: [10, 7, 74, 86],
  b: [18, 7, 67, 86],
  a: [10, 7, 78, 87],
  s: [18, 5, 63, 90],
  ss: [1, 5, 98, 90],
  sss: [2, 0, 135, 90],
};
const COMMON_DIGITS: Record<string, Rect> = {
  1: [14, 4, 22, 43], 2: [9, 5, 32, 42], 3: [9, 5, 32, 43],
};
const SS_DIGITS: Record<string, Rect> = {
  0: [11, 4, 32, 43], 1: [13, 4, 23, 43], 2: [11, 4, 32, 42],
  3: [11, 4, 32, 43], 4: [10, 4, 34, 43], 5: [11, 5, 32, 42],
  6: [11, 4, 32, 43], 7: [10, 5, 33, 42], 8: [11, 4, 32, 43],
  9: [11, 4, 32, 43],
};
const SSS_DIGITS: Record<string, Rect> = {
  1: [12, 4, 24, 43], 2: [6, 4, 42, 42], 3: [11, 4, 32, 43],
  4: [6, 4, 38, 43], 5: [11, 5, 32, 45],
};

// BandDeckRankLevel.adjustLevelUI/UIGrid, relative to the 50×50 symbol's top-left.
const DIGIT_SLOTS: Record<number, readonly Rect[]> = {
  0: [],
  1: [[31.5, 22, 25, 25]],
  2: [[26, 22, 25, 25], [37, 22, 25, 25]],
  3: [[24.67, 27.5, 19.5, 19.5], [33.25, 27.5, 19.5, 19.5], [41.83, 27.5, 19.5, 19.5]],
};

function placeSprite(src: string | null, rect: Rect, canvasWidth: number, canvasHeight: number, slot: Rect) {
  return {
    src,
    x: slot[0] + rect[0] * slot[2] / canvasWidth,
    y: slot[1] + rect[1] * slot[3] / canvasHeight,
    width: rect[2] * slot[2] / canvasWidth,
    height: rect[3] * slot[3] / canvasHeight,
  };
}

/** Ordered back-to-front in a 50×50 coordinate space; digits may overflow right. */
export function getBandoriDeckRankLayout(rank: string, level: number | null) {
  const urls = buildBandoriDeckRankSpriteUrls(rank, level);
  if (!urls || urls.digits.length > 3) return null;
  const symbol = placeSprite(urls.symbol, SYMBOL_RECTS[rank], rank === "sss" ? 140 : 100, rank === "sss" ? 90 : 100, [0, 0, 50, 50]);
  const digitRects = rank === "sss" ? SSS_DIGITS : rank === "ss" ? SS_DIGITS : COMMON_DIGITS;
  return [symbol, ...urls.digits.map((src, index) => placeSprite(src, digitRects[String(level)[index]], 50, 50, DIGIT_SLOTS[urls.digits.length][index]))];
}
