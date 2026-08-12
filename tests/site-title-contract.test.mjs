import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildSiteMetadataTitle,
  formatSiteDocumentTitle,
  SITE_BRAND,
} from "../src/lib/site-brand.ts";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"));
}

test("the shared document title formatter owns the HHWX suffix", () => {
  assert.equal(SITE_BRAND, "HHWX");
  assert.equal(formatSiteDocumentTitle(""), "HHWX");
  assert.equal(formatSiteDocumentTitle("HHWX"), "HHWX");
  assert.equal(formatSiteDocumentTitle("卡牌图鉴"), "卡牌图鉴 - HHWX");
  assert.deepEqual(buildSiteMetadataTitle("卡牌图鉴"), { absolute: "卡牌图鉴 - HHWX" });
});

test("localized metadata keeps page names separate from the shared brand suffix", async () => {
  const [zh, en] = await Promise.all([
    readJson("messages/zh-CN/metadata.json"),
    readJson("messages/en/metadata.json"),
  ]);

  assert.equal(zh.calendar.title, "国服活动日历");
  assert.equal(zh.eventtracker.eventTitle, "{eventId}期 - {eventName} 活动追踪");
  assert.equal(zh.cards.detailTitle, "{characterName} - {cardName} 卡牌图鉴");
  assert.equal(zh.gameProfiles.title, "游戏档案");
  assert.equal(zh.teamBuilder.title, "组队计算器");
  assert.equal(en.calendar.title, "CN Event Calendar");
  assert.equal(en.eventtracker.eventTitle, "Event {eventId} - {eventName} Event Tracker");
  assert.equal(en.cards.detailTitle, "{characterName} - {cardName} Card Catalog");
});

test("the Chinese sidebar calls the tracker entry activity tracking", async () => {
  const navigation = await readJson("messages/zh-CN/navigation.json");
  assert.equal(navigation.items.tracker, "活动追踪");
});
