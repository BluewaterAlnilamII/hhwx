import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setDefaultAutoSelectFamily } from "node:net";

setDefaultAutoSelectFamily(true);

const apiBaseUrl = (process.env.HHWX_BANDORI_API_BASE_URL ?? "https://hhwx.org").replace(/\/$/u, "");
const assetBaseUrl = (process.env.HHWX_BANDORI_ASSET_BASE_URL ?? "https://cdn.hhwx.org").replace(/\/$/u, "");
const serverOrder = ["jp", "en", "tw", "cn"];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  assert.equal(response.ok, true, `${url} returned ${response.status}: ${body.slice(0, 200)}`);
  return {
    body: JSON.parse(body),
    rawBody: body,
    cacheControl: response.headers.get("cache-control"),
  };
}

function readApiData(payload, label) {
  assert.equal(isRecord(payload), true, `${label} response must be an object`);
  assert.deepEqual(Object.keys(payload), ["success", "data"], `${label} envelope fields changed`);
  assert.equal(payload.success, true, `${label} response was unsuccessful`);
  assert.equal(isRecord(payload.data), true, `${label} data must be an ID map`);
  return payload.data;
}

function requireFourSlots(value, label) {
  assert.equal(Array.isArray(value), true, `${label} must be an array`);
  assert.equal(value.length, serverOrder.length, `${label} must use JP/EN/TW/CN slots`);
}

const indexesPromise = Promise.all([
  readJson(`${assetBaseUrl}/bandori/events/index.json`),
  readJson(`${assetBaseUrl}/bandori/cards/index.json`),
  readJson(`${assetBaseUrl}/bandori/degrees/index.json`),
  readJson(`${assetBaseUrl}/bandori/music/index.json`),
  readJson(`${assetBaseUrl}/bandori/music/meta.json`),
  readJson(`${assetBaseUrl}/bandori/stamps/index.json`),
]);
// Read private snapshot APIs serially so a release audit does not create an
// artificial R2 burst across every large aggregate pack at once.
const eventsApi = await readJson(`${apiBaseUrl}/api/bandori/master/events`);
const cardsApi = await readJson(`${apiBaseUrl}/api/bandori/master/cards`);
const degreesApi = await readJson(`${apiBaseUrl}/api/bandori/master/degrees`);
const musicApi = await readJson(`${apiBaseUrl}/api/bandori/master/music`);
const musicDetailApi = await readJson(`${apiBaseUrl}/api/bandori/master/music/181`);
const musicMetaApi = await readJson(`${apiBaseUrl}/api/bandori/master/music/meta`);
const stampsApi = await readJson(`${apiBaseUrl}/api/bandori/master/stamps`);
const [
  eventsIndexResponse,
  cardsIndexResponse,
  degreesIndexResponse,
  musicIndexResponse,
  musicMetaIndexResponse,
  stampsIndexResponse,
] = await indexesPromise;

const events = readApiData(eventsApi.body, "Events API");
const cards = readApiData(cardsApi.body, "Cards API");
const degrees = readApiData(degreesApi.body, "Degrees API");
const music = readApiData(musicApi.body, "Music API");
const musicDetail = readApiData(musicDetailApi.body, "Music detail API");
const musicMeta = readApiData(musicMetaApi.body, "Music meta API");
const stamps = readApiData(stampsApi.body, "Stamps API");
const eventsIndex = eventsIndexResponse.body;
const cardsIndex = cardsIndexResponse.body;
const degreesIndex = degreesIndexResponse.body;
const musicIndex = musicIndexResponse.body;
const musicMetaIndex = musicMetaIndexResponse.body;
const stampsIndex = stampsIndexResponse.body;

assert.deepEqual(Object.keys(eventsIndex), ["schemaVersion", "updatedAt", "events"]);
assert.deepEqual(Object.keys(cardsIndex), ["schemaVersion", "updatedAt", "resources"]);
assert.deepEqual(Object.keys(degreesIndex), ["schemaVersion", "updatedAt", "resources"]);
assert.equal(
  degreesIndex.schemaVersion === 1 || degreesIndex.schemaVersion === 2,
  true,
  "Degrees index must use schema 1 or 2 during rollout",
);
assert.deepEqual(Object.keys(musicIndex), ["schemaVersion", "updatedAt", "songs"]);
assert.deepEqual(
  Object.keys(musicMetaIndex),
  ["schemaVersion", "updatedAt", "musicIndexSha256", "durations", "songs"],
);
assert.equal(
  musicMetaIndex.musicIndexSha256,
  createHash("sha256").update(musicIndexResponse.rawBody).digest("hex"),
  "Music meta must reference the exact current music index bytes",
);
assert.deepEqual(
  musicMeta,
  { durations: musicMetaIndex.durations, songs: musicMetaIndex.songs },
  "Music meta API and asset root diverged",
);
assert.deepEqual(Object.keys(stampsIndex), ["schemaVersion", "updatedAt", "stamps", "changedStampGroups"]);
assert.deepEqual(Object.keys(stampsIndex.changedStampGroups), serverOrder);

for (const [eventId, event] of Object.entries(events)) {
  assert.equal(isRecord(event), true, `event ${eventId} must be an object`);
  requireFourSlots(event.stampRewardId, `event ${eventId} stampRewardId`);
  const resolvedImageNames = new Set();
  const resolvedCharacterIds = new Set();
  for (let slot = 0; slot < serverOrder.length; slot += 1) {
    const stampId = event.stampRewardId[slot];
    if (stampId === null) {
      continue;
    }
    assert.equal(Number.isInteger(stampId) && stampId > 0, true, `event ${eventId} has an invalid stamp ID`);
    const stamp = stamps[String(stampId)];
    assert.equal(isRecord(stamp), true, `event ${eventId} stamp ${stampId} is missing from the Stamps API`);
    requireFourSlots(stamp.imageName, `stamp ${stampId} imageName`);
    requireFourSlots(stamp.characterId, `stamp ${stampId} characterId`);
    const imageName = stamp.imageName[slot];
    const characterId = stamp.characterId[slot];
    assert.equal(typeof imageName === "string" && imageName.length > 0, true, `event ${eventId} stamp image is missing`);
    assert.equal(Number.isInteger(characterId) && characterId > 0, true, `event ${eventId} stamp character is missing`);
    resolvedImageNames.add(imageName);
    resolvedCharacterIds.add(characterId);
  }
  assert.equal(resolvedImageNames.size <= 1, true, `event ${eventId} stamp images disagree across servers`);
  assert.equal(resolvedCharacterIds.size <= 1, true, `event ${eventId} stamp characters disagree across servers`);
  const expectedCharacterId = resolvedCharacterIds.size === 1
    ? resolvedCharacterIds.values().next().value
    : null;
  assert.equal(event.stampCharacterId, expectedCharacterId, `event ${eventId} scalar stamp character changed`);
  const asset = eventsIndex.events[eventId];
  assert.equal(isRecord(asset), true, `event ${eventId} is missing from the asset index`);
  requireFourSlots(asset.banners, `event ${eventId} banners`);
}

assert.deepEqual(events["4"].stampRewardId, [104, 104, 104, 104]);
assert.equal(events["4"].stampCharacterId, 3);
assert.deepEqual(events["299"].stampRewardId, [501, 501, 50100, 501]);
assert.equal(events["299"].stampCharacterId, 6);
assert.deepEqual(events["5001"].stampRewardId, [null, null, 309, null]);
assert.equal(events["5001"].stampCharacterId, 27);

const requiredCardResources = new Set();
for (const [cardId, card] of Object.entries(cards)) {
  assert.equal(isRecord(card), true, `card ${cardId} must be an object`);
  if (typeof card.resourceSetName === "string" && card.resourceSetName) {
    requiredCardResources.add(card.resourceSetName);
  }
  if (Array.isArray(card.serverExtensions)) {
    requireFourSlots(card.serverExtensions, `card ${cardId} serverExtensions`);
    for (const extension of card.serverExtensions) {
      if (isRecord(extension) && typeof extension.resourceSetName === "string" && extension.resourceSetName) {
        requiredCardResources.add(extension.resourceSetName);
      }
    }
  }
}
for (const resourceSetName of requiredCardResources) {
  assert.equal(
    isRecord(cardsIndex.resources[resourceSetName]),
    true,
    `card resource ${resourceSetName} is missing from the asset index`,
  );
}

const degreeStringFields = [
  "degreeType",
  "iconImageName",
  "baseImageName",
  "rank",
  "degreeName",
  "description",
];
const degreeNumberFields = ["seq", "characterId"];
for (const [degreeId, degree] of Object.entries(degrees)) {
  assert.equal(isRecord(degree), true, `degree ${degreeId} must be an object`);
  const hasServerExtensions = Object.hasOwn(degree, "serverExtensions");
  assert.deepEqual(
    Object.keys(degree),
    [
      ...degreeStringFields,
      ...degreeNumberFields,
      ...(hasServerExtensions ? ["serverExtensions"] : []),
    ],
    `degree ${degreeId} fields changed`,
  );
  for (const field of [...degreeStringFields, ...degreeNumberFields]) {
    requireFourSlots(degree[field], `degree ${degreeId} ${field}`);
  }
  if (hasServerExtensions) {
    requireFourSlots(degree.serverExtensions, `degree ${degreeId} serverExtensions`);
  }
  let hasDegreeEffect = false;
  for (let slot = 0; slot < serverOrder.length; slot += 1) {
    for (const field of degreeStringFields) {
      assert.equal(typeof degree[field][slot], "string", `degree ${degreeId} ${field} must be a string`);
    }
    for (const field of degreeNumberFields) {
      assert.equal(
        Number.isInteger(degree[field][slot]) && degree[field][slot] >= 0,
        true,
        `degree ${degreeId} ${field} must be a non-negative integer`,
      );
    }
    const server = serverOrder[slot];
    const hasRegionalRecord = degreeStringFields.some((field) => degree[field][slot] !== "")
      || degreeNumberFields.some((field) => degree[field][slot] !== 0);
    const extension = hasServerExtensions ? degree.serverExtensions[slot] : undefined;
    if (!hasRegionalRecord) {
      if (hasServerExtensions) {
        assert.equal(extension, null, `degree ${degreeId} ${server} missing slot extension must be null`);
      }
      continue;
    }
    if (hasServerExtensions) {
      assert.equal(isRecord(extension), true, `degree ${degreeId} ${server} populated slot extension must be an object`);
      if (Object.keys(extension).length > 0) {
        assert.equal(server, "cn", `degree ${degreeId} has a non-CN server extension`);
        assert.deepEqual(Object.keys(extension), ["degreeEffect"]);
        assert.equal(isRecord(extension.degreeEffect), true, `degree ${degreeId} CN degreeEffect is invalid`);
        assert.deepEqual(
          Object.keys(extension.degreeEffect).sort(),
          ["biliDegreeEffectId", "seq", "degreeEffectType", "assetBundleName", "description"].sort(),
        );
        assert.equal(
          Number.isSafeInteger(extension.degreeEffect.biliDegreeEffectId)
            && extension.degreeEffect.biliDegreeEffectId > 0,
          true,
          `degree ${degreeId} CN effect ID is invalid`,
        );
        assert.equal(
          Number.isSafeInteger(extension.degreeEffect.seq) && extension.degreeEffect.seq > 0,
          true,
          `degree ${degreeId} CN effect seq is invalid`,
        );
        for (const field of ["degreeEffectType", "assetBundleName", "description"]) {
          assert.equal(
            typeof extension.degreeEffect[field] === "string",
            true,
            `degree ${degreeId} CN effect ${field} is invalid`,
          );
        }
        const effectResource = degreesIndex.resources[extension.degreeEffect.assetBundleName];
        assert.equal(degreesIndex.schemaVersion, 2, `degree ${degreeId} effect requires index schema 2`);
        assert.equal(isRecord(effectResource), true, `degree ${degreeId} effect resource is missing`);
        assert.deepEqual(Object.keys(effectResource), ["effects"]);
        assert.equal(isRecord(effectResource.effects), true, `degree ${degreeId} effect map is invalid`);
        assert.deepEqual(Object.keys(effectResource.effects), ["cn"]);
        assert.equal(isRecord(effectResource.effects.cn), true, `degree ${degreeId} CN effect descriptor is missing`);
        assert.deepEqual(Object.keys(effectResource.effects.cn), ["manifest", "atlas"]);
        hasDegreeEffect = true;
      }
    }

    const requireDegreeResource = (resourceName, role, allowAnimation) => {
      assert.equal(Boolean(resourceName), true, `degree ${degreeId} ${server} ${role} name is missing`);
      const resource = degreesIndex.resources[resourceName];
      assert.equal(isRecord(resource), true, `degree ${degreeId} ${server} ${role} resource ${resourceName} is missing`);
      const image = Array.isArray(resource.images) ? resource.images[slot] : null;
      const animation = isRecord(resource.animations)
        ? resource.animations[server]
        : undefined;
      if (allowAnimation && resourceName.startsWith("ani_degree")) {
        assert.equal(Boolean(image), false, `degree ${degreeId} ${server} dynamic base must not use a static image`);
        assert.equal(isRecord(animation), true, `degree ${degreeId} ${server} dynamic base animation is missing`);
        assert.deepEqual(Object.keys(animation), ["manifest", "atlas"]);
      } else {
        assert.equal(Boolean(image), true, `degree ${degreeId} ${server} ${role} image is missing`);
        assert.equal(Boolean(animation), false, `degree ${degreeId} ${server} ${role} must be static`);
      }
    };

    const rank = degree.rank[slot];
    const degreeType = degree.degreeType[slot];
    const iconImageName = degree.iconImageName[slot];
    const rankImageName = rank === "none" ? "rank_none" : `${degreeType}_${rank}`;
    const iconImageResourceName = iconImageName === "none"
      ? "icon_none"
      : `${iconImageName}_${rank}`;
    requireDegreeResource(degree.baseImageName[slot], "base", true);
    requireDegreeResource(rankImageName, "rank", false);
    requireDegreeResource(iconImageResourceName, "icon", false);
  }
  if (hasServerExtensions) {
    assert.equal(hasDegreeEffect, true, `degree ${degreeId} empty serverExtensions must be omitted`);
  }
}

assert.deepEqual(
  Object.keys(music).sort((left, right) => Number(left) - Number(right)),
  Object.keys(musicIndex.songs).sort((left, right) => Number(left) - Number(right)),
  "Music API and asset index ID sets diverged",
);
for (const [musicId, record] of Object.entries(music)) {
  assert.equal(isRecord(record), true, `music ${musicId} must be an object`);
  requireFourSlots(record.bandName, `music ${musicId} bandName`);
  requireFourSlots(record.musicTitle, `music ${musicId} musicTitle`);
  requireFourSlots(record.publishedAt, `music ${musicId} publishedAt`);
  requireFourSlots(record.closedAt, `music ${musicId} closedAt`);
  assert.equal(isRecord(record.difficulty), true, `music ${musicId} difficulty is invalid`);
  assert.equal(isRecord(record.notes), true, `music ${musicId} notes is invalid`);
  assert.equal(isRecord(record.bpm), true, `music ${musicId} bpm is invalid`);
  const indexed = musicIndex.songs[musicId];
  assert.equal(isRecord(indexed), true, `music ${musicId} is missing from the asset index`);
  assert.deepEqual(record.notes, indexed.notes, `music ${musicId} notes diverged from the asset index`);
  assert.deepEqual(record.bpm, indexed.bpm, `music ${musicId} bpm diverged from the asset index`);
  assert.equal(record.length, indexed.length, `music ${musicId} length diverged from the asset index`);
}
assert.deepEqual(musicDetail.notes, music["181"].notes);
assert.deepEqual(musicDetail.bpm, music["181"].bpm);
assert.equal(musicDetail.length, music["181"].length);

for (const [stampId, stamp] of Object.entries(stamps)) {
  assert.equal(isRecord(stamp), true, `stamp ${stampId} must be an object`);
  requireFourSlots(stamp.imageName, `stamp ${stampId} imageName`);
  requireFourSlots(stamp.characterId, `stamp ${stampId} characterId`);
  const asset = stampsIndex.stamps[stampId];
  assert.equal(isRecord(asset), true, `stamp ${stampId} is missing from the asset index`);
  requireFourSlots(asset.images, `stamp ${stampId} asset images`);
  if (isRecord(asset.animations)) {
    for (const animation of Object.values(asset.animations)) {
      const animationFields = Object.keys(animation);
      assert.equal(animationFields.includes("manifest"), true, `stamp ${stampId} animation manifest is missing`);
      assert.equal(animationFields.includes("atlas"), true, `stamp ${stampId} animation atlas is missing`);
      assert.deepEqual(
        animationFields.filter((field) => !["manifest", "atlas", "frameRate", "frameCount"].includes(field)),
        [],
        `stamp ${stampId} animation contains unsupported fields`,
      );
    }
  }
  if (stamp.changedStamps !== undefined) {
    requireFourSlots(stamp.changedStamps, `stamp ${stampId} changedStamps`);
    requireFourSlots(asset.changedStamps, `stamp ${stampId} asset changedStamps`);
    for (let slot = 0; slot < serverOrder.length; slot += 1) {
      assert.equal(
        asset.changedStamps[slot].length,
        stamp.changedStamps[slot].length,
        `stamp ${stampId} ${serverOrder[slot]} Changed variant order/length diverged`,
      );
    }
  }
}

const rejectedQuery = await fetch(`${apiBaseUrl}/api/bandori/master/stamps?unexpected=1`, {
  redirect: "manual",
  signal: AbortSignal.timeout(30_000),
});
assert.equal(rejectedQuery.status, 400, "unsupported master query must return 400");
assert.equal(rejectedQuery.headers.has("location"), false, "unsupported master query must not redirect");
const rejectedBody = await rejectedQuery.json();
assert.equal(rejectedBody?.error?.code, "BANDORI_MASTER_QUERY_INVALID");

for (const removedUrl of [
  `${apiBaseUrl}/api/bandori/master/songs`,
  `${apiBaseUrl}/api/bandori/master/songs/181`,
  `${apiBaseUrl}/api/bandori/songs?ids=181`,
]) {
  const response = await fetch(removedUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 404, `${removedUrl} must be removed`);
}

console.log(JSON.stringify({
  ok: true,
  serverOrder,
  apiRecords: {
    events: Object.keys(events).length,
    cards: Object.keys(cards).length,
    degrees: Object.keys(degrees).length,
    music: Object.keys(music).length,
    musicMeta: Object.keys(musicMeta.songs).length,
    stamps: Object.keys(stamps).length,
  },
  assetRecords: {
    events: Object.keys(eventsIndex.events).length,
    cardResources: Object.keys(cardsIndex.resources).length,
    degreeResources: Object.keys(degreesIndex.resources).length,
    music: Object.keys(musicIndex.songs).length,
    musicMeta: Object.keys(musicMetaIndex.songs).length,
    stamps: Object.keys(stampsIndex.stamps).length,
  },
  cacheControl: {
    eventsApi: eventsApi.cacheControl,
    cardsApi: cardsApi.cacheControl,
    degreesApi: degreesApi.cacheControl,
    musicApi: musicApi.cacheControl,
    musicDetailApi: musicDetailApi.cacheControl,
    musicMetaApi: musicMetaApi.cacheControl,
    stampsApi: stampsApi.cacheControl,
    eventsIndex: eventsIndexResponse.cacheControl,
    cardsIndex: cardsIndexResponse.cacheControl,
    degreesIndex: degreesIndexResponse.cacheControl,
    musicIndex: musicIndexResponse.cacheControl,
    musicMetaIndex: musicMetaIndexResponse.cacheControl,
    stampsIndex: stampsIndexResponse.cacheControl,
  },
}, null, 2));
