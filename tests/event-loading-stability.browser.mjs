// Run against the local Next server. This browser controls hydration and the catalog response.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const sharp = require("sharp");
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const now = Date.now();
const catalog = { success: true, data: { 328: {
  eventType: "challenge", eventName: ["Fixture", "", "", "Fixture"],
  startAt: [now - 86400000, null, null, now - 86400000],
  endAt: [now + 86400000, null, null, now + 86400000],
} } };
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true });
try {
  for (const width of [393, 1440]) {
    for (const direct of [true, false]) {
      const page = await browser.newPage({ viewport: { width, height: 852 }, isMobile: width < 640, hasTouch: width < 640 });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() === "error" && /hydrat/i.test(message.text())) errors.push(message.text());
      });
      const scripts = Promise.withResolvers();
      const catalogResponse = Promise.withResolvers();
      const catalogUrl = "**/api/bandori/master/events";
      const testRetry = direct && width === 393;
      let requests = 0;
      await page.route("**/*", async route => {
        if (route.request().resourceType() === "script") await scripts.promise;
        await route.continue();
      });
      await page.route(catalogUrl, async route => {
        const attempt = ++requests;
        await catalogResponse.promise;
        if (testRetry && attempt === 1) return route.fulfill({ status: 503, json: { success: false } });
        await route.fulfill({ json: catalog });
      });
      await page.addInitScript(() => {
        window.loadingFrames = [];
        let previous = "";
        const sample = () => {
          const root = document.querySelector(".event-page");
          if (root) {
            const progress = root.querySelector(".event-progress");
            const picker = root.querySelector(".event-switcher-field select");
            const modes = root.querySelector(".event-mode-controls");
            const frame = {
              progress: !!progress, picker: !!picker,
              spacing: progress && modes ? Math.round(modes.getBoundingClientRect().top - progress.getBoundingClientRect().top) : null,
            };
            const next = JSON.stringify(frame);
            if (next !== previous) window.loadingFrames.push(frame);
            previous = next;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.goto(`${base}/bandori/events${direct ? "/328" : ""}?server=cn`, { waitUntil: "commit", timeout: 90000 });
      const picker = page.locator(".event-switcher-field select");
      const summary = page.locator(".event-switcher-summary");
      const progress = page.locator(".event-progress");
      async function checkLoading() {
        await summary.getByRole("status").waitFor();
        assert.equal(await picker.isDisabled(), true);
        assert.equal(await picker.inputValue(), "");
        assert.equal(await progress.count(), 0);
      }
      try {
        await checkLoading();
        const requested = page.waitForRequest(catalogUrl);
        scripts.resolve();
        await requested;
        await checkLoading();
      } finally {
        scripts.resolve();
        catalogResponse.resolve();
      }
      if (testRetry) {
        const retry = summary.getByRole("alert").getByRole("button");
        await retry.waitFor();
        assert.ok(await picker.isDisabled());
        assert.equal(await progress.count(), 0);
        await Promise.all([page.waitForRequest(catalogUrl), retry.click()]);
      }
      await page.waitForURL("**/bandori/events/328?*", { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction(() => {
        const select = document.querySelector(".event-switcher-field select");
        return select && !select.disabled && select.value === "328" && !!document.querySelector(".event-progress");
      }, null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      const frames = await page.evaluate(() => window.loadingFrames);
      for (const field of ["picker", "progress"]) {
        const first = frames.findIndex(frame => frame[field]);
        assert.ok(first >= 0);
        assert.ok(frames.slice(first).every(frame => frame[field]), `${field} must not disappear after its first display: ${JSON.stringify(frames)}`);
      }
      const spacings = frames.map(frame => frame.spacing).filter(value => value > 0);
      assert.ok(spacings.length > 0, "sample the visible progress bar and mode controls");
      assert.ok(Math.max(...spacings) - Math.min(...spacings) <= 1, `progress keeps its layout slot: ${JSON.stringify(frames)}`);
      if (direct) {
        await page.evaluate(() => scrollTo(0, 0));
        const backgroundPixels = async () => sharp(await page.screenshot()).extract({ left: width - 5, top: 100, width: 5, height: 400 }).raw().toBuffer();
        for (const colorScheme of ["light", "dark"]) {
          await page.emulateMedia({ colorScheme });
          const before = await backgroundPixels();
          await page.evaluate(() => {
            const spacer = document.createElement("div");
            spacer.id = "height-fixture";
            spacer.style.height = "3000px";
            document.body.append(spacer);
          });
          assert.ok(before.equals(await backgroundPixels()), "page growth cannot change background pixels");
          await page.evaluate(() => scrollTo(0, 300));
          assert.ok(before.equals(await backgroundPixels()), "scrolling cannot move background pixels");
          await page.evaluate(() => { document.getElementById("height-fixture").remove(); scrollTo(0, 0); });
        }
        await page.emulateMedia({ colorScheme: "light" });
        if (process.env.LOADING_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.LOADING_SCREENSHOT_DIR}/hhwx-loading-${width}.png` });
      }
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, direct, frames, errors }));
      await page.close();
    }
  }
} finally { await browser.close(); }
