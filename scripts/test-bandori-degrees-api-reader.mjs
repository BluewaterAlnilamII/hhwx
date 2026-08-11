import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

const pointerKey = "bandori/master/degrees/api/active.json";
const packPrefix = "bandori/master/degrees/api/packs/degrees";

const { readBandoriDegreesApiDataset } = await import(
  "../src/lib/bandori-degrees-api-server.ts"
);
const { GET: readMasterDatasetRoute } = await import(
  "../src/app/api/bandori/master/[dataset]/route.ts"
);

async function writeObject(root, key, body) {
  const path = join(root, ...key.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

async function createStore(payload) {
  const root = await mkdtemp(join(tmpdir(), "hhwx-degrees-api-"));
  const body = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { mtime: 0 });
  const compressedSha256 = createHash("sha256").update(body).digest("hex");
  const descriptor = {
    key: `${packPrefix}/${compressedSha256}.json.gz`,
    semanticSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    compressedSha256,
    compressedSize: body.length,
    recordCount: Object.keys(payload).length,
  };
  await writeObject(root, descriptor.key, body);
  await writeObject(root, pointerKey, Buffer.from(JSON.stringify({
    schemaVersion: "bandori-degrees-api-pointer-v1",
    generation: 1,
    updatedAt: "2026-08-11T00:00:00Z",
    datasets: { degrees: descriptor },
  })));
  return root;
}

async function withStore(root, assertion) {
  process.env.BANDORI_DEGREES_API_LOCAL_STORE_ROOT = root;
  try {
    await assertion();
  } finally {
    delete process.env.BANDORI_DEGREES_API_LOCAL_STORE_ROOT;
    await rm(root, { recursive: true, force: true });
  }
}

const payload = {
  "1": {
    degreeType: ["normal", "normal", "", "normal"],
    iconImageName: ["degree_1", "degree_1", "", "degree_1"],
    baseImageName: ["degree001", "degree001", "", "degree001"],
    rank: ["1", "1", "", "1"],
    degreeName: ["JP Degree", "EN Degree", "", "CN Degree"],
    description: ["JP", "EN", "", "CN"],
    seq: [1, 1, 0, 1],
    characterId: [0, 0, 0, 0],
  },
  "90001": {
    degreeType: ["", "", "", "normal"],
    iconImageName: ["", "", "", "ani_degree_cn"],
    baseImageName: ["", "", "", "ani_degree_cn"],
    rank: ["", "", "", "3"],
    degreeName: ["", "", "", "动态称号"],
    description: ["", "", "", "动态称号说明"],
    seq: [0, 0, 0, 9],
    characterId: [0, 0, 0, 0],
  },
};

await withStore(await createStore(payload), async () => {
  assert.deepEqual(await readBandoriDegreesApiDataset(), payload);

  const response = await readMasterDatasetRoute(
    new Request("http://localhost/api/bandori/master/degrees"),
    { params: Promise.resolve({ dataset: "degrees" }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: payload });

  const rejected = await readMasterDatasetRoute(
    new Request("http://localhost/api/bandori/master/degrees?server=3"),
    { params: Promise.resolve({ dataset: "degrees" }) },
  );
  assert.equal(rejected.status, 400);
});

await withStore(await createStore({
  "1": {
    ...payload["1"],
    characterId: [0, 0, 0, "1"],
  },
}), async () => {
  await assert.rejects(
    readBandoriDegreesApiDataset(),
    /record is invalid: 1/u,
  );
});

await withStore(await createStore({
  "1": {
    ...payload["1"],
    description: ["", "EN", "", "CN"],
  },
}), async () => {
  await assert.rejects(
    readBandoriDegreesApiDataset(),
    /record is invalid: 1/u,
  );
});

console.log("Bandori Degrees local-store reader checks passed.");
