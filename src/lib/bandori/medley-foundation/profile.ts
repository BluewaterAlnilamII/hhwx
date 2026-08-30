import { BANDORI_AREA_ITEM_IDS_BY_GROUP } from "@/lib/bandori-area-item-groups";

import type {
  BandoriServer,
  DecodedAreaItemStateV1,
  DecodedCharacterBonusV1,
  DecodedMedleyProfileV1,
  DecodedProfileCardV1,
  Triple,
} from "./contracts";
import {
  assertAllowedKeys,
  failInput,
  readArray,
  readRecord,
} from "./errors";

const BESTDORI_COMPRESSION_VERSION = "2";
const WRAPPED_CARD_ID_THRESHOLD = 24_464;
const WRAPPED_CARD_ID_OFFSET = 65_536;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

function readIntegerLike(value: unknown, path: string, minimum = 0): number {
  if (value === null || value === undefined || value === "") {
    failInput("INVALID_PROFILE", path, `must be an integer greater than or equal to ${minimum}`);
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    failInput("INVALID_PROFILE", path, `must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

function readNumberLike(value: unknown, path: string, nullable: true): number | null;
function readNumberLike(value: unknown, path: string, nullable?: false): number;
function readNumberLike(value: unknown, path: string, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (value === null || value === undefined || value === "") {
    failInput("INVALID_PROFILE", path, "must be a finite non-negative number");
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || Object.is(parsed, -0)) {
    failInput("INVALID_PROFILE", path, "must be a finite non-negative number");
  }
  return parsed;
}

function readBooleanLike(value: unknown, path: string): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  failInput("INVALID_PROFILE", path, "must be a Bestdori boolean value");
}

function decodeCanonicalBase64(value: unknown, path: string): Uint8Array {
  if (typeof value !== "string" || !BASE64_PATTERN.test(value)) {
    failInput("INVALID_PROFILE", path, "must be canonical padded base64");
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    failInput("INVALID_PROFILE", path, "contains invalid base64 data");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (btoa(binary) !== value) {
    failInput("INVALID_PROFILE", path, "must use the canonical base64 representation");
  }
  return bytes;
}

function decodeUint16Ids(value: unknown, path: string): number[] {
  const bytes = decodeCanonicalBase64(value, path);
  if (bytes.length % 2 !== 0) {
    failInput("INVALID_PROFILE", path, "must contain complete little-endian uint16 values");
  }
  const ids: number[] = [];
  for (let index = 0; index < bytes.length; index += 2) {
    ids.push(bytes[index] + (bytes[index + 1] << 8));
  }
  return ids;
}

function decodeCardIds(value: unknown, path: string): number[] {
  return decodeUint16Ids(value, path).map((cardId) => (
    cardId > WRAPPED_CARD_ID_THRESHOLD ? cardId + WRAPPED_CARD_ID_OFFSET : cardId
  ));
}

function decodeRunLength<T>(
  value: unknown,
  expectedLength: number,
  path: string,
  readValue: (item: unknown, itemPath: string) => T,
): T[] {
  const pairs = readArray(value, path, "INVALID_PROFILE");
  if (pairs.length % 2 !== 0) {
    failInput("INVALID_PROFILE", path, "run-length data must contain count/value pairs");
  }
  const decoded: T[] = [];
  for (let index = 0; index < pairs.length; index += 2) {
    const count = readIntegerLike(pairs[index], `${path}[${index}]`, 1);
    const item = readValue(pairs[index + 1], `${path}[${index + 1}]`);
    if (decoded.length + count > expectedLength) {
      failInput("INVALID_PROFILE", path, "run-length data exceeds its associated ID count");
    }
    for (let offset = 0; offset < count; offset += 1) decoded.push(item);
  }
  if (decoded.length !== expectedLength) {
    failInput(
      "INVALID_PROFILE",
      path,
      `run-length data decoded ${decoded.length} entries; expected ${expectedLength}`,
    );
  }
  return decoded;
}

function readServer(value: unknown, path: string): BandoriServer {
  const server = readIntegerLike(value, path);
  if (server !== 0 && server !== 1 && server !== 2 && server !== 3) {
    failInput("INVALID_PROFILE", path, "must be one of the gameplay servers 0..3");
  }
  return server;
}

function decodeCards(value: unknown, path: string): DecodedProfileCardV1[] {
  const cards = readRecord(value, path, "INVALID_PROFILE");
  assertAllowedKeys(
    cards,
    ["ids", "levels", "masters", "skills", "eps", "trains", "arts", "excludes"],
    ["ids", "levels", "masters", "skills", "eps", "trains", "excludes"],
    path,
    "INVALID_PROFILE",
  );
  const cardIds = decodeCardIds(cards.ids, `${path}.ids`);
  const length = cardIds.length;
  const levels = decodeRunLength(cards.levels, length, `${path}.levels`, readIntegerLike);
  const masters = decodeRunLength(cards.masters, length, `${path}.masters`, readIntegerLike);
  const encodedSkills = decodeRunLength(cards.skills, length, `${path}.skills`, readIntegerLike);
  const episodes = decodeRunLength(cards.eps, length, `${path}.eps`, readIntegerLike);
  const trained = decodeRunLength(cards.trains, length, `${path}.trains`, readBooleanLike);
  const arts = decodeRunLength(cards.arts ?? cards.trains, length, `${path}.arts`, readBooleanLike);
  const excluded = decodeRunLength(cards.excludes, length, `${path}.excludes`, readBooleanLike);
  const seen = new Set<number>();

  return cardIds.map((cardId, index) => {
    if (cardId <= 0 || seen.has(cardId)) {
      failInput("INVALID_PROFILE", `${path}.ids`, "card IDs must be positive and unique");
    }
    seen.add(cardId);
    const skillLevel = encodedSkills[index] + 1;
    if (levels[index] <= 0 || skillLevel < 1 || skillLevel > 5) {
      failInput("INVALID_PROFILE", `${path}[${index}]`, "card level and skill level are invalid");
    }
    return {
      cardId,
      level: levels[index],
      masterRank: masters[index],
      skillLevel,
      episodeCount: episodes[index],
      isTrained: trained[index],
      hasTrainedArt: arts[index],
      isExcluded: excluded[index],
    };
  });
}

function decodeAreaItems(value: unknown, path: string): DecodedAreaItemStateV1[] {
  const items = readRecord(value, path, "INVALID_PROFILE");
  const result: DecodedAreaItemStateV1[] = [];
  for (const [groupKey, areaItemIds] of Object.entries(BANDORI_AREA_ITEM_IDS_BY_GROUP)) {
    const encoded = items[groupKey];
    if (encoded === undefined) continue;
    const levels = decodeRunLength(
      encoded,
      areaItemIds.length,
      `${path}.${groupKey}`,
      (item, itemPath) => item === null ? null : readIntegerLike(item, itemPath),
    );
    levels.forEach((level, index) => {
      if (level !== null && level > 0) {
        result.push({ areaItemId: areaItemIds[index], level });
      }
    });
  }
  return result;
}

function decodePotentialRecords(value: unknown, path: string): Map<number, Triple<number | null>> {
  if (value === undefined) return new Map();
  const records = readRecord(value, path, "INVALID_PROFILE");
  assertAllowedKeys(
    records,
    ["ids", "performance", "technique", "visual"],
    ["ids", "performance", "technique", "visual"],
    path,
    "INVALID_PROFILE",
  );
  const ids = decodeUint16Ids(records.ids, `${path}.ids`);
  const columns = ["performance", "technique", "visual"].map((key) => decodeRunLength(
    records[key],
    ids.length,
    `${path}.${key}`,
    (item, itemPath) => readNumberLike(item, itemPath, true),
  ));
  const result = new Map<number, Triple<number | null>>();
  ids.forEach((characterId, index) => {
    if (characterId <= 0 || result.has(characterId)) {
      failInput("INVALID_PROFILE", `${path}.ids`, "character IDs must be positive and unique");
    }
    result.set(characterId, [columns[0][index], columns[1][index], columns[2][index]]);
  });
  return result;
}

function decodeMissionType(
  value: unknown,
  ids: number[],
  path: string,
): Triple<number[]> {
  const record = readRecord(value, path, "INVALID_PROFILE");
  assertAllowedKeys(
    record,
    ["performance", "technique", "visual"],
    ["performance", "technique", "visual"],
    path,
    "INVALID_PROFILE",
  );
  return ["performance", "technique", "visual"].map((key) => decodeRunLength(
    record[key],
    ids.length,
    `${path}.${key}`,
    (item, itemPath) => readNumberLike(item, itemPath) / 10,
  )) as Triple<number[]>;
}

function decodeMissionRecords(
  value: unknown,
  path: string,
): Map<number, { collection: Triple<number>; training: Triple<number> }> {
  if (value === undefined) return new Map();
  const records = readRecord(value, path, "INVALID_PROFILE");
  assertAllowedKeys(
    records,
    ["ids", "collection", "training"],
    ["ids", "collection", "training"],
    path,
    "INVALID_PROFILE",
  );
  const ids = decodeUint16Ids(records.ids, `${path}.ids`);
  const collection = decodeMissionType(records.collection, ids, `${path}.collection`);
  const training = decodeMissionType(records.training, ids, `${path}.training`);
  const result = new Map<number, { collection: Triple<number>; training: Triple<number> }>();
  ids.forEach((characterId, index) => {
    if (characterId <= 0 || result.has(characterId)) {
      failInput("INVALID_PROFILE", `${path}.ids`, "character IDs must be positive and unique");
    }
    result.set(characterId, {
      collection: [collection[0][index], collection[1][index], collection[2][index]],
      training: [training[0][index], training[1][index], training[2][index]],
    });
  });
  return result;
}

/** Strictly decode the complete HHWX/Bestdori profile used by the calculator. */
export function decodeMedleyProfile(value: unknown, path = "profilePayload"): DecodedMedleyProfileV1 {
  const payload = readRecord(value, path, "INVALID_PROFILE");
  assertAllowedKeys(
    payload,
    ["bestdoriProfile", "characterPotentials", "characterMissionBonuses", "source"],
    ["bestdoriProfile"],
    path,
    "INVALID_PROFILE",
  );
  const profile = readRecord(payload.bestdoriProfile, `${path}.bestdoriProfile`, "INVALID_PROFILE");
  assertAllowedKeys(
    profile,
    ["name", "server", "compression", "data", "hhwx"],
    ["name", "server", "compression", "data"],
    `${path}.bestdoriProfile`,
    "INVALID_PROFILE",
  );
  if (typeof profile.name !== "string" || profile.name.trim().length === 0) {
    failInput("INVALID_PROFILE", `${path}.bestdoriProfile.name`, "must be a non-empty string");
  }
  if (profile.compression !== BESTDORI_COMPRESSION_VERSION) {
    failInput("INVALID_PROFILE", `${path}.bestdoriProfile.compression`, "only compression v2 is supported");
  }
  const data = readRecord(profile.data, `${path}.bestdoriProfile.data`, "INVALID_PROFILE");
  assertAllowedKeys(
    data,
    ["cards", "items"],
    ["cards", "items"],
    `${path}.bestdoriProfile.data`,
    "INVALID_PROFILE",
  );

  const potentials = decodePotentialRecords(
    payload.characterPotentials,
    `${path}.characterPotentials`,
  );
  const missions = decodeMissionRecords(
    payload.characterMissionBonuses,
    `${path}.characterMissionBonuses`,
  );
  const characterIds = [...new Set([...potentials.keys(), ...missions.keys()])].sort((a, b) => a - b);
  const characterBonuses: DecodedCharacterBonusV1[] = characterIds.map((characterId) => ({
    characterId,
    potential: potentials.get(characterId) ?? [null, null, null],
    collection: missions.get(characterId)?.collection ?? [0, 0, 0],
    training: missions.get(characterId)?.training ?? [0, 0, 0],
  }));

  return {
    name: profile.name.trim(),
    server: readServer(profile.server, `${path}.bestdoriProfile.server`),
    cards: decodeCards(data.cards, `${path}.bestdoriProfile.data.cards`),
    areaItems: decodeAreaItems(data.items, `${path}.bestdoriProfile.data.items`),
    characterBonuses,
  };
}
