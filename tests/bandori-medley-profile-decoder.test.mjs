import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MedleyFoundationInputError,
  decodeMedleyProfile,
} from "../src/lib/bandori/medley-foundation/index.ts";

function encodeUint16(values) {
  const bytes = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => bytes.writeUInt16LE(value, index * 2));
  return bytes.toString("base64");
}

function rle(values) {
  const result = [];
  for (const value of values) {
    if (result.length > 0 && Object.is(result.at(-1), value)) {
      result[result.length - 2] += 1;
    } else {
      result.push(1, value);
    }
  }
  return result;
}

function profilePayload() {
  return {
    bestdoriProfile: {
      name: "Foundation fixture",
      server: 3,
      compression: "2",
      data: {
        cards: {
          ids: encodeUint16([1, 24_505]),
          levels: rle([60, 50]),
          masters: rle([4, 0]),
          skills: rle([4, 3]),
          eps: rle([2, 1]),
          trains: rle([1, 0]),
          arts: rle([1, 0]),
          excludes: rle([0, 1]),
        },
        items: {
          PoppinParty: rle([7, 0, null, 4, 0, 0, 1]),
          Everyone: rle([1, 0, 0, 0, 0, 0, 0]),
          potentials: [],
        },
      },
    },
    characterPotentials: {
      ids: encodeUint16([1, 50]),
      performance: rle([10, null]),
      technique: rle([20, 40]),
      visual: rle([30, 50]),
    },
    characterMissionBonuses: {
      ids: encodeUint16([1, 50]),
      collection: {
        performance: rle([1, 4]),
        technique: rle([2, 5]),
        visual: rle([3, 6]),
      },
      training: {
        performance: rle([7, 10]),
        technique: rle([8, 11]),
        visual: rle([9, 12]),
      },
    },
    source: { syncedAt: "fixture" },
  };
}

test("complete profile decode preserves cards, items, potentials, and mission bonuses", () => {
  const decoded = decodeMedleyProfile(profilePayload());

  assert.equal(decoded.name, "Foundation fixture");
  assert.equal(decoded.server, 3);
  assert.deepEqual(decoded.cards, [
    {
      cardId: 1,
      level: 60,
      masterRank: 4,
      skillLevel: 5,
      episodeCount: 2,
      isTrained: true,
      hasTrainedArt: true,
      isExcluded: false,
    },
    {
      cardId: 90_041,
      level: 50,
      masterRank: 0,
      skillLevel: 4,
      episodeCount: 1,
      isTrained: false,
      hasTrainedArt: false,
      isExcluded: true,
    },
  ]);
  assert.deepEqual(decoded.areaItems, [
    { areaItemId: 1, level: 7 },
    { areaItemId: 16, level: 4 },
    { areaItemId: 31, level: 1 },
    { areaItemId: 73, level: 1 },
  ]);
  assert.deepEqual(decoded.characterBonuses, [
    {
      characterId: 1,
      potential: [10, 20, 30],
      collection: [0.1, 0.2, 0.3],
      training: [0.7, 0.8, 0.9],
    },
    {
      characterId: 50,
      potential: [null, 40, 50],
      collection: [0.4, 0.5, 0.6],
      training: [1, 1.1, 1.2],
    },
  ]);
});

test("profile decoder rejects truncated or padded run-length data", () => {
  const truncated = profilePayload();
  truncated.bestdoriProfile.data.cards.levels = [1, 60];
  assert.throws(
    () => decodeMedleyProfile(truncated),
    (error) => error instanceof MedleyFoundationInputError
      && error.code === "INVALID_PROFILE"
      && error.path.endsWith("cards.levels"),
  );

  const padded = profilePayload();
  padded.bestdoriProfile.data.cards.skills = [3, 4];
  assert.throws(
    () => decodeMedleyProfile(padded),
    (error) => error instanceof MedleyFoundationInputError
      && error.code === "INVALID_PROFILE",
  );
});

test("profile decoder rejects malformed uint16 and duplicate card IDs", () => {
  const malformed = profilePayload();
  malformed.bestdoriProfile.data.cards.ids = Buffer.from([1]).toString("base64");
  assert.throws(() => decodeMedleyProfile(malformed), MedleyFoundationInputError);

  const duplicate = profilePayload();
  duplicate.bestdoriProfile.data.cards.ids = encodeUint16([1, 1]);
  assert.throws(
    () => decodeMedleyProfile(duplicate),
    (error) => error instanceof MedleyFoundationInputError
      && /positive and unique/u.test(error.message),
  );
});

test("greenfield foundation does not import an existing team solver", () => {
  const root = fileURLToPath(new URL("../src/lib/bandori/medley-foundation/", import.meta.url));
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.name.endsWith(".ts")) {
        assert.doesNotMatch(
          readFileSync(absolute, "utf8"),
          /bandori[\\/]team-builder|team-search-worker|BandoriMedleyTeamSearchInput/u,
        );
      }
    }
  }
});
