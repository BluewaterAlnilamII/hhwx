import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MedleyFoundationInputError,
  buildFixedMedleyEvaluationInput,
} from "../src/lib/bandori/medley-foundation/index.ts";

const sourceFixtureUrl = new URL("./fixtures/bandori-medley-foundation-source-v1.json", import.meta.url);
const scorerFixtureUrl = new URL(
  "../crates/bandori-medley-model/tests/fixtures/valid-fixed-medley-v1.json",
  import.meta.url,
);

function readFixture(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

test("tiny raw fixture normalizes exactly to the retained Rust scorer input", () => {
  const result = buildFixedMedleyEvaluationInput(readFixture(sourceFixtureUrl));
  assert.deepEqual(result.scoringInput, readFixture(scorerFixtureUrl));
  assert.equal(result.audit.profileName, "Fixed foundation fixture");
  assert.equal(result.audit.selectedCardIds.length, 15);
  assert.deepEqual(result.audit.selectedAreaItemIds, []);
  assert.deepEqual(
    result.audit.teamParameters.map((team) => team.deckTotalParameter),
    [17_250, 17_250, 17_250],
  );
  assert.doesNotMatch(JSON.stringify(result), /conditionLife|lifeState|currentLife/u);
});

test("the fixed boundary rejects card reuse instead of starting a search", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.teams[1].memberCardIds[0] = fixture.teams[0].memberCardIds[0];
  assert.throws(
    () => buildFixedMedleyEvaluationInput(fixture),
    (error) => error instanceof MedleyFoundationInputError
      && error.code === "INVALID_TEAM"
      && /selected more than once/u.test(error.message),
  );
});

test("the fixed boundary rejects an unowned area-item selection", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.selectedAreaItemIds = [1];
  fixture.areaItemsById[1] = {};
  assert.throws(
    () => buildFixedMedleyEvaluationInput(fixture),
    (error) => error instanceof MedleyFoundationInputError
      && error.code === "INVALID_PARAMETER"
      && /not owned/u.test(error.message),
  );
});

test("play level 5 remains a valid raw Bestdori song row", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.songs[0].difficulty = "easy";
  fixture.songsById[1].difficulty[0] = { playLevel: 5 };
  const result = buildFixedMedleyEvaluationInput(fixture);
  assert.equal(result.scoringInput.songs[0].playLevel, 5);
});
