// Run against the dev server; delays and catalog responses stay in this browser.
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
      let releaseScripts;
      const scriptsReady = new Promise(resolve => { releaseScripts = resolve; });
      await page.route("**/*", async route => {
        if (direct && route.request().resourceType() === "script") await scriptsReady;
        await route.continue();
      });
      await page.route("**/api/bandori/master/events", async route => {
        await new Promise(resolve => setTimeout(resolve, 1200));
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
      try {
        if (direct) {
          await page.locator(".event-progress").waitFor({ timeout: 30000 });
          const picker = page.locator(".event-switcher-field select");
          assert.equal(await picker.inputValue(), "328", "SSR keeps the selected event before hydration");
          assert.equal(await picker.isDisabled(), true, "a partial catalog is not interactive");
        }
      } finally { releaseScripts(); }
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
