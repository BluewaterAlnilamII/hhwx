export type CalendarBandType = "ppp" | "ag" | "hhw" | "pp" | "roselia" | "morfonica" | "ras" | "mygo" | "mix";

export interface CalendarCharacter {
  character_id: number;
  character_type: string;
  band_id: number;
  color_code: string | null;
  character_name_jp: string;
  character_name_en: string;
  character_name_tw: string | null;
  character_name_cn: string | null;
  first_name_jp: string;
  first_name_en: string;
  first_name_tw: string | null;
  first_name_cn: string | null;
  last_name_jp: string;
  last_name_en: string;
  last_name_tw: string | null;
  last_name_cn: string | null;
  nickname_jp: string | null;
  nickname_en: string | null;
  nickname_tw: string | null;
  nickname_cn: string | null;
}

export interface StampCharacterOption {
  id: number;
  name: string;
  bandId: number;
}

export const BAND_COLORS: Record<CalendarBandType, string> = {
  ppp: "#FF3377",
  ag: "#EE3344",
  pp: "#33DDAA",
  roselia: "#3344AA",
  hhw: "#FFDD00",
  morfonica: "#33AAFF",
  ras: "#33CCCC",
  mygo: "#3388BB",
  mix: "#888888",
};

export const BAND_FULL_NAMES: Record<CalendarBandType, string> = {
  ppp: "Poppin'Party",
  ag: "Afterglow",
  hhw: "Hello, Happy World!",
  pp: "Pastel*Palettes",
  roselia: "Roselia",
  morfonica: "Morfonica",
  ras: "RAISE A SUILEN",
  mygo: "MyGO!!!!!",
  mix: "混活",
};

export const BAND_ID_TO_TYPE: Record<number, CalendarBandType> = {
  1: "ppp",
  2: "ag",
  3: "hhw",
  4: "pp",
  5: "roselia",
  18: "ras",
  21: "morfonica",
  45: "mygo",
};

export const CALENDAR_BAND_ORDER: CalendarBandType[] = ["ppp", "ag", "hhw", "pp", "roselia", "morfonica", "ras", "mygo", "mix"];

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function getBandTypeByBandId(bandId: number | null | undefined): CalendarBandType {
  if (!bandId) return "mix";
  return BAND_ID_TO_TYPE[bandId] ?? "mix";
}

export function getBandDisplayName(bandType: string): string {
  return BAND_FULL_NAMES[(bandType as CalendarBandType)] ?? BAND_FULL_NAMES.mix;
}

export function getCharacterDisplayName(character: CalendarCharacter | null | undefined): string | null {
  if (!character) return null;

  return firstNonEmpty([
    character.nickname_cn,
    character.character_name_cn,
    character.nickname_tw,
    character.character_name_tw,
    character.nickname_jp,
    character.character_name_jp,
    character.nickname_en,
    character.character_name_en,
  ]);
}

export function getCharacterBandType(character: CalendarCharacter | null | undefined): CalendarBandType {
  if (!character) return "mix";
  return getBandTypeByBandId(character.band_id);
}

export function formatCalendarEventTitle(
  bandType: string,
  eventId: number,
  eventName: string,
  stampCharacter?: CalendarCharacter | null,
): string {
  const segments = [getBandDisplayName(bandType), `${eventId}期`];
  const characterName = getCharacterDisplayName(stampCharacter);
  if (characterName) {
    segments.push(characterName);
  }
  return `${segments.join(" ")} : ${eventName}`;
}

export function formatCalendarSubscriptionTitle(
  bandType: string,
  eventId: number,
  eventName: string,
  stampCharacter?: CalendarCharacter | null,
): string {
  return `🎸 ${formatCalendarEventTitle(bandType, eventId, eventName, stampCharacter)} - BanGDream梦想协奏曲`;
}

export function buildStampCharacterOptions(characters: CalendarCharacter[]): StampCharacterOption[] {
  return [...characters]
    .sort((left, right) => left.character_id - right.character_id)
    .map((character) => ({
      id: character.character_id,
      name: getCharacterDisplayName(character) ?? `角色 ${character.character_id}`,
      bandId: character.band_id,
    }));
}

export function getCalendarEventColors(
  bandType: string,
  stampCharacter?: CalendarCharacter | null,
): { primaryColor: string; secondaryColor: string | null } {
  const normalizedBand = (bandType as CalendarBandType) in BAND_COLORS ? (bandType as CalendarBandType) : "mix";
  if (normalizedBand === "mix" && stampCharacter) {
    const stampBand = getCharacterBandType(stampCharacter);
    return {
      primaryColor: BAND_COLORS.mix,
      secondaryColor: BAND_COLORS[stampBand] ?? BAND_COLORS.mix,
    };
  }

  return {
    primaryColor: BAND_COLORS[normalizedBand],
    secondaryColor: null,
  };
}

export function getSubscriptionEventColor(
  bandType: string,
  stampCharacter?: CalendarCharacter | null,
): string {
  const normalizedBand = (bandType as CalendarBandType) in BAND_COLORS ? (bandType as CalendarBandType) : "mix";
  if (normalizedBand === "mix") {
    if (stampCharacter) {
      return BAND_COLORS[getCharacterBandType(stampCharacter)] ?? "#FFDD00";
    }
    return "#FFDD00";
  }
  return BAND_COLORS[normalizedBand] ?? "#FFDD00";
}

export function getCharacterIconUrl(characterId: number): string {
  return `/res/bandori/icon/chara_icon_${characterId}.png`;
}