import assert from "node:assert/strict";
import test from "node:test";
import { selectStampPickerItems, STAMP_CATEGORIES, STAMP_FAVORITES_STORAGE_KEY, STAMP_PICKER_SESSION_KEY, useStampPickerStore } from "../src/store/useStampPickerStore.ts";

const stamp = (id, characterId, region = "cn", kind = "normal") => ({ id, characterId, region, kind, imageName: "fixture", imageUrl: "/stamp.png", voiceUrl: "" });
function setup(context, local = new Map(), session = new Map()) {
  const previous = globalThis.window;
  const storage = (values) => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  globalThis.window = { localStorage: storage(local), sessionStorage: storage(session) };
  useStampPickerStore.setState(useStampPickerStore.getInitialState(), true);
  context.after(() => { globalThis.window = previous; useStampPickerStore.setState(useStampPickerStore.getInitialState(), true); });
  return { local, session, state: useStampPickerStore.getState };
}

test("picker classifies all eight bands and keeps unresolved characters in Other", () => {
  const characters = [1, 6, 11, 16, 21, 26, 31, 36];
  const groups = ["ppp", "ag", "hhw", "pp", "roselia", "morfonica", "ras", "mygo"];
  const items = [...characters.map((character, index) => stamp(index + 1, character)), stamp(90, null), stamp(91, 999)];
  groups.forEach((group, index) => assert.deepEqual(selectStampPickerItems(items, group, []), [items[index]]));
  assert.deepEqual(selectStampPickerItems(items, "other", []), items.slice(8));
  assert.equal(selectStampPickerItems(items, "all", []), items);
  assert.equal(STAMP_CATEGORIES.length, 11);
});

test("favorites follow catalog order regardless of addition order and distinguish region and changed versions", (context) => {
  const { state, local } = setup(context);
  state().hydrate();
  const first = stamp(1, 1), normal = stamp(255, 13), changed = stamp(255, 13, "cn", "changed"), last = stamp(408, 1), jp = stamp(255, 13, "jp");
  const catalog = [first, stamp(2, 1), normal, changed, last];
  [changed, last, normal, jp, first].forEach((item) => state().toggleFavorite(item));
  assert.deepEqual(selectStampPickerItems(catalog, "favorites", state().favorites), [first, normal, changed, last]);
  assert.deepEqual(selectStampPickerItems([jp], "favorites", state().favorites), [jp]);
  state().toggleFavorite(changed);
  assert.deepEqual(selectStampPickerItems(catalog, "favorites", state().favorites), [first, normal, last]);
  state().toggleFavorite(changed);
  assert.deepEqual(selectStampPickerItems(catalog, "favorites", state().favorites), [first, normal, changed, last]);
  assert.deepEqual(JSON.parse(local.get(STAMP_FAVORITES_STORAGE_KEY)), state().favorites);
  assert.equal(local.size, 1, "only identities are persisted, not media or session browsing data");
});

test("session restores the current category and region positions while favorites survive a new tab", (context) => {
  const { state, local, session } = setup(context);
  state().hydrate(); state().toggleFavorite(stamp(408, 1));
  state().setCategory("hhw");
  const position = { stampKey: ":stamp-jp-255:", offset: 17, scrollTop: 437 };
  state().rememberPosition("cn:hhw", { ...position, stampKey: ":stamp-cn-255-changed:", scrollTop: 84 });
  state().rememberCategoryScroll("horizontal", 112);
  state().rememberCategoryScroll("vertical", 192);
  state().setRegion("jp");
  state().rememberPosition("jp:hhw", position); state().persistSession();
  useStampPickerStore.setState(useStampPickerStore.getInitialState(), true);
  state().hydrate();
  assert.equal(state().region, "jp"); assert.equal(state().category, "hhw");
  assert.deepEqual(state().positions["jp:hhw"], position);
  assert.equal(state().positions["cn:hhw"].scrollTop, 84);
  assert.deepEqual(state().categoryScroll, { horizontal: 112, vertical: 192 });
  session.clear(); useStampPickerStore.setState(useStampPickerStore.getInitialState(), true); state().hydrate();
  assert.equal(state().region, "cn"); assert.equal(state().category, "all");
  assert.deepEqual(state().favorites, JSON.parse(local.get(STAMP_FAVORITES_STORAGE_KEY)));
});

test("switching category discards previous grid positions but keeps navigation offsets", (context) => {
  const { state, session } = setup(context);
  state().hydrate();
  const position = { stampKey: ":stamp-cn-408:", offset: 17, scrollTop: 437 };
  state().rememberPosition("cn:all", position);
  state().rememberPosition("cn:hhw", position);
  state().rememberCategoryScroll("vertical", 192);
  state().setCategory("hhw");
  assert.deepEqual(state().positions, {}, "even previously saved target-category positions are discarded");
  assert.deepEqual(JSON.parse(session.get(STAMP_PICKER_SESSION_KEY)).positions, {});
  assert.equal(state().categoryScroll.vertical, 192);
  state().rememberPosition("cn:hhw", position);
  state().setCategory("hhw");
  assert.deepEqual(state().positions["cn:hhw"], position, "clicking the active category is not a category switch");
  state().setCategory("all");
  assert.deepEqual(state().positions, {}, "returning to a category starts from the top");
});

test("stored data is validated without discarding temporarily unavailable favorites", (context) => {
  const favorite = ":stamp-cn-408:";
  const local = new Map([[STAMP_FAVORITES_STORAGE_KEY, JSON.stringify([favorite, favorite, {}, "https://example.test", ":stamp-kr-1:", ":stamp-cn-0:"])]]);
  const session = new Map([[STAMP_PICKER_SESSION_KEY, JSON.stringify({ region: "kr", category: "unknown", positions: { "cn:all": { stampKey: favorite, offset: -1, scrollTop: 44 }, "invalid:all": {} }, categoryScroll: { horizontal: "5", vertical: 42 } })]]);
  const { state } = setup(context, local, session); state().hydrate();
  assert.deepEqual(state().favorites, [favorite]); assert.equal(state().region, "cn"); assert.equal(state().category, "all");
  assert.deepEqual(state().positions, {}); assert.deepEqual(state().categoryScroll, { horizontal: 0, vertical: 42 });
  assert.deepEqual(selectStampPickerItems([], "favorites", state().favorites), []);
  assert.deepEqual(state().favorites, [favorite], "catalog loading or missing assets never deletes saved favorites");
});

test("reopening refreshes favorites changed by another tab without resetting the current view", (context) => {
  const { state, local } = setup(context);
  state().hydrate(); state().setCategory("hhw");
  const position = { stampKey: ":stamp-cn-255:", offset: 17, scrollTop: 437 };
  state().rememberPosition("cn:hhw", position);
  local.set(STAMP_FAVORITES_STORAGE_KEY, JSON.stringify([":stamp-cn-255:"]));
  state().hydrate();
  assert.deepEqual(state().favorites, [":stamp-cn-255:"]);
  assert.equal(state().category, "hhw");
  assert.deepEqual(state().positions["cn:hhw"], position);
  local.delete(STAMP_FAVORITES_STORAGE_KEY); state().hydrate();
  assert.deepEqual(state().favorites, []);
});

test("favorite edits use the latest stored list and preserve the user's visible add or remove intent", (context) => {
  const { state, local } = setup(context);
  state().hydrate();
  local.set(STAMP_FAVORITES_STORAGE_KEY, JSON.stringify([":stamp-cn-1:"]));
  state().toggleFavorite(stamp(2, 6));
  assert.deepEqual(JSON.parse(local.get(STAMP_FAVORITES_STORAGE_KEY)), [":stamp-cn-1:", ":stamp-cn-2:"]);
  local.set(STAMP_FAVORITES_STORAGE_KEY, JSON.stringify([":stamp-cn-2:", ":stamp-cn-3:"]));
  state().toggleFavorite(stamp(3, 1));
  assert.deepEqual(state().favorites, [":stamp-cn-2:", ":stamp-cn-3:"], "adding an externally added favorite must not toggle it off or resurrect removed favorites");
  local.set(STAMP_FAVORITES_STORAGE_KEY, JSON.stringify([":stamp-cn-2:"]));
  state().toggleFavorite(stamp(3, 1));
  assert.deepEqual(JSON.parse(local.get(STAMP_FAVORITES_STORAGE_KEY)), [":stamp-cn-2:"], "removing an externally removed favorite must not toggle it on");
});

test("failed favorite writes remain usable and merge with external changes before storage recovers", (context) => {
  const { state, local } = setup(context);
  state().hydrate();
  const save = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error("Quota exceeded"); };
  state().toggleFavorite(stamp(1, 1)); state().toggleFavorite(stamp(2, 6));
  local.set(STAMP_FAVORITES_STORAGE_KEY, JSON.stringify([":stamp-cn-3:"]));
  state().hydrate();
  assert.deepEqual(state().favorites, [":stamp-cn-3:", ":stamp-cn-1:", ":stamp-cn-2:"]);
  state().toggleFavorite(stamp(1, 1));
  local.set(STAMP_FAVORITES_STORAGE_KEY, JSON.stringify([":stamp-cn-1:", ":stamp-cn-3:"]));
  state().syncFavorites();
  assert.deepEqual(state().favorites, [":stamp-cn-3:", ":stamp-cn-2:"]);
  window.localStorage.setItem = save;
  state().toggleFavorite(stamp(4, 1));
  assert.deepEqual(JSON.parse(local.get(STAMP_FAVORITES_STORAGE_KEY)), [":stamp-cn-3:", ":stamp-cn-2:", ":stamp-cn-4:"]);
  assert.deepEqual(state().pendingFavorites, {});
});

test("blocked or corrupt browser storage does not prevent in-memory browsing and favorites", (context) => {
  const { state, local, session } = setup(context);
  local.set(STAMP_FAVORITES_STORAGE_KEY, "broken json"); session.set(STAMP_PICKER_SESSION_KEY, "broken json"); state().hydrate();
  for (const storage of [window.localStorage, window.sessionStorage]) storage.setItem = () => { throw new Error("Quota exceeded"); };
  state().toggleFavorite(stamp(1, 1)); state().toggleFavorite(stamp(2, 6)); state().setCategory("ag"); state().setRegion("en");
  assert.deepEqual(state().favorites, [":stamp-cn-1:", ":stamp-cn-2:"]);
  assert.equal(state().category, "ag"); assert.equal(state().region, "en");
  for (const storage of [window.localStorage, window.sessionStorage]) storage.getItem = () => { throw new Error("Access denied"); };
  state().syncFavorites(); assert.equal(state().favorites.length, 2);
});
