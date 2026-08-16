import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compareDisplayDegreeSelections,
  getAccountDisplayDegreeVariants,
  normalizeStoredDisplayDegree,
  parseAccountDisplayDegreeOptions,
  parseDisplayDegreeRequest,
} from "../src/lib/account-display-degree.ts";

test("display Degree requests distinguish standard and effect variants", () => {
  assert.deepEqual(parseDisplayDegreeRequest({ server: 3, degreeId: 201, degreeEffectId: 901 }), {
    server: 3,
    degreeId: 201,
    degreeEffectId: 901,
  });
  assert.deepEqual(parseDisplayDegreeRequest({ server: 3, degreeId: 201 }), {
    server: 3,
    degreeId: 201,
    degreeEffectId: null,
  });
  assert.equal(parseDisplayDegreeRequest({ server: "3", degreeId: 201, degreeEffectId: null }), null);
  assert.equal(parseDisplayDegreeRequest({ server: 3, degreeId: 0, degreeEffectId: null }), null);
  assert.equal(parseDisplayDegreeRequest({ server: 0, degreeId: 100, degreeEffectId: 901 }), null);
  assert.equal(parseDisplayDegreeRequest({ server: 3, degreeId: 201, gameUid: "9101" }), null);
});

test("invalid stored selections normalize to the JP Degree 100 baseline", () => {
  assert.deepEqual(normalizeStoredDisplayDegree(null, null), {
    server: 0,
    degreeId: 100,
    degreeEffectId: null,
  });
  assert.deepEqual(normalizeStoredDisplayDegree(3, 201, 901), {
    server: 3,
    degreeId: 201,
    degreeEffectId: 901,
  });
  assert.deepEqual(normalizeStoredDisplayDegree(0, 100, 901), {
    server: 0,
    degreeId: 100,
    degreeEffectId: null,
  });
});

test("binding options preserve duplicate ownership and sort by server then UID", () => {
  const parsed = parseAccountDisplayDegreeOptions({
    selected: { server: 3, degreeId: 201, degreeEffectId: 901 },
    accounts: [
      { server: 3, gameUid: "10010", ownedDegreeIds: [202, 201, 201], ownedDegreeEffectIds: [902, 901, 901] },
      { server: 0, gameUid: "9001", ownedDegreeIds: [100], ownedDegreeEffectIds: [] },
      { server: 3, gameUid: "9999", ownedDegreeIds: [201], ownedDegreeEffectIds: [901] },
    ],
  });

  assert.deepEqual(parsed, {
    selected: { server: 3, degreeId: 201, degreeEffectId: 901 },
    accounts: [
      { server: 0, gameUid: "9001", ownedDegreeIds: [100], ownedDegreeEffectIds: [] },
      { server: 3, gameUid: "9999", ownedDegreeIds: [201], ownedDegreeEffectIds: [901] },
      { server: 3, gameUid: "10010", ownedDegreeIds: [201, 202], ownedDegreeEffectIds: [901, 902] },
    ],
  });
  assert.equal(compareDisplayDegreeSelections(parsed.selected, {
    server: 3,
    degreeId: 201,
    degreeEffectId: 901,
  }), true);
  assert.equal(compareDisplayDegreeSelections(parsed.selected, {
    server: 3,
    degreeId: 201,
    degreeEffectId: null,
  }), false);
});

test("binding options reject malformed UID and Degree ownership data", () => {
  assert.equal(parseAccountDisplayDegreeOptions({
    selected: { server: 0, degreeId: 100, degreeEffectId: null },
    accounts: [{ server: 3, gameUid: "bad", ownedDegreeIds: [], ownedDegreeEffectIds: [] }],
  }), null);
  assert.equal(parseAccountDisplayDegreeOptions({
    selected: { server: 0, degreeId: 100, degreeEffectId: null },
    accounts: [{ server: 3, gameUid: "9001", ownedDegreeIds: [0], ownedDegreeEffectIds: [] }],
  }), null);
  assert.equal(parseAccountDisplayDegreeOptions({
    selected: { server: 0, degreeId: 100, degreeEffectId: null },
    accounts: [{ server: 3, gameUid: "9001", ownedDegreeIds: [], ownedDegreeEffectIds: [0] }],
  }), null);
});

test("selector variants keep each owned effect immediately after its standard Degree", () => {
  const degree201 = { id: 201, seq: 20, degreeEffect: { biliDegreeEffectId: 901 } };
  const degree202 = { id: 202, seq: 10, degreeEffect: { biliDegreeEffectId: 902 } };
  const variants = getAccountDisplayDegreeVariants({
    server: 3,
    gameUid: "9001",
    ownedDegreeIds: [201, 202],
    ownedDegreeEffectIds: [901],
  }, new Map([
    [201, degree201],
    [202, degree202],
  ]));

  assert.deepEqual(variants.map(({ degree, degreeEffectId }) => [degree.id, degreeEffectId]), [
    [202, null],
    [201, null],
    [201, 901],
  ]);
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
  assert.match(pickerSource, /ownedDegreeEffectIds/u);
  assert.doesNotMatch(pickerSource, /normalVariant|effectVariant|variantLabel/u);
  assert.match(pickerSource, /degreeEffectId=\{degreeEffectId\}/u);
  assert.match(degreeViewSource, /useBandoriDegreeEffect/u);
  assert.match(degreeViewSource, /data-degree-effect-id/u);
  assert.match(degreeViewSource, /const description = selectedEffect\?\.description \|\| degree\.description;/u);
  assert.match(degreeViewSource, /const label = description \? `\$\{degreeLabel\} · \$\{description\}` : degreeLabel;/u);
  assert.doesNotMatch(degreeViewSource, /degreeEffectLabel|selectedEffectLabel/u);
  assert.match(degreeViewSource, /container: "h-5 w-\[92px\]"/u);
  assert.match(degreeViewSource, /container: "h-\[25px\] w-\[115px\]"/u);
  assert.match(degreeViewSource, /"absolute inset-0 flex items-center justify-center overflow-hidden"/u);
  assert.match(degreeViewSource, /"absolute left-0 top-0 z-10 h-full"/u);
  assert.match(degreeViewSource, /isDecorativeOverlay = false/u);
  assert.match(degreeViewSource, /draggable=\{isDecorativeOverlay \? false : undefined\}/u);
  assert.match(degreeViewSource, /isDecorativeOverlay && "pointer-events-none select-none"/u);
  assert.match(degreeViewSource, /animation=\{animation\}[\s\S]*?className="absolute inset-0 h-full w-full object-contain"/u);
  assert.match(degreeViewSource, /animation=\{effect\}[\s\S]*?className="pointer-events-none absolute inset-0 h-full w-full object-contain"/u);
  assert.match(degreeViewSource, /src=\{rankImageUrl\}[\s\S]*?isDecorativeOverlay/u);
  assert.match(degreeViewSource, /src=\{iconImageUrl\}[\s\S]*?isDecorativeOverlay/u);
  assert.doesNotMatch(degreeViewSource, /className=\{cn\("pointer-events-none select-none object-contain"/u);
  assert.doesNotMatch(degreeViewSource, /aspect-\[23\/5\]/u);
  assert.match(pickerSource, /h-\[25px\] w-\[115px\]/u);
  assert.doesNotMatch(`${degreeViewSource}\n${pickerSource}`, /w-\[230px\]|h-\[50px\]/u);
  assert.doesNotMatch(pickerSource, /useDefault|reset|DEFAULT_DISPLAY_DEGREE/u);
  assert.equal(JSON.parse(zhMessages).displayDegree.empty, "暂无可用称号");
});
