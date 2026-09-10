import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { readBandoriCostumesApiDataset } from "../src/lib/bandori/costumes/api-server.ts";

const { values } = parseArgs({ options: {
  "store-root": { type: "string" },
  "api-base": { type: "string", default: "http://localhost:3001" },
  report: { type: "string" },
} });
assert.ok(values["store-root"], "--store-root must identify the verified local build");
process.env.BANDORI_COSTUMES_API_LOCAL_STORE_ROOT = values["store-root"];
const records = await readBandoriCostumesApiDataset();
const base = values["api-base"].replace(/\/$/u, "");
async function read(path, status = 200) {
  const response = await fetch(`${base}/api/bandori/master/${path}`, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, status, path);
  assert.match(response.headers.get("cache-control"), status === 200 ? /public/ : /no-store/);
  const body = await response.json();
  assert.equal(body.success, status === 200);
  return body.data;
}
const counts = [];
for (const server of [undefined, 0, 1, 2, 3]) {
  const expected = {};
  for (const [id, record] of Object.entries(records)) {
    if (server !== undefined && record.serverExtensions[server] === null) continue;
    expected[id] = Object.fromEntries(["characterId", "assetBundleName", "description", "publishedAt"].map((field) => [field, record[field]]));
    if (server === undefined) expected[id].serverExtensions = record.serverExtensions.map((entry) => entry === null ? null : {});
  }
  const actual = await read(`costumes${server === undefined ? "" : `?server=${server}`}`);
  assert.deepEqual(actual, expected);
  counts.push(Object.keys(actual).length);
}
const pending = Object.entries(records);
await Promise.all(Array.from({ length: 8 }, async () => {
  while (pending.length) {
    const [id, expected] = pending.pop();
    assert.deepEqual(await read(`costumes/${id}`), expected);
  }
}));
for (const id of ["26", "36", "131", "2427"]) {
  assert.ok(records[id], `representative costume ${id} is missing`);
  for (let server = 0; server < 4; server++) {
    const { serverExtensions, ...baseRecord } = records[id];
    const extension = serverExtensions[server];
    const actual = await read(`costumes/${id}?server=${server}`, extension === null ? 404 : 200);
    if (extension !== null) assert.deepEqual(actual, { ...baseRecord, ...extension });
  }
}
for (const path of ["costumes?server=jp", "costumes?server=0&server=0", "costumes/26?extra=1"]) await read(path, 400);
await read("costumes/9007199254740992", 404);
await read("costumes/9999999", 404);
const report = { passed: true, apiBase: base, listCounts: { canonical: counts[0], jp: counts[1], en: counts[2], tw: counts[3], cn: counts[4] }, detailsCompared: Object.keys(records).length, regionalDetailsCompared: 16 };
if (values.report) await writeFile(values.report, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
