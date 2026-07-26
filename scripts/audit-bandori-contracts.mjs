import assert from "node:assert/strict";

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

const [eventsApi, cardsApi, stampsApi, eventsIndexResponse, cardsIndexResponse, stampsIndexResponse] = await Promise.all([
  readJson(`${apiBaseUrl}/api/bandori/master/events`),
  readJson(`${apiBaseUrl}/api/bandori/master/cards`),
  readJson(`${apiBaseUrl}/api/bandori/master/stamps`),
  readJson(`${assetBaseUrl}/bandori/events/index.json`),
  readJson(`${assetBaseUrl}/bandori/cards/index.json`),
  readJson(`${assetBaseUrl}/bandori/stamps/index.json`),
]);

const events = readApiData(eventsApi.body, "Events API");
const cards = readApiData(cardsApi.body, "Cards API");
const stamps = readApiData(stampsApi.body, "Stamps API");
const eventsIndex = eventsIndexResponse.body;
const cardsIndex = cardsIndexResponse.body;
const stampsIndex = stampsIndexResponse.body;

assert.deepEqual(Object.keys(eventsIndex), ["schemaVersion", "updatedAt", "events"]);
assert.deepEqual(Object.keys(cardsIndex), ["schemaVersion", "updatedAt", "resources"]);
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

for (const [stampId, stamp] of Object.entries(stamps)) {
  assert.equal(isRecord(stamp), true, `stamp ${stampId} must be an object`);
  requireFourSlots(stamp.imageName, `stamp ${stampId} imageName`);
  requireFourSlots(stamp.characterId, `stamp ${stampId} characterId`);
  const asset = stampsIndex.stamps[stampId];
  assert.equal(isRecord(asset), true, `stamp ${stampId} is missing from the asset index`);
  requireFourSlots(asset.images, `stamp ${stampId} asset images`);
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

console.log(JSON.stringify({
  ok: true,
  serverOrder,
  apiRecords: {
    events: Object.keys(events).length,
    cards: Object.keys(cards).length,
    stamps: Object.keys(stamps).length,
  },
  assetRecords: {
    events: Object.keys(eventsIndex.events).length,
    cardResources: Object.keys(cardsIndex.resources).length,
    stamps: Object.keys(stampsIndex.stamps).length,
  },
  cacheControl: {
    eventsApi: eventsApi.cacheControl,
    cardsApi: cardsApi.cacheControl,
    stampsApi: stampsApi.cacheControl,
    eventsIndex: eventsIndexResponse.cacheControl,
    cardsIndex: cardsIndexResponse.cacheControl,
    stampsIndex: stampsIndexResponse.cacheControl,
  },
}, null, 2));
