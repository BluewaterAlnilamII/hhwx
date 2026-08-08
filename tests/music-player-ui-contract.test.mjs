import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveMusicPlayerToolbarAction } from "../src/lib/music-player-toolbar-input.ts";

const ROOT_URL = new URL("../", import.meta.url);

test("player host is mounted in persistent app chrome and toolbar entry precedes language", async () => {
  const [appChrome, toolbar] = await Promise.all([
    readFile(new URL("src/components/AppChrome.tsx", ROOT_URL), "utf8"),
    readFile(new URL("src/components/Toolbar.tsx", ROOT_URL), "utf8"),
  ]);

  assert.match(appChrome, /<MusicPlayerHost\s*\/>/u);
  assert.ok(toolbar.indexOf("<ToolbarMusicPlayer") < toolbar.indexOf("<LanguageSwitchIcon"));
  assert.match(toolbar, /type OpenToolbarMenu = "player" \| "language" \| "account" \| null/u);
  assert.match(
    toolbar,
    /onRequestClose=\{\(\) => setOpenToolbarMenu\(\(currentValue\) => currentValue === "player" \? null : currentValue\)\}/u,
  );
});

test("player UI uses semantic theme tokens without fixed palette classes", async () => {
  const player = await readFile(
    new URL("src/components/music-player/ToolbarMusicPlayer.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(player, /--theme-color-progress-indicator-background/u);
  assert.match(player, /--theme-color-semantic-danger/u);
  assert.doesNotMatch(player, /#[0-9a-f]{3,8}|\b(?:slate|red|orange|yellow|pink)-\d/u);
  assert.match(player, /motion-reduce:animate-none/u);
  assert.match(player, /\[animation-play-state:running\]/u);
  assert.match(player, /\[animation-play-state:paused\]/u);
  assert.match(player, /aria-pressed=\{muted\}/u);
  assert.match(
    player,
    /muted\s*\?\s*"bg-\[var\(--theme-color-control-background-pressed\)\] text-\[var\(--theme-color-progress-foreground\)\]"/u,
  );
});

test("event song play action always dispatches the restart-from-beginning queue command", async () => {
  const eventInfoPanel = await readFile(
    new URL("src/app/[locale]/bandori/events/EventInfoPanel.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(eventInfoPanel, /playQueueFromStart\(playableSongs, playableSongIndex\)/u);
});

test("toolbar player separates mouse hover and playback click from touch toggle", async () => {
  const player = await readFile(
    new URL("src/components/music-player/ToolbarMusicPlayer.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(player, /TOOLBAR_PLAYER_MOUSE_LEAVE_CLOSE_DELAY_MS = 180/u);
  assert.match(player, /onPointerDown=\{handlePointerDown\}/u);
  assert.match(player, /onClick=\{handleClick\}/u);
  assert.doesNotMatch(player, /onDoubleClick|TOOLBAR_PLAYER_SINGLE_CLICK_DELAY_MS/u);
  assert.match(player, /resolveMusicPlayerToolbarAction/u);
  assert.match(player, /onPointerEnter=\{handlePointerEnter\}/u);
  assert.match(player, /onPointerLeave=\{handlePointerLeave\}/u);
  assert.match(player, /event\.pointerType !== "mouse"/u);
});

test("toolbar click decisions keep touch and pen taps panel-only", () => {
  for (const pointerType of ["touch", "pen"]) {
    assert.equal(resolveMusicPlayerToolbarAction({
      eventDetail: 1,
      pointerType,
      hasCurrentTrack: true,
      isOpen: false,
    }), "toggle-panel");
    assert.equal(resolveMusicPlayerToolbarAction({
      eventDetail: 1,
      pointerType,
      hasCurrentTrack: true,
      isOpen: true,
    }), "toggle-panel");
  }

  assert.equal(resolveMusicPlayerToolbarAction({
    eventDetail: 1,
    pointerType: "mouse",
    hasCurrentTrack: true,
    isOpen: false,
  }), "toggle-playback");
  assert.equal(resolveMusicPlayerToolbarAction({
    eventDetail: 1,
    pointerType: "mouse",
    hasCurrentTrack: false,
    isOpen: false,
  }), "toggle-panel");
  assert.equal(resolveMusicPlayerToolbarAction({
    eventDetail: 1,
    pointerType: "mouse",
    hasCurrentTrack: false,
    isOpen: true,
  }), "none");
  assert.equal(resolveMusicPlayerToolbarAction({
    eventDetail: 0,
    pointerType: null,
    hasCurrentTrack: true,
    isOpen: false,
  }), "toggle-panel");
});

test("overflowing track metadata scrolls and transport controls stay centered", async () => {
  const [player, marquee, globalStyles] = await Promise.all([
    readFile(new URL("src/components/music-player/ToolbarMusicPlayer.tsx", ROOT_URL), "utf8"),
    readFile(new URL("src/components/music-player/OverflowMarqueeText.tsx", ROOT_URL), "utf8"),
    readFile(new URL("src/app/globals.css", ROOT_URL), "utf8"),
  ]);

  assert.match(player, /text=\{currentTrack\.title\}/u);
  assert.match(player, /text=\{currentTrack\.artist\}/u);
  assert.match(marquee, /content\.scrollWidth - container\.clientWidth/u);
  assert.match(marquee, /isOverflowing \? "music-player-overflow-marquee" : ""/u);
  assert.match(globalStyles, /@keyframes music-player-overflow-marquee/u);
  assert.match(globalStyles, /prefers-reduced-motion: reduce/u);

  const previousControlIndex = player.indexOf('aria-label={t("previous")}');
  const playbackControlIndex = player.indexOf("aria-label={playbackLabel}");
  const nextControlIndex = player.indexOf('aria-label={t("next")}');
  assert.ok(previousControlIndex < playbackControlIndex);
  assert.ok(playbackControlIndex < nextControlIndex);
  assert.match(player, /<div className="flex items-center gap-1\.5">/u);
});
