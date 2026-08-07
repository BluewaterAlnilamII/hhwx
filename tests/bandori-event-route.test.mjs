import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

import proxyModule from "../src/proxy.ts";
import {
  buildBandoriEventsPath,
  parseBandoriEventRouteId,
} from "../src/lib/bandori-event-route.ts";

const dynamicPageSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/[eventId]/page.tsx", import.meta.url),
  "utf8",
);
const eventTrackerPageSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/EventTrackerPage.tsx", import.meta.url),
  "utf8",
);
const notificationPageSource = readFileSync(
  new URL("../src/app/[locale]/account/notifications/page.tsx", import.meta.url),
  "utf8",
);
const sectionNavigationSource = readFileSync(
  new URL("../src/lib/section-navigation.ts", import.meta.url),
  "utf8",
);
const proxy = typeof proxyModule === "function" ? proxyModule : proxyModule.default;

function legacyRequest(path) {
  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    headers: {
      host: "hhwx.org",
      "x-forwarded-host": "hhwx.org",
      "x-forwarded-proto": "https",
    },
  });
}

test("event route IDs accept only positive safe integers", () => {
  assert.equal(parseBandoriEventRouteId("319"), 319);
  assert.equal(parseBandoriEventRouteId("0"), null);
  assert.equal(parseBandoriEventRouteId("01"), null);
  assert.equal(parseBandoriEventRouteId("abc"), null);
  assert.equal(parseBandoriEventRouteId("9007199254740992"), null);
  assert.equal(buildBandoriEventsPath(null), "/bandori/events");
  assert.equal(buildBandoriEventsPath(319), "/bandori/events/319");
});

test("legacy event tracker URLs move event into the path and preserve other query values", () => {
  const response = proxy(legacyRequest(
    "/bandori/eventtracker?event=319&type=event&tier=top10&server=cn&page=1&view=info",
  ));
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    "https://hhwx.org/bandori/events/319?type=event&tier=top10&server=cn&page=1&view=info",
  );
});

test("legacy redirects canonicalize locale prefixes and links without event IDs", () => {
  const zhResponse = proxy(legacyRequest("/zh-CN/bandori/eventtracker?event=319&server=cn"));
  const enResponse = proxy(legacyRequest("/en/bandori/eventtracker?event=319&server=en"));
  const entryResponse = proxy(legacyRequest("/bandori/eventtracker?view=info"));

  assert.equal(zhResponse.headers.get("location"), "https://hhwx.org/bandori/events/319?server=cn");
  assert.equal(enResponse.headers.get("location"), "https://hhwx.org/en/bandori/events/319?server=en");
  assert.equal(entryResponse.headers.get("location"), "https://hhwx.org/bandori/events?view=info");
});

test("dynamic event pages validate existence on the server and query state no longer owns event", () => {
  assert.match(dynamicPageSource, /readBandoriEventApiDetail/u);
  assert.match(dynamicPageSource, /notFound\(\)/u);
  assert.match(eventTrackerPageSource, /readInitialTrackerQueryState\(preferredServer, initialEventId\)/u);
  assert.doesNotMatch(eventTrackerPageSource, /params\.get\("event"\)/u);
});

test("internal event links use the canonical event path", () => {
  assert.match(notificationPageSource, /`\/bandori\/events\/\$\{encodeURIComponent\(eventId\)\}\?/u);
  assert.match(sectionNavigationSource, /href: "\/bandori\/events"/u);
  assert.doesNotMatch(notificationPageSource, /\/bandori\/eventtracker/u);
  assert.doesNotMatch(sectionNavigationSource, /\/bandori\/eventtracker/u);
});
