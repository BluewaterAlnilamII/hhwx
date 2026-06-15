from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

DEPLOYABLE_RUNTIME_OUTPUT = Path(
    "public/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json",
)


TARGET_DATASET_NAMES = {
    "ActiveSkillData",
    "AIData",
    "AudioData",
    "BuffData",
    "BulletData",
    "BulletShooterData",
    "CharacterData",
    "DropData",
    "EnemyData",
    "EquipData",
    "GameDefaultData",
    "GlobalUpgradeData",
    "ItemData",
    "LevelData",
    "LocalizeTextData",
    "MapData",
    "MasterDataVersion",
    "MinionData",
    "MultiplayConfigData",
    "SkinData",
    "WeaponData",
}

MAP_PREFAB_NAME_RE = re.compile(r"^(?:Map_\d{2}|TestMap)$")
TYPE_TREE_FILE_RE = re.compile(r"^(-?\d+)-([^-]+)-.*\.json$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export CN NFO typetree data into a runtime-friendly JSON bundle.",
    )
    parser.add_argument(
        "--snapshot",
        default="temp/nfo-offline/cn/Android-2.1.1",
        help="Snapshot directory inspected by scripts/nfo-inspect-unity-bundles.py.",
    )
    parser.add_argument(
        "--deployable-output",
        default=str(DEPLOYABLE_RUNTIME_OUTPUT),
        help=(
            "Additional deployable runtime JSON path consumed by the Next.js API. "
            "Pass an empty string with --skip-deployable-output to only write temp output."
        ),
    )
    parser.add_argument(
        "--skip-deployable-output",
        action="store_true",
        help="Only write the snapshot-local runtime JSON under temp/.",
    )
    return parser.parse_args()


def dataset_key(name: str) -> str:
    if name == "AIData":
        return "aiData"
    return name[:1].lower() + name[1:]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def ref_path_id(value: Any) -> int | None:
    if not isinstance(value, dict):
        return None
    path_id = value.get("m_PathID")
    return path_id if isinstance(path_id, int) else None


def object_path_id_from_filename(path: str) -> int | None:
    match = TYPE_TREE_FILE_RE.match(Path(path).name)
    if not match:
        return None
    return int(match.group(1))


def tile_bounds(tiles: list[Any]) -> dict[str, int] | None:
    positions = [
        item[0]
        for item in tiles
        if isinstance(item, list)
        and item
        and isinstance(item[0], dict)
        and isinstance(item[0].get("x"), int)
        and isinstance(item[0].get("y"), int)
    ]
    if not positions:
        return None

    xs = [position["x"] for position in positions]
    ys = [position["y"] for position in positions]
    return {
        "minX": min(xs),
        "minY": min(ys),
        "maxX": max(xs),
        "maxY": max(ys),
    }


def merge_bounds(bounds: list[dict[str, int]]) -> dict[str, int] | None:
    if not bounds:
        return None
    return {
        "minX": min(bound["minX"] for bound in bounds),
        "minY": min(bound["minY"] for bound in bounds),
        "maxX": max(bound["maxX"] for bound in bounds),
        "maxY": max(bound["maxY"] for bound in bounds),
    }


def extract_map_prefabs(snapshot_dir: Path, inventory: dict[str, Any]) -> list[dict[str, Any]]:
    map_bundle = next(
        (
            bundle
            for bundle in inventory["bundles"]
            if bundle["path"] == "nfo/map_54f658fb0992cb00d073e4a5744ea4db"
        ),
        None,
    )
    if not map_bundle:
        return []

    type_by_id: dict[int, str] = {}
    typetree_by_id: dict[int, Path] = {}
    for obj in map_bundle["objects"]:
        typetree_path = obj.get("typetreePath")
        if not typetree_path:
            continue
        path_id = object_path_id_from_filename(typetree_path)
        if path_id is None:
            continue
        type_by_id[path_id] = obj["type"]
        typetree_by_id[path_id] = snapshot_dir / "inventory" / typetree_path

    selected_types = {"GameObject", "Transform", "Tilemap"}
    data_by_id: dict[int, Any] = {
        path_id: load_json(path)
        for path_id, path in typetree_by_id.items()
        if type_by_id.get(path_id) in selected_types
    }

    gameobject_name_by_id = {
        path_id: data.get("m_Name", "")
        for path_id, data in data_by_id.items()
        if type_by_id.get(path_id) == "GameObject"
    }
    gameobject_components_by_id = {
        path_id: [
            ref_path_id(component.get("component"))
            for component in data.get("m_Component", [])
            if isinstance(component, dict)
        ]
        for path_id, data in data_by_id.items()
        if type_by_id.get(path_id) == "GameObject"
    }
    gameobject_by_transform_id: dict[int, int] = {}
    children_by_transform_id: dict[int, list[int]] = {}
    transform_by_gameobject_id: dict[int, int] = {}

    for path_id, data in data_by_id.items():
        if type_by_id.get(path_id) != "Transform":
            continue
        gameobject_id = ref_path_id(data.get("m_GameObject"))
        if gameobject_id is not None:
            gameobject_by_transform_id[path_id] = gameobject_id
            transform_by_gameobject_id[gameobject_id] = path_id
        children_by_transform_id[path_id] = [
            child_id
            for child_id in (ref_path_id(child) for child in data.get("m_Children", []))
            if child_id is not None
        ]

    def descendant_gameobjects(root_gameobject_id: int) -> set[int]:
        root_transform_id = transform_by_gameobject_id.get(root_gameobject_id)
        result = {root_gameobject_id}
        if root_transform_id is None:
            return result

        stack = list(children_by_transform_id.get(root_transform_id, []))
        while stack:
            transform_id = stack.pop()
            gameobject_id = gameobject_by_transform_id.get(transform_id)
            if gameobject_id is not None:
                result.add(gameobject_id)
            stack.extend(children_by_transform_id.get(transform_id, []))
        return result

    prefabs: list[dict[str, Any]] = []
    for gameobject_id, name in sorted(gameobject_name_by_id.items(), key=lambda item: item[1]):
        if not MAP_PREFAB_NAME_RE.match(name):
            continue

        layers = []
        for descendant_id in descendant_gameobjects(gameobject_id):
            component_ids = gameobject_components_by_id.get(descendant_id, [])
            for component_id in component_ids:
                if component_id is None or type_by_id.get(component_id) != "Tilemap":
                    continue

                tilemap = data_by_id.get(component_id)
                if not isinstance(tilemap, dict):
                    continue
                tiles = tilemap.get("m_Tiles", [])
                if not isinstance(tiles, list) or not tiles:
                    continue
                bounds = tile_bounds(tiles)
                if not bounds:
                    continue

                layers.append({
                    "name": gameobject_name_by_id.get(descendant_id, ""),
                    "gameObjectPathId": descendant_id,
                    "tilemapPathId": component_id,
                    "tileCount": len(tiles),
                    "bounds": bounds,
                    "origin": tilemap.get("m_Origin"),
                    "size": tilemap.get("m_Size"),
                })

        layer_bounds = [layer["bounds"] for layer in layers]
        prefabs.append({
            "name": name,
            "gameObjectPathId": gameobject_id,
            "layerCount": len(layers),
            "tileCount": sum(layer["tileCount"] for layer in layers),
            "bounds": merge_bounds(layer_bounds),
            "layers": sorted(layers, key=lambda layer: (layer["name"], layer["tilemapPathId"])),
        })

    return prefabs


def main() -> None:
    args = parse_args()
    snapshot_dir = Path(args.snapshot).resolve()
    manifest_path = snapshot_dir / "snapshot-manifest.json"
    inventory_path = snapshot_dir / "inventory" / "objects.json"
    output_dir = snapshot_dir / "runtime-data"
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = load_json(manifest_path)
    inventory = load_json(inventory_path)

    datasets: dict[str, Any] = {}
    sources: dict[str, dict[str, str]] = {}

    for bundle in inventory["bundles"]:
        for obj in bundle["objects"]:
            name = obj.get("name")
            typetree_path = obj.get("typetreePath")
            if name not in TARGET_DATASET_NAMES or not typetree_path:
                continue

            tree_path = snapshot_dir / "inventory" / typetree_path
            tree = load_json(tree_path)
            key = dataset_key(name)
            datasets[key] = tree.get("Datas", tree)
            sources[key] = {
                "bundlePath": bundle["path"],
                "objectName": name,
                "typetreePath": typetree_path,
            }

    counts = {
        key: len(value) if isinstance(value, list) else 1
        for key, value in sorted(datasets.items())
    }
    map_prefabs = extract_map_prefabs(snapshot_dir, inventory)
    output = {
        "schemaVersion": 1,
        "purpose": "offline-playable-cn-nfo-runtime-data",
        "region": manifest["region"],
        "resourceVersion": manifest["resourceVersion"],
        "sourceManifest": "snapshot-manifest.json",
        "sourceInventory": "inventory/objects.json",
        "datasetCounts": counts,
        "datasetSources": sources,
        "mapPrefabs": map_prefabs,
        "datasets": datasets,
    }

    output_paths = [output_dir / "master-data.json"]
    if not args.skip_deployable_output and args.deployable_output:
        output_paths.append(Path(args.deployable_output))

    serialized_output = json.dumps(output, ensure_ascii=False, indent=2) + "\n"
    for output_path in output_paths:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(serialized_output, encoding="utf-8")
        print(f"Wrote {output_path}")

    print(f"Datasets: {counts}")
    print(f"Map prefabs: {len(map_prefabs)}")


if __name__ == "__main__":
    main()
