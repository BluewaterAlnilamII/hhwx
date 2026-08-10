import { pickBandoriRegionalText, type BandoriServer } from "@/lib/bandori-server";

export type BandoriBandNameRecord = {
  bandName?: readonly unknown[] | string;
};

export const BANDORI_EVENT_BAND_ID_BY_SLUG = {
  ppp: 1,
  ag: 2,
  hhw: 3,
  pp: 4,
  roselia: 5,
  ras: 18,
  morfonica: 21,
  mygo: 45,
} as const satisfies Record<string, number>;

export function getBandoriEventBandId(eventBand: string | null): number | null {
  if (!eventBand || eventBand === "mix") return null;
  return BANDORI_EVENT_BAND_ID_BY_SLUG[eventBand as keyof typeof BANDORI_EVENT_BAND_ID_BY_SLUG] ?? null;
}

export function resolveBandoriEventBandName(
  eventBand: string | null,
  bands: Record<string, BandoriBandNameRecord | null | undefined>,
  server: BandoriServer,
): string {
  if (eventBand === "mix") return "混合乐队";
  const bandId = getBandoriEventBandId(eventBand);
  if (bandId === null) return "-";
  const bandName = bands[String(bandId)]?.bandName;
  if (typeof bandName === "string") return bandName.trim() || "-";
  return pickBandoriRegionalText(bandName, server, server) ?? "-";
}
