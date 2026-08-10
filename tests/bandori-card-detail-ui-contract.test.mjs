import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeBandoriCardDisplayReleaseTimestamp } from "../src/lib/bandori/cards/release.ts";
import {
  buildBandoriCardsListHref,
  readBandoriCardsListHref,
  saveBandoriCardsListQuery,
} from "../src/lib/bandori/cards/cards-list-query-snapshot.ts";

const ROOT_URL = new URL("../", import.meta.url);

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("Cards list snapshots restore only normalized filter query state", () => {
  const storage = createMemoryStorage();

  saveBandoriCardsListQuery(
    "?sort=release&bands=&server=cn&returnTo=https%3A%2F%2Fexample.com&server=jp",
    storage,
  );

  assert.equal(
    readBandoriCardsListHref(storage),
    "/bandori/cards?server=cn&bands=&sort=release",
  );
  assert.equal(
    buildBandoriCardsListHref("returnTo=https%3A%2F%2Fexample.com"),
    "/bandori/cards",
  );
});

test("Cards list snapshots fall back safely when session storage is unavailable", () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("unavailable");
    },
    setItem() {
      throw new Error("unavailable");
    },
  };

  assert.doesNotThrow(() => saveBandoriCardsListQuery("server=cn", unavailableStorage));
  assert.equal(readBandoriCardsListHref(unavailableStorage), "/bandori/cards");
});

test("Cards list restoration and detail server switching keep their navigation semantics", async () => {
  const [cardsPage, detailPage, serverSwitcher] = await Promise.all([
    readFile(
      new URL("src/app/[locale]/bandori/cards/CardsPageClient.tsx", ROOT_URL),
      "utf8",
    ),
    readFile(
      new URL("src/app/[locale]/bandori/cards/[cardId]/CardDetailPageClient.tsx", ROOT_URL),
      "utf8",
    ),
    readFile(
      new URL(
        "src/app/[locale]/bandori/cards/_components/BandoriCardServerSwitcher.tsx",
        ROOT_URL,
      ),
      "utf8",
    ),
  ]);

  assert.match(cardsPage, /saveBandoriCardsListQuery\(cardsListQuery\)/u);
  assert.match(detailPage, /setCardsListHref\(readBandoriCardsListHref\(\)\)/u);
  assert.match(detailPage, /<Link href=\{cardsListHref\}/u);
  assert.match(detailPage, /getHref=\{\(server\)[\s\S]*?replace\s*\/>/u);
  assert.match(serverSwitcher, /<Link[\s\S]*?replace=\{replace\}/u);
});

test("card pages reuse shared character-name and server-time-zone rules", async () => {
  const [detailPage, catalogRow] = await Promise.all([
    readFile(
      new URL("src/app/[locale]/bandori/cards/[cardId]/CardDetailPageClient.tsx", ROOT_URL),
      "utf8",
    ),
    readFile(
      new URL("src/app/[locale]/bandori/cards/_components/BandoriCardDetailedRow.tsx", ROOT_URL),
      "utf8",
    ),
  ]);

  assert.match(detailPage, /pickBandoriCharacterDisplayName\(/u);
  assert.doesNotMatch(detailPage, /function readCharacterName/u);
  for (const source of [detailPage, catalogRow]) {
    assert.match(source, /getBandoriServerTimeZone\(/u);
    assert.doesNotMatch(source, /const TIME_ZONES/u);
  }
});

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
