import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_PREVIEW_DIVIDER as divider, applyFavoriteChange, eventPreview, favoriteCardDrop as drop, favoriteKey, parseFavoriteKey } from "../src/lib/bandori/favorites.ts";

test("confirmed membership changes preserve card order, artwork and the home divider", () => {
  const card = { target:"2", normalArt:true };
  const groups = [{ kind:"cards", previewCount:1, items:[card, { target:"1", normalArt:false }] }];
  const change = (groups, target, selected) => applyFavoriteChange(groups, {kind:"cards", target, selected});
  const added = change(groups, "3", true);
  assert.deepEqual(added[0], { ...groups[0], items:[...groups[0].items, {target:"3",normalArt:false}] });
  assert.equal(change(added, "2", true), added);
  const one = change(change(added, "3", false), "1", false);
  assert.deepEqual(one, [{ kind:"cards", items:[card], previewCount:6 }]);
  assert.deepEqual(change(one, "2", false), []);
  assert.deepEqual(change([], "2", true), [{ kind:"cards", previewCount:6, items:[{target:"2",normalArt:false}] }]);
});

test("moving cards across the home divider grows or shrinks the selection within one to six", () => {
  const targets = ["a", "b", "c", "d", "e", "f", "g"];
  assert.deepEqual(drop(["a","d","b","c",divider,"e","f","g"], "d"), { targets: ["a","d","b","c","e","f","g"], previewCount: 4 });
  assert.equal(drop(["b","c",divider,"a","d","e","f","g"], "a").previewCount, 2);
  assert.deepEqual(drop([...targets,divider], "g"), { targets: ["a","b","c","d","e","g","f"], previewCount: 6 });
  assert.deepEqual(drop([divider,...targets], "a"), { targets: ["b","a","c","d","e","f","g"], previewCount: 1 });
  assert.equal(drop(["b","a",divider], "a").previewCount, 6);
  assert.equal(drop(["a","b","c",divider], divider).previewCount, 6, "moving the divider to the end follows future favorites");
  assert.equal(drop(["a",divider,"b"], divider).previewCount, 1);
});

test("identity is shared across card art and ordinary regions, but not event regions or colliding card IDs", () => {
  for (const server of [0, 1, 2, 3]) assert.equal(favoriteKey("cards", 101, server), "cards:101");
  assert.equal(favoriteKey("cards", 10001, 1), "cards:en:10001");
  assert.equal(parseFavoriteKey("cards:cn:10001").server, 3);
  assert.equal(favoriteKey("events", 101, 3), "events:cn:101");
  for (const invalid of ["events:101", "events:kr:101", "songs:cn:1", "cards:jp:10001", "cards:10001", "cards:cn:1", "songs:01", "events:cn:-1"]) assert.equal(parseFavoriteKey(invalid), null);
});

test("four-event window fills in both directions and includes the current event until its end", () => {
  const entries = [10,20,30,40,50,60,70].map(end => ({ end }));
  for (const [now, expected] of [[0,[10,20,30,40]],[30,[20,30,40,50]],[65,[40,50,60,70]],[99,[40,50,60,70]]]) {
    assert.deepEqual(eventPreview(entries, now).map(item => item.end), expected);
  }
  assert.deepEqual(eventPreview(entries.slice(0,2), 20), entries.slice(0,2));
  const pending = [347, 348, 349].map(id => ({ id, end: Infinity }));
  assert.deepEqual(eventPreview([...entries, ...pending], 99), [entries.at(-1), ...pending]);
  assert.deepEqual(eventPreview([...entries, pending[0]], 99), [...entries.slice(-3), pending[0]]);
  assert.deepEqual(eventPreview([...entries, ...pending], 65), [...entries.slice(-2), ...pending.slice(0, 2)]);
});
