import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { CommentContent } from "../src/components/comments/CommentContent.tsx";
import { getChatMessageLayout, formatChatTime } from "../src/lib/chat/chat-presentation.ts";
import { buildEmojiShortcode, insertCommentShortcode } from "../src/lib/comments/comment-content.ts";

const message = (userId, time) => ({ author: { userId }, createdAt: time });
// Match the CJS context used by TSX when loading the project's TS components.
const { NextIntlClientProvider } = createRequire(import.meta.url)("next-intl");
const render = (content) => renderToStaticMarkup(createElement(NextIntlClientProvider,
  { locale: "en", timeZone: "UTC", messages: { comments: { states: { deleted: "Deleted" } } } },
  createElement(CommentContent, { content, isDeleted: false, className: "mt-0" })));

test("chat shares identity within an author group and time across authors, with five-minute and day breaks", () => {
  const messages = [
    message("a", "2026-10-24T10:00:00"), message("a", "2026-10-24T10:01:00"),
    message("b", "2026-10-24T10:02:00"), message("b", "2026-10-24T10:07:00"),
    message("b", "2026-10-25T00:00:00"),
  ];
  assert.deepEqual(getChatMessageLayout(messages).map(({ showTime, showAuthor }) => [showTime, showAuthor]),
    [[true, true], [false, false], [false, true], [true, true], [true, true]]);
});

test("chat times distinguish today, yesterday, earlier dates and previous years in the local calendar", () => {
  const now = new Date(2026, 9, 24, 15);
  assert.equal(formatChatTime("2026-10-24T14:20:00", "zh-CN", "昨天", now), "14:20");
  assert.equal(formatChatTime("2026-10-23T14:20:00", "zh-CN", "昨天", now), "昨天 14:20");
  assert.match(formatChatTime("2026-10-20T14:20:00", "zh-CN", "昨天", now), /10月20日 14:20/);
  assert.match(formatChatTime("2025-10-20T14:20:00", "zh-CN", "昨天", now), /2025年10月20日 14:20/);
});

test("the shared picker inserts at the selection and preserves the rest of the draft", () => {
  const { nextValue, nextCursor } = insertCommentShortcode("你好 世界", buildEmojiShortcode("KokoroYay"), 3, 5);
  assert.equal(nextValue, "你好 :KokoroYay: ");
  assert.equal(nextCursor, nextValue.length);
});

test("chat and comments share inline and jumbo emoji rendering, with no stamp resolution in chat", () => {
  const inline = render("你好 :KokoroYay:");
  assert.match(inline, /src="\/res\/emoji\/KokoroYay.png"/);
  assert.match(inline, /width="24"/);
  const jumbo = render(":KokoroYay: :KanonJii:");
  assert.equal((jumbo.match(/<img /g) ?? []).length, 2);
  assert.match(jumbo, /width="48"/);
  assert.match(jumbo, /\/res\/emoji\/KanonJii.webp/);
  const unknown = render(":stamp-jp-1: :unknown: <script>unsafe</script>");
  assert.doesNotMatch(unknown, /<img|<script>/);
  assert.match(unknown, /:stamp-jp-1: :unknown: &lt;script&gt;/);
});

function viewerHarness() {
  const listeners = new Map(), captures = new Set(), updates = [];
  let closes = 0, captureCalls = 0;
  class Element { closest() { return null; } }
  const image = Object.assign(new Element(), { complete: true, naturalWidth: 200, naturalHeight: 200 });
  const viewport = Object.assign(new Element(), {
    clientWidth: 100, clientHeight: 100,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
    setPointerCapture: (id) => { captures.add(id); captureCalls++; },
    hasPointerCapture: (id) => captures.has(id), releasePointerCapture: (id) => captures.delete(id),
  });
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: { useState: (initial) => [initial, (value) => updates.push(value)], useRef: (current) => ({ current }),
      useCallback: (fn) => fn, useLayoutEffect: (fn) => fn() },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@radix-ui/react-dialog": {}, "lucide-react": {},
    "next-intl": { useTranslations: () => (key) => key }, "@/components/LoadingIndicator": {},
  };
  const exports = {};
  const source = readFileSync(new URL("../src/components/ImageViewer.tsx", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: (name) => dependencies[name], Element,
    ResizeObserver: class { observe() {} disconnect() {} }, getComputedStyle: () => ({ width: "200px", height: "200px" }) });
  const tree = exports.default({ src: "blob:original", label: "Image", labels: {}, onClose: () => closes++ });
  const nodes = [];
  function visit(node) { if (Array.isArray(node)) node.forEach(visit); else if (node?.props) { nodes.push(node); visit(node.props.children); } }
  visit(tree);
  const releaseImage = nodes.find((node) => node.type === "img").props.ref(image);
  const releaseGestures = nodes.find((node) => node.type === "div" && node.props.ref).props.ref(viewport);
  return { image, viewport, updates, captures, listeners,
    get closes() { return closes; }, get captureCalls() { return captureCalls; },
    emit(type, target = image, extra = {}) {
      const event = { type, target, button: 0, pointerId: 1, pointerType: "touch", clientX: 50, clientY: 50,
        defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
      listeners.get(type)?.(event); return event;
    },
    dispose() { releaseGestures(); releaseImage(); },
  };
}

test("image viewer preserves native image actions and stays open after image taps or context-menu dismissal", () => {
  const h = viewerHarness();
  h.emit("pointerdown"); assert.equal(h.captureCalls, 0);
  h.emit("pointerup"); h.emit("click"); assert.equal(h.closes, 0);
  h.emit("pointerdown"); const menu = h.emit("contextmenu"); assert.equal(menu.defaultPrevented, false);
  h.emit("pointerup"); h.emit("click", h.viewport); assert.equal(h.closes, 0);
  h.emit("pointerdown", h.viewport); h.emit("pointerup", h.viewport); h.emit("click", h.viewport);
  assert.equal(h.closes, 1, "a fresh background tap closes normally");
  h.dispose(); assert.equal(h.listeners.size, 0);
});

test("viewer mouse capture starts only when dragging; drag release does not close", () => {
  const h = viewerHarness();
  h.emit("pointerdown", h.image, { pointerType: "mouse" }); assert.equal(h.captureCalls, 0);
  h.emit("pointermove", h.image, { pointerType: "mouse", clientX: 53 }); assert.equal(h.captureCalls, 0);
  h.emit("pointermove", h.image, { pointerType: "mouse", clientX: 70 }); assert.equal(h.captureCalls, 1);
  assert.ok(h.updates.some((value) => value.x > 0));
  h.emit("pointerup", h.viewport, { pointerType: "mouse" }); h.emit("click", h.viewport);
  assert.equal(h.closes, 0); assert.equal(h.captures.size, 0); h.dispose();
});

test("viewer retains pinch zoom and stops the gesture for native context menus", () => {
  const h = viewerHarness();
  h.emit("pointerdown", h.image, { clientX: 30 });
  h.emit("pointerdown", h.image, { pointerId: 2, clientX: 70 });
  h.emit("pointermove", h.image, { pointerId: 2, clientX: 90 });
  assert.ok(h.updates.some((value) => value.zoom > 1)); assert.equal(h.captureCalls, 0);
  h.emit("contextmenu"); const count = h.updates.length;
  h.emit("pointermove", h.image, { pointerId: 2, clientX: 95 }); assert.equal(h.updates.length, count);
  h.dispose();
});


test('a deliberate reply starts an author group while its ordinary continuation stays grouped',()=>{
  const author={userId:'same'},base={author,createdAt:new Date().toISOString()};
  const rows=getChatMessageLayout([{...base,id:'a'},{...base,id:'b',reply:{id:'target',deleted:true}},{...base,id:'c'}]);
  assert.deepEqual(rows.map(r=>r.showAuthor),[true,true,false]);
});
