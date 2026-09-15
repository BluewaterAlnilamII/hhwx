// Run with node tests/bandori-card-picker.browser.mjs. PLAYWRIGHT_MODULE may point
// to an existing Playwright installation; no account or live data is required.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const messages = Object.fromEntries(await Promise.all(["bandori", "common"].map(async (name) => (
  [name, JSON.parse(await readFile(resolve(root, `messages/en/${name}.json`), "utf8"))]
))));

// Exercise the actual page, picker, virtual grid, draft reducer and editor.
// Only external data, authentication and the surrounding Next.js shell are replaced.
const mocks = {
  "picker-test-data": `
    export const cards = Object.fromEntries(Array.from({length: 180}, (_, i) => [i + 1, {
      characterId: 1, rarity: 4, attribute: 'cool', type: 'permanent', levelLimit: 50,
      resourceSetName: 'res001001', prefix: [(i < 20 ? 'Other' : 'Picker') + ' card ' + (i + 1)], releasedAt: [100],
      serverExtensions: [{}, null, null, null], stat: {training: {levelLimit: 10}}
    }]));
    export const characters = {'1': {bandId: 1, nickname: ['Kasumi']}};
    export const skills = {};
    export const assetIndex = {schemaVersion: 2, resources: {}};
    export const noop = () => {};
  `,
  "next/dynamic": `import {createElement, lazy, Suspense} from 'react';
    export default (load) => { const Component = lazy(load);
      return (props) => createElement(Suspense, {fallback: null}, createElement(Component, props)); };`,
  "@/app/[locale]/account/AccountShell": `import {createElement} from 'react';
    export default ({children, title}) => createElement('main', null, createElement('h1', null, title), children);
    export const AccountErrorState = ({message}) => message;
    export const AccountLoadingState = ({message}) => message;
    export const AccountSignInState = () => 'Sign in';`,
  "@/app/[locale]/account/useAccountProfile": `import {noop} from 'picker-test-data';
    export const getAccessToken = async () => null;
    export const useLocalizedAccountProfile = () => ({userId: 'test', authReady: true,
      loadingProfile: false, profileError: '', loadProfile: noop});`,
  "@/lib/user-game-profile-local-store": `
    import {encodeBestdoriProfile} from '@/lib/bestdori-profile-codec';
    const payload = {bestdoriProfile: encodeBestdoriProfile({name: 'Test', server: 0, cards: [], items: {}, potentials: []})};
    export const isLocalGameProfileId = () => true;
    export class LocalGameProfileNotFoundError extends Error {}
    export const readLocalGameProfilePayload = async () => payload;
    export const updateLocalGameProfileCards = async () => { throw new Error('Unexpected persistence'); };`,
  "@/hooks/useBandoriCardsMaster": `import {cards, noop} from 'picker-test-data';
    export const useBandoriCardsMaster = () => ({data: cards, canonicalData: cards, loading: false, refresh: noop});`,
  "@/hooks/useBandoriCharactersMaster": `import {characters, noop} from 'picker-test-data';
    export const useBandoriCharactersMaster = () => ({data: characters, loading: false, refresh: noop});`,
  "@/hooks/useBandoriSkillsMaster": `import {skills, noop} from 'picker-test-data';
    export const useBandoriSkillsMaster = () => ({data: skills, loading: false, refresh: noop});`,
  "@/hooks/useBandoriPublicAssetIndex": `import {assetIndex, noop} from 'picker-test-data';
    export const useBandoriCardsAssetIndex = () => ({value: assetIndex, loading: false, refresh: noop});`,
  "@/store/useBandoriPreferencesStore": "export const useBandoriPreferredServer = () => 0;",
  "@/i18n/navigation": `import {createElement} from 'react';
    export const Link = (props) => createElement('a', props);
    const router = {push() {}};
    export const useRouter = () => router;`,
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env": '{"NODE_ENV":"development"}' },
  stdin: {resolveDir: root, loader: "tsx", contents: `
    import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl';
    import Page from './src/app/[locale]/bandori/game-profiles/[profileId]/cards/page';
    const params = Promise.resolve({profileId: 'local_picker_test'});
    createRoot(document.getElementById('root')).render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={${JSON.stringify(messages)}}>
        <Page params={params} />
      </NextIntlClientProvider>);
  `},
  plugins: [{name: "external-test-data", setup(builder) {
    builder.onResolve({filter: /.*/}, ({path}) => Object.hasOwn(mocks, path) ? {path, namespace: "mock"} : undefined);
    builder.onLoad({filter: /.*/, namespace: "mock"}, ({path}) => ({contents: mocks[path], resolveDir: root}));
  }}],
});
const cssPath = resolve(root, "src/app/globals.css");
const css = await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), {from: cssPath});
const server = createServer((request, response) => {
  if (request.url === "/app.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(bundle.outputFiles[0].text);
  } else if (request.url === "/app.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(css.css);
  } else if (request.url === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html lang="en" data-visual-theme="smile-patrol"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Card picker regression</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');
  } else {
    // Asset artwork is outside this interaction regression; keep requests local.
    response.setHeader("Content-Type", "image/svg+xml");
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76"><rect width="76" height="76" fill="#bcd"/></svg>');
  }
});
await new Promise((done) => server.listen(0, "localhost", done));
const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true});
try {
  for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
    const page = await browser.newPage({viewport, isMobile: viewport.width < 640, hasTouch: viewport.width < 640});
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
    page.on("console", (message) => { if (["error", "warning"].includes(message.type())) { errors.push(message.text()); console.error(message.text()); } });
    await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.fulfill({status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76"/>'}));
    await page.goto(`http://localhost:${server.address().port}`);
    await page.getByRole("button", {name: messages.bandori.gameProfiles.cards.draftActions.addCard, exact: true}).click();
    const picker = page.getByRole("dialog", {name: messages.bandori.gameProfiles.cards.picker.title, exact: true});
    const search = picker.locator('input').first();
    await search.fill("Picker");
    await search.press("Enter");
    await picker.getByText("160 cards", {exact: true}).waitFor();
    await picker.getByRole("combobox", {name: messages.bandori.cardFilters.rows.sort}).selectOption("release_jp");
    // Let the deferred filter and virtual grid settle before expanding results.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await picker.getByRole("button", {name: messages.bandori.cardFilters.attributes.powerful, exact: true}).click();
    await picker.getByRole("button", {name: messages.bandori.cardPicker.actions.showAll, exact: true}).click();
    await picker.getByRole("button", {name: messages.bandori.cardPicker.actions.showAll, exact: true}).waitFor({state: 'detached'});
    // Select a card beyond the initial 60 results after scrolling the virtual grid.
    await picker.locator(':scope > .overflow-y-auto').evaluate((element) => { element.scrollTop = element.scrollHeight * 0.6; });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-card-id]')].some((element) => Number(element.dataset.cardId) < 120));
    const buttons = picker.locator('[data-card-id]');
    const cardId = await buttons.nth(Math.floor(await buttons.count() / 2)).getAttribute('data-card-id');
    assert.ok(Number(cardId) < 121, 'Selection comes from expanded results');
    const target = picker.locator(`[data-card-id="${cardId}"]`);
    await target.scrollIntoViewIfNeeded();
    const snapshot = await picker.evaluate((element) => {
      window.pickerBefore = element;
      window.pickerScrollerBefore = element.querySelector('.overflow-y-auto');
      return window.pickerScrollerBefore.scrollTop;
    });
    for (const action of ["cancel", "add", "edit", "escape", "overlay"]) {
      if (viewport.width < 640) await target.tap();
      else await target.click();
      const editor = page.locator('[role="dialog"][data-state="open"]').nth(1);
      await editor.waitFor();
      assert.equal(await page.locator('[role="dialog"][data-state="open"]').count(), 2, "Picker stays mounted during editing");
      if (action === "add") {
        await editor.getByRole("button", {name: messages.bandori.gameProfiles.cards.draftActions.add, exact: true}).click();
      } else if (action === "edit") {
        await editor.getByRole("combobox", {name: messages.bandori.cardEditor.fields.level}).selectOption("20");
        await editor.getByRole("button", {name: messages.bandori.gameProfiles.cards.draftActions.apply, exact: true}).click();
      } else if (action === "escape") {
        assert.equal(await editor.getByRole("combobox", {name: messages.bandori.cardEditor.fields.level}).inputValue(), "20");
        await page.keyboard.press("Tab");
        assert.equal(await editor.evaluate((element) => element.contains(document.activeElement)), true, "Focus stays inside the top modal");
        await page.keyboard.press("Escape");
      } else if (action === "overlay") {
        await page.mouse.click(3, 3);
      } else {
        await editor.getByRole("button", {name: messages.bandori.cardEditor.actions.cancel, exact: true}).click();
      }
      await editor.waitFor({state: "detached"});
      await page.waitForFunction((id) => document.activeElement?.getAttribute("data-card-id") === id, cardId);
      assert.equal(await search.inputValue(), "Picker");
      assert.equal(await picker.getByRole("combobox", {name: messages.bandori.cardFilters.rows.sort}).inputValue(), "release_jp");
      assert.equal(await picker.getByRole("button", {name: messages.bandori.cardFilters.attributes.powerful, exact: true}).getAttribute("aria-pressed"), "false");
      assert.equal(await picker.evaluate((element) => element === window.pickerBefore), true);
      assert.equal(await picker.evaluate((element) => element.querySelector('.overflow-y-auto') === window.pickerScrollerBefore), true);
      assert.ok(Math.abs(await picker.locator(':scope > .overflow-y-auto').evaluate((element) => element.scrollTop) - snapshot) < 2, "Scroll position is preserved");
      assert.equal(await picker.getByRole("button", {name: messages.bandori.cardPicker.actions.showAll, exact: true}).count(), 0, "Expanded results stay expanded");
    }
    if (process.env.PICKER_SCREENSHOT_DIR) {
      await mkdir(process.env.PICKER_SCREENSHOT_DIR, {recursive: true});
      await page.screenshot({path: resolve(process.env.PICKER_SCREENSHOT_DIR, `picker-${viewport.width}.png`)});
    }
    await picker.getByRole("button", {name: messages.bandori.gameProfiles.cards.picker.close, exact: true}).click();
    await picker.waitFor({state: "detached"});
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
    await page.getByText("Unsaved: 1 added · 0 changed · 0 removed", {exact: true}).waitFor();
    await page.getByRole("button", {name: messages.bandori.gameProfiles.cards.draftActions.addCard, exact: true}).click();
    await picker.waitFor();
    assert.equal(await search.inputValue(), "", "Explicit close ends the browsing session");
    assert.equal(await picker.getByRole("combobox", {name: messages.bandori.cardFilters.rows.sort}).inputValue(), "id");
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}x${viewport.height}: add, cancel, edit, Escape, overlay, retained state/scroll/focus, explicit close`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
