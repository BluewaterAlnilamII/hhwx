// Run with node tests/catalog-navigation.browser.mjs against a configured local Next server.
// PROFILE_TEST_UID must resolve in profile metadata. The server fixtures include CN card 13
// and Bandori song 46 with a playable chart in the music asset index.
// Browser reads use fixtures. PLAYWRIGHT_MODULE and PROFILE_TEST_ORIGIN can point to local installations.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { installProfileSession, user, userId } from "./fixtures/profile-session.mjs";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(), true);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.PROFILE_TEST_ORIGIN || "http://localhost:3000";
const publicUid = Number(process.env.PROFILE_TEST_UID || 10001);
const profilePath = "/user/" + publicUid;
const username = "Navigation fixture";
const createdAt = "2026-01-01";
const preferences = { signature: "", cover: null, publicAccounts: true, allowGameIdSearch: false,
  modules: ["cards", "songs"].map(id => ({ id, public: true })), accounts: [] };
const account = { userId, publicUid, username, email: user.email, emailVerified: true, roles: [], createdAt,
  avatarCardId: 0, avatarCardServer: null, avatarCardTrainType: "normal", displayDegreeServer: 0, displayDegreeId: 0 };
const profile = { publicUid, username, createdAt, signature: "", cover: null, isOwner: true, preferences, bindings: [],
  avatar: { cardId: 0, entityServer: null, trainType: "normal" }, displayDegree: { server: 0, degreeId: 0, degreeEffectId: null } };
const favorites = preferences.modules.map(({ id }) => ({ kind: id, items: Array.from({ length: 24 }, (_, i) => ({ target: String(i + 1), normalArt: false })) }));
const catalog = make => Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i + 1, make(i + 1)]));
const localized = value => Array(5).fill(value);
const datasets = {
  "/api/bandori/master/music": catalog(id => ({ bandId: 1, musicTitle: ["Song " + id], publishedAt: [1610000000000 + id], difficulty: { 3: { playLevel: 25 } } })),
  "/api/bandori/master/cards": catalog(id => ({ characterId: 1, rarity: 4, attribute: "cool", type: "permanent", prefix: ["Card " + id],
    resourceSetName: "res" + id, releasedAt: [1610000000000 + id], serverExtensions: [{}, null, null, null] })),
  "/api/bandori/master/degrees": { 1: { degreeType: ["normal", "", "", ""], degreeName: ["Degree", "", "", ""],
    baseImageName: ["degree001", "", "", ""], iconImageName: ["none", "", "", ""], rank: ["none", "", "", ""],
    description: ["Degree", "", "", ""], seq: [1, 0, 0, 0], characterId: [0, 0, 0, 0] } },
  "/api/bandori/master/characters": { payload: { 1: { bandId: 1, nickname: ["Kasumi"] } } },
  "/api/bandori/master/skills": { payload: {} },
  "/api/bandori/characters": { characters: Array.from({ length: 20 }, (_, i) => ({
    characterId: i + 1, bandId: 1 + Math.floor(i / 5), characterNameJp: "Character " + (i + 1),
    characterNameEn: "Character " + (i + 1), characterNameCn: "角色 " + (i + 1),
  })) },
  "/api/bandori/master/areaItems": { payload: {} },
  "/api/ournotes/master/music": catalog(id => ({ musicTitle: localized("Song " + id), bandName: localized("Band"), bandIds: [1], musicCategories: [1],
    musicType: "Ruby", startAt: "1767193200000", difficulty: {}, serverExtensions: [{}, {}, {}, {}, {}] })),
  "/api/ournotes/master/cards/member": catalog(id => ({ assetId: id, rarity: 4, cardType: 1, characterId: 1, subtitle: localized("Card " + id),
    powerMax: { performance: 100, technic: 200, visual: 300 }, startAt: localized("1767193200000"), serverExtensions: [{}, {}, {}, {}, {}] })),
  "/api/ournotes/master/characters": { 1: { characterName: localized("One"), shortName: localized("One"), bandId: 1, displayOrder: 1 } },
  "/api/ournotes/master/bands": { 1: { bandName: localized("Band") } },
  "/api/ournotes/master/skills": { leader: {}, live: {}, gekisou: {}, support: {}, gekisouSupport: {} },
  "/api/account/profile": account, "/api/account/auth-summary": account,
};
const indexes = {
  "/bandori/music/index.json": { schemaVersion: 2, updatedAt: createdAt, songs: {} },
  "/bandori/cards/index.json": { schemaVersion: 2, updatedAt: createdAt, resources: {} },
  "/ournotes/music/index.json": { schema: "ournotes-music-assets-index-v1", songs: {} },
  "/ournotes/cards/index.json": { schema: "ournotes-card-assets-index-v1", resources: { member: {}, support: {} } },
};
const y = locator => locator.evaluate(el => el.getBoundingClientRect().top);
async function checkProfile(page, phone) {
  const historyLength = await page.evaluate(() => history.length);
  const edit = page.locator("[data-edit=cards]");
  async function toggle(pressed) {
    if (phone) await edit.tap(); else await edit.press("Enter");
    await page.locator(`[data-edit=cards][aria-pressed=${pressed}]`).waitFor();
  }
  await toggle(true);
  assert.equal(page.url(), origin + profilePath);
  await toggle(false);
  assert.equal(await page.locator("[data-card]").count(), 6);
  await page.locator("[data-more=cards]").click();
  const expandedUrl = origin + profilePath + "#collection/cards";
  await page.waitForURL(expandedUrl);
  await toggle(true);
  assert.equal(page.url(), expandedUrl);
  await toggle(false);
  assert.equal(page.url(), expandedUrl);
  assert.equal(await page.evaluate(() => history.length), historyLength);
  const tile = page.locator("[data-card]").nth(11);
  const link = tile.getByRole("link");
  await tile.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const before = await y(tile);
  const detailUrl = new URL(await link.getAttribute("href"), expandedUrl).href;
  if (phone) { await link.tap(); await link.tap(); } else await link.click();
  await page.waitForURL(detailUrl);
  await page.locator("button[data-detail=true]").waitFor({ state: "attached" });
  assert.equal(await page.evaluate(() => scrollY), 0);
  await page.goBack();
  await page.waitForURL(expandedUrl);
  await tile.waitFor();
  await page.waitForFunction(top => Math.abs(document.querySelectorAll("[data-card]")[11].getBoundingClientRect().top - top) <= 2, before);
  return before;
}

async function checkRemovedFavorite(page) {
  const url = origin + profilePath + "#collection/cards";
  await page.goto(url);
  const card = page.locator('[data-card="13"]');
  await card.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const before = await y(card);
  const link = card.getByRole("link");
  await link.tap();
  await link.tap();
  await page.locator("button[data-detail=true]").waitFor({ state: "attached" });
  const items = favorites.find(group => group.kind === "cards").items;
  const index = items.findIndex(item => item.target === "13");
  const [removed] = items.splice(index, 1);
  try {
    await page.goBack();
    await page.waitForURL(url);
    const neighbor = page.locator('[data-card="12"]');
    await neighbor.waitFor();
    assert.equal(await card.count(), 0);
    const inView = await neighbor.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const bar = el.closest("[data-collection]").querySelector("[data-collection-heading]").getBoundingClientRect();
      return bounds.bottom > bar.bottom && bounds.top < innerHeight;
    });
    const start = await y(page.locator('[data-collection-start="cards"]'));
    assert.ok(inView || (start >= 0 && start < 100), "a removed favorite returns to a neighbor or the section start");
    console.log("PASS removed favorite", { before, neighbor: await y(neighbor), start });
  } finally {
    items.splice(index, 0, removed);
  }
}

const gameProfileId = "00000000-0000-0000-0000-000000000156";
const heldPath = "/bandori/game-profiles/" + gameProfileId + "/cards";
const loadTs = require("tsx/cjs/api").require;
const { encodeBestdoriProfile } = loadTs("../src/lib/bestdori-profile-codec.ts", import.meta.url);
const { encodeCompressedGameProfilePayload } = loadTs("../src/lib/user-game-profile-payload.ts", import.meta.url);
const holding = Array.from({ length: 156 }, (_, i) => ({
  cardId: i + 1, level: 50, masterRank: 0, skillLevel: 1, episodeCount: 0,
  isTrained: false, hasTrainedArt: false, isExcluded: false,
}));
const compressed = await encodeCompressedGameProfilePayload({
  bestdoriProfile: encodeBestdoriProfile({ name: "Navigation", server: 0, cards: holding,
    items: { PoppinParty: Array(7).fill(2), Afterglow: Array(7).fill(4), Roselia: Array(7).fill(3) }, potentials: [] }),
});
async function visitSongsAndGoBack(page, phone) {
  const previous = page.url();
  if (phone) await page.getByRole("button", { name: "打开页面导航", exact: true }).tap();
  await page.locator('nav a[href="/bandori/songs"]:visible').first().click();
  await page.waitForURL(origin + "/bandori/songs");
  await page.locator("[data-reading-row]").first().waitFor();
  assert.equal(await page.evaluate(() => scrollY), 0, "opening the catalog from the sidebar starts at the top");
  await page.goBack();
  await page.waitForURL(previous);
}

async function checkProfileItems(page, phone) {
  const url = origin + "/bandori/game-profiles/" + gameProfileId + "/items";
  await page.goto(url);
  for (const [section, id] of [["区域道具", "Afterglow:5"], ["角色加成", "15"]]) {
    const initialLength = await page.evaluate(() => history.length);
    const tab = page.getByRole("button", { name: section, exact: true });
    await tab.click();
    assert.equal(page.url(), url);
    assert.equal(await page.evaluate(() => history.length), initialLength);
    const row = page.locator(`[data-reading-row="${id}"]`);
    await row.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
    const before = await y(row);
    assert.ok(await page.evaluate(() => scrollY > 0));
    await visitSongsAndGoBack(page, phone);
    await page.getByRole("button", { name: section, pressed: true }).waitFor();
    await page.waitForFunction(({ id, before }) => {
      const row = document.querySelector(`[data-reading-row="${id}"]`);
      return row && Math.abs(row.getBoundingClientRect().top - before) <= 2;
    }, { id, before });
    console.log("PASS profile items", JSON.stringify({ phone, section, id, before, restored: await y(row) }));
    if (section === "角色加成") {
      await page.reload();
      await page.getByRole("button", { name: section, pressed: true }).waitFor();
      await page.waitForFunction(({ id, before }) =>
        Math.abs(document.querySelector(`[data-reading-row="${id}"]`).getBoundingClientRect().top - before) <= 2, { id, before });
    }
  }
  await page.goForward();
  await page.waitForURL(origin + "/bandori/songs");
  await page.goto(url);
  await page.getByRole("button", { name: "区域道具", pressed: true }).waitFor();
  assert.equal(await page.evaluate(() => scrollY), 0);
}

async function checkHeldCards(page, phone) {
  await page.goto(origin + heldPath);
  const more = page.getByRole("button", { name: /显示更多.*张/ });
  await page.getByRole("button", { name: "展开筛选" }).click();
  const sort = page.locator("select").filter({ has: page.locator("option[value=power]") });
  const selectedSort = await sort.locator("option").evaluateAll(options => options.find(option => !option.selected).value);
  await sort.selectOption(selectedSort);
  await more.click();
  await page.getByRole("button", { name: "显示更多 36 张" }).waitFor();
  await more.scrollIntoViewIfNeeded();
  const tiles = page.locator("[data-bandori-virtual-grid] button[aria-label^=编辑]");
  const before = await tiles.evaluateAll(buttons => {
    const row = buttons.findLast(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 60 && rect.bottom <= innerHeight;
    });
    return { label: row.getAttribute("aria-label"), y: row.getBoundingClientRect().top, scroll: scrollY };
  });
  await visitSongsAndGoBack(page, phone);
  await more.waitFor();
  const restored = page.getByRole("button", { name: before.label, exact: true });
  assert.equal(await more.innerText(), "显示更多 36 张");
  assert.equal(await sort.inputValue(), selectedSort);
  await restored.waitFor();
  await page.waitForFunction(({ label, y }) => Array.from(document.querySelectorAll("button[aria-label]")).some(button =>
    button.getAttribute("aria-label") === label && Math.abs(button.getBoundingClientRect().top - y) <= 2), before);
  console.log("PASS held cards", JSON.stringify({ phone, selectedSort, before, restoredY: await y(restored) }));
  const search = page.getByRole("searchbox", { name: "搜索卡牌名称或其他条件" });
  await search.fill("#37");
  await search.press("Enter");
  const onlyTile = page.getByRole("button", { name: "编辑 Card 37", exact: true });
  await onlyTile.waitFor();
  await page.waitForFunction(() => document.querySelectorAll("[data-bandori-virtual-grid] [data-reading-row]").length === 1);
  await visitSongsAndGoBack(page, phone);
  await onlyTile.waitFor();
  assert.equal(await search.inputValue(), "#37");
  assert.equal(await tiles.count(), 1);
}

async function checkNotifications(page, phone) {
  const path = "/account/notifications";
  const replyType = "comment_reply", reactionType = "comment_reaction";
  const records = (type, count) => Array.from({ length: count }, (_, i) => {
    const n = count - i;
    const id = "10000000-0000-0000-0000-" + String(n).padStart(12, "0");
    return { id, type, actorUserId: null, actorUsername: "Actor " + n, recipientUserId: userId,
      targetType: "bandori_card", targetId: "13", commentId: id, linkCommentId: id,
      createdAt: new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString(), readAt: null,
      activityCommentId: type === replyType ? id : null, reactionEmojiKey: type === reactionType ? "heart" : null };
  });
  const replies = records(replyType, 3), reactions = records(reactionType, 48);
  let failNextReactionPage = false;
  const endpoint = /\/api\/account\/notifications(?:\?|$)/u;
  await page.route(endpoint, route => {
    if (route.request().method() === "PATCH") {
      const item = reactions.find(item => item.id === route.request().postDataJSON().notificationId);
      if (item) item.readAt = new Date().toISOString();
      return route.fulfill({ json: { success: true, data: { ok: true } } });
    }
    const params = new URL(route.request().url()).searchParams;
    if (failNextReactionPage && params.get("type") === reactionType && params.has("cursor")) {
      failNextReactionPage = false;
      return route.fulfill({ status: 503, json: { success: false } });
    }
    const all = params.get("type") === reactionType ? reactions : replies;
    const start = params.has("cursor") ? all.findIndex(item => item.id === params.get("cursor")) + 1 : 0;
    const notifications = all.slice(start, start + 20);
    const hasMore = start + notifications.length < all.length;
    return route.fulfill({ json: { success: true, data: { notifications, hasMore, nextCursor: hasMore ? notifications.at(-1).id : null } } });
  });
  await page.goto(origin + path);
  await page.locator("#notification-tab-comment_reaction").click();
  failNextReactionPage = !phone;
  await page.locator("[role=tabpanel] button").click();
  const retry = page.getByRole("button", { name: "重试", exact: true });
  if (!phone) {
    await retry.waitFor();
    assert.equal(await page.locator("[role=tabpanel] [data-reading-row]").count(), 20);
    await retry.click();
  }
  const id = reactions[37].id;
  const link = page.locator(`a[data-reading-row="${id}"]`);
  await link.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const before = await y(link);
  if (phone) await link.tap(); else await link.press("Enter");
  await page.waitForURL("**/bandori/cards/13?**");
  await page.locator("button[data-detail=true]").waitFor({ state: "attached" });
  reactions.unshift(...records(reactionType, 53).slice(0, 5));
  failNextReactionPage = phone;
  await page.goBack();
  await page.waitForURL(origin + path);
  if (phone) {
    await retry.waitFor();
    assert.equal(await page.locator("[role=tabpanel] [data-reading-row]").count(), 20);
    await retry.tap();
  }
  await link.waitFor();
  assert.equal(await page.locator("[role=tab][aria-selected=true]").getAttribute("id"), "notification-tab-comment_reaction");
  await page.waitForFunction(({ id, before }) => {
    const row = document.querySelector(`[data-reading-row="${id}"]`);
    return row === document.activeElement && Math.abs(row.getBoundingClientRect().top - before) <= 2;
  }, { id, before });
  assert.equal(await link.locator('[aria-label="未读"]').count(), 0);
  assert.equal(await page.locator("[role=tabpanel] [data-reading-row]").count(), 53);
  console.log("PASS notifications", JSON.stringify({ phone, before, restoredY: await y(link), id }));
  await page.goto(origin + "/bandori/songs");
  await page.goto(origin + path);
  await page.locator("#notification-tab-comment_reply[aria-selected=true]").waitFor();
  assert.equal(await page.locator("[role=tabpanel] [data-reading-row]").count(), 3);
  await page.unroute(endpoint);
}

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true });
try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const phone = width < 500;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, reducedMotion: "reduce", serviceWorkers: "block" });
    await installProfileSession(context, process.env.NEXT_PUBLIC_SUPABASE_URL);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path.startsWith("/auth/v1/")) return route.fallback();
      if (path === "/api/users/" + publicUid) {
        await new Promise(resolve => setTimeout(resolve, 300));
        return route.fulfill({ json: { success: true, data: profile } });
      }
      if (path === "/api/account/game-profiles/" + gameProfileId + "/payload") {
        return route.fulfill({ json: { success: true, data: { compressed, profile: { isEditable: true }, sectionVersions: { cardsHash: "fixture" } } } });
      }
      if (path.startsWith("/api/")) {
        if (path.endsWith("/comments")) return route.fulfill({ json: { success: true, data: { comments: [], page: 1, totalPages: 1, totalCount: 0 } } });
        const data = path === "/api/bandori/favorites" && url.searchParams.has("profile") ? favorites : (datasets[path] ?? []);
        return route.fulfill({ json: { success: true, data } });
      }
      if (indexes[path]) return route.fulfill({ json: indexes[path], headers: { "access-control-allow-origin": "*" } });
      return url.origin === origin ? route.continue() : route.abort();
    });

    await checkProfileItems(page, phone);
    await checkNotifications(page, phone);
    await checkHeldCards(page, phone);
    for (const path of ["/bandori/songs", "/bandori/cards", "/ournotes/songs", "/ournotes/cards"]) {
      const catalogUrl = origin + path;
      await page.goto(catalogUrl, { waitUntil: "domcontentloaded" });
      const rows = page.locator("[data-reading-row]");
      await rows.nth(39).waitFor();
      assert.equal(await rows.count(), 40);
      await page.locator("button.hhwx-catalog-action").click();
      if (path === "/bandori/songs") {
        await rows.nth(79).waitFor();
        const lastOriginalRow = rows.nth(39);
        const before = await y(lastOriginalRow);
        const top = await page.evaluate(() => scrollY);
        assert.ok(top > 0);
        await page.goBack();
        await page.waitForURL(origin + heldPath);
        await page.getByRole("button", { name: "编辑 Card 37", exact: true }).waitFor();
        await page.goForward();
        await page.waitForURL(catalogUrl);
        await rows.nth(79).waitFor();
        assert.ok(Math.abs(await y(lastOriginalRow) - before) <= 2, "Forward after Show More restores the reading position");
      }
      const row = rows.nth(54);
      await row.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
      const before = await y(row), id = await row.getAttribute("data-reading-row");
      if (path === "/bandori/songs" && !phone) {
        const titleLink = row.getByRole("link").first();
        await titleLink.press("Enter");
        await page.waitForURL(origin + "/bandori/songs/46");
        await page.getByRole("heading", { name: "Song 46", exact: true }).first().waitFor();
        await page.goBack();
        await row.waitFor();
        assert.equal(await titleLink.evaluate(el => el === document.activeElement), true, "Back returns keyboard focus to the song link");
        assert.ok(Math.abs(await y(row) - before) <= 2);
      }
      await page.locator("header button[aria-haspopup=menu]").last().click();
      await page.locator(`header a[href="${profilePath}"]`).click();
      await page.getByRole("heading", { name: username, exact: true }).waitFor();
      await page.locator("[data-card]").first().waitFor();
      assert.equal(await page.evaluate(() => scrollY), 0, "the profile cover stays at the top after loading");
      const profilePosition = path === "/bandori/songs" ? await checkProfile(page, phone) : null;
      await page.goBack();
      await page.waitForURL(catalogUrl);
      await row.waitFor();
      assert.equal(await rows.count(), 80);
      assert.equal(await row.getAttribute("data-reading-row"), id);
      assert.ok(Math.abs(await y(row) - before) <= 2, "the same row returns to its previous screen position");
      if (profilePosition !== null) {
        await page.goForward();
        await page.waitForURL(origin + profilePath + "#collection/cards");
        await page.locator("[data-card]").nth(11).waitFor();
        await page.waitForFunction(top => Math.abs(document.querySelectorAll("[data-card]")[11].getBoundingClientRect().top - top) <= 2, profilePosition);
        await page.reload();
        await page.locator("[data-more=cards]").waitFor();
        assert.equal(page.url(), origin + profilePath);
        if (phone) await page.getByRole("button", { name: "打开页面导航", exact: true }).tap();
        await page.locator(`nav a[href="${path}"]:visible`).first().click();
        await rows.nth(39).waitFor();
        assert.equal(await rows.count(), 40, "a new visit to the same catalog starts with its first batch");
        assert.equal(await page.evaluate(() => scrollY), 0);
        await page.goBack();
        await page.waitForURL(origin + profilePath);
        await page.goBack();
        await row.waitFor();
        assert.equal(await rows.count(), 80, "the earlier visit keeps its own batch");
        assert.ok(Math.abs(await y(row) - before) <= 2);
        const input = page.locator("input[type=search], input[placeholder]").first();
        await input.fill("Song");
        await input.press("Enter");
        await page.waitForURL("**?q=Song");
        await page.waitForFunction(() => document.querySelectorAll("[data-reading-row]").length === 40);
      }
      console.log("PASS", width, path, id, Math.round(before));
    }
    await page.goto(origin + profilePath + "#collection/cards/edit", { waitUntil: "domcontentloaded" });
    await page.locator("[data-edit=cards][aria-pressed=true]").click();
    await page.locator("[data-more=cards]").waitFor();
    assert.equal(page.url(), origin + profilePath);
    await page.goBack();
    await page.waitForURL(origin + "/ournotes/cards");
    if (phone) await checkRemovedFavorite(page);
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
