import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeBandoriCardDisplayReleaseTimestamp } from "../src/lib/bandori/cards/release.ts";
import {
  buildBandoriCardCommentPermalink,
  buildBandoriCardDetailHref,
} from "../src/lib/bandori/cards/detail-url.ts";
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
  assert.match(detailPage, /onChange=\{handleServerChange\}/u);
  assert.match(detailPage, /buildBandoriCardDetailHref\(/u);
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
    /router\.replace\([\s\S]*buildBandoriCardDetailHref\(/u,
  );
});

test("card detail URLs preserve shared comment links but can clear collision-target links", () => {
  const currentParams = new URLSearchParams("server=jp&page=3&comment=comment-id&custom=keep");
  assert.equal(
    buildBandoriCardDetailHref("/bandori/cards/595", { server: 3 }, currentParams),
    "/bandori/cards/595?server=cn&page=3&comment=comment-id&custom=keep",
  );
  assert.equal(
    buildBandoriCardDetailHref(
      "/bandori/cards/595",
      { commentPage: 2, commentId: "next-comment" },
      currentParams,
    ),
    "/bandori/cards/595?server=jp&page=2&comment=next-comment&custom=keep",
  );
  assert.equal(
    buildBandoriCardDetailHref(
      "/bandori/cards/10001",
      { server: 3, commentPage: null, commentId: null },
      currentParams,
    ),
    "/bandori/cards/10001?server=cn&custom=keep",
  );

  assert.equal(buildBandoriCardCommentPermalink({
    currentHref: "https://hhwx.org/en/bandori/cards/595?server=tw&page=9&comment=old&custom=keep#details",
    locale: "en",
    cardId: 595,
    page: 2,
    commentId: "new-comment",
  }), "https://hhwx.org/en/bandori/cards/595?server=tw&page=2&comment=new-comment&custom=keep#details");
});

test("card comments render below the detail article and collision identity follows the selected server", async () => {
  const [detailPage, resolver] = await Promise.all([
    readFile(
      new URL("src/app/[locale]/bandori/cards/[cardId]/CardDetailPageClient.tsx", ROOT_URL),
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
  const articleEnd = detailPage.indexOf("</article>");
  const comments = detailPage.indexOf("<CardComments");

  assert.ok(articleEnd >= 0 && comments > articleEnd);
  assert.match(detailPage, /isKnownBandoriCardEntityCollision\(cardId\)[\s\S]*\? selectedServer[\s\S]*: null/u);
  assert.match(detailPage, /<CardComments cardId=\{cardId\} entityServer=\{entityServer\}/u);
  assert.match(detailPage, /const changesCommentTarget = isKnownBandoriCardEntityCollision\(cardId\)/u);
  assert.match(detailPage, /commentPage: changesCommentTarget \? null : undefined/u);
  assert.match(detailPage, /commentId: changesCommentTarget \? null : undefined/u);
  assert.match(resolver, /commentPage: isKnownBandoriCardEntityCollision\(cardId\) \? null : undefined/u);
  assert.match(resolver, /commentId: isKnownBandoriCardEntityCollision\(cardId\) \? null : undefined/u);
});

test("the global content shell owns the compact mobile page gutter", async () => {
  const [globalShell, pageShell, detailPage, resolver, eventPage] = await Promise.all([
    readFile(
      new URL("src/components/SectionSidebarShell.tsx", ROOT_URL),
      "utf8",
    ),
    readFile(
      new URL("src/app/[locale]/bandori/BandoriPageShell.tsx", ROOT_URL),
      "utf8",
    ),
    readFile(
      new URL("src/app/[locale]/bandori/cards/[cardId]/CardDetailPageClient.tsx", ROOT_URL),
      "utf8",
    ),
    readFile(
      new URL(
        "src/app/[locale]/bandori/cards/[cardId]/CardDetailPreferredServerResolver.tsx",
        ROOT_URL,
      ),
      "utf8",
    ),
    readFile(
      new URL("src/app/[locale]/bandori/events/EventTrackerPage.tsx", ROOT_URL),
      "utf8",
    ),
  ]);

  assert.match(
    globalShell,
    /px-2 py-0 sm:px-6[\s\S]*px-2 py-5 sm:px-6 lg:px-8/u,
  );
  assert.match(
    pageShell,
    /relative z-10 mx-auto w-full/u,
  );
  assert.doesNotMatch(pageShell, /-mx-2|calc\(100%\+1rem\)/u);
  for (const source of [detailPage, resolver, eventPage]) {
    assert.match(source, /<BandoriPageShell/u);
    assert.doesNotMatch(source, /-mx-2 w-\[calc\(100%\+1rem\)\]/u);
  }
});
