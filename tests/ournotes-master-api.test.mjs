import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { GET as list } from "../src/app/api/ournotes/master/cards/[kind]/route.ts";
import { GET as detail } from "../src/app/api/ournotes/master/cards/[kind]/[cardId]/route.ts";
import { GET as characters } from "../src/app/api/ournotes/master/characters/route.ts";
import { GET as bands } from "../src/app/api/ournotes/master/bands/route.ts";
import { GET as skills } from "../src/app/api/ournotes/master/skills/route.ts";
import { mergeOurNotesSkills } from "../src/lib/ournotes/skills-contract.ts";
import { readOurNotesSkills } from "../src/lib/ournotes/skills-server.ts";
import { mergeOurNotesCards } from "../src/lib/ournotes/cards/api-contract.ts";
import { readOurNotesMasterInputs } from "../src/lib/ournotes/master-server.ts";
import { mergeOurNotesCatalog } from "../src/lib/ournotes/catalogs-contract.ts";
import { readOurNotesCardInputs, readOurNotesCards } from "../src/lib/ournotes/cards/api-server.ts";
import { ourNotesRouteError } from "../src/lib/ournotes/master-api-query.ts";

const fixture = JSON.parse(await readFile(new URL("fixtures/ournotes-master.json", import.meta.url), "utf8"));
const skillFixture = JSON.parse(await readFile(new URL("fixtures/ournotes-skills.json", import.meta.url), "utf8"));
const servers = ["jp", "en", "tw", "kr"];
const locales = ["ja", "en", "zh-TW", "zh-CN", "ko"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const encoded = (value) => Buffer.from(canonical(value));
const pointerKey = (server) => `ournotes/master/cards-v1/${server}/api/active.json`;
const request = (path) => new Request(`http://localhost/api/ournotes/master/${path}`);
const context = (kind = "member", cardId = "1") => ({ params: Promise.resolve({ kind, cardId }) });

function regions() {
  return servers.map((server, index) => {
    const data = structuredClone(fixture.datasets);
    data.skills = structuredClone(skillFixture.datasets[index]);
    if (server === "jp") data.support_cards.cards = data.support_cards.cards.filter((card) => card.id !== 70);
    for (const card of data.member_cards.cards) {
      for (const locale of locales) card.name[locale] = `${server}:${locale}`;
      card.startAtRaw = card.source._startAt = `${server}:raw-time`;
      card.privateOnly = "must-not-be-public";
    }
    for (const locale of locales) data.characters["1"].characterName[locale] = `${server}:${locale}`;
    return data;
  });
}

function storeObjects(inputs = regions(), revision = "ournotes-cards-v3") {
  const objects = new Map();
  inputs.forEach((input, index) => {
    const server = servers[index];
    const generation = hash(encoded([server, input, revision]));
    const prefix = `ournotes/master/${server}/${generation}`;
    const files = ["source/MasterManifest.json", ...fixture.tables.flatMap((table) => [`source/${table}.bin`, `raw/${table}.json`])]
      .map((path) => ({ path, sha256: hash("{}"), size: 2 }));
    const datasets = {};
    for (const [dataset, data] of Object.entries(input)) {
      const json = encoded(data);
      const gzip = gzipSync(json, { mtime: 0 });
      files.push({ path: `normalized/${dataset}.json`, sha256: hash(json), size: json.length },
        { path: `normalized/${dataset}.json.gz`, sha256: hash(gzip), size: gzip.length });
      objects.set(`${prefix}/normalized/${dataset}.json.gz`, gzip);
      if (dataset.endsWith("_cards")) {
        const key = `ournotes/master/cards-v1/${server}/api/packs/${dataset}/${hash(gzip)}.json.gz`;
        objects.set(key, gzip);
        datasets[dataset] = { key, compressedSha256: hash(gzip), compressedSize: gzip.length, semanticSha256: hash(json), jsonSize: json.length, recordCount: data.cards.length };
      }
    }
    const manifest = encoded({ schema: "ournotes-master-artifact-v1", revision, generation, server, selectedTables: fixture.tables, files });
    const artifact = { key: `${prefix}/manifest.json`, sha256: hash(manifest), size: manifest.length };
    objects.set(artifact.key, manifest);
    objects.set(`ournotes/master/${server}/active/manifest.json`, manifest);
    objects.set(pointerKey(server), encoded({ schema: "ournotes-cards-api-pointer-v1", server, generation: 1, updatedAt: "2026-09-27T00:00:00Z", artifactGeneration: generation, artifact, datasets }));
  });
  return objects;
}

async function withStore(inputs, edit, run) {
  const root = await mkdtemp(join(tmpdir(), "hhwx-ournotes-api-"));
  const objects = storeObjects(inputs);
  edit?.(objects);
  for (const [key, body] of objects) {
    const path = join(root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }
  const previous = process.env.OURNOTES_MASTER_LOCAL_STORE_ROOT;
  process.env.OURNOTES_MASTER_LOCAL_STORE_ROOT = root;
  try { await run(root); } finally {
    if (previous === undefined) delete process.env.OURNOTES_MASTER_LOCAL_STORE_ROOT;
    else process.env.OURNOTES_MASTER_LOCAL_STORE_ROOT = previous;
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
}
function editPointer(objects, edit) {
  const pointer = JSON.parse(objects.get(pointerKey("tw")));
  edit(pointer);
  objects.set(pointerKey("tw"), encoded(pointer));
}

test("six endpoints preserve five-slot source semantics and expose only the agreed fields", async () => {
  await withStore(regions(), null, async () => {
    const response = await list(request("cards/member"), context());
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /public/);
    const card = (await response.json()).data["1"];
    assert.deepEqual(Object.keys(card).sort(), ["assetId", "cardType", "characterId", "gekisouSkillId", "leaderSkillId", "liveSkillId", "powerMax", "rarity", "serverExtensions", "startAt", "subtitle"]);
    assert.deepEqual([card.leaderSkillId, card.liveSkillId, card.gekisouSkillId], [4, 1, 7]);
    assert.deepEqual(card.startAt, ["jp:raw-time", "en:raw-time", "tw:raw-time", "tw:raw-time", "kr:raw-time"]);
    assert.deepEqual(card.serverExtensions, [{}, {}, {}, {}, {}]);
    assert.equal(card.powerMax.performance, 10156);
    const member = (await (await detail(request("cards/member/1"), context())).json()).data;
    const { growth: memberGrowth, ...memberSummary } = member;
    assert.deepEqual(memberSummary, card);
    assert.ok(memberGrowth);
    assert.deepEqual(Object.keys(member.growth).sort(), ["awake", "awakeResource", "level", "rank"]);
    assert.deepEqual(Object.keys(member.growth.level[0]).sort(), ["exp", "level", "performanceRate", "technicRate", "visualRate"]);
    assert.equal(JSON.stringify(member).includes("must-not-be-public"), false);
    for (const field of ["source", "characters", "kind", "server", "availability", "description"]) assert.equal(Object.hasOwn(member, field), false);
    const support = (await (await detail(request("cards/support/1"), context("support"))).json()).data;
    assert.deepEqual([support.supportSkillId01, support.supportSkillId02, support.gekisouSupportSkillId01, support.gekisouSupportSkillId02], [1, 0, 31, 0]);
    assert.deepEqual(support.characterIds, [1]);
    assert.deepEqual(Object.keys(support.growth).sort(), ["level", "rank"]);
    assert.equal(Object.hasOwn(support, "subtitle"), false);
    const all = (await (await list(request("cards/support"), context("support"))).json()).data;
    assert.deepEqual(Object.keys(all["1"]).sort(), ["assetId", "cardType", "characterIds", "description", "gekisouSupportSkillId01", "gekisouSupportSkillId02", "name", "powerMax", "rarity", "serverExtensions", "startAt", "supportSkillId01", "supportSkillId02"]);
    const { growth: supportGrowth, ...supportSummary } = support;
    assert.deepEqual(supportSummary, all["1"]);
    assert.ok(supportGrowth);
    assert.deepEqual(all["70"].characterIds, [6, 7, 8, 9, 10]);
    assert.deepEqual(all["70"].name, ["", "Ave Mujica", "Ave Mujica", "Ave Mujica", "Ave Mujica"]);
    assert.deepEqual([all["70"].supportSkillId01, all["70"].supportSkillId02, all["70"].gekisouSupportSkillId01, all["70"].gekisouSupportSkillId02], [71, 73, 0, 0]);
    assert.deepEqual(all["70"].serverExtensions, [null, {}, {}, {}, {}]);
    for (let server = 0; server < 5; server++) {
      const selected = await detail(request(`cards/support/70?server=${server}`), context("support", "70"));
      assert.equal(selected.status, server === 0 ? 404 : 200);
      const selectedList = (await (await list(request(`cards/support?server=${server}`), context("support"))).json()).data;
      if (server === 0) assert.equal(Object.hasOwn(selectedList, "70"), false);
      else {
        const { growth, ...summary } = (await selected.json()).data;
        assert.ok(growth);
        assert.equal(Object.hasOwn(summary, "serverExtensions"), false);
        const expected = { ...all["70"] };
        delete expected.serverExtensions;
        assert.deepEqual(summary, expected);
        assert.deepEqual(selectedList["70"], expected);
      }
    }
    assert.strictEqual(await readOurNotesCards("support", 2), await readOurNotesCards("support", 3));
    const character = (await (await characters(request("characters"))).json()).data["1"];
    assert.deepEqual(character.characterName, ["jp:ja", "en:en", "tw:zh-TW", "tw:zh-CN", "kr:ko"]);
    assert.deepEqual(Object.keys(character).sort(), ["bandId", "characterName", "colorCode", "displayOrder", "shortName"]);
    const band = (await (await bands(request("bands"))).json()).data[String(character.bandId)];
    assert.deepEqual(Object.keys(band).sort(), ["bandName", "colorCode"]);
    // The fixture contains no public image index or images; API reads still succeed.
  });
});

test("member names follow text references, retaining stage names without duplicating character names", () => {
  const inputs = regions();
  // Reuse bounded growth/stat rows; these name references are from members 6, 31 and 56.
  for (const input of inputs) {
    for (const id of [6, 31, 56]) {
      const card = structuredClone(input.member_cards.cards[0]);
      card.id = card.source._id = id;
      card.assetId = card.source._assetID = id;
      card.characterIds = [6]; card.source._characterID = 6;
      card.characters = [{ _id: 6, _nameTextID: "Character_Name_Doloris_Uika" }];
      card.source._nameTextID = id === 56 ? "Character_Name_Doloris_Uika" : "Character_Live_Name_Doloris";
      card.name = Object.fromEntries(locales.map((locale) => [locale, id === 56 ? "Doloris / Uika Misumi" : "Doloris"]));
      input.member_cards.cards.push(card);
    }
  }
  inputs[0].member_cards.cards = inputs[0].member_cards.cards.filter((card) => card.id !== 56);
  inputs[2].member_cards.cards.find((card) => card.id === 6).name["zh-CN"] = "";
  const merged = mergeOurNotesCards(inputs.map((input) => input.member_cards), "member");
  for (const records of [merged.summaries, merged.details]) {
    for (const id of [1, 56]) assert.equal(Object.hasOwn(records[id], "name"), false);
    assert.deepEqual(records[6].name, ["Doloris", "Doloris", "Doloris", "", "Doloris"]);
    assert.deepEqual(records[31].name, Array(5).fill("Doloris"));
  }
  // A single differing source retains the complete name even when its current text is equal.
  inputs[1].member_cards.cards[0].source._nameTextID = "Synthetic_Card_Name_Override";
  const regional = mergeOurNotesCards(inputs.map((input) => input.member_cards), "member");
  assert.deepEqual(regional.summaries[1].name, ["jp:ja", "en:en", "tw:zh-TW", "tw:zh-CN", "kr:ko"]);
  assert.deepEqual(regional.details[1].name, regional.summaries[1].name);
});

test("cn_intl follows TW existence while missing translations remain empty", () => {
  const inputs = regions();
  inputs[2].support_cards.cards = inputs[2].support_cards.cards.filter((card) => card.id !== 70);
  inputs[2].member_cards.cards[0].name["zh-CN"] = "";
  inputs[2].member_cards.cards[0].source._nameTextID = "Synthetic_Card_Name_Override";
  const support = mergeOurNotesCards(inputs.map((input) => input.support_cards), "support");
  assert.deepEqual(support.summaries["70"].serverExtensions, [null, {}, null, null, {}]);
  const member = mergeOurNotesCards(inputs.map((input) => input.member_cards), "member").summaries["1"];
  assert.equal(member.name[3], "");
  assert.deepEqual(member.serverExtensions[3], {});
});

test("query and ID errors are explicit, uncached and independent of storage", async () => {
  for (const query of ["server=5", "server=-1", "server=03", "server=", "server=cn_intl", "server=3&server=3", "server=3&locale=zh-CN", "unknown=1"]) {
    for (const response of [await list(request(`cards/member?${query}`), context()), await detail(request(`cards/member/1?${query}`), context())]) {
      assert.equal(response.status, 400);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.equal((await response.json()).success, false);
    }
  }
  for (const route of [characters, bands]) assert.equal((await route(request("characters?server=3"))).status, 400);
  for (const id of ["0", "01", "-1", "NaN", "9007199254740992"]) {
    assert.equal((await detail(request(`cards/member/${id}`), context("member", id))).status, 404);
  }
  assert.equal((await list(request("cards/snapshot"), context("snapshot"))).status, 404);
});

test("invalid Cards bytes, schemas, paths and pack descriptors return sanitized 503", async () => {
  const edits = [
    (objects) => objects.delete(pointerKey("tw")),
    (objects) => editPointer(objects, (p) => { p.schema = "unknown"; }),
    (objects) => editPointer(objects, (p) => { p.artifact.key = "ournotes/master/jp/../private"; }),
    (objects) => editPointer(objects, (p) => { p.datasets.member_cards.recordCount += 1; }),
    (objects) => editPointer(objects, (p) => { p.datasets.member_cards.compressedSize = 17 * 1024 * 1024; }),
    (objects) => editPointer(objects, (p) => { p.datasets.member_cards.semanticSha256 = "0".repeat(64); }),
    (objects) => editPointer(objects, (p) => { objects.set(p.datasets.member_cards.key, Buffer.from("damaged")); }),
  ];
  for (const edit of edits) {
    await withStore(regions(), edit, async () => {
      const response = await list(request("cards/member"), context());
      assert.equal(response.status, 503);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.deepEqual(await response.json(), { success: false, error: { code: "OURNOTES_MASTER_UNAVAILABLE", message: "OurNotes master data is unavailable" } });
    });
  }
});

test("regional structural conflicts and broken references fail rather than silently prefer JP", async () => {
  const conflict = regions();
  const card = conflict[1].member_cards.cards[0];
  card.powerMax.visual += 1; card.source._visualPowerMax += 1;
  await withStore(conflict, null, async () => assert.equal((await list(request("cards/member"), context())).status, 503));
  const broken = regions();
  broken[2].member_cards.cards[0].skills._leaderSkillID = [];
  assert.throws(() => mergeOurNotesCards(broken.map((input) => input.member_cards), "member"));
  const duplicate = regions();
  duplicate[0].member_cards.cards.push(duplicate[0].member_cards.cards[0]);
  assert.throws(() => mergeOurNotesCards(duplicate.map((input) => input.member_cards), "member"));
  for (const corrupt of [
    (card) => { card.id += 1; },
    (card) => { delete card.source._nameTextID; },
    (card) => { card.characters[0]._nameTextID = ""; },
    (card) => { card.source._leaderSkillID = 5; card.skills._leaderSkillID[0]._id = 5; },
  ]) {
    const invalid = regions();
    corrupt(invalid[1].member_cards.cards[0]);
    assert.throws(() => mergeOurNotesCards(invalid.map((input) => input.member_cards), "member"));
  }
  const catalogs = regions().map((input) => input.characters);
  catalogs[1]["1"].bandId += 1;
  assert.throws(() => mergeOurNotesCatalog(catalogs, "characters"));
});

test("concurrent reads reuse four sources, warm reads do no IO, and pointer changes refresh one pack", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const input = regions();
  const objects = storeObjects(input);
  const calls = [];
  const source = { scope: randomUUID(), read: async (key, options) => {
    calls.push(key);
    const body = objects.get(key);
    assert.ok(body, `unexpected source request: ${key}`);
    assert.ok(body.length <= options.maxBytes);
    await Promise.resolve();
    return { ok: true, status: 200, headers: new Headers({ "content-length": String(body.length) }),
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length), json: async () => JSON.parse(body) };
  } };
  const batches = await Promise.all(Array.from({ length: 6 }, () => readOurNotesCardInputs("member", source)));
  assert.equal(calls.length, 8); // Four pointers and packs; cn_intl makes no request.
  assert.ok(batches.every((batch) => batch.every((value, i) => value === batches[0][i])));
  await readOurNotesCardInputs("member", source);
  assert.equal(calls.length, 8);
  input[2].member_cards.cards[0].name["zh-CN"] = "updated";
  input[2].member_cards.cards[0].source._nameTextID = "Synthetic_Card_Name_Override";
  for (const [key, bytes] of storeObjects(input)) objects.set(key, bytes);
  now += 60_001;
  const updated = await readOurNotesCardInputs("member", source);
  assert.equal(calls.length, 13); // Four pointers plus the changed TW pack.
  assert.equal(mergeOurNotesCards(updated, "member").summaries["1"].name[3], "updated");
});

test("every dataset has a read deadline and timed-out reads recover without poisoning the cache", async () => {
  const objects = storeObjects();
  for (const dataset of ["member_cards", "support_cards", "characters", "bands", "skills"]) {
    const calls = [];
    let fail = true;
    const source = { scope: randomUUID(), read: async (key, options) => {
      calls.push({ key, timeoutMs: options.timeoutMs });
      if (fail && key.endsWith(".gz")) throw Object.assign(new Error("private source timeout"), { code: "ETIMEDOUT" });
      const body = objects.get(key);
      assert.ok(body);
      return { ok: true, status: 200, headers: new Headers(),
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length), json: async () => JSON.parse(body) };
    } };
    const read = () => dataset.endsWith("_cards") ? readOurNotesCardInputs(dataset.replace("_cards", ""), source) : readOurNotesMasterInputs(dataset, source);
    let failure;
    await assert.rejects(read(), (error) => { failure = error; return true; });
    const response = ourNotesRouteError(failure);
    assert.equal(response.status, 503);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.deepEqual(await response.json(), { success: false, error: { code: "OURNOTES_MASTER_UNAVAILABLE", message: "OurNotes master data is unavailable" } });
    const failedCalls = calls.length;
    assert.ok(failedCalls > 4 && failedCalls <= 8);
    assert.ok(calls.every(({ timeoutMs }) => timeoutMs === 15_000));
    fail = false;
    const recovered = await read();
    const recoveredCalls = calls.length;
    assert.equal(recoveredCalls - failedCalls, failedCalls - 4);
    assert.equal(recovered.length, 4);
    await read();
    assert.equal(calls.length, recoveredCalls);
  }
});

test("production refuses local-store overrides without touching storage", async (t) => {
  const beforeEnv = process.env.NODE_ENV;
  const beforeStore = process.env.OURNOTES_MASTER_LOCAL_STORE_ROOT;
  process.env.NODE_ENV = "production";
  process.env.OURNOTES_MASTER_LOCAL_STORE_ROOT = "/unused";
  t.after(() => {
    if (beforeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = beforeEnv;
    if (beforeStore === undefined) delete process.env.OURNOTES_MASTER_LOCAL_STORE_ROOT; else process.env.OURNOTES_MASTER_LOCAL_STORE_ROOT = beforeStore;
  });
  assert.equal((await bands(request("bands"))).status, 503);
});

function memorySource(objects, calls = []) {
  return { scope: randomUUID(), read: async (key, options) => {
    calls.push(key);
    const body = objects.get(key);
    assert.ok(body, `unexpected dependency: ${key}`);
    assert.ok(body.length <= options.maxBytes);
    return { ok: true, status: 200, headers: new Headers(),
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length), json: async () => JSON.parse(body) };
  } };
}

test("master catalogs and Cards snapshots have independent discovery and failures", async () => {
  await withStore(regions(), (objects) => {
    for (const key of objects.keys()) if (key.includes("/cards-v1/")) objects.delete(key);
  }, async () => {
    assert.equal((await characters(request("characters"))).status, 200);
    assert.equal((await bands(request("bands"))).status, 200);
    assert.equal((await skills(request("skills"))).status, 200);
    assert.equal((await list(request("cards/member"), context())).status, 503);
  });
  await withStore(regions(), (objects) => {
    for (const key of objects.keys()) if (!key.includes("/cards-v1/")) objects.delete(key);
  }, async () => {
    assert.equal((await list(request("cards/member"), context())).status, 200);
    assert.equal((await characters(request("characters"))).status, 503);
    assert.equal((await skills(request("skills"))).status, 503);
  });
});

test("skills preserve fixed grade arrays and merge localized templates with parameter remapping", async () => {
  const inputs = regions();
  for (const [index, input] of inputs.entries()) {
    const row = input.skills.live["1"];
    row.privateOnly = "must-not-be-public";
    const parameters = [["10", "11", "12", "13", "14"], ["25", "26", "27", "28", "29"]];
    row.descriptionParameters = index === 1 ? parameters.toReversed() : parameters;
    for (const locale of locales) {
      row.skillName[locale] = `${servers[index]}:${locale}`;
      row.description[locale] = `${servers[index]}:${locale}:{${index === 1 || (index === 2 && locale === "zh-CN") ? 1 : 0}}%`;
    }
  }
  await withStore(inputs, null, async () => {
    const response = await skills(request("skills"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /public/);
    const { data } = await response.json();
    assert.deepEqual(Object.keys(data).sort(), ["gekisou", "gekisouSupport", "leader", "live", "support"]);
    const fieldOrders = {
      leader: ["skillName", "description", "descriptionParameters", "effects", "skillIconId"],
      live: ["skillName", "description", "descriptionParameters", "effects", "skillIconId", "skillCategories", "displaySkillCategories"],
      gekisou: ["skillName", "description", "descriptionParameters", "effects", "skillIconId", "skillCategories", "displaySkillCategories", "gekisouMissionType"],
      support: ["skillName", "description", "descriptionParameters", "effects", "skillIconId", "displaySkillCategories"],
      gekisouSupport: ["skillName", "description", "descriptionParameters", "effects", "skillIconId", "displaySkillCategories", "gekisouMissionType", "gekisouSupportSkillExecTiming"],
    };
    for (const kind of Object.keys(data)) {
      assert.ok(data[kind]["1"]);
      assert.deepEqual(Object.keys(data[kind]["1"]), fieldOrders[kind]);
      assert.equal(data[kind]["1"].description.length, 5);
      for (const effect of data[kind]["1"].effects) {
        assert.equal(effect.effectValue.length, 5);
        assert.equal(Object.hasOwn(effect, "level"), false);
      }
      assert.equal(Object.hasOwn(data[kind]["1"], "id"), false);
      assert.equal(Object.hasOwn(data[kind]["1"], "kind"), false);
    }
    assert.deepEqual(data.live["1"].skillName, ["jp:ja", "en:en", "tw:zh-TW", "tw:zh-CN", "kr:ko"]);
    assert.deepEqual(data.live["1"].description, ["jp:ja:{0}%", "en:en:{0}%", "tw:zh-TW:{0}%", "tw:zh-CN:{1}%", "kr:ko:{0}%"]);
    assert.deepEqual(data.live["1"].descriptionParameters, [["10", "11", "12", "13", "14"], ["25", "26", "27", "28", "29"]]);
    assert.deepEqual(data.leader["90146"].description, ["", "", "", "", ""]);
    assert.deepEqual(data.leader["90146"].effects, []);
    assert.deepEqual(data.leader["90146"].descriptionParameters, []);
    assert.equal(JSON.stringify(data).includes("must-not-be-public"), false);
    assert.strictEqual(await readOurNotesSkills(), await readOurNotesSkills());
  });
  delete inputs[0].skills.live["1"];
  // Keep this family nonempty while testing a source-specific missing ID.
  inputs[0].skills.live["2"] = structuredClone(inputs[1].skills.live["1"]);
  inputs[2].skills.live["1"].description["zh-CN"] = "";
  const merged = mergeOurNotesSkills(inputs.map((input) => input.skills));
  assert.equal(merged.live["1"].skillName[0], "");
  assert.equal(merged.live["1"].description[3], "");
  for (const query of ["server=0", "locale=ja", "level=5", "unknown=1"])
    assert.equal((await skills(request(`skills?${query}`))).status, 400);
});

test("skills keep raw effects separate from native display values and conditional wording", () => {
  const data = mergeOurNotesSkills(skillFixture.datasets);
  const render = (skill, level, slot) => skill.description[slot].replace(/\{(\d+)\}/gu, (_, index) => skill.descriptionParameters[Number(index)][level - 1]);
  const support = data.support["1"];
  assert.deepEqual(support.effects[0].effectValue, [250, 500, 750, 1000, 1500]);
  assert.deepEqual(support.effects[0].activationTimeSecond, [0, 0, 0, 0, 0]);
  assert.equal(render(support, 1, 3), "装配此技能的成员的演出技能发动时间延长0.25秒\n若为「MyGO!!!!!」成员，\n则演出技能发动时间延长0.5秒");
  assert.equal(render(support, 5, 3), "装配此技能的成员的演出技能发动时间延长1.5秒\n若为「MyGO!!!!!」成员，\n则演出技能发动时间延长3秒");
  assert.equal(render(data.gekisou["2"], 1, 3), "JUST激奏开始后2秒内\nJUST获得量提升2");
  assert.equal(render(data.gekisou["2"], 5, 3), "JUST激奏期间\nJUST获得量提升2");
  const effect = data.gekisouSupport["67"].effects[0];
  assert.deepEqual(effect.effectValue, [2, 2, 2, 2, 2]);
  assert.deepEqual(Object.keys(effect.skillConditions), ["1", "2", "3", "4", "5"]);
  assert.equal(render(data.gekisouSupport["67"], 4, 0).match(/null/gu).length, 2);
  assert.deepEqual(data.gekisouSupport["76"].effects[0].effectValue, [0, 0, 0, 0, 0]);
  for (const effect of data.gekisou["22"].effects) {
    assert.deepEqual(effect.skillReleaseConditions, {
      1: [], 2: [], 3: [], 4: [],
      5: [[{ conditionType: 7013, conditionValues: [], conditionTargets: [], isPositive: true }]],
    });
  }
  assert.deepEqual(data.gekisou["22"].description.slice(1), ["", "", "", ""]);
});

test("invalid skills fail only the skills read and never expose partial templates", async () => {
  for (const mutate of [
    (s) => { s.live["1"].description.en = "{effects[0].value}"; },
    (s) => { s.live["1"].description.en = "<color=#fff>10</color>"; },
    (s) => { s.live["1"].description.en = "{999}"; },
    (s) => { s.live["1"].descriptionParameters[0].pop(); },
    (s) => { s.live["1"].skillIconId += 1; },
    (s) => { s.live["1"].effects[0].effectValue.pop(); },
    (s) => { s.live["1"].effects[0].effectValue[0] += 1; },
    (s) => { s.live["1"].effects[0].effectValue[0] = NaN; },
    (s) => { delete s.gekisouSupport["67"].effects[0].skillConditions["5"]; },
    (s) => { s.gekisou["1"].effects[0].skillReleaseConditions = { 1: [], 2: [], 3: [], 4: [] }; },
    (s) => { s.support["1"].effects[0].skillConditions[0][0].isPositive = 1; },
    (s) => { delete s.live["1"].skillCategories; },
    (s) => { s.support["0"] = s.support["1"]; },
  ]) {
    const inputs = regions(); mutate(inputs[1].skills);
    await withStore(inputs, null, async () => {
      const response = await skills(request("skills"));
      assert.equal(response.status, 503);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.deepEqual(await response.json(), { success: false, error: { code: "OURNOTES_MASTER_UNAVAILABLE", message: "OurNotes master data is unavailable" } });
      assert.equal((await characters(request("characters"))).status, 200);
      assert.equal((await bands(request("bands"))).status, 200);
      assert.equal((await list(request("cards/member"), context())).status, 200);
    });
  }
  await withStore(regions(), (objects) => {
    for (const key of objects.keys()) if (key.endsWith("/skills.json.gz")) objects.delete(key);
  }, async () => {
    assert.equal((await skills(request("skills"))).status, 503);
    assert.equal((await bands(request("bands"))).status, 200);
  });
});

test("a skills update fetches only the changed skills content and reuses other modules", async (t) => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const inputs = regions(), objects = storeObjects(inputs), calls = [];
  const source = memorySource(objects, calls);
  const beforeSkills = await readOurNotesMasterInputs("skills", source);
  const beforeCharacters = await readOurNotesMasterInputs("characters", source);
  assert.ok(calls.every((key) => key.endsWith("/active/manifest.json") || /\/(skills|characters)\.json\.gz$/.test(key)));
  for (const [key, body] of storeObjects(inputs, "new-skill-recipe")) objects.set(key, body);
  now += 60_001;
  const start = calls.length;
  assert.ok((await readOurNotesMasterInputs("skills", source)).every((value, i) => value === beforeSkills[i]));
  assert.equal(calls.length - start, 4);
  inputs[2].skills.live["1"].description["zh-CN"] = "changed";
  for (const [key, body] of storeObjects(inputs, "new-skill-recipe")) objects.set(key, body);
  now += 60_001;
  const updatedAt = calls.length;
  const afterSkills = await readOurNotesMasterInputs("skills", source);
  assert.notStrictEqual(afterSkills[2], beforeSkills[2]);
  assert.equal(calls.length - updatedAt, 5);
  assert.ok((await readOurNotesMasterInputs("characters", source)).every((value, i) => value === beforeCharacters[i]));
  assert.equal(calls.length - updatedAt, 5);
});

test("unrelated datasets and producer revisions preserve readers and content caches", async (t) => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const inputs = regions(), objects = storeObjects(inputs), calls = [];
  const source = memorySource(objects, calls);
  const before = await readOurNotesMasterInputs("characters", source);
  const oldCards = await readOurNotesCardInputs("member", source);
  for (const [key, body] of storeObjects(inputs, "new-producer-recipe")) objects.set(key, body);
  for (const server of servers) {
    const key = `ournotes/master/${server}/active/manifest.json`;
    const manifest = JSON.parse(objects.get(key));
    manifest.selectedTables.push("MasterFutureModule");
    manifest.files.push({ path: "normalized/future_module.json", sha256: hash("{}"), size: 2 });
    objects.set(key, encoded(manifest));
  }
  now += 60_001;
  const start = calls.length;
  const after = await readOurNotesMasterInputs("characters", source);
  const cards = await readOurNotesCardInputs("member", source);
  assert.ok(after.every((value, i) => value === before[i]));
  assert.ok(cards.every((value, i) => value === oldCards[i]));
  assert.equal(calls.length - start, 8); // Only the four master roots and four Cards roots.
  await assert.rejects(readOurNotesMasterInputs("unpublished_module", source));
  assert.ok((await readOurNotesMasterInputs("characters", source)).every((value, i) => value === before[i]));
});

test("generic master retains schema, source, path, dependency and byte validation", async () => {
  for (const mutate of [
    (m) => { m.schema = "unknown"; },
    (m) => { m.server = "jp"; },
    (m) => { m.generation = "../escape"; },
    (m) => { m.files.push(m.files[0]); },
    (m) => { m.files[0].path = "raw/../private"; },
    (m) => { m.files = m.files.filter((f) => f.path !== "normalized/characters.json.gz"); },
    (m) => { m.files.find((f) => f.path === "normalized/characters.json").sha256 = "0".repeat(64); },
    (m) => { m.files.find((f) => f.path === "normalized/characters.json.gz").size += 1; },
    (m) => { m.files.find((f) => f.path === "normalized/characters.json").size = 17 * 1024 * 1024; },
  ]) {
    await withStore(regions(), (objects) => {
      const key = "ournotes/master/tw/active/manifest.json";
      const manifest = JSON.parse(objects.get(key)); mutate(manifest); objects.set(key, encoded(manifest));
    }, async () => {
      assert.equal((await characters(request("characters"))).status, 503);
      assert.equal((await list(request("cards/member"), context())).status, 200);
    });
  }
});
