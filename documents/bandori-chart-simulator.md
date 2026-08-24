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

## Supported presentation

The current product contract includes:

- ordinary JP background choices `skin00`, layered `skin02` and `skin03`,
  `practice`, and three fixed team-live judgment/combo/life backgrounds from
  `skin_teamlivefestival`;
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
- large and small Directional effect variants for all five ordinary families
  and the Persona limited overlay;
- automatic Perfect lane flash, judgment, Combo, tap/Flick/Directional/hold
  effects, and on-demand TapSE/Web Audio playback; and
- a complete-chart analysis view that remains separate from native playfield
  presentation.

Anything not listed in the current implementation and tests is disabled.
Interactive failure and broken-hold branches, non-Perfect judgments,
non-AutoPerfect sound routing, fever and dynamic stage transitions, character
carriers, MV/Live2D/3D backgrounds, and unverified settings do not silently
fall back to guessed behavior.

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
