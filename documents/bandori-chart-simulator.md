# Bandori Chart Simulator

## Scope

The chart simulator is a development-only song-detail surface at
`/bandori/songs/{songId}`. It renders the complete source chart and an
audio-timed playfield without changing the existing Music API, chart, or audio
contracts.

The simulator uses a fixed `1334 x 750` internal stage and scales that complete
surface uniformly. Music audio owns presentation time. Play, pause, restart,
fixed jumps, scrubbing, slow music playback, exact time loops, Note-range loops,
mirror, and deterministic seek reconstruction all use the same transport path.

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
compiled coverage.

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
  presentation calculations, effects, sound, and the CDN manifest resolver.
- `src/app/[locale]/bandori/songs/[songId]/` owns the development route,
  controls, fixed Pixi stage, and renderer lifecycle.
- The private assets-builder owns reviewed projection publication and the
  reverse-engineering evidence archive. The public Web repository contains only
  product behavior and delivery contracts.

Run the focused checks with:

```bash
npm run test:bandori-chart-simulator
npm run typecheck
```

An optional prepared-projection audit can set
`HHWX_CHART_SIMULATOR_PROJECTION_ROOT` to an explicit temporary projection
directory before running the simulator tests. Normal development and tests do
not require a physical `public/local/chart-simulator` tree.
