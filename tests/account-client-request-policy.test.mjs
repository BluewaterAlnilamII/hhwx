import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public asset indexes remain stable until explicit refresh or page reload", async () => {
  const appChrome = await readSource("src/components/AppChrome.tsx");
  const hook = await readSource("src/hooks/useBandoriPublicAssetIndex.ts");
  const client = await readSource("src/lib/bandori-public-asset-index-client.ts");
  const tracker = await readSource("src/app/[locale]/bandori/eventtracker/page.tsx");

  assert.match(appChrome, /useBandoriCardsMaster\(\)/u);
  assert.match(appChrome, /useBandoriCardsAssetIndex\(\)/u);
  assert.doesNotMatch(hook, /setInterval|INDEX_REVALIDATE_INTERVAL_MS/u);
  assert.match(client, /entry\.state\.value && !options\?\.refresh/u);
  assert.match(client, /options\?\.refresh \? "no-cache" : "default"/u);
  assert.doesNotMatch(tracker, /useBandoriCardsAssetIndex/u);
});

test("Toolbar shares profile data and keeps navigation separate from unread refresh", async () => {
  const toolbar = await readSource("src/components/Toolbar.tsx");

  assert.match(toolbar, /useAccountProfileStore/u);
  assert.doesNotMatch(toolbar, /fetch\("\/api\/account\/profile"/u);
  assert.doesNotMatch(toolbar, /loadAccountHeaderData/u);
  assert.match(toolbar, /event === "SIGNED_IN"[\s\S]*useGameStore\.getState\(\)\.userId === session\.user\.id/u);
  assert.match(toolbar, /event === "TOKEN_REFRESHED"/u);
  assert.match(toolbar, /showMenu[\s\S]*loadNotificationUnreadCount/u);
});

test("account profile and calendar auth reads filter duplicate work", async () => {
  const accountHook = await readSource("src/app/[locale]/account/useAccountProfile.ts");
  const calendarHook = await readSource("src/app/[locale]/bandori/calendar/useCalendarData.ts");
  const authClient = await readSource("src/lib/supabase.ts");

  assert.match(accountHook, /useAccountProfileStore/u);
  assert.match(accountHook, /writeAuthProfileSummaryCache/u);
  assert.doesNotMatch(authClient, /AUTH_SUMMARY_CACHE_TTL_MS/u);
  assert.match(calendarHook, /event === "TOKEN_REFRESHED"/u);
  assert.match(calendarHook, /checkedUserId === session\?\.user\.id/u);
});

test("event catalog and tracker use separate long-lived and live client policies", async () => {
  const cachePolicy = await readSource("src/lib/api-cache.ts");
  const trackerHook = await readSource("src/app/[locale]/bandori/eventtracker/useTrackerData.ts");
  const calendarHook = await readSource("src/app/[locale]/bandori/calendar/useCalendarData.ts");

  assert.match(
    cachePolicy,
    /LONG_CLIENT_CACHE_POLICY[\s\S]*staleTimeMs: 12 \* 60 \* 60 \* 1000,[\s\S]*refreshOnVisible: false/u,
  );
  assert.match(
    trackerHook,
    /LONG_CLIENT_CACHE_POLICY/u,
  );
  assert.match(
    trackerHook,
    /LIVE_CLIENT_CACHE_POLICY/u,
  );
  assert.match(
    calendarHook,
    /LONG_CLIENT_CACHE_POLICY/u,
  );
});

test("Cards master remains stable for the page lifetime", async () => {
  const cardsHook = await readSource("src/hooks/useBandoriCardsMaster.ts");
  const cachedFetch = await readSource("src/hooks/useCachedFetch.ts");

  assert.match(cardsHook, /SESSION_CLIENT_CACHE_POLICY/u);
  assert.doesNotMatch(cardsHook, /24 \* 60 \* 60 \* 1000/u);
  assert.match(cachedFetch, /doFetch\(true, "no-cache"\)/u);
});
