import { OURNOTES_SLOTS, type OurNotesServer, type OurNotesText } from "./master-contract";

export const OURNOTES_SERVERS = [0, 1, 2, 3, 4] as const;
// Presentation codes are separate from the stable five-slot wire identifiers.
export const OURNOTES_SERVER_CODES = ["jp", "en", "tw", "cn", "kr"] as const;
export const DEFAULT_OURNOTES_PREFERRED_SERVER = 3;

export function normalizeOurNotesServer(value: unknown): OurNotesServer | null {
  if (typeof value === "string" && /^[0-4]$/u.test(value)) return Number(value) as OurNotesServer;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4
    ? value as OurNotesServer : null;
}

export function getOurNotesServerFromCode(value: unknown): OurNotesServer | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  const index = OURNOTES_SLOTS.findIndex((slot, index) => slot === code || OURNOTES_SERVER_CODES[index] === code);
  return index >= 0 ? index as OurNotesServer : null;
}

export function pickAvailableOurNotesServer(available: readonly OurNotesServer[], preferred: OurNotesServer): OurNotesServer | null {
  return [preferred, ...OURNOTES_SERVERS].find((server) => available.includes(server)) ?? null;
}

// Generic filter labels may fall back; card fields stay in the card's resolved region.
export function pickOurNotesRegionalText(text: OurNotesText | undefined, preferred: OurNotesServer): string {
  return [preferred, ...OURNOTES_SERVERS].map((server) => text?.[server]?.trim()).find(Boolean) ?? "";
}
