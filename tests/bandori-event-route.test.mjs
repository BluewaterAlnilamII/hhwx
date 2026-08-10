import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

import proxyModule from "../src/proxy.ts";
import {
  buildBandoriEventsPath,
  parseBandoriEventRouteId,
} from "../src/lib/bandori/events/route.ts";
import {
  buildEventTrackerHref,
  buildEventTrackerRouteStateKey,
} from "../src/app/[locale]/bandori/events/urlQuery.ts";

const dynamicPageSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/[eventId]/page.tsx", import.meta.url),
  "utf8",
);
const eventTrackerPageSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/EventTrackerPage.tsx", import.meta.url),
  "utf8",
);
const eventUrlQuerySource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/urlQuery.ts", import.meta.url),
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

test("event navigation pushes dynamic routes while native history stays query-only", () => {
  const eventSelectionHandler = eventTrackerPageSource.slice(
    eventTrackerPageSource.indexOf("const handleSelectedEventIdChange"),
    eventTrackerPageSource.indexOf("const handleServerChange"),
  );

  assert.match(eventSelectionHandler, /router\.push\(/u);
  assert.match(eventSelectionHandler, /buildBandoriEventsPath\(nextEventId\)/u);
  assert.match(eventSelectionHandler, /\{ scroll: false \}/u);
  assert.doesNotMatch(eventSelectionHandler, /setCurrentEventId/u);
  assert.match(
    eventUrlQuerySource,
    /buildEventTrackerHref\(window\.location\.pathname, patch\)/u,
  );
  const queryPatchType = eventUrlQuerySource.slice(
    eventUrlQuerySource.indexOf("type EventTrackerUrlQueryPatch"),
    eventUrlQuerySource.indexOf("const TRACKING_MODES"),
  );
  assert.doesNotMatch(queryPatchType, /eventId\??:/u);
  assert.doesNotMatch(eventUrlQuerySource, /\.pathname\s*=/u);
});

test("event query hrefs preserve refinements without retaining legacy event identity", () => {
  const href = buildEventTrackerHref(
    "/bandori/events/339",
    {
      trackingMode: "song",
      tier: "top10",
      commentPage: null,
      commentId: null,
    },
    new URLSearchParams(
      "event=333&type=event&tier=10&server=cn&view=info&page=2&comment=abc&custom=keep",
    ),
  );

  assert.equal(
    href,
    "/bandori/events/339?type=song&tier=top10&server=cn&view=info&custom=keep",
  );
});

test("route state fingerprints ignore comments, unrelated params, and query order", () => {
  const baseKey = buildEventTrackerRouteStateKey(
    339,
    new URLSearchParams(
      "type=event&tier=top10&server=cn&view=info&page=1&comment=first&custom=one",
    ),
    3,
  );
  const commentOnlyChangeKey = buildEventTrackerRouteStateKey(
    339,
    new URLSearchParams(
      "custom=two&comment=second&page=8&view=info&server=cn&tier=top10&type=event",
    ),
    3,
  );

  assert.equal(commentOnlyChangeKey, baseKey);
  assert.notEqual(
    buildEventTrackerRouteStateKey(333, new URLSearchParams("type=event&tier=top10&server=cn&view=info"), 3),
    baseKey,
  );
  assert.notEqual(
    buildEventTrackerRouteStateKey(339, new URLSearchParams("type=song&tier=top10&server=cn&view=info"), 3),
    baseKey,
  );
  assert.notEqual(
    buildEventTrackerRouteStateKey(339, new URLSearchParams("type=event&tier=10&server=cn&view=info"), 3),
    baseKey,
  );
  assert.notEqual(
    buildEventTrackerRouteStateKey(339, new URLSearchParams("type=event&tier=top10&server=jp&view=info"), 3),
    baseKey,
  );
  assert.notEqual(
    buildEventTrackerRouteStateKey(339, new URLSearchParams("type=event&tier=top10&server=cn&view=tracker"), 3),
    baseKey,
  );
  assert.notEqual(
    buildEventTrackerRouteStateKey(339, new URLSearchParams("type=event&tier=top10&server=cn&view=info"), 0),
    baseKey,
  );
  assert.match(
    eventTrackerPageSource,
    /buildEventTrackerRouteStateKey\(\s*initialEventId,\s*searchParams,\s*preferredServer,\s*\)/u,
  );
  assert.doesNotMatch(eventTrackerPageSource, /searchParams\.toString\(\)/u);
});

test("route URL changes rehydrate tracker state and entry routes canonicalize with replace", () => {
  assert.match(
    eventTrackerPageSource,
    /appliedRouteUrlStateKeyRef\.current === routeUrlStateKey/u,
  );
  assert.match(
    eventTrackerPageSource,
    /initialEventId !== null[\s\S]*?router\.replace\(nextHref, \{ scroll: false \}\)/u,
  );
  assert.doesNotMatch(
    eventTrackerPageSource,
    /replaceEventTrackerUrlQuery\(\{\s*eventId:/u,
  );
});

test("the query subscription does not hide the Events shell behind Suspense", () => {
  assert.match(
    eventTrackerPageSource,
    /<BandoriPageShell[\s\S]*?<Suspense fallback=\{null\}>[\s\S]*?<EventTrackerRouteStateSync/u,
  );
  assert.match(
    eventTrackerPageSource,
    /export default function EventTrackerPage[\s\S]*?return <EventTrackerPageContent/u,
  );
  assert.doesNotMatch(
    eventTrackerPageSource,
    /export default function EventTrackerPage[\s\S]*?<Suspense/u,
  );
});

test("internal event links use the canonical event path", () => {
  assert.match(notificationPageSource, /`\/bandori\/events\/\$\{encodeURIComponent\(target\.eventId\)\}\?/u);
  assert.match(sectionNavigationSource, /href: "\/bandori\/events"/u);
  assert.match(sectionNavigationSource, /href: "\/bandori\/cards"/u);
  assert.ok(
    sectionNavigationSource.indexOf('id: "tracker"')
      < sectionNavigationSource.indexOf('id: "cards"'),
  );
  assert.ok(
    sectionNavigationSource.indexOf('id: "cards"')
      < sectionNavigationSource.indexOf('id: "game-profiles"'),
  );
  assert.doesNotMatch(notificationPageSource, /\/bandori\/eventtracker/u);
  assert.doesNotMatch(sectionNavigationSource, /\/bandori\/eventtracker/u);
});
