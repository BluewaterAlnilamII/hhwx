import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeBandoriCardDisplayReleaseTimestamp } from "../src/lib/bandori-card-release.ts";

const ROOT_URL = new URL("../", import.meta.url);

test("card detail shows max Master Rank stats with total power last", async () => {
  const detailPage = await readFile(
    new URL("src/app/[locale]/bandori/cards/[cardId]/CardDetailPageClient.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(detailPage, /masterRank: 4/u);
  assert.doesNotMatch(detailPage, /maxStatsNote/u);

  const performanceIndex = detailPage.indexOf('["performance", stats?.parameters[0]]');
  const techniqueIndex = detailPage.indexOf('["technique", stats?.parameters[1]]');
  const visualIndex = detailPage.indexOf('["visual", stats?.parameters[2]]');
  const totalPowerIndex = detailPage.indexOf('["totalPower", stats?.totalPower]');
  assert.ok(
    performanceIndex >= 0
      && performanceIndex < techniqueIndex
      && techniqueIndex < visualIndex
      && visualIndex < totalPowerIndex,
  );
});

test("release server tags use medium text weight", async () => {
  const detailPage = await readFile(
    new URL("src/app/[locale]/bandori/cards/[cardId]/CardDetailPageClient.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(detailPage, /<span className="ml-1 font-medium">/u);
  assert.doesNotMatch(detailPage, /<span className="ml-1 font-normal">/u);
  assert.doesNotMatch(detailPage, /<strong className="ml-1 font-black">/u);
});

test("card detail keeps positive placeholder release timestamps for display", () => {
  const placeholderTimestamp = Date.UTC(2100, 0, 1);

  assert.equal(
    normalizeBandoriCardDisplayReleaseTimestamp(placeholderTimestamp),
    placeholderTimestamp,
  );
  assert.equal(
    normalizeBandoriCardDisplayReleaseTimestamp(4131237600000),
    4131237600000,
  );
  assert.equal(normalizeBandoriCardDisplayReleaseTimestamp(0), null);
  assert.equal(normalizeBandoriCardDisplayReleaseTimestamp(-1), null);
  assert.equal(normalizeBandoriCardDisplayReleaseTimestamp(Number.NaN), null);
});

test("card detail always presents available JP reference values on non-JP servers", async () => {
  const detailPage = await readFile(
    new URL("src/app/[locale]/bandori/cards/[cardId]/CardDetailPageClient.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(detailPage, /const jpReferenceName = jpCardName;/u);
  assert.match(detailPage, /const jpReferenceReleaseDate = jpReleaseDate;/u);
  assert.match(detailPage, /jpValue=\{jpSkillName\}/u);
  assert.match(detailPage, /jpValue=\{jpGachaText\}/u);
  assert.doesNotMatch(detailPage, /jpValueIfDifferent|value !== currentValue/u);
  assert.doesNotMatch(detailPage, /Date\.UTC\(2100/u);
});

test("card detail derives artwork count and trained-star style from indexed variants", async () => {
  const detailPage = await readFile(
    new URL("src/app/[locale]/bandori/cards/[cardId]/CardDetailPageClient.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(detailPage, /listBandoriCardAssetVariants\(assetIndex, resourceSetName\)/u);
  assert.match(detailPage, /artVariants\.map\(\(variant\)/u);
  assert.match(detailPage, /usesBandoriTrainedStarStyle\(type, variant\)/u);
  assert.match(detailPage, /assetIndexLoading=\{assetIndexLoading\}/u);
  assert.doesNotMatch(detailPage, /const artItems = hasTrainedArt/u);
});

test("card detail resolves missing or unavailable servers from the browser preference", async () => {
  const [page, resolver] = await Promise.all([
    readFile(
      new URL("src/app/[locale]/bandori/cards/[cardId]/page.tsx", ROOT_URL),
      "utf8",
    ),
    readFile(
      new URL(
        "src/app/[locale]/bandori/cards/[cardId]/CardDetailPreferredServerResolver.tsx",
        ROOT_URL,
      ),
      "utf8",
    ),
  ]);

  assert.match(
    page,
    /requestedServer === null \|\| !availableServers\.includes\(requestedServer\)/u,
  );
  assert.match(resolver, /pickAvailableBandoriServer\(availableServers, preferredServer\)/u);
  assert.match(resolver, /if \(!hydrated \|\| selectedServer === null\)/u);
  assert.match(
    resolver,
    /router\.replace\([\s\S]*\?server=\$\{getBandoriServerCode\(selectedServer\)\}/u,
  );
});
