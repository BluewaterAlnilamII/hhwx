import assert from "node:assert/strict";
import test from "node:test";
import { defaultHomepagePreferences, fitProfileSignature, parseHomepagePatch, projectProfileBindings, bindingVisibility, groupProfileDegrees } from "../src/lib/profile-homepage.ts";

const account = (uid, name = null) => ({ server: 3, gameUid: uid, playerName: name, ownedDegreeIds: [100, 101], ownedDegreeEffectIds: [901], public: true, titlesPublic: true });

test("all parent/account/title privacy combinations filter public data and preserve owner choices", () => {
  for (const master of [true, false]) for (const visible of [true, false]) for (const titles of [true, false]) {
    const preferences = { ...defaultHomepagePreferences(), publicAccounts: master, accounts: [{ server: 3, gameUid: "10001", public: visible, titlesPublic: titles }] };
    const original = structuredClone(preferences);
    const publicResult = projectProfileBindings([account("10001")], preferences, false);
    assert.equal(publicResult.length, Number(master && visible));
    if (publicResult.length) {
      assert.deepEqual(publicResult[0].ownedDegreeIds, titles ? [100, 101] : []);
      assert.deepEqual(publicResult[0].ownedDegreeEffectIds, titles ? [901] : []);
    }
    const owner = projectProfileBindings([account("10001")], preferences, true)[0];
    assert.equal(owner.public, master && visible);
    assert.equal(owner.titlesPublic, master && visible && titles);
    assert.deepEqual(owner.ownedDegreeIds, [100, 101]);
    assert.deepEqual(preferences, original);
    assert.deepEqual(bindingVisibility(master, original.accounts[0]), { public: owner.public, titlesPublic: owner.titlesPublic });
  }
});

test("missing game names stay absent without affecting title ownership; order is shared", () => {
  const shared = { ...defaultHomepagePreferences(), accounts: [{ server: 3, gameUid: "10001", public: true, titlesPublic: true }] };
  for (const name of [null, undefined, "", "  "]) {
    const result = projectProfileBindings([account("10001", name)], shared, false)[0];
    assert.equal(result.playerName, null);
    assert.deepEqual(result.ownedDegreeIds, [100, 101]);
  }
  const byDefault = projectProfileBindings([account("10001")], defaultHomepagePreferences(), false)[0];
  assert.equal(byDefault.titlesPublic, false);
  assert.deepEqual(byDefault.ownedDegreeIds, []);
  assert.deepEqual(byDefault.ownedDegreeEffectIds, []);
  const prefs = { ...defaultHomepagePreferences(), accounts: [{ server: 3, gameUid: "10002", public: true, titlesPublic: true }] };
  for (const owner of [false, true]) assert.deepEqual(projectProfileBindings([account("10001"), account("10002", " Game ")], prefs, owner).map(a => a.gameUid), ["10002", "10001"]);
});

test("homepage writes reject coercion, unknown fields, incomplete or duplicate orders", () => {
  for (const value of [null, [], {}, { userId: "other" }, { publicAccounts: 1 }, { allowGameIdSearch: "false" },
    { modules: [{ id: "cards", public: true }] }, { accounts: [{ server: 3, gameUid: "10001", public: true }] },
    { cover: { cardId: "1", entityServer: null, trainType: "normal", x: 50, y: 50 } },
    { cover: { cardId: 1, entityServer: null, trainType: "normal", x: Infinity, y: 50 } },
    { cover: { cardId: 1, entityServer: 6, trainType: "normal", x: 50, y: 50 } },
    { cover: { cardId: 1, entityServer: null, trainType: "normal", x: -1, y: 50 } }]) assert.equal(parseHomepagePatch(value), null);
  const defaults = defaultHomepagePreferences();
  assert.deepEqual(parseHomepagePatch(defaults), defaults);
  assert.deepEqual(parseHomepagePatch({ signature: "  hello 中  " }), { signature: "hello 中" });
  assert.equal(parseHomepagePatch({ modules: [defaults.modules[0], defaults.modules[0], defaults.modules[2]] }), null);
  const pref = { gameUid: "10001", public: true, titlesPublic: false };
  assert.equal(parseHomepagePatch({ accounts: [pref, pref] }), null);
});

test("signature writes allow 80 half-width units and fitting preserves whole graphemes", () => {
  for (const full of ["a".repeat(80), "字".repeat(40), "ｱ".repeat(80), "Ａ".repeat(40),
    "👩‍🎤".repeat(40), "e\u0301".repeat(80), "あ".repeat(20) + " b".repeat(20)]) {
    assert.deepEqual(parseHomepagePatch({ signature: full }), { signature: full });
    assert.equal(parseHomepagePatch({ signature: full + "a" }), null);
    assert.equal(fitProfileSignature(full + "字"), full);
  }
  assert.equal(fitProfileSignature("字", "z".repeat(79)), "");
});

test("game grouping distinguishes ordinary variants from owned effects and preserves intrinsic order", () => {
  const degree = (id, seq, extras = {}) => ({ id, seq, degreeType: "normal", characterId: 0, baseImageName: "base", ...extras });
  const degrees = [degree(1, 9), degree(2, 2), degree(3, 3, { characterId: 1 }), degree(4, 1, { degreeType: "event_point" }),
    degree(5, 4, { degreeType: "score_ranking" }), degree(6, 1, { baseImageName: "ani_degree_6" }), degree(7, 9, { degreeEffect: { biliDegreeEffectId: 70 } })];
  const groups = groupProfileDegrees({ gameUid: "10001", server: 3, ownedDegreeIds: degrees.map(d => d.id), ownedDegreeEffectIds: [70] }, new Map(degrees.map(d => [d.id, d])));
  assert.deepEqual(groups.map(g => g.map(v => [v.degree.id, v.degreeEffectId])), [[[2, null], [1, null], [7, null]], [[3, null]], [[4, null]], [[5, null]], [[7, 70], [6, null]]]);
});

test("equal UIDs on two servers retain independent order, visibility and titles", () => {
  const gameUid = "18446744073709551615";
  const rows = [{ ...account(gameUid), server: 0 }, { ...account(gameUid), server: 3 }];
  const patch = parseHomepagePatch({ accounts: [
    { gameUid, server: 3, public: false, titlesPublic: true },
    { gameUid, server: 0, public: true, titlesPublic: false },
  ] });
  const prefs = { ...defaultHomepagePreferences(), ...patch };
  assert.deepEqual(projectProfileBindings(rows, prefs, true).map(row => row.server), [3, 0]);
  const visitor = projectProfileBindings(rows, prefs, false);
  assert.deepEqual(visitor.map(row => row.server), [0]);
  assert.deepEqual(visitor[0].ownedDegreeIds, []);
});
