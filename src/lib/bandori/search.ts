import { SEARCH_SERVER_ALIASES, tokenizeSearch } from "@/lib/catalog-search";
export { normalizeSearchText as normalizeBandoriSearchText, type SearchToken as BandoriSearchToken } from "@/lib/catalog-search";

// Reviewed exact aliases shared by catalog searches; do not infer nicknames.
export const BANDORI_SEARCH_BAND_ALIASES: Readonly<Record<number, readonly string[]>> = {
  1: ["poppin'party","poppinparty","popipa","ppp","ポピパ"],
  2: ["afterglow","afro","ag"],
  3: ["hello, happy world!","hellohappyworld!","hellohappyworld","harohappy","hhw","ハロハピ","harohapi"],
  4: ["pastel*palettes","pastelpalettes","pasupare","pastel","p*p","pp","パスパレ"],
  5: ["roselia","rose","r"],
  21: ["morfonica","morfo","monika","monica","mf","蝶团","蝶團","モニカ","m"],
  18: ["raise a suilen","raiseasuilen","ras","raise","suilen"],
  45: ["mygo!!!!!","mygo","mg","go"],
};

export const BANDORI_SEARCH_SERVER_ALIASES = [
  SEARCH_SERVER_ALIASES.jp, SEARCH_SERVER_ALIASES.en, SEARCH_SERVER_ALIASES.tw, SEARCH_SERVER_ALIASES.cn,
] as const;

const bandPhrases = Object.values(BANDORI_SEARCH_BAND_ALIASES).flat().filter((alias) => alias.includes(" ")).map((alias) => alias.split(" ")).sort((a, b) => b.length - a.length);
export function tokenizeBandoriSearch(query: string) { return tokenizeSearch(query, bandPhrases); }
