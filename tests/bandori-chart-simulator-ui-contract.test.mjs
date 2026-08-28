import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("song detail composes existing master and music-index contracts in parallel", async () => {
  const source = await read("../src/app/[locale]/bandori/songs/[songId]/page.tsx");

  assert.match(source, /SONG_ID_PATTERN = \/\^\[1-9\]/u);
  assert.match(source, /Promise\.all\(\[\s*readSongDetail/u);
  assert.match(source, /readBandoriMusicIndex\(\)/u);
  assert.match(source, /chartUrl: `\/api\/bandori\/charts\//u);
  assert.doesNotMatch(source, /multiRange|chartFeatures|local override/iu);
});

test("the heavy runtime stays lazy and remains mounted after the simulator opens", async () => {
  const detail = await read("../src/app/[locale]/bandori/songs/[songId]/SongDetailPageClient.tsx");
  const shell = await read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorClientShell.tsx");
  const runtime = await read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx");

  assert.match(detail, /hasOpenedSimulator[\s\S]*hidden=\{activeView !== "simulator"\}[\s\S]*<ChartSimulatorClientShell/u);
  assert.match(detail, /isActive=\{activeView === "simulator"\}/u);
  assert.match(detail, /loadBandoriChartSimulatorAssets/u);
  assert.match(detail, /requestIdleCallback/u);
  assert.match(detail, /window\.history\.replaceState/u);
  assert.doesNotMatch(detail, /router\.replace|useRouter/u);
  assert.match(shell, /dynamic\(\(\) => import\("\.\/ChartSimulatorRuntime"\)/u);
  assert.match(shell, /ssr: false/u);
  assert.match(shell, /ChartSimulatorLoadingIndicator/u);
  assert.match(shell, /t\("loading\.simulator"\)/u);
  assert.match(runtime, /loadNativeSimulatorStageModule = \(\) => import\("\.\/NativeSimulatorStage"\)/u);
  assert.match(runtime, /dynamic\(loadNativeSimulatorStageModule/u);
  assert.match(runtime, /void loadNativeSimulatorStageModule\(\)/u);
  assert.match(runtime, /compileBandoriChartInWorker/u);
  assert.match(runtime, /compiledChartsRef/u);
  assert.match(runtime, /cache: chartLoadAttempt > 0 \? "reload" : "default"/u);
  assert.doesNotMatch(runtime, /cache: "no-store"/u);
});

test("effect, skin, and volume controls share one validated browser preference", async () => {
  const [runtime, preferences] = await Promise.all([
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/chart-simulator-preferences.ts"),
  ]);

  assert.match(runtime, /readBandoriChartSimulatorPreferences/u);
  assert.match(runtime, /writeBandoriChartSimulatorPreferences/u);
  for (const field of [
    "backgroundSkinId",
    "bgmVolume",
    "directionalEffectVariant",
    "directionalFlickSkinId",
    "fieldSkinId",
    "frameRateLimit",
    "isBgmMuted",
    "isLaneEffectEnabled",
    "isMirrored",
    "isGreatJudgmentWindowEnabled",
    "isPerfectJudgmentWindowEnabled",
    "isRhythmSupportEnabled",
    "isSeMuted",
    "isSuddenLaneEnabled",
    "isSyncLineEnabled",
    "limitedPerformanceSkinId",
    "noteSize",
    "noteSkinId",
    "noteSpeed",
    "playbackRateHundredths",
    "resolutionScale",
    "seVolume",
    "slideJudgmentFrameCorrectionTenths",
    "suddenRate",
    "tapEffectSkinId",
    "tapSeSkinId",
  ]) {
    assert.match(runtime, new RegExp(`${field}:?`, "u"));
    assert.match(preferences, new RegExp(`${field}:`, "u"));
  }
  assert.doesNotMatch(preferences, /isLoopEnabled|loopRange/u);
  assert.match(preferences, /hhwx-bandori-chart-simulator-preferences:v1/u);
});

test("the full-chart view stays present but temporarily disabled", async () => {
  const runtime = await read(
    "../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx",
  );

  assert.match(runtime, /IS_FULL_CHART_VIEW_ENABLED: boolean = false/u);
  assert.match(runtime, /if \(tab === "fullChart" && !IS_FULL_CHART_VIEW_ENABLED\) return/u);
  assert.match(runtime, /disabled=\{tab === "fullChart" && !IS_FULL_CHART_VIEW_ENABLED\}/u);
  assert.match(runtime, /hasOpenedFullChart \? \(/u);
});

test("simulator loading reuses the page spinner and keeps the resource count compact", async () => {
  const [indicator, runtime] = await Promise.all([
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorLoadingIndicator.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
  ]);

  assert.match(indicator, /import \{ Loader2 \} from "lucide-react"/u);
  assert.match(indicator, /animate-spin motion-reduce:animate-none/u);
  assert.match(indicator, /Math\.floor\([\s\S]*Math\.min\(Math\.max\(completedResources, 0\), totalResources\)[\s\S]*\* 100/u);
  assert.match(indicator, /\{progressPercentage\}%/u);
  assert.doesNotMatch(indicator, /\{completedResources\} \/ \{totalResources\}/u);
  assert.doesNotMatch(indicator, /已准备|Loading resources/iu);
  assert.match(runtime, /"absolute inset-0 z-20 flex items-center justify-center/u);
  assert.match(runtime, /"pointer-events-none absolute inset-0 z-20/u);
  assert.doesNotMatch(runtime, /absolute inset-x-0 top-0 z-20/u);
  assert.equal(
    (runtime.match(/aspectRatio: `\$\{BANDORI_NATIVE_STAGE_SIZE\.width\} \/ \$\{BANDORI_NATIVE_STAGE_SIZE\.height\}`/gu) ?? []).length,
    2,
  );
});

test("simulator seek controls share the music player spacing, color, and borderless side-button style", async () => {
  const [runtime, controlStyles] = await Promise.all([
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
    read("../src/components/music-player/transport-control-styles.ts"),
  ]);

  assert.match(
    controlStyles,
    /MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME =[\s\S]*?hover:bg-\[var\(--theme-color-control-background-pressed\)\]/u,
  );
  assert.match(
    controlStyles,
    /MUSIC_PLAYER_SIDE_BUTTON_BASE_CLASS_NAME =[\s\S]*?h-9 w-9[\s\S]*?text-\[var\(--theme-color-text-muted\)\]/u,
  );
  const sideButtonBaseStyle = controlStyles.match(
    /MUSIC_PLAYER_SIDE_BUTTON_BASE_CLASS_NAME =\s*"([^"]+)"/u,
  )?.[1];
  assert.ok(sideButtonBaseStyle);
  assert.doesNotMatch(sideButtonBaseStyle, /\bborder\b/u);
  assert.match(
    runtime,
    /className="flex items-center justify-center gap-1\.5 sm:col-start-2 sm:row-start-1"/u,
  );
  assert.match(
    runtime,
    /grid-cols-\[2\.5rem_2\.25rem_minmax\(0,5rem\)\][\s\S]*?<label htmlFor=\{inputId\} className="justify-self-end">/u,
  );
  assert.match(runtime, /className="w-full min-w-0 accent-\[var\(--theme-color-progress-indicator-background\)\]"/u);
  assert.match(
    runtime,
    /isMuted \? "bg-\[var\(--theme-color-control-background-pressed\)\][\s\S]*hover:bg-\[var\(--theme-color-control-background-pressed\)\]"/u,
  );
  assert.doesNotMatch(runtime, /<output htmlFor=\{inputId\}/u);
  assert.match(
    runtime,
    /grid w-full grid-cols-2[\s\S]*sm:w-auto sm:grid-cols-1[\s\S]*xl:grid-cols-2[\s\S]*?<SimulatorVolumeControl[\s\S]*?<SimulatorVolumeControl/u,
  );
  assert.match(runtime, /gap-x-2 gap-y-1[^"\n]*sm:gap-x-0[^"\n]*xl:grid-cols-2 xl:gap-x-6/u);
  assert.doesNotMatch(runtime, /lg:grid-cols-2 lg:gap-x-6/u);
  assert.doesNotMatch(
    runtime,
    /mt-4 grid gap-y-3 border-t[\s\S]*?<SimulatorVolumeControl/u,
  );
});

test("single-frame controls use symmetric step icons, deterministic hold repeat, and scoped shortcuts", async () => {
  const runtime = await read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx");

  assert.match(runtime, /TRANSPORT_UI_UPDATE_RATE_PER_SECOND = 30/u);
  assert.match(runtime, /TRANSPORT_UI_UPDATE_INTERVAL_MS = 1000 \/ TRANSPORT_UI_UPDATE_RATE_PER_SECOND/u);

  const normalControls = runtime.slice(
    runtime.indexOf('aria-label={t("controls.timeline")}'),
  );
  const backFiveIndex = normalControls.indexOf('aria-label={t("controls.backFive")}');
  const backFrameIndex = normalControls.indexOf('aria-label={t("controls.backOneFrame")}');
  const playbackIndex = normalControls.indexOf('aria-label={t(isPlaying ? "controls.pause" : "controls.play")}');
  const forwardFrameIndex = normalControls.indexOf('aria-label={t("controls.forwardOneFrame")}');
  const forwardFiveIndex = normalControls.indexOf('aria-label={t("controls.forwardFive")}');
  assert.ok(backFiveIndex >= 0);
  assert.ok(backFrameIndex > backFiveIndex);
  assert.ok(playbackIndex > backFrameIndex);
  assert.ok(forwardFrameIndex > playbackIndex);
  assert.ok(forwardFiveIndex > forwardFrameIndex);

  assert.match(runtime, /<StepBack className="h-\[18px\] w-\[18px\]"/u);
  assert.match(runtime, /<StepForward className="h-\[18px\] w-\[18px\]"/u);
  assert.match(runtime, /const FRAME_STEP_HOLD_DELAY_MS = 350;/u);
  assert.match(runtime, /const FRAME_STEP_REPEAT_RATE_PER_SECOND = 15;/u);
  assert.match(runtime, /window\.setTimeout\([\s\S]*?window\.setInterval\(/u);
  assert.match(runtime, /window\.clearTimeout\([\s\S]*?window\.clearInterval\(/u);
  assert.match(runtime, /stepBandoriChartTransport\(transportRef\.current, direction\)/u);
  assert.match(runtime, /transportRef\.current\.phase === "playing"\) pauseAudioAndTransport\(\)/u);

  assert.match(runtime, /event\.key === "ArrowLeft" \|\| event\.key === "ArrowRight"/u);
  assert.match(runtime, /jump\(event\.key === "ArrowLeft" \? -5 : 5\)/u);
  assert.match(runtime, /event\.code === "KeyD" \|\| event\.code === "KeyF"/u);
  assert.match(runtime, /event\.code === "KeyD" \? -1 : 1/u);
  assert.match(runtime, /event\.code === "Space"\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?togglePlayback\(\)/u);
  assert.doesNotMatch(runtime, /isNativeSpaceActivationTarget/u);
  assert.match(runtime, /isSimulatorShortcutInput\(event\.target\)/u);
  assert.match(runtime, /event\.isComposing[\s\S]*?event\.shiftKey/u);
  assert.match(runtime, /handleSimulatorShortcutKeyDown\(event\.nativeEvent, true\)/u);
  assert.match(runtime, /NATIVE_RANGE_NAVIGATION_KEYS\.has\(event\.key\)[\s\S]*event\.preventDefault\(\)/u);
  assert.match(runtime, /aria-keyshortcuts="ArrowLeft ArrowRight d f \[ \] Shift\+\[ Shift\+\] Space r"[\s\S]*onKeyDown=\{handleTimelineKeyDown\}/u);
  assert.doesNotMatch(runtime, /onKeyDown=\{beginScrub\}|onKeyUp=\{commitScrub\}/u);
  assert.match(runtime, /aria-keyshortcuts="ArrowLeft"[\s\S]*?aria-keyshortcuts="d"[\s\S]*?aria-keyshortcuts="Space"[\s\S]*?aria-keyshortcuts="f"[\s\S]*?aria-keyshortcuts="ArrowRight"/u);
});

test("mobile simulator settings match the compact transport control rhythm", async () => {
  const [runtime, skinControls, adjustmentControls, settingsCard] = await Promise.all([
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/SimulatorSkinControls.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/SimulatorAdjustmentControl.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/SimulatorSettingsCard.tsx"),
  ]);

  assert.match(adjustmentControls, /h-9 w-9[\s\S]*sm:h-10 sm:w-10/u);
  assert.match(adjustmentControls, /h-\[18px\] w-\[18px\] sm:h-5 sm:w-5/u);
  assert.match(adjustmentControls, /h-9 min-w-14[\s\S]*text-sm font-bold[\s\S]*sm:h-10 sm:min-w-24[\s\S]*sm:text-base sm:font-black/u);
  assert.match(adjustmentControls, /className\?: string[\s\S]*className=\{cn\(/u);
  assert.match(runtime, /<SimulatorAdjustmentValue\s+ariaLabel=\{currentAriaLabel\}\s+className="min-w-\[4\.5rem\]"/u);
  assert.match(settingsCard, /p-3 shadow-sm sm:p-5/u);
  assert.match(settingsCard, /text-\[15px\][^"\n]*sm:text-base/u);
  assert.match(settingsCard, /mt-2[^"\n]*sm:mt-3/u);
  assert.match(skinControls, /mobileLayout\?: "inline" \| "stacked"/u);
  assert.match(skinControls, /grid py-3[\s\S]*grid-cols-2 items-center gap-2 py-2\.5[\s\S]*items-start gap-1\.5/u);
  assert.match(skinControls, /justify-start" : "justify-center sm:justify-start"/u);
  assert.match(skinControls, /justify-end text-right/u);
  assert.match(skinControls, /text-\[13px\][^"\n]*sm:text-sm/u);
  assert.match(skinControls, /min-h-9[\s\S]*px-3 py-1\.5 text-\[13px\][\s\S]*sm:min-h-11[\s\S]*sm:text-sm/u);
  for (const label of [
    "skinControls.syncLine",
    "skinControls.rhythmSupport",
    "controls.mirrorData",
    "skinControls.laneEffect",
  ]) {
    assert.ok(
      runtime.includes(`<SimulatorControlRow label={t("${label}")} mobileLayout="inline">`),
    );
  }
  assert.match(
    runtime,
    /controls\.perfectJudgmentWindow[\s\S]*isEnabled=\{isPerfectJudgmentWindowEnabled\}[\s\S]*onChange=\{setIsPerfectJudgmentWindowEnabled\}/u,
  );
  assert.match(
    runtime,
    /controls\.greatJudgmentWindow[\s\S]*isEnabled=\{isGreatJudgmentWindowEnabled\}[\s\S]*onChange=\{changeGreatJudgmentWindowEnabled\}/u,
  );
  assert.match(
    runtime,
    /changeGreatJudgmentWindowEnabled[\s\S]*if \(isEnabled\) setIsPerfectJudgmentWindowEnabled\(true\)[\s\S]*setIsGreatJudgmentWindowEnabled\(isEnabled\)/u,
  );
  assert.match(
    runtime,
    /controls\.perfectJudgmentWindow[\s\S]*disabled=\{isGreatJudgmentWindowEnabled\}/u,
  );
  assert.match(
    runtime,
    /controls\.slideJudgmentFrameCorrection[\s\S]*options=\{BANDORI_SLIDE_JUDGMENT_FRAME_CORRECTION_OPTIONS\}[\s\S]*value=\{slideJudgmentFrameCorrectionTenths\}/u,
  );
  assert.match(runtime, /slideJudgmentFrameCorrectionTenths,/u);
  assert.match(skinControls, /disabled\?: boolean[\s\S]*disabled=\{disabled\}/u);
  assert.equal((runtime.match(/mobileLayout="inline"/gu) ?? []).length, 6);
  assert.match(runtime, /grid basis-full grid-cols-2 items-center gap-2 sm:flex sm:justify-start/u);
});

test("stage fullscreen keeps transport overlays outside the central playfield and treats landscape as a preference", async () => {
  const runtime = await read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx");

  assert.match(runtime, /<Maximize className="h-5 w-5"/u);
  assert.match(runtime, /<Minimize className="h-5 w-5"/u);
  assert.match(runtime, /type StageFullscreenMode = "native" \| "viewport" \| null/u);
  assert.match(runtime, /fullscreenRoot\.requestFullscreen\(\{ navigationUI: "hide" \}\)/u);
  assert.match(runtime, /document\.addEventListener\("fullscreenchange", updateFullscreenState\)/u);
  assert.match(runtime, /currentMode === "native" \? null : currentMode/u);
  assert.match(runtime, /setStageFullscreenMode\("viewport"\)/u);
  assert.match(runtime, /stageFullscreenMode === "viewport"[\s\S]*fixed inset-0 z-\[100\] h-\[100dvh\] w-\[100dvw\]/u);
  assert.match(runtime, /document\.body\.style\.overflow = "hidden"[\s\S]*document\.documentElement\.style\.overflow = "hidden"/u);
  assert.match(runtime, /handleViewportFullscreenEscape[\s\S]*event\.key !== "Escape"[\s\S]*exitStageFullscreen\(\)/u);
  assert.match(runtime, /await orientation\.lock\("landscape"\)/u);
  assert.match(runtime, /keep fullscreen in the user's[\s\S]*current orientation/u);

  const fullscreenEntryIndex = runtime.indexOf('aria-label={t("controls.enterFullscreen")}');
  const fullscreenRootIndex = runtime.indexOf("data-chart-simulator-fullscreen-root");
  const fullscreenControlsIndex = runtime.indexOf("data-chart-simulator-fullscreen-controls");
  const normalTimelineIndex = runtime.indexOf('aria-label={t("controls.timeline")}');
  assert.ok(fullscreenEntryIndex >= 0);
  assert.ok(fullscreenRootIndex >= 0);
  assert.ok(fullscreenControlsIndex > fullscreenRootIndex);
  assert.ok(normalTimelineIndex > fullscreenControlsIndex);
  const fullscreenEntrySection = runtime.slice(fullscreenEntryIndex, fullscreenRootIndex);
  assert.match(fullscreenEntrySection, /border-\[var\(--theme-color-action-secondary-border\)\]/u);
  assert.match(fullscreenEntrySection, /disabled=\{activeTab !== "stage"\}/u);
  assert.doesNotMatch(fullscreenEntrySection, /isFullscreenSupported/u);
  const fullscreenSection = runtime.slice(fullscreenRootIndex, normalTimelineIndex);
  assert.match(fullscreenSection, /data-chart-simulator-fullscreen-backward-controls/u);
  assert.match(fullscreenSection, /data-chart-simulator-fullscreen-forward-controls/u);
  assert.match(fullscreenSection, /data-chart-simulator-fullscreen-backward-controls[\s\S]*controls\.backOneFrame[\s\S]*controls\.backFive/u);
  assert.match(fullscreenSection, /data-chart-simulator-fullscreen-forward-controls[\s\S]*controls\.forwardOneFrame[\s\S]*controls\.forwardFive/u);
  assert.match(fullscreenSection, /top-\[42%\][\s\S]*flex-col/u);
  assert.match(fullscreenSection, /portrait:fixed portrait:grid portrait:grid-cols-1/u);
  assert.match(fullscreenSection, /gridTemplateRows: `minmax\(0, 1fr\) min\(100dvh, \$\{FULLSCREEN_STAGE_HEIGHT_DVW\}dvw\) minmax\(0, 1fr\)`/u);
  assert.match(fullscreenSection, /portrait:row-start-1[\s\S]*loopControls\.ariaLabel/u);
  assert.match(fullscreenSection, /data-chart-simulator-fullscreen-backward-controls[\s\S]*portrait:row-start-3[\s\S]*portrait:flex-row-reverse/u);
  assert.match(fullscreenSection, /data-chart-simulator-fullscreen-forward-controls[\s\S]*portrait:row-start-3[\s\S]*portrait:flex-row/u);
  assert.match(fullscreenSection, /safe-area-inset-left/u);
  assert.match(fullscreenSection, /safe-area-inset-right/u);
  assert.match(fullscreenSection, /bg-slate-950\/65/u);
  assert.match(fullscreenSection, /loopControls\.reset[\s\S]*stageRenderFpsText\} FPS/u);
  assert.doesNotMatch(fullscreenSection, /SimulatorVolumeControl|controls\.timeline|rotate-90|portrait:hidden/u);
});

test("stage render FPS uses a one-second ticker sample and stays outside the playfield", async () => {
  const [runtime, stage] = await Promise.all([
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/NativeSimulatorStage.tsx"),
  ]);

  assert.match(stage, /RENDER_FPS_SAMPLE_INTERVAL_MS = 1000/u);
  assert.match(stage, /const renderStageFrame = \(\) => \{[\s\S]*renderNotes\(\)[\s\S]*sample\.frameCount \+= 1[\s\S]*elapsedMs < RENDER_FPS_SAMPLE_INTERVAL_MS[\s\S]*onRenderFpsChange\(Math\.round\(sample\.frameCount \* 1000 \/ elapsedMs\)\)/u);
  assert.match(stage, /app\.ticker\.add\(renderStageFrame\)/u);
  assert.match(stage, /application\.stop\(\)[\s\S]*onRenderFpsChange\(null\)/u);
  assert.match(runtime, /onRenderFpsChange=\{setStageRenderFps\}/u);
  assert.match(runtime, /formatPlaybackTime\(durationSeconds\)[\s\S]*stageRenderFpsText\} FPS[\s\S]*aria-label=\{t\("loopControls\.ariaLabel"\)\}/u);
});

test("native judgment windows stay diagnostic, lane-owned, and outside the Sudden mask", async () => {
  const [runtime, stage] = await Promise.all([
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/NativeSimulatorStage.tsx"),
  ]);

  assert.match(
    stage,
    /app\.stage\.addChild\([\s\S]*field,[\s\S]*judgmentWindowLayer,[\s\S]*directionalLineLayer/u,
  );
  assert.doesNotMatch(stage, /judgmentWindowLayer\.mask/u);
  assert.match(stage, /prepareBandoriNativeJudgmentWindowCandidates/u);
  assert.match(
    stage,
    /const firstJudgmentIndex = upperBoundBandoriNoteTime\([\s\S]*for \(let index = firstJudgmentIndex; index < endIndex; index \+= 1\)[\s\S]*activeJudgmentCandidates\.push\(candidate\)[\s\S]*collectBandoriNativeJudgmentWindowSegments/u,
  );
  assert.match(stage, /projectBandoriNativeTimelinePosition/u);
  assert.doesNotMatch(stage, /getBandoriNativeRibbonLaneAtBeat/u);
  assert.match(
    stage,
    /const startLeftLane = segment\.leftLane;[\s\S]*const startRightLane = segment\.rightLane;[\s\S]*const endLeftLane = startLeftLane;/u,
  );
  assert.match(stage, /approachTimeScale: currentNoteApproachTimeScale/u);
  assert.match(stage, /collectBandoriNativeJudgmentWindowOutlineEdges/u);
  assert.match(stage, /prepareBandoriNativeJudgmentWindowPriorityIndex/u);
  assert.match(stage, /priorityIndex: judgmentPriorityIndex/u);
  assert.match(stage, /for \(const edge of judgmentWindowOutlineEdges\)/u);
  assert.match(stage, /PERFECT_JUDGMENT_WINDOW_COLOR = 0x41dfff/u);
  assert.match(stage, /GREAT_JUDGMENT_WINDOW_COLOR = 0xffc247/u);
  assert.match(stage, /JUDGMENT_WINDOW_BORDER_ALPHA = 0\.9/u);
  assert.match(stage, /\.stroke\(\{[\s\S]*width: JUDGMENT_WINDOW_BORDER_WIDTH/u);
  assert.match(runtime, /greatJudgmentWindowEnabled=\{isGreatJudgmentWindowEnabled\}/u);
  assert.match(runtime, /perfectJudgmentWindowEnabled=\{isPerfectJudgmentWindowEnabled\}/u);
  assert.match(
    runtime,
    /slideJudgmentFrameCorrectionTenths=\{slideJudgmentFrameCorrectionTenths\}/u,
  );
  assert.match(
    stage,
    /slideFrameCorrectionTenths:[\s\S]*slideJudgmentFrameCorrectionTenthsRef\.current/u,
  );
});

test("range looping reuses the serialized seek handoff without claiming a gapless boundary", async () => {
  const runtime = await read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx");

  assert.match(runtime, /const seekToLoopStart = useCallback/u);
  assert.match(runtime, /seekAudioAndTransport\([\s\S]*includeStartBoundary: true/u);
  assert.match(runtime, /const wrapLoopAfterBoundary = useCallback\([\s\S]*const range = getBandoriChartLoopRange\(loopPointsRef\.current\)[\s\S]*presentationTimeSeconds < range\.endTimeSeconds[\s\S]*seekToLoopStart\(range\)/u);
  assert.match(runtime, /loopSeekPendingRef\.current = true[\s\S]*request\.then\(finish, finish\)/u);
  assert.match(runtime, /isMusicPresentationTransitioning \|\| pendingPlaybackResumeRef\.current/u);
  assert.match(runtime, /setBandoriChartLoopPoint\([\s\S]*currentTimeSeconds[\s\S]*current\.phase === "playing"[\s\S]*currentTimeSeconds >= range\.endTimeSeconds[\s\S]*seekToLoopStart\(range\)/u);
  assert.match(runtime, /const playableTransport = loopRange[\s\S]*getBandoriChartPresentationTime\(current\) >= loopRange\.endTimeSeconds[\s\S]*createLoopSeekTransport\(current, loopRange\.startTimeSeconds, false\)/u);
  assert.match(runtime, /event\.code === "BracketLeft" \|\| event\.code === "BracketRight"[\s\S]*setLoopPointAtPresentationTime\([\s\S]*event\.code === "BracketLeft" \? "start" : "end"/u);
  assert.match(runtime, /event\.shiftKey[\s\S]*event\.code !== "BracketLeft"[\s\S]*clearLoopPoint\(event\.code === "BracketLeft" \? "start" : "end"\)/u);
  assert.match(runtime, /event\.code === "KeyR"[\s\S]*!event\.repeat[\s\S]*resetLoopPoints\(\)/u);
  assert.match(runtime, /LOOP_POINT_CLEAR_HOLD_DELAY_MS = 500/u);
  assert.match(runtime, /startLoopPointClearHold[\s\S]*window\.setTimeout\([\s\S]*suppressedLoopPointClickRef\.current = kind[\s\S]*clearLoopPoint\(kind\)/u);
  assert.match(runtime, /onPointerDown=\{\(event\) => startLoopPointClearPointerHold\(event, "start"\)\}[\s\S]*onContextMenu=\{\(event\) => handleLoopPointContextMenu\(event, "start"\)\}/u);
  assert.match(runtime, /suppressedLoopPointClickRef\.current === kind[\s\S]*setLoopPointAtPresentationTime\(kind\)/u);
  assert.match(runtime, /loopStartPercentage !== null && loopEndPercentage !== null/u);
  assert.match(runtime, /loopStartPercentage !== null[\s\S]*loopEndPercentage !== null/u);
  assert.match(runtime, /native 16px range thumb travels between centers inset 8px[\s\S]*className="absolute inset-y-0 left-2 right-2"/u);
  assert.match(runtime, /left-2 right-2[\s\S]*width: `\$\{playbackPercentage\}%`[\s\S]*left: `\$\{loopStartPercentage\}%`[\s\S]*left: `\$\{loopEndPercentage\}%`/u);
  assert.doesNotMatch(runtime, /等待设置终点|循环中|waiting for loop/iu);
  assert.doesNotMatch(runtime, /isBandoriSimulatorLoopAvailable|isLoopUnavailable/u);
});

test("the Pixi stage loads the selected stage, point-note atlases, and bounded hit effects", async () => {
  const [stage, stageContract, noteAssets, tapEffectAssets, notePresentation, hitPresentation, holdPresentation, judgmentComboPresentation, runtime, skinControls, adjustmentControls, settingsCard, switchControl, loopRange, compiler, worker, musicBackends] = await Promise.all([
    read("../src/app/[locale]/bandori/songs/[songId]/NativeSimulatorStage.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/native-stage-contract.ts"),
    read("../src/app/[locale]/bandori/songs/[songId]/native-note-assets.ts"),
    read("../src/app/[locale]/bandori/songs/[songId]/native-tap-effect-assets.ts"),
    read("../src/lib/bandori/chart-simulator/native-note-presentation.ts"),
    read("../src/lib/bandori/chart-simulator/native-hit-effect-presentation.ts"),
    read("../src/lib/bandori/chart-simulator/native-hold-effect-presentation.ts"),
    read("../src/lib/bandori/chart-simulator/native-judgment-combo-presentation.ts"),
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/SimulatorSkinControls.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/SimulatorAdjustmentControl.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/SimulatorSettingsCard.tsx"),
    read("../src/components/Switch.tsx"),
    read("../src/lib/bandori/chart-simulator/loop-range.ts"),
    read("../src/lib/bandori/chart-simulator/compiler.ts"),
    read("../src/lib/bandori/chart-simulator/compiler.worker.ts"),
    read("../src/lib/bandori/chart-simulator/music-playback-backends.ts"),
  ]);
  const simulatorSource = `${stage}\n${stageContract}\n${noteAssets}\n${tapEffectAssets}\n${notePresentation}\n${hitPresentation}\n${holdPresentation}\n${judgmentComboPresentation}\n${runtime}\n${skinControls}\n${adjustmentControls}\n${settingsCard}\n${switchControl}\n${loopRange}\n${compiler}\n${worker}`;

  assert.match(stage, /Application,[\s\S]*Container,[\s\S]*Sprite/u);
  assert.match(stage, /const suddenLine = new NineSliceSprite/u);
  assert.match(stage, /leftWidth: BANDORI_NATIVE_SUDDEN_LINE_BORDER_PIXELS\.left/u);
  assert.match(stage, /suddenLine\.setSize\([\s\S]*size\.width \/ sourcePixelScale/u);
  assert.match(stage, /getBandoriNativeSuddenLineScreenY\(rate\)/u);
  assert.doesNotMatch(stage, /const suddenLine = new Sprite/u);
  assert.match(stage, /Promise\.all\(\[/u);
  assert.match(stage, /const loadTexture = async \(logicalUrl: string\)[\s\S]*const resolvedUrl = resolveAssetUrl\(logicalUrl\)[\s\S]*acquireBandoriChartSimulatorTexture\(resolvedUrl\)/u);
  assert.match(stage, /plannedResourceUrls = new Set\([\s\S]*requiredLogicalUrls\.map\(resolveAssetUrl\)/u);
  assert.match(stage, /completedResourceUrls = new Set<string>\(\)/u);
  assert.match(stage, /onLoadProgress\(\{[\s\S]*phase: "resources"[\s\S]*totalResources/u);
  assert.match(stage, /const mainTextureUrls: Array<string \| null> = \[/u);
  assert.match(stage, /backgroundSkin\.layers\.map\(\(layer\) => layer\.textureUrl\)/u);
  assert.match(stage, /fieldSkin\.textureUrl/u);
  assert.match(stage, /fieldSkin\.judgmentLineTextureUrl/u);
  assert.match(stage, /noteSkin\.frameSource === "atlas" \? noteSkin\.atlasUrl : null/u);
  assert.match(stage, /noteSkin\.syncLineUrl/u);
  assert.match(stage, /getBandoriNativeRhythmSupportNoteUrl\(noteSkin, lane\)/u);
  assert.match(stage, /directionalFlickSkin\.atlasUrl/u);
  assert.match(stage, /Promise\.all\(mainTextureUrls\.map\([\s\S]*loadTexture\(url\)/u);
  assert.match(stage, /usesDefaultTapEffect \? BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL : null/u);
  assert.match(stage, /usesDefaultTapEffect \? BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL : null/u);
  assert.match(stage, /loadTapEffects\([\s\S]*tapEffectEnabled \? tapEffectContract : null,[\s\S]*loadJson,[\s\S]*loadTexture/u);
  assert.match(stage, /getBandoriNativeDirectionalEffectAssetContract\(directionalFlickSkin\)/u);
  assert.match(stage, /loadDirectionalEffects\([\s\S]*directionalFlickSkin,[\s\S]*loadJson,[\s\S]*loadTexture/u);
  assert.match(stage, /BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANTS[\s\S]*BANDORI_NATIVE_DIRECTIONAL_EFFECT_RECIPE_KEYS/u);
  assert.match(stage, /app\.stage\.addChild\([\s\S]*directionalLineLayer,[\s\S]*judgmentLine,[\s\S]*laneEffectLayer,[\s\S]*lowHitEffectLayer,[\s\S]*highHitEffectLayer,[\s\S]*ribbonLayer,[\s\S]*noteLayer/u);
  assert.match(stage, /app\.ticker\.add\(renderStageFrame\)/u);
  assert.match(stage, /autoStart: false/u);
  assert.match(stage, /app\.ticker\.add\(renderStageFrame\);[\s\S]*if \(isActiveRef\.current\) \{[\s\S]*app\.start\(\)/u);
  assert.match(stage, /if \(isActive\) \{[\s\S]*application\.start\(\)[\s\S]*application\.stop\(\)/u);
  assert.match(runtime, /isActive=\{isActive && activeTab === "stage" && isSelectedChartReady\}/u);
  assert.match(runtime, /<SimulatorControlRow label=\{t\("controls\.suddenRate"\)\}>[\s\S]*suffix="%"[\s\S]*\{t\("controls\.suddenLane"\)\}[\s\S]*label=\{t\("controls\.suddenLane"\)\}[\s\S]*<\/SimulatorControlRow>/u);
  assert.doesNotMatch(runtime, /<SimulatorControlRow label=\{t\("controls\.suddenLane"\)\}>/u);
  assert.doesNotMatch(skinControls, /overriddenLabel|limitedPerformance\.overriddenBy/u);
  assert.match(stage, /void initialize\(\)\.catch/u);
  assert.match(stage, /resourceAbortController\.abort\(\)/u);
  assert.match(stage, /acquireBandoriChartSimulatorTexture\(resolvedUrl\)/u);
  assert.match(stage, /textureLeases\.splice\(0\)[\s\S]*lease\.release\(\)/u);
  assert.doesNotMatch(stage, /Assets\.load<Texture>/u);
  assert.match(runtime, /queueMicrotask\(releaseUnusedBandoriChartSimulatorTexturesNow\)/u);
  assert.match(stage, /prepareBandoriNativeChartVisuals\(compiled, false\)/u);
  assert.match(stage, /prepareBandoriNativeChartVisuals\(compiled, true\)/u);
  assert.match(stage, /renderedMirror !== isMirroredRef\.current/u);
  assert.match(stage, /atlasHeight - frame\.y - frame\.height/u);
  assert.match(runtime, /currentTransport\.phase === "playing"[\s\S]*runtime\?\.isMusicPlaying[\s\S]*runtime\.getMusicTime\(\)/u);
  assert.doesNotMatch(runtime, /BANDORI_MUSIC_PLAYBACK_BACKEND|musicPlaybackBackendRef|changeMusicPlaybackBackend/u);
  assert.doesNotMatch(runtime, /SimulatorChoiceButton|controls\.musicBackend/u);
  assert.match(runtime, /const shouldResume = currentTransport\.phase === "playing"[\s\S]*pendingPlaybackResumeRef\.current[\s\S]*if \(shouldResume\) \{[\s\S]*runtime\?\.pauseMusic\(\)[\s\S]*seekAudioAndTransport\(\s*\{[\s\S]*phase: "playing"/u);
  assert.match(runtime, /await runtime\.startMusic/u);
  assert.match(runtime, /runtime\.subscribeMusicPlaybackError/u);
  assert.match(runtime, /phase: shouldResume[\s\S]*\? "playing"/u);
  assert.match(runtime, /isMediaPlaybackReadyRef\.current = isPresentationTailDraining/u);
  assert.match(runtime, /runtime\.isMusicPresentationTransitioning \|\| pendingPlaybackResumeRef\.current[\s\S]*!scheduleDuringPresentationTransition/u);
  assert.match(runtime, /changePlaybackRate[\s\S]*includeStartBoundary: true/u);
  assert.ok(runtime.includes(
    "${loadAttempt}:${assetLoadState.manifestSha256}:${audioUrl}",
  ));
  assert.match(musicBackends, /await import\("signalsmith-stretch"\)/u);
  assert.match(musicBackends, /signalsmith-stretch-1\.3\.2\.mjs/u);
  assert.doesNotMatch(musicBackends, /soundtouch/iu);
  assert.match(notePresentation, /BANDORI_NATIVE_NOTE_SPEED_MIN = 1/u);
  assert.match(notePresentation, /BANDORI_NATIVE_NOTE_SPEED_MAX = 12/u);
  assert.match(notePresentation, /BANDORI_NATIVE_NOTE_SPEED_STEP = 0\.01/u);
  assert.match(notePresentation, /noteSpeed > 11\.01/u);
  assert.match(stage, /getBandoriSimulatorNoteArrivalSeconds\([\s\S]*currentNoteSpeed,[\s\S]*currentNoteApproachTimeScale/u);
  assert.match(stage, /let particleScreenY = getBandoriApprovedManualVerticalBeamScreenY\([\s\S]*display\.kind,[\s\S]*display\.placement\.screenY,[\s\S]*instance/u);
  assert.match(stage, /initialScreenY = instance\.screenY/u);
  assert.match(stage, /particleScreenY = getBandoriApprovedAnimatedTravelScreenY\([\s\S]*initialScreenY,[\s\S]*instance\.screenY,[\s\S]*animatedVerticalBeam\.travelSpeedMultiplier/u);
  assert.match(stage, /const directionalNotesCenterOffsetPixels =\s*getBandoriApprovedManualDirectionalNotesCenterOffsetPixels\(instance\)/u);
  assert.doesNotMatch(stage, /const (?:particleScreenY|directionalNotesCenterOffsetPixels) = display\.isNativeDefault/u);
  assert.match(stage, /const terminalScreenX = event\.terminalVisualLane === null[\s\S]*event\.kind\.startsWith\("directional-"\)[\s\S]*triggerSwipeEffect\([\s\S]*terminalScreenX/u);
  assert.match(stage, /getBandoriNativeNoteScale\([\s\S]*noteSizeRef\.current,[\s\S]*isMultiRangeChart/u);
  assert.match(stage, /directionalLineLayer\.mask = mask[\s\S]*syncLineLayer\.mask = mask[\s\S]*ribbonLayer\.mask = mask[\s\S]*noteLayer\.mask = mask/u);
  assert.match(stage, /field\.mask = isLaneHidden \? mask : null/u);
  assert.doesNotMatch(stage, /fieldDisplayTexture|fieldBaseFrame/u);
  assert.match(stage, /limitedPerformanceSkin\?\.judgmentPerfectTextureUrl[\s\S]*BANDORI_NATIVE_PERFECT_JUDGMENT_URL/u);
  assert.match(stage, /loadNativeSpriteAnchors\([\s\S]*noteSkin\.spriteAnchorsUrl/u);
  assert.match(stage, /BANDORI_NATIVE_JUDGMENT_LANE_SPACING_PIXELS/u);
  assert.match(stage, /noteSpeedRef\.current/u);
  assert.match(stage, /noteApproachTimeScaleRef\.current/u);
  assert.match(stage, /collectBandoriNativeHitEvents/u);
  assert.match(stage, /collectBandoriNativeLaneEffectEvents/u);
  assert.doesNotMatch(stage, /compiled\.notes\.widths\[event\.index\] > 3/u);
  assert.match(hitPresentation, /width > 7/u);
  assert.match(hitPresentation, /widthBucket < 3[\s\S]*rootVisual\.lane/u);
  assert.match(stage, /collectBandoriNativeSyncLinePairs/u);
  assert.match(stage, /note\.visual\.lane === display\.leftVisualLane/u);
  assert.match(stage, /note\.visual\.lane === display\.rightVisualLane/u);
  assert.doesNotMatch(stage, /leftNoteIndex\)\?\.notes\[0\]/u);
  assert.doesNotMatch(stage, /rightNoteIndex\)\?\.notes\[0\]/u);
  assert.match(stage, /if \(syncLineEnabledRef\.current\)[\s\S]*desiredSyncLines\.add\(display\)/u);
  assert.match(stage, /updateSyncLine\(display, activeNotes, true, currentNoteScale\)/u);
  assert.match(stage, /rhythmSupportEnabledRef\.current[\s\S]*&& note\.rhythmSupportTexture/u);
  assert.match(stage, /isRhythmSupportNote && visual\.body === "normal"/u);
  assert.match(stage, /if \(laneEffectEnabledRef\.current\)/u);
  assert.match(stage, /effectTint\(1 - 0\.3 \* progress, 1 - 0\.3 \* progress, 1\)/u);
  assert.doesNotMatch(stage, /baseScaleX \* scale|baseScaleY \* scale/u);
  assert.match(stage, /collectBandoriNativeHoldStates/u);
  assert.match(stage, /createBandoriNativeHoldEffectRuntime/u);
  assert.match(stage, /projectBandoriNativeHoldState\([\s\S]*currentBeat,[\s\S]*presentationTime/u);
  assert.match(stage, /projectBandoriNativeRibbonBody\([\s\S]*currentBeat,[\s\S]*presentationTime/u);
  assert.match(stage, /touchingFlashLayer/u);
  assert.match(stage, /flash\.blendMode = "add"/u);
  assert.doesNotMatch(stage, /heldSlideLanes/u);
  assert.match(stage, /getBandoriNativeLongFlashUrl\(noteSkin, lane\)/u);
  assert.match(stage, /createBandoriApproximateKiraParticles/u);
  assert.match(stage, /NATIVE_STRETCHED_PARTICLE_ROTATION = -Math\.PI \/ 2/u);
  assert.match(stage, /sprite\.anchor\.set\(layer\.projection === "stretched" \? 0 : 0\.5, 0\.5\)/u);
  assert.match(stage, /Stretched Billboard aligns the texture's horizontal length axis/u);
  assert.match(runtime, /getStageEffectPlaybackState/u);
  assert.match(runtime, /effectTimelineVersionRef\.current \+= 1/u);
  assert.match(runtime, /snapshotTransportAtAudioTime/u);
  assert.match(runtime, /pauseAudioAndTransport/u);
  assert.match(runtime, /document\.visibilityState !== "hidden"/u);
  assert.match(runtime, /addEventListener\("visibilitychange", pauseWhenDocumentBecomesHidden\)/u);
  assert.match(runtime, /removeEventListener\([\s\S]*"visibilitychange",[\s\S]*pauseWhenDocumentBecomesHidden/u);
  assert.match(runtime, /transportRef\.current\.phase !== "playing"/u);
  assert.match(runtime, /createBandoriNativeNoteSoundTimeline/u);
  assert.match(runtime, /createBandoriNativeAudioRuntime/u);
  assert.match(runtime, /collectBandoriNativeNoteSoundEvents/u);
  assert.doesNotMatch(runtime, /<audio|crossOrigin="anonymous"/u);
  assert.match(runtime, /runtime\.getNoteSoundScheduleAheadMediaSeconds\(currentPlaybackRate\)/u);
  assert.match(runtime, /runtime\.prepareMusic\(audioUrl, controller\.signal\)/u);
  assert.match(runtime, /runtime\.prepareCueBank\(cueBank, \(url\) =>/u);
  assert.match(runtime, /currentStageLoadProgress\.completedResources[\s\S]*currentSoundLoadProgress\.completedResources[\s\S]*currentMusicLoadProgress\?\.completedResources/u);
  assert.match(runtime, /<ChartSimulatorLoadingIndicator[\s\S]*completedResources=\{isSelectedChartReady \? completedResources : null\}[\s\S]*totalResources=\{isSelectedChartReady \? totalResources : null\}/u);
  assert.match(runtime, /disabled=\{!audioUrl \|\| \(!isPlaying && !isSimulatorReady\)\}/u);
  assert.match(runtime, /aria-pressed=\{isMuted\}/u);
  assert.match(runtime, /isMuted \? <VolumeX[\s\S]*: <Volume2/u);
  assert.match(runtime, /const toggleBgmMuted = \(\) => \{[\s\S]*nextMuted \? 0 : getBandoriNativeBgmGain\(bgmVolumeRef\.current\)/u);
  assert.match(runtime, /const toggleSeMuted = \(\) => \{[\s\S]*nextMuted \? 0 : getBandoriNativeSeGain\(seVolumeRef\.current\)/u);
  assert.match(runtime, /bgmVolume: isBgmMutedRef\.current[\s\S]*seVolume: isSeMutedRef\.current/u);
  const performanceLoadingIndex = runtime.indexOf('t("loading.performance")');
  const soundLoadingIndex = runtime.indexOf('t("loading.sound")');
  const musicLoadingIndex = runtime.indexOf('t("loading.music")');
  const stageLoadingIndex = runtime.indexOf('t("loading.stage")');
  assert.ok(performanceLoadingIndex >= 0);
  assert.ok(soundLoadingIndex > performanceLoadingIndex);
  assert.ok(musicLoadingIndex > soundLoadingIndex);
  assert.ok(stageLoadingIndex > musicLoadingIndex);
  assert.match(runtime, /requestAnimationFrame\(updatePlayback\)/u);
  assert.doesNotMatch(runtime, /playSoundEffect/u);
  assert.match(runtime, /jumpBandoriChartTransport\(snapshotTransportAtAudioTime\(\), delta\)/u);
  assert.match(runtime, /beginBandoriChartScrub\(current\)/u);
  assert.match(runtime, /await runtime\.resume\(\);[\s\S]*runtime\.startMusic\(/u);
  assert.doesNotMatch(runtime, /seekBandoriMediaElement|playBandoriMediaElement|media-seek/u);
  assert.match(runtime, /mediaOperationSequencer\.runLatest\(async \(operation\) =>/u);
  assert.match(runtime, /operation\.throwIfSuperseded\(\);[\s\S]*runtime\.startMusic\(/u);
  assert.match(
    runtime,
    /const playableTransport = loopRange[\s\S]*const next = playBandoriChartTransport\(playableTransport\);[\s\S]*await seekAudioAndTransport\(next\)/u,
  );
  assert.match(runtime, /Math\.min\(currentTransport\.durationSeconds, runtime\.getMusicTime\(\)\)/u);
  assert.doesNotMatch(runtime, /frozenMediaTimeRef/u);
  assert.match(runtime, /startedTimeSeconds === null\)[\s\S]*pauseAudioInternally\(\)/u);
  assert.doesNotMatch(runtime, /handleMediaWaiting|handleMediaPlaying|handleMediaError|onWaiting=|onPlaying=|onError=/u);
  assert.match(runtime, /subscribeMusicEnded\(handleMusicEnded\)/u);
  assert.match(runtime, /subscribeContextState\(\(state\) =>/u);
  assert.doesNotMatch(runtime, /readyState|MEDIA_HAVE_FUTURE_DATA/u);
  assert.match(runtime, /shouldMediaPlayRef\.current[\s\S]*transportRef\.current\.phase === "playing"/u);
  assert.doesNotMatch(runtime, /expectedPauseEventsRef|mediaOperationAbortControllerRef|estimateBandoriNativeOutputMediaTime|mediaOutputFloorRef/u);
  assert.doesNotMatch(runtime, /const playPromise = audio\.play\(\)/u);
  assert.doesNotMatch(runtime, /mediaTimeSeconds >= activeLoopRange\.endTimeSeconds/u);
  assert.doesNotMatch(runtime, /audio\.currentTime\s*=\s*next\.currentTimeSeconds/u);
  assert.doesNotMatch(runtime, /onPause=|audioRef/u);
  assert.match(hitPresentation, /effects\/tap\/normal\/perfect|BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS/u);
  assert.match(hitPresentation, /count: 25/u);
  assert.match(hitPresentation, /only motion semantic[\s\S]*approximated/u);
  assert.match(holdPresentation, /BANDORI_NATIVE_LONG_FLASH_PERIOD_SECONDS = 0\.8333333135/u);
  assert.match(holdPresentation, /createBandoriEffectRecipeRuntime\(selectedRecipe/u);
  assert.match(holdPresentation, /variant\.kind === "long"/u);
  assert.match(stage, /getBandoriHabahiroLongFlashSpriteName\([\s\S]*projection\.flashCoveredLanes/u);
  assert.doesNotMatch(stage, /getBandoriHabahiroLongFlashSpriteName\(head\.coveredLanes\)/u);
  assert.match(stage, /createPerfectJudgmentDisplay\(perfectJudgmentTexture\)/u);
  assert.match(stage, /triggerPerfectJudgment\(perfectJudgment, effectAnimationTimeSeconds\)/u);
  assert.match(stage, /upperBoundBandoriNoteTime\([\s\S]*compiled\.notes\.times,[\s\S]*presentationTime/u);
  assert.match(stage, /allPerfectCombo\.root\.visible = currentCombo > 0;/u);
  assert.doesNotMatch(stage, /allPerfectStatusEnabled/u);
  assert.match(judgmentComboPresentation, /judge_perfect\.png/u);
  assert.match(judgmentComboPresentation, /combo_AP\.png/u);
  assert.doesNotMatch(runtime, /allPerfectStatusEnabled|skinControls\.allPerfectStatus/u);
  assert.match(stage, /event\.rangeWidth/u);
  assert.match(noteAssets, /note_long_flash_\$\{lane\}\.png/u);
  assert.match(runtime, /NOTE_SPEED_DECREASES = \[-0\.5, -0\.1, -0\.01\]/u);
  assert.match(runtime, /NOTE_SPEED_INCREASES = \[0\.01, 0\.1, 0\.5\]/u);
  assert.match(runtime, /PLAYBACK_RATE_DECREASES = \[-10, -1\]/u);
  assert.match(runtime, /PLAYBACK_RATE_INCREASES = \[1, 10\]/u);
  assert.match(runtime, /<SimulatorAdjustmentButton/u);
  assert.match(runtime, /<SimulatorAdjustmentValue/u);
  assert.match(runtime, /formatPlaybackTime\(presentationTime\)[\s\S]*formatPlaybackTime\(durationSeconds\)/u);
  assert.match(runtime, /loopStartPercentage[\s\S]*loopEndPercentage/u);
  assert.match(adjustmentControls, /level === 3\) return <ChevronsLeft/u);
  assert.match(adjustmentControls, /level === 2\) return <ChevronLeft/u);
  assert.match(adjustmentControls, /return <Minus/u);
  assert.match(adjustmentControls, /level === 3\) return <ChevronsRight/u);
  assert.match(adjustmentControls, /level === 2\) return <ChevronRight/u);
  assert.match(adjustmentControls, /return <Plus/u);
  assert.match(adjustmentControls, /theme-color-action-secondary-foreground/u);
  assert.doesNotMatch(runtime, />\s*[+−]\{/u);
  assert.doesNotMatch(runtime, /setMusicPlaybackRate/u);
  assert.match(runtime, /const continuationTimeSeconds = runtime\?\.pauseMusic\(\);[\s\S]*void seekAudioAndTransport/u);
  assert.doesNotMatch(runtime, /defaultPlaybackRate|preservesPitch/u);
  assert.match(runtime, /getBandoriSimulatorPlaybackRate\(playbackRateHundredthsRef\.current\)/u);
  assert.match(runtime, /getBandoriSimulatorNoteApproachTimeScale\(\s*playbackRateHundredths,\s*\)/u);
  assert.match(runtime, /noteApproachTimeScale=\{noteApproachTimeScale\}/u);
  assert.doesNotMatch(runtime, /syncNoteSpeedSlowdown|isNoteSpeedSlowdownSynchronized/u);
  assert.match(stage, /projectBandoriNativeNote\([\s\S]*currentNoteApproachTimeScale/u);
  assert.match(stage, /projectBandoriNativeRibbonPoint\([\s\S]*currentNoteApproachTimeScale/u);
  assert.match(stage, /projectBandoriNativeRibbonBody\([\s\S]*currentNoteApproachTimeScale/u);
  assert.doesNotMatch(runtime, /<SimulatorLoopControls|isLoopEnabled|changeLoopEnabled/u);
  assert.match(runtime, /aria-label=\{t\("loopControls\.ariaLabel"\)\}/u);
  assert.match(runtime, /aria-label=\{t\("loopControls\.setStart"\)\}[\s\S]*?aria-keyshortcuts="\[ Shift\+\["[\s\S]*?>\s*A\s*<\/button>/u);
  assert.match(runtime, /aria-label=\{t\("loopControls\.setEnd"\)\}[\s\S]*?aria-keyshortcuts="\] Shift\+\]"[\s\S]*?>\s*B\s*<\/button>/u);
  assert.match(runtime, /formatPlaybackTime\(presentationTime\)[\s\S]*formatPlaybackTime\(durationSeconds\)[\s\S]*role="group"[\s\S]*aria-label=\{t\("loopControls\.ariaLabel"\)\}/u);
  assert.match(runtime, /grid-cols-\[9ch_auto_9ch\][^"\n]*font-mono[^"\n]*tabular-nums/u);
  assert.match(runtime, /className="flex items-center gap-0"/u);
  assert.match(runtime, /aria-label=\{t\("loopControls\.reset"\)\}[\s\S]*?aria-keyshortcuts="r"[\s\S]*?shortcut: "R"[\s\S]*?<RotateCcw/u);
  assert.match(runtime, /sm:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/u);
  assert.match(runtime, /event\.timeSeconds < loopRange\.endTimeSeconds/u);
  assert.match(runtime, /wrapLoopAfterBoundary\(\)[\s\S]*flushNoteSoundsThrough\(presentationTimeSeconds\)[\s\S]*requestAnimationFrame\(updatePlayback\)/u);
  assert.match(loopRange, /setBandoriChartLoopPoint[\s\S]*Math\.max\(nextTimeSeconds, oppositeTimeSeconds\)[\s\S]*Math\.min\(nextTimeSeconds, oppositeTimeSeconds\)/u);
  assert.match(loopRange, /1 \/ BANDORI_CHART_REFERENCE_FRAME_RATE/u);
  assert.doesNotMatch(loopRange, /CompiledBandoriChart|resolveBandoriNoteLoopRange/u);
  assert.match(runtime, /stopAndResetNoteSounds\([\s\S]*currentTimeSeconds,[\s\S]*currentTimeSeconds > 0/u);
  assert.match(stage, /advanceBandoriEffectAnimationClock\(\{[\s\S]*presentationTimeSeconds: presentationTime,[\s\S]*previousPresentationTimeSeconds: lastEffectTimeSeconds/u);
  assert.match(stage, /effectAnimationTimeSeconds = effectClockStep\.animationTimeSeconds/u);
  assert.match(stage, /updateLaneEffect\([\s\S]*effectAnimationDeltaSeconds/u);
  assert.match(stage, /updateHitEffect\(display, effectAnimationTimeSeconds, currentNoteScale\)/u);
  assert.match(stage, /display\.animationElapsedSeconds \+= effectAnimationDeltaSeconds/u);
  assert.doesNotMatch(stage, /app\.ticker\.deltaMS/u);
  assert.match(runtime, /\[isSyncLineEnabled, setIsSyncLineEnabled\] = useState\(\s*initialPreferences\.isSyncLineEnabled/u);
  assert.match(runtime, /\[isRhythmSupportEnabled, setIsRhythmSupportEnabled\] = useState\(\s*initialPreferences\.isRhythmSupportEnabled/u);
  assert.match(runtime, /\[isLaneEffectEnabled, setIsLaneEffectEnabled\] = useState\(\s*initialPreferences\.isLaneEffectEnabled/u);
  assert.match(runtime, /initialPreferences\.frameRateLimit/u);
  assert.match(runtime, /initialPreferences\.resolutionScale/u);
  assert.match(runtime, /isEnabled=\{isSyncLineEnabled\}/u);
  assert.match(runtime, /isEnabled=\{isRhythmSupportEnabled\}/u);
  assert.match(runtime, /isEnabled=\{isLaneEffectEnabled\}/u);
  assert.match(runtime, /adjustBandoriSimulatorNoteSpeed\(current, adjustment\)/u);
  assert.doesNotMatch(notePresentation, /wraps it|BANDORI_NATIVE_NOTE_SPEED_MIN;\s*\}/u);
  const timelineInput = runtime.match(/<input\s+type="range"[\s\S]*?\/>/u)?.[0];
  assert.ok(timelineInput);
  assert.doesNotMatch(timelineInput, /BANDORI_NATIVE_NOTE_SPEED_(?:MIN|MAX)/u);
  assert.match(notePresentation, /NATIVE_DEPTH_EXPONENT_BASE \*\*/u);
  assert.match(noteAssets, /createNoteSkin\(1, "skin00", "a"\)/u);
  assert.match(noteAssets, /createNoteSkin\(6, "skin06", "c"\)/u);
  assert.match(
    noteAssets,
    /createNoteSkin\(7, "skin05", "b", 1\.100000023841858\)/u,
  );
  assert.match(noteAssets, /createDirectionalFlickSkin\(5, "skin04", "tall-right-icon"\)/u);
  assert.match(noteAssets, /note_long_0/u);
  assert.match(noteAssets, /note_slide_among/u);
  assert.match(stage, /createBandoriNativeRibbonMeshGeometry/u);
  assert.match(stage, /isBandoriNativeRibbonPointBodyVisible\(projected\)/u);
  assert.match(stage, /updateBandoriNativeDirectionalConnectorVertices/u);
  assert.match(stage, /createNativeTransparentColoredShader/u);
  assert.doesNotMatch(stage, /BANDORI_NATIVE_(?:DIRECTIONAL_BACK_LINE|CURVE_SLIDE_BELT|LONG_BELT)_THRESHOLD/u);
  assert.match(stage, /createRibbonMeshDisplay\(texture, "ordinary"\)/u);
  assert.match(stage, /createRibbonMeshDisplay\(texture, "advanced"\)/u);
  assert.match(stage, /source\.alphaMode = "no-premultiply-alpha"/u);
  assert.match(stage, /backgroundAlpha: backgroundSkin\.id === "off" \? 1 : 0/u);
  assert.match(stage, /backgroundColor: 0x000000/u);
  assert.match(stage, /app\.canvas\.style\.width = "100%"/u);
  assert.match(stage, /app\.canvas\.style\.height = "100%"/u);
  assert.doesNotMatch(stage, /ResizeObserver/u);
  assert.match(stage, /application\.renderer\.resize\([\s\S]*getBandoriSimulatorRendererResolution/u);
  assert.match(stage, /application\.ticker\.maxFPS = getBandoriSimulatorTickerMaxFps/u);
  assert.match(runtime, /frameRateLimit=\{frameRateLimit\}/u);
  assert.match(runtime, /resolutionScale=\{resolutionScale\}/u);
  assert.match(stageContract, /width: 1334/u);
  assert.match(stageContract, /height: 750/u);
  assert.match(stageContract, /left: 87/u);
  assert.match(stageContract, /top: 5/u);
  assert.match(stageContract, /width: 1160/u);
  assert.match(stageContract, /height: 610/u);
  assert.match(stageContract, /left: -216\.2/u);
  assert.match(stageContract, /top: -131/u);
  assert.match(stageContract, /width: 1766\.4/u);
  assert.match(stageContract, /height: 1324\.8/u);
  assert.match(stageContract, /startapp\/ingameskin\/bgskin/u);
  assert.match(stageContract, /skin00\/livebg_normal\.png/u);
  assert.match(stageContract, /asneeded\/ingameskin\/bgskin/u);
  assert.match(stageContract, /skin02\/livebg_layer1\.png/u);
  assert.match(stageContract, /skin03\/livebg_layer2\.png/u);
  assert.match(stageContract, /skin_teamlivefestival/u);
  assert.doesNotMatch(stageContract, /stageobject_(?:red|blue)team/u);
  assert.match(stageContract, /createFieldSkin\(1, "skin00", 38, "normal"\)/u);
  assert.match(stageContract, /createFieldSkin\(15, "skin14", 56, "mission"\)/u);
  assert.match(stageContract, /BANDORI_NATIVE_FIELD_SKIN = BANDORI_NATIVE_FIELD_SKINS\[9\]/u);
  assert.match(stageContract, /getBandoriNativeJudgmentLineRect/u);
  assert.match(stage, /fieldSkin\.judgmentLineSpriteHeight/u);
  assert.match(skinControls, /BANDORI_NATIVE_NOTE_SKINS\.map/u);
  assert.match(skinControls, /<SimulatorSettingsCard title=\{t\("ariaLabel"\)\}>/u);
  assert.match(skinControls, /sm:grid-cols-\[9rem_minmax\(0,1fr\)\]/u);
  assert.doesNotMatch(skinControls, /sm:grid-cols-\[10rem_minmax\(0,1fr\)\]/u);
  assert.match(skinControls, /sm:flex sm:min-h-11 sm:items-center sm:justify-end sm:text-right/u);
  assert.match(skinControls, /sm:\[&>\*\]:min-h-11/u);
  assert.doesNotMatch(skinControls, /className="pt-2 text-sm/u);
  assert.doesNotMatch(skinControls, /limitedPerformance\.coverage/u);
  assert.match(settingsCard, /theme-color-surface-background/u);
  assert.match(switchControl, /role="switch"/u);
  assert.match(switchControl, /aria-checked=\{checked\}/u);
  assert.match(switchControl, /theme-color-semantic-info-foreground/u);
  assert.match(skinControls, /BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS\.map/u);
  assert.match(skinControls, /BANDORI_NATIVE_TAP_SE_SKINS\.map/u);
  assert.match(skinControls, /onTapSeSkinChange\(skin\)/u);
  assert.match(skinControls, /BANDORI_NATIVE_TAP_EFFECT_SKINS\.map/u);
  assert.match(skinControls, /onTapEffectSkinChange\(skin\)/u);
  assert.match(skinControls, /overrides\.has\("tapEffect"\)/u);
  assert.match(skinControls, /return `TYPE\$\{id \+ 1\}`/u);
  assert.equal((skinControls.match(/getTypeLabel\(skin\.id\)/gu) ?? []).length, 2);
  assert.match(skinControls, /skin\.id === "off" \? t\("off"\) : getTypeLabel\(skin\.id\)/u);
  assert.match(tapEffectAssets, /assetBundleName: "skin00"[\s\S]*assetBundleName: "skin01"[\s\S]*assetBundleName: "skin02"[\s\S]*assetBundleName: "skin03"[\s\S]*assetBundleName: "skin04"[\s\S]*assetBundleName: null,[\s\S]*id: "off"/u);
  assert.match(runtime, /tapEffectContract=\{effectiveTapEffectContract\}/u);
  assert.match(runtime, /tapEffectEnabled=\{isTapEffectEnabled\}/u);
  assert.match(stage, /tapEffectEnabled \? tapEffectContract : null/u);
  assert.match(stage, /if \(!tapEffectEnabled\) continue;/u);
  assert.match(runtime, /onChange=\{setIsSyncLineEnabled\}/u);
  assert.match(runtime, /onChange=\{setIsRhythmSupportEnabled\}/u);
  assert.match(runtime, /onChange=\{setIsLaneEffectEnabled\}/u);
  assert.match(skinControls, /fieldSkins\.map/u);
  assert.match(runtime, /fieldSkins=\{BANDORI_NATIVE_FIELD_SKIN_CHOICES\}/u);
  assert.match(skinControls, /backgroundSkins\.map/u);
  assert.match(skinControls, /onBackgroundSkinChange\(skin\)/u);
  assert.match(skinControls, /overrides\.has\("background"\)/u);
  assert.match(skinControls, /disabled=\{overrides\.has\("background"\)\}/u);
  assert.match(skinControls, /skin\.id === "off" \? t\("off"\) : t\(`backgroundSkin\.\$\{skin\.id\}`\)/u);
  assert.match(runtime, /useState<BandoriNativeBackgroundSkin>\([\s\S]*BANDORI_NATIVE_BACKGROUND_SKIN/u);
  assert.match(runtime, /limitedPerformanceSkin\?\.backgroundSkin \?\? backgroundSkin/u);
  assert.match(runtime, /backgroundSkin=\{effectiveBackgroundSkin\}/u);
  assert.match(stage, /app\.stage\.addChild\(\s*\.\.\.backgroundLayers,\s*field,/u);
  assert.match(skinControls, /\["normal", "light", "off"\]/u);
  assert.match(runtime, /const isDirectionalEffectEnabled = directionalEffectVariant !== "off"/u);
  assert.match(runtime, /directionalEffectEnabled=\{isDirectionalEffectEnabled\}/u);
  assert.match(stage, /const usesDirectionalEffects = directionalEffectEnabled/u);
  assert.match(stage, /if \(variant === "off"\) continue;/u);
  assert.doesNotMatch(`${stageContract}\n${runtime}`, /isMultiRangeNotes/u);
  assert.doesNotMatch(stageContract, /\/local\/chart-simulator\/(?:jp|cn)\//iu);
  assert.doesNotMatch(simulatorSource, /assetPack|resourceManifest|fallbackSource/iu);
  assert.doesNotMatch(stage, /liveBG_fever|BgCover|judgeLineAdjustSkillEffect|soundEffect|AnimatedSprite/iu);
  assert.doesNotMatch(stage, /stage\.scale/iu);
  assert.doesNotMatch(noteAssets, /\/local\/chart-simulator\/(?:jp|cn)\//iu);

  const timelineIndex = runtime.indexOf('aria-label={t("controls.timeline")}');
  const playbackControlsIndex = runtime.indexOf(
    'aria-label={t("controls.backFive")}',
    timelineIndex,
  );
  const bgmVolumeIndex = runtime.indexOf('label={t("controls.bgmVolume")}');
  const seVolumeIndex = runtime.indexOf('label={t("controls.seVolume")}');
  const effectControlsIndex = runtime.indexOf('{t("effectControlsTitle")}');
  const noteSpeedIndex = runtime.indexOf('label={t("controls.noteSpeed")}');
  const playbackRateIndex = runtime.indexOf('label={t("controls.playbackRate")}');
  const syncLineIndex = runtime.indexOf('label={t("skinControls.syncLine")}');
  const rhythmSupportIndex = runtime.indexOf('label={t("skinControls.rhythmSupport")}');
  const mirrorIndex = runtime.indexOf('label={t("controls.mirrorData")}');
  const laneEffectIndex = runtime.indexOf('label={t("skinControls.laneEffect")}');
  const frameRateLimitIndex = runtime.indexOf('label={t("controls.frameRateLimit")}');
  const resolutionScaleIndex = runtime.indexOf('label={t("controls.resolutionScale")}');
  const skinControlsIndex = runtime.indexOf('<SimulatorSkinControls');
  assert.ok(timelineIndex >= 0);
  assert.ok(playbackControlsIndex > timelineIndex);
  assert.doesNotMatch(runtime, /controls\.restart|onClick=\{restart\}/u);
  assert.match(runtime, /MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME/u);
  assert.match(runtime, /MUSIC_PLAYER_PLAYBACK_BUTTON_CLASS_NAME/u);
  assert.match(runtime, /<Rewind className="h-5 w-5"[\s\S]*?<FastForward className="h-5 w-5"/u);
  assert.doesNotMatch(runtime, /<SkipBack|<SkipForward/u);
  assert.ok(bgmVolumeIndex > playbackControlsIndex);
  assert.ok(seVolumeIndex > bgmVolumeIndex);
  assert.ok(effectControlsIndex > seVolumeIndex);
  assert.ok(playbackRateIndex > effectControlsIndex);
  assert.ok(noteSpeedIndex > playbackRateIndex);
  assert.ok(syncLineIndex > noteSpeedIndex);
  assert.doesNotMatch(
    runtime,
    /musicPlaybackStatusLabel|controls\.playbackStatus|subscribeMusicPlaybackState|setPlaybackError/u,
  );
  assert.ok(rhythmSupportIndex > syncLineIndex);
  assert.ok(mirrorIndex > rhythmSupportIndex);
  assert.ok(laneEffectIndex > mirrorIndex);
  assert.ok(frameRateLimitIndex > laneEffectIndex);
  assert.ok(resolutionScaleIndex > frameRateLimitIndex);
  assert.ok(skinControlsIndex > resolutionScaleIndex);

  const limitedSkinIndex = skinControls.indexOf('label={t("limitedPerformance.label")}');
  const backgroundSkinIndex = skinControls.indexOf('label={t("backgroundStyle")}');
  const fieldSkinIndex = skinControls.indexOf('label={t("fieldStyle")}');
  const tapEffectSkinIndex = skinControls.indexOf('label={t("tapEffectStyle")}');
  const noteSkinIndex = skinControls.indexOf('label={t("noteStyle")}');
  const tapSeSkinIndex = skinControls.indexOf('label={t("tapSeStyle")}');
  const directionalSkinIndex = skinControls.indexOf('label={t("directionalFlickStyle")}');
  assert.ok(limitedSkinIndex >= 0);
  assert.ok(backgroundSkinIndex > limitedSkinIndex);
  assert.ok(fieldSkinIndex > backgroundSkinIndex);
  assert.ok(tapEffectSkinIndex > fieldSkinIndex);
  assert.ok(noteSkinIndex > tapEffectSkinIndex);
  assert.ok(tapSeSkinIndex > noteSkinIndex);
  assert.ok(directionalSkinIndex > tapSeSkinIndex);
});

test("localized song and simulator keys stay mirrored", async () => {
  const [zhSource, enSource, zhMetadataSource, enMetadataSource] = await Promise.all([
    read("../messages/zh-CN/bandori.json"),
    read("../messages/en/bandori.json"),
    read("../messages/zh-CN/metadata.json"),
    read("../messages/en/metadata.json"),
  ]);
  const zh = JSON.parse(zhSource);
  const en = JSON.parse(enSource);
  const zhMetadata = JSON.parse(zhMetadataSource);
  const enMetadata = JSON.parse(enMetadataSource);

  assert.deepEqual(Object.keys(zh.songs), Object.keys(en.songs));
  assert.deepEqual(Object.keys(zh.songs.simulator), Object.keys(en.songs.simulator));
  assert.deepEqual(Object.keys(zhMetadata.songs), Object.keys(enMetadata.songs));
  for (const messages of [zh.songs.simulator, en.songs.simulator]) {
    assert.equal(Object.hasOwn(messages, "capabilityNotice"), false);
    assert.equal(Object.hasOwn(messages, "stageReady"), false);
    assert.equal(Object.hasOwn(messages.controls, "noteSpeedRange"), false);
    assert.equal(Object.hasOwn(messages.controls, "playbackRateRange"), false);
    assert.equal(Object.hasOwn(messages.controls, "syncNoteSpeedSlowdown"), false);
    assert.equal(Object.hasOwn(messages.controls, "syncNoteSpeedSlowdownOn"), false);
    assert.equal(Object.hasOwn(messages.controls, "syncNoteSpeedSlowdownOff"), false);
    assert.equal(Object.hasOwn(messages.controls, "syncNoteSpeedSlowdownDescription"), false);
    assert.equal(Object.hasOwn(messages.controls, "musicBackend"), false);
    assert.equal(Object.hasOwn(messages.controls, "musicBackendOption"), false);
    assert.equal(Object.hasOwn(messages.controls, "musicBackendStatus"), false);
    assert.equal(Object.hasOwn(messages.controls, "playbackStatus"), false);
    assert.doesNotMatch(
      JSON.stringify(messages),
      /Signalsmith|AudioBufferSourceNode|原生精确|处理延迟|精确输出时钟|exact native|processing latency|precise output clock/iu,
    );
    assert.equal(Object.hasOwn(messages.skinControls.limitedPerformance, "coverage"), false);
    assert.equal(Object.hasOwn(messages.skinControls.limitedPerformance, "slot"), false);
    assert.equal(Object.hasOwn(messages.skinControls, "allPerfectStatus"), false);
  }
  assert.deepEqual(Object.keys(zh.songs.simulator.loopControls).sort(), [
    "ariaLabel",
    "reset",
    "setEnd",
    "setStart",
  ]);
  assert.deepEqual(
    Object.keys(en.songs.simulator.loopControls).sort(),
    Object.keys(zh.songs.simulator.loopControls).sort(),
  );
  assert.equal(zh.songs.simulator.loopControls.setStart, "设置循环起点");
  assert.equal(zh.songs.simulator.loopControls.setEnd, "设置循环止点");
  assert.equal(zh.songs.simulator.loopControls.reset, "重置循环区间");
  assert.equal(en.songs.simulator.loopControls.setStart, "Set loop start");
  assert.equal(en.songs.simulator.loopControls.setEnd, "Set loop end");
  assert.equal(en.songs.simulator.loopControls.reset, "Reset loop range");
  assert.equal(zh.songs.simulator.controls.enterFullscreen, "进入全屏");
  assert.equal(zh.songs.simulator.controls.exitFullscreen, "退出全屏");
  assert.equal(en.songs.simulator.controls.enterFullscreen, "Enter fullscreen");
  assert.equal(en.songs.simulator.controls.exitFullscreen, "Exit fullscreen");
  assert.equal(zh.songs.simulator.controls.renderFps, "舞台渲染帧率：{fps} FPS");
  assert.equal(en.songs.simulator.controls.renderFps, "Stage render rate: {fps} FPS");
  assert.equal(zh.songs.simulator.controls.bgmVolume, "BGM");
  assert.equal(zh.songs.simulator.controls.seVolume, "SE");
  assert.equal(en.songs.simulator.controls.bgmVolume, "BGM");
  assert.equal(en.songs.simulator.controls.seVolume, "SE");
  assert.equal(
    zh.songs.simulator.controls.perfectJudgmentWindow,
    "显示 Perfect 判定区间",
  );
  assert.equal(
    zh.songs.simulator.controls.greatJudgmentWindow,
    "显示 Great 判定区间",
  );
  assert.equal(
    en.songs.simulator.controls.perfectJudgmentWindow,
    "Show Perfect timing window",
  );
  assert.equal(
    en.songs.simulator.controls.greatJudgmentWindow,
    "Show Great timing window",
  );
  assert.equal(
    zh.songs.simulator.controls.slideJudgmentFrameCorrection,
    "Slide 判定帧补正",
  );
  assert.equal(
    zh.songs.simulator.controls.decreaseSlideJudgmentFrameCorrection,
    "降低 Slide 判定帧补正 0.1 帧",
  );
  assert.equal(
    en.songs.simulator.controls.slideJudgmentFrameCorrection,
    "Slide judgment frame correction",
  );
  assert.equal(
    en.songs.simulator.controls.increaseSlideJudgmentFrameCorrection,
    "Increase Slide judgment frame correction by 0.1 frame",
  );
  assert.equal(zh.songs.simulator.skinControls.tapEffectStyle, "TAP EFFECT");
  assert.equal(en.songs.simulator.skinControls.tapEffectStyle, "Tap effects");
  assert.equal(zh.songs.simulator.skinControls.limitedPerformance.none, "关");
  assert.equal(en.songs.simulator.skinControls.limitedPerformance.none, "Off");
  assert.deepEqual(
    [1, 2, 3, 4, 5, 13, 14].map(
      (id) => zh.songs.simulator.skinControls.fieldSkin[id],
    ),
    ["TYPE1", "TYPE2", "TYPE3", "TYPE4", "TYPE5", "TYPE6", "TYPE7"],
  );
  assert.deepEqual(
    [1, 2, 3, 4, 5, 13, 14].map(
      (id) => en.songs.simulator.skinControls.fieldSkin[id],
    ),
    ["TYPE1", "TYPE2", "TYPE3", "TYPE4", "TYPE5", "TYPE6", "TYPE7"],
  );
  assert.deepEqual(
    [6, 7, 8, 9, 10, 11, 12, 15].map(
      (id) => zh.songs.simulator.skinControls.fieldSkin[id],
    ),
    [
      "Poppin'Party",
      "Afterglow",
      "Pastel＊Palettes",
      "Roselia",
      "Hello, Happy World!",
      "Morfonica",
      "RAISE A SUILEN",
      "MyGO!!!!!",
    ],
  );
  assert.deepEqual(
    ["april2018", "april2019", "april2021", "april2024"].map(
      (id) => zh.songs.simulator.skinControls.limitedPerformance.skin[id],
    ),
    ["愚人节2018", "愚人节2019", "愚人节2021", "愚人节2024"],
  );
  assert.equal(zh.songs.simulator.audioLoadingFailed, "音频资源加载失败，请重试");
  assert.equal(zh.songs.simulator.audioPlaybackFailed, "音乐播放失败，请重试");
  assert.equal(
    en.songs.simulator.audioLoadingFailed,
    "Audio resources failed to load — try again",
  );
  assert.equal(
    en.songs.simulator.audioPlaybackFailed,
    "Music playback failed — try again",
  );
  assert.equal(Object.hasOwn(zh.songs.simulator.loopControls, "unavailable"), false);
  assert.equal(Object.hasOwn(en.songs.simulator.loopControls, "unavailable"), false);
  assert.equal(zh.songs.simulator.stageAria, "谱面模拟舞台");
  assert.equal(en.songs.simulator.stageAria, "Chart simulator stage");
  assert.deepEqual(Object.values(zh.songs.simulator.loading), [
    "正在加载模拟器...",
    "正在加载谱面...",
    "正在加载资源清单...",
    "正在加载演出资源...",
    "正在加载音效...",
    "正在加载音乐...",
    "正在初始化模拟舞台...",
  ]);
  assert.equal(Object.hasOwn(zh.songs.simulator, "stageLoading"), false);
});

test("the public simulator contract keeps product boundaries without private reverse ledgers", async () => {
  const [english, chinese] = await Promise.all([
    read("../documents/bandori-chart-simulator.md"),
    read("../documents/bandori-chart-simulator.zh-CN.md"),
  ]);

  assert.match(english, /Anything not listed in the current implementation and tests is disabled/u);
  assert.match(english, /official JP resource set/u);
  assert.match(english, /must not add a CN presentation pack/u);
  assert.match(english, /exactly 20 overlays/u);
  assert.match(english, /`practice`.*ordinary backgrounds, not limited overlays/su);
  assert.match(english, /chart-level `laneChange=true`/u);
  assert.match(english, /They are not files served from the\s+Web repository/u);
  assert.match(english, /HHWX_CHART_SIMULATOR_PROJECTION_ROOT/u);
  assert.match(chinese, /当前实现与测试没有列入的能力一律禁用/u);
  assert.match(chinese, /演出资源只允许来自官方 JP 资源集/u);
  assert.match(chinese, /不得加入 CN 演出资源包/u);
  assert.match(chinese, /共有且只有 20 项/u);
  assert.match(chinese, /`practice`.*普通背景，不属于限定覆盖/su);
  assert.match(chinese, /谱面级 `laneChange=true`/u);
  assert.match(chinese, /并不是 Web 仓库提供的实体文件/u);
  for (const document of [english, chinese]) {
    assert.doesNotMatch(document, /\b(?:RVA|pathId|IL2CPP)\b|CAB-[0-9a-f]+/iu);
    assert.doesNotMatch(document, /21 (?:limited|限定)/iu);
  }
});
