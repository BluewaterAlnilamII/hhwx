from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

try:
    import UnityPy
except ImportError as exc:  # pragma: no cover - environment guard
    raise SystemExit("UnityPy is required. Install or use the Codex environment that has it.") from exc


MAX_STRING_LENGTH = 20_000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect locally frozen CN NFO UnityFS bundles and export object metadata.",
    )
    parser.add_argument(
        "--snapshot",
        default="temp/nfo-offline/cn/Android-2.1.1",
        help="Snapshot directory created by scripts/nfo-freeze-local.mjs.",
    )
    parser.add_argument(
        "--write-typetrees",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Write per-object typetree JSON where UnityPy can read one.",
    )
    return parser.parse_args()


def sanitize_filename(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    return safe[:80] or "unnamed"


def jsonable(value: Any) -> Any:
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, str):
        if len(value) > MAX_STRING_LENGTH:
            return value[:MAX_STRING_LENGTH] + "...<truncated>"
        return value
    if isinstance(value, bytes | bytearray):
        return {"byteLength": len(value)}
    if isinstance(value, list | tuple):
        return [jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if hasattr(value, "path_id"):
        return {"pathId": getattr(value, "path_id")}
    if hasattr(value, "__dict__"):
        return {
            key: jsonable(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    return repr(value)


def read_object_name(obj: Any, data: Any | None) -> str:
    if data is None:
        return ""
    return (
        getattr(data, "name", None)
        or getattr(data, "m_Name", None)
        or getattr(obj, "name", None)
        or ""
    )


def inspect_bundle(
    snapshot_dir: Path,
    inventory_dir: Path,
    entry: dict[str, Any],
    write_typetrees: bool,
) -> dict[str, Any]:
    raw_path = snapshot_dir / entry["rawPath"]
    bundle_inventory_dir = inventory_dir / "typetrees" / sanitize_filename(entry["path"])
    objects: list[dict[str, Any]] = []
    type_counts: Counter[str] = Counter()
    errors: list[str] = []

    try:
        env = UnityPy.load(str(raw_path))
    except Exception as exc:  # noqa: BLE001
        return {
            "path": entry["path"],
            "rawPath": entry["rawPath"],
            "objectCount": 0,
            "typeCounts": {},
            "objects": [],
            "errors": [f"load failed: {exc}"],
        }

    for obj in env.objects:
        type_name = getattr(obj.type, "name", str(obj.type))
        type_counts[type_name] += 1
        object_record: dict[str, Any] = {
            "pathId": obj.path_id,
            "type": type_name,
            "name": "",
            "typetreePath": None,
            "error": None,
        }

        data = None
        try:
            data = obj.read()
            object_record["name"] = read_object_name(obj, data)
        except Exception as exc:  # noqa: BLE001
            object_record["error"] = f"read failed: {exc}"

        if write_typetrees:
            try:
                tree = obj.read_typetree()
                if tree:
                    bundle_inventory_dir.mkdir(parents=True, exist_ok=True)
                    name_part = sanitize_filename(object_record["name"])
                    tree_file = (
                        bundle_inventory_dir
                        / f"{obj.path_id}-{sanitize_filename(type_name)}-{name_part}.json"
                    )
                    tree_file.write_text(
                        json.dumps(jsonable(tree), ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
                    object_record["typetreePath"] = str(
                        tree_file.relative_to(inventory_dir).as_posix(),
                    )
            except Exception as exc:  # noqa: BLE001
                if object_record["error"]:
                    object_record["error"] += f"; typetree failed: {exc}"
                else:
                    object_record["error"] = f"typetree failed: {exc}"

        objects.append(object_record)

    return {
        "path": entry["path"],
        "rawPath": entry["rawPath"],
        "objectCount": len(objects),
        "typeCounts": dict(sorted(type_counts.items())),
        "objects": objects,
        "errors": errors,
    }


def main() -> None:
    args = parse_args()
    snapshot_dir = Path(args.snapshot).resolve()
    manifest_path = snapshot_dir / "snapshot-manifest.json"
    inventory_dir = snapshot_dir / "inventory"
    inventory_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    bundles = [
        inspect_bundle(snapshot_dir, inventory_dir, entry, args.write_typetrees)
        for entry in manifest["entries"]
    ]
    total_counts: Counter[str] = Counter()
    for bundle in bundles:
        total_counts.update(bundle["typeCounts"])

    inventory = {
        "schemaVersion": 1,
        "sourceManifest": str(manifest_path.relative_to(snapshot_dir).as_posix()),
        "region": manifest["region"],
        "resourceVersion": manifest["resourceVersion"],
        "bundleCount": len(bundles),
        "typeCounts": dict(sorted(total_counts.items())),
        "bundles": bundles,
    }

    output_path = inventory_dir / "objects.json"
    output_path.write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {output_path}")
    print(f"Bundles: {len(bundles)}")
    print(f"Object types: {dict(sorted(total_counts.items()))}")


if __name__ == "__main__":
    main()
