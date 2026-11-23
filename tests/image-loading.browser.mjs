// Run with node tests/image-loading.browser.mjs. All image responses are local fixtures.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const bundle = await build({
  stdin: {resolveDir: process.cwd(), loader: "tsx", contents: `
    import {createRoot} from "react-dom/client";
    import {flushSync} from "react-dom";
    import LoadingImage from "./src/components/LoadingImage";
    const root = createRoot(document.querySelector("main"));
    window.show = (src, key = 0, banner = false) => flushSync(() => root.render(
      <LoadingImage key={key} src={src} width={100} height={75} alt="Card" loadingLabel="Loading card" revealBeforeHydration={banner} />
    ));
  `},
  jsx: "automatic", bundle: true, write: false, define: {"process.env.NODE_ENV": '"production"'},
});
const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), {from: cssPath});
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="75"><rect width="100" height="75" fill="blue"/></svg>';
const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true});
try {
  for (const [colorScheme, reducedMotion] of [["light", "no-preference"], ["dark", "no-preference"], ["dark", "reduce"]]) {
    const page = await browser.newPage({colorScheme, reducedMotion, viewport: {width: 390, height: 844}});
    const slow = Promise.withResolvers();
    const stale = Promise.withResolvers();
    await page.route("http://localhost:3000/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/slow.svg" || path === "/stale.svg") {
        await (path === "/slow.svg" ? slow : stale).promise;
        return route.fulfill({contentType: "image/svg+xml", body: svg});
      }
      if (path === "/broken.svg") return route.fulfill({status: 404, body: ""});
      return route.fulfill({contentType: "text/html", body: '<html data-visual-theme="smile-patrol"><main style="position:relative;width:100px;height:75px"></main></html>'});
    });
    await page.goto("http://localhost:3000/");
    await page.addStyleTag({content: css.css});
    await page.addScriptTag({content: bundle.outputFiles[0].text});
    const slot = page.locator("main");
    const bounds = await slot.boundingBox();
    const cover = page.locator(".hhwx-image-placeholder");
    const busy = page.getByRole("status", {name: "Loading card"});
    const show = src => page.evaluate(src => window.show(src), src);
    const settled = () => page.waitForFunction(() => getComputedStyle(document.querySelector(".hhwx-image-placeholder")).display === "none");

    await show(null);
    await busy.waitFor({state: "attached"});
    const original = await busy.elementHandle();
    await page.waitForFunction(() => getComputedStyle(document.querySelector("[aria-busy]")).opacity === "1");
    await show("/slow.svg");
    assert.ok(await cover.evaluate((el, first) => el === first, original), "Resolving the URL keeps the visible cover");
    assert.equal(await cover.evaluate(el => getComputedStyle(el).opacity), "1");
    assert.equal(await cover.evaluate(el => getComputedStyle(el, "::after").animationName === "none"), reducedMotion === "reduce");
    const recordReveal = () => cover.evaluate(el => {
      window.revealFrames = new Promise(resolve => {
        const frames = [];
        const sample = () => {
          frames.push(Number(getComputedStyle(el).opacity));
          if (getComputedStyle(el).display === "none") resolve(frames);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
    });
    const checkReveal = async () => {
      await settled();
      const frames = await page.evaluate(() => window.revealFrames);
      assert.equal(frames.some(value => value > 0 && value < 1), reducedMotion !== "reduce");
      assert.equal(await busy.count(), 0);
    };
    await recordReveal();
    slow.resolve();
    await checkReveal();

    const fastSrc = "data:image/svg+xml," + encodeURIComponent(svg);
    await Promise.all([page.waitForRequest("**/stale.svg"), show("/stale.svg")]);
    await show(fastSrc);
    await page.waitForFunction(() => document.querySelector("img").naturalWidth === 100);
    stale.resolve();
    assert.equal(await cover.evaluate(el => Number(getComputedStyle(el).opacity)), 0, "Fast replacement never flashes a cover");
    assert.equal(await page.locator("img").getAttribute("src"), fastSrc);
    const originalImage = await page.locator("img").elementHandle();
    await show(fastSrc);
    assert.ok(await page.locator("img").evaluate((el, first) => el === first, originalImage), "Same URL retains the loaded image");
    await page.evaluate(src => window.show(src, 1), fastSrc);
    await settled();
    assert.equal(await busy.count(), 0);
    for (const banner of [false, true]) {
      await page.evaluate(banner => window.show(null, 1, banner), banner);
      await page.waitForFunction(() => getComputedStyle(document.querySelector("[aria-busy]")).opacity === "1");
      await recordReveal();
      await page.evaluate(([src, banner]) => window.show(src, 1, banner), [fastSrc, banner]);
      if (banner) assert.equal(await cover.evaluate(el => getComputedStyle(el).zIndex), "1", "The warm banner stays behind the existing cover");
      await checkReveal();
    }
    await show("/broken.svg");
    await settled();
    assert.equal(await busy.count(), 0, "A failed request ends the loading state");
    assert.deepEqual(await slot.boundingBox(), bounds, "The slot keeps its dimensions through loading and failure");
    console.log("PASS", colorScheme, reducedMotion);
    await page.close();
  }
} finally { await browser.close(); }
