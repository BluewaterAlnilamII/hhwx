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
  assert.match(player, /state\.command\?\.restartRequestId \?\? 0/u);
  assert.match(player, /key=\{artworkAnimationKey\}/u);
  assert.match(player, /aria-pressed=\{muted\}/u);
  assert.match(
    player,
    /muted\s*\?\s*"bg-\[var\(--theme-color-control-background-pressed\)\] text-\[var\(--theme-color-progress-foreground\)\]"/u,
  );
});

test("event song play action always dispatches the restart-from-beginning queue command", async () => {
  const eventInfoPanel = await readFile(
    new URL("src/app/[locale]/bandori/events/_info/EventInfoPanel.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(eventInfoPanel, /playQueueFromStart\(playableSongs, playableSongIndex\)/u);
  assert.match(eventInfoPanel, /files\.thumb/u);
});

test("page and player artwork use durable CDN source URLs without a Blob cache", async () => {
  const [artwork, eventInfoPanel, player] = await Promise.all([
    readFile(new URL("src/components/music-player/MusicArtwork.tsx", ROOT_URL), "utf8"),
    readFile(new URL("src/app/[locale]/bandori/events/_info/EventInfoPanel.tsx", ROOT_URL), "utf8"),
    readFile(new URL("src/components/music-player/ToolbarMusicPlayer.tsx", ROOT_URL), "utf8"),
  ]);

  assert.match(artwork, /src=\{src\}/u);
  assert.doesNotMatch(artwork, /\bfetch\(|createObjectURL|revokeObjectURL/u);
  assert.match(eventInfoPanel, /<MusicArtwork[\s\S]*?src=\{thumbnailUrl\}/u);
  assert.match(player, /<MusicArtwork[\s\S]*?src=\{currentTrack\.artworkUrl\}/u);
});

test("music and one-shot sound effects use compatible browser audio sessions", async () => {
  const [host, soundEffectAudio, stampAudio, cardDetail] = await Promise.all([
    readFile(new URL("src/components/music-player/MusicPlayerHost.tsx", ROOT_URL), "utf8"),
    readFile(new URL("src/lib/sound-effect-audio.ts", ROOT_URL), "utf8"),
    readFile(new URL("src/lib/comment-stamp-audio.ts", ROOT_URL), "utf8"),
    readFile(new URL("src/app/[locale]/bandori/cards/[cardId]/CardDetailPageClient.tsx", ROOT_URL), "utf8"),
  ]);

  const playbackClaimIndex = host.indexOf("setMusicPlaybackAudioSessionActive(true)");
  const mediaPlayIndex = host.indexOf("await audio.play()");
  assert.ok(playbackClaimIndex >= 0 && playbackClaimIndex < mediaPlayIndex);
  assert.match(host, /setMusicPlaybackAudioSessionActive\(false\)/u);
  assert.doesNotMatch(host, /className="hidden"/u);
  assert.match(host, /className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"/u);
  assert.match(host, /type: "image\/png"/u);
  assert.match(soundEffectAudio, /claimAmbientBrowserAudioSession/u);
  assert.doesNotMatch(soundEffectAudio, /audioSession\.type = "ambient"/u);
  const stopActiveSoundIndex = soundEffectAudio.indexOf("stopActiveSoundEffect();");
  const startSoundIndex = soundEffectAudio.indexOf("source.start(0)");
  assert.ok(stopActiveSoundIndex >= 0 && stopActiveSoundIndex < startSoundIndex);
  assert.match(stampAudio, /playSoundEffect/u);
  assert.match(cardDetail, /playSoundEffect\(src\)/u);
  assert.doesNotMatch(cardDetail, /<audio/u);
  assert.doesNotMatch(cardDetail, /aria-pressed|pauseVoice/u);
});

test("Media Session artwork uses the durable track URL", async () => {
  const host = await readFile(
    new URL("src/components/music-player/MusicPlayerHost.tsx", ROOT_URL),
    "utf8",
  );

  assert.doesNotMatch(host, /useSharedMusicArtworkUrl/u);
  assert.match(host, /artwork: currentTrack\.artworkUrl/u);
  assert.match(host, /src: currentTrack\.artworkUrl/u);
  assert.match(host, /\}, \[currentTrack\]\);/u);
});

test("Media Session keeps track controls while seeking the active audio element", async () => {
  const host = await readFile(
    new URL("src/components/music-player/MusicPlayerHost.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(host, /safeSetActionHandler\("previoustrack"/u);
  assert.match(host, /safeSetActionHandler\("nexttrack"/u);
  assert.doesNotMatch(host, /safeSetActionHandler\("seekbackward"/u);
  assert.doesNotMatch(host, /safeSetActionHandler\("seekforward"/u);
  assert.match(host, /safeSetActionHandler\("seekto"[\s\S]*?applyAudioSeek\(audio, details\.seekTime, details\.fastSeek === true\)/u);
  assert.doesNotMatch(host, /safeSetActionHandler\("seekto"[\s\S]*?requestSeek/u);
});

test("player host refreshes persisted Bandori artwork from the current asset index", async () => {
  const host = await readFile(
    new URL("src/components/music-player/MusicPlayerHost.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(host, /useBandoriMusicAssetIndex\(hasBandoriQueueItems\)/u);
  assert.match(host, /buildBandoriMusicPlayerArtworkUpdates\(queue, musicAssetIndex\)/u);
  assert.match(host, /refreshQueueArtwork/u);
  assert.match(host, /\[currentTrackId, currentTrackSourceUrl\]/u);
});

test("progress scrubbing previews locally and commits one seek when the interaction ends", async () => {
  const player = await readFile(
    new URL("src/components/music-player/ToolbarMusicPlayer.tsx", ROOT_URL),
    "utf8",
  );

  assert.match(player, /onChange=\{\(event\) => updateSeekPreview/u);
  assert.match(player, /onPointerUp=\{\(event\) => commitSeekPreview/u);
  assert.match(player, /onPointerCancel=\{cancelSeekPreview\}/u);
  assert.match(player, /onKeyUp=\{handleSeekKeyUp\}/u);
  assert.doesNotMatch(player, /onChange=\{\(event\) => requestSeek/u);
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
  assert.doesNotMatch(player, /hasMultipleTracks/u);
  assert.doesNotMatch(player, /disabled=\{!canGoPrevious\}|disabled=\{!canGoNext\}/u);
});

test("repeat control exposes off, playlist, and one modes", async () => {
  const [player, englishMessages, chineseMessages] = await Promise.all([
    readFile(new URL("src/components/music-player/ToolbarMusicPlayer.tsx", ROOT_URL), "utf8"),
    readFile(new URL("messages/en/navigation.json", ROOT_URL), "utf8"),
    readFile(new URL("messages/zh-CN/navigation.json", ROOT_URL), "utf8"),
  ]);

  assert.match(player, /cycleRepeatMode/u);
  assert.match(player, /data-repeat-mode=\{repeatMode\}/u);
  assert.match(player, /repeatMode === "one"[\s\S]*?<Repeat1/u);
  assert.match(player, /<Repeat className=/u);
  assert.match(englishMessages, /"repeatAll": "Repeat playlist"/u);
  assert.match(chineseMessages, /"repeatAll": "列表循环"/u);
});
