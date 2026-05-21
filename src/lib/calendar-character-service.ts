import { buildBandoriResIconPublicUrl } from "@/lib/bandori-asset-proxy";

export type CalendarBandType = "ppp" | "ag" | "hhw" | "pp" | "roselia" | "morfonica" | "ras" | "mygo" | "mix";

export interface CalendarCharacter {
  characterId: number;
  characterType: string;
  bandId: number;
  colorCode: string | null;
  characterNameJp: string;
  characterNameEn: string;
  characterNameTw: string | null;
  characterNameCn: string | null;
  firstNameJp: string;
  firstNameEn: string;
  firstNameTw: string | null;
  firstNameCn: string | null;
  lastNameJp: string;
  lastNameEn: string;
  lastNameTw: string | null;
  lastNameCn: string | null;
  nicknameJp: string | null;
  nicknameEn: string | null;
  nicknameTw: string | null;
  nicknameCn: string | null;
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
    character.nicknameCn,
    character.characterNameCn,
    character.nicknameTw,
    character.characterNameTw,
    character.nicknameJp,
    character.characterNameJp,
    character.nicknameEn,
    character.characterNameEn,
  ]);
}

export function getCharacterBandType(character: CalendarCharacter | null | undefined): CalendarBandType {
  if (!character) return "mix";
  return getBandTypeByBandId(character.bandId);
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
    .sort((left, right) => left.characterId - right.characterId)
    .map((character) => ({
      id: character.characterId,
      name: getCharacterDisplayName(character) ?? `角色 ${character.characterId}`,
      bandId: character.bandId,
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
  return buildBandoriResIconPublicUrl(`chara_icon_${characterId}.png`);
}
