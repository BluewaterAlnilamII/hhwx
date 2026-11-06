import assert from "node:assert/strict";
import test from "node:test";
import { observeEventKeyboardViewport } from "../src/app/[locale]/bandori/events/useEventKeyboardViewport.ts";

class Events {
  listeners = new Map();
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, target = this) { this.listeners.get(type)?.forEach(callback => callback({ type, target })); }
}

function browser(context) {
  class Element {
    constructor(kind, body = null) { this.kind = kind; this.body = body; }
    scrollTop = 24;
    isConnected = true;
    matches() { return this.kind === "input"; }
    closest(selector) {
      if (selector === ".event-pt-calculator-fields") return this.body;
      if (selector === "[role=dialog]") return this.body;
      return this;
    }
  }
  const frames = new Map();
  const timers = new Map();
  let sequence = 0;
  const styles = new Map();
  const attributes = new Set();
  const viewport = Object.assign(new Events(), { height: 800, width: 390, scale: 1, offsetTop: 0 });
  const doc = Object.assign(new Events(), {
    documentElement: {
      style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
      toggleAttribute: (key, on) => on ? attributes.add(key) : attributes.delete(key),
      removeAttribute: key => attributes.delete(key),
    },
    getElementById: () => null,
  });
  const win = Object.assign(new Events(), {
    visualViewport: viewport, innerHeight: 800, scrollX: 0, scrollY: 140,
    matchMedia: () => ({ matches: false }),
    scrollTo: ({ left, top }) => { win.scrollX = left; win.scrollY = top; },
    setTimeout: callback => { const id = ++sequence; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const globals = {
    window: win, document: doc, HTMLElement: Element,
    requestAnimationFrame: callback => { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const originals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.entries(globals).forEach(([key, value]) => Object.defineProperty(globalThis, key, { configurable: true, value }));
  context.after(() => Object.entries(originals).forEach(([key, descriptor]) => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }));
  const cleanup = observeEventKeyboardViewport();
  const flush = map => { const callbacks = [...map.values()]; map.clear(); callbacks.forEach(callback => callback()); };
  const resize = (height, offsetTop = 0) => {
    viewport.height = height; viewport.offsetTop = offsetTop;
    viewport.emit("resize"); flush(frames);
  };
  return { Element, doc, win, viewport, styles, attributes, cleanup, resize, settle: () => flush(timers) };
}

test("keyboard close restores page and planner scroll, including dismissal while input retains focus", context => {
  const b = browser(context);
  const body = new b.Element("body");
  const input = new b.Element("input", body);
  b.doc.emit("pointerdown", input);
  b.win.scrollY = 210;
  b.doc.emit("focusin", input);
  b.resize(400, 80);
  assert.equal(b.styles.get("--event-viewport-bottom"), "320px");
  assert.ok(b.attributes.has("data-event-keyboard"));
  body.scrollTop = 180;
  b.win.scrollY = 450;
  b.resize(800);
  b.settle();
  assert.equal(b.win.scrollY, 140);
  assert.equal(body.scrollTop, 24);
  assert.ok(!b.attributes.has("data-event-keyboard"));
  b.cleanup();
});

test("deliberate page and form scrolling are preserved", context => {
  const b = browser(context);
  const body = new b.Element("body");
  const input = new b.Element("input", body);
  b.doc.emit("pointerdown", input);
  b.resize(400);
  b.doc.emit("touchmove", input);
  b.doc.emit("touchmove", new b.Element("page"));
  body.scrollTop = 180; b.win.scrollY = 450;
  b.resize(800); b.settle();
  assert.equal(body.scrollTop, 180);
  assert.equal(b.win.scrollY, 450);
  b.cleanup();
});

test("switching fields preserves form position but restores background; viewport jitter does not restore early", context => {
  const b = browser(context);
  const body = new b.Element("body");
  b.doc.emit("pointerdown", new b.Element("input", body));
  b.resize(400);
  b.doc.emit("focusin", new b.Element("input", body));
  body.scrollTop = 180; b.win.scrollY = 450;
  b.resize(800); b.resize(400); b.settle();
  assert.equal(b.win.scrollY, 450);
  b.resize(800); b.settle();
  assert.equal(body.scrollTop, 180);
  assert.equal(b.win.scrollY, 140);
  b.cleanup();
});

test("browser chrome resizing and orientation changes do not restore an obsolete position", context => {
  const b = browser(context);
  b.doc.emit("focusin", new b.Element("input"));
  b.resize(740); b.win.scrollY = 260; b.resize(800); b.settle();
  assert.equal(b.win.scrollY, 260);
  b.resize(400);
  b.viewport.width = 800;
  b.resize(390); b.settle();
  assert.equal(b.win.scrollY, 260);
  assert.ok(!b.attributes.has("data-event-keyboard"));
  b.cleanup();
});

test("unmount cancels pending restoration and releases viewport listeners and styles", context => {
  const b = browser(context);
  b.doc.emit("focusin", new b.Element("input"));
  b.resize(400); b.win.scrollY = 450; b.resize(800);
  b.cleanup(); b.settle();
  assert.equal(b.win.scrollY, 450);
  assert.equal(b.styles.size, 0);
  assert.equal(b.attributes.size, 0);
  assert.equal([...b.viewport.listeners.values()].reduce((total, set) => total + set.size, 0), 0);
});
