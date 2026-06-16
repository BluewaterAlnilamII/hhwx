"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Unlock, Zap } from "lucide-react";
import { parseApiSuccessData, type ApiResponse } from "@/lib/api-contracts";
import {
  applyNfoRunResultToSave,
  buyNfoGlobalUpgrade,
  getNfoGlobalUpgradePurchaseState,
  grantNfoUpgradeCoin,
  loadNfoOfflineSave,
  resetNfoOfflineSave,
  unlockAllNfoOfflineContent,
  updateNfoOfflineSaveSelection,
  type NfoOfflineSaveState,
} from "@/lib/nfo-offline-save";
import {
  clearNfoSimulation,
  createNfoSimulation,
  updateNfoSimulation,
  type NfoInputState,
  type NfoSimulationSelection,
  type NfoSimulationState,
} from "@/lib/nfo-offline-sim";
import {
  getRuntimeActiveSkill,
  getRuntimeCharacter,
  getRuntimeEquip,
  getRuntimeGlobalUpgradesForCharacter,
  getRuntimeLevel,
  getRuntimeMap,
  getRuntimeMapPrefab,
  getRuntimeWeapon,
  type NfoGlobalUpgradeData,
  type NfoOfflineRuntimeData,
} from "@/lib/nfo-offline-runtime";
import { cn } from "@/lib/utils";

type RuntimeLoadState =
  | { status: "loading" }
  | { status: "ready"; data: NfoOfflineRuntimeData }
  | { status: "error"; message: string };

type HudSnapshot = {
  status: NfoSimulationState["status"];
  hp: number;
  maxHp: number;
  elapsedSeconds: number;
  enemies: number;
  minions: number;
  projectiles: number;
  defeatedEnemies: number;
  pickups: number;
  collectedExp: number;
  collectedCoin: number;
  score: number;
  playerX: number;
  playerY: number;
  attack: number;
  defense: number;
  speed: number;
  itemMagnetRange: number;
  bulletSpeed: number;
  bulletSize: number;
  bulletLifeTime: number;
  bulletCount: number;
  coolDownReduce: number;
  expGain: number;
  criticalRate: number;
  criticalDamage: number;
  weaponLevel: number;
  expIntoLevel: number;
  expToNextLevel: number;
  equipCount: number;
  globalUpgradeCount: number;
  activeSkillId: number;
  activeSkillChargeFrames: number;
  activeSkillChargeMaxFrames: number;
  activeSkillActive: boolean;
  fullScreenEffectCount: number;
  fullScreenEffectName: string;
};

type NfoSceneActions = {
  forceClear: () => void;
  activateActiveSkill: () => void;
  readyActiveSkill: () => void;
  startSmokeMove: () => void;
  advanceSmokeFrames: (frameCount: number) => void;
};

type SmokeInteractionState =
  | "off"
  | "waiting-runtime"
  | "unlock-requested"
  | "coin-requested"
  | "upgrade-requested"
  | "movement-requested"
  | "enemy-spawn-requested"
  | "active-skill-ready-requested"
  | "active-skill-requested"
  | "waiting-scene"
  | "quick-clear-requested"
  | "complete"
  | "error";

const API_URL = "/api/bandori/nfo/local-runtime";
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const TILE_SIZE = 96;
const FULL_SCREEN_EFFECT_RENDER_SECONDS = 0.5;
const EMPTY_NUMBER_ARRAY: number[] = [];
type PhaserModule = typeof import("phaser");

export default function NfoOfflinePrototype() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneActionsRef = useRef<NfoSceneActions | null>(null);
  const [runtimeState, setRuntimeState] = useState<RuntimeLoadState>({ status: "loading" });
  const [selection, setSelection] = useState<NfoSimulationSelection | null>(null);
  const [saveState, setSaveState] = useState<NfoOfflineSaveState | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [smokeMode, setSmokeMode] = useState(false);
  const [smokeInteractionState, setSmokeInteractionState] =
    useState<SmokeInteractionState>("off");
  const [smokeActiveSkillObserved, setSmokeActiveSkillObserved] = useState(false);
  const [smokeMovementObserved, setSmokeMovementObserved] = useState(false);
  const [smokeCombatObserved, setSmokeCombatObserved] = useState(false);
  const [smokeEnemyObserved, setSmokeEnemyObserved] = useState(false);
  const smokeMovementStartRef = useRef<{ x: number; y: number } | null>(null);
  const runtimeData = runtimeState.status === "ready" ? runtimeState.data : null;
  const paidGlobalUpgradeIds = saveState?.paidGlobalUpgradeIds ?? EMPTY_NUMBER_ARRAY;
  const paidGlobalUpgradeCount = paidGlobalUpgradeIds.length;
  const upgradeCoin = saveState?.upgradeCoin ?? 0;
  const selectedLevelCleared = Boolean(
    saveState
    && selection
    && saveState.clearedLevelIds.includes(selection.levelId),
  );
  const isSaveReady = saveState !== null;

  useEffect(() => {
    const enabled = new URLSearchParams(window.location.search).get("nfoSmoke") === "1";
    setSmokeMode(enabled);
    setSmokeInteractionState(enabled ? "waiting-runtime" : "off");
    setSmokeActiveSkillObserved(false);
    setSmokeMovementObserved(false);
    setSmokeCombatObserved(false);
    setSmokeEnemyObserved(false);
    smokeMovementStartRef.current = null;
  }, []);

  useEffect(() => {
    if (smokeMode && hud?.activeSkillActive) {
      setSmokeActiveSkillObserved(true);
    }
  }, [hud?.activeSkillActive, smokeMode]);

  useEffect(() => {
    if (!smokeMode || smokeMovementObserved || !smokeMovementStartRef.current || !hud) {
      return;
    }

    const distance = Math.hypot(
      hud.playerX - smokeMovementStartRef.current.x,
      hud.playerY - smokeMovementStartRef.current.y,
    );
    if (distance >= 8) {
      setSmokeMovementObserved(true);
    }
  }, [hud, smokeMode, smokeMovementObserved]);

  useEffect(() => {
    if (!smokeMode || smokeCombatObserved || !hud || hud.status !== "playing") {
      return;
    }

    if (
      hud.enemies > 0
      || hud.projectiles > 0
      || hud.defeatedEnemies > 0
      || hud.pickups > 0
    ) {
      setSmokeCombatObserved(true);
    }
  }, [hud, smokeCombatObserved, smokeMode]);

  useEffect(() => {
    if (!smokeMode || smokeEnemyObserved || !hud || hud.status !== "playing") {
      return;
    }

    if (hud.enemies > 0 || hud.defeatedEnemies > 0) {
      setSmokeEnemyObserved(true);
    }
  }, [hud, smokeEnemyObserved, smokeMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeData() {
      try {
        const response = await fetch(API_URL, { cache: "no-store" });
        const payload = await response.json() as ApiResponse<NfoOfflineRuntimeData>;
        const data = parseApiSuccessData<NfoOfflineRuntimeData>(payload);

        if (!response.ok || !data) {
          throw new Error("Local NFO runtime data is not available.");
        }

        if (!cancelled) {
          setRuntimeState({ status: "ready", data });
        }
      } catch (error) {
        if (!cancelled) {
          setRuntimeState({
            status: "error",
            message: error instanceof Error ? error.message : "Unknown load error",
          });
        }
      }
    }

    void loadRuntimeData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!runtimeData) {
      return;
    }

    const nextSave = loadNfoOfflineSave(runtimeData);
    setSaveState(nextSave);
    setSelection(nextSave.lastSelection);
  }, [runtimeData]);

  useEffect(() => {
    if (!runtimeData || !selection || !isSaveReady || !containerRef.current) {
      return;
    }

    let destroyed = false;
    let game: { destroy(removeCanvas?: boolean): void } | null = null;
    const activeRuntimeData = runtimeData;
    const activeSelection = selection;
    const activePaidGlobalUpgradeIds = paidGlobalUpgradeIds;
    setHud(null);

    async function mountGame() {
      const Phaser = await import("phaser");
      if (destroyed || !containerRef.current) {
        return;
      }

      const inputState: NfoInputState = { moveX: 0, moveY: 0 };
      const keys = new Set<string>();
      const NfoPrototypeScene = createNfoPrototypeSceneClass({
        Phaser,
        inputState,
        keys,
        runtimeData: activeRuntimeData,
        selection: activeSelection,
        paidGlobalUpgradeIds: activePaidGlobalUpgradeIds,
        reportHud: (nextHud) => {
          if (!destroyed) {
            setHud(nextHud);
          }
        },
        reportRunEnd: (finishedState) => {
          if (!destroyed) {
            setSaveState((currentSave) => applyNfoRunResultToSave(
              activeRuntimeData,
              currentSave ?? loadNfoOfflineSave(activeRuntimeData),
              finishedState,
            ));
          }
        },
        registerSceneActions: (actions) => {
          if (!destroyed) {
            sceneActionsRef.current = actions;
          }
        },
      });

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: "#111827",
        audio: {
          noAudio: true,
        },
        scene: [NfoPrototypeScene],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      });
    }

    void mountGame();

    return () => {
      destroyed = true;
      sceneActionsRef.current = null;
      game?.destroy(true);
    };
  }, [isSaveReady, paidGlobalUpgradeIds, runtimeData, runKey, selection]);

  const restartRun = useCallback(() => {
    setHud(null);
    setRunKey((current) => current + 1);
  }, []);

  const handleSelectionChange = useCallback((
    key: "characterId" | "levelId" | "weaponId",
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    if (!runtimeData || !selection) {
      return;
    }

    const nextSelection = {
      ...selection,
      [key]: Number(event.target.value),
    };
    setSelection(nextSelection);
    setHud(null);
    setRunKey((current) => current + 1);
    setSaveState((currentSave) => updateNfoOfflineSaveSelection(
      runtimeData,
      currentSave ?? loadNfoOfflineSave(runtimeData),
      nextSelection,
    ));
  }, [runtimeData, selection]);

  const handleEquipSelectionChange = useCallback((
    slotIndex: number,
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    if (!runtimeData || !selection) {
      return;
    }

    const equipId = Number(event.target.value);
    const equipIds = [...selection.equipIds];
    if (equipId > 0) {
      equipIds[slotIndex] = equipId;
    } else {
      equipIds.splice(slotIndex, 1);
    }

    const nextSelection = {
      ...selection,
      equipIds,
    };
    setSelection(nextSelection);
    setHud(null);
    setRunKey((current) => current + 1);
    setSaveState((currentSave) => updateNfoOfflineSaveSelection(
      runtimeData,
      currentSave ?? loadNfoOfflineSave(runtimeData),
      nextSelection,
    ));
  }, [runtimeData, selection]);

  const resetSave = useCallback(() => {
    if (!runtimeData) {
      return;
    }

    const nextSave = resetNfoOfflineSave(runtimeData);
    setSaveState(nextSave);
    setSelection(nextSave.lastSelection);
    setHud(null);
    setRunKey((current) => current + 1);
  }, [runtimeData]);

  const unlockAll = useCallback(() => {
    if (!runtimeData) {
      return;
    }

    const nextSave = unlockAllNfoOfflineContent(
      runtimeData,
      saveState ?? loadNfoOfflineSave(runtimeData),
    );
    setSaveState(nextSave);
    setSelection(nextSave.lastSelection);
    setHud(null);
    setRunKey((current) => current + 1);
  }, [runtimeData, saveState]);

  const grantCoin = useCallback(() => {
    if (!runtimeData) {
      return;
    }

    setSaveState((currentSave) => grantNfoUpgradeCoin(
      currentSave ?? loadNfoOfflineSave(runtimeData),
      500,
    ));
  }, [runtimeData]);

  const quickClear = useCallback(() => {
    sceneActionsRef.current?.forceClear();
  }, []);

  const activateActiveSkill = useCallback(() => {
    sceneActionsRef.current?.activateActiveSkill();
  }, []);

  const smokeAllUnlocked = useMemo(() => {
    if (!runtimeData || !saveState) {
      return false;
    }

    return (
      saveState.unlockedLevelIds.length === runtimeData.levels.length
      && saveState.unlockedWeaponIds.length === runtimeData.weapons.length
      && saveState.unlockedEquipIds.length === runtimeData.equips.length
    );
  }, [runtimeData, saveState]);

  const upgradeView = useMemo(() => {
    if (!runtimeData || !selection || !saveState) {
      return null;
    }

    const upgrades = getRuntimeGlobalUpgradesForCharacter(
      runtimeData,
      selection.characterId,
    ).sort((left, right) => (
      left.posY - right.posY || left.posX - right.posX || left.id - right.id
    ));
    const paidIds = new Set(saveState.paidGlobalUpgradeIds);
    const nextUpgrade = upgrades.find((upgrade) => {
      const purchaseState = getNfoGlobalUpgradePurchaseState(saveState, upgrade);
      return !paidIds.has(upgrade.id) && purchaseState.hasParent;
    }) ?? upgrades.find((upgrade) => !paidIds.has(upgrade.id)) ?? null;

    return {
      totalCount: upgrades.length,
      paidCount: upgrades.filter((upgrade) => paidIds.has(upgrade.id)).length,
      nextUpgrade,
      purchaseState: nextUpgrade
        ? getNfoGlobalUpgradePurchaseState(saveState, nextUpgrade)
        : null,
    };
  }, [runtimeData, saveState, selection]);

  const nextUpgradeId = upgradeView?.nextUpgrade?.id ?? 0;

  const buyUpgrade = useCallback(() => {
    if (!runtimeData || !saveState || nextUpgradeId <= 0) {
      return;
    }

    const nextSave = buyNfoGlobalUpgrade(
      runtimeData,
      saveState,
      nextUpgradeId,
    );
    if (nextSave === saveState) {
      return;
    }

    setSaveState(nextSave);
    setHud(null);
    setRunKey((current) => current + 1);
  }, [nextUpgradeId, runtimeData, saveState]);

  useEffect(() => {
    if (!smokeMode) {
      return;
    }

    if (runtimeState.status === "error") {
      setSmokeInteractionState("error");
      return;
    }

    if (!runtimeData || !saveState || !selection) {
      setSmokeInteractionState("waiting-runtime");
      return;
    }

    if (
      smokeInteractionState === "waiting-runtime"
      && !smokeAllUnlocked
    ) {
      setSmokeInteractionState("unlock-requested");
      unlockAll();
      return;
    }

    if (
      (
        smokeInteractionState === "waiting-runtime"
        || smokeInteractionState === "unlock-requested"
      )
      && smokeAllUnlocked
    ) {
      if (paidGlobalUpgradeCount > 0) {
        setSmokeInteractionState("waiting-scene");
        return;
      }

      setSmokeInteractionState("coin-requested");
      grantCoin();
      return;
    }

    if (smokeInteractionState === "coin-requested") {
      if (paidGlobalUpgradeCount > 0) {
        setSmokeInteractionState("waiting-scene");
        return;
      }

      if (upgradeCoin <= 0) {
        return;
      }

      if (!upgradeView?.nextUpgrade || !upgradeView.purchaseState?.canBuy) {
        setSmokeInteractionState("error");
        return;
      }

      setSmokeInteractionState("upgrade-requested");
      buyUpgrade();
      return;
    }

    if (
      smokeInteractionState === "upgrade-requested"
      && paidGlobalUpgradeCount > 0
    ) {
      setSmokeInteractionState("waiting-scene");
      return;
    }

    if (
      smokeInteractionState === "waiting-scene"
      && sceneActionsRef.current
      && hud?.status === "playing"
    ) {
      if (!smokeMovementObserved) {
        smokeMovementStartRef.current = {
          x: hud.playerX,
          y: hud.playerY,
        };
        setSmokeInteractionState("movement-requested");
        sceneActionsRef.current.startSmokeMove();
        return;
      }

      if (!smokeEnemyObserved) {
        setSmokeInteractionState("enemy-spawn-requested");
        sceneActionsRef.current.advanceSmokeFrames(12);
        return;
      }

      if (!smokeCombatObserved) {
        return;
      }

      if (!smokeActiveSkillObserved && hud.activeSkillId > 0) {
        if (hud.activeSkillChargeFrames < hud.activeSkillChargeMaxFrames) {
          setSmokeInteractionState("active-skill-ready-requested");
          sceneActionsRef.current.readyActiveSkill();
          return;
        }

        setSmokeInteractionState("active-skill-requested");
        activateActiveSkill();
        return;
      }

      setSmokeInteractionState("quick-clear-requested");
      quickClear();
      return;
    }

    if (
      smokeInteractionState === "movement-requested"
      && smokeMovementObserved
    ) {
      setSmokeInteractionState("waiting-scene");
      return;
    }

    if (
      smokeInteractionState === "enemy-spawn-requested"
      && sceneActionsRef.current
      && hud?.status === "playing"
    ) {
      if (smokeEnemyObserved) {
        setSmokeInteractionState("waiting-scene");
        return;
      }

      sceneActionsRef.current.advanceSmokeFrames(12);
      return;
    }

    if (
      smokeInteractionState === "active-skill-ready-requested"
      && sceneActionsRef.current
      && hud?.status === "playing"
    ) {
      if (
        hud.activeSkillChargeMaxFrames <= 0
        || hud.activeSkillChargeFrames >= hud.activeSkillChargeMaxFrames
      ) {
        setSmokeInteractionState("active-skill-requested");
        activateActiveSkill();
      }
      return;
    }

    if (
      smokeInteractionState === "active-skill-requested"
      && (smokeActiveSkillObserved || hud?.activeSkillActive)
    ) {
      setSmokeActiveSkillObserved(true);
      setSmokeInteractionState("waiting-scene");
      return;
    }

    if (
      smokeInteractionState === "quick-clear-requested"
      && hud?.status === "cleared"
    ) {
      if (!saveState || saveState.totalRuns <= 0 || !selectedLevelCleared) {
        return;
      }

      setSmokeInteractionState("complete");
    }
  }, [
    activateActiveSkill,
    buyUpgrade,
    grantCoin,
    hud?.activeSkillActive,
    hud?.activeSkillChargeFrames,
    hud?.activeSkillChargeMaxFrames,
    hud?.activeSkillId,
    hud?.playerX,
    hud?.playerY,
    hud?.status,
    paidGlobalUpgradeCount,
    quickClear,
    runtimeData,
    runtimeState.status,
    saveState,
    selection,
    selectedLevelCleared,
    smokeActiveSkillObserved,
    smokeAllUnlocked,
    smokeCombatObserved,
    smokeEnemyObserved,
    smokeInteractionState,
    smokeMovementObserved,
    smokeMode,
    unlockAll,
    upgradeCoin,
    upgradeView?.nextUpgrade,
    upgradeView?.purchaseState?.canBuy,
  ]);

  const runtimeSummary = useMemo(() => {
    if (!runtimeData || !selection) {
      return null;
    }

    const character = getRuntimeCharacter(runtimeData, selection.characterId);
    const level = getRuntimeLevel(runtimeData, selection.levelId);
    const weapon = getRuntimeWeapon(runtimeData, selection.weaponId);
    const activeSkill = character
      ? getRuntimeActiveSkill(runtimeData, character.activeSkillId)
      : null;
    const equipNames = selection.equipIds
      .map((equipId) => getRuntimeEquip(runtimeData, equipId)?.name)
      .filter((name): name is string => Boolean(name));
    const mapPrefab = level ? getRuntimeMapPrefab(runtimeData, level.mapPrefabName) : null;
    const map = level ? getRuntimeMap(runtimeData, level.mapPrefabName) : null;
    return {
      characterName: character?.name ?? "Unknown",
      activeSkillName: activeSkill?.name ?? "None",
      levelName: level?.name ?? "Unknown",
      weaponName: weapon?.name ?? "Unknown",
      equipNames: equipNames.length > 0 ? equipNames.join(", ") : "None",
      maxEquipCount: character?.maxEquipCount ?? 0,
      mapPrefabName: level?.mapPrefabName ?? "Unknown",
      mapLayerCount: mapPrefab?.layerCount ?? 0,
      mapTileCount: mapPrefab?.tileCount ?? 0,
      mapPitCount: map?.terrainPits.length ?? 0,
      resourceVersion: runtimeData.resourceVersion,
      characterCount: runtimeData.characters.length,
      levelCount: runtimeData.levels.length,
      enemyCount: runtimeData.enemies.length,
      weaponCount: runtimeData.weapons.length,
      equipCount: runtimeData.equips.length,
      itemCount: runtimeData.items.length,
      dropCount: runtimeData.drops.length,
      minionCount: runtimeData.minions.length,
      activeSkillCount: runtimeData.activeSkills.length,
      mapPrefabCount: runtimeData.mapPrefabs.length,
      globalUpgradeCount: runtimeData.globalUpgrades.length,
    };
  }, [runtimeData, selection]);

  return (
    <section className="space-y-4">
      <div
        id="nfo-smoke-state"
        hidden
        data-nfo-smoke-mode={smokeMode ? "1" : "0"}
        data-nfo-smoke-state={smokeInteractionState}
        data-nfo-runtime-status={runtimeState.status}
        data-nfo-save-ready={saveState ? "1" : "0"}
        data-nfo-hud-status={hud?.status ?? "none"}
        data-nfo-player-x={hud?.playerX ?? 0}
        data-nfo-player-y={hud?.playerY ?? 0}
        data-nfo-player-moved={smokeMovementObserved ? "1" : "0"}
        data-nfo-combat-observed={smokeCombatObserved ? "1" : "0"}
        data-nfo-enemy-observed={smokeEnemyObserved ? "1" : "0"}
        data-nfo-enemy-count={hud?.enemies ?? 0}
        data-nfo-projectile-count={hud?.projectiles ?? 0}
        data-nfo-defeated-enemy-count={hud?.defeatedEnemies ?? 0}
        data-nfo-pickup-count={hud?.pickups ?? 0}
        data-nfo-full-screen-effect-count={hud?.fullScreenEffectCount ?? 0}
        data-nfo-full-screen-effect-name={hud?.fullScreenEffectName ?? ""}
        data-nfo-active-skill-id={hud?.activeSkillId ?? 0}
        data-nfo-active-skill-charge-frames={hud?.activeSkillChargeFrames ?? 0}
        data-nfo-active-skill-charge-max-frames={hud?.activeSkillChargeMaxFrames ?? 0}
        data-nfo-active-skill-observed={smokeActiveSkillObserved ? "1" : "0"}
        data-nfo-all-unlocked={smokeAllUnlocked ? "1" : "0"}
        data-nfo-upgrade-coin={upgradeCoin}
        data-nfo-total-runs={saveState?.totalRuns ?? 0}
        data-nfo-cleared-level-count={saveState?.clearedLevelIds.length ?? 0}
        data-nfo-selected-level-cleared={selectedLevelCleared ? "1" : "0"}
        data-nfo-total-defeated-enemies={saveState?.totalDefeatedEnemies ?? 0}
        data-nfo-paid-upgrade-count={paidGlobalUpgradeCount}
        data-nfo-upgrade-total-count={upgradeView?.totalCount ?? 0}
        data-nfo-next-upgrade-id={upgradeView?.nextUpgrade?.id ?? 0}
        data-nfo-character-count={runtimeData?.characters.length ?? 0}
        data-nfo-weapon-count={runtimeData?.weapons.length ?? 0}
        data-nfo-level-count={runtimeData?.levels.length ?? 0}
      />
      <div className="grid gap-3 md:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded border border-gray-200 bg-gray-950 shadow-sm dark:border-gray-800">
          <div ref={containerRef} className="aspect-video w-full" />
        </div>

        <aside className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
          {runtimeData && selection ? (
            <div className="mb-4 space-y-3 border-b border-gray-200 pb-4 dark:border-gray-800">
              <SelectControl
                label="Character"
                value={String(selection.characterId)}
                options={runtimeData.characters.map((character) => {
                  const isUnlocked = saveState?.unlockedCharacterIds.includes(character.id) ?? true;
                  return {
                    value: String(character.id),
                    label: isUnlocked ? character.name : `${character.name} (Locked)`,
                    disabled: !isUnlocked,
                  };
                })}
                onChange={(event) => handleSelectionChange("characterId", event)}
              />
              <SelectControl
                label="Level"
                value={String(selection.levelId)}
                options={runtimeData.levels.map((level) => {
                  const isUnlocked = saveState?.unlockedLevelIds.includes(level.id) ?? true;
                  return {
                    value: String(level.id),
                    label: isUnlocked ? level.name : `${level.name} (Locked)`,
                    disabled: !isUnlocked,
                  };
                })}
                onChange={(event) => handleSelectionChange("levelId", event)}
              />
              <SelectControl
                label="Weapon"
                value={String(selection.weaponId)}
                options={runtimeData.weapons.map((weapon) => {
                  const isUnlocked = saveState?.unlockedWeaponIds.includes(weapon.id) ?? true;
                  return {
                    value: String(weapon.id),
                    label: isUnlocked ? weapon.name : `${weapon.name} (Locked)`,
                    disabled: !isUnlocked,
                  };
                })}
                onChange={(event) => handleSelectionChange("weaponId", event)}
              />
              {Array.from({ length: runtimeSummary?.maxEquipCount ?? 0 }, (_, slotIndex) => {
                const selectedOtherEquipIds = new Set(
                  selection.equipIds.filter((_, index) => index !== slotIndex),
                );
                return (
                  <SelectControl
                    key={slotIndex}
                    label={`Equip ${slotIndex + 1}`}
                    value={String(selection.equipIds[slotIndex] ?? 0)}
                    options={[
                      { value: "0", label: "None" },
                      ...runtimeData.equips.map((equip) => {
                        const isUnlocked = saveState?.unlockedEquipIds.includes(equip.id) ?? true;
                        const isSelectedElsewhere = selectedOtherEquipIds.has(equip.id);
                        return {
                          value: String(equip.id),
                          label: isUnlocked ? equip.name : `${equip.name} (Locked)`,
                          disabled: !isUnlocked || isSelectedElsewhere,
                        };
                      }),
                    ]}
                    onChange={(event) => handleEquipSelectionChange(slotIndex, event)}
                  />
                );
              })}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={restartRun}
                  className="rounded border border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  Restart
                </button>
                <button
                  type="button"
                  onClick={activateActiveSkill}
                  disabled={!hud || hud.activeSkillId <= 0 || (
                    !hud.activeSkillActive
                    && hud.activeSkillChargeFrames < hud.activeSkillChargeMaxFrames
                  )}
                  className={cn(
                    "inline-flex items-center justify-center gap-1 rounded border px-2 py-2 text-xs font-medium",
                    hud && hud.activeSkillId > 0 && (
                      hud.activeSkillActive
                      || hud.activeSkillChargeFrames >= hud.activeSkillChargeMaxFrames
                    )
                      ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
                      : "border-gray-200 text-gray-400 dark:border-gray-800 dark:text-gray-600",
                  )}
                >
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  Active skill
                </button>
                <button
                  type="button"
                  onClick={quickClear}
                  className="rounded border border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  Quick clear
                </button>
                <button
                  type="button"
                  onClick={grantCoin}
                  className="rounded border border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  Coin +500
                </button>
                <button
                  type="button"
                  onClick={unlockAll}
                  className="inline-flex items-center justify-center gap-1 rounded border border-emerald-300 px-2 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                >
                  <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                  Unlock all
                </button>
                <button
                  type="button"
                  onClick={resetSave}
                  className="rounded border border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  Reset save
                </button>
              </div>
              {upgradeView ? (
                <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
                  <Metric
                    label="Upgrades"
                    value={`${upgradeView.paidCount}/${upgradeView.totalCount}`}
                  />
                  {upgradeView.nextUpgrade ? (
                    <div className="mt-3 space-y-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {upgradeView.nextUpgrade.name}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {formatGlobalUpgradeEffect(upgradeView.nextUpgrade)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={buyUpgrade}
                        disabled={!upgradeView.purchaseState?.canBuy}
                        className={cn(
                          "w-full rounded border px-3 py-2 text-xs font-medium",
                          upgradeView.purchaseState?.canBuy
                            ? "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/70 dark:bg-amber-950/40 dark:text-amber-200"
                            : "border-gray-200 text-gray-400 dark:border-gray-800 dark:text-gray-600",
                        )}
                      >
                        Buy {upgradeView.nextUpgrade.cost}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            <Metric label="Snapshot" value={runtimeSummary?.resourceVersion ?? "..."} />
            <Metric label="Character" value={runtimeSummary?.characterName ?? "..."} />
            <Metric label="Skill" value={runtimeSummary?.activeSkillName ?? "..."} />
            <Metric label="Level" value={runtimeSummary?.levelName ?? "..."} />
            <Metric label="Weapon" value={runtimeSummary?.weaponName ?? "..."} />
            <Metric label="Equips" value={runtimeSummary?.equipNames ?? "..."} />
            <Metric
              label="Map"
              value={runtimeSummary
                ? `${runtimeSummary.mapPrefabName} ${runtimeSummary.mapLayerCount}/${runtimeSummary.mapTileCount}`
                : "..."}
            />
            <Metric label="Pits" value={runtimeSummary ? String(runtimeSummary.mapPitCount) : "..."} />
            <Metric label="HP" value={hud ? `${hud.hp}/${hud.maxHp}` : "..."} />
            <Metric label="ATK" value={hud ? String(hud.attack) : "..."} />
            <Metric label="DEF" value={hud ? String(hud.defense) : "..."} />
            <Metric label="SPD" value={hud ? String(Math.round(hud.speed)) : "..."} />
            <Metric label="Magnet" value={hud ? String(Math.round(hud.itemMagnetRange)) : "..."} />
            <Metric
              label="Bullet Mods"
              value={hud ? `SPD +${hud.bulletSpeed} / Count +${hud.bulletCount}` : "..."}
            />
            <Metric
              label="Range/Time"
              value={hud ? `+${hud.bulletSize} / +${hud.bulletLifeTime}f` : "..."}
            />
            <Metric
              label="CD/EXP"
              value={hud ? `-${hud.coolDownReduce}% / +${hud.expGain}%` : "..."}
            />
            <Metric
              label="Crit"
              value={hud ? `${hud.criticalRate}% / ${hud.criticalDamage}%` : "..."}
            />
            <Metric label="Weapon Lv" value={hud ? String(hud.weaponLevel) : "..."} />
            <Metric label="Skill Gauge" value={formatActiveSkillGauge(hud)} />
            <Metric
              label="Lv EXP"
              value={hud ? `${hud.expIntoLevel}/${hud.expToNextLevel || "Max"}` : "..."}
            />
            <Metric label="Equip Count" value={hud ? String(hud.equipCount) : "..."} />
            <Metric label="Time" value={hud ? `${hud.elapsedSeconds.toFixed(1)}s` : "..."} />
            <Metric label="Enemies" value={hud ? String(hud.enemies) : "..."} />
            <Metric label="Minions" value={hud ? String(hud.minions) : "..."} />
            <Metric label="Defeated" value={hud ? String(hud.defeatedEnemies) : "..."} />
            <Metric label="Pickups" value={hud ? String(hud.pickups) : "..."} />
            <Metric label="EXP" value={hud ? String(hud.collectedExp) : "..."} />
            <Metric label="Coin" value={hud ? String(hud.collectedCoin) : "..."} />
            <Metric label="Bank" value={saveState ? String(saveState.upgradeCoin) : "..."} />
            <Metric label="Runs" value={saveState ? String(saveState.totalRuns) : "..."} />
            <Metric label="Cleared" value={saveState ? String(saveState.clearedLevelIds.length) : "..."} />
            <Metric label="Unlocked" value={saveState ? String(saveState.unlockedLevelIds.length) : "..."} />
            <Metric
              label="State"
              value={hud?.status ?? runtimeState.status}
              valueClassName={cn(
                hud?.status === "cleared" && "text-emerald-600 dark:text-emerald-300",
                hud?.status === "failed" && "text-red-600 dark:text-red-300",
              )}
            />
          </div>
        </aside>
      </div>

      {runtimeSummary ? (
        <div className="grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Characters" value={String(runtimeSummary.characterCount)} compact />
          <Metric label="Levels" value={String(runtimeSummary.levelCount)} compact />
          <Metric label="Enemies" value={String(runtimeSummary.enemyCount)} compact />
          <Metric label="Weapons" value={String(runtimeSummary.weaponCount)} compact />
          <Metric label="Equips" value={String(runtimeSummary.equipCount)} compact />
          <Metric label="Items" value={String(runtimeSummary.itemCount)} compact />
          <Metric label="Drops" value={String(runtimeSummary.dropCount)} compact />
          <Metric label="Minions" value={String(runtimeSummary.minionCount)} compact />
          <Metric label="Skills" value={String(runtimeSummary.activeSkillCount)} compact />
          <Metric label="Map prefabs" value={String(runtimeSummary.mapPrefabCount)} compact />
          <Metric label="Upgrades" value={String(runtimeSummary.globalUpgradeCount)} compact />
        </div>
      ) : null}

      {runtimeState.status === "error" ? (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {runtimeState.message}
        </p>
      ) : null}
    </section>
  );
}

function createNfoPrototypeSceneClass({
  Phaser,
  inputState,
  keys,
  runtimeData,
  selection,
  paidGlobalUpgradeIds,
  reportHud,
  reportRunEnd,
  registerSceneActions,
}: {
  Phaser: PhaserModule;
  inputState: NfoInputState;
  keys: Set<string>;
  runtimeData: NfoOfflineRuntimeData;
  selection: NfoSimulationSelection;
  paidGlobalUpgradeIds: number[];
  reportHud: (hud: HudSnapshot) => void;
  reportRunEnd: (state: NfoSimulationState) => void;
  registerSceneActions: (actions: NfoSceneActions) => void;
}) {
  let simState = createNfoSimulation(runtimeData, {
    ...selection,
    paidGlobalUpgradeIds,
  });
  let lastHudUpdate = 0;
  let runResultReported = false;
  return class NfoPrototypeScene extends Phaser.Scene {
    private graphics?: import("phaser").GameObjects.Graphics;

    constructor() {
      super("nfo-prototype");
    }

    create() {
      this.graphics = this.add.graphics();
      const advanceSimulationFrames = (
        frameCount: number,
        inputOverride?: Partial<NfoInputState>,
      ) => {
        const steps = Math.max(1, Math.min(120, Math.floor(frameCount)));
        for (let index = 0; index < steps && simState.status === "playing"; index += 1) {
          simState = updateNfoSimulation(
            simState,
            runtimeData,
            { ...inputState, ...inputOverride },
            1 / 30,
          );
        }
        if (this.graphics) {
          drawScene(this.graphics, simState);
        }
        reportHud(toHudSnapshot(simState));
      };

      registerSceneActions({
        forceClear: () => {
          if (simState.status !== "playing") {
            return;
          }
          simState = clearNfoSimulation(simState, runtimeData);
          drawScene(this.graphics, simState);
          reportHud(toHudSnapshot(simState));
          if (!runResultReported) {
            runResultReported = true;
            reportRunEnd(simState);
          }
        },
        activateActiveSkill: () => {
          if (simState.status !== "playing" || simState.activeSkill.id <= 0) {
            return;
          }

          simState = updateNfoSimulation(
            simState,
            runtimeData,
            { ...inputState, useActiveSkill: true },
            0,
          );
          inputState.useActiveSkill = false;
          if (this.graphics) {
            drawScene(this.graphics, simState);
          }
          reportHud(toHudSnapshot(simState));
        },
        readyActiveSkill: () => {
          if (simState.status !== "playing" || simState.activeSkill.id <= 0) {
            return;
          }

          simState = {
            ...simState,
            activeSkill: {
              ...simState.activeSkill,
              chargeFrames: simState.activeSkill.chargeMaxFrames,
            },
          };
          reportHud(toHudSnapshot(simState));
        },
        startSmokeMove: () => {
          advanceSimulationFrames(24, { moveX: 1, moveY: 0, useActiveSkill: false });
        },
        advanceSmokeFrames: (frameCount) => {
          advanceSimulationFrames(frameCount, { useActiveSkill: false });
        },
      });
      this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
        keys.add(event.code);
      });
      this.input.keyboard?.on("keyup", (event: KeyboardEvent) => {
        keys.delete(event.code);
      });
      drawScene(this.graphics, simState);
      reportHud(toHudSnapshot(simState));
    }

    update(time: number, delta: number) {
      const requestedActiveSkill = inputState.useActiveSkill
        || keys.has("Space")
        || keys.has("KeyE");
      updateInputState(keys, inputState);
      simState = updateNfoSimulation(
        simState,
        runtimeData,
        inputState,
        Math.min(delta / 1000, 0.05),
      );
      inputState.useActiveSkill = false;
      drawScene(this.graphics, simState);

      if (
        requestedActiveSkill
        || simState.activeSkill.isActive
        || time - lastHudUpdate > 120
        || simState.status !== "playing"
      ) {
        lastHudUpdate = time;
        reportHud(toHudSnapshot(simState));
      }

      if (simState.status !== "playing" && !runResultReported) {
        runResultReported = true;
        reportRunEnd(simState);
      }
    }
  };
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 outline-none focus:border-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({
  label,
  value,
  compact = false,
  valueClassName,
}: {
  label: string;
  value: string;
  compact?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", compact && "rounded border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950")}>
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={cn("min-w-0 break-words text-right font-mono font-medium text-gray-900 dark:text-gray-100", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function formatGlobalUpgradeEffect(upgrade: NfoGlobalUpgradeData): string {
  const attributes = upgrade.attributes.map((attribute) => (
    `${getAttributeLabel(attribute.attributeType)} +${attribute.value}`
  ));
  const unlocks = [
    upgrade.unlockWeaponId > 0 ? `Weapon ${upgrade.unlockWeaponId}` : "",
    upgrade.unlockEquipId > 0 ? `Equip ${upgrade.unlockEquipId}` : "",
    upgrade.initialWeaponLevelReplace > 0
      ? `Initial weapon Lv ${upgrade.initialWeaponLevelReplace}`
      : "",
  ].filter(Boolean);

  return [...attributes, ...unlocks].join(" / ") || upgrade.description || "Unlock";
}

function getAttributeLabel(attributeType: number): string {
  if (attributeType === 0 || attributeType === 1) {
    return "HP";
  }
  if (attributeType === 2) {
    return "ATK";
  }
  if (attributeType === 3) {
    return "DEF";
  }
  if (attributeType === 4) {
    return "SPD";
  }
  if (attributeType === 5) {
    return "Magnet";
  }
  if (attributeType === 7) {
    return "Bullet size";
  }
  if (attributeType === 10) {
    return "Cooldown";
  }
  if (attributeType === 12) {
    return "Crit";
  }
  if (attributeType === 13) {
    return "Crit DMG";
  }
  return `Attr ${attributeType}`;
}

function updateInputState(keys: Set<string>, inputState: NfoInputState) {
  const requestedActiveSkill = inputState.useActiveSkill === true;
  inputState.moveX = 0;
  inputState.moveY = 0;

  if (keys.has("ArrowLeft") || keys.has("KeyA")) {
    inputState.moveX -= 1;
  }
  if (keys.has("ArrowRight") || keys.has("KeyD")) {
    inputState.moveX += 1;
  }
  if (keys.has("ArrowUp") || keys.has("KeyW")) {
    inputState.moveY -= 1;
  }
  if (keys.has("ArrowDown") || keys.has("KeyS")) {
    inputState.moveY += 1;
  }

  inputState.useActiveSkill = requestedActiveSkill
    || keys.has("Space")
    || keys.has("KeyE");
}

function drawScene(
  graphics: import("phaser").GameObjects.Graphics | undefined,
  state: NfoSimulationState,
) {
  if (!graphics) {
    return;
  }

  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;
  const cameraX = state.player.x - centerX;
  const cameraY = state.player.y - centerY;

  graphics.clear();
  graphics.lineStyle(1, 0x374151, 0.55);
  const gridStartX = Math.floor(cameraX / TILE_SIZE) * TILE_SIZE - TILE_SIZE;
  const gridEndX = cameraX + CANVAS_WIDTH + TILE_SIZE;
  const gridStartY = Math.floor(cameraY / TILE_SIZE) * TILE_SIZE - TILE_SIZE;
  const gridEndY = cameraY + CANVAS_HEIGHT + TILE_SIZE;
  for (let x = gridStartX; x <= gridEndX; x += TILE_SIZE) {
    graphics.lineBetween(x - cameraX, 0, x - cameraX, CANVAS_HEIGHT);
  }
  for (let y = gridStartY; y <= gridEndY; y += TILE_SIZE) {
    graphics.lineBetween(0, y - cameraY, CANVAS_WIDTH, y - cameraY);
  }

  graphics.fillStyle(0x020617, 0.82);
  graphics.lineStyle(1, 0x334155, 0.5);
  for (const pit of state.terrain.pitTiles) {
    const x = pit.x - cameraX;
    const y = pit.y - cameraY;
    if (
      x > CANVAS_WIDTH
      || y > CANVAS_HEIGHT
      || x + pit.size < 0
      || y + pit.size < 0
    ) {
      continue;
    }

    graphics.fillRect(x, y, pit.size, pit.size);
    graphics.strokeRect(x, y, pit.size, pit.size);
  }

  graphics.lineStyle(2, 0x38bdf8, 0.65);
  graphics.strokeRect(
    state.worldBounds.minX - cameraX,
    state.worldBounds.minY - cameraY,
    state.worldBounds.maxX - state.worldBounds.minX,
    state.worldBounds.maxY - state.worldBounds.minY,
  );

  graphics.fillStyle(0x60a5fa, 1);
  graphics.fillCircle(centerX, centerY, Math.max(12, state.player.radius * 0.35));

  for (const minion of state.minions) {
    const x = minion.x - cameraX;
    const y = minion.y - cameraY;
    graphics.fillStyle(0x34d399, 0.95);
    graphics.fillCircle(x, y, Math.max(7, minion.radius * 0.3));
    graphics.lineStyle(1, 0xa7f3d0, 0.8);
    graphics.strokeCircle(x, y, Math.max(10, minion.radius * 0.42));
  }

  for (const enemy of state.enemies) {
    const x = enemy.x - cameraX;
    const y = enemy.y - cameraY;
    graphics.fillStyle(enemy.isBoss ? 0xc084fc : 0xf87171, 0.95);
    graphics.fillCircle(x, y, Math.max(8, enemy.radius * 0.28));
    graphics.fillStyle(0x111827, 0.85);
    graphics.fillRect(x - 18, y - 24, 36, 4);
    graphics.fillStyle(0x22c55e, 0.9);
    graphics.fillRect(x - 18, y - 24, 36 * Math.max(enemy.hp / enemy.maxHp, 0), 4);
  }

  graphics.fillStyle(0xfbbf24, 1);
  for (const bullet of state.bullets) {
    graphics.fillCircle(
      bullet.x - cameraX,
      bullet.y - cameraY,
      Math.max(3, bullet.radius * 0.25),
    );
  }

  for (const pickup of state.pickups) {
    const color = pickup.itemType === 5
      ? 0xfacc15
      : pickup.itemType === 4
        ? 0xfb7185
        : 0x4ade80;
    graphics.fillStyle(color, 0.95);
    graphics.fillCircle(
      pickup.x - cameraX,
      pickup.y - cameraY,
      Math.max(5, pickup.radius * 0.45),
    );
  }

  drawFullScreenEffects(graphics, state);

  if (state.status !== "playing") {
    graphics.fillStyle(0x020617, 0.55);
    graphics.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    graphics.fillStyle(state.status === "cleared" ? 0x86efac : 0xfca5a5, 1);
    graphics.fillRoundedRect(CANVAS_WIDTH / 2 - 120, CANVAS_HEIGHT / 2 - 28, 240, 56, 6);
  }
}

function drawFullScreenEffects(
  graphics: import("phaser").GameObjects.Graphics,
  state: NfoSimulationState,
) {
  const latestEffect = state.fullScreenEffects.at(-1);
  if (!latestEffect) {
    return;
  }

  const renderProgress = Math.max(
    0,
    Math.min(1, latestEffect.remainingSeconds / FULL_SCREEN_EFFECT_RENDER_SECONDS),
  );
  const { fill, stroke } = getFullScreenEffectRenderColors(latestEffect.name);
  const alpha = 0.08 + renderProgress * 0.32;

  graphics.fillStyle(fill, alpha);
  graphics.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  graphics.lineStyle(3, stroke, Math.min(0.9, alpha + 0.25));
  graphics.strokeCircle(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 120 + (1 - renderProgress) * 260);
  graphics.lineStyle(1, 0xffffff, Math.min(0.65, alpha + 0.15));
  graphics.strokeCircle(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 220 + (1 - renderProgress) * 220);
}

function getFullScreenEffectRenderColors(effectName: string) {
  if (effectName.includes("starlight")) {
    return { fill: 0x2563eb, stroke: 0xa78bfa };
  }
  if (effectName.includes("song")) {
    return { fill: 0xfacc15, stroke: 0x22d3ee };
  }

  return { fill: 0xf8fafc, stroke: 0xfb7185 };
}

function toHudSnapshot(state: NfoSimulationState): HudSnapshot {
  const latestFullScreenEffect = state.fullScreenEffects.at(-1);

  return {
    status: state.status,
    hp: Math.ceil(state.player.hp),
    maxHp: state.player.maxHp,
    elapsedSeconds: state.elapsedSeconds,
    enemies: state.enemies.length,
    minions: state.minions.length,
    projectiles: state.bullets.length,
    defeatedEnemies: state.defeatedEnemies,
    pickups: state.pickups.length,
    collectedExp: state.collectedExp,
    collectedCoin: state.collectedCoin,
    score: state.score,
    playerX: state.player.x,
    playerY: state.player.y,
    attack: state.player.attack,
    defense: state.player.defense,
    speed: state.player.speed,
    itemMagnetRange: state.player.itemMagnetRange,
    bulletSpeed: state.player.bulletSpeed,
    bulletSize: state.player.bulletSize,
    bulletLifeTime: state.player.bulletLifeTime,
    bulletCount: state.player.bulletCount,
    coolDownReduce: state.player.coolDownReduce,
    expGain: state.player.expGain,
    criticalRate: state.player.criticalRate,
    criticalDamage: state.player.criticalDamage,
    weaponLevel: state.player.weaponLevel,
    expIntoLevel: state.player.expIntoLevel,
    expToNextLevel: state.player.expToNextLevel,
    equipCount: state.player.equipCount,
    globalUpgradeCount: state.player.globalUpgradeCount,
    activeSkillId: state.activeSkill.id,
    activeSkillChargeFrames: Math.floor(state.activeSkill.chargeFrames),
    activeSkillChargeMaxFrames: Math.max(0, Math.floor(state.activeSkill.chargeMaxFrames)),
    activeSkillActive: state.activeSkill.isActive,
    fullScreenEffectCount: state.fullScreenEffects.length,
    fullScreenEffectName: latestFullScreenEffect?.name ?? "",
  };
}

function formatActiveSkillGauge(hud: HudSnapshot | null): string {
  if (!hud) {
    return "...";
  }

  if (hud.activeSkillId <= 0) {
    return "None";
  }

  if (hud.activeSkillActive) {
    return "Active";
  }

  const maxCharge = Math.max(0, hud.activeSkillChargeMaxFrames);
  if (maxCharge <= 0 || hud.activeSkillChargeFrames >= maxCharge) {
    return "Ready";
  }

  return `${Math.min(hud.activeSkillChargeFrames, maxCharge)}/${maxCharge}`;
}
