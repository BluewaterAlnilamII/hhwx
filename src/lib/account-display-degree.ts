import { isBandoriServer, type BandoriServer } from "@/lib/bandori-server";
import type { BandoriDegreeCatalogItem } from "@/lib/bandori-degree-assets";

export const DEFAULT_DISPLAY_DEGREE_SERVER: BandoriServer = 0;
export const DEFAULT_DISPLAY_DEGREE_ID = 100;
export const CURRENT_GAME_BINDING_SERVER: BandoriServer = 3;

export type AccountDisplayDegreeSelection = {
  server: BandoriServer;
  degreeId: number;
  degreeEffectId: number | null;
};

export type AccountDisplayDegreeBinding = {
  server: BandoriServer;
  gameUid: string;
  ownedDegreeIds: number[];
  ownedDegreeEffectIds: number[];
};

export type AccountDisplayDegreeOptions = {
  selected: AccountDisplayDegreeSelection;
  accounts: AccountDisplayDegreeBinding[];
};

export type AccountDisplayDegreeVariant = {
  degree: BandoriDegreeCatalogItem;
  degreeEffectId: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDisplayDegreeId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function normalizeStoredDisplayDegree(
  server: unknown,
  degreeId: unknown,
  degreeEffectId?: unknown,
): AccountDisplayDegreeSelection {
  if (isBandoriServer(server) && isDisplayDegreeId(degreeId)) {
    return {
      server,
      degreeId,
      degreeEffectId: server === CURRENT_GAME_BINDING_SERVER
        && isDisplayDegreeId(degreeEffectId)
        ? degreeEffectId
        : null,
    };
  }
  return {
    server: DEFAULT_DISPLAY_DEGREE_SERVER,
    degreeId: DEFAULT_DISPLAY_DEGREE_ID,
    degreeEffectId: null,
  };
}

export function parseDisplayDegreeRequest(
  value: unknown,
): AccountDisplayDegreeSelection | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  const hasDegreeEffectId = Object.hasOwn(value, "degreeEffectId");
  if (
    (keys.length !== 2 && keys.length !== 3)
    || !Object.hasOwn(value, "server")
    || !Object.hasOwn(value, "degreeId")
    || (keys.length === 3 && !hasDegreeEffectId)
    || !isBandoriServer(value.server)
    || !isDisplayDegreeId(value.degreeId)
    || (hasDegreeEffectId
      && value.degreeEffectId !== null
      && !isDisplayDegreeId(value.degreeEffectId))
    || (hasDegreeEffectId
      && value.degreeEffectId !== null
      && value.server !== CURRENT_GAME_BINDING_SERVER)
  ) {
    return null;
  }
  return {
    server: value.server,
    degreeId: value.degreeId,
    degreeEffectId: hasDegreeEffectId ? value.degreeEffectId as number | null : null,
  };
}

export function compareDisplayDegreeSelections(
  left: AccountDisplayDegreeSelection,
  right: AccountDisplayDegreeSelection,
): boolean {
  return left.server === right.server
    && left.degreeId === right.degreeId
    && left.degreeEffectId === right.degreeEffectId;
}

export function sortDisplayDegreeBindings(
  bindings: readonly AccountDisplayDegreeBinding[],
): AccountDisplayDegreeBinding[] {
  return [...bindings].sort((left, right) => (
    left.server - right.server
    || left.gameUid.localeCompare(right.gameUid, "en", { numeric: true })
  ));
}

export function getAccountDisplayDegreeVariants(
  account: AccountDisplayDegreeBinding,
  degreesById: ReadonlyMap<number, BandoriDegreeCatalogItem> | undefined,
): AccountDisplayDegreeVariant[] {
  if (!degreesById) return [];
  const ownedEffectIds = new Set(account.ownedDegreeEffectIds);
  return account.ownedDegreeIds
    .flatMap((degreeId): AccountDisplayDegreeVariant[] => {
      const degree = degreesById.get(degreeId);
      if (!degree) return [];
      const variants: AccountDisplayDegreeVariant[] = [{ degree, degreeEffectId: null }];
      const degreeEffectId = degree.degreeEffect?.biliDegreeEffectId;
      if (degreeEffectId && ownedEffectIds.has(degreeEffectId)) {
        variants.push({ degree, degreeEffectId });
      }
      return variants;
    })
    .sort((left, right) => (
      left.degree.seq - right.degree.seq
      || left.degree.id - right.degree.id
      || Number(left.degreeEffectId !== null) - Number(right.degreeEffectId !== null)
    ));
}

export function parseAccountDisplayDegreeOptions(
  value: unknown,
): AccountDisplayDegreeOptions | null {
  if (!isRecord(value) || !Array.isArray(value.accounts)) return null;
  const selected = parseDisplayDegreeRequest(value.selected);
  if (!selected) return null;

  const accounts: AccountDisplayDegreeBinding[] = [];
  for (const candidate of value.accounts) {
    if (
      !isRecord(candidate)
      || !isBandoriServer(candidate.server)
      || typeof candidate.gameUid !== "string"
      || !/^[1-9]\d{3,15}$/u.test(candidate.gameUid)
      || !Array.isArray(candidate.ownedDegreeIds)
      || candidate.ownedDegreeIds.some((degreeId) => !isDisplayDegreeId(degreeId))
      || (Object.hasOwn(candidate, "ownedDegreeEffectIds")
        && (
          !Array.isArray(candidate.ownedDegreeEffectIds)
          || candidate.ownedDegreeEffectIds.some((effectId) => !isDisplayDegreeId(effectId))
        ))
    ) {
      return null;
    }
    accounts.push({
      server: candidate.server,
      gameUid: candidate.gameUid,
      ownedDegreeIds: [...new Set(candidate.ownedDegreeIds)].sort((left, right) => left - right),
      ownedDegreeEffectIds: Array.isArray(candidate.ownedDegreeEffectIds)
        ? [...new Set(candidate.ownedDegreeEffectIds)].sort((left, right) => left - right)
        : [],
    });
  }
  return { selected, accounts: sortDisplayDegreeBindings(accounts) };
}
