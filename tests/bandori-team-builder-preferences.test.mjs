import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the page's storage boundary without mounting the authenticated UI.
const source = await readFile(new URL("../src/app/[locale]/bandori/teambuilder/page.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set([
  "TEAMBUILDER_LIVE_PREFERENCES_STORAGE_KEY", "DEFAULT_OTHER_PLAYERS",
  "OTHER_PLAYER_SKILL_LEVEL_OPTIONS", "ENCORE_SKILL_SOURCE_OPTIONS", "MEDLEY_SLOT_COUNT", "DIFFICULTIES",
  "isLiveType", "isEncoreSkillSource", "isSongPreferenceId", "isTeamSearchDifficulty",
  "normalizeOtherPlayersPreference", "normalizeMedleySongIdsPreference", "normalizeMedleyDifficultiesPreference",
  "readLivePreferences", "writeLivePreferences",
  "TEAMBUILDER_PROFILE_PREFERENCE_STORAGE_KEY", "readProfilePreference", "writeProfilePreference", "resolveProfileChoice",
  "allowedLiveTypes", "resolveLiveType", "resolveDifficulty", "getSongDifficulty", "DIFFICULTY_KEYS", "SUPPORTED_EVENT_TYPES",
]);
const declarations = syntax.statements.filter((node) => (
  ts.isFunctionDeclaration(node) ? names.has(node.name?.text)
    : ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => names.has(item.name.getText(syntax)))
));
assert.equal(declarations.length, names.size);
const { outputText } = ts.transpileModule(declarations.map((node) => node.getText(syntax)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
});
const loadPreferences = (localStorage) => runInNewContext(`${outputText}
  ({ ${[...names].join(", ")}, defaults: DEFAULT_OTHER_PLAYERS, key: TEAMBUILDER_LIVE_PREFERENCES_STORAGE_KEY,
     read: readLivePreferences, write: writeLivePreferences })`, { window: { localStorage } });
const plain = (value) => JSON.parse(JSON.stringify(value));

function createStorage() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

// Run the actual page derivations and callbacks, including async loading races.
function panelValue(name, bindings) {
  const panel = syntax.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "TeamBuilderPanel");
  const declaration = panel.body.statements.filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find((node) => node.name.getText(syntax) === name);
  assert.ok(declaration?.initializer, `Missing page value: ${name}`);
  const { outputText } = ts.transpileModule(`(${declaration.initializer.getText(syntax)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  return runInNewContext(outputText, { Error, useCallback: (fn) => fn, useMemo: (fn) => fn(), ...bindings });
}

test("co-op conditions default on, migrate missing flags, and preserve each saved choice", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const preferences = loadPreferences(storage);
  assert.deepEqual(plain(preferences.read()), {});
  assert.deepEqual(plain(preferences.defaults.map((player) => player.conditionSatisfied)), [true, true, true, true]);

  const legacyPlayers = plain(preferences.defaults).map(({ skillId, skillLevel }) => ({ skillId, skillLevel }));
  values.set(preferences.key, JSON.stringify({ otherPlayers: legacyPlayers, perfectRate: "98" }));
  assert.deepEqual(plain(preferences.read().otherPlayers), plain(preferences.defaults));

  const players = plain(preferences.read().otherPlayers);
  players[1].conditionSatisfied = false;
  players[3].conditionSatisfied = false;
  preferences.write({ otherPlayers: players });
  preferences.write({ otherPlayersAveragePower: "400000" });
  const restored = loadPreferences(storage).read();
  assert.deepEqual(plain(restored.otherPlayers), players);
  assert.equal(restored.perfectRate, "98");
  assert.equal(restored.otherPlayersAveragePower, "400000");

  players[1].conditionSatisfied = true;
  preferences.write({ otherPlayers: players });
  assert.deepEqual(plain(loadPreferences(storage).read().otherPlayers), players);
});

test("malformed or unavailable preference storage safely falls back to enabled defaults", () => {
  for (const rawValue of ["broken json", "null", JSON.stringify({ otherPlayers: [{ skillId: "69", skillLevel: "5" }] })]) {
    const preferences = loadPreferences({ getItem: () => rawValue, setItem() {} });
    assert.equal(preferences.read().otherPlayers, undefined);
    assert.equal(preferences.defaults.every((player) => player.conditionSatisfied), true);
    assert.doesNotThrow(() => preferences.write({ otherPlayers: preferences.defaults }));
  }
  const preferences = loadPreferences({
    getItem() { throw new Error("Storage unavailable"); },
    setItem() { throw new Error("Storage unavailable"); },
  });
  assert.deepEqual(plain(preferences.read()), {});
  assert.doesNotThrow(() => preferences.write({ otherPlayers: preferences.defaults }));
});

test("profile selection persists by account and restores only available source/id pairs", () => {
  const storage = createStorage();
  const preferences = loadPreferences(storage);
  const cloud = { source: "cloud", id: "same-id" };
  const local = { source: "local", id: "same-id" };
  for (const [userId, choice] of [["alice", cloud], ["bob", local]]) {
    let selected;
    panelValue("updateProfileChoice", {
      ...preferences, userId, setProfileChoice: (value) => { selected = value; },
    })(choice);
    assert.deepEqual(selected, choice);
    assert.deepEqual(plain(loadPreferences(storage).readProfilePreference(userId)), choice);
  }
  assert.equal(preferences.readProfilePreference("charlie"), null);
  const clouds = [{ id: "first" }, { id: "same-id" }], locals = [{ id: "same-id" }];
  const resolve = (current, saved, cloudList = clouds, localList = locals) => plain(
    preferences.resolveProfileChoice(current, saved, cloudList, localList),
  );
  assert.deepEqual(resolve(null, cloud), cloud);
  assert.deepEqual(resolve(null, cloud, [...clouds].reverse()), cloud);
  assert.deepEqual(resolve(local, cloud), local);
  assert.deepEqual(resolve(null, local), local);
  assert.deepEqual(resolve(cloud, local, [{ id: "first" }]), local);
  assert.deepEqual(resolve(null, cloud, [{ id: "first" }]), { source: "cloud", id: "first" });
  assert.deepEqual(resolve(null, cloud, []), local);
  assert.equal(resolve(local, cloud, [], []), null);
  assert.deepEqual(resolve(null, local, [{ id: "other" }], []), { source: "cloud", id: "other" });
});

test("invalid, unavailable, or absent profile storage does not block selection", () => {
  for (const value of ["broken", "null", "[]", '{"source":"cloud","id":0}', '{"source":"cloud","id":" "}', '{"source":"unknown","id":"1"}']) {
    const preferences = loadPreferences({ getItem: () => value, setItem() {} });
    assert.equal(preferences.readProfilePreference("alice"), null);
  }
  const preferences = loadPreferences({ getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } });
  assert.equal(preferences.readProfilePreference("alice"), null);
  let selected;
  const choice = { source: "local", id: "local-1" };
  assert.doesNotThrow(() => panelValue("updateProfileChoice", {
    ...preferences, userId: "alice", setProfileChoice: (value) => { selected = value; },
  })(choice));
  assert.deepEqual(selected, choice);
});

test("delayed event data and forced modes preserve the manually selected live type", () => {
  const storage = createStorage(), preferences = loadPreferences(storage);
  let preferredLiveType;
  const choose = panelValue("updateLiveType", { ...preferences, setPreferredLiveType: (value) => { preferredLiveType = value; } });
  choose("challenge");
  assert.deepEqual(["none", "challenge", "medley", "story", "challenge"].map((selectedEventType) => (
    panelValue("liveType", { ...preferences, preferredLiveType, selectedEventType })
  )), ["multi", "challenge", "free", "multi", "challenge"]);
  choose("multi");
  assert.deepEqual(["medley", "versus", "festival", "story"].map((selectedEventType) => (
    panelValue("liveType", { ...preferences, preferredLiveType, selectedEventType })
  )), ["free", "versus", "versus", "multi"]);
  for (const eventType of ["none", ...preferences.SUPPORTED_EVENT_TYPES]) {
    for (const preferred of ["free", "multi", "challenge", "versus"]) {
      assert.ok(preferences.allowedLiveTypes(eventType).includes(preferences.resolveLiveType(preferred, eventType)));
    }
  }
  assert.equal(loadPreferences(storage).read().liveType, "multi");
});

test("single and medley difficulty fallbacks never replace manual preferences", () => {
  const storage = createStorage(), preferences = loadPreferences(storage);
  let preferredDifficulty;
  const choose = panelValue("updateDifficulty", { ...preferences, setPreferredDifficulty: (value) => { preferredDifficulty = value; } });
  const effective = (selectedSongDifficulties) => panelValue("difficulty", { ...preferences, preferredDifficulty, selectedSongDifficulties });
  choose("special");
  assert.equal(effective([]), "special");
  assert.equal(effective(["easy", "hard", "expert"]), "expert");
  assert.equal(effective(["expert", "special"]), "special");
  assert.equal(loadPreferences(storage).read().difficulty, "special");
  choose("hard");
  assert.equal(effective(["hard", "expert", "special"]), "hard");

  let preferredMedleyDifficulties = ["special", "special", "expert"];
  const songs = [
    { difficulty: { 2: {}, 3: {} } },
    { difficulty: { 2: {}, 3: {}, 4: {} } },
    { difficulty: { 1: {}, 2: {} } },
  ];
  const medley = (selectedMedleySongs) => plain(panelValue("medleyDifficulties", {
    ...preferences, preferredMedleyDifficulties, selectedMedleySongs,
  }));
  assert.deepEqual(medley(songs), ["expert", "special", "hard"]);
  panelValue("updateMedleyDifficulty", {
    ...preferences, preferredMedleyDifficulties,
    setPreferredMedleyDifficulties: (value) => { preferredMedleyDifficulties = value; },
  })(1, "hard");
  assert.deepEqual(medley(songs), ["expert", "hard", "hard"]);
  assert.deepEqual(plain(loadPreferences(storage).read().medleyDifficulties), ["special", "hard", "expert"]);
  assert.deepEqual(medley([songs[1], songs[1], songs[1]]), ["special", "hard", "expert"]);
});

test("profile reload keeps newer user choices, ignores stale responses, and preserves storage on failure", async () => {
  const storage = createStorage(), preferences = loadPreferences(storage);
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
    return { promise, resolve, reject };
  };
  const requests = [];
  const state = { choice: null, data: null, loading: false, error: "" };
  const saved = { source: "cloud", id: "saved" };
  preferences.writeProfilePreference("alice", saved);
  const bindings = {
    ...preferences, userId: "alice", loadDataRequestRef: { current: 0 },
    masterEvents: [{ eventType: "story" }], masterEventsLoaded: true, masterEventsError: null,
    masterMusic: {}, masterMusicLoaded: true, masterMusicError: null, requestMessages: {}, errorsT: (key) => key,
    requestJson: (path) => {
      if (path !== "/api/account/game-profiles") return Promise.resolve({ payload: {} });
      const request = deferred(); requests.push(request); return request.promise;
    },
    listLocalGameProfiles: async () => [{ id: "local-new" }],
    setData: (value) => { state.data = value; },
    setLoading: (value) => { state.loading = value; },
    setError: (value) => { state.error = value; },
    setProfileChoice: (value) => { state.choice = typeof value === "function" ? value(state.choice) : value; },
  };
  const load = panelValue("loadData", bindings);
  const first = load();
  requests[0].resolve([{ id: "first" }, { id: "saved" }]); await first;
  assert.deepEqual(plain(state.choice), saved);

  const reload = load();
  const newerChoice = { source: "local", id: "local-new" };
  panelValue("updateProfileChoice", bindings)(newerChoice);
  requests[1].resolve([{ id: "first" }, { id: "saved" }]); await reload;
  assert.deepEqual(state.choice, newerChoice);

  const oldLoad = load(), newLoad = load();
  requests[3].resolve([{ id: "latest" }]); await newLoad;
  const latestData = state.data;
  requests[2].resolve([{ id: "obsolete" }]); await oldLoad;
  assert.equal(state.data, latestData);
  assert.deepEqual(state.choice, newerChoice);

  const oldFailure = load(), currentLoad = load();
  requests[4].reject(new Error("old failure")); await oldFailure;
  assert.equal(state.error, ""); assert.equal(state.loading, true);
  requests[5].resolve([{ id: "latest" }]); await currentLoad;
  const failed = load(); requests[6].reject(new Error("offline")); await failed;
  assert.equal(state.error, "offline"); assert.equal(state.loading, false);
  assert.deepEqual(state.choice, newerChoice);
  assert.deepEqual(plain(loadPreferences(storage).readProfilePreference("alice")), newerChoice);
});
