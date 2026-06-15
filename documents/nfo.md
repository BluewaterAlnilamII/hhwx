# Neo Fantasy Online (NFO) offline replica notes

## Current scope

The current target is no longer a long-term NFO mirror. The short-term target is:

- freeze one CN resource snapshot locally;
- keep binary UnityFS bundles out of git;
- inspect the frozen bundles into JSON inventory and typetree artifacts;
- build an offline playable browser NFO replica from the CN snapshot and CN
  IL2CPP dump;
- use JP artifacts only as a fallback when the CN dump or CN resources are incomplete.

This document is intentionally CN-first. The captured flow filename starts with
`en_flows`, but the traffic is from the current CN redroid client.

## Long-term goal and acceptance criteria

Long-term goal: turn the frozen CN NFO snapshot into an independently
deployable, offline-playable browser replica whose gameplay behavior is
explicitly bounded by local data, local tests, and documented parity gaps.
The target is a durable local prototype, not a tracker-managed mirror and not
an always-current clone of the live NFO service. It is also not planned as a
Unity packaging target in this phase: Unity data and IL2CPP evidence define the
behavior contract, while the playable runtime stays in the browser stack. A
future Unity package would be a separate port using these frozen data contracts
and parity tests as its migration spec.

Completion path:

1. Freeze and normalize one CN runtime snapshot so the page and API can be
   rebuilt from local files only.
2. Keep the browser runtime playable end to end: character, level, weapon and
   equip selection; movement; spawning; weapon and active-skill combat; drops;
   run-time leveling; clear/fail settlement; progression; and local save.
3. Expand behavior parity from data-driven systems first: weapon fire cycles,
   `BulletShooterData`, bullet components, hit targets, buffs, minions, map
   boundaries, pickups, and settlement rules before per-`Weapon_XX` custom
   subclasses.
4. Lock each recovered native behavior with focused pure simulation tests or
   CN snapshot-derived parity fixtures. Any approximation must remain visible
   in this document.
5. Prove independent deployment with a production build, local-runtime API
   smoke, `/bandori/nfo` page smoke, and no network dependency for gameplay
   payloads.

Acceptance criteria:

- The frozen CN snapshot is the source of truth for the shipped prototype; JP
  artifacts may only be used as documented fallbacks.
- A fresh checkout with the local ignored snapshot can regenerate runtime data
  and serve `/api/bandori/nfo/local-runtime` without calling the live NFO CDN or
  live NFO gameplay APIs.
- `/bandori/nfo` is playable offline after the local runtime data is present:
  the player can start a run, fight, collect drops, level the selected weapon,
  trigger active skill behavior, clear or fail, and persist local progression.
- Weapon behavior includes data-driven selected-weapon fire, weapon-level
  shooters, run-time weapon leveling, self buffs, minion weapons, collision,
  target type, force, hit-buff, counter/shield, and bullet-rotation behavior at
  the documented first-pass parity level.
- Active skill behavior includes charge, timeline execution, add-buff events,
  minion spawn events, assigned minion weapons, and bullet-shooter events at
  the documented first-pass parity level.
- Map, pickup, save, progression, and settlement behavior have enough parity
  coverage for repeated local play sessions, even where native animation,
  fixed-point math, or visual assets remain approximate.
- Every newly simulated native behavior has either `npm run test:nfo` coverage
  or `npm run test:nfo:parity` CN fixture coverage.
- Before calling a milestone complete, these checks pass without new errors:
  `npm run test:nfo`, `npm run test:nfo:parity`, `npm run typecheck`,
  `npm run lint`, and `npm run build`.
- The final milestone includes smoke evidence for the production page and
  local-runtime API, plus this document's completed/pending boundaries updated
  to match the implementation.

## Source evidence

Captured flow:

```text
D:\Workspace\temp\en_flows_20260614_184805.mitm
```

CN IL2CPP dump:

```text
D:\Workspace\temp\dump.cs
```

NFO resources are under a dedicated CDN prefix, not the ordinary
`assetbundle/{dataVersion}/Android/...` path:

```text
https://l4-prod-patch-bd.bilibiligame.net/assetbundle/nfo/Android/
```

The observed client flow is:

```text
POST https://l3-prod-all-bd.bilibiligame.net/api/user/{uid}/nfo/load
GET  https://l4-prod-patch-bd.bilibiligame.net/assetbundle/nfo/Android/Android-2.1.1
HEAD https://l4-prod-patch-bd.bilibiligame.net/assetbundle/nfo/Android/nfo/...
GET  https://l4-prod-patch-bd.bilibiligame.net/assetbundle/nfo/Android/nfo/...
```

The NFO load/save API shapes are recoverable from the CN dump. The dump includes
NFO gameplay/runtime classes such as `NFOController`, `NFOLoadAPI`,
`NFOSaveAPI`, `NFORewardResponse`, `GameManager`, `GameWorldManager`,
`MapManager`, `MasterDataManager`, `SaveDataManager`, and `TaskDataManager`.

## Local freeze

The local snapshot is written under the ignored `temp/` directory:

```text
temp/nfo-offline/cn/Android-2.1.1/
```

Run:

```bash
node scripts/nfo-freeze-local.mjs
```

This creates:

```text
temp/nfo-offline/cn/Android-2.1.1/raw/Android-2.1.1
temp/nfo-offline/cn/Android-2.1.1/raw/nfo/...
temp/nfo-offline/cn/Android-2.1.1/snapshot-manifest.json
temp/nfo-offline/cn/Android-2.1.1/source-urls.txt
```

`snapshot-manifest.json` records `sourceUrl`, local `rawPath`, `size`,
`sha256`, `contentType`, and the freeze timestamp for each file. It also marks
`longTermMirror: false` so this snapshot is not confused with a tracker-managed
mirror.

## Frozen resource list

The first CN snapshot uses these 20 observed resources:

| Type | Path |
| --- | --- |
| manifest | `Android-2.1.1` |
| BGM | `nfo/audio/bgm/bgm_01_852c024c8a7cc0618e3cc26ea3936520` |
| BGM | `nfo/audio/bgm/bgm_02_0222fc9403fef7c08e36a94ee0457919` |
| BGM | `nfo/audio/bgm/bgm_03_5b339cb1f550fe6ee111e1d294a2ad6d` |
| BGM | `nfo/audio/bgm/bgm_04_257ff9f928f9a1bd9531629224fd996a` |
| BGM | `nfo/audio/bgm/bgm_05_ca0a8eefa02b2b0effa9fcb557a26a7e` |
| BGM | `nfo/audio/bgm/bgm_06_b99fb006c83b87b99c096cdaa597dc17` |
| BGM | `nfo/audio/bgm/bgm_07_13990e117666fd5143a918950e9bb133` |
| BGM | `nfo/audio/bgm/bgm_08_29d6dc8ccfc2795a26229e2b41be6f81` |
| BGM | `nfo/audio/bgm/bgm_09_367304877d9656d781319e80779f1200` |
| BGM | `nfo/audio/bgm/bgm_10_68109c3afb63fc953c8c3a5f0698f350` |
| audio | `nfo/audio/se_4a34ecc64a854e628175f8b751fbe3cf` |
| audio | `nfo/audio/voice_f58a69c9257f33c28ac01746332d75dd` |
| data | `nfo/buff_b2feb356d7f0cd75b28ad802cecb34b3` |
| data | `nfo/bullet_16d650ee9e094bef9169beac4ecd1a87` |
| data | `nfo/chara_59a2f633865e30adc9dc333aef96ded1` |
| data | `nfo/data_0ff80651a7dbc235eb52ab440a58a76a` |
| data | `nfo/items_d8154a2088813a0bd6a55aa887ef9150` |
| data | `nfo/map_54f658fb0992cb00d073e4a5744ea4db` |
| data | `nfo/uiefx_6dc3725070368ee67dd7d7448b143e65` |

## Bundle inspection

After freezing resources, run:

```bash
python scripts/nfo-inspect-unity-bundles.py
```

This writes:

```text
temp/nfo-offline/cn/Android-2.1.1/inventory/objects.json
temp/nfo-offline/cn/Android-2.1.1/inventory/typetrees/...
```

The inventory is the first stable boundary for the playable replica. Raw UnityFS
bundles stay local; generated JSON can be promoted into a smaller runtime data
format once the fields needed by the simulation are identified.

Then export the master-data subset needed by the offline runtime:

```bash
npm run nfo:runtime-data
```

This writes:

```text
temp/nfo-offline/cn/Android-2.1.1/runtime-data/master-data.json
public/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json
```

The `temp/` copy remains the local frozen-source derivative. The `public/res/`
copy is the deployable runtime artifact consumed by the Next.js route; it keeps
the same frozen CN data without turning the raw UnityFS bundles into a long-term
mirror. The exported JSON preserves the CN Unity field names and values so that
gameplay logic can be compared back to `D:\Workspace\temp\dump.cs` without an
extra renaming layer. Any browser-facing DTO can be mapped later after the
simulation surface is stable.

## Offline playable replica architecture

Use a 2D browser-game architecture. Phaser is the preferred renderer for a
standalone prototype, with gameplay state owned by TypeScript systems outside
Phaser scenes. If this is later embedded in `hhwx`, React should own shell and
HUD surfaces while Phaser owns only the playfield.

Runtime boundaries:

- `scripts/nfo-freeze-local.mjs` owns one-time CN resource capture.
- `scripts/nfo-inspect-unity-bundles.py` owns raw UnityFS inventory and
  typetree extraction.
- `scripts/nfo-export-runtime-data.py` owns master-data JSON export. It writes
  both the ignored `temp/` derivative and the deployable
  `public/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json`
  artifact. It also exports a compact `mapPrefabs` summary from the frozen
  Unity prefabs: tile layer count, tile count, and aggregate tile bounds.
- `src/lib/bandori-nfo-local-snapshot-server.ts` maps the deployable JSON
  artifact into browser-facing DTOs, falling back to the ignored local `temp/`
  derivative during development if the deployable artifact has not been
  generated yet.
- `src/lib/nfo-offline-runtime.ts` defines the DTO contract.
- `src/lib/nfo-offline-sim.ts` owns movement, spawning, selected-weapon fire
  behavior, active skill charge/timeline buff application, active-skill bullet
  shooters, first-pass enemy/minion AI timeline events and AIState entry buffs,
  selected-equip stat application, bullets, collision,
  terrain-pit blocking, global-upgrade stat application, drops, timers, and
  clear/fail state.
- `src/lib/nfo-offline-save.ts` owns browser-local save serialization.
- `src/app/[locale]/bandori/nfo/NfoOfflinePrototype.tsx` owns React controls,
  DOM HUD, and the thin Phaser render adapter.

## Implementation roadmap

| Phase | Status | Deliverable | Boundary |
| --- | --- | --- | --- |
| CN local freeze | done | 20-file `Android-2.1.1` snapshot under ignored `temp/` | No scheduled refresh and no object-storage upload |
| Bundle inventory | done | `objects.json` and typetrees for the frozen UnityFS bundles | Raw bundles remain local-only |
| Runtime master data | done | `master-data.json` with characters, enemies, enemy AI, weapons, equips, buffs, active skills, bullet shooters, bullets, levels, maps, drops, items, `GameDefaultData.globalDifficutyControlData`, map prefab bounds, level clear major/minor enemy event IDs, level clear unlock rewards, and related tables; deployable copy lives under `public/res/bandori/nfo/cn/Android-2.1.1/runtime-data/` | Preserve CN Unity field names in exported JSON where the source is a master-data table; raw UnityFS bundles remain local-only |
| Browser DTO API | in progress | `/api/bandori/nfo/local-runtime` reads the deployable frozen runtime artifact and returns typed DTOs | Server route has a `temp/` fallback for local regeneration, but deploy/smoke should use the `public/res` artifact |
| Minimal play loop | in progress | Phaser playfield with movement, camera, enemy spawning, first-pass enemy AI fire, selected-weapon auto fire, bullets, collision, drops, EXP/upgrade/heal/coin/bomb/magnet pickup handling, timer, and clear/fail state | Simulation state stays outside Phaser |
| Offline save | in progress | Local `NFOSaveData`-like state in `localStorage`: character/level/weapon selection, cleared levels, unlocked characters/levels/weapons/equips, run count, defeated enemies, upgrade coin, paid global upgrades, and default unlock lists | Save only serializable game state, not renderer objects |
| Progression parity | in progress | Recreate global upgrades, unlocks, equips, weapons, and mission rewards from CN data/dump | Current slice supports global upgrade purchase, character/weapon/equip unlock gates, selected-weapon/equip runs, level-1 equip modifiers, natural clear coin rewards, `clearEnemyEventID` final-boss plus `levelClearMinorEnemyEventIDs` clear rewards, and `LevelData` clear unlock reward arrays; server reward APIs become local events |
| Weapon behavior parity | in progress | Recreate data-driven weapon fire cycles before attempting per-weapon subclass behavior | Current slice simulates every `fireBullets` entry on the selected weapon level, maps `WeaponLevelData.BulletShooterID`, `MinionCount`, and usable `spawnMinionData` into the runtime DTO, and honors run-time weapon leveling from EXP and level-up items, including CN weapon `31` switching from shooter `311` to `312` after a level-up pickup and CN weapon `32` switching an existing summoned minion from AI `110` / shooter `15000` to AI `111` / shooter `15001`, weapon-level attribute changes, self buffs, first-pass shield/counter contact buffs such as CN weapon `23` / buff `5` and weapon `25` / buff `6` / bullet `27`, first-pass stealth self-buff attribute modifiers and buff-level fire bullets such as CN weapon `29` / buff `8` / bullet `15`, first-pass minion weapons including CN weapon `16` / minion `2` / bullet `22`, CN weapon `19` / minion `6` / bullet `29`, CN weapon `22` / minion `3` / zero-speed ray bullet `33`, CN weapon `26` / minion `4` / bullet `34`, minion AI state shooters, AI timeline `FireAllWeaponNow`-gated minion weapon fire, group timing including CN weapon `20` / `GroupCount = 4` / `FireGroupCD = 5`, damage judge delay/CD, once-per-enemy vs multi-hit rules, target-driven upgraded fireball fan behavior for CN weapon `1` / bullet `11`, player-only moving multi-bullet direct weapons including CN weapon `2` / bullet `2`, weapon `5` / bullet `5`, weapon `6` / bullet `16`, and weapon `9` / bullet `14` with player-facing targetless base direction, first-pass weapon `5` / `暗夜法球` homing, first-pass weapon `6` / `守护之歌` player orbit, target-driven zero-speed ray behavior for CN weapon `3` / bullet `3` requiring an enemy target, target-driven long-lifetime projectile behavior for CN weapon `7` / bullet `17`, target-driven dual direct bullets for CN weapon `8` / bullet `15` without artificial entry-angle spread, zero-speed self-centered direct fields such as weapon `4` / bullet `4` and weapon `10` / bullets `13` and `12`, `DamageJudgeType = None` force-only overlap behavior for weapon `11` / bullet `6`, CN weapon `11` cardinal force bullets `7` through `10`, CN weapon `12` owner-forward ray bullet `19`, CN weapon `13` owner-forward rect bullet `20`, CN weapon `14` targetless owner-forward ray bullet `18`, CN weapon `15` targetless freeze field bullet `21`, CN weapon `17` targetless stun field bullet `23`, CN weapon `18` direct DOT bullet `28`, CN weapon `21` direct black-hole inward force bullet `31`, CN weapon `24` targetless instant/delayed field bullets `25` and `26`, CN weapon `27` direct friendly buff bullet `32`, CN weapon `28` direct DOT bullet `5` plus shooter `2`, CN weapon `28` shooter `2` frame-30 all-direction radial bullet `24`, CN weapon `30` and weapon `33` targeted zero-speed direct field bullet `60` alongside shooter timelines, CN weapon `30` shooter `301` same-frame main bullet `60` plus buff bullet `99`, CN weapon `30` shooter `301` and weapon `33` shooter `321` loop interval/lifetime behavior, CN weapon `31` shooter `311` formation-type-3 owner-facing offset, CN weapon `33` shooter `321` enemy slow movement plus friendly buff bullets, `BulletShooterData.BehaviorType = 1` owner-position following, `IsFollowOwnerDirection` owner-facing sync, CN AI `44` hostile ray segment damage for bullet `99`, basic collider shapes, bullet component rotate types, enemy vs friendly hit targets, first-pass allied-minion friendly hit buffs, weapon-shooter friendly hit buffs such as weapon `30` / shooter `301` / buff `109`, weapon-shooter direction-offset behavior such as weapon `28` / shooter `2`, bullet force fields, hit buffs, first-pass taunt hit-buff source targeting, player-side and hostile on-destroy event bullets, bullet boundaries, and equip-driven bullet modifiers; exact `Weapon_XX` custom logic, exact native homing turn rate, exact orbit radius/angle speed, deeper native stealth/taunt semantics, native moving direct-fire formation/angle semantics, and remaining native shooter formation/direction details remain pending |
| Active skill parity | in progress | Recreate character active skill charge and timeline effects from CN `activeSkillData` and `BulletShooterData` | Current slice maps skill levels and timeline events, exposes an active skill input, applies `AddBuffDatas` to player-side targets including first-pass `TargetType = 1` buffs on existing minions, spawns first-pass minion entities from `SpawnMinionData`, handles first-pass ring summon formation, lets active-skill minions fire assigned `WeaponID` bullets, spawns first-pass active-skill bullet shooters from `BulletShooterID`, covers the active-skill shooter direction values observed in CN data (`0`, `1`, `2`, `3`), locks first-pass `SpawnPos = 3` nearest-enemy shooter placement, locks CN shooter `6000` loop interval and lifetime behavior, covers active skill `13` / shooter `13000` four-fireball fan spread plus zero-speed snow-field bullet, and now locks that shooter as `LifeTime = 60` with non-looping snow-field bullet `21` plus looping fireball bullet `11` at `LoopFrameInterval = 15`, covers active skill `14` frame-1 stun field shooter `3000` plus frame-90 delayed damage shooter `3001`, covers active skill `16` / shooter `9000` delayed DokiDoki stun field, covers active skill `114` / shooter `1001` as a non-following static damage field with `BehaviorType = 0` and `IsFollowOwnerDirection = 0`, covers active skill `116` / shooter `10000` owner-forward star-map field plus EXP/coin pickup-gain buffs, covers active skill `117` / shooter `11000` friendly invincible hit buff `108`, locks active skill `111` formation-2 summon into minion AI state transition shooter `14001`, locks active skill `112` same-event shooter `7000` frame `1`/`3`/`7` bullets plus minion `8` and first-pass minion AI shooter `7003` including its direction-`0` zero-offset fallback, locks active skill `112` level-3 same-frame summon group with AI `205`/`206`/`207` and minion AI shooters `7004`/`7005` including their `LoopFrameInterval = 7` zero-offset bullets `69`/`70`, locks first-pass `AIStateType = 22` minion orbit for active skill `113` / AI `201` and the active skill `112` floating cannon AI states `205`/`206`/`207`, covers large multi-bullet radial spread, and supports first-pass heal-percent, invincible, and single-player revive buffs; full-screen effects, same-frame summon buff targeting, remaining native shooter formation/direction behavior, deeper native summon formation/AI beyond the covered first-pass AI shooter chains, exact native state-22 class naming/constants, native ally revive targeting, and broader ally targeting beyond player-plus-minion overlap remain pending |
| Map and collision parity | in progress | Use CN level map prefabs for world bounds and `MapData.terrainPits` for first-pass pit blocking/rendering | CN enabled terrain prefabs `Map_09` through `Map_15` are now locked by parity fixtures: prefab bounds, Terrain layer tile count, pit count, first pit sample, player/enemy non-flying pit blocking, player/enemy flying bypass, and enemy/minion world-boundary clamps; keep gameplay collision separate from rendered tile/prefab assets and do not treat visual Tile collider flags as walls without more evidence |
| Asset conversion | later | Convert sprites, atlases, tilemaps, UI prefabs, BGM, SE, and voice into browser-friendly assets | Do after gameplay data path is stable |
| Parity harness | in progress | Scripted comparisons against CN dump-derived rules and retained fixture runs | Current slice has focused local settlement tests plus a CN snapshot-derived active-shooter, active-shooter loop/lifetime, weapon-level-shooter, weapon level-up shooter switching for CN weapon `31` shooter `311` -> `312`, weapon level-up spawn-minion AI switching for CN weapon `32` AI `110` -> `111` / shooter `15000` -> `15001`, weapon-shooter formation-type-3 owner-facing offset, weapon-shooter direction-offset, weapon-shooter all-direction radial event, weapon `30` friendly hit-buff shooter including same-frame shooter-main bullet `60`, allied-minion overlap, and shooter `301` loop/lifetime, weapon `33` enemy-slow plus friendly-buff shooter including shooter `321` loop/lifetime, weapon `33` shooter `321` `BehaviorType = 1` owner-position follow and `IsFollowOwnerDirection` owner-facing sync, weapon `1` level-2 targeted two-shot fireball fan, weapon `2`, `5`, `6`, and `9` targetless moving multi-bullet cases with player-facing targetless direction, weapon `5` Dark Orb homing, weapon `6` Guardian Song player orbit, weapon `3` targeted ray requiring an enemy target, weapon `7` targeted long-lifetime projectile, weapon `8` dual direct bullets sharing the target direction, weapon `4` targetless melee-field case, weapon `10` targetless self-centered direct-field case, weapon `11` direct-fire `DamageJudgeType = None` force case, weapon `11` cardinal force direction cases, weapon `12` owner-forward ray case, weapon `13` owner-forward rect case, weapon `14` targetless owner-forward ray and hit-buff case, weapon `15` targetless freeze field case, weapon `17` targetless stun field case, weapon `18` direct DOT hit-buff case, weapon `20` four-group field timing case, weapon `21` black-hole inward force case, weapon `23` shield self-buff contact-charge case, weapon `24` Iai instant/delayed field case, weapon `25` counter self-buff bullet case, weapon `27` direct friendly buff case, weapon `28` direct DOT plus shooter case, weapon `30` and weapon `33` targeted direct field bullet `60` plus shooter timeline cases, weapon `29` stealth self-buff attribute and buff-level bullet case, weapon `16` basic summon minion firing bullet `22`, weapon `19` fairy minion firing bullet `29`, weapon `22` offensive turret `MinionCount = 2` zero-speed ray bullet `33`, weapon `26` Leo AI-gated minion firing bullet `34`, weapon-level-minion-count, weapon-level-spawn-minion, weapon `32` taunt hit-buff source targeting, shooter `4000` player-side on-destroy event bullet, shooter `2002` hostile on-destroy event bullet, active-skill shooter `SpawnPos = 3`, active-skill `13` fan-spread shooter plus non-looping snow field and `LoopFrameInterval = 15` fireball repeat, active-skill `14` frame-1 stun field and frame-90 delayed damage shooter, active-skill `16` delayed stun-field hit buff, active-skill `114` non-following static damage field shooter `1001`, active-skill `116` owner-forward star-map field plus EXP/coin pickup-gain buffs, active-skill `15` `TargetType = 1` existing-minion buffing, active-skill shooter friendly hit-buff `108`, active-skill `111` summon AI transition shooter chain, active-skill `112` shooter `7000` frame `1`/`3`/`7` timeline plus summon+minion-AI shooter chain including shooter `7003` direction-`0` zero-offset fallback, active-skill `112` level-3 same-frame summon group including shooters `7004`/`7005` loop interval/lifetime and zero-offset bullets `69`/`70`, active-skill `113` / AI `201` first-pass state-22 minion orbit, AIData state-transition-to-shooter, AIData Hydra friendly-target fireball shooter with exact event-offset origin and player-side velocity, AIData long Hydra shooter timeline with per-event offsets and velocities, AIState timeline `FireBulletNow`, AIState `IsFireBullet` gating for raw state `FireBulletDatas`, AIState hostile ray damage, AIState timeline `FireAllWeaponNow`, AIState shooter `SpawnPos = 1`, AIState `MoveToRandomPosition`, AIState `Golem_RollAttack` `State_MoveSpeed`, AIState `Samurai_FlashAttack`, AIState `CatBoss_Attack`, AIState BlackCat teleport timeline, AIState entry `buffID`/`buffLevel` active buffs, AIState entry common-state recording, active-skill buff, active-skill summon, and CN `Map_09` through `Map_15` terrain/prefab parity fixture generator/test including enemy/minion boundary clamps; broader CN dump-derived fixtures are still pending |

Enemy-AI parity now also locks first-pass offset movement for CN
`AIStateType = 31`/`32`/`33`, using `State_MoveOffsetX/Y` and
`State_MoveSpeed` from AI `38`, `44`, and `80` snapshot rows.
It also locks AI `80` `TriggerLevelEventID` samples and the first-pass level
`27` trigger chain where an AI-state trigger activates a matching
`eventTriggerType = 2` enemy-spawn event.
AIState entry-buff parity now locks every CN snapshot state that carries
`buffID`: AI `38` state `5` and state `6` apply boss weak debuff `101`, and AI
`41` state `1` applies continuous-change buff `102`. The first-pass runtime
applies these as ordinary entity active buffs on the AIState entry frame.
AIState common-state parity now locks CN AI `32` state `1` changing the entity
common state to `1` and state `2` changing it back to `0`; the runtime stores
that value on the serializable enemy/minion entity so renderer/debug layers can
observe it. Native VFX semantics and any deeper gameplay effect beyond
serializing the state value remain a separate pending layer.
AIState target-direction parity now applies `syncDirectionFromTarget` as a
first-pass `facingAngle` sync on enemies and minions. This feeds
`IsFollowOwnerDirection` / owner-forward bullet shooters, with local coverage
for a moving owner-forward projectile and CN coverage for weapon `32` minion AI
`110` / shooter `15000` owner-facing state. Exact native animation-facing
timing remains pending.

Drop/item parity now has CN snapshot fixture coverage for representative
`ItemData.ItemType` rows (`EXP`, `Bomb`, `Magnet`, `Upgrade`, `Heal`, and
`Coin`) and two `DropData` rows: drop `102` (`小怪掉落`, guaranteed small EXP
plus low-rate coin) and drop `20` (`关卡共通默认掉落`, bomb/magnet/heal). The
parity test also runs a deterministic kill-to-drop-to-EXP-pickup simulation for
drop `102`, so the DTO mapping and runtime pickup effect are covered together.

Level enemy-spawn parity now locks the first real CN level event for level `1`
(`Plain` / level ID `1`, event index `1`): frame `5` spawns five level-1 slime
enemies at range `13..20`, with AI type `1`, drop `1`, 60-frame wave interval,
and the level-1 enemy stats from CN `EnemyData`. The parity test drives the
normal simulation update path at that event frame and verifies the spawned
enemy wave plus the next spawn cursor. It also locks the first center-offset
boss sample from level `28`: `SpawnCenterType = 1` now uses the level origin
plus `SpawnCenterOfferX/Y` in level units, so the first cat boss appears at
`(-3, 4) * 96` instead of around the current player position.
The same parity family now covers the first CN `SpawnType = 2` ring sample:
level `15` event index `16` (`Sky Island` knight circle) spawns twenty
level-1 knights evenly around the player at the midpoint radius of range
`14..15`.

Current playable prototype:

- local dev should use the fixed-port script below so an in-progress prototype
  can be inspected repeatedly at
  `http://localhost:3117/bandori/nfo` or
  `http://localhost:3117/zh-CN/bandori/nfo`:

  ```bash
  npm run dev:nfo
  ```

  Port `3117` is the stable NFO development port for this branch; keep the
  existing process on that port running when inspecting work in progress.

- run the route/API/static runtime smoke against the already-running server
  without launching a browser:

  ```bash
  npm run smoke:nfo:http
  ```

  The HTTP smoke command defaults to `http://localhost:3117` and checks
  `/bandori/nfo`, `/zh-CN/bandori/nfo`,
  `/api/bandori/nfo/local-runtime`, and the deployable frozen runtime JSON at
  `/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json`. Use
  `NFO_SMOKE_BASE_URL=http://host:port npm run smoke:nfo:http` for a production
  server on another port. The API DTO check also fails if the page-consumed
  runtime data exposes live NFO HTTP endpoints; raw static JSON may still keep
  frozen source evidence such as original URL fields.

- run the full browser interaction smoke only for stage-gate checks:

  ```bash
  npm run smoke:nfo
  ```

  The full smoke opens the page in headless Chrome/Edge with `?nfoSmoke=1`,
  waits for the client runtime to render the Phaser canvas, runs the same local
  `Unlock all` and `Quick clear` paths, and verifies the hidden smoke marker
  reaches `complete`. Use `NFO_SMOKE_BROWSER_BIN=/path/to/chrome` when the
  browser binary is not auto-detected.

- uses the CN snapshot only;
- exposes character and level selection, with locked characters disabled until
  local progression unlocks them;
- exposes weapon selection, with locked weapons disabled until local
  progression unlocks them;
- exposes equip selection, with locked equips disabled until local progression
  unlocks them and selected equips limited by the character's `maxEquipCount`;
- marks selectable characters, levels, weapons, and equips as `(Locked)` when
  their IDs are absent from the browser-local save's `unlockedCharacterIds`,
  `unlockedLevelIds`, `unlockedWeaponIds`, or `unlockedEquipIds`. The current
  active skill comes from the selected character's `activeSkillId` and does not
  have a separate local unlock table;
- renders placeholder geometry instead of Unity sprites;
- uses prefab-derived map bounds for movement limits;
- renders `MapData.terrainPits` and blocks non-flying movement on those tiles;
- can buy character global upgrades from CN `GlobalUpgradeData`;
- unlocks weapon IDs granted by bought global upgrades and lets the next local
  run use the selected unlocked weapon;
- unlocks equip IDs granted by bought global upgrades and lets the next local
  run use selected unlocked equips;
- applies bought HP, attack, defense, and speed upgrades to the next local run;
- applies selected equip level-1 HP, attack, defense, speed, item magnet
  range, bullet speed, bullet size, bullet lifetime, bullet count, cooldown
  reduction, EXP gain, critical rate, and critical damage modifiers to the next
  local run;
- applies temporary player-side `AttrChange` buffs to the same first-pass
  player modifier surface where those attributes are currently simulated:
  attack, defense, speed, item magnet range, bullet speed, bullet size, bullet
  lifetime, bullet count, cooldown reduction, EXP gain, critical rate, and
  critical damage. These buffs remain transient active state and do not mutate
  the build baseline stored on the player;
- uses the selected weapon's current `fireBullets`, `GroupCount`,
  `FireGroupCD`, `FireCD`, `attrChanges`, `SelfBuffID`, `SelfBuffLevel`,
  `BulletShooterID`, damage judge timing, collider shape, enemy vs friendly
  hit target, and bullet component rotate, force, and hit-buff data for the
  first-pass auto-fire simulation. Weapon-level shooters are spawned as
  serializable shooter timeline entities and then emit their `TimeLineEvents`
  through the shared bullet simulation path;
- maps `GameDefaultData.globalDifficutyControlData` into the runtime DTO and
  uses `playerExpStart` plus `playerExpAddPreLevel` as the current first-pass
  run-time weapon-level EXP curve. EXP pickups apply the level's
  `playerExpRate` plus player `ExpGain`; level-up pickups raise the selected
  weapon level directly. After a level-up, the simulation switches subsequent
  fire cycles to the new `WeaponLevelData` and reapplies the selected level's
  `attrChanges` from the build baseline;
- resolves first-pass shield and counter buffs from `BuffData`: shield/counter
  `Value` is treated as remaining contact-trigger charges, shield absorbs
  enemy contact damage, and counter absorbs contact damage while spawning the
  buff level's `FireBulletDatas` through the normal bullet simulation path;
- fires non-counter player-side buff level `FireBulletDatas` once when the
  buff is successfully applied. This currently locks CN weapon `29` / buff `8`
  emitting bullet `15`; counter buff `6` remains contact-triggered only;
- maps `WeaponData.weaponType`, `WeaponData.minionID`, `MinionData`,
  `WeaponLevelData.MinionCount`, and usable weapon-level `spawnMinionData`,
  then creates placeholder minion entities for minion weapons. First-pass
  minions follow combat targets, stay in serializable simulation state, render
  as placeholder allies, and fire the selected weapon level's `fireBullets`
  from each non-AI-gated minion position. Minion AI state now advances through
  `AIData` timelines and state actions at a first-pass level. Non-gated minion
  AI state `FireBulletDatas` and `CreateBulletShooterTypeID` actions execute
  as player-team actions, while `FireAllWeaponNow` suppresses ordinary minion
  auto-fire and fires the minion's associated weapon only when that timeline
  event is crossed;
- applies `initialWeaponLevelReplace` as initial weapon level, not as a weapon
  ID, because the field name and observed values fit level replacement better
  than weapon replacement;
- maps `activeSkillData`, exposes the selected character's active skill in the
  HUD, charges it during play, and lets the player trigger the current
  first-pass active skill timeline. Timeline `AddBuffDatas` apply
  `TargetType = 0` to the player and `TargetType = 1` to the player plus
  currently existing minions. First-pass `AttrChange`
  buffs now affect subsequent pickup and weapon-fire calculations while active,
  including minion movement for minion-side active buffs. Same-frame newly
  spawned minion buff targeting remains pending.
  Timeline `SpawnMinionData`
  currently creates placeholder minion entities using the CN minion ID, count,
  AI type, optional weapon ID/level, spawn offsets, and spawn radius. If a
  timeline-spawned minion carries `WeaponID`, it can fire that assigned
  weapon's `fireBullets` from the minion position using a first-pass local
  cooldown. Timeline `BulletShooterID` now spawns first-pass active shooter
  entities from CN `BulletShooterData`; those shooter instances consume their
  own `TimeLineEvents`, honor `IsLoopEvent` plus `LoopFrameInterval`, and emit
  their direct `fireBulletData` entries through the normal bullet simulation
  path;
- maps `AIData` into the runtime DTO and attaches `EnemyAITypeID` from level
  enemy spawns to simulation enemies. The first-pass AI runtime starts from
  `FirstStateID`, advances by `LastFrame`, follows the first listed
  `NextStateDatas` transition deterministically, gates ordinary direct bullets
  on `IsFireBullet`, still lets `TimeLineEvents.FireBulletNow` trigger explicit
  timeline fire, fires hostile `FireBulletDatas` toward the player side,
  maps `AIStateType = 2` (`MoveToRandomPosition`) to a deterministic first-pass
  target around the player rather than direct chase, maps `AIStateType = 10`
  (`Golem_RollAttack`) to player-directed movement using CN `State_MoveSpeed`,
  maps `AIStateType = 11` (`Samurai_FlashAttack`) to an entry-frame
  deterministic near-player flash, maps CN AI `26` / `AIStateType = 12`
  BlackCat teleport event `teleport` to a
  deterministic around-player position change,
  maps `AIStateType = 13` (`CatBoss_Attack`) to first-pass deterministic
  bullet-rain origins near the player,
  maps CN offset movement states `31`/`32`/`33` to a first-pass target at
  `player + State_MoveOffsetX/Y` while using CN `State_MoveSpeed`,
  maps `AIStateData.TriggerLevelEventID` to first-pass level-event activation
  and uses it to gate `eventTriggerType = 2` enemy-spawn events,
  applies `AIStateData.buffID/buffLevel` once on the AIState entry frame through
  the existing entity active-buff system, including CN AI `38` state `5`/`6`
  boss weak debuff `101` and AI `41` state `1` continuous-change buff `102`,
  records `AIStateData.IsChangeEntityCommonState` / `EntityCommonStateChangeTo`
  on serializable entities, including CN AI `32` state `1` -> common state `1`
  and state `2` -> common state `0`,
  records `AIStateData.playAnimeName` / `isRestartPlayAnime` and timeline
  `TimeLineEvents.PlayAnimeName` as serializable `animationName` /
  `animationRevision` entity state,
  and lets AI-created `BulletShooterData` instances produce
  hostile shooter timeline bullets. This connects boss-style shooter paths such
  as AI `66` waiting in state `1` before transitioning to state `2` and creating
  shooter `2100`, plus AI `44` state `3` firing ray bullet `99` only after its
  frame-15 `FireBulletNow` event and damaging the player only inside its
  `900`-unit segment, AI `5` state `2` moving randomly around the player while
  `IsFireBullet = 1` emits bullet `51`, AI `6` state `2` rolling at
  `State_MoveSpeed = 600` without auto-firing its raw `FireBulletDatas` because
  `IsFireBullet = 0`, AI `7` state `2` flashing near the player without
  auto-firing raw bullet `51` because `IsFireBullet = 0`, AI `27` state `2`
  spawning hostile bullet `51` from a first-pass player-near bullet-rain
  position, AI `38` states `4`/`5`, AI `44` state `2`, and AI `80` state `10`
  moving toward their CN `State_MoveOffsetX/Y` targets, and AI `26` state `2`
  becoming non-colliding
  at frame `1`, teleporting at frame `30`, and firing bullet `51` at frame `46`.
  The same
  first-pass AI timeline runner also drives minion `FireAllWeaponNow` events,
  including CN AI `103` causing weapon `26` / `圣兽Leo` to emit bullet `34` only
  after state `2` crosses frame `20`, while random probability tables, exact
  native random-position, roll, flash, teleport radius/arrival semantics, and
  exact CatBoss bullet-rain constants, remaining `normal` visual event
  semantics, exact native offset-movement class names/constants,
  exact native facing/animation playback timing and resources, exact native
  level-trigger timing/dependencies, and `IsChangeEntityCommonState`
  visual/common-state effects remain pending;
- exposes a local `Coin +500` prototype command so the upgrade loop can be
  tested before reward and mission parity are complete;
- exposes a local `Quick clear` prototype command so clear rewards and level
  unlocks can be tested quickly; natural timer clears and this debug command
  share the same local clear reward settlement path;
- exposes a local `Unlock all` prototype command for test sessions. It writes
  every local runtime character, level, weapon, and equip ID into the
  browser-local unlock lists and then normalizes the selected loadout; this is a
  debug shortcut only, not a long-term mirror or native progression rule;
- tracks local run results in browser storage;
- starts from the CN `GameDefaultData` default unlock lists, then unlocks the
  cleared level and the cleared `LevelData` row's
  `levelClearUnlockLevelID`, `levelClearUnlockWeaponID`,
  `levelClearUnlockEquipID`, and `levelClearUnlockCharacterID` rewards after a
  clear;
- treats dropped EXP, level-up items, healing, coins, bomb, and magnet pickups
  as local offline events. Magnet pickups collect every remaining
  `ItemData.canBeMagneted` pickup in the current simulation state. Bomb pickups
  immediately defeat active non-boss enemies, spawn their drops, and update
  local score/defeat counters. CN `DropData` row `102` is now covered by a
  parity kill/drop/pickup test; boss damage, native animation timing, and
  multiplayer-sharing details remain pending.

Focused local verification:

```bash
npm run test:nfo
```

This covers the current pure fixture settlement, weapon-selection, equip-selection,
and character-selection slice: natural clear reward, debug clear reward, no
duplicate clear reward after a run has ended, failed-run persistence,
`LevelData` clear unlock rewards, character/weapon/equip unlock gates,
debug unlock-all selection, selected-equip player stats, weapon modifiers,
pickup magnet/EXP modifiers, critical modifiers,
active-skill temporary attribute buffs for pickup EXP/coin and weapon modifiers, and
selected-weapon fire behavior, including multiple `fireBullets` entries,
run-time EXP and level-up item weapon leveling, weapon-level attribute changes,
group cooldown timing including CN weapon `20` / `银河之光`,
damage judge delay/CD,
once-per-enemy vs multi-hit damage gates, rectangle colliders, bullet component
rotate types, friendly player-target and allied-minion hit buffs, weapon self buffs, bullet
force fields, hit buffs, shield contact absorption, counter `FireBulletDatas`,
CN weapon `23` shield charge consumption and weapon `25` counter bullet trigger,
CN weapon `24` / `居合` instant and delayed targetless field timing,
first-pass taunt hit-buff source targeting,
shooter `OnDestoryFireEventBulletID` follow-up bullets,
first-pass minion weapon creation/firing, including CN weapon `16` / minion
`2` / bullet `22`, CN weapon `19` / minion `6` / bullet `29`, and CN weapon
`22` / minion `3` / zero-speed ray bullet `33`, and CN weapon `26` / minion
`4` / bullet `34`, minion AI-created player-team bullet shooters,
AI timeline `FireAllWeaponNow`-gated minion weapon firing,
AIState entry buff application without per-frame restacking, AIState entry common-state recording,
weapon-level `MinionCount` multi-minion firing, weapon-level `spawnMinionData`
AI/placement handling, bomb/magnet pickup handling,
first-pass enemy AI direct fire, enemy AI-created hostile bullet shooters,
enemy AI shooter `SpawnPos = 1` player-side placement, and
active skill timeline buff application, active skill minion spawning, bullet
boundary expiry, active skill heal-percent, invincible, and revive buff effects, active
skill ring summon formation, active skill minion assigned-weapon firing, plus ray segment
length checks, active skill bullet shooter firing, and bullet shooter loop
intervals, active skill shooter `SpawnPos = 3` nearest-enemy placement,
active skill `13` / shooter `13000` four-fireball fan spread and zero-speed
snow-field bullet,
active skill `117` / shooter `11000` friendly invincible hit buff `108`,
active skill `111` / `圣兽之王` formation-2 minion summon and delayed minion
AI shooter `14001`,
active skill `112` / `全弹发射` same-event shooter `7000` plus minion `8`
summon and first-pass minion AI shooter `7003`, plus level-3 same-frame minion
AI `205`/`206`/`207` summons with minion AI shooters `7004`/`7005`,
plus active shooter direction `0`, `1`, `2`, and `3` first-pass aiming,
large multi-bullet radial spread for shooter timeline events, weapon-level
`BulletShooterID` spawning, and weapon shooter direction `4` owner-forward
aiming, including CN weapon `31` / shooter `311` formation type `3` rotating
its `(100, 0)` event offset with the player's current facing angle, CN weapon
`30` / shooter `301` friendly buff bullet `99` applying
buff `109` to the player side, CN weapon `2`, `5`, `6`, and `9` level `1`
firing their moving multi-bullet direct projectiles without an enemy target,
CN weapon `3` level `1` requiring an enemy target before its zero-speed ray
bullet `3` can fire,
CN weapon `8` level `1` creating both entries of bullet `15` toward the same
enemy target without an artificial per-entry angle spread,
CN weapon `10` direct bullets `13` and `12`
firing as zero-speed self-centered fields even when no enemy target exists,
with bullet `13` preserving `DamageJudgeType = None` and bullet `12` applying
multi-hit damage when an enemy later overlaps the field, CN weapon `11` direct bullet `6` keeping
`DamageJudgeType = None` while still applying outward force, and CN weapon `11`
bullets `7`, `8`, `9`, and `10` firing as targetless cardinal force bullets
for left, right, down, and up directions, CN weapon `12` direct ray bullet
`19` following the player's current facing angle and staying owner-forward
instead of retargeting to an enemy behind the player, CN weapon `13`
zero-speed rect bullet `20` staying owner-forward
instead of retargeting to a behind enemy, plus shooter event
`bulletRotationType` rotate overrides, and CN weapon `14` direct bullet `18`
firing without an enemy target and using an owner-forward ray segment collider
with slow hit buff `1` while following the same player-facing angle path, CN
weapon `15` zero-speed circular bullet `21`
firing without an enemy target and applying freeze buff `2`, CN weapon `17`
zero-speed circular bullet `23` firing without an enemy target and applying
stun buff `3`, CN weapon `18` direct bullet `28` applying DOT buff `4` and
ticking once after one second, CN weapon `27` direct friendly-target bullet
`32` applying buff `7` to the player side without damaging overlapping enemies,
and CN AI `44` state `3`
firing hostile ray bullet `99` only after frame-15 `FireBulletNow`, damaging the
player inside its `900`-unit segment while missing a player outside the segment,
plus CN `Map_09` through `Map_15` prefab bounds and terrain-pit
blocking/flying bypass.

For local CN snapshot parity, run:

```bash
npm run nfo:parity-fixtures
npm run test:nfo:parity
```

For deployment smoke after `npm run build` and with a dev or production server
already running, run:

```bash
npm run smoke:nfo:http
```

This HTTP smoke covers both `/bandori/nfo` and `/zh-CN/bandori/nfo`, the
local-runtime API, static frozen runtime artifact, and the page-consumed API
DTO's no-live-NFO-endpoint boundary without launching Chrome/Edge. For
release-candidate or final stage-gate checks, run the full browser interaction
smoke:

```bash
npm run smoke:nfo
```

The full browser smoke uses a temporary browser profile, so it does not alter
the user's normal browser save data.

`nfo:parity-fixtures` writes a small ignored fixture file under
`temp/nfo-offline/cn/Android-2.1.1/runtime-data/cn-parity-fixtures.json`.
The current fixture locks three active-skill shooter cases from the frozen CN
data: shooter `7000` for direction `0` with event formation offset, shooter
`6000` for direction `1` with the six-bullet radial `发射六芒星` event, and
shooter `3000` for direction `3` owner/self direction metadata. Shooter `6000`
also locks `LifeTime = 55`, `IsLoopEvent = true`, and
`LoopFrameInterval = 10`; the parity test verifies the second loop emission and
that the shooter is removed at its lifetime boundary. The active-skill summon
fixture also records minion AI shooter `7003` with direction `0`, default
formation, and zero formation offset; the parity test locks the current
first-pass fallback where that bullet travels along +X when no enemy target is
present. It also locks
one boss-style direction `2` sample: shooter `2100` uses
`BulletHitTargetType = 1`, fires toward the player side from its event origin,
and applies event `bulletRotationType = 2`. The fixture also locks shooter
`2001` from CN AI `28`: the AI advances from state `1` to state `2`, creates
the Hydra fireball shooter, and the shooter fires bullet `53` with
direction `2`, event `bulletRotationType = 0`, BulletData rotate type `1`,
event offset `(250, 100)`, and `BulletSpeed = 600` toward the player side.
The runtime parity assertion now verifies the inferred bullet spawn point
against that event offset and checks the velocity vector from the offset
origin to the player, rather than only checking that the signs point left/up.
It also locks shooter `2000` from CN AI `29` state `5`: the long Hydra shooter
has `11` timeline events through frame `59`, emits bullet `53` for each event,
keeps the shooter active until frame `59`, and expires at its `LifeTime = 60`
boundary. The fixture now stores each selected shooter event's frame, offset,
direction, rotation, and selected bullet fields; the parity test steps event by
event and verifies each bullet's inferred spawn point and velocity against the
CN event offset.
The fixture also locks shooter
`4000` / `银河之星-黑洞子弹发射器`: parent no-damage bullet `99` carries
`OnDestoryFireEventBulletID = 1`, and event bullet `31` is emitted from the
parent position when that projectile expires. The same on-destroy path now
locks the hostile CN shooter `2002` / `米歇尔boss飞拳`: parent bullet `54`
uses direction `2`, event offset `(20, 0)`, `BulletHitTargetType = 1`, speed
`600`, and `OnDestoryFireEventBulletID = 1`; when it expires, event bullet
`55` is emitted at the expired parent position as a player-damaging
friendly-target explosion with `BulletHitTimes = 99999`. It also locks active
skill `99` /
`电锯之神·召唤` level `1`: frame `1` creates shooter `8000`, whose
`SpawnPos = 3` places the shooter on the nearest enemy before emitting chainsaw
bullet `58`.
It also locks active skill `13` / `Elemental Burst` level `1`: frame `1`
creates shooter `13000`, whose `SpawnPos = 3` places the shooter on the
nearest enemy, emits zero-speed snow-field bullet `21`, and emits four
direction-`1` fireballs (`BulletTypeID = 11`, `BulletCount = 4`,
`BulletSpeed = 600`) as a first-pass fan spread.
It also locks active skill `14` / `Apocalypse Song` level `1` as the first
delayed active-skill shooter timeline case: frame `1` creates shooter `3000`
and no-damage stun field bullet `56`, applying stun buff `3` to overlapping
enemies, while frame `90` creates shooter `3001` and damaging field bullet
`99`; the parity test verifies that the damage shooter does not exist before
frame `90`.
The fixture also locks active skill `117` level `1`: frame `1` creates
shooter `11000`, whose no-damage friendly bullet `65` applies invincible buff
`108` to the player side for 30 frames.
It also locks active skill `16` / `KiraKiraDokiDoki` level `1`: frame `1`
creates shooter `9000`, whose zero-speed field bullet `59` starts at the
player, keeps `BulletDamageJudgeDelay = 21`, and only after that delay damages
an overlapping enemy and applies stun buff `18` for 150 frames.
Active skill `114` / `Zessho` level `1` now locks shooter `1001` as the first
active-skill field sample with `BehaviorType = 0` and
`IsFollowOwnerDirection = 0`: frame `1` creates a static shooter at the player
origin, emits zero-speed damage field bullet `99`, and the parity test verifies
that moving the owner afterward does not move or rotate the shooter.
Active skill `116` / `未尽之星图` level `1` is now locked as a long-lived
owner-forward field sample: frame `1` creates shooter `10000`, whose
`LifeTime = 300` and direction-`3` zero-speed bullet `64` stays on the player
side, hits overlapping enemies immediately, and keeps the 300-frame bullet
lifetime from CN data.
The same simulation path now also verifies its timeline buff `107`: the CN
snapshot exposes EXP gain `+100` and item magnet range `+1000`, and the parity
test checks that a distant EXP pickup is collected and uses the temporary EXP
gain while the buff is active. Buff attribute type `15` is preserved in the
runtime data but remains unnamed and unconsumed.
The fixture now also locks six representative CN item rows (`itemID` `1`, `4`,
`5`, `6`, `7`, and `10`) covering the supported item-type catalog, plus
`DropData` `102` and `20`. The parity test drives drop `102` through a
deterministic enemy kill, confirms that the guaranteed EXP pickup is spawned
from the CN drop table, then collects it through the normal pickup path.
It also locks the first level-1 enemy wave from CN `LevelData`: level `1`,
event index `1`, frame `5`, five level-1 slime enemies, AI type `1`, spawn
range `13..20`, drop `1`, and 60-frame wave interval. The parity test primes
the simulation to frame `5`, fixes spawn randomness, and verifies that the
normal update path creates the wave and advances the event cursor.
The same fixture family now locks level `28` event index `1`, a center-offset
boss spawn using `SpawnCenterType = 1`, `SpawnCenterOfferX = -3`,
`SpawnCenterOfferY = 4`, and zero spawn range. The simulation treats this as a
level-origin spawn center and verifies the resulting fixed boss coordinates.
It also locks level `15` event index `16`, the first CN `SpawnType = 2`
knight-circle sample. The current first-pass simulation spreads the twenty
knights evenly around the player and uses the midpoint of `SpawnRangeMin = 14`
and `SpawnRangeMax = 15` as the ring radius.
The fixture now also locks CN `levelClearType = 2` samples: level `11` and
level `13` both have `levelTotalFrame = 18000` and enabled enemy-spawn events
at or after frame `18000`, so the simulation keeps those runs in `playing`
instead of awarding timed clear coins at the timer boundary.
For timed boss-clear stages, the fixture now also locks CN levels `15`, `27`,
and `28`: each has `levelClearType = 1`, `levelClearEnemyEventID = 1`, and one
enabled enemy-spawn event with `enemySpawnData.EventID = 1` at frame `18000`.
The runtime also maps `levelClearMinorEnemyEventIDs`; in the frozen CN snapshot
this currently affects level `27`, whose minor clear event list is `[100]` and
points at the doll-machine boss spawned at frame `2`. The simulation tags
spawned enemies with those event IDs, keeps the run playing while any required
major/minor clear event enemy is alive, and awards clear coins only after all
required tagged enemies have been defeated.
The same clear-case fixture now also locks `LevelData` clear unlock reward
arrays. CN level `15` unlocks level `16` plus characters `113` and `114`;
level `27` unlocks level `28`; levels `11`, `13`, and `28` currently expose
empty clear unlock reward arrays in the frozen snapshot. The parity test also
drives the offline save settlement path with real CN levels `1`, `15`, and
`27`, verifying that level clear rewards unlock the mapped character/level
IDs rather than relying on snapshot-order progression.
`LevelEventData.eventTriggerEnemyEventID` is now also preserved in the runtime
DTO. The frozen CN snapshot only uses non-zero `eventTriggerType` on level
`27`: twelve enemy-spawn events from frame `5400` through `18000` use
`eventTriggerType = 2`, and all currently carry `eventTriggerEnemyEventID = 0`.
The fixture locks that field distribution and now also locks AI `80` return
states with `TriggerLevelEventID = 1` and `3`. The first-pass simulation records
those AI-state triggers, lets `eventTriggerType = 2` enemy-spawn events wait for
their matching `eventID`, and consumes each triggered enemy-spawn event once
after its `eventStartFrame`.
The AIState fixture set now also locks every CN state with `buffID`:
AI `38` state `5` and state `6` map to boss weak debuff `101`
(`attributeType = 3`, value `-500`, duration `120` frames), while AI `41`
state `1` maps to buff `102` (`attributeType = 14`, value `1`, duration
`6000` frames). The parity simulation verifies those buffs are applied once to
the enemy active-buff list on the state entry frame.
The AIState common-state fixture set now locks CN AI `32` state `1`
(`IsChangeEntityCommonState = 1`, `EntityCommonStateChangeTo = 1`) and state
`2` (`EntityCommonStateChangeTo = 0`); the parity simulation verifies the
serializable enemy `entityCommonState` value changes on state entry.
The AIState animation fixture set now locks CN AI `38` state `5`
(`playAnimeName = Skill1-2`, `isRestartPlayAnime = 1`) and CN AI `26` state
`2` timeline frame `1` (`PlayAnimeName = skill-miss`). The parity simulation
verifies serializable enemy `animationName` / `animationRevision` updates on
state entry and timeline events without claiming native animation playback
timing or resources yet.
The same LevelData fixture set now locks first-pass `levelEventType = 4`
coverage for CN levels `15` and `27`. These events read
`enemyAIStateChangeData.EnemyEventID` and `AIStateID`; the runtime applies the
state change once to live enemies tagged with the matching `EnemyEventID`, then
lets the normal enemy AI runner continue from the new state.
`test:nfo:parity` rebuilds the fixture from
the local snapshot and also drives simulation with real CN shooter data for the
direction `0`, `1`, and `2` cases plus the active skill `13` fan-spread shooter
chain. It also locks the first weapon-level shooter
case: weapon `31` level `1` has no direct `fireBullets`, uses
`BulletShooterID = 311`, and the shooter timeline emits bullet `61` forward
even when the nearest enemy is behind the player. The level-up pickup path for
the same weapon is now locked too: after `item-level-up`, weapon `31` reaches
level `2`, switches the next fire cycle to `BulletShooterID = 312`, and emits
level-2 bullet `61` with size `120` and 35-frame lifetime instead of the
level-1 size `100` and 30-frame lifetime. The same CN case now locks
the only observed frozen-data shooter formation type `3` family:
`bulletFormationOffsetX = 100`, `bulletFormationOffsetY = 0`, and
`bulletFormationParam1 = 50` rotate with the player/owner facing angle before
direction type `4` fires bullet `61`. It also locks the first
weapon-shooter direction-offset case: weapon `28` level `1` uses
`BulletShooterID = 2`; its frame-15 event emits bullet `24` with
`bulletFireDirectionType = 1` and `bulletFireDirectionOffsetAngle = 90`, so the
first-pass simulation rotates nearest-enemy fire into the vertical fan while
respecting the bullet's 15-frame lifetime. The same parity path now also locks
the later frame-30 all-direction event on the same shooter: it emits eight
bullet `24` projectiles at `BulletSpeed = 600` with no formation offset, and
the first-pass simulation treats that large zero-offset event as a radial ring
whose horizontal and vertical velocity sums cancel out. The same parity path
also locks
weapon `28`'s direct fire in the same shot: level `1` emits ten bullet `5`
projectiles with DOT buff `4`, stacks that buff to the CN level-1 cap of `2`,
and still creates shooter `2` for the later timeline bullets. The song-style
weapon path now separates the selected-weapon field from the shooter timeline:
weapon `30` and weapon `33` both require an enemy target before their direct
bullet `60` fires, keep that zero-speed circle field at the player position,
and still create their configured bullet shooter in the same fire cycle. It also locks the first
weapon-shooter friendly hit-buff case: weapon `30` level `1` uses
`BulletShooterID = 301`; the selected weapon and shooter both emit bullet `60`
in the opening cycle, with the selected-weapon direct field using
`BulletDamageJudgeCD = 10` and the shooter-main field using
`BulletDamageJudgeCD = 15`. The same shooter also emits no-damage friendly
bullet `99`, whose `HitBuffID = 109` applies the first-pass Eternal Song
defense buff to the player side and to an overlapping allied minion. The
fixture now locks shooter `301`'s CN lifetime and loop timing:
`LifeTime = 100`, the friendly-buff event starts at frame `1`, repeats every
`LoopFrameInterval = 30`, emits a second buff bullet at shooter age `31`, and
does not re-emit the non-looping shooter-main bullet `60` on that loop; it
expires when the lifetime is reached. Weapon `33` level `1` now locks a mixed
weapon-shooter buff path on shooter `321`: no-damage enemy bullet `99` applies
slow buff `1` and reduces the target's next movement from `100` to `20`
units/s in the parity simulation, while no-damage friendly bullet `63` applies
Prayer Rain buff `111` with attack and critical attributes to the player side.
Shooter `321` also locks `LifeTime = 115`; its enemy slow event starts at
frame `1`, repeats after `LoopFrameInterval = 60`, and expires when the
lifetime is reached, while the friendly buff event remains non-looping. It also locks
the first upgraded targeted fireball sample: weapon `1` level `2` uses
`Weapon_01.CreateBullet(World, ExPlayer, ExEnemy, int, int, FireBulletData)`,
requires a nearest enemy, and carries bullet `11` with `BulletCount = 2`,
`BulletSpeed = 600`, `BulletAttack = 10`, and `BulletHitTimes = 2`. The
simulation verifies a symmetric two-shot fan toward the target line, but exact
native `GetFireDirection` / `oneFanSize` angle parity remains pending. It also
locks the first target-driven long-lifetime projectile sample: weapon `7`
level `1` uses `Weapon_07.CreateBullet(World, ExPlayer, ExEnemy,
FireBulletData)`, requires a nearest enemy, and carries bullet `17` with
`BulletSpeed = 800`, `BulletLifeTime = 300`, `BulletHitTimes = 3`, and
`BulletDamageJudgeCD = 5`. The simulation verifies the target gate and the
first-pass projectile direction and lifetime; exact native spawn offsets and
animation timing remain pending. It also
locks the first targetless
self-centered direct-field case: weapon `10` / `DokiDoki` level `1` exposes
two zero-speed direct bullets without a `BulletShooterID`; bullet `13` has
`BulletDamageJudgeType = 2` and does not consume hit count or damage on
overlap, while bullet `12` keeps the damaging multi-hit field active at the
player position. This is based on CN data plus the available `Weapon_10`
signature taking `ExPlayer` without an `ExEnemy` target; it does not claim the
full native subclass formula is recovered. It also locks the first weapon-level
direct-fire force-only damage judge case: weapon `11` level `1` includes bullet
`6`, whose `BulletDamageJudgeType = 2` (`None`) prevents HP damage and hit-count
consumption while `BulletForceType = 1` still pushes overlapping enemies
outward. The same weapon now also locks four cardinal force bullets from level
`1`: bullet `7` uses `BulletForceType = 3` and travels left, bullet `8` uses
type `4` and travels right, bullet `9` uses type `6` and travels down, and
bullet `10` uses type `5` and travels up. The simulation allows this weapon to
fire without an enemy target based on the available `Weapon_11` signature
taking only `ExPlayer`; it still treats exact native spawn offsets and animation
timing as pending. It also locks the first targetless moving multi-bullet case:
weapon `2` level `1` fires targetless moving bullet `2` three times
(`BulletCount = 3`, `BulletSpeed = 600`, `BulletColliderType = 0`,
`BulletSize = 100`). The available `Weapon_02` signature takes `ExPlayer`,
`index`, `totalBulletCount`, and `FireBulletData`, but no `ExEnemy`, so the
simulation now lets it fire without an enemy target and uses the player's
current facing as the first-pass targetless base direction, preserving the
existing fan spread across the three bullets. Native spread angle and spawn
formation for this moving multi-bullet weapon remain pending. It also locks the
first target-driven zero-speed ray sample: weapon `3` level `1` uses
`Weapon_03.CreateBullet(World, ExPlayer, ExEnemy, FireBulletData)` and carries
ray bullet `3` (`BulletColliderType = 2`, `BulletSize = 100`,
`BulletSize2 = 0`). Unlike the targetless field and owner-forward ray
families, the simulation now waits for an enemy target before firing this ray;
with a target present, the ray aims along the target vector and only damages
enemies inside the forward segment. Exact native spawn offsets and fixed-point
ray math remain pending. It also locks the
first target-driven dual-direct sample: weapon `8` level `1` uses
`Weapon_08.CreateBullet(World, ExPlayer, ExEnemy, FireBulletData,
FireBulletData)` and carries two bullet `15` entries. The first is an
`800`-speed projectile (`BulletSize = 50`, `BulletLifeTime = 40`); the second
is a zero-speed field (`BulletSize = 150`, `BulletLifeTime = 30`). The
simulation now requires an enemy target for both entries and keeps both entries
aligned to the same target direction instead of applying the generic
multi-entry fan offset. Exact native placement of the second field and any
native hit-trigger coupling between the projectile and field remain pending. It
also locks the
first native melee-field sample: weapon `4` / `骑士之刃` level `1` uses
`Weapon_04_Sword.CreateBullet(World, ExPlayer, FireBulletData)` without an
`ExEnemy` target and carries zero-speed circular bullet `4`
(`BulletSize = 250`, `BulletDamageJudgeCD = 120`). The simulation now verifies
that this field spawns without enemies, damages an overlapping enemy, and then
respects the long per-enemy damage cooldown. It also locks the
first direct black-hole inward-force case: weapon `21` level `1` fires zero-speed
bullet `31` without an enemy target, preserves `BulletForceType = 2` and
`BulletForce = 5`, and pulls an overlapping enemy toward the field center in the
first-pass force model. It also locks the first owner-forward direct ray case:
weapon `12` level `1` fires zero-speed ray bullet `19`
(`BulletColliderType = 2`, `BulletSize = 100`, `BulletSize2 = 300`) from the
player side. The parity test places one enemy behind the player and one in
front; the ray keeps owner-forward direction, misses the behind target, and
damages the forward target. It also verifies that a recent upward movement
turns the same direct ray upward, damaging the upward target while missing the
side target. This is based on the available `Weapon_12`
signature taking only `ExPlayer`, not on recovered exact native animation or
spawn-offset code. It also locks the first owner-forward direct rect case:
weapon `13` level `1` fires zero-speed rect bullet `20`
(`BulletColliderType = 1`, `BulletSize = 400`, `BulletSize2 = 200`). The
available `Weapon_13` signature takes only `ExPlayer`, so the simulation keeps
the rect owner-forward even when the only enemy is behind the player, using the
same player-facing angle path as weapon `12`. Exact native spawn offsets and
animation timing remain pending. It also locks the first ray-collider direct weapon case: weapon `14`
level `1` includes bullet `18`, whose `BulletColliderType = 2`, `BulletSize`
width `50`, and `BulletSize2` length `500` hit enemies inside the forward
segment while leaving enemies beyond the segment untouched; the same hit
applies slow buff `1`. The available `Weapon_14` signature also takes only
`ExPlayer`, so the simulation lets bullet `18` fire without enemies and keeps
it owner-forward even when a closer enemy is behind the player. The targetless
case now also verifies that upward movement turns the direct ray upward with
matching velocity. Exact native spawn offsets and animation timing remain
pending. It also locks the first
freeze-field direct weapon case: weapon `15` level `1` fires zero-speed circular
bullet `21` (`BulletColliderType = 0`, `BulletSize = 200`) without an enemy
target and applies freeze buff `2` (`BuffType = 3`, `Duration = 30`) to an
overlapping enemy. The available `Weapon_15` signature takes only `ExPlayer`;
native visual timing and deeper freeze animation semantics remain pending. It
also locks the first stun-field direct weapon case: weapon `17` level `1` fires
zero-speed circular bullet `23` (`BulletColliderType = 0`, `BulletSize = 300`)
without an enemy target and applies stun buff `3` (`BuffType = 2`,
`Duration = 30`) to an overlapping enemy. The available `Weapon_17` signature
takes only `ExPlayer`; native visual timing and deeper stun animation semantics
remain pending. The first hostile AI ray case is also locked: AI `44`
state `3` fires bullet `99` at frame `15`, with `BulletDamageJudgeType = 1`,
`BulletHitTargetType = 1`, `BulletColliderType = 2`, `BulletSize = 50`, and
`BulletSize2 = 900`; the simulation verifies player HP loss inside the segment
and no hit outside it. It also locks the first weapon-level minion-count case: weapon `22` /
`进攻型浮游炮` level `1` has
`weaponType = 1`, `minionID = 3`, `MinionCount = 2`, and direct bullet `33`;
the simulation verifies that two minion entities are created and both fire from
their own positions in the selected-weapon fire cycle. The fixture also locks
bullet `33` as a zero-speed ray with `BulletAttack = 10`,
`BulletDamageJudgeType = 1`, `BulletHitTargetType = 0`,
`BulletColliderType = 2`, `BulletSize = 100`, `BulletLifeTime = 20`,
`BulletHitTimes = 99999`, `BulletDamageJudgeDelay = 0`, and
`BulletDamageJudgeCD = 10`. The base summon weapon is
now covered as well: weapon `16` / `召唤术` level `1` uses
`Weapon_16.CreateMinion(World, ExPlayer)` and
`Weapon_16.CreateBullet(World, ExMinion)`, creates minion `2`, and fires bullet
`22` from the minion position with `BulletSpeed = 600`,
`BulletLifeTime = 60`, and `BulletHitTimes = 9999`. Weapon `19` level `1`
is also locked as a non-AI-gated one-minion path: it creates minion `6`, and
that minion fires bullet `29` from its own position with `BulletSpeed = 600`,
`BulletLifeTime = 60`, `BulletHitTimes = 9999`, and direct damage judging.
Exact native summon placement and animation timing remain pending. A second weapon-minion
case locks weapon `32` / `皇家警卫团` level `1`: `spawnMinionData` creates minion
`10`, overrides its AI type to `110`, uses formation `1` at radius midpoint
`4.5`, and the minion AI creates player-team shooter `15000`, whose timeline
emits no-damage taunt bullet `99` with hit buff `120`; the simulation now
records the bullet source on buff `120` and uses that source as the enemy
movement target while the taunt is active. The level-up path for the same
weapon is now locked as well: after `item-level-up`, the existing minion is
resynced from AI `110` to AI `111`, its next AI action creates shooter `15001`,
and shooter `15001` emits the larger level-2 taunt bullet `99` with size `550`
instead of level-1 size `500`. The AI parity case locks
AI `66` starting at
`FirstStateID = 1`, following the state `1` -> state `2` transition after 30
frames, and creating `BulletShooterID = 2100`; the simulation verifies that
this hostile shooter path emits player-damaging bullet `101`. The AI shooter
spawn case locks AI `32` / Archangel state `4`: it creates shooter `1` with
`SpawnPos = 1`, and the simulation verifies that this hostile shooter is placed
on the player side before emitting bullet `52` with `BulletHitTargetType = 1`.
It also locks the
first CN `FireAllWeaponNow` minion case: AI `103` / `103_召唤物_LEOAI` starts
from `FirstStateID = 3`, reaches state `2`, crosses timeline frame `20`, and
fires weapon `26` / `圣兽Leo` level `1` bullet `34` from minion `4`.

The selected-weapon parity test for CN weapon `26` now starts from weapon
selection, verifies that no bullet `34` is emitted at minion spawn, then
advances AI `103` to the `FireAllWeaponNow` gate before accepting bullet `34`.

The active-skill buff parity case locks skill `12` / `Holy Mend`: its frame-1
timeline event applies revive buff `106`, invincible buff `104`, and heal-percent
buff `105`; the current simulation verifies the heal-percent, invincible, and
first-pass single-player revive effects while keeping native ally revive
targeting as pending behavior.
The same active-skill buff fixture set now locks skill `15` / `Fairy Guard`
level `1`: frame `1` carries `TargetType = 1` buffs `11` and `13`, and the
runtime parity test verifies those persistent buffs apply to both the player and
a currently existing player-side minion without applying to enemies.

The active-skill summon parity cases now lock five CN paths. Skill `111` /
`圣兽之王` level `2` crosses frame `1`, summons three minion `9` copies with
AI type `209` and `spawnFormation = 2` at radius `400`, advances those minions
from AI state `0` to state `1` after 15 frames, creates shooter `14001`, and
emits zero-speed roar bullet `34` with hit buff `3`. Skill `112` /
`全弹发射` level `1` crosses frame `1`, creates active shooter `7000`,
emits bullet `66`, summons minion `8` with AI type `205` at radius `250`, and
then keeps shooter `7000`'s own timeline active: frame `3` emits bullet `67`
from offset `(50, 50)`, and frame `7` emits bullet `68` from offset `(100, 0)`.
The parity test isolates shooter `7000` from the same-frame minion shooter and
verifies those offset-derived directions before accepting the minion path.
That minion's first AI state creates shooter `7003`, which emits bullet
`68` on the next frame. Shooter `7003` now records
`bulletFireDirectionType = 0` with zero formation offset, and the parity test
locks the current first-pass fallback as a +X shot when no target is present.
Skill `112` level `3` additionally locks the three
same-frame summon events for AI types `205`, `206`, and `207`; the middle
event keeps the base radius-`250` placement and minion AI shooter `7004`,
which emits bullet `69`, while the third event uses
`SpawnCenterOffsetX/Y = 250/250`, radius `1`, and minion AI shooter `7005`,
which emits bullet `70` on the next frame. The `7004` and `7005` fixtures now
also lock `LifeTime = 160`, `IsLoopEvent = true`, `LoopFrameInterval = 7`,
direction `0`, and zero formation offset; the parity test verifies their first
+X shots and second loop emissions at frame `8` while keeping exact native
target fallback semantics pending. Skill `113` / `Galaxy Star`
level `1` spawns minion
`7` three times at frame `1` with `spawnFormation = 1`,
`SpawnRadiusMin = 400`, and `SpawnRadiusMax = 600`; the current simulation uses
a deterministic ring at the radius midpoint (`500`) for this formation, which
keeps the summon pattern ring-like instead of turning the radius interval into a
per-index spiral. The summoned minion uses CN AI `201` state `0`
(`AIStateType = 22` / `环绕`) and now keeps that radius around the player at a
first-pass angular rate derived from `State_MoveSpeed = 40` degrees/second;
the active skill `112` floating cannon AI states `205`, `206`, and `207` are
also locked as state-22 orbit states, with their zero `State_MoveSpeed`
preserving the spawned relative ring position while their shooters run. Exact
native state-22 class naming, fixed-point orbit math, and any hidden native
radius/phase constants remain pending. Skill `115` / `Anon Phantom` level `2` spawns two minion `5`
copies at frame `1` with `spawnFormation = 2`, radius `400`, AI type `102`, and
assigned weapon `28` level `8`; the simulation verifies that both summons use
the same first-pass ring placement and retain the assigned weapon metadata.

Weapon behavior staging:

- Current stage: simulate the selected weapon's data-driven fire cycle in
  `src/lib/nfo-offline-sim.ts`; Phaser only renders the resulting bullets.
  `GroupCount <= 0` is conservatively treated as one group, because many CN
  weapon levels have `GroupCount` set to zero while still exposing
  `fireBullets`. The first CN fixture for positive group timing is weapon `20`
  / `银河之光`, whose level-1 `GroupCount = 4` uses `FireGroupCD = 5` before the
  full `FireCD = 90` cooldown.
- Implemented bullet/fire fields: all direct `fireBullets` entries,
  weapon-level `BulletShooterID`, `BulletCount`,
  `BulletTypeID`, `BulletAttack`, `BulletSpeed`, `BulletSize`,
  `BulletSize2`, `BulletLifeTime`, `BulletHitTimes`,
  `BulletDamageJudgeType`, `BulletDamageJudgeDelay`,
  `BulletDamageJudgeCD`, `BulletHitTargetType`, `BulletColliderType`, `BulletForceType`,
  `BulletForce`, `HitBuffID`, `HitBuffLevel`, `EventBulletID`,
  `OnDestoryFireEventBulletID`, `NoDamage`, `GroupCount`, `FireGroupCD`,
  `FireCD`, `attrChanges`, `SelfBuffID`, `SelfBuffLevel`,
  `BulletShooterData.TimeLineEvents`, and `BulletData.bulletCompRotateType`.
  Enemy AI firing now maps `AIData.FirstStateID`, `AIData.NextStateDatas`,
  `AIData.TimeLineEvents.FireBulletNow`, `AIData.TimeLineEvents.NoColliding`,
  `AIData.IsFireBullet`, `AIData.BulletFireCD`, `AIData.FireBulletDatas`,
  `AIData.State_MoveSpeed`, and `AIData.CreateBulletShooterTypeID` at a
  first-pass level.
- Enemy-target direct bullets now require an explicit targetless/native
  fallback before they can fire without a current enemy target. Zero speed alone
  is not enough: CN weapon `3` exposes
  `CreateBullet(World, ExPlayer, ExEnemy, FireBulletData)`, so its zero-speed
  ray waits for an enemy target. Self-centered or owner-forward weapons such as
  CN weapon `10` / `DokiDoki` and weapon `14` still fire without enemies only
  because their recovered signatures do not require `ExEnemy`. CN weapon `24`
  / `居合` is admitted by frozen data evidence for two zero-speed
  self-centered field entries and locked by parity, while its exact native
  class signature remains pending.
- CN weapon `11` / `圣盾冲击` is the first stronger native fallback: the
  available dump class exposes `CreateBullet(World, ExPlayer)`, and the frozen
  weapon level data carries four cardinal `BulletForceType` entries. The
  simulation therefore lets this weapon fire without an enemy target and maps
  force types `Left`, `Right`, `Down`, and `Up` into matching projectile
  directions for bullets `7` through `10`.
- CN weapon `12` is the first owner-forward direct-ray fallback: the available
  dump class exposes `CreateBullet(World, ExPlayer)`, and the frozen level-1
  data carries a zero-speed ray bullet. The simulation keeps bullet `19`
  owner-forward even when the nearest enemy is behind the player. Owner-forward
  direct fire now uses `player.facingAngle`, so the ray follows the most recent
  non-zero movement direction and defaults to +X before movement. Native
  animation timing and exact spawn offsets remain pending.
- CN weapon `13` extends that owner-forward fallback to a zero-speed rect:
  the available dump class exposes `CreateBullet(World, ExPlayer)`, and the
  frozen level-1 data carries rect bullet `20`. The simulation keeps the rect
  angle owner-forward when an enemy exists behind the player and uses the same
  `player.facingAngle` source as weapon `12`; exact native spawn offsets remain
  pending.
- CN weapon `14` extends that direct-ray fallback to moving ray bullet `18`:
  the available dump class exposes `CreateBullet(World, ExPlayer)`, and the
  frozen level-1 data carries a `400`-speed ray with slow hit buff `1`. The
  simulation lets the weapon fire without an enemy target and keeps the ray
  owner-forward even when the nearest enemy is behind the player. The targetless
  path is verified for upward movement so the ray velocity follows
  `player.facingAngle` instead of a fixed +X fallback.
- CN weapon `15` locks the first player-only freeze field: the available dump
  class exposes `CreateBullet(World, ExPlayer)`, and the frozen level-1 data
  carries zero-speed circular bullet `21` with hit buff `2`. The simulation
  lets the field spawn without an enemy target and applies the CN freeze buff to
  overlapping enemies.
- CN weapon `17` locks the first player-only stun field: the available dump
  class exposes `CreateBullet(World, ExPlayer)`, and the frozen level-1 data
  carries zero-speed circular bullet `23` with hit buff `3`. The simulation
  lets the field spawn without an enemy target and applies the CN stun buff to
  overlapping enemies.
- CN weapon `24` / `居合` locks a two-stage player-only field from frozen
  level-1 data. Bullet `25` is a zero-speed circular field with
  `BulletSize = 50`, `BulletLifeTime = 20`, and immediate multi-hit damage;
  bullet `26` is a larger zero-speed circular field with `BulletSize = 100`,
  `BulletLifeTime = 30`, and `BulletDamageJudgeDelay = 10`. The simulation lets
  both fields spawn without an enemy target, verifies that bullet `25` hits an
  overlapping enemy immediately, and verifies that bullet `26` does not hit
  until after its 10-frame delay. Exact native class signature, spawn offset,
  and animation timing remain pending.
- CN weapon `2` locks the first player-only moving multi-bullet direct case:
  the available dump class exposes `CreateBullet(World, ExPlayer, int, int,
  FireBulletData)`, and the frozen level-1 data carries bullet `2` with
  `BulletCount = 3`. The simulation lets those projectiles spawn without an
  enemy target and uses the player's current facing as the first-pass
  targetless base direction, while native spread angle and formation remain
  pending.
- CN weapons `5`, `6`, and `9` extend that player-only moving direct fallback.
  The available dump classes expose `CreateBullet(World, ExPlayer,
  FireBulletData)` or `CreateBullet(World, ExPlayer, int, int,
  FireBulletData)` without an `ExEnemy` target, while the frozen level-1 data
  carries moving multi-bullet entries for bullet `5` (`BulletCount = 2`),
  bullet `16` (`BulletCount = 3`), and bullet `14` (`BulletCount = 5`). The
  simulation now lets these fire without a current enemy target and aligns the
  targetless base direction to the player's current facing. Weapon `5` /
  `暗夜法球` now has first-pass homing that retargets moving orbs toward the
  nearest enemy each frame, and weapon `6` / `守护之歌` now has first-pass
  player-orbit bullets. Exact native homing turn rate, orbit radius/angle speed,
  spawn offsets, and exact spread formation remain pending.
- Current minion handling maps CN `WeaponData.weaponType`, `minionID`,
  `MinionData`, `WeaponLevelData.MinionCount`, and usable weapon-level
  `spawnMinionData`. For `weaponType = Minion`, the simulation creates or
  reuses the current weapon level's minion count, moves those placeholder
  minions toward the nearest enemy or back toward the player, and fires the
  selected weapon level's `fireBullets` from every non-AI-gated minion position
  during the selected-weapon fire cycle. This covers weapon `22` level `1`,
  whose frozen CN data sets `MinionCount = 2` and
  direct zero-speed ray bullet `33` with ray collider, 20-frame lifetime,
  99999 hit count, and 10-frame damage-judge cooldown. If the minion's `AIData` contains a
  `TimeLineEvents.FireAllWeaponNow` gate, ordinary minion auto-fire is
  suppressed; the minion advances through the same first-pass AI state runner
  as enemies and fires its associated weapon only when that event is due. This
  covers the CN weapon `26` path: weapon `26` creates
  minion `4`, minion AI `103` transitions into state `2`, and frame `20`
  triggers bullet `34` despite the weapon level's very large `FireCD`. Weapon
  `32` now uses its level-specific `spawnMinionData` to create minion `10`,
  apply the level's AI type override, place the minion from the configured
  spawn radius, and run the minion AI state shooter as a player-team shooter.
  The CN level-1 guard path is locked by shooter `15000` and no-damage taunt
  bullet `99`, which applies buff `120` and redirects affected enemy movement
  to the bullet source in the first-pass simulation. Deeper native taunt
  threat/targeting semantics, minion collision rules, and per-`Weapon_XX`
  subclass details remain pending.
- `EventBulletID`, `OnDestoryFireEventBulletID`, and `NoDamage` are now mapped
  on the shared `FireBulletData` DTO. The selected-weapon `fireBullets` subset
  in the frozen CN runtime still mostly uses zero values, but
  `BulletShooterData` contains non-zero examples such as black-hole follow-up
  bullets. First-pass simulation stores event bullets on the parent projectile
  and emits matching `OnDestoryFireEventBulletID` entries when that projectile
  expires or is consumed. The CN parity harness now locks shooter `4000`:
  no-damage trigger bullet `99` emits follow-up black-hole bullet `31` on
  parent expiry.
- Current weapon-level attribute handling maps CN `WeaponData.WeaponLevelData.attrChanges`
  and applies the selected weapon level's attribute changes to the player at
  run creation and after run-time weapon level-up. The CN dump exposes
  `AttributeChangeData` as `AttrType` plus `Value`; the current simulation
  routes those through the same first-pass attribute application used for
  global upgrades and equips. It stores the global-upgrade/equip build baseline
  in serializable simulation state so weapon-level attribute changes can be
  recalculated instead of stacked.
- Current run-time leveling maps CN `GameDefaultData.globalDifficutyControlData`.
  The first-pass EXP curve uses `playerExpStart + (currentLevel - 1) *
  playerExpAddPreLevel`; `LevelData.playerExpRate` and player `ExpGain` modify
  collected EXP before it is applied. Item type `3` (`upgrade`) directly raises
  the selected weapon level. `playerLevelOn10`, `playerDpsPreLevel`, and exact
  native level-up selection/UI timing remain pending.
- Current weapon self-buff handling maps frozen CN runtime/typetree
  `SelfBuffID` and `SelfBuffLevel` fields on weapon levels, then applies the
  selected weapon level's self buff to the player when the weapon fire cycle
  triggers. This covers self-buff-only levels such as `浮游光盾` and `弹反`
  that have no `fireBullets`. The simulation stores the resulting shield or
  counter buff as active player state. Type `5` shield buffs now absorb enemy
  contact damage and consume one `Value` charge per protected contact; CN
  weapon `23` / buff `5` level `1` now locks the two-charge shield case from
  frozen data. Type `6`
  counter buffs now absorb enemy contact damage, consume one `Value` charge,
  and spawn the active buff level's `FireBulletDatas` through the same bullet
  creation and collision path as weapon fire. The CN `弹反状态` data uses
  CN weapon `25` / buff `6` level `1` now locks `Value = 1` plus zero-speed
  bullet `27` with `BulletAttack = 100`, `BulletSize = 300`,
  `BulletLifeTime = 30`, and `BulletDamageJudgeDelay = 10`.
  `Value = 1` and a BulletType `27` counterattack entry. These fields were
  observed in the frozen CN runtime resources, not yet as named members in the
  available `dump.cs` class text. CN weapon `29` now locks a first-pass
  stealth self-buff attribute and buff-bullet path: buff `8` has type `7`,
  applies defense `+2` and speed `+500`, affects the player's effective stat
  reader while active, and emits its buff-level bullet `15` when a target is
  available. Native stealth visibility, targeting, and threat semantics are
  still pending.
- Current bullet component rotate handling follows the CN dump enum:
  `None = 0`, `RotateBySpeed = 1`, `RotateByCoreTransform = 2`, and
  `OnlyChangeFaceDirection = 3`. The simulation keeps `angle` as the collision
  direction and `facingAngle` as the visual-facing direction. `RotateBySpeed`
  resynchronizes collision and visual direction from velocity, `RotateByCoreTransform`
  preserves the firing core direction, and `OnlyChangeFaceDirection` updates
  only visual facing. `BulletShooterData.TimeLineEvents.bulletRotationType`
  now acts as an event-level rotate override when it is greater than zero,
  falling back to `BulletData.bulletCompRotateType` otherwise. The frozen CN
  snapshot has one non-zero shooter event for shooter `2100` / bullet `101`,
  which is locked in the CN parity fixture. This remains separate from the
  weapon-specific homing and player-orbit fixtures for weapon `5` and weapon
  `6`.
- Current hit-target handling maps CN `BulletHitTargetType`. Type `0` remains
  the normal enemy target. Type `1` is currently treated as friendly player-side
  target. CN samples include defensive no-damage buff bullets such as weapon
  `30` / shooter `301` / bullet `99` -> buff `109`, active-skill shooter
  `11000` / bullet `65` -> buff `108`, shooter `5000` / bullet `99` ->
  buff `11`, weapon `33` / shooter `321` / bullet `63` -> buff `111`, and
  direct weapon `27` / bullet `32` -> buff `7`. Weapon `33` also locks the
  corresponding no-damage enemy-side shooter bullet `99` -> slow buff `1`. In the first
  pass, friendly-target bullets can fire without an enemy target, apply hit
  buffs to the player and overlapping allied minions, and do not damage enemies.
  CN weapon `30` now locks the first allied-minion friendly hit-buff overlap:
  shooter `301` bullet `99` applies buff `109` to both the player and an
  overlapping allied minion. CN weapon `27` locks the direct friendly-target
  path: level `1` emits ten moving bullet `32` projectiles with `HitBuffID = 7`,
  and the resulting player-side buff carries defense `+1` and speed `+50` for
  60 frames. Broader native ally selection, ally priority, and non-overlap
  targeting beyond this player/minion first pass remain pending.
- Current collider handling covers `Circle`, `Rect`, and a first-pass `Ray`.
  Rect uses `BulletSize2` as oriented length when it is larger than width, but
  the current first pass keeps rect length at least `BulletSize`; CN weapon
  `13` / bullet `20` now locks the owner-forward angle for a zero-speed rect
  when the only enemy is behind the player, while exact native spawn offsets
  and native rect dimensions are still pending. `Ray` uses a forward line segment with `BulletSize2` as length and
  `BulletSize` as width tolerance. CN weapon `14` / bullet `18` now locks a
  ray segment sample: the bullet can spawn with no enemy target, a closer enemy
  behind the player is ignored by owner-forward aiming, an enemy inside the
  `500`-unit segment is damaged and receives slow buff `1`, and an enemy past
  the segment is not hit. This matches the CN field intent better than a box
  approximation. CN AI `44` /
  bullet `99` locks the hostile/player-target ray path with a `900`-unit
  segment. These are still first-pass geometry checks and do not claim native
  fixed-point collision parity.
- Current damage judge handling covers `OncePerEnemy`, `MultiTimes`, and
  `None`. `None` suppresses HP damage, hit-buff application, and hit-count
  consumption, while overlap-only effects such as bullet force still run; CN
  weapon `11` / bullet `6` locks this first-pass behavior. A zero
  `BulletDamageJudgeCD` uses the CN dump tooltip default of 15 frames.
- Current force handling covers `None`, `Outward`, `Inward`, `Left`, `Right`,
  `Up`, and `Down` as overlap-based enemy displacement. The first-pass scale is
  `BulletForce * LEVEL_UNIT_SIZE` per second, so it preserves direction and
  relative strength without claiming native fixed-point parity. CN weapon `21`
  / bullet `31` now locks the direct black-hole `Inward` path separately from
  shooter/on-destroy black-hole follow-up bullets.
- Current hit-buff handling maps `BuffData` and applies hit buffs to enemies.
  It supports `AttrChange` for attack, defense, and speed, `Stun`/`Freeze` as
  movement stops, `DOT` as one-second damage ticks, and `None` as inert. Stack
  and refresh duplicate modes are represented for active enemy buffs. Type `13`
  taunt hit buffs now store the hit bullet source and use it as the affected
  enemy's movement target while active. CN weapon `18` now locks the first
  direct DOT hit-buff case: level `1` bullet `28` applies buff `4`
  (`Duration = 150`, `Value = 1`, `MaxStackCount = 2`) and the first-pass
  simulation ticks one HP after one active second. CN weapon `28` extends the
  same buff into a combined weapon path: ten direct bullet `5` hits stack buff
  `4` to `2` while `BulletShooterID = 2` still runs its timeline.
- Player-side attribute-bearing buffs now use the same effective-stat reader
  as selected equips and weapon-level attributes for the supported first-pass
  player modifiers: attack, defense, speed, item magnet range, bullet speed,
  bullet size, bullet lifetime, bullet count, cooldown reduction, EXP gain,
  coin pickup gain, critical rate, and critical damage. This currently admits
  `AttrChange` buffs plus the first-pass attribute subset of `Stealth`; it does
  not treat every buff type with attributes as stat-active. This covers
  friendly hit-buff paths and active-skill `AddBuffDatas` such as CN skill
  `116` buff `107`; attribute type `15` is treated as single-player coin pickup
  gain from the CN `未尽之星图` evidence described above.
- Current special-buff handling covers the self-buff contact subset observed on
  CN `浮游光盾` and `弹反`: `Shield` and `Counter` use `Value` as remaining
  contact-trigger charges, with counter bullets sourced from buff
  `FireBulletDatas`. CN weapon `23` and weapon `25` are now locked by parity
  tests for shield absorption, counter absorption, charge consumption, and
  counter bullet `27` creation. This preserves the observed CN data shape
  without claiming native timing, animation, or fixed-point parity. Type `9` invincible buffs now
  suppress player contact and hostile bullet damage while active. Type `11`
  heal-percent buffs now apply immediate player healing using `Value / 1000` of
  max HP, matching CN `Holy Mend` value `1000` as a full-heal first pass. Type
  `12` revive buffs are treated as one-shot player-side revive charges in the
  single-player offline simulation: when HP reaches zero before failure
  settlement, the charge is consumed, HP is restored to max, and the normal
  player damage cooldown is applied. CN active skill `117` / shooter `11000`
  now locks type `9` invincible as a friendly hit-buff path, not only as a
  direct `AddBuffDatas` path. CN active skill `15` now locks `TargetType = 1`
  active-skill `AddBuffDatas` as player-plus-existing-minion targeting for
  persistent buffs; minion heal/revive HP semantics are still absent because the
  first-pass minion model has no HP/death lifecycle. Native ally selection,
  teammate-alive invalidation, same-frame summon targeting, and exact revive
  animation timing remain pending.
- Buff types beyond the implemented hit-buff, contact-buff, invincible,
  heal-percent, first-pass revive, first-pass stealth attributes/buff bullet, and
  first-pass taunt-source movement subsets remain intentionally conservative:
  native stealth targeting/visibility behavior, boss-continuous-change, and
  deeper taunt threat/retargeting effects are mapped but not simulated yet.
- Current active skill handling maps CN `activeSkillData`, level charge frames,
  timeline frames, `TimeLineEvents`, `AddBuffDatas`, `BulletShooterID`,
  `SpawnMinionData`, `spawnPosSelector`, full-screen effect names, and the
  separate CN `BulletShooterData` table. The simulation currently charges the
  selected character's skill, accepts an active skill input, applies timeline
  `AddBuffDatas` to player-side active buff state, creates placeholder minions
  from timeline `SpawnMinionData` when their event frame is crossed, and spawns
  serializable active shooter instances from timeline `BulletShooterID`.
  Player-side `AttrChange` buffs from those timeline events now affect
  supported pickup and weapon-fire derived attributes until the buff expires.
  CN skill `116` / `未尽之星图` is the current locked coin-gain case: its
  description says EXP and coin gains increase, and buff `107` is the only
  frozen CN buff that combines EXP gain attribute `11`, magnet range attribute
  `5`, and attribute `15`; the offline simulation therefore treats attribute
  `15` as a coin-pickup gain percentage for single-player runs. This does not
  change clear rewards or infer multiplayer `multiplayValueShare` behavior.
  Active
  skill shooter bullets can also apply friendly and enemy hit buffs; CN skill
  `117` verifies shooter `11000` applying invincible buff `108` through bullet
  `65`, while CN skill `16` verifies shooter `9000` applying delayed stun buff
  `18` through field bullet `59`.
  Shooter instances use `LifeTime`, `SpawnPos`, `SpawnPosOffsetX/Y`,
  `TimeLineEvents`, direct `fireBulletData`, `eventFireBulletDatas`,
  `IsLoopEvent`, and `LoopFrameInterval` at a first-pass level. CN shooter
  `6000` now locks the first snapshot-derived loop/lifetime case:
  frame-1 six-bullet radial fire repeats at frame `11` and the shooter expires
  when age reaches `LifeTime = 55`. CN active skill `13` / shooter `13000`
  now locks the mixed event case: frame `1` emits non-looping snow-field bullet
  `21` and looping four-fireball bullet `11`; the fireball event repeats after
  `LoopFrameInterval = 15`, the snow-field event does not repeat on that loop,
  and the shooter expires after `LifeTime = 60`. `SpawnPos = 0`
  starts from the shooter owner/origin, `SpawnPos = 1` starts from the
  player/friendly target, and `SpawnPos = 3` starts from the nearest enemy when
  one exists. Shooter instances now retain an owner reference when spawned from
  the player, an enemy, or a minion. `BehaviorType = 1` refreshes the shooter
  position from that owner plus the original spawn offset before firing each
  due event; `IsFollowOwnerDirection = 1` refreshes `ownerFacingAngle` from the
  current owner facing. The first locked CN case is weapon `33` / shooter `321`,
  whose enemy slow bullet follows the moved player position and updated facing,
  while its friendly buff bullet follows the same position. CN active skill
  `114` / shooter `1001` now locks the opposite static case:
  `BehaviorType = 0` and `IsFollowOwnerDirection = 0` keep the shooter position
  and facing stable after the owner moves. Active/weapon
  shooter direction `1` aims at the
  nearest enemy from the event origin for ordinary single/fan events and applies
  `bulletFireDirectionOffsetAngle`; CN skill `13` / shooter `13000` locks a
  four-bullet fan-spread sample, and CN weapon `28` / shooter `2` locks the
  first `90`-degree offset sample plus a frame-30 all-direction radial sample. For
  `bulletFormationType = 0` shooter timeline events with no formation offset
  and large multi-bullet entries (`BulletCount >= 6`), the first pass spreads
  bullets radially around that center direction; this covers CN `发射六芒星`,
  `发射全向`, and `环状子弹`-style data without claiming the native formation
  algorithm is fully recovered. Direction `0` uses event
  `bulletFormationOffsetX/Y` as a first-pass radial fire direction when the
  event has a non-zero offset, falling back to nearest-enemy aiming otherwise.
  Direction `2` targets the player/friendly side from the event origin and
  applies `bulletFireDirectionOffsetAngle` on top; this is based on the frozen
  CN boss-style shooter samples, all of which use `BulletHitTargetType = 1`.
  Direction `3` uses the current owner/self direction. Player facing is now
  kept in the serializable simulation state as `player.facingAngle`, updated
  from the most recent non-zero movement input, and still defaults to +X before
  movement. The simulation applies `bulletFireDirectionOffsetAngle` on top of
  that facing angle. Direct owner-forward weapon bullets use the same
  `player.facingAngle` source, which currently covers CN weapons `12`, `13`,
  and `14`. CN active skill `116` now locks this
  active-skill owner-forward path with shooter `10000` and zero-speed bullet
  `64`. Weapon shooter direction `4` is
  also treated as owner/self direction for the first-pass `审判之枪` path, whose
  CN data uses `bulletFormationType = 3`, `bulletFormationOffsetX = 100`,
  `bulletFormationOffsetY = 0`, `bulletFormationParam1 = 50`, and
  `BulletShooterID = 311` for a forward spear. The first pass now rotates that
  event offset with `ownerFacingAngle` before firing bullet `61`.
  Timeline-spawned minions with
  `WeaponID > 0` have their own local fire cooldown and fire the assigned weapon
  level's `fireBullets` from their position at the nearest enemy. Active skill
  `112` / `全弹发射` now also locks the other common summon chain: a timeline event
  can spawn shooter `7000` and minion `8` in the same frame. Shooter `7000`
  now locks its frame `1`/`3`/`7` timeline bullets `66`/`67`/`68`, including
  direction-`0` formation offsets `(0, 100)`, `(50, 50)`, and `(100, 0)`;
  then the summoned minion's first AI state creates shooter `7003` and emits
  bullet `68` on the following frame. The fixture now also preserves that
  minion shooter's direction `0` plus zero formation offset and locks the
  current no-target +X first-pass fallback. Its level-3 path also locks three same-frame `SpawnMinionData` events,
  including the middle AI `206` minion at radius `250` with shooter `7004` /
  bullet `69`, plus the offset AI `207` minion at `(250, 250) + radius 1` with
  shooter `7005` / bullet `70`; the same fixture now locks both shooters'
  `LoopFrameInterval = 7`, `LifeTime = 160`, and zero-offset +X first-pass
  bullet paths. Active skill `111` / `圣兽之王` locks the delayed AI transition variant:
  formation-2 minion `9` copies start in AI state `0`, transition after 15
  frames, then create shooter `14001` and zero-speed roar bullet `34`. For active
  skill summon placement, `spawnFormation = 1` and `2` use a deterministic ring
  over the requested spawn center; if CN data provides a radius interval, the
  first pass uses its midpoint rather than varying radius by minion index. This
  covers the first-pass CN path used by `Anon Phantom`'s `WeaponID = 28`
  formation-2 summons, `Galaxy Star`'s formation-1 ring summon plus first-pass
  AI `201` state-22 orbit, `全弹发射`'s
  same-event shooter/summon chain and level-3 offset summon, `圣兽之王`'s
  delayed minion AI shooter chain,
  and the 54 observed active-skill
  `BulletShooterID` timeline events without claiming native shooter/minion AI
  parity. `spawnCenterType`, exact native `spawnFormation` naming, and deeper
  native formation semantics are still conservative or pending in simulation.
  Full-screen effects, native ally revive targeting, native summon AI/formation
  behavior, remaining native shooter formation/direction behavior, and ally
  targeting beyond the current player-plus-existing/overlapping-minion first pass remain
  intentionally pending.
- Current enemy AI handling maps CN `AIData`, including `FirstStateID`,
  `AIStateDatas`, `NextStateDatas`, `TimeLineEvents`, `IsFireBullet`,
  `BulletFireCD`, `FireBulletDatas`, and `CreateBulletShooterTypeID`. The
  first-pass simulation starts enemies in `FirstStateID`, advances a state after
  `LastFrame`, follows the first listed `NextStateDatas` entry as a
  deterministic approximation, gates ordinary direct bullets on `IsFireBullet`,
  still lets `TimeLineEvents.FireBulletNow` trigger explicit timeline-gated
  fire, applies `TimeLineEvents.NoColliding` to suppress enemy contact damage
  and player bullet hits, maps `AIStateType = 0` (`Idle`) to no chase movement
  while still allowing state timeline events, gated direct bullets, and shooters
  to run, maps `AIStateType = 2` (`MoveToRandomPosition`) to a deterministic
  around-player target while keeping bullets/actions active, maps
  `AIStateType = 10` (`Golem_RollAttack`) to player-directed movement using CN
  `State_MoveSpeed`, maps `AIStateType = 11` (`Samurai_FlashAttack`) to an
  entry-frame deterministic near-player flash, maps `AIStateType = 13`
  (`CatBoss_Attack`) to first-pass deterministic bullet-rain origins near the
  player,
  maps CN offset movement states `31`/`32`/`33` to a first-pass target at
  `player + State_MoveOffsetX/Y` while using CN `State_MoveSpeed`,
  maps `AIStateData.TriggerLevelEventID` to first-pass level-event activation
  and uses it to gate `eventTriggerType = 2` enemy-spawn events,
  applies `AIStateData.buffID/buffLevel` to the enemy active-buff list once on
  state entry, records `AIStateData.IsChangeEntityCommonState` /
  `EntityCommonStateChangeTo` as a serializable entity common-state value,
  records `AIStateData.playAnimeName` / `isRestartPlayAnime` and timeline
  `TimeLineEvents.PlayAnimeName` as serializable `animationName` /
  `animationRevision` entity state,
  handles CN AI `26` BlackCat teleport event `teleport` with a deterministic
  around-player position change, uses `BulletFireCD`/`LastFrame` as the repeat
  cooldown, and treats those bullets or shooters as hostile to the player. This brings
  ordinary firing AI, boss shooter links such as AI `66`
  state `1` -> state `2` -> shooter `2100`, AI `28` state `1` -> state `2`
  -> shooter `2001` with direction-`2` Hydra fireballs, AI `29` state `5`
  -> shooter `2000` with an 11-event Hydra fireball timeline, CN AI `44` state `3` frame-15
  hostile ray bullet `99` with inside/outside segment damage checks plus idle
  movement suppression, CN AI `5` state `2` around-player random movement with
  `IsFireBullet = 1` bullet `51`, CN AI `6` state `2` Golem roll movement with
  `State_MoveSpeed = 600` while `IsFireBullet = 0` prevents raw
  `FireBulletDatas` from auto-firing, CN AI `7` state `2` entry-frame flash
  near the player while `IsFireBullet = 0` prevents raw bullet `51` from
  auto-firing, CN AI `27` state `2` CatBoss bullet-rain bullet `51` from a
  first-pass player-near origin, CN AI `38` states `4`/`5`, CN AI `44` state
  `2`, and CN AI `80` state `10` moving toward their `State_MoveOffsetX/Y`
  targets, and CN AI `26` state `2` frame-1 no-colliding, frame-30 teleport,
  and frame-46 bullet `51` into the offline
  loop. The same first-pass AI timeline runner drives minion
  `FireAllWeaponNow` gates, including CN AI `103` triggering weapon `26` /
  `圣兽Leo` bullet `34` at state `2` frame `20`. Random probability rolls,
  exact native random-position, roll, flash, teleport radius/arrival semantics,
  exact CatBoss bullet-rain constants, remaining `normal` visual event
  semantics, exact native offset-movement class names/constants,
  exact native facing/animation playback timing and resources, exact native
  level-trigger timing/dependencies, and `IsChangeEntityCommonState`
  visual/common-state effects remain pending native behavior.
- Current level bullet boundary handling expires bullets outside the centered
  `levelBulletBondaryX/Y` area, expanded to at least the map-derived world
  bounds. This is a conservative approximation of `CheckOutOfWorld`.
- Current entity boundary handling clamps player, enemy, and minion movement to
  the map-derived world bounds. The CN `Map_09` through `Map_15` parity cases
  now verify enemy and minion max-X clamps in addition to player/enemy
  non-flying pit blocking and flying bypass. Native wall tiles beyond
  `MapData.terrainPits` remain intentionally unsupported until a stronger
  source is identified.
- Current equip handling maps CN `EquipData` and applies selected level-1
  `buffData` entries for HP, attack, defense, speed, item magnet range, bullet
  speed, bullet size, bullet lifetime, bullet count, cooldown reduction, EXP
  gain, critical rate, and critical damage. These are first-pass additive or
  percentage modifiers; they do not claim native fixed-point parity yet.
- Current item handling maps CN `ItemData.ItemType`: EXP, Upgrade, Heal, Coin,
  Bomb, and Magnet. EXP uses the current first-pass run-time leveling curve,
  Upgrade directly raises the selected weapon level, Heal and Coin update local
  player/run counters, Magnet collects all remaining pickups marked
  `canBeMagneted`, and Bomb defeats active non-boss enemies immediately. Native
  fixture coverage now locks one CN item row for each supported item type plus
  `DropData` rows `102` and `20`; the runtime parity test verifies drop `102`
  through an actual enemy kill, spawned EXP pickup, and collected EXP effect.
  Native item movement, pickup animation, boss-specific bomb handling, and
  multiplayer value sharing remain pending.
- Current level enemy-spawn handling maps CN `LevelData.levelEventDatas`
  enemy-spawn events into timed simulation waves. The CN parity fixture now
  locks the first level-1 slime wave from level `1` and verifies wave count,
  spawn timing, range, AI type, drop ID, cursor advance, and enemy level stats
  through the normal simulation update path. It also locks a level `28` boss
  event where `SpawnCenterType = 1` uses level-origin offsets and zero range
  to place a boss at fixed map coordinates. `SpawnType = 2` is implemented as
  a first-pass evenly spaced ring and is locked by the level `15` knight-circle
  fixture. Level clear handling treats default/`levelClearType = 1` without a
  `clearEnemyEventID` as timed clear. When `clearEnemyEventID` is present, the
  runtime tags enemies with `enemySpawnData.EventID` and waits for the tagged
  final enemy plus any mapped `levelClearMinorEnemyEventIDs` to be defeated
  before applying clear rewards; CN levels `15`, `27`, and `28` now lock this
  behavior, with level `27` also locking minor event `100`. The runtime maps
  `levelClearUnlockLevelID`, `levelClearUnlockWeaponID`,
  `levelClearUnlockEquipID`, and `levelClearUnlockCharacterID` into local save
  unlock rewards after a clear; CN levels `15` and `27` are now locked by
  parity fixtures for representative non-empty reward arrays, and CN levels
  `1`, `15`, and `27` drive the offline save settlement path in
  `test:nfo:parity`. The runtime also keeps
  `levelClearType = 2` runs playing beyond `levelTotalFrame`, locked by CN
  levels `11` and `13`, whose data includes enemy-spawn events at or after
  frame `18000`. `eventTriggerEnemyEventID` is now preserved alongside
  `eventTriggerType`; CN level `27` locks the only current `eventTriggerType = 2`
  event family, all with trigger enemy event ID `0`. First-pass
  `TriggerLevelEventID` support records AI `80` return-state triggers and gates
  those triggered enemy-spawn events until their matching `eventID` has been
  activated, then consumes each triggered spawn event once after its
  `eventStartFrame`. First-pass `levelEventType = 4` support now applies
  `enemyAIStateChangeData` once to live enemies tagged by `EnemyEventID`, with
  CN levels `15` and `27` locked by parity tests. Broader event-trigger
  semantics, exact boss-event trigger timing, event dependencies, exact native
  `levelClearType = 2` win/loss rules, and exact native spawn distribution
  details remain pending.
- Next gameplay stage: expand weapon and active-skill behavior parity with
  bullet type behavior, native active-skill shooter formation/direction
  behavior, native active-skill summon formation/AI behavior, true
  targeting/retargeting variants where the CN dump exposes them, native
  collider fixed-point parity, remaining special buff behaviors, native ally
  revive targeting, penetration nuances, full minion AI/taunt behavior,
  ally-target expansion beyond player-plus-minion overlap, and per-`Weapon_XX`
  subclass logic from the CN dump where recoverable.
- Asset conversion stage: replace placeholder bullets and actors with browser
  sprites/audio after the data-driven simulation path is stable.

Current terrain evidence:

- `MapData.terrainWalls` is empty in the frozen CN master-data subset.
- `MapData.terrainPits` is populated for `TestMap` and `Map_09` through
  `Map_15`.
- For those maps, the `terrainPits` count matches the corresponding prefab
  `Terrain` tile layer count. This is strong enough for a conservative pit
  implementation.
- CN `Map_09` through `Map_15` are locked runtime parity cases. The current
  fixture checks each enabled map's level ID, prefab bounds, Terrain layer tile
  count, pit count, first pit sample, player/enemy non-flying pit blocking, and
  player/enemy flying bypass. The locked pit counts are: `Map_09 = 246`, `Map_10 = 1316`,
  `Map_11 = 7739`, `Map_12 = 1783`, `Map_13 = 6941`, `Map_14 = 948`, and
  `Map_15 = 2146`.
- `TestMap` remains raw terrain evidence only because its disabled test level
  is filtered out of the local runtime DTO and is not a playable runtime parity
  case.
- The early one-layer maps `Map_01` through `Map_08` do not yet expose a
  separate `Terrain` layer in the exported prefab summary.
- Unity tile assets and RuleTile entries carry collider flags, but those flags
  also appear on visual/floor tiles. They are not yet treated as gameplay walls.

CN parity gates:

- Prefer `D:\Workspace\temp\dump.cs` for class names, API models, save models,
  and gameplay field names.
- Use the CN frozen bundles as the only gameplay-data source for the first
  prototype.
- Use JP dump strings or APK assets only when the CN dump lacks a recoverable
  string or method hint, and mark every such fallback in the extraction output.

## Non-goals

- No tracker-managed long-term mirror in this phase.
- No object storage upload in this phase.
- No promise that the frozen resource version remains current.
- No attempt to run the original IL2CPP binary as the browser runtime.
