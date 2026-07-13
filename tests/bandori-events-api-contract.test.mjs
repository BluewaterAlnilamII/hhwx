import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_API_PACK_PREFIX,
  EVENT_API_POINTER_KEY,
  EVENT_API_POINTER_SCHEMA_VERSION,
  MAX_EVENT_API_COMPRESSED_BYTES,
  MAX_EVENT_API_RECORDS,
  parseEventApiPointer,
} from "../src/lib/bandori-events-api-contract.ts";

const semanticSha256 = "a".repeat(64);
const compressedSha256 = "b".repeat(64);

function pointer() {
  return {
    schemaVersion: EVENT_API_POINTER_SCHEMA_VERSION,
    generation: 3,
    datasets: Object.fromEntries(
      ["events", "eventDetails"].map((dataset) => [
        dataset,
        {
          key: `${EVENT_API_PACK_PREFIX}/packs/${dataset}/${compressedSha256}.json.gz`,
          semanticSha256,
          compressedSha256,
          compressedSize: 123,
          recordCount: 2,
        },
      ]),
    ),
  };
}

test("the reader contract has exactly one v3 pointer", () => {
  assert.equal(EVENT_API_POINTER_KEY, "bandori/event-history-v3/api/active.json");
  assert.throws(
    () => parseEventApiPointer({ ...pointer(), schemaVersion: "bandori-events-api-pointer-v1" }),
    /Unsupported Bandori events API pointer schema/u,
  );
});

test("v3 pack keys use the compressed representation hash", () => {
  const parsed = parseEventApiPointer(pointer());

  assert.equal(parsed.generation, 3);
  assert.match(parsed.datasets.events.key, new RegExp(`${compressedSha256}\\.json\\.gz$`, "u"));
});

test("a pointer cannot redirect the private reader to another object", () => {
  const payload = pointer();
  payload.datasets.events.key = "untrusted/events.json.gz";

  assert.throws(
    () => parseEventApiPointer(payload),
    /invalid events pack key/u,
  );
});

test("pointer limits reject oversized packs and record maps", () => {
  const oversizedPack = pointer();
  oversizedPack.datasets.events.compressedSize = MAX_EVENT_API_COMPRESSED_BYTES + 1;
  assert.throws(
    () => parseEventApiPointer(oversizedPack),
    /unsupported events compressed size/u,
  );

  const oversizedRecords = pointer();
  oversizedRecords.datasets.eventDetails.recordCount = MAX_EVENT_API_RECORDS + 1;
  assert.throws(
    () => parseEventApiPointer(oversizedRecords),
    /too many eventDetails records/u,
  );
});
