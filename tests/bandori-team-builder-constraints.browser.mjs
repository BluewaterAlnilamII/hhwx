// Run against a production build with BASE_URL=http://localhost:3000 node --import tsx tests/bandori-team-builder-constraints.browser.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { getGameProfileCards, replaceGameProfileCards, encodeCompressedGameProfilePayload } from "../src/lib/user-game-profile-payload.ts";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = new URL(process.env.BASE_URL || "http://localhost:3000").origin;
assert.equal(new URL(origin).hostname, "localhost", "Use a local candidate build");
require("@next/env").loadEnvConfig(process.cwd());
const authKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const fixture = JSON.parse(await readFile(new URL("./fixtures/bandori-medley-foundation-source-v1.json", import.meta.url), "utf8"));
const profile = replaceGameProfileCards(fixture.profilePayload, getGameProfileCards(fixture.profilePayload).slice(0, 5));
const compressed = await encodeCompressedGameProfilePayload(profile);
const user = { id: "12345678-1234-4123-8123-123456789012", email: "fixture@example.invalid",
  aud: "authenticated", role: "authenticated", user_metadata: {}, app_metadata: {} };
const account = { userId: user.id, username: "Fixture", email: user.email, emailVerified: true };
const api = new Map([
  ["/api/account/auth-summary", account], ["/api/account/profile", account],
  ["/api/account/game-profiles", [{ id: "fixture", name: "Fixture", server: "cn", cardCount: 5, updatedAt: "2026-01-01T00:00:00Z" }]],
  ["/api/account/game-profiles/fixture/payload", { compressed }],
  ["/api/bandori/master/events", { 1: { eventType: "story", eventName: "Fixture" } }],
  ["/api/bandori/master/music", fixture.songsById],
  ["/api/bandori/master/cards", fixture.cardsById],
  ["/api/bandori/master/characters", { payload: fixture.charactersById }],
  ["/api/bandori/master/characters/main", { payload: fixture.charactersById }],
  ["/api/bandori/master/skills", { payload: fixture.skillsById }],
  ["/api/bandori/master/areaItems", { payload: fixture.areaItemsById }],
  ["/api/bandori/charts/1/expert", { chart: fixture.songs[0].chart }],
]);
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true,
  args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost"] });
try {
  const context = await browser.newContext({ locale: "zh-CN", serviceWorkers: "block",
    permissions: ["clipboard-read", "clipboard-write"] });
  const wasmResponses = [];
  context.on("response", response => {
    if (new URL(response.url()).pathname.endsWith(".wasm") && response.ok()) wasmResponses.push(response.url());
  });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && api.has(url.pathname)) {
      return route.fulfill({ json: { success: true, data: api.get(url.pathname) } });
    }
    if (url.origin === origin && (url.pathname === "/bandori/teambuilder" || url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/res/"))) {
      return route.continue();
    }
    return route.abort();
  });
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const jwtPart = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = [jwtPart({ alg: "HS256", typ: "JWT" }), jwtPart({ sub: user.id, exp: expires, aud: "authenticated" }), "Zml4dHVyZQ"].join(".");
  await context.addInitScript(({ authKey, user, token, expires }) => {
    localStorage.setItem(authKey, JSON.stringify({ access_token: token, refresh_token: "fixture", token_type: "bearer", expires_at: expires, expires_in: 3600, user }));
    const prefs = "hhwx-bandori-teambuilder-live-preferences:v1";
    if (!localStorage.getItem(prefs)) localStorage.setItem(prefs, JSON.stringify({
      songId: "1", difficulty: "expert", liveType: "free",
      otherPlayers: Array(4).fill({ skillId: "1", skillLevel: "1", conditionSatisfied: true }),
    }));
    window.searches = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...args) {
      if (message.type === "search") {
        const observation = { constraints: message.calculation.constraints ?? {}, status: null };
        window.searches.push(observation);
        const observe = ({ data }) => {
          if (data.requestId === message.requestId && data.type === "search") {
            observation.status = data.ok ? data.result.status : "error";
            this.removeEventListener("message", observe);
          }
        };
        this.addEventListener("message", observe);
      }
      return post.call(this, message, ...args);
    };
  }, { authKey, user, token, expires });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const calculate = page.getByRole("button", { name: "计算", exact: true });
  const power = page.getByRole("textbox", { name: "最低综合力" });
  const leader = page.getByRole("textbox", { name: "最低队长技能倍率" });
  const submit = calculate.nth(1);
  const noTeam = page.getByRole("status").filter({ hasText: "没有符合条件的队伍" });
  const resultHeading = page.getByRole("heading", { name: "结果", exact: true });
  async function search(expected, hasTeam) {
    const index = await page.evaluate(() => window.searches.length);
    await submit.click();
    await page.waitForFunction(i => window.searches[i]?.status, index);
    assert.deepEqual(await page.evaluate(i => window.searches[i], index), { constraints: expected, status: "exact" });
    if (hasTeam) {
      await resultHeading.waitFor();
      assert.equal(await noTeam.count(), 0);
    } else {
      await noTeam.waitFor();
      assert.equal((await noTeam.textContent()).trim(), "没有符合条件的队伍");
      assert.equal(await resultHeading.count(), 0);
    }
  }
  async function openCalculate() {
    await calculate.first().click();
    await power.waitFor();
  }
  try {
    await page.goto(`${origin}/bandori/teambuilder`);
    await openCalculate();
    await power.pressSequentially("50000");
    assert.equal(await power.inputValue(), "50,000");
    await power.press("Home");
    await power.press("1");
    assert.equal(await power.inputValue(), "150,000");
    assert.equal(await power.evaluate(input => input.selectionStart), 1);
    await power.press("Backspace");
    assert.equal(await power.inputValue(), "50,000");
    await search({ minTotalPower: 50000 }, false);
    await power.fill("");
    await search({}, true);

    await page.evaluate(() => navigator.clipboard.writeText("50,000"));
    await power.focus();
    await power.press("Control+v");
    assert.equal(await power.inputValue(), "50,000");
    await search({ minTotalPower: 50000 }, false);
    await page.reload();
    await openCalculate();
    assert.equal(await power.inputValue(), "50,000");
    await search({ minTotalPower: 50000 }, false);

    for (const field of [power, leader]) {
      await field.fill("12.5");
      assert.equal(await field.getAttribute("aria-invalid"), "true");
      assert.equal(await submit.isDisabled(), true);
      await field.press("Enter");
      assert.equal((await page.locator("#team-builder-threshold-error").textContent()).trim(), "请输入有效的非负整数");
      assert.equal(await page.evaluate(() => window.searches.length), 1);
      await field.fill("");
    }
    await search({}, true);
    await leader.pressSequentially("50000");
    assert.equal(await leader.inputValue(), "50,000");
    await search({ minLeaderScoreUpPercent: 50000 }, false);

    api.set("/api/bandori/charts/1/expert", { chart: [...fixture.songs[0].chart, { type: "Single", beat: 2 ** 36 }] });
    await page.reload();
    await openCalculate();
    await leader.fill("");
    await submit.click();
    await page.getByText("音符时间超出范围", { exact: true }).waitFor();
    assert.equal(await page.getByText("谱面最多支持 16,384 个计分音符", { exact: true }).count(), 0);
    assert.ok(wasmResponses.length, "A real Worker loaded the candidate WASM");
    console.log("Verified threshold editing, persistence, exact results and the rejected note time with the candidate Worker/WASM.");
  } catch (error) {
    console.error((await page.locator("body").innerText()).slice(-2500));
    throw error;
  }
} finally {
  await browser.close();
}
