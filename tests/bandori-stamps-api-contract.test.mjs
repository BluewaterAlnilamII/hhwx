import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_STAMPS_API_COMPRESSED_BYTES,
  MAX_STAMPS_API_RECORDS,
  STAMPS_API_PACK_PREFIX,
  STAMPS_API_POINTER_KEY,
  STAMPS_API_POINTER_SCHEMA_VERSION,
  parseStampsApiPointer,
} from "../src/lib/bandori-stamps-api-contract.ts";

const semanticSha256 = "a".repeat(64);
const compressedSha256 = "b".repeat(64);

function pointer() {
  return {
    schemaVersion: STAMPS_API_POINTER_SCHEMA_VERSION,
    generation: 2,
    datasets: {
      stamps: {
        key: `${STAMPS_API_PACK_PREFIX}/packs/stamps/${compressedSha256}.json.gz`,
        semanticSha256,
        compressedSha256,
        compressedSize: 123,
        recordCount: 763,
      },
    },
  };
}

test("stamps use one private pointer and one content-addressed grouped pack", () => {
  assert.equal(STAMPS_API_POINTER_KEY, "bandori/master/stamps/api/active.json");
  assert.equal(parseStampsApiPointer(pointer()).generation, 2);
  assert.throws(
    () => parseStampsApiPointer({
      ...pointer(),
      schemaVersion: "bandori-stamps-api-pointer-v0",
    }),
    /Unsupported Bandori stamps API pointer schema/u,
  );

  const redirected = pointer();
  redirected.datasets.stamps.key = "untrusted/stamps.json.gz";
  assert.throws(() => parseStampsApiPointer(redirected), /invalid stamps pack key/u);
});

test("stamps pointer rejects empty, oversized, and over-count packs", () => {
  const empty = pointer();
  empty.datasets.stamps.recordCount = 0;
  assert.throws(() => parseStampsApiPointer(empty), /unsupported stamps record count/u);

  const oversized = pointer();
  oversized.datasets.stamps.compressedSize = MAX_STAMPS_API_COMPRESSED_BYTES + 1;
  assert.throws(() => parseStampsApiPointer(oversized), /unsupported stamps compressed size/u);

  const overCount = pointer();
  overCount.datasets.stamps.recordCount = MAX_STAMPS_API_RECORDS + 1;
  assert.throws(() => parseStampsApiPointer(overCount), /unsupported stamps record count/u);
});
