# Bandori Chart Simulator Static Stage Evidence Ledger

## Completion Boundary

The base static stage is complete for the fixed normal-play state. In this document, that means exactly these three visible layers in a `1334×750` reference viewport:

1. the approved JP `skin00/livebg_normal` background content on the native Stage carrier;
2. one of the 15 JP `MasterSkin.skinLaneMap` `bg_line_rhythm` fields; and
3. the selected field skin's paired `game_play_line` judgment line.

This does not mean that every eventually static-looking simulator element is complete. Notes, ribbons, native HUD, `BgCover`, fever content, skill judgment presentation, judgment feedback, and special-mode decorations remain outside this completion boundary.

The browser scales the complete `1334×750` stage uniformly. It does not independently reflow, stretch, or visually tune the three layers.

## Evidence Admission Rules

Values may enter the native-presentation whitelist only when they are supported by one of these evidence classes:

- `confirmed-static`: a JP APK or JP AssetBundle serialized object directly establishes the value;
- `confirmed-static-plus-code`: a serialized value is modified or connected by a traced JP IL2CPP runtime path, and the final result can be derived without visual calibration; or
- `unresolved`: the evidence chain is incomplete. The corresponding capability stays disabled.

The following are not native parameter sources:

- CN resources or CN/JP comparisons;
- Bestdori layout constants;
- screenshots, recordings, or pixel measurements;
- manual offsets, visual tuning, or “close enough” values; and
- an existing generated recipe, behavior report, or extracted web contract unless its claim is independently traced back to JP objects or JP code.

Bestdori remains a product-quality floor and a comparison target. Its parameters cannot override a different JP-native value.

A local visual review is only a smoke test for obvious implementation mistakes. Passing that review does not create new evidence or authorize an unverified parameter.

## Locked Runtime Contract

All coordinates below use a top-left origin in the fixed reference viewport.

| Layer | Rectangle or center | Source asset | State |
|---|---|---|---|
| Stage | `0,0,1334,750` | none | locked |
| Background | `left=-216.2`, `top=-131`, `width=1766.4`, `height=1324.8` | `bgskin/skin00/livebg_normal` | locked |
| Field | `left=87`, `top=5`, `width=1160`, `height=610` | selected `fieldskin/skin00...skin14/bg_line_rhythm` | locked carrier, selectable source |
| Judgment line | center `(667,615.239)`, width `1798.389`; height derived from the selected Sprite rect | paired `fieldskin/skin00...skin14/game_play_line` | locked formula, selectable source |

The fixed composition order is:

```text
liveBG
└─ bg_line_rhythm
   └─ game_play_line
```

The viewport clips every part outside `0..1334 × 0..750`. The stage is never horizontally mirrored. Mirror mode transforms chart lane and direction data only.

## Evidence Ledger

### Reference Viewport and UI Coordinate System

JP APK entry `assets/bin/Data/level3` contains two NGUI `UIRoot` components:

- `UI_Root_Back`: MonoBehaviour pathId `1059`;
- `UI_Root`: MonoBehaviour pathId `1060`;
- `mScalingStyle=Constrained`;
- `manualWidth=1334`;
- `manualHeight=750`;
- `fitWidth=true`;
- `fitHeight=false`; and
- `adjustByDPI=false`.

The JP IL2CPP evidence closes the runtime part:

- `StarUIManager::.cctor`, RVA `0x393F21C`, sets the `1334×750` base values;
- `UIRoot::get_activeHeight`, RVA `0x3087308`, derives the active height from the fixed width; and
- `UIRoot::UpdateScale`, RVA `0x3087B74`, applies the final root scale.

The simulator intentionally fixes this internal viewport and scales it as one browser surface. Native safe-area and high-aspect-ratio mutations are not applied inside the fixed stage.

### Background Carrier and Texture

The Stage prefab is resolved by the JP APK `globalgamemanagers` ResourceManager container entry `prefabs/bms/background/stage` to APK serialized entry `assets/bin/Data/7c743c7e811ed4af2b1f94e02f0c4b63`.

Its relevant hierarchy is:

```text
Stage          GO 157 / Transform 298
└─ TRSRoot     GO 153 / Transform 294
   └─ bgImage  GO 155 / Transform 296
      ├─ UITexture 454
      ├─ ColorFader 455
      └─ BgManager 456
```

The serialized background carrier establishes:

- `bgImage.localPosition=(0,-170,0)`;
- center pivot;
- `UITexture.width=1920` and `height=1440`;
- full UV `(0,0,1,1)`;
- white widget color;
- no anchors;
- `mFixedAspect=false`; and
- no custom material.

The normal-play state is established by:

- `StandardBackgroundModule.<InitBeforeLoadResources>d__18.MoveNext`, RVA `0x3875450`, which instantiates the Stage prefab below the gameplay UI;
- `InGameStageManager::introAnimation`, RVA `0x32E7220`;
- `InGameStageManager::moveStageTRS`, RVA `0x32E7398`; and
- `InGameStageManager::updateStageTransform`, RVA `0x32E6CF4`.

After the intro finishes, `TRSRoot.localPosition=(0,0,0)` and `TRSRoot.localScale=(0.92,0.92,1)`. The initial `0.7` scale, initial y offset, and transition are deliberately excluded from the fixed normal-play stage.

At `1334×750`, the native carrier therefore becomes:

```text
width   = 1920 × 0.92 = 1766.4
height  = 1440 × 0.92 = 1324.8
centerX = 667
centerY = 375 - (-170 × 0.92) = 531.4
left    = -216.2
top     = -131
```

The placement analysis used this JP AssetBundle object:

- bundle `ingameskin/bgskin/habahiro`;
- serialized file `CAB-3a3dfee2b32df3d0ac2c461ce40d5705`;
- `Texture2D liveBG`, pathId `-7262366926435180544`;
- `2048×1024`, bilinear filtering, one mip level; and
- local unpacked path `assets/star/forassetbundle/asneeded/ingameskin/bgskin/habahiro/livebg.png`.

The runtime uses the canonical ordinary-background file `assets/star/forassetbundle/startapp/ingameskin/bgskin/skin00/livebg_normal.png`. Its bytes are identical to the analyzed Habahiro file (SHA-256 `5269DC460FE19B0C8F9B23BEBAC9B4D7691B6288B58A82754AAF720E3B3517C6`), so this source-path cleanup changes neither pixels nor placement. Only a single `skin00` background choice is admitted.

The full 2:1 texture is drawn into the native 4:3 carrier. There is no CSS-style `cover` calculation; final camera viewport clipping produces the visible crop. The normal-play final tint is white with alpha `1`.

### Normal Field

JP APK entry `assets/bin/Data/level3` contains:

- `RhythmGameLines`: UIPanel pathId `1444`;
- `NoteLane`: GameObject pathId `147`;
- `NoteLane` Transform pathId `580`, local position `(0,-240,0)`; and
- `NoteLane` UITexture pathId `1200`, `1160×610`, Bottom pivot, full UV, white color, and no anchors.

Converting the NGUI reference plane to the fixed top-left coordinate system yields the exact field rectangle:

```text
left=87, top=5, width=1160, height=610, bottom=615
```

The active normal field asset is:

- bundle `ingameskin/fieldskin/skin00`;
- serialized file `CAB-0796b45ad7120b116ef51c20b5df5ecd`;
- `Texture2D bg_line_rhythm`, pathId `-1923623216807757824`;
- `1160×610`; and
- local unpacked path `assets/star/forassetbundle/startapp/ingameskin/fieldskin/skin00/bg_line_rhythm.png`.

All 15 master lane skins use the same `NoteLane` carrier. The runtime keeps the carrier at `1160×610`; this includes `skin14`, whose source texture is `1160×608` and is stretched by the native fixed UITexture carrier. The admitted selector follows master ID order exactly:

| IDs | Bundles | Type |
|---|---|---|
| `1...5` | `skin00...skin04` | normal |
| `6...12` | `skin05...skin11` | mission band skins |
| `13` | `skin12` | normal user-facing skin 05 |
| `14` | `skin13` | normal user-facing skin 06 |
| `15` | `skin14` | MyGO!!!!! mission skin |

The selector is user-controlled and does not infer a skin from chart metadata. Its user-approved simulator default is Hello, Happy World! master ID `10` (`skin09`). `Meta.isMultiRangeNotes` propagation and automatic wide-field selection remain deferred.

### Normal Judgment Line

JP APK entry `assets/bin/Data/level3` contains the shared scene nodes:

```text
Button4  GO 55 / Transform 488
├─ judgeLine                   GO 116 / Transform 549 / SpriteRenderer 1054
└─ judgeLineAdjustSkillEffect  GO 64  / Transform 497 / SpriteRenderer 1047
```

The ordinary line evidence is:

- `Button4.localPosition=(0,-3.4500000477,15)`;
- `judgeLine.localPosition=(0,0,0)`;
- `judgeLine.localScale=(0.99,0.99,1)` before screen adaptation;
- center Sprite pivot;
- SpriteRenderer sorting order `20`;
- white serialized color; and
- the Sprite is injected at runtime by the field-skin loader.

The JP IL2CPP chain is:

```text
ButtonManager.ExecAwakeStart
  → execMultiResolution
  → setupGameButtonPosition
  → scale Button4 position by the screen-width coefficient
  → scale judgeLine by the same coefficient

FadeInLineUI
  → load "game_play_line"
  → assign SpriteRenderer.sprite
  → activate judgeLine
  → finish at alpha 1
```

For a viewport `W×H`, a Sprite rect `spriteRectWidth×spriteRectHeight`, and PPU `69`, the confirmed normal-play formula is:

```text
centerX = W / 2
centerY = H / 2 + 0.180089489996874 × W

width  = spriteRectWidth  × 0.99 / (69 × 2 × 9.578571319580078) × W
height = spriteRectHeight × 0.99 / (69 × 2 × 9.578571319580078) × W
```

The selected `skin00` object is:

- bundle `ingameskin/fieldskin/skin00`;
- serialized file `CAB-0796b45ad7120b116ef51c20b5df5ecd`;
- `Sprite game_play_line`, pathId `3141674654239334496`;
- rect `1800×38`, center pivot, PPU `69`; and
- local unpacked path `assets/star/forassetbundle/startapp/ingameskin/fieldskin/skin00/game_play_line.png`.

At `1334×750`, the unrounded result is:

```text
center  = (667, 615.2393796558299)
size    = (1798.3892822082348, 37.965995957729405)
left    = -232.1946411041174
top     = 596.2563816769652
right   = 1566.1946411041174
bottom  = 634.2223776346946
```

The runtime contract rounds only to the precision retained by the stage constants. The line center overlaps the field bottom at `y=615`; it is not positioned with its top edge below the field.

Every admitted `game_play_line` Sprite is `1800` pixels wide, center-pivoted, and PPU `69`. Its height is `38` for `skin00...skin02`, `18` for `skin03`, `40` for `skin04` and `skin13`, and `56` for `skin05...skin12` and `skin14`. The runtime therefore keeps the same center and width formula while deriving height and top from the selected Sprite rect.

### Composition, Filtering, and Clipping

The locked normal-play composition is supported by the following JP settings:

| Content | Carrier | Relevant order |
|---|---|---:|
| `liveBG` | `UI_Root_Back` UIPanel pathId `1439` | render queue `3000` |
| field | `RhythmGameLines` UIPanel pathId `1444` | render queue start `3690`, Renderer order `0` |
| ordinary judgment line | SpriteRenderer pathId `1054` | sorting order `20` |

The background and field use `Unlit/Transparent Colored` with `SrcAlpha / OneMinusSrcAlpha`. The judgment line uses `Sprites/Default` with `One / OneMinusSrcAlpha`, which is the standard premultiplied Sprite path and is not additive. All three use linear/bilinear sampling, white tint, normal alpha, and final viewport clipping.

`BgCover` is transparent after the normal-play transition and is not part of the fixed stage. `StageBack`, `StageFront`, fever content, and effect objects do not alter this three-layer whitelist.

## Current Implementation Mapping

The locked values are implemented in `src/app/[locale]/bandori/songs/[songId]/native-stage-contract.ts`. `NativeSimulatorStage.tsx` loads the three static-stage textures alongside the admitted note resources in one parallel batch and adds the display layers in the locked composition order.

Local development resources are loaded directly from `public/local/chart-simulator/` using their unpacked JP paths. This runtime has no asset API, manifest, region layer, version selector, hash gate, catalog, or fallback. The analysis snapshot identity is evidence provenance only; it does not create a runtime version or hash-management contract.

The runtime-visible URL families are:

- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/bgskin/skin00/livebg_normal.png`;
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/fieldskin/{skin00...skin14}/bg_line_rhythm.png`; and
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/fieldskin/{skin00...skin14}/game_play_line.png`.

## Explicitly Deferred or Disabled

The static-stage completion does not authorize:

- ordinary point-note rendering and motion are not admitted by this static-stage ledger; their later evidence is isolated in the [Native Point-Note Evidence Ledger](bandori-chart-simulator-native-notes.md);
- Long/Slide rendering is not admitted by this static-stage ledger alone; its later evidence and fail-closed boundary are isolated in the [Native Note Evidence Ledger](bandori-chart-simulator-native-notes.md);
- `game_play_line_skill_adjust_effect` display timing or skill-state integration;
- judgment text, hit feedback, tap effects, particles, or sound;
- intro fade/scale/movement or a persistent visible `BgCover`;
- fever background switching;
- Light, practice, versus, team-live, MV, Live2D, or Star3D background branches;
- `Meta.isMultiRangeNotes` propagation or automatic wide-field selection;
- native high-aspect-ratio or safe-area mutations inside the fixed reference stage;
- whole-stage mirroring; or
- any Bestdori-compatible or manually tuned presentation profile.

The skill-adjust judgment line is known to share the ordinary line position and final scale, with sorting order `21`, and its AnimationClip has no position or scale curves. It remains deferred because its trigger state and display lifecycle have not been admitted to the simulator whitelist.

## Change-Control Rule

Any future change to this static-stage contract must include all of the following:

1. the JP APK entry or JP bundle name;
2. the serialized file, Unity type, object name, pathId, and relevant field path;
3. the JP IL2CPP method/call path when runtime code changes the serialized value;
4. a classification of `confirmed-static`, `confirmed-static-plus-code`, or `unresolved`;
5. an explicit user decision before enabling a newly visible presentation capability; and
6. a focused contract test that fails if the admitted value, source path, or layer order drifts.

Conflicting or incomplete evidence fails closed. Visual review may reject an implementation as incorrect, but it may not supply replacement numbers.

## Analysis Inputs

The evidence was derived read-only from:

- JP client `10.1.3` base and arm64 split APKs;
- JP `AssetBundleInfo` data `10.1.0.221`;
- APK serialized entries including `level3`, `globalgamemanagers`, the Stage prefab entry, and shared asset splits;
- JP `ingameskin/bgskin/skin00`, the byte-identical analyzed `ingameskin/bgskin/habahiro` file, and `ingameskin/fieldskin/skin00...skin14` bundles; and
- JP IL2CPP metadata and arm64 code.

The analysis used serialized-object inspection, UnityPy, IL2CPP metadata, ARM64 disassembly, relocation inspection, and deterministic coordinate calculation. It did not use visual calibration.
