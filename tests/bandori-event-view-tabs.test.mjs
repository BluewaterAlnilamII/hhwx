import assert from "node:assert/strict";
import test from "node:test";
import { bindEventViewTabsSwipe, getEventTabsCollapseProgress } from "../src/app/[locale]/bandori/events/EventViewTabs.tsx";

function tabs(context, value = "tracker", mobile = true) {
  const listeners = new Map();
  const captures = new Set();
  const changes = [];
  const positions = [];
  const endings = [];
  const bar = {
    ownerDocument: { defaultView: { matchMedia: () => ({ matches: mobile }) } },
    getBoundingClientRect: () => ({ width: 360 }),
    setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture: id => captures.delete(id),
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: type => listeners.delete(type),
  };
  const cleanup = bindEventViewTabsSwipe(bar, value, {
    onStart: () => value === "info" ? 1 : 0,
    onProgress: position => positions.push(position),
    onEnd: view => { endings.push(view); if (view !== value) changes.push(view); },
  });
  context.after(cleanup);
  return { bar, changes, positions, endings, captures, listeners, cleanup,
    emit(type, detail = {}) {
      const event = { type, pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 200, clientY: 100,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...detail };
      listeners.get(type)?.(event);
      return event;
    },
  };
}

test("mobile swipe selects the adjacent view once and releases capture", context => {
  const t = tabs(context);
  t.emit("pointerdown");
  t.emit("pointermove", { clientX: 90 });
  assert.equal(t.positions.at(-1), 110 / 360);
  t.emit("pointerup", { clientX: 90 });
  assert.deepEqual(t.changes, ["info"]);
  assert.equal(t.captures.size, 0);
  assert.deepEqual(t.endings, ["info"]);
  assert.equal(t.emit("click", { detail: 1 }).stopped, true);
  assert.equal(t.emit("click", { detail: 1 }).stopped, undefined);
});

test("swiping back selects tracking; swiping past either edge does not wrap", context => {
  for (const [value, x, expected] of [["info", 300, ["tracker"]], ["tracker", 300, []], ["info", 90, []]]) {
    const t = tabs(context, value);
    t.emit("pointerdown"); t.emit("pointermove", { clientX: x }); t.emit("pointerup", { clientX: x });
    assert.deepEqual(t.changes, expected);
  }
});

test("short drags snap back without selecting a tab or triggering a click", context => {
  const t = tabs(context);
  t.emit("pointerdown"); t.emit("pointermove", { clientX: 170 }); t.emit("pointerup", { clientX: 170 });
  assert.deepEqual(t.changes, []);
  assert.deepEqual(t.endings, ["tracker"]);
  assert.equal(t.emit("click", { detail: 1 }).prevented, true);
});

test("vertical gestures, ordinary taps, and keyboard clicks retain their own behavior", context => {
  const t = tabs(context);
  t.emit("pointerdown"); t.emit("pointermove", { clientY: 180 }); t.emit("pointerup", { clientX: 80 });
  assert.deepEqual(t.changes, []);
  assert.equal(t.captures.size, 0);
  t.emit("pointerdown"); t.emit("pointerup");
  assert.equal(t.emit("click", { detail: 1 }).prevented, undefined);
  assert.equal(t.emit("click", { detail: 0 }).prevented, undefined);
});

test("a second finger, browser cancellation, or lost capture aborts selection", context => {
  for (const cancellation of ["second", "pointercancel", "lostpointercapture"]) {
    const t = tabs(context);
    t.emit("pointerdown"); t.emit("pointermove", { clientX: 90 });
    if (cancellation === "second") t.emit("pointerdown", { pointerId: 2, isPrimary: false });
    else t.emit(cancellation);
    t.emit("pointerup", { clientX: 90 });
    assert.deepEqual(t.changes, []);
    assert.equal(t.captures.size, 0);
    assert.deepEqual(t.endings, ["tracker"]);
  }
});

test("desktop, mouse drags, and gestures started outside the bar cannot switch views", context => {
  for (const [mobile, pointerType] of [[false, "touch"], [true, "mouse"]]) {
    const t = tabs(context, "tracker", mobile);
    t.emit("pointerdown", { pointerType }); t.emit("pointermove", { clientX: 90 }); t.emit("pointerup", { clientX: 90 });
    assert.deepEqual(t.changes, []);
  }
  const t = tabs(context);
  t.emit("pointermove", { clientX: 90 }); t.emit("pointerup", { clientX: 90 });
  assert.deepEqual(t.changes, []);
});

test("unmount removes handlers and capture without committing a pending gesture", context => {
  const t = tabs(context);
  t.emit("pointerdown"); t.emit("pointermove", { clientX: 90 });
  t.cleanup();
  assert.equal(t.listeners.size, 0);
  assert.equal(t.captures.size, 0);
  assert.deepEqual(t.endings, []);
});

test("drag progress follows movement in both directions without committing before release", context => {
  const t = tabs(context);
  t.emit("pointerdown");
  t.emit("pointermove", { clientX: 110 });
  t.emit("pointermove", { clientX: 20 });
  t.emit("pointermove", { clientX: 155 });
  assert.deepEqual(t.positions, [0.25, 0.5, 0.125]);
  assert.deepEqual(t.endings, []);
  t.emit("pointerup", { clientX: 155 });
  assert.deepEqual(t.endings, ["tracker"]);
});

test("collapse and expansion stay inside the tab bar's own height change", () => {
  for (const [normalHeight, compactHeight] of [[56, 44], [58, 44], [112, 88], [116, 88]]) {
    const headerBottom = 59;
    const distance = normalHeight - compactHeight;
    const offsets = [-20, 0, distance / 4, distance / 2, distance * 3 / 4, distance, distance + 20];
    const progress = offset => getEventTabsCollapseProgress(headerBottom - offset, headerBottom, normalHeight, compactHeight);
    const expected = [0, 0, 0.25, 0.5, 0.75, 1, 1];
    assert.deepEqual(offsets.map(progress), expected);
    assert.deepEqual(offsets.toReversed().map(progress), expected.toReversed());
    for (const offset of offsets.slice(1, -1)) {
      const height = normalHeight - distance * progress(offset);
      assert.equal(headerBottom + height, headerBottom - offset + normalHeight);
    }
    // A reverse scroll must stay compact until the original bottom reaches the sticky bottom.
    assert.equal(progress(distance + 1), 1);
    assert.equal(getEventTabsCollapseProgress(84 - distance / 2, 84, normalHeight, compactHeight), 0.5);
  }
});
