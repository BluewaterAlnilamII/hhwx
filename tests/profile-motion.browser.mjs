// Run against local Next dev. Account sessions, favorites and all writes are browser fixtures.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { installProfileSession, user, userId } from "./fixtures/profile-session.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.PROFILE_TEST_ORIGIN || "http://localhost:3000";
require("@next/env").loadEnvConfig(process.cwd(), true);
const uid = 10001;
const tab = name => "#profile-tab-" + name;
const songs = ["切ないSandglass", "Returns", "キズナミュージック♪", "STAR BEAT!", "イニシャル", "Step×Step!", "夏空 SUN! SUN! SEVEN!", "ティアドロップス", "走り始めたばかりのキミに", "Light Delight"];
const longPlaylist = songs.concat(Array.from({length:50}, (_, i) => `Track ${i + 11}`));
const binding = { server: 0, gameUid: "12345", playerName: "Poppin'Party", public: true, titlesPublic: false, ownedDegreeIds: [], ownedDegreeEffectIds: [] };
const profile = { publicUid: uid, username: "Motion fixture", createdAt: "2026-01-01", signature: "", cover: null, preferences: null, isOwner: false, avatar: { cardId: 0, entityServer: null, trainType: "normal" }, displayDegree: { server: 0, degreeId: 0, degreeEffectId: null }, bindings: [binding] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
const openingTiming = el => [getComputedStyle(el).animationDuration, getComputedStyle(el).animationTimingFunction];
let coverMenuTiming;
try {
  for (const [width, height, phone, reduced] of [[390, 844, true, false], [844, 390, true, true], [1440, 900, false, false]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, reducedMotion: reduced ? "reduce" : "no-preference" });
    const owner = phone && !reduced;
    if (owner) await installProfileSession(context, process.env.NEXT_PUBLIC_SUPABASE_URL);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    let reads = 0;
    let failWrite = false;
    let playlist = songs;
    const preferences = {modules:[{id:"songs",public:true}], accounts:[], publicAccounts:true, allowGameIdSearch:true, signature:"", cover:null};
    await page.route("**/*", route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const success = data => route.fulfill({ json: { success: true, data } });
      if (owner && ((path === "/api/account/homepage" && req.method() === "PATCH") || (path === "/api/bandori/favorites/songs:1" && req.method() === "DELETE"))) {
        if (failWrite) return route.fulfill({status:503,json:{success:false}});
        return success(req.method() === "PATCH" ? req.postDataJSON() : true);
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) return route.abort();
      if (path.startsWith("/auth/v1/")) return route.fulfill({json:user});
      if (path === "/api/account/auth-summary" || path === "/api/account/profile") return success({userId, publicUid:uid, username:profile.username, email:user.email, emailVerified:true, roles:[], createdAt:profile.createdAt, avatarCardId:0, avatarCardServer:null, avatarCardTrainType:"normal", displayDegreeServer:0, displayDegreeId:0, displayDegreeEffectId:null});
      if (path === "/api/users/" + uid) return success(owner ? {...profile,isOwner:true,preferences} : profile);
      if (path === "/api/bandori/favorites") {
        if (new URL(req.url()).searchParams.get("view") === "keys") return success(playlist.map((_,i) => "songs:" + (i+1)));
        reads++;
        return success([{ kind: "songs", items: playlist.map((_, i) => ({ target: String(i + 1), normalArt: false })).reverse() }]);
      }
      if (path === "/api/bandori/master/music") return success(Object.fromEntries(playlist.map((title, i) => [i + 1, { musicTitle: [title], bandName: ["Poppin'Party"] }])));
      if (path.endsWith("/bandori/music/index.json")) return route.fulfill({ json: { schemaVersion: 2, updatedAt: "2026-01-01", songs: {} } });
      return route.continue();
    });
    await page.goto(origin + "/user/" + uid, { waitUntil: "domcontentloaded" });
    const row = page.locator("li[data-song]").first();
    const more = row.locator("[aria-haspopup=dialog]");
    const menu = page.locator("[data-song-menu]");
    await row.waitFor({ timeout: 60000 });
    const original = await row.elementHandle();
    const initialReads = reads;
    const settled = locator => locator.evaluate(el => Promise.allSettled(el.getAnimations().map(a => a.finished)));
    const selected = name => page.locator(tab(name) + '[aria-selected="true"]').waitFor();
    if (owner) {
      const coverMenu = page.locator("header details:has(summary)");
      await coverMenu.waitFor();
      for (let open = 0; open < 2; open++) {
        const opacity = await coverMenu.evaluate(async el => {
          el.querySelector("summary").click();
          const menu = el.querySelector("button").parentElement;
          const initial = Number(getComputedStyle(menu).opacity);
          await Promise.all(menu.getAnimations().map(animation => animation.finished));
          return [initial, Number(getComputedStyle(menu).opacity)];
        });
        assert.ok(opacity[0] < 0.1 && opacity[1] === 1, "The card options appear from their trigger on every open");
        coverMenuTiming = await coverMenu.locator("summary + div").evaluate(openingTiming);
        await coverMenu.locator("summary").tap();
      }
      await coverMenu.locator("summary").tap();
      assert.equal(await coverMenu.evaluate(el => el.open), true);
      await page.evaluate(() => scrollBy({top:16, behavior:"instant"}));
      await page.waitForFunction(el => !el.open, await coverMenu.elementHandle());
      await page.evaluate(() => window.scrollTo({top:64, behavior:"instant"}));
      for (const name of ["details", "settings", "home"]) {
        const frames = await page.evaluate(async name => {
          const strip = document.querySelector("#profile-tab-home").parentElement;
          const sample = () => [scrollY, innerWidth, document.documentElement.scrollWidth, strip.getBoundingClientRect().top];
          const frames = [sample()];
          document.getElementById("profile-tab-" + name).dispatchEvent(new MouseEvent("click", {bubbles:true, detail:1}));
          do {
            await new Promise(requestAnimationFrame);
            frames.push(sample());
          } while (document.querySelector("[data-tab-panels][data-sliding]") && frames.length < 120);
          return frames;
        }, name);
        await selected(name);
        assert.ok(frames.length > 3, "A tap slides between the two panels");
        assert.ok(frames.every(frame => frame.every((value,i) => Math.abs(value - frames[0][i]) <= 1)),
          "The viewport, shared header and tab strip stay in place throughout a tap: " + JSON.stringify(frames));
      }
      const reversal = await page.evaluate(async () => {
        const panel = document.getElementById("profile-panel-home");
        const strip = document.querySelector("[data-tab-indicator]");
        const sample = () => [panel.getBoundingClientRect().left, strip.getBoundingClientRect().left];
        const tap = name => document.getElementById("profile-tab-" + name).dispatchEvent(new MouseEvent("click", {bubbles:true, detail:1}));
        const start = sample();
        tap("settings");
        for (let i = 0; i < 120 && Math.abs(sample()[0] - start[0]) < 40; i++) await new Promise(requestAnimationFrame);
        const before = sample();
        tap("home");
        const after = sample();
        for (let i = 0; i < 120 && document.querySelector("[data-tab-panels][data-sliding]"); i++) await new Promise(requestAnimationFrame);
        return {start, before, after, end:sample()};
      });
      assert.ok(Math.abs(reversal.before[0] - reversal.start[0]) >= 40);
      assert.ok(reversal.before.every((value,i) => Math.abs(value - reversal.after[i]) < 2), "Reversing a tap starts from the painted frame");
      assert.deepEqual(reversal.end, reversal.start);
    }
    if (phone) {
      const input = await context.newCDPSession(page);
      const finger = (type, x, y) => input.send("Input.dispatchTouchEvent", { type, touchPoints: x === undefined ? [] : [{ x, y }] });
      async function drag(x, y, dx, dy, during) {
        await finger("touchStart", x, y);
        await finger("touchMove", x + dx / 2, y + dy / 2);
        await finger("touchMove", x + dx, y + dy);
        if (during) await during();
        await finger("touchEnd");
      }
      if (owner) {
        const bar = await page.locator(tab("home")).boundingBox();
        const y = bar.y + bar.height / 2;
        await drag(320, y, -160, 0);
        // Hold a reproducible frame of the first release before the next real touch.
        await page.evaluate(() => {
          const animations = document.querySelector("[data-tab-panels]").getAnimations({subtree:true})
            .concat(document.querySelector("[data-tab-indicator]").getAnimations());
          for (const animation of animations) {
            animation.pause();
            animation.currentTime = animation.effect.getComputedTiming().duration * .75;
          }
        });
        await drag(320, y, -255, 0);
        await selected("settings");
        await page.locator(tab("home")).tap();
        await page.waitForFunction(() => !document.querySelector("[data-tab-panels][data-sliding]"));
        await page.locator(tab("details")).tap();
        await finger("touchStart", 280, y);
        assert.ok(await page.locator("[data-tab-panels][data-sliding]").count(), "Finger is down before the tap finishes");
        await page.waitForFunction(() => !document.querySelector("[data-tab-panels][data-sliding]"));
        await finger("touchMove", 210, y);
        await finger("touchMove", 75, y);
        assert.ok(await page.locator("[data-tab-panels][data-sliding]").count(), "Movement after the commit still drags the panel");
        await finger("touchEnd");
        await selected("settings");
        await page.locator(tab("home")).tap();
        await page.waitForFunction(() => !document.querySelector("[data-tab-panels][data-sliding]"));
      }
      await row.scrollIntoViewIfNeeded();
      let box = await row.boundingBox();
      const yBefore = await page.evaluate(() => window.scrollY);
      await drag(box.x + box.width / 2, box.y + box.height / 2, 3, -86);
      await page.waitForFunction(before => scrollY > before + 12, yBefore);
      await page.evaluate(() => new Promise(resolve => {
        let last = scrollY, stable = 0;
        function frame() {
          stable = scrollY === last ? stable + 1 : 0;
          last = scrollY;
          if (stable >= 4) resolve(); else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }));
      await selected("home");
      await row.evaluate(el => el.scrollIntoView({block:"center", behavior:"instant"}));
      box = await row.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await drag(x, y, -30, 0);
      await page.waitForFunction(() => !document.querySelector("[data-sliding]"));
      await selected("home");
      const indicator = page.locator("[data-tab-indicator]");
      const homeLine = await indicator.boundingBox();
      await drag(x, y, -110, 2, async () => {
        if (reduced) {
          assert.equal(await page.locator("#profile-panel-home").evaluate(el => getComputedStyle(el).transform), "none");
          assert.equal((await indicator.boundingBox()).x, homeLine.x);
        } else {
          assert.ok(await page.locator("#profile-panel-details[inert]").isVisible());
          const progress = await page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect();
            const home = rect("#profile-tab-home"), details = rect("#profile-tab-details"), panels = rect("[data-tab-panels]");
            return [(rect("[data-tab-indicator]").left - home.left) / (details.left - home.left),
              (panels.left - rect("#profile-panel-home").left) / panels.width];
          });
          assert.ok(progress[0] > .1 && Math.abs(progress[0] - progress[1]) < .015, "Underline and panel follow the same drag");
          await page.evaluate(() => {
            const viewport = document.querySelector("[data-tab-panels]");
            const old = document.querySelector("#profile-panel-home");
            window.flashFrames = [];
            window.releaseFrames = [];
            window.addEventListener("pointerup", () => {
              const start = performance.now();
              function track() {
                window.releaseFrames.push([performance.now() - start, old.getBoundingClientRect().left]);
                if (!old.hidden) requestAnimationFrame(track);
              }
              track();
            }, {once:true, capture:true});
            const sample = () => {
              if (!old.hidden && !viewport.hasAttribute("data-sliding") &&
                  Math.abs(old.getBoundingClientRect().left - viewport.getBoundingClientRect().left) < 1) window.flashFrames.push(performance.now());
            };
            const observer = new MutationObserver(sample);
            observer.observe(viewport, {attributes:true, subtree:true});
            function frame() {
              sample();
              if (old.hidden) observer.disconnect(); else requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
          });
        }
      });
      await selected("details");
      if (!reduced) {
        assert.deepEqual(await page.evaluate(() => window.flashFrames), [], "old panel must stay offscreen through the React commit");
        const frames = await page.evaluate(() => window.releaseFrames);
        const early = frames.filter(([time]) => time <= 65);
        assert.ok(early.length > 1 && Math.abs(early.at(-1)[1] - frames[0][1]) < (width - 110) * .4,
          "Release continues from the dragged position without a sudden leap");
      }
      const details = await page.locator("#profile-panel-details").boundingBox();
      await drag(details.x + 65, details.y + 15, 130, 0);
      await selected("home");
      await row.scrollIntoViewIfNeeded();
      const hold = await row.boundingBox();
      await finger("touchStart", hold.x + hold.width / 2, hold.y + hold.height / 2);
      await menu.waitFor();
      await menu.evaluate(el => el.addEventListener("click", () => { window.menuClickedOnRelease = true; }, {once:true}));
      await finger("touchEnd");
      await settled(menu);
      assert.ok(!await page.evaluate(() => window.menuClickedOnRelease), "Lifting the long press must not activate a menu action");
      const sheet = await menu.boundingBox();
      assert.ok(sheet.x >= 8 && width - sheet.x - sheet.width >= 8 && height - sheet.y - sheet.height >= 7);
      const header = await menu.evaluate(el => {
        const grip = el.firstElementChild;
        const art = el.querySelector("a[tabindex='-1']");
        const barBottom = grip.getBoundingClientRect().top + parseFloat(getComputedStyle(grip).paddingTop) + parseFloat(getComputedStyle(grip, "::before").height);
        const hits = [art, el.querySelector("h2 a")].map(link => {
          const r = link.getBoundingClientRect();
          return link.contains(document.elementFromPoint(r.x + r.width / 2, r.y + 2));
        });
        return { gap: art.getBoundingClientRect().top - barBottom, grip: grip.clientHeight, hits };
      });
      assert.ok(header.gap >= 6 && header.gap <= 7);
      assert.ok(header.grip >= 40 && header.hits.every(Boolean));
      console.log("sheet", width, {gutter: sheet.x, gripToArt: header.gap, dragHeight: header.grip});
      if (process.env.PROFILE_TEST_OUTPUT) await page.screenshot({ path: join(process.env.PROFILE_TEST_OUTPUT, `profile-sheet-${width}.png`), style: "nextjs-portal {display:none !important}" });
      await drag(width / 2, sheet.y + 12, 0, 22);
      await settled(menu);
      assert.ok(Math.abs((await menu.boundingBox()).y - sheet.y) < 1);
      await drag(width / 2, sheet.y + 12, 0, 74);
      await menu.waitFor({state: "detached"});
      const trigger = await more.boundingBox();
      assert.ok(trigger, "Sheet dismissal should leave the song visible: " + await page.evaluate(() => JSON.stringify({
        url:location.pathname + location.hash, tab:document.querySelector("[role=tab][aria-selected=true]")?.id,
        focus:document.activeElement?.outerHTML.slice(0,100), scroll:scrollY,
      })));
      async function tap(x, y) {
        await input.send("Input.synthesizeTapGesture", {x, y, duration: 80, gestureSourceType: "touch"});
      }
      await tap(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
      await settled(menu);
      await tap(3, 115);
      await menu.waitFor({state: "detached"});
      await selected("home");
      if (owner) {
        assert.ok(await row.evaluate((el, first) => el === first, original));
        assert.equal(reads, initialReads);
        const edit = page.locator("[data-edit=songs]");
        await edit.tap();
        await page.locator("[data-edit=songs][aria-pressed=true]").waitFor();
        await page.reload({waitUntil:"domcontentloaded"});
        await page.locator("[data-edit=songs][aria-pressed=false]").waitFor();
        await row.waitFor();
        assert.equal(new URL(page.url()).hash, "");
        assert.equal(await page.locator("li[data-song]").count(), 10);
        playlist = longPlaylist;
        await page.reload({waitUntil:"domcontentloaded"});
        const all = page.locator("[data-more=songs]");
        await all.tap();
        const reading = page.locator('li[data-song="30"]');
        await reading.waitFor();
        await reading.evaluate(el => el.scrollIntoView({block:"center", behavior:"instant"}));
        const before = await reading.boundingBox();
        await drag(235, before.y + before.height / 2, -150, 0);
        await selected("details");
        const short = await page.locator("#profile-panel-details").boundingBox();
        await drag(65, short.y + 20, 200, 0, async () => {
          const preview = page.locator("#profile-panel-home");
          const bottom = await preview.evaluate(el => new Promise(resolve => {
            const observer = new IntersectionObserver(([entry]) => { observer.disconnect(); resolve(entry.intersectionRect.bottom); });
            observer.observe(el);
          }));
          assert.ok(bottom >= height - 1, `Incoming playlist is clipped at ${bottom}px`);
          if (process.env.PROFILE_TEST_OUTPUT) await page.screenshot({path:join(process.env.PROFILE_TEST_OUTPUT,"profile-swipe-return.png"),style:"nextjs-portal {display:none !important}"});
        });
        await selected("home");
        const after = await reading.boundingBox();
        assert.ok(Math.abs(after.y - before.y) <= 1, `Reading position moved from ${before.y} to ${after.y}`);
        console.log("return to track 30", {before:before.y, after:after.y});
        await reading.locator("[aria-haspopup=dialog]").tap();
        await menu.locator('h2 a').tap();
        await page.waitForURL("**/bandori/songs/30");
        await page.goBack();
        await reading.waitFor();
        await page.waitForFunction(() => document.activeElement?.closest('[data-song]')?.dataset.song === "30");
        assert.ok(Math.abs((await reading.boundingBox()).y - before.y) <= 1, "Back from song details restores the expanded row");
        await page.reload({waitUntil:"domcontentloaded"});
        await all.waitFor();
        await row.waitFor();
        assert.equal(new URL(page.url()).hash, "");
        assert.equal(await page.locator("li[data-song]").count(), 10);
      }
      await input.detach();
    } else {
      await page.locator(tab("details")).click();
      await page.keyboard.press("ArrowLeft");
      await selected("home");
      await row.click({button: "right"});
      await settled(menu);
      assert.equal(await menu.getAttribute("aria-modal"), null);
      assert.deepEqual(await menu.evaluate(openingTiming), coverMenuTiming, "Anchored menus share the cover menu's opening timing");
      await page.locator(tab("details")).click();
      await selected("details");
      await menu.waitFor({ state: "detached" });
      await page.locator(tab("home")).click();
      await more.focus();
      await page.keyboard.press("Enter");
      await menu.waitFor();
      await page.keyboard.press("Escape");
      await menu.waitFor({state:"detached"});
      await page.waitForFunction(el => document.activeElement === el, await more.elementHandle());
      const fifthSong = page.locator("li[data-song]").nth(4);
      const songActions = fifthSong.locator("[aria-haspopup=dialog]");
      await fifthSong.evaluate(el => el.scrollIntoView({block:"center", behavior:"instant"}));
      await fifthSong.hover();
      for (const via of ["button", "context"]) {
        if (via === "button") await songActions.click();
        else await fifthSong.click({button:"right"});
        await settled(menu);
        await page.evaluate(() => scrollBy({top:scrollY > 40 ? -16 : 16, behavior:"instant"}));
        await menu.waitFor({state:"detached"});
        assert.equal(await songActions.getAttribute("aria-expanded"), "false");
      }
      const list = fifthSong.locator("..");
      await list.evaluate(el => { el.style.maxHeight = "180px"; el.style.overflowY = "auto"; });
      await fifthSong.click({button:"right"});
      await settled(menu);
      await list.evaluate(el => el.scrollBy({top:el.scrollTop > 16 ? -16 : 16, behavior:"instant"}));
      await menu.waitFor({state:"detached"});
      await list.evaluate(el => { el.style.removeProperty("max-height"); el.style.removeProperty("overflow-y"); });
      await page.setViewportSize({width:1024, height:230});
      await fifthSong.evaluate(el => el.scrollIntoView({block:"center", behavior:"instant"}));
      await fifthSong.hover();
      await songActions.click();
      await settled(menu);
      const menuScroll = await menu.evaluate(async el => {
        el.scrollTop = el.scrollHeight;
        await new Promise(requestAnimationFrame);
        return el.scrollTop;
      });
      assert.ok(menuScroll > 0);
      assert.equal(await menu.getAttribute("data-state"), "open");
      await page.evaluate(() => scrollTo({top:0, behavior:"instant"}));
      await menu.waitFor({state:"detached"});
      await page.setViewportSize({width, height});
      await page.emulateMedia({reducedMotion:"reduce"});
      await row.hover();
      await more.click();
      assert.equal(await menu.evaluate(el => getComputedStyle(el).animationName), "none");
      await page.keyboard.press("Escape");
      await menu.waitFor({state:"detached"});
    }
    if (!owner) {
      assert.ok(await row.evaluate((el, first) => el === first, original));
      assert.equal(reads, initialReads);
    }
    if (owner) {
      await page.locator(tab("settings")).tap();
      const toggle = page.getByRole("switch").first();
      await toggle.waitFor();
      const hit = await toggle.boundingBox();
      const track = await toggle.locator(':scope > span').first().boundingBox();
      assert.equal(hit.height, 44);
      assert.equal(track.height, 20);
      failWrite = true;
      await toggle.tap({position: {x: hit.width / 2, y: 2}});
      await page.locator('[data-action-feedback=error]').waitFor();
      failWrite = false;
      await toggle.tap({position: {x: hit.width / 2, y: hit.height - 2}});
      await page.locator('[data-action-feedback=success]').waitFor();
      await page.locator(tab("home")).tap();
      await more.tap();
      const star = menu.locator("button[aria-pressed=true]");
      failWrite = true;
      await star.tap();
      await menu.locator('[data-action-feedback=error]').waitFor();
      failWrite = false;
      await star.tap();
      await menu.waitFor({state:"detached"});

      // Both collection types use a different edit URL from the playlist.
      const otherGroups = ["cards", "events"].map(kind => ({
        kind, items: Array.from({length:8}, (_, i) => ({target:(kind === "events" ? "jp:" : "") + (i + 1), normalArt:false})),
      }));
      preferences.modules.push(...otherGroups.map(({kind}) => ({id:kind,public:true})));
      await page.route("**/api/bandori/favorites?profile=*", route => route.fulfill({json:{success:true,data:otherGroups}}));
      await page.route("**/api/bandori/master/events", route => route.fulfill({json:{success:true,data:Object.fromEntries(
        otherGroups[1].items.map((_, i) => [i + 1, {eventName:["Event " + (i + 1)],eventType:"story"}]))}}));
      await page.reload({waitUntil:"domcontentloaded"});
      for (const {kind} of otherGroups) {
        const section = page.locator(`[data-collection="${kind}"]`);
        for (const action of ["more", "edit"]) {
          await section.locator(`[data-${action}="${kind}"]`).tap();
          await page.locator(`[data-collection-view="${kind}"]`).waitFor();
          await page.reload({waitUntil:"domcontentloaded"});
          await section.locator('[data-edit][aria-pressed=false]').waitFor();
          assert.equal(await section.getAttribute("data-collection-view"), null);
          assert.equal(new URL(page.url()).hash, "");
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log("PASS", width, height, reduced ? "reduced motion" : "normal motion");
    await context.close();
  }
} finally { await browser.close(); }
