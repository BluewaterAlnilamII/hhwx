import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compareDisplayDegreeSelections,
  normalizeStoredDisplayDegree,
  parseAccountDisplayDegreeOptions,
  parseDisplayDegreeRequest,
} from "../src/lib/account-display-degree.ts";

test("display Degree requests accept only an exact positive server/id pair", () => {
  assert.deepEqual(parseDisplayDegreeRequest({ server: 3, degreeId: 201 }), {
    server: 3,
    degreeId: 201,
  });
  assert.equal(parseDisplayDegreeRequest({ server: "3", degreeId: 201 }), null);
  assert.equal(parseDisplayDegreeRequest({ server: 3, degreeId: 0 }), null);
  assert.equal(parseDisplayDegreeRequest({ server: 3, degreeId: 201, gameUid: "9101" }), null);
});

test("invalid stored selections normalize to the JP Degree 100 baseline", () => {
  assert.deepEqual(normalizeStoredDisplayDegree(null, null), { server: 0, degreeId: 100 });
  assert.deepEqual(normalizeStoredDisplayDegree(3, 201), { server: 3, degreeId: 201 });
});

test("binding options preserve duplicate ownership and sort by server then UID", () => {
  const parsed = parseAccountDisplayDegreeOptions({
    selected: { server: 3, degreeId: 201 },
    accounts: [
      { server: 3, gameUid: "10010", ownedDegreeIds: [202, 201, 201] },
      { server: 0, gameUid: "9001", ownedDegreeIds: [100] },
      { server: 3, gameUid: "9999", ownedDegreeIds: [201] },
    ],
  });

  assert.deepEqual(parsed, {
    selected: { server: 3, degreeId: 201 },
    accounts: [
      { server: 0, gameUid: "9001", ownedDegreeIds: [100] },
      { server: 3, gameUid: "9999", ownedDegreeIds: [201] },
      { server: 3, gameUid: "10010", ownedDegreeIds: [201, 202] },
    ],
  });
  assert.equal(compareDisplayDegreeSelections(parsed.selected, { server: 3, degreeId: 201 }), true);
});

test("binding options reject malformed UID and Degree ownership data", () => {
  assert.equal(parseAccountDisplayDegreeOptions({
    selected: { server: 0, degreeId: 100 },
    accounts: [{ server: 3, gameUid: "bad", ownedDegreeIds: [] }],
  }), null);
  assert.equal(parseAccountDisplayDegreeOptions({
    selected: { server: 0, degreeId: 100 },
    accounts: [{ server: 3, gameUid: "9001", ownedDegreeIds: [0] }],
  }), null);
});

test("account center exposes the grouped picker without a reset control", async () => {
  const [pageSource, pickerSource, degreeViewSource, zhMessages] = await Promise.all([
    readFile(new URL("../src/app/[locale]/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/[locale]/account/AccountDisplayDegreeControl.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bandori/BandoriDegreeView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../messages/zh-CN/account.json", import.meta.url), "utf8"),
  ]);
  assert.match(pageSource, /AccountDisplayDegreeControl/u);
  assert.match(pickerSource, /BandoriServerIcon/u);
  assert.match(pickerSource, /ownedDegreeIds/u);
  assert.match(degreeViewSource, /container: "h-5 w-\[92px\]"/u);
  assert.match(degreeViewSource, /container: "h-\[25px\] w-\[115px\]"/u);
  assert.match(degreeViewSource, /"absolute inset-0 flex items-center justify-center overflow-hidden"/u);
  assert.match(degreeViewSource, /"absolute left-0 top-0 z-10 h-full"/u);
  assert.match(degreeViewSource, /pointer-events-none select-none object-contain/u);
  assert.doesNotMatch(degreeViewSource, /aspect-\[23\/5\]/u);
  assert.match(pickerSource, /h-\[25px\] w-\[115px\]/u);
  assert.doesNotMatch(`${degreeViewSource}\n${pickerSource}`, /w-\[230px\]|h-\[50px\]/u);
  assert.doesNotMatch(pickerSource, /useDefault|reset|DEFAULT_DISPLAY_DEGREE/u);
  assert.equal(JSON.parse(zhMessages).displayDegree.empty, "暂无可用称号");
});
