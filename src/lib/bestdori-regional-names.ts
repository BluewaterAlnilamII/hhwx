import {
  getBandoriRegionalDisplayOrder,
  type BandoriServer,
} from "@/lib/bandori-server";

export function pickBestdoriRegionalName(
  names: readonly (string | null | undefined)[] | null | undefined,
  preferredServer: BandoriServer,
  contextServer?: BandoriServer | null,
): string | null {
  if (!Array.isArray(names)) {
    return null;
  }

  for (const index of getBandoriRegionalDisplayOrder(preferredServer, contextServer)) {
    const name = names[index]?.trim();
    if (name) {
      return name;
    }
  }
  return null;
}

export function pickBestdoriLocalizedName(
  names: readonly (string | null | undefined)[] | null | undefined,
  preferredServer: BandoriServer,
  contextServer?: BandoriServer | null,
): string | null {
  return pickBestdoriRegionalName(names, preferredServer, contextServer);
}
