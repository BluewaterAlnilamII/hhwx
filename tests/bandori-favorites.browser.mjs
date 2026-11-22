// Run against a local Next development server and a migrated local Supabase project.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

async function checkEventEntry(page, url) {
  await page.waitForURL(url);
  await page.locator(".event-view-tabs-bar").waitFor();
  assert.ok(await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return Math.abs(window.scrollY) <= 1;
  }), "opening an event from favorites starts at the top after its content loads");
}
const require = createRequire(import.meta.url);
// Keep repeated detail/back gestures independent of CDN image latency.
const eventBannerFixture = route => route.fulfill({
  contentType: "image/svg+xml",
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="140"><rect width="420" height="140" fill="#4787bd"/></svg>',
});

async function checkVisitorFavorites(page, phone, hostUid, api) {
  const url = origin + "/user/" + hostUid;
  const projection = "?profile=" + hostUid;
  const original = await api(projection);
  const seenKeys = [];
  const countKeys = request => { if (request.url().endsWith("/favorites?view=keys")) seenKeys.push(request); };
  page.on("request", countKeys);
  try {
    await page.goto(url, {waitUntil:"domcontentloaded"});
    const card = page.locator('[data-card="en:10001"]');
    const region = page.getByRole("button", {name:"国服",exact:true});
    await region.click();
    const event = page.locator('[data-event="cn:325"]');
    const song = page.locator('[data-song="4"]');
    const menu = page.getByRole("dialog").filter({has:page.getByText("转到歌曲详情", {exact:true})});
    const trigger = song.locator('button[aria-haspopup="dialog"]');
    const openMenu = async () => {
      if (phone) await trigger.tap(); else { await song.hover(); await trigger.click(); }
      await menu.waitFor();
    };
    assert.equal(await page.locator("[data-edit]").count(), 0);
    for (const [row, target] of [[card,"cards:en:10001"],[event,"events:cn:325"]]) {
      const art = row.locator("a").first();
      if (phone) await (row === event ? art.locator("img") : art).tap(); else await art.hover();
      const star = row.getByRole("button", {name:"收藏",exact:true});
      await star.click();
      await row.getByRole("button", {name:"取消收藏",exact:true}).waitFor();
      assert.ok((await api("?view=keys")).includes(target));
      assert.equal(new URL(page.url()).pathname, "/user/" + hostUid);
    }
    await page.getByRole("button", {name:"日服", exact:true}).click();
    const jp = page.locator('[data-event="jp:325"]');
    assert.equal(await jp.locator("button[aria-pressed]").getAttribute("aria-pressed"), "false");
    await region.click();
    await openMenu();
    assert.deepEqual(await menu.locator(":scope > :is(button,a)").allTextContents(), ["添加收藏","转到歌曲详情","下一首播放","加入播放队列"]);
    await page.route("**/api/bandori/favorites/songs:4", r => r.fulfill({status:503,json:{success:false}}), {times:1});
    const add = menu.getByRole("button", {name:"添加收藏"});
    await add.click();
    await menu.getByRole("alert").waitFor();
    await add.click();
    await menu.waitFor({state:"hidden"});
    assert.ok((await api("?view=keys")).includes("songs:4"));
    assert.equal(seenKeys.length, 1, "all visitor controls share one membership read per session");
    for (const selector of ["a:has(img)", "h2 a", ":scope > a"]) {
      await openMenu();
      const detail = menu.locator(selector);
      assert.equal(await detail.getAttribute("href"), "/bandori/songs/4");
      if (phone) await detail.tap(); else await detail.click();
      await page.waitForURL("**/bandori/songs/4");
      await page.goBack({waitUntil:"domcontentloaded"});
      await trigger.waitFor({state:"attached"});
      await page.waitForFunction(() => document.activeElement?.closest('[data-song="4"]'));
    }
    await openMenu();
    await menu.getByRole("button", {name:"取消收藏"}).click();
    await menu.waitFor({state:"hidden"});
    for (const row of [card,event]) {
      if (phone) {
        const art = row.locator("a").first();
        await (row === event ? art.locator("img") : art).tap();
      } else await row.locator("a").first().hover();
      await row.getByRole("button", {name:"取消收藏"}).click();
      await row.getByRole("button", {name:"收藏",exact:true}).waitFor();
    }
    const keys = await api("?view=keys");
    assert.ok(["songs:4","events:cn:325","cards:en:10001"].every(key => !keys.includes(key)));
    assert.deepEqual(await api(projection), original, "the host's favorites and order survive every visitor operation");
    console.log("PASS visitor-only writes, shared keys, regional stars and all three song detail links", phone ? "touch" : "desktop");
  } finally { page.off("request", countKeys); }
}

async function checkEventSongFavorites(page, phone) {
  await page.goto(origin + "/bandori/events/329?server=cn&view=info", { waitUntil: "domcontentloaded" });
  const group = page.locator('[data-song-group="ranking"]');
  const song = group.locator("[data-music-id]").first();
  await song.waitFor({timeout: 90000});
  const id = await song.getAttribute("data-music-id");
  const rows = group.locator("tbody tr").filter({has: page.locator(`a[href$="/songs/${id}"]`)});
  const star = song.locator('button[aria-pressed][aria-disabled=false]');
  await star.waitFor();
  await rows.first().waitFor();
  assert.ok(await rows.count() > 1);
  const initial = await star.getAttribute("aria-pressed");
  const toggled = String(initial !== "true");
  if (phone) {
    await star.tap();
    assert.equal(await rows.locator("button").count(), 0);
  } else {
    await rows.first().getByRole("link").focus();
    await page.keyboard.press("Tab");
    assert.equal(await rows.first().locator("button").evaluate(button => button === document.activeElement), true);
    await page.keyboard.press("Enter");
  }
  await song.locator(`button[aria-pressed="${toggled}"]`).waitFor();
  if (!phone && toggled === "true") {
    await rows.last().locator('button[aria-pressed=true]').waitFor();
    assert.equal(await rows.locator('button[aria-pressed=true]').count(), await rows.count());
  }
  await star.click();
  await song.locator(`button[aria-pressed="${initial}"]`).waitFor();
  assert.equal(new URL(page.url()).pathname, "/bandori/events/329");
}

async function checkPendingEvents(page, api, profilePath) {
  const catalogPath = "/api/bandori/master/events";
  const catalog = await (await fetch(origin + catalogPath)).json();
  const ids = [347, 348, 349];
  // Keep the browser's unpublished and later published schedules reproducible as master data advances.
  for (const id of [346, ...ids]) {
    const record = catalog.data[id];
    for (const field of ["eventName", "startAt", "endAt"]) record[field].fill(null, 1);
    for (const code of ["en", "tw", "cn"]) delete record[code + "Schedule"];
  }
  await page.route("**" + catalogPath, route => route.fulfill({ json: catalog }));
  const key = "/events:cn:349";
  await page.goto(origin + "/bandori/events/349?server=cn", {waitUntil:"domcontentloaded"});
  const star = page.locator("button[data-detail=true]");
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 850 });
  const title = page.locator(".event-heading h1");
  await star.waitFor();
  const [titleBox, starBox] = await Promise.all([title.boundingBox(), star.boundingBox()]);
  assert.equal(starBox.width, 44);
  assert.ok(Math.abs(starBox.x - titleBox.x - titleBox.width - 8) < 1);
  assert.ok(Math.abs(titleBox.y + titleBox.height / 2 - starBox.y - starBox.height / 2) < 1);
  assert.ok(starBox.x + starBox.width <= 390);
  await star.click();
  await page.locator("button[data-detail=true][aria-pressed=true]").waitFor();
  const saved = page.locator('[data-action-feedback="success"]');
  await saved.waitFor();
  const [badge, anchor, viewportWidth] = await Promise.all([
    saved.boundingBox(), star.boundingBox(), page.evaluate(() => document.documentElement.clientWidth),
  ]);
  const centered = anchor.x + (anchor.width - badge.width) / 2;
  const expectedLeft = Math.max(12, Math.min(centered, viewportWidth - badge.width - 12));
  assert.ok(Math.abs(badge.x - expectedLeft) < 1, `Feedback left ${badge.x}, expected ${expectedLeft}`);
  await page.setViewportSize(viewport);
  const events = (await api("")).find(group => group.kind === "events").items;
  assert.ok(events.some(item => item.target === "cn:349"));
  assert.ok(!events.some(item => item.target === "jp:349"));

  for (const code of ["en", "tw"]) {
    for (const id of [1, 349, 347, 348]) await api(`/events:${code}:${id}`, "PUT");
  }
  await page.goto(origin + profilePath, {waitUntil:"domcontentloaded"});
  const flags = page.getByRole("group", { name: "活动区服" });
  const stations = page.getByRole("tabpanel").locator('li:has(a[href*="/bandori/events/"])');
  const stationIds = () => stations.getByRole("link").evaluateAll(links => links.map(link => Number(new URL(link.href).pathname.split("/").pop())));
  await page.locator("[data-more=events]").click();
  const cnEvent = stations.filter({ has: page.locator('a[href$="/349?server=cn"]') });
  await cnEvent.filter({ hasText: "未开始" }).getByText("—", { exact: true }).waitFor();
  await page.getByRole("button", { name: "收起收藏的活动", exact: true }).click();
  await page.locator("[data-more=events]").waitFor();
  for (const name of ["国际服", "台服"]) {
    await flags.getByRole("button", { name, exact: true }).click();
    assert.deepEqual(await stationIds(), [1, ...ids]);
    assert.equal(await stations.filter({ hasText: "未开始" }).getByText("—", { exact: true }).count(), 3);
  }
  const start = Date.now() + 7 * 86400000;
  catalog.data[349].startAt[1] = start;
  catalog.data[349].endAt[1] = start + 7 * 86400000;
  catalog.data[349].cnSchedule = { startAt: start, endAt: start + 7 * 86400000 };
  await page.reload({waitUntil:"domcontentloaded"});
  await flags.getByRole("button", { name: "国服", exact: true }).click();
  await cnEvent.getByText("未开始", { exact: true }).waitFor();
  assert.equal(await cnEvent.getByText("—", { exact: true }).count(), 0);
  await flags.getByRole("button", { name: "国际服", exact: true }).click();
  assert.deepEqual(await stationIds(), [1, 349, 347, 348]);
  assert.equal(await stations.filter({ hasText: "未开始" }).count(), 3);
  assert.equal(await stations.getByText("—", { exact: true }).count(), 2);
  await api("/events:en:346", "PUT"); // A fourth upcoming event is outside the preview.
  await api("/events:tw:2", "PUT"); // Only an older event is outside this preview.
  await page.reload({waitUntil:"domcontentloaded"});
  const lastRail = stations.last().locator("i");
  const railStyle = property => lastRail.evaluate((rail, name) => getComputedStyle(rail, "::before").getPropertyValue(name), property);
  await flags.getByRole("button", { name: "国际服", exact: true }).click();
  assert.deepEqual(await stationIds(), [1, 349, 346, 347]);
  const eventIcons = id => stations.filter({ has: page.locator(`a[href$="/${id}?server=en"]`) }).locator('img:not([alt=""])').evaluateAll(images =>
    images.map(image => new URL(image.src).pathname.split("/").pop()));
  assert.deepEqual(await eventIcons(349), ["band_4.svg", "pure.svg"]);
  assert.deepEqual(await eventIcons(1), ["pure.svg"]);
  const solidColor = await stations.first().locator("i").evaluate(rail => getComputedStyle(rail, "::before").backgroundColor);
  assert.equal(await railStyle("background-color"), solidColor);
  assert.match(await railStyle("mask-image"), /repeating-linear-gradient/);
  assert.equal(await railStyle("height"), "1px");
  await page.setViewportSize({ width: 390, height: 850 });
  assert.equal(await railStyle("background-color"), solidColor);
  assert.match(await railStyle("mask-image"), /repeating-linear-gradient/);
  assert.equal(await railStyle("width"), "1px");
  await flags.getByRole("button", { name: "台服", exact: true }).click();
  assert.deepEqual(await stationIds(), [2, ...ids]);
  assert.equal(await railStyle("display"), "none");
  await page.setViewportSize(viewport);
  await page.locator("[data-more=events]").click();
  await flags.getByRole("button", { name: "国际服", exact: true }).click();
  assert.equal(await stations.count(), 5);
  const wrappedRow = await stations.nth(3).locator("i").evaluate(rail => {
    const line = getComputedStyle(rail, "::before");
    return { visible: line.display !== "none", mask: line.maskImage, width: parseFloat(line.width), cell: rail.getBoundingClientRect().width };
  });
  assert.ok(wrappedRow.visible && wrappedRow.mask === "none" && Math.abs(wrappedRow.width - wrappedRow.cell) < 1);
  assert.equal(await railStyle("display"), "none");
  await page.getByRole("button", { name: "编辑收藏活动" }).click();
  const iconPositions = id => stations.getByText(id + "期", { exact: true }).evaluate(period => {
    const number = document.createRange();
    number.selectNodeContents(period.lastChild);
    return [period.querySelector("img:last-of-type").getBoundingClientRect().left, number.getBoundingClientRect().left];
  });
  for (const width of [viewport.width, 390]) {
    await page.setViewportSize({ width, height: viewport.height });
    assert.deepEqual(await iconPositions(1), await iconPositions(349), "Mixed and themed event rows align their attributes and numbers");
  }
  await page.setViewportSize(viewport);
  await api("/events:en:346", "DELETE");
  await api("/events:tw:2", "DELETE");
  await page.unroute("**" + catalogPath);
  for (const code of ["en", "tw"]) {
    for (const id of [1, ...ids]) await api(`/events:${code}:${id}`, "DELETE");
  }
  await api(key, "DELETE");
  console.log("PASS pending event 349, separate regional counts, EN/TW ID order and later local dates");
}

async function checkCollectionDisclosures(page, panel, phone) {
  await page.emulateMedia({reducedMotion:"no-preference"});
  for (const kind of ["cards", "events", "songs"]) {
    const section = panel.locator(`[data-collection="${kind}"]`);
    const heading = section.locator("[data-collection-heading]");
    const footer = section.locator("[data-more-footer]");
    await footer.waitFor();
    const toggle = heading.locator("[data-heading-part=toggle]");
    if (kind === "events") {
      const flags = heading.getByRole("group");
      const selected = await flags.locator("[aria-pressed=true]").getAttribute("aria-label");
      await flags.locator("[aria-pressed=false]").first().click();
      assert.equal(new URL(page.url()).hash, "");
      assert.equal(await toggle.count(), 0);
      assert.equal(await footer.count(), 0);
      await flags.getByRole("button", {name:selected, exact:true}).click();
      await footer.waitFor();
    }
    const items = { cards:"[data-card]", events:"[data-event]", songs:"[data-song]" }[kind];
    const retained = await section.evaluateHandle((el, selector) => {
      const nodes = [...el.querySelectorAll(selector + ", [data-song-play], [data-collection-heading] [role=group], [data-heading-part=toggle]")];
      const numbers = new Set(el.querySelectorAll("[data-song] > div:has(> [data-song-play])"));
      let flashes = 0;
      const record = event => { if (numbers.has(event.target)) flashes++; };
      el.addEventListener("animationstart", record);
      return {check: () => nodes.every(node => node.isConnected) && flashes === 0, stop: () => el.removeEventListener("animationstart", record)};
    }, items);
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    const previewCount = await section.locator(items).count();
    assert.equal((await footer.innerText()).trim(), "全部");
    const centered = await footer.evaluate(el => {
      const box = el.getBoundingClientRect(), parent = el.closest("section").getBoundingClientRect();
      return Math.abs(box.left + box.right - parent.left - parent.right) < 2;
    });
    assert.ok(centered);
    await footer.click();
    await page.waitForURL("**#collection/" + kind);
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    assert.ok(await retained.evaluate(probe => probe.check()));
    await section.getByRole("button", {name:"收起", exact:true, expanded:true}).waitFor();
    assert.ok(await section.locator(items).count() > previewCount);
    if (phone) await footer.tap(); else await footer.press("Enter");
    await section.getByRole("button", {name:"全部", exact:true, expanded:false}).waitFor();
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(await section.locator(items).count(), previewCount);
    assert.ok(await toggle.evaluate(el => el === document.activeElement));
    await toggle.click();
    await page.waitForURL("**#collection/" + kind);
    await section.evaluate(el => Promise.allSettled(el.getAnimations({subtree:true})
      .filter(animation => animation.id === "collection-enter").map(animation => animation.finished)));
    await heading.scrollIntoViewIfNeeded();
    const title = await heading.locator("h2").boundingBox();
    const point = [title.x + 3, title.y + title.height / 2];
    if (phone) await page.touchscreen.tap(...point); else await page.mouse.click(...point);
    await section.getByRole("button", {name:"全部", exact:true, expanded:false}).waitFor();
    assert.ok(await retained.evaluate(probe => probe.check()));
    await retained.evaluate(probe => probe.stop());
    await retained.dispose();
  }
  await page.emulateMedia({reducedMotion:"reduce"});
}

async function checkInlineCollections(page, panel, cards) {
  const previewCount = await cards.count();
  const section = kind => panel.locator(`[data-collection="${kind}"]`);
  const cardHeader = section("cards").locator("[data-collection-heading]");
  const frame = async heading => heading.evaluate(el => {
    const bar = el.getBoundingClientRect(), title = el.querySelector("h2").getBoundingClientRect();
    return [bar.height, title.top - bar.top, bar.bottom - title.bottom];
  });
  const center = element => element.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const painted = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await center(cardHeader);
  const normal = await frame(cardHeader);
  assert.ok(Math.abs(normal[1] - normal[2]) <= 1);
  await section("cards").locator("[data-collection-start]").evaluate(el => scrollBy({top:el.getBoundingClientRect().top - 30, behavior:"instant"}));
  await cardHeader.locator("[data-more]").waitFor();
  const toolbar = await page.getByRole("banner").boundingBox();
  const pinnedCard = await cardHeader.boundingBox();
  assert.ok(Math.abs(pinnedCard.y - toolbar.height) <= 1, JSON.stringify({pinnedCard,toolbar}));
  assert.deepEqual(await frame(cardHeader), normal);
  const tiles = () => cards.evaluateAll((list, count) => list.slice(0, count).map(el => {
    const {x, y, width, height} = el.getBoundingClientRect();
    return [x, y, width, height];
  }), previewCount);
  const original = await tiles();
  await cardHeader.locator("[data-more]").click();
  await section("cards").locator('[data-size="6"]').first().waitFor();
  assert.deepEqual(await tiles(), original);
  assert.deepEqual(await frame(cardHeader), normal);
  assert.equal(await cardHeader.locator("h2").evaluate(el => el.getAnimations().length), 0);
  assert.equal(await panel.locator("[data-collection-view]").count(), 1);
  const closeCards = cardHeader.getByRole("button", {name:"收起收藏的卡牌",exact:true});
  await closeCards.click();
  await cardHeader.locator("[data-more]").waitFor();
  await painted();
  assert.deepEqual(await tiles(), original);
  await cardHeader.locator("[data-more]").click();
  await center(section("cards").locator("[data-card]").last());
  const previewGroup = section("cards").locator("[data-size]").first();
  const lowerEdge = el => el.getBoundingClientRect().bottom;
  assert.ok(await previewGroup.evaluate(lowerEdge) < await cardHeader.evaluate(lowerEdge));
  const beforeClose = await cardHeader.boundingBox();
  await closeCards.click();
  await cardHeader.locator("[data-more]").waitFor();
  // A cold playlist can temporarily leave too little content below the card wall.
  await section("songs").locator("[data-song]").first().waitFor();
  await page.waitForFunction(() => {
    const wall = document.querySelector('[data-collection="cards"]');
    return Math.abs(wall.querySelector("[data-size]").getBoundingClientRect().bottom - wall.querySelector("[data-collection-heading]").getBoundingClientRect().bottom) <= 1;
  }, null, {timeout:5000});
  await painted();
  const previewBottom = await previewGroup.evaluate(lowerEdge), barBottom = await cardHeader.evaluate(lowerEdge);
  assert.ok(Math.abs(previewBottom - barBottom) <= 1, JSON.stringify({previewBottom,barBottom,beforeClose,scroll:await page.evaluate(()=>scrollY)}));
  await cardHeader.locator("[data-more]").click();
  const eventHeader = section("events").locator("[data-collection-heading]");
  await center(section("events").locator("[data-collection-start]"));
  const previewId = await section("events").locator("[data-event]").first().getAttribute("data-event");
  const previewEvent = section("events").locator(`[data-event="${previewId}"]`);
  const before = await previewEvent.boundingBox();
  await page.emulateMedia({reducedMotion:"no-preference"});
  const titleMotion = await eventHeader.evaluate(bar => new Promise((resolve, reject) => {
    const section = bar.closest("section");
    const timeout = setTimeout(() => reject(new Error("Collection expansion did not animate")), 4000);
    const observer = new MutationObserver(async () => {
      observer.disconnect();
      const el = section.querySelector("h2");
      const animations = el.getAnimations();
      const extra = [...section.querySelectorAll("[data-event][data-collection-extra]")].filter(item => {
        const box = item.getBoundingClientRect();
        return box.bottom > 0 && box.top < innerHeight;
      });
      const entering = extra.every(item => item.getAnimations().some(animation => animation.effect.getKeyframes()[0].opacity === "0"));
      await Promise.allSettled(animations.map(animation => animation.finished));
      clearTimeout(timeout);
      resolve(entering && animations.every(animation => animation.effect.getKeyframes().every(frame => frame.opacity !== "0")));
    });
    observer.observe(section, {attributes:true, attributeFilter:["data-collection-view"]});
    bar.querySelector("[data-more]").click();
  }));
  assert.equal(titleMotion, true);
  await page.waitForURL("**#collection/events");
  const after = await previewEvent.boundingBox();
  assert.ok(Math.abs(after.y - before.y) <= 1 && Math.abs(after.x - before.x) <= 1, JSON.stringify({before,after,previewId}));
  // Exercise a late layout change after the transition has already aligned the visible event.
  const timeline = section("events").locator("ul");
  for (const padding of ["32px", ""]) {
    await timeline.evaluate((el, value) => { el.style.paddingBlockStart = value; }, padding);
    await painted();
    const retained = await previewEvent.boundingBox();
    assert.ok(Math.abs(retained.y - before.y) <= 1, JSON.stringify({before,retained,padding}));
  }
  await page.evaluate(() => scrollBy({top:48, behavior:"instant"}));
  await painted();
  const scrolled = await previewEvent.boundingBox();
  assert.ok(scrolled.y < before.y - 40);
  await timeline.evaluate(el => { el.style.paddingBlockEnd = "32px"; });
  await painted();
  assert.ok(Math.abs((await previewEvent.boundingBox()).y - scrolled.y) <= 1);
  await timeline.evaluate(el => { el.style.removeProperty("padding-block-end"); });
  assert.equal(await cards.count(), previewCount);
  assert.equal(await panel.locator("[data-collection-view]").count(), 1);
  const extra = section("events").locator("[data-event][data-collection-extra]").first();
  if (await extra.count()) {
    await center(extra);
    const fading = await extra.evaluate(el => {
      el.closest("section").querySelector("[data-heading-part=toggle]").click();
      return el.getAnimations().some(animation => animation.effect.getKeyframes().at(-1).opacity === "0");
    });
    assert.equal(fading, true);
  } else await eventHeader.getByRole("button", {name:"收起收藏的活动",exact:true}).click();
  await page.waitForFunction(() => !location.hash);
  await painted();
  await section("events").evaluate(el => Promise.allSettled(el.getAnimations({subtree:true}).filter(animation => animation.id === "collection-enter").map(animation => animation.finished)));
  await page.emulateMedia({reducedMotion:"reduce"});
  const seen = section("events").locator("[data-event]").nth(1);
  const id = await seen.getAttribute("data-event");
  const activeEvent = section("events").locator(`[data-event="${id}"]`);
  await seen.evaluate(el => {
    const bar = el.closest("section").querySelector("[data-collection-heading]");
    const stickyBottom = parseFloat(getComputedStyle(bar).top) + bar.offsetHeight;
    scrollBy({top: el.getBoundingClientRect().top - stickyBottom + 8, behavior: "instant"});
  });
  assert.ok(Math.abs((await eventHeader.boundingBox()).y - toolbar.height) <= 1);
  const seenBefore = await seen.boundingBox();
  const moreBox = await eventHeader.locator("[data-more]").boundingBox();
  const x = moreBox.x + moreBox.width / 2, y = moreBox.y + moreBox.height / 2;
  if (page.viewportSize().width < 600) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await page.waitForURL("**#collection/events");
  await painted();
  const seenAfter = await activeEvent.boundingBox();
  assert.ok(Math.abs(seenAfter.y - seenBefore.y) <= 1 && Math.abs(seenAfter.x - seenBefore.x) <= 1, JSON.stringify({seenBefore,seenAfter,id}));
  await eventHeader.getByRole("button", {name:"收起收藏的活动",exact:true}).click();
  await page.waitForFunction(() => !location.hash);
  console.log("PASS inline switch, symmetric sticky headers, retained mosaic and visible event");
}

async function checkCollectionHeader(page, panel, title, phone) {
  const toolbar = page.getByRole("banner");
  const heading = page.getByRole("heading", { name: title, exact: true });
  assert.ok(await heading.isVisible());
  const backLabel = "收起" + title.split("（")[0];
  const back = page.getByRole("button", { name: backLabel, exact: true });
  assert.equal(await back.innerText(), "");
  assert.equal(await toolbar.getByRole("button", { name: backLabel, exact: true }).count(), 0);
  assert.equal(await panel.getByRole("button", { name: backLabel, exact: true }).count(), 1);
  assert.ok(await page.getByRole("tablist").isVisible());
  assert.ok(await page.locator("main > header").isVisible());
  assert.equal(await panel.getByRole("button", { name: "关闭", exact: true }).count(), 0);
  assert.equal(await panel.locator("[data-collection-view]").count(), 1);
  if (phone) {
    const box = await back.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
    assert.ok(await toolbar.getByRole("button", { name: "打开页面导航", exact: true }).isVisible());
    assert.ok(await toolbar.getByRole("button", { name: "打开语言菜单" }).isVisible());
    assert.ok(await toolbar.getByRole("button", { name: /打开.*播放器/ }).isVisible());
    assert.ok(await toolbar.getByRole("button", { name: /打开账户菜单/ }).isVisible());
    assert.ok(await heading.evaluate(node => node.closest("[data-collection-view]") !== null));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
}

async function checkEventEditor(page, panel, phone, api) {
  const section = panel.locator('[data-collection=events]');
  const heading = await section.locator("h2").innerText();
  const flags = panel.getByRole("group", { name: "活动区服" });
  const rows = panel.locator('li:has(a[href*="/bandori/events/"])');
  const expected = await rows.evaluateAll(items => items.map(row => ({
    href: row.querySelector("a").getAttribute("href"),
    icons: [...row.querySelectorAll("small img")].map(icon => icon.alt),
  })));
  await page.getByRole("button", { name: "编辑收藏活动" }).click();
  await page.waitForURL("**#collection/events/edit");
  await section.getByRole("heading", {name:heading, exact:true}).waitFor();
  assert.equal(await section.locator("[data-heading-part=toggle]").count(), 0, "both JP events already fit in the preview");
  assert.equal(await flags.getByRole("button", { name: "日服" }).getAttribute("aria-pressed"), "true");
  assert.deepEqual(await rows.evaluateAll(items => items.map(row => ({
    href: row.querySelector("a").getAttribute("href"),
    icons: [...row.querySelectorAll("img")].map(icon => icon.alt),
  }))), expected);
  assert.equal(await panel.locator("[data-sort-id]").count(), 0);
  const row = rows.last();
  const name = row.getByRole("link");
  const detail = new URL(await name.getAttribute("href"), origin);
  const id = detail.pathname.split("/").pop();
  const period = row.getByText(id + "期", { exact: true });
  const [numberBox, titleBox, starBox, rowBox] = await Promise.all([
    period.boundingBox(), name.boundingBox(), row.getByRole("button", { name: "取消收藏" }).boundingBox(), row.boundingBox(),
  ]);
  if (phone) {
    assert.ok(titleBox.y - numberBox.y - numberBox.height >= 3);
    assert.ok(Math.abs(starBox.x + starBox.width - rowBox.x - rowBox.width) < 1);
    await name.tap();
  } else {
    assert.ok(Math.abs(numberBox.y + numberBox.height / 2 - titleBox.y - titleBox.height / 2) < 2);
    assert.ok(Math.abs(starBox.x - titleBox.x - titleBox.width - 12) < 1);
    await name.click();
  }
  await checkEventEntry(page, detail.href);
  await page.goBack();
  await row.getByText(id + "期", { exact: true }).waitFor();
  await flags.getByRole("button", { name: "国服" }).click();
  const cnRow = rows.filter({ has: page.locator(`a[href$="/${id}?server=cn"]`) });
  const star = cnRow.getByRole("button", { name: "取消收藏" });
  const key = "/events:cn:" + id;
  await page.route("**/api/bandori/favorites" + key, route => route.fulfill({ status: 503, json: { success: false } }), { times: 1 });
  await star.click();
  await cnRow.getByRole("alert").waitFor();
  const nextHref = await cnRow.evaluate(row => (row.nextElementSibling ?? row.previousElementSibling)?.querySelector("a")?.getAttribute("href"));
  await star.press("Enter");
  await cnRow.waitFor({ state: "detached" });
  await section.locator("[data-collection-heading]").getByRole("status").getByText("已保存", { exact: true }).waitFor();
  if (nextHref) await page.waitForFunction(href => document.activeElement?.getAttribute("href") === href, nextHref);
  const saved = (await api("")).find(group => group.kind === "events").items;
  assert.ok(saved.some(item => item.target === "jp:" + id) && !saved.some(item => item.target === "cn:" + id));
  await api(key, "PUT");
  await page.reload();
  await page.waitForFunction(() => !location.hash);
  await panel.locator("[data-more=events]").click();
  await section.locator("[data-edit=events]").click();
  await cnRow.waitFor();
  await page.getByRole("button", { name: "完成编辑", exact: true }).click();
  await page.waitForURL("**#collection/events");
  await flags.getByRole("button", { name: "国服", pressed: true }).waitFor();
  await flags.getByRole("button", { name: "日服" }).click();
}

async function checkCardEditor(page, panel, cards, phone, api, trainedArt) {
  await panel.getByRole("button", { name: "编辑收藏卡牌" }).click();
  const rows = panel.locator("[data-sort-id]");
  const divider = panel.locator('[data-sort-id="preview-divider"] button');
  await divider.waitFor();
  await checkCollectionHeader(page, panel, `收藏的卡牌（${cards.length}）`, phone);
  assert.ok(await rows.first().locator("a span img").isVisible(), "show the band before the character name");
  assert.equal(await rows.count(), cards.length + 1);
  const firstRow = rows.first();
  const names = await firstRow.locator("img + div > span").evaluateAll(spans => spans.map(span => ({
    width: span.clientWidth, textWidth: span.scrollWidth, y: span.getBoundingClientRect().top,
  })));
  assert.equal(names.length, 2);
  assert.ok(names[0].width >= names[0].textWidth, "a short character name should be fully visible");
  assert.equal(names[1].y > names[0].y + 5, phone);
  const clippedWithRoom = await rows.evaluateAll(entries => entries.flatMap(row => {
    const character = row.querySelector("img + div > span");
    return character && character.scrollWidth > character.clientWidth + 1 && character.scrollWidth <= character.parentElement.clientWidth
      ? [character.textContent] : [];
  }));
  assert.deepEqual(clippedWithRoom, [], "use all available text space before shortening character names");
  const link = firstRow.getByRole("link");
  const firstStar = firstRow.getByRole("button", { name: "取消收藏", exact: true });
  const showTrained = firstRow.getByRole("button", { name: "展示特训后卡面" });
  const showNormal = firstRow.getByRole("button", { name: "展示特训前卡面" });
  const title = link.locator("span").last();
  const [rowBox, titleBox, starBox, flipBox] = await Promise.all([firstRow.boundingBox(), title.boundingBox(), firstStar.boundingBox(), showTrained.boundingBox()]);
  if (phone) {
    const grip = await firstRow.locator(":scope > button").boundingBox();
    const thumb = await link.locator(":scope > img").boundingBox();
    assert.ok(grip.width >= 44 && grip.height >= 44 && grip.x + grip.width <= thumb.x);
    assert.ok(thumb.x - rowBox.x <= 32, "the drag handle uses the panel gutter to leave room for the card name");
    assert.equal(Math.min(starBox.width, flipBox.width), 44);
    assert.ok(Math.abs(flipBox.x + flipBox.width - starBox.x) < 1);
    assert.ok(Math.abs(rowBox.x + rowBox.width - starBox.x - starBox.width) < 1);
  } else {
    assert.ok(Math.abs(starBox.x - titleBox.x - titleBox.width - 12) < 1);
    assert.ok(Math.abs(starBox.x + starBox.width - flipBox.x) < 1);
  }
  const single = panel.locator('[data-sort-id="1"]');
  const unavailable = single.getByRole("button", { name: "无法切换卡面" });
  assert.ok(await unavailable.isDisabled());
  const slot = await unavailable.boundingBox();
  const singleStar = await single.getByRole("button", { name: "取消收藏", exact: true }).boundingBox();
  assert.equal(slot.width, flipBox.width);
  assert.ok(Math.abs((slot.x - singleStar.x) - (flipBox.x - starBox.x)) < 1);
  assert.equal(await firstStar.locator("sup").count(), 0);
  const editorUrl = page.url();
  const detailUrl = new URL(await link.getAttribute("href"), editorUrl);
  assert.ok(detailUrl.pathname.endsWith("/bandori/cards/" + cards[0]));
  assert.ok(detailUrl.searchParams.get("server"));
  const activate = element => phone ? element.tap() : element.click();
  await unavailable.scrollIntoViewIfNeeded();
  const inactive = await unavailable.boundingBox();
  const atCenter = [inactive.x + inactive.width / 2, inactive.y + inactive.height / 2];
  if (phone) await page.touchscreen.tap(...atCenter); else await page.mouse.click(...atCenter);
  assert.equal(page.url(), editorUrl);
  assert.equal(await rows.count(), cards.length + 1);
  for (const target of [link.locator(":scope > img"), link.locator("span > span").first(), title]) {
    await activate(target);
    await page.waitForURL(detailUrl.href);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForURL(editorUrl);
    await divider.waitFor();
  }
  const thumbnail = link.locator(":scope > img");
  const normalThumb = await thumbnail.getAttribute("src");
  await page.route("**/api/bandori/favorites/cards:" + cards[0] + "?art=after_training", route =>
    route.fulfill({ status: 503, json: { success: false, error: { code: "FAVORITE_FAILED", message: "fixture" } } }), { times: 1 });
  await activate(showTrained);
  await firstRow.getByRole("alert").waitFor();
  assert.equal(await thumbnail.getAttribute("src"), normalThumb);
  await activate(showTrained);
  await showNormal.waitFor();
  await firstRow.getByRole("status").getByText("已保存", { exact: true }).waitFor();
  const trainedThumb = await thumbnail.getAttribute("src");
  assert.notEqual(trainedThumb, normalThumb);
  assert.equal(page.url(), editorUrl);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !location.hash);
  await panel.locator("[data-edit=cards]").click();
  await showNormal.waitFor();
  assert.equal(await thumbnail.getAttribute("src"), trainedThumb);
  await thumbnail.evaluate(image => image.decode());
  if (process.env.PROFILE_TEST_OUTPUT) {
    await rows.locator("img").evaluateAll(images => Promise.all(images
      .filter(image => image.getBoundingClientRect().top < innerHeight).map(image => image.decode())));
    await page.screenshot({ path: process.env.PROFILE_TEST_OUTPUT + (phone ? "/card-editor-mobile.png" : "/card-editor-desktop.png") });
  }
  const waitSave = () => page.waitForResponse(r => new URL(r.url()).pathname === "/api/bandori/favorites" && r.request().method() === "PATCH");
  async function moveUp(handle, dropPosition) {
    await handle.focus();
    await page.keyboard.press("Space");
    await panel.locator('[data-dragging=true]').waitFor();
    await page.keyboard.press("ArrowUp");
    await panel.getByText(`第 ${dropPosition} 项`, { exact: true }).waitFor({ state: "attached", timeout: 5000 });
    await page.keyboard.press("Space");
  }
  const saving = waitSave();
  if (phone) {
    // Touch the divider itself, then drag across the center of the sixth card.
    await divider.scrollIntoViewIfNeeded();
    const start = await divider.boundingBox();
    const end = await rows.nth(5).boundingBox();
    const x = start.x + start.width / 2, y = start.y + start.height / 2, destination = end.y + end.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (destination - y) * i / 8 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await moveUp(divider, 6);
  }
  assert.equal((await saving).status(), 200);
  await page.getByRole("button", { name: "以上展示在首页，当前 5 张" }).waitFor();
  await page.getByRole("button", { name: "完成编辑", exact: true }).click();
  await page.waitForFunction(() => !location.hash);
  const links = panel.locator('a[href*="/bandori/cards/"]');
  assert.equal(await links.count(), 5);
  await page.reload({ waitUntil: "domcontentloaded" });
  await links.first().waitFor();
  assert.equal(await links.count(), 5);
  await panel.getByRole("button", { name: "编辑收藏卡牌" }).click();
  const incoming = panel.locator(`[data-sort-id="${cards[5]}"]`).getByRole("button", { name: /^调整/ });
  const nextSave = waitSave();
  await moveUp(incoming, 6);
  assert.equal((await nextSave).status(), 200);
  await page.getByRole("button", { name: "以上展示在首页，当前 6 张" }).waitFor();
  async function dragCardByName() {
    const name = rows.first().getByRole("link").locator("span").last();
    await name.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
    const from = await name.boundingBox(), to = await rows.nth(1).boundingBox();
    const x = from.x + from.width / 2, y = from.y + from.height / 2, destination = to.y + to.height * 0.8;
    const saved = waitSave();
    if (phone) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await rows.first().locator("xpath=self::*[@data-dragging='true']").waitFor();
      for (let i = 1; i <= 8; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (destination - y) * i / 8 }] });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, destination, { steps: 12 });
      await page.mouse.up();
    }
    const status = (await saved).status();
    assert.equal(page.url(), editorUrl);
    return status;
  }
  await page.route("**/api/bandori/favorites", route => route.fulfill({ status: 503, json: { success: false, error: { code: "FAILED", message: "fixture" } } }), { times: 1 });
  assert.equal(await dragCardByName(), 503);
  await panel.getByRole("alert").waitFor();
  assert.equal(await rows.first().getAttribute("data-sort-id"), String(cards[0]));
  assert.equal(await dragCardByName(), 200);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !location.hash);
  await panel.locator("[data-edit=cards]").click();
  await divider.waitFor();
  assert.equal(await rows.first().getAttribute("data-sort-id"), String(cards[1]));
  assert.equal(await dragCardByName(), 200);
  await panel.getByRole("status").filter({ hasText: "已保存" }).waitFor();
  const removedId = cards[3];
  const row = panel.locator(`[data-sort-id="${removedId}"]`);
  const star = row.getByRole("button", { name: "取消收藏", exact: true });
  await page.route("**/api/bandori/favorites/cards:" + removedId, route => route.fulfill({ status: 503, json: { success: false, error: { code: "FAVORITE_FAILED", message: "fixture" } } }), { times: 1 });
  await activate(star);
  await row.getByRole("alert").waitFor();
  await activate(star);
  await row.waitFor({ state: "detached" });
  await panel.getByRole("status").getByText("已保存", { exact: true }).first().waitFor();
  assert.equal(page.url(), editorUrl);
  cards.splice(3, 1);
  assert.deepEqual(await rows.evaluateAll(entries => entries.slice(0, 7).map(el => el.dataset.sortId)),
    [...cards.slice(0, 6).map(String), "preview-divider"]);
  await page.getByRole("button", { name: "完成编辑", exact: true }).click();
  await page.waitForFunction(() => !location.hash);
  await links.first().waitFor();
  assert.equal(await links.first().locator("img").first().getAttribute("src"), trainedArt);
  assert.deepEqual(await links.evaluateAll(entries => entries.map(link => Number(new URL(link.href).pathname.split("/").pop()))), cards.slice(0, 6));
  await api("/cards:" + removedId, "PUT");
  cards.push(removedId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await links.first().waitFor();
}

async function checkSongListHeading(panel) {
  const section = panel.locator('[data-collection="songs"]');
  const heading = section.locator("[data-collection-heading]");
  assert.equal(await section.getByRole("button", {name:/^(播放全部|播放|暂停|关闭循环|列表循环|单曲循环)$/}).count(), 0);
  assert.ok(await heading.evaluate(el => el.nextElementSibling?.matches("ol")));
}

async function checkCompletePreviews(page, url, cards, events, songs) {
  for (const size of ["short", "exact"]) {
    const groups = Object.entries({cards:cards.slice(0,6), events:events.slice(0,4), songs:songs.slice(0,10)})
      .map(([kind, targets]) => ({kind, items:(size === "short" ? targets.slice(0,2) : targets)
        .map(target => ({target:String(target), normalArt:false}))}));
    const route = "**/api/bandori/favorites?profile=*";
    await page.route(route, request => request.fulfill({json:{success:true, data:groups}}));
    try {
      await page.goto(url, {waitUntil:"domcontentloaded"});
      for (const {kind, items} of groups) {
        const section = page.locator(`[data-collection="${kind}"]`);
        const rows = section.locator(`[data-${kind.slice(0,-1)}]`);
        const edit = section.locator("[data-edit]");
        const disclosure = section.locator("[data-heading-part=toggle], [data-more-footer]");
        await rows.last().waitFor();
        await edit.click();
        await section.locator("[data-edit][aria-pressed=true]").waitFor();
        await rows.nth(items.length-1).waitFor();
        assert.equal(await disclosure.count(), 0);
        assert.equal(await rows.count(), items.length, kind);
        if (kind === "songs") assert.equal(await section.locator("ol[data-sortable]").count(), 1);
        await edit.click();
        await page.waitForFunction(() => !location.hash);
        await section.locator("[data-edit][aria-pressed=false]").waitFor();
        assert.equal(await disclosure.count(), 0);
        assert.equal(await section.getAttribute("data-collection-view"), null);
        if (kind === "songs") assert.equal(await section.locator("ol[data-sortable]").count(), 1);
      }
      await page.reload({waitUntil:"domcontentloaded"});
      await page.locator("li[data-song]").first().waitFor();
      assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-collection]"))), false);
    } finally { await page.unroute(route); }
  }
  console.log("PASS editing and refreshing complete card, event and song previews", page.viewportSize().width);
}

async function checkCatalogStarBounds(page) {
  await page.goto(origin + "/bandori/cards", {waitUntil:"domcontentloaded"});
  const card = page.locator("a.hhwx-catalog-row").first();
  const star = card.locator("..").getByRole("button");
  await star.scrollIntoViewIfNeeded();
  await star.focus();
  const frame = await card.boundingBox(), hit = await star.boundingBox();
  const top = hit.y - frame.y, right = frame.x + frame.width - hit.x - hit.width;
  assert.ok(top >= 2 && Math.abs(top - right) <= 1);
  assert.deepEqual([hit.width,hit.height], [44,44]);
  assert.ok(await star.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))
      && !el.contains(document.elementFromPoint(r.right+1,r.y+r.height/2))
      && !el.contains(document.elementFromPoint(r.x+r.width/2,r.top-1));
  }));
}

async function checkSongEditMode(page, panel, songs, phone, api) {
  const rows = panel.locator("li[data-song]");
  const ids = () => rows.evaluateAll(elements => elements.map(el => Number(el.dataset.song)));
  const edit = page.getByRole("button", {name:"编辑歌单",exact:true});
  const done = page.getByRole("button", {name:"完成歌单编辑",exact:true});
  const back = page.getByRole("button", {name:"收起收藏的歌曲",exact:true});
  const handle = row => row.getByRole("button", {name:/^调整/});
  const cursors = () => rows.first().evaluate(row => [row, row.querySelector("img"), row.querySelector("[data-song-title]")].map(el => getComputedStyle(el).cursor));
  async function mouseDragUp(source) {
    await rows.first().evaluate(el => el.scrollIntoView({block:"center",behavior:"instant"}));
    const from = await source.boundingBox(), to = await rows.first().boundingBox();
    const x = from.x + from.width / 2, y = from.y + from.height / 2;
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(x,to.y+to.height*.35,{steps:12});
    await page.mouse.up();
    // dnd-kit consumes clicks for 50ms after dropping; the next action is a separate gesture.
    await page.waitForTimeout(60);
  }
  if (!phone) {
    for (const expected of [[songs[1],songs[0],...songs.slice(2)], songs]) {
      const saved = page.waitForResponse(r => r.url().endsWith("/api/bandori/favorites") && r.request().method() === "PATCH");
      await mouseDragUp(rows.nth(1).locator("img"));
      const response = await saved;
      assert.equal(response.status(), 200);
      assert.deepEqual(response.request().postDataJSON().targets, expected.map(String));
      assert.deepEqual(await ids(), expected.slice(0,10));
    }
  }
  await edit.click();
  await rows.last().locator("[data-favorite-remove]").waitFor();
  await checkSongListHeading(panel);
  assert.equal(new URL(page.url()).hash, "#collection/songs");
  assert.deepEqual(await ids(), songs);
  if (!phone) {
    assert.deepEqual(await cursors(), ["grab","grab","grab"]);
    assert.equal(await handle(rows.first()).evaluate(el => getComputedStyle(el).cursor), "grab");
    assert.equal(await rows.first().locator("[data-favorite-remove]").evaluate(el => getComputedStyle(el).cursor), "pointer");
  }
  if (phone) {
    const heading = page.getByRole("heading", {name:`收藏的歌曲（${songs.length}）`,exact:true});
    assert.ok(await heading.evaluate(el => el.scrollWidth <= el.clientWidth));
    const star = rows.first().locator("[data-favorite-remove]");
    const { width, height } = await star.boundingBox();
    assert.deepEqual([width, height], [44, 44]);
  }
  assert.equal(await rows.locator('[aria-haspopup="dialog"]').count(), 0);
  const art = await rows.first().locator("img").elementHandle();
  await done.scrollIntoViewIfNeeded();
  const geometry = () => art.evaluate(img => [img.isConnected, ...["x","y","width","height"].map(key => img.getBoundingClientRect()[key]), scrollY]);
  const before = await geometry();
  assert.equal(await handle(rows.first()).locator("svg").evaluate(el => getComputedStyle(el).animationName), "none");
  await done.click();
  await page.waitForFunction(() => !location.hash);
  assert.deepEqual(await ids(), songs.slice(0,10));
  await rows.first().locator("[data-song-play]").waitFor({state:"attached"});
  if (!phone) assert.ok((await cursors()).every(cursor => cursor !== "grab" && cursor !== "grabbing"));
  assert.deepEqual(await geometry(), before);
  await page.emulateMedia({reducedMotion:"no-preference"});
  await panel.locator("[data-more=songs]").click();
  await rows.nth(songs.length - 1).waitFor();
  await edit.click();
  const icon = handle(rows.first()).locator("svg");
  await icon.waitFor();
  assert.notEqual(await icon.evaluate(el => getComputedStyle(el).animationName), "none");
  assert.deepEqual(await geometry(), before);
  await done.click();
  await panel.locator("[data-edit=songs][aria-pressed=false]").waitFor();
  assert.deepEqual(await ids(), songs);
  assert.equal(new URL(page.url()).hash, "#collection/songs");
  await edit.click();
  await icon.waitFor();
  await page.emulateMedia({reducedMotion:"reduce"});
  const out = process.env.SONG_TEST_OUTPUT;
  if (out) {
    await rows.locator("img").evaluateAll(imgs => Promise.allSettled(imgs.map(img => img.decode())));
    const options = {path:out + (phone ? "/song-edit-mobile.png" : "/song-edit-desktop.png"), style:"nextjs-portal { display:none!important }"};
    if (phone) await page.screenshot(options); else await panel.screenshot(options);
  }
  async function moveSecondUp(fromRow = false) {
    const grip = handle(rows.nth(1));
    const saved = page.waitForResponse(r => new URL(r.url()).pathname === "/api/bandori/favorites" && r.request().method() === "PATCH");
    if (phone) {
      const source = fromRow ? rows.nth(1).locator("[data-song-title]") : grip;
      await rows.first().evaluate(el => el.scrollIntoView({block:"center",behavior:"instant"}));
      const from = await source.boundingBox(), to = await rows.first().boundingBox();
      const x = from.x + from.width / 2, y = from.y + from.height / 2;
      const finger = await page.context().newCDPSession(page);
      await finger.send("Input.dispatchTouchEvent", {type:"touchStart",touchPoints:[{x,y}]});
      if (fromRow) await rows.nth(1).and(panel.locator("[data-dragging]")).waitFor();
      for (let i=1; i<=8; i++) await finger.send("Input.dispatchTouchEvent", {type:"touchMove",touchPoints:[{x,y:y+(to.y+to.height*.35-y)*i/8}]});
      await finger.send("Input.dispatchTouchEvent", {type:"touchEnd",touchPoints:[]});
      await finger.detach();
    } else if (fromRow) {
      await mouseDragUp(rows.nth(1).locator("img"));
    } else {
      await grip.press("Space");
      await panel.locator("[data-dragging]").waitFor();
      await page.keyboard.press("ArrowUp");
      await panel.getByText("第 1 项", {exact:true}).waitFor({state:"attached"});
      await page.keyboard.press("Space");
    }
    const response = await saved;
    const move = response.request().postDataJSON();
    assert.deepEqual(Object.keys(move).sort(), ["kind", "targets"]);
    assert.equal(move.kind, "songs");
    assert.equal(move.targets.length, songs.length);
    return response.status();
  }
  if (phone) {
    const title = rows.first().locator("[data-song-title]");
    await title.scrollIntoViewIfNeeded();
    const box = await title.boundingBox();
    const current = () => panel.locator("li[data-song][data-current] [data-song-title]").allTextContents();
    const playingBeforeHold = await current();
    const finger = await page.context().newCDPSession(page);
    await finger.send("Input.dispatchTouchEvent", {type:"touchStart",touchPoints:[{x:box.x+5,y:box.y+box.height/2}]});
    await rows.first().and(panel.locator("[data-dragging]")).waitFor();
    await finger.send("Input.dispatchTouchEvent", {type:"touchEnd",touchPoints:[]});
    const viewport = page.viewportSize();
    await page.setViewportSize({...viewport,height:540});
    const swipeRow = rows.nth(3).locator("small").first();
    await swipeRow.evaluate(el => el.scrollIntoView({block:"center",behavior:"instant"}));
    const swipe = await swipeRow.boundingBox();
    const startY = await page.evaluate(() => scrollY);
    const delta = startY > 80 ? 24 : -24;
    await finger.send("Input.dispatchTouchEvent", {type:"touchStart",touchPoints:[{x:swipe.x+5,y:swipe.y+5}]});
    for (let i=1; i<=4; i++) await finger.send("Input.dispatchTouchEvent", {type:"touchMove",touchPoints:[{x:swipe.x+5,y:swipe.y+5+delta*i}]});
    await finger.send("Input.dispatchTouchEvent", {type:"touchEnd",touchPoints:[]});
    await page.waitForFunction(y => scrollY !== y, startY);
    await page.setViewportSize(viewport);
    await finger.detach();
    // Let the swipe finish before testing a separate long-press drag.
    await page.evaluate(() => new Promise(resolve => {
      let previous = scrollY, still = 0;
      function sample() {
        still = scrollY === previous ? still + 1 : 0;
        previous = scrollY;
        if (still === 6) resolve();
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }));
    assert.deepEqual(await current(), playingBeforeHold);
    assert.deepEqual(await ids(), songs);
  } else {
    await rows.first().locator("[data-song-title]").click({button:"right"});
  }
  assert.equal(await page.getByRole("dialog").count(), 0);
  if (!phone) {
    await page.route("**/api/bandori/favorites", route => route.fulfill({status:503,json:{success:false,error:{code:"FAILED",message:"fixture"}}}), {times:1});
    assert.equal(await moveSecondUp(true), 503);
    await rows.locator('[role=alert]').waitFor();
    assert.deepEqual(await ids(), songs);
  }
  assert.equal(await moveSecondUp(true), 200);
  const reordered = [songs[1],songs[0],...songs.slice(2)];
  assert.deepEqual(await ids(), reordered);
  await back.click();
  await page.waitForFunction(() => !location.hash);
  assert.deepEqual(await ids(), reordered.slice(0,10));
  await panel.locator("[data-more=songs]").click();
  await rows.nth(songs.length-1).waitFor();
  if (!phone) {
    assert.equal(await moveSecondUp(true), 200);
    await rows.locator("[data-action-feedback=success]").waitFor();
    await page.reload({waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => !location.hash);
    await panel.locator("[data-more=songs]").click();
    await rows.nth(songs.length-1).waitFor();
    assert.deepEqual(await ids(), songs);
    assert.equal(await moveSecondUp(true), 200);
  }
  await edit.click();
  await page.reload({waitUntil:"domcontentloaded"});
  await edit.waitFor();
  assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-collection]"))), false);
  assert.equal(new URL(page.url()).hash, "");
  assert.deepEqual(await ids(), reordered.slice(0, 10));
  await edit.click();
  await handle(rows.first()).waitFor();
  assert.deepEqual(await ids(), reordered);
  const track = rows.nth(2).locator("[data-song-title]");
  if (phone) await track.tap(); else await track.dblclick();
  const queue = () => page.evaluate(() => JSON.parse(localStorage.getItem("hhwx:music-player:queue:v1")).items.map(item => Number(item.providerTrackId)));
  assert.deepEqual(await queue(), reordered);
  assert.equal(await moveSecondUp(), 200);
  assert.deepEqual(await ids(), songs);
  assert.deepEqual(await queue(), reordered);
  const lastId = songs.at(-1);
  await rows.last().locator("[data-favorite-remove]").click();
  await panel.locator('li[data-song="' + lastId + '"]').waitFor({state:"detached"});
  assert.deepEqual(await ids(), songs.slice(0,-1));
  await api("/songs:" + lastId,"PUT");
  assert.equal(await back.count(), 0);
  await done.click();
  await page.waitForFunction(() => !location.hash);
  await page.reload({waitUntil:"domcontentloaded"});
  await rows.nth(9).waitFor();
  console.log("PASS in-place playlist edit, motion, sorting, persistence and removal", phone ? "mobile" : "desktop");
}

async function checkSongPlaylist(page, panel, songs, phone, api) {
  const rows = panel.locator("li[data-song]");
  const readIds = () => rows.evaluateAll(list => list.map(row => Number(row.dataset.song)));
  await rows.nth(9).waitFor({ timeout: 90000 });
  assert.deepEqual(await readIds(), songs.slice(0, 10));
  const out = process.env.SONG_TEST_OUTPUT;
  if (out) await mkdir(out, { recursive: true });
  await checkSongListHeading(panel);
  await checkSongEditMode(page, panel, songs, phone, api);
  if (out && !phone) {
    const preview = panel.locator("section:has(li[data-song])");
    await preview.scrollIntoViewIfNeeded();
    await preview.locator("img").evaluateAll(imgs => Promise.allSettled(imgs.map(img => img.decode())));
    await preview.screenshot({ path: out + "/favorite-songs-home.png" });
  }
  const third = rows.nth(2);
  const selected = "bandori:" + songs[2];
  const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem("hhwx:music-player:queue:v1")));
  const firstTitle = rows.first().locator("[data-song-title]");
  if (phone) await firstTitle.tap(); else await firstTitle.press("Enter");
  const firstControl = rows.first().locator("[data-song-play]");
  const pause = rows.first().locator('[data-song-play][aria-label^="暂停"]');
  await pause.waitFor();
  const cover = rows.first().locator("img");
  assert.equal(await cover.evaluate(img => img.closest("[aria-hidden=true]").querySelectorAll(".lucide-play, .lucide-pause").length), 0);
  if (phone) await cover.tap(); else await firstTitle.dblclick();
  await pause.waitFor();
  if (phone) await firstControl.tap(); else await firstControl.click();
  await rows.first().locator('[data-song-play][aria-label^="播放"]').waitFor();
  if (phone) await firstControl.tap(); else await firstControl.click();
  await pause.waitFor();
  const thirdArtist = third.locator("small span").first();
  if (phone) {
    await thirdArtist.tap();
  } else {
    await thirdArtist.click();
    assert.equal((await snapshot()).currentIndex, 0);
    await thirdArtist.dblclick();
  }
  assert.equal((await snapshot()).currentIndex, 2);
  assert.deepEqual((await snapshot()).items.map(item => Number(item.providerTrackId)), songs);
  const footer = panel.locator('[data-more-footer=songs]');
  await footer.scrollIntoViewIfNeeded();
  const lastPreview = await rows.last().boundingBox(), button = await footer.boundingBox();
  assert.ok(button.y >= lastPreview.y + lastPreview.height);
  assert.ok(Math.abs(button.x + button.width/2 - lastPreview.x - lastPreview.width/2) < 1);
  assert.ok(button.width < lastPreview.width/2);
  if (phone) await footer.tap(); else await footer.press("Enter");
  await rows.nth(songs.length - 1).waitFor();
  assert.equal(new URL(page.url()).hash, "#collection/songs");
  await checkSongListHeading(panel);
  assert.equal(await footer.innerText(), "收起");
  assert.ok(Math.abs((await rows.nth(9).boundingBox()).y - lastPreview.y) <= 1);
  assert.equal((await snapshot()).currentIndex, 2);
  await page.getByRole("button", {name:"收起收藏的歌曲",exact:true}).click();
  await footer.waitFor();
  await page.waitForFunction(() => document.activeElement?.matches("[data-more=songs]"));
  await panel.locator('[data-more=songs]').click();
  await rows.nth(songs.length - 1).waitFor();
  await checkCollectionHeader(page, panel, `收藏的歌曲（${songs.length}）`, phone);
  assert.deepEqual(await readIds(), songs);
  const viewport = page.viewportSize();
  const initialScroll = await page.evaluate(() => scrollY);
  await page.setViewportSize({...viewport,height:480});
  const scrollFrom = await page.evaluate(() => scrollY);
  const beforeY = (await rows.first().boundingBox()).y;
  const back = panel.getByRole("button", {name:"收起收藏的歌曲",exact:true});
  const beforeBar = await back.locator("..").boundingBox();
  await page.evaluate(() => scrollBy({top:180,behavior:"instant"}));
  const scrollDelta = await page.evaluate(start => scrollY-start, scrollFrom);
  assert.ok(scrollDelta > 100);
  const bar = await back.locator("..").boundingBox(), toolbar = await page.getByRole("banner").boundingBox();
  const backBox = await back.boundingBox();
  assert.equal(bar.height, beforeBar.height);
  assert.ok(backBox.y - bar.y >= 8 && bar.y + bar.height - backBox.y - backBox.height >= 8);
  assert.ok(Math.abs(toolbar.y) < 1 && Math.abs(bar.y - toolbar.height) < 1);
  assert.ok(Math.abs(beforeY - (await rows.first().boundingBox()).y - scrollDelta) < 1);
  assert.ok(await back.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));
  }));
  if (out) await page.screenshot({path:out + (phone ? "/song-sticky-mobile.png" : "/song-sticky-desktop.png"),style:"nextjs-portal { display:none!important }"});
  await page.setViewportSize(viewport);
  await page.evaluate(top => scrollTo({top,behavior:"instant"}), initialScroll);
  const whitespace = { position: { x: 2, y: 3 } };
  if (phone) await rows.nth(3).tap(whitespace); else await rows.nth(3).dblclick(whitespace);
  assert.equal((await snapshot()).currentIndex, 3);
  const thirdCover = third.locator("img");
  const title = third.locator("[data-song-title]");
  if (phone) await thirdCover.tap();
  else {
    await title.click();
    await thirdCover.click();
    assert.equal((await snapshot()).currentIndex, 3);
    await title.dblclick();
    assert.equal((await snapshot()).currentIndex, 2);
    await rows.nth(3).hover();
    await rows.nth(3).locator("[data-song-play]").click();
    assert.equal((await snapshot()).currentIndex, 3);
    await thirdCover.dblclick();
    await title.hover();
    assert.ok(await title.evaluate(el => getComputedStyle(el).cursor !== "pointer" && getComputedStyle(el).textDecorationLine === "none"));
  }
  await third.locator('[data-song-play][aria-label^="暂停"]').waitFor();
  assert.equal(await third.getByText("BanG Dream In-Game Version").isVisible(), !phone);
  const [titleBox, bandBox, coverBox] = await Promise.all([title.boundingBox(), third.locator("small").boundingBox(), third.locator("img").boundingBox()]);
  assert.ok(titleBox.x > coverBox.x && Math.abs(titleBox.x - bandBox.x) <= 1 && bandBox.y >= titleBox.y + titleBox.height - 1);
  const screenshotStyle = "nextjs-portal { display: none !important; }";
  if (out) {
    await panel.locator("[data-action-feedback]").first().waitFor({state:"hidden"});
    await panel.locator("li[data-song] img").evaluateAll(imgs => Promise.allSettled(imgs.map(img => img.decode())));
    if (phone) await page.screenshot({ path: out + "/favorite-songs-mobile.png", style: screenshotStyle });
    else await panel.screenshot({ path: out + "/favorite-songs-desktop.png" });
  }
  const last = rows.last();
  const more = last.locator('button[aria-haspopup="dialog"]');
  const songMenu = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "加入播放队列", exact: true }) });
  const pageWidth = () => page.evaluate(() => [document.documentElement.clientWidth, document.body.getBoundingClientRect().width,
    document.querySelector("li[data-song]").getBoundingClientRect().x, document.body.hasAttribute("data-scroll-locked")]);
  const beforeMenu = await pageWidth();
  if (phone) {
    const heldTitle = rows.nth(1).locator("[data-song-title]");
    await heldTitle.scrollIntoViewIfNeeded();
    const heldName = await heldTitle.textContent();
    const box = await heldTitle.boundingBox();
    const outside = await firstTitle.boundingBox();
    const finger = await page.context().newCDPSession(page);
    const point = { x: box.x + 4, y: box.y + box.height / 2 };
    await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await finger.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x + 2, y: point.y + 1 }] });
    await songMenu.waitFor();
    await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await songMenu.getByRole("heading", { name: heldName, exact: true }).waitFor();
    assert.deepEqual(await pageWidth(), beforeMenu);
    assert.equal((await snapshot()).currentIndex, 2);
    await page.touchscreen.tap(outside.x + 4, outside.y + outside.height / 2);
    await songMenu.waitFor({ state: "detached" });
    assert.equal((await snapshot()).currentIndex, 2);
    await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await finger.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x, y: point.y - 45 }] });
    await page.waitForTimeout(600);
    await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await finger.detach();
    assert.equal(await songMenu.count(), 0);
    assert.equal((await snapshot()).currentIndex, 2);
    await firstTitle.tap();
    assert.equal((await snapshot()).currentIndex, 0);
    await thirdCover.tap();
    await page.setViewportSize({ width: 844, height: 390 });
    const landscapeRow = rows.first();
    await landscapeRow.evaluate(el => el.scrollIntoView({block:"center", behavior:"instant"}));
    await landscapeRow.locator('[aria-haspopup="dialog"]').tap();
    await songMenu.waitFor();
    assert.equal(await songMenu.getAttribute("aria-modal"), "true");
    await songMenu.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    const sheet = await songMenu.boundingBox(), behind = await landscapeRow.boundingBox();
    assert.ok(behind.x + 3 < sheet.x && sheet.y + sheet.height <= 382 && sheet.y + sheet.height >= 374);
    await page.touchscreen.tap(behind.x + 3, behind.y + behind.height / 2);
    await songMenu.waitFor({state:"detached"});
    assert.equal((await snapshot()).currentIndex, 2);
    await page.setViewportSize(viewport);
  } else {
    await thirdCover.click({button:"right"});
    await songMenu.getByRole("heading", { name: await title.textContent(), exact: true }).waitFor();
    assert.equal(await songMenu.getByRole("button", {name:"关闭"}).count(), 0);
    assert.deepEqual(await pageWidth(), beforeMenu);
    await songMenu.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    const menuBox = await songMenu.boundingBox();
    const scroll = await page.evaluate(() => window.scrollY);
    await page.mouse.move(15, 200);
    await page.mouse.wheel(0, scroll > 90 ? -90 : 90);
    await page.waitForFunction(old => window.scrollY !== old, scroll);
    assert.deepEqual(await songMenu.boundingBox(), menuBox);
    const secondMore = rows.nth(1).locator('button[aria-haspopup="dialog"]');
    await rows.nth(1).hover();
    await secondMore.click();
    await songMenu.getByRole("heading", { name: await rows.nth(1).locator("[data-song-title]").textContent(), exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await songMenu.waitFor({state:"detached"});
    await page.waitForFunction(el => document.activeElement === el, await secondMore.elementHandle());
    await secondMore.click();
    await songMenu.waitFor();
    await rows.first().hover();
    await rows.first().locator("[data-song-play]").click();
    await songMenu.waitFor({ state: "detached" });
    assert.equal((await snapshot()).currentIndex, 0);
    await thirdCover.dblclick();
  }
  async function openMenu() {
    if (phone) await more.tap();
    else { await last.hover(); await more.click(); }
    return songMenu;
  }
  let dialog = await openMenu();
  if (phone && out) await page.screenshot({ path: out + "/favorite-songs-actions.png", style: screenshotStyle });
  await dialog.getByRole("button", { name: "下一首播放", exact: true }).click();
  let saved = await snapshot();
  assert.equal(saved.items[saved.currentIndex].id, selected);
  assert.equal(Number(saved.items[3].providerTrackId), songs.at(-1));
  dialog = await openMenu();
  await dialog.getByRole("button", { name: "加入播放队列", exact: true }).click();
  saved = await snapshot();
  assert.equal(saved.currentIndex, 2);
  assert.equal(saved.items.length, songs.length + 2);
  assert.equal(Number(saved.items.at(-1).providerTrackId), songs.at(-1));
  const playerButton = page.locator('button[aria-controls="toolbar-music-player-panel"]');
  if (phone) await playerButton.tap(); else await playerButton.hover();
  const player = page.locator("#toolbar-music-player-panel");
  await player.getByText("BanG Dream In-Game Version", { exact: true }).waitFor();
  const position = player.getByRole("slider", { name: "播放进度" });
  await page.waitForFunction(el => el.valueAsNumber >= 3, await position.elementHandle());
  if (phone) await playerButton.tap(); else await thirdCover.hover();
  await player.waitFor({state:"hidden"});
  if (phone) await thirdCover.tap(); else await thirdCover.dblclick();
  await third.locator('[data-song-play][aria-label^="暂停"]').waitFor();
  if (phone) await playerButton.tap(); else await playerButton.hover();
  assert.ok(Number(await position.inputValue()) < 2, "selecting the current row restarts the track");
  assert.deepEqual((await snapshot()).items, saved.items);
  assert.equal((await snapshot()).currentIndex, saved.currentIndex);
  const playerRepeat = player.locator("[data-repeat-mode]");
  assert.equal(await playerRepeat.getAttribute("aria-label"), "关闭循环");
  await playerRepeat.click();
  assert.equal(await playerRepeat.getAttribute("aria-label"), "列表循环");
  const [icon, dot] = await Promise.all([playerRepeat.locator("svg").boundingBox(), playerRepeat.locator("span").boundingBox()]);
  assert.ok(dot.width === dot.height && dot.width === 4 && dot.y >= icon.y + icon.height);
  assert.ok(Math.abs(dot.x + dot.width/2 - icon.x - icon.width/2) < 1);
  await playerRepeat.click();
  assert.equal(await playerRepeat.getAttribute("aria-label"), "单曲循环");
  assert.equal(await playerRepeat.getAttribute("aria-pressed"), "true");
  assert.ok(await playerRepeat.locator("span").isVisible());
  await playerRepeat.click();
  assert.equal(await playerRepeat.getAttribute("aria-pressed"), "false");
  assert.equal(await playerRepeat.locator("span").count(), 0);
  assert.equal((await snapshot()).currentIndex, saved.currentIndex);
  const detail = player.locator("a").last();
  assert.ok((await detail.getAttribute("href")).endsWith("/bandori/songs/" + songs[2]));
  await detail.click();
  await page.waitForURL("**/bandori/songs/" + songs[2]);
  await page.goBack();
  await rows.last().waitFor();
  const lastId = songs.at(-1);
  dialog = await openMenu();
  await page.route("**/api/bandori/favorites/songs:" + lastId, route => route.fulfill({status:503,json:{success:false,error:{code:"FAVORITE_FAILED",message:"fixture"}}}), { times: 1 });
  const remove = dialog.getByRole("button", { name: "取消收藏", exact: true });
  await remove.click();
  await dialog.getByRole("alert").waitFor();
  await remove.click();
  await dialog.waitFor({ state: "detached" });
  await page.getByRole("heading", { name: `收藏的歌曲（${songs.length - 1}）`, exact: true }).waitFor();
  await panel.locator(`li[data-song="${lastId}"]`).waitFor({ state: "detached" });
  assert.deepEqual(await readIds(), songs.slice(0, -1));
  await page.waitForFunction(() => !location.hash);
  assert.equal(await page.getByRole("button",{name:"收起收藏的歌曲",exact:true}).count(), 0);
  await rows.nth(9).waitFor();
  assert.equal(await panel.locator('[data-more=songs]').count(), 0);
  assert.equal(await footer.count(), 0);
  await api("/songs:" + lastId, "PUT");
  console.log("PASS liked songs preview, whole queue, song actions, album layout and player detail", phone ? "mobile" : "desktop");
}

async function checkArtwork(tile) {
  await tile.scrollIntoViewIfNeeded();
  const image = tile.locator("img").first();
  await image.evaluate(img => img.decode());
  const target = await image.evaluate(img => {
    const box = img.getBoundingClientRect();
    const scale = 1.5 * devicePixelRatio * Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
    return {
      width: Math.ceil(img.naturalWidth * scale),
      height: Math.ceil(img.naturalHeight * scale),
      nativeWidth: img.naturalWidth,
    };
  });
  const canvas = tile.locator("canvas");
  if (target.width < target.nativeWidth) {
    await tile.locator("canvas[data-ready]").waitFor({timeout:90000});
    assert.deepEqual(await canvas.evaluate(c => [c.width, c.height]), [target.width, target.height]);
  } else {
    await canvas.waitFor({state:"attached"});
    assert.equal(await canvas.evaluate(c => c.width), 0);
    assert.equal(await image.evaluate(img => getComputedStyle(img).opacity), "1");
  }
}
require("@next/env").loadEnvConfig(process.cwd(), true);
const origin = process.env.PROFILE_TEST_ORIGIN || "http://localhost:3000";
const db = process.env.NEXT_PUBLIC_SUPABASE_URL;
for (const url of [db, origin]) assert.ok(["localhost","127.0.0.1"].includes(new URL(url).hostname), "Local test targets only");
const admin = createClient(db, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(db, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const email = "favorites-" + randomUUID() + "@example.test";
const password = randomUUID() + "aA1!";
const username = "Favorites " + randomUUID().slice(0,8);
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
assert.ifError(created.error);
const uid = created.data.user.id;
let browser;
let hostId;
try {
  const registered = await admin.auth.admin.updateUserById(uid, { app_metadata: { hhwx_registration: { id: randomUUID(), username } } });
  assert.ifError(registered.error);
  const profile = await admin.from("profiles").select("public_uid").eq("id", uid).single();
  assert.ifError(profile.error);
  const session = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(session.error);
  const token = session.data.session.access_token;
  const path = "/user/" + profile.data.public_uid;
  const out = process.env.PROFILE_TEST_OUTPUT;
  if (out) await mkdir(out, { recursive: true });
  const api = async (key, method = "GET", signed = true, body) => {
    const res = await fetch(origin + "/api/bandori/favorites" + key, { method, headers: {
      ...(signed ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
    }, body: JSON.stringify(body) });
    const json = await res.json();
    assert.ok(res.ok, method + " " + key + " " + JSON.stringify(json));
    return json.data;
  };
  const cards = [1755,729,2141,2305,2409,868,1051,1,2220,1965,1680,1477,1180,1322];
  const songs = [1,3,17,20,26,30,2,5,7,8,73];
  const events = ["cn:326","cn:327","cn:328","cn:329","cn:330","cn:331","jp:326","jp:327"];
  // Populate only this disposable user's collection. Exercise one real write of each kind through the public routes.
  assert.equal((await fetch(origin + "/api/bandori/favorites/cards:1755")).status, 405);
  for (const key of ["cards:1755", "songs:1", "events:cn:326"]) await api("/" + key, "PUT");
  const profileCards = async () => (await api("?profile=" + profile.data.public_uid)).find(group => group.kind === "cards");
  const visibleCards = group => group.items.toReversed().slice(0, group.previewCount).map(item => Number(item.target));
  const editPreview = async (length, previewCount) => api("", "PATCH", true, {
    targets: cards.slice(0, length).map(String), previewCount,
  });
  assert.equal((await profileCards()).previewCount, 6);
  for (const id of cards.slice(1, 3)) await api("/cards:" + id, "PUT");
  await editPreview(3, 2);
  await api("/cards:" + cards[3], "PUT");
  assert.deepEqual(visibleCards(await profileCards()), cards.slice(0, 2));
  for (const id of [cards[3], cards[2]]) await api("/cards:" + id, "DELETE");
  assert.equal((await profileCards()).previewCount, 6);
  await api("/cards:" + cards[2], "PUT");
  assert.equal(await editPreview(3, 3), true);
  await api("/cards:" + cards[3], "PUT");
  await api("/cards:" + cards[3], "PUT");
  const following = await profileCards();
  assert.deepEqual(visibleCards(following), cards.slice(0, 4));
  assert.ok(!('layoutVersion' in following));
  const rows = [...cards.slice(4).map(id=>["cards",String(id)]), ...songs.slice(1).map(id=>["songs",String(id)]), ...events.slice(1).map(id=>["events",id])];
  assert.ifError((await admin.from("bandori_favorites").insert(rows.map(([kind,target])=>({user_id:uid,kind,target})))).error);
  const previousSongs = songs.map(String);
  const moveSong = to => fetch(origin + "/api/bandori/favorites", {method:"PATCH",
    headers:{Authorization:"Bearer " + token,"Content-Type":"application/json"},
    body:JSON.stringify({kind:"songs",previous:previousSongs,from:0,to})});
  const moves = await Promise.all([moveSong(1), moveSong(2)]);
  assert.deepEqual(moves.map(r=>r.status),[200,200]);
  const sortedSongs = (await api("?profile=" + profile.data.public_uid)).find(g=>g.kind==="songs").items.toReversed().map(item=>item.target);
  assert.ok([1,2].some(to => JSON.stringify(sortedSongs) === JSON.stringify(previousSongs.slice(1).toSpliced(to,0,previousSongs[0]))));
  await api("", "PATCH", true, {kind:"songs",previous:sortedSongs,targets:previousSongs});
  await api("", "PATCH", true, {kind:"songs",targets:previousSongs});
  const lastCardOrder = cards.toReversed().map(String);
  await api("", "PATCH", true, {targets:lastCardOrder,previewCount:2,version:0});
  assert.deepEqual((await profileCards()).items.toReversed().map(item=>item.target),lastCardOrder);
  await editPreview(cards.length,6);
  assert.deepEqual((await profileCards()).items.toReversed().map(item=>item.target),cards.map(String));
  assert.deepEqual(new Set(await api("?view=keys")),new Set((await api("")).flatMap(group=>group.items.map(item=>group.kind+":"+item.target))));
  assert.equal((await fetch(origin+"/api/bandori/favorites?view=keys")).status,401);
  await api("/cards:1755", "PUT");
  assert.deepEqual((await api("")).find(g=>g.kind==="cards").items.map(x=>Number(x.target)),cards.toReversed());
  const settings = await fetch(origin + "/api/account/homepage", {method:"PATCH",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({modules:["cards","events","songs"].map(id=>({id,public:id!=="cards"}))})});
  assert.equal(settings.status,200);
  assert.ok(!(await api("?profile="+profile.data.public_uid,"GET",false)).some(g=>g.kind==="cards"));
  assert.equal((await profileCards()).items.filter(item => item.target === "1755").length, 1);
  assert.equal((await fetch(origin+"/api/bandori/favorites/cards:1755",{method:"DELETE"})).status,401);
  assert.equal((await fetch(origin+"/api/bandori/favorites",{method:"PATCH",body:"{}"})).status,401);
  assert.equal((await fetch(origin + "/api/bandori/favorites/events:en:999999999", {
    method: "PUT", headers: { Authorization: "Bearer " + token },
  })).status, 404);
  console.log("PASS local route identity, idempotency, private collection and write-only item endpoint");

  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const hostName = "Host " + randomUUID().slice(0,8);
  const host = await admin.auth.admin.createUser({email:"favorites-host-" + randomUUID() + "@example.test", password:randomUUID()+"aA1!", email_confirm:true,
    user_metadata:{username:hostName}});
  assert.ifError(host.error);
  hostId = host.data.user.id;
  assert.ifError((await admin.auth.admin.updateUserById(hostId, {app_metadata:{hhwx_registration:{id:randomUUID(),username:hostName}}})).error);
  const hostProfile = await admin.from("profiles").select("public_uid").eq("id", hostId).single();
  assert.ifError(hostProfile.error);
  assert.ifError((await admin.from("bandori_favorites").insert([["cards","en:10001"],["events","cn:325"],["events","jp:325"],["songs","4"]]
    .map(([kind,target])=>({user_id:hostId,kind,target})))).error);
  browser = await chromium.launch({ headless:true, ignoreDefaultArgs:["--hide-scrollbars"], ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}) });
  for (const width of [1440,390]) {
    const phone = width === 390;
    const ctx = await browser.newContext({viewport:{width,height:850}, deviceScaleFactor:phone ? 2 : 1, hasTouch:phone, isMobile:phone, reducedMotion:"reduce"});
    await ctx.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:"sb-"+new URL(db).hostname.split(".")[0]+"-auth-token",session:session.data.session});
    const page = await ctx.newPage();
    const errors = [];
    const itemReads = [];
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (["GET", "HEAD"].includes(request.method()) && path.startsWith("/api/bandori/favorites/")) itemReads.push(path);
    });
    page.on("pageerror", e=>errors.push(e.message));
    await checkVisitorFavorites(page, phone, hostProfile.data.public_uid, api);
    await checkCatalogStarBounds(page);
    await checkCompletePreviews(page, origin+path, cards, events, songs);
    await checkEventSongFavorites(page, phone);
    await page.goto(origin+path,{waitUntil:"domcontentloaded",timeout:120000});
    const panel = page.getByRole("tabpanel");
    const tiles = panel.locator('a[href*="/bandori/cards/"]');
    const firstId = cards[0];
    const first = panel.locator(`a[href*="/bandori/cards/${firstId}?"]`);
    const ids = locator => locator.evaluateAll(links => links.map(link => Number(new URL(link.href).pathname.split("/").pop())));
    await first.locator("img").first().waitFor({timeout:90000});
    await editPreview(cards.length, 2);
    await page.reload({waitUntil:"domcontentloaded"});
    await panel.locator('[data-size="2"]').waitFor();
    await checkCollectionDisclosures(page, panel, phone);
    await checkInlineCollections(page, panel, tiles);
    await editPreview(cards.length, 6);
    await page.reload({waitUntil:"domcontentloaded"});
    await panel.locator('[data-size="6"]').waitFor();
    await page.evaluate(() => scrollTo({top:0,behavior:"instant"}));
    for (const [name, count] of [["收藏的卡牌", cards.length], ["收藏的活动", events.length], ["收藏的歌曲", songs.length]]) {
      await panel.getByRole("heading", { name: `${name}（${count}）`, exact: true }).waitFor();
    }
    assert.deepEqual(await ids(tiles),cards.slice(0,6));
    const firstArt = first.locator("img").first();
    const original = await firstArt.getAttribute("src");
    await checkArtwork(first);
    const previousImage = await firstArt.elementHandle();
    const firstRemove = first.locator("..").getByRole("button",{name:"取消收藏",exact:true});
    const controls = firstRemove.locator("..");
    if (phone) {
      assert.equal(await controls.evaluate(el=>getComputedStyle(el).opacity),"0");
      await first.evaluate(el => el.scrollIntoView({block:"center",behavior:"instant"}));
      const star = await firstRemove.locator("span").boundingBox();
      await page.touchscreen.tap(star.x + star.width / 2, star.y + star.height / 2);
      assert.equal(new URL(page.url()).pathname,path);
      assert.equal(await controls.evaluate(el=>getComputedStyle(el).opacity),"1");
      assert.deepEqual(await ids(tiles),cards.slice(0,6));
    } else await first.hover();
    const flip = first.locator("..").getByRole("button",{name:"展示特训前卡面"});
    const [tileBox, starBox, flipBox] = await Promise.all([first.locator("..").boundingBox(), firstRemove.locator("span").boundingBox(), flip.locator("span").boundingBox()]);
    assert.ok(Math.abs((tileBox.x + tileBox.width - flipBox.x - flipBox.width) - (flipBox.y - tileBox.y)) < 0.1);
    assert.equal(flipBox.x - starBox.x - starBox.width,5);
    if (out && !phone) await flip.screenshot({path:out+"/switch-art.png"});
    if (phone) await flip.tap(); else await flip.click();
    await page.waitForFunction(({src,id})=>document.querySelector(`[role=tabpanel] a[href*="/bandori/cards/${id}?"] img`)?.getAttribute("src")!==src,{src:original,id:firstId});
    if (phone) {
      assert.equal(await controls.evaluate(el => getComputedStyle(el).opacity), "1");
    } else {
      await page.mouse.move(0, 0);
      assert.equal(await controls.evaluate(el => getComputedStyle(el).opacity), "0", "Mouse exit hides controls after switching art");
      const caption = await first.locator("[data-visible]").elementHandle();
      await page.waitForFunction(el => getComputedStyle(el).opacity === "0", caption);
      await page.keyboard.press("Shift+Tab");
      assert.ok(await firstRemove.evaluate(el => el === document.activeElement));
      assert.equal(await controls.evaluate(el => getComputedStyle(el).opacity), "1");
      await page.waitForFunction(el => getComputedStyle(el).opacity === "1", caption);
      await caption.dispose();
    }
    await checkArtwork(first);
    assert.equal(await previousImage.evaluate(node=>node.isConnected),false);
    await previousImage.dispose();
    assert.equal((await api("")).find(g=>g.kind==="cards").items.find(item=>item.target===String(firstId)).normalArt,true);
    await checkCardEditor(page, panel, cards, phone, api, original);
    const more = panel.locator('[data-more=cards]');
    await more.scrollIntoViewIfNeeded();
    await more.click();
    await page.waitForURL("**#collection/cards");
    await tiles.nth(13).waitFor();
    await checkCollectionHeader(page, panel, `收藏的卡牌（${cards.length}）`, phone);
    // A nested editor returns to this particular wall, including its scroll position.
    const edit = page.getByRole("button", { name: "编辑收藏卡牌" });
    if (phone) await tiles.nth(8).scrollIntoViewIfNeeded(); else await edit.scrollIntoViewIfNeeded();
    const anchor = await panel.locator("[data-card]").evaluateAll(tiles => {
      const bottom = tiles[0].closest("section").querySelector("[data-collection-heading]").getBoundingClientRect().bottom;
      const tile = tiles.find(el => el.getBoundingClientRect().bottom > bottom && el.getBoundingClientRect().top < innerHeight);
      return tile?.dataset.card;
    });
    await edit.click();
    await panel.locator("[data-sort-id]").first().waitFor();
    await checkCollectionHeader(page, panel, `收藏的卡牌（${cards.length}）`, phone);
    await page.getByRole("button", { name: "完成编辑", exact: true }).click();
    await tiles.nth(13).waitFor();
    if (anchor) assert.ok(await panel.locator(`[data-card="${anchor}"]`).evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.bottom > el.closest("section").querySelector("[data-collection-heading]").getBoundingClientRect().bottom && r.top < innerHeight;
    }));
    assert.deepEqual(await ids(tiles),cards);
    const singleArt = panel.locator('a[href*="/bandori/cards/1?"]');
    if (phone) await singleArt.tap(); else await singleArt.hover();
    const inactiveFlip = singleArt.locator("..").getByRole("button", { name: "无法切换卡面" });
    assert.ok(await inactiveFlip.isDisabled());
    const mark = await inactiveFlip.locator("span").boundingBox();
    const center = [mark.x + mark.width / 2, mark.y + mark.height / 2];
    if (phone) await page.touchscreen.tap(...center); else await page.mouse.click(...center);
    assert.equal(new URL(page.url()).hash, "#collection/cards");
    assert.deepEqual(await ids(tiles), cards);
    await tiles.first().scrollIntoViewIfNeeded();
    assert.equal(await panel.locator("[data-collection]").count(),3);
    assert.equal(await panel.locator("[data-collection-view]").count(),1);
    assert.deepEqual(await panel.locator("[data-size]").evaluateAll(groups=>groups.map(g=>g.children.length)),[6,6,2]);
    if (out) {
      await panel.locator("[data-action-feedback]").waitFor({state:"detached"});
      await page.evaluate(async()=>{ await Promise.all([...document.querySelectorAll('[role="tabpanel"] img')].filter(i=>i.getBoundingClientRect().top<innerHeight).map(i=>i.decode())); });
      await page.screenshot({path:out+"/wall-"+width+".png"});
    }
    await tiles.last().scrollIntoViewIfNeeded();
    const up = page.getByRole("button",{name:"返回顶部"});
    await up.waitFor();
    if (phone) {
      await page.setViewportSize({width:900,height:700});
      await tiles.last().scrollIntoViewIfNeeded();
      await up.waitFor();
      await checkCollectionHeader(page, panel, `收藏的卡牌（${cards.length}）`, true);
      assert.ok(await up.evaluate(button => button.getBoundingClientRect().right <= innerWidth));
      await page.setViewportSize({width,height:850});
    }
    const deepTile = tiles.nth(11);
    await deepTile.scrollIntoViewIfNeeded();
    const tileY = await page.evaluate(() => scrollY);
    const deepUrl = new URL(await deepTile.getAttribute("href"), origin).href;
    if (phone) { await deepTile.tap(); await deepTile.tap(); } else await deepTile.click();
    await page.waitForURL(deepUrl);
    await page.goBack();
    await deepTile.waitFor();
    await page.waitForFunction(y => Math.abs(scrollY - y) <= 2, tileY);
    await tiles.last().scrollIntoViewIfNeeded();
    if (phone) {
      await first.locator("canvas").waitFor({state:"detached"});
      await checkArtwork(tiles.last());
    }
    const col = await panel.boundingBox(), box = await up.boundingBox();
    assert.ok(Math.abs((phone?box.x+box.width:box.x)-(col.x+col.width)) < 14,JSON.stringify({col,box}));
    await up.click();
    await up.waitFor({ state: "hidden" });
    const expandedTop = (await panel.locator("[data-collection-view] [data-collection-heading]").boundingBox()).y;
    await page.getByRole("button",{name:"收起收藏的卡牌",exact:true}).click();
    await panel.locator("[data-more=cards]").waitFor();
    assert.ok(Math.abs((await more.locator("..").boundingBox()).y - expandedTop) <= 2);
    const removedId = cards[2];
    const removable = panel.locator(`a[href*="/bandori/cards/${removedId}?"]`);
    const remove = removable.locator("..").getByRole("button",{name:"取消收藏",exact:true});
    if (phone) {
      await removable.evaluate(link=>link.scrollIntoView({block:"center",behavior:"instant"}));
      await removable.tap();
    } else await removable.hover();
    await page.route("**/api/bandori/favorites/cards:"+removedId, route=>route.fulfill({status:503,json:{success:false,error:{code:"FAVORITE_FAILED",message:"fixture"}}}),{times:1});
    if (phone) await remove.tap(); else await remove.click();
    await removable.locator("..").getByRole("alert").waitFor();
    assert.equal(await remove.locator("..").evaluate(el=>getComputedStyle(el).opacity),"1");
    if (phone) await remove.tap(); else await remove.click();
    await removable.waitFor({state:"detached"});
    cards.splice(2,1);
    await panel.getByRole("heading", { name: `收藏的卡牌（${cards.length}）`, exact: true }).waitFor();
    assert.deepEqual(await ids(tiles),cards.slice(0,6));
    assert.ok(!(await api("")).find(g=>g.kind==="cards").items.some(item=>item.target===String(removedId)));
    await api("/cards:"+removedId,"PUT");
    cards.push(removedId);
    await checkSongPlaylist(page, panel, songs, phone, api);
    const flags = panel.getByRole("group",{name:"活动区服"});
    await panel.getByRole("button", { name: "编辑收藏活动" }).click();
    await page.waitForURL("**#collection/events/edit");
    await page.getByRole("button", { name: "完成编辑", exact: true }).click();
    await panel.locator('[data-more=events]').click();
    await checkCollectionHeader(page, panel, `收藏的活动（${events.length}）`, phone);
    await flags.getByRole("button", { name: "日服" }).click();
    assert.equal(await panel.locator('a[href*="/bandori/events/"][href*="server=jp"]').count(), 2);
    await checkEventEditor(page, panel, phone, api);
    const eventLink = panel.locator('a[href*="/bandori/events/"][href*="server=jp"]').last();
    const eventUrl = new URL(await eventLink.getAttribute("href"), origin).href;
    const bannerUrl = await eventLink.locator("img").getAttribute("src");
    await page.route(bannerUrl, eventBannerFixture);
    await eventLink.scrollIntoViewIfNeeded();
    const linkedWhitespace = await eventLink.locator("strong").evaluate(heading => {
      const right = heading.closest("li").getBoundingClientRect().right;
      return Array.from(heading.firstElementChild.getClientRects()).some(line => {
        if (right - line.right < 2) return false;
        return Boolean(document.elementFromPoint((line.right + right) / 2, line.top + line.height / 2)?.closest("a"));
      });
    });
    assert.equal(linkedWhitespace, false, "the empty end of a title line must not open event details");
    const statusPoint = await eventLink.locator("..").locator("small:last-child span").boundingBox();
    const statusX = statusPoint.x + statusPoint.width / 2, statusY = statusPoint.y + statusPoint.height / 2;
    if (phone) await page.touchscreen.tap(statusX, statusY);
    else await page.mouse.click(statusX, statusY);
    assert.equal(new URL(page.url()).hash, "#collection/events");
    const titleText = eventLink.locator("strong > span");
    const titlePoint = { position: { x: 3, y: 5 } };
    if (phone) await titleText.tap(titlePoint); else await titleText.click(titlePoint);
    await checkEventEntry(page, eventUrl);
    await page.goBack();
    await eventLink.waitFor();
    assert.equal(await flags.getByRole("button", { name: "日服" }).getAttribute("aria-pressed"), "true");
    const eventImage = eventLink.locator("img");
    const eventRow = eventLink.locator("..");
    const eventRemove = eventRow.getByRole("button", { name: "取消收藏", exact: true });
    const waitForBanner = async () => {
      await eventLink.scrollIntoViewIfNeeded();
      await eventImage.waitFor({ state: "visible", timeout: 90000 });
      await eventImage.evaluate(image => image.decode());
    };
    await waitForBanner();
    const revealEvent = async () => { if (phone) await eventImage.tap(); else await eventImage.hover(); };
    const starOpacity = () => eventRemove.evaluate(el => getComputedStyle(el).opacity);
    if (phone) {
      assert.equal(await starOpacity(), "0");
      const corner = await eventRemove.boundingBox();
      await page.touchscreen.tap(corner.x + corner.width / 2, corner.y + corner.height / 2);
      assert.equal(new URL(page.url()).hash, "#collection/events");
      assert.equal(await starOpacity(), "1");
      await flags.getByRole("button", { name: "日服" }).tap();
      assert.equal(await starOpacity(), "0");
      await revealEvent();
      await eventImage.tap();
    } else {
      await revealEvent();
      assert.equal(await starOpacity(), "1");
      const bridge = await titleText.evaluate(text => {
        const line = text.getClientRects()[0];
        const bottom = text.closest("a").querySelector("img").getBoundingClientRect().bottom;
        return { x: line.left + 3, y: (bottom + line.top) / 2 };
      });
      await page.mouse.move(bridge.x, bridge.y);
      assert.equal(await starOpacity(), "1");
      assert.ok(await eventLink.evaluate((link, point) => link.contains(document.elementFromPoint(point.x, point.y)), bridge));
      await titleText.hover(titlePoint);
      assert.equal(await starOpacity(), "1");
      await eventRemove.hover();
      assert.equal(await starOpacity(), "1");
      await eventRow.locator("small:last-child span").hover();
      assert.equal(await starOpacity(), "0");
      await page.mouse.click(bridge.x, bridge.y);
      await checkEventEntry(page, eventUrl);
      await page.goBack();
      await waitForBanner();
      await flags.getByRole("button").first().hover();
      assert.equal(await starOpacity(), "0");
      await eventLink.focus();
      await page.keyboard.press("Tab");
      assert.ok(await eventRemove.evaluate(el => el === document.activeElement));
      assert.equal(await starOpacity(), "1");
      await eventImage.click();
    }
    await checkEventEntry(page, eventUrl);
    await page.goBack();
    await waitForBanner();
    await revealEvent();
    const targetId = new URL(eventUrl).pathname.split("/").pop();
    const favoriteKey = "/events:jp:" + targetId;
    await page.route("**/api/bandori/favorites" + favoriteKey, route => route.fulfill({ status: 503, json: { success: false } }), { times: 1 });
    if (phone) await eventRemove.tap(); else await eventRemove.click();
    await eventRow.getByRole("alert").waitFor();
    if (phone) await eventRemove.tap(); else await eventRemove.click();
    await page.getByRole("heading", { name: `收藏的活动（${events.length - 1}）`, exact: true }).waitFor();
    assert.equal(await panel.locator(`a[href$="/${targetId}?server=jp"]`).count(), 0);
    const savedEvents = (await api("")).find(group => group.kind === "events").items.map(item => item.target);
    assert.ok(!savedEvents.includes("jp:" + targetId) && savedEvents.includes("cn:" + targetId));
    await api(favoriteKey, "PUT");
    await page.unroute(bannerUrl, eventBannerFixture);
    await page.reload();
    await flags.getByRole("button", { name: "国服" }).click();
    await panel.locator("[data-more=events]").click();
    await page.getByRole("button",{name:"收起收藏的活动", exact:true}).click();
    await flags.getByRole("button",{name:"国服"}).waitFor();
    assert.equal(await flags.getByRole("button",{name:"国服"}).getAttribute("aria-pressed"),"true");
    assert.equal(await panel.locator('a[href*="/bandori/events/"]').count(),4);
    await flags.getByRole("button",{name:"日服"}).click();
    assert.equal(await panel.locator('a[href*="/bandori/events/"][href*="server=jp"]').count(),2);
    if (out) {
      await flags.getByRole("button",{name:"国服"}).click();
      await panel.evaluate(async el=>{ await Promise.all([...el.querySelectorAll("img")].map(i=>i.decode())); });
      await panel.locator("h2").first().evaluate(el=>window.scrollBy(0,el.getBoundingClientRect().top-84));
      await page.screenshot({path:out+"/profile-"+width+".png"});
    }
    if (phone) { await first.tap(); assert.equal(new URL(page.url()).pathname,path); await first.tap(); }
    else await first.click();
    await page.waitForURL("**/bandori/cards/"+firstId+"?**");
    const star = page.locator('button[data-detail=true]');
    await page.getByRole("button", { name: "取消收藏", exact: true, pressed: true }).and(star).waitFor({timeout:60000});
    assert.equal(await star.textContent(), "");
    if (out) await star.screenshot({path:out+"/star-"+width+".png"});
    await star.click();
    await page.waitForFunction(()=>document.querySelector('button[data-detail=true]')?.getAttribute("aria-pressed")==="false");
    await star.click();
    await page.waitForFunction(()=>document.querySelector('button[data-detail=true]')?.getAttribute("aria-pressed")==="true");
    cards.push(cards.shift());
    if (!phone) {
      await checkPendingEvents(page, api, path);
      for (const detail of ["songs/1", "events/326?server=cn"]) {
        await page.goto(origin+"/bandori/"+detail,{waitUntil:"domcontentloaded"});
        await page.getByRole("button", { name: "取消收藏", exact: true, pressed: true }).and(star).waitFor({timeout:90000});
        assert.equal(await star.textContent(), "");
      }
      for (const kind of ["cards","songs"]) {
        const reads = [];
        const record = req => { if (req.method()==="GET" && req.url().includes("/api/bandori/favorites")) reads.push(new URL(req.url()).pathname); };
        page.on("request",record);
        await page.goto(origin+"/bandori/"+kind,{waitUntil:"domcontentloaded"});
        const quick = page.locator('button[data-detail=false][aria-disabled=false]').first();
        await quick.waitFor({timeout:90000});
        const before = await quick.getAttribute("aria-pressed");
        assert.equal(await page.locator('button[data-detail=false] sup').count(),0);
        assert.deepEqual(reads,["/api/bandori/favorites"]);
        const failOnce = route => route.fulfill({status:503,json:{success:false,error:{code:"FAVORITE_FAILED",message:"fixture"}}});
        await page.route("**/api/bandori/favorites/*",failOnce,{times:1});
        await quick.press("Enter");
        await page.locator('[data-action-feedback=error]').waitFor();
        assert.equal(await quick.getAttribute("aria-pressed"),before);
        assert.ok(await quick.evaluate(el => el === document.activeElement));
        await page.keyboard.press("Enter");
        await page.waitForFunction(old=>document.querySelector('button[data-detail=false]')?.getAttribute("aria-pressed")!==old,before);
        assert.equal(new URL(page.url()).pathname,"/bandori/"+kind);
        await quick.click();
        await page.waitForFunction(old=>document.querySelector('button[data-detail=false]')?.getAttribute("aria-pressed")===old,before);
        assert.deepEqual(reads,["/api/bandori/favorites"]);
        page.off("request",record);
      }
      console.log("PASS regional event and song details, one batched catalog read and failed-write retry for both catalogs");
    } else {
      const visitor = await browser.newContext({ viewport: { width, height: 850 }, isMobile: true, hasTouch: true });
      const publicPage = await visitor.newPage();
      await publicPage.goto(origin + path + "#collection/songs", {waitUntil:"domcontentloaded"});
      await publicPage.locator('li[data-song] button[aria-haspopup="dialog"]').first().tap();
      assert.equal(await publicPage.locator("[data-edit=songs], [data-favorite-remove]").count(), 0);
      const songActions = publicPage.getByRole("dialog").filter({ has: publicPage.getByRole("button", { name: "加入播放队列" }) });
      await songActions.getByRole("button", { name: "下一首播放" }).waitFor();
      assert.equal(await songActions.getByRole("button", { name: "取消收藏" }).count(), 0);
      const returnTo = new URL(publicPage.url());
      await songActions.getByRole("button", {name:"登录后收藏"}).tap();
      await publicPage.waitForURL("**/auth?**");
      assert.equal(new URL(publicPage.url()).searchParams.get("next"), returnTo.pathname + returnTo.search + returnTo.hash);
      await publicPage.route("**/events/images/*.png", eventBannerFixture);
      await publicPage.goto(origin + path + "#collection/events/edit", {waitUntil:"domcontentloaded"});
      await songActions.waitFor({state:"hidden"});
      const publicEvent = publicPage.getByRole("tabpanel").locator('li:has(a[href*="/bandori/events/"])').first();
      await publicEvent.scrollIntoViewIfNeeded();
      await publicEvent.locator("a img").waitFor({ timeout: 90000 });
      await publicEvent.locator("a img").evaluate(image => image.decode());
      assert.equal(await publicPage.getByRole("button", { name: "编辑收藏活动" }).count(), 0);
      const login = publicEvent.getByRole("button", {name:"登录后收藏"});
      await login.waitFor({state:"attached"});
      const publicDetail = new URL(await publicEvent.locator("a").getAttribute("href"), origin).href;
      await publicEvent.locator("a img").tap();
      await publicPage.waitForFunction(el => getComputedStyle(el).opacity === "1", await login.elementHandle());
      await publicEvent.locator("a img").tap();
      await publicPage.waitForURL(publicDetail);
      await visitor.close();
      await page.setViewportSize({width:320,height:700});
      await page.goto(origin + path + "#collection/cards/edit", { waitUntil: "domcontentloaded" });
      await panel.locator("[data-sort-id]").first().waitFor();
      await checkCollectionHeader(page, panel, `收藏的卡牌（${cards.length}）`, true);
      await page.getByRole("button", { name: "完成编辑", exact: true }).tap();
      await page.waitForURL(origin + path);
      await page.getByRole("tab", { name: "主页", exact: true }).waitFor();
      assert.ok(await page.getByRole("button", { name: "打开页面导航", exact: true }).isVisible());
      assert.ifError((await admin.from("bandori_favorites").delete().eq("user_id", uid).eq("kind", "cards").neq("target", "1")).error);
      await page.goto(origin + path + "#collection/cards/edit", { waitUntil: "domcontentloaded" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !location.hash);
      await panel.locator("[data-edit=cards]").click();
      const last = panel.locator('[data-sort-id="1"]');
      await last.getByRole("button", { name: "取消收藏" }).tap();
      await page.waitForURL(origin + path);
      await panel.getByRole("status").getByText("已保存", { exact: true }).waitFor();
      assert.equal(await panel.locator("[data-sort-id]").count(), 0);
      assert.equal(await profileCards(), undefined);
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(itemReads, [], "Browsing and saving favorites issue no per-item reads");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await ctx.close();
    console.log("PASS profile, star, regional switch, art, full gallery and return controls at",width);
  }
} finally {
  await browser?.close();
  if (hostId) assert.ifError((await admin.auth.admin.deleteUser(hostId)).error);
  const removed = await admin.auth.admin.deleteUser(uid);
  assert.ifError(removed.error);
}
