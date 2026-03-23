export interface CalendarBandOption {
  value: string;
  label: string;
}

export interface StampCharacterOption {
  id: number;
  name: string;
  bandId: number;
}

export const CALENDAR_BAND_SHORT_LABELS: Record<string, string> = {
  ppp: "PPP",
  ag: "AG",
  hhw: "HHW",
  pp: "PP",
  roselia: "Roselia",
  morfonica: "Morfonica",
  ras: "RAS",
  mygo: "MyGO",
  avemujica: "AveMujica",
  mix: "MIX",
};

export function getCalendarBandShortLabel(bandType: string): string {
  return CALENDAR_BAND_SHORT_LABELS[bandType] ?? CALENDAR_BAND_SHORT_LABELS.mix;
}

export function formatCalendarEventTitle(bandType: string, eventId: number, eventName: string): string {
  return `${getCalendarBandShortLabel(bandType)} ${eventId}期 : ${eventName}`;
}

export function formatCalendarSubscriptionTitle(bandType: string, eventId: number, eventName: string): string {
  return `🎸 ${formatCalendarEventTitle(bandType, eventId, eventName)} - BanGDream梦想协奏曲`;
}

export const CALENDAR_BAND_OPTIONS: CalendarBandOption[] = [
  { value: "ppp", label: "Poppin'Party" },
  { value: "ag", label: "Afterglow" },
  { value: "hhw", label: "Hello, Happy World!" },
  { value: "pp", label: "Pastel*Palettes" },
  { value: "roselia", label: "Roselia" },
  { value: "morfonica", label: "Morfonica" },
  { value: "ras", label: "RAISE A SUILEN" },
  { value: "mygo", label: "MyGO!!!!!" },
  { value: "mix", label: "混活 / 其他" },
];

export const STAMP_CHARACTER_OPTIONS: StampCharacterOption[] = [
  { id: 1, name: "户山 香澄", bandId: 1 },
  { id: 2, name: "花园 多惠", bandId: 1 },
  { id: 3, name: "牛込 里美", bandId: 1 },
  { id: 4, name: "山吹 沙绫", bandId: 1 },
  { id: 5, name: "市谷 有咲", bandId: 1 },
  { id: 6, name: "美竹 兰", bandId: 2 },
  { id: 7, name: "青叶 摩卡", bandId: 2 },
  { id: 8, name: "上原 绯玛丽", bandId: 2 },
  { id: 9, name: "宇田川 巴", bandId: 2 },
  { id: 10, name: "羽泽 鸫", bandId: 2 },
  { id: 11, name: "弦卷 心", bandId: 3 },
  { id: 12, name: "濑田 薰", bandId: 3 },
  { id: 13, name: "北泽 育美", bandId: 3 },
  { id: 14, name: "松原 花音", bandId: 3 },
  { id: 15, name: "米歇尔", bandId: 3 },
  { id: 16, name: "丸山 彩", bandId: 4 },
  { id: 17, name: "冰川 日菜", bandId: 4 },
  { id: 18, name: "白鹭 千圣", bandId: 4 },
  { id: 19, name: "大和 麻弥", bandId: 4 },
  { id: 20, name: "若宫 伊芙", bandId: 4 },
  { id: 21, name: "凑 友希那", bandId: 5 },
  { id: 22, name: "冰川 纱夜", bandId: 5 },
  { id: 23, name: "今井 莉莎", bandId: 5 },
  { id: 24, name: "宇田川 亚子", bandId: 5 },
  { id: 25, name: "白金 燐子", bandId: 5 },
  { id: 26, name: "仓田 真白", bandId: 21 },
  { id: 27, name: "桐谷 透子", bandId: 21 },
  { id: 28, name: "广町 七深", bandId: 21 },
  { id: 29, name: "二叶 筑紫", bandId: 21 },
  { id: 30, name: "八潮 瑠唯", bandId: 21 },
  { id: 31, name: "和奏 瑞依", bandId: 18 },
  { id: 32, name: "朝日 六花", bandId: 18 },
  { id: 33, name: "佐藤 益木", bandId: 18 },
  { id: 34, name: "鳰原 令王那", bandId: 18 },
  { id: 35, name: "珠手 知由", bandId: 18 },
  { id: 36, name: "高松 灯", bandId: 45 },
  { id: 37, name: "千早 爱音", bandId: 45 },
  { id: 38, name: "要 乐奈", bandId: 45 },
  { id: 39, name: "长崎 爽世", bandId: 45 },
  { id: 40, name: "椎名 立希", bandId: 45 },
];
