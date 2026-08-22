# Bandori Chart Simulator Rebuild

## Status and Goal

The chart simulator is being rebuilt on `dev/chart-simulator-rebuild` as a development-only surface. The goal is a lossless, automatically timed chart simulator whose native presentation capabilities are added only after their inputs and behavior have been verified against the game.

The development route is `/bandori/songs/{songId}`. It is intentionally absent from production navigation, and this phase does not include deployment, uploads, or publication of a presentation resource pack.

The locked source objects, runtime derivations, completion boundary, and change-admission rules for the three-layer base stage are recorded in [Bandori Chart Simulator Static Stage Evidence Ledger](bandori-chart-simulator-static-stage.md). The separately approved Note semantics, motion, effects, sounds, settings, Habahiro behavior, judgment, and Combo are recorded in [Bandori Chart Simulator Native Note Evidence Ledger](bandori-chart-simulator-native-notes.md).

## Current Whitelist

The approved runnable slice enables only:

- the existing Music master detail and Music asset-index contracts;
- the existing same-origin chart API and shared song audio;
- a lossless clone of every source chart entity;
- versioned Worker compilation into BPM, note, ribbon, and curve-control tables;
- audio-owned play, pause, restart, fixed jump, scrub transport, and the approved Web-only `0.50×...1.00×` music slow-play control with optional Note-fall synchronization;
- deterministic combo and active-ribbon rebuilding at an arbitrary time;
- a product analysis view of the complete chart; and
- a fixed `1334×750` Pixi coordinate space that scales uniformly with its container;
- the verified normal-play JP `liveBG` layout at `left=-216.2`, `top=-131`, `width=1766.4`, and `height=1324.8`;
- the verified native JP `bg_line_rhythm` field at `left=87`, `top=5`, `width=1160`, and `height=610`;
- user selection among the 15 verified `MasterSkin.skinLaneMap` fields, defaulting to Hello, Happy World! master ID `10` (`skin09`) without chart-feature inference;
- the paired ordinary judgment line centered at `667,615.239`, with fixed width `1798.389` and verified per-skin Sprite height, above the field;
- Single and Skill point Sprites; ordinary and admitted Habahiro multi-range Point, Skill, Flick, Long, and Slide Sprites and ribbon geometry including native hidden-curve conversion and verified composite endpoints; and Directional width 1...7 groups at fixed `NoteSize=100`, verified adjustable `NoteSpeed=1.00...12.00`, and `SuddenLane=false`;
- user selection among the seven verified `MasterSkin.skinNotesMap` styles and five verified `MasterSkin.skinDirectionalFlickMap` styles;
- native normal and directional Flick icon motion sampled from the same presentation clock as the note body; and
- automatic Perfect lane flash, bounded-approximation tap/swipe/hold presentation, selectable-skin00...03 100-percent AutoPerfect sounds, the Perfect judgment label, ordinary/All Perfect Combo, simultaneous lines, rhythm support, and their approved presentation switches for admitted ordinary and multi-range semantics;
- exact time or one-based Note-range looping that reuses the ordinary seek path; and
- chart-data-only mirror control.

The complete-chart layout uses documented product-UI dimensions and colors. It is not evidence for native lane projection, motion, timing windows, effects, or other game presentation parameters.

## Default-Deny Presentation Policy

Anything not listed above is disabled. The admitted automatic Perfect feedback covers ordinary and approved multi-range normal, Skill, Flick, Directional, Long, and Slide head, visible-checkpoint, sustained, and terminal lifecycles. Note sounds can select JP TapSE skin00...03 at fixed 100-percent volume. `laneChange` identifies the multi-range chart contract but does not trigger a field, judgment-line, background, flash, or full-skin transition. Deferred behavior includes `cont_force` controls, interactive failure/broken-hold and real multi-touch branches, interactive Slide contact motion, pathological overlapping multi-range simultaneous-line ownership, non-Perfect judgment labels, non-AutoPerfect sounds, the TapSE volume control, intro/fever presentation, non-default Note Size or Sudden Lane behavior, and other unverified native parameters. The compiler preserves `lane` as the scalar anchor and `lanes ?? [lane]` as authoritative coverage; `width` is not used as a Habahiro discriminator.

A native presentation capability can be enabled only after its source asset and behavioral parameters are independently verified. Its implementation must include a focused fixture or audit that records the evidence. Missing or unverified input disables the capability; it must not be replaced with a guessed value, placeholder asset, or approximate fallback.

## Presentation Resource Source

Simulator presentation resources have one source: the official JP resource pack. The simulator must not add a CN resource pack, region selector, server-dependent resource branch, or CN-to-JP / JP-to-CN fallback. If the JP pack does not contain a required resource, the corresponding capability remains disabled.

For local development, unpacked JP resource files may be staged directly under `public/local/chart-simulator/`. This ignored directory has no region or version layer, generated catalog, or content-addressing contract. Ordinary resources and verified limited-performance recipe files use fixed, route-owned direct paths. Merely staging a file does not authorize the simulator to load it; each presentation capability remains disabled until its native behavior is verified.

Representative direct-file roots used by the current stage include:

- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/bgskin/skin00/livebg_normal.png`;
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/fieldskin/{skin00...skin14}/bg_line_rhythm.png`;
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/fieldskin/{skin00...skin14}/game_play_line.png`;
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/noteskin/{skin00...skin06}/rhythmgamesprites.png`;
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/noteskin/{skin00...skin06}/longnoteline{,2}.png`;
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/noteskin/directionalflick{skin00...skin04}/directionalflicksprites.png`; and
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/noteskin/directionalflick{skin00...skin04}/flicknoteline_{l,r}.png`;
- `/local/chart-simulator/ingameskin/tapeffect/skin00/textures/Tex_parSet_{1,2}.png`; and
- `/local/chart-simulator/apk/textures/NoteLaneEffect_{1...4}.png`.

The renderer cuts verified Unity Sprite rectangles from the two original JP atlases. It does not load the separately exported Sprite PNGs because those files have already removed transparent edge pixels and therefore no longer preserve the original Sprite rectangle and center pivot by themselves.

There is no runtime manifest, API, hash gate, version selector, regional directory, or resource fallback. A missing required file produces an explicit unavailable state.

Regional Music metadata may still use the application's established localization preference. That metadata is descriptive text and difficulty information, not a simulator presentation-resource source.

## Limited Performance Skins

Limited performance skins are a separate control layered sparsely over the ordinary skin controls. Selecting one retains every ordinary selection and overrides only the slots that the verified family actually owns; the affected ordinary controls remain visible but disabled and marked as overridden. Clearing the limited skin immediately restores the retained ordinary selections. Limited skins never select a song or chart.

The UI lists only families whose browser contract is fully closed. The first admitted family is Persona: it overrides the lane and paired judgment line, note and Directional Flick Sprites, tap/hold and Directional Flick particle recipes, and the six verified TapSE cues. It does not override the normal-play background. Every promised direct file is required and fails closed when absent; a slot omitted by the family is not treated as missing.

The user-approved vertical-beam and outward-growing Directional-terminal placement compensations are renderer-wide only for nodes already admitted as semantic equivalents. Persona maps its finger `/slash` and main `/notes` nodes into those rules. Its animated Flick `line1` retains the recipe's authored lower spawn position and lifetime while applying a `4.0` Web multiplier only to its upward displacement. Any future Flick or Directional node with a special spawn offset or animation must be reported and reviewed with the user before extending the override mapping.

The builder registry records 21 known families and 113 exact JP bundles, but pending or blocked families are not exposed in the selector. April 2019 remains blocked because its regular tap effect requires a Velocity over Lifetime runtime profile that the bounded browser evaluator does not yet implement. `teamlivefestival` is excluded from the limited registry and is deferred to the ordinary composite-background setting. All other limited backgrounds are likewise deferred until the ordinary background selector is complete. No runtime catalog or per-family manifest is introduced.

## Architecture Boundaries

- `src/lib/bandori-chart-simulator-contract.ts` validates only the lossless chart envelope.
- `src/lib/bandori/chart-simulator/` owns pure compilation, the versioned Worker protocol, seek rebuilding, and transport state. It does not own presentation assets or regional source selection.
- `src/app/[locale]/bandori/songs/[songId]/` owns the development route, route-private product UI, fixed native stage contract, renderer lifecycle, and complete-chart analysis projection.
- The existing Music APIs and public Music asset index remain the source of song metadata, chart descriptors, audio, artwork, duration, BPM summaries, and expected combo counts.

Unknown chart entity types and inconsistent combo metadata fail closed. The compiler preserves the original entity array instead of silently normalizing unsupported data away.

## Native Evidence Locked in This Slice

- The JP APK `level3` `NoteLane` object and its `UITexture` establish the `1334×750` reference viewport and the `87,5,1160,610` field rectangle.
- The 15 JP lane skins share the fixed `1160×610` native carrier; `skin14` has a `1160×608` source texture that the fixed carrier stretches, and the page still scales only the complete stage.
- The JP `Stage/TRSRoot/bgImage` chain establishes a center-pivot `1920×1440` UITexture at `y=-170` under the normal-play `0.92` scale. In the reference viewport this produces the `-216.2,-131,1766.4,1324.8` rectangle and viewport clipping.
- Background content and layout are separate contracts. The runtime uses canonical `skin00/livebg_normal`; it is byte-identical to the previously analyzed Habahiro file, and only this one background choice is admitted.
- Source `laneChange` markers identify the multi-range chart contract, while automatic wide-field selection and every lane-change field/judgment/background/flash transition remain deferred. The active field skin is selected only by the user control.
- Every admitted ordinary `game_play_line` Sprite is `1800` pixels wide, center-pivoted, and PPU `69`; verified heights are `18`, `38`, `40`, or `56` depending on skin. The native `Button4/judgeLine` formula preserves center and width while deriving height from the selected Sprite rect.
- `Button4/judgeLineAdjustSkillEffect` is a separate higher-order skill presentation. It and all judgment-line animation or feedback remain disabled.
- Mirror maps chart lanes `0↔6`, `1↔5`, `2↔4`, keeps `3`, and swaps left/right directions. The stage, camera, and resource are not mirrored.
- Ordinary point notes use the native piecewise arrival window for `NoteSpeed=1.00...12.00`, with the user-selected simulator default `10.00` producing `1.0 s`. The APK default button remains documented as `5.00`; the control preserves the three verified adjustment pairs (`±0.50`, `±0.10`, and `±0.01`) without copying the game's button artwork. Its user-approved boundary behavior clamps and remains at `1.00` or `12.00` instead of wrapping. The seven button endpoints, depth curve, size curve, center-pivot JP Sprites at `PPU=100`, and audio-owned presentation time remain unchanged. The exact derivation and semantic priority table are locked in the native point-note evidence ledger.
- The note-style TYPE1...TYPE7 and directional Flick TYPE1...TYPE5 selectors follow JP master IDs exactly. They switch only verified atlas sources and Unity rect tables; they do not alter note projection, motion, scale, or timing.
- The Persona limited-performance overlay uses verified direct Sprite PNGs rather than pretending they share an ordinary atlas contract. Its effective lane, note, Directional Flick, effect, and sound selections are derived at render time so the retained ordinary state is never overwritten.
- Native `GameNoteType.Long` uses one 11-section belt between exactly two same-lane endpoints. A score-level Long that crosses lanes, has three or more points, or uses curves is converted to the `NoteSlide` runtime path: one hold root follows the path while its main and flash Sprites remain selected from the head coverage. Slide curve controls become simplified native hidden nodes; each adjacent node pair uses one segment, and any hidden node selects the curve texture family for the whole chain. Speeds `11.02...12.00` switch to the verified 21-section advanced mesh. Future nodes stay at Launcher, moving nodes use the shared projection, and passed nodes stay on the judgment line while interpolating toward the next node.
- Directional width 1...7 expands into adjacent bodies with one outer icon and `N-1` center-to-center back lines. Width 4...7 reuses the verified width-3 main effect and sound bucket; no width is represented by stretching one Sprite.
- Auto-play resolves every admitted ordinary or multi-range Note lifecycle to Perfect feedback at its mirrored scalar root. The lane flash preserves the APK Sprite mapping, PPU `69`, two-update delay, `0.1666667 s` fade, scale `1→0.7`, and alpha `1→0`; multi-range charts retain native call targets but suppress visible standard lane highlights. Tap, swipe, and hold effects preserve their admitted JP textures, recipes, burst counts, colors, source curves, ranges, and blend/order contracts. Only Unity particle-engine evaluation that cannot be reproduced byte-for-byte in Pixi is a bounded approximation; triggers and serialized inputs remain exact. Perfect judgment and ordinary/All Perfect Combo use the recovered positions and curves. Seeking, jumping, restarting, or changing chart state clears transient feedback instead of replaying historical hits and reconstructs persistent Combo/hold state directly.
- Manual pause, coordinated pause, scrub start, and fixed jumps snapshot the exact `audio.currentTime` before leaving or rebasing the playing state. The paused stage therefore freezes at the same audio-owned presentation frame instead of falling back to the last lower-frequency `timeupdate` snapshot.
- The `0.50×...1.00×` playback-rate selector is an explicitly approved Web feature, not a recovered native Live setting. It preserves pitch and slows the music media clock. “Synchronize note-speed slowdown” is off by default: judgment times still follow slowed music, while pre-judgment Note/ribbon approach retains its `1.00×` wall-clock speed and therefore produces wider Note spacing. Turning the switch on slows that approach with the music. Post-judgment Long/Slide motion remains chart-clock-owned. Note SE samples, tap/swipe particles, lane feedback, TapKeep, and TouchingFlash continue at their ordinary real-time speed. The selector stores integer hundredths, offers `±0.10` and `±0.01`, defaults to `1.00×`, and clamps at both boundaries.
- The Web-owned range loop accepts either exact media times or one-based Combo Note numbers. Time mode preserves an input satisfying `0 <= A < B <= duration`. Note mode expands both ends to complete simultaneous-judgment groups; the first group starts at `0`, otherwise `A` is the midpoint between the previous group and the selected first group, while `B` is the next group's judgment time or the song end. Playback uses the half-open interval `[A,B)`, so the group at `B` never fires. Every wrap reuses the ordinary seek path for pause, committed media position, persistent-state reconstruction, and playback resumption. Long/Slide do not alter the boundary or receive a loop-only branch. Note SE look-ahead is likewise capped strictly before `B`.

The normal-play background uses full UV, bilinear filtering, white tint, standard alpha blending, and renders below the field. The ordinary judgment line, note atlases, ribbon belts, and Directional back lines use linear filtering, white tint, and standard alpha blending. Admitted tap/swipe/hold effects use their verified additive or standard blend contracts. Intro states, visible `BgCover`, fever switching, skill-specific judgment-line presentation, unlisted effect timing, non-Perfect HUD branches, and non-AutoPerfect audio cues remain outside the whitelist until separately approved.

## Verification Gate

Before a change is considered ready, run:

```bash
npm run test:bandori-chart-simulator
npm run test:bandori-music
npm run i18n:check
npm run typecheck
npm run build
```

Browser validation is a smoke check rather than a source of native parameters. Check the normal-play background, field, ordinary judgment-line composition, point-note lifecycle and mirror, complete-chart tab, fixed jump, audio playback, scrub/restart behavior, difficulty change, missing-resource and unsupported-note failure states, and relevant console logs.
