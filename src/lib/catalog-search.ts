export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim().replace(/\s+/gu, " ");
}

export const SEARCH_SERVER_ALIASES = {
  jp: ["jp", "japan", "日", "日服", "日版"],
  en: ["en", "ww", "worldwide", "english", "international", "intl", "英", "英服", "英版", "国际", "国际服", "国际版"],
  tw: ["tw", "taiwan", "台", "台服", "台版"],
  cn: ["cn", "china", "国", "国服", "国版"],
  kr: ["kr", "korea", "韩", "韓", "韩服", "韓服", "韩版", "韓版"],
} as const;

export function compareSearchValue(candidate: number, value: number, operator: string): boolean {
  return operator === ">" ? candidate > value
    : operator === "<" ? candidate < value
    : operator === "+" || operator === ">=" ? candidate >= value
    : candidate <= value;
}

export type SearchToken = { value: string; nameOnly: boolean };

export function tokenizeSearch(query: string, phrases: readonly (readonly string[])[] = []): SearchToken[] {
  const words = normalizeSearchText(query).match(/\/?"[^"]*(?:"|$)|\/?“[^”]*(?:”|$)|\S+/gu) ?? [];
  const tokens: SearchToken[] = [];
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
    const phrase = phrases.find((parts) => parts.every((part, offset) => words[index + offset] === part));
    tokens.push({ value: phrase ? phrase.join(" ") : word, nameOnly: false });
    index += phrase?.length ?? 1;
  }
  return tokens;
}
