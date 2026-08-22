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

test("the heavy runtime and renderer stay outside the initial client bundle", async () => {
  const shell = await read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorClientShell.tsx");
  const runtime = await read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx");

  assert.match(shell, /dynamic\(\(\) => import\("\.\/ChartSimulatorRuntime"\)/u);
  assert.match(shell, /ssr: false/u);
  assert.match(runtime, /dynamic\(\(\) => import\("\.\/NativeSimulatorStage"\)/u);
  assert.match(runtime, /compileBandoriChartInWorker/u);
});

test("the Pixi stage loads the selected stage, point-note atlases, and bounded hit effects", async () => {
  const [stage, stageContract, noteAssets, notePresentation, hitPresentation, holdPresentation, judgmentComboPresentation, runtime, skinControls, loopControls, loopRange, compiler, worker] = await Promise.all([
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
    read("../src/lib/bandori/chart-simulator/loop-range.ts"),
    read("../src/lib/bandori/chart-simulator/compiler.ts"),
    read("../src/lib/bandori/chart-simulator/compiler.worker.ts"),
  ]);
  const simulatorSource = `${stage}\n${stageContract}\n${noteAssets}\n${notePresentation}\n${hitPresentation}\n${holdPresentation}\n${judgmentComboPresentation}\n${runtime}\n${skinControls}\n${loopControls}\n${loopRange}\n${compiler}\n${worker}`;

  assert.match(stage, /Application,[\s\S]*Assets,[\s\S]*Container,[\s\S]*Sprite/u);
  assert.match(stage, /Promise\.all\(\[/u);
  assert.match(stage, /Assets\.load<Texture>\(BANDORI_NATIVE_BACKGROUND_TEXTURE_URL\)/u);
  assert.match(stage, /Assets\.load<Texture>\(fieldSkin\.textureUrl\)/u);
  assert.match(stage, /Assets\.load<Texture>\(fieldSkin\.judgmentLineTextureUrl\)/u);
  assert.match(stage, /Assets\.load<Texture>\(noteSkin\.atlasUrl\)/u);
  assert.match(stage, /Assets\.load<Texture>\(noteSkin\.syncLineUrl\)/u);
  assert.match(stage, /getBandoriNativeRhythmSupportNoteUrl\(noteSkin, lane\)/u);
  assert.match(stage, /Assets\.load<Texture>\(directionalFlickSkin\.atlasUrl\)/u);
  assert.match(stage, /Assets\.load<Texture>\(BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL\)/u);
  assert.match(stage, /Assets\.load<Texture>\(BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL\)/u);
  assert.match(stage, /app\.stage\.addChild\([\s\S]*directionalLineLayer,[\s\S]*judgmentLine,[\s\S]*laneEffectLayer,[\s\S]*lowHitEffectLayer,[\s\S]*highHitEffectLayer,[\s\S]*ribbonLayer,[\s\S]*noteLayer/u);
  assert.match(stage, /app\.ticker\.add\(renderNotes\)/u);
  assert.match(stage, /prepareBandoriNativeChartVisuals\(compiled, isMirrored\)/u);
  assert.match(stage, /atlasHeight - frame\.y - frame\.height/u);
  assert.match(runtime, /currentTransport\.phase === "playing"[\s\S]*audio\.currentTime/u);
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
  assert.match(stage, /const terminalScreenX = event\.terminalLane === null[\s\S]*if \(limitedEffects\)[\s\S]*triggerSwipeEffect\([\s\S]*terminalScreenX/u);
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
  assert.match(stage, /rhythmSupportEnabledRef\.current && note\.rhythmSupportTexture/u);
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
  assert.match(runtime, /crossOrigin="anonymous"/u);
  assert.match(runtime, /BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS/u);
  assert.match(runtime, /attachMediaElement\(audio\)/u);
  assert.match(runtime, /requestAnimationFrame\(updateNoteSounds\)/u);
  assert.doesNotMatch(runtime, /playSoundEffect/u);
  assert.match(runtime, /jumpBandoriChartTransport\(snapshotTransportAtAudioTime\(audio\), delta\)/u);
  assert.match(runtime, /beginBandoriChartScrub\(current\)/u);
  assert.match(runtime, /await seekBandoriMediaElement\(/u);
  assert.match(runtime, /await noteSoundRuntimeRef\.current\?\.pause\(\)[\s\S]*await seekBandoriMediaElement/u);
  assert.match(runtime, /expectedPauseEventsRef\.current > 0[\s\S]*expectedPauseEventsRef\.current -= 1/u);
  assert.match(runtime, /const playPromise = audio\.play\(\);[\s\S]*updateTransport\(\{ \.\.\.settledTransport, phase: "playing" \}\);[\s\S]*await playPromise/u);
  assert.doesNotMatch(runtime, /audio\.currentTime\s*=\s*next\.currentTimeSeconds/u);
  assert.match(runtime, /onPause=\{\(event\) =>/u);
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
  assert.match(skinControls, /label=\{t\("allPerfectStatus"\)\}/u);
  assert.match(stage, /event\.rangeWidth/u);
  assert.match(noteAssets, /note_long_flash_\$\{lane\}\.png/u);
  assert.match(runtime, /NOTE_SPEED_DECREASES = \[-0\.5, -0\.1, -0\.01\]/u);
  assert.match(runtime, /NOTE_SPEED_INCREASES = \[0\.01, 0\.1, 0\.5\]/u);
  assert.match(runtime, /PLAYBACK_RATE_DECREASES = \[-10, -1\]/u);
  assert.match(runtime, /PLAYBACK_RATE_INCREASES = \[1, 10\]/u);
  assert.match(runtime, /audio\.defaultPlaybackRate = playbackRate/u);
  assert.match(runtime, /audio\.playbackRate = playbackRate/u);
  assert.match(runtime, /audio\.preservesPitch = true/u);
  assert.match(runtime, /getBandoriSimulatorPlaybackRate\(playbackRateHundredthsRef\.current\)/u);
  assert.match(runtime, /useState\(BANDORI_SIMULATOR_SYNC_NOTE_SPEED_SLOWDOWN_DEFAULT\)/u);
  assert.match(runtime, /getBandoriSimulatorNoteApproachTimeScale\([\s\S]*playbackRateHundredths,[\s\S]*isNoteSpeedSlowdownSynchronized/u);
  assert.match(runtime, /noteApproachTimeScale=\{noteApproachTimeScale\}/u);
  assert.match(runtime, /SimulatorBooleanControl[\s\S]*syncNoteSpeedSlowdown/u);
  assert.match(stage, /projectBandoriNativeNote\([\s\S]*currentNoteApproachTimeScale/u);
  assert.match(stage, /projectBandoriNativeRibbonPoint\([\s\S]*currentNoteApproachTimeScale/u);
  assert.match(stage, /projectBandoriNativeRibbonBody\([\s\S]*currentNoteApproachTimeScale/u);
  assert.match(runtime, /<SimulatorLoopControls/u);
  assert.match(runtime, /wrapLoopAtBoundary/u);
  assert.match(runtime, /seekToLoopStart\(loopRangeRef\.current, false\)/u);
  assert.match(runtime, /void seekAudioAndTransport\(audio, requested\)\.finally/u);
  assert.match(runtime, /mediaTimeSeconds >= activeLoopRange\.endTimeSeconds[\s\S]*activeLoopRange\.startTimeSeconds/u);
  assert.match(runtime, /event\.timeSeconds < loopRangeRef\.current\.endTimeSeconds/u);
  assert.match(runtime, /onTimeUpdate=\{\(event\) => \{[\s\S]*wrapLoopAtBoundary\(event\.currentTarget\)/u);
  assert.match(loopControls, /createBandoriTimeLoopRange/u);
  assert.match(loopControls, /resolveBandoriNoteLoopRange/u);
  assert.match(loopControls, /mode === "time"/u);
  assert.match(loopControls, /mode === "notes"/u);
  assert.match(loopRange, /\(noteTimes\[startIndex - 1\] \+ noteTimes\[startIndex\]\) \/ 2/u);
  assert.match(loopRange, /endIndex === noteTimes\.length - 1[\s\S]*compiled\.timelineDurationSeconds[\s\S]*noteTimes\[endIndex \+ 1\]/u);
  assert.doesNotMatch(loopRange, /ribbon|Long|Slide/u);
  assert.match(runtime, /stopAndResetNoteSounds\([\s\S]*currentTimeSeconds,[\s\S]*currentTimeSeconds > 0/u);
  assert.match(stage, /effectAnimationTimeSeconds \+= effectAnimationDeltaSeconds/u);
  assert.match(stage, /updateHitEffect\(display, effectAnimationTimeSeconds\)/u);
  assert.match(stage, /display\.animationElapsedSeconds \+= effectAnimationDeltaSeconds/u);
  assert.match(stage, /app\.ticker\.deltaMS \/ 1000/u);
  assert.match(runtime, /\[isSyncLineEnabled, setIsSyncLineEnabled\] = useState\(true\)/u);
  assert.match(runtime, /\[isRhythmSupportEnabled, setIsRhythmSupportEnabled\] = useState\(true\)/u);
  assert.match(runtime, /\[isLaneEffectEnabled, setIsLaneEffectEnabled\] = useState\(true\)/u);
  assert.match(runtime, /isSyncLineEnabled=\{isSyncLineEnabled\}/u);
  assert.match(runtime, /isRhythmSupportEnabled=\{isRhythmSupportEnabled\}/u);
  assert.match(runtime, /isLaneEffectEnabled=\{isLaneEffectEnabled\}/u);
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
  assert.match(stageContract, /startapp\/ingameskin\/bgskin\/skin00\/livebg_normal\.png/u);
  assert.match(stageContract, /createFieldSkin\(1, "skin00", 38, "normal"\)/u);
  assert.match(stageContract, /createFieldSkin\(15, "skin14", 56, "mission"\)/u);
  assert.match(stageContract, /BANDORI_NATIVE_FIELD_SKIN = BANDORI_NATIVE_FIELD_SKINS\[9\]/u);
  assert.match(stageContract, /getBandoriNativeJudgmentLineRect/u);
  assert.match(stage, /fieldSkin\.judgmentLineSpriteHeight/u);
  assert.match(skinControls, /BANDORI_NATIVE_NOTE_SKINS\.map/u);
  assert.match(skinControls, /BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS\.map/u);
  assert.match(skinControls, /BANDORI_NATIVE_TAP_SE_SKINS\.map/u);
  assert.match(skinControls, /onTapSeSkinChange\(skin\)/u);
  assert.match(skinControls, /onSyncLineEnabledChange/u);
  assert.match(skinControls, /onRhythmSupportEnabledChange/u);
  assert.match(skinControls, /onLaneEffectEnabledChange/u);
  assert.match(skinControls, /fieldSkins\.map/u);
  assert.match(skinControls, />\s*skin00\s*<\/button>/u);
  assert.doesNotMatch(`${stageContract}\n${runtime}`, /isMultiRangeNotes/u);
  assert.doesNotMatch(stageContract, /\/local\/chart-simulator\/(?:jp|cn)\//iu);
  assert.doesNotMatch(simulatorSource, /assetPack|resourceManifest|fallbackSource/iu);
  assert.doesNotMatch(stage, /liveBG_fever|BgCover|judgeLineAdjustSkillEffect|soundEffect|AnimatedSprite/iu);
  assert.doesNotMatch(stage, /scale\.x\s*=\s*-1|stage\.scale/iu);
  assert.doesNotMatch(noteAssets, /\/local\/chart-simulator\/(?:jp|cn)\//iu);

  const timelineIndex = runtime.indexOf('aria-label={t("controls.timeline")}');
  const playbackControlsIndex = runtime.indexOf('onClick={restart}');
  const noteSpeedIndex = runtime.indexOf('{t("controls.noteSpeed")}');
  const skinControlsIndex = runtime.indexOf('<SimulatorSkinControls');
  assert.ok(timelineIndex >= 0);
  assert.ok(playbackControlsIndex > timelineIndex);
  assert.ok(noteSpeedIndex > playbackControlsIndex);
  assert.ok(skinControlsIndex > noteSpeedIndex);
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
  assert.match(en.songs.simulator.whitelistNotice, /Habahiro multi-range Point\/Skill\/Flick\/Long\/Slide geometry and admitted dynamic feedback/u);
  assert.doesNotMatch(en.songs.simulator.whitelistNotice, /Habahiro multi-range dynamic particles.*disabled/iu);
  assert.match(zh.songs.simulator.whitelistNotice, /Habahiro 多轨 Point／Skill／Flick／Long／Slide 几何与已准入动态反馈/u);
  assert.doesNotMatch(zh.songs.simulator.whitelistNotice, /Habahiro 多轨动态粒子.*禁用/u);
});

test("the durable rebuild contract records default-deny, JP-only, and native-note evidence", async () => {
  const [english, chinese, staticStageEnglish, staticStageChinese, notesEnglish, notesChinese] = await Promise.all([
    read("../documents/bandori-chart-simulator.md"),
    read("../documents/bandori-chart-simulator.zh-CN.md"),
    read("../documents/bandori-chart-simulator-static-stage.md"),
    read("../documents/bandori-chart-simulator-static-stage.zh-CN.md"),
    read("../documents/bandori-chart-simulator-native-notes.md"),
    read("../documents/bandori-chart-simulator-native-notes.zh-CN.md"),
  ]);

  assert.match(english, /Anything not listed above is disabled/u);
  assert.match(english, /official JP resource pack/u);
  assert.match(english, /must not add a CN resource pack/u);
  assert.match(chinese, /未列入上述白名单的能力一律禁用/u);
  assert.match(chinese, /演出资源只允许来自官方 JP 资源包/u);
  assert.match(chinese, /不得加入 CN 资源包/u);
  assert.doesNotMatch(english, /still has no multi-lane `lanes` presentation, Habahiro behavior, Directional width above 3/u);
  assert.doesNotMatch(chinese, /仍不包含多轨 `lanes` 演出、Habahiro 行为、`width>3` Directional/u);
  assert.match(staticStageEnglish, /The base static stage is complete for the fixed normal-play state/u);
  assert.match(staticStageEnglish, /confirmed-static-plus-code/u);
  assert.match(staticStageEnglish, /Bestdori layout constants/u);
  assert.match(staticStageEnglish, /pathId `3141674654239334496`/u);
  assert.match(staticStageEnglish, /Visual review may reject an implementation as incorrect, but it may not supply replacement numbers/u);
  assert.match(staticStageChinese, /固定正常播放状态下的基础静态舞台已经完成/u);
  assert.match(staticStageChinese, /证据冲突或不完整时必须失败关闭/u);
  assert.match(staticStageChinese, /视觉检查可以否决错误实现，但不能提供替换数值/u);
  assert.match(notesEnglish, /verified falling-note slice is complete/u);
  assert.match(notesEnglish, /Single.*`flick > skill > normal`/u);
  assert.match(notesEnglish, /`NoteSpeed=1\.00\.\.\.12\.00`/u);
  assert.match(notesEnglish, /three button pairs apply `±0\.50`, `±0\.10`, and `±0\.01`/u);
  assert.match(
    notesEnglish,
    /APK default-button value `s=5\.00` gives `A=3\.5 seconds`; the user-selected simulator default `s=10\.00` gives `A=1\.0 second`/u,
  );
  assert.match(notesEnglish, /ordinary and lane-change-marked multi-range Long\/Slide geometry/u);
  assert.match(notesEnglish, /22 vertices, 11 cross-sections, and 20 triangles/u);
  assert.match(notesEnglish, /Directional width 1 through 7 is not one stretched Sprite/u);
  assert.match(notesEnglish, /Width 1, 2, and 3\.\.\.7 select main prefab buckets 1, 2, and 3 respectively/u);
  assert.match(notesEnglish, /deliberately narrow approximation boundary/u);
  assert.match(notesEnglish, /normal and Skill `Smatt_1` preserve the source `-90°` screen orientation/u);
  assert.match(notesEnglish, /texture's `U=0` length origin on the hit point/u);
  assert.match(notesEnglish, /selectable-skin00\.\.\.03, 100-percent AutoPerfect note sounds/u);
  assert.match(notesEnglish, /dedicated polyphonic Web Audio graph/u);
  assert.match(notesEnglish, /music media element and Note voices are routed through the same `AudioContext`/u);
  assert.match(notesEnglish, /TapSE volume control/u);
  assert.match(notesEnglish, /`lanes \?\? \[lane\]` is authoritative coverage/u);
  assert.match(notesEnglish, /`width` as a Habahiro discriminator/u);
  assert.match(notesChinese, /已确认的下落 Note 切片/u);
  assert.match(notesChinese, /三组按钮分别执行 `±0\.50`、`±0\.10` 与 `±0\.01`/u);
  assert.match(notesChinese, /本能力的近似边界经过有意收窄/u);
  assert.match(notesChinese, /普通与 Skill `Smatt_1` 都保留源效果在屏幕上的 `-90°` 朝向/u);
  assert.match(notesChinese, /纹理长度轴的 `U=0` 原点放在击打点/u);
  assert.match(notesChinese, /AutoPerfect Note 音效/u);
  assert.match(notesChinese, /专用的多声部 Web Audio 图/u);
  assert.match(notesChinese, /音乐媒体元素与 Note voice 接入同一个 `AudioContext`/u);
  assert.match(notesChinese, /TapSE 音量控件/u);
  assert.match(notesChinese, /失败关闭契约/u);
  assert.match(notesChinese, /多轨 Long\/Slide 几何/u);
  assert.match(notesChinese, /22 个顶点、11 个横截面、20 个三角形/u);
  assert.match(notesChinese, /宽 1\.\.\.7 Directional 都不是横向拉伸一张 Sprite/u);
  assert.match(notesChinese, /width 1、2、3\.\.\.7 分别选择 main prefab 桶 1、2、3/u);
  assert.match(notesChinese, /`lanes \?\? \[lane\]` 才是权威覆盖/u);
  assert.match(notesChinese, /不使用 `width` 判断多轨覆盖/u);
});
