from __future__ import annotations

import re
import shutil
from pathlib import Path

from .config import BaxterConfig, CONFIG
from .models import JobResult


FOLDER_KEYS = {
    "base": "base_dir",
    "done": "done_dir",
    "error": "error_dir",
    "config": "config_dir",
}


def folder_status(config: BaxterConfig = CONFIG) -> dict[str, bool]:
    return {
        key: getattr(config, attr).is_dir()
        for key, attr in FOLDER_KEYS.items()
    }


def missing_folders(config: BaxterConfig = CONFIG) -> list[str]:
    status = folder_status(config)
    return [key for key, exists in status.items() if not exists]


def validate_folders(config: BaxterConfig = CONFIG) -> JobResult | None:
    missing = missing_folders(config)
    if not missing:
        return None
    labels = ", ".join(missing)
    return JobResult(
        status="missing_folder",
        message=f"Chybí pracovní složka Baxtera: {labels}.",
        details={"missing": missing, "base": str(config.base_dir)},
    )


def natural_key(path: Path) -> list[object]:
    parts = re.split(r"(\d+)", path.stem.casefold())
    key: list[object] = []
    for part in parts:
        key.append(int(part) if part.isdigit() else part)
    key.append(path.suffix.casefold())
    return key


def list_files_by_suffix(folder: Path, suffixes: set[str]) -> list[Path]:
    normalized = {suffix.casefold() for suffix in suffixes}
    files = [
        path for path in folder.iterdir()
        if path.is_file() and path.suffix.casefold() in normalized
    ]
    return sorted(files, key=natural_key)


def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    for index in range(2, 10000):
        candidate = path.with_name(f"{path.stem}_{index}{path.suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"Nelze najít volný název pro {path.name}.")


def move_to_done(path: Path, config: BaxterConfig = CONFIG) -> Path:
    target = unique_path(config.done_dir / path.name)
    shutil.move(str(path), str(target))
    return target


def move_many_to_done(paths: list[Path], config: BaxterConfig = CONFIG) -> list[Path]:
    moved: list[Path] = []
    for path in paths:
        if path.exists():
            moved.append(move_to_done(path, config))
    return moved
