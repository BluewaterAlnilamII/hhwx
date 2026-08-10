import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BANDORI_CARD_TOOLTIP_GAP,
  getBandoriCardTooltipPosition,
} from "../src/components/bandori/BandoriCardHoverTooltip.tsx";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function rect({ left, top, width, height }) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

test("card tooltip uses its measured size and keeps a four-pixel anchor gap", () => {
  assert.equal(BANDORI_CARD_TOOLTIP_GAP, 4);

  assert.deepEqual(getBandoriCardTooltipPosition({
    anchorRect: rect({ left: 100, top: 100, width: 76, height: 76 }),
    tooltipWidth: 256,
    tooltipHeight: 184,
    viewportWidth: 1_000,
    viewportHeight: 800,
  }), {
    left: 12,
    top: 180,
    placement: "below",
  });

  assert.deepEqual(getBandoriCardTooltipPosition({
    anchorRect: rect({ left: 500, top: 700, width: 76, height: 76 }),
    tooltipWidth: 256,
    tooltipHeight: 184,
    viewportWidth: 1_000,
    viewportHeight: 800,
  }), {
    left: 410,
    top: 512,
    placement: "above",
  });
});

test("card tooltip clamps horizontally using its actual width", () => {
  assert.deepEqual(getBandoriCardTooltipPosition({
    anchorRect: rect({ left: 280, top: 100, width: 40, height: 40 }),
    tooltipWidth: 256,
    tooltipHeight: 120,
    viewportWidth: 320,
    viewportHeight: 640,
  }), {
    left: 52,
    top: 144,
    placement: "below",
  });
});

test("card tooltip positioning reacts to real layout and preserves logical tab order", async () => {
  const [tooltip, hook] = await Promise.all([
    readSource("src/components/bandori/BandoriCardHoverTooltip.tsx"),
    readSource("src/hooks/useBandoriCardHoverTooltip.ts"),
  ]);

  assert.match(tooltip, /popover="manual"/u);
  assert.match(tooltip, /useLayoutEffect/u);
  assert.match(tooltip, /tooltip\.getBoundingClientRect\(\)/u);
  assert.match(tooltip, /new ResizeObserver\(scheduleUpdate\)/u);
  assert.match(tooltip, /window\.addEventListener\("scroll", scheduleUpdate, true\)/u);
  assert.match(tooltip, /window\.visualViewport\?\.addEventListener/u);
  assert.doesNotMatch(tooltip, /createPortal|TOOLTIP_ESTIMATED_HEIGHT/u);
  assert.match(hook, /document\.addEventListener\("pointerdown"/u);
  assert.match(hook, /event\.key === "Escape"/u);
  assert.match(hook, /isPointerInsideRef\.current \|\| isFocusInsideRef\.current/u);
  assert.match(hook, /!isPointerInsideRef\.current && !isFocusInsideRef\.current/u);
});

test("card tiles declare information, action, and presentation semantics explicitly", async () => {
  const [
    tile,
    pickerTile,
    eventInfo,
    eventBonus,
    teamBuilder,
    preferences,
    profile,
    top10,
  ] = await Promise.all([
    readSource("src/components/bandori/BandoriCardTile.tsx"),
    readSource("src/components/bandori/card-picker/BandoriCardThumbnailTile.tsx"),
    readSource("src/app/[locale]/bandori/events/EventInfoPanel.tsx"),
    readSource("src/components/bandori/BandoriEventBonusPanel.tsx"),
    readSource("src/app/[locale]/bandori/teambuilder/page.tsx"),
    readSource("src/app/[locale]/bandori/teambuilder/CardPreferencesPanel.tsx"),
    readSource("src/app/[locale]/bandori/game-profiles/[profileId]/cards/page.tsx"),
    readSource("src/app/[locale]/bandori/events/Top10PlayerList.tsx"),
  ]);

  assert.match(tile, /kind: "information"/u);
  assert.match(tile, /kind: "action"/u);
  assert.match(tile, /kind: "presentation"/u);
  assert.doesNotMatch(tile, /isPresentationOnly|actionLabel\?:|onAction\?:/u);
  assert.match(pickerTile, /onClick=\{onSelect\}/u);
  assert.match(eventInfo, /interaction=\{\{ kind: "information" \}\}/u);
  assert.match(eventBonus, /interaction=\{\{ kind: "information" \}\}/u);
  assert.match(teamBuilder, /interaction=\{\{ kind: "information" \}\}/u);
  assert.match(preferences, /kind: "action"/u);
  assert.match(profile, /disabled: isSavingChanges/u);
  assert.match(profile, /\} : \{ kind: "information" \}\}/u);
  assert.match(top10, /interaction=\{\{ kind: "presentation" \}\}/u);
});
