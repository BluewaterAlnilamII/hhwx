import { CALENDAR_BAND_ORDER, getBandDisplayName } from "@/lib/calendar-character-service";

export interface CalendarBandOption {
  value: string;
  label: string;
}

export const CALENDAR_BAND_OPTIONS: CalendarBandOption[] = CALENDAR_BAND_ORDER.map((band) => ({
  value: band,
  label: getBandDisplayName(band),
}));
