import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { GET as list } from "../src/app/api/bandori/master/[dataset]/route.ts";
import { GET as detail } from "../src/app/api/bandori/master/costumes/[costumeId]/route.ts";
import { parseCostumesRecordMap, parseCostumesApiPointer, COSTUMES_API_POINTER_KEY, COSTUMES_API_PREFIX } from "../src/lib/bandori/costumes/api-contract.ts";
import { readBandoriCostumesApiDataset } from "../src/lib/bandori/costumes/api-server.ts";

const record = {
  characterId: 1, assetBundleName: "001_live_default", sdResourceName: "sd001001",
  description: ["Live", "Live", "", "Live"], publishedAt: ["123", "123", "", "123"],
  cards: [2, 176], serverExtensions: [{}, {}, null, { cards: [2, 176, 5001] }],
};
const canonical = (x) => Array.isArray(x) ? `[${x.map(canonical).join(",")}]`
  : x && typeof x === "object" ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}` : JSON.stringify(x);
const hash = (x) => createHash("sha256").update(x).digest("hex");

async function withStore(payload, edit, run) {
  const root = await mkdtemp(join(tmpdir(), "hhwx-costumes-"));
  const body = gzipSync(Buffer.from(canonical(payload)));
  const pack = { key: `${COSTUMES_API_PREFIX}/packs/costumes/${hash(body)}.json.gz`, compressedSha256: hash(body), semanticSha256: hash(canonical(payload)), compressedSize: body.length, recordCount: Object.keys(payload).length };
  const pointer = { schemaVersion: "bandori-costumes-api-pointer-v1", generation: 1, datasets: { costumes: pack } };
  const diskBody = edit?.(pointer, body) ?? body;
  for (const [key, bytes] of [[pack.key, diskBody], [COSTUMES_API_POINTER_KEY, JSON.stringify(pointer)]]) {
    const path = join(root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  process.env.BANDORI_COSTUMES_API_LOCAL_STORE_ROOT = root;
  try { await run(); } finally {
    delete process.env.BANDORI_COSTUMES_API_LOCAL_STORE_ROOT;
    await rm(root, { recursive: true, force: true });
  }
}
const request = (path) => new Request(`http://localhost/api/bandori/master/${path}`);
const listContext = { params: Promise.resolve({ dataset: "costumes" }) };
const detailContext = (costumeId = "26") => ({ params: Promise.resolve({ costumeId }) });

test("costumes list/detail share one verified snapshot and preserve regional semantics", async () => {
  await withStore({ 26: record }, null, async () => {
    assert.deepEqual(await readBandoriCostumesApiDataset(), { 26: record });
    const full = await detail(request("costumes/26"), detailContext());
    assert.deepEqual(await full.json(), { success: true, data: record });
    assert.match(full.headers.get("cache-control"), /public/);
    const summary = (await (await list(request("costumes"), listContext)).json()).data[26];
    assert.deepEqual(Object.keys(summary).sort(), ["assetBundleName", "characterId", "description", "publishedAt", "serverExtensions"]);
    assert.deepEqual(summary.serverExtensions, [{}, {}, null, {}]);
    for (let server = 0; server < 4; server++) {
      const response = await detail(request(`costumes/26?server=${server}`), detailContext());
      const listed = (await (await list(request(`costumes?server=${server}`), listContext)).json()).data;
      assert.equal(response.status, server === 2 ? 404 : 200);
      assert.equal(Object.keys(listed).length, server === 2 ? 0 : 1);
      if (server !== 2) {
        const local = (await response.json()).data;
        assert.equal(Object.hasOwn(local, "serverExtensions"), false);
        assert.deepEqual(local.cards, server === 3 ? [2, 176, 5001] : [2, 176]);
        assert.equal(local.sdResourceName, "sd001001");
      }
    }
    for (const query of ["server=4", "server=-1", "server=01", "server=", "server=0&server=0", "server=1&unknown=1", "unknown=1"]) {
      for (const response of [await list(request(`costumes?${query}`), listContext), await detail(request(`costumes/26?${query}`), detailContext())]) {
        assert.equal(response.status, 400);
        assert.match(response.headers.get("cache-control"), /no-store/);
      }
    }
    for (const id of ["0", "026", "NaN", "9007199254740992", "999999"]) {
      assert.equal((await detail(request(`costumes/${id}`), detailContext(id))).status, 404);
    }
  });
});

test("costumes rejects corrupt hashes, invalid payloads, and unbounded descriptors", async () => {
  for (const edit of [
    (p) => { p.datasets.costumes.semanticSha256 = "0".repeat(64); },
    (_p, b) => Buffer.concat([b, Buffer.from("corrupt")]),
    (p) => { p.datasets.costumes.recordCount = 2; },
  ]) {
    await withStore({ 26: record }, edit, async () => {
      await assert.rejects(readBandoriCostumesApiDataset);
      const response = await detail(request("costumes/26"), detailContext());
      assert.equal(response.status, 500);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.equal((await response.json()).error.code, "BANDORI_MASTER_COSTUME_READ_FAILED");
    });
  }
  for (const patch of [{ description: [null, "", "", ""] }, { assetBundleName: "../escape" }, { cards: [2, 2] }, { serverExtensions: [{ characterId: 2 }, null, null, null] }]) {
    assert.throws(() => parseCostumesRecordMap({ 26: { ...record, ...patch } }, 1));
  }
  assert.throws(() => parseCostumesApiPointer({ schemaVersion: "bandori-costumes-api-pointer-v1", generation: 1, datasets: { costumes: { compressedSize: 4 * 1024 * 1024 + 1 } } }));
});
