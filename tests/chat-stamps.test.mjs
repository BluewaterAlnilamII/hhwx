import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ChatStampPlayback, chatStampPlayer, placeChatStamp } from "../src/lib/chat/chat-stamps.ts";

const stamp = { id: 1, region: "cn", kind: "normal", imageName: "stamp001", characterId: 1, imageUrl: "/stamp.png", voiceUrl: "" };
const event = (userId, id = userId) => ({ id, userId, publicUid: 10001, username: userId, stamp });

test("stamp names fit measured width before animation, respect the minimum and reset after resizing", () => {
  const exports = {};
  const source = readFileSync(new URL("../src/components/chat/ChatStampLayer.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(`${source}\nexport { fitStampName };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const plate = { clientWidth: 120, fontSize: "11px", paddingLeft: "8px", paddingRight: "8px" };
  runInNewContext(code, { exports, getComputedStyle: () => plate,
    require: () => ({ memo: (component) => component, buildBandoriChatStampResources: () => ({}) }) });
  let naturalWidth = 110;
  const text = { parentElement: plate, style: { fontSize: "" },
    get scrollWidth() { return Math.ceil(naturalWidth * parseFloat(this.style.fontSize || plate.fontSize) / parseFloat(plate.fontSize)); },
    getBoundingClientRect() { throw new Error("entrance transforms must not affect fitting"); } };
  exports.fitStampName(text);
  assert.equal(text.style.fontSize, "10.3px", "ten 11px-wide glyphs fit the 104px mobile text area");
  assert.ok(text.scrollWidth <= 104);
  exports.fitStampName(text); assert.equal(text.style.fontSize, "10.3px", "repeated measurement does not shrink cumulatively");
  naturalWidth = 264; exports.fitStampName(text); assert.equal(text.style.fontSize, "9px", "very long names keep a readable lower bound");
  naturalWidth = 40; exports.fitStampName(text); assert.equal(text.style.fontSize, "", "short names return to the default font");
  plate.clientWidth = 144; plate.fontSize = "11.5px"; naturalWidth = 115;
  exports.fitStampName(text); assert.equal(text.style.fontSize, "", "the same ten glyphs fit the desktop default size");
});

test("atlas loading shares concurrent requests without retaining completed images", async () => {
  const images = [], exports = {};
  const source = readFileSync(new URL("../src/components/bandori/BandoriAtlasAnimationCanvas.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(`${source}\nexport { loadAtlasImage };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, require: () => ({}), window: { Image: class { constructor() { images.push(this); } } } });
  const first = exports.loadAtlasImage("/atlas.png");
  assert.equal(exports.loadAtlasImage("/atlas.png"), first);
  assert.equal(images.length, 1);
  images[0].onload(); const playing = await first;
  const second = exports.loadAtlasImage("/atlas.png");
  assert.equal(images.length, 2, "later loads rely on the browser cache, not a retained image object");
  assert.equal(playing.src, "/atlas.png", "finishing a load does not invalidate an image still in use");
  images[1].onload(); await second;
  const failed = exports.loadAtlasImage("/retry.png");
  images[2].onerror(); await assert.rejects(failed, /Failed to load/);
  const retry = exports.loadAtlasImage("/retry.png");
  assert.equal(images.length, 4);
  images[3].onload(); await retry;
});
function player(context) {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  const signals = [];
  const playback = new ChatStampPlayback((_event, signal) => {
    signals.push(signal);
    return new Promise(() => {});
  });
  context.after(() => playback.clear());
  return { playback, signals };
}

test("newest stamp replaces only that sender and restarts its lifetime", (context) => {
  const { playback, signals } = player(context);
  playback.play(event("a")); playback.play(event("b"));
  context.mock.timers.tick(1500);
  playback.play(event("a", "a2"));
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  assert.deepEqual(playback.getSnapshot().map(e => e.id), ["b", "a2"]);
  context.mock.timers.tick(1700);
  assert.deepEqual(playback.getSnapshot().map(e => e.id), ["a2"]);
  context.mock.timers.tick(1500);
  assert.equal(playback.getSnapshot().length, 0);
});

test("sixth sender evicts oldest immediately, without queuing or a receiver rate gate", (context) => {
  const { playback, signals } = player(context);
  for (let i = 1; i <= 6; i++) playback.play(event(String(i)));
  assert.deepEqual(playback.getSnapshot().map(e => e.id), ["2", "3", "4", "5", "6"]);
  assert.equal(signals[0].aborted, true);
  playback.play(event("3", "new3"));
  assert.equal(signals[1].aborted, false);
  assert.deepEqual(playback.getSnapshot().map(e => e.id), ["2", "4", "5", "6", "new3"]);
});

test("visual expiry preserves voice tails; replacement and closing stop them", (context) => {
  const { playback, signals } = player(context);
  playback.play(event("a")); playback.play(event("b"));
  context.mock.timers.tick(3200);
  assert.equal(playback.getSnapshot().length, 0);
  assert.equal(signals[0].aborted, false);
  playback.play(event("a", "again"));
  assert.equal(signals[0].aborted, true);
  playback.clear();
  assert.equal(signals.every(s => s.aborted), true);
  context.mock.timers.tick(10000);
  assert.equal(playback.getSnapshot().length, 0);
});

test("duplicate current event does not restart playback", (context) => {
  const { playback, signals } = player(context);
  playback.play(event("a"));
  const before = playback.getSnapshot();
  playback.play(event("a"));
  assert.equal(playback.getSnapshot(), before);
  assert.equal(signals.length, 1);
});

test("complete composition fits desktop, mobile, keyboard and tiny viewports", () => {
  for (const area of [{ width: 672, height: 620 }, { width: 390, height: 500 }, { width: 390, height: 120 }, { width: 75, height: 50 }, { width: 0, height: 0 }]) {
    for (const size of [{ width: 144, height: 126 }, { width: 120, height: 106 }]) {
      for (const point of [0, .5, 1]) {
        const p = placeChatStamp(area, size, point, point);
        assert.ok(p.left >= 0 && p.top >= 0);
        assert.ok(p.left + size.width * p.scale <= area.width + .001);
        assert.ok(p.top + size.height * p.scale <= area.height + .001);
        assert.ok(p.scale <= 1);
      }
    }
  }
  assert.deepEqual([10001, 10002, 10003, 10004, 10005].map(chatStampPlayer), [1, 2, 3, 4, 5]);
});
