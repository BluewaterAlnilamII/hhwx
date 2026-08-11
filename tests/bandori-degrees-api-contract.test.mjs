import assert from "node:assert/strict";
import test from "node:test";

import {
  DEGREES_API_PACK_PREFIX,
  DEGREES_API_POINTER_KEY,
  DEGREES_API_POINTER_SCHEMA_VERSION,
  MAX_DEGREES_API_COMPRESSED_BYTES,
  MAX_DEGREES_API_RECORDS,
  parseDegreesApiPointer,
} from "../src/lib/bandori-degrees-api-contract.ts";

const semanticSha256 = "a".repeat(64);
const compressedSha256 = "b".repeat(64);

function pointer() {
  return {
    schemaVersion: DEGREES_API_POINTER_SCHEMA_VERSION,
    generation: 2,
    datasets: {
      degrees: {
        key: `${DEGREES_API_PACK_PREFIX}/packs/degrees/${compressedSha256}.json.gz`,
        semanticSha256,
        compressedSha256,
        compressedSize: 123,
        recordCount: 9398,
      },
    },
  };
}

test("degrees use one private pointer and one content-addressed grouped pack", () => {
  assert.equal(DEGREES_API_POINTER_KEY, "bandori/master/degrees/api/active.json");
  assert.equal(parseDegreesApiPointer(pointer()).generation, 2);
  assert.throws(
    () => parseDegreesApiPointer({
      ...pointer(),
      schemaVersion: "bandori-degrees-api-pointer-v0",
    }),
    /Unsupported Bandori degrees API pointer schema/u,
  );

  const redirected = pointer();
  redirected.datasets.degrees.key = "untrusted/degrees.json.gz";
  assert.throws(() => parseDegreesApiPointer(redirected), /invalid degrees pack key/u);
});

test("degrees pointer rejects empty, oversized, and over-count packs", () => {
  const empty = pointer();
  empty.datasets.degrees.recordCount = 0;
  assert.throws(() => parseDegreesApiPointer(empty), /unsupported degrees record count/u);

  const oversized = pointer();
  oversized.datasets.degrees.compressedSize = MAX_DEGREES_API_COMPRESSED_BYTES + 1;
  assert.throws(() => parseDegreesApiPointer(oversized), /unsupported degrees compressed size/u);

  const overCount = pointer();
  overCount.datasets.degrees.recordCount = MAX_DEGREES_API_RECORDS + 1;
  assert.throws(() => parseDegreesApiPointer(overCount), /unsupported degrees record count/u);
});
