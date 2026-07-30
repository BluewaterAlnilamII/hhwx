import {
  BANDORI_SERVER_COUNT,
  getBandoriRegionalDisplayOrder,
  getBandoriServerCode,
  normalizeBandoriServer,
  type BandoriServer,
} from "@/lib/bandori-server";

/*
 * Resolves the four-server Cards snapshot extension without leaking regional
 * branching into calculator hot paths. The canonical record stays untouched;
 * non-empty overrides replace top-level fields, including the whole stat object.
 * A null override value deletes that field; a null slot means the whole card is absent.
 */

export const BANDORI_CARD_SERVER_COUNT = BANDORI_SERVER_COUNT;
export type BandoriCardServer = BandoriServer;
export type BandoriCardServerIndex = BandoriServer;
export type BandoriCardServerQuery =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "unsupported" }
  | { status: "valid"; server: BandoriCardServer };

export type BandoriCardServerExtension = Record<string, unknown>;
export type BandoriCardServerExtensions = [
  BandoriCardServerExtension | null,
  BandoriCardServerExtension | null,
  BandoriCardServerExtension | null,
  BandoriCardServerExtension | null,
];

export type BandoriCardServerExtensionDataset = "cards" | "cardDetails";

type StrictValidationOptions = {
  dataset: BandoriCardServerExtensionDataset;
  recordId: string;
};

const EXTENSION_FIELDS = new Set([
  "attribute",
  "costumeId",
  "episodes",
  "levelLimit",
  "skillId",
  "stat",
]);
const COLLISION_SUMMARY_FIELDS = new Set([
  "attribute",
  "characterId",
  "levelLimit",
  "prefix",
  "rarity",
  "releasedAt",
  "resourceSetName",
  "skillId",
  "stat",
  "type",
]);
const COLLISION_DETAIL_FIELDS = new Set([
  ...COLLISION_SUMMARY_FIELDS,
  "costumeId",
  "episodes",
  "gachaText",
  "sdResourceName",
  "skillName",
  "source",
]);
const COLLISION_SUMMARY_IDENTITY_FIELDS = ["characterId", "rarity", "resourceSetName"] as const;
const COLLISION_DETAIL_IDENTITY_FIELDS = [
  ...COLLISION_SUMMARY_IDENTITY_FIELDS,
  "sdResourceName",
] as const;
const KNOWN_ENTITY_COLLISION_CARD_IDS = new Set(
  Array.from({ length: 10 }, (_, index) => String(10001 + index)),
);
const KNOWN_ENTITY_COLLISION_SERVER_INDEXES = new Set<number>([1, 3]);
type CollisionIdentity = {
  characterId: number;
  rarity: number;
  resourceSetName: string;
  sdResourceName: string;
};
const KNOWN_ENTITY_COLLISION_IDENTITIES: Record<
  string,
  { en: CollisionIdentity; cn: CollisionIdentity }
> = {
  "10001": {
    en: { characterId: 21, rarity: 2, resourceSetName: "res021500", sdResourceName: "sd021500" },
    cn: { characterId: 22, rarity: 2, resourceSetName: "res022900", sdResourceName: "sd022002" },
  },
  "10002": {
    en: { characterId: 22, rarity: 2, resourceSetName: "res022500", sdResourceName: "sd022500" },
    cn: { characterId: 5, rarity: 2, resourceSetName: "res005900", sdResourceName: "sd005002" },
  },
  "10003": {
    en: { characterId: 23, rarity: 2, resourceSetName: "res023500", sdResourceName: "sd023500" },
    cn: { characterId: 7, rarity: 2, resourceSetName: "res007900", sdResourceName: "sd007002" },
  },
  "10004": {
    en: { characterId: 24, rarity: 2, resourceSetName: "res024500", sdResourceName: "sd024500" },
    cn: { characterId: 13, rarity: 2, resourceSetName: "res013900", sdResourceName: "sd013002" },
  },
  "10005": {
    en: { characterId: 25, rarity: 2, resourceSetName: "res025500", sdResourceName: "sd025500" },
    cn: { characterId: 16, rarity: 2, resourceSetName: "res016900", sdResourceName: "sd016002" },
  },
  "10006": {
    en: { characterId: 5, rarity: 2, resourceSetName: "res005501", sdResourceName: "sd005501" },
    cn: { characterId: 24, rarity: 2, resourceSetName: "res024900", sdResourceName: "sd024002" },
  },
  "10007": {
    en: { characterId: 24, rarity: 2, resourceSetName: "res024501", sdResourceName: "sd024501" },
    cn: { characterId: 18, rarity: 2, resourceSetName: "res018900", sdResourceName: "sd018028" },
  },
  "10008": {
    en: { characterId: 17, rarity: 2, resourceSetName: "res017501", sdResourceName: "sd017501" },
    cn: { characterId: 14, rarity: 2, resourceSetName: "res014900", sdResourceName: "sd014034" },
  },
  "10009": {
    en: { characterId: 11, rarity: 2, resourceSetName: "res011501", sdResourceName: "sd011501" },
    cn: { characterId: 18, rarity: 2, resourceSetName: "res018901", sdResourceName: "sd018028" },
  },
  "10010": {
    en: { characterId: 13, rarity: 2, resourceSetName: "res013501", sdResourceName: "sd013501" },
    cn: { characterId: 25, rarity: 2, resourceSetName: "res025900", sdResourceName: "sd025029" },
  },
};
const TOURNAMENT_CARD_IDS = new Set(["271", "272", "274", "275"]);
const MISSING_TW_EPISODE_CARD_IDS = new Set(["510", "511", "512", "513", "514"]);
const TW_SKILL_OVERRIDE_CARD_IDS = new Set(["907", "908", "910"]);
const TW_LEVEL_STAT_OVERRIDE_CARD_IDS = new Set(["1784", "1785"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeBandoriCardServer(value: unknown): BandoriCardServer | null {
  return normalizeBandoriServer(value);
}

export function getBandoriCardServerIndex(server: BandoriCardServer): BandoriCardServerIndex {
  return server;
}

export function getBandoriCardServerName(server: BandoriCardServer): string {
  return getBandoriServerCode(server);
}

export function isKnownBandoriCardEntityCollision(cardId: string | number): boolean {
  return KNOWN_ENTITY_COLLISION_CARD_IDS.has(String(cardId));
}

export function parseBandoriCardServerQuery(request: Request): BandoriCardServerQuery {
  const searchParams = new URL(request.url).searchParams;
  const queryKeys = [...searchParams.keys()];
  if (queryKeys.length === 0) {
    return { status: "absent" };
  }
  if (!queryKeys.every((key) => key === "server")) {
    return { status: "unsupported" };
  }

  const rawServers = searchParams.getAll("server");
  const server = rawServers.length === 1
    ? normalizeBandoriCardServer(rawServers[0])
    : null;
  return server !== null
    ? { status: "valid", server }
    : { status: "invalid" };
}

function readServerExtensions(
  card: object,
  label: string,
): BandoriCardServerExtensions {
  const value = (card as { serverExtensions?: unknown }).serverExtensions;
  if (!Array.isArray(value) || value.length !== BANDORI_CARD_SERVER_COUNT) {
    throw new Error(`${label} must have exactly four serverExtensions slots`);
  }

  for (const [index, extension] of value.entries()) {
    if (extension === null) {
      continue;
    }
    if (!isRecord(extension)) {
      throw new Error(`${label} has an invalid serverExtensions slot: ${index}`);
    }
    for (const field of Object.keys(extension)) {
      if (field === "serverExtensions") {
        throw new Error(`${label} serverExtensions must not override themselves`);
      }
    }
  }

  return value as BandoriCardServerExtensions;
}

export function validateBandoriCardServerExtensions(
  card: Record<string, unknown>,
  label = "Bandori card",
  strict?: StrictValidationOptions,
): void {
  const extensions = readServerExtensions(card, label);
  if (!strict) {
    validateGenericExtensionFields(extensions, label);
    return;
  }
  if (isKnownBandoriCardEntityCollision(strict.recordId)) {
    validateKnownEntityCollisionExtensions(card, extensions, label, strict);
    return;
  }
  for (const [server, extension] of extensions.entries()) {
    if (extension === null) {
      continue;
    }
    for (const [field, value] of Object.entries(extension)) {
      if (!isRegisteredExtensionField(strict.dataset, strict.recordId, server, field)) {
        throw new Error(
          `${label} has an unregistered serverExtensions field: ${field}, server=${server}`,
        );
      }
      validateExtensionFieldValue(label, field, value);
    }
  }
}

function validateGenericExtensionFields(
  extensions: BandoriCardServerExtensions,
  label: string,
): void {
  for (const extension of extensions) {
    if (extension === null) {
      continue;
    }
    for (const [field, fieldValue] of Object.entries(extension)) {
      if (field === "type") {
        throw new Error(`${label} serverExtensions must not override type`);
      }
      if (!EXTENSION_FIELDS.has(field)) {
        throw new Error(`${label} serverExtensions contain an unsupported field: ${field}`);
      }
      if (fieldValue === null && field !== "episodes") {
        throw new Error(`${label} serverExtensions contain an unsupported null deletion: ${field}`);
      }
    }
  }
}

function validateKnownEntityCollisionExtensions(
  card: Record<string, unknown>,
  extensions: BandoriCardServerExtensions,
  label: string,
  strict: StrictValidationOptions,
): void {
  for (const [server, extension] of extensions.entries()) {
    const isCollisionServer = KNOWN_ENTITY_COLLISION_SERVER_INDEXES.has(server);
    if (!isCollisionServer) {
      if (extension !== null) {
        throw new Error(`${label} entity collision must only exist on EN and CN`);
      }
      continue;
    }
    if (extension === null) {
      throw new Error(`${label} entity collision must exist on both EN and CN`);
    }
    if (server === 1 && Object.keys(extension).length !== 0) {
      throw new Error(`${label} entity collision must use EN as the canonical record`);
    }
    for (const [field, value] of Object.entries(extension)) {
      if (!isCollisionExtensionField(strict.dataset, field)) {
        throw new Error(
          `${label} has an unsupported entity collision field: ${field}, server=${server}`,
        );
      }
      validateJsonValue(value, `${label} entity collision field ${field}`);
    }
  }

  const cnExtension = extensions[3];
  const identityFields = strict.dataset === "cardDetails"
    ? COLLISION_DETAIL_IDENTITY_FIELDS
    : COLLISION_SUMMARY_IDENTITY_FIELDS;
  if (
    cnExtension === null
    || !identityFields.some((field) => Object.hasOwn(cnExtension, field))
  ) {
    throw new Error(`${label} registered entity collision must override an identity field`);
  }

  const expected = KNOWN_ENTITY_COLLISION_IDENTITIES[strict.recordId];
  for (const server of [1, 3] as const) {
    const extension = extensions[server];
    if (extension === null) {
      continue;
    }
    const serverCode = server === 1 ? "en" : "cn";
    for (const field of identityFields) {
      const actual = Object.hasOwn(extension, field)
        ? extension[field]
        : card[field];
      if (actual !== expected[serverCode][field]) {
        throw new Error(
          `${label} entity collision identity fingerprint changed: `
          + `server=${serverCode}, field=${field}`,
        );
      }
    }
  }
}

function isCollisionExtensionField(
  dataset: BandoriCardServerExtensionDataset,
  field: string,
): boolean {
  return (dataset === "cardDetails" ? COLLISION_DETAIL_FIELDS : COLLISION_SUMMARY_FIELDS).has(field);
}

function validateJsonValue(value: unknown, label: string): void {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      validateJsonValue(item, label);
    }
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      validateJsonValue(item, label);
    }
    return;
  }
  throw new Error(`${label} must contain only JSON values`);
}

function isRegisteredExtensionField(
  dataset: BandoriCardServerExtensionDataset,
  recordId: string,
  server: number,
  field: string,
): boolean {
  if (dataset === "cardDetails" && field === "costumeId") {
    return true;
  }
  if (TOURNAMENT_CARD_IDS.has(recordId)) {
    return (field === "attribute" && (server === 1 || server === 2))
      || (field === "skillId" && server === 2);
  }
  if (MISSING_TW_EPISODE_CARD_IDS.has(recordId) && server === 2) {
    return field === "stat" || (dataset === "cardDetails" && field === "episodes");
  }
  if (TW_SKILL_OVERRIDE_CARD_IDS.has(recordId)) {
    return field === "skillId" && server === 2;
  }
  if (recordId === "1413") {
    return field === "stat" && server === 1;
  }
  if (TW_LEVEL_STAT_OVERRIDE_CARD_IDS.has(recordId)) {
    return (field === "levelLimit" || field === "stat") && server === 2;
  }
  return false;
}

function validateExtensionFieldValue(label: string, field: string, value: unknown): void {
  if (field === "episodes") {
    if (value !== null) {
      throw new Error(`${label} episodes serverExtension must be a null deletion`);
    }
    return;
  }
  if (field === "stat") {
    if (!isRecord(value)) {
      throw new Error(`${label} stat serverExtension must be an object`);
    }
    return;
  }
  if (field === "attribute") {
    if (typeof value !== "string" || !value) {
      throw new Error(`${label} attribute serverExtension must be a string`);
    }
    return;
  }
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} ${field} serverExtension must be a positive integer`);
  }
}

export function resolveBandoriCardForServer<T extends object>(
  card: T,
  server: number,
): T | null {
  if (!Number.isInteger(server) || server < 0 || server >= BANDORI_CARD_SERVER_COUNT) {
    throw new Error(`Unsupported Bandori card server index: ${server}`);
  }

  // A stale browser cache can briefly contain the pre-extension response.
  // Private snapshot reads validate the field strictly before serving it.
  if (!Object.hasOwn(card, "serverExtensions")) {
    return card;
  }

  const serverExtensions = readServerExtensions(card, "Bandori card");
  const extension = serverExtensions[server];
  if (extension === null) {
    return null;
  }
  if (Object.keys(extension).length === 0) {
    return card;
  }

  const canonical = { ...card } as T & Record<string, unknown>;
  delete canonical.serverExtensions;
  for (const [key, value] of Object.entries(extension)) {
    if (value === null) {
      delete canonical[key as keyof typeof canonical];
    } else {
      Object.assign(canonical, { [key]: value });
    }
  }
  return canonical as T;
}

export function resolveBandoriCardMapForServer<T extends object>(
  cards: Record<string, T | null | undefined>,
  server: number,
): Record<string, T> {
  const resolved: Record<string, T> = {};
  for (const [cardId, card] of Object.entries(cards)) {
    if (!card) {
      continue;
    }
    const serverCard = resolveBandoriCardForServer(card, server);
    if (serverCard) {
      resolved[cardId] = serverCard;
    }
  }
  return resolved;
}

export function resolveBandoriCardForServerWithJpFallback<T extends object>(
  card: T,
  server: number,
): T | null {
  const serverCard = resolveBandoriCardForServer(card, server);
  if (serverCard || server === 0) {
    return serverCard;
  }

  // Team calculation treats any card that exists on JP as a valid future
  // candidate for another server. Availability is based only on snapshot
  // presence, never on release timestamps, because regional schedules can
  // delay or skip collaborations for an arbitrary amount of time.
  return resolveBandoriCardForServer(card, 0);
}

export function resolveBandoriCardMapForServerWithJpFallback<T extends object>(
  cards: Record<string, T | null | undefined>,
  server: number,
): Record<string, T> {
  const resolved: Record<string, T> = {};
  for (const [cardId, card] of Object.entries(cards)) {
    if (!card) {
      continue;
    }
    const serverCard = resolveBandoriCardForServerWithJpFallback(card, server);
    if (serverCard) {
      resolved[cardId] = serverCard;
    }
  }
  return resolved;
}

export function resolveBandoriCardForServerWithRegionalFallback<T extends object>(
  card: T,
  server: BandoriServer,
): T | null {
  for (const candidateServer of getBandoriRegionalDisplayOrder(server)) {
    const serverCard = resolveBandoriCardForServer(card, candidateServer);
    if (serverCard) {
      return serverCard;
    }
  }
  return null;
}

export function materializeBandoriCardForServer<T extends object>(
  card: T,
  server: number,
): T | null {
  const resolved = resolveBandoriCardForServer(card, server);
  if (!resolved || !Object.hasOwn(resolved, "serverExtensions")) {
    return resolved;
  }

  const materialized = { ...resolved } as T & Record<string, unknown>;
  delete materialized.serverExtensions;
  return materialized as T;
}

export function materializeBandoriCardMapForServer<T extends object>(
  cards: Record<string, T | null | undefined>,
  server: number,
): Record<string, T> {
  const materialized: Record<string, T> = {};
  for (const [cardId, card] of Object.entries(cards)) {
    if (!card) {
      continue;
    }
    const serverCard = materializeBandoriCardForServer(card, server);
    if (serverCard) {
      materialized[cardId] = serverCard;
    }
  }
  return materialized;
}

export function materializeBandoriCardMapForServerWithJpFallback<T extends object>(
  cards: Record<string, T | null | undefined>,
  server: number,
): Record<string, T> {
  const materialized: Record<string, T> = {};
  for (const [cardId, card] of Object.entries(cards)) {
    if (!card) {
      continue;
    }
    const serverCard = resolveBandoriCardForServerWithJpFallback(card, server);
    if (!serverCard) {
      continue;
    }
    const resolvedCard = { ...serverCard } as T & Record<string, unknown>;
    delete resolvedCard.serverExtensions;
    materialized[cardId] = resolvedCard as T;
  }
  return materialized;
}

export function materializeBandoriCardMapForServerWithRegionalFallback<T extends object>(
  cards: Record<string, T | null | undefined>,
  server: BandoriServer,
): Record<string, T> {
  const materialized: Record<string, T> = {};
  for (const [cardId, card] of Object.entries(cards)) {
    if (!card) {
      continue;
    }
    const serverCard = resolveBandoriCardForServerWithRegionalFallback(card, server);
    if (!serverCard) {
      continue;
    }
    const resolvedCard = { ...serverCard } as T & Record<string, unknown>;
    delete resolvedCard.serverExtensions;
    materialized[cardId] = resolvedCard as T;
  }
  return materialized;
}

export type BandoriCardCatalogEntry<T extends object> = {
  cardId: number;
  cardRef: string;
  server: BandoriCardServer | null;
  card: T;
};

export function expandBandoriCardCatalog<T extends object>(
  cards: Record<string, T | null | undefined>,
): BandoriCardCatalogEntry<T>[] {
  const entries: BandoriCardCatalogEntry<T>[] = [];
  const sortedCards = Object.entries(cards).sort(([left], [right]) => Number(left) - Number(right));

  for (const [rawCardId, card] of sortedCards) {
    if (!card) {
      continue;
    }
    const cardId = Number(rawCardId);
    if (!Number.isSafeInteger(cardId) || cardId < 1 || String(cardId) !== rawCardId) {
      throw new Error(`Bandori card catalog contains an invalid card ID: ${rawCardId}`);
    }
    if (!isKnownBandoriCardEntityCollision(rawCardId)) {
      entries.push({
        cardId,
        cardRef: rawCardId,
        server: null,
        card,
      });
      continue;
    }

    validateBandoriCardServerExtensions(
      card as T & Record<string, unknown>,
      `Bandori card catalog record ${rawCardId}`,
      { dataset: "cards", recordId: rawCardId },
    );
    for (const server of [1, 3] as const) {
      const serverCard = materializeBandoriCardForServer(card, server);
      if (!serverCard) {
        throw new Error(
          `Bandori card catalog collision is missing server `
          + `${getBandoriServerCode(server)}: ${rawCardId}`,
        );
      }
      entries.push({
        cardId,
        cardRef: `${server}:${rawCardId}`,
        server,
        card: serverCard,
      });
    }
  }

  return entries;
}
