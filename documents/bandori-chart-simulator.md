# Bandori Chart Simulator

## Scope

The chart simulator is a development-only song-detail surface at
`/bandori/songs/{songId}`. It renders the complete source chart and an
audio-timed playfield without changing the existing Music API, chart, or audio
contracts.

The simulator uses a fixed `1334 x 750` internal stage and scales that complete
surface uniformly. Music audio owns presentation time. Play, pause, restart,
fixed jumps, scrubbing, slow music playback, mirror, deterministic seek
reconstruction, and range-loop restarts all use the same transport path.

## Documentation ownership

This document and its Chinese counterpart are the canonical contract for the
Web simulator's currently admitted behavior, settings, rendering, and resource
consumption. Related private assets-builder documents have narrower ownership:

- `hhwx-assets-builder/docs/music-charts.md` defines source-chart conversion
  and publication;
- `hhwx-assets-builder/docs/chart-simulator-release.md` defines
  presentation-resource packaging and release; and
- `hhwx-assets-builder/docs/research/chart-simulator/` retains
  reverse-engineering evidence, methods, snapshot identity, and admission
  decisions.

Native evidence belongs in that private archive. This public document records
only the resulting behavior actually implemented and protected by Web tests.

## Supported presentation

The current product contract includes:

- ordinary JP background choices `skin00`, layered `skin02` and `skin03`,
  `practice`, and three fixed team-live judgment/combo/life backgrounds from
  `skin_teamlivefestival`, plus a black Off background;
- all 15 ordinary field and judgment-line styles;
- seven ordinary rhythm-marker/Note styles and five ordinary Directional Flick
  styles;
- ordinary and Habahiro multi-range Point, Skill, Flick, Directional, Long, and
  Slide presentation, including ribbons, curve points, rhythm support,
  simultaneous lines, and mirror behavior;
- selectable Note Speed `1.00...12.00`, with the product default at `10.00`;
- selectable Note Size `10%...200%`; Habahiro charts retain the selected value
  while clamping the effective rendered size to `80%...150%`;
- selectable Note appearance position `0...100`, with an independent option to
  hide the lane field above the same boundary;
- browser-persisted Perfect and Great-only diagnostic timing bands, plus actual
  boundary-offset labels, for standard point presses, Directional presses,
  Long heads and releases, and every authored scoring Slide node;
- large, small, and Off Directional effect choices for all five ordinary
  families and the Persona limited overlay;
- automatic Perfect lane flash, judgment, Combo, tap/Flick/Directional/hold
  effects, with ordinary tap effects independently switchable Off, and
  on-demand TapSE/Web Audio playback; and
- a complete-chart analysis view that remains separate from native playfield
  presentation.

Anything not listed in the current implementation and tests is disabled.
Interactive failure and broken-hold branches, interactive non-Perfect judgments,
non-AutoPerfect sound routing, fever and dynamic stage transitions, character
carriers, MV/Live2D/3D backgrounds, and unverified settings do not silently
fall back to guessed behavior.

## Diagnostic timing windows

The Perfect and Great switches are Off by default. Enabling Great enables
Perfect first when needed but does not lock its switch. Disabling Perfect also
disables Great, while disabling Great leaves Perfect unchanged. The resulting
valid combination is browser-persisted. They render a two-dimensional
time-by-horizontal-touch visualization at the fixed judgment-line height; they
do not add touch input or change the simulator's AutoPerfect behavior. For one
native frame
`F = float32(1 / 60)` seconds, the standard press window is Perfect at
`abs(delta) <= 2.5F`, and the two Great-only sides cover
`2.5F < abs(delta) < 5.5F`.

The browser-persisted maximum-offset-label switch defaults to On. While timing
bands are displayed, it labels the actual outer Perfect and Great boundaries
after horizontal ownership and temporal clipping, using signed frame offsets
with two decimal places. These labels are diagnostic output only.

Long releases use the confirmed `sweetFrame=1` expansion: Perfect covers
`abs(delta) < 3.5F`, while Great-only covers
`3.5F <= abs(delta) <= 6.5F`. This applies to ordinary Long releases and to
Flick or Directional Long tails.

Slide uses a browser-persisted manual frame correction `c` from `+0.0F` through
`+1.0F`, in `0.1F` steps, with `+0.0F` as the default. Its Fast-side Perfect
band is `(2+c)F` for authored heads and plain ends, while an authored middle
scoring node uses only `cF`. A head or plain end has a three-frame Great-only
band from `(5+c)F` through `(2+c)F`; middle nodes have no Great band. Flick and
Directional Slide ends cannot complete early, so their Fast-side length is zero
and they have no Fast Great band. This diagnostic setting deliberately does not
infer the phase from Note Speed, device geometry, or float32 position-table
accumulation. Pitch-preserving slow playback scales these Fast frame offsets
with the visual approach clock.

Every scoring Slide node has only Perfect on the Slow side. For a head or middle
node, its nominal Slow end is the earlier of `T + float32(13 / 60)` seconds and
the chart-position midpoint to the next visible scoring node. The midpoint is
calculated in Beat/`AbsolutePos` space and then converted through the BPM
timeline; it is not the arithmetic mean of the two nodes' seconds. Hidden curve
samples are skipped. A plain or Directional final node has no successor midpoint
and uses the `0.2166666687s` timeout. A Flick final node instead uses
`float32(7 / 60)` seconds. The manual correction affects only Fast.

At the judgment line, every integer button center has a strict collision radius
of `1.168` button spacings. A single-width Note therefore reaches from
`lane - 1.168` to `lane + 1.168`; a contiguous wide Note uses the union of every
covered button's circle. The renderer partitions those fixed circles into
horizontal slabs, combines them with temporal ownership cuts, and outlines each
continuous actual region of the same Note. Perfect and Great keep distinct fill
colors, but their shared edge and other internal rectangle seams are omitted
from that Note-level outline. Disconnected regions and Good/Bad cutouts keep
their own exterior edges. The renderer does not sample screen pixels. Standard
and Long bands show both Fast and Slow sides. Slide also exposes its nominal
Slow Perfect extent while approaching, but the complete band still disappears
with the owning Note's AutoPerfect trigger at `T`, including the render at
exactly `T`.

New-touch ownership follows the native hierarchy. Eligible buttons are checked
from nearest to farthest touch distance. Each button first chooses exactly one
candidate: standard presses minimize Beat/`AbsolutePos` distance, so their
temporal boundary is the Beat midpoint converted through the BPM timeline;
unbound Slide heads minimize current projected distance to the judgment line.
Candidate ownership is gated by native movement activation. Bands are still
rendered only for Notes that have entered the playfield, while a precomputed
per-button index may include a future standard press or Slide head whose
activation falls inside the band's displayed future input-time domain. That
candidate begins competing only at `T - arrivalSeconds`, where the arrival
duration uses the current Note Speed and approach-time scale. Each frame uses
binary time-range queries to include only candidates that can activate before
the displayed domain ends; a later candidate cannot crop an earlier band.
The cross-type comparison also uses projected distance, fixes native
`JudgementAdjustValueB` at `0`, and gives an exact tie to the standard candidate.
Only then is the chosen candidate classified. A non-triggerable winner lets the
next eligible button be checked, while a triggerable Good or Bad winner owns the
touch without drawing a band and therefore creates a visible blank cutout over
a farther button's Perfect or Great region. Standard acquisition remains
`abs(delta) < 7.5F`; Slide-head acquisition covers Fast through Bad plus its
Slow timeout or midpoint cutoff. When an earlier Note is AutoPerfected and
removed, a later Note regains its still-future actual region on the next render
frame.

Long releases and already-bound Slide middle or tail nodes do not re-enter this
new-touch priority search. Their circle-union regions remain independent and may
overlap. Bound Slide nodes still remain sequential: each diagnostic range starts
no earlier than the authored time of the previous visible scoring node on the
same Slide. This AutoPerfect-only lower bound represents the previous node
completing at its authored time; hidden geometry samples do not create a bound.
Every Slide region stays at the authored scoring node's own covered buttons and
does not interpolate along the ribbon. Hidden geometry samples never receive
their own region. Mirroring maps the horizontal regions normally; the bands are
not hidden by the Sudden mask.

This AutoPerfect-only simulator uses the Slide timeout and midpoint only to bound
the diagnostic Slow Perfect band. It does not execute a Miss transition or model
touch or finger state, tail re-entry, swipe distance or direction, release
failure, or gesture completion. The modeled adjacent-lane collision and
new-touch priority affect only these diagnostic regions, not playback. The
open/closed status
of a mathematical interval endpoint is retained by the classification formulas,
but its zero-width point is not rendered as a separate pixel band. Same-button,
exact-time duplicate standard presses are invalid chart input and receive no
simulator-specific tie behavior.

## Pitch-preserving slow playback

Playback selects its audio path automatically. Exactly `1.00x` uses the native
`AudioBufferSourceNode` path for deterministic seek and scheduling. Rates below
`1.00x` use Signalsmith Stretch to preserve pitch; there is no manual backend
selector. A Signalsmith initialization or processing failure pauses transport
and surfaces an explicit error instead of silently falling back to native
pitch-shifting playback. The first slow-play activation may briefly show a
preparing state while the module and whole-song PCM copy become ready.

Range looping deliberately does not promise a gapless or sample-exact boundary.
When the presentation clock reaches the range end, the simulator uses the same
serialized seek handoff as a manual jump: already queued output finishes, the
chart follows that tail and then holds at the range start, and music plus Note SE
restart from one new mapping. Buffered or Bluetooth outputs and Signalsmith
preparation can therefore add a short pause at each boundary, but each iteration
re-synchronizes instead of accumulating drift.

All music, chart, and Note-SE scheduling uses one generation-scoped mapping:

```text
mediaTime = M0 + max(0, outputContextTime - C0) * playbackRate
```

The chart remains frozen at `M0` before the future output anchor `C0`. Both
active paths read `AudioContext.getOutputTimestamp()` when available so the
visible clock follows the context time reaching the output device. Pause, seek,
and rate rebuilds separately retain the later render cursor based on
`AudioContext.currentTime`, preventing already-rendered device audio from being
replayed. Note SE keeps exact scheduling coordinates in the same AudioContext,
and its look-ahead includes the observed or reported output-device render lead,
including on the native path.

Signalsmith receives a copied whole-song PCM buffer, reports its processing
latency, and accepts explicit input/output/rate schedule points. The adapter
loads the exact `1.3.2` module from a versioned same-origin immutable URL instead
of relying on its runtime-generated Blob bootstrap, and supplies the documented
future `output` anchor. Buffer mode keeps the Worklet's single
input slot unconnected (an empty channel array in Chrome) so version 1.3.2 reads
the PCM supplied through `addBuffers()`. A generation submits only its active
segment; pause, seek, and natural end submit the inactive FIFO fence, because
pre-scheduling that fence would make version 1.3.2 advance its time map early.
DSP initialization, PCM transfer, and schedule RPC use a bounded 10-second wait
so a failed Worklet becomes an explicit error instead of leaving transport
stuck in a preparing state. The prepared Signalsmith node is connected only
for active slow playback and disconnected when stopping or returning to
`1.00x`, while the decoded PCM and prepared node may remain cached for reuse.
Before that node can be reconnected, the runtime waits for the inactive FIFO
fence to be acknowledged; a failed or timed-out fence discards the node instead
of allowing an earlier generation's time map to leak into the next start.
A generation-aware `processorerror` freezes transport and discards the failed
node before a later retry. Every seek or rate change captures one render
cutoff, but the old presentation mapping remains active until that cutoff has
actually reached the output device. Only the latest requested generation may
then start; Signalsmith preparation can run while the old output tail drains.
The presentation clock follows the old tail, holds during any deliberate DSP
startup gap, and finally advances on the new mapping. This serialized handoff
prevents rapid switches from building multiple unheard generations and keeps
native/Signalsmith transitions aligned on high-latency outputs such as
Bluetooth devices.

## Resource delivery

Presentation resources come only from the official JP resource set. The Web
application must not add a CN presentation pack, cross-region fallback,
Bestdori fallback, or local-file fallback.

The browser loads:

```text
bandori/chart-simulator/index.json
bandori/chart-simulator/manifests/{manifestSha256}.json
bandori/chart-simulator/packs/{packTreeHash}/{logicalPath}
```

The mutable index contains exactly `schemaVersion`, `updatedAt`, and the total
manifest SHA-256. The immutable manifest contains exactly its schema and a
`game bundle key -> pack tree hash` map. PNG, WAV, and JSON members retain their
logical path and exact bytes; there is no ZIP layer, public per-file checksum
catalog, region selector, or runtime extraction.

Paths beginning with `/local/chart-simulator/` are logical resource identities
resolved through the pinned CDN manifest. They are not files served from the
Web repository. The renderer loads only the packs and members needed by the
current background, lane, Note, Directional, effect, limited-overlay, and TapSE
selections. Missing or invalid index, manifest, pack, or member data fails
explicitly.

Decoded Pixi textures are owned by resolved immutable URL. Shared stage
instances use reference-counted leases; after the final lease is released, a
texture remains warm for 15 seconds and is then removed from the Pixi cache and
unloaded from decoded/GPU memory. A replacement stage that reacquires the same
URL cancels the pending release, and unloads for one URL are serialized so an
older stage cannot destroy a replacement stage's resource. Leaving the
simulator accelerates every zero-reference release. This lifecycle does not
delete the browser HTTP cache, so immutable pack objects may still be served
from memory or disk cache and are decoded and uploaded again only when selected
later.

The Web Audio runtime retains only the selected TapSE cue bank after a skin
change. Once old Note SE sources are stopped, other decoded `AudioBuffer` banks
and their URL-promise references are dropped; selecting them again reuses the
normal HTTP cache before decoding. The current song buffer and an optional
prepared Signalsmith PCM copy remain warm until the simulator audio runtime is
disposed.

## Ordinary and limited controls

Background, lane/judgment line, rhythm marker/Note, Directional Flick, tap
effect, and TapSE remain independently selectable ordinary controls. Habahiro
is not another skin control: a chart-level `laneChange=true` marker enables its
multi-range presentation, after which each Note or ribbon point uses its own
compiled coverage. When a point declares `lanes`, that contiguous range is the
complete position contract: the compiler does not read its legacy scalar
`lane`, and derives both the visual center and native integer button from the
range. A Long or Slide may move its contiguous range, but its range width
remains fixed for the complete hold.

The BGM and SE volume sliders, their mute states, and every effect and skin
control are stored together as one browser-local preference. Only validated
primitive values and skin IDs are persisted; unavailable or stale choices fall
back independently to current defaults. Loop enablement and loop ranges remain
per-song session state.

Limited performance skins are a separate sparse overlay. Selecting one retains
the ordinary choices and overrides only the slots owned by that family.
Clearing it restores the retained ordinary choices immediately.

The current selector contains exactly 20 overlays, ordered by first JP
availability:

```text
april2018, persona, miku, april2019, cafe, maid, gbp2020, coin, witch,
april2021, stage, delta, 5th, bike, satan, collabo23_summer_g,
collabo23_winter_d, april2024, collabo24_autumn_i, collabo25_autumn_s
```

April 2018 owns only Note and sound slots, so 19 of the 20 overlays provide a
background. `practice` and the three `skin_teamlivefestival` choices are
ordinary backgrounds, not limited overlays.

Hololive Part 2 uses its new `skin_collabo23_winter_d` background and reuses
Delta's lane, Note, tap-effect, and TapSE contracts. Miku, Cafe, Coin, and Witch
have no second long-belt texture; their curved Slide belts reuse the family's
sole `longNoteLine`. Delta, Maid, and Stage use their authored second belt.

## Fidelity boundary

Asset identity, logical paths, sparse ownership, Sprite metadata, stage and Note
geometry, event routing, and deterministic transport are exact product
contracts. Browser particles and audio preserve admitted source parameters but
remain bounded approximations of Unity random evaluation, custom shaders, and
CRI voice-limit behavior. The Witch mesh, CustomData U-scroll, and orbital
profiles are included only within their explicit allowlists. Persona's animated
Flick beam preserves its authored lifetime and spawn placement with the approved
`4.0` upward-travel multiplier.

Unknown recipe fields, shapes, meshes, shaders, curves, sound routes, or missing
resources fail closed. Visual review can identify an implementation error, but
replacement native constants require separately verified evidence.

## Architecture and verification

- `src/lib/bandori/chart-simulator/` owns pure compilation, transport,
  presentation calculations, effects, sound, pitch-preserving time-stretch
  adapters, and the CDN manifest resolver.
- `src/app/[locale]/bandori/songs/[songId]/` owns the development route,
  controls, fixed Pixi stage, and renderer lifecycle.
- The private assets-builder owns reviewed projection publication and the
  reverse-engineering evidence archive. The public Web repository contains only
  product behavior and delivery contracts.

Run the focused checks with:

```bash
npm run test:bandori-chart-simulator
npm run typecheck
npm run i18n:check
```

An optional prepared-projection audit can set
`HHWX_CHART_SIMULATOR_PROJECTION_ROOT` to an explicit temporary projection
directory before running the simulator tests. Normal development and tests do
not require a physical `public/local/chart-simulator` tree.
