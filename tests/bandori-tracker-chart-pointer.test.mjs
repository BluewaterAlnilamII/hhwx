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
    const event = { type, target: this, pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: 150, clientY: 90, timeStamp: performance.now(), cancelable: true, preventDefault() { this.defaultPrevented = true; }, ...properties };
    this.listeners.get(type)?.forEach(fn => fn(event));
    return event;
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

function chart(context, callbacks = {}) {
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
    ...callbacks,
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

test("two fingers continuously pan and pinch, then wait for all fingers to lift", context => {
  const gestures = [];
  let ended = 0;
  const c = chart(context, {
    onGestureStart: center => gestures.push({ center, ratio: 1 }),
    onGesture: (center, ratio) => gestures.push({ center, ratio }),
    onGestureEnd: () => ended++,
  });
  c.layer.emit("pointerdown", { clientX: 150 });
  c.layer.emit("pointerdown", { pointerId: 2, isPrimary: false, clientX: 250 });
  assert.deepEqual(gestures[0], { center: 100, ratio: 1 });
  c.layer.emit("pointermove", { pointerId: 2, clientX: 310 });
  assert.deepEqual(gestures.at(-1), { center: 130, ratio: 1.6 });
  assert.equal(c.selection, null);
  assert.deepEqual([...c.captures], [1, 2]);
  c.layer.emit("pointerup", { pointerId: 2 });
  const count = gestures.length;
  c.layer.emit("pointermove", { clientX: 200 });
  assert.equal(gestures.length, count);
  assert.equal(c.selection, null);
  assert.equal(ended, 1);
  c.layer.emit("pointerup");
  c.layer.emit("pointerdown");
  assert.notEqual(c.selection, null);
});

test("mouse drag pans only after crossing the movement threshold", context => {
  const gestures = [];
  const c = chart(context, {
    canPan: () => true,
    onGestureStart: center => gestures.push({ center, ratio: 1 }),
    onGesture: (center, ratio) => gestures.push({ center, ratio }),
  });
  c.layer.emit("pointerdown", { pointerType: "mouse" });
  c.layer.emit("pointermove", { pointerType: "mouse", clientX: 152 });
  assert.equal(gestures.length, 0);
  c.layer.emit("pointermove", { pointerType: "mouse", clientX: 180 });
  assert.deepEqual(gestures, [{ center: 50, ratio: 1 }, { center: 80, ratio: 1 }]);
  c.layer.emit("pointerleave", { pointerType: "mouse" });
  c.layer.emit("pointerup", { pointerType: "mouse" });
  assert.equal(c.captures.size, 0);
});

test("zoom controls keep the selected point while ordinary outside clicks dismiss it", context => {
  const button = {};
  const c = chart(context, { isControlTarget: target => target === button });
  c.layer.emit("pointerdown");
  c.layer.emit("pointerup");
  c.document.emit("pointerdown", { target: button });
  assert.notEqual(c.selection, null);
  c.document.emit("pointerdown");
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

test("double tap zooms only on release and ordinary point selection stays immediate", context => {
  const steps=[];
  const c=chart(context,{canZoom:()=>true,onDoubleTap:x=>steps.push(x)});
  for(const base of [0,400,800]) {
    c.layer.emit('pointerdown',{timeStamp:base});
    assert.notEqual(c.selection,null);
    c.layer.emit('pointerup',{timeStamp:base+30});
    c.layer.emit('pointerdown',{timeStamp:base+130});
    assert.equal(steps.length,base/400);
    c.layer.emit('pointerup',{timeStamp:base+160});
  }
  assert.deepEqual(steps,[50,50,50]);
});

test("double tap drag zooms both ways without committing a step", context => {
  const ratios=[];let steps=0;
  const c=chart(context,{canZoom:()=>true,onDoubleTap:()=>steps++,onGestureStart:()=>{},onGesture:(_x,r)=>ratios.push(r)});
  c.layer.emit('pointerdown',{timeStamp:0});c.layer.emit('pointerup',{timeStamp:30});
  c.layer.emit('pointerdown',{timeStamp:100});
  c.layer.emit('pointermove',{clientY:-30});
  c.layer.emit('pointermove',{clientY:210});
  c.layer.emit('pointerup',{timeStamp:200,clientY:210});
  assert.deepEqual(ratios,[2,0.5]);assert.equal(steps,0);
  c.layer.emit('pointerdown',{timeStamp:210});assert.notEqual(c.selection,null);
});

test("dragging, long presses and cancellation cannot prime a double tap", context => {
  let steps=0;const c=chart(context,{canZoom:()=>true,onDoubleTap:()=>steps++});
  c.layer.emit('pointerdown',{timeStamp:0});c.layer.emit('pointermove',{clientX:200});c.layer.emit('pointerup',{timeStamp:50});
  c.layer.emit('pointerdown',{timeStamp:100});c.layer.emit('pointerup',{timeStamp:500});
  c.layer.emit('pointerdown',{timeStamp:550});c.layer.emit('pointercancel',{timeStamp:580});
  c.layer.emit('pointerdown',{timeStamp:600});c.layer.emit('pointerup',{timeStamp:630});
  assert.equal(steps,0);
});

test("wheel zooms without clicking, normalizes units, and preserves browser shortcuts", context => {
  const moves=[];const c=chart(context,{canZoom:()=>true,onWheel:(x,d)=>moves.push([x,d])});
  const wheel=extra=>c.layer.emit('wheel',{deltaY:-3,deltaMode:1,...extra});
  assert.ok(wheel().defaultPrevented);assert.deepEqual(moves,[[50,-48]]);
  assert.ok(!wheel({ctrlKey:true}).defaultPrevented);
  assert.ok(!wheel({deltaY:0,deltaX:100}).defaultPrevented);
  c.document.emit('keydown',{key:'Escape'});assert.ok(wheel().defaultPrevented);
  c.layer.emit('pointerleave',{pointerType:'mouse'});assert.ok(wheel().defaultPrevented);
  c.layer.emit('pointerdown');assert.ok(!wheel().defaultPrevented);
});

test("charts without zoom do not consume wheel scrolling", context => {
  const c=chart(context,{canZoom:()=>false,onWheel:()=>assert.fail('no zoom')});
  assert.ok(!c.layer.emit('wheel',{deltaY:90}).defaultPrevented);
});
