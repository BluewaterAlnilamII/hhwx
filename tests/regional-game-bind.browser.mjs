// Run against a local Next server with a synthetic Supabase session.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { installProfileSession, userId, user } from "./fixtures/profile-session.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.PROFILE_TEST_ORIGIN || "http://localhost:3000";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installProfileSession(context, process.env.NEXT_PUBLIC_SUPABASE_URL);
  let bindings = ["jp", "cn"].map(server => ({ server, gameUid: "12345", boundAt: "2026-01-01" }));
  const requests = [];
  const listReads = [];
  let challenge;
  let verificationCount = 0;
  await context.route("**/api/account/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const ok = data => route.fulfill({ json: { success: true, data } });
    if (path.endsWith("/auth-summary") || path.endsWith("/profile")) {
      return ok({ userId, username: "Fixture", publicUid: 10001, email: user.email, emailVerified: true,
        avatarCardId: 1, displayDegreeServer: 0, displayDegreeId: 100 });
    }
    if (path.endsWith("/bindings") || path.endsWith("/game-profiles")) {
      listReads.push(path);
      return ok(path.endsWith("/bindings") ? bindings : []);
    }
    if (path.endsWith("/challenge")) {
      const body = route.request().postDataJSON();
      challenge = body;
      requests.push(body);
      return ok({ ...body, id: "fixed-challenge", challenge: "hhwx000001", expiresAt: "2026-12-01" });
    }
    if (path.endsWith("/verify")) {
      requests.push(route.request().postDataJSON());
      const binding = { ...challenge, boundAt: verificationCount ? "2027-01-01T12:00:00Z" : "2026-11-20T12:00:00Z" };
      bindings = [binding, ...bindings.filter(b => b.server !== binding.server || b.gameUid !== binding.gameUid)];
      return ok({ ...binding, transferred: verificationCount++ === 0 });
    }
    if (path.endsWith("/bindings/12345")) {
      assert.equal(route.request().method(), "DELETE");
      const region = url.searchParams.get("server");
      requests.push(region);
      bindings = bindings.filter(b => b.server !== region);
    }
    return ok([]);
  });
  const page = await context.newPage();
  await page.goto(origin + "/en/bandori/game-profiles", { waitUntil: "domcontentloaded" });
  const unbind = page.getByRole("button", { name: "Unbind", exact: true });
  await unbind.nth(1).waitFor({ timeout: 90000 });
  assert.equal(await page.getByText("UID 12345", { exact: true }).count(), 2);
  assert.equal(await page.getByRole("button", { name: /Sync and create|Sync paused/ }).count(), 1);
  const initialReads = listReads.length;
  await page.getByRole("button", { name: "TW", exact: true }).click();
  await page.getByPlaceholder("Game UID").fill("18446744073709551615");
  await page.getByRole("button", { name: "Generate code" }).click();
  await page.getByText(/Verification code.*TW 18446744073709551615/i).waitFor();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: "I entered it, verify now" }).click();
  await page.getByText(/This UID was transferred/).waitFor();
  await page.getByText("UID 18446744073709551615", {exact: true}).waitFor();
  assert.deepEqual(requests, [{ server: "tw", gameUid: "18446744073709551615" }, { challengeId: "fixed-challenge" }]);
  await page.getByRole("button", { name: "JP", exact: true }).click();
  await page.getByPlaceholder("Game UID").fill("12345");
  await page.getByRole("button", { name: "Generate code" }).click();
  await page.getByRole("button", { name: "I entered it, verify now" }).click();
  await page.getByText("Binding succeeded.", {exact: true}).waitFor();
  await page.getByText(/Bound at:.*2027/).waitFor();
  assert.equal(await page.getByText("UID 12345", {exact: true}).count(), 2);
  assert.equal(await unbind.count(), 3);
  assert.equal(listReads.length, initialReads);
  page.once("dialog", async dialog => {
    assert.match(dialog.message(), /JP 12345/);
    await dialog.accept();
  });
  await unbind.first().click();
  await unbind.nth(2).waitFor({ state: "detached" });
  await page.getByText("UID 12345", {exact: true}).waitFor();
  assert.equal(await page.getByText("UID 12345", {exact: true}).count(), 1);
  assert.deepEqual(requests.slice(-1), ["jp"]);
  console.log("Four-server binding, fixed verification target, and same-UID unbind passed on mobile.");
} finally {
  await browser.close();
}
