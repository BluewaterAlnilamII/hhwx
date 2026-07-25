import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

const pointerKey = "bandori/master/stamps/api/active.json";
const packPrefix = "bandori/master/stamps/api/packs/stamps";

const { readBandoriStampsApiDataset } = await import(
  "../src/lib/bandori-stamps-api-server.ts"
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
  const root = await mkdtemp(join(tmpdir(), "hhwx-stamps-api-"));
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
    schemaVersion: "bandori-stamps-api-pointer-v1",
    generation: 1,
    updatedAt: "2026-07-25T00:00:00Z",
    datasets: { stamps: descriptor },
  })));
  return root;
}

async function withStore(root, assertion) {
  process.env.BANDORI_STAMPS_API_LOCAL_STORE_ROOT = root;
  try {
    await assertion();
  } finally {
    delete process.env.BANDORI_STAMPS_API_LOCAL_STORE_ROOT;
    await rm(root, { recursive: true, force: true });
  }
}

const payload = {
  "1": {
    imageName: ["stamp_001", "stamp_001", "", "stamp_001"],
    characterId: [1, 1, null, 1],
    changedStamps: [
      [{
        imageName: "stamp_001_stage",
        soundName: "stage_collabo",
      }],
      [],
      [],
      [],
    ],
  },
  "501": {
    imageName: ["stamp_006035", "stamp_006035", "stamp_001099", "stamp_006035"],
    characterId: [6, 6, 1, 6],
  },
};

await withStore(await createStore(payload), async () => {
  assert.deepEqual(await readBandoriStampsApiDataset(), payload);

  const response = await readMasterDatasetRoute(
    new Request("http://localhost/api/bandori/master/stamps"),
    { params: Promise.resolve({ dataset: "stamps" }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: payload });

  const redirected = await readMasterDatasetRoute(
    new Request("http://localhost/api/bandori/master/stamps?server=3"),
    { params: Promise.resolve({ dataset: "stamps" }) },
  );
  assert.equal(redirected.status, 308);
  assert.equal(redirected.headers.get("location"), "http://localhost/api/bandori/master/stamps");
});

await withStore(await createStore({
  "1": {
    imageName: ["stamp_001", "", "", ""],
    characterId: [1, 1, null, null],
  },
}), async () => {
  await assert.rejects(
    readBandoriStampsApiDataset(),
    /invalid characterId: 1/u,
  );
});

console.log("Bandori Stamps local-store reader checks passed.");
