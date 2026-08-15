import { isBandoriServer, type BandoriServer } from "@/lib/bandori-server";

export const DEFAULT_DISPLAY_DEGREE_SERVER: BandoriServer = 0;
export const DEFAULT_DISPLAY_DEGREE_ID = 100;
export const CURRENT_GAME_BINDING_SERVER: BandoriServer = 3;

export type AccountDisplayDegreeSelection = {
  server: BandoriServer;
  degreeId: number;
};

export type AccountDisplayDegreeBinding = {
  server: BandoriServer;
  gameUid: string;
  ownedDegreeIds: number[];
};

export type AccountDisplayDegreeOptions = {
  selected: AccountDisplayDegreeSelection;
  accounts: AccountDisplayDegreeBinding[];
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
): AccountDisplayDegreeSelection {
  if (isBandoriServer(server) && isDisplayDegreeId(degreeId)) {
    return { server, degreeId };
  }
  return {
    server: DEFAULT_DISPLAY_DEGREE_SERVER,
    degreeId: DEFAULT_DISPLAY_DEGREE_ID,
  };
}

export function parseDisplayDegreeRequest(
  value: unknown,
): AccountDisplayDegreeSelection | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== 2
    || !Object.hasOwn(value, "server")
    || !Object.hasOwn(value, "degreeId")
    || !isBandoriServer(value.server)
    || !isDisplayDegreeId(value.degreeId)
  ) {
    return null;
  }
  return { server: value.server, degreeId: value.degreeId };
}

export function compareDisplayDegreeSelections(
  left: AccountDisplayDegreeSelection,
  right: AccountDisplayDegreeSelection,
): boolean {
  return left.server === right.server && left.degreeId === right.degreeId;
}

export function sortDisplayDegreeBindings(
  bindings: readonly AccountDisplayDegreeBinding[],
): AccountDisplayDegreeBinding[] {
  return [...bindings].sort((left, right) => (
    left.server - right.server
    || left.gameUid.localeCompare(right.gameUid, "en", { numeric: true })
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
    ) {
      return null;
    }
    accounts.push({
      server: candidate.server,
      gameUid: candidate.gameUid,
      ownedDegreeIds: [...new Set(candidate.ownedDegreeIds)].sort((left, right) => left - right),
    });
  }
  return { selected, accounts: sortDisplayDegreeBindings(accounts) };
}
