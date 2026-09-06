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
  ["jp", "japan", "日", "日服", "日版"],
  ["en", "ww", "worldwide", "english", "international", "intl", "英", "英服", "英版", "国际", "国际服", "国际版"],
  ["tw", "taiwan", "台", "台服", "台版"],
  ["cn", "china", "国", "国服", "国版"],
] as const;

export function normalizeBandoriSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim().replace(/\s+/gu, " ");
}

const bandPhrases = Object.values(BANDORI_SEARCH_BAND_ALIASES)
  .flat().filter((alias) => alias.includes(" "))
  .map((alias) => alias.split(" "))
  .sort((left, right) => right.length - left.length);

export type BandoriSearchToken = { value: string; nameOnly: boolean };

export function tokenizeBandoriSearch(query: string): BandoriSearchToken[] {
  const words = normalizeBandoriSearchText(query).match(/\/?"[^"]*(?:"|$)|\/?“[^”]*(?:”|$)|\S+/gu) ?? [];
  const tokens: BandoriSearchToken[] = [];
  for (let index = 0; index < words.length;) {
    const word = words[index];
    const value = word.startsWith("/") ? word.slice(1) : word;
    const quote = value.startsWith('"') ? '"' : value.startsWith("“") ? "”" : null;
    if (word.startsWith("/") || quote !== null) {
      tokens.push({
        value: (quote === null ? value : value.slice(1, value.length > 1 && value.endsWith(quote) ? -1 : undefined)).trim(),
        nameOnly: true,
      });
      index += 1;
      continue;
    }
    const phrase = bandPhrases.find((parts) => parts.every((part, offset) => words[index + offset] === part));
    tokens.push({ value: phrase ? phrase.join(" ") : word, nameOnly: false });
    index += phrase?.length ?? 1;
  }
  return tokens;
}
