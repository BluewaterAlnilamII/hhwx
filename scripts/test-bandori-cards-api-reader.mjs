import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

const pointerKey = "bandori/master/cards-v1/api/active.json";
const packPrefix = "bandori/master/cards-v1/api/packs";

const {
  readBandoriCardApiDetail,
  readBandoriCardApiDetailForServer,
  readBandoriCardsApiDataset,
  readBandoriCardsApiDatasetForServer,
} = await import("../src/lib/bandori/cards/api-server.ts");
const { GET: readMasterDatasetRoute } = await import(
  "../src/app/api/bandori/master/[dataset]/route.ts"
);
const { GET: readCardDetailRoute } = await import(
  "../src/app/api/bandori/master/cards/[cardId]/route.ts"
);

async function writeObject(root, key, body) {
  const path = join(root, ...key.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return path;
}

function pack(keyPrefix, payload, options = {}) {
  const body = options.corrupt
    ? Buffer.from("not-a-gzip-pack")
    : gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { mtime: 0 });
  const compressedSha256 = createHash("sha256").update(body).digest("hex");
  return {
    body,
    descriptor: {
      key: `${keyPrefix}/${compressedSha256}.json.gz`,
      semanticSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      compressedSha256,
      compressedSize: body.length,
      recordCount: Object.keys(payload).length,
    },
  };
}

async function createStore(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "hhwx-cards-v1-"));
  const cards = {
    "1": { characterId: 1, type: "permanent", serverExtensions: [{}, {}, {}, {}] },
    "2": { characterId: 2, type: "permanent", serverExtensions: [{}, {}, {}, null] },
    "50": { characterId: 3, type: "permanent", serverExtensions: [{}, {}, {}, {}] },
    "10048": { characterId: 4, type: "limited", serverExtensions: [{}, {}, {}, {}] },
  };
  const cardsPack = pack(`${packPrefix}/cards`, cards, { corrupt: options.corruptCards });
  const detailPayloads = options.outOfRange
    ? {
        card00000: {
          "1": { characterId: 1, type: "permanent", episodes: [], serverExtensions: [{}, {}, {}, {}] },
          "50": { characterId: 3, type: "permanent", episodes: [], serverExtensions: [{}, {}, {}, {}] },
        },
        card00001: {
          "2": { characterId: 2, type: "permanent", episodes: [], serverExtensions: [{}, {}, {}, null] },
        },
        card00200: {
          "10048": { characterId: 4, type: "limited", episodes: [], serverExtensions: [{}, {}, {}, {}] },
        },
      }
    : {
        card00000: {
          "1": { characterId: 1, type: "permanent", episodes: [], serverExtensions: [{}, {}, {}, {}] },
          "2": { characterId: 2, type: "permanent", episodes: [], serverExtensions: [{}, {}, {}, null] },
        },
        card00001: {
          "50": { characterId: 3, type: "permanent", episodes: [], serverExtensions: [{}, {}, {}, {}] },
        },
        card00200: {
          "10048": { characterId: 4, type: "limited", episodes: [], serverExtensions: [{}, {}, {}, {}] },
        },
      };
  const detailPacks = Object.fromEntries(Object.entries(detailPayloads).map(([shardKey, payload]) => [
    shardKey,
    pack(`${packPrefix}/cardDetails/${shardKey}`, payload),
  ]));

  await writeObject(root, cardsPack.descriptor.key, cardsPack.body);
  for (const [shardKey, detailPack] of Object.entries(detailPacks)) {
    if (options.missingShard !== shardKey) {
      await writeObject(root, detailPack.descriptor.key, detailPack.body);
    }
  }
  await writeObject(root, pointerKey, Buffer.from(JSON.stringify({
    schemaVersion: "bandori-cards-api-pointer-v1",
    generation: 1,
    updatedAt: "2026-07-14T00:00:00Z",
    datasets: {
      cards: cardsPack.descriptor,
      cardDetails: {
        layout: "numeric-id-range",
        rangeSize: 50,
        recordCount: 4,
        shards: Object.fromEntries(Object.entries(detailPacks).map(([shardKey, detailPack]) => [
          shardKey,
          detailPack.descriptor,
        ])),
      },
    },
  })));
  return { root, cardsPack, detailPacks };
}

async function withStore(store, assertion) {
  process.env.BANDORI_CARDS_API_LOCAL_STORE_ROOT = store.root;
  try {
    await assertion();
  } finally {
    delete process.env.BANDORI_CARDS_API_LOCAL_STORE_ROOT;
    await rm(store.root, { recursive: true, force: true });
  }
}

const validStore = await createStore();
await withStore(validStore, async () => {
  const cards = await readBandoriCardsApiDataset();
  assert.equal(Object.keys(cards).length, 4);
  assert.equal(cards["10048"].type, "limited");
  const cnCards = await readBandoriCardsApiDatasetForServer(3);
  assert.equal(await readBandoriCardsApiDatasetForServer(3), cnCards);
  assert.equal(Object.hasOwn(cnCards, "2"), false);
  assert.equal(Object.hasOwn(cnCards["1"], "serverExtensions"), false);
  assert.equal(Object.hasOwn(cards["1"], "serverExtensions"), true);

  assert.deepEqual(await readBandoriCardApiDetail("1"), {
    characterId: 1,
    type: "permanent",
    episodes: [],
    serverExtensions: [{}, {}, {}, {}],
  });
  await unlink(join(
    validStore.root,
    ...validStore.detailPacks.card00000.descriptor.key.split("/"),
  ));
  assert.deepEqual(await readBandoriCardApiDetail("2"), {
    characterId: 2,
    type: "permanent",
    episodes: [],
    serverExtensions: [{}, {}, {}, null],
  });
  assert.equal(await readBandoriCardApiDetail("3"), null);
  assert.equal(await readBandoriCardApiDetailForServer("2", 3), null);
  assert.equal(await readBandoriCardApiDetail("5000000"), null);
  assert.equal(await readBandoriCardApiDetail("9007199254740993"), null);
  assert.equal((await readBandoriCardApiDetail("10048"))?.type, "limited");

  const listResponse = await readMasterDatasetRoute(
    new Request("http://localhost/api/bandori/master/cards"),
    { params: Promise.resolve({ dataset: "cards" }) },
  );
  assert.equal(listResponse.status, 200);
  assert.deepEqual(await listResponse.json(), { success: true, data: cards });

  const cnListResponse = await readMasterDatasetRoute(
    new Request("http://localhost/api/bandori/master/cards?server=3"),
    { params: Promise.resolve({ dataset: "cards" }) },
  );
  assert.equal(cnListResponse.status, 200);
  assert.deepEqual(await cnListResponse.json(), { success: true, data: cnCards });

  const invalidServerListResponse = await readMasterDatasetRoute(
    new Request("http://localhost/api/bandori/master/cards?server=kr"),
    { params: Promise.resolve({ dataset: "cards" }) },
  );
  assert.equal(invalidServerListResponse.status, 400);
  assert.deepEqual(await invalidServerListResponse.json(), {
    success: false,
    error: {
      code: "BANDORI_MASTER_CARD_SERVER_INVALID",
      message: "server must be exactly one of 0, 1, 2, or 3",
    },
  });

  const detailResponse = await readCardDetailRoute(
    new Request("http://localhost/api/bandori/master/cards/10048"),
    { params: Promise.resolve({ cardId: "10048" }) },
  );
  assert.equal(detailResponse.status, 200);
  assert.deepEqual(await detailResponse.json(), {
    success: true,
    data: {
      characterId: 4,
      type: "limited",
      episodes: [],
      serverExtensions: [{}, {}, {}, {}],
    },
  });

  const cnDetailResponse = await readCardDetailRoute(
    new Request("http://localhost/api/bandori/master/cards/1?server=3"),
    { params: Promise.resolve({ cardId: "1" }) },
  );
  assert.equal(cnDetailResponse.status, 200);
  assert.deepEqual(await cnDetailResponse.json(), {
    success: true,
    data: {
      characterId: 1,
      type: "permanent",
      episodes: [],
    },
  });

  const absentCnDetailResponse = await readCardDetailRoute(
    new Request("http://localhost/api/bandori/master/cards/2?server=3"),
    { params: Promise.resolve({ cardId: "2" }) },
  );
  assert.equal(absentCnDetailResponse.status, 404);

  const duplicateServerDetailResponse = await readCardDetailRoute(
    new Request("http://localhost/api/bandori/master/cards/1?server=0&server=3"),
    { params: Promise.resolve({ cardId: "1" }) },
  );
  assert.equal(duplicateServerDetailResponse.status, 400);

  const missingResponse = await readCardDetailRoute(
    new Request("http://localhost/api/bandori/master/cards/999"),
    { params: Promise.resolve({ cardId: "999" }) },
  );
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), {
    success: false,
    error: {
      code: "BANDORI_MASTER_CARD_NOT_FOUND",
      message: "Bandori master card is not available",
    },
  });

  const outOfRangeResponse = await readCardDetailRoute(
    new Request("http://localhost/api/bandori/master/cards/5000000"),
    { params: Promise.resolve({ cardId: "5000000" }) },
  );
  assert.equal(outOfRangeResponse.status, 404);
});

await withStore(await createStore({ corruptCards: true }), async () => {
  await assert.rejects(
    readBandoriCardsApiDataset(),
    /dataset (?:is corrupt|is too large after decompression): cards/u,
  );
});

const missingStore = await createStore({ missingShard: "card00001" });
await withStore(missingStore, async () => {
  await assert.rejects(readBandoriCardApiDetail("50"), /read failed: HTTP 404 card00001/u);
  const missingPack = missingStore.detailPacks.card00001;
  await writeObject(missingStore.root, missingPack.descriptor.key, missingPack.body);
  assert.equal((await readBandoriCardApiDetail("50"))?.characterId, 3);
});

await withStore(await createStore({ outOfRange: true }), async () => {
  await assert.rejects(
    readBandoriCardApiDetail("1"),
    /shard contains an out-of-range record: 50/u,
  );
});

const productionStore = await createStore();
const previousNodeEnvironment = process.env.NODE_ENV;
process.env.BANDORI_CARDS_API_LOCAL_STORE_ROOT = productionStore.root;
process.env.NODE_ENV = "production";
try {
  await assert.rejects(
    readBandoriCardsApiDataset(),
    /BANDORI_CARDS_API_LOCAL_STORE_ROOT is restricted to local development/u,
  );
} finally {
  if (previousNodeEnvironment === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnvironment;
  }
  delete process.env.BANDORI_CARDS_API_LOCAL_STORE_ROOT;
  await rm(productionStore.root, { recursive: true, force: true });
}

console.log("Bandori Cards v1 local-store reader checks passed.");
