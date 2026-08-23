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

test("the heavy runtime and renderer stay outside the default song-detail view", async () => {
  const detail = await read("../src/app/[locale]/bandori/songs/[songId]/SongDetailPageClient.tsx");
  const shell = await read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorClientShell.tsx");
  const runtime = await read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx");

  assert.match(detail, /activeView === "info"[\s\S]*<ChartSimulatorClientShell \{\.\.\.simulator\} \/>/u);
  assert.match(shell, /dynamic\(\(\) => import\("\.\/ChartSimulatorRuntime"\)/u);
  assert.match(shell, /ssr: false/u);
  assert.match(shell, /ChartSimulatorLoadingIndicator/u);
  assert.match(shell, /t\("loading\.simulator"\)/u);
  assert.match(runtime, /dynamic\(\(\) => import\("\.\/NativeSimulatorStage"\)/u);
  assert.match(runtime, /compileBandoriChartInWorker/u);
});

test("simulator loading reuses the page spinner and keeps the resource count compact", async () => {
  const indicator = await read(
    "../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorLoadingIndicator.tsx",
  );

  assert.match(indicator, /import \{ Loader2 \} from "lucide-react"/u);
  assert.match(indicator, /animate-spin motion-reduce:animate-none/u);
  assert.match(indicator, /\{completedResources\} \/ \{totalResources\}/u);
  assert.doesNotMatch(indicator, /已准备|Loading resources/iu);
});

test("the Pixi stage loads the selected stage, point-note atlases, and bounded hit effects", async () => {
  const [stage, stageContract, noteAssets, notePresentation, hitPresentation, holdPresentation, judgmentComboPresentation, runtime, skinControls, loopControls, adjustmentControls, settingsCard, switchControl, loopRange, compiler, worker] = await Promise.all([
    read("../src/app/[locale]/bandori/songs/[songId]/NativeSimulatorStage.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/native-stage-contract.ts"),
    read("../src/app/[locale]/bandori/songs/[songId]/native-note-assets.ts"),
    read("../src/lib/bandori/chart-simulator/native-note-presentation.ts"),
    read("../src/lib/bandori/chart-simulator/native-hit-effect-presentation.ts"),
    read("../src/lib/bandori/chart-simulator/native-hold-effect-presentation.ts"),
    read("../src/lib/bandori/chart-simulator/native-judgment-combo-presentation.ts"),
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/SimulatorSkinControls.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/SimulatorLoopControls.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/SimulatorAdjustmentControl.tsx"),
    read("../src/app/[locale]/bandori/songs/[songId]/SimulatorSettingsCard.tsx"),
    read("../src/components/Switch.tsx"),
    read("../src/lib/bandori/chart-simulator/loop-range.ts"),
    read("../src/lib/bandori/chart-simulator/compiler.ts"),
    read("../src/lib/bandori/chart-simulator/compiler.worker.ts"),
  ]);
  const simulatorSource = `${stage}\n${stageContract}\n${noteAssets}\n${notePresentation}\n${hitPresentation}\n${holdPresentation}\n${judgmentComboPresentation}\n${runtime}\n${skinControls}\n${loopControls}\n${adjustmentControls}\n${settingsCard}\n${switchControl}\n${loopRange}\n${compiler}\n${worker}`;

  assert.match(stage, /Application,[\s\S]*Assets,[\s\S]*Container,[\s\S]*Sprite/u);
  assert.match(stage, /Promise\.all\(\[/u);
  assert.match(stage, /const loadTexture = async \(logicalUrl: string\)[\s\S]*const resolvedUrl = resolveAssetUrl\(logicalUrl\)[\s\S]*Assets\.load<Texture>\(resolvedUrl\)/u);
  assert.match(stage, /plannedResourceUrls = new Set\([\s\S]*requiredLogicalUrls\.map\(resolveAssetUrl\)/u);
  assert.match(stage, /completedResourceUrls = new Set<string>\(\)/u);
  assert.match(stage, /onLoadProgress\(\{[\s\S]*phase: "resources"[\s\S]*totalResources/u);
  assert.match(stage, /backgroundSkin\.layers\.map\(\(layer\) => loadTexture\(layer\.textureUrl\)\)/u);
  assert.match(stage, /loadTexture\(fieldSkin\.textureUrl\)/u);
  assert.match(stage, /loadTexture\(fieldSkin\.judgmentLineTextureUrl\)/u);
  assert.match(stage, /loadTexture\(noteSkin\.atlasUrl\)/u);
  assert.match(stage, /loadTexture\(noteSkin\.syncLineUrl\)/u);
  assert.match(stage, /getBandoriNativeRhythmSupportNoteUrl\(noteSkin, lane\)/u);
  assert.match(stage, /loadTexture\(directionalFlickSkin\.atlasUrl\)/u);
  assert.match(stage, /loadOrdinaryTapTexture\(BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL\)/u);
  assert.match(stage, /loadOrdinaryTapTexture\(BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL\)/u);
  assert.match(stage, /usesLimitedDirectionalEffect[\s\S]*Promise\.resolve\(Texture\.EMPTY\)/u);
  assert.match(stage, /app\.stage\.addChild\([\s\S]*directionalLineLayer,[\s\S]*judgmentLine,[\s\S]*laneEffectLayer,[\s\S]*lowHitEffectLayer,[\s\S]*highHitEffectLayer,[\s\S]*ribbonLayer,[\s\S]*noteLayer/u);
  assert.match(stage, /app\.ticker\.add\(renderNotes\)/u);
  assert.match(stage, /prepareBandoriNativeChartVisuals\(compiled, isMirrored\)/u);
  assert.match(stage, /atlasHeight - frame\.y - frame\.height/u);
  assert.match(runtime, /currentTransport\.phase === "playing"[\s\S]*runtime\?\.isMusicPlaying[\s\S]*runtime\.getMusicTime\(\)/u);
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
  assert.match(stage, /const terminalScreenX = event\.terminalLane === null[\s\S]*if \(limitedEffects && useLimitedEffect\)[\s\S]*triggerSwipeEffect\([\s\S]*terminalScreenX/u);
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
  assert.match(stage, /updateSyncLine\(display, activeNotes, syncLineEnabledRef\.current\)/u);
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
  assert.match(runtime, /createBandoriNativeNoteSoundRuntime/u);
  assert.match(runtime, /collectBandoriNativeNoteSoundEvents/u);
  assert.doesNotMatch(runtime, /<audio|crossOrigin="anonymous"/u);
  assert.match(runtime, /BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS/u);
  assert.match(runtime, /runtime\.prepareMusic\(audioUrl, controller\.signal\)/u);
  assert.match(runtime, /runtime\.prepareCueBank\(cueBank, \(url\) =>/u);
  assert.match(runtime, /currentStageLoadProgress\.completedResources[\s\S]*currentSoundLoadProgress\.completedResources[\s\S]*currentMusicLoadProgress\?\.completedResources/u);
  assert.match(runtime, /<ChartSimulatorLoadingIndicator[\s\S]*completedResources=\{completedResources\}[\s\S]*totalResources=\{totalResources\}/u);
  assert.match(runtime, /disabled=\{!audioUrl \|\| \(!isPlaying && !isSimulatorReady\)\}/u);
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
  assert.match(runtime, /const next = playBandoriChartTransport\(transportRef\.current\);[\s\S]*await seekAudioAndTransport\(next\)/u);
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
  assert.match(holdPresentation, /createBandoriDefaultEffectRuntime\(selectedRecipe/u);
  assert.match(holdPresentation, /variant\.kind === "long"/u);
  assert.match(stage, /getBandoriHabahiroLongFlashSpriteName\(head\.coveredLanes\)/u);
  assert.doesNotMatch(stage, /getBandoriHabahiroLongFlashSpriteName\(point\.coveredLanes\)/u);
  assert.match(stage, /createPerfectJudgmentDisplay\(perfectJudgmentTexture\)/u);
  assert.match(stage, /triggerPerfectJudgment\(perfectJudgment, effectAnimationTimeSeconds\)/u);
  assert.match(stage, /upperBoundBandoriNoteTime\([\s\S]*compiled\.notes\.times,[\s\S]*presentationTime/u);
  assert.match(stage, /allPerfectStatusEnabledRef\.current/u);
  assert.match(judgmentComboPresentation, /judge_perfect\.png/u);
  assert.match(judgmentComboPresentation, /combo_AP\.png/u);
  assert.match(runtime, /\[isAllPerfectStatusEnabled, setIsAllPerfectStatusEnabled\] = useState\(true\)/u);
  assert.match(runtime, /allPerfectStatusEnabled=\{isAllPerfectStatusEnabled\}/u);
  assert.match(runtime, /label=\{t\("skinControls\.allPerfectStatus"\)\}/u);
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
  assert.match(runtime, /runtime\.setMusicPlaybackRate\(nextPlaybackRate\)/u);
  assert.doesNotMatch(runtime, /defaultPlaybackRate|preservesPitch/u);
  assert.match(runtime, /getBandoriSimulatorPlaybackRate\(playbackRateHundredthsRef\.current\)/u);
  assert.match(runtime, /useState\(BANDORI_SIMULATOR_SYNC_NOTE_SPEED_SLOWDOWN_DEFAULT\)/u);
  assert.match(runtime, /getBandoriSimulatorNoteApproachTimeScale\([\s\S]*playbackRateHundredths,[\s\S]*isNoteSpeedSlowdownSynchronized/u);
  assert.match(runtime, /noteApproachTimeScale=\{noteApproachTimeScale\}/u);
  assert.match(runtime, /SimulatorBooleanControl[\s\S]*syncNoteSpeedSlowdown/u);
  assert.match(stage, /projectBandoriNativeNote\([\s\S]*currentNoteApproachTimeScale/u);
  assert.match(stage, /projectBandoriNativeRibbonPoint\([\s\S]*currentNoteApproachTimeScale/u);
  assert.match(stage, /projectBandoriNativeRibbonBody\([\s\S]*currentNoteApproachTimeScale/u);
  assert.match(runtime, /<SimulatorLoopControls/u);
  assert.match(loopControls, /t\("reset"\)/u);
  assert.match(loopControls, /step=\{0\.001\}/u);
  assert.match(loopControls, /className="sr-only"/u);
  assert.match(loopControls, /onRangeApply\(nextRange\)/u);
  assert.match(runtime, /wrapLoopAtBoundary/u);
  assert.match(runtime, /seekToLoopStart\(loopRangeRef\.current, false\)/u);
  assert.match(runtime, /const request = seekAudioAndTransport\(requested\);[\s\S]*loopSeekPromiseRef\.current = request[\s\S]*loopSeekPromiseRef\.current !== request/u);
  assert.match(runtime, /event\.timeSeconds < loopRangeRef\.current\.endTimeSeconds/u);
  assert.match(runtime, /wrapLoopAtBoundary\(\)[\s\S]*requestAnimationFrame\(updatePlayback\)/u);
  assert.match(loopControls, /createBandoriTimeLoopRange/u);
  assert.match(loopControls, /resolveBandoriNoteLoopRange/u);
  assert.match(loopControls, /mode === "time"/u);
  assert.match(loopControls, /mode === "notes"/u);
  assert.match(loopRange, /\(noteTimes\[startIndex - 1\] \+ noteTimes\[startIndex\]\) \/ 2/u);
  assert.match(loopRange, /endIndex === noteTimes\.length - 1[\s\S]*compiled\.timelineDurationSeconds[\s\S]*noteTimes\[endIndex \+ 1\]/u);
  assert.doesNotMatch(loopRange, /ribbon|Long|Slide/u);
  assert.match(runtime, /stopAndResetNoteSounds\([\s\S]*currentTimeSeconds,[\s\S]*currentTimeSeconds > 0/u);
  assert.match(stage, /advanceBandoriEffectAnimationClock\(\{[\s\S]*presentationTimeSeconds: presentationTime,[\s\S]*previousPresentationTimeSeconds: lastEffectTimeSeconds/u);
  assert.match(stage, /effectAnimationTimeSeconds = effectClockStep\.animationTimeSeconds/u);
  assert.match(stage, /updateLaneEffect\([\s\S]*effectAnimationDeltaSeconds/u);
  assert.match(stage, /updateHitEffect\(display, effectAnimationTimeSeconds\)/u);
  assert.match(stage, /display\.animationElapsedSeconds \+= effectAnimationDeltaSeconds/u);
  assert.doesNotMatch(stage, /app\.ticker\.deltaMS/u);
  assert.match(runtime, /\[isSyncLineEnabled, setIsSyncLineEnabled\] = useState\(true\)/u);
  assert.match(runtime, /\[isRhythmSupportEnabled, setIsRhythmSupportEnabled\] = useState\(true\)/u);
  assert.match(runtime, /\[isLaneEffectEnabled, setIsLaneEffectEnabled\] = useState\(true\)/u);
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
  assert.doesNotMatch(stage, /BANDORI_NATIVE_LONG_NOTE_LINE_VERTEX_ALPHA/u);
  assert.match(stage, /createRibbonMeshDisplay\(texture, "ordinary"\)/u);
  assert.match(stage, /createRibbonMeshDisplay\(texture, "advanced"\)/u);
  assert.match(stage, /source\.alphaMode = "no-premultiply-alpha"/u);
  assert.match(stage, /backgroundAlpha: 0/u);
  assert.match(stage, /app\.canvas\.style\.width = "100%"/u);
  assert.match(stage, /app\.canvas\.style\.height = "100%"/u);
  assert.doesNotMatch(stage, /ResizeObserver|renderer\.resize/u);
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
  assert.doesNotMatch(skinControls, /limitedPerformance\.coverage/u);
  assert.match(settingsCard, /theme-color-surface-background/u);
  assert.match(switchControl, /role="switch"/u);
  assert.match(switchControl, /aria-checked=\{checked\}/u);
  assert.match(switchControl, /theme-color-semantic-info-foreground/u);
  assert.match(skinControls, /BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS\.map/u);
  assert.match(skinControls, /BANDORI_NATIVE_TAP_SE_SKINS\.map/u);
  assert.match(skinControls, /onTapSeSkinChange\(skin\)/u);
  assert.match(runtime, /onChange=\{setIsSyncLineEnabled\}/u);
  assert.match(runtime, /onChange=\{setIsRhythmSupportEnabled\}/u);
  assert.match(runtime, /onChange=\{setIsLaneEffectEnabled\}/u);
  assert.match(skinControls, /fieldSkins\.map/u);
  assert.match(skinControls, /backgroundSkins\.map/u);
  assert.match(skinControls, /onBackgroundSkinChange\(skin\)/u);
  assert.match(skinControls, /overrides\.has\("background"\)/u);
  assert.match(skinControls, /disabled=\{overrides\.has\("background"\)\}/u);
  assert.match(runtime, /useState<BandoriNativeBackgroundSkin>\([\s\S]*BANDORI_NATIVE_BACKGROUND_SKIN/u);
  assert.match(runtime, /limitedPerformanceSkin\?\.backgroundSkin \?\? backgroundSkin/u);
  assert.match(runtime, /backgroundSkin=\{effectiveBackgroundSkin\}/u);
  assert.match(stage, /app\.stage\.addChild\(\s*\.\.\.backgroundLayers,\s*field,/u);
  assert.doesNotMatch(`${stageContract}\n${runtime}`, /isMultiRangeNotes/u);
  assert.doesNotMatch(stageContract, /\/local\/chart-simulator\/(?:jp|cn)\//iu);
  assert.doesNotMatch(simulatorSource, /assetPack|resourceManifest|fallbackSource/iu);
  assert.doesNotMatch(stage, /liveBG_fever|BgCover|judgeLineAdjustSkillEffect|soundEffect|AnimatedSprite/iu);
  assert.doesNotMatch(stage, /stage\.scale/iu);
  assert.doesNotMatch(noteAssets, /\/local\/chart-simulator\/(?:jp|cn)\//iu);

  const timelineIndex = runtime.indexOf('aria-label={t("controls.timeline")}');
  const playbackControlsIndex = runtime.indexOf('onClick={restart}');
  const effectControlsIndex = runtime.indexOf('{t("effectControlsTitle")}');
  const noteSpeedIndex = runtime.indexOf('label={t("controls.noteSpeed")}');
  const playbackRateIndex = runtime.indexOf('label={t("controls.playbackRate")}');
  const syncLineIndex = runtime.indexOf('label={t("skinControls.syncLine")}');
  const rhythmSupportIndex = runtime.indexOf('label={t("skinControls.rhythmSupport")}');
  const mirrorIndex = runtime.indexOf('label={t("controls.mirrorData")}');
  const laneEffectIndex = runtime.indexOf('label={t("skinControls.laneEffect")}');
  const allPerfectStatusIndex = runtime.indexOf('label={t("skinControls.allPerfectStatus")}');
  const skinControlsIndex = runtime.indexOf('<SimulatorSkinControls');
  assert.ok(timelineIndex >= 0);
  assert.ok(playbackControlsIndex > timelineIndex);
  assert.ok(effectControlsIndex > playbackControlsIndex);
  assert.ok(noteSpeedIndex > effectControlsIndex);
  assert.ok(playbackRateIndex > noteSpeedIndex);
  assert.ok(syncLineIndex > playbackRateIndex);
  assert.ok(rhythmSupportIndex > syncLineIndex);
  assert.ok(mirrorIndex > rhythmSupportIndex);
  assert.ok(laneEffectIndex > mirrorIndex);
  assert.ok(allPerfectStatusIndex > laneEffectIndex);
  assert.ok(skinControlsIndex > allPerfectStatusIndex);

  const limitedSkinIndex = skinControls.indexOf('label={t("limitedPerformance.label")}');
  const backgroundSkinIndex = skinControls.indexOf('label={t("backgroundStyle")}');
  const fieldSkinIndex = skinControls.indexOf('label={t("fieldStyle")}');
  const noteSkinIndex = skinControls.indexOf('label={t("noteStyle")}');
  const tapSeSkinIndex = skinControls.indexOf('label={t("tapSeStyle")}');
  const directionalSkinIndex = skinControls.indexOf('label={t("directionalFlickStyle")}');
  assert.ok(limitedSkinIndex >= 0);
  assert.ok(backgroundSkinIndex > limitedSkinIndex);
  assert.ok(fieldSkinIndex > backgroundSkinIndex);
  assert.ok(noteSkinIndex > fieldSkinIndex);
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
    assert.equal(Object.hasOwn(messages.controls, "syncNoteSpeedSlowdownDescription"), false);
    assert.equal(Object.hasOwn(messages.skinControls.limitedPerformance, "coverage"), false);
    assert.equal(Object.hasOwn(messages.skinControls.limitedPerformance, "slot"), false);
  }
  assert.equal(zh.songs.simulator.loopControls.apply, "应用");
  assert.equal(zh.songs.simulator.loopControls.reset, "重置");
  assert.equal(en.songs.simulator.loopControls.apply, "Apply");
  assert.equal(en.songs.simulator.loopControls.reset, "Reset");
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
