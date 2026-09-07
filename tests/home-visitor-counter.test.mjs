import assert from "node:assert/strict";
import test from "node:test";
import { getDecorativeVisitorNumber } from "../src/app/[locale]/HomeVisitorCounter.tsx";

test("the decorative counter keeps the reference's seven-digit range", () => {
  assert.equal(getDecorativeVisitorNumber(() => 0), "0029850");
  assert.equal(getDecorativeVisitorNumber(() => 0.5), "0029875");
  assert.equal(getDecorativeVisitorNumber(() => 1 - Number.EPSILON), "0029899");
});
