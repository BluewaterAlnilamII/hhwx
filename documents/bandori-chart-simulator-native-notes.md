# Bandori Chart Simulator Native Note Evidence Ledger

## Completion Boundary

The verified falling-note slice is complete for the fixed normal-play state:

- reference viewport `1334×750`;
- `NoteSize=100`;
- `NoteSpeed=1.00...12.00` in `0.01` increments, simulator default `10.00`;
- `SuddenLane=false`;
- one of the seven JP `MasterSkin.skinNotesMap` rhythm-marker styles, with verified Habahiro wide Sprites selected per multi-range Note rather than exposed as another style;
- one of the five JP `MasterSkin.skinDirectionalFlickMap` directional Flick styles; and
- chart-data-only mirror.

This ledger admits falling Single notes; ordinary and lane-change-marked multi-range Long/Slide geometry; Directional groups of width 1 through 7; automatic Perfect feedback for ordinary and admitted multi-range normal/Skill/Flick/Long/Slide notes; the Perfect judgment label, ordinary/All Perfect Combo display, simultaneous-line, rhythm-support, lane-effect, and All Perfect-status switches; and the selectable-skin00...03, 100-percent AutoPerfect note sounds described below. Habahiro is not a rhythm-marker style: only an individual multi-range Note selects its verified wide Sprite, while single-lane Notes retain the selected `TYPE1...TYPE7` style. Charts never trigger a global skin change or lane-change presentation. Interactive touch/hold failure branches, the TapSE volume control, and other unverified settings remain excluded.

All numeric values below are `confirmed-static-plus-code`. Screenshots and browser output are not parameter sources. JP `NoteUtility.CalcNotePosition` derives an exponential position factor from time progress and then uses that same factor for both X and Y, so the trajectory stays exactly on the straight segment from the launcher start to the judgment target. Raw time progress must not drive X directly, and the exponential factor must not be normalized again from its `p=0` position to the goal.

## Source Objects

The JP `ingameskin/noteskin/skin00` bundle resolves to serialized file `CAB-77a4d16d885ff6e15832dabe4903fe45`. Its admitted `note_normal`, `note_skill`, `note_flick`, and `note_long` lane families use a `308×120` Sprite rect, center pivot `(0.5,0.5)`, and `pixelsToUnits=100`. `note_slide_among` is also `308×120`; `note_flick_top` uses a `171×138` rect with the same pivot and PPU. The same bundle supplies `longNoteLine` and `longNoteLine2`, both `146×205`, RGBA32, bilinear, and clamp.

The JP `ingameskin/noteskin/directionalflickskin00` bundle resolves to serialized file `CAB-5a6a5782278c3e743a201eb818d85fae`. Its left/right lane families use `308×120`; `note_flick_top_l` is `138×171` and `note_flick_top_r` is `138×170`. Every admitted Sprite has center pivot and PPU `100`. `FlickNoteLine_l/r` are `10×78` connector textures.

The runtime loads the original texture atlases directly:

- `.../noteskin/skin00/rhythmgamesprites.png` (`2048×1024`); and
- `.../noteskin/directionalflickskin00/directionalflicksprites.png` (`1024×1024`).

The verified Unity Sprite `m_Rect` values are fixed in route-private source. Unity rect Y is measured from the atlas bottom, so Pixi receives `top = atlasHeight - y - height`. Separately exported Sprite PNGs are not runtime inputs: their transparent borders have already been trimmed, which would lose the original rect and pivot carrier.

The note-style selector preserves master ID order rather than bundle-name order:

| UI type | Master ID | Bundle | Verified rect-table layout |
|---|---:|---|---|
| TYPE1 | `1` | `skin00` | A |
| TYPE2 | `2` | `skin01` | A |
| TYPE3 | `3` | `skin02` | B |
| TYPE4 | `4` | `skin03` | B |
| TYPE5 | `5` | `skin04` | A |
| TYPE6 | `6` | `skin06` | C |
| TYPE7 | `7` | `skin05` | B |

Layouts A, B, and C retain the exact Unity `m_Rect` table for every admitted `note_normal`, `note_skill`, `note_flick`, `note_long`, `note_slide_among`, and `note_flick_top` Sprite. Every admitted body remains `308×120`, center-pivoted, and PPU `100`; the layouts change atlas coordinates, not placement or motion. TYPE7's master `noteSyncEdgeMargin=1.1` is stored in `NoteManager` and passed only to `SetupSyncLine`; the traced arm64 path does not feed note-body rendering.

Habahiro is not an eighth UI type. Multi-range bodies select direct JP Sprite exports by their covered lanes while single-lane bodies keep the selected TYPE1...TYPE7 style. The approved range Flick top contract has three visual widths: width 1 uses `note_flick_top`, width 2 uses `note_flick_top_2`, and widths 3...7 use `note_flick_top_3`.

The directional selector maps TYPE1...TYPE5 to `directionalflickskin00...04` in master ID order. Their body rect tables are identical. `note_flick_top_r` is `138×170` in TYPE1 and `138×171` in TYPE2...TYPE5; the runtime selects that verified height while preserving the common center pivot and PPU `100`.

## Native Semantic Resolution

JP `NoteBase.setupNoteType` selects the concrete Note class and base Sprite before the optional skill path. The admitted semantics are:

| Compiled point | Priority | Body Sprite | Icon |
|---|---|---|---|
| Single | `flick > skill > normal` | `note_flick_{lane}`, `note_skill_{lane}`, or `note_normal_{lane}` | `note_flick_top` for Flick |
| Long start/end | ordinary or Skill endpoint | `note_long_{lane}` or `note_skill_{lane}` | Flick/Directional endpoint icon when present |
| Slide start/end | ordinary or Skill endpoint | `note_long_{lane}` or `note_skill_{lane}` | Flick/Directional endpoint icon when present |
| Slide visible middle | non-endpoint | `note_slide_among` | none |
| Directional width 1...7 | one body per adjacent lane | `note_flick_l/r_{lane}` | one matching outer `note_flick_top_l/r` |

A Single carrying both Flick and Skill remains a Flick. A Long/Slide Skill endpoint replaces the endpoint body with `note_skill` while retaining a Flick or Directional icon. A normal Slide end keeps `note_long`; only a visible, non-endpoint Slide node uses `note_slide_among`. A hidden Slide node retains its transform and connector topology but has no point Sprite.

The converted `charge` flag represents the JP fever additional type and does not replace the falling body Sprite. `note_long_flash` is a separate child initialized hidden and activated only after a successful touch-began path. Charge is therefore a visual no-op in this falling-note slice, while the unconfirmed `charge + skill` combination fails closed.

## Presentation Settings

The simultaneous-line, rhythm-support, and lane-effect settings are purely presentational and do not alter chart data, judgment windows, score, input, sound, or Note trajectories. A fresh native installation defaults them to on, off, and off respectively; the simulator defaults all three to on by explicit user choice.

The simultaneous line connects admitted front Notes and Long/Slide endpoints at the same time. A width-1...7 Directional group is collapsed into one logical target and uses the body facing the adjacent logical target; the Flick icon is never an endpoint. A multi-range non-Directional Note instead contributes its single root Transform at the arithmetic mean of covered lanes; Sprite edges never become endpoints. Slide middle nodes remain excluded. The selected Note skin supplies `simultaneous_line`; ordinary endpoints use its margin while Directional targets use zero margin. Line width is `leftTarget.worldScale × 0.28 × 375`.

Rhythm support affects only an ordinary, non-Skill Point Note front body. Native evaluates the measure-relative fraction as `((numerator × 8) % denominator) > 0`. Imported BMS beats instead count quarter notes (`beat = measure × 4 + numerator × 4 / denominator`), so the equivalent Web predicate is `!Number.isInteger(beat × 2)`. When that predicate is true, meaning that the Note is off the one-eighth-note grid, `note_normal` is replaced by the selected skin's same-lane `note_normal_16`. Skill, Flick, Directional, Long, and Slide bodies remain unchanged. Turning the setting off restores `note_normal`.

The lane-effect switch gates only `NoteLaneEffectOn`; it does not control the normal, Skill, Flick, or Directional main hit particles. The seven lanes use `NoteLaneEffect_1,2,3,4,3,2,1`, PPU `69`, a bottom-center pivot, and mirrored right-side sprites. Once enabled and triggered in an ordinary chart, the effect waits two presentation updates, then linearly changes color from `(1,1,1,1)` to `(0.7,0.7,1,0)` over `0.16666667 s` without changing size, and finally hides. `NoteLaneEffectOn` returns before enabling the Animator whenever the chart is lane-change-marked multi-range, so visible standard lane highlights are always zero for every Note in such a chart even when this setting is on. Turning the setting off clears any currently visible ordinary-chart highlight and ignores later on events.

## Perfect Hit Feedback

This capability retains a deliberately narrow approximation boundary.

`NoteFrontBase.judgeFrontNote` (`0x30E0FEC`) reaches `GamePlayButton.PlayAnimation` (`0x387D94C`), which selects the normal, Skill, Flick, or Directional branch and restarts the selected root through `playParticle` (`0x387F118`). Auto play reaches the same accepted-Perfect paths through `NoteFlickBase.forcePerfect` (`0x3A77768`). A regular Flick invokes `playFlickNoteParticle` (`0x387F37C`) and `effect_tap_swipe`. A Directional note invokes `playDirectionalFlickNoteParticle` (`0x387F21C`) and then `NoteDirectionalFlick.onFinishJudgeFrontNote` (`0x30EA084`) invokes the same-direction finger root through `PlayDirectionalFlickFingerEffect` (`0x387EFA0`). For a front/Single hit, Skill Flick replaces the swipe main root with the Skill root; Skill Directional replaces the Directional main root with the Skill root but still keeps the matching finger root.

Long/Slide Flick or Directional tails enter the same terminal particle branches. A Long head has already reset the skill attribute, and Slide terminal dispatch fixes `isSkill=false`, so a skill-marked visual tail still uses Flick or Directional terminal particles rather than the Skill root. Their surrounding `ExecTouchEnded` paths also switch on the root scalar lane effect: Long calls `NoteLaneEffectOn` / `NoteLaneEffectOffReserve` before `judgeAfterNote`, while Slide turns off the previously tracked lane and starts/reserves the current tail lane before and after `afterNoteJudge`. Consequently a width-2/3 Directional tail still places the main effect and lane flash on its scalar root lane. The main prefab's `notes` child emitter uses the separately approved manual placement recorded below. Mirror resolves lane, direction, root, and terminal before event dispatch.

The Web trigger runs only when forward playback crosses the accepted hit time. A seek, fixed jump, restart, difficulty change, `MoveTime` reconstruction, or backward clock change clears active feedback and does not synthesize historical hits; both `PlayAnimation` and `PlayDirectionalFlickFingerEffect` explicitly return during `MoveTime`.

The normal root `effect_tap_perfect` has six active child systems: `star`, `Smatt_1`, `Sring_2`, `ring_2`, `kira_par_2`, and `ring_3`. The Skill root `effect_tap_skill_perfect` has `Sring_2`, `Smatt_1`, `star`, `Sring_1`, `kira`, and `Star_center`. Repeated playback performs the confirmed Stop/Clear/Play restart instead of stacking stale particles. Both roots use the JP `ingameskin/tapeffect/skin00` source and original `Tex_parSet_1/2` `1024×1024` atlases split into `4×4` cells. The runtime retains the exact atlas cells, additive material, source order `5`/`50`, all-at-zero bursts, static-system start sizes and source curves, Kira count `25`, start lifetime `0.3...0.6 s`, speed `1...40`, size `0.2...0.6`, Box shape `2.5×0×0.72`, Limit Velocity `0.7`, dampen `0.2`, colors, and maximum visible lifetime `0.9 s`.

The button flash is not approximate. APK `level3` supplies `NoteLaneEffect_1...4`, source PPU `69`, bottom-center pivot, and the symmetric lane mapping `1,2,3,4,3,2,1`; physical lanes 4...6 flip X. It waits two presentation updates, then keeps a fixed size while color changes linearly from `(1,1,1,1)` to `(0.7,0.7,1,0)` over `0.1666667 s`.

The user-approved bounded approximation covers only the engine evaluation needed to express Unity particle modules in Pixi: Unity's automatic random stream is replaced with a deterministic per-note seed, while the recovered MinMaxCurve, MinMaxGradient, burst, Box/Circle/Cone shape, gravity, Size/Rotation/Color over lifetime, Limit Velocity, UV-sheet, Billboard, and Stretched Billboard contracts remain data-driven. Both normal and Skill `Smatt_1` preserve the source `-90°` screen orientation and place the texture's `U=0` length origin on the hit point rather than centering the full length across it; the Skill root's exact `localScale.x=0.5` narrows its cross-axis. Flick uses every serialized-active child of `effect_tap_swipe`. Directional uses the separate left/right span-1/2/3 main roots plus separate left/right finger roots, preserving the JP atlas cells, additive blend, order `1`/`5`/`50`, burst counts, colors, curves, and lifetime envelopes. The approximation does not authorize manual tuning of trigger types, positions, atlas cells, layer count, burst count, ranges, colors, curves, blend, sorting, or lifetime. Screenshots are structural smoke references only and are not numeric parameter sources.

Explicit user-approved manual overrides are recorded separately from the JP-native evidence and apply as renderer-wide Web compensations to equivalent ordinary and limited-performance recipe nodes. Swipe particle dimensions use the runtime's complete evaluated width and height at scale `1.0`; no extra Web multiplier is applied to `slash`, `notes`, `burtst`, or `spark_*`. The ordinary Flick `effect_tap_swipe/slash`, Persona Flick `effect_tap_swipe/line1`, and ordinary or Persona left/right Directional finger `/slash` override their vertical placement: the final quad spans one third of its evaluated vertical extent above the judgment line and two thirds below it. A Directional main root remains on its scalar lane. In both ordinary and Persona recipes, the `/notes` visual target is one lane beyond the sole body for width 1 and the outermost body/tip region for widths 2 and 3. Because the texture grows outward from a fixed inner edge rather than staying centered on that visual target, its anchor is one lane inward from the former centered placement: the outermost body lane for width 1 and one lane inward from the outermost body/tip for widths 2 and 3. Its center then moves outward by half the currently evaluated source length, preserving the original size and color curves without adding the target lane twice. Width 3 retains the source bursts at `t=0` and `t=0.1`; both share the corrected anchor. Original per-child color sources and deterministic seeds remain unchanged, including the white `notes`, `spark_*`, and finger `Sring_1` contributions; no extra color randomizer is introduced.

The deterministic per-note seed remains an explicit Web approximation and intentionally makes repeated playback of the same Note identical. Within that fixed stream, Unity Fixed Random Color keys are interpreted as authored cumulative selection bounds instead of ordinary fixed lifetime interpolation, so every serialized discrete color remains reachable without adding a new random source. Signed transform handedness is also preserved for shape-emission directions: the negative X scale of right Directional roots mirrors the matching left particle paths while leaving the recovered cone angle, speed, lifetime, positive scale magnitude, and Limit Velocity values unchanged. An audit of all admitted swipe and hold recipes found Fixed Random Color only on Directional `star_*` systems and moving negative-scale emission only on right Directional `spark_*` / `star_*` systems; the other negative-scale nodes have zero start speed and are unaffected.

## Long, Slide, and Wide Directional Geometry

An ordinary Long creates one textured belt between exactly two same-lane endpoints. For an ordinary Slide, the compiler first mirrors JP `MusicScoreBezierConverter`: each connection-control-connection triple is sampled as a quadratic Bézier at `i/200` for `i=1...199`, grouped by 48-tick time, quantized to native lane plus `DiffVolume`, and simplified with the confirmed flat-or-under-2-degree rule. The controls are then consumed into hidden Slide nodes. Published chart assets may already contain this converter output, so a fractional lane is admitted only for a `hidden` non-endpoint Slide connection whose midpoint-to-even scalar anchor remains within lanes 0...6; edge DiffVolume such as `-0.4` or `6.4` is retained rather than clamped. Every other source connection retains the integer-lane requirement. Runtime geometry remains one straight belt per adjacent node pair; it does not evaluate a spline. If any generated or source Slide node is hidden, every segment uses `longNoteLine2`; otherwise every segment uses `longNoteLine`.

The ordinary `NoteMesh` has 22 vertices, 11 cross-sections, and 20 triangles. Its UV V coordinates are `0,0.1,...,1`, and its nine internal cross-sections use linear 0.1 interpolation. For speed strictly greater than `11.010000228881836`—therefore `11.02...12.00` in the admitted control—the native `NoteMeshAdvanced` uses 42 vertices, 21 cross-sections, 40 triangles, UV V steps of 0.05, and the verified `/40` endpoint weights. The serialized mesh scale `0.8` is not used: `Activate` resets it to one.

For an ordinary chain, `NoteMesh.GetMeshWidthRate` is `1.0`. For a lane-change-marked multi-range chain, each cross-section uses the covered-lane arithmetic-mean center and half-width `N × rate(N) × projected.worldScale × 375`: `rate(1)=1`, `rate(2)=1.0499999523162842`, and `rate(3...7)=1.05 + 0.03000009059906006 × min(0.996,1)`. Hidden multi-range nodes remain real endpoints of both adjacent straight segments and select `longNoteLine2` for the whole Slide. A Directional terminal always stays on its scalar root lane at one-lane mesh width; add bodies and back lines never enter `NoteMesh`. Future points remain at Launcher so the belt is not truncated, while their Note bodies remain hidden until their own Move window.

Directional width 1 through 7 is not one stretched Sprite. Width `N` expands to `N` adjacent scalar bodies, one icon on the direction's outermost body, and `N-1` center-to-center back lines. The existing connector width, UV, insertion-order, and sorting contracts remain unchanged.

The JP APK connective-mesh material uses the `star/Star Transparent Colored` shader, with `SrcAlpha` / `OneMinusSrcAlpha` blending and no depth write. The serialized material threshold values are retained as evidence—`2000` for the ordinary Long belt, `704.72900390625` for the curved Slide belt, and `750` for both Directional back lines—but are not applied as an extra Web stage-Y clip. Applying the curved-Slide value that way would cut the mesh at `y=45.27099609375` even though a Note enters its confirmed Move window at approximately `y=28.4633423021`. The normal `SuddenLane=false` path is clipped only by the stage viewport. The shader first multiplies the sampled texture by the mesh vertex color. `NoteMesh.initMesh` initializes every Long/Slide vertex to RGB `1,1,1` and alpha `LongNoteLineBrightness / 100`; the native default button selects `80`, the admitted range is `10...100`, and each adjustment changes the value by `10`. These values remain recorded as native evidence but are temporarily disconnected from the Long/Slide Web runtime.

Because the native Android shader variant, color space, and final GPU composition do not yet have a reviewable pixel-level closure, Long/Slide temporarily use Pixi's default `MeshSimple` material. They consume the unpacked PNG's own alpha through the standard texture path without the additional `0.8` vertex alpha, nonlinear alpha transfer, or `no-premultiply-alpha` upload override. This is a user-approved raw-texture baseline and is not claimed as a native-material reproduction. Directional back lines retain the implemented straight-alpha custom shader and vertex alpha `1`; they are not affected by this fallback.

The background, field, judgment line, note bodies, and directional icons remain ordinary Sprite composition. Habahiro loads the unpacked JP Sprite files with their rendered pivots retained; it is not CSS-stretched and is not tied automatically to a chart. Multi-range tap/hold selection and lifecycle are specified in the dynamic section below rather than inferred from this static Sprite contract.

## Fixed Projection and Lifecycle

The native camera conversion on the reference viewport is:

```text
screenX = 667 + 375 × worldX
screenY = 375 - 375 × worldY
```

Button local X values are `[-6.6,-4.4,-2.2,0,2.2,4.4,6.6]`; goal local Y is `-3.4500000477`. Define:

```text
r = (1334 / 750) / 9.578571319580078
goalX = buttonX[lane] × r
goalY = -3.4500000477 × r
leftGoalX = -6.6 × r
launcherY = goalY + leftGoalX × -1.3439395427703857
startX = 0.05 × goalX
startY = goalY + 0.95 × (launcherY - goalY)
```

JP `LiveSettingsHiSpeed` closes the setting contract: the constructor stores maximum `12.00`, the default button writes `5.00`, and the three button pairs apply `±0.50`, `±0.10`, and `±0.01`. The APK wraps directly when an adjustment crosses either bound. The approved Web interaction intentionally differs: every adjustment clamps and remains at `1.00` or `12.00`; an outward press at either boundary has no effect. The control uses ordinary text buttons and does not claim the game's button artwork.

For an admitted speed `s`, the native arrival duration is:

```text
A = s > 11.01 ? 1.6 - 0.1 × s : 6 - 0.5 × s
```

The APK default-button value `s=5.00` gives `A=3.5 seconds`; the user-selected simulator default `s=10.00` gives `A=1.0 second`. The deterministic Web projection returns a point only while `hitTime-A <= presentationTime <= hitTime`. Native `Activate` places its exact first frame at `(startX,startY)`; subsequent `CalcNotePosition` updates use:

```text
p = clamp(1 - (hitTime - presentationTime) / A, 0, 1)
e = 1.1 ^ ((p - 1) × 50)
x = startX + e × (goalX - startX)
y = startY - abs((startY - goalY) × e)
d = abs(launcherY - y) / abs(launcherY - goalY)
```

For fixed `NoteSize=100` and the normal high-aspect state:

```text
q = r × d
worldScale = q × 0.996 + 0.004
spritePixelScale = worldScale × 375 / 100
```

The seven endpoint X values are approximately `[207.4116,360.6078,513.8039,667,820.1961,973.3922,1126.5884]`; endpoint Y is approximately `615.23938`. Lane 0 is approximately `(640.3013,33.4618)` at `CalcNotePosition(p=0)` and `(603.7233,82.6204)` at `p=0.5`; its separate native `Activate` first-frame start is approximately `(644.0206,28.4633)`. World scale is approximately `0.01474420` at spawn and `0.18894950` at judgment.

No independent tween owns note time. The Pixi ticker samples the audio element's `currentTime` while transport is playing and samples deterministic transport state while paused, scrubbing, restarted, or jumped.

The approved Web slow-play control is deliberately outside the native-evidence contract. It sets the music element to `0.50×...1.00×` with preserved pitch. “Synchronize note-speed slowdown” is off by default: judgment times remain audio-clock-owned, but the pre-judgment Note/ribbon arrival window in chart time is multiplied by the playback rate, preserving the `1.00×` wall-clock approach speed and widening Note spacing. When the switch is on, the arrival window remains unscaled and the approach slows with the music. Post-judgment Long/Slide root motion remains beat-clock-owned. A separate effect-animation clock advances by real ticker seconds only while transport is playing. Tap, swipe, lane, TapKeep, and TouchingFlash animation therefore remain at ordinary `1×` speed and merely receive their triggers from the slowed chart clock.

## Flick Icon Motion and Draw Order

Let `tau = mod(max(0, presentationTime - (hitTime-A)), 1/3)`. The icon local positions are:

```text
normal Flick: (0, 0.7 + 1.8 × tau, 0)
left Flick:   (-1.6 - 2.1 × tau, 0, 0)
right Flick:  ( 1.6 + 2.1 × tau, 0, 0)
```

The icon shares the parent's movement and world scale. World-positive Y is converted to screen-negative Y. The body is inserted before the icon. This preserves the confirmed body sorting order `70`; directional icons use the higher order `71`, while the ordinary Flick icon shares order `70` and follows the body in native child order.

The stage viewport supplies clipping. No extra mask is introduced for the normal `SuddenLane=false` state. Single notes, moving Long/Slide nodes, and all expanded Directional bodies share the same time-to-progress-to-projection function. Ribbon nodes add only the confirmed Launcher/Move/Stop lifecycle states described above; they do not introduce a second falling path.

## Long and Slide AutoPerfect Feedback

The admitted dynamic path follows the JP 10.1.3 AutoPerfect lifecycle. A Long head emits its normal or Skill Perfect one-shot, starts `effect_TapKeep`, and enables `TouchingFlash`; its tail stops and clears both sustained effects before emitting the normal, Flick, or Directional terminal effect. A Slide head does the same, each visible intermediate node emits one normal Perfect one-shot without restarting the sustained effects, and hidden control points emit no judgment particle. Slide keeps the same unsuffixed pooled sustained particle instance while its root follows the ribbon's confirmed Stop-phase interpolation from the current connection toward the next one on the judgment line; changing a Slide node's range never replaces or restarts that instance. The accepted head Note body uses that same moving root until the tail, while each visible intermediate or tail body is removed after its own judgment time. Every standalone or Long/Slide-tail Directional emits exactly one main and one same-direction finger effect at its scalar root lane. Width 1, 2, and 3...7 select main prefab buckets 1, 2, and 3 respectively; widths 4...7 reuse the width-3 prefab without stretching, repeating, or moving the trigger to the expanded group's outer body.

In an ordinary chart, lane effects are discrete two-update pulses, not hold-state illumination. Long pulses its scalar lane at the head and tail only. AutoPerfect Slide pulses the head lane and then immediately pulses the first-after scalar lane; a hidden first-after is not skipped, while a same-lane pair restarts the same GamePlayButton rather than creating a second object. Each later visible checkpoint first turns off the tracked old lane and then pulses the current scalar lane; hidden checkpoints neither emit nor update the tracker. The tail turns off the tracked lane and pulses only its scalar root lane. Flick/Directional width never expands this lane set. In a lane-change-marked multi-range chart, the native `IsMultiRangeNotes` guard suppresses every successful activation, so the visible lane-highlight count remains zero across Point, Long, and Slide lifecycles.

`TouchingFlash` uses the selected JP note skin's unpacked `note_long_flash_0...6` Sprites for a one-lane root. An admitted multi-range root instead selects the exact continuous-lane name from the 28 Habahiro Sprites, from `note_long_flash_0_1` through `note_long_flash_0_1_2_3_4_5_6`; their logical widths are `524...1596` while height remains `120`, and the rendered pivots are retained. The hold body and flash select their Sprite once from the ribbon head coverage. The same root may move along a Slide path—including a score-layer curved or cross-lane Long that the native runtime converts to `NoteSlide`—but later visible or hidden connections never reselect either Sprite. The Web color is the exact looped `LongNoteFlash` curve with period `0.8333333135 s`: RGB is `0.2` at the endpoints and `0.6` at `0.4166666567 s`, alpha remains `1`, and both halves retain the recovered Unity Hermite polynomials. It is composited above the Note with the native-equivalent additive `SrcAlpha/One` blend, so it can only brighten the body rather than replace it with a gray ellipse. The flash starts with the accepted head, follows the same interpolated Slide root, and is removed on the successful tail.

The multi-range one-shot selection uses `ButtonTypesArray.Length-1` and places the root on `GetEffectTargetButton`, i.e. the lower-middle covered lane rather than the Note Sprite's arithmetic-mean center. Normal Perfect changes only the active `star` emitter's X start size to `2.5 × width`; Skill Perfect retains an identical serialized hierarchy for widths 1...7 while preserving the width selection; Flick changes only `square` X start size to `2.5 × width`, leaving `slash` and the other emitters unchanged. These width-specific rules are evaluated inside the same bounded Web particle approximation described above; they do not authorize new global scale multipliers.

`effect_TapKeep` is interpreted from the JP prefab rather than redrawn. A Long selects its head width's button prefab: `par_square` uses X start size `2.5 × width`, widths 2...7 disable `par_parOnpu_a/b`, and the recovered first Size-over-Lifetime values for widths 1...7 are `0.4882629216, 0.4882629216, 0.5859267712, 0.6114089489, 0.6496245861, 0.6496245861, 0.7005774379` with their paired recovered slopes. A Slide instead always borrows one unsuffixed `effect_TapKeep` from its eight-instance pool, starts it only at the head, and keeps that object identity through width changes and hidden controls. The hierarchy excludes the serialized-inactive `par_parStar`, retains original transforms, modules, sorting order `50`, texture-sheet selection, and additive materials backed by `Tex_parSet_1` / `Tex_parSet_2`. Native `autoRandomSeed=true` does not define a reproducible particle arrangement, so the Web runtime uses a stable per-ribbon seed while preserving the recovered distribution and envelopes; this is not claimed as frame-identical random output.

Seek, restart, and backward movement clear every transient effect first. They do not replay historical one-shots or Directional finger particles. If the target time lies strictly between an admitted ribbon head and tail, only the sustained TapKeep, TouchingFlash, and Slide lane state are reconstructed. At normal playback their phase remains the native elapsed chart time; under the Web slow-play extension it is initialized from chart elapsed time divided by the selected rate and then advances in real playing seconds. Changing rate during an active hold keeps the existing effect clock continuous. Pausing freezes these states without advancing their real-time effect clock.

## Perfect Judgment and Combo

Every admitted AutoPerfect judgment restarts the unpacked JP `judge_perfect` display at screen center `(667,535)` in the fixed `1334×750` stage. The centered widget is `286×78`, its parent scale is `0.8`, and its recovered non-additive animation starts at child scale/alpha `0.8/0.6`, reaches `1.1/1` at `0.04 s`, settles to `1/1` at `0.08 s`, and remains visible until `1.0 s`. The implementation evaluates the recovered Unity Hermite curves rather than linearly interpolating those keys. Pause freezes this effect clock; seek, restart, and backward movement clear the transient label without replaying crossed judgments.

The ordinary Combo and All Perfect Combo are separate overlaid trees at the native RightCenter position `(1101.7,292.2)`. Both use the unpacked `82×116` digit Sprites, inner width `70`, digit-label offset `22`, and the `150×42` unit Sprite at `(-6,72)` in Web screen coordinates. A changed value restarts the recovered scale pop from `0.8` through `1.1` to `1`; the All Perfect overlay additionally applies its recovered `0.833333313 s` opacity loop from `1` to `0.5` and back. The simulator judges every admitted event as Perfect, so All Perfect status remains valid; its display switch defaults on and hides only the overlay, not the ordinary Combo. A time seek rebuilds the Combo value directly at the target without replaying historical pop or judgment animations.

## AutoPerfect Note Sounds

The sound path is independent from the Pixi stage and follows the audio element's media clock, so switching to the full-chart tab does not interrupt it. It loads the unpacked JP files directly under `public/local/chart-simulator/sound/`; no API, manifest, version layer, hash lookup, CN resource branch, or fallback participates. The active contract allows TapSE `skin00...03`, defaults to `skin00`, and fixes DirectionalFlickSE to `skin00` and master volume to `1.0` (100 percent). Switching TapSE changes `perfect.wav`, `flick.wav`, and `SE_RHYTHM_TAP_LONG.wav`; Directional and Skill cues remain their shared verified resources. All four TapSE banks are prepared inside the existing shared `AudioContext`, so a selection change does not create a second media clock.

AutoPerfect maps ordinary accepted judgments to `perfect.wav`, ordinary Flick to `flick.wav`, Directional width 1 to `directional_fl.wav`, width 2 to `directional_fl_2.wav`, and widths 3...7 to `directional_fl_3.wav`; left and right use the same width cue. An accepted Skill head adds `SE_RHYTHM_TAP_SKILL.wav` over the note-type cue. A Long/Slide head starts the skin's looping `SE_RHYTHM_TAP_LONG.wav`; each visible Slide checkpoint emits normal Perfect, hidden checkpoints emit nothing, and the tail emits its normal, Flick, or Directional cue before the loop fades to zero over `0.3000000119 s`. The same base cue at the same chart position is coalesced by the `TapSEStatusData` semantic, while different cues and Skill overlays remain polyphonic. Empty-button, Great/Good/Bad/Miss, clear, full-combo, cut-in, audience, and voice sounds remain disabled.

The simulator uses a dedicated polyphonic Web Audio graph rather than the application's monophonic UI-sound helper. The music media element and Note voices are routed through the same `AudioContext`; a `0.1 s` real-time scheduling horizon registers each Note event at its exact context timestamp and is not an audible timing offset. Under Web slow play, the media-time horizon is multiplied by the selected rate and every future media-time delta is divided by that rate before conversion to an `AudioContext` timestamp. No Note voice receives an `AudioBufferSourceNode.playbackRate`, so one-shots, keep loops, and their fades retain ordinary sound and duration while their start/stop triggers follow the slowed chart. A rate change discards future scheduled voices and rebuilds an active keep loop at its corresponding 1× sample offset. Pause, restart, and time changes likewise discard scheduled voices before re-anchoring the scheduler, and never replay crossed historical one-shots. Restart, fixed jumps, and scrub commits first pause the media and sound graph, wait for the media element's `seeked` commitment, rebuild visual and sound state from the committed media time, and only then resume playback. A superseding time change aborts the older wait, and the delayed `pause` event caused by the simulator's own seek pause cannot turn a resumed transport back into a frozen paused state. A document visibility transition to `hidden` invokes that same exact-media-time pause path before browser animation-frame throttling can separate music from the visual and SE cursors; returning to the visible document remains paused and requires an explicit Play action. If playback resumes or a seek target is inside an admitted Long/Slide, only the persistent keep loop is reconstructed at its corresponding source offset. Unsupported note/ribbon data shares the visual fail-closed decision and cannot emit hidden sound.

The Web range loop adds only a half-open media-time range `[A,B)` above the transport; every wrap still invokes the same seek path. Time input remains exact. Note input uses one-based Combo order and expands complete simultaneous groups: `A` is `0` or the midpoint between the previous distinct-time group and the selected first group, while `B` is the next distinct-time group's judgment time or the song end. A Long/Slide crossing either boundary does not change the range; the existing seek reconstructs its persistent state at the target. To keep the next group from being registered early, the Web Audio scheduling horizon is capped at `B`, and events exactly equal to `B` are excluded.

## Fail-Closed Contract

The compiler preserves the v7 chart contract without using `width` as a Habahiro discriminator: `lane` is the scalar anchor, while `lanes ?? [lane]` is authoritative coverage. Per project policy, any retained `laneChange: true` entity enables multi-range presentation but does not switch skins or play lane-change presentation. Directional `width` admits integers 1...7. Long still requires two same-anchor endpoints and no curve controls; ordinary Slide controls are consumed, while multi-range hidden nodes remain explicit straight-segment endpoints. A Directional terminal never changes the ribbon root or one-lane mesh width. Legacy `multiRangeWidth` remains rejected.

The point-note layer is disabled while the already approved static stage remains visible when any of these other inputs occur:

- non-integer lane, lane outside `0...6`, malformed width, invalid coverage, or a mismatched scalar anchor;
- Directional without left/right direction;
- `charge + skill`;
- unknown kind, direction, or flag; or
- two admitted point Sprites at the same exact hit time and lane, whose equal-order draw behavior is not yet closed.

Mirror is resolved before asset selection: lane `0↔6`, `1↔5`, `2↔4`, lane `3` fixed, and left/right swapped. The stage and atlas are never transformed globally.

## Deferred Work

Deferred items are `cont_force` controls, failure/broken-hold interaction branches, interactive Slide contact motion, every `laneChange` field/judge/background/flash transition, pathological overlapping multi-range sync ownership, non-Perfect judgment labels, non-AutoPerfect sounds, the TapSE volume control, other unverified Note settings, and wide/safe-area layout. Pixel-identical Unity random particles remain out of scope, and `_Threshold` material clipping is not copied from serialized defaults.
