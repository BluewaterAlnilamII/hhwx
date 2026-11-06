import assert from "node:assert/strict";
import test from "node:test";
import { bindTrackerChartPointer } from "../src/app/[locale]/bandori/events/_tracker/tracker-chart-pointer.ts";

class Events {
  listeners = new Map();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, properties = {}) {
    const event = { type, target: this, pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: 150, clientY: 90, ...properties };
    this.listeners.get(type)?.forEach(fn => fn(event));
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

function chart(context) {
  const view = new Events();
  const document = Object.assign(new Events(), { defaultView: view });
  const captures = new Set();
  const layer = Object.assign(new Events(), {
    ownerDocument: document,
    getBoundingClientRect: () => ({ left: 100, top: 50 }),
    contains: target => target === layer,
    setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture: id => captures.delete(id),
  });
  let selection = null;
  let updates = 0;
  const cleanup = bindTrackerChartPointer(layer, {
    onPoint: (x, y, contact) => { selection = { x, y, contact }; updates++; },
    onClear: () => { selection = null; },
  });
  context.after(cleanup);
  return { layer, document, view, captures, cleanup, get selection() { return selection; }, get updates() { return updates; } };
}

test("mouse hover reads a point and clears on leaving", context => {
  const c = chart(context);
  c.layer.emit("pointermove", { pointerType: "mouse" });
  assert.deepEqual(c.selection, { x: 50, y: 40, contact: false });
  c.layer.emit("pointerleave", { pointerType: "mouse" });
  assert.equal(c.selection, null);
  c.layer.emit("pointerdown", { pointerType: "mouse", button: 2 });
  assert.equal(c.selection, null);
});

test("touch tracks both axes, keeps the release point, and dismisses outside", context => {
  const c = chart(context);
  c.layer.emit("pointerdown");
  assert.equal(c.captures.has(1), true);
  c.layer.emit("pointermove", { clientX: 190, clientY: 210 });
  assert.deepEqual(c.selection, { x: 90, y: 160, contact: true });
  c.layer.emit("pointerup", { clientX: 195, clientY: 220 });
  c.layer.emit("lostpointercapture");
  c.layer.emit("pointerleave");
  assert.deepEqual(c.selection, { x: 95, y: 170, contact: true });
  assert.equal(c.captures.size, 0);
  c.document.emit("pointerdown", { target: c.layer });
  assert.notEqual(c.selection, null);
  c.document.emit("pointerdown");
  assert.equal(c.selection, null);
});

test("a second finger clears selection and does not resume when only one remains", context => {
  const c = chart(context);
  c.layer.emit("pointerdown");
  c.layer.emit("pointerdown", { pointerId: 2, isPrimary: false });
  assert.equal(c.selection, null);
  c.layer.emit("pointermove");
  c.layer.emit("pointerup", { pointerId: 2 });
  c.layer.emit("pointermove");
  assert.equal(c.selection, null);
  c.layer.emit("pointerup");
  c.layer.emit("pointerdown", { pointerId: 3 });
  assert.notEqual(c.selection, null);
});

test("touch started outside the chart cannot become an accidental selection", context => {
  const c = chart(context);
  c.layer.emit("pointermove");
  assert.equal(c.selection, null);
  c.layer.emit("pointerdown", { isPrimary: false });
  c.layer.emit("pointermove");
  assert.equal(c.selection, null);
  c.layer.emit("pointerup");
  c.layer.emit("pointerdown");
  assert.notEqual(c.selection, null);
});

test("browser cancellation or unexpected capture loss clears the active readout", context => {
  const c = chart(context);
  for (const reason of ["pointercancel", "lostpointercapture"]) {
    c.layer.emit("pointerdown");
    c.layer.emit(reason);
    c.layer.emit("pointermove");
    assert.equal(c.selection, null);
    assert.equal(c.captures.size, 0);
  }
});

test("Escape and window blur dismiss without leaving an active contact", context => {
  const c = chart(context);
  c.layer.emit("pointerdown");
  c.layer.emit("pointerup");
  c.document.emit("keydown", { key: "Escape" });
  assert.equal(c.selection, null);
  c.layer.emit("pointerdown");
  c.view.emit("blur");
  c.layer.emit("pointermove");
  assert.equal(c.selection, null);
  assert.equal(c.captures.size, 0);
});

test("unmount removes listeners and releases pointer capture", context => {
  const c = chart(context);
  c.layer.emit("pointerdown");
  const previousUpdates = c.updates;
  c.cleanup();
  c.layer.emit("pointermove");
  assert.equal(c.updates, previousUpdates);
  assert.equal(c.captures.size, 0);
  assert.equal(c.layer.listenerCount + c.document.listenerCount + c.view.listenerCount, 0);
});
